#!/usr/bin/env bash
set -euo pipefail

TOOL_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MODEL_URL="https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite"
MODEL_SHA256="4b59100025bea1235a84c1038879a6cccc9f6c49f5e41144e91e74d99e780993"
MODEL_DIR="${TOOL_DIR}/.runtime/models"
MODEL_PATH="${MODEL_DIR}/efficientdet_lite0.tflite"
MODEL_PART="${MODEL_PATH}.part"

if [[ -n "${UV_BIN:-}" ]]; then
  UV="${UV_BIN}"
elif command -v uv >/dev/null 2>&1; then
  UV="$(command -v uv)"
elif [[ -x /Users/a/.local/bin/uv ]]; then
  UV="/Users/a/.local/bin/uv"
else
  echo "错误：未找到 uv。请先安装：https://docs.astral.sh/uv/getting-started/installation/" >&2
  exit 1
fi

for command_name in curl shasum; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "错误：未找到 ${command_name}，无法准备检测模型。" >&2
    exit 1
  fi
done

cd "${TOOL_DIR}"
mkdir -p "${MODEL_DIR}" .runtime/matplotlib .runtime/huggingface

echo "[1/3] 检查 Python 与 VLM 依赖..."
"${UV}" sync --extra vlm --locked

model_digest() {
  shasum -a 256 "$1" | awk '{print $1}'
}

if [[ -f "${MODEL_PATH}" ]]; then
  if [[ "$(model_digest "${MODEL_PATH}")" != "${MODEL_SHA256}" ]]; then
    echo "错误：${MODEL_PATH} 校验失败。请移走该文件后重新运行。" >&2
    exit 1
  fi
else
  echo "[2/3] 下载 EfficientDet-Lite0 检测模型..."
  curl --fail --location --retry 3 --continue-at - \
    --output "${MODEL_PART}" "${MODEL_URL}"
  if [[ "$(model_digest "${MODEL_PART}")" != "${MODEL_SHA256}" ]]; then
    echo "错误：下载文件校验失败，已保留 ${MODEL_PART} 供断点续传。" >&2
    exit 1
  fi
  mv "${MODEL_PART}" "${MODEL_PATH}"
fi

export MPLCONFIGDIR="${TOOL_DIR}/.runtime/matplotlib"
export HF_HOME="${TOOL_DIR}/.runtime/huggingface"
export HF_HUB_DISABLE_XET=1

echo "[3/3] 启动摄像头、快速分析、VLM 和网页调试台..."
echo "调试台：http://127.0.0.1:${NONO_DASHBOARD_PORT:-8765}/"
echo "按 Ctrl-C 停止完整流程。"

DASHBOARD_ARGS=(
  "${TOOL_DIR}/.venv/bin/nono-camera" dashboard
  --camera-index "${NONO_CAMERA_INDEX:-0}"
  --model "${MODEL_PATH}"
  --host 127.0.0.1
  --port "${NONO_DASHBOARD_PORT:-8765}"
  --vlm
  --vlm-model mlx-community/Qwen3.5-0.8B-MLX-4bit
  --vlm-input-mode latest
  --vlm-image-max-edge 448
  --vlm-host 127.0.0.1
  --vlm-port "${NONO_VLM_PORT:-8766}"
  --vlm-timeout-seconds 15
  --vlm-max-tokens 16
)
if [[ "${NONO_OPEN_BROWSER:-1}" != "0" ]]; then
  DASHBOARD_ARGS+=(--open)
fi
DASHBOARD_ARGS+=("$@")

exec "${DASHBOARD_ARGS[@]}"
