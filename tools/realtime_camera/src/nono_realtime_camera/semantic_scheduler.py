from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .contracts import RealtimeSecondSummaryV1
from .frames import FramePacket, FrameWindow

SemanticInputMode = Literal["latest", "adaptive"]


@dataclass(frozen=True, slots=True)
class SemanticTask:
    task_id: int
    session_id: int
    window_id: int
    submitted_at_ms: int
    frames: tuple[FramePacket, ...]


def select_semantic_frames(
    window: FrameWindow,
    summary: RealtimeSecondSummaryV1,
    *,
    input_mode: SemanticInputMode = "adaptive",
) -> tuple[FramePacket, ...]:
    if not window.frames:
        return ()
    if input_mode == "latest":
        return (window.frames[-1],)

    dynamic = summary.motion != "stationary" or summary.scene_changed or summary.changed
    indexes = (0, len(window.frames) // 2, len(window.frames) - 1) if dynamic else (-1,)
    selected: list[FramePacket] = []
    seen: set[int] = set()
    for index in indexes:
        frame = window.frames[index]
        if frame.frame_id not in seen:
            selected.append(frame)
            seen.add(frame.frame_id)
    return tuple(selected)


class SemanticTriggerPolicy:
    __slots__ = (
        "cooldown_ms",
        "input_mode",
        "static_heartbeat_ms",
        "last_submitted_at_ms",
    )

    def __init__(
        self,
        cooldown_ms: int,
        static_heartbeat_ms: int,
        input_mode: SemanticInputMode = "adaptive",
    ) -> None:
        self.cooldown_ms = cooldown_ms
        self.static_heartbeat_ms = static_heartbeat_ms
        self.input_mode = input_mode
        self.last_submitted_at_ms: int | None = None

    def should_submit(self, summary: RealtimeSecondSummaryV1, now_ms: int) -> bool:
        if self.last_submitted_at_ms is None:
            return True

        elapsed_ms = now_ms - self.last_submitted_at_ms
        if self.input_mode == "latest":
            return elapsed_ms >= self.cooldown_ms
        dynamic = summary.motion != "stationary" or summary.scene_changed or summary.changed
        if dynamic:
            return elapsed_ms >= self.cooldown_ms
        return elapsed_ms >= self.static_heartbeat_ms

    def mark_submitted(self, now_ms: int) -> None:
        self.last_submitted_at_ms = now_ms
