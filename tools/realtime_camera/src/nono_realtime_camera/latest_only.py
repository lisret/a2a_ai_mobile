from __future__ import annotations

import threading
from collections.abc import Callable
from typing import Generic, TypeVar

InputT = TypeVar("InputT")
ResultT = TypeVar("ResultT")


class LatestOnlyExecutor(Generic[InputT, ResultT]):
    def __init__(
        self,
        *,
        worker: Callable[[InputT], ResultT],
        on_result: Callable[[InputT, ResultT], None],
    ) -> None:
        self._worker = worker
        self._on_result = on_result
        self._condition = threading.Condition()
        self._pending: InputT | None = None
        self._running = False
        self._closed = False
        self._thread = threading.Thread(target=self._run, name="latest-only", daemon=True)
        self.max_pending_depth = 0
        self.replaced_pending_count = 0
        self._thread.start()

    def submit(self, item: InputT) -> None:
        with self._condition:
            if self._closed:
                raise RuntimeError("executor is closed")
            if self._pending is not None:
                self.replaced_pending_count += 1
            self._pending = item
            self.max_pending_depth = max(self.max_pending_depth, 1)
            self._condition.notify()

    def close(self, *, wait: bool = True) -> None:
        with self._condition:
            self._closed = True
            self._pending = None
            self._condition.notify_all()
        if wait and threading.current_thread() is not self._thread:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        while True:
            with self._condition:
                while self._pending is None and not self._closed:
                    self._condition.wait()
                if self._closed:
                    return
                item = self._pending
                self._pending = None
                self._running = True

            assert item is not None
            result = self._worker(item)
            self._on_result(item, result)

            with self._condition:
                self._running = False
