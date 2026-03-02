"""
backend/tests/test_security_config.py
SEC-01: Secret resolution chain tests.
Structural tests — no DB required.
"""

from __future__ import annotations

import os
import pathlib
import pytest


class TestSecretResolution:
    """Verify _resolve_secret works without breaking existing config."""

    def test_env_fallback_works(self, monkeypatch):
        """Existing env var loading still works (backward compat)."""
        monkeypatch.setenv("JWT_SECRET", "test_secret_abc_xyz_1234567890")
        import importlib
        import app.core.config as cfg_module
        importlib.reload(cfg_module)
        assert cfg_module._resolve_secret("JWT_SECRET") == "test_secret_abc_xyz_1234567890"

    def test_missing_in_dev_returns_empty(self, monkeypatch):
        """Missing key in dev mode returns empty string (no raise)."""
        monkeypatch.setenv("ENV", "dev")
        monkeypatch.delenv("NONEXISTENT_SEC_KEY_XYZ", raising=False)
        import app.core.config as cfg_module
        val = cfg_module._resolve_secret("NONEXISTENT_SEC_KEY_XYZ")
        assert val == ""

    def test_production_raises_on_missing(self, monkeypatch):
        """Production mode raises RuntimeError if secret is empty."""
        monkeypatch.setenv("ENV", "production")
        monkeypatch.delenv("NONEXISTENT_PROD_KEY_XYZ", raising=False)
        import app.core.config as cfg_module
        with pytest.raises(RuntimeError, match="CRITICAL"):
            cfg_module._resolve_secret("NONEXISTENT_PROD_KEY_XYZ")

    def test_gitignore_contains_env(self):
        """Verify .gitignore blocks .env files."""
        gitignore = pathlib.Path(__file__).parents[3] / ".gitignore"
        assert gitignore.exists(), ".gitignore must exist at repo root"
        content = gitignore.read_text()
        assert ".env" in content, ".gitignore must block .env files"

    def test_no_plaintext_dev_secrets_in_tracked_files(self):
        """Dev secret values must not appear in non-.env.example tracked files."""
        import subprocess
        repo_root = pathlib.Path(__file__).parents[3]
        result = subprocess.run(
            ["git", "grep", "-l", "dev_secret_key_hedgecalc_2026"],
            capture_output=True,
            text=True,
            cwd=repo_root,
        )
        # Only .env.example files are allowed to mention it
        hits = [
            line for line in result.stdout.strip().splitlines()
            if line and ".env.example" not in line and ".env" not in line
        ]
        assert hits == [], f"Dev secret found in tracked files: {hits}"
