from __future__ import annotations

import time
from collections.abc import Callable
from typing import Protocol

from .aggregation import build_fast_summary
from .contracts import RealtimeAnalysisStatusV1, RealtimeSecondSummaryV1
from .frames import FramePacket
from .motion import MotionAnalyzer
from .tracking import ObjectStateTracker
from .windowing import OneSecondRingBuffer


class CameraSource(Protocol):
    def open(self) -> None: ...

    def read(self) -> FramePacket: ...

    def close(self) -> None: ...


RuntimeEvent = RealtimeAnalysisStatusV1 | RealtimeSecondSummaryV1


class ObjectDetector(Protocol):
    def detect(self, image: object) -> tuple[object, ...]: ...

    def close(self) -> None: ...


class RealtimeCameraRuntime:
    def __init__(
        self,
        *,
        camera: CameraSource,
        analyzer: MotionAnalyzer,
        detector: ObjectDetector | None = None,
        emit: Callable[[RuntimeEvent], None],
        sample_fps: int = 8,
        monotonic_ns: Callable[[], int] = time.monotonic_ns,
    ) -> None:
        if sample_fps <= 0:
            raise ValueError("sample_fps must be positive")
        self._camera = camera
        self._analyzer = analyzer
        self._detector = detector
        self._object_tracker = ObjectStateTracker()
        self._emit = emit
        self._sample_fps = sample_fps
        self._sample_interval_ms = 1_000 / sample_fps
        self._monotonic_ns = monotonic_ns

    def run(self, *, max_windows: int | None = None) -> None:
        if max_windows is not None and max_windows <= 0:
            raise ValueError("max_windows must be positive")

        last_timestamp_ms = self._monotonic_ns() // 1_000_000
        self._emit(RealtimeAnalysisStatusV1("starting", last_timestamp_ms))
        emitted_windows = 0
        camera_opened = False
        try:
            self._camera.open()
            camera_opened = True
            first_frame = self._camera.read()
            last_timestamp_ms = first_frame.captured_at_ms
            window_started_at_ms = first_frame.captured_at_ms
            window_ended_at_ms = window_started_at_ms + 1_000
            next_sample_at_ms = float(window_started_at_ms)
            buffer = OneSecondRingBuffer(retention_ms=1_000)
            self._emit(RealtimeAnalysisStatusV1("running", last_timestamp_ms))
            current_frame = first_frame

            while True:
                last_timestamp_ms = current_frame.captured_at_ms
                if current_frame.captured_at_ms >= next_sample_at_ms:
                    buffer.add(current_frame)
                    while next_sample_at_ms <= current_frame.captured_at_ms:
                        next_sample_at_ms += self._sample_interval_ms

                if current_frame.captured_at_ms >= window_ended_at_ms:
                    window = buffer.freeze_window(
                        window_id=emitted_windows + 1,
                        started_at_ms=window_started_at_ms,
                        ended_at_ms=window_ended_at_ms,
                    )
                    processing_started_ns = self._monotonic_ns()
                    motion = self._analyzer.analyze(
                        tuple(frame.image for frame in window.frames)
                    )
                    if self._detector is not None and window.frames:
                        detections = self._detector.detect(window.frames[-1].image)
                        objects, presence_change = self._object_tracker.observe(detections)  # type: ignore[arg-type]
                    else:
                        objects, presence_change = (), "none"
                    processing_finished_ns = self._monotonic_ns()
                    processing_ms = (processing_finished_ns - processing_started_ns) // 1_000_000
                    self._emit(
                        build_fast_summary(
                            window=window,
                            motion=motion,
                            emitted_at_ms=processing_finished_ns // 1_000_000,
                            processing_ms=processing_ms,
                            target_frame_count=self._sample_fps,
                            objects=objects,
                            presence_change=presence_change,
                        )
                    )
                    emitted_windows += 1
                    if max_windows is not None and emitted_windows >= max_windows:
                        break
                    window_started_at_ms = window_ended_at_ms
                    window_ended_at_ms += 1_000

                current_frame = self._camera.read()
        finally:
            self._camera.close()
            if self._detector is not None:
                self._detector.close()
            if camera_opened:
                self._emit(RealtimeAnalysisStatusV1("stopped", last_timestamp_ms))
