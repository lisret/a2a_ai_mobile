from __future__ import annotations

from nono_realtime_camera.contracts import (
    RealtimeSecondSummaryV1,
    RealtimeSemanticEnrichmentV1,
)
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


def make_enrichment(
    window_id: int, processing_ms: int
) -> RealtimeSemanticEnrichmentV1:
    return RealtimeSemanticEnrichmentV1(
        window_id=window_id,
        semantic_summary="一位人士站在室内",
        model_id="Qwen",
        processing_ms=processing_ms,
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


def test_analysis_metrics_report_rolling_percentiles_and_emit_interval() -> None:
    state = DashboardStateStore(metric_window=4)
    for processing_ms, end_to_emit_ms, emitted_at_ms in (
        (10, 20, 1_000),
        (20, 30, 2_020),
        (30, 40, 3_010),
        (40, 50, 4_030),
    ):
        state.record_analysis_metrics(
            processing_ms=processing_ms,
            end_to_emit_ms=end_to_emit_ms,
            emitted_at_ms=emitted_at_ms,
        )

    metrics = state.snapshot(DashboardConfigStore().snapshot())["metrics"]

    assert metrics["processingP50Ms"] == 25.0
    assert metrics["processingP95Ms"] == 40.0
    assert metrics["endToEmitP50Ms"] == 35.0
    assert metrics["endToEmitP95Ms"] == 50.0
    assert metrics["emitIntervalP95Ms"] == 1_020.0


def test_session_metric_reset_drops_pre_restart_latency_history() -> None:
    state = DashboardStateStore()
    state.record_analysis_metrics(
        processing_ms=900,
        end_to_emit_ms=20_000,
        emitted_at_ms=21_000,
    )

    state.reset_session_metrics()
    state.record_analysis_metrics(
        processing_ms=100,
        end_to_emit_ms=150,
        emitted_at_ms=30_000,
    )
    metrics = state.snapshot(DashboardConfigStore().snapshot())["metrics"]

    assert metrics["processingP95Ms"] == 100.0
    assert metrics["endToEmitP95Ms"] == 150.0
    assert metrics["emitIntervalP95Ms"] == 0.0


def test_semantic_result_updates_latest_event_and_rolling_metrics() -> None:
    state = DashboardStateStore(metric_window=4)
    state.set_semantic_lifecycle("ready", message="Qwen ready")
    state.record_semantic_result(make_enrichment(window_id=7, processing_ms=3200), input_frames=3)
    payload = state.snapshot(DashboardConfigStore().snapshot())

    assert payload["semanticLifecycle"] == {"phase": "ready", "message": "Qwen ready"}
    assert payload["latestSemantic"]["windowId"] == 7
    assert payload["metrics"]["semanticProcessingP95Ms"] == 3200.0
    assert payload["metrics"]["semanticInputFrameCount"] == 3
    assert payload["metrics"]["semanticSuccessCount"] == 1


def test_semantic_counters_and_reset_are_bounded_and_session_scoped() -> None:
    state = DashboardStateStore()
    state.record_semantic_drop()
    state.record_semantic_stale()
    state.record_semantic_error("timeout")
    state.reset_semantic_session()
    metrics = state.snapshot(DashboardConfigStore().snapshot())["metrics"]

    assert metrics["semanticDroppedCount"] == 0
    assert metrics["semanticStaleCount"] == 0
    assert metrics["semanticErrorCount"] == 0
