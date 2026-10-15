from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision


@dataclass(frozen=True, slots=True)
class DetectedObject:
    category: str
    score: float
    bbox: tuple[int, int, int, int]


class MediaPipeObjectDetector:
    def __init__(self, model_path: Path, *, score_threshold: float = 0.45) -> None:
        if not model_path.is_file():
            raise FileNotFoundError(model_path)
        options = vision.ObjectDetectorOptions(
            base_options=python.BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.IMAGE,
            score_threshold=score_threshold,
            max_results=10,
        )
        self._detector: Any | None = vision.ObjectDetector.create_from_options(options)
        self._score_threshold = score_threshold

    @classmethod
    def from_detector(
        cls,
        detector: Any,
        *,
        score_threshold: float = 0.45,
    ) -> MediaPipeObjectDetector:
        instance = cls.__new__(cls)
        instance._detector = detector
        instance._score_threshold = score_threshold
        return instance

    def detect(self, bgr_image: Any) -> tuple[DetectedObject, ...]:
        if self._detector is None:
            raise RuntimeError("detector is closed")
        rgb_image = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)
        media_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_image)
        result = self._detector.detect(media_image)
        detections: list[DetectedObject] = []
        for detection in result.detections:
            if not detection.categories:
                continue
            category = detection.categories[0]
            if category.score < self._score_threshold or not category.category_name:
                continue
            box = detection.bounding_box
            detections.append(
                DetectedObject(
                    category=category.category_name,
                    score=float(category.score),
                    bbox=(box.origin_x, box.origin_y, box.width, box.height),
                )
            )
        return tuple(detections)

    def close(self) -> None:
        if self._detector is None:
            return
        self._detector.close()
        self._detector = None
