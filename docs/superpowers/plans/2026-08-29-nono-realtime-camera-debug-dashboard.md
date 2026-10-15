# NoNo Realtime Camera Debug Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This thread executes inline because no subagent delegation was requested.

**Goal:** Build a loopback-only browser dashboard that shows the Mac camera with detection overlays, exposes live pipeline metrics and hot parameters, and runs capture, fast analysis, preview, and optional semantic work without blocking one another.

**Architecture:** Keep the existing CLI runtime intact and add `DashboardRuntime`, which owns a continuous capture thread, a monotonic one-second scheduler, latest-only fast analysis, a latest-JPEG preview encoder, and bounded state/event stores. Flask 3.1.3 serves a same-origin HTML/JS dashboard, MJPEG generator, and JSON control/config endpoints.

**Tech Stack:** Python 3.11.15, Flask 3.1.3, MediaPipe 0.10.31, OpenCV 4.12.0, NumPy 2.2.6, pytest 8.4.1, vanilla HTML/CSS/JavaScript.

**Spec:** `docs/superpowers/specs/2026-08-29-nono-realtime-camera-debug-dashboard-design.md`

## Global Constraints

- Bind to `127.0.0.1` by default and do not enable CORS.
- Preserve `nono-camera preflight` and `nono-camera run` behavior.
- Camera capture, preview encoding, fast analysis, semantic analysis, and HTTP clients may not share an unbounded queue.
- External summaries stay at 1 Hz; default analysis sample rate is 15 FPS and preview is 12 FPS.
- Fast work budget is 700ms; pending depth is at most one.
- Raw frames, JPEGs, and semantic input images stay in memory and never enter JSON logs or `.runtime/`.
- MediaPipe stays at 0.10.31; a dependency upgrade requires the same real-model smoke test that exposed the 1.0.1 Metal abort.
- Real semantic output is optional for dashboard availability, but an unavailable worker must be explicit and may not emit placeholder descriptions.
- All production behavior follows RED → GREEN and all current 34 tests remain green.

---

## File Map

| File | Responsibility |
| --- | --- |
| `dashboard_config.py` | Immutable config contract, range validation, versioned hot updates |
| `latest_value.py` | Condition-backed latest-only value/generation store for frames and JPEGs |
| `dashboard_state.py` | Lifecycle, metrics, bounded event history and API serialization |
| `dashboard_runtime.py` | Capture, sample, one-second schedule, fast-worker and lifecycle composition |
| `preview.py` | Draw latest boxes/status on a copy and encode latest JPEG |
| `dashboard_web.py` | Flask app factory and loopback API routes |
| `templates/dashboard.html` | Semantic dashboard markup |
| `static/dashboard.css` | Responsive dark UI |
| `static/dashboard.js` | Polling, MJPEG, control buttons, debounced PATCH requests |

### Task 1: Versioned dashboard configuration

**Files:**

- Modify: `tools/realtime_camera/pyproject.toml`
- Create: `tools/realtime_camera/src/nono_realtime_camera/dashboard_config.py`
- Create: `tools/realtime_camera/tests/test_dashboard_config.py`

**Interfaces:**

- Produces `DashboardConfigV1`, `DashboardConfigStore.snapshot()`, and `DashboardConfigStore.update(patch)`.
- Later workers read one immutable snapshot per tick/window; Flask serializes `to_dict()`.

- [ ] **Step 1: Add failing config tests**

```python
def test_update_increments_revision_without_mutating_previous_snapshot() -> None:
    store = DashboardConfigStore()
    before = store.snapshot()
    after = store.update({"sampleFps": 12, "detectionScoreThreshold": 0.6})
    assert before.sample_fps == 15
    assert after.sample_fps == 12
    assert after.detection_score_threshold == 0.6
    assert after.revision == before.revision + 1

@pytest.mark.parametrize("patch", [
    {"sampleFps": 1},
    {"previewFps": 21},
    {"motionRatioThreshold": float("nan")},
    {"unknown": 1},
])
def test_invalid_patch_is_atomic(patch: dict[str, object]) -> None:
    store = DashboardConfigStore()
    before = store.snapshot()
    with pytest.raises(ConfigValidationError):
        store.update(patch)
    assert store.snapshot() == before
```

- [ ] **Step 2: Run RED**

```bash
cd tools/realtime_camera
PYTHONPATH=src .venv/bin/pytest tests/test_dashboard_config.py -q
```

Expected: collection fails because `dashboard_config` does not exist.

- [ ] **Step 3: Implement the immutable contract and add Flask**

```python
@dataclass(frozen=True, slots=True)
class DashboardConfigV1:
    revision: int = 1
    analysis_enabled: bool = True
    detector_enabled: bool = True
    semantic_enabled: bool = False
    sample_fps: int = 15
    preview_fps: int = 12
    detection_score_threshold: float = 0.45
    motion_pixel_threshold: int = 20
    motion_ratio_threshold: float = 0.01
    scene_ratio_threshold: float = 0.35
    semantic_cooldown_seconds: int = 10
    schema_version: int = 1
```

`update()` maps exact camelCase API names, rejects unknown keys and booleans passed as numbers, validates every candidate before swapping under a lock, and increments revision once per successful PATCH. Add `flask==3.1.3` to production dependencies and regenerate `uv.lock` with `uv sync`.

- [ ] **Step 4: Run GREEN and lint**

```bash
PYTHONPATH=src .venv/bin/pytest tests/test_dashboard_config.py -q
.venv/bin/ruff check src tests
```

- [ ] **Step 5: Commit**

```bash
git add tools/realtime_camera/pyproject.toml tools/realtime_camera/uv.lock \
  tools/realtime_camera/src/nono_realtime_camera/dashboard_config.py \
  tools/realtime_camera/tests/test_dashboard_config.py
git commit -m "feat: add versioned camera dashboard config"
```

### Task 2: Latest-only frame/JPEG stores and bounded dashboard state

**Files:**

- Create: `tools/realtime_camera/src/nono_realtime_camera/latest_value.py`
- Create: `tools/realtime_camera/src/nono_realtime_camera/dashboard_state.py`
- Create: `tools/realtime_camera/tests/test_latest_value.py`
- Create: `tools/realtime_camera/tests/test_dashboard_state.py`

**Interfaces:**

- Produces `LatestValueStore[T].put(value)`, `.get()`, `.wait_after(generation, timeout)`, `.close()`.
- Produces `DashboardStateStore.record_event(event)`, `.events_after(sequence)`, `.update_metrics(...)`, `.snapshot(config)`.

- [ ] **Step 1: Add failing store tests**

```python
def test_latest_store_overwrites_without_queueing() -> None:
    store = LatestValueStore[int]()
    assert store.put(1) == 1
    assert store.put(2) == 2
    generation, value = store.get()
    assert (generation, value) == (2, 2)

def test_event_history_is_bounded_and_sequence_addressable() -> None:
    state = DashboardStateStore(event_limit=3)
    for window_id in range(1, 5):
        state.record_event(make_summary(window_id))
    assert [row["sequence"] for row in state.events_after(0)] == [2, 3, 4]
    assert [row["windowId"] for row in state.events_after(2)] == [3, 4]
```

Also verify a waiting MJPEG client wakes on `close()` and that state JSON contains no `image`, `jpeg`, `frame`, or pixel payload.

- [ ] **Step 2: Run RED**

```bash
PYTHONPATH=src .venv/bin/pytest tests/test_latest_value.py tests/test_dashboard_state.py -q
```

- [ ] **Step 3: Implement minimal stores**

`LatestValueStore` uses one `Condition`, one value, one monotonically increasing generation, and no deque. `DashboardStateStore` uses `deque(maxlen=120)` for serialized structured events and rolling numeric samples capped at 300. Its API snapshot contains lifecycle, latest summary, configuration, capture/sample/preview FPS, processing and end-to-emit P50/P95, stale/dropped counts, pending depths, frame age and semantic availability.

- [ ] **Step 4: Run GREEN**

```bash
PYTHONPATH=src .venv/bin/pytest tests/test_latest_value.py tests/test_dashboard_state.py -q
```

- [ ] **Step 5: Commit**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/latest_value.py \
  tools/realtime_camera/src/nono_realtime_camera/dashboard_state.py \
  tools/realtime_camera/tests/test_latest_value.py \
  tools/realtime_camera/tests/test_dashboard_state.py
git commit -m "feat: add bounded realtime dashboard state"
```

### Task 3: Decoupled capture and one-second dashboard runtime

**Files:**

- Create: `tools/realtime_camera/src/nono_realtime_camera/dashboard_runtime.py`
- Modify: `tools/realtime_camera/src/nono_realtime_camera/mediapipe_detector.py`
- Modify: `tools/realtime_camera/src/nono_realtime_camera/latest_only.py`
- Create: `tools/realtime_camera/tests/test_dashboard_runtime.py`
- Modify: `tools/realtime_camera/tests/test_mediapipe_detector.py`

**Interfaces:**

- Consumes config/state/latest stores from Tasks 1–2 and existing camera/window/motion contracts.
- Produces `DashboardRuntime.start()`, `.stop()`, `.restart_camera()`, `.is_running`, `.latest_frame_store`, `.state_store`.

- [ ] **Step 1: Add failing scheduler tests**

```python
def test_slow_fast_worker_never_stops_capture_or_builds_a_queue() -> None:
    camera = ContinuousFakeCamera(frame_period_ms=50)
    detector = BlockingDetector()
    runtime = DashboardRuntime(camera_factory=lambda: camera, detector=detector)
    runtime.start()
    detector.wait_until_running()
    advance_clock_ms(3_000)
    assert camera.read_count >= 50
    assert runtime.state_store.snapshot(runtime.config_store.snapshot())["fastPendingDepth"] <= 1
    runtime.stop()

def test_hot_sample_fps_change_applies_to_next_window_only() -> None:
    runtime = make_fake_runtime(sample_fps=8)
    runtime.start()
    advance_clock_ms(1_000)
    runtime.config_store.update({"sampleFps": 12})
    advance_clock_ms(1_000)
    assert [e["targetFrameCount"] for e in runtime.state_store.events_after(0)] == [8, 12]
```

Cover idempotent start/stop, camera-open failure, stop while detector is blocked, absolute deadline cadence, stale fallback after 700ms, pending replacement, and detector-disabled motion-only results.

- [ ] **Step 2: Run RED**

```bash
PYTHONPATH=src .venv/bin/pytest tests/test_dashboard_runtime.py -q
```

- [ ] **Step 3: Implement capture/scheduler/fast workers**

`CaptureWorker` continuously calls `camera.read()` and writes `FramePacket` to the latest-frame store. `AnalysisScheduler` wakes from an injected monotonic clock, samples the latest new generation at the current config rate, freezes `[start,end)` at absolute one-second deadlines, and submits to a `LatestOnlyExecutor`. The worker constructs `MotionAnalyzer` from that window's config snapshot, calls the detector on the last frame, applies software score filtering, updates the tracker, and records a result only if its generation remains valid. The deadline thread emits the latest confirmed result or a `stale=True` copy after 700ms without waiting for the worker.

Move the MediaPipe creation threshold to fixed `0.15`; expose raw mapped results at or above 0.15 so dashboard filtering can change without rebuilding the model. Extend `LatestOnlyExecutor` with read-only `pending_depth` and `running` properties under its condition lock.

- [ ] **Step 4: Run GREEN and regression**

```bash
PYTHONPATH=src .venv/bin/pytest tests/test_dashboard_runtime.py \
  tests/test_runtime.py tests/test_latest_only.py tests/test_mediapipe_detector.py -q
```

- [ ] **Step 5: Commit**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/dashboard_runtime.py \
  tools/realtime_camera/src/nono_realtime_camera/mediapipe_detector.py \
  tools/realtime_camera/src/nono_realtime_camera/latest_only.py \
  tools/realtime_camera/tests/test_dashboard_runtime.py \
  tools/realtime_camera/tests/test_mediapipe_detector.py
git commit -m "feat: decouple camera capture and one-second analysis"
```

### Task 4: Latest annotated MJPEG preview

**Files:**

- Create: `tools/realtime_camera/src/nono_realtime_camera/preview.py`
- Create: `tools/realtime_camera/tests/test_preview.py`

**Interfaces:**

- Produces `PreviewEncoder.start()`, `.stop()`, `.jpeg_store` and pure `annotate_frame(frame, overlay, now_ms)`.
- Consumes latest raw frame, latest fast overlay, and `preview_fps` config.

- [ ] **Step 1: Add failing preview tests**

```python
def test_annotation_does_not_mutate_analysis_frame() -> None:
    source = np.zeros((100, 100, 3), dtype=np.uint8)
    before = source.copy()
    annotated = annotate_frame(source, overlay_with_person_box(), now_ms=1_100)
    assert np.array_equal(source, before)
    assert not np.array_equal(annotated, before)

def test_old_overlay_is_hidden_after_three_seconds() -> None:
    annotated = annotate_frame(blank_frame(), overlay_with_person_box(at_ms=1_000), now_ms=4_100)
    assert np.array_equal(annotated, blank_frame())
```

Also assert 1.5–3.0s boxes use gray, Unicode-unsafe text is kept in the HTML summary rather than passed to `cv2.putText`, and repeated encodes overwrite one JPEG generation.

- [ ] **Step 2: Run RED**

```bash
PYTHONPATH=src .venv/bin/pytest tests/test_preview.py -q
```

- [ ] **Step 3: Implement annotation and encoder thread**

Draw ASCII category/score, window ID, motion, processing time and age on a copied image. Convert each `DetectedObject.bbox` to clamped pixel coordinates. Encode with `cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 82])`; on failure increment preview errors and retain the previous JPEG. Schedule using absolute preview deadlines and the latest config snapshot.

- [ ] **Step 4: Run GREEN**

```bash
PYTHONPATH=src .venv/bin/pytest tests/test_preview.py -q
```

- [ ] **Step 5: Commit**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/preview.py \
  tools/realtime_camera/tests/test_preview.py
git commit -m "feat: add latest-only annotated camera preview"
```

### Task 5: Flask loopback API and MJPEG stream

**Files:**

- Create: `tools/realtime_camera/src/nono_realtime_camera/dashboard_web.py`
- Create: `tools/realtime_camera/tests/test_dashboard_web.py`

**Interfaces:**

- Produces `create_dashboard_app(runtime: DashboardRuntime) -> Flask`.
- Routes match the spec exactly and return camelCase JSON.

- [ ] **Step 1: Add failing Flask client tests**

```python
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
```

Cover `/`, `/api/state`, `/api/events?after=`, start/stop/restart idempotency, missing/invalid JSON, integer limits, and MJPEG chunks with `--frame` boundary. Simulate a blocked generator and prove the runtime receives results independently.

- [ ] **Step 2: Run RED**

```bash
PYTHONPATH=src .venv/bin/pytest tests/test_dashboard_web.py -q
```

- [ ] **Step 3: Implement the app factory**

Use `Flask(__name__, template_folder="templates", static_folder="static")`. MJPEG uses a generator that calls `jpeg_store.wait_after(generation, timeout=5)` and yields only the newest JPEG:

```python
yield b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + \
      str(len(jpeg)).encode() + b"\r\n\r\n" + jpeg + b"\r\n"
```

Return fixed safe error payloads. Do not use Flask debug mode or reloader because either can open the camera twice.

- [ ] **Step 4: Run GREEN**

```bash
PYTHONPATH=src .venv/bin/pytest tests/test_dashboard_web.py -q
```

- [ ] **Step 5: Commit**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/dashboard_web.py \
  tools/realtime_camera/tests/test_dashboard_web.py
git commit -m "feat: expose loopback camera dashboard API"
```

### Task 6: Browser dashboard UI

**Files:**

- Create: `tools/realtime_camera/src/nono_realtime_camera/templates/dashboard.html`
- Create: `tools/realtime_camera/src/nono_realtime_camera/static/dashboard.css`
- Create: `tools/realtime_camera/src/nono_realtime_camera/static/dashboard.js`
- Modify: `tools/realtime_camera/tests/test_dashboard_web.py`

**Interfaces:**

- Consumes `/video.mjpg`, `/api/state`, `/api/events`, `/api/config`, and control endpoints.
- Produces no server-side state; all authoritative values come back from the API.

- [ ] **Step 1: Add failing page contract test**

```python
def test_dashboard_page_contains_required_controls(client) -> None:
    html = client.get("/").get_data(as_text=True)
    for element_id in (
        "camera-stream", "lifecycle-chip", "current-summary", "sample-fps",
        "detection-threshold", "motion-ratio", "scene-ratio", "event-list",
        "start-button", "stop-button", "restart-button",
    ):
        assert f'id="{element_id}"' in html
```

- [ ] **Step 2: Run RED**

```bash
PYTHONPATH=src .venv/bin/pytest tests/test_dashboard_web.py::test_dashboard_page_contains_required_controls -q
```

- [ ] **Step 3: Implement accessible markup and responsive styling**

Use a two-column desktop grid with a 16:9 video card and right control rail, followed by a full-width event table. Use system fonts, high contrast, visible focus states, `<label for>` on every control, and status colors that are never the only signal. Below 900px, stack video, controls, then events.

- [ ] **Step 4: Implement browser behavior**

`dashboard.js` polls state every 250ms, requests events after the last sequence every 500ms, updates numbers without rebuilding the whole DOM, and applies a 150ms debounce to slider PATCH requests. While a slider is actively dragged, state polling does not overwrite that input. Failed PATCH restores the returned server config and shows an inline error. Start/stop/restart buttons disable until their request completes. On server disconnect the last values remain visible with a disconnected banner.

- [ ] **Step 5: Run page tests and manual static inspection**

```bash
PYTHONPATH=src .venv/bin/pytest tests/test_dashboard_web.py -q
.venv/bin/ruff check src tests
```

- [ ] **Step 6: Commit**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/templates/dashboard.html \
  tools/realtime_camera/src/nono_realtime_camera/static/dashboard.css \
  tools/realtime_camera/src/nono_realtime_camera/static/dashboard.js \
  tools/realtime_camera/tests/test_dashboard_web.py
git commit -m "feat: add realtime camera tuning dashboard"
```

### Task 7: CLI lifecycle and real Mac validation

**Files:**

- Modify: `tools/realtime_camera/src/nono_realtime_camera/cli.py`
- Modify: `tools/realtime_camera/tests/test_cli.py`
- Modify: `tools/realtime_camera/README.md`

**Interfaces:**

- Adds `nono-camera dashboard --camera-index 0 --model PATH --host 127.0.0.1 --port 8765 --open`.
- CLI creates one runtime, starts it once, runs Flask with `threaded=True`, `debug=False`, `use_reloader=False`, and stops the runtime in `finally`.

- [ ] **Step 1: Add failing CLI parser/lifecycle tests**

```python
def test_dashboard_defaults_are_loopback_and_single_process() -> None:
    args = build_parser().parse_args(["dashboard", "--model", "model.tflite"])
    assert args.host == "127.0.0.1"
    assert args.port == 8765
    assert args.open is False
```

Test port range 1–65535, model missing error, browser opener called only with `--open`, runtime stopped after server exception, and no reloader flag.

- [ ] **Step 2: Run RED**

```bash
PYTHONPATH=src .venv/bin/pytest tests/test_cli.py -q
```

- [ ] **Step 3: Implement CLI and documentation**

Start the browser only after the server socket is accepting connections, using a short background readiness probe bounded to five seconds. README documents dependency install, model SHA, command, every hot parameter, cold restart behavior, permission setup, no-frame persistence, and semantic degraded status.

- [ ] **Step 4: Full automated verification**

```bash
PYTHONPATH=src MPLCONFIGDIR=.runtime/matplotlib .venv/bin/pytest -q
.venv/bin/ruff check src tests
```

Expected: all existing and new tests pass; Ruff reports `All checks passed!`.

- [ ] **Step 5: Real camera smoke test**

```bash
MPLCONFIGDIR=.runtime/matplotlib .venv/bin/nono-camera dashboard \
  --camera-index 0 \
  --model .runtime/models/efficientdet_lite0.tflite \
  --host 127.0.0.1 \
  --port 8765 \
  --open
```

Verify video, boxes, 1 Hz summaries, live 8→12→15 FPS change, threshold changes, stop/restart, and camera release. Keep the page open for five minutes and record 300 fast events, interval P95 900–1100ms, end-to-emit P95 below 700ms, pending depth ≤1, and no raw images in `.runtime/`.

- [ ] **Step 6: Commit**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/cli.py \
  tools/realtime_camera/tests/test_cli.py tools/realtime_camera/README.md
git commit -m "feat: launch and validate camera debug dashboard"
```

## Completion Gate

Before reporting completion, run:

```bash
cd tools/realtime_camera
PYTHONPATH=src MPLCONFIGDIR=.runtime/matplotlib .venv/bin/pytest -q
.venv/bin/ruff check src tests
MPLCONFIGDIR=.runtime/matplotlib .venv/bin/nono-camera preflight --camera-index 0 --frames 60
```

Inspect the live page directly, confirm the 5-minute metrics, verify the camera indicator turns off after stop, and run `find .runtime -type f` to confirm only model/cache/report files exist. Report dashboard completion and real VLM completion separately.
