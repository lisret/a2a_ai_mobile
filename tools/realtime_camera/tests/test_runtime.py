from __future__ import annotations

import numpy as np
import pytest

from nono_realtime_camera.camera import CameraUnavailableError
from nono_realtime_camera.contracts import (
    RealtimeAnalysisStatusV1,
    RealtimeSecondSummaryV1,
)
from nono_realtime_camera.frames import FramePacket
from nono_realtime_camera.mediapipe_detector import DetectedObject
from nono_realtime_camera.motion import MotionAnalyzer
from nono_realtime_camera.runtime import RealtimeCameraRuntime


class FakeCamera:
    def __init__(self, frames: list[FramePacket]) -> None:
        self._frames = iter(frames)
        self.opened = False
        self.closed = False

    def open(self) -> None:
        self.opened = True

    def read(self) -> FramePacket:
        return next(self._frames)

    def close(self) -> None:
        self.closed = True


class FakeDetector:
    def __init__(self) -> None:
        self.calls = 0
        self.closed = False

    def detect(self, _image: np.ndarray) -> tuple[DetectedObject, ...]:
        self.calls += 1
        return (DetectedObject("person", 0.9, (0, 0, 10, 10)),)

    def close(self) -> None:
        self.closed = True


def make_frames(duration_ms: int) -> list[FramePacket]:
    image = np.zeros((32, 32, 3), dtype=np.uint8)
    return [
        FramePacket(frame_id=index + 1, captured_at_ms=timestamp, image=image.copy())
        for index, timestamp in enumerate(range(0, duration_ms + 1, 125))
    ]


def test_runtime_emits_one_summary_for_each_second_window() -> None:
    camera = FakeCamera(make_frames(3_000))
    events: list[RealtimeAnalysisStatusV1 | RealtimeSecondSummaryV1] = []
    runtime = RealtimeCameraRuntime(
        camera=camera,
        analyzer=MotionAnalyzer(),
        emit=events.append,
        sample_fps=8,
    )

    runtime.run(max_windows=3)

    summaries = [event for event in events if isinstance(event, RealtimeSecondSummaryV1)]
    assert [summary.window_id for summary in summaries] == [1, 2, 3]
    assert [summary.sampled_frame_count for summary in summaries] == [8, 8, 8]
    assert all(summary.emitted_at_ms >= summary.ended_at_ms for summary in summaries)
    assert camera.closed is True


def test_runtime_emits_running_and_stopped_status() -> None:
    camera = FakeCamera(make_frames(1_000))
    events: list[RealtimeAnalysisStatusV1 | RealtimeSecondSummaryV1] = []
    runtime = RealtimeCameraRuntime(
        camera=camera,
        analyzer=MotionAnalyzer(),
        emit=events.append,
        sample_fps=8,
    )

    runtime.run(max_windows=1)

    statuses = [event for event in events if isinstance(event, RealtimeAnalysisStatusV1)]
    assert [status.phase for status in statuses] == ["starting", "running", "stopped"]


def test_runtime_attaches_detected_objects_and_presence_changes() -> None:
    camera = FakeCamera(make_frames(2_000))
    detector = FakeDetector()
    events: list[RealtimeAnalysisStatusV1 | RealtimeSecondSummaryV1] = []
    runtime = RealtimeCameraRuntime(
        camera=camera,
        analyzer=MotionAnalyzer(),
        detector=detector,
        emit=events.append,
        sample_fps=8,
    )

    runtime.run(max_windows=2)

    summaries = [event for event in events if isinstance(event, RealtimeSecondSummaryV1)]
    assert summaries[0].objects == ("person",)
    assert summaries[0].presence_change == "entered"
    assert summaries[1].presence_change == "none"
    assert detector.calls == 2
    assert detector.closed is True


def test_emitted_timestamp_is_recorded_after_processing() -> None:
    camera = FakeCamera(make_frames(1_000))
    events: list[RealtimeAnalysisStatusV1 | RealtimeSecondSummaryV1] = []
    monotonic_values = iter((0, 1_000_000_000, 1_025_000_000))
    runtime = RealtimeCameraRuntime(
        camera=camera,
        analyzer=MotionAnalyzer(),
        emit=events.append,
        sample_fps=8,
        monotonic_ns=lambda: next(monotonic_values),
    )

    runtime.run(max_windows=1)

    summary = next(event for event in events if isinstance(event, RealtimeSecondSummaryV1))
    assert summary.processing_ms == 25
    assert summary.emitted_at_ms == 1_025


def test_camera_open_failure_still_closes_detector() -> None:
    class FailingCamera(FakeCamera):
        def open(self) -> None:
            raise CameraUnavailableError("denied")

    detector = FakeDetector()
    runtime = RealtimeCameraRuntime(
        camera=FailingCamera([]),
        analyzer=MotionAnalyzer(),
        detector=detector,
        emit=lambda _event: None,
    )

    with pytest.raises(CameraUnavailableError):
        runtime.run(max_windows=1)

    assert detector.closed is True
