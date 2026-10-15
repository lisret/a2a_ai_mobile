from __future__ import annotations

import pytest

from nono_realtime_camera.contracts import (
    RealtimeAnalysisStatusV1,
    RealtimeSecondSummaryV1,
    RealtimeSemanticEnrichmentV1,
)


def make_summary(**overrides: object) -> RealtimeSecondSummaryV1:
    values: dict[str, object] = {
        "window_id": 1,
        "started_at_ms": 0,
        "ended_at_ms": 1_000,
        "emitted_at_ms": 1_010,
        "sampled_frame_count": 8,
        "target_frame_count": 8,
        "objects": ("person",),
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


def test_summary_rejects_confidence_outside_unit_interval() -> None:
    with pytest.raises(ValueError, match="confidence"):
        make_summary(confidence=1.1)


def test_summary_rejects_non_positive_window() -> None:
    with pytest.raises(ValueError, match="window_id"):
        make_summary(window_id=0)


def test_summary_rejects_reversed_window_times() -> None:
    with pytest.raises(ValueError, match="ended_at_ms"):
        make_summary(started_at_ms=1_000, ended_at_ms=999)


def test_summary_serializes_camel_case_without_image_payload() -> None:
    payload = make_summary().to_dict()

    assert payload["windowId"] == 1
    assert payload["sampledFrameCount"] == 8
    assert payload["schemaVersion"] == 1
    assert not ({"frame", "image", "jpeg", "pixels"} & payload.keys())


def test_semantic_enrichment_requires_non_empty_model_and_summary() -> None:
    with pytest.raises(ValueError, match="model_id"):
        RealtimeSemanticEnrichmentV1(
            window_id=1,
            semantic_summary="有人走入画面",
            model_id="",
            processing_ms=20,
        )


def test_status_rejects_code_that_is_not_in_contract() -> None:
    with pytest.raises(ValueError, match="code"):
        RealtimeAnalysisStatusV1(phase="failed", occurred_at_ms=1, code="unknown")  # type: ignore[arg-type]
