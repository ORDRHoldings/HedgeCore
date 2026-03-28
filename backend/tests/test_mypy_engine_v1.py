"""
tests/test_mypy_engine_v1.py

Hard gate: mypy --strict must pass on backend/app/engine_v1/ with zero errors.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest


ENGINE_V1_PATH = Path(__file__).parent.parent / "app" / "engine_v1"


def test_engine_v1_mypy_strict() -> None:
    """mypy --strict must exit 0 on all engine_v1 modules."""
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "mypy",
            str(ENGINE_V1_PATH),
            "--config-file",
            str(Path(__file__).parent.parent / "mypy.ini"),
            "--strict",
            "--no-error-summary",
            "--explicit-package-bases",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        pytest.fail(
            f"mypy --strict found errors in engine_v1/:\n{result.stdout}\n{result.stderr}"
        )
