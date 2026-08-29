from __future__ import annotations

import math
import statistics
import threading
from collections import deque
from typing import Any, Protocol

from .contracts import (
    AnalysisCode,
    AnalysisPhase,
    RealtimeSecondSummaryV1,
    RealtimeSemanticEnrichmentV1,
)
from .dashboard_config import DashboardConfigV1


class SerializableEvent(Protocol):
    def to_dict(self) -> dict[str, object]: ...


_DEFAULT_METRICS: dict[str, int | float] = {
    "captureFps": 0.0,
    "sampleFps": 0.0,
    "previewFps": 0.0,
    "sampledFrameCount": 0,
    "processingP50Ms": 0.0,
    "processingP95Ms": 0.0,
    "endToEmitP50Ms": 0.0,
    "endToEmitP95Ms": 0.0,
    "emitIntervalP95Ms": 0.0,
    "staleCount": 0,
    "droppedWindowCount": 0,
    "fastPendingDepth": 0,
    "semanticPendingDepth": 0,
    "frameAgeMs": 0,
    "semanticProcessingP50Ms": 0.0,
    "semanticProcessingP95Ms": 0.0,
    "semanticDroppedCount": 0,
    "semanticStaleCount": 0,
    "semanticSuccessCount": 0,
    "semanticErrorCount": 0,
    "semanticInputFrameCount": 0,
}

_SEMANTIC_MESSAGE_LIMIT = 500


def _nearest_rank_percentile(values: deque[int], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(1, math.ceil(percentile * len(ordered)))
    return float(ordered[rank - 1])


class DashboardStateStore:
    def __init__(self, *, event_limit: int = 120, metric_window: int = 120) -> None:
        if event_limit <= 0:
            raise ValueError("event_limit must be positive")
        if metric_window <= 0:
            raise ValueError("metric_window must be positive")
        self._lock = threading.Lock()
        self._events: deque[dict[str, Any]] = deque(maxlen=event_limit)
        self._sequence = 0
        self._lifecycle: dict[str, object | None] = {
            "phase": "idle",
            "code": None,
            "message": None,
        }
        self._metrics = dict(_DEFAULT_METRICS)
        self._latest_summary: dict[str, object] | None = None
        self._semantic_available = False
        self._semantic_lifecycle: dict[str, object | None] = {
            "phase": "disabled",
            "message": None,
        }
        self._latest_semantic: dict[str, object] | None = None
        self._processing_samples: deque[int] = deque(maxlen=metric_window)
        self._end_to_emit_samples: deque[int] = deque(maxlen=metric_window)
        self._emit_interval_samples: deque[int] = deque(maxlen=metric_window)
        self._semantic_processing_samples: deque[int] = deque(maxlen=metric_window)
        self._last_emitted_at_ms: int | None = None

    def set_lifecycle(
        self,
        phase: AnalysisPhase,
        *,
        code: AnalysisCode | None = None,
        message: str | None = None,
    ) -> None:
        with self._lock:
            self._lifecycle = {"phase": phase, "code": code, "message": message}

    def set_semantic_available(self, available: bool) -> None:
        with self._lock:
            self._semantic_available = available

    def set_semantic_lifecycle(self, phase: str, *, message: str | None = None) -> None:
        with self._lock:
            self._semantic_lifecycle = {"phase": phase, "message": message}

    def update_metrics(self, **metrics: int | float) -> None:
        with self._lock:
            self._metrics.update(metrics)

    def reset_session_metrics(self) -> None:
        with self._lock:
            self._metrics = dict(_DEFAULT_METRICS)
            self._processing_samples.clear()
            self._end_to_emit_samples.clear()
            self._emit_interval_samples.clear()
            self._last_emitted_at_ms = None

    def reset_semantic_session(self) -> None:
        with self._lock:
            for metric in (
                "semanticProcessingP50Ms",
                "semanticProcessingP95Ms",
                "semanticDroppedCount",
                "semanticStaleCount",
                "semanticSuccessCount",
                "semanticErrorCount",
                "semanticInputFrameCount",
                "semanticPendingDepth",
            ):
                self._metrics[metric] = _DEFAULT_METRICS[metric]
            self._semantic_processing_samples.clear()
            self._latest_semantic = None

    def record_analysis_metrics(
        self,
        *,
        processing_ms: int,
        end_to_emit_ms: int,
        emitted_at_ms: int,
    ) -> None:
        with self._lock:
            self._processing_samples.append(processing_ms)
            self._end_to_emit_samples.append(end_to_emit_ms)
            if self._last_emitted_at_ms is not None:
                self._emit_interval_samples.append(emitted_at_ms - self._last_emitted_at_ms)
            self._last_emitted_at_ms = emitted_at_ms
            self._metrics.update(
                processingP50Ms=float(statistics.median(self._processing_samples)),
                processingP95Ms=_nearest_rank_percentile(self._processing_samples, 0.95),
                endToEmitP50Ms=float(statistics.median(self._end_to_emit_samples)),
                endToEmitP95Ms=_nearest_rank_percentile(self._end_to_emit_samples, 0.95),
                emitIntervalP95Ms=_nearest_rank_percentile(
                    self._emit_interval_samples, 0.95
                ),
            )

    def record_semantic_result(
        self, enrichment: RealtimeSemanticEnrichmentV1, *, input_frames: int
    ) -> None:
        payload = enrichment.to_dict()
        with self._lock:
            self._record_event_locked(enrichment, payload)
            self._semantic_processing_samples.append(enrichment.processing_ms)
            self._latest_semantic = dict(payload)
            self._metrics.update(
                semanticProcessingP50Ms=float(
                    statistics.median(self._semantic_processing_samples)
                ),
                semanticProcessingP95Ms=_nearest_rank_percentile(
                    self._semantic_processing_samples, 0.95
                ),
                semanticSuccessCount=self._metrics["semanticSuccessCount"] + 1,
                semanticInputFrameCount=(
                    self._metrics["semanticInputFrameCount"] + input_frames
                ),
            )

    def record_semantic_drop(self) -> None:
        with self._lock:
            self._metrics["semanticDroppedCount"] += 1

    def record_semantic_stale(self) -> None:
        with self._lock:
            self._metrics["semanticStaleCount"] += 1

    def record_semantic_error(self, message: str) -> None:
        with self._lock:
            self._metrics["semanticErrorCount"] += 1
            self._semantic_lifecycle = {
                "phase": "degraded",
                "message": message[:_SEMANTIC_MESSAGE_LIMIT],
            }

    def record_event(self, event: SerializableEvent) -> dict[str, Any]:
        payload = event.to_dict()
        with self._lock:
            return self._record_event_locked(event, payload)

    def _record_event_locked(
        self, event: SerializableEvent, payload: dict[str, object]
    ) -> dict[str, Any]:
        self._sequence += 1
        row: dict[str, Any] = {"sequence": self._sequence, **payload}
        self._events.append(row)
        if isinstance(event, RealtimeSecondSummaryV1):
            self._latest_summary = dict(payload)
        return dict(row)

    def events_after(self, sequence: int) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(event) for event in self._events if event["sequence"] > sequence]

    def snapshot(self, config: DashboardConfigV1) -> dict[str, object]:
        with self._lock:
            return {
                "lifecycle": dict(self._lifecycle),
                "metrics": dict(self._metrics),
                "latestSummary": (
                    dict(self._latest_summary) if self._latest_summary is not None else None
                ),
                "config": config.to_dict(),
                "lastSequence": self._sequence,
                "semanticAvailable": self._semantic_available,
                "semanticLifecycle": dict(self._semantic_lifecycle),
                "latestSemantic": (
                    dict(self._latest_semantic)
                    if self._latest_semantic is not None
                    else None
                ),
            }
