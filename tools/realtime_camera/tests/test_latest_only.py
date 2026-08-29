from __future__ import annotations

import threading
import time

from nono_realtime_camera.latest_only import LatestOnlyExecutor


def test_latest_only_replaces_pending_item() -> None:
    first_started = threading.Event()
    release_first = threading.Event()
    all_done = threading.Event()
    started: list[int] = []
    completed: list[tuple[int, int]] = []

    def worker(item: int) -> int:
        started.append(item)
        if item == 1:
            first_started.set()
            assert release_first.wait(timeout=2)
        return item * 2

    def on_result(item: int, result: int) -> None:
        completed.append((item, result))
        if item == 3:
            all_done.set()

    executor = LatestOnlyExecutor(worker=worker, on_result=on_result)
    try:
        executor.submit(1)
        assert first_started.wait(timeout=1)
        executor.submit(2)
        executor.submit(3)
        release_first.set()
        assert all_done.wait(timeout=2)

        assert started == [1, 3]
        assert completed == [(1, 2), (3, 6)]
        assert executor.max_pending_depth == 1
        assert executor.replaced_pending_count == 1
    finally:
        executor.close()


def test_close_does_not_run_pending_item() -> None:
    first_started = threading.Event()
    release_first = threading.Event()
    started: list[int] = []

    def worker(item: int) -> int:
        started.append(item)
        first_started.set()
        release_first.wait(timeout=2)
        return item

    executor = LatestOnlyExecutor(worker=worker, on_result=lambda _item, _result: None)
    executor.submit(1)
    assert first_started.wait(timeout=1)
    executor.submit(2)
    executor.close(wait=False)
    release_first.set()
    time.sleep(0.05)

    assert started == [1]
