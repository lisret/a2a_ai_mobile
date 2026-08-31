# NoNo Realtime Camera Prototype

当前原型在 Mac 上持续采集摄像头，内部按目标 FPS 形成一秒窗口，并对外每秒输出一条 JSON 摘要。快速路径包含帧差/光流运动分析；传入模型时增加 MediaPipe EfficientDet-Lite0 对象检测。原始帧只保存在内存中。

## 安装

```bash
cd tools/realtime_camera
/Users/a/.local/bin/uv sync --extra vlm
```

当前实机锁定组合：Python 3.11.15、MediaPipe 0.10.31、OpenCV 4.12.0、NumPy 2.2.6。MediaPipe 1.0.1 在本机加载两个官方 Object Detector 模型时都会在 `DrishtiMetalHelper` 原生 abort，因此不能升级后直接视为兼容。

`--extra vlm` 同时安装锁定的 `mlx-vlm==0.6.16` 和 SOCKS 下载支持。默认真实语义模型为 `mlx-community/Qwen3.5-0.8B-MLX-4bit`；原来的 `mlx-community/Qwen3-VL-2B-Instruct-4bit` 保留为质量对照。模型下载到 `.runtime/huggingface`，后续启动复用缓存。sidecar 默认关闭 HF Xet、使用支持断点续传的普通 HTTP 下载，避免代理环境中大权重停在 0B。

## 模型

官方 EfficientDet-Lite0：

```text
URL: https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite
SHA256: 4b59100025bea1235a84c1038879a6cccc9f6c49f5e41144e91e74d99e780993
Path: .runtime/models/efficientdet_lite0.tflite
```

`.runtime/` 已被 git 忽略。模型、报告和任何运行时文件都不会提交。

## 运行

网页调试台（推荐）：

```bash
MPLCONFIGDIR=.runtime/matplotlib .venv/bin/nono-camera dashboard \
  --camera-index 0 \
  --model .runtime/models/efficientdet_lite0.tflite \
  --vlm \
  --vlm-input-mode latest \
  --vlm-image-max-edge 448 \
  --vlm-max-tokens 16 \
  --open
```

这些也是 `--vlm` 的默认快速基准参数：每个满足 1 秒冷却的窗口只提交最新一帧，图片最长边缩到 448 像素，完整答案最多生成 16 tokens。VLM 忙时只保留最新的待处理窗口，不积压历史请求。

要复测原 2B 自适应 1/3 帧质量路径：

```bash
MPLCONFIGDIR=.runtime/matplotlib .venv/bin/nono-camera dashboard \
  --camera-index 0 \
  --model .runtime/models/efficientdet_lite0.tflite \
  --vlm \
  --vlm-model mlx-community/Qwen3-VL-2B-Instruct-4bit \
  --vlm-input-mode adaptive \
  --vlm-image-max-edge 1280 \
  --vlm-max-tokens 48
```

服务只监听 `127.0.0.1:8765`，VLM sidecar 只监听 `127.0.0.1:8766`。页面包含实时视频、检测框、逐秒摘要、采集/采样/预览 FPS、处理延迟、事件历史，以及采样 FPS、预览 FPS、检测阈值、运动阈值、场景变化阈值和 VLM 冷却时间。滑块参数在下一窗口热生效；停止会释放摄像头，开始可重新打开。原始画面和 MJPEG 不写磁盘。

快速路径始终约 1 Hz 输出，加载模型和语义推理都在异步 sidecar/worker 中执行，不阻塞快速事件。默认 `latest` 模式始终使用一帧；显式选择 `adaptive` 时，静止窗口使用一帧，运动或场景变化窗口使用三帧。首次真实模型响应前，语义区只显示等待/加载状态，不会伪造占位结果；sidecar 加载失败、退出或推理报错时页面显示 degraded，快速路径和摄像头仍继续运行。可用“重启 VLM”单独恢复 sidecar，不会重启摄像头。

首次下载和第一次 Metal 编译属于冷启动，不能混入 warm 延迟比较。判断是否达到 1 秒时，以模型就绪后的完整中文结果处理时间 P50/P95 为准，不用下载时间、快速 CV 延迟或首 token 代替。

摄像头预检：

```bash
MPLCONFIGDIR=.runtime/matplotlib .venv/bin/nono-camera preflight \
  --camera-index 0 \
  --frames 60
```

运动分析基线：

```bash
MPLCONFIGDIR=.runtime/matplotlib .venv/bin/nono-camera run \
  --camera-index 0 \
  --sample-fps 8 \
  --duration 30
```

运动与对象检测：

```bash
MPLCONFIGDIR=.runtime/matplotlib .venv/bin/nono-camera run \
  --camera-index 0 \
  --sample-fps 15 \
  --duration 30 \
  --model .runtime/models/efficientdet_lite0.tflite
```

`--duration 0` 表示持续运行直到 Ctrl-C。摄像头权限被拒绝时，在“系统设置 → 隐私与安全性 → 摄像头”打开 Codex 权限后重试。

## 当前实机结果

- 预检：1280×720，60 帧，约 20.43 FPS。
- 8 FPS 运动基线：30/30 个窗口，处理 34–52ms，无 stale。
- EfficientDet：15/15 个窗口，处理 76–94ms，无 stale。
- 使用真实“处理完成时间”重测 8/12/15 FPS：发射间隔 P95 分别为 1003.7/1011.3/1003.0ms，窗口结束到输出 P95 为 117.4/154.45/133.3ms，当前建议 15 FPS。
- 24 FPS 初测实际只采到约 17.75 FPS，受摄像头约 20 FPS 上限限制，不作为当前默认值。
- 固定 Qwen3-VL 4-bit 模型对官方 candy.JPG 的真实离线冷启动推理 wall latency 为 125.90 秒，输出了非空中文描述；实时摄像头语义指标见 Task 9 验收报告和忽略的 `.runtime/vlm-acceptance.json`。

## 测试

```bash
PYTHONPATH=src MPLCONFIGDIR=.runtime/matplotlib .venv/bin/pytest -q
.venv/bin/ruff check src tests
```
