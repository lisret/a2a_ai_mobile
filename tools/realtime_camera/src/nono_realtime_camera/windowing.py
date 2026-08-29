from __future__ import annotations

from collections import deque

from .frames import FramePacket, FrameWindow


class OneSecondRingBuffer:
    def __init__(self, retention_ms: int = 1_000) -> None:
        if retention_ms <= 0:
            raise ValueError("retention_ms must be positive")
        self._retention_ms = retention_ms
        self._frames: deque[FramePacket] = deque()
        self._latest_timestamp_ms: int | None = None

    def add(self, frame: FramePacket) -> None:
        if (
            self._latest_timestamp_ms is not None
            and frame.captured_at_ms < self._latest_timestamp_ms
        ):
            raise ValueError("frame timestamps must be monotonic")
        self._latest_timestamp_ms = frame.captured_at_ms
        self._frames.append(frame)
        cutoff_ms = frame.captured_at_ms - self._retention_ms
        while self._frames and self._frames[0].captured_at_ms < cutoff_ms:
            self._frames.popleft()

    def freeze_window(
        self,
        *,
        window_id: int,
        started_at_ms: int,
        ended_at_ms: int,
    ) -> FrameWindow:
        frames = tuple(
            frame
            for frame in self._frames
            if started_at_ms <= frame.captured_at_ms < ended_at_ms
        )
        return FrameWindow(
            window_id=window_id,
            started_at_ms=started_at_ms,
            ended_at_ms=ended_at_ms,
            frames=frames,
        )
