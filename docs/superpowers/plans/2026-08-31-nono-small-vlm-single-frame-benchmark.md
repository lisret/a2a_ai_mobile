# NoNo Small VLM Single-Frame Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local camera dashboard default to a Qwen3.5-0.8B, one-latest-frame-per-second VLM path and measure its real M1 Pro latency without delaying the existing fast path.

**Architecture:** Keep the existing MLX-VLM sidecar, `SemanticWorker`, and latest-only pending slot. Add a launch-time semantic input mode to the scheduler/runtime, resize images inside the VLM client before JPEG encoding, and use short deterministic output defaults; preserve the old adaptive 1/3-frame mode for comparison.

**Tech Stack:** Python 3.11, MLX-VLM 0.6.16, OpenCV, Flask, pytest, Ruff.

## Global Constraints

- Default model: `mlx-community/Qwen3.5-0.8B-MLX-4bit`.
- Default input mode: `latest`; `adaptive` remains available.
- Default VLM image longest edge: 448 pixels; accepted range 64–2048.
- Default output maximum: 16 tokens.
- `dashboard --vlm` starts with `semanticCooldownSeconds = 1`.
- The fast 1 Hz camera summary never waits for VLM work.
- Semantic pending depth remains at most one; no historical request queue.
- Real `<1 s` claims require warm M1 Pro evidence, not model size or first-token estimates.

---

### Task 1: Add latest input mode and one-second trigger semantics

**Files:**
- Modify: `tools/realtime_camera/src/nono_realtime_camera/semantic_scheduler.py:1-60`
- Modify: `tools/realtime_camera/src/nono_realtime_camera/dashboard_runtime.py:19,73-128,382-413`
- Test: `tools/realtime_camera/tests/test_semantic_scheduler.py`
- Test: `tools/realtime_camera/tests/test_dashboard_runtime.py`

**Interfaces:**
- Produces: `SemanticInputMode = Literal["latest", "adaptive"]`.
- Produces: `select_semantic_frames(window, summary, *, input_mode)`.
- Produces: `SemanticTriggerPolicy(..., input_mode)` whose latest mode uses cooldown for every window.
- Consumes: the existing `FrameWindow`, `RealtimeSecondSummaryV1`, and `SemanticWorkerPort.submit` contracts.

- [ ] **Step 1: Write failing scheduler tests**

Add tests that express the wished-for API:

```python
def test_latest_mode_selects_only_last_frame_even_when_moving() -> None:
    selected = select_semantic_frames(
        make_window((1, 2, 3, 4, 5)),
        make_summary(motion="moving"),
        input_mode="latest",
    )
    assert [frame.frame_id for frame in selected] == [5]


def test_latest_trigger_mode_uses_cooldown_for_stationary_windows() -> None:
    policy = SemanticTriggerPolicy(
        cooldown_ms=1_000,
        static_heartbeat_ms=10_000,
        input_mode="latest",
    )
    assert policy.should_submit(make_summary(changed=False), now_ms=1_000)
    policy.mark_submitted(1_000)
    assert not policy.should_submit(make_summary(changed=False), now_ms=1_999)
    assert policy.should_submit(make_summary(changed=False), now_ms=2_000)
```

- [ ] **Step 2: Verify RED**

Run:

```bash
.venv/bin/pytest -q tests/test_semantic_scheduler.py
```

Expected: failure because `input_mode` is not accepted.

- [ ] **Step 3: Implement the minimal scheduler mode**

Use a literal type and preserve adaptive defaults for programmatic callers:

```python
SemanticInputMode = Literal["latest", "adaptive"]


def select_semantic_frames(window, summary, *, input_mode: SemanticInputMode = "adaptive"):
    if not window.frames:
        return ()
    if input_mode == "latest":
        return (window.frames[-1],)
    # existing adaptive selection follows
```

Store `input_mode` on `SemanticTriggerPolicy`; when it is `latest`, return `elapsed_ms >= cooldown_ms` before applying the adaptive dynamic/static split.

- [ ] **Step 4: Add runtime integration coverage**

Create a runtime with `semantic_input_mode="latest"`, feed stationary windows with a 1-second semantic cooldown, and assert submitted tasks contain one last frame on successive eligible windows. Keep existing runtime constructors on the adaptive default.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
.venv/bin/pytest -q tests/test_semantic_scheduler.py tests/test_dashboard_runtime.py
```

Expected: all selected tests pass.

- [ ] **Step 6: Commit the scheduler unit**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/semantic_scheduler.py \
  tools/realtime_camera/src/nono_realtime_camera/dashboard_runtime.py \
  tools/realtime_camera/tests/test_semantic_scheduler.py \
  tools/realtime_camera/tests/test_dashboard_runtime.py
git commit -m "feat: add single-frame semantic mode"
```

---

### Task 2: Add small-model CLI defaults and bounded image sizing

**Files:**
- Modify: `tools/realtime_camera/src/nono_realtime_camera/cli.py:52-94,139-150,164-223`
- Modify: `tools/realtime_camera/src/nono_realtime_camera/vlm_client.py:1-90`
- Test: `tools/realtime_camera/tests/test_cli.py:62-105,174-205`
- Test: `tools/realtime_camera/tests/test_vlm_client.py:69-132`

**Interfaces:**
- Produces: CLI values `vlm_input_mode` and `vlm_image_max_edge`.
- Produces: `OpenAICompatibleVlmClient(..., image_max_edge: int)`.
- Consumes: `DashboardRuntime(semantic_input_mode=...)` from Task 1.

- [ ] **Step 1: Write failing CLI default and validation tests**

Assert:

```python
args = build_parser().parse_args(["dashboard", "--vlm"])
assert args.vlm_model == "mlx-community/Qwen3.5-0.8B-MLX-4bit"
assert args.vlm_input_mode == "latest"
assert args.vlm_image_max_edge == 448
assert args.vlm_max_tokens == 16
```

Parameterize 63 and 2049 as invalid `--vlm-image-max-edge` values. In the dashboard assembly harness, assert client receives `image_max_edge=448`, runtime receives `semantic_input_mode="latest"`, and the initial semantic cooldown is 1.

- [ ] **Step 2: Verify CLI RED**

Run:

```bash
.venv/bin/pytest -q tests/test_cli.py
```

Expected: failures on old defaults and missing arguments.

- [ ] **Step 3: Implement minimal CLI wiring**

Add:

```python
dashboard.add_argument(
    "--vlm-input-mode", choices=("latest", "adaptive"), default="latest"
)
dashboard.add_argument(
    "--vlm-image-max-edge", type=_valid_vlm_image_max_edge, default=448
)
```

Change the model and token defaults, use cooldown 1 for VLM startup, pass `image_max_edge` to the client, and pass `semantic_input_mode` to `DashboardRuntime`.

- [ ] **Step 4: Write failing resize and timing tests**

Construct 900×1600, 1600×900, 700×700, and 32×48 frames. Decode the image received by the fake server and assert expected shapes are 252×448, 448×252, 448×448, and 32×48. Add a deterministic client subclass whose clock proves preprocessing occurs after the start timestamp.

- [ ] **Step 5: Verify client RED**

Run outside the restricted socket sandbox:

```bash
.venv/bin/pytest -q tests/test_vlm_client.py
```

Expected: failures because `image_max_edge` is absent and request timing starts after encoding.

- [ ] **Step 6: Implement bounded resize and complete client timing**

Start timing before image parts are built. Before JPEG encoding, validate an ndarray-like image shape, compute `scale = max_image_edge / max(height, width)`, and call:

```python
image = cv2.resize(
    frame.image,
    (round(width * scale), round(height * scale)),
    interpolation=cv2.INTER_AREA,
)
```

only when `scale < 1`. Encode the resized image in memory and keep existing error mapping.

- [ ] **Step 7: Verify GREEN**

Run:

```bash
.venv/bin/pytest -q tests/test_cli.py tests/test_vlm_client.py
```

Expected: all selected tests pass.

- [ ] **Step 8: Commit the model/input unit**

```bash
git add tools/realtime_camera/src/nono_realtime_camera/cli.py \
  tools/realtime_camera/src/nono_realtime_camera/vlm_client.py \
  tools/realtime_camera/tests/test_cli.py \
  tools/realtime_camera/tests/test_vlm_client.py
git commit -m "feat: default to small single-frame VLM"
```

---

### Task 3: Document the fast benchmark workflow

**Files:**
- Modify: `tools/realtime_camera/README.md`
- Test: `tools/realtime_camera/tests/test_packaging.py`

**Interfaces:**
- Documents: default model, one-frame mode, resize/token defaults, explicit 2B comparison command, and warm/cold interpretation.

- [ ] **Step 1: Write a failing documentation contract test**

Extend the existing README/package test to require these exact arguments in the documented command surface:

```python
for option in (
    "--vlm-input-mode",
    "--vlm-image-max-edge",
    "--vlm-max-tokens",
):
    assert option in readme
```

- [ ] **Step 2: Verify RED**

Run:

```bash
.venv/bin/pytest -q tests/test_packaging.py
```

Expected: failure because the new options are not documented.

- [ ] **Step 3: Update README**

Document the default fast command and an explicit quality comparison:

```bash
nono-camera dashboard --vlm --vlm-input-mode latest \
  --vlm-image-max-edge 448 --vlm-max-tokens 16

nono-camera dashboard --vlm \
  --vlm-model mlx-community/Qwen3-VL-2B-Instruct-4bit \
  --vlm-input-mode adaptive --vlm-max-tokens 48
```

State that first download and Metal compile are cold-start costs and only later samples count toward warm latency.

- [ ] **Step 4: Verify GREEN and lint**

Run:

```bash
.venv/bin/pytest -q tests/test_packaging.py
.venv/bin/ruff check .
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit documentation**

```bash
git add tools/realtime_camera/README.md tools/realtime_camera/tests/test_packaging.py
git commit -m "docs: explain small VLM benchmark"
```

---

### Task 4: Full regression and M1 Pro acceptance

**Files:**
- Create ignored evidence: `tools/realtime_camera/.runtime/small-vlm-benchmark.json`
- Modify only if evidence reveals a defect: the smallest affected source/test pair, using a fresh RED→GREEN cycle.

**Interfaces:**
- Produces: reproducible cold/warm fixed-image and 30-second camera measurements.
- Consumes: dashboard `/api/state`, existing control endpoints, and the actual camera/VLM sidecar.

- [ ] **Step 1: Run full automated verification**

```bash
.venv/bin/pytest -q
.venv/bin/ruff check .
git diff --check
```

Expected: all tests pass, Ruff reports no errors, and diff check is clean.

- [ ] **Step 2: Run the fixed-image compatibility probe**

Use the existing ignored runtime image, `HF_HUB_DISABLE_XET=1`, and the project Hugging Face cache. Record download duration separately, then run at least five warm 448-pixel/16-token requests. Capture non-empty Chinese output and per-request wall time.

- [ ] **Step 3: Run the real camera dashboard**

Start the dashboard on an available loopback port with the default 0.8B settings. Keep it running at least 30 seconds after the model is ready, inspect the visible video/dashboard, and collect `/api/state` snapshots without storing JPEG/Base64.

- [ ] **Step 4: Calculate acceptance metrics**

Write JSON containing hardware, commit, model ID, model cache size, cold timings, warm sample list, warm min/P50/P95/max, semantic success count, input-frame counts, maximum pending depth, drops/stales, capture FPS, fast emit interval P95, and fast end-to-emit P95. State `underOneSecond` from complete warm responses only.

- [ ] **Step 5: Clean runtime ownership and inspect Git**

Stop only processes started by this task. Verify runtime artifacts remain ignored and no Base64/image payload is staged:

```bash
git status --short
git diff --check
git diff --cached --check
```

- [ ] **Step 6: Run submission gates and deliver**

Run the required independent testing and review gates for the final unchanged diff, fix accepted findings with new tests, rerun full verification, commit the final evidence-backed changes, and push `codex/vlm-integration` to `origin`.
