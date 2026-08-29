from __future__ import annotations

import math

import pytest

from nono_realtime_camera.dashboard_config import (
    ConfigValidationError,
    DashboardConfigStore,
)


def test_defaults_match_dashboard_contract() -> None:
    config = DashboardConfigStore().snapshot()

    assert config.sample_fps == 15
    assert config.preview_fps == 12
    assert config.detection_score_threshold == 0.45
    assert config.motion_pixel_threshold == 20
    assert config.motion_ratio_threshold == 0.01
    assert config.scene_ratio_threshold == 0.35
    assert config.semantic_enabled is False
    assert config.revision == 1


def test_update_increments_revision_without_mutating_previous_snapshot() -> None:
    store = DashboardConfigStore()
    before = store.snapshot()

    after = store.update({"sampleFps": 12, "detectionScoreThreshold": 0.6})

    assert before.sample_fps == 15
    assert before.revision == 1
    assert after.sample_fps == 12
    assert after.detection_score_threshold == 0.6
    assert after.revision == 2


@pytest.mark.parametrize(
    "patch",
    [
        {"sampleFps": 1},
        {"sampleFps": True},
        {"previewFps": 21},
        {"detectionScoreThreshold": 0.1},
        {"motionPixelThreshold": 81},
        {"motionRatioThreshold": math.nan},
        {"sceneRatioThreshold": math.inf},
        {"semanticCooldownSeconds": 0},
        {"unknown": 1},
    ],
)
def test_invalid_patch_is_atomic(patch: dict[str, object]) -> None:
    store = DashboardConfigStore()
    before = store.snapshot()

    with pytest.raises(ConfigValidationError):
        store.update(patch)

    assert store.snapshot() == before


def test_to_dict_uses_camel_case_api_names() -> None:
    payload = DashboardConfigStore().snapshot().to_dict()

    assert payload["schemaVersion"] == 1
    assert payload["sampleFps"] == 15
    assert payload["detectionScoreThreshold"] == 0.45
    assert "sample_fps" not in payload
