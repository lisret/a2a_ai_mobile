from __future__ import annotations

import numpy as np

from nono_realtime_camera.dashboard_runtime import FastOverlay
from nono_realtime_camera.mediapipe_detector import DetectedObject
from nono_realtime_camera.preview import annotate_frame


def overlay(*, at_ms: int = 1_000) -> FastOverlay:
    return FastOverlay(
        result_at_ms=at_ms,
        detections=(DetectedObject("person", 0.9, (10, 10, 30, 40)),),
        window_id=7,
        motion="stationary",
        processing_ms=80,
        summary="检测到人",
    )


def test_annotation_does_not_mutate_analysis_frame() -> None:
    source = np.zeros((100, 100, 3), dtype=np.uint8)
    before = source.copy()

    annotated = annotate_frame(source, overlay(), now_ms=1_100)

    assert np.array_equal(source, before)
    assert not np.array_equal(annotated, before)


def test_old_overlay_is_hidden_after_three_seconds() -> None:
    source = np.zeros((100, 100, 3), dtype=np.uint8)

    annotated = annotate_frame(source, overlay(at_ms=1_000), now_ms=4_100)

    assert np.array_equal(annotated, source)


def test_recent_box_is_green_and_aging_box_is_gray() -> None:
    source = np.zeros((100, 100, 3), dtype=np.uint8)

    recent = annotate_frame(source, overlay(), now_ms=1_100)
    aging = annotate_frame(source, overlay(), now_ms=2_700)

    assert tuple(recent[10, 10]) == (60, 220, 120)
    assert tuple(aging[10, 10]) == (150, 150, 150)


def test_box_is_clamped_to_image_bounds() -> None:
    source = np.zeros((20, 20, 3), dtype=np.uint8)
    outside = FastOverlay(
        result_at_ms=0,
        detections=(DetectedObject("cup", 0.8, (-10, -10, 100, 100)),),
        window_id=1,
        motion="moving",
        processing_ms=20,
        summary="变化",
    )

    annotated = annotate_frame(source, outside, now_ms=100)

    assert np.count_nonzero(annotated) > 0
