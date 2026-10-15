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


def _run_dashboard(args: argparse.Namespace) -> int:
    from .dashboard_runtime import DashboardRuntime
    from .dashboard_web import create_dashboard_app

    model_path = Path(args.model)
    if not model_path.is_file():
        raise FileNotFoundError(f"object detector model not found: {model_path}")
    detector = MediaPipeObjectDetector(model_path)
    runtime = DashboardRuntime(
        camera_factory=lambda: OpenCVCameraSource(camera_index=args.camera_index),
        detector=detector,
    )
    app = create_dashboard_app(runtime)
    url = f"http://{args.host}:{args.port}/"
    if args.open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    runtime.start()
    print(f"NoNo camera dashboard: {url}", flush=True)
    try:
        app.run(
            host=args.host,
            port=args.port,
            threaded=True,
            debug=False,
            use_reloader=False,
        )
    finally:
        runtime.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
