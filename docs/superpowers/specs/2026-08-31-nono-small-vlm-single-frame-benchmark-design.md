# NoNo 小模型单帧秒级基准设计

日期：2026-08-31
状态：已确认，待实施计划

## 1. 目标

在现有本机摄像头调试台中增加一个可复现的“小模型、单帧、每秒提交”基准路径，优先验证 `mlx-community/Qwen3.5-0.8B-MLX-4bit` 在 M1 Pro、32 GB 上的真实延迟。

本轮回答一个具体问题：摄像头每秒只把最新一张低分辨率图片交给 VLM 时，完整中文短描述最快需要多久。现有 `mlx-community/Qwen3-VL-2B-Instruct-4bit` 保留为命令行可选对照模型。

## 2. 范围

### 2.1 包含

- 默认 VLM 改为 `mlx-community/Qwen3.5-0.8B-MLX-4bit`。
- VLM 启用时，默认每个完成的 1 秒窗口均可提交最新一帧。
- 输入图像在 VLM worker 内等比例缩小，最长边默认 448 像素，不放大原图。
- 最大输出默认 16 tokens，提示要求单句简短中文当前状态。
- 沿用 latest-only 槽位；推理忙时只保留最新窗口，不形成历史队列。
- 保留 `adaptive` 输入模式用于与现有静止一帧、动态三帧策略对照。
- 调试台继续展示实际模型 ID、本次输入帧数、完整请求处理耗时、P50/P95、覆盖数和错误数。
- 用固定图片和真实摄像头分别测 warm 延迟。

### 2.2 不包含

- 本轮不接入 FastVLM、SmolVLM2 或 Florence-2。
- 不增加流式 token UI；本轮测量完整短答案耗时。
- 不增加变化 ROI、视觉特征缓存、推测解码或多模型自动路由。
- 不把 0.8B 模型延迟预先声明为低于 1 秒；结果以本机 P50/P95 为准。
- 不修改摄像头快速通道的 1 Hz 输出合同。

## 3. 方案比较与选择

### 3.1 采用：现有 sidecar 内切换模型，加单帧快速输入模式

沿用 MLX-VLM OpenAI-compatible sidecar、`SemanticWorker` 和状态合同，只改变启动默认值、输入预处理和语义调度模式。这样能直接复用已有生命周期、降级、latest-only 和页面指标，并与 2B 基线进行同口径比较。

### 3.2 暂不采用：同时接入多个推理后端

FastVLM 和 SmolVLM2 可形成更宽的速度比较，但会同时引入模型特有 prompt、processor、许可证和中文质量变量，第一轮难以定位收益来源。

### 3.3 暂不采用：先做 CV/VLM 双通道路由

双通道是最终稳定低于 1 秒的推荐架构，但在引入事件路由前，应先测清单帧小 VLM 的真实能力。现有快速 CV 通道仍继续并行运行，因此本轮不会牺牲每秒反馈。

## 4. 配置合同

`dashboard --vlm` 的默认启动参数调整为：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--vlm-model` | `mlx-community/Qwen3.5-0.8B-MLX-4bit` | 可显式传回 2B 模型做对照 |
| `--vlm-input-mode` | `latest` | `latest` 每窗口一张；`adaptive` 保留原 1/3 帧规则 |
| `--vlm-image-max-edge` | `448` | 发送前等比例缩小，禁止小于 64 或大于 2048 |
| `--vlm-max-tokens` | `16` | 保留正整数校验 |
| `--vlm-timeout-seconds` | `15` | 保留现有超时上限 |

`DashboardConfigV1.semanticCooldownSeconds` 在 `dashboard --vlm` 启动时默认设为 1。页面已有 1～60 秒热调节保持不变。

`latest` 模式的触发规则是：首次可用窗口立即提交，之后只要距离上次提交达到当前冷却时间就提交，不区分静止或运动。`adaptive` 模式保持现有变化触发和 10 秒静止心跳。

## 5. 数据流

```text
1-second FrameWindow
        |
        +--> fast CV summary --> 立即发布（不等待 VLM）
        |
        +--> input mode
               | latest   -> 最后一帧
               | adaptive -> 静止 1 帧 / 动态首中末 3 帧
                        |
                        +--> latest-only SemanticWorker
                                  |
                                  +--> resize <= 448 px
                                  +--> JPEG encode
                                  +--> Qwen3.5-0.8B MLX sidecar
                                  +--> 完整中文单句结果
```

当 VLM 正在执行时，新窗口覆盖尚未开始的 pending 窗口。正在执行的请求不被强制中断；旧请求完成后，如已有更新任务，则沿用现有 stale 规则，不把旧语义显示为当前状态。

## 6. 预处理与提示

- 使用 `INTER_AREA` 对超过 `max_image_edge` 的图片等比例缩小。
- 不改变 BGR 通道约定；缩放后继续使用质量 80 的内存 JPEG。
- 编码、HTTP 请求和响应解析全部计入 `VlmResult.processing_ms`。
- 提示收敛为：只根据当前图片，用一句简短中文描述主要对象和正在发生的动作；无明显动作时描述当前场景；不解释、不推测、不输出前缀。
- 服务请求保持 `temperature = 0`，不引入采样参数。

## 7. 兼容与错误处理

- 当前锁定的 `mlx-vlm==0.6.16` 已包含 `qwen3_5` 模型实现；实机验收仍需执行固定图片最小推理，不能只依赖包目录判断兼容。
- 首次模型下载与 Metal 首次编译不计入 warm P50/P95，但分别记录下载、冷启动和首个 warm 请求耗时。
- 0.8B 加载或推理失败时，生命周期进入 `degraded`；摄像头、预览和快速摘要继续。
- 参数非法时在 CLI 解析阶段失败，不启动摄像头或 sidecar。
- 模型响应为空、超时或协议错误时不发布伪造语义。

## 8. 测试

### 8.1 自动化

- CLI 默认模型、默认 16 tokens、输入模式和最长边参数。
- `latest` 模式无论静止或运动均只选择最后一帧。
- `latest` 模式按 1 秒冷却提交静止窗口；`adaptive` 保持原有心跳规则。
- 横图、竖图、方图正确缩小且不放大小图。
- 发给假 HTTP 服务的 JPEG 解码后最长边不超过配置值。
- `processing_ms` 覆盖预处理、请求和解析。
- 慢 VLM 下 pending 深度不超过 1，快速窗口继续前进。

### 8.2 M1 Pro 实机基准

所有模型完成一次冷启动后，以同一提示、同一 448 像素输入和 16 tokens 配置执行：

1. 固定图片 warm 请求至少 5 次。
2. 真实摄像头运行至少 30 秒。
3. 记录语义成功样本的 P50、P95、最小值、最大值和样本数。
4. 同时记录采集 FPS、快速输出间隔 P95、快速 end-to-emit P95、semantic pending 最大值、drop 和 stale。
5. 至少保留一条非空中文结果，人工检查它与画面基本一致。

先测 0.8B；只有它不能加载或 warm 结果明显不可用时，才把 2B 作为阻塞诊断对照，不重复下载与本目标无关的其他模型。

## 9. 验收标准

- 默认模型和配置确实为 0.8B、latest、448、16 tokens、1 秒冷却。
- 每个提交任务的 `inputFrameCount` 均为 1。
- `semanticPendingDepth <= 1` 始终成立，没有按窗口累积的请求队列。
- 30 秒真实摄像头期间快速输出间隔 P95 不超过 1.2 秒，快速 end-to-emit P95 低于 1 秒。
- 开启小 VLM 后采集 FPS 相比关闭时下降不超过 10%。
- 页面显示真实模型 ID和完整请求处理耗时，不把下载或冷启动耗时混入 warm 统计。
- 报告明确给出是否达到完整语义结果 `<1 s`；未达到时报告真实数值，不用首 token 或快速 CV 延迟替代。
- 自动化测试和 Ruff 通过，运行态缓存、图片和 Base64 不进入 Git。

## 10. 后续顺序

如果 0.8B 单帧 warm P95 仍超过 1 秒，后续按单变量顺序继续：

1. 448 降到 384/336，比较语义退化。
2. 接入 SmolVLM2-500M，再按需要测试 256M。
3. 以 FastVLM-0.5B 测 Apple Silicon 速度上限，但不用于商业交付。
4. 引入变化 ROI 和 Apple Vision/Core ML 快通道事件路由。
5. 最后再评估流式首 token、视觉缓存或推测解码。

## 11. 参考

- Qwen3.5-0.8B MLX 4bit：<https://huggingface.co/mlx-community/Qwen3.5-0.8B-MLX-4bit>
- MLX-VLM：<https://github.com/Blaizzy/mlx-vlm>
- SmolVLM2：<https://huggingface.co/blog/smolvlm2>
- Apple FastVLM：<https://machinelearning.apple.com/research/fast-vision-language-models>
