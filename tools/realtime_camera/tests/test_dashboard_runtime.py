from __future__ import annotations

import threading
import time
from collections.abc import Callable

import numpy as np

from nono_realtime_camera.dashboard_config import DashboardConfigStore
from nono_realtime_camera.dashboard_runtime import DashboardRuntime
from nono_realtime_camera.frames import FramePacket
from nono_realtime_camera.mediapipe_detector import DetectedObject


class ContinuousFakeCamera:
    def __init__(self, *, frame_period_seconds: float = 0.005) -> None:
        self.frame_period_seconds = frame_period_seconds
        self.read_count = 0
        self.closed = False

    def open(self) -> None:
        self.closed = False

    def read(self) -> FramePacket:
        time.sleep(self.frame_period_seconds)
        self.read_count += 1
        image = np.zeros((32, 32, 3), dtype=np.uint8)
        return FramePacket(
            frame_id=self.read_count,
            captured_at_ms=time.monotonic_ns() // 1_000_000,
            image=image,
        )

    def close(self) -> None:
        self.closed = True


class BlockingDetector:
    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = threading.Event()
        self.closed = False

    def detect(self, _image: np.ndarray) -> tuple[DetectedObject, ...]:
        self.started.set()
        self.release.wait(timeout=2)
        return (DetectedObject("person", 0.9, (1, 1, 10, 10)),)

    def close(self) -> None:
        self.closed = True


def wait_until(predicate: Callable[[], bool], *, timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError("condition did not become true")


def test_runtime_emits_fast_events_and_releases_camera() -> None:
    camera = ContinuousFakeCamera()
    runtime = DashboardRuntime(camera_factory=lambda: camera, window_ms=100)

    runtime.start()
    wait_until(lambda: len(runtime.state_store.events_after(0)) >= 2)
    runtime.stop()

    events = runtime.state_store.events_after(0)
    assert [event["windowId"] for event in events[:2]] == [1, 2]
    assert camera.closed is True
    assert runtime.is_running is False
    assert runtime.state_store.snapshot(runtime.config_store.snapshot())["lifecycle"][
        "phase"
    ] == "stopped"


def test_blocking_detector_does_not_stop_camera_capture() -> None:
    camera = ContinuousFakeCamera()
    detector = BlockingDetector()
    runtime = DashboardRuntime(
        camera_factory=lambda: camera,
        detector=detector,
        window_ms=100,
    )
    runtime.start()
    assert detector.started.wait(timeout=1)
    reads_when_detector_started = camera.read_count

    time.sleep(0.1)

    assert camera.read_count > reads_when_detector_started + 5
    detector.release.set()
    runtime.stop()
    assert detector.closed is False
    runtime.close()
    assert detector.closed is True


def test_hot_config_is_reflected_in_next_summary() -> None:
    camera = ContinuousFakeCamera()
    config = DashboardConfigStore()
    runtime = DashboardRuntime(
        camera_factory=lambda: camera,
        config_store=config,
        window_ms=100,
    )
    runtime.start()
    wait_until(lambda: len(runtime.state_store.events_after(0)) >= 1)

    config.update({"sampleFps": 12})
    wait_until(lambda: len(runtime.state_store.events_after(0)) >= 2)
    runtime.stop()

    summaries = runtime.state_store.events_after(0)
    assert summaries[0]["targetFrameCount"] == 15
    assert summaries[1]["targetFrameCount"] == 12


def test_start_and_stop_are_idempotent() -> None:
    camera = ContinuousFakeCamera()
    runtime = DashboardRuntime(camera_factory=lambda: camera, window_ms=100)

    runtime.start()
    runtime.start()
    runtime.stop()
    runtime.stop()

    assert runtime.is_running is False


def test_runtime_produces_latest_jpeg_preview() -> None:
    camera = ContinuousFakeCamera()
    runtime = DashboardRuntime(camera_factory=lambda: camera, window_ms=100)

    runtime.start()
    wait_until(lambda: runtime.latest_jpeg_store.get()[1] is not None)
    _, jpeg = runtime.latest_jpeg_store.get()
    runtime.stop()

    assert jpeg is not None
    assert jpeg.startswith(b"\xff\xd8")
