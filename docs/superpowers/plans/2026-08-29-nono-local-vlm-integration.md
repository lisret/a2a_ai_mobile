# NoNo Local Qwen3-VL Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect a real local Qwen3-VL-2B worker to the camera dashboard so semantic descriptions arrive asynchronously without delaying the 1 Hz fast path.

**Architecture:** Keep camera capture, fast analysis, and MJPEG preview unchanged; add an MLX-VLM sidecar on loopback plus a latest-only semantic worker. A pure scheduler selects one frame for stationary windows and three frames for motion/change windows, while the state store and UI expose real lifecycle, results, latency, drops, stale results, and errors.

**Tech Stack:** Python 3.11, Flask 3.1.3, OpenCV 4.12, MediaPipe 0.10.31, MLX-VLM 0.6.16, Qwen3-VL-2B-Instruct 4-bit, vanilla HTML/CSS/JavaScript, pytest, Ruff, uv.

## Global Constraints

- The target runtime is Apple M1 Pro with 32 GB unified memory.
- Use exactly `mlx-community/Qwen3-VL-2B-Instruct-4bit` and `mlx-vlm==0.6.16` for the first implementation.
- The sidecar must bind only to `127.0.0.1`; never expose the model service on a LAN interface.
- `semanticPendingDepth` must never exceed 1; new pending work replaces older pending work.
- Camera capture, fast analysis, and MJPEG preview must never await VLM loading or inference.
- Raw frames, JPEG bytes, and Base64 payloads must not be written to disk or returned by JSON APIs.
- `dashboard` keeps the fast-only behavior; `dashboard --vlm` enables and initially turns on the local semantic path.
- The first-stage semantic target is P50 at or below 5 seconds with a hard request timeout of 15 seconds.
- The fast path acceptance remains capture FPS within 10% of baseline, emit interval P95 at or below 1.2 seconds, and end-to-emit P95 below 1 second.
- Preserve all unrelated user changes in the main checkout.

---

## File Structure

- Create `tools/realtime_camera/src/nono_realtime_camera/semantic_scheduler.py`: immutable semantic task, adaptive frame selection, and trigger/cooldown policy.
- Create `tools/realtime_camera/src/nono_realtime_camera/vlm_client.py`: OpenAI-compatible local image client and response validation.
- Create `tools/realtime_camera/src/nono_realtime_camera/semantic_worker.py`: latest-only background execution and stale-session rejection.
- Create `tools/realtime_camera/src/nono_realtime_camera/vlm_sidecar.py`: loopback health probe, child process ownership, restart, and bounded error tail.
- Modify `tools/realtime_camera/src/nono_realtime_camera/dashboard_state.py`: semantic lifecycle, latest result, and rolling metrics.
- Modify `tools/realtime_camera/src/nono_realtime_camera/dashboard_runtime.py`: semantic trigger submission and camera lifecycle integration.
- Modify `tools/realtime_camera/src/nono_realtime_camera/dashboard_web.py`: VLM restart route.
- Modify `tools/realtime_camera/src/nono_realtime_camera/cli.py`: VLM flags and runtime assembly.
- Modify `tools/realtime_camera/src/nono_realtime_camera/templates/dashboard.html`: semantic status, parameters, result card, and metrics.
- Modify `tools/realtime_camera/src/nono_realtime_camera/static/dashboard.js`: semantic state rendering and VLM controls.
- Modify `tools/realtime_camera/src/nono_realtime_camera/static/dashboard.css`: semantic card and lifecycle styles.
- Modify `tools/realtime_camera/pyproject.toml` and `tools/realtime_camera/uv.lock`: optional locked MLX-VLM dependency.
- Modify `tools/realtime_camera/README.md`: setup, model cache, startup, and expected latency.
- Create focused tests matching each new module; extend runtime, web, CLI, and state tests only for their owned behavior.

---

### Task 1: Adaptive Semantic Scheduling

**Files:**
- Create: `tools/realtime_camera/src/nono_realtime_camera/semantic_scheduler.py`
- Create: `tools/realtime_camera/tests/test_semantic_scheduler.py`

**Interfaces:**
- Consumes: `FrameWindow`, `FramePacket`, and `RealtimeSecondSummaryV1` from existing modules.
- Produces: `SemanticTask`, `select_semantic_frames(window, summary)`, and `SemanticTriggerPolicy.should_submit(summary, now_ms)`.

- [ ] **Step 1: Write failing tests for one-frame, three-frame, deduplication, cooldown, and heartbeat behavior**

```python
def test_stationary_window_selects_only_latest_frame() -> None:
    window = make_window(frame_ids=(1, 2, 3, 4, 5))
    selected = select_semantic_frames(window, make_summary(motion="stationary"))
    assert [frame.frame_id for frame in selected] == [5]


def test_moving_window_selects_first_middle_and_last() -> None:
    window = make_window(frame_ids=(1, 2, 3, 4, 5))
    selected = select_semantic_frames(window, make_summary(motion="moving"))
    assert [frame.frame_id for frame in selected] == [1, 3, 5]


def test_trigger_policy_obeys_change_cooldown_and_static_heartbeat() -> None:
    policy = SemanticTriggerPolicy(cooldown_ms=5_000, static_heartbeat_ms=10_000)
    assert policy.should_submit(make_summary(changed=True), now_ms=1_000) is True
    policy.mark_submitted(1_000)
    assert policy.should_submit(make_summary(changed=True), now_ms=4_000) is False
    assert policy.should_submit(make_summary(changed=False), now_ms=11_000) is True
```

- [ ] **Step 2: Run the focused tests and confirm the module is missing**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_semantic_scheduler.py`

Expected: FAIL during collection with `ModuleNotFoundError: nono_realtime_camera.semantic_scheduler`.

- [ ] **Step 3: Implement immutable tasks, adaptive selection, and policy state**

```python
@dataclass(frozen=True, slots=True)
class SemanticTask:
    task_id: int
    session_id: int
    window_id: int
    submitted_at_ms: int
    frames: tuple[FramePacket, ...]


def select_semantic_frames(
    window: FrameWindow,
    summary: RealtimeSecondSummaryV1,
) -> tuple[FramePacket, ...]:
    if not window.frames:
        return ()
    dynamic = summary.motion != "stationary" or summary.scene_changed or summary.changed
    indexes = (0, len(window.frames) // 2, len(window.frames) - 1) if dynamic else (-1,)
    selected: list[FramePacket] = []
    seen: set[int] = set()
    for index in indexes:
        frame = window.frames[index]
        if frame.frame_id not in seen:
            selected.append(frame)
            seen.add(frame.frame_id)
    return tuple(selected)
```

`SemanticTriggerPolicy` stores only `last_submitted_at_ms`; it accepts the first valid window, accepts change/motion after `cooldown_ms`, accepts a stationary heartbeat after `static_heartbeat_ms`, and updates its timestamp only through `mark_submitted(now_ms)`.

- [ ] **Step 4: Run scheduler tests and the full suite**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_semantic_scheduler.py`

Expected: all scheduler tests PASS.

Run: `PYTHONPATH=src MPLCONFIGDIR=.runtime/matplotlib .venv/bin/pytest -q`

Expected: existing 76 tests plus new scheduler tests PASS.

- [ ] **Step 5: Commit the scheduler**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/semantic_scheduler.py tools/realtime_camera/tests/test_semantic_scheduler.py
git commit -m "feat: add adaptive semantic scheduling"
```

---

### Task 2: Semantic State and Rolling Metrics

**Files:**
- Modify: `tools/realtime_camera/src/nono_realtime_camera/dashboard_state.py`
- Modify: `tools/realtime_camera/tests/test_dashboard_state.py`

**Interfaces:**
- Consumes: existing `RealtimeSemanticEnrichmentV1`.
- Produces: `set_semantic_lifecycle`, `record_semantic_result`, `record_semantic_drop`, `record_semantic_stale`, `record_semantic_error`, and semantic fields in `snapshot`.

- [ ] **Step 1: Write failing state tests**

```python
def test_semantic_result_updates_latest_event_and_rolling_metrics() -> None:
    state = DashboardStateStore(metric_window=4)
    state.set_semantic_lifecycle("ready", message="Qwen ready")
    state.record_semantic_result(make_enrichment(window_id=7, processing_ms=3200), input_frames=3)
    payload = state.snapshot(DashboardConfigStore().snapshot())
    assert payload["semanticLifecycle"] == {"phase": "ready", "message": "Qwen ready"}
    assert payload["latestSemantic"]["windowId"] == 7
    assert payload["metrics"]["semanticProcessingP95Ms"] == 3200.0
    assert payload["metrics"]["semanticInputFrameCount"] == 3
    assert payload["metrics"]["semanticSuccessCount"] == 1


def test_semantic_counters_and_reset_are_bounded_and_session_scoped() -> None:
    state = DashboardStateStore()
    state.record_semantic_drop()
    state.record_semantic_stale()
    state.record_semantic_error("timeout")
    state.reset_semantic_session()
    metrics = state.snapshot(DashboardConfigStore().snapshot())["metrics"]
    assert metrics["semanticDroppedCount"] == 0
    assert metrics["semanticStaleCount"] == 0
    assert metrics["semanticErrorCount"] == 0
```

- [ ] **Step 2: Run the focused tests and confirm missing methods**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_dashboard_state.py`

Expected: FAIL with `AttributeError` for the first missing semantic state method.

- [ ] **Step 3: Add semantic lifecycle, latest result, counters, and percentile samples**

Add these default metric keys with numeric zero values:

```python
"semanticProcessingP50Ms": 0.0,
"semanticProcessingP95Ms": 0.0,
"semanticDroppedCount": 0,
"semanticStaleCount": 0,
"semanticSuccessCount": 0,
"semanticErrorCount": 0,
"semanticInputFrameCount": 0,
```

Store a separate `self._semantic_lifecycle = {"phase": "disabled", "message": None}` and `self._latest_semantic`. `record_semantic_result` must call `record_event` without double-locking, then update semantic metrics under the state lock. `snapshot` must expose `semanticLifecycle`, `latestSemantic`, and the existing `semanticAvailable` flag. `record_semantic_error(message)` increments the error count and sets phase `degraded` with that bounded message.

- [ ] **Step 4: Run state and full tests**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_dashboard_state.py`

Expected: all state tests PASS.

Run: `PYTHONPATH=src MPLCONFIGDIR=.runtime/matplotlib .venv/bin/pytest -q`

Expected: all tests PASS without image payloads in state snapshots.

- [ ] **Step 5: Commit semantic state**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/dashboard_state.py tools/realtime_camera/tests/test_dashboard_state.py
git commit -m "feat: track semantic lifecycle and metrics"
```

---

### Task 3: OpenAI-Compatible Local VLM Client

**Files:**
- Create: `tools/realtime_camera/src/nono_realtime_camera/vlm_client.py`
- Create: `tools/realtime_camera/tests/test_vlm_client.py`

**Interfaces:**
- Consumes: a tuple of `FramePacket` objects.
- Produces: `VlmResult`, `VlmClient` protocol, `OpenAICompatibleVlmClient.describe(frames)`, `VlmProtocolError`, and `VlmRequestError`.

- [ ] **Step 1: Write a local fake-server protocol test and invalid-response tests**

```python
def test_client_sends_in_memory_multi_image_request_and_parses_result() -> None:
    with fake_vlm_server(response={
        "model": "mlx-community/Qwen3-VL-2B-Instruct-4bit",
        "choices": [{"message": {"content": "桌面上有水瓶，手正在移动它。"}}],
    }) as server:
        client = OpenAICompatibleVlmClient(
            base_url=server.base_url,
            model_id="mlx-community/Qwen3-VL-2B-Instruct-4bit",
            timeout_seconds=2,
            max_tokens=48,
        )
        result = client.describe(make_frames(3))
        body = server.last_json
    assert result.summary == "桌面上有水瓶，手正在移动它。"
    assert len([part for part in body["messages"][0]["content"] if part["type"] == "image_url"]) == 3
    assert body["max_tokens"] == 48
    assert all("base64," in part["image_url"]["url"] for part in body["messages"][0]["content"] if part["type"] == "image_url")


def test_client_rejects_empty_or_malformed_completion() -> None:
    with fake_vlm_server(response={"choices": []}) as server:
        with pytest.raises(VlmProtocolError):
            make_client(server).describe(make_frames(1))
```

- [ ] **Step 2: Run client tests and verify the module is missing**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_vlm_client.py`

Expected: FAIL during collection with `ModuleNotFoundError`.

- [ ] **Step 3: Implement JPEG/Base64 request construction with standard-library HTTP**

```python
@dataclass(frozen=True, slots=True)
class VlmResult:
    model_id: str
    summary: str
    processing_ms: int


class VlmClient(Protocol):
    def describe(self, frames: tuple[FramePacket, ...]) -> VlmResult: ...


class OpenAICompatibleVlmClient:
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
        summary = _completion_text(response).strip()
        if not summary:
            raise VlmProtocolError("VLM returned an empty summary")
        processing_ms = (self._monotonic_ns() - started_ns) // 1_000_000
        return VlmResult(str(response.get("model") or self.model_id), summary, processing_ms)
```

Use `cv2.imencode(".jpg", frame.image, [cv2.IMWRITE_JPEG_QUALITY, 80])`; encode only in memory. Map HTTP errors, timeouts, and OS connection failures to concise `VlmRequestError` messages. Cap accepted summary text at 500 characters before storing it.

- [ ] **Step 4: Run protocol tests, Ruff, and full tests**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_vlm_client.py`

Expected: all client tests PASS.

Run: `.venv/bin/ruff check src tests`

Expected: `All checks passed!`.

Run: `PYTHONPATH=src MPLCONFIGDIR=.runtime/matplotlib .venv/bin/pytest -q`

Expected: all tests PASS.

- [ ] **Step 5: Commit the client**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/vlm_client.py tools/realtime_camera/tests/test_vlm_client.py
git commit -m "feat: add local OpenAI-compatible VLM client"
```

---

### Task 4: Latest-Only Semantic Worker

**Files:**
- Create: `tools/realtime_camera/src/nono_realtime_camera/semantic_worker.py`
- Create: `tools/realtime_camera/tests/test_semantic_worker.py`

**Interfaces:**
- Consumes: `VlmClient`, `SemanticTask`, and `DashboardStateStore`.
- Produces: `SemanticWorker.start`, `submit`, `clear_pending`, `close`, `is_running`, and `pending_depth`.

- [ ] **Step 1: Write concurrency tests for overwrite, stale result, error recovery, and close**

```python
def test_worker_overwrites_pending_task_without_blocking_submitter() -> None:
    client = BlockingVlmClient()
    state = DashboardStateStore()
    worker = SemanticWorker(client=client, state_store=state)
    worker.start()
    worker.submit(window_id=1, frames=make_frames(1, first_frame_id=1), submitted_at_ms=1_000)
    assert client.started.wait(timeout=1)
    worker.submit(window_id=2, frames=make_frames(1, first_frame_id=2), submitted_at_ms=2_000)
    worker.submit(window_id=3, frames=make_frames(3, first_frame_id=3), submitted_at_ms=3_000)
    assert worker.pending_depth == 1
    assert state.snapshot(DashboardConfigStore().snapshot())["metrics"]["semanticDroppedCount"] == 1
    client.release.set()
    wait_until(lambda: len(client.windows) == 2)
    worker.close()
    assert client.first_frame_ids == [1, 3]


def test_clear_pending_rejects_inflight_result_from_old_camera_session() -> None:
    client = BlockingVlmClient()
    state = DashboardStateStore()
    worker = SemanticWorker(client=client, state_store=state)
    worker.start()
    worker.submit(window_id=7, frames=make_frames(1), submitted_at_ms=1_000)
    assert client.started.wait(timeout=1)
    worker.clear_pending()
    client.release.set()
    wait_until(lambda: state.snapshot(DashboardConfigStore().snapshot())["metrics"]["semanticStaleCount"] == 1)
    assert state.snapshot(DashboardConfigStore().snapshot())["latestSemantic"] is None
    worker.close()
```

- [ ] **Step 2: Run worker tests and confirm the module is missing**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_semantic_worker.py`

Expected: FAIL during collection with `ModuleNotFoundError`.

- [ ] **Step 3: Implement a condition-variable worker with one replaceable pending slot**

```python
def submit(self, *, window_id: int, frames: tuple[FramePacket, ...], submitted_at_ms: int) -> int:
    with self._condition:
        self._next_task_id += 1
        if self._pending is not None:
            self.state_store.record_semantic_drop()
        task = SemanticTask(
            task_id=self._next_task_id,
            session_id=self._session_id,
            window_id=window_id,
            submitted_at_ms=submitted_at_ms,
            frames=frames,
        )
        self._latest_task_id = task.task_id
        self._pending = task
        self.state_store.update_metrics(semanticPendingDepth=1)
        self._condition.notify_all()
        return task.task_id
```

The run loop atomically takes `_pending`, sets pending depth to 0, calls `client.describe`, and accepts a result only when both `task.session_id == self._session_id` and `task.task_id == self._latest_task_id`. Accepted output becomes `RealtimeSemanticEnrichmentV1`; stale output increments stale count; request errors increment error count and leave the thread alive. `clear_pending` increments `_session_id`, clears `_pending`, and resets semantic session metrics.
Set semantic lifecycle to `running` with the source window while a request is active, return it to `ready` after an accepted or stale response, and set it to `degraded` after a request/protocol error. A later successful result restores `ready`.

- [ ] **Step 4: Run worker, state, full tests, and Ruff**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_semantic_worker.py tests/test_dashboard_state.py`

Expected: all selected tests PASS.

Run: `PYTHONPATH=src MPLCONFIGDIR=.runtime/matplotlib .venv/bin/pytest -q`

Expected: all tests PASS.

Run: `.venv/bin/ruff check src tests`

Expected: `All checks passed!`.

- [ ] **Step 5: Commit the worker**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/semantic_worker.py tools/realtime_camera/tests/test_semantic_worker.py
git commit -m "feat: add latest-only semantic worker"
```

---

### Task 5: MLX-VLM Sidecar and Optional Dependency

**Files:**
- Create: `tools/realtime_camera/src/nono_realtime_camera/vlm_sidecar.py`
- Create: `tools/realtime_camera/tests/test_vlm_sidecar.py`
- Modify: `tools/realtime_camera/pyproject.toml`
- Modify: `tools/realtime_camera/uv.lock`

**Interfaces:**
- Consumes: `DashboardStateStore` and a `VlmSidecarConfig`.
- Produces: `VlmSidecarSupervisor.start_async`, `restart`, `close`, `available`, `base_url`, and child ownership semantics.

- [ ] **Step 1: Write failing sidecar lifecycle tests with injected process and health probes**

```python
def test_existing_compatible_service_is_reused_and_never_terminated() -> None:
    process_factory = FakeProcessFactory()
    supervisor = VlmSidecarSupervisor(
        config=make_config(),
        state_store=DashboardStateStore(),
        health_probe=lambda _url: True,
        process_factory=process_factory,
    )
    supervisor.start_async()
    wait_until(lambda: supervisor.available)
    supervisor.close()
    assert process_factory.calls == []


def test_owned_child_exit_sets_degraded_with_bounded_error_tail() -> None:
    process = FakeProcess(returncode=2, stderr_lines=["x" * 800] * 100)
    supervisor = make_supervisor(process=process, probe_results=[False, False])
    supervisor.start_async()
    wait_until(lambda: semantic_phase(supervisor) == "degraded")
    assert len(semantic_message(supervisor)) <= 1_000
```

- [ ] **Step 2: Run sidecar tests and confirm the module is missing**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_vlm_sidecar.py`

Expected: FAIL during collection with `ModuleNotFoundError`.

- [ ] **Step 3: Add the optional dependency and implement owned-process supervision**

Add exactly:

```toml
[project.optional-dependencies]
vlm = ["mlx-vlm==0.6.16"]
```

Implement `VlmSidecarConfig` with model ID, loopback host, port, cache directory, and auto-start. Reject any host other than `127.0.0.1` or `localhost`. Probe `GET /v1/models`; reuse an existing service only when the response is healthy and advertises `config.model_id`. Otherwise create:

```python
command = [
    sys.executable,
    "-m",
    "mlx_vlm.server",
    "--model",
    config.model_id,
    "--host",
    "127.0.0.1",
    "--port",
    str(config.port),
]
environment = {**os.environ, "HF_HOME": str(config.cache_dir)}
```

The monitor thread probes every 500 ms, never blocks dashboard startup, drains a bounded stderr tail, and terminates only an owned child during `restart` or `close`.

- [ ] **Step 4: Lock/install MLX-VLM and run unit tests**

Run: `/Users/a/.local/bin/uv sync --extra vlm`

Expected: `mlx-vlm==0.6.16` and its locked dependencies install successfully; `uv.lock` changes.

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_vlm_sidecar.py`

Expected: all sidecar tests PASS without starting a real model.

Run: `.venv/bin/ruff check src tests`

Expected: `All checks passed!`.

- [ ] **Step 5: Commit sidecar and lockfile**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/vlm_sidecar.py tools/realtime_camera/tests/test_vlm_sidecar.py tools/realtime_camera/pyproject.toml tools/realtime_camera/uv.lock
git commit -m "feat: supervise local MLX-VLM sidecar"
```

---

### Task 6: Dashboard Runtime Semantic Integration

**Files:**
- Modify: `tools/realtime_camera/src/nono_realtime_camera/dashboard_runtime.py`
- Modify: `tools/realtime_camera/tests/test_dashboard_runtime.py`

**Interfaces:**
- Consumes: `SemanticWorker`, `VlmSidecarSupervisor`, `SemanticTriggerPolicy`, and `select_semantic_frames`.
- Produces: semantic submission after each accepted fast window plus `restart_vlm()`.

- [ ] **Step 1: Write failing runtime tests for nonblocking inference, adaptive frames, cooldown, stop, and VLM restart**

```python
def test_blocking_semantic_worker_does_not_delay_fast_events_or_capture() -> None:
    camera = ContinuousFakeCamera()
    semantic = BlockingFakeSemanticWorker(available=True)
    runtime = DashboardRuntime(
        camera_factory=lambda: camera,
        semantic_worker=semantic,
        config_store=DashboardConfigStore(DashboardConfigV1(semantic_enabled=True, semantic_cooldown_seconds=1)),
        window_ms=100,
    )
    runtime.start()
    assert semantic.started.wait(timeout=1)
    reads = camera.read_count
    fast_events = len(
        [row for row in runtime.state_store.events_after(0) if row["source"] == "fast_path"]
    )
    time.sleep(0.25)
    assert camera.read_count > reads + 10
    assert len(
        [row for row in runtime.state_store.events_after(0) if row["source"] == "fast_path"]
    ) > fast_events
    semantic.release.set()
    runtime.close()


def test_stop_clears_semantic_work_and_restart_keeps_window_ids_monotonic() -> None:
    semantic = RecordingSemanticWorker(available=True)
    runtime = make_runtime(semantic_worker=semantic, semantic_enabled=True)
    runtime.start()
    wait_until(lambda: semantic.submit_count >= 1)
    before = last_fast_window_id(runtime)
    runtime.stop()
    assert semantic.clear_count == 1
    runtime.start()
    wait_until(lambda: last_fast_window_id(runtime) > before)
    runtime.close()
```

- [ ] **Step 2: Run focused runtime tests and confirm constructor mismatch**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_dashboard_runtime.py`

Expected: FAIL because `DashboardRuntime` does not accept `semantic_worker`.

- [ ] **Step 3: Inject semantic dependencies and submit after fast publication**

Extend the constructor with optional `semantic_worker` and `vlm_supervisor`. Create a `SemanticTriggerPolicy` from the current hot config at submission time. At the end of `_process_window`, after the fast event, metrics, and overlay are published, call:

```python
if (
    config.semantic_enabled
    and self._semantic_worker is not None
    and self._semantic_worker.available
    and self._semantic_policy.should_submit(summary, now_ms=emitted_at_ms)
):
    frames = select_semantic_frames(window, summary)
    if frames:
        self._semantic_worker.submit(
            window_id=window.window_id,
            frames=frames,
            submitted_at_ms=emitted_at_ms,
        )
        self._semantic_policy.mark_submitted(emitted_at_ms)
```

When the hot cooldown changes, update policy cooldown without resetting the last-submit timestamp. `stop()` calls `semantic_worker.clear_pending()` but leaves the worker and loaded model alive. `close()` closes the worker and supervisor. `restart_vlm()` restarts only the supervisor and clears semantic work.

- [ ] **Step 4: Run runtime tests, full tests, and Ruff**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_dashboard_runtime.py`

Expected: all runtime tests PASS.

Run: `PYTHONPATH=src MPLCONFIGDIR=.runtime/matplotlib .venv/bin/pytest -q`

Expected: all tests PASS.

Run: `.venv/bin/ruff check src tests`

Expected: `All checks passed!`.

- [ ] **Step 5: Commit runtime integration**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/dashboard_runtime.py tools/realtime_camera/tests/test_dashboard_runtime.py
git commit -m "feat: connect semantic worker to camera runtime"
```

---

### Task 7: CLI Assembly and VLM Control API

**Files:**
- Modify: `tools/realtime_camera/src/nono_realtime_camera/cli.py`
- Modify: `tools/realtime_camera/src/nono_realtime_camera/dashboard_web.py`
- Modify: `tools/realtime_camera/tests/test_cli.py`
- Modify: `tools/realtime_camera/tests/test_dashboard_web.py`

**Interfaces:**
- Consumes: sidecar, VLM client, semantic worker, state store, and runtime interfaces.
- Produces: `dashboard --vlm` flags and `POST /api/control/vlm/restart`.

- [ ] **Step 1: Write failing CLI and API tests**

```python
def test_dashboard_vlm_flags_have_local_safe_defaults() -> None:
    args = build_parser().parse_args(["dashboard", "--vlm"])
    assert args.vlm is True
    assert args.vlm_model == "mlx-community/Qwen3-VL-2B-Instruct-4bit"
    assert args.vlm_host == "127.0.0.1"
    assert args.vlm_port == 8766
    assert args.vlm_timeout_seconds == 15
    assert args.vlm_max_tokens == 48


def test_restart_vlm_route_does_not_restart_camera(client, runtime) -> None:
    response = client.post("/api/control/vlm/restart")
    assert response.status_code == 200
    assert runtime.vlm_restart_count == 1
    assert runtime.camera_restart_count == 0
```

- [ ] **Step 2: Run focused tests and confirm flags and route are missing**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_cli.py tests/test_dashboard_web.py`

Expected: FAIL for missing `--vlm` and a 404 VLM restart route.

- [ ] **Step 3: Add exact flags, assemble the VLM stack, and add the control route**

Add CLI options from the spec with `_valid_port` and positive integer validation. In `_run_dashboard`, when `args.vlm` is true:

```python
initial_config = DashboardConfigV1(semantic_enabled=True, semantic_cooldown_seconds=5)
config_store = DashboardConfigStore(initial_config)
state_store = DashboardStateStore()
sidecar = VlmSidecarSupervisor(
    config=VlmSidecarConfig(
        model_id=args.vlm_model,
        host=args.vlm_host,
        port=args.vlm_port,
        cache_dir=Path(".runtime/huggingface"),
        auto_start=not args.vlm_no_auto_start,
    ),
    state_store=state_store,
)
client = OpenAICompatibleVlmClient(
    base_url=sidecar.base_url,
    model_id=args.vlm_model,
    timeout_seconds=args.vlm_timeout_seconds,
    max_tokens=args.vlm_max_tokens,
)
worker = SemanticWorker(client=client, state_store=state_store, available=lambda: sidecar.available)
```

Start the worker and sidecar without awaiting readiness, then pass all stores and VLM components into `DashboardRuntime`. If `--vlm` is absent, set semantic lifecycle to disabled and construct no VLM components. Add the web route that calls `runtime.restart_vlm()` and returns `{ "ok": true }`.

- [ ] **Step 4: Run CLI/web tests and full suite**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_cli.py tests/test_dashboard_web.py`

Expected: all selected tests PASS.

Run: `PYTHONPATH=src MPLCONFIGDIR=.runtime/matplotlib .venv/bin/pytest -q`

Expected: all tests PASS.

- [ ] **Step 5: Commit CLI and API**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/cli.py tools/realtime_camera/src/nono_realtime_camera/dashboard_web.py tools/realtime_camera/tests/test_cli.py tools/realtime_camera/tests/test_dashboard_web.py
git commit -m "feat: launch and control local VLM runtime"
```

---

### Task 8: VLM Dashboard UI

**Files:**
- Modify: `tools/realtime_camera/src/nono_realtime_camera/templates/dashboard.html`
- Modify: `tools/realtime_camera/src/nono_realtime_camera/static/dashboard.js`
- Modify: `tools/realtime_camera/src/nono_realtime_camera/static/dashboard.css`
- Modify: `tools/realtime_camera/tests/test_dashboard_web.py`

**Interfaces:**
- Consumes: `semanticLifecycle`, `semanticAvailable`, `latestSemantic`, semantic metrics, config patch, events, and restart route.
- Produces: a visible real-VLM status, result card, controls, and event rows.

- [ ] **Step 1: Write failing HTML contract tests**

```python
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
```

- [ ] **Step 2: Run web tests and confirm new element IDs are absent**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_dashboard_web.py`

Expected: FAIL on `semantic-cooldown-seconds`.

- [ ] **Step 3: Add semantic UI and rendering behavior**

Add a VLM card below the fast summary with lifecycle badge, latest description, model, source window, input frame count, and latency. Add a cooldown slider (`min=1`, `max=60`, `step=1`) and a restart button. In JavaScript:

```javascript
function renderSemantic(state) {
  const lifecycle = state.semanticLifecycle || { phase: "disabled", message: null };
  $("semantic-lifecycle").textContent = lifecycle.phase;
  $("semantic-enabled").disabled = !state.semanticAvailable;
  $("semantic-enabled").checked = state.config.semanticEnabled;
  $("semantic-cooldown-seconds").value = state.config.semanticCooldownSeconds;
  $("semantic-p95-ms").textContent = `${state.metrics.semanticProcessingP95Ms.toFixed(0)} ms`;
  $("semantic-dropped-count").textContent = String(state.metrics.semanticDroppedCount);
  const semantic = state.latestSemantic;
  $("semantic-summary").textContent = semantic?.semanticSummary || "等待真实 VLM 结果";
  $("semantic-model").textContent = semantic?.modelId || "—";
  $("semantic-window").textContent = semantic ? `#${semantic.windowId}` : "—";
  $("semantic-input-frame-count").textContent = semantic ? String(state.metrics.semanticInputFrameCount) : "—";
  $("semantic-processing-ms").textContent = semantic ? `${semantic.processingMs} ms` : "—";
}
```

Reuse the existing debounced config patch mechanism for `semanticEnabled` and `semanticCooldownSeconds`. Render semantic event rows with source label `VLM`, and wire `restart-vlm` to `POST /api/control/vlm/restart`. Use existing card tokens and add only lifecycle-specific ready/loading/degraded colors.

- [ ] **Step 4: Run web tests, full tests, and Ruff**

Run: `PYTHONPATH=src .venv/bin/pytest -q tests/test_dashboard_web.py`

Expected: all web tests PASS.

Run: `PYTHONPATH=src MPLCONFIGDIR=.runtime/matplotlib .venv/bin/pytest -q`

Expected: all tests PASS.

Run: `.venv/bin/ruff check src tests`

Expected: `All checks passed!`.

- [ ] **Step 5: Commit the UI**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/templates/dashboard.html tools/realtime_camera/src/nono_realtime_camera/static/dashboard.js tools/realtime_camera/src/nono_realtime_camera/static/dashboard.css tools/realtime_camera/tests/test_dashboard_web.py
git commit -m "feat: show and tune real VLM analysis"
```

---

### Task 9: Real Model Smoke, Documentation, and End-to-End Acceptance

**Files:**
- Modify: `tools/realtime_camera/README.md`
- Create runtime-only evidence under ignored `tools/realtime_camera/.runtime/`; do not add it to Git.

**Interfaces:**
- Consumes: the completed `dashboard --vlm` flow.
- Produces: reproducible setup instructions and measured acceptance evidence.

- [ ] **Step 1: Document exact installation, first download, startup, cache, and expected behavior**

Add these commands and notes to README:

```bash
cd tools/realtime_camera
/Users/a/.local/bin/uv sync --extra vlm
MPLCONFIGDIR=.runtime/matplotlib .venv/bin/nono-camera dashboard \
  --camera-index 0 \
  --model .runtime/models/efficientdet_lite0.tflite \
  --vlm \
  --open
```

State that the first run downloads about 1.8 GB into `.runtime/huggingface`, fast results remain 1 Hz, semantic results normally arrive later, and no semantic result is shown until the real model responds.

- [ ] **Step 2: Run a minimum real Qwen3-VL image inference before camera testing**

Run with network approval:

```bash
HF_HOME=.runtime/huggingface .venv/bin/python -m mlx_vlm.generate \
  --model mlx-community/Qwen3-VL-2B-Instruct-4bit \
  --image https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/p-blog/candy.JPG \
  --prompt "用一句中文描述图片中的主要物体。" \
  --max-tokens 48 \
  --temperature 0
```

Expected: a non-empty Chinese description and model files present only under ignored runtime cache.

- [ ] **Step 3: Run automated verification from a fresh process**

Run: `PYTHONPATH=src MPLCONFIGDIR=.runtime/matplotlib .venv/bin/pytest -q`

Expected: all tests PASS.

Run: `.venv/bin/ruff check src tests`

Expected: `All checks passed!`.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 4: Run real camera and browser acceptance**

Start the dashboard with the README command. Verify through `/api/state` and the visible browser:

- camera lifecycle is `running` and capture FPS is at least 90% of the fast-only baseline;
- fast events continue for at least 30 seconds while VLM is loading and while it is inferring;
- a stationary scene produces a real one-frame semantic result with the exact model ID;
- motion produces a three-frame semantic result;
- `semanticPendingDepth` never exceeds 1;
- config cooldown hot-update increments revision and affects the next trigger;
- stopping and starting the camera produces no empty semantic catch-up windows;
- restarting VLM does not restart the camera;
- killing the owned VLM child shows degraded while fast results continue;
- semantic P50, P95, drop, stale, success, and error metrics are recorded.

Record measured capture FPS, fast emit P95, fast end-to-emit P95, semantic P50/P95, and one accepted semantic event in an ignored JSON report.

- [ ] **Step 5: Commit documentation and final source adjustments**

```bash
git add tools/realtime_camera/README.md
git commit -m "docs: document local Qwen3-VL workflow"
```

Do not add `.runtime/`, model weights, camera images, Base64 payloads, or acceptance JSON to Git.

---

### Task 10: Submission Gates and Branch Handoff

**Files:**
- Create gate evidence only through `agent-runtime`; do not hand-edit runtime evidence.

**Interfaces:**
- Consumes: unchanged final branch snapshot and all verification results.
- Produces: review, testing, user-perspective evidence, and an integration choice.

- [ ] **Step 1: Run Kimi K3-first review on the final unchanged snapshot**

Run: `agent-runtime review`

Expected: review records a passing verdict, or returns concrete findings that must be fixed before rerunning on a changed snapshot.

- [ ] **Step 2: Dispatch the required testing subagent and record its report**

The testing subagent must inspect the diff, write a short test plan, run the complete pytest and Ruff commands, exercise the real dashboard if the model and camera remain available, and start its report with `PASS`, `FAIL`, `BLOCKED`, or `ERROR`.

Save the report to `/private/tmp/nono-vlm-testing-report.md`, then run: `agent-runtime test-gate --record /private/tmp/nono-vlm-testing-report.md`.

Expected: testing gate records PASS. A BLOCKED result requires user acceptance or another run; it is not silently waived.

- [ ] **Step 3: Ask once whether the VLM UI needs User Perspective QA and execute the decision**

If yes, run `agent-runtime user-perspective --emit-brief tools/realtime_camera/.runtime/user-perspective-vlm`, dispatch a fresh-context blind operator, then record `tools/realtime_camera/.runtime/user-perspective-vlm/user-perspective-report.md`. If no, record the user decision with: `agent-runtime user-perspective --not-required "用户确认无需额外盲测；浏览器真机验收已覆盖 VLM 状态、调参、停止恢复和降级交互"`.

Expected: user-perspective gate is complete without unresolved blocker/high findings.

- [ ] **Step 4: Re-run final verification after any gate-driven fix**

Run: `PYTHONPATH=src MPLCONFIGDIR=.runtime/matplotlib .venv/bin/pytest -q`

Run: `.venv/bin/ruff check src tests`

Run from the worktree root: `git diff --check`

Expected: all tests pass, Ruff passes, and diff check is empty.

- [ ] **Step 5: Use the finishing-development-branch workflow**

Present exactly the local merge, PR, keep, and discard options. For local merge, merge into `V1`, rerun the full test suite in the merged checkout, remove the owned `.worktrees/vlm-integration` worktree, prune, and delete `codex/vlm-integration` only after the merge and tests succeed.
