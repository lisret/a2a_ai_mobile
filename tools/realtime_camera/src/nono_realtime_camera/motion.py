from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .contracts import Motion


@dataclass(frozen=True, slots=True)
class MotionResult:
    motion: Motion
    scene_changed: bool
    changed_pixel_ratio: float
    confidence: float


class MotionAnalyzer:
    def __init__(
        self,
        *,
        pixel_threshold: int = 20,
        motion_ratio_threshold: float = 0.01,
        scene_ratio_threshold: float = 0.35,
        direction_threshold_px: float = 0.5,
    ) -> None:
        self._pixel_threshold = pixel_threshold
        self._motion_ratio_threshold = motion_ratio_threshold
        self._scene_ratio_threshold = scene_ratio_threshold
        self._direction_threshold_px = direction_threshold_px

    def analyze(self, frames: tuple[np.ndarray, ...]) -> MotionResult:
        if len(frames) < 2:
            return MotionResult("unknown", False, 0.0, 0.0)

        gray_frames = tuple(self._prepare(frame) for frame in frames)
        change_ratios: list[float] = []
        horizontal_flows: list[float] = []
        for previous, current in zip(gray_frames, gray_frames[1:], strict=False):
            difference = cv2.absdiff(previous, current)
            changed = difference >= self._pixel_threshold
            change_ratios.append(float(np.count_nonzero(changed)) / changed.size)

            flow = cv2.calcOpticalFlowFarneback(
                previous,
                current,
                None,
                0.5,
                3,
                15,
                3,
                5,
                1.2,
                0,
            )
            magnitude = np.linalg.norm(flow, axis=2)
            moving_pixels = magnitude > 0.25
            if np.any(moving_pixels):
                horizontal_flows.append(float(np.median(flow[..., 0][moving_pixels])))

        changed_pixel_ratio = max(change_ratios, default=0.0)
        scene_changed = changed_pixel_ratio >= self._scene_ratio_threshold
        if changed_pixel_ratio < self._motion_ratio_threshold:
            motion: Motion = "stationary"
        elif scene_changed or not horizontal_flows:
            motion = "moving"
        else:
            horizontal_flow = float(np.median(horizontal_flows))
            if horizontal_flow > self._direction_threshold_px:
                motion = "moving_right"
            elif horizontal_flow < -self._direction_threshold_px:
                motion = "moving_left"
            else:
                motion = "moving"

        confidence = min(1.0, len(frames) / 3.0)
        return MotionResult(motion, scene_changed, changed_pixel_ratio, confidence)

    @staticmethod
    def _prepare(frame: np.ndarray) -> np.ndarray:
        if frame.ndim == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        else:
            gray = frame
        if gray.shape[1] > 320:
            scale = 320 / gray.shape[1]
            gray = cv2.resize(gray, (320, max(1, round(gray.shape[0] * scale))))
        return cv2.GaussianBlur(gray, (5, 5), 0)
