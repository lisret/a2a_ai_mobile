from __future__ import annotations

import threading
import time
from collections import deque

import cv2
import numpy as np

from .dashboard_config import DashboardConfigStore
from .dashboard_runtime import FastOverlay
from .dashboard_state import DashboardStateStore
from .frames import FramePacket
from .latest_value import LatestValueStore


def annotate_frame(
    source: np.ndarray,
    overlay: FastOverlay | None,
    *,
    now_ms: int,
) -> np.ndarray:
    annotated = source.copy()
    if overlay is None:
        return annotated
    age_ms = max(0, now_ms - overlay.result_at_ms)
    if age_ms > 3_000:
        return annotated

    color = (60, 220, 120) if age_ms <= 1_500 else (150, 150, 150)
    height, width = annotated.shape[:2]
    for detection in overlay.detections:
        x, y, box_width, box_height = detection.bbox
        left = min(max(x, 0), width - 1)
        top = min(max(y, 0), height - 1)
        right = min(max(x + box_width, 0), width - 1)
        bottom = min(max(y + box_height, 0), height - 1)
        cv2.rectangle(annotated, (left, top), (right, bottom), color, 2)
        label = f"{detection.category} {detection.score:.2f}"
        cv2.putText(
            annotated,
            label,
            (left, max(12, top - 5)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            color,
            1,
            cv2.LINE_AA,
        )
    status = (
        f"#{overlay.window_id} {overlay.motion} {overlay.processing_ms}ms age={age_ms}ms"
    )
    cv2.putText(
        annotated,
        status,
        (10, max(20, height - 12)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        color,
        1,
        cv2.LINE_AA,
    )
    return annotated


class PreviewEncoder:
    def __init__(
        self,
        *,
        frame_store: LatestValueStore[FramePacket],
        overlay_store: LatestValueStore[FastOverlay],
        jpeg_store: LatestValueStore[bytes],
        config_store: DashboardConfigStore,
        state_store: DashboardStateStore,
        monotonic_ns: object = time.monotonic_ns,
    ) -> None:
        self._frame_store = frame_store
        self._overlay_store = overlay_store
        self.jpeg_store = jpeg_store
        self._config_store = config_store
        self._state_store = state_store
        self._monotonic_ns = monotonic_ns
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._run, name="preview-encoder", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None and self._thread is not threading.current_thread():
            self._thread.join(timeout=2)

    def _run(self) -> None:
        frame_generation = 0
        next_encode_at_ms = 0.0
        encoded_at_ms: deque[int] = deque(maxlen=30)
        while not self._stop_event.is_set():
            frame_generation, packet = self._frame_store.wait_after(
                frame_generation,
                timeout=0.1,
            )
            if packet is None:
                continue
            now_ms = self._monotonic_ns() // 1_000_000  # type: ignore[operator]
            config = self._config_store.snapshot()
            if now_ms < next_encode_at_ms:
                continue
            next_encode_at_ms = now_ms + 1_000 / config.preview_fps
            _, overlay = self._overlay_store.get()
            annotated = annotate_frame(packet.image, overlay, now_ms=now_ms)
            ok, encoded = cv2.imencode(
                ".jpg",
                annotated,
                [cv2.IMWRITE_JPEG_QUALITY, 82],
            )
            if not ok:
                continue
            self.jpeg_store.put(encoded.tobytes())
            encoded_at_ms.append(now_ms)
            if len(encoded_at_ms) >= 2:
                elapsed_ms = encoded_at_ms[-1] - encoded_at_ms[0]
                preview_fps = (
                    (len(encoded_at_ms) - 1) * 1_000 / elapsed_ms if elapsed_ms > 0 else 0.0
                )
                self._state_store.update_metrics(previewFps=round(preview_fps, 2))
