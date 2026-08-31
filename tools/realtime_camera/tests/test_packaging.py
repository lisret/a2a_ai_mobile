from __future__ import annotations

import os
import shutil
import stat
import subprocess
import tomllib
from pathlib import Path


def test_vlm_extra_supports_socks_proxy_downloads() -> None:
    project = tomllib.loads((Path(__file__).parents[1] / "pyproject.toml").read_text())

    assert "socksio==1.0.0" in project["project"]["optional-dependencies"]["vlm"]


def test_readme_documents_small_vlm_benchmark_controls() -> None:
    readme = (Path(__file__).parents[1] / "README.md").read_text()

    assert "mlx-community/Qwen3.5-0.8B-MLX-4bit" in readme
    for option in (
        "--vlm-input-mode",
        "--vlm-image-max-edge",
        "--vlm-max-tokens",
    ):
        assert option in readme


def test_one_click_vlm_launcher_is_executable_and_pinned() -> None:
    root = Path(__file__).parents[1]
    launcher = root / "run_vlm_camera.sh"
    source = launcher.read_text()

    assert launcher.stat().st_mode & stat.S_IXUSR
    for required in (
        'TOOL_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"',
        "sync --extra vlm --locked",
        "4b59100025bea1235a84c1038879a6cccc9f6c49f5e41144e91e74d99e780993",
        "HF_HUB_DISABLE_XET=1",
        'nono-camera" dashboard',
        "--vlm",
        "--vlm-input-mode",
        "latest",
        "--vlm-image-max-edge",
        "448",
        "--vlm-max-tokens",
        "16",
    ):
        assert required in source


def test_one_click_launcher_runs_without_browser_on_macos_bash(
    tmp_path: Path,
) -> None:
    source_launcher = Path(__file__).parents[1] / "run_vlm_camera.sh"
    tool_dir = tmp_path / "realtime_camera"
    fake_bin = tmp_path / "fake-bin"
    launcher = tool_dir / "run_vlm_camera.sh"
    detector = tool_dir / ".runtime/models/efficientdet_lite0.tflite"
    camera_cli = tool_dir / ".venv/bin/nono-camera"
    uv = fake_bin / "uv"
    shasum = fake_bin / "shasum"
    args_file = tmp_path / "dashboard-args.txt"
    detector.parent.mkdir(parents=True)
    camera_cli.parent.mkdir(parents=True)
    fake_bin.mkdir()
    detector.write_bytes(b"test detector")
    shutil.copy2(source_launcher, launcher)
    launcher.chmod(0o755)
    uv.write_text("#!/bin/sh\nexit 0\n")
    shasum.write_text(
        "#!/bin/sh\n"
        "echo 4b59100025bea1235a84c1038879a6cccc9f6c49f5e41144e91e74d99e780993\n"
    )
    camera_cli.write_text('#!/bin/sh\nprintf "%s\\n" "$@" > "$NONO_TEST_ARGS_FILE"\n')
    uv.chmod(0o755)
    shasum.chmod(0o755)
    camera_cli.chmod(0o755)
    environment = os.environ.copy()
    environment.update(
        {
            "NONO_OPEN_BROWSER": "0",
            "NONO_TEST_ARGS_FILE": str(args_file),
            "PATH": f"{fake_bin}:{environment['PATH']}",
            "UV_BIN": str(uv),
        }
    )

    result = subprocess.run(
        [str(launcher)],
        check=False,
        capture_output=True,
        text=True,
        env=environment,
    )

    assert result.returncode == 0, result.stderr
    arguments = args_file.read_text().splitlines()
    assert arguments[0] == "dashboard"
    assert "--vlm" in arguments
    assert "--open" not in arguments
