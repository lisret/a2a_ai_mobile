from __future__ import annotations

import threading
from collections import deque
from typing import Any, Protocol

from .contracts import AnalysisCode, AnalysisPhase, RealtimeSecondSummaryV1
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
}


class DashboardStateStore:
    def __init__(self, *, event_limit: int = 120) -> None:
        if event_limit <= 0:
            raise ValueError("event_limit must be positive")
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

    def update_metrics(self, **metrics: int | float) -> None:
        with self._lock:
            self._metrics.update(metrics)

    def record_event(self, event: SerializableEvent) -> dict[str, Any]:
        payload = event.to_dict()
        with self._lock:
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
            }
