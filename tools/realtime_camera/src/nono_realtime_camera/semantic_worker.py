from __future__ import annotations

import threading

from .contracts import RealtimeSemanticEnrichmentV1
from .dashboard_state import DashboardStateStore
from .frames import FramePacket
from .semantic_scheduler import SemanticTask
from .vlm_client import VlmClient, VlmProtocolError, VlmRequestError


class SemanticWorker:
    def __init__(
        self,
        *,
        client: VlmClient,
        state_store: DashboardStateStore,
    ) -> None:
        self.client = client
        self.state_store = state_store
        self._condition = threading.Condition()
        self._pending: SemanticTask | None = None
        self._session_id = 0
        self._next_task_id = 0
        self._latest_task_id = 0
        self._running = False
        self._closed = False
        self._thread: threading.Thread | None = None

    @property
    def is_running(self) -> bool:
        with self._condition:
            return self._running

    @property
    def pending_depth(self) -> int:
        with self._condition:
            return int(self._pending is not None)

    def start(self) -> None:
        with self._condition:
            if self._closed:
                raise RuntimeError("semantic worker is closed")
            if self._running:
                return
            self._running = True
            self._thread = threading.Thread(
                target=self._run,
                name="semantic-worker",
                daemon=True,
            )
            self._thread.start()

    def submit(
        self,
        *,
        window_id: int,
        frames: tuple[FramePacket, ...],
        submitted_at_ms: int,
    ) -> int:
        with self._condition:
            if self._closed:
                raise RuntimeError("semantic worker is closed")
            if not self._running:
                raise RuntimeError("semantic worker is not running")
            self._next_task_id += 1
            if self._pending is not None:
                self.state_store.record_semantic_drop()
            task = SemanticTask(
                task_id=self._next_task_id,
                session_id=self._session_id,
                window_id=window_id,
                submitted_at_ms=submitted_at_ms,
                frames=frames,
            )
            self._latest_task_id = task.task_id
            self._pending = task
            self.state_store.update_metrics(semanticPendingDepth=1)
            self._condition.notify_all()
            return task.task_id

    def clear_pending(self) -> None:
        with self._condition:
            if self._closed:
                raise RuntimeError("semantic worker is closed")
            self._session_id += 1
            self._pending = None
            self.state_store.reset_semantic_session()
            self._condition.notify_all()

    def close(self) -> None:
        with self._condition:
            if self._closed:
                return
            self._closed = True
            self._running = False
            self._session_id += 1
            self._pending = None
            self.state_store.update_metrics(semanticPendingDepth=0)
            self._condition.notify_all()
            thread = self._thread
        if thread is not None and thread is not threading.current_thread():
            thread.join()

    def _run(self) -> None:
        while True:
            with self._condition:
                self._condition.wait_for(
                    lambda: self._pending is not None or self._closed
                )
                if self._closed:
                    return
                task = self._pending
                self._pending = None
                self.state_store.update_metrics(semanticPendingDepth=0)
                assert task is not None
                self.state_store.set_semantic_lifecycle(
                    "running",
                    message=f"Analyzing window {task.window_id}",
                )

            try:
                result = self.client.describe(task.frames)
            except (VlmRequestError, VlmProtocolError) as exc:
                with self._condition:
                    self.state_store.record_semantic_error(str(exc))
                continue

            enrichment = RealtimeSemanticEnrichmentV1(
                window_id=task.window_id,
                semantic_summary=result.summary,
                model_id=result.model_id,
                processing_ms=result.processing_ms,
            )
            with self._condition:
                if (
                    task.session_id != self._session_id
                    or task.task_id != self._latest_task_id
                ):
                    self.state_store.record_semantic_stale()
                else:
                    self.state_store.record_semantic_result(
                        enrichment,
                        input_frames=len(task.frames),
                    )
                self.state_store.set_semantic_lifecycle(
                    "ready",
                    message=f"{result.model_id} ready",
                )
