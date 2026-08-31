from __future__ import annotations

import argparse
import json
import threading
import webbrowser
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from .camera import CameraUnavailableError, OpenCVCameraSource
from .contracts import (
    RealtimeAnalysisStatusV1,
    RealtimeSecondSummaryV1,
    RealtimeSemanticEnrichmentV1,
)
from .mediapipe_detector import MediaPipeObjectDetector
from .motion import MotionAnalyzer
from .runtime import CameraSource, RealtimeCameraRuntime

SerializableEvent = (
    RealtimeAnalysisStatusV1 | RealtimeSecondSummaryV1 | RealtimeSemanticEnrichmentV1
)


def event_to_json(event: SerializableEvent) -> str:
    return json.dumps(event.to_dict(), ensure_ascii=False, separators=(",", ":"))


def preflight_camera(camera: CameraSource, *, frame_count: int = 60) -> dict[str, Any]:
    if frame_count < 2:
        raise ValueError("frame_count must be at least 2")
    camera.open()
    frames = []
    try:
        for _ in range(frame_count):
            frames.append(camera.read())
    finally:
        camera.close()

    elapsed_ms = frames[-1].captured_at_ms - frames[0].captured_at_ms
    measured_fps = (frame_count - 1) * 1_000 / elapsed_ms if elapsed_ms > 0 else 0.0
    height, width = frames[-1].image.shape[:2]
    return {
        "frames": frame_count,
        "width": int(width),
        "height": int(height),
        "measuredFps": round(measured_fps, 2),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="nono-camera")
    subparsers = parser.add_subparsers(dest="command", required=True)

    preflight = subparsers.add_parser("preflight", help="read frames and release the camera")
    preflight.add_argument("--camera-index", type=int, default=0)
    preflight.add_argument("--frames", type=int, default=60)

    run = subparsers.add_parser("run", help="emit one fast summary per second")
    run.add_argument("--camera-index", type=int, default=0)
    run.add_argument("--sample-fps", type=int, default=8)
    run.add_argument("--duration", type=int, default=30, help="seconds; 0 runs until stopped")
    run.add_argument("--model", help="MediaPipe Object Detector .tflite model")

    dashboard = subparsers.add_parser("dashboard", help="open the local camera tuning dashboard")
    dashboard.add_argument("--camera-index", type=int, default=0)
    dashboard.add_argument(
        "--model",
        default=".runtime/models/efficientdet_lite0.tflite",
        help="MediaPipe Object Detector .tflite model",
    )
    dashboard.add_argument("--host", choices=("127.0.0.1", "localhost"), default="127.0.0.1")
    dashboard.add_argument("--port", type=_valid_port, default=8765)
    dashboard.add_argument("--open", action="store_true", dest="open_browser")
    dashboard.add_argument("--vlm", action="store_true")
    dashboard.add_argument(
        "--vlm-model",
        default="mlx-community/Qwen3.5-0.8B-MLX-4bit",
    )
    dashboard.add_argument(
        "--vlm-input-mode",
        choices=("latest", "adaptive"),
        default="latest",
    )
    dashboard.add_argument(
        "--vlm-image-max-edge",
        type=_valid_vlm_image_max_edge,
        default=448,
    )
    dashboard.add_argument(
        "--vlm-host",
        choices=("127.0.0.1", "localhost"),
        default="127.0.0.1",
    )
    dashboard.add_argument("--vlm-port", type=_valid_port, default=8766)
    dashboard.add_argument(
        "--vlm-timeout-seconds",
        type=_valid_vlm_timeout_seconds,
        default=15,
    )
    dashboard.add_argument("--vlm-max-tokens", type=_positive_int, default=16)
    dashboard.add_argument("--vlm-no-auto-start", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    camera = OpenCVCameraSource(camera_index=args.camera_index)
    try:
        if args.command == "preflight":
            report = preflight_camera(camera, frame_count=args.frames)
            print(json.dumps(report, separators=(",", ":")))
            return 0

        if args.command == "dashboard":
            return _run_dashboard(args)

        detector = MediaPipeObjectDetector(Path(args.model)) if args.model else None
        runtime = RealtimeCameraRuntime(
            camera=camera,
            analyzer=MotionAnalyzer(),
            detector=detector,
            emit=lambda event: print(event_to_json(event), flush=True),
            sample_fps=args.sample_fps,
        )
        runtime.run(max_windows=args.duration or None)
        return 0
    except CameraUnavailableError as error:
        status = RealtimeAnalysisStatusV1(
            phase="failed",
            occurred_at_ms=0,
            code="camera_unavailable",
        )
        print(event_to_json(status), flush=True)
        print(str(error), flush=True)
        return 2
    except KeyboardInterrupt:
        return 130


def _valid_port(value: str) -> int:
    port = int(value)
    if not 1 <= port <= 65_535:
        raise argparse.ArgumentTypeError("port must be between 1 and 65535")
    return port


def _positive_int(value: str) -> int:
    result = int(value)
    if result <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return result


def _valid_vlm_timeout_seconds(value: str) -> int:
    timeout_seconds = _positive_int(value)
    if timeout_seconds > 15:
        raise argparse.ArgumentTypeError("VLM timeout must be at most 15 seconds")
    return timeout_seconds


def _valid_vlm_image_max_edge(value: str) -> int:
    max_edge = int(value)
    if not 64 <= max_edge <= 2_048:
        raise argparse.ArgumentTypeError(
            "VLM image max edge must be between 64 and 2048 pixels"
        )
    return max_edge


def _close_unowned_dashboard_resources(*resources: object | None) -> None:
    for resource in resources:
        if resource is None:
            continue
        try:
            resource.close()  # type: ignore[attr-defined]
        except Exception:
            # Preserve the startup failure while still attempting every cleanup.
            continue


def _run_dashboard(args: argparse.Namespace) -> int:
    from .dashboard_config import DashboardConfigStore, DashboardConfigV1
    from .dashboard_runtime import DashboardRuntime
    from .dashboard_state import DashboardStateStore
    from .dashboard_web import create_dashboard_app

    model_path = Path(args.model)
    if not model_path.is_file():
        raise FileNotFoundError(f"object detector model not found: {model_path}")
    detector = MediaPipeObjectDetector(model_path)
    semantic_worker = None
    vlm_supervisor = None
    runtime = None
    runtime_owns_resources = False
    primary_error: BaseException | None = None
    try:
        config_store = DashboardConfigStore()
        state_store = DashboardStateStore()
        if args.vlm:
            from .semantic_worker import SemanticWorker
            from .vlm_client import OpenAICompatibleVlmClient
            from .vlm_sidecar import VlmSidecarConfig, VlmSidecarSupervisor

            config_store = DashboardConfigStore(
                DashboardConfigV1(semantic_enabled=True, semantic_cooldown_seconds=1)
            )
            state_store.set_semantic_configured(True)
            vlm_supervisor = VlmSidecarSupervisor(
                config=VlmSidecarConfig(
                    model_id=args.vlm_model,
                    host=args.vlm_host,
                    port=args.vlm_port,
                    cache_dir=Path(".runtime/huggingface"),
                    auto_start=not args.vlm_no_auto_start,
                ),
                state_store=state_store,
            )
            client = OpenAICompatibleVlmClient(
                base_url=vlm_supervisor.base_url,
                model_id=args.vlm_model,
                timeout_seconds=args.vlm_timeout_seconds,
                max_tokens=args.vlm_max_tokens,
                image_max_edge=args.vlm_image_max_edge,
            )
            semantic_worker = SemanticWorker(
                client=client,
                state_store=state_store,
                available=lambda: vlm_supervisor.available,
            )
            semantic_worker.start()
            vlm_supervisor.start_async()
        else:
            state_store.set_semantic_configured(False)
        runtime = DashboardRuntime(
            camera_factory=lambda: OpenCVCameraSource(camera_index=args.camera_index),
            detector=detector,
            semantic_worker=semantic_worker,
            vlm_supervisor=vlm_supervisor,
            config_store=config_store,
            state_store=state_store,
            semantic_input_mode=args.vlm_input_mode,
        )
        runtime_owns_resources = True
        app = create_dashboard_app(runtime)
        url = f"http://{args.host}:{args.port}/"
        if args.open_browser:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        runtime.start()
        print(f"NoNo camera dashboard: {url}", flush=True)
        app.run(
            host=args.host,
            port=args.port,
            threaded=True,
            debug=False,
            use_reloader=False,
        )
    except BaseException as error:
        primary_error = error
        raise
    finally:
        if runtime_owns_resources:
            assert runtime is not None
            try:
                runtime.close()
            except Exception as cleanup_error:
                if primary_error is None:
                    raise
                primary_error.add_note(
                    f"Dashboard runtime cleanup failed: {cleanup_error}"
                )
        else:
            _close_unowned_dashboard_resources(
                semantic_worker,
                vlm_supervisor,
                detector,
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
