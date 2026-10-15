from __future__ import annotations

from types import SimpleNamespace

import numpy as np

from nono_realtime_camera.mediapipe_detector import MediaPipeObjectDetector


class FakeDetector:
    def __init__(self) -> None:
        self.closed = False

    def detect(self, _image: object) -> object:
        return SimpleNamespace(
            detections=[
                SimpleNamespace(
                    categories=[SimpleNamespace(category_name="person", score=0.91)],
                    bounding_box=SimpleNamespace(origin_x=1, origin_y=2, width=3, height=4),
                ),
                SimpleNamespace(
                    categories=[SimpleNamespace(category_name="cat", score=0.2)],
                    bounding_box=SimpleNamespace(origin_x=5, origin_y=6, width=7, height=8),
                ),
            ]
        )

    def close(self) -> None:
        self.closed = True


def test_detector_maps_results_and_filters_score() -> None:
    fake = FakeDetector()
    detector = MediaPipeObjectDetector.from_detector(fake, score_threshold=0.45)

    results = detector.detect(np.zeros((8, 8, 3), dtype=np.uint8))

    assert len(results) == 1
    assert results[0].category == "person"
    assert results[0].score == 0.91
    assert results[0].bbox == (1, 2, 3, 4)


def test_close_releases_mediapipe_detector() -> None:
    fake = FakeDetector()
    detector = MediaPipeObjectDetector.from_detector(fake)

    detector.close()

    assert fake.closed is True
