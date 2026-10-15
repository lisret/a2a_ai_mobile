from __future__ import annotations

from .contracts import PresenceChange, RealtimeSecondSummaryV1
from .frames import FrameWindow
from .motion import MotionResult


def build_fast_summary(
    *,
    window: FrameWindow,
    motion: MotionResult,
    emitted_at_ms: int,
    processing_ms: int,
    target_frame_count: int,
    objects: tuple[str, ...] = (),
    presence_change: PresenceChange = "none",
) -> RealtimeSecondSummaryV1:
    if presence_change == "entered":
        text = "检测到对象进入画面"
    elif presence_change == "left":
        text = "检测到对象离开画面"
    elif presence_change == "changed":
        text = "画面中的对象发生变化"
    elif motion.scene_changed:
        text = "物品或场景发生明显变化"
    elif motion.motion == "moving_left":
        text = "画面中有物体向左移动"
    elif motion.motion == "moving_right":
        text = "画面中有物体向右移动"
    elif motion.motion == "moving":
        text = "画面中有明显移动"
    elif motion.motion == "stationary":
        text = "画面基本静止"
    else:
        text = "当前画面信息不足"

    completeness = min(1.0, window.sampled_frame_count / target_frame_count)
    changed = (
        presence_change in {"entered", "left", "changed"}
        or motion.scene_changed
        or motion.motion in {"moving", "moving_left", "moving_right"}
    )
    return RealtimeSecondSummaryV1(
        window_id=window.window_id,
        started_at_ms=window.started_at_ms,
        ended_at_ms=window.ended_at_ms,
        emitted_at_ms=emitted_at_ms,
        sampled_frame_count=window.sampled_frame_count,
        target_frame_count=target_frame_count,
        objects=objects,
        presence_change="unknown" if window.sampled_frame_count == 0 else presence_change,
        motion=motion.motion,
        scene_changed=motion.scene_changed,
        summary=text,
        confidence=motion.confidence * completeness,
        changed=changed,
        stale=False,
        source="fast_path",
        processing_ms=processing_ms,
    )
