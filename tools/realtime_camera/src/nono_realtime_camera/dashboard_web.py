from __future__ import annotations

from collections.abc import Iterator

from flask import Flask, Response, jsonify, render_template, request

from .dashboard_config import ConfigValidationError
from .dashboard_runtime import DashboardRuntime


def create_dashboard_app(runtime: DashboardRuntime) -> Flask:
    app = Flask(__name__, template_folder="templates", static_folder="static")

    @app.get("/")
    def index() -> str:
        return render_template("dashboard.html")

    @app.get("/video.mjpg")
    def video() -> Response:
        response = Response(
            _mjpeg_stream(runtime),
            mimetype="multipart/x-mixed-replace; boundary=frame",
        )
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        return response

    @app.get("/api/state")
    def state() -> Response:
        payload = runtime.state_store.snapshot(runtime.config_store.snapshot())
        return jsonify(payload)

    @app.get("/api/events")
    def events() -> tuple[Response, int] | Response:
        raw_after = request.args.get("after", "0")
        try:
            after = int(raw_after)
        except ValueError:
            return jsonify({"code": "invalid_sequence", "message": "after must be an integer"}), 400
        if after < 0:
            error = {"code": "invalid_sequence", "message": "after must be non-negative"}
            return jsonify(error), 400
        return jsonify({"events": runtime.state_store.events_after(after)})

    @app.patch("/api/config")
    def patch_config() -> tuple[Response, int] | Response:
        patch = request.get_json(silent=True)
        if not isinstance(patch, dict):
            return jsonify({"code": "invalid_config", "message": "JSON object required"}), 400
        try:
            config = runtime.config_store.update(patch)
        except ConfigValidationError as error:
            return jsonify({"code": "invalid_config", "message": str(error)}), 400
        return jsonify({"config": config.to_dict()})

    @app.post("/api/control/start")
    def start() -> Response:
        runtime.start()
        return jsonify({"ok": True, "running": runtime.is_running})

    @app.post("/api/control/stop")
    def stop() -> Response:
        runtime.stop()
        return jsonify({"ok": True, "running": runtime.is_running})

    @app.post("/api/control/restart-camera")
    def restart_camera() -> Response:
        runtime.restart_camera()
        return jsonify({"ok": True, "running": runtime.is_running})

    return app


def _mjpeg_stream(runtime: DashboardRuntime) -> Iterator[bytes]:
    generation = 0
    while True:
        generation, jpeg = runtime.latest_jpeg_store.wait_after(generation, timeout=5)
        if jpeg is None:
            if runtime.latest_jpeg_store.closed:
                return
            continue
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n"
            + f"Content-Length: {len(jpeg)}\r\n\r\n".encode()
            + jpeg
            + b"\r\n"
        )
