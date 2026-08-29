from __future__ import annotations

# ruff: noqa: E501
import subprocess
import textwrap
from pathlib import Path

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

    assert 'id="semantic-lifecycle" class="semantic-lifecycle" role="status" aria-live="polite"' in html
    assert 'id="semantic-summary" aria-live="polite"' in html
    assert 'id="config-error" class="inline-error" role="alert" aria-live="assertive"' in html


def test_dashboard_contains_semantic_controls_result_and_metrics(client) -> None:
    html = client.get("/").get_data(as_text=True)

    for element_id in (
        "semantic-enabled",
        "semantic-cooldown-seconds",
        "semantic-lifecycle",
        "semantic-summary",
        "semantic-model",
        "semantic-window",
        "semantic-input-frame-count",
        "semantic-processing-ms",
        "semantic-p95-ms",
        "semantic-dropped-count",
        "restart-vlm",
    ):
        assert f'id="{element_id}"' in html


def test_dashboard_script_executes_semantic_interaction_contracts() -> None:
    script_path = Path(__file__).parents[1] / "src/nono_realtime_camera/static/dashboard.js"
    harness = r'''
const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync(process.argv[1], "utf8");

class Element {
  constructor(id) {
    this.id = id;
    this.textContent = "";
    this.className = "";
    this._value = "";
    Object.defineProperty(this, "value", {
      get: () => this._value,
      set: (value) => { this._value = String(value); },
    });
    this.checked = false;
    this.disabled = false;
    this.step = "1";
    this.dataset = {};
    this.children = [];
    this.listeners = new Map();
    this.classList = {
      toggle: (name, force) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        if (force) names.add(name); else names.delete(name);
        this.className = [...names].join(" ");
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }
  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }
  dispatch(name) {
    return this.listeners.get(name)?.({ target: this });
  }
  appendChild(child) { this.children.push(child); }
  prepend(child) { this.children.unshift(child); }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
  querySelector() { return null; }
  set innerHTML(value) { this.children = []; this._innerHTML = value; }
  get innerHTML() { return this._innerHTML || ""; }
}

const ids = [
  "connection-chip", "lifecycle-chip", "window-id", "current-summary",
  "object-list", "presence-change", "motion-state", "confidence", "capture-fps",
  "actual-sample-fps", "actual-preview-fps", "processing-p95", "emit-p95",
  "stale-pending", "frame-age", "semantic-status", "semantic-lifecycle",
  "semantic-enabled", "semantic-enabled-label", "semantic-p95-ms",
  "semantic-dropped-count", "semantic-summary", "semantic-model", "semantic-window",
  "semantic-input-frame-count", "semantic-processing-ms", "config-revision",
  "analysis-enabled", "detector-enabled", "sample-fps", "sample-fps-value",
  "preview-fps", "preview-fps-value", "detection-threshold", "detection-threshold-value",
  "motion-ratio", "motion-ratio-value", "scene-ratio", "scene-ratio-value",
  "semantic-cooldown-seconds", "semantic-cooldown-seconds-value", "event-list",
  "config-error", "start-button", "stop-button", "restart-button", "restart-vlm",
  "camera-stream",
];
const elements = Object.fromEntries(ids.map((id) => [id, new Element(id)]));
for (const [id, key, step] of [
  ["sample-fps", "sampleFps", "1"], ["preview-fps", "previewFps", "1"],
  ["detection-threshold", "detectionScoreThreshold", "0.05"],
  ["motion-ratio", "motionRatioThreshold", "0.001"],
  ["scene-ratio", "sceneRatioThreshold", "0.05"],
  ["semantic-cooldown-seconds", "semanticCooldownSeconds", "1"],
]) { elements[id].dataset.config = key; elements[id].step = step; }
const timers = [];
const fetchCalls = [];
let fetchHandler = async (url) => {
  if (url.startsWith("/api/events")) return jsonResponse({ events: [] });
  if (url === "/api/state") return jsonResponse(state(1));
  throw new Error(`unexpected ${url}`);
};
const document = {
  getElementById: (id) => elements[id],
  querySelectorAll: (selector) => selector === "input[data-config]"
    ? ["sample-fps", "preview-fps", "detection-threshold", "motion-ratio", "scene-ratio", "semantic-cooldown-seconds"].map((id) => elements[id])
    : [],
  createElement: () => new Element("row-cell"),
};
const context = {
  document,
  fetch: (...args) => { fetchCalls.push(args); return fetchHandler(...args); },
  window: {
    clearTimeout: () => {},
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    setInterval: () => 0,
  },
  Date, Number, Set, Promise, Error, JSON,
};
vm.createContext(context);
vm.runInContext(source, context);

function jsonResponse(payload, ok = true) {
  return { ok, headers: { get: () => "application/json" }, json: async () => payload, text: async () => JSON.stringify(payload) };
}
function textResponse(text, ok = false) {
  return { ok, headers: { get: () => "text/plain" }, json: async () => { throw new Error("not json"); }, text: async () => text };
}
function state(revision, { available = true, phase = "ready", latest = true, cooldown = 10 } = {}) {
  return {
    lifecycle: { phase: "running" },
    config: { revision, analysisEnabled: true, detectorEnabled: true, semanticEnabled: true,
      sampleFps: 15, previewFps: 12, detectionScoreThreshold: .45, motionRatioThreshold: .01,
      sceneRatioThreshold: .35, semanticCooldownSeconds: cooldown },
    metrics: { captureFps: 1, sampleFps: 1, previewFps: 1, processingP95Ms: 1, endToEmitP95Ms: 1,
      staleCount: 0, fastPendingDepth: 0, frameAgeMs: 1, semanticProcessingP95Ms: 3200,
      semanticDroppedCount: 2, semanticInputFrameCount: 3 },
    semanticAvailable: available,
    semanticLifecycle: { phase, message: phase === "degraded" ? "offline" : "Qwen ready" },
    latestSemantic: latest ? { semanticSummary: "一位人士站在室内", modelId: "Qwen", windowId: 7, processingMs: 3200 } : null,
  };
}
function expect(condition, message) { if (!condition) throw new Error(message); }
function deferred() { let resolve; return { promise: new Promise((done) => { resolve = done; }), resolve }; }
const flush = () => new Promise((resolve) => setImmediate(resolve));

(async () => {
  context.renderState(state(2));
  expect(elements["semantic-lifecycle"].classList.contains("phase-ready"), "ready lifecycle missing");
  expect(elements["semantic-summary"].textContent === "一位人士站在室内", "semantic result missing");
  expect(elements["restart-vlm"].disabled === false, "available restart disabled");

  context.renderState(state(3, { phase: "degraded", latest: false }));
  expect(elements["semantic-lifecycle"].classList.contains("phase-degraded"), "degraded lifecycle missing");
  expect(!elements["semantic-lifecycle"].classList.contains("phase-ready"), "ready class not cleared");
  expect(elements["semantic-summary"].textContent === "等待真实 VLM 结果", "null semantic summary leaked");
  expect(elements["semantic-model"].textContent === "—", "null semantic model leaked");
  context.renderState(state(4, { available: false, latest: false }));
  expect(elements["semantic-enabled"].disabled, "unavailable semantic switch enabled");
  expect(elements["restart-vlm"].disabled, "unavailable restart enabled");

  context.renderState(state(5, { cooldown: 10 }));
  const cooldown = elements["semantic-cooldown-seconds"];
  cooldown.dispatch("pointerdown");
  cooldown.dispatch("focus");
  cooldown.dispatch("keydown");
  cooldown.value = "12";
  cooldown.dispatch("input");
  cooldown.dispatch("pointerup");
  cooldown.dispatch("pointercancel");
  cooldown.dispatch("blur");
  context.renderState(state(6, { cooldown: 20 }));
  expect(cooldown.value === "12" && elements["semantic-cooldown-seconds-value"].textContent === "12", "poll overwrote pending cooldown edit");
  const firstPatch = deferred();
  fetchHandler = async (url) => url === "/api/config" ? firstPatch.promise : jsonResponse({ events: [] });
  timers.shift()();
  cooldown.value = "13";
  cooldown.dispatch("input");
  firstPatch.resolve(jsonResponse({ config: state(7, { cooldown: 12 }).config }));
  await flush(); await flush();
  context.renderState(state(8, { cooldown: 20 }));
  expect(cooldown.value === "13", "older patch released newer cooldown edit");
  fetchHandler = async (url) => url === "/api/config"
    ? jsonResponse({ config: state(9, { cooldown: 13 }).config })
    : jsonResponse({ events: [] });
  timers.shift()();
  await flush(); await flush();
  context.renderState(state(10, { cooldown: 14 }));
  expect(cooldown.value === "14", `settled cooldown edit did not resync: ${cooldown.value}`);

  context.applyConfig(state(11, { cooldown: 15 }).config);
  context.applyConfig(state(10, { cooldown: 4 }).config);
  expect(elements["config-revision"].textContent === "rev 11" && cooldown.value === "15", "older revision rolled back controls");
  fetchHandler = async (url) => url === "/api/config"
    ? jsonResponse({ config: state(10, { cooldown: 4 }).config })
    : jsonResponse({ events: [] });
  await context.patchConfig({ semanticCooldownSeconds: 4 });
  expect(elements["config-revision"].textContent === "rev 11" && cooldown.value === "15", "older patch response rolled back controls");

  context.renderEvents([
    { sequence: 1, source: "semantic_enrichment", windowId: 7, semanticSummary: "语义", modelId: "Qwen", processingMs: 9 },
    { sequence: 2, source: "fast_path", windowId: 8, summary: "快速", objects: ["person"], motion: "moving", sampledFrameCount: 2, targetFrameCount: 3, processingMs: 4, stale: false },
  ]);
  expect(elements["event-list"].children[0].children[7].textContent === "Fast", "fast event source incorrect");
  expect(elements["event-list"].children[0].children[1].textContent === "快速", "fast event fell back");
  expect(elements["event-list"].children[1].children[7].textContent === "VLM", "semantic event source incorrect");

  context.renderState(state(12));
  const firstToggle = deferred();
  const secondToggle = deferred();
  let toggleCalls = 0;
  fetchHandler = async (url) => {
    if (url !== "/api/config") return jsonResponse({ events: [] });
    return (++toggleCalls === 1 ? firstToggle : secondToggle).promise;
  };
  elements["semantic-enabled"].checked = false;
  const firstToggleRequest = elements["semantic-enabled"].dispatch("change");
  expect(fetchCalls.at(-1)[0] === "/api/config" && fetchCalls.at(-1)[1].method === "PATCH", "semantic toggle listener did not PATCH");
  context.renderState(state(13));
  expect(elements["semantic-enabled"].checked === false, "state poll reverted pending semantic toggle");
  elements["semantic-enabled"].checked = true;
  const secondToggleRequest = elements["semantic-enabled"].dispatch("change");
  firstToggle.resolve(jsonResponse({ config: state(14, { latest: false }).config }));
  await firstToggleRequest;
  context.renderState(state(15));
  expect(elements["semantic-enabled"].checked, "older toggle completion cleared newer edit");
  secondToggle.resolve(jsonResponse({ config: state(16).config }));
  await secondToggleRequest;
  elements["semantic-enabled"].checked = false;
  fetchHandler = async (url) => url === "/api/config"
    ? jsonResponse({ message: "toggle rejected" }, false)
    : jsonResponse({ events: [] });
  await elements["semantic-enabled"].dispatch("change");
  expect(elements["semantic-enabled"].checked, "failed semantic toggle did not roll back trusted config");
  expect(elements["config-error"].textContent === "toggle rejected", "toggle failure message hidden");

  context.renderState(state(17));
  const busyRestart = deferred();
  fetchHandler = async (url) => url === "/api/control/vlm/restart"
    ? busyRestart.promise
    : jsonResponse({ events: [] });
  const inFlightControl = elements["restart-vlm"].dispatch("click");
  expect(fetchCalls.at(-1)[0] === "/api/control/vlm/restart" && fetchCalls.at(-1)[1].method === "POST", "restart listener did not POST");
  expect(elements["restart-vlm"].disabled, "restart was not disabled while busy");
  context.renderState(state(17));
  expect(elements["restart-vlm"].disabled, "state poll reenabled busy restart");
  busyRestart.resolve(textResponse("sidecar offline"));
  await inFlightControl;
  expect(elements["restart-vlm"].disabled === false, "available restart not restored after busy request");
  fetchHandler = async (url) => url === "/api/control/vlm/restart" ? textResponse("sidecar offline") : jsonResponse({ events: [] });
  await elements["restart-vlm"].dispatch("click");
  expect(elements["config-error"].textContent.includes("sidecar offline"), "text restart error hidden");
  expect(elements["restart-vlm"].disabled === false, "available restart not restored");
  fetchHandler = async (url) => url === "/api/control/vlm/restart"
    ? textResponse("<html><title>500</title></html>")
    : jsonResponse({ events: [] });
  await elements["restart-vlm"].dispatch("click");
  expect(elements["config-error"].textContent === "控制操作失败", "HTML restart error was not sanitized");
  context.renderState(state(18, { available: false }));
  await elements["restart-vlm"].dispatch("click");
  expect(elements["restart-vlm"].disabled, "unavailable restart reenabled by finally");

  const delayedState = deferred();
  let stateCalls = 0;
  fetchHandler = async (url) => {
    if (url !== "/api/state") return jsonResponse({ events: [] });
    stateCalls += 1;
    return stateCalls === 1 ? delayedState.promise : jsonResponse(state(21, { cooldown: 15 }));
  };
  const delayedPoll = context.pollState();
  context.pollState(); context.pollState();
  expect(stateCalls === 1, "overlapping state polls were sent");
  delayedState.resolve(jsonResponse(state(20, { cooldown: 15 })));
  await delayedPoll;
  expect(elements["config-revision"].textContent === "rev 20", "completed state poll did not render");
  await context.pollState();
  expect(stateCalls === 2 && elements["config-revision"].textContent === "rev 21", "next state poll was blocked");
  context.renderState(state(20, { cooldown: 4 }));
  expect(elements["config-revision"].textContent === "rev 21", "old state revision rolled back controls");

  const longMessage = "x".repeat(1200);
  context.renderState(state(22));
  fetchHandler = async (url) => url === "/api/control/vlm/restart"
    ? jsonResponse({ message: longMessage }, false)
    : jsonResponse({ events: [] });
  await elements["restart-vlm"].dispatch("click");
  expect(elements["config-error"].textContent.length === 500, "restart JSON message was not bounded");
  expect(context.errorMessage({ message: longMessage }, "fallback").length === 500, "JSON message was not bounded");
  expect(context.errorMessage({ error: longMessage }, "fallback").length === 500, "JSON error was not bounded");
  expect(context.errorMessage(null, "fallback") === "fallback", "null payload was not safe");
  expect(context.errorMessage({ message: 42 }, "fallback") === "fallback", "non-string payload was not safe");
  console.log("dashboard.js durable interaction contract: PASS");
})().catch((error) => { console.error(error.stack); process.exitCode = 1; });
'''
    result = subprocess.run(
        ["node", "-e", textwrap.dedent(harness), str(script_path)],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "dashboard.js durable interaction contract: PASS" in result.stdout


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
