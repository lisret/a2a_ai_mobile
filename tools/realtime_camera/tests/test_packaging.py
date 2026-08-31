from __future__ import annotations

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
