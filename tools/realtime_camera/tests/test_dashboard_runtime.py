from __future__ import annotations

import threading
import time
from collections.abc import Callable

import numpy as np
import pytest

from nono_realtime_camera.camera import CameraInterruptedError
from nono_realtime_camera.dashboard_config import DashboardConfigStore, DashboardConfigV1
from nono_realtime_camera.dashboard_runtime import DashboardRuntime
from nono_realtime_camera.dashboard_state import DashboardStateStore
from nono_realtime_camera.frames import FramePacket
from nono_realtime_camera.mediapipe_detector import DetectedObject
from nono_realtime_camera.semantic_worker import SemanticWorker
from nono_realtime_camera.vlm_client import VlmRequestError, VlmResult


class ContinuousFakeCamera:
    def __init__(self, *, frame_period_seconds: float = 0.005) -> None:
        self.frame_period_seconds = frame_period_seconds
        self.read_count = 0
        self.closed = False

    def open(self) -> None:
        self.closed = False

    def read(self) -> FramePacket:
        time.sleep(self.frame_period_seconds)
        self.read_count += 1
        image = np.zeros((32, 32, 3), dtype=np.uint8)
        return FramePacket(
            frame_id=self.read_count,
            captured_at_ms=time.monotonic_ns() // 1_000_000,
            image=image,
        )

    def close(self) -> None:
        self.closed = True


class BlockingCloseCamera(ContinuousFakeCamera):
    def __init__(self) -> None:
        super().__init__()
        self.close_started = threading.Event()
        self.close_release = threading.Event()

    def close(self) -> None:
        self.close_started.set()
        assert self.close_release.wait(timeout=2)
        super().close()


class BlockingDetector:
    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = threading.Event()
        self.closed = False

    def detect(self, _image: np.ndarray) -> tuple[DetectedObject, ...]:
        self.started.set()
        self.release.wait(timeout=2)
        return (DetectedObject("person", 0.9, (1, 1, 10, 10)),)

    def close(self) -> None:
        self.closed = True


class ArmableDetector:
    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = threading.Event()
        self._lock = threading.Lock()
        self._armed = False
        self._detect_count = 0

    def arm(self) -> None:
        with self._lock:
            self.started.clear()
            self.release.clear()
            self._armed = True

    def detect(self, _image: np.ndarray) -> tuple[DetectedObject, ...]:
        with self._lock:
            should_block = self._armed
            self._armed = False
            self._detect_count += 1
            category = "person" if self._detect_count % 2 else "bottle"
        if should_block:
            self.started.set()
            assert self.release.wait(timeout=2)
        return (DetectedObject(category, 0.9, (1, 1, 10, 10)),)

    def close(self) -> None:
        self.release.set()


class InterruptedCamera(ContinuousFakeCamera):
    def read(self) -> FramePacket:
        raise CameraInterruptedError("camera index 0 failed to read a frame")


class DynamicFakeCamera(ContinuousFakeCamera):
    def read(self) -> FramePacket:
        packet = super().read()
        packet.image.fill((packet.frame_id % 7) * 40)
        return packet


class PausableDynamicCamera(DynamicFakeCamera):
    def __init__(self) -> None:
        super().__init__()
        self._pause_reads = threading.Event()
        self._resume_reads = threading.Event()
        self._resume_reads.set()

    def pause(self) -> None:
        self._resume_reads.clear()
        self._pause_reads.set()

    def read(self) -> FramePacket:
        if self._pause_reads.is_set():
            assert self._resume_reads.wait(timeout=2)
        return super().read()

    def close(self) -> None:
        self._resume_reads.set()
        super().close()


class RecordingSemanticWorker:
    def __init__(
        self,
        *,
        available: bool,
        lifecycle: list[str] | None = None,
    ) -> None:
        self.available = available
        self.submissions: list[dict[str, object]] = []
        self.clear_count = 0
        self.close_count = 0
        self.on_submit: Callable[[int, tuple[FramePacket, ...], int], None] | None = None
        self._condition = threading.Condition()
        self._lifecycle = lifecycle

    @property
    def submit_count(self) -> int:
        with self._condition:
            return len(self.submissions)

    def submit(
        self,
        *,
        window_id: int,
        frames: tuple[FramePacket, ...],
        submitted_at_ms: int,
    ) -> int:
        if self.on_submit is not None:
            self.on_submit(window_id, frames, submitted_at_ms)
        with self._condition:
            self.submissions.append(
                {
                    "window_id": window_id,
                    "frames": frames,
                    "submitted_at_ms": submitted_at_ms,
                }
            )
            self._condition.notify_all()
            return len(self.submissions)

    def wait_for_submissions(self, count: int, *, timeout: float = 2.0) -> None:
        with self._condition:
            if not self._condition.wait_for(
                lambda: len(self.submissions) >= count,
                timeout=timeout,
            ):
                raise AssertionError(f"semantic submission count did not reach {count}")

    def clear_pending(self) -> None:
        with self._condition:
            self.clear_count += 1
            self._condition.notify_all()

    def close(self) -> None:
        with self._condition:
            self.close_count += 1
            if self._lifecycle is not None:
                self._lifecycle.append("worker.close")
            self._condition.notify_all()


class BlockingCloseSemanticWorker(RecordingSemanticWorker):
    def __init__(self, *, lifecycle: list[str]) -> None:
        super().__init__(available=True, lifecycle=lifecycle)
        self.close_started = threading.Event()
        self.close_release = threading.Event()

    def close(self) -> None:
        with self._condition:
            self.close_count += 1
            self._condition.notify_all()
        self.close_started.set()
        assert self.close_release.wait(timeout=2)
        if self._lifecycle is not None:
            self._lifecycle.append("worker.close")


class BlockingVlmClient:
    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = threading.Event()

    def describe(self, _frames: tuple[FramePacket, ...]) -> VlmResult:
        self.started.set()
        assert self.release.wait(timeout=2)
        return VlmResult(model_id="Qwen", summary="ready", processing_ms=25)


class BlockingFailingVlmClient:
    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = threading.Event()

    def describe(self, _frames: tuple[FramePacket, ...]) -> VlmResult:
        self.started.set()
        assert self.release.wait(timeout=2)
        raise VlmRequestError("pre-restart request failed")


class RecordingVlmSupervisor:
    def __init__(
        self,
        *,
        lifecycle: list[str] | None = None,
        restart_error: Exception | None = None,
    ) -> None:
        self.restart_count = 0
        self.close_count = 0
        self._lifecycle = lifecycle
        self._restart_error = restart_error

    def restart(self) -> None:
        self.restart_count += 1
        if self._restart_error is not None:
            raise self._restart_error

    def close(self) -> None:
        self.close_count += 1
        if self._lifecycle is not None:
            self._lifecycle.append("supervisor.close")


class FailingCloseSemanticWorker(RecordingSemanticWorker):
    def __init__(self, *, lifecycle: list[str], error: Exception) -> None:
        super().__init__(available=True, lifecycle=lifecycle)
        self.error = error

    def close(self) -> None:
        super().close()
        raise self.error


class FailingCloseVlmSupervisor(RecordingVlmSupervisor):
    def __init__(self, *, lifecycle: list[str], error: Exception) -> None:
        super().__init__(lifecycle=lifecycle)
        self.error = error

    def close(self) -> None:
        super().close()
        raise self.error


class FailingCloseDetector:
    def __init__(self, *, lifecycle: list[str], error: Exception | None = None) -> None:
        self.lifecycle = lifecycle
        self.error = error
        self.close_count = 0

    def detect(self, _image: object) -> tuple[DetectedObject, ...]:
        return ()

    def close(self) -> None:
        self.close_count += 1
        self.lifecycle.append("detector.close")
        if self.error is not None:
            raise self.error


class BlockingFailingCloseSemanticWorker(RecordingSemanticWorker):
    def __init__(self, *, lifecycle: list[str], error: Exception) -> None:
        super().__init__(available=True, lifecycle=lifecycle)
        self.error = error
        self.close_started = threading.Event()
        self.close_release = threading.Event()

    def close(self) -> None:
        with self._condition:
            self.close_count += 1
            self._condition.notify_all()
        self.close_started.set()
        assert self.close_release.wait(timeout=2)
        if self._lifecycle is not None:
            self._lifecycle.append("worker.close")
        raise self.error


class SequencedRestartSupervisor:
    def __init__(self, *, lifecycle: list[str] | None = None) -> None:
        self.first_started = threading.Event()
        self.first_release = threading.Event()
        self.second_started = threading.Event()
        self.close_started = threading.Event()
        self.restart_count = 0
        self.close_count = 0
        self.restart_completed_after_close = False
        self._lifecycle = lifecycle
        self._lock = threading.Lock()
        self._closed = False

    def restart(self) -> None:
        with self._lock:
            self.restart_count += 1
            call_number = self.restart_count
        if call_number == 1:
            self.first_started.set()
            assert self.first_release.wait(timeout=2)
            with self._lock:
                self.restart_completed_after_close = self._closed
            if self._lifecycle is not None:
                self._lifecycle.append("supervisor.restart")
            return
        self.second_started.set()
        raise RuntimeError("second restart failed")

    def close(self) -> None:
        with self._lock:
            self._closed = True
            self.close_count += 1
        self.close_started.set()
        if self._lifecycle is not None:
            self._lifecycle.append("supervisor.close")


def wait_until(predicate: Callable[[], bool], *, timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError("condition did not become true")


def last_fast_window_id(runtime: DashboardRuntime) -> int:
    events = [
        row
        for row in runtime.state_store.events_after(0)
        if row["source"] == "fast_path"
    ]
    return int(events[-1]["windowId"]) if events else 0


def test_runtime_emits_fast_events_and_releases_camera() -> None:
    camera = ContinuousFakeCamera()
    runtime = DashboardRuntime(camera_factory=lambda: camera, window_ms=100)

    runtime.start()
    wait_until(lambda: len(runtime.state_store.events_after(0)) >= 2)
    runtime.stop()

    events = runtime.state_store.events_after(0)
    assert [event["windowId"] for event in events[:2]] == [1, 2]
    assert camera.closed is True
    assert runtime.is_running is False
    assert runtime.state_store.snapshot(runtime.config_store.snapshot())["lifecycle"][
        "phase"
    ] == "stopped"


def test_blocking_detector_does_not_stop_camera_capture() -> None:
    camera = ContinuousFakeCamera()
    detector = BlockingDetector()
    runtime = DashboardRuntime(
        camera_factory=lambda: camera,
        detector=detector,
        window_ms=100,
    )
    runtime.start()
    assert detector.started.wait(timeout=1)
    reads_when_detector_started = camera.read_count

    time.sleep(0.1)

    assert camera.read_count > reads_when_detector_started + 5
    detector.release.set()
    runtime.stop()
    assert detector.closed is False
    runtime.close()
    assert detector.closed is True


def test_hot_config_is_reflected_in_next_summary() -> None:
    camera = ContinuousFakeCamera()
    config = DashboardConfigStore()
    runtime = DashboardRuntime(
        camera_factory=lambda: camera,
        config_store=config,
        window_ms=100,
    )
    runtime.start()
    wait_until(lambda: len(runtime.state_store.events_after(0)) >= 1)

    config.update({"sampleFps": 12})
    wait_until(lambda: len(runtime.state_store.events_after(0)) >= 2)
    runtime.stop()

    summaries = runtime.state_store.events_after(0)
    assert summaries[0]["targetFrameCount"] == 15
    assert summaries[1]["targetFrameCount"] == 12


def test_start_and_stop_are_idempotent() -> None:
    camera = ContinuousFakeCamera()
    runtime = DashboardRuntime(camera_factory=lambda: camera, window_ms=100)

    runtime.start()
    runtime.start()
    runtime.stop()
    runtime.stop()

    assert runtime.is_running is False


def test_runtime_produces_latest_jpeg_preview() -> None:
    camera = ContinuousFakeCamera()
    runtime = DashboardRuntime(camera_factory=lambda: camera, window_ms=100)

    runtime.start()
    wait_until(lambda: runtime.latest_jpeg_store.get()[1] is not None)
    _, jpeg = runtime.latest_jpeg_store.get()
    runtime.stop()

    assert jpeg is not None
    assert jpeg.startswith(b"\xff\xd8")


def test_camera_failure_keeps_actionable_error_message() -> None:
    camera = InterruptedCamera()
    runtime = DashboardRuntime(camera_factory=lambda: camera, window_ms=100)

    runtime.start()
    wait_until(
        lambda: runtime.state_store.snapshot(runtime.config_store.snapshot())["lifecycle"][
            "phase"
        ]
        == "failed"
    )
    lifecycle = runtime.state_store.snapshot(runtime.config_store.snapshot())["lifecycle"]
    runtime.close()

    assert lifecycle == {
        "phase": "failed",
        "code": "camera_interrupted",
        "message": "camera index 0 failed to read a frame",
    }


def test_restart_skips_stale_frame_and_keeps_window_ids_monotonic() -> None:
    camera = ContinuousFakeCamera()
    runtime = DashboardRuntime(camera_factory=lambda: camera, window_ms=100)

    runtime.start()
    wait_until(lambda: len(runtime.state_store.events_after(0)) >= 2)
    before = runtime.state_store.events_after(0)
    last_sequence = before[-1]["sequence"]
    last_window_id = before[-1]["windowId"]
    runtime.stop()
    time.sleep(0.25)

    runtime.start()
    wait_until(lambda: len(runtime.state_store.events_after(last_sequence)) >= 1)
    after = runtime.state_store.events_after(last_sequence)
    runtime.close()

    assert after[0]["windowId"] == last_window_id + 1
    assert after[0]["sampledFrameCount"] > 0


def test_fast_state_is_fully_published_before_semantic_submit() -> None:
    camera = ContinuousFakeCamera()
    semantic = RecordingSemanticWorker(available=True)
    runtime = DashboardRuntime(
        camera_factory=lambda: camera,
        semantic_worker=semantic,
        config_store=DashboardConfigStore(DashboardConfigV1(semantic_enabled=True)),
        window_ms=100,
    )
    observations: list[tuple[bool, bool, bool, int]] = []

    def observe_submit(
        window_id: int,
        frames: tuple[FramePacket, ...],
        _submitted_at_ms: int,
    ) -> None:
        events = runtime.state_store.events_after(0)
        _, overlay = runtime.latest_overlay_store.get()
        snapshot = runtime.state_store.snapshot(runtime.config_store.snapshot())
        assert frames
        assert overlay is not None
        observations.append(
            (
                any(int(event["windowId"]) == window_id for event in events),
                overlay.window_id >= window_id,
                int(snapshot["latestSummary"]["windowId"]) >= window_id,  # type: ignore[index]
                int(snapshot["metrics"]["sampledFrameCount"]),  # type: ignore[index]
            )
        )

    semantic.on_submit = observe_submit
    runtime.start()
    semantic.wait_for_submissions(1)
    runtime.close()

    assert observations[0][:3] == (True, True, True)
    assert observations[0][3] > 0


def test_blocking_vlm_inference_does_not_delay_fast_events_or_capture() -> None:
    camera = ContinuousFakeCamera()
    client = BlockingVlmClient()
    state = DashboardStateStore()
    semantic = SemanticWorker(client=client, state_store=state)
    semantic.start()
    runtime = DashboardRuntime(
        camera_factory=lambda: camera,
        semantic_worker=semantic,
        state_store=state,
        config_store=DashboardConfigStore(
            DashboardConfigV1(
                semantic_enabled=True,
                semantic_cooldown_seconds=1,
            )
        ),
        window_ms=100,
    )
    runtime.start()
    try:
        assert client.started.wait(timeout=1)
        reads = camera.read_count
        fast_events = len(
            [
                row
                for row in runtime.state_store.events_after(0)
                if row["source"] == "fast_path"
            ]
        )
        jpeg_generation = runtime.latest_jpeg_store.get()[0]

        time.sleep(0.25)

        assert camera.read_count > reads + 10
        assert (
            len(
                [
                    row
                    for row in runtime.state_store.events_after(0)
                    if row["source"] == "fast_path"
                ]
            )
            > fast_events
        )
        assert runtime.latest_jpeg_store.get()[0] > jpeg_generation
    finally:
        client.release.set()
        runtime.close()


def test_runtime_uses_real_worker_availability_contract() -> None:
    available = False
    client = BlockingVlmClient()
    state = DashboardStateStore()
    semantic = SemanticWorker(
        client=client,
        state_store=state,
        available=lambda: available,
    )
    semantic.start()
    runtime = DashboardRuntime(
        camera_factory=ContinuousFakeCamera,
        semantic_worker=semantic,
        state_store=state,
        config_store=DashboardConfigStore(DashboardConfigV1(semantic_enabled=True)),
        window_ms=100,
    )
    runtime.start()
    try:
        wait_until(lambda: last_fast_window_id(runtime) >= 2)
        assert client.started.is_set() is False

        available = True
        assert client.started.wait(timeout=1)
    finally:
        client.release.set()
        runtime.close()


def test_stationary_window_submits_only_latest_frame() -> None:
    semantic = RecordingSemanticWorker(available=True)
    runtime = DashboardRuntime(
        camera_factory=ContinuousFakeCamera,
        semantic_worker=semantic,
        config_store=DashboardConfigStore(DashboardConfigV1(semantic_enabled=True)),
        window_ms=100,
    )

    runtime.start()
    semantic.wait_for_submissions(1)
    runtime.close()

    submitted_window_id = int(semantic.submissions[0]["window_id"])
    submitted_event = next(
        event
        for event in runtime.state_store.events_after(0)
        if int(event["windowId"]) == submitted_window_id
    )
    assert submitted_event["motion"] == "stationary"
    assert len(semantic.submissions[0]["frames"]) == 1  # type: ignore[arg-type]


def test_latest_mode_submits_stationary_windows_each_cooldown() -> None:
    semantic = RecordingSemanticWorker(available=True)
    runtime = DashboardRuntime(
        camera_factory=ContinuousFakeCamera,
        semantic_worker=semantic,
        config_store=DashboardConfigStore(
            DashboardConfigV1(
                semantic_enabled=True,
                semantic_cooldown_seconds=1,
            )
        ),
        semantic_input_mode="latest",
        window_ms=100,
    )

    runtime.start()
    semantic.wait_for_submissions(2)
    runtime.close()

    first, second = semantic.submissions[:2]
    assert int(second["submitted_at_ms"]) - int(first["submitted_at_ms"]) >= 1_000
    assert len(first["frames"]) == 1  # type: ignore[arg-type]
    assert len(second["frames"]) == 1  # type: ignore[arg-type]


def test_dynamic_window_submits_first_middle_and_last_frames() -> None:
    semantic = RecordingSemanticWorker(available=True)
    runtime = DashboardRuntime(
        camera_factory=DynamicFakeCamera,
        semantic_worker=semantic,
        config_store=DashboardConfigStore(DashboardConfigV1(semantic_enabled=True)),
        window_ms=250,
    )

    runtime.start()
    semantic.wait_for_submissions(1)
    runtime.close()

    frames = semantic.submissions[0]["frames"]
    submitted_window_id = int(semantic.submissions[0]["window_id"])
    submitted_event = next(
        event
        for event in runtime.state_store.events_after(0)
        if int(event["windowId"]) == submitted_window_id
    )
    assert isinstance(frames, tuple)
    assert submitted_event["changed"] is True
    assert len(frames) == 3
    assert frames[0].frame_id < frames[1].frame_id < frames[2].frame_id


def test_hot_cooldown_update_preserves_last_submission_time() -> None:
    semantic = RecordingSemanticWorker(available=True)
    config = DashboardConfigStore(
        DashboardConfigV1(
            semantic_enabled=True,
            semantic_cooldown_seconds=10,
        )
    )
    runtime = DashboardRuntime(
        camera_factory=DynamicFakeCamera,
        semantic_worker=semantic,
        config_store=config,
        window_ms=100,
    )

    runtime.start()
    semantic.wait_for_submissions(1)
    first_submitted_at_ms = int(semantic.submissions[0]["submitted_at_ms"])
    config.update({"semanticCooldownSeconds": 1})
    semantic.wait_for_submissions(2)
    runtime.close()

    second_submitted_at_ms = int(semantic.submissions[1]["submitted_at_ms"])
    assert second_submitted_at_ms - first_submitted_at_ms >= 1_000


def test_semantic_disable_during_fast_processing_blocks_admission() -> None:
    detector = BlockingDetector()
    semantic = RecordingSemanticWorker(available=True)
    config = DashboardConfigStore(DashboardConfigV1(semantic_enabled=True))
    runtime = DashboardRuntime(
        camera_factory=ContinuousFakeCamera,
        detector=detector,
        semantic_worker=semantic,
        config_store=config,
        window_ms=100,
    )
    runtime.start()
    assert detector.started.wait(timeout=1)

    config.update({"semanticEnabled": False})
    detector.release.set()
    wait_until(
        lambda: semantic.submit_count > 0 or last_fast_window_id(runtime) >= 2
    )
    runtime.close()

    assert semantic.submit_count == 0


def test_cooldown_increase_during_fast_processing_uses_current_value() -> None:
    camera = PausableDynamicCamera()
    detector = ArmableDetector()
    semantic = RecordingSemanticWorker(available=True)
    config = DashboardConfigStore(
        DashboardConfigV1(
            semantic_enabled=True,
            semantic_cooldown_seconds=1,
        )
    )
    runtime = DashboardRuntime(
        camera_factory=lambda: camera,
        detector=detector,
        semantic_worker=semantic,
        config_store=config,
        window_ms=100,
    )
    runtime.start()
    semantic.wait_for_submissions(1)
    first_submitted_at_ms = int(semantic.submissions[0]["submitted_at_ms"])
    detector.arm()
    assert detector.started.wait(timeout=1)
    camera.pause()
    remaining_seconds = max(
        0.0,
        (first_submitted_at_ms + 1_050 - time.monotonic_ns() // 1_000_000)
        / 1_000,
    )
    threading.Event().wait(remaining_seconds)

    config.update({"semanticCooldownSeconds": 10})
    blocked_window_id = last_fast_window_id(runtime) + 1
    detector.release.set()
    wait_until(lambda: last_fast_window_id(runtime) >= blocked_window_id)
    threading.Event().wait(0.05)
    runtime.close()

    assert semantic.submit_count == 1


def test_stop_clears_semantic_work_and_restart_keeps_window_ids_monotonic() -> None:
    semantic = RecordingSemanticWorker(available=True)
    runtime = DashboardRuntime(
        camera_factory=ContinuousFakeCamera,
        semantic_worker=semantic,
        config_store=DashboardConfigStore(DashboardConfigV1(semantic_enabled=True)),
        window_ms=100,
    )
    runtime.start()
    semantic.wait_for_submissions(1)
    before = last_fast_window_id(runtime)

    runtime.stop()

    assert semantic.clear_count == 1
    assert semantic.close_count == 0
    runtime.start()
    wait_until(lambda: last_fast_window_id(runtime) > before)
    runtime.close()

    assert semantic.close_count == 1


def test_window_finishing_during_stop_cannot_requeue_stale_semantic_work() -> None:
    semantic = RecordingSemanticWorker(available=True)
    detector = BlockingDetector()
    runtime = DashboardRuntime(
        camera_factory=ContinuousFakeCamera,
        detector=detector,
        semantic_worker=semantic,
        config_store=DashboardConfigStore(DashboardConfigV1(semantic_enabled=True)),
        window_ms=100,
    )
    runtime.start()
    assert detector.started.wait(timeout=1)
    stopped = threading.Event()

    def stop_runtime() -> None:
        runtime.stop()
        stopped.set()

    stop_thread = threading.Thread(target=stop_runtime)
    stop_thread.start()
    wait_until(lambda: semantic.clear_count == 1)
    detector.release.set()
    assert stopped.wait(timeout=1)
    stop_thread.join()
    runtime.close()

    assert semantic.submit_count == 0


def test_stop_marks_inflight_real_worker_result_stale() -> None:
    client = BlockingVlmClient()
    state = DashboardStateStore()
    semantic = SemanticWorker(client=client, state_store=state)
    semantic.start()
    runtime = DashboardRuntime(
        camera_factory=ContinuousFakeCamera,
        semantic_worker=semantic,
        state_store=state,
        config_store=DashboardConfigStore(DashboardConfigV1(semantic_enabled=True)),
        window_ms=100,
    )
    runtime.start()
    assert client.started.wait(timeout=1)

    runtime.stop()
    client.release.set()
    wait_until(
        lambda: state.snapshot(runtime.config_store.snapshot())["metrics"][
            "semanticStaleCount"
        ]
        == 1
    )
    payload = state.snapshot(runtime.config_store.snapshot())
    runtime.close()

    assert payload["latestSemantic"] is None
    assert payload["metrics"]["semanticSuccessCount"] == 0


def test_start_waits_for_stop_teardown_before_creating_next_session() -> None:
    first_camera = BlockingCloseCamera()
    second_camera = ContinuousFakeCamera()
    cameras: list[ContinuousFakeCamera] = []

    def camera_factory() -> ContinuousFakeCamera:
        camera = first_camera if not cameras else second_camera
        cameras.append(camera)
        return camera

    runtime = DashboardRuntime(camera_factory=camera_factory, window_ms=100)
    runtime.start()
    wait_until(lambda: last_fast_window_id(runtime) >= 1)
    previous_window_id = last_fast_window_id(runtime)
    previous_jpeg_generation = runtime.latest_jpeg_store.get()[0]
    stop_done = threading.Event()
    start_called = threading.Event()
    start_done = threading.Event()

    def stop_runtime() -> None:
        runtime.stop()
        stop_done.set()

    def start_runtime() -> None:
        start_called.set()
        runtime.start()
        start_done.set()

    stop_thread = threading.Thread(target=stop_runtime)
    start_thread = threading.Thread(target=start_runtime)
    stop_thread.start()
    assert first_camera.close_started.wait(timeout=1)
    start_thread.start()
    assert start_called.wait(timeout=1)
    start_returned_during_teardown = start_done.wait(timeout=0.05)
    cameras_created_during_teardown = len(cameras)

    first_camera.close_release.set()
    assert stop_done.wait(timeout=5)
    assert start_done.wait(timeout=5)
    stop_thread.join()
    start_thread.join()
    wait_until(lambda: last_fast_window_id(runtime) > previous_window_id)
    wait_until(
        lambda: runtime.latest_jpeg_store.get()[0] > previous_jpeg_generation
    )
    lifecycle = runtime.state_store.snapshot(runtime.config_store.snapshot())["lifecycle"]
    runtime.close()

    assert start_returned_during_teardown is False
    assert cameras_created_during_teardown == 1
    assert len(cameras) == 2
    assert lifecycle["phase"] == "running"


def test_concurrent_stop_callers_wait_for_same_teardown() -> None:
    camera = BlockingCloseCamera()
    runtime = DashboardRuntime(camera_factory=lambda: camera, window_ms=100)
    runtime.start()
    wait_until(lambda: last_fast_window_id(runtime) >= 1)
    first_done = threading.Event()
    second_called = threading.Event()
    second_done = threading.Event()

    def stop_first() -> None:
        runtime.stop()
        first_done.set()

    def stop_second() -> None:
        second_called.set()
        runtime.stop()
        second_done.set()

    first_thread = threading.Thread(target=stop_first)
    second_thread = threading.Thread(target=stop_second)
    first_thread.start()
    assert camera.close_started.wait(timeout=1)
    second_thread.start()
    assert second_called.wait(timeout=1)
    second_returned_during_teardown = second_done.wait(timeout=0.05)

    camera.close_release.set()
    assert first_done.wait(timeout=1)
    assert second_done.wait(timeout=1)
    first_thread.join()
    second_thread.join()
    runtime.close()

    assert second_returned_during_teardown is False


def test_close_prevents_waiting_start_from_reviving_after_stop() -> None:
    first_camera = BlockingCloseCamera()
    cameras: list[ContinuousFakeCamera] = []

    def camera_factory() -> ContinuousFakeCamera:
        camera: ContinuousFakeCamera
        if not cameras:
            camera = first_camera
        else:
            camera = ContinuousFakeCamera()
        cameras.append(camera)
        return camera

    runtime = DashboardRuntime(camera_factory=camera_factory, window_ms=100)
    runtime.start()
    wait_until(lambda: last_fast_window_id(runtime) >= 1)
    stop_done = threading.Event()
    start_called = threading.Event()
    start_done = threading.Event()
    close_called = threading.Event()
    close_done = threading.Event()
    start_errors: list[Exception] = []

    def stop_runtime() -> None:
        runtime.stop()
        stop_done.set()

    def start_runtime() -> None:
        start_called.set()
        try:
            runtime.start()
        except Exception as exc:
            start_errors.append(exc)
        finally:
            start_done.set()

    def close_runtime() -> None:
        close_called.set()
        runtime.close()
        close_done.set()

    stop_thread = threading.Thread(target=stop_runtime)
    start_thread = threading.Thread(target=start_runtime)
    close_thread = threading.Thread(target=close_runtime)
    stop_thread.start()
    assert first_camera.close_started.wait(timeout=1)
    start_thread.start()
    assert start_called.wait(timeout=1)
    close_thread.start()
    assert close_called.wait(timeout=1)
    wait_until(lambda: runtime._closing)

    first_camera.close_release.set()
    assert stop_done.wait(timeout=5)
    assert start_done.wait(timeout=5)
    assert close_done.wait(timeout=5)
    stop_thread.join()
    start_thread.join()
    close_thread.join()

    assert len(start_errors) == 1
    assert str(start_errors[0]) == "dashboard runtime is closed"
    assert len(cameras) == 1
    assert runtime.is_running is False


def test_restart_vlm_clears_semantic_work_without_restarting_camera() -> None:
    camera = DynamicFakeCamera()
    factory_count = 0

    def camera_factory() -> ContinuousFakeCamera:
        nonlocal factory_count
        factory_count += 1
        return camera

    semantic = RecordingSemanticWorker(available=True)
    supervisor = RecordingVlmSupervisor()
    runtime = DashboardRuntime(
        camera_factory=camera_factory,
        semantic_worker=semantic,
        vlm_supervisor=supervisor,
        config_store=DashboardConfigStore(
            DashboardConfigV1(
                semantic_enabled=True,
                semantic_cooldown_seconds=1,
            )
        ),
        window_ms=100,
    )
    runtime.start()
    semantic.wait_for_submissions(1)
    reads = camera.read_count
    clear_count = semantic.clear_count

    runtime.restart_vlm()
    assert semantic.clear_count == clear_count + 1
    wait_until(lambda: camera.read_count > reads)
    semantic.wait_for_submissions(2)
    runtime.close()

    assert semantic.close_count == 1
    assert supervisor.restart_count == 1
    assert factory_count == 1


def test_restart_vlm_rejects_failure_from_inflight_previous_session() -> None:
    state_store = DashboardStateStore()
    client = BlockingFailingVlmClient()
    semantic = SemanticWorker(client=client, state_store=state_store)
    semantic.start()
    supervisor = RecordingVlmSupervisor()
    runtime = DashboardRuntime(
        camera_factory=ContinuousFakeCamera,
        semantic_worker=semantic,
        vlm_supervisor=supervisor,
        state_store=state_store,
    )
    semantic.submit(
        window_id=7,
        frames=(FramePacket(frame_id=1, captured_at_ms=1_000, image=object()),),
        submitted_at_ms=1_000,
    )
    try:
        assert client.started.wait(timeout=1)

        runtime.restart_vlm()
        client.release.set()
        wait_until(
            lambda: (
                state_store.snapshot(runtime.config_store.snapshot())["metrics"][
                    "semanticStaleCount"
                ]
                + state_store.snapshot(runtime.config_store.snapshot())["metrics"][
                    "semanticErrorCount"
                ]
            )
            == 1
        )
        payload = state_store.snapshot(runtime.config_store.snapshot())
    finally:
        client.release.set()
        runtime.close()

    assert supervisor.restart_count == 1
    assert payload["metrics"]["semanticErrorCount"] == 0
    assert payload["metrics"]["semanticStaleCount"] == 1
    assert payload["semanticLifecycle"]["phase"] != "degraded"


def test_restart_vlm_failure_keeps_semantic_admission_paused() -> None:
    semantic = RecordingSemanticWorker(available=True)
    supervisor = RecordingVlmSupervisor(restart_error=RuntimeError("restart failed"))
    runtime = DashboardRuntime(
        camera_factory=DynamicFakeCamera,
        semantic_worker=semantic,
        vlm_supervisor=supervisor,
        config_store=DashboardConfigStore(
            DashboardConfigV1(
                semantic_enabled=True,
                semantic_cooldown_seconds=1,
            )
        ),
        window_ms=100,
    )
    runtime.start()
    semantic.wait_for_submissions(1)
    submitted_before_restart = semantic.submit_count
    window_before_restart = last_fast_window_id(runtime)

    with pytest.raises(RuntimeError, match="restart failed"):
        runtime.restart_vlm()
    wait_until(
        lambda: (
            semantic.submit_count > submitted_before_restart
            or last_fast_window_id(runtime) >= window_before_restart + 12
        ),
        timeout=2.5,
    )
    runtime.close()

    assert semantic.submit_count == submitted_before_restart
    assert supervisor.restart_count == 1


def test_concurrent_restarts_serialize_and_latest_failure_keeps_admission_paused() -> None:
    semantic = RecordingSemanticWorker(available=True)
    supervisor = SequencedRestartSupervisor()
    runtime = DashboardRuntime(
        camera_factory=DynamicFakeCamera,
        semantic_worker=semantic,
        vlm_supervisor=supervisor,
        config_store=DashboardConfigStore(
            DashboardConfigV1(
                semantic_enabled=True,
                semantic_cooldown_seconds=1,
            )
        ),
        window_ms=100,
    )
    runtime.start()
    semantic.wait_for_submissions(1)
    first_done = threading.Event()
    second_done = threading.Event()
    first_errors: list[Exception] = []
    second_errors: list[Exception] = []

    def restart_first() -> None:
        try:
            runtime.restart_vlm()
        except Exception as exc:
            first_errors.append(exc)
        finally:
            first_done.set()

    def restart_second() -> None:
        try:
            runtime.restart_vlm()
        except Exception as exc:
            second_errors.append(exc)
        finally:
            second_done.set()

    first_thread = threading.Thread(target=restart_first)
    second_thread = threading.Thread(target=restart_second)
    first_thread.start()
    assert supervisor.first_started.wait(timeout=1)
    second_thread.start()
    second_entered_while_first_blocked = supervisor.second_started.wait(timeout=0.05)

    supervisor.first_release.set()
    assert first_done.wait(timeout=1)
    assert second_done.wait(timeout=1)
    first_thread.join()
    second_thread.join()
    submissions_after_failure = semantic.submit_count
    window_after_failure = last_fast_window_id(runtime)
    wait_until(
        lambda: (
            semantic.submit_count > submissions_after_failure
            or last_fast_window_id(runtime) >= window_after_failure + 12
        ),
        timeout=2.5,
    )
    runtime.close()

    assert second_entered_while_first_blocked is False
    assert first_errors == []
    assert len(second_errors) == 1
    assert str(second_errors[0]) == "second restart failed"
    assert semantic.submit_count == submissions_after_failure


def test_close_waits_for_blocked_restart_before_closing_worker_and_sidecar() -> None:
    lifecycle: list[str] = []
    semantic = RecordingSemanticWorker(available=True, lifecycle=lifecycle)
    supervisor = SequencedRestartSupervisor(lifecycle=lifecycle)
    runtime = DashboardRuntime(
        camera_factory=ContinuousFakeCamera,
        semantic_worker=semantic,
        vlm_supervisor=supervisor,
    )
    restart_done = threading.Event()
    close_called = threading.Event()
    close_done = threading.Event()

    def restart_vlm() -> None:
        runtime.restart_vlm()
        restart_done.set()

    def close_runtime() -> None:
        close_called.set()
        runtime.close()
        close_done.set()

    restart_thread = threading.Thread(target=restart_vlm)
    close_thread = threading.Thread(target=close_runtime)
    restart_thread.start()
    assert supervisor.first_started.wait(timeout=1)
    close_thread.start()
    assert close_called.wait(timeout=1)
    wait_until(lambda: runtime._closing)
    close_reached_sidecar_while_restart_blocked = supervisor.close_started.wait(
        timeout=0.05
    )

    supervisor.first_release.set()
    assert restart_done.wait(timeout=1)
    assert close_done.wait(timeout=1)
    restart_thread.join()
    close_thread.join()

    assert close_reached_sidecar_while_restart_blocked is False
    assert supervisor.restart_completed_after_close is False
    assert lifecycle == [
        "supervisor.restart",
        "worker.close",
        "supervisor.close",
    ]
    assert semantic.close_count == 1
    assert supervisor.close_count == 1


def test_close_releases_worker_before_sidecar_and_is_idempotent() -> None:
    lifecycle: list[str] = []
    semantic = RecordingSemanticWorker(available=True, lifecycle=lifecycle)
    supervisor = RecordingVlmSupervisor(lifecycle=lifecycle)
    runtime = DashboardRuntime(
        camera_factory=ContinuousFakeCamera,
        semantic_worker=semantic,
        vlm_supervisor=supervisor,
    )

    runtime.close()
    runtime.close()

    assert lifecycle == ["worker.close", "supervisor.close"]
    assert semantic.close_count == 1
    assert supervisor.close_count == 1


def test_close_attempts_every_resource_and_aggregates_cleanup_errors() -> None:
    lifecycle: list[str] = []
    worker = FailingCloseSemanticWorker(
        lifecycle=lifecycle,
        error=RuntimeError("worker close failed"),
    )
    supervisor = FailingCloseVlmSupervisor(
        lifecycle=lifecycle,
        error=RuntimeError("sidecar close failed"),
    )
    detector = FailingCloseDetector(
        lifecycle=lifecycle,
        error=RuntimeError("detector close failed"),
    )
    runtime = DashboardRuntime(
        camera_factory=ContinuousFakeCamera,
        detector=detector,
        semantic_worker=worker,
        vlm_supervisor=supervisor,
    )

    with pytest.raises(ExceptionGroup) as errors:
        runtime.close()

    assert [str(error) for error in errors.value.exceptions] == [
        "worker close failed",
        "sidecar close failed",
        "detector close failed",
    ]
    assert lifecycle == ["worker.close", "supervisor.close", "detector.close"]
    assert runtime._closed is True
    assert runtime._closing is False
    runtime.close()
    assert worker.close_count == 1
    assert supervisor.close_count == 1
    assert detector.close_count == 1


def test_concurrent_close_waiter_returns_after_owner_cleanup_error() -> None:
    lifecycle: list[str] = []
    worker = BlockingFailingCloseSemanticWorker(
        lifecycle=lifecycle,
        error=RuntimeError("worker close failed"),
    )
    supervisor = RecordingVlmSupervisor(lifecycle=lifecycle)
    runtime = DashboardRuntime(
        camera_factory=ContinuousFakeCamera,
        semantic_worker=worker,
        vlm_supervisor=supervisor,
    )
    owner_errors: list[Exception] = []
    waiter_returned = threading.Event()

    def close_owner() -> None:
        try:
            runtime.close()
        except Exception as error:
            owner_errors.append(error)

    def close_waiter() -> None:
        runtime.close()
        waiter_returned.set()

    owner = threading.Thread(target=close_owner)
    waiter = threading.Thread(target=close_waiter)
    owner.start()
    assert worker.close_started.wait(timeout=1)
    waiter.start()
    assert waiter_returned.wait(timeout=0.05) is False
    worker.close_release.set()
    owner.join(timeout=1)
    waiter.join(timeout=1)

    assert len(owner_errors) == 1
    assert str(owner_errors[0]) == "worker close failed"
    assert waiter_returned.is_set()
    assert lifecycle == ["worker.close", "supervisor.close"]
    assert runtime._closed is True
    assert runtime._closing is False
    assert worker.close_count == 1
    assert supervisor.close_count == 1


def test_concurrent_close_callers_wait_for_worker_then_sidecar_release() -> None:
    lifecycle: list[str] = []
    semantic = BlockingCloseSemanticWorker(lifecycle=lifecycle)
    supervisor = RecordingVlmSupervisor(lifecycle=lifecycle)
    runtime = DashboardRuntime(
        camera_factory=ContinuousFakeCamera,
        semantic_worker=semantic,
        vlm_supervisor=supervisor,
    )
    first_closed = threading.Event()
    second_started = threading.Event()
    second_closed = threading.Event()

    def close_first() -> None:
        runtime.close()
        first_closed.set()

    def close_second() -> None:
        second_started.set()
        runtime.close()
        second_closed.set()

    first_closer = threading.Thread(target=close_first)
    second_closer = threading.Thread(target=close_second)
    first_closer.start()
    assert semantic.close_started.wait(timeout=1)
    second_closer.start()
    assert second_started.wait(timeout=1)
    second_returned_while_worker_blocked = second_closed.wait(timeout=0.05)

    semantic.close_release.set()
    assert first_closed.wait(timeout=1)
    assert second_closed.wait(timeout=1)
    first_closer.join()
    second_closer.join()

    assert second_returned_while_worker_blocked is False
    assert lifecycle == ["worker.close", "supervisor.close"]
    assert semantic.close_count == 1
    assert supervisor.close_count == 1
