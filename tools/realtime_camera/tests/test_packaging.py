from __future__ import annotations

import tomllib
from pathlib import Path


def test_vlm_extra_supports_socks_proxy_downloads() -> None:
    project = tomllib.loads((Path(__file__).parents[1] / "pyproject.toml").read_text())

    assert "socksio==1.0.0" in project["project"]["optional-dependencies"]["vlm"]
