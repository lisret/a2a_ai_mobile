from __future__ import annotations

import json
import os
import select
import subprocess
import sys
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol
from urllib import error, request

from .dashboard_state import DashboardStateStore

_LOOPBACK_HOSTS = frozenset(("127.0.0.1", "localhost"))
_MONITOR_INTERVAL_SECONDS = 0.5
_PROBE_TIMEOUT_SECONDS = 0.4
_STDERR_READ_SIZE = 512
_STDERR_TAIL_LIMIT = 900
_MESSAGE_LIMIT = 1_000
_CONTROL_JOIN_SECONDS = 0.05
_IO_JOIN_SECONDS = 0.2


class _Process(Protocol):
    stderr: object | None

    def poll(self) -> int | None: ...

    def terminate(self) -> None: ...

    def wait(self, timeout: float | None = None) -> int: ...

    def kill(self) -> None: ...


@dataclass(frozen=True, slots=True)
class VlmSidecarConfig:
    model_id: str
    host: str
    port: int
    cache_dir: Path
    auto_start: bool

    def __post_init__(self) -> None:
        if self.host not in _LOOPBACK_HOSTS:
            raise ValueError("host must be 127.0.0.1 or localhost")


class _BoundedTail:
    def __init__(self, limit: int) -> None:
        self._limit = limit
        self._lock = threading.Lock()
        self._value = ""

    def append(self, value: str) -> None:
        with self._lock:
            self._value = (self._value + value)[-self._limit :]

    def get(self) -> str:
        with self._lock:
            return self._value


@dataclass(slots=True)
class _OwnedChild:
    process: _Process
    generation: threading.Event
    stderr: object | None = None
    stderr_capture_attempted: bool = False
    tail: _BoundedTail = field(default_factory=lambda: _BoundedTail(_STDERR_TAIL_LIMIT))
    reader: threading.Thread | None = None
    reader_stop: threading.Event = field(default_factory=threading.Event)
    close_thread: threading.Thread | None = None
    close_error: str | None = None
    stderr_closed: bool = False
    retiring: bool = False
    cleanup_lock: threading.Lock = field(default_factory=threading.Lock)


@dataclass(frozen=True, slots=True)
class _CleanupResult:
    released: bool
    diagnostic: str | None = None


class VlmSidecarSupervisor:
    def __init__(
        self,
        *,
        config: VlmSidecarConfig,
        state_store: DashboardStateStore,
        health_probe: Callable[[str], bool] | None = None,
        process_factory: Callable[..., _Process] = subprocess.Popen,
    ) -> None:
        self._config = config
        self._state_store = state_store
        self._health_probe = health_probe or self._probe_configured_model
        self._process_factory = process_factory
        self._lock = threading.Lock()
        self._monitor_thread: threading.Thread | None = None
        self._monitor_stop: threading.Event | None = None
        self._spawn_generation: threading.Event | None = None
        self._spawn_attempted_generation: threading.Event | None = None
        self._owned_child: _OwnedChild | None = None
        self._available = False
        self._closed = False

    @property
    def available(self) -> bool:
        with self._lock:
            return self._available

    @property
    def base_url(self) -> str:
        return f"http://{self._config.host}:{self._config.port}"

    def start_async(self) -> None:
        with self._lock:
            if self._closed or (
                self._monitor_thread is not None and self._monitor_thread.is_alive()
            ):
                return
            stop = threading.Event()
            monitor = threading.Thread(
                target=self._monitor,
                args=(stop,),
                name="vlm-sidecar-monitor",
                daemon=True,
            )
            self._monitor_stop = stop
            self._monitor_thread = monitor
            self._available = False
            self._state_store.set_semantic_supervisor_status(
                available=False,
                phase="loading",
                message="Checking local VLM",
            )
        try:
            monitor.start()
        except Exception as exc:
            with self._lock:
                if self._monitor_stop is stop:
                    self._monitor_stop = None
                    self._monitor_thread = None
                    stop.set()
            self._publish_current_degraded(
                _bounded(f"Could not start VLM monitor: {_exception_text(exc)}")
            )

    def restart(self) -> None:
        self._stop_current(close_requested=False)
        with self._lock:
            self._closed = False
        self.start_async()

    def close(self) -> None:
        with self._lock:
            self._closed = True
        self._stop_current(close_requested=True)

    def _monitor(self, stop: threading.Event) -> None:
        self._monitor_once(stop)
        while not stop.wait(_MONITOR_INTERVAL_SECONDS):
            self._monitor_once(stop)

    def _monitor_once(self, stop: threading.Event) -> None:
        if not self._is_active(stop):
            return

        child = self._owned_snapshot()
        if child is not None:
            if child.retiring or child.generation is not stop:
                result = self._retire_child(child)
                self._handle_cleanup(child, result)
                if result.diagnostic:
                    self._publish_if_active(
                        stop, False, "degraded", result.diagnostic
                    )
                return
            returncode, poll_error = self._poll(child.process)
            if poll_error is not None:
                child.retiring = True
                self._publish_if_active(stop, False, "degraded", poll_error)
                return
            if returncode is not None:
                result = self._finish_exited_child(child)
                tail = child.tail.get().strip()
                message = f"MLX-VLM exited with exit code {returncode}"
                if tail:
                    message = f"{message}: {tail}"
                if result.diagnostic:
                    message = f"{message}; {result.diagnostic}"
                self._handle_cleanup(child, result)
                self._publish_if_active(stop, False, "degraded", _bounded(message))
                return

        if self._probe():
            self._publish_if_active(stop, True, "ready", f"{self._config.model_id} ready")
            return

        if child is not None:
            self._publish_if_active(stop, False, "loading", "Loading local VLM")
            return

        if not self._config.auto_start:
            self._publish_if_active(
                stop,
                False,
                "degraded",
                "Waiting for a compatible existing local VLM service",
            )
            return

        child = self._start_owned_process(stop)
        if child is not None or self._spawn_pending():
            self._publish_if_active(stop, False, "loading", "Loading local VLM")

    def _start_owned_process(self, stop: threading.Event) -> _OwnedChild | None:
        with self._lock:
            if (
                stop.is_set()
                or self._monitor_stop is not stop
                or self._owned_child is not None
                or self._spawn_generation is not None
                or self._spawn_attempted_generation is stop
            ):
                return None
            self._spawn_generation = stop
            self._spawn_attempted_generation = stop

        try:
            process = self._process_factory(
                self._command(),
                env={
                    **os.environ,
                    "HF_HOME": str(self._config.cache_dir),
                    "HF_HUB_DISABLE_XET": "1",
                },
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=False,
                bufsize=0,
            )
        except Exception as exc:
            with self._lock:
                if self._spawn_generation is stop:
                    self._spawn_generation = None
            self._publish_if_active(
                stop,
                False,
                "degraded",
                _bounded(f"Could not start MLX-VLM: {_exception_text(exc)}"),
            )
            return None

        child = _OwnedChild(process, stop)
        with self._lock:
            if self._spawn_generation is stop and self._owned_child is None:
                self._spawn_generation = None
                self._owned_child = child
                child.retiring = stop.is_set() or self._monitor_stop is not stop

        if self._owned_snapshot() is not child:
            child.retiring = True
            result = self._retire_child(child)
            if result.diagnostic:
                self._publish_current_degraded(result.diagnostic)
            return None

        setup_error: str | None = None
        try:
            with child.cleanup_lock:
                self._capture_stderr(child)
                if not child.retiring:
                    self._start_reader(child)
        except Exception as exc:
            setup_error = _bounded(
                f"stderr reader setup failed: {_exception_text(exc)}"
            )

        with self._lock:
            still_active = (
                self._owned_child is child
                and not stop.is_set()
                and self._monitor_stop is stop
                and not child.retiring
            )
            if not still_active or setup_error is not None:
                child.retiring = True

        if still_active and setup_error is None:
            return child

        result = self._retire_child(child)
        self._handle_cleanup(child, result)
        diagnostic = _join_diagnostics(setup_error, result.diagnostic)
        if diagnostic:
            if self._is_active(stop):
                self._publish_if_active(stop, False, "degraded", diagnostic)
            else:
                self._publish_current_degraded(diagnostic)
        return None

    def _command(self) -> list[str]:
        return [
            sys.executable,
            "-m",
            "mlx_vlm.server",
            "--model",
            self._config.model_id,
            "--host",
            "127.0.0.1",
            "--port",
            str(self._config.port),
        ]

    @staticmethod
    def _capture_stderr(child: _OwnedChild) -> None:
        try:
            child.stderr = child.process.stderr
        finally:
            child.stderr_capture_attempted = True

    @staticmethod
    def _start_reader(child: _OwnedChild) -> None:
        stderr = child.stderr
        if stderr is None:
            return

        try:
            file_descriptor = stderr.fileno()  # type: ignore[attr-defined]
            os.set_blocking(file_descriptor, False)
        except (AttributeError, OSError, ValueError):
            file_descriptor = None

        def drain() -> None:
            if file_descriptor is not None:
                _drain_file_descriptor(
                    file_descriptor, child.reader_stop, child.tail
                )
            else:
                _drain_stream_adapter(stderr, child.reader_stop, child.tail)

        reader = threading.Thread(
            target=drain,
            name="vlm-sidecar-stderr",
            daemon=True,
        )
        reader.start()
        child.reader = reader

    def _stop_current(self, *, close_requested: bool) -> None:
        with self._lock:
            stop = self._monitor_stop
            monitor = self._monitor_thread
            child = self._owned_child
            self._monitor_stop = None
            self._monitor_thread = None
            self._available = False
            if stop is not None:
                stop.set()
            if child is not None:
                child.retiring = True

        result = self._retire_child(child) if child is not None else _CleanupResult(True)
        self._handle_cleanup(child, result)
        if (
            monitor is not None
            and monitor is not threading.current_thread()
            and monitor.ident is not None
        ):
            monitor.join(timeout=_CONTROL_JOIN_SECONDS)

        if result.diagnostic:
            self._publish_current_degraded(result.diagnostic)
        elif close_requested:
            self._publish(False, "stopped", None)

    def _retire_child(self, child: _OwnedChild) -> _CleanupResult:
        with child.cleanup_lock:
            errors: list[str] = []
            returncode, poll_error = self._poll(child.process)
            if poll_error is not None:
                errors.append(poll_error)
                return _CleanupResult(False, _bounded("; ".join(errors)))

            reaped = returncode is not None
            if not reaped:
                try:
                    child.process.terminate()
                except Exception as exc:
                    errors.append(f"terminate failed: {_exception_text(exc)}")
                else:
                    try:
                        child.process.wait(timeout=1)
                    except (subprocess.TimeoutExpired, TimeoutError):
                        pass
                    except Exception as exc:
                        errors.append(f"wait after terminate failed: {_exception_text(exc)}")
                    else:
                        reaped = True

            if not reaped:
                try:
                    child.process.kill()
                except Exception as exc:
                    errors.append(f"kill failed: {_exception_text(exc)}")
                else:
                    try:
                        child.process.wait(timeout=1)
                    except (subprocess.TimeoutExpired, TimeoutError):
                        errors.append("wait after kill timed out")
                    except Exception as exc:
                        errors.append(f"wait after kill failed: {_exception_text(exc)}")
                    else:
                        reaped = True

            reader_released = False
            if reaped:
                reader_released, reader_error = self._close_reader(child)
                if reader_error:
                    errors.append(reader_error)

            return _CleanupResult(
                reaped and reader_released,
                _bounded("; ".join(errors)) if errors else None,
            )

    def _finish_exited_child(self, child: _OwnedChild) -> _CleanupResult:
        with child.cleanup_lock:
            released, diagnostic = self._close_reader(child, drain_first=True)
            return _CleanupResult(released, diagnostic)

    @staticmethod
    def _close_reader(
        child: _OwnedChild, *, drain_first: bool = False
    ) -> tuple[bool, str | None]:
        errors: list[str] = []
        diagnostics: list[str] = []
        if not child.stderr_capture_attempted:
            try:
                VlmSidecarSupervisor._capture_stderr(child)
            except Exception as exc:
                diagnostics.append(
                    f"stderr capture failed: {_exception_text(exc)}"
                )
        if drain_first and child.reader is not None:
            child.reader.join(timeout=0.1)
        child.reader_stop.set()
        if child.reader is not None:
            child.reader.join(timeout=_IO_JOIN_SECONDS)

        if (
            child.stderr is not None
            and not child.stderr_closed
            and child.close_thread is None
        ):
            child.close_error = None

            def close_stderr() -> None:
                try:
                    child.stderr.close()  # type: ignore[attr-defined]
                except Exception as exc:
                    child.close_error = (
                        f"stderr close failed: {_exception_text(exc)}"
                    )
                else:
                    child.stderr_closed = True

            close_thread = threading.Thread(
                target=close_stderr,
                name="vlm-sidecar-stderr-close",
                daemon=True,
            )
            try:
                close_thread.start()
            except Exception as exc:
                errors.append(
                    f"stderr close start failed: {_exception_text(exc)}"
                )
            else:
                child.close_thread = close_thread

        if child.close_thread is not None:
            child.close_thread.join(timeout=_IO_JOIN_SECONDS)
            if child.close_thread.is_alive():
                errors.append("stderr close did not stop")
            else:
                child.close_thread = None
                if child.close_error:
                    errors.append(child.close_error)
                    child.close_error = None

        if child.reader is not None:
            child.reader.join(timeout=_IO_JOIN_SECONDS)
            if child.reader.is_alive():
                errors.append("stderr reader did not stop")
        diagnostic = _join_diagnostics(
            "; ".join(diagnostics) if diagnostics else None,
            "; ".join(errors) if errors else None,
        )
        return not errors, diagnostic

    def _handle_cleanup(
        self, child: _OwnedChild | None, result: _CleanupResult
    ) -> None:
        if child is None or not result.released:
            return
        with self._lock:
            if self._owned_child is child:
                self._owned_child = None

    @staticmethod
    def _poll(process: _Process) -> tuple[int | None, str | None]:
        try:
            return process.poll(), None
        except Exception as exc:
            return None, _bounded(f"poll failed: {_exception_text(exc)}")

    def _owned_snapshot(self) -> _OwnedChild | None:
        with self._lock:
            return self._owned_child

    def _spawn_pending(self) -> bool:
        with self._lock:
            return self._spawn_generation is not None

    def _is_active(self, stop: threading.Event) -> bool:
        with self._lock:
            return not stop.is_set() and self._monitor_stop is stop

    def _probe(self) -> bool:
        try:
            return self._health_probe(f"{self.base_url}/v1/models")
        except Exception:
            return False

    def _probe_configured_model(self, models_url: str) -> bool:
        try:
            with request.urlopen(models_url, timeout=_PROBE_TIMEOUT_SECONDS) as response:
                if response.status != 200:
                    return False
                payload = json.loads(response.read())
        except (
            error.HTTPError,
            error.URLError,
            TimeoutError,
            OSError,
            UnicodeDecodeError,
            json.JSONDecodeError,
        ):
            return False

        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            return False
        return any(
            isinstance(model, dict) and model.get("id") == self._config.model_id
            for model in payload["data"]
        )

    def _publish_if_active(
        self,
        stop: threading.Event,
        available: bool,
        phase: str,
        message: str | None,
    ) -> None:
        with self._lock:
            if stop.is_set() or self._monitor_stop is not stop:
                return
            self._available = available
        self._state_store.set_semantic_supervisor_status(
            available=available,
            phase=phase,
            message=message,
        )

    def _publish_current_degraded(self, message: str) -> None:
        self._publish(False, "degraded", _bounded(message))

    def _publish(self, available: bool, phase: str, message: str | None) -> None:
        with self._lock:
            self._available = available
        self._state_store.set_semantic_supervisor_status(
            available=available,
            phase=phase,
            message=message,
        )


def _exception_text(exc: Exception) -> str:
    return str(exc) or type(exc).__name__


def _bounded(message: str) -> str:
    return message[:_MESSAGE_LIMIT]


def _join_diagnostics(*messages: str | None) -> str | None:
    combined = "; ".join(message for message in messages if message)
    return _bounded(combined) if combined else None


def _drain_file_descriptor(
    file_descriptor: int,
    stop: threading.Event,
    tail: _BoundedTail,
) -> None:
    while not stop.is_set():
        try:
            readable, _, _ = select.select(
                [file_descriptor], [], [], _CONTROL_JOIN_SECONDS
            )
            if not readable:
                continue
            chunk = os.read(file_descriptor, _STDERR_READ_SIZE)
        except (OSError, ValueError):
            return
        if not chunk:
            return
        tail.append(chunk.decode("utf-8", errors="replace"))


def _drain_stream_adapter(
    stream: object,
    stop: threading.Event,
    tail: _BoundedTail,
) -> None:
    while not stop.is_set():
        try:
            chunk = stream.read(_STDERR_READ_SIZE)  # type: ignore[attr-defined]
        except (OSError, ValueError):
            return
        if not chunk:
            return
        if isinstance(chunk, bytes):
            tail.append(chunk.decode("utf-8", errors="replace"))
        else:
            tail.append(str(chunk))
