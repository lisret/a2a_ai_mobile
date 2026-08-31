# NoNo VLM One-Click Adaptive Frames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-command startup for the complete local camera/VLM dashboard and hot-adjustable 1–4 frame input for changed one-second windows while keeping static windows at one frame.

**Architecture:** Extend the existing versioned dashboard config with a dynamic-frame cap, then let `DashboardRuntime` pass the current hot value into the existing semantic selector. Preserve the latest-only worker and fast-path isolation. Add a Bash entrypoint that resolves its own directory, prepares locked dependencies and the pinned detector model, then `exec`s the existing dashboard CLI.

**Tech Stack:** Python 3.11, pytest, Flask dashboard API, vanilla JavaScript, Bash, uv, OpenCV, MediaPipe, MLX-VLM.

## Global Constraints

- Default semantic input remains one latest frame per one-second cooldown.
- `semanticDynamicFrameCount` is an integer from 1 through 4.
- Static windows always submit one latest frame; changed windows submit up to the configured count in time order.
- Existing `--vlm-input-mode latest|adaptive` remains compatible: it initializes the hot value to 1 or 3 respectively.
- Camera capture, preview, and fast analysis never wait for VLM work.
- The semantic worker remains latest-only and does not accumulate historical windows.
- Default model remains `mlx-community/Qwen3.5-0.8B-MLX-4bit` with 448px images and 16 output tokens.
- Runtime files remain under Git-ignored `tools/realtime_camera/.runtime/`.

---

### Task 1: Hot-configured adaptive frame selection

**Files:**

- Modify: `tools/realtime_camera/tests/test_dashboard_config.py`
- Modify: `tools/realtime_camera/tests/test_semantic_scheduler.py`
- Modify: `tools/realtime_camera/tests/test_dashboard_runtime.py`
- Modify: `tools/realtime_camera/tests/test_cli.py`
- Modify: `tools/realtime_camera/src/nono_realtime_camera/dashboard_config.py`
- Modify: `tools/realtime_camera/src/nono_realtime_camera/semantic_scheduler.py`
- Modify: `tools/realtime_camera/src/nono_realtime_camera/dashboard_runtime.py`
- Modify: `tools/realtime_camera/src/nono_realtime_camera/cli.py`

**Interfaces:**

- Produces: `DashboardConfigV1.semantic_dynamic_frame_count: int` and API field `semanticDynamicFrameCount`.
- Produces: `select_semantic_frames(..., dynamic_frame_count: int | None = None) -> tuple[FramePacket, ...]`.
- Preserves: `input_mode="latest"` selects one and `input_mode="adaptive"` selects three when no explicit hot value is supplied.

- [ ] **Step 1: Write failing configuration and selector tests**

Add assertions that the default and API value are 1, patches of 0/5 fail atomically, and moving windows select exact counts:

```python
assert DashboardConfigStore().snapshot().semantic_dynamic_frame_count == 1
assert DashboardConfigStore().snapshot().to_dict()["semanticDynamicFrameCount"] == 1

@pytest.mark.parametrize(
    ("count", "expected"),
    [(1, [5]), (2, [1, 5]), (3, [1, 3, 5]), (4, [1, 2, 4, 5])],
)
def test_moving_window_selects_configured_evenly_spaced_frames(count, expected):
    selected = select_semantic_frames(
        make_window((1, 2, 3, 4, 5)),
        make_summary(motion="moving"),
        dynamic_frame_count=count,
    )
    assert [frame.frame_id for frame in selected] == expected
```

Also assert every static-window count from 1 through 4 returns only the last frame.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd tools/realtime_camera
.venv/bin/pytest tests/test_dashboard_config.py tests/test_semantic_scheduler.py -q
```

Expected: FAIL because the config field and selector keyword do not exist.

- [ ] **Step 3: Implement config validation and evenly spaced selection**

Add the API mapping, dataclass field and validation:

```python
"semanticDynamicFrameCount": "semantic_dynamic_frame_count",

semantic_dynamic_frame_count: int = 1

_validate_int("semantic_dynamic_frame_count", self.semantic_dynamic_frame_count, 1, 4)
```

Update selection so an explicit hot value wins, while omitted values preserve CLI compatibility:

```python
if dynamic_frame_count is None:
    dynamic_frame_count = 1 if input_mode == "latest" else 3
dynamic = summary.motion != "stationary" or summary.scene_changed or summary.changed
count = min(len(window.frames), dynamic_frame_count if dynamic else 1)
if count == 1:
    indexes = (len(window.frames) - 1,)
else:
    denominator = count - 1
    last = len(window.frames) - 1
    indexes = tuple(
        (position * last + denominator // 2) // denominator
        for position in range(count)
    )
```

Retain frame-id de-duplication and output order.

- [ ] **Step 4: Add runtime and CLI RED tests**

Add a runtime test that updates `semanticDynamicFrameCount` from 1 to 4 between changed windows and observes the next submission use four ordered frames. Extend CLI assembly assertions so `latest` initializes 1 and a separate `adaptive` parse initializes 3.

- [ ] **Step 5: Run runtime/CLI tests and verify RED**

Run:

```bash
.venv/bin/pytest tests/test_dashboard_runtime.py tests/test_cli.py -q
```

Expected: FAIL because runtime does not read the hot frame count and CLI does not initialize it.

- [ ] **Step 6: Wire hot config through runtime and CLI**

Pass the current config value when admitting each semantic task:

```python
frames = select_semantic_frames(
    window,
    summary,
    input_mode=self._semantic_input_mode,
    dynamic_frame_count=config.semantic_dynamic_frame_count,
)
```

Initialize the VLM dashboard config from the compatibility mode:

```python
dynamic_frame_count = 1 if args.vlm_input_mode == "latest" else 3
DashboardConfigV1(
    semantic_enabled=True,
    semantic_cooldown_seconds=1,
    semantic_dynamic_frame_count=dynamic_frame_count,
)
```

- [ ] **Step 7: Run all Task 1 tests and commit**

Run:

```bash
.venv/bin/pytest tests/test_dashboard_config.py tests/test_semantic_scheduler.py tests/test_dashboard_runtime.py tests/test_cli.py -q
```

Expected: PASS.

Commit:

```bash
git add tools/realtime_camera/src/nono_realtime_camera tools/realtime_camera/tests
git commit -m "feat: hot-adjust VLM input frame count"
```

---

### Task 2: Dashboard control for 1–4 changed-scene frames

**Files:**

- Modify: `tools/realtime_camera/tests/test_dashboard_web.py`
- Modify: `tools/realtime_camera/src/nono_realtime_camera/templates/dashboard.html`
- Modify: `tools/realtime_camera/src/nono_realtime_camera/static/dashboard.js`

**Interfaces:**

- Consumes: API configuration field `semanticDynamicFrameCount` from Task 1.
- Produces: DOM control `semantic-dynamic-frame-count` with `data-config="semanticDynamicFrameCount"`.

- [ ] **Step 1: Write failing HTML and JavaScript contract tests**

Require the rendered page to contain the new control and user-facing label. Extend the Node harness IDs, configurable inputs, synthetic state, and interaction assertions:

```javascript
["semantic-dynamic-frame-count", "semanticDynamicFrameCount", "1"]

config: {
  // existing fields
  semanticCooldownSeconds: cooldown,
  semanticDynamicFrameCount: dynamicFrames,
}
```

Simulate editing the value from 1 to 4, execute the debounce timer, and assert the PATCH body equals `{ semanticDynamicFrameCount: 4 }` while a stale poll cannot overwrite the displayed edit.

- [ ] **Step 2: Run focused dashboard tests and verify RED**

Run:

```bash
.venv/bin/pytest tests/test_dashboard_web.py -q
```

Expected: FAIL because the control and synchronization logic are absent.

- [ ] **Step 3: Add the dashboard control and synchronization**

Add beside VLM cooldown:

```html
<label class="control" for="semantic-dynamic-frame-count">
  <span><b>变化场景输入帧数</b><output id="semantic-dynamic-frame-count-value">1</output></span>
  <input id="semantic-dynamic-frame-count" data-config="semanticDynamicFrameCount"
         type="range" min="1" max="4" step="1">
</label>
```

Synchronize it in `applyConfig`:

```javascript
syncControl("semantic-dynamic-frame-count", config.semanticDynamicFrameCount, 0);
```

The existing generic `input[data-config]` mutation path handles debounce, revision ordering and edit protection.

- [ ] **Step 4: Run dashboard contracts and commit**

Run:

```bash
.venv/bin/pytest tests/test_dashboard_web.py -q
```

Expected: PASS, including the Node interaction contract.

Commit:

```bash
git add tools/realtime_camera/src/nono_realtime_camera/templates/dashboard.html tools/realtime_camera/src/nono_realtime_camera/static/dashboard.js tools/realtime_camera/tests/test_dashboard_web.py
git commit -m "feat: tune VLM frame count from dashboard"
```

---

### Task 3: One-command full-flow launcher

**Files:**

- Create: `tools/realtime_camera/run_vlm_camera.sh`
- Modify: `tools/realtime_camera/tests/test_packaging.py`
- Modify: `tools/realtime_camera/README.md`
- Modify: `docs/realtime-camera-vlm-tool-summary.md`

**Interfaces:**

- Produces: executable `tools/realtime_camera/run_vlm_camera.sh [extra dashboard arguments...]`.
- Accepts: `NONO_CAMERA_INDEX`, `NONO_DASHBOARD_PORT`, `NONO_VLM_PORT`, `NONO_OPEN_BROWSER`, and `UV_BIN` environment overrides.
- Executes: `.venv/bin/nono-camera dashboard --vlm` with the pinned small-model defaults.

- [ ] **Step 1: Write a failing launcher packaging test**

Add a test that requires the script to exist, be executable, resolve its own directory, run locked VLM dependency sync, pin the detector URL/SHA, configure local runtime caches and exec the full dashboard:

```python
def test_one_click_vlm_launcher_is_executable_and_pinned() -> None:
    root = Path(__file__).parents[1]
    launcher = root / "run_vlm_camera.sh"
    source = launcher.read_text()

    assert launcher.stat().st_mode & stat.S_IXUSR
    for required in (
        "sync --extra vlm --locked",
        "4b59100025bea1235a84c1038879a6cccc9f6c49f5e41144e91e74d99e780993",
        "HF_HUB_DISABLE_XET=1",
        "nono-camera\" dashboard",
        "--vlm",
        "--vlm-input-mode",
        "latest",
        "--vlm-image-max-edge",
        "448",
        "--vlm-max-tokens",
        "16",
    ):
        assert required in source
```

- [ ] **Step 2: Run packaging test and verify RED**

Run:

```bash
.venv/bin/pytest tests/test_packaging.py -q
```

Expected: FAIL because `run_vlm_camera.sh` does not exist.

- [ ] **Step 3: Implement the Bash launcher**

Use `#!/usr/bin/env bash` and `set -euo pipefail`. Resolve `TOOL_DIR`, locate `uv` from `UV_BIN`, `PATH`, or `/Users/a/.local/bin/uv`, then run:

```bash
"${UV}" sync --extra vlm --locked
```

Download a missing detector to `.runtime/models/efficientdet_lite0.tflite.part`, resume with `curl --continue-at -`, verify with `shasum -a 256`, then atomically rename it. Refuse an existing final file whose digest differs.

Build dashboard arguments with defaults plus `"$@"`, append `--open` unless `NONO_OPEN_BROWSER=0`, and replace the shell with:

```bash
MPLCONFIGDIR="${TOOL_DIR}/.runtime/matplotlib" \
HF_HOME="${TOOL_DIR}/.runtime/huggingface" \
HF_HUB_DISABLE_XET=1 \
exec "${TOOL_DIR}/.venv/bin/nono-camera" dashboard \
  --camera-index "${NONO_CAMERA_INDEX:-0}" \
  --model "${MODEL_PATH}" \
  --host 127.0.0.1 \
  --port "${NONO_DASHBOARD_PORT:-8765}" \
  --vlm \
  --vlm-model mlx-community/Qwen3.5-0.8B-MLX-4bit \
  --vlm-input-mode latest \
  --vlm-image-max-edge 448 \
  --vlm-port "${NONO_VLM_PORT:-8766}" \
  --vlm-max-tokens 16 \
  "${OPEN_ARGS[@]}" \
  "$@"
```

Mark the file executable.

- [ ] **Step 4: Document one-command use and dynamic frame behavior**

Make the first recommended command in `README.md`:

```bash
./run_vlm_camera.sh
```

Document first-run dependency/model downloads, `Ctrl-C`, supported environment overrides, optional extra CLI arguments, default one frame, and the dashboard's changed-scene 1–4 frame control. Update the conversation tool summary with the same launcher and frame-selection behavior.

- [ ] **Step 5: Run launcher static checks and focused tests**

Run:

```bash
bash -n run_vlm_camera.sh
.venv/bin/pytest tests/test_packaging.py tests/test_dashboard_config.py tests/test_semantic_scheduler.py tests/test_dashboard_web.py -q
```

Expected: shell syntax check and all tests PASS.

- [ ] **Step 6: Run complete verification**

Run:

```bash
.venv/bin/pytest -q
.venv/bin/ruff check .
git diff --check
```

Expected: all tests PASS, Ruff PASS, and no whitespace errors.

Then run the launcher against the cached local models, verify default 1-frame output, hot-adjust to 2–4 during visible motion, restore 1, stop with `Ctrl-C`, and confirm ports 8765/8766 are free.

- [ ] **Step 7: Commit and push the completed feature branch**

Commit:

```bash
git add tools/realtime_camera/run_vlm_camera.sh tools/realtime_camera/README.md docs/realtime-camera-vlm-tool-summary.md tools/realtime_camera/tests/test_packaging.py
git commit -m "feat: add one-click VLM camera launcher"
git push origin codex/vlm-integration
```
