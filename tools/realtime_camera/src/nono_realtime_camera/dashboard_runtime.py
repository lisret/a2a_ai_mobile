from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from .aggregation import build_fast_summary
from .camera import CameraInterruptedError
from .contracts import RealtimeSecondSummaryV1
from .dashboard_config import DashboardConfigStore, DashboardConfigV1
from .dashboard_state import DashboardStateStore
from .frames import FramePacket, FrameWindow
from .latest_value import LatestValueStore
from .mediapipe_detector import DetectedObject
from .motion import MotionAnalyzer
from .semantic_scheduler import SemanticTriggerPolicy, select_semantic_frames
from .tracking import ObjectStateTracker
from .windowing import OneSecondRingBuffer

_STATIC_HEARTBEAT_MS = 10_000


class CameraSource(Protocol):
    def open(self) -> None: ...

    def read(self) -> FramePacket: ...

    def close(self) -> None: ...


class ObjectDetector(Protocol):
    def detect(self, image: object) -> tuple[DetectedObject, ...]: ...

    def close(self) -> None: ...


class SemanticWorkerPort(Protocol):
    @property
    def available(self) -> bool: ...

    def submit(
        self,
        *,
        window_id: int,
        frames: tuple[FramePacket, ...],
        submitted_at_ms: int,
    ) -> int: ...

    def clear_pending(self) -> None: ...

    def close(self) -> None: ...


class VlmSupervisorPort(Protocol):
    def restart(self) -> None: ...

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
        semantic_worker: SemanticWorkerPort | None = None,
        vlm_supervisor: VlmSupervisorPort | None = None,
        config_store: DashboardConfigStore | None = None,
        state_store: DashboardStateStore | None = None,
        monotonic_ns: Callable[[], int] = time.monotonic_ns,
        window_ms: int = 1_000,
    ) -> None:
        if window_ms <= 0:
            raise ValueError("window_ms must be positive")
        self._camera_factory = camera_factory
        self._detector = detector
        self._semantic_worker = semantic_worker
        self._vlm_supervisor = vlm_supervisor
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
        self._lifecycle_condition = threading.Condition()
        self._stop_event = threading.Event()
        self._camera: CameraSource | None = None
        self._capture_thread: threading.Thread | None = None
        self._analysis_thread: threading.Thread | None = None
        self._running = False
        self._stopping = False
        self._closing = False
        self._closed = False
        self._tracker = ObjectStateTracker()
        self._window_id = 0
        initial_cooldown_ms = (
            self.config_store.snapshot().semantic_cooldown_seconds * 1_000
        )
        self._semantic_policy = SemanticTriggerPolicy(
            cooldown_ms=initial_cooldown_ms,
            static_heartbeat_ms=_STATIC_HEARTBEAT_MS,
        )
        self._semantic_admission_lock = threading.Lock()
        self._semantic_accepting = False
        self._restart_lock = threading.Lock()

    @property
    def is_running(self) -> bool:
        with self._lifecycle_condition:
            return self._running

    def start(self) -> None:
        with self._lifecycle_condition:
            self._lifecycle_condition.wait_for(lambda: not self._stopping)
            if self._closing or self._closed:
                raise RuntimeError("dashboard runtime is closed")
            if self._running:
                return
            self._running = True
            stop_event = threading.Event()
            camera = self._camera_factory()
            self._stop_event = stop_event
            self._camera = camera
            self._tracker = ObjectStateTracker()
            self.state_store.reset_session_metrics()
            self.state_store.set_lifecycle("starting")
            self._analysis_thread = threading.Thread(
                target=self._analysis_loop,
                args=(stop_event,),
                name="camera-analysis",
                daemon=True,
            )
            self._capture_thread = threading.Thread(
                target=self._capture_loop,
                args=(camera, stop_event),
                name="camera-capture",
                daemon=True,
            )
            with self._semantic_admission_lock:
                self._semantic_accepting = True
            self._capture_thread.start()
            self._analysis_thread.start()
            self._preview_encoder.start()

    def stop(self) -> None:
        with self._lifecycle_condition:
            if self._stopping:
                self._lifecycle_condition.wait_for(lambda: not self._stopping)
                return
            if not self._running:
                return
            self._stopping = True
            self._running = False
            stop_event = self._stop_event
            stop_event.set()
            camera = self._camera
            capture_thread = self._capture_thread
            analysis_thread = self._analysis_thread
        try:
            with self._semantic_admission_lock:
                self._semantic_accepting = False
                if self._semantic_worker is not None:
                    self._semantic_worker.clear_pending()
            self._preview_encoder.stop()
            if camera is not None:
                camera.close()
            for thread in (capture_thread, analysis_thread):
                if thread is not None and thread is not threading.current_thread():
                    thread.join()
            self.state_store.set_lifecycle("stopped")
        finally:
            with self._lifecycle_condition:
                self._stopping = False
                self._lifecycle_condition.notify_all()

    def restart_camera(self) -> None:
        self.stop()
        self.start()

    def restart_vlm(self) -> None:
        with self._restart_lock:
            with self._lifecycle_condition:
                if self._closing or self._closed:
                    raise RuntimeError("dashboard runtime is closed")
            with self._semantic_admission_lock:
                self._semantic_accepting = False
                if self._semantic_worker is not None:
                    self._semantic_worker.clear_pending()
            if self._vlm_supervisor is not None:
                self._vlm_supervisor.restart()
            with self._lifecycle_condition:
                if (
                    self._running
                    and not self._stopping
                    and not self._closing
                    and not self._closed
                ):
                    with self._semantic_admission_lock:
                        self._semantic_accepting = True

    def close(self) -> None:
        with self._lifecycle_condition:
            if self._closed:
                return
            if self._closing:
                self._lifecycle_condition.wait_for(lambda: self._closed)
                return
            self._closing = True
        cleanup_errors: list[Exception] = []

        def attempt_cleanup(action: Callable[[], None]) -> None:
            try:
                action()
            except Exception as error:
                cleanup_errors.append(error)

        try:
            attempt_cleanup(self.stop)
            with self._restart_lock:
                if self._semantic_worker is not None:
                    attempt_cleanup(self._semantic_worker.close)
                if self._vlm_supervisor is not None:
                    attempt_cleanup(self._vlm_supervisor.close)
            if self._detector is not None:
                attempt_cleanup(self._detector.close)
            attempt_cleanup(self.latest_frame_store.close)
            attempt_cleanup(self.latest_overlay_store.close)
            attempt_cleanup(self.latest_jpeg_store.close)
        finally:
            with self._lifecycle_condition:
                self._closed = True
                self._closing = False
                self._lifecycle_condition.notify_all()
        if len(cleanup_errors) == 1:
            raise cleanup_errors[0]
        if cleanup_errors:
            raise ExceptionGroup("dashboard runtime cleanup failed", cleanup_errors)

    def _capture_loop(
        self,
        camera: CameraSource,
        stop_event: threading.Event,
    ) -> None:
        timestamps: deque[int] = deque(maxlen=60)
        try:
            camera.open()
            self.state_store.set_lifecycle("running")
            while not stop_event.is_set():
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
            if not stop_event.is_set():
                self.state_store.set_lifecycle(
                    "failed", code="camera_interrupted", message=str(exc)
                )
        except Exception as exc:
            if not stop_event.is_set():
                self.state_store.set_lifecycle(
                    "failed", code="camera_unavailable", message=str(exc)
                )
        finally:
            camera.close()

    def _analysis_loop(self, stop_event: threading.Event) -> None:
        generation, _ = self.latest_frame_store.get()
        buffer = OneSecondRingBuffer(retention_ms=self._window_ms)
        window_started_at_ms: int | None = None
        window_ended_at_ms: int | None = None
        next_sample_at_ms: float | None = None
        while not stop_event.is_set():
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

            self._window_id += 1
            window = buffer.freeze_window(
                window_id=self._window_id,
                started_at_ms=window_started_at_ms,
                ended_at_ms=window_ended_at_ms,
            )
            self._process_window(window, config)
            window_started_at_ms = window_ended_at_ms
            window_ended_at_ms += self._window_ms

    def _process_window(self, window: FrameWindow, config: DashboardConfigV1) -> None:
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
        self._admit_semantic(window, summary, emitted_at_ms)

    def _admit_semantic(
        self,
        window: FrameWindow,
        summary: RealtimeSecondSummaryV1,
        submitted_at_ms: int,
    ) -> None:
        worker = self._semantic_worker
        if worker is None:
            return
        with self._semantic_admission_lock:
            if not self._semantic_accepting:
                return
            config = self.config_store.snapshot()
            if not config.semantic_enabled or not worker.available:
                return
            self._semantic_policy.cooldown_ms = (
                config.semantic_cooldown_seconds * 1_000
            )
            if not self._semantic_policy.should_submit(
                summary,
                now_ms=submitted_at_ms,
            ):
                return
            frames = select_semantic_frames(window, summary)
            if not frames:
                return
            worker.submit(
                window_id=window.window_id,
                frames=frames,
                submitted_at_ms=submitted_at_ms,
            )
            self._semantic_policy.mark_submitted(submitted_at_ms)
