# NoNo 本地实时 VLM 摄像头工具总结

更新日期：2026-08-31

当前分支：`codex/vlm-integration`

功能实现提交：`8b5c187`

## 1. 工具是什么

这是一个面向 Mac/Apple Silicon 的本地实时摄像头理解工具。它通过本机摄像头持续采集画面，同时提供两类结果：

1. **快速视觉结果**：运动、场景变化、对象进入或离开等，约每秒输出一次。
2. **VLM 语义结果**：用简短中文描述当前画面中的主要对象和动作。

工具带有本地网页调试台，可同时查看：

- 实时摄像头画面和检测框。
- 每秒快速摘要。
- 最新 VLM 描述。
- 模型、输入帧数和单次处理耗时。
- 采集、采样、预览 FPS。
- P50/P95 延迟、pending、drop、stale 和错误数。
- 可热调整的视觉分析参数。

所有服务只监听本机回环地址。原始图片、JPEG 和 Base64 不进入 API 状态、验收报告或 Git。

## 2. 需求演进

本工具围绕以下目标逐步形成：

- 能理解当前秒或当前帧的内容。
- 如果按秒分析，就每秒返回；如果按帧分析，就每秒汇总。
- 分析可以简单，但反馈必须快，目标为 1 秒内。
- VLM 不能阻塞摄像头画面、快速分析或用户反馈。
- 能在当前电脑上通过真实摄像头跑完整流程。
- 页面同时展示视频画面、运行参数和性能指标，便于后续调整 FPS、阈值和 VLM 策略。
- 第一轮默认每秒只给 VLM 一张最新图片，先测清最快完整响应时间。

## 3. 当前架构

```text
OpenCV 摄像头（约 30 FPS）
        |
        +--> 最新帧 --> MJPEG 网页预览
        |
        +--> 1 秒 FrameWindow
                  |
                  +--> Motion + MediaPipe --> 快速摘要（约 1 Hz）
                  |
                  +--> latest 模式：只取最后一帧
                             |
                             +--> 最长边缩放到 448px
                             |
                             +--> latest-only SemanticWorker
                                        |
                                        +--> 本机 MLX-VLM sidecar
                                                   |
                                                   +--> 简短中文语义
```

### 3.1 快速通道

快速通道负责确定性的每秒反馈，包括：

- 画面静止或移动。
- 左右方向移动。
- 场景明显变化。
- 已知对象检测。
- 对象进入或离开。

它不等待 VLM。即使模型正在下载、加载、推理、超时或退出，摄像头和快速摘要仍继续工作。

### 3.2 VLM 通道

VLM 运行在独立 MLX-VLM sidecar 进程中，通过本机 OpenAI-compatible HTTP 接口通信。

当前默认策略：

- 每个满足 1 秒冷却时间的窗口，只提交最后一帧。
- 调试台可把变化场景输入帧数热调整为 1～4；静止场景仍只提交最后一帧。
- 图片最长边缩到 448 像素，不放大小图。
- 最多生成 16 tokens。
- 使用确定性中文短提示，`temperature = 0`。
- 编码、HTTP 请求和响应解析都计入处理耗时。

### 3.3 latest-only 背压

语义 worker 只有一个正在执行的请求和一个待处理槽位：

- 模型空闲时立即处理最新任务。
- 模型忙时，新窗口覆盖尚未开始的旧 pending 任务。
- 不建立按窗口增长的历史队列。
- 已经执行的旧请求不会被强制中断。
- 过期结果不会覆盖最新画面语义。

因此，即使模型速度低于输入速度，反馈也不会越来越落后。

## 4. 默认模型与参数

| 项目 | 当前默认值 | 说明 |
| --- | --- | --- |
| VLM | `mlx-community/Qwen3.5-0.8B-MLX-4bit` | 小模型快速语义层 |
| 输入模式 | `latest` | 每个语义任务只取最新一帧 |
| 变化输入帧数 | 1 | 页面可在 1～4 间热调整；静止仍为 1 |
| 图片最长边 | 448px | 范围 64～2048 |
| 最大输出 | 16 tokens | 优先降低完整响应时间 |
| VLM 冷却 | 1 秒 | 页面可在 1～60 秒间热调整 |
| 快速采样 | 15 FPS | 用于形成每秒快速分析窗口 |
| 预览配置 | 12 FPS | 实际通常约 10 FPS |
| VLM 超时 | 15 秒 | 超时不会影响快速通道 |

原来的 `mlx-community/Qwen3-VL-2B-Instruct-4bit` 仍可通过命令行显式选择，用作质量对照。

## 5. 为什么从 2B 换成 0.8B

### Qwen3-VL-2B 真实基线

- 单帧 warm 完整响应：约 3.318 秒。
- 三帧完整响应：约 8.013～11.189 秒。
- 中文、细节和复杂语义能力较好。
- 不适合作为 M1 Pro 上每秒调用的主循环。

### Qwen3.5-0.8B 当前定位

- 参数量更小，MLX-VLM 0.6.16 已支持。
- 中文输出可用。
- Apache 2.0 模型，可作为产品候选继续评估。
- 在当前 448px、16-token、单帧条件下，完整响应稳定进入 1 秒以内。

### 其他调研候选

- **SmolVLM2-500M**：支持图片和真实视频，MLX/Swift 路径完整，但官方模型偏英文。
- **SmolVLM2-256M**：更小更快，但通用理解和中文能力下降更明显。
- **Apple FastVLM-0.5B**：Apple Silicon 延迟潜力最好，适合研究测速；模型许可证不允许直接用于商业产品。
- **Florence-2-base 0.23B**：适合检测、OCR、区域描述等固定任务，不是开放式视频理解模型。

## 6. M1 Pro 实测结果

测试硬件：

- `MacBookPro18,1`
- Apple M1 Pro
- 32 GB 统一内存
- 1280×720 摄像头输入

### 6.1 首次冷启动

0.8B 固定图片首次兼容性推理：

- 总 wall time：295.25 秒。
- 包含首次模型下载、加载和 Metal 编译。
- 模型缓存约 624 MiB。
- 冷启动耗时不计入 warm 延迟。

### 6.2 固定图片 warm

5 次完整响应：

```text
353ms, 266ms, 266ms, 268ms, 264ms
```

- 最小值：264ms。
- P50：266ms。
- P95：353ms。
- 最大值：353ms。
- 完整中文结果低于 1 秒：通过。

### 6.3 真实摄像头 30 秒验收

- VLM 成功结果：28 次。
- VLM P50：250.5ms。
- VLM P95：272ms。
- 每个成功结果输入帧数：1。
- pending、drop、stale、error：均为 0。
- 采集 FPS：29.98。
- 快速处理 P95：127ms。
- 快速输出间隔 P95：1008ms。
- 快速窗口结束到输出 P95：130ms。

关闭 VLM 后同进程采集为 30.07 FPS。开启 VLM 后采集 FPS 下降约 0.3%，未明显影响视频和快速通道。

### 6.4 后续人工运行

在真实桌面和笔记本键盘场景中观察到：

- 单次 VLM 常见处理时间约 260～390ms。
- 页面 P95 约 400ms。
- 能识别键盘、笔记本屏幕、手机和平板电脑等主要对象。
- 页面保持约 30 FPS 采集，drop 为 0。

## 7. 当前效果与限制

### 已达到

- 完整 VLM 结果低于 1 秒，而不只是首 token 低于 1 秒。
- 每秒只使用一张最新图片。
- 快速分析与 VLM 完全异步。
- 模型忙时不会积压历史窗口。
- 本机页面可以直接调参数并观察结果。
- VLM 故障不会导致摄像头和快速摘要停止。

### 已知限制

1. **细粒度类别较弱**

   固定图片中的糖果曾被描述成“小球”或“弹珠”。

2. **小模型可能猜测细节**

   例如把键盘描述为“被灰尘覆盖”，或对模糊屏幕内容产生不准确 OCR。

3. **16 tokens 偶尔截断句子**

   极短输出有利于速度，但部分描述可能在标点前结束。

4. **单帧不能稳定理解动作先后**

   它适合回答“当前是什么”，不擅长判断“刚才拿起、随后放下”等时序动作。

5. **页面展示的是完整请求处理耗时**

   当前没有单独展示视觉编码、首 token 和文本生成各阶段耗时。

## 8. 安装与运行

一键启动完整流程（推荐）：

```bash
cd tools/realtime_camera
./run_vlm_camera.sh
```

脚本会自动同步锁定依赖、下载并校验缺失的对象检测模型，然后启动摄像头、快速分析、VLM sidecar 和网页调试台。首次运行仍需等待 VLM 权重下载与 Metal 编译；后续会复用 `.runtime/` 缓存。按 `Ctrl-C` 停止完整流程。

可通过 `NONO_CAMERA_INDEX`、`NONO_DASHBOARD_PORT`、`NONO_VLM_PORT` 和 `NONO_OPEN_BROWSER=0` 覆盖常用启动项，也可在脚本末尾追加 dashboard 命令行参数。

手动安装与运行：

进入工具目录：

```bash
cd tools/realtime_camera
/Users/a/.local/bin/uv sync --extra vlm
```

首次运行允许下载模型：

```bash
MPLCONFIGDIR=.runtime/matplotlib \
HF_HOME=.runtime/huggingface \
HF_HUB_DISABLE_XET=1 \
.venv/bin/nono-camera dashboard \
  --camera-index 0 \
  --model .runtime/models/efficientdet_lite0.tflite \
  --vlm \
  --host 127.0.0.1 \
  --port 8765 \
  --vlm-port 8766
```

模型已缓存时可强制离线运行：

```bash
MPLCONFIGDIR=.runtime/matplotlib \
HF_HOME=.runtime/huggingface \
HF_HUB_OFFLINE=1 \
.venv/bin/nono-camera dashboard \
  --camera-index 0 \
  --model .runtime/models/efficientdet_lite0.tflite \
  --vlm
```

然后打开：

```text
http://127.0.0.1:8765/
```

### 8.1 显式写出快速参数

```bash
.venv/bin/nono-camera dashboard \
  --camera-index 0 \
  --model .runtime/models/efficientdet_lite0.tflite \
  --vlm \
  --vlm-model mlx-community/Qwen3.5-0.8B-MLX-4bit \
  --vlm-input-mode latest \
  --vlm-image-max-edge 448 \
  --vlm-max-tokens 16
```

### 8.2 切回 2B 质量对照

```bash
.venv/bin/nono-camera dashboard \
  --camera-index 0 \
  --model .runtime/models/efficientdet_lite0.tflite \
  --vlm \
  --vlm-model mlx-community/Qwen3-VL-2B-Instruct-4bit \
  --vlm-input-mode adaptive \
  --vlm-image-max-edge 1280 \
  --vlm-max-tokens 48
```

## 9. 停止方式

- 前台启动时按 `Ctrl-C`，停止 dashboard 并释放摄像头。
- 页面“停止”按钮只释放摄像头，页面和 VLM sidecar 保持运行，方便稍后重新开始。
- 完整退出后应确认 `8765` 和 `8766` 均不再监听。
- 如果 dashboard 已退出但它创建的 sidecar 异常残留，只终止经过 PID/命令行确认属于本次运行的 sidecar，不使用模糊进程匹配。

## 10. 页面参数

当前支持热调整：

- 分析开关。
- 对象检测开关。
- VLM 开关。
- 采样 FPS。
- 预览 FPS。
- 对象检测阈值。
- 运动比例阈值。
- 场景变化阈值。
- VLM 冷却时间。
- 变化场景输入帧数（1～4，静止始终一帧）。

页面还提供：

- 开始、停止、重启摄像头。
- 单独重启 VLM。
- 快速结果与 VLM 结果统一时间线。

## 11. 主要代码位置

| 文件 | 职责 |
| --- | --- |
| `tools/realtime_camera/src/nono_realtime_camera/camera.py` | OpenCV 摄像头采集 |
| `motion.py` | 帧差、运动和场景变化 |
| `mediapipe_detector.py` | MediaPipe 对象检测 |
| `windowing.py` | 一秒窗口 |
| `dashboard_runtime.py` | 摄像头、快速通道和语义通道编排 |
| `semantic_scheduler.py` | latest/adaptive 选帧和触发策略 |
| `semantic_worker.py` | latest-only 异步任务和过期结果处理 |
| `vlm_client.py` | 缩图、JPEG、提示和 HTTP 请求 |
| `vlm_sidecar.py` | MLX-VLM 子进程、探活、重启和清理 |
| `dashboard_state.py` | 生命周期、事件和性能指标 |
| `dashboard_web.py` | 本地 Flask API |
| `templates/dashboard.html` | 调试台结构 |
| `static/dashboard.js` | 页面状态刷新和交互 |
| `cli.py` | 命令行参数与完整装配 |

## 12. 测试与交付状态

- 自动化测试：224 项通过。
- Ruff：通过。
- 工作分支：`codex/vlm-integration`。
- 实现基线已推送至远端提交 `8b5c187`。
- 真实验收证据保存在 Git 忽略路径：
  `tools/realtime_camera/.runtime/small-vlm-benchmark.json`。

## 13. 推荐的后续优化顺序

1. **调整输出长度**

   比较 16、24 和 32 tokens，找出完整句子质量与延迟的平衡点。

2. **分辨率单变量实验**

   比较 448、384 和 336px，同时记录 P50/P95 和语义退化。

3. **变化区域 ROI**

   一秒内持续计算变化区域，只把低分辨率全局图和关键 ROI 提交给 VLM。

4. **自适应 1～4 帧**

   普通状态仍用最后一帧；只有需要动作先后关系时，选择起始、变化峰值和结束帧。

5. **Apple Vision/Core ML 快通道**

   使用检测、跟踪和状态机在 100～200ms 内返回确定性事件，小 VLM 只处理语义变化或低置信度场景。

6. **模型 A/B**

   继续测试 SmolVLM2-500M/256M；FastVLM-0.5B 只用于研究速度上限。

7. **阶段耗时与流式展示**

   分离 JPEG、视觉编码、首 token 和完整生成耗时；必要时提前显示首批 token，但仍以完整结果判断是否达到 1 秒。

最终推荐架构仍是：快速 CV/跟踪状态机保证稳定反馈，小 VLM 提供秒级语义，2B 模型只在复杂 OCR、未知物体或需要解释时作为低频高质量 fallback。
