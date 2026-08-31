from __future__ import annotations

from nono_realtime_camera.contracts import RealtimeSecondSummaryV1
from nono_realtime_camera.frames import FramePacket, FrameWindow
from nono_realtime_camera.semantic_scheduler import (
    SemanticTriggerPolicy,
    select_semantic_frames,
)


def make_window(frame_ids: tuple[int, ...]) -> FrameWindow:
    frames = tuple(
        FramePacket(frame_id=frame_id, captured_at_ms=index * 100, image=object())
        for index, frame_id in enumerate(frame_ids)
    )
    return FrameWindow(window_id=1, started_at_ms=0, ended_at_ms=1_000, frames=frames)


def make_summary(**overrides: object) -> RealtimeSecondSummaryV1:
    values: dict[str, object] = {
        "window_id": 1,
        "started_at_ms": 0,
        "ended_at_ms": 1_000,
        "emitted_at_ms": 1_010,
        "sampled_frame_count": 5,
        "target_frame_count": 5,
        "objects": (),
        "presence_change": "none",
        "motion": "stationary",
        "scene_changed": False,
        "summary": "画面基本静止",
        "confidence": 0.9,
        "changed": False,
        "stale": False,
        "source": "fast_path",
        "processing_ms": 12,
    }
    values.update(overrides)
    return RealtimeSecondSummaryV1(**values)  # type: ignore[arg-type]


def test_stationary_window_selects_only_latest_frame() -> None:
    window = make_window(frame_ids=(1, 2, 3, 4, 5))
    selected = select_semantic_frames(window, make_summary(motion="stationary"))
    assert [frame.frame_id for frame in selected] == [5]


def test_moving_window_selects_first_middle_and_last() -> None:
    window = make_window(frame_ids=(1, 2, 3, 4, 5))
    selected = select_semantic_frames(window, make_summary(motion="moving"))
    assert [frame.frame_id for frame in selected] == [1, 3, 5]


def test_latest_mode_selects_only_last_frame_even_when_moving() -> None:
    window = make_window(frame_ids=(1, 2, 3, 4, 5))
    selected = select_semantic_frames(
        window,
        make_summary(motion="moving"),
        input_mode="latest",
    )
    assert [frame.frame_id for frame in selected] == [5]


def test_dynamic_selection_deduplicates_frame_ids() -> None:
    window = make_window(frame_ids=(1, 2, 1))
    selected = select_semantic_frames(window, make_summary(changed=True))
    assert [frame.frame_id for frame in selected] == [1, 2]


def test_trigger_policy_obeys_change_cooldown_and_static_heartbeat() -> None:
    policy = SemanticTriggerPolicy(cooldown_ms=5_000, static_heartbeat_ms=10_000)
    assert policy.should_submit(make_summary(changed=True), now_ms=1_000) is True
    policy.mark_submitted(1_000)
    assert policy.should_submit(make_summary(changed=True), now_ms=4_000) is False
    assert policy.should_submit(make_summary(changed=False), now_ms=11_000) is True


def test_latest_trigger_mode_uses_cooldown_for_stationary_windows() -> None:
    policy = SemanticTriggerPolicy(
        cooldown_ms=1_000,
        static_heartbeat_ms=10_000,
        input_mode="latest",
    )
    assert policy.should_submit(make_summary(changed=False), now_ms=1_000) is True
    policy.mark_submitted(1_000)
    assert policy.should_submit(make_summary(changed=False), now_ms=1_999) is False
    assert policy.should_submit(make_summary(changed=False), now_ms=2_000) is True
