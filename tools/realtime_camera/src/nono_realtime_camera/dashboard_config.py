from __future__ import annotations

import math
import threading
from dataclasses import asdict, dataclass, replace


class ConfigValidationError(ValueError):
    pass


_API_TO_FIELD = {
    "analysisEnabled": "analysis_enabled",
    "detectorEnabled": "detector_enabled",
    "semanticEnabled": "semantic_enabled",
    "sampleFps": "sample_fps",
    "previewFps": "preview_fps",
    "detectionScoreThreshold": "detection_score_threshold",
    "motionPixelThreshold": "motion_pixel_threshold",
    "motionRatioThreshold": "motion_ratio_threshold",
    "sceneRatioThreshold": "scene_ratio_threshold",
    "semanticCooldownSeconds": "semantic_cooldown_seconds",
    "semanticDynamicFrameCount": "semantic_dynamic_frame_count",
}
_FIELD_TO_API = {field: api for api, field in _API_TO_FIELD.items()}
_FIELD_TO_API.update({"revision": "revision", "schema_version": "schemaVersion"})


@dataclass(frozen=True, slots=True)
class DashboardConfigV1:
    revision: int = 1
    analysis_enabled: bool = True
    detector_enabled: bool = True
    semantic_enabled: bool = False
    sample_fps: int = 15
    preview_fps: int = 12
    detection_score_threshold: float = 0.45
    motion_pixel_threshold: int = 20
    motion_ratio_threshold: float = 0.01
    scene_ratio_threshold: float = 0.35
    semantic_cooldown_seconds: int = 10
    semantic_dynamic_frame_count: int = 1
    schema_version: int = 1

    def __post_init__(self) -> None:
        _validate_int("revision", self.revision, 1, 2**63 - 1)
        _validate_bool("analysis_enabled", self.analysis_enabled)
        _validate_bool("detector_enabled", self.detector_enabled)
        _validate_bool("semantic_enabled", self.semantic_enabled)
        _validate_int("sample_fps", self.sample_fps, 2, 24)
        _validate_int("preview_fps", self.preview_fps, 2, 20)
        _validate_float("detection_score_threshold", self.detection_score_threshold, 0.15, 0.90)
        _validate_int("motion_pixel_threshold", self.motion_pixel_threshold, 5, 80)
        _validate_float("motion_ratio_threshold", self.motion_ratio_threshold, 0.001, 0.20)
        _validate_float("scene_ratio_threshold", self.scene_ratio_threshold, 0.05, 0.95)
        _validate_int("semantic_cooldown_seconds", self.semantic_cooldown_seconds, 1, 60)
        _validate_int("semantic_dynamic_frame_count", self.semantic_dynamic_frame_count, 1, 4)
        if self.schema_version != 1:
            raise ConfigValidationError("schema_version must be 1")

    def to_dict(self) -> dict[str, object]:
        return {_FIELD_TO_API[key]: value for key, value in asdict(self).items()}


class DashboardConfigStore:
    def __init__(self, initial: DashboardConfigV1 | None = None) -> None:
        self._lock = threading.Lock()
        self._config = initial or DashboardConfigV1()

    def snapshot(self) -> DashboardConfigV1:
        with self._lock:
            return self._config

    def update(self, patch: dict[str, object]) -> DashboardConfigV1:
        if not isinstance(patch, dict) or not patch:
            raise ConfigValidationError("config patch must be a non-empty object")
        unknown = set(patch) - set(_API_TO_FIELD)
        if unknown:
            raise ConfigValidationError(f"unknown config field: {sorted(unknown)[0]}")
        changes = {_API_TO_FIELD[key]: value for key, value in patch.items()}
        with self._lock:
            candidate = replace(self._config, revision=self._config.revision + 1, **changes)
            self._config = candidate
            return candidate


def _validate_bool(name: str, value: object) -> None:
    if not isinstance(value, bool):
        raise ConfigValidationError(f"{name} must be boolean")


def _validate_int(name: str, value: object, minimum: int, maximum: int) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ConfigValidationError(f"{name} must be an integer between {minimum} and {maximum}")


def _validate_float(name: str, value: object, minimum: float, maximum: float) -> None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise ConfigValidationError(f"{name} must be numeric")
    numeric = float(value)
    if not math.isfinite(numeric) or not minimum <= numeric <= maximum:
        raise ConfigValidationError(f"{name} must be between {minimum} and {maximum}")
