from __future__ import annotations

import threading
import time

from nono_realtime_camera.latest_value import LatestValueStore


def test_latest_store_overwrites_without_queueing() -> None:
    store = LatestValueStore[int]()

    assert store.put(1) == 1
    assert store.put(2) == 2

    assert store.get() == (2, 2)


def test_wait_after_returns_only_newer_generation() -> None:
    store = LatestValueStore[str]()
    store.put("first")

    assert store.wait_after(0, timeout=0.01) == (1, "first")
    assert store.wait_after(1, timeout=0.01) == (1, None)


def test_close_wakes_waiter() -> None:
    store = LatestValueStore[bytes]()
    finished = threading.Event()
    result: list[tuple[int, bytes | None]] = []

    def wait() -> None:
        result.append(store.wait_after(0, timeout=2))
        finished.set()

    thread = threading.Thread(target=wait)
    thread.start()
    time.sleep(0.02)
    store.close()

    assert finished.wait(timeout=1)
    assert result == [(0, None)]
    thread.join(timeout=1)


def test_put_after_close_is_rejected() -> None:
    store = LatestValueStore[int]()
    store.close()

    try:
        store.put(1)
    except RuntimeError as error:
        assert str(error) == "latest value store is closed"
    else:
        raise AssertionError("put should reject a closed store")
