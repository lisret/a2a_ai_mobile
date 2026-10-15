from __future__ import annotations

import cv2
import numpy as np

from nono_realtime_camera.motion import MotionAnalyzer


def frame_with_square(x: int) -> np.ndarray:
    frame = np.zeros((120, 160, 3), dtype=np.uint8)
    cv2.rectangle(frame, (x, 40), (x + 30, 70), (255, 255, 255), thickness=-1)
    return frame


def test_identical_frames_are_stationary() -> None:
    frame = frame_with_square(40)
    result = MotionAnalyzer().analyze((frame, frame.copy(), frame.copy()))

    assert result.motion == "stationary"
    assert result.scene_changed is False
    assert result.changed_pixel_ratio == 0.0


def test_square_moving_right_is_detected() -> None:
    result = MotionAnalyzer().analyze(
        (frame_with_square(20), frame_with_square(28), frame_with_square(36))
    )

    assert result.motion == "moving_right"
    assert result.changed_pixel_ratio > 0.01


def test_large_global_change_marks_scene_changed() -> None:
    dark = np.zeros((120, 160, 3), dtype=np.uint8)
    bright = np.full((120, 160, 3), 255, dtype=np.uint8)
    result = MotionAnalyzer().analyze((dark, bright))

    assert result.scene_changed is True
    assert result.motion == "moving"


def test_single_frame_has_unknown_motion() -> None:
    result = MotionAnalyzer().analyze((frame_with_square(20),))

    assert result.motion == "unknown"
    assert result.confidence == 0.0
