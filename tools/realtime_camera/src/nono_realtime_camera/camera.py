from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

import cv2

from .frames import FramePacket


class CameraUnavailableError(RuntimeError):
    pass


class CameraInterruptedError(RuntimeError):
    pass


class OpenCVCameraSource:
    def __init__(
        self,
        *,
        camera_index: int = 0,
        width: int = 1280,
        height: int = 720,
        target_fps: int = 30,
        capture_factory: Callable[[int, int], Any] = cv2.VideoCapture,
        monotonic_ns: Callable[[], int] = time.monotonic_ns,
    ) -> None:
        self.camera_index = camera_index
        self._width = width
        self._height = height
        self._target_fps = target_fps
        self._capture_factory = capture_factory
        self._monotonic_ns = monotonic_ns
        self._capture: Any | None = None
        self._frame_id = 0

    def open(self) -> None:
        if self._capture is not None:
            return
        capture = self._capture_factory(self.camera_index, cv2.CAP_AVFOUNDATION)
        if not capture.isOpened():
            capture.release()
            raise CameraUnavailableError(f"camera index {self.camera_index} is unavailable")
        capture.set(cv2.CAP_PROP_FRAME_WIDTH, self._width)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, self._height)
        capture.set(cv2.CAP_PROP_FPS, self._target_fps)
        self._capture = capture
        self._frame_id = 0

    def read(self) -> FramePacket:
        if self._capture is None:
            raise RuntimeError("camera is not open")
        ok, image = self._capture.read()
        if not ok or image is None:
            raise CameraInterruptedError(f"camera index {self.camera_index} failed to read a frame")
        self._frame_id += 1
        return FramePacket(
            frame_id=self._frame_id,
            captured_at_ms=self._monotonic_ns() // 1_000_000,
            image=image,
        )

    def close(self) -> None:
        if self._capture is None:
            return
        self._capture.release()
        self._capture = None

    def __enter__(self) -> OpenCVCameraSource:
        self.open()
        return self

    def __exit__(self, _exc_type: object, _exc: object, _traceback: object) -> None:
        self.close()
