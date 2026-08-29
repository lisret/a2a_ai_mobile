from __future__ import annotations

from nono_realtime_camera.contracts import RealtimeSecondSummaryV1
from nono_realtime_camera.dashboard_config import DashboardConfigStore
from nono_realtime_camera.dashboard_state import DashboardStateStore


def make_summary(window_id: int) -> RealtimeSecondSummaryV1:
    started_at_ms = (window_id - 1) * 1_000
    ended_at_ms = window_id * 1_000
    return RealtimeSecondSummaryV1(
        window_id=window_id,
        started_at_ms=started_at_ms,
        ended_at_ms=ended_at_ms,
        emitted_at_ms=ended_at_ms + 100,
        sampled_frame_count=15,
        target_frame_count=15,
        objects=("person",),
        presence_change="none",
        motion="stationary",
        scene_changed=False,
        summary="画面基本静止",
        confidence=0.9,
        changed=False,
        stale=False,
        source="fast_path",
        processing_ms=80,
    )


def test_event_history_is_bounded_and_sequence_addressable() -> None:
    state = DashboardStateStore(event_limit=3)
    for window_id in range(1, 5):
        state.record_event(make_summary(window_id))

    assert [row["sequence"] for row in state.events_after(0)] == [2, 3, 4]
    assert [row["windowId"] for row in state.events_after(2)] == [3, 4]


def test_snapshot_contains_config_lifecycle_metrics_and_latest_summary() -> None:
    state = DashboardStateStore()
    summary = make_summary(1)
    state.set_lifecycle("running")
    state.update_metrics(captureFps=20.4, fastPendingDepth=1)
    state.record_event(summary)

    payload = state.snapshot(DashboardConfigStore().snapshot())

    assert payload["lifecycle"] == {"phase": "running", "code": None, "message": None}
    assert payload["metrics"]["captureFps"] == 20.4
    assert payload["metrics"]["fastPendingDepth"] == 1
    assert payload["latestSummary"]["windowId"] == 1
    assert payload["config"]["sampleFps"] == 15


def test_state_json_never_contains_frame_payload() -> None:
    state = DashboardStateStore()
    state.record_event(make_summary(1))
    payload_text = repr(state.snapshot(DashboardConfigStore().snapshot())).lower()

    for forbidden in ("jpeg", "pixels", "image", "framepayload"):
        assert forbidden not in payload_text
