from __future__ import annotations

from nono_realtime_camera.mediapipe_detector import DetectedObject
from nono_realtime_camera.tracking import ObjectStateTracker


def detection(category: str) -> DetectedObject:
    return DetectedObject(category=category, score=0.9, bbox=(10, 20, 30, 40))


def test_tracker_reports_entered_then_stable() -> None:
    tracker = ObjectStateTracker()

    first = tracker.observe((detection("person"),))
    second = tracker.observe((detection("person"),))

    assert first == (("person",), "entered")
    assert second == (("person",), "none")


def test_tracker_reports_left() -> None:
    tracker = ObjectStateTracker()
    tracker.observe((detection("person"),))

    assert tracker.observe(()) == ((), "left")


def test_tracker_reports_changed_categories() -> None:
    tracker = ObjectStateTracker()
    tracker.observe((detection("person"),))

    assert tracker.observe((detection("cup"),)) == (("cup",), "changed")
