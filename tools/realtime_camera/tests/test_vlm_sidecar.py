from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import threading
import time
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any

import pytest

from nono_realtime_camera.dashboard_config import DashboardConfigStore
from nono_realtime_camera.dashboard_state import DashboardStateStore
from nono_realtime_camera.vlm_sidecar import VlmSidecarConfig, VlmSidecarSupervisor

MODEL_ID = "mlx-community/Qwen3-VL-2B-Instruct-4bit"


class FakeProcess:
    def __init__(
        self,
        *,
        returncode: int | None = None,
        stderr_lines: Iterable[str] = (),
    ) -> None:
        self.returncode = returncode
        self.stderr = io.StringIO("\n".join(stderr_lines))
        self.terminate_calls = 0
        self.kill_calls = 0

    def poll(self) -> int | None:
        return self.returncode

    def terminate(self) -> None:
        self.terminate_calls += 1
        self.returncode = 0

    def wait(self, timeout: float | None = None) -> int:
        del timeout
        if self.returncode is None:
            raise TimeoutError
        return self.returncode

    def kill(self) -> None:
        self.kill_calls += 1
        self.returncode = -9


class FailureProcess(FakeProcess):
    def __init__(
        self,
        *,
        terminate_error: Exception | None = None,
        kill_error: Exception | None = None,
        wait_errors: Iterable[Exception] = (),
    ) -> None:
        super().__init__()
        self._terminate_error = terminate_error
        self._kill_error = kill_error
        self._wait_errors = iter(wait_errors)

    def terminate(self) -> None:
        self.terminate_calls += 1
        if self._terminate_error is not None:
            raise self._terminate_error

    def wait(self, timeout: float | None = None) -> int:
        del timeout
        error = next(self._wait_errors, None)
        if error is not None:
            raise error
        self.returncode = 0
        return 0

    def kill(self) -> None:
        self.kill_calls += 1
        if self._kill_error is not None:
            raise self._kill_error


class StderrAccessFailureProcess:
    def __init__(self) -> None:
        self.returncode: int | None = None
        self.terminate_calls = 0

    @property
    def stderr(self) -> io.StringIO:
        raise RuntimeError("stderr access failed")

    def poll(self) -> int | None:
        return self.returncode

    def terminate(self) -> None:
        self.terminate_calls += 1
        self.returncode = 0

    def wait(self, timeout: float | None = None) -> int:
        del timeout
        assert self.returncode is not None
        return self.returncode

    def kill(self) -> None:
        self.returncode = -9


class LongUnbrokenStream:
    def __init__(self, size: int) -> None:
        self._remaining = size
        self.closed = False
        self.eof_reached = False
        self.readline_called = False
        self.read_sizes: list[int] = []

    def readline(self, size: int = -1) -> str:
        self.readline_called = True
        amount = self._remaining if size < 0 else min(size, self._remaining)
        self._remaining -= amount
        return "x" * amount

    def read(self, size: int = -1) -> str:
        self.read_sizes.append(size)
        amount = self._remaining if size < 0 else min(size, self._remaining)
        self._remaining -= amount
        if amount == 0:
            self.eof_reached = True
        return "x" * amount

    def close(self) -> None:
        self.closed = True


class BlockingStream:
    def __init__(self) -> None:
        self.read_entered = threading.Event()
        self.reader_exited = threading.Event()
        self._closed = threading.Event()

    @property
    def closed(self) -> bool:
        return self._closed.is_set()

    def read(self, size: int = -1) -> str:
        assert 0 < size <= 1_024
        self.read_entered.set()
        assert self._closed.wait(timeout=2)
        self.reader_exited.set()
        return ""

    def close(self) -> None:
        self._closed.set()


class TrackingCloseStream(io.StringIO):
    def __init__(self) -> None:
        super().__init__()
        self.read_calls = 0

    def read(self, size: int = -1) -> str:
        self.read_calls += 1
        return super().read(size)


class FlakyCloseStream(TrackingCloseStream):
    def __init__(self) -> None:
        super().__init__()
        self.close_calls = 0

    def close(self) -> None:
        self.close_calls += 1
        if self.close_calls == 1:
            raise OSError("transient close failure")
        super().close()


class FakeProcessFactory:
    def __init__(self, processes: Iterable[FakeProcess] = ()) -> None:
        self.processes = list(processes)
        self.calls: list[tuple[list[str], dict[str, Any]]] = []

    def __call__(self, command: list[str], **kwargs: Any) -> FakeProcess:
        self.calls.append((command, kwargs))
        return self.processes.pop(0) if self.processes else FakeProcess()


class FakeModelsResponse:
    status = 200

    def __init__(self, model_ids: Iterable[str]) -> None:
        self._body = json.dumps(
            {"object": "list", "data": [{"id": model_id} for model_id in model_ids]}
        ).encode()

    def __enter__(self) -> FakeModelsResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        pass

    def read(self) -> bytes:
        return self._body


def make_config(**overrides: object) -> VlmSidecarConfig:
    values: dict[str, object] = {
        "model_id": MODEL_ID,
        "host": "127.0.0.1",
        "port": 8080,
        "cache_dir": Path("/tmp/nono-vlm-cache"),
        "auto_start": True,
    }
    values.update(overrides)
    return VlmSidecarConfig(**values)  # type: ignore[arg-type]


def wait_until(predicate: Callable[[], bool], *, timeout: float = 2) -> None:
    deadline = time.monotonic() + timeout
    while not predicate():
        if time.monotonic() >= deadline:
            raise AssertionError("condition was not met before timeout")
        time.sleep(0.01)


def semantic_lifecycle(state_store: DashboardStateStore) -> dict[str, object]:
    payload = state_store.snapshot(DashboardConfigStore().snapshot())
    return payload["semanticLifecycle"]  # type: ignore[return-value]


def sequence_probe(results: Iterable[bool], *, fallback: bool = False) -> Callable[[str], bool]:
    remaining = iter(results)
    lock = threading.Lock()

    def probe(_url: str) -> bool:
        with lock:
            return next(remaining, fallback)

    return probe


@pytest.mark.parametrize("host", ["0.0.0.0", "::1", "192.168.1.10", "LOCALHOST"])
def test_config_rejects_non_loopback_or_noncanonical_hosts(host: str) -> None:
    with pytest.raises(ValueError, match="127.0.0.1 or localhost"):
        make_config(host=host)


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost"])
def test_config_accepts_supported_loopback_hosts(host: str) -> None:
    assert make_config(host=host).host == host


def test_existing_compatible_service_is_reused_and_never_terminated() -> None:
    process_factory = FakeProcessFactory()
    probe_urls: list[str] = []
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=DashboardStateStore(),
        health_probe=lambda url: probe_urls.append(url) or True,
        process_factory=process_factory,
    )

    supervisor.start_async()
    wait_until(lambda: supervisor.available)
    supervisor.close()

    assert process_factory.calls == []
    assert probe_urls[0] == "http://127.0.0.1:8080/v1/models"
    assert supervisor.base_url == "http://127.0.0.1:8080"


def test_default_probe_reuses_only_when_models_endpoint_advertises_same_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requested_urls: list[str] = []

    def fake_urlopen(url: str, *, timeout: float) -> FakeModelsResponse:
        requested_urls.append(url)
        assert timeout < 0.5
        return FakeModelsResponse(["other-model", MODEL_ID])

    monkeypatch.setattr("nono_realtime_camera.vlm_sidecar.request.urlopen", fake_urlopen)
    process_factory = FakeProcessFactory()
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=DashboardStateStore(),
        process_factory=process_factory,
    )

    supervisor.start_async()
    wait_until(lambda: supervisor.available)
    supervisor.close()

    assert requested_urls[0] == "http://127.0.0.1:8080/v1/models"
    assert process_factory.calls == []


def test_default_probe_does_not_reuse_service_advertising_different_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "nono_realtime_camera.vlm_sidecar.request.urlopen",
        lambda _url, *, timeout: FakeModelsResponse(["other-model"]),
    )
    process = FakeProcess()
    process_factory = FakeProcessFactory([process])
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=DashboardStateStore(),
        process_factory=process_factory,
    )

    supervisor.start_async()
    wait_until(lambda: len(process_factory.calls) == 1)
    supervisor.close()

    assert process.terminate_calls == 1


def test_start_async_returns_without_waiting_for_probe_or_model_load() -> None:
    probe_entered = threading.Event()
    release_probe = threading.Event()

    def blocking_probe(_url: str) -> bool:
        probe_entered.set()
        assert release_probe.wait(timeout=2)
        return True

    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=DashboardStateStore(),
        health_probe=blocking_probe,
        process_factory=FakeProcessFactory(),
    )

    started = time.monotonic()
    supervisor.start_async()

    assert time.monotonic() - started < 0.1
    assert probe_entered.wait(timeout=1)
    release_probe.set()
    supervisor.close()


def test_monitor_waits_500ms_between_health_probes() -> None:
    probe_times: list[float] = []
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=DashboardStateStore(),
        health_probe=lambda _url: probe_times.append(time.monotonic()) or True,
        process_factory=FakeProcessFactory(),
    )

    supervisor.start_async()
    wait_until(lambda: len(probe_times) >= 2)
    supervisor.close()

    assert probe_times[1] - probe_times[0] >= 0.45


def test_auto_start_disabled_keeps_probing_and_reuses_later_service() -> None:
    process_factory = FakeProcessFactory()
    state_store = DashboardStateStore()
    supervisor = VlmSidecarSupervisor(
        config=make_config(auto_start=False),
        state_store=state_store,
        health_probe=sequence_probe([False, True], fallback=True),
        process_factory=process_factory,
    )

    supervisor.start_async()
    wait_until(lambda: semantic_lifecycle(state_store)["phase"] == "degraded")
    wait_until(lambda: supervisor.available)

    assert semantic_lifecycle(state_store)["phase"] == "ready"
    assert process_factory.calls == []
    supervisor.close()
    assert semantic_lifecycle(state_store)["phase"] == "stopped"


def test_sidecar_uses_only_approved_loading_and_stopped_phases() -> None:
    probe_entered = threading.Event()
    release_probe = threading.Event()
    state_store = DashboardStateStore()

    def blocking_probe(_url: str) -> bool:
        probe_entered.set()
        assert release_probe.wait(timeout=2)
        return True

    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=state_store,
        health_probe=blocking_probe,
        process_factory=FakeProcessFactory(),
    )

    supervisor.start_async()
    assert probe_entered.wait(timeout=1)
    assert semantic_lifecycle(state_store)["phase"] == "loading"
    release_probe.set()
    wait_until(lambda: supervisor.available)
    supervisor.close()

    assert semantic_lifecycle(state_store)["phase"] == "stopped"


def test_incompatible_service_starts_owned_child_with_exact_command_and_environment() -> None:
    process = FakeProcess()
    process_factory = FakeProcessFactory([process])
    supervisor = VlmSidecarSupervisor(
        config=make_config(host="localhost"),
        state_store=DashboardStateStore(),
        health_probe=sequence_probe([False, True], fallback=True),
        process_factory=process_factory,
    )

    supervisor.start_async()
    wait_until(lambda: supervisor.available)

    command, kwargs = process_factory.calls[0]
    assert command == [
        sys.executable,
        "-m",
        "mlx_vlm.server",
        "--model",
        MODEL_ID,
        "--host",
        "127.0.0.1",
        "--port",
        "8080",
    ]
    assert kwargs["env"]["HF_HOME"] == "/tmp/nono-vlm-cache"
    assert kwargs["stderr"] is not None
    supervisor.close()
    assert process.terminate_calls == 1


def test_owned_child_exit_sets_degraded_with_bounded_error_tail() -> None:
    process = FakeProcess(returncode=2, stderr_lines=["x" * 800] * 100)
    state_store = DashboardStateStore()
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=state_store,
        health_probe=sequence_probe([False, False]),
        process_factory=FakeProcessFactory([process]),
    )

    supervisor.start_async()
    wait_until(lambda: semantic_lifecycle(state_store)["phase"] == "degraded")

    message = semantic_lifecycle(state_store)["message"]
    assert isinstance(message, str)
    assert len(message) <= 1_000
    assert "exit code 2" in message
    supervisor.close()
    assert process.terminate_calls == 0


def test_stderr_reader_uses_bounded_chunks_and_is_closed_on_exit() -> None:
    stream = LongUnbrokenStream(100_000)
    process = FakeProcess(returncode=2)
    process.stderr = stream  # type: ignore[assignment]
    state_store = DashboardStateStore()
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=state_store,
        health_probe=lambda _url: False,
        process_factory=FakeProcessFactory([process]),
    )

    supervisor.start_async()
    wait_until(lambda: semantic_lifecycle(state_store)["phase"] == "degraded")
    supervisor.close()

    assert not stream.readline_called
    assert stream.read_sizes
    assert max(stream.read_sizes) <= 1_024
    assert stream.eof_reached
    assert stream.closed


def test_close_closes_owned_pipe_and_waits_for_reader_exit() -> None:
    stream = BlockingStream()
    process = FakeProcess()
    process.stderr = stream  # type: ignore[assignment]
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=DashboardStateStore(),
        health_probe=lambda _url: False,
        process_factory=FakeProcessFactory([process]),
    )

    supervisor.start_async()
    assert stream.read_entered.wait(timeout=1)
    supervisor.close()

    assert stream.closed
    assert stream.reader_exited.is_set()


def test_close_with_real_pipe_writer_open_is_time_bounded() -> None:
    read_fd, write_fd = os.pipe()
    stream = os.fdopen(read_fd, "rb", buffering=0)
    process = FakeProcess()
    process.stderr = stream  # type: ignore[assignment]
    process_factory = FakeProcessFactory([process])
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=DashboardStateStore(),
        health_probe=lambda _url: False,
        process_factory=process_factory,
    )

    try:
        supervisor.start_async()
        wait_until(lambda: len(process_factory.calls) == 1)
        wait_until(
            lambda: any(
                thread.name == "vlm-sidecar-stderr"
                for thread in threading.enumerate()
            )
        )
        started = time.monotonic()
        supervisor.close()
        elapsed = time.monotonic() - started

        assert elapsed < 0.75
        assert stream.closed
        assert not any(
            thread.name == "vlm-sidecar-stderr" and thread.is_alive()
            for thread in threading.enumerate()
        )
    finally:
        os.close(write_fd)


def test_stderr_access_failure_reaps_raw_process_and_clears_reservation() -> None:
    failed_process = StderrAccessFailureProcess()
    replacement = FakeProcess()
    process_factory = FakeProcessFactory([failed_process, replacement])
    state_store = DashboardStateStore()
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=state_store,
        health_probe=lambda _url: False,
        process_factory=process_factory,
    )

    supervisor.start_async()
    wait_until(lambda: semantic_lifecycle(state_store)["phase"] == "degraded")
    time.sleep(0.6)

    assert failed_process.terminate_calls == 1
    assert len(process_factory.calls) == 1
    supervisor.restart()
    wait_until(lambda: len(process_factory.calls) == 2)
    supervisor.close()


def test_reader_start_failure_reaps_raw_process_and_clears_reservation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    failed_process = FakeProcess()
    replacement = FakeProcess()
    process_factory = FakeProcessFactory([failed_process, replacement])
    state_store = DashboardStateStore()
    original_start = threading.Thread.start
    failed_once = False

    def fail_reader_start(thread: threading.Thread) -> None:
        nonlocal failed_once
        if thread.name == "vlm-sidecar-stderr" and not failed_once:
            failed_once = True
            raise RuntimeError("reader start failed")
        original_start(thread)

    monkeypatch.setattr(threading.Thread, "start", fail_reader_start)
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=state_store,
        health_probe=lambda _url: False,
        process_factory=process_factory,
    )

    supervisor.start_async()
    wait_until(lambda: semantic_lifecycle(state_store)["phase"] == "degraded")
    time.sleep(0.6)

    assert failed_process.terminate_calls == 1
    assert len(process_factory.calls) == 1
    supervisor.restart()
    wait_until(lambda: len(process_factory.calls) == 2)
    supervisor.close()


def test_close_does_not_block_on_factory_and_reaps_stale_child() -> None:
    factory_entered = threading.Event()
    release_factory = threading.Event()
    process = FakeProcess()
    stale_stderr = TrackingCloseStream()
    process.stderr = stale_stderr

    def blocking_factory(command: list[str], **kwargs: Any) -> FakeProcess:
        del command, kwargs
        factory_entered.set()
        assert release_factory.wait(timeout=2)
        return process

    state_store = DashboardStateStore()
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=state_store,
        health_probe=lambda _url: False,
        process_factory=blocking_factory,
    )

    supervisor.start_async()
    assert factory_entered.wait(timeout=1)
    started = time.monotonic()
    supervisor.close()
    elapsed = time.monotonic() - started
    release_factory.set()
    wait_until(lambda: process.terminate_calls == 1)

    assert elapsed < 0.25
    assert semantic_lifecycle(state_store)["phase"] == "stopped"
    assert stale_stderr.closed
    assert stale_stderr.read_calls == 0


def test_restart_during_factory_does_not_orphan_or_spawn_concurrently() -> None:
    factory_entered = threading.Event()
    release_factory = threading.Event()
    first_process = FakeProcess()
    first_stderr = TrackingCloseStream()
    first_process.stderr = first_stderr
    second_process = FakeProcess()
    calls = 0
    calls_lock = threading.Lock()

    def blocking_first_factory(command: list[str], **kwargs: Any) -> FakeProcess:
        nonlocal calls
        del command, kwargs
        with calls_lock:
            calls += 1
            call_number = calls
        if call_number == 1:
            factory_entered.set()
            assert release_factory.wait(timeout=2)
            return first_process
        return second_process

    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=DashboardStateStore(),
        health_probe=lambda _url: False,
        process_factory=blocking_first_factory,
    )

    supervisor.start_async()
    assert factory_entered.wait(timeout=1)
    started = time.monotonic()
    supervisor.restart()
    elapsed = time.monotonic() - started
    time.sleep(0.1)
    assert calls == 1
    release_factory.set()
    wait_until(lambda: first_process.terminate_calls == 1)
    wait_until(lambda: calls == 2)

    assert elapsed < 0.25
    assert first_stderr.closed
    assert first_stderr.read_calls == 0
    supervisor.close()
    assert second_process.terminate_calls == 1


def test_transient_stderr_close_failure_is_retried_and_releases_ownership() -> None:
    flaky_stderr = FlakyCloseStream()
    first_process = FakeProcess()
    first_process.stderr = flaky_stderr
    second_process = FakeProcess()
    process_factory = FakeProcessFactory([first_process, second_process])
    state_store = DashboardStateStore()
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=state_store,
        health_probe=lambda _url: False,
        process_factory=process_factory,
    )

    supervisor.start_async()
    wait_until(lambda: len(process_factory.calls) == 1)
    supervisor.close()

    supervisor.restart()
    wait_until(lambda: flaky_stderr.close_calls >= 2)
    wait_until(lambda: len(process_factory.calls) == 2)

    assert flaky_stderr.closed
    supervisor.close()
    assert second_process.terminate_calls == 1


def test_failed_cleanup_of_stale_spawn_is_retained_and_blocks_next_spawn() -> None:
    factory_entered = threading.Event()
    release_factory = threading.Event()
    stale_process = FailureProcess(
        terminate_error=OSError("stale terminate denied"),
        kill_error=OSError("stale kill denied"),
    )
    factory_calls = 0

    def blocking_factory(command: list[str], **kwargs: Any) -> FailureProcess:
        nonlocal factory_calls
        del command, kwargs
        factory_calls += 1
        factory_entered.set()
        assert release_factory.wait(timeout=2)
        return stale_process

    state_store = DashboardStateStore()
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=state_store,
        health_probe=lambda _url: False,
        process_factory=blocking_factory,
    )

    supervisor.start_async()
    assert factory_entered.wait(timeout=1)
    supervisor.close()
    release_factory.set()
    wait_until(lambda: semantic_lifecycle(state_store)["phase"] == "degraded")
    supervisor.restart()
    time.sleep(0.6)

    message = str(semantic_lifecycle(state_store)["message"])
    assert "stale terminate denied" in message
    assert len(message) <= 1_000
    assert factory_calls == 1


def test_terminate_and_kill_errors_are_degraded_and_keep_process_tracked() -> None:
    process = FailureProcess(
        terminate_error=OSError("terminate denied"),
        kill_error=OSError("kill denied"),
    )
    process_factory = FakeProcessFactory([process, FakeProcess()])
    state_store = DashboardStateStore()
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=state_store,
        health_probe=lambda _url: False,
        process_factory=process_factory,
    )

    supervisor.start_async()
    wait_until(lambda: len(process_factory.calls) == 1)
    supervisor.close()
    supervisor.restart()
    time.sleep(0.6)

    lifecycle = semantic_lifecycle(state_store)
    assert lifecycle["phase"] == "degraded"
    assert "terminate denied" in str(lifecycle["message"])
    assert len(str(lifecycle["message"])) <= 1_000
    assert process.terminate_calls >= 1
    assert process.kill_calls >= 1
    assert len(process_factory.calls) == 1


def test_second_wait_timeout_is_degraded_and_keeps_process_tracked() -> None:
    process = FailureProcess(
        wait_errors=[subprocess.TimeoutExpired("mlx-vlm", 1) for _ in range(20)]
    )
    process_factory = FakeProcessFactory([process, FakeProcess()])
    state_store = DashboardStateStore()
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=state_store,
        health_probe=lambda _url: False,
        process_factory=process_factory,
    )

    supervisor.start_async()
    wait_until(lambda: len(process_factory.calls) == 1)
    supervisor.close()
    supervisor.restart()
    time.sleep(0.6)

    lifecycle = semantic_lifecycle(state_store)
    assert lifecycle["phase"] == "degraded"
    assert "timed out" in str(lifecycle["message"])
    assert len(str(lifecycle["message"])) <= 1_000
    assert process.kill_calls >= 1
    assert len(process_factory.calls) == 1


def test_first_wait_timeout_then_successful_kill_is_cleanly_stopped() -> None:
    process = FailureProcess(
        wait_errors=[subprocess.TimeoutExpired("mlx-vlm", 1)]
    )
    process_factory = FakeProcessFactory([process])
    state_store = DashboardStateStore()
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=state_store,
        health_probe=lambda _url: False,
        process_factory=process_factory,
    )

    supervisor.start_async()
    wait_until(lambda: len(process_factory.calls) == 1)
    supervisor.close()

    assert process.kill_calls == 1
    assert semantic_lifecycle(state_store) == {"phase": "stopped", "message": None}


def test_factory_failure_attempts_only_once_per_generation() -> None:
    factory_calls = 0
    state_store = DashboardStateStore()

    def failing_factory(command: list[str], **kwargs: Any) -> FakeProcess:
        nonlocal factory_calls
        del command, kwargs
        factory_calls += 1
        raise ModuleNotFoundError("mlx_vlm is not installed")

    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=state_store,
        health_probe=lambda _url: False,
        process_factory=failing_factory,
    )

    supervisor.start_async()
    wait_until(lambda: semantic_lifecycle(state_store)["phase"] == "degraded")
    time.sleep(1.1)
    assert factory_calls == 1

    supervisor.restart()
    wait_until(lambda: factory_calls == 2)
    time.sleep(0.6)
    assert factory_calls == 2
    supervisor.close()


def test_fast_child_exit_attempts_only_once_per_generation() -> None:
    first_process = FakeProcess(returncode=2)
    second_process = FakeProcess(returncode=2)
    process_factory = FakeProcessFactory([first_process, second_process])
    state_store = DashboardStateStore()
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=state_store,
        health_probe=lambda _url: False,
        process_factory=process_factory,
    )

    supervisor.start_async()
    wait_until(lambda: semantic_lifecycle(state_store)["phase"] == "degraded")
    time.sleep(1.1)
    assert len(process_factory.calls) == 1

    supervisor.restart()
    wait_until(lambda: len(process_factory.calls) == 2)
    time.sleep(0.6)
    assert len(process_factory.calls) == 2
    supervisor.close()


def test_auto_start_disabled_never_spawns_across_multiple_cycles() -> None:
    process_factory = FakeProcessFactory()
    supervisor = VlmSidecarSupervisor(
        config=make_config(auto_start=False),
        state_store=DashboardStateStore(),
        health_probe=lambda _url: False,
        process_factory=process_factory,
    )

    supervisor.start_async()
    time.sleep(1.1)
    supervisor.restart()
    time.sleep(0.6)
    supervisor.close()

    assert process_factory.calls == []


def test_restart_terminates_only_owned_child_and_starts_a_new_monitor() -> None:
    first_process = FakeProcess()
    second_process = FakeProcess()
    process_factory = FakeProcessFactory([first_process, second_process])
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=DashboardStateStore(),
        health_probe=sequence_probe([False, False, False], fallback=True),
        process_factory=process_factory,
    )

    supervisor.start_async()
    wait_until(lambda: len(process_factory.calls) == 1)
    supervisor.restart()
    wait_until(lambda: len(process_factory.calls) == 2)

    assert first_process.terminate_calls == 1
    supervisor.close()
    assert second_process.terminate_calls == 1


def test_restart_and_close_never_terminate_reused_service() -> None:
    process_factory = FakeProcessFactory()
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=DashboardStateStore(),
        health_probe=lambda _url: True,
        process_factory=process_factory,
    )

    supervisor.start_async()
    wait_until(lambda: supervisor.available)
    supervisor.restart()
    wait_until(lambda: supervisor.available)
    supervisor.close()

    assert process_factory.calls == []
