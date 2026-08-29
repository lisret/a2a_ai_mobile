from __future__ import annotations

import base64
import json
import socket
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import cv2
import numpy as np
import pytest

from nono_realtime_camera.frames import FramePacket
from nono_realtime_camera.vlm_client import (
    OpenAICompatibleVlmClient,
    VlmProtocolError,
    VlmRequestError,
)


class _FakeVlmServer(ThreadingHTTPServer):
    def __init__(self, response: Any, *, status: int = 200, delay_seconds: float = 0) -> None:
        super().__init__(("127.0.0.1", 0), _FakeVlmHandler)
        self.response = response
        self.status = status
        self.delay_seconds = delay_seconds
        self.last_json: dict[str, Any] | None = None
        self.last_path: str | None = None

    @property
    def base_url(self) -> str:
        host, port = self.server_address
        return f"http://{host}:{port}"


class _FakeVlmHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        content_length = int(self.headers["Content-Length"])
        self.server.last_path = self.path  # type: ignore[attr-defined]
        self.server.last_json = json.loads(self.rfile.read(content_length))  # type: ignore[attr-defined]
        if self.server.delay_seconds:  # type: ignore[attr-defined]
            time.sleep(self.server.delay_seconds)  # type: ignore[attr-defined]
        response = json.dumps(self.server.response).encode()  # type: ignore[attr-defined]
        self.send_response(self.server.status)  # type: ignore[attr-defined]
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, _format: str, *_args: object) -> None:
        pass


@contextmanager
def fake_vlm_server(
    response: Any, *, status: int = 200, delay_seconds: float = 0
) -> Iterator[_FakeVlmServer]:
    server = _FakeVlmServer(response, status=status, delay_seconds=delay_seconds)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        thread.join()
        server.server_close()


def make_frames(count: int) -> tuple[FramePacket, ...]:
    return tuple(
        FramePacket(
            frame_id=index + 1,
            captured_at_ms=index * 100,
            image=np.full((8, 8, 3), 20 + index * 100, dtype=np.uint8),
        )
        for index in range(count)
    )


def make_client(server: _FakeVlmServer, *, timeout_seconds: float = 2) -> OpenAICompatibleVlmClient:
    return OpenAICompatibleVlmClient(
        base_url=server.base_url,
        model_id="mlx-community/Qwen3-VL-2B-Instruct-4bit",
        timeout_seconds=timeout_seconds,
        max_tokens=48,
    )


def test_client_sends_in_memory_multi_image_request_and_parses_result() -> None:
    with fake_vlm_server(
        response={
            "model": "mlx-community/Qwen3-VL-2B-Instruct-4bit",
            "choices": [{"message": {"content": "桌面上有水瓶，手正在移动它。"}}],
        }
    ) as server:
        result = make_client(server).describe(make_frames(3))
        body = server.last_json

    assert result.summary == "桌面上有水瓶，手正在移动它。"
    assert result.model_id == "mlx-community/Qwen3-VL-2B-Instruct-4bit"
    assert result.processing_ms >= 0
    assert body is not None
    assert server.last_path == "/v1/chat/completions"
    content = body["messages"][0]["content"]
    image_parts = [part for part in content if part["type"] == "image_url"]
    assert len(image_parts) == 3
    assert body["model"] == "mlx-community/Qwen3-VL-2B-Instruct-4bit"
    assert body["max_tokens"] == 48
    assert body["temperature"] == 0
    assert all("base64," in part["image_url"]["url"] for part in image_parts)
    assert content[-1]["type"] == "text"
    prompt = content[-1]["text"]
    assert "仅描述画面中可见内容" in prompt
    assert "简短中文 1–2 句" in prompt
    assert "主要物体、人与对象关系、简单动作或显著变化" in prompt
    assert "不要猜测身份、意图或画外信息" in prompt

    decoded_means = []
    for part in image_parts:
        encoded_image = part["image_url"]["url"].split(",", maxsplit=1)[1]
        jpeg = np.frombuffer(base64.b64decode(encoded_image), dtype=np.uint8)
        decoded_image = cv2.imdecode(jpeg, cv2.IMREAD_COLOR)
        assert decoded_image is not None
        decoded_means.append(float(decoded_image.mean()))
    assert decoded_means == pytest.approx([20, 120, 220], abs=2)


@pytest.mark.parametrize(
    "response",
    [
        {"choices": [{"message": {"content": "有一个水瓶。"}}]},
        {"model": None, "choices": [{"message": {"content": "有一个水瓶。"}}]},
    ],
)
def test_client_falls_back_to_requested_model_when_response_model_is_missing_or_null(
    response: dict[str, Any],
) -> None:
    with fake_vlm_server(response=response) as server:
        result = make_client(server).describe(make_frames(1))

    assert result.model_id == "mlx-community/Qwen3-VL-2B-Instruct-4bit"


@pytest.mark.parametrize("model", ["", "  ", {}, ["model"], 42])
def test_client_rejects_invalid_response_model(model: Any) -> None:
    with fake_vlm_server(
        response={"model": model, "choices": [{"message": {"content": "有一个水瓶。"}}]}
    ) as server:
        with pytest.raises(VlmProtocolError, match="model"):
            make_client(server).describe(make_frames(1))


@pytest.mark.parametrize(
    "response",
    [
        {"choices": []},
        {"choices": [{}]},
        {"choices": [{"message": {"content": []}}]},
        {"choices": [{"message": {"content": "   "}}]},
    ],
)
def test_client_rejects_empty_or_malformed_completion(response: Any) -> None:
    with fake_vlm_server(response=response) as server:
        with pytest.raises(VlmProtocolError):
            make_client(server).describe(make_frames(1))


def test_client_caps_summary_before_returning_it() -> None:
    with fake_vlm_server(response={"choices": [{"message": {"content": "x" * 600}}]}) as server:
        result = make_client(server).describe(make_frames(1))

    assert result.summary == "x" * 500


def test_client_rejects_empty_frame_tuple() -> None:
    with fake_vlm_server(response={}) as server:
        with pytest.raises(ValueError, match="at least one frame is required"):
            make_client(server).describe(())


def test_client_maps_image_encoding_failure_to_request_error() -> None:
    invalid_frame = FramePacket(frame_id=1, captured_at_ms=0, image="not an image")
    with fake_vlm_server(response={}) as server:
        with pytest.raises(VlmRequestError, match="image encoding failed"):
            make_client(server).describe((invalid_frame,))


def test_client_maps_http_failure_to_request_error() -> None:
    with fake_vlm_server(response={"error": "busy"}, status=503) as server:
        with pytest.raises(VlmRequestError, match="HTTP 503"):
            make_client(server).describe(make_frames(1))


def test_client_maps_timeout_to_request_error() -> None:
    with fake_vlm_server(response={}, delay_seconds=0.1) as server:
        with pytest.raises(VlmRequestError, match="timed out"):
            make_client(server, timeout_seconds=0.01).describe(make_frames(1))


def test_client_maps_connection_failure_to_request_error() -> None:
    with socket.socket() as socket_probe:
        socket_probe.bind(("127.0.0.1", 0))
        host, port = socket_probe.getsockname()

    client = OpenAICompatibleVlmClient(
        base_url=f"http://{host}:{port}",
        model_id="test-model",
        timeout_seconds=0.1,
        max_tokens=48,
    )

    with pytest.raises(VlmRequestError, match="connection failed"):
        client.describe(make_frames(1))
