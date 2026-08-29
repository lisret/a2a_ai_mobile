from __future__ import annotations

import json

import numpy as np
import pytest

import nono_realtime_camera.cli as cli_module
from nono_realtime_camera.cli import _run_dashboard, build_parser, event_to_json, preflight_camera
from nono_realtime_camera.contracts import RealtimeAnalysisStatusV1
from nono_realtime_camera.frames import FramePacket


class FakeCamera:
    def __init__(self) -> None:
        self.frame_id = 0
        self.closed = False

    def open(self) -> None:
        pass

    def read(self) -> FramePacket:
        self.frame_id += 1
        return FramePacket(
            frame_id=self.frame_id,
            captured_at_ms=(self.frame_id - 1) * 100,
            image=np.zeros((720, 1280, 3), dtype=np.uint8),
        )

    def close(self) -> None:
        self.closed = True


def test_event_to_json_uses_contract_field_names() -> None:
    line = event_to_json(RealtimeAnalysisStatusV1("running", 123))

    assert json.loads(line) == {
        "schemaVersion": 1,
        "phase": "running",
        "occurredAtMs": 123,
        "code": None,
    }


def test_preflight_reads_requested_frames_and_closes_camera() -> None:
    camera = FakeCamera()

    report = preflight_camera(camera, frame_count=11)

    assert report == {
        "frames": 11,
        "width": 1280,
        "height": 720,
        "measuredFps": 10.0,
    }
    assert camera.closed is True


def test_run_parser_accepts_object_detector_model() -> None:
    args = build_parser().parse_args(
        ["run", "--duration", "5", "--model", ".runtime/models/detector.tflite"]
    )

    assert args.model == ".runtime/models/detector.tflite"


def test_dashboard_defaults_are_loopback_and_single_process() -> None:
    args = build_parser().parse_args(["dashboard"])

    assert args.host == "127.0.0.1"
    assert args.port == 8765
    assert args.open_browser is False
    assert args.model == ".runtime/models/efficientdet_lite0.tflite"


def test_dashboard_vlm_flags_have_local_safe_defaults() -> None:
    args = build_parser().parse_args(["dashboard", "--vlm"])

    assert args.vlm is True
    assert args.vlm_model == "mlx-community/Qwen3-VL-2B-Instruct-4bit"
    assert args.vlm_host == "127.0.0.1"
    assert args.vlm_port == 8766
    assert args.vlm_timeout_seconds == 15
    assert args.vlm_max_tokens == 48


@pytest.mark.parametrize(
    ("option", "value"),
    [
        ("--vlm-timeout-seconds", "0"),
        ("--vlm-timeout-seconds", "16"),
        ("--vlm-max-tokens", "0"),
    ],
)
def test_dashboard_rejects_invalid_vlm_limits(option: str, value: str) -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args(["dashboard", "--vlm", option, value])


def test_run_dashboard_assembles_vlm_stack_without_waiting_for_readiness(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from nono_realtime_camera import (
        dashboard_runtime,
        dashboard_web,
        semantic_worker,
        vlm_client,
        vlm_sidecar,
    )

    model_path = tmp_path / "detector.tflite"
    model_path.write_bytes(b"detector")
    calls: list[str] = []

    class FakeDetector:
        def __init__(self, path) -> None:
            self.path = path

    class FakeSidecar:
        def __init__(self, *, config, state_store) -> None:
            self.config = config
            self.state_store = state_store
            self.available = False

        @property
        def base_url(self) -> str:
            return "http://127.0.0.1:8766"

        def start_async(self) -> None:
            calls.append("sidecar.start_async")

    class FakeClient:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs

    class FakeWorker:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs

        def start(self) -> None:
            calls.append("worker.start")

    class FakeRuntime:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs

        def start(self) -> None:
            calls.append("runtime.start")

        def close(self) -> None:
            calls.append("runtime.close")

    class FakeApp:
        def run(self, **kwargs) -> None:
            self.kwargs = kwargs
            calls.append("app.run")

    runtime: FakeRuntime | None = None

    def build_runtime(**kwargs) -> FakeRuntime:
        nonlocal runtime
        runtime = FakeRuntime(**kwargs)
        return runtime

    monkeypatch.setattr(cli_module, "MediaPipeObjectDetector", FakeDetector)
    monkeypatch.setattr(vlm_sidecar, "VlmSidecarSupervisor", FakeSidecar)
    monkeypatch.setattr(vlm_client, "OpenAICompatibleVlmClient", FakeClient)
    monkeypatch.setattr(semantic_worker, "SemanticWorker", FakeWorker)
    monkeypatch.setattr(dashboard_runtime, "DashboardRuntime", build_runtime)
    monkeypatch.setattr(dashboard_web, "create_dashboard_app", lambda _runtime: FakeApp())

    args = build_parser().parse_args(
        [
            "dashboard",
            "--model",
            str(model_path),
            "--vlm",
            "--vlm-no-auto-start",
        ]
    )

    assert _run_dashboard(args) == 0
    assert runtime is not None
    sidecar = runtime.kwargs["vlm_supervisor"]
    worker = runtime.kwargs["semantic_worker"]
    config = runtime.kwargs["config_store"].snapshot()
    assert sidecar.config.auto_start is False
    assert sidecar.config.cache_dir.name == "huggingface"
    assert worker.kwargs["client"].kwargs == {
        "base_url": "http://127.0.0.1:8766",
        "model_id": "mlx-community/Qwen3-VL-2B-Instruct-4bit",
        "timeout_seconds": 15,
        "max_tokens": 48,
    }
    assert worker.kwargs["available"]() is False
    assert config.semantic_enabled is True
    assert config.semantic_cooldown_seconds == 5
    assert calls == [
        "worker.start",
        "sidecar.start_async",
        "runtime.start",
        "app.run",
        "runtime.close",
    ]


def test_run_dashboard_without_vlm_keeps_semantic_state_disabled(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from nono_realtime_camera import dashboard_runtime, dashboard_web

    model_path = tmp_path / "detector.tflite"
    model_path.write_bytes(b"detector")

    class FakeRuntime:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs

        def start(self) -> None:
            pass

        def close(self) -> None:
            pass

    recorded_runtime: FakeRuntime | None = None

    def build_runtime(**kwargs) -> FakeRuntime:
        nonlocal recorded_runtime
        recorded_runtime = FakeRuntime(**kwargs)
        return recorded_runtime

    class FakeApp:
        def run(self, **kwargs) -> None:
            pass

    monkeypatch.setattr(cli_module, "MediaPipeObjectDetector", lambda _path: object())
    monkeypatch.setattr(dashboard_runtime, "DashboardRuntime", build_runtime)
    monkeypatch.setattr(dashboard_web, "create_dashboard_app", lambda _runtime: FakeApp())

    args = build_parser().parse_args(["dashboard", "--model", str(model_path)])

    assert _run_dashboard(args) == 0
    assert recorded_runtime is not None
    assert recorded_runtime.kwargs["semantic_worker"] is None
    assert recorded_runtime.kwargs["vlm_supervisor"] is None
    assert recorded_runtime.kwargs["config_store"].snapshot().semantic_enabled is False
    assert recorded_runtime.kwargs["state_store"].snapshot(
        recorded_runtime.kwargs["config_store"].snapshot()
    )["semanticLifecycle"] == {"phase": "disabled", "message": None}


@pytest.mark.parametrize("port", ["0", "65536"])
def test_dashboard_rejects_invalid_port(port: str) -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args(["dashboard", "--port", port])
