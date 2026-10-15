from __future__ import annotations

from nono_realtime_camera.aggregation import build_fast_summary
from nono_realtime_camera.frames import FramePacket, FrameWindow
from nono_realtime_camera.motion import MotionResult


def make_window(frame_count: int = 8) -> FrameWindow:
    frames = tuple(
        FramePacket(frame_id=index + 1, captured_at_ms=index * 125, image=object())
        for index in range(frame_count)
    )
    return FrameWindow(window_id=1, started_at_ms=0, ended_at_ms=1_000, frames=frames)


def test_builds_short_stationary_summary() -> None:
    summary = build_fast_summary(
        window=make_window(),
        motion=MotionResult(
            motion="stationary",
            scene_changed=False,
            changed_pixel_ratio=0.0,
            confidence=1.0,
        ),
        emitted_at_ms=1_001,
        processing_ms=12,
        target_frame_count=8,
    )

    assert summary.summary == "画面基本静止"
    assert summary.changed is False
    assert summary.stale is False
    assert summary.source == "fast_path"


def test_scene_change_has_priority_over_generic_motion() -> None:
    summary = build_fast_summary(
        window=make_window(),
        motion=MotionResult(
            motion="moving",
            scene_changed=True,
            changed_pixel_ratio=0.8,
            confidence=0.9,
        ),
        emitted_at_ms=1_005,
        processing_ms=20,
        target_frame_count=8,
    )

    assert summary.summary == "物品或场景发生明显变化"
    assert summary.changed is True


def test_presence_change_marks_summary_changed() -> None:
    summary = build_fast_summary(
        window=make_window(),
        motion=MotionResult("stationary", False, 0.0, 1.0),
        emitted_at_ms=1_005,
        processing_ms=20,
        target_frame_count=8,
        objects=("cup",),
        presence_change="entered",
    )

    assert summary.summary == "检测到对象进入画面"
    assert summary.changed is True
