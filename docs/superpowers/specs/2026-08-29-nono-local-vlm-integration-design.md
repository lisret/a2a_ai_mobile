# NoNo 本地 VLM 接入设计

日期：2026-08-29
状态：已确认，待实施计划
目标模型：`mlx-community/Qwen3-VL-2B-Instruct-4bit`

## 1. 背景与目标

现有实时视觉调试台已经完成本机摄像头采集、MJPEG 预览、运动分析、MediaPipe 对象检测、每秒快速摘要、热调参和性能指标。快速通道在 M1 Pro 上实测采集约 30 FPS、预览约 10 FPS、快速处理 P95 约 125 ms，但页面中的 VLM 仍是明确不可用的占位状态。

本次接入真实本地 Qwen3-VL-2B，使调试台能够异步补充当前场景、对象关系和简单动作描述，同时保持以下优先级：

1. 摄像头预览和每秒快速摘要不能等待 VLM。
2. VLM 第一阶段允许在快速摘要之后 2～5 秒返回。
3. VLM 故障、超时或退出时，快速通道继续运行。
4. 为后续将 VLM 延迟压到 1 秒内保留真实分段指标，而不是提前引入复杂优化。

## 2. 范围

### 2.1 本次包含

- Apple Silicon 上的 MLX-VLM 本地推理服务。
- `mlx-community/Qwen3-VL-2B-Instruct-4bit`，约 1.8 GB。
- 自动启动或复用仅监听本机回环地址的 OpenAI-compatible VLM 服务。
- 静止单帧、移动或场景变化时最近一秒三帧的自适应输入。
- latest-only 异步语义队列，容量固定为 1。
- 真实语义事件、生命周期、延迟、覆盖和过期指标。
- 页面中的 VLM 状态、开关、参数、最新语义和事件展示。
- 单元、协议、集成、真机和用户视角验收。

### 2.2 本次不包含

- 手机端部署或移动端量化格式转换。
- 云端 API 或云端兜底。
- 音频理解。
- 持续保存图片、视频或语义历史到磁盘。
- 保证 Qwen3-VL-2B 第一阶段稳定在 1 秒内返回。
- 多 VLM 并发、批处理或多摄像头。

## 3. 技术决策

采用独立 MLX-VLM sidecar，而不是把模型直接加载进摄像头进程。

### 3.1 选择理由

- MLX 针对 Apple Silicon，适合当前 M1 Pro、32 GB 机器。
- MLX-VLM 提供本地 OpenAI-compatible 服务，主应用只依赖稳定 HTTP 合同。
- 模型加载、Metal 资源错误或推理异常不会直接终止摄像头进程。
- 后续可以替换模型、量化或服务实现，而不改语义调度和 UI 合同。

### 3.2 未选择方案

- **进程内 MLX-VLM：** 部署文件少，但模型加载和推理故障与摄像头生命周期耦合。
- **Transformers + PyTorch MPS：** 属于 Qwen 官方推理路径，但在当前 Apple Silicon 场景依赖更重，隔离和启动体验不如 MLX sidecar。

## 4. 总体架构

```text
OpenCV camera capture
        |
        +--> latest frame --> MJPEG preview
        |
        +--> 1-second FrameWindow
                  |
                  +--> motion + MediaPipe --> RealtimeSecondSummaryV1
                  |
                  +--> adaptive frame selection
                             |
                             +--> latest-only SemanticWorker
                                        |
                                        +--> Local MLX-VLM sidecar
                                                   |
                                                   +--> RealtimeSemanticEnrichmentV1
```

快速通道仍负责每秒必达结果。语义通道只消费已经形成的 `FrameWindow`，不参与摄像头读帧、快速检测或快速事件发布。

## 5. 组件设计

### 5.1 `VlmSidecarSupervisor`

职责：

- 探测配置的 `127.0.0.1:<port>` 是否已有兼容服务。
- 无可用服务且启用自动启动时，创建 MLX-VLM 子进程。
- 显式传入模型、`127.0.0.1`、端口和项目内 Hugging Face 缓存目录。
- 轮询健康状态并发布 `disabled`、`loading`、`ready`、`degraded` 或 `stopped`。
- 保留有界的最近错误摘要，不把无限子进程日志保存在内存。
- 只终止自己创建的子进程，不关闭用户预先启动的兼容服务。

建议启动命令语义：

```bash
python -m mlx_vlm.server \
  --model mlx-community/Qwen3-VL-2B-Instruct-4bit \
  --host 127.0.0.1 \
  --port 8766
```

sidecar 加载和首次模型下载都不得阻塞 Flask、摄像头或快速分析的启动。

### 5.2 `OpenAICompatibleVlmClient`

职责：

- 将 1 或 3 张内存 JPEG 编码为 `data:image/jpeg;base64,...`。
- 调用本机 `/v1/chat/completions`。
- 使用确定性、简短输出配置，默认最多 48 tokens。
- 解析并清理文本；空文本、非预期响应或非 2xx 状态视为失败。
- 返回模型 ID、语义文本和服务端请求耗时。

第一阶段使用简短中文提示：只描述图片中可见的主要对象、人与对象关系、简单动作或显著变化；限制为一到两句，不猜测身份、意图和画面外信息。

### 5.3 `AdaptiveSemanticFrameSelector`

输入为刚完成快速分析的 `FrameWindow` 和快速摘要：

- 无帧：不创建任务。
- `motion == stationary` 且 `sceneChanged == false`：选择最后一帧。
- 存在移动、方向移动、场景变化或对象进入/离开：选择首、中、末三帧。
- 少于三帧时去重并使用实际可用帧。

每个语义任务最多保留三张 1280×720 BGR 帧引用，队列容量为 1，因此原始帧内存有明确上限。JPEG 编码发生在语义 worker 内，不增加快速事件发布的关键路径。

### 5.4 `SemanticWorker`

职责：

- 独立线程执行 VLM 请求。
- 待处理槽位只有一个；新任务原子覆盖尚未开始的旧任务。
- 已经在执行的 HTTP 请求不强行中断。
- 完成后比较最新提交任务 ID；若已有更新任务，旧结果计为过期且不更新“当前语义”。
- 成功结果以 `RealtimeSemanticEnrichmentV1` 追加到统一事件流，并引用原快速窗口 ID。
- 超时或错误更新语义状态和指标，但不产生伪造语义事件。

### 5.5 `DashboardRuntime` 集成

- 启动时先启动摄像头和快速分析，再异步启动或连接 sidecar。
- 只有配置启用、sidecar `ready`、冷却时间满足且窗口有有效帧时才提交语义任务。
- 停止摄像头时停止提交并清空待处理任务。
- 恢复摄像头时跳过停止前残留帧，并保持窗口 ID 单调递增。
- 关闭应用时先停止语义 worker，再关闭由本应用创建的 sidecar。

## 6. 触发与背压

默认 `semanticCooldownSeconds = 5`。

触发规则：

1. VLM 刚就绪后的第一个完整窗口触发一次。
2. 对象进入、离开或集合变化时，在冷却允许后触发。
3. 移动或场景变化时，在冷却允许后触发。
4. 持续静止时最多每 10 秒触发一次心跳语义，用于更新当前场景。

冷却时间从“任务成功提交给 worker”开始计算。队列覆盖不会延长快速通道，也不会创建补偿队列。`semanticPendingDepth` 只能是 0 或 1。

## 7. 配置合同

保留现有版本化 `DashboardConfigV1`，本次使用已有字段：

- `semanticEnabled`
- `semanticCooldownSeconds`

新增 VLM 进程和请求参数作为启动配置，而不是热配置：

| CLI 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--vlm` | false | 启用本地 VLM sidecar 和语义 worker |
| `--vlm-model` | `mlx-community/Qwen3-VL-2B-Instruct-4bit` | Hugging Face ID 或本地模型目录 |
| `--vlm-host` | `127.0.0.1` | 只允许回环地址 |
| `--vlm-port` | `8766` | 本地服务端口 |
| `--vlm-timeout-seconds` | `15` | 单次请求超时 |
| `--vlm-max-tokens` | `48` | 最大生成 tokens |
| `--vlm-no-auto-start` | false | 只连接既有服务，不创建子进程 |

普通 `dashboard` 命令保持现状。`dashboard --vlm` 启用完整本地语义通道。
`DashboardConfigV1` 的通用默认值仍为 `semanticEnabled = false`；CLI 在收到 `--vlm` 时用 `semanticEnabled = true` 创建本次运行的初始配置。

## 8. 状态与事件合同

保留现有 `RealtimeSemanticEnrichmentV1`：

```json
{
  "schemaVersion": 1,
  "windowId": 42,
  "semanticSummary": "桌面上有水瓶和设备，一只手正在移动水瓶。",
  "modelId": "mlx-community/Qwen3-VL-2B-Instruct-4bit",
  "processingMs": 3180,
  "source": "semantic_enrichment"
}
```

`/api/state` 新增：

- `semanticLifecycle.phase`: `disabled | loading | ready | running | degraded | stopped`
- `semanticLifecycle.message`: 最近错误或加载说明
- `latestSemantic`: 最近被接受的真实语义结果
- `semanticAvailable`: sidecar 已就绪且协议探测通过

指标新增或落实：

- `semanticPendingDepth`
- `semanticProcessingP50Ms`
- `semanticProcessingP95Ms`
- `semanticDroppedCount`
- `semanticStaleCount`
- `semanticSuccessCount`
- `semanticErrorCount`
- `semanticInputFrameCount`

所有历史仍为有界内存结构，不包含 JPEG、Base64 或 ndarray。

## 9. 页面交互

### 9.1 状态

- 未以 `--vlm` 启动：显示“未启用本地 VLM”，开关禁用。
- 下载或加载：显示“Qwen3-VL 加载中”，快速画面继续。
- 就绪：开关可用，默认开启语义分析。
- 推理中：显示当前来源窗口和输入帧数。
- 降级：显示简短错误与“重启 VLM”操作，快速结果不受影响。

“重启 VLM”调用独立的 `POST /api/control/vlm/restart`；该操作只影响 sidecar 和语义 worker，不重启摄像头。

### 9.2 参数和结果

- 开放已有 `semanticEnabled` 开关。
- 增加语义冷却时间滑块，范围 1～60 秒。
- 增加“最新 VLM 语义”卡片：描述、来源窗口、模型、1/3 帧、处理耗时。
- 性能区增加 VLM P95、pending、覆盖和错误计数。
- 统一时间线同时显示 `fast_path` 和 `semantic_enrichment`，语义行通过窗口 ID 与快速行关联。

## 10. 错误处理

- **依赖未安装：** 标记 `degraded`，显示可执行的安装提示；快速通道继续。
- **首次模型下载：** 保持 `loading`，显示模型 ID 和缓存位置；不设置固定下载超时。
- **sidecar 启动退出：** 捕获退出码和有界日志尾部，允许页面重启。
- **健康探测失败：** 保持不可用，不开放 VLM 开关。
- **HTTP 超时：** 当前请求失败，错误计数加一，worker 继续等待后续任务。
- **响应无效：** 不发布语义事件，记录协议错误。
- **过期结果：** 不更新当前语义，过期计数加一。
- **停止或恢复摄像头：** 清空 pending，避免处理停止前画面；滚动语义延迟指标按会话重置。

## 11. 模型与依赖

MLX-VLM 作为可选依赖，避免破坏非 Apple Silicon 或只使用快速通道的安装：

```toml
[project.optional-dependencies]
vlm = ["mlx-vlm==0.6.16"]
```

`0.6.16` 是设计确认时的 PyPI 最新版本；实施时以该版本完成最小图像推理并更新 `uv.lock`。模型缓存设置到 `tools/realtime_camera/.runtime/huggingface`；`.runtime/` 已被 Git 忽略。

## 12. 测试设计

### 12.1 单元测试

- 自适应选帧：静止一帧、移动三帧、少帧去重、空窗口跳过。
- latest-only：pending 深度不超过 1，新任务覆盖旧 pending。
- 冷却和触发：首次、变化、移动、静止心跳。
- 过期结果：不更新 `latestSemantic`，计数正确。
- 超时和无效响应：不产生语义事件。
- 停止恢复：不消费旧帧，窗口 ID 继续递增，语义指标重置。
- 配置和 JSON 状态不包含图像负载。

### 12.2 协议与集成测试

- 使用本地假 OpenAI-compatible HTTP 服务校验多图消息、模型 ID、tokens 和超时。
- 模拟慢响应，验证摄像头捕获和快速事件仍前进。
- 模拟 sidecar 退出和恢复，验证生命周期与自动降级。

### 12.3 真实模型与用户视角

- 首次下载并完成一张固定图片的最小 Qwen3-VL 推理。
- 真摄像头静止场景产生单帧语义。
- 人或物移动产生三帧语义。
- 页面调整冷却时间在下一次触发生效。
- 页面停止、开始、重启 VLM 和重启摄像头均不产生旧窗口补发。
- 页面能够区分快速摘要和真实 VLM 语义，模型 ID 可见。

## 13. 验收标准

在 M1 Pro、32 GB、1280×720 摄像头条件下：

- 开启 VLM 后采集 FPS 相比关闭时下降不超过 10%。
- 快速输出间隔 P95 不超过 1.2 秒。
- 快速窗口结束到输出 P95 低于 1 秒。
- `semanticPendingDepth <= 1` 始终成立。
- 真实 Qwen3-VL 语义处理 P50 目标不超过 5 秒，单次超时 15 秒。
- VLM 超时、退出或无效响应时，视频和快速摘要继续。
- 停止恢复后无空语义任务、重复窗口 ID 或暂停时长污染。
- 页面展示真实 `modelId`；没有真实响应时不显示占位语义。
- 原始帧、JPEG 和 Base64 不写入磁盘或 JSON 状态。

## 14. 后续 1 秒内 VLM 优化

第一阶段先记录 JPEG 编码、请求等待、视觉编码、首 token 和完整生成耗时。在同一真实摄像头场景下按以下顺序实验：

1. 限制输入分辨率和视觉 token 数。
2. 静止与低变化场景只使用单帧。
3. 将输出压缩到 24～32 tokens。
4. 测试更低比特量化和视觉特征缓存。
5. 若 Qwen3-VL-2B 仍不能稳定低于 1 秒，引入更小的秒级 VLM 作为快速语义层，Qwen3-VL 保留为高质量异步校验层。

任何优化都必须同时报告语义延迟、快速通道延迟、采集 FPS 和明显语义退化，不能只比较单次模型生成速度。

## 15. 参考

- Qwen3-VL 官方仓库：https://github.com/QwenLM/Qwen3-VL
- Qwen3-VL-2B-Instruct：https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct
- MLX-VLM：https://github.com/Blaizzy/mlx-vlm
- MLX 4-bit 模型：https://huggingface.co/mlx-community/Qwen3-VL-2B-Instruct-4bit
