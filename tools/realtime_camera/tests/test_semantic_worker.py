from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable

import pytest

from nono_realtime_camera.dashboard_config import DashboardConfigStore
from nono_realtime_camera.dashboard_state import DashboardStateStore
from nono_realtime_camera.frames import FramePacket
from nono_realtime_camera.semantic_worker import SemanticWorker
from nono_realtime_camera.vlm_client import (
    VlmProtocolError,
    VlmRequestError,
    VlmResult,
)


def make_frames(
    count: int,
    *,
    first_frame_id: int = 1,
) -> tuple[FramePacket, ...]:
    return tuple(
        FramePacket(
            frame_id=first_frame_id + index,
            captured_at_ms=index * 100,
            image=object(),
        )
        for index in range(count)
    )


def snapshot(state: DashboardStateStore) -> dict[str, object]:
    return state.snapshot(DashboardConfigStore().snapshot())


def wait_until(predicate: Callable[[], bool], *, timeout: float = 1.0) -> None:
    deadline = time.monotonic() + timeout
    wakeup = threading.Event()
    while not predicate():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            pytest.fail("condition was not met before timeout")
        wakeup.wait(min(remaining, 0.005))


class BlockingVlmClient:
    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = threading.Event()
        self.first_frame_ids: list[int] = []

    def describe(self, frames: tuple[FramePacket, ...]) -> VlmResult:
        self.first_frame_ids.append(frames[0].frame_id)
        self.started.set()
        assert self.release.wait(timeout=1)
        return VlmResult(
            model_id="Qwen",
            summary=f"frame {frames[0].frame_id}",
            processing_ms=25,
        )


class ScriptedVlmClient:
    def __init__(self, responses: tuple[VlmResult | Exception, ...]) -> None:
        self._responses = deque(responses)

    def describe(self, _frames: tuple[FramePacket, ...]) -> VlmResult:
        response = self._responses.popleft()
        if isinstance(response, Exception):
            raise response
        return response


def test_worker_overwrites_pending_task_without_blocking_submitter() -> None:
    client = BlockingVlmClient()
    state = DashboardStateStore()
    worker = SemanticWorker(client=client, state_store=state)
    worker.start()
    first_submit_done = threading.Event()

    def submit_first() -> None:
        worker.submit(
            window_id=1,
            frames=make_frames(1, first_frame_id=1),
            submitted_at_ms=1_000,
        )
        first_submit_done.set()

    submitter = threading.Thread(target=submit_first, daemon=True)
    submitter.start()
    try:
        assert first_submit_done.wait(timeout=1)
        assert client.started.wait(timeout=1)
        worker.submit(
            window_id=2,
            frames=make_frames(1, first_frame_id=2),
            submitted_at_ms=2_000,
        )
        worker.submit(
            window_id=3,
            frames=make_frames(3, first_frame_id=3),
            submitted_at_ms=3_000,
        )

        assert worker.pending_depth == 1
        assert snapshot(state)["metrics"]["semanticDroppedCount"] == 1
        client.release.set()
        wait_until(
            lambda: snapshot(state)["metrics"]["semanticSuccessCount"] == 1
        )
    finally:
        client.release.set()
        worker.close()
        submitter.join(timeout=1)

    payload = snapshot(state)
    assert client.first_frame_ids == [1, 3]
    assert payload["latestSemantic"]["windowId"] == 3
    assert payload["metrics"]["semanticStaleCount"] == 1
    assert payload["semanticLifecycle"] == {"phase": "ready", "message": "Qwen ready"}


def test_clear_pending_rejects_inflight_result_from_old_camera_session() -> None:
    client = BlockingVlmClient()
    state = DashboardStateStore()
    worker = SemanticWorker(client=client, state_store=state)
    worker.start()
    worker.submit(window_id=7, frames=make_frames(1), submitted_at_ms=1_000)
    try:
        assert client.started.wait(timeout=1)

        active_lifecycle = snapshot(state)["semanticLifecycle"]
        assert active_lifecycle["phase"] == "running"
        assert "7" in active_lifecycle["message"]

        worker.clear_pending()
        client.release.set()
        wait_until(lambda: snapshot(state)["metrics"]["semanticStaleCount"] == 1)
        payload = snapshot(state)
    finally:
        client.release.set()
        worker.close()

    assert payload["latestSemantic"] is None
    assert payload["metrics"]["semanticSuccessCount"] == 0
    assert payload["semanticLifecycle"] == {"phase": "ready", "message": "Qwen ready"}


@pytest.mark.parametrize(
    "failure",
    (VlmRequestError("offline"), VlmProtocolError("invalid completion")),
)
def test_worker_recovers_after_vlm_error(failure: Exception) -> None:
    client = ScriptedVlmClient(
        (
            failure,
            VlmResult(model_id="Qwen", summary="恢复成功", processing_ms=40),
        )
    )
    state = DashboardStateStore()
    worker = SemanticWorker(client=client, state_store=state)
    worker.start()
    try:
        worker.submit(window_id=1, frames=make_frames(1), submitted_at_ms=1_000)
        wait_until(lambda: snapshot(state)["metrics"]["semanticErrorCount"] == 1)
        failed_payload = snapshot(state)
        assert failed_payload["semanticLifecycle"] == {
            "phase": "degraded",
            "message": str(failure),
        }
        assert worker.is_running is True

        worker.submit(window_id=2, frames=make_frames(1), submitted_at_ms=2_000)
        wait_until(lambda: snapshot(state)["metrics"]["semanticSuccessCount"] == 1)
    finally:
        worker.close()

    recovered_payload = snapshot(state)
    assert recovered_payload["latestSemantic"]["windowId"] == 2
    assert recovered_payload["semanticLifecycle"] == {
        "phase": "ready",
        "message": "Qwen ready",
    }


def test_close_discards_pending_and_rejects_inflight_result() -> None:
    client = BlockingVlmClient()
    state = DashboardStateStore()
    worker = SemanticWorker(client=client, state_store=state)
    worker.start()
    worker.submit(window_id=1, frames=make_frames(1), submitted_at_ms=1_000)
    assert client.started.wait(timeout=1)
    worker.submit(window_id=2, frames=make_frames(1, first_frame_id=2), submitted_at_ms=2_000)
    assert worker.pending_depth == 1

    closed = threading.Event()

    def close_worker() -> None:
        worker.close()
        closed.set()

    closer = threading.Thread(target=close_worker)
    closer.start()
    try:
        wait_until(lambda: not worker.is_running and worker.pending_depth == 0)
    finally:
        client.release.set()
    assert closed.wait(timeout=1)
    closer.join(timeout=1)

    assert client.first_frame_ids == [1]
    assert snapshot(state)["latestSemantic"] is None
    with pytest.raises(RuntimeError, match="closed"):
        worker.submit(window_id=3, frames=make_frames(1), submitted_at_ms=3_000)
    worker.close()
