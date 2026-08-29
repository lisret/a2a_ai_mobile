from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from .aggregation import build_fast_summary
from .camera import CameraInterruptedError
from .dashboard_config import DashboardConfigStore, DashboardConfigV1
from .dashboard_state import DashboardStateStore
from .frames import FramePacket
from .latest_value import LatestValueStore
from .mediapipe_detector import DetectedObject
from .motion import MotionAnalyzer
from .tracking import ObjectStateTracker
from .windowing import OneSecondRingBuffer


class CameraSource(Protocol):
    def open(self) -> None: ...

    def read(self) -> FramePacket: ...

    def close(self) -> None: ...


class ObjectDetector(Protocol):
    def detect(self, image: object) -> tuple[DetectedObject, ...]: ...

    def close(self) -> None: ...


@dataclass(frozen=True, slots=True)
class FastOverlay:
    result_at_ms: int
    detections: tuple[DetectedObject, ...]
    window_id: int
    motion: str
    processing_ms: int
    summary: str


class DashboardRuntime:
    def __init__(
        self,
        *,
        camera_factory: Callable[[], CameraSource],
        detector: ObjectDetector | None = None,
        config_store: DashboardConfigStore | None = None,
        state_store: DashboardStateStore | None = None,
        monotonic_ns: Callable[[], int] = time.monotonic_ns,
        window_ms: int = 1_000,
    ) -> None:
        if window_ms <= 0:
            raise ValueError("window_ms must be positive")
        self._camera_factory = camera_factory
        self._detector = detector
        self.config_store = config_store or DashboardConfigStore()
        self.state_store = state_store or DashboardStateStore()
        self.latest_frame_store: LatestValueStore[FramePacket] = LatestValueStore()
        self.latest_overlay_store: LatestValueStore[FastOverlay] = LatestValueStore()
        self.latest_jpeg_store: LatestValueStore[bytes] = LatestValueStore()
        from .preview import PreviewEncoder

        self._preview_encoder = PreviewEncoder(
            frame_store=self.latest_frame_store,
            overlay_store=self.latest_overlay_store,
            jpeg_store=self.latest_jpeg_store,
            config_store=self.config_store,
            state_store=self.state_store,
            monotonic_ns=monotonic_ns,
        )
        self._monotonic_ns = monotonic_ns
        self._window_ms = window_ms
        self._lifecycle_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._camera: CameraSource | None = None
        self._capture_thread: threading.Thread | None = None
        self._analysis_thread: threading.Thread | None = None
        self._running = False
        self._closed = False
        self._tracker = ObjectStateTracker()

    @property
    def is_running(self) -> bool:
        with self._lifecycle_lock:
            return self._running

    def start(self) -> None:
        with self._lifecycle_lock:
            if self._closed:
                raise RuntimeError("dashboard runtime is closed")
            if self._running:
                return
            self._running = True
            self._stop_event = threading.Event()
            self._camera = self._camera_factory()
            self.state_store.set_lifecycle("starting")
            self._capture_thread = threading.Thread(
                target=self._capture_loop,
                name="camera-capture",
                daemon=True,
            )
            self._analysis_thread = threading.Thread(
                target=self._analysis_loop,
                name="camera-analysis",
                daemon=True,
            )
            self._capture_thread.start()
            self._analysis_thread.start()
            self._preview_encoder.start()

    def stop(self) -> None:
        with self._lifecycle_lock:
            if not self._running:
                return
            self._running = False
            self._stop_event.set()
            camera = self._camera
            capture_thread = self._capture_thread
            analysis_thread = self._analysis_thread
        self._preview_encoder.stop()
        if camera is not None:
            camera.close()
        for thread in (capture_thread, analysis_thread):
            if thread is not None and thread is not threading.current_thread():
                thread.join(timeout=3)
        self.state_store.set_lifecycle("stopped")

    def restart_camera(self) -> None:
        self.stop()
        self.start()

    def close(self) -> None:
        with self._lifecycle_lock:
            if self._closed:
                return
        self.stop()
        with self._lifecycle_lock:
            self._closed = True
        if self._detector is not None:
            self._detector.close()
        self.latest_frame_store.close()
        self.latest_overlay_store.close()
        self.latest_jpeg_store.close()

    def _capture_loop(self) -> None:
        camera = self._camera
        assert camera is not None
        timestamps: deque[int] = deque(maxlen=60)
        try:
            camera.open()
            self.state_store.set_lifecycle("running")
            while not self._stop_event.is_set():
                frame = camera.read()
                self.latest_frame_store.put(frame)
                timestamps.append(frame.captured_at_ms)
                if len(timestamps) >= 2:
                    elapsed_ms = timestamps[-1] - timestamps[0]
                    capture_fps = (
                        (len(timestamps) - 1) * 1_000 / elapsed_ms if elapsed_ms > 0 else 0.0
                    )
                    self.state_store.update_metrics(captureFps=round(capture_fps, 2))
        except CameraInterruptedError as exc:
            if not self._stop_event.is_set():
                self.state_store.set_lifecycle(
                    "failed", code="camera_interrupted", message=str(exc)
                )
        except Exception as exc:
            if not self._stop_event.is_set():
                self.state_store.set_lifecycle(
                    "failed", code="camera_unavailable", message=str(exc)
                )
        finally:
            camera.close()

    def _analysis_loop(self) -> None:
        generation = 0
        buffer = OneSecondRingBuffer(retention_ms=self._window_ms)
        window_started_at_ms: int | None = None
        window_ended_at_ms: int | None = None
        next_sample_at_ms: float | None = None
        window_id = 0

        while not self._stop_event.is_set():
            generation, frame = self.latest_frame_store.wait_after(generation, timeout=0.1)
            if frame is None:
                continue
            if window_started_at_ms is None:
                window_started_at_ms = frame.captured_at_ms
                window_ended_at_ms = window_started_at_ms + self._window_ms
                next_sample_at_ms = float(window_started_at_ms)

            config = self.config_store.snapshot()
            assert next_sample_at_ms is not None
            assert window_ended_at_ms is not None
            if config.analysis_enabled and frame.captured_at_ms >= next_sample_at_ms:
                buffer.add(frame)
                sample_interval_ms = 1_000 / config.sample_fps
                while next_sample_at_ms <= frame.captured_at_ms:
                    next_sample_at_ms += sample_interval_ms

            if frame.captured_at_ms < window_ended_at_ms:
                continue

            window_id += 1
            window = buffer.freeze_window(
                window_id=window_id,
                started_at_ms=window_started_at_ms,
                ended_at_ms=window_ended_at_ms,
            )
            self._process_window(window, config)
            window_started_at_ms = window_ended_at_ms
            window_ended_at_ms += self._window_ms

    def _process_window(self, window: object, config: DashboardConfigV1) -> None:
        from .frames import FrameWindow

        assert isinstance(window, FrameWindow)
        started_ns = self._monotonic_ns()
        motion = MotionAnalyzer(
            pixel_threshold=config.motion_pixel_threshold,
            motion_ratio_threshold=config.motion_ratio_threshold,
            scene_ratio_threshold=config.scene_ratio_threshold,
        ).analyze(tuple(frame.image for frame in window.frames))
        detections: tuple[DetectedObject, ...] = ()
        if config.detector_enabled and self._detector is not None and window.frames:
            detected = self._detector.detect(window.frames[-1].image)
            detections = tuple(
                item for item in detected if item.score >= config.detection_score_threshold
            )
        objects, presence_change = self._tracker.observe(detections)
        finished_ns = self._monotonic_ns()
        processing_ms = (finished_ns - started_ns) // 1_000_000
        emitted_at_ms = finished_ns // 1_000_000
        summary = build_fast_summary(
            window=window,
            motion=motion,
            emitted_at_ms=emitted_at_ms,
            processing_ms=processing_ms,
            target_frame_count=config.sample_fps,
            objects=objects,
            presence_change=presence_change,
        )
        self.state_store.record_event(summary)
        end_to_emit_ms = emitted_at_ms - window.ended_at_ms
        self.state_store.record_analysis_metrics(
            processing_ms=processing_ms,
            end_to_emit_ms=end_to_emit_ms,
            emitted_at_ms=emitted_at_ms,
        )
        self.state_store.update_metrics(
            sampleFps=window.sampled_frame_count * 1_000 / self._window_ms,
            sampledFrameCount=window.sampled_frame_count,
            fastPendingDepth=0,
        )
        self.latest_overlay_store.put(
            FastOverlay(
                result_at_ms=emitted_at_ms,
                detections=detections,
                window_id=window.window_id,
                motion=motion.motion,
                processing_ms=processing_ms,
                summary=summary.summary,
            )
        )
