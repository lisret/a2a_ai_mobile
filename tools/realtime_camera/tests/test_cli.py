from __future__ import annotations

import json

import numpy as np

from nono_realtime_camera.cli import build_parser, event_to_json, preflight_camera
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
