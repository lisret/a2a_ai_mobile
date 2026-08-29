from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, TextIO
from urllib import error, request

from .dashboard_state import DashboardStateStore

_LOOPBACK_HOSTS = frozenset(("127.0.0.1", "localhost"))
_MONITOR_INTERVAL_SECONDS = 0.5
_PROBE_TIMEOUT_SECONDS = 0.4
_STDERR_TAIL_LIMIT = 900
_MESSAGE_LIMIT = 1_000


class _Process(Protocol):
    stderr: TextIO | None

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
        self._owned_process: _Process | None = None
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
        if not self._config.auto_start:
            self._publish(False, "disabled", "Local VLM auto-start is disabled")
            return

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
            self._state_store.set_semantic_available(False)
            self._state_store.set_semantic_lifecycle(
                "starting", message="Checking local VLM"
            )
            monitor.start()

    def restart(self) -> None:
        self._stop_current(mark_disabled=False)
        with self._lock:
            self._closed = False
        self.start_async()

    def close(self) -> None:
        with self._lock:
            self._closed = True
        self._stop_current(mark_disabled=True)

    def _monitor(self, stop: threading.Event) -> None:
        if self._probe():
            self._publish_if_active(stop, True, "ready", f"{self._config.model_id} ready")
            process = None
        else:
            process = self._start_owned_process(stop)
            if process is None:
                return

        stderr_tail = _BoundedTail(_STDERR_TAIL_LIMIT)
        stderr_thread = self._start_stderr_drain(process, stderr_tail)

        while not stop.wait(_MONITOR_INTERVAL_SECONDS):
            if process is not None:
                returncode = process.poll()
                if returncode is not None:
                    if stderr_thread is not None:
                        stderr_thread.join(timeout=0.1)
                    tail = stderr_tail.get().strip()
                    message = f"MLX-VLM exited with exit code {returncode}"
                    if tail:
                        message = f"{message}: {tail}"
                    self._release_owned(process)
                    self._publish_if_active(
                        stop, False, "degraded", message[:_MESSAGE_LIMIT]
                    )
                    return

            if self._probe():
                self._publish_if_active(
                    stop, True, "ready", f"{self._config.model_id} ready"
                )
            elif process is None:
                self._publish_if_active(
                    stop, False, "degraded", "Compatible local VLM is unavailable"
                )
                process = self._start_owned_process(stop)
                if process is None:
                    return
                stderr_thread = self._start_stderr_drain(process, stderr_tail)
            else:
                self._publish_if_active(stop, False, "starting", "Loading local VLM")

    def _start_owned_process(self, stop: threading.Event) -> _Process | None:
        command = [
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
        environment = {**os.environ, "HF_HOME": str(self._config.cache_dir)}
        try:
            with self._lock:
                if stop.is_set() or self._monitor_stop is not stop:
                    return None
                process = self._process_factory(
                    command,
                    env=environment,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=1,
                )
                self._owned_process = process
                return process
        except OSError as exc:
            self._publish_if_active(
                stop,
                False,
                "degraded",
                f"Could not start MLX-VLM: {exc}"[:_MESSAGE_LIMIT],
            )
            return None

    @staticmethod
    def _start_stderr_drain(
        process: _Process | None, tail: _BoundedTail
    ) -> threading.Thread | None:
        if process is None or process.stderr is None:
            return None

        def drain() -> None:
            for line in iter(process.stderr.readline, ""):
                tail.append(line)

        thread = threading.Thread(target=drain, name="vlm-sidecar-stderr", daemon=True)
        thread.start()
        return thread

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

    def _stop_current(self, *, mark_disabled: bool) -> None:
        with self._lock:
            stop = self._monitor_stop
            monitor = self._monitor_thread
            process = self._owned_process
            self._monitor_stop = None
            self._monitor_thread = None
            self._owned_process = None
            self._available = False
            if stop is not None:
                stop.set()

        if process is not None:
            self._terminate_owned(process)
        if monitor is not None and monitor is not threading.current_thread():
            monitor.join(timeout=1)
        if mark_disabled:
            self._state_store.set_semantic_available(False)
            self._state_store.set_semantic_lifecycle("disabled", message=None)

    @staticmethod
    def _terminate_owned(process: _Process) -> None:
        if process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=1)
        except (subprocess.TimeoutExpired, TimeoutError):
            process.kill()
            process.wait(timeout=1)

    def _release_owned(self, process: _Process) -> None:
        with self._lock:
            if self._owned_process is process:
                self._owned_process = None

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
        self._state_store.set_semantic_available(available)
        self._state_store.set_semantic_lifecycle(phase, message=message)

    def _publish(self, available: bool, phase: str, message: str | None) -> None:
        with self._lock:
            self._available = available
        self._state_store.set_semantic_available(available)
        self._state_store.set_semantic_lifecycle(phase, message=message)
