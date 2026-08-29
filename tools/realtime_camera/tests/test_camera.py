from __future__ import annotations

import numpy as np
import pytest

from nono_realtime_camera.camera import CameraUnavailableError, OpenCVCameraSource


class FakeCapture:
    def __init__(self, *, opened: bool = True, successful_reads: int = 2) -> None:
        self.opened = opened
        self.successful_reads = successful_reads
        self.read_count = 0
        self.released = False
        self.properties: dict[int, float] = {}

    def isOpened(self) -> bool:
        return self.opened

    def set(self, key: int, value: float) -> bool:
        self.properties[key] = value
        return True

    def get(self, _key: int) -> float:
        return 30.0

    def read(self) -> tuple[bool, np.ndarray | None]:
        self.read_count += 1
        if self.read_count > self.successful_reads:
            return False, None
        return True, np.zeros((4, 6, 3), dtype=np.uint8)

    def release(self) -> None:
        self.released = True


def test_open_raises_clear_error_when_camera_is_unavailable() -> None:
    capture = FakeCapture(opened=False)
    source = OpenCVCameraSource(capture_factory=lambda _index, _backend: capture)

    with pytest.raises(CameraUnavailableError, match="camera index 0"):
        source.open()

    assert capture.released is True


def test_read_returns_monotonic_frame_packets() -> None:
    capture = FakeCapture()
    times = iter((1_000_000_000, 1_100_000_000))
    source = OpenCVCameraSource(
        capture_factory=lambda _index, _backend: capture,
        monotonic_ns=lambda: next(times),
    )
    source.open()

    first = source.read()
    second = source.read()

    assert first.frame_id == 1
    assert first.captured_at_ms == 1_000
    assert first.image.shape == (4, 6, 3)
    assert second.frame_id == 2
    assert second.captured_at_ms == 1_100


def test_close_is_idempotent_and_releases_capture() -> None:
    capture = FakeCapture()
    source = OpenCVCameraSource(capture_factory=lambda _index, _backend: capture)
    source.open()

    source.close()
    source.close()

    assert capture.released is True
