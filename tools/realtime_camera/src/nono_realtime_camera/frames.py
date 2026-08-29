from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class FramePacket:
    frame_id: int
    captured_at_ms: int
    image: Any

    def __post_init__(self) -> None:
        if self.frame_id <= 0:
            raise ValueError("frame_id must be positive")
        if self.captured_at_ms < 0:
            raise ValueError("captured_at_ms must be non-negative")


@dataclass(frozen=True, slots=True)
class FrameWindow:
    window_id: int
    started_at_ms: int
    ended_at_ms: int
    frames: tuple[FramePacket, ...]

    def __post_init__(self) -> None:
        if self.window_id <= 0:
            raise ValueError("window_id must be positive")
        if self.started_at_ms < 0:
            raise ValueError("started_at_ms must be non-negative")
        if self.ended_at_ms <= self.started_at_ms:
            raise ValueError("ended_at_ms must be after started_at_ms")

    @property
    def sampled_frame_count(self) -> int:
        return len(self.frames)
