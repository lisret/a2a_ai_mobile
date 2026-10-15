const $ = (id) => document.getElementById(id);
let lastSequence = 0;
let lastConfig = null;
let configTimer = null;
const activeInputs = new Set();

const numberText = (value, digits = 1, suffix = "") =>
  Number.isFinite(Number(value)) ? `${Number(value).toFixed(digits)}${suffix}` : "—";

function setConnection(ok) {
  const chip = $("connection-chip");
  chip.textContent = ok ? "本机已连接" : "连接中断";
  chip.className = `chip ${ok ? "running" : "disconnected"}`;
}

function syncControl(id, value, digits = 0) {
  const input = $(id);
  if (!activeInputs.has(id)) input.value = value;
  $(`${id}-value`).textContent = Number(value).toFixed(digits);
}

function renderState(state) {
  setConnection(true);
  const lifecycle = state.lifecycle || {};
  const chip = $("lifecycle-chip");
  chip.textContent = lifecycle.phase || "unknown";
  chip.className = `chip ${lifecycle.phase || "neutral"}`;
  const summary = state.latestSummary;
  if (summary) {
    $("window-id").textContent = `窗口 #${summary.windowId} · ${summary.sampledFrameCount}/${summary.targetFrameCount} 帧`;
    $("current-summary").textContent = summary.summary;
    $("object-list").textContent = summary.objects.length ? summary.objects.join(", ") : "无可靠对象";
    $("presence-change").textContent = summary.presenceChange;
    $("motion-state").textContent = summary.motion;
    $("confidence").textContent = numberText(summary.confidence * 100, 0, "%");
  }
  const metrics = state.metrics || {};
  $("capture-fps").textContent = numberText(metrics.captureFps);
  $("actual-sample-fps").textContent = numberText(metrics.sampleFps);
  $("actual-preview-fps").textContent = numberText(metrics.previewFps);
  $("processing-p95").textContent = numberText(metrics.processingP95Ms, 0, " ms");
  $("emit-p95").textContent = numberText(metrics.endToEmitP95Ms, 0, " ms");
  $("stale-pending").textContent = `${metrics.staleCount || 0} / ${metrics.fastPendingDepth || 0}`;
  $("frame-age").textContent = `frame age ${numberText(metrics.frameAgeMs, 0, "ms")}`;
  $("semantic-status").textContent = state.semanticAvailable ? "真实 worker 已连接" : "未配置真实 VLM";
  applyConfig(state.config);
}

function applyConfig(config) {
  if (!config) return;
  lastConfig = config;
  $("config-revision").textContent = `rev ${config.revision}`;
  if (!activeInputs.has("analysis-enabled")) $("analysis-enabled").checked = config.analysisEnabled;
  if (!activeInputs.has("detector-enabled")) $("detector-enabled").checked = config.detectorEnabled;
  syncControl("sample-fps", config.sampleFps, 0);
  syncControl("preview-fps", config.previewFps, 0);
  syncControl("detection-threshold", config.detectionScoreThreshold, 2);
  syncControl("motion-ratio", config.motionRatioThreshold, 3);
  syncControl("scene-ratio", config.sceneRatioThreshold, 2);
}

async function pollState() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("state request failed");
    renderState(await response.json());
  } catch (_) {
    setConnection(false);
  }
}

function renderEvents(events) {
  const body = $("event-list");
  if (body.querySelector(".empty")) body.innerHTML = "";
  for (const event of events) {
    lastSequence = Math.max(lastSequence, event.sequence);
    const row = document.createElement("tr");
    const values = [
      `#${event.windowId}`,
      event.summary,
      (event.objects || []).join(", ") || "—",
      event.motion,
      `${event.sampledFrameCount}/${event.targetFrameCount}`,
      `${event.processingMs} ms`,
      event.stale ? "stale" : "fresh",
    ];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 6) cell.className = event.stale ? "status-stale" : "status-ok";
      row.appendChild(cell);
    });
    body.prepend(row);
  }
  while (body.children.length > 60) body.removeChild(body.lastChild);
}

async function pollEvents() {
  try {
    const response = await fetch(`/api/events?after=${lastSequence}`, { cache: "no-store" });
    if (response.ok) renderEvents((await response.json()).events || []);
  } catch (_) { /* state poll owns disconnect banner */ }
}

async function patchConfig(patch) {
  try {
    const response = await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "参数更新失败");
    $("config-error").textContent = "";
    applyConfig(payload.config);
  } catch (error) {
    $("config-error").textContent = error.message;
    applyConfig(lastConfig);
  }
}

function queuePatch(key, value) {
  window.clearTimeout(configTimer);
  configTimer = window.setTimeout(() => patchConfig({ [key]: value }), 150);
}

for (const input of document.querySelectorAll("input[data-config]")) {
  input.addEventListener("pointerdown", () => activeInputs.add(input.id));
  input.addEventListener("pointerup", () => activeInputs.delete(input.id));
  input.addEventListener("input", () => {
    const digits = input.step.includes(".") ? input.step.split(".")[1].length : 0;
    $(`${input.id}-value`).textContent = Number(input.value).toFixed(digits);
    queuePatch(input.dataset.config, Number(input.value));
  });
}

$("analysis-enabled").addEventListener("change", (event) => patchConfig({ analysisEnabled: event.target.checked }));
$("detector-enabled").addEventListener("change", (event) => patchConfig({ detectorEnabled: event.target.checked }));

async function control(action) {
  const buttons = [$("start-button"), $("stop-button"), $("restart-button")];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await fetch(`/api/control/${action}`, { method: "POST" });
    if (action === "start" || action === "restart-camera") {
      $("camera-stream").src = `/video.mjpg?t=${Date.now()}`;
    }
    await pollState();
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

$("start-button").addEventListener("click", () => control("start"));
$("stop-button").addEventListener("click", () => control("stop"));
$("restart-button").addEventListener("click", () => control("restart-camera"));

pollState();
pollEvents();
window.setInterval(pollState, 250);
window.setInterval(pollEvents, 500);
