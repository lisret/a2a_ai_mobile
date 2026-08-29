const $ = (id) => document.getElementById(id);
let lastSequence = 0;
let lastConfig = null;
let statePollInFlight = false;
let semanticAvailable = false;
let controlInFlight = false;
const configEdits = new Map();
const SEMANTIC_PHASE_LABELS = {
  "disabled": "已禁用",
  "loading": "加载中",
  "ready": "就绪",
  "running": "分析中",
  "degraded": "降级",
  "stopped": "已停止",
};

const numberText = (value, digits = 1, suffix = "") =>
  Number.isFinite(Number(value)) ? `${Number(value).toFixed(digits)}${suffix}` : "—";

function setConnection(ok) {
  const chip = $("connection-chip");
  chip.textContent = ok ? "本机已连接" : "连接中断";
  chip.className = `chip ${ok ? "running" : "disconnected"}`;
}

function syncControl(id, value, digits = 0) {
  const input = $(id);
  if (configEdits.has(id)) return;
  input.value = value;
  $(`${id}-value`).textContent = Number(value).toFixed(digits);
}

function startConfigEdit(input) {
  if (!configEdits.has(input.id)) configEdits.set(input.id, { dirty: false, generation: 0, timer: null });
}

function endConfigEdit(input) {
  const edit = configEdits.get(input.id);
  if (edit && !edit.dirty) configEdits.delete(input.id);
}

function settleConfigEdit(id, generation) {
  const edit = configEdits.get(id);
  if (edit?.generation !== generation) return false;
  configEdits.delete(id);
  return true;
}

function beginConfigMutation(input) {
  startConfigEdit(input);
  const edit = configEdits.get(input.id);
  edit.dirty = true;
  edit.generation += 1;
  return { edit, generation: edit.generation };
}

function setControlAvailability() {
  $("semantic-enabled").disabled = !semanticAvailable;
  $("semantic-enabled-label").classList.toggle("disabled", !semanticAvailable);
  $("restart-vlm").disabled = !semanticAvailable || controlInFlight;
}

function renderSemantic(state) {
  const lifecycle = state.semanticLifecycle || { phase: "disabled", message: null };
  const phase = lifecycle.phase || "disabled";
  const label = SEMANTIC_PHASE_LABELS[phase] || phase;
  const lifecycleChip = $("semantic-lifecycle");
  lifecycleChip.textContent = `${label} · ${phase}`;
  lifecycleChip.className = `semantic-lifecycle phase-${phase}`;
  semanticAvailable = Boolean(state.semanticAvailable);
  setControlAvailability();

  const metrics = state.metrics || {};
  $("semantic-p95-ms").textContent = numberText(metrics.semanticProcessingP95Ms, 0, " ms");
  $("semantic-dropped-count").textContent = String(metrics.semanticDroppedCount || 0);
  const semantic = state.latestSemantic;
  $("semantic-summary").textContent = semantic?.semanticSummary || "等待真实 VLM 结果";
  $("semantic-model").textContent = semantic?.modelId || "—";
  $("semantic-window").textContent = semantic ? `#${semantic.windowId}` : "—";
  $("semantic-input-frame-count").textContent = semantic
    ? String(metrics.semanticInputFrameCount || 0)
    : "—";
  $("semantic-processing-ms").textContent = semantic
    ? `${semantic.processingMs} ms`
    : "—";
  const availability = state.semanticAvailable ? "真实 worker 已连接" : "未配置真实 VLM";
  $("semantic-status").textContent = lifecycle.message || availability;
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
  applyConfig(state.config);
  renderSemantic(state);
}

function applyConfig(config) {
  if (!config) return;
  if (lastConfig && config.revision < lastConfig.revision) return;
  lastConfig = config;
  $("config-revision").textContent = `rev ${config.revision}`;
  if (!configEdits.has("analysis-enabled")) $("analysis-enabled").checked = config.analysisEnabled;
  if (!configEdits.has("detector-enabled")) $("detector-enabled").checked = config.detectorEnabled;
  if (!configEdits.has("semantic-enabled")) $("semantic-enabled").checked = config.semanticEnabled;
  syncControl("sample-fps", config.sampleFps, 0);
  syncControl("preview-fps", config.previewFps, 0);
  syncControl("detection-threshold", config.detectionScoreThreshold, 2);
  syncControl("motion-ratio", config.motionRatioThreshold, 3);
  syncControl("scene-ratio", config.sceneRatioThreshold, 2);
  syncControl("semantic-cooldown-seconds", config.semanticCooldownSeconds, 0);
}

async function pollState() {
  if (statePollInFlight) return;
  statePollInFlight = true;
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("state request failed");
    const state = await response.json();
    renderState(state);
  } catch (_) {
    setConnection(false);
  } finally {
    statePollInFlight = false;
  }
}

function renderEvents(events) {
  const body = $("event-list");
  if (body.querySelector(".empty")) body.innerHTML = "";
  for (const event of events) {
    lastSequence = Math.max(lastSequence, event.sequence);
    const row = document.createElement("tr");
    const isSemantic = event.source === "semantic_enrichment";
    const sourceLabel = event.source === "semantic_enrichment" ? "VLM" : "Fast";
    const values = isSemantic
      ? [
          `#${event.windowId}`,
          event.semanticSummary,
          event.modelId,
          "—",
          "—",
          `${event.processingMs} ms`,
          "fresh",
          sourceLabel,
        ]
      : [
          `#${event.windowId}`,
          event.summary,
          (event.objects || []).join(", ") || "—",
          event.motion,
          `${event.sampledFrameCount}/${event.targetFrameCount}`,
          `${event.processingMs} ms`,
          event.stale ? "stale" : "fresh",
          sourceLabel,
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

async function patchConfig(patch, editedControlId = null, editedGeneration = null) {
  const controlId = editedControlId || (Object.keys(patch).length === 1
    ? [...document.querySelectorAll("input[data-config]")].find((input) => input.dataset.config === Object.keys(patch)[0])?.id
    : null);
  const generation = editedGeneration ?? (controlId ? configEdits.get(controlId)?.generation : null);
  try {
    const response = await fetch("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const payload = await responsePayload(response);
    if (!response.ok) throw new Error(errorMessage(payload, "参数更新失败"));
    $("config-error").textContent = "";
    applyConfig(payload.config);
  } catch (error) {
    $("config-error").textContent = errorMessage({ message: error?.message }, "参数更新失败");
  } finally {
    let settled = false;
    if (controlId && generation !== undefined && generation !== null) {
      settled = settleConfigEdit(controlId, generation);
    }
    if (settled && $("config-error").textContent) applyConfig(lastConfig);
  }
}

function queuePatch(input, value) {
  const { edit, generation } = beginConfigMutation(input);
  window.clearTimeout(edit.timer);
  edit.timer = window.setTimeout(
    () => patchConfig({ [input.dataset.config]: value }, input.id, generation),
    150,
  );
  return generation;
}

for (const input of document.querySelectorAll("input[data-config]")) {
  input.addEventListener("pointerdown", () => startConfigEdit(input));
  input.addEventListener("focus", () => startConfigEdit(input));
  input.addEventListener("keydown", () => startConfigEdit(input));
  input.addEventListener("pointerup", () => endConfigEdit(input));
  input.addEventListener("pointercancel", () => endConfigEdit(input));
  input.addEventListener("blur", () => endConfigEdit(input));
  input.addEventListener("input", () => {
    const digits = input.step.includes(".") ? input.step.split(".")[1].length : 0;
    $(`${input.id}-value`).textContent = Number(input.value).toFixed(digits);
    queuePatch(input, Number(input.value));
  });
}

$("analysis-enabled").addEventListener("change", (event) => patchConfig({ analysisEnabled: event.target.checked }));
$("detector-enabled").addEventListener("change", (event) => patchConfig({ detectorEnabled: event.target.checked }));
$("semantic-enabled").addEventListener("change", (event) => {
  const { generation } = beginConfigMutation(event.target);
  return patchConfig({ semanticEnabled: event.target.checked }, event.target.id, generation);
});

async function responsePayload(response) {
  const contentType = response.headers?.get("content-type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      return await response.json();
    } catch (_) { /* fall through to a text error */ }
  }
  const text = typeof response.text === "function" ? await response.text().catch(() => "") : "";
  return text ? { message: text.slice(0, 500) } : {};
}

function errorMessage(payload, fallback) {
  const message = payload && typeof payload === "object" ? payload.message ?? payload.error : "";
  const safeMessage = typeof message === "string" ? message.trim().slice(0, 500) : "";
  return safeMessage && !/<\/?[a-z!][^>]*>/i.test(safeMessage)
    ? safeMessage
    : fallback;
}

async function control(action) {
  const buttons = [$("start-button"), $("stop-button"), $("restart-button"), $("restart-vlm")];
  controlInFlight = true;
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const response = await fetch(`/api/control/${action}`, { method: "POST" });
    const payload = await responsePayload(response);
    if (!response.ok) throw new Error(errorMessage(payload, "控制操作失败"));
    $("config-error").textContent = "";
    if (action === "start" || action === "restart-camera") {
      $("camera-stream").src = `/video.mjpg?t=${Date.now()}`;
    }
    await pollState();
  } catch (error) {
    $("config-error").textContent = errorMessage({ message: error?.message }, "控制操作失败");
  } finally {
    controlInFlight = false;
    $("start-button").disabled = false;
    $("stop-button").disabled = false;
    $("restart-button").disabled = false;
    setControlAvailability();
  }
}

$("start-button").addEventListener("click", () => control("start"));
$("stop-button").addEventListener("click", () => control("stop"));
$("restart-button").addEventListener("click", () => control("restart-camera"));
$("restart-vlm").addEventListener("click", () => control("vlm/restart"));

pollState();
pollEvents();
window.setInterval(pollState, 250);
window.setInterval(pollEvents, 500);
