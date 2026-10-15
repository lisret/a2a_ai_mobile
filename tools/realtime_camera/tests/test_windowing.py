from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest

from nono_realtime_camera.frames import FramePacket
from nono_realtime_camera.windowing import OneSecondRingBuffer


def packet(frame_id: int, captured_at_ms: int) -> FramePacket:
    return FramePacket(frame_id=frame_id, captured_at_ms=captured_at_ms, image=object())


def test_freeze_window_uses_half_open_time_range() -> None:
    buffer = OneSecondRingBuffer(retention_ms=1_000)
    for frame_id, timestamp_ms in enumerate(range(0, 1_001, 125), start=1):
        buffer.add(packet(frame_id, timestamp_ms))

    window = buffer.freeze_window(window_id=1, started_at_ms=0, ended_at_ms=1_000)

    assert [frame.captured_at_ms for frame in window.frames] == list(range(0, 1_000, 125))
    assert window.sampled_frame_count == 8


def test_frozen_window_cannot_be_modified() -> None:
    buffer = OneSecondRingBuffer(retention_ms=1_000)
    buffer.add(packet(1, 0))
    window = buffer.freeze_window(window_id=1, started_at_ms=0, ended_at_ms=1_000)

    with pytest.raises(FrozenInstanceError):
        window.window_id = 2  # type: ignore[misc]


def test_buffer_rejects_non_monotonic_frame_timestamp() -> None:
    buffer = OneSecondRingBuffer(retention_ms=1_000)
    buffer.add(packet(1, 100))

    with pytest.raises(ValueError, match="monotonic"):
        buffer.add(packet(2, 99))
