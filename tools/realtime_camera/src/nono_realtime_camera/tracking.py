from __future__ import annotations

from collections import Counter

from .contracts import PresenceChange
from .mediapipe_detector import DetectedObject


class ObjectStateTracker:
    def __init__(self) -> None:
        self._previous: Counter[str] = Counter()

    def observe(
        self,
        detections: tuple[DetectedObject, ...],
    ) -> tuple[tuple[str, ...], PresenceChange]:
        current = Counter(detection.category for detection in detections)
        if current == self._previous:
            change: PresenceChange = "none"
        elif not self._previous and current:
            change = "entered"
        elif self._previous and not current:
            change = "left"
        else:
            change = "changed"
        self._previous = current
        return tuple(sorted(current.elements())), change
