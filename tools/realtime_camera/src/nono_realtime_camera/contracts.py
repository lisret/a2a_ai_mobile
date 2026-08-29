from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

PresenceChange = Literal["entered", "left", "changed", "none", "unknown"]
Motion = Literal["stationary", "moving", "moving_left", "moving_right", "unknown"]
SummarySource = Literal["fast_path", "last_confirmed_state"]
AnalysisPhase = Literal["idle", "starting", "running", "degraded", "stopped", "failed"]
AnalysisCode = Literal[
    "camera_unavailable",
    "camera_permission_denied",
    "camera_interrupted",
    "fast_analyzer_unavailable",
    "semantic_analyzer_unavailable",
]

_PRESENCE_CHANGES = {"entered", "left", "changed", "none", "unknown"}
_MOTIONS = {"stationary", "moving", "moving_left", "moving_right", "unknown"}
_SUMMARY_SOURCES = {"fast_path", "last_confirmed_state"}
_PHASES = {"idle", "starting", "running", "degraded", "stopped", "failed"}
_CODES = {
    "camera_unavailable",
    "camera_permission_denied",
    "camera_interrupted",
    "fast_analyzer_unavailable",
    "semantic_analyzer_unavailable",
}


def _camel_case(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.capitalize() for part in tail)


def _camel_dict(value: object) -> dict[str, object]:
    return {_camel_case(key): item for key, item in asdict(value).items()}


@dataclass(frozen=True, slots=True)
class RealtimeSecondSummaryV1:
    window_id: int
    started_at_ms: int
    ended_at_ms: int
    emitted_at_ms: int
    sampled_frame_count: int
    target_frame_count: int
    objects: tuple[str, ...]
    presence_change: PresenceChange
    motion: Motion
    scene_changed: bool
    summary: str
    confidence: float
    changed: bool
    stale: bool
    source: SummarySource
    processing_ms: int
    schema_version: int = 1

    def __post_init__(self) -> None:
        if self.schema_version != 1:
            raise ValueError("schema_version must be 1")
        if self.window_id <= 0:
            raise ValueError("window_id must be positive")
        if self.started_at_ms < 0:
            raise ValueError("started_at_ms must be non-negative")
        if self.ended_at_ms <= self.started_at_ms:
            raise ValueError("ended_at_ms must be after started_at_ms")
        if self.emitted_at_ms < self.ended_at_ms:
            raise ValueError("emitted_at_ms must not precede ended_at_ms")
        if self.sampled_frame_count < 0:
            raise ValueError("sampled_frame_count must be non-negative")
        if self.target_frame_count <= 0:
            raise ValueError("target_frame_count must be positive")
        if self.presence_change not in _PRESENCE_CHANGES:
            raise ValueError("presence_change is not supported")
        if self.motion not in _MOTIONS:
            raise ValueError("motion is not supported")
        if not self.summary.strip():
            raise ValueError("summary must not be empty")
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("confidence must be between 0 and 1")
        if self.source not in _SUMMARY_SOURCES:
            raise ValueError("source is not supported")
        if self.processing_ms < 0:
            raise ValueError("processing_ms must be non-negative")

    def to_dict(self) -> dict[str, object]:
        payload = _camel_dict(self)
        payload["objects"] = list(self.objects)
        return payload


@dataclass(frozen=True, slots=True)
class RealtimeSemanticEnrichmentV1:
    window_id: int
    semantic_summary: str
    model_id: str
    processing_ms: int
    source: Literal["semantic_enrichment"] = "semantic_enrichment"
    schema_version: int = 1

    def __post_init__(self) -> None:
        if self.schema_version != 1:
            raise ValueError("schema_version must be 1")
        if self.window_id <= 0:
            raise ValueError("window_id must be positive")
        if not self.semantic_summary.strip():
            raise ValueError("semantic_summary must not be empty")
        if not self.model_id.strip():
            raise ValueError("model_id must not be empty")
        if self.processing_ms < 0:
            raise ValueError("processing_ms must be non-negative")

    def to_dict(self) -> dict[str, object]:
        return _camel_dict(self)


@dataclass(frozen=True, slots=True)
class RealtimeAnalysisStatusV1:
    phase: AnalysisPhase
    occurred_at_ms: int
    code: AnalysisCode | None = None
    schema_version: int = 1

    def __post_init__(self) -> None:
        if self.schema_version != 1:
            raise ValueError("schema_version must be 1")
        if self.phase not in _PHASES:
            raise ValueError("phase is not supported")
        if self.occurred_at_ms < 0:
            raise ValueError("occurred_at_ms must be non-negative")
        if self.code is not None and self.code not in _CODES:
            raise ValueError("code is not supported")

    def to_dict(self) -> dict[str, object]:
        return _camel_dict(self)
