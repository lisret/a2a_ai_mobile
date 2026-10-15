# NoNo 实时摄像头理解与每秒摘要设计

日期：2026-08-29

## 1. 目标

先在当前 Apple Silicon Mac 上跑通一条可测量的实时摄像头理解链路，再将相同边界接入 NoNo React Native 应用。

系统持续接收摄像头画面，在内部进行帧级或一秒窗口级分析，对外稳定地每秒返回一次简短结果。快速通道必须独立于视觉语言模型（VLM），即使 VLM 尚未加载、推理超时或失败，每秒反馈仍然继续。

首轮成功标准：

1. 摄像头连续运行至少 5 分钟。
2. 内部以 8 FPS 采样并保存最近一秒环形缓冲。
3. 对外以 1 Hz 输出，每次调度间隔目标为 `1000ms ± 100ms`。
4. 快速通道单窗口处理预算不超过 700ms。
5. 推理队列不增长，旧窗口不会阻塞最新窗口。
6. 能报告静止、有人进入或离开、人物移动以及明显物品变化。
7. 原始帧默认只存在内存，不写磁盘、不进入日志。

## 2. 非目标

- 首轮不追求 30 FPS 全帧语义理解。
- 首轮不要求 VLM 在一秒内生成开放式描述。
- 首轮不直接接入 React Native、Android JNI 或 iOS Native Module。
- 首轮不训练或微调模型。
- 首轮不做身份识别、人脸识别、持续录像或云端上传。
- 首轮不承诺手机端性能；Mac 原型只用于验证数据流、调度、回压和模型适配边界。
- 首轮不把 Qwen3-VL-2B 放入每秒必达路径。

## 3. 当前仓库与电脑状态

### 3.1 仓库

- 主应用是 React Native 双端项目，代码位于 `AwesomeProject/`。
- Android 已有屏幕截图能力，但没有真实摄像头连续采集管线。
- `AndroidManifest.xml` 已声明摄像头硬件为可选，不等于已具备运行时权限与采集实现。
- MiniCPM-V 4.6 下载与生命周期基础设施正在建设；真实本地推理、JNI 和视觉接线尚未完成，因此不能作为首轮跑通前提。
- 当前工作区包含其他未提交改动，本设计及后续原型必须使用独立文件边界，不覆盖无关改动。

### 3.2 当前 Mac

- 架构：Apple Silicon `arm64`。
- 系统：macOS 26.5。
- 当前系统 Python 未安装 OpenCV、PyTorch、MLX 或 Transformers。
- 当前环境未发现 FFmpeg。
- 沙箱内未枚举出摄像头；运行原型前必须执行摄像头存在性和 macOS 权限预检。

依赖安装和摄像头启用属于后续实施步骤，必须在进入实施计划后按环境权限执行。

## 4. 方案选择

### 4.1 否决：每秒同步运行 VLM

每秒把当前帧或短视频送入 Qwen3-VL、MiniCPM-V 或 FastVLM，再等待自然语言结果。该方案输出灵活，但视觉编码与文本生成延迟会直接阻塞 1 Hz 反馈，积压后延迟持续扩大，不满足必达要求。

### 4.2 保留：仅使用固定检测模型

轻量检测、跟踪和帧差可以稳定地做对象、移动和场景变化分析，延迟可控，但无法给出开放式语义描述。

### 4.3 采用：双通道混合

快速通道每秒必达；语义通道只在发生变化或需要补充解释时异步运行。两条通道通过 `windowId` 关联，语义通道不得阻塞、回滚或覆盖更新窗口。

## 5. 总体架构

```text
CameraFrameSource
  │ 15～30 FPS 原始采集
  ▼
FrameSampler
  │ 首轮固定 8 FPS；后续自适应
  ▼
OneSecondRingBuffer
  │ 单调时间戳 + 最近一秒帧
  ├─────────────────────────────┐
  ▼                             ▼
FastPerceptionEngine          SemanticTrigger
  │ 检测/跟踪/帧差               │ 只在显著变化时触发
  ▼                             ▼
SecondWindowAggregator        SemanticAnalyzer
  │ 固定 1 Hz                    │ 当前帧或四帧时序拼图
  ▼                             ▼
SummaryEmitter              SemanticEnrichment
  │ 每秒必达                      │ 可迟到、可丢弃
  └───────────────┬─────────────┘
                  ▼
            RealtimeAnalysisPort
```

模块边界：

| 模块 | 职责 | 不负责 |
| --- | --- | --- |
| `CameraFrameSource` | 打开摄像头、产生带单调时间戳的帧 | 模型推理、保存录像 |
| `FrameSampler` | 从原始帧流中按目标 FPS 取样 | 排队等待慢消费者 |
| `OneSecondRingBuffer` | 保留最近一秒帧并形成不可变窗口 | 长期历史、磁盘缓存 |
| `FastPerceptionEngine` | 对象、运动、进入/离开、明显变化 | 开放式长描述 |
| `SecondWindowAggregator` | 去重、抖动抑制、形成每秒事实 | 等待 VLM |
| `SemanticTrigger` | 判断是否需要语义增强 | 强制每秒调用 VLM |
| `SemanticAnalyzer` | 对代表帧或四帧拼图生成短语义 | 改变快速通道状态 |
| `SummaryEmitter` | 按 1 Hz 发射结果、处理 stale | 运行视觉模型 |
| `RealtimeAnalysisPort` | 为桌面原型和 React Native 提供稳定合同 | 绑定具体推理框架 |

## 6. 调度与数据流

### 6.1 帧采样

- 摄像头使用其稳定支持的原始帧率采集，首轮分析采样固定为 8 FPS。
- 每帧使用单调时钟记录 `capturedAtMs`，不用墙上时钟计算窗口。
- 采样器不维护无界队列。消费者繁忙时，新帧仍可覆盖当前采样槽，但最近一秒环形缓冲必须保留已接受的帧。
- 首轮窗口目标为 8 帧；帧数不足时仍可输出，并标记采样完整度。

### 6.2 一秒窗口

- `windowId` 从 1 单调递增。
- 每个窗口覆盖 `[startedAtMs, endedAtMs)`，窗口完成后变为不可变对象。
- 每 1000ms 关闭一个窗口并启动快速分析。
- 若前一窗口仍在分析，不排队等待：取消或丢弃旧工作，最新完整窗口优先。

### 6.3 快速通道

首轮基线固定为 MediaPipe Object Detector 的 Live Stream 模式与 EfficientDet-Lite0，配合简单质心跟踪和帧差/光流运动估计。MediaPipe 的异步实时接口允许在处理跟不上时主动丢弃输入帧，符合本设计的低延迟回压原则；检测结果必须使用输入的单调时间戳重新落入对应窗口。

若 EfficientDet-Lite0 在当前 Mac 环境无法加载，允许改用 MediaPipe 官方提供的 SSD MobileNet V2，但必须在测量报告中记录替换原因、模型文件和版本。不得在首轮临时加入第二套目标检测框架。

首轮快速事实集合保持小而稳定：

- `objects`：人和模型可靠支持的常见对象集合。
- `presenceChange`：对象进入、离开或数量发生明显变化。
- `motion`：静止、移动以及能够稳定估计时的粗方向。
- `sceneChanged`：全局画面发生显著变化。
- `confidence`：本窗口聚合置信度。

动作结论至少需要两个有效采样帧支持；临界状态使用连续窗口确认或迟滞阈值，避免“移动/静止”每秒翻转。

快速分析预算为 700ms。超时后 `SummaryEmitter` 使用最后一个已确认状态输出，并设置 `stale: true`，下一秒调度不等待本次工作。

### 6.4 语义通道

触发条件满足任一即可：

- 新对象进入或已有对象离开。
- 运动或场景状态发生明显变化。
- 快速通道置信度低，但当前画面信息充足。
- 距上次成功语义增强超过配置的保底间隔，并且设备负载允许。

输入优先级：

1. 只需描述当前内容时，选择窗口末尾质量最好的代表帧。
2. 需要表达一秒内变化时，将 `t-750ms`、`t-500ms`、`t-250ms`、`t` 四帧按时间顺序拼成单张时序图。

首轮 Mac 原型优先验证 FastVLM-0.5B 的短描述能力。若模型准备成本阻塞端到端跑通，可以先使用可替换的确定性占位语义适配器验证调度，但验收报告必须明确它不代表真实 VLM 成功。后续跨平台候选为 MiniCPM-V 4.6；Qwen3-VL-2B 只作为质量对照，不进入快速路径。

语义生成限制：

- 最大输出 16～24 token。
- 确定性解码，不使用长推理模式。
- 同时最多一个语义任务。
- 待运行槽只保留最新触发窗口。
- 语义结果最多允许落后当前最新已发射窗口一个窗口，即 `latestEmittedWindowId - result.windowId <= 1`；超过后直接丢弃。

## 7. 输出合同

### 7.1 每秒快速结果

```ts
interface RealtimeSecondSummaryV1 {
  schemaVersion: 1;
  windowId: number;
  startedAtMs: number;
  endedAtMs: number;
  emittedAtMs: number;
  sampledFrameCount: number;
  targetFrameCount: number;
  objects: string[];
  presenceChange: 'entered' | 'left' | 'changed' | 'none' | 'unknown';
  motion: 'stationary' | 'moving' | 'moving_left' | 'moving_right' | 'unknown';
  sceneChanged: boolean;
  summary: string;
  confidence: number;
  changed: boolean;
  stale: boolean;
  source: 'fast_path' | 'last_confirmed_state';
  processingMs: number;
}
```

### 7.2 异步语义增强

```ts
interface RealtimeSemanticEnrichmentV1 {
  schemaVersion: 1;
  windowId: number;
  semanticSummary: string;
  source: 'semantic_enrichment';
  modelId: string;
  processingMs: number;
}
```

语义增强只能附加到仍然有效的窗口，不能修改窗口的时间、快速事实或置信度。消费者可选择忽略语义增强。

### 7.3 生命周期状态

摄像头尚未运行或已经永久失败时不能伪造每秒摘要，改为发射明确的状态事件：

```ts
interface RealtimeAnalysisStatusV1 {
  schemaVersion: 1;
  phase: 'idle' | 'starting' | 'running' | 'degraded' | 'stopped' | 'failed';
  code?:
    | 'camera_unavailable'
    | 'camera_permission_denied'
    | 'camera_interrupted'
    | 'fast_analyzer_unavailable'
    | 'semantic_analyzer_unavailable';
  occurredAtMs: number;
}
```

只有 `phase` 为 `running` 或 `degraded` 时才维持 1 Hz 摘要。`degraded` 表示快速通道仍能输出但语义增强不可用，或窗口需要暂时复用最后确认状态。

## 8. 回压、错误与恢复

| 情况 | 系统行为 | 对外结果 |
| --- | --- | --- |
| 没有摄像头 | 不启动采集，允许重新枚举 | `camera_unavailable` |
| 摄像头权限被拒绝 | 不重复弹窗，提供系统设置指引 | `camera_permission_denied` |
| 当前窗口无有效帧 | 不运行模型 | 上一状态，`stale: true` |
| 快速分析超过 700ms | 中止或忽略迟到结果 | 上一状态，`stale: true` |
| VLM 未加载或加载失败 | 关闭语义增强，允许显式重试 | 快速通道继续 |
| VLM 推理超时 | 丢弃该任务 | 快速通道继续 |
| 迟到的语义结果 | 按 `windowId` 丢弃 | 无可见回滚 |
| 推理负载超过窗口速度 | 只保留最新完整窗口 | 不产生无界队列 |
| 摄像头中断 | 关闭当前窗口并尝试有限次数重连 | 每秒 stale，最终 `camera_interrupted` |

可观测指标仅记录数字和状态，不记录原始帧、图片编码、人物身份或完整开放式模型原始响应。至少记录：

- 采集 FPS、采样 FPS、窗口帧数。
- 快速分析耗时和超时数。
- 每秒发射间隔及偏差。
- 语义触发、完成、超时和过期丢弃数。
- 丢窗口数、stale 数、当前队列深度。

## 9. Mac 原型

### 9.1 目的

桌面原型只验证摄像头到结果的完整链路和性能测量，不直接复用 UI。核心模块和输出合同保持平台无关，以便后续替换摄像头和推理适配器。

### 9.2 阶段

1. **环境预检**：枚举摄像头、检查权限、确认可用推理后端和依赖。
2. **采集跑通**：8 FPS 采样、最近一秒环形缓冲、1 Hz 数字心跳输出。
3. **快速事实**：接入轻量检测/运动分析，输出真实结构化结果。
4. **语义增强**：接入真实 FastVLM-0.5B 或经审核的替代小 VLM；禁止用占位输出宣称完成。
5. **稳定性测试**：连续 5 分钟运行，覆盖静止、进入、离开、移动、物品变化。
6. **测量报告**：记录各阶段耗时、内存、CPU/GPU、丢帧、stale 和过期结果。

### 9.3 原型验收

- 摄像头预览和分析同时运行 5 分钟无崩溃。
- 300 个一秒窗口应产生 300 条快速结果；摄像头明确中断的窗口除外。
- 发射间隔 P95 位于 900～1100ms。
- 快速分析耗时 P95 不超过 700ms。
- 队列深度不超过 1，运行期间没有持续增长。
- 静止场景不会持续触发语义增强。
- 人进入、离开和明显移动能在下一个一秒结果中出现。
- VLM 人为禁用、超时或返回迟到时，快速结果仍连续。
- 进程退出后不存在摄像头占用；默认没有落盘原始帧。

## 10. FPS 优化

只有 8 FPS 原型通过全部验收后才能优化。每次只改变一个变量，并保留同一测试场景。

测试阶梯：

```text
8 FPS → 12 FPS → 15 FPS → 24 FPS
```

每档记录：

- 摄像头采集、缩放、快速模型、聚合和 VLM 分段耗时。
- CPU、GPU、内存和可获取时的温度或功耗代理指标。
- 实际采样 FPS、丢帧率、窗口丢弃率、stale 比例。
- 一秒发射间隔 P50/P95/P99。

某档出现下列任一情况即停止升档：

- 发射间隔 P95 超出 900～1100ms。
- 快速分析 P95 超过 700ms。
- stale 比例超过 5%。
- 队列深度持续为 1，说明处理速度追不上输入。
- 进程内存持续增长或设备出现明显持续降频。

稳定后可采用自适应策略：

- 静止画面：2～4 FPS。
- 普通移动：8～12 FPS。
- 快速动作：15～24 FPS 短时突发。
- 负载、温度或超时升高：自动降档。
- 对外摘要始终保持 1 Hz，不随内部 FPS 改变。

## 11. 手机端迁移边界

Mac 原型通过后，再实现平台适配：

| 平台 | 摄像头适配 | 推理适配候选 |
| --- | --- | --- |
| iOS | `AVCaptureSession` / 帧处理原生模块 | Core ML、MLX 或经验证的 llama.cpp 视觉适配 |
| Android | CameraX / ImageAnalysis 原生模块 | MNN 或已有 MiniCPM llama.cpp 路线 |

React Native 只消费 `RealtimeAnalysisPort` 事件，不接收每个原始帧，也不在 JS 线程执行图像缩放或模型推理。原始帧、环形缓冲、快速模型和 VLM 全部留在原生或独立推理层。

手机端必须重新执行延迟、温度、后台生命周期和权限验收，不能直接继承 Mac 结论。

## 12. 来源与验证日期

- Apple FastVLM 官方实现与 Apple Silicon/Apple 设备说明：<https://github.com/apple/ml-fastvlm>，核对日期 2026-08-29。
- OpenBMB MiniCPM-V 4.6 官方实现与端侧模型说明：<https://github.com/OpenBMB/MiniCPM-V>，核对日期 2026-08-29。
- Qwen3-VL 官方实现与视频 FPS/帧数控制：<https://github.com/QwenLM/Qwen3-VL>，核对日期 2026-08-29。
- Google AI Edge MediaPipe Object Detector Live Stream 接口与 EfficientDet-Lite0：<https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector/python>，核对日期 2026-08-29。
