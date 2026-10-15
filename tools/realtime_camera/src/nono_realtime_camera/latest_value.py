from __future__ import annotations

import threading
from typing import Generic, TypeVar

ValueT = TypeVar("ValueT")


class LatestValueStore(Generic[ValueT]):
    def __init__(self) -> None:
        self._condition = threading.Condition()
        self._generation = 0
        self._value: ValueT | None = None
        self._closed = False

    def put(self, value: ValueT) -> int:
        with self._condition:
            if self._closed:
                raise RuntimeError("latest value store is closed")
            self._generation += 1
            self._value = value
            self._condition.notify_all()
            return self._generation

    def get(self) -> tuple[int, ValueT | None]:
        with self._condition:
            return self._generation, self._value

    def wait_after(
        self,
        generation: int,
        *,
        timeout: float | None = None,
    ) -> tuple[int, ValueT | None]:
        with self._condition:
            self._condition.wait_for(
                lambda: self._generation > generation or self._closed,
                timeout=timeout,
            )
            if self._generation <= generation:
                return generation, None
            return self._generation, self._value

    def close(self) -> None:
        with self._condition:
            self._closed = True
            self._value = None
            self._condition.notify_all()

    @property
    def closed(self) -> bool:
        with self._condition:
            return self._closed
