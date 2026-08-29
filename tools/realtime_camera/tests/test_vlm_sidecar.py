from __future__ import annotations

import io
import json
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


def test_auto_start_disabled_degrades_without_probing_or_spawning() -> None:
    probe_calls: list[str] = []
    process_factory = FakeProcessFactory()
    state_store = DashboardStateStore()
    supervisor = VlmSidecarSupervisor(
        config=make_config(auto_start=False),
        state_store=state_store,
        health_probe=lambda url: probe_calls.append(url) or False,
        process_factory=process_factory,
    )

    supervisor.start_async()

    assert not supervisor.available
    assert semantic_lifecycle(state_store)["phase"] == "disabled"
    assert probe_calls == []
    assert process_factory.calls == []


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
