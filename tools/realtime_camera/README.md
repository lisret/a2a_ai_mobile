# NoNo Realtime Camera Prototype

当前原型在 Mac 上持续采集摄像头，内部按目标 FPS 形成一秒窗口，并对外每秒输出一条 JSON 摘要。快速路径包含帧差/光流运动分析；传入模型时增加 MediaPipe EfficientDet-Lite0 对象检测。原始帧只保存在内存中。

## 安装

```bash
cd tools/realtime_camera
/Users/a/.local/bin/uv sync
```

当前实机锁定组合：Python 3.11.15、MediaPipe 0.10.31、OpenCV 4.12.0、NumPy 2.2.6。MediaPipe 1.0.1 在本机加载两个官方 Object Detector 模型时都会在 `DrishtiMetalHelper` 原生 abort，因此不能升级后直接视为兼容。

## 模型

官方 EfficientDet-Lite0：

```text
URL: https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite
SHA256: 4b59100025bea1235a84c1038879a6cccc9f6c49f5e41144e91e74d99e780993
Path: .runtime/models/efficientdet_lite0.tflite
```

`.runtime/` 已被 git 忽略。模型、报告和任何运行时文件都不会提交。

## 运行

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
- 真实 VLM 语义增强尚未接入，不能把当前结果称为“完整 VLM 流程通过”。

## 测试

```bash
PYTHONPATH=src MPLCONFIGDIR=.runtime/matplotlib .venv/bin/pytest -q
.venv/bin/ruff check src tests
```
