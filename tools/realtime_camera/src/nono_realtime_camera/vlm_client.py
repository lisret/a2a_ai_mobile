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
    "Compare these camera frames in time order. Briefly describe the scene and any "
    "meaningful changes or actions in Chinese."
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
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model_id = model_id
        self.timeout_seconds = timeout_seconds
        self.max_tokens = max_tokens

    def describe(self, frames: tuple[FramePacket, ...]) -> VlmResult:
        if not frames:
            raise ValueError("at least one frame is required")

        content = [self._image_part(frame) for frame in frames]
        content.append({"type": "text", "text": _SEMANTIC_PROMPT})
        payload = {
            "model": self.model_id,
            "messages": [{"role": "user", "content": content}],
            "max_tokens": self.max_tokens,
            "temperature": 0,
        }
        started_ns = self._monotonic_ns()
        response = self._post_json("/v1/chat/completions", payload)
        summary = _completion_text(response).strip()[:_MAX_SUMMARY_CHARACTERS]
        if not summary:
            raise VlmProtocolError("VLM returned an empty summary")
        processing_ms = (self._monotonic_ns() - started_ns) // 1_000_000
        return VlmResult(str(response.get("model") or self.model_id), summary, processing_ms)

    def _image_part(self, frame: FramePacket) -> dict[str, object]:
        try:
            encoded, jpeg = cv2.imencode(
                ".jpg", frame.image, [cv2.IMWRITE_JPEG_QUALITY, 80]
            )
        except cv2.error as exc:
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
