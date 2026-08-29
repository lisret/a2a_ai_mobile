# NoNo 实时摄像头理解 Mac 原型实施计划

> **执行方式：** 当前会话串行执行。每个任务遵循 RED → GREEN → 回归测试；不修改 `AwesomeProject/` 中现有未提交文件。真实摄像头、依赖下载和模型下载需要分别通过系统权限与网络门槛。

**目标：** 在当前 Apple Silicon Mac 上跑通“摄像头持续采集、内部帧级分析、每秒一条快速摘要、变化时异步语义增强”的完整链路，并用 5 分钟数据证明 1 Hz 反馈不被慢模型阻塞。

**架构：** 原型位于独立的 `tools/realtime_camera/` Python 包。采集线程只写最新帧槽，8 FPS 采样器写一秒环形缓冲，单调时钟每秒冻结窗口；快速通道以最新窗口优先执行，700ms 后发射器复用最后确认状态；语义通道只有一个运行槽和一个最新待运行槽，通过 `windowId` 附加迟到但仍有效的短描述。

**技术栈：** Python 3.11、uv、MediaPipe 0.10.31、OpenCV 4.12、NumPy 2.2.6、pytest；FastVLM-0.5B 使用独立 Python 环境与常驻 worker，避免其 PyTorch/Transformers 依赖污染快速通道。

**设计依据：** `docs/superpowers/specs/2026-08-29-nono-realtime-camera-understanding-design.md`

## 全局约束

- 每秒快速结果是硬路径；VLM 未安装、加载失败、超时或迟到均不得打断它。
- 只使用 `time.monotonic_ns()` 计算窗口和耗时；墙上时钟只允许用于报告文件名。
- 摄像头线程、快速分析和语义分析之间都不得出现无界队列。
- 原始帧默认只在内存中存在；JSONL 只记录结构化结果和数值指标。
- 8 FPS 验收未通过前不升 FPS。
- 占位语义适配器只能验证调度，不能用于宣称真实 VLM 已跑通。
- 每个生产模块先用 fake clock/fake camera/fake analyzer 写失败测试，再实现。

## 任务 1：建立独立 Python 包与输出合同

**文件：**

- 修改：`.gitignore`
- 创建：`tools/realtime_camera/pyproject.toml`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/__init__.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/contracts.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/config.py`
- 创建：`tools/realtime_camera/tests/test_contracts.py`

**RED：** 测试构造非法置信度、非递增窗口、非法 phase，并断言合同拒绝；断言 JSON 序列化不含图像字段。

```python
def test_summary_rejects_confidence_outside_unit_interval() -> None:
    with pytest.raises(ValueError, match="confidence"):
        RealtimeSecondSummaryV1.example(confidence=1.1)

def test_summary_json_has_no_frame_payload() -> None:
    payload = RealtimeSecondSummaryV1.example().to_dict()
    assert not ({"frame", "image", "jpeg", "pixels"} & payload.keys())
```

**GREEN：** 使用冻结 `dataclass` 实现三个 V1 合同：`RealtimeSecondSummaryV1`、`RealtimeSemanticEnrichmentV1`、`RealtimeAnalysisStatusV1`。枚举字段以 `Literal` 限制，`__post_init__` 校验时间、置信度、帧数和处理时长；`to_dict()` 输出 camelCase，与设计文档 TypeScript 合同一致。

依赖固定为：

```toml
[project]
requires-python = ">=3.11,<3.12"
dependencies = [
  "mediapipe==0.10.31",
  "numpy==2.2.6",
  "opencv-python==4.12.0.88",
  "psutil==7.0.0",
]

[dependency-groups]
dev = ["pytest==8.4.1", "pytest-cov==6.2.1", "ruff==0.12.11"]
```

实机验证发现 MediaPipe 1.0.1 在当前 macOS/Apple M1 Pro 上会在 `DrishtiMetalHelper` 初始化处原生 abort，EfficientDet-Lite0 与 SSD MobileNet V2 均可复现；回退到官方 macOS arm64 wheel 0.10.31 后同一 EfficientDet 模型成功加载。FastVLM 的 NumPy 约束仅存在于独立 `.venv-fastvlm`。

**验证：**

```bash
cd tools/realtime_camera
uv venv --python 3.11
uv sync
uv run pytest tests/test_contracts.py -q
uv run ruff check src tests
```

**提交：** `feat: define realtime camera output contracts`

## 任务 2：实现一秒窗口、固定节拍和最新优先回压

**文件：**

- 创建：`tools/realtime_camera/src/nono_realtime_camera/clock.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/frames.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/windowing.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/latest_only.py`
- 创建：`tools/realtime_camera/tests/fakes.py`
- 创建：`tools/realtime_camera/tests/test_windowing.py`
- 创建：`tools/realtime_camera/tests/test_latest_only.py`

**RED：** 用 `FakeClock` 驱动 8 FPS 输入，验证 `[start,end)` 边界、恰好 8 帧、窗口冻结后不可修改；模拟分析耗时 1.5 秒，验证队列深度永远不超过 1、过期窗口被最新窗口替换。

```python
def test_latest_only_replaces_pending_window() -> None:
    executor = LatestOnlyExecutor[int, int](slow_double)
    executor.submit(1)
    executor.submit(2)
    executor.submit(3)
    executor.release_running_for_test()
    assert executor.started_items == [1, 3]
    assert executor.max_pending_depth == 1
```

**GREEN：**

- `FramePacket` 只持有 `frame_id`、`captured_at_ms` 和内存数组引用。
- `OneSecondRingBuffer` 用 `deque` 丢弃一秒前帧，`freeze_window()` 复制元数据和数组引用元组。
- `FixedCadenceTicker` 根据绝对 deadline 计算下一次 tick，不用 `sleep(1)` 累积漂移。
- `LatestOnlyExecutor` 保留一个正在运行任务和一个最新 pending；迟到完成结果以 generation 丢弃。

**验证：**

```bash
uv run pytest tests/test_windowing.py tests/test_latest_only.py -q
uv run pytest -q
```

**提交：** `feat: add one-second windows and latest-only scheduling`

## 任务 3：实现运动分析、跟踪和每秒快速摘要

**文件：**

- 创建：`tools/realtime_camera/src/nono_realtime_camera/motion.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/tracking.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/aggregation.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/fast_path.py`
- 创建：`tools/realtime_camera/tests/test_motion.py`
- 创建：`tools/realtime_camera/tests/test_tracking.py`
- 创建：`tools/realtime_camera/tests/test_aggregation.py`

**RED：** 用合成灰度帧和检测框覆盖静止、右移、左移、对象进入、对象离开、一次抖动不得翻转状态、连续两帧才确认动作。

```python
def test_single_noisy_frame_does_not_flip_stationary_to_moving() -> None:
    aggregator = SecondWindowAggregator(confirming_frames=2)
    result = aggregator.aggregate([stationary(), noisy_motion(), stationary()])
    assert result.motion == "stationary"
```

**GREEN：**

- `MotionAnalyzer` 将帧缩至 320px 宽、灰度化，使用 `absdiff` 的阈值像素占比估算全局变化；对象方向来自稳定 track 的归一化质心位移。
- `CentroidTracker` 使用类别一致 + 最近质心贪心匹配；允许一次窗口丢失，第二个窗口确认离开。
- `SecondWindowAggregator` 输出小而稳定的事实集合，摘要模板只含“画面基本静止”“有人进入/离开”“人物向左/右移动”“物品或场景发生变化”等短句。
- `FastPerceptionEngine` 组合检测、运动和聚合；超过预算的结果由上层 generation 机制忽略。

**验证：**

```bash
uv run pytest tests/test_motion.py tests/test_tracking.py tests/test_aggregation.py -q
uv run pytest --cov=nono_realtime_camera --cov-report=term-missing -q
```

**提交：** `feat: add fast motion and presence summaries`

## 任务 4：接入 OpenCV 摄像头与 MediaPipe 检测器

**文件：**

- 创建：`tools/realtime_camera/src/nono_realtime_camera/assets.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/camera.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/mediapipe_detector.py`
- 创建：`tools/realtime_camera/tests/test_assets.py`
- 创建：`tools/realtime_camera/tests/test_camera.py`
- 创建：`tools/realtime_camera/tests/test_mediapipe_detector.py`

**模型来源：** 默认从 MediaPipe 官方存储下载 EfficientDet-Lite0：

```text
https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite
```

只有默认模型不能被当前 MediaPipe runtime 加载时才使用官方 SSD MobileNet V2：

```text
https://storage.googleapis.com/mediapipe-models/object_detector/ssd_mobilenet_v2/float32/1/ssd_mobilenet_v2.tflite
```

下载器写入用户明确传入的 cache 目录，先写 `.partial`，成功加载验证后原子替换；错误不得留下假完整模型。

**RED：** mock `cv2.VideoCapture` 覆盖打开失败、读帧失败、重复 close；mock MediaPipe callback 覆盖乱序时间戳、低置信度过滤和类别白名单。

**GREEN：**

- `OpenCVCameraSource` 使用 AVFoundation 后端打开 index 0，优先 1280×720/30 FPS，失败时回退设备默认格式。
- 采集线程只更新带锁的 latest slot；分析消费者读取副本，永不阻塞采集。
- `MediaPipeObjectDetector` 使用 `RunningMode.LIVE_STREAM`，将 callback 的毫秒时间戳映射回窗口；置信度默认 0.45，只保留 person 与常见物品类别。
- 检测器加载失败时发出 `fast_analyzer_unavailable`，不得静默伪造对象结果。

**自动验证：**

```bash
uv run pytest tests/test_assets.py tests/test_camera.py tests/test_mediapipe_detector.py -q
```

**实机预检：**

```bash
uv run nono-camera preflight --camera-index 0
```

成功标准：设备可打开、连续读取 60 帧、分辨率和实际 FPS 有报告、退出后可再次打开。若 macOS 弹出摄像头权限，用户批准后重试；拒绝则输出 `camera_permission_denied` 与系统设置路径。

**提交：** `feat: connect mac camera and MediaPipe detector`

## 任务 5：接线运行时、JSONL 输出和 1 Hz 集成测试

**文件：**

- 创建：`tools/realtime_camera/src/nono_realtime_camera/metrics.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/emitter.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/runtime.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/cli.py`
- 创建：`tools/realtime_camera/tests/test_emitter.py`
- 创建：`tools/realtime_camera/tests/test_runtime.py`
- 创建：`tools/realtime_camera/README.md`

**RED：** fake camera 运行 10 个虚拟秒，验证 10 条 summary、发射间隔 1000ms、分析超时后 `stale=true`、停止后线程和摄像头全部释放；禁用检测器时 status 是 degraded 而非停止心跳。

**GREEN：**

- CLI 子命令：`preflight`、`run`、`validate`、`fps-sweep`。
- `run` 默认 `--sample-fps 8 --emit-hz 1 --fast-budget-ms 700 --duration 0`；stdout 每行一个合同 JSON。
- `SummaryEmitter` 每个 deadline 取当时已完成的最新结果，未完成则复用最后确认状态并标 stale，不等待未来结果。
- `MetricsCollector` 只保留直方图数值、计数器和最大队列深度；结束时输出 P50/P95/P99。
- SIGINT/SIGTERM 按“停止采样 → 冻结/丢弃任务 → 关闭模型 → 释放摄像头”顺序清理。

**验证：**

```bash
uv run pytest tests/test_emitter.py tests/test_runtime.py -q
uv run pytest -q
uv run ruff check src tests
```

**首次真实运行：**

```bash
uv run nono-camera run --camera-index 0 --sample-fps 8 --preview --duration 30
```

检查：30 秒内有 30 条快速结果；遮挡、人物移动和静止能反映在下一秒；关闭窗口或 Ctrl-C 后摄像头指示灯熄灭。

**提交：** `feat: run realtime camera summaries at one hertz`

## 任务 6：实现异步语义调度与四帧时序输入

**文件：**

- 创建：`tools/realtime_camera/src/nono_realtime_camera/semantic.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/contact_sheet.py`
- 创建：`tools/realtime_camera/tests/test_semantic.py`
- 创建：`tools/realtime_camera/tests/test_contact_sheet.py`
- 修改：`tools/realtime_camera/src/nono_realtime_camera/runtime.py`

**RED：** 覆盖变化触发、静止冷却、不超过一个 running + 一个 pending、pending 替换、结果最多落后一个窗口、过期结果丢弃、VLM 异常不影响快速输出。

**GREEN：**

- `SemanticTrigger` 对 entered/left/changed、场景变化、低置信度和保底间隔触发；静止窗口不重复触发。
- `ContactSheetBuilder` 选择 `t-750/-500/-250/current` 最近帧，统一大小后拼成 2×2 BGR 图；没有任何磁盘中间文件。
- `SemanticWorker` 接口接收 JPEG bytes、prompt、windowId；调度器 latest-only，完成后先检查 `latest_emitted_window_id - window_id <= 1`。
- 测试适配器输出固定但带明确 `modelId=test-double` 的结果，仅用于集成测试。

**验证：**

```bash
uv run pytest tests/test_semantic.py tests/test_contact_sheet.py tests/test_runtime.py -q
```

**提交：** `feat: schedule non-blocking semantic enrichment`

## 任务 7：接入真实 FastVLM-0.5B 常驻 worker

**文件：**

- 创建：`tools/realtime_camera/fastvlm/pyproject.toml`
- 创建：`tools/realtime_camera/fastvlm/src/nono_fastvlm_worker/__init__.py`
- 创建：`tools/realtime_camera/fastvlm/src/nono_fastvlm_worker/server.py`
- 创建：`tools/realtime_camera/src/nono_realtime_camera/fastvlm_client.py`
- 创建：`tools/realtime_camera/tests/test_fastvlm_client.py`
- 创建：`tools/realtime_camera/scripts/setup_fastvlm.sh`
- 修改：`tools/realtime_camera/README.md`

**环境隔离：** `setup_fastvlm.sh` 将 Apple 官方 `apple/ml-fastvlm` 检出到 `.runtime/fastvlm-src` 并固定到提交 `592b4ad`；创建 `.venv-fastvlm`，安装官方锁定的 PyTorch 2.6、torchvision 0.21、Transformers 4.48.3 和 NumPy 1.26.4。模型权重放在 `.runtime/models/fastvlm-0.5b-stage3/`，全部由 `.gitignore` 排除。

**RED：** client/worker 协议测试覆盖 ready、一次请求、16～24 token 上限、超时、worker 退出、畸形响应、迟到结果；runtime 测试断言所有失败仅关闭语义通道。

**GREEN：**

- worker 启动时加载一次模型，通过本机 Unix domain socket 接收长度前缀 JSON + JPEG bytes；每次只处理一个请求。
- prompt 固定为“用不超过一句中文描述当前画面或这一秒内最明显的变化，不猜身份”；确定性解码，最大新 token 24。
- client 启动握手最长等待 120 秒；单次推理可配置超时，超时只丢本任务，不杀快速路径。
- 日志只记录 windowId、模型 ID、耗时和错误代码，不记录图片或完整 raw response。

**验证：**

```bash
cd tools/realtime_camera
./scripts/setup_fastvlm.sh
uv run pytest tests/test_fastvlm_client.py tests/test_runtime.py -q
uv run nono-camera run --camera-index 0 --sample-fps 8 --semantic fastvlm --duration 60
```

真实成功标准：至少产生一条 `source=semantic_enrichment`、`modelId=fastvlm-0.5b-stage3` 的结果；人工禁用或杀死 worker 后快速结果仍按秒连续。若官方模型在当前系统/依赖组合无法加载，记录完整环境与安全错误码，回到快速链路继续验收，但不得标记“完整 VLM 流程通过”。

**提交：** `feat: add FastVLM semantic worker`

## 任务 8：5 分钟真实摄像头验收

**文件：**

- 创建：`tools/realtime_camera/src/nono_realtime_camera/validation.py`
- 创建：`tools/realtime_camera/tests/test_validation.py`
- 创建运行产物（不提交）：`tools/realtime_camera/.runtime/reports/baseline-8fps.json`
- 修改：`tools/realtime_camera/README.md`

**RED：** 报告校验器对 299 条窗口、P95 间隔 1101ms、fast P95 701ms、queue depth 2、stale >5% 分别失败。

**GREEN：** `validate` 运行 300 秒并计算：窗口数、interval P50/P95/P99、fast latency P50/P95/P99、采集/采样 FPS、stale 比例、丢弃窗口、语义触发/完成/超时/过期、CPU、RSS、最大队列深度。

**真实动作脚本：**

1. 0～60 秒保持静止。
2. 60～120 秒有人进入并坐下。
3. 120～180 秒左右移动。
4. 180～240 秒拿起或放下一个明显物品。
5. 240～300 秒离开画面。

**命令：**

```bash
uv run nono-camera validate \
  --camera-index 0 \
  --sample-fps 8 \
  --duration 300 \
  --semantic fastvlm \
  --report .runtime/reports/baseline-8fps.json
```

**验收门槛：** 300 个有效一秒窗口产生 300 条快速结果；interval P95 为 900～1100ms；fast P95 ≤700ms；最大 pending depth ≤1；stale ≤5%；静止不持续触发语义；快速事实能在下一窗口反映进入、离开和明显移动；结束后摄像头可重新打开；原始帧未落盘。

**提交：** `test: add realtime camera stability validation`

## 任务 9：FPS 梯度与自适应采样

**文件：**

- 创建：`tools/realtime_camera/src/nono_realtime_camera/adaptive_fps.py`
- 创建：`tools/realtime_camera/tests/test_adaptive_fps.py`
- 修改：`tools/realtime_camera/src/nono_realtime_camera/cli.py`
- 创建运行产物（不提交）：`tools/realtime_camera/.runtime/reports/fps-sweep.json`

**RED：** 状态机测试覆盖静止降到 4 FPS、普通运动升到 12 FPS、快速运动短时升到 15/24 FPS、fast 超时或 CPU 压力时降档、任何档位外部输出仍是 1 Hz；加入升降档迟滞避免频繁振荡。

**GREEN：** 先用固定 `8 → 12 → 15 → 24` 各运行相同场景和时长；第一个违反门槛的档位停止继续升档。固定档数据完成后才启用 `AdaptiveFpsController`：静止 4、普通 8/12、短时 burst 15/24，负载和 stale 触发降档。

**命令：**

```bash
uv run nono-camera fps-sweep \
  --camera-index 0 \
  --levels 8,12,15,24 \
  --seconds-per-level 120 \
  --report .runtime/reports/fps-sweep.json
```

**选择规则：** 选择满足全部门槛的最高固定 FPS，而不是平均吞吐最高值。若 12 FPS 已使 interval P95、fast P95、stale 或内存越界，则 8 FPS 是当前基线；报告必须保留失败档数据。

**验证：**

```bash
uv run pytest tests/test_adaptive_fps.py tests/test_runtime.py -q
uv run pytest -q
uv run ruff check src tests
```

**提交：** `perf: add measured adaptive camera sampling`

## 完成前总门禁

```bash
cd tools/realtime_camera
uv run pytest --cov=nono_realtime_camera --cov-report=term-missing -q
uv run ruff check src tests
uv run nono-camera preflight --camera-index 0
```

最终交付必须同时列出：依赖/模型版本、真实摄像头权限状态、30 秒冒烟结果、5 分钟验收报告路径、FastVLM 是否为真实成功、最优固定 FPS、自适应策略是否启用、所有未通过门槛。只要真实 VLM 未完成，就使用“快速链路通过、语义链路未通过”，不能简称“整个流程通过”。
