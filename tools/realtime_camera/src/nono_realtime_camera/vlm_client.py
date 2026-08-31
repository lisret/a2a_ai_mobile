from __future__ import annotations

import base64
import json
import socket
import time
from dataclasses import dataclass
from typing import Any, Protocol
from urllib import error, request

import cv2

from .frames import FramePacket

_SEMANTIC_PROMPT = (
    "仅根据当前图片，用一句简短中文描述主要对象和正在发生的动作；"
    "无明显动作时描述当前场景。不解释、不推测、不输出前缀。"
)
_MAX_SUMMARY_CHARACTERS = 500


class VlmProtocolError(RuntimeError):
    """The VLM response did not follow the Chat Completions response contract."""


class VlmRequestError(RuntimeError):
    """The local VLM endpoint could not be reached or did not accept the request."""


@dataclass(frozen=True, slots=True)
class VlmResult:
    model_id: str
    summary: str
    processing_ms: int


class VlmClient(Protocol):
    def describe(self, frames: tuple[FramePacket, ...]) -> VlmResult: ...


class OpenAICompatibleVlmClient:
    def __init__(
        self,
        *,
        base_url: str,
        model_id: str,
        timeout_seconds: float,
        max_tokens: int,
        image_max_edge: int,
    ) -> None:
        if not 64 <= image_max_edge <= 2_048:
            raise ValueError("image_max_edge must be between 64 and 2048")
        self.base_url = base_url.rstrip("/")
        self.model_id = model_id
        self.timeout_seconds = timeout_seconds
        self.max_tokens = max_tokens
        self.image_max_edge = image_max_edge

    def describe(self, frames: tuple[FramePacket, ...]) -> VlmResult:
        if not frames:
            raise ValueError("at least one frame is required")

        started_ns = self._monotonic_ns()
        content = [self._image_part(frame) for frame in frames]
        content.append({"type": "text", "text": _SEMANTIC_PROMPT})
        payload = {
            "model": self.model_id,
            "messages": [{"role": "user", "content": content}],
            "max_tokens": self.max_tokens,
            "temperature": 0,
        }
        response = self._post_json("/v1/chat/completions", payload)
        summary = _completion_text(response).strip()[:_MAX_SUMMARY_CHARACTERS]
        if not summary:
            raise VlmProtocolError("VLM returned an empty summary")
        processing_ms = (self._monotonic_ns() - started_ns) // 1_000_000
        return VlmResult(_response_model_id(response, self.model_id), summary, processing_ms)

    def _image_part(self, frame: FramePacket) -> dict[str, object]:
        try:
            image = frame.image
            height, width = image.shape[:2]
            longest_edge = max(height, width)
            if longest_edge <= 0:
                raise ValueError("image dimensions must be positive")
            if longest_edge > self.image_max_edge:
                scale = self.image_max_edge / longest_edge
                image = cv2.resize(
                    image,
                    (round(width * scale), round(height * scale)),
                    interpolation=cv2.INTER_AREA,
                )
            encoded, jpeg = cv2.imencode(
                ".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 80]
            )
        except (AttributeError, TypeError, ValueError, cv2.error) as exc:
            raise VlmRequestError("VLM image encoding failed") from exc
        if not encoded:
            raise VlmRequestError("VLM image encoding failed")
        image_base64 = base64.b64encode(jpeg).decode("ascii")
        return {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"},
        }

    def _post_json(self, path: str, payload: dict[str, object]) -> dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        http_request = request.Request(
            f"{self.base_url}{path}",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with request.urlopen(http_request, timeout=self.timeout_seconds) as http_response:
                response_body = http_response.read()
        except error.HTTPError as exc:
            raise VlmRequestError(f"VLM request failed: HTTP {exc.code}") from exc
        except TimeoutError as exc:
            raise VlmRequestError("VLM request timed out") from exc
        except error.URLError as exc:
            if isinstance(exc.reason, socket.timeout):
                raise VlmRequestError("VLM request timed out") from exc
            raise VlmRequestError("VLM connection failed") from exc
        except OSError as exc:
            raise VlmRequestError("VLM connection failed") from exc

        try:
            response = json.loads(response_body)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise VlmProtocolError("VLM returned invalid JSON") from exc
        if not isinstance(response, dict):
            raise VlmProtocolError("VLM returned an invalid completion")
        return response

    @staticmethod
    def _monotonic_ns() -> int:
        return time.monotonic_ns()


def _completion_text(response: dict[str, Any]) -> str:
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices:
        raise VlmProtocolError("VLM returned an invalid completion")
    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        raise VlmProtocolError("VLM returned an invalid completion")
    message = first_choice.get("message")
    if not isinstance(message, dict):
        raise VlmProtocolError("VLM returned an invalid completion")
    content = message.get("content")
    if not isinstance(content, str):
        raise VlmProtocolError("VLM returned an invalid completion")
    return content


def _response_model_id(response: dict[str, Any], requested_model_id: str) -> str:
    if "model" not in response or response["model"] is None:
        return requested_model_id
    model_id = response["model"]
    if not isinstance(model_id, str) or not model_id.strip():
        raise VlmProtocolError("VLM returned an invalid model identifier")
    return model_id
