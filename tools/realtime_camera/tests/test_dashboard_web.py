from __future__ import annotations

import numpy as np
import pytest

from nono_realtime_camera.dashboard_runtime import DashboardRuntime
from nono_realtime_camera.dashboard_web import create_dashboard_app
from nono_realtime_camera.frames import FramePacket


class IdleCamera:
    def open(self) -> None:
        pass

    def read(self) -> FramePacket:
        return FramePacket(1, 1, np.zeros((8, 8, 3), dtype=np.uint8))

    def close(self) -> None:
        pass


@pytest.fixture
def runtime() -> DashboardRuntime:
    value = DashboardRuntime(camera_factory=IdleCamera)
    yield value
    value.close()


@pytest.fixture
def client(runtime: DashboardRuntime):
    app = create_dashboard_app(runtime)
    app.config.update(TESTING=True)
    return app.test_client()


def test_dashboard_page_contains_required_controls(client) -> None:
    response = client.get("/")
    html = response.get_data(as_text=True)

    assert response.status_code == 200
    for element_id in (
        "camera-stream",
        "lifecycle-chip",
        "current-summary",
        "sample-fps",
        "detection-threshold",
        "motion-ratio",
        "scene-ratio",
        "event-list",
        "start-button",
        "stop-button",
        "restart-button",
    ):
        assert f'id="{element_id}"' in html


def test_state_returns_authoritative_config(client) -> None:
    payload = client.get("/api/state").get_json()

    assert payload["config"]["sampleFps"] == 15
    assert payload["lifecycle"]["phase"] == "idle"


def test_patch_config_returns_new_revision(client) -> None:
    response = client.patch("/api/config", json={"sampleFps": 12})

    assert response.status_code == 200
    assert response.json["config"]["sampleFps"] == 12
    assert response.json["config"]["revision"] == 2


def test_unknown_config_is_400_and_atomic(client) -> None:
    response = client.patch("/api/config", json={"madeUp": 1})

    assert response.status_code == 400
    assert response.json["code"] == "invalid_config"
    assert client.get("/api/state").json["config"]["revision"] == 1


def test_events_are_filtered_by_sequence(client, runtime: DashboardRuntime) -> None:
    from test_dashboard_state import make_summary

    runtime.state_store.record_event(make_summary(1))
    runtime.state_store.record_event(make_summary(2))

    response = client.get("/api/events?after=1")

    assert [event["windowId"] for event in response.json["events"]] == [2]


def test_control_routes_are_idempotent(client, runtime: DashboardRuntime) -> None:
    assert client.post("/api/control/start").status_code == 200
    assert client.post("/api/control/start").status_code == 200
    assert runtime.is_running is True
    assert client.post("/api/control/stop").status_code == 200
    assert client.post("/api/control/stop").status_code == 200
    assert runtime.is_running is False


def test_restart_vlm_route_does_not_restart_camera(
    client, runtime: DashboardRuntime, monkeypatch: pytest.MonkeyPatch
) -> None:
    vlm_restarts = 0
    camera_restarts = 0

    def restart_vlm() -> None:
        nonlocal vlm_restarts
        vlm_restarts += 1

    def restart_camera() -> None:
        nonlocal camera_restarts
        camera_restarts += 1

    monkeypatch.setattr(runtime, "restart_vlm", restart_vlm)
    monkeypatch.setattr(runtime, "restart_camera", restart_camera)

    response = client.post("/api/control/vlm/restart")

    assert response.status_code == 200
    assert response.json == {"ok": True}
    assert vlm_restarts == 1
    assert camera_restarts == 0


def test_mjpeg_stream_yields_latest_jpeg(client, runtime: DashboardRuntime) -> None:
    runtime.latest_jpeg_store.put(b"jpeg-data")

    response = client.get("/video.mjpg", buffered=False)
    chunk = next(response.response)
    response.close()

    assert response.status_code == 200
    assert b"--frame" in chunk
    assert b"Content-Type: image/jpeg" in chunk
    assert b"jpeg-data" in chunk
