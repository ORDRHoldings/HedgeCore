"""
backend/tests/test_secret_validator.py
Tests for startup secret validation.
"""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from app.core.secret_validator import validate_production_secrets


def test_weak_jwt_secret_exits_in_production():
    """Production must reject weak JWT secrets (dev_ prefix)."""
    with patch.dict(os.environ, {
        "ENV": "production",
        "JWT_SECRET": "***REDACTED_JWT_SECRET***",
        "DATABASE_URL": "postgresql+asyncpg://x:x@localhost/x",
    }):
        with pytest.raises(SystemExit):
            validate_production_secrets()


def test_short_jwt_secret_exits_in_production():
    """Production must reject JWT secrets shorter than 32 chars."""
    with patch.dict(os.environ, {
        "ENV": "production",
        "JWT_SECRET": "tooshort",
        "DATABASE_URL": "postgresql+asyncpg://x:x@localhost/x",
    }):
        with pytest.raises(SystemExit):
            validate_production_secrets()


def test_empty_jwt_secret_exits_in_production():
    """Production must reject empty JWT_SECRET."""
    env = {k: v for k, v in os.environ.items() if k != "JWT_SECRET"}
    env["ENV"] = "production"
    env["DATABASE_URL"] = "postgresql+asyncpg://x:x@localhost/x"
    with patch.dict(os.environ, env, clear=True):
        with pytest.raises(SystemExit):
            validate_production_secrets()


def test_strong_secrets_pass_in_production():
    """Valid production secrets should not raise."""
    with patch.dict(os.environ, {
        "ENV": "production",
        "JWT_SECRET": "a" * 64,
        "DATABASE_URL": "postgresql+asyncpg://real_user:real_pass@db.render.com/ordr",
    }):
        validate_production_secrets()  # must not raise


def test_weak_secrets_warn_in_development():
    """Development mode should warn but not exit."""
    with patch.dict(os.environ, {
        "ENV": "dev",
        "JWT_SECRET": "dev_weak",
        "DATABASE_URL": "sqlite+aiosqlite:///:memory:",
    }):
        validate_production_secrets()  # must not raise


def test_changeme_pattern_caught():
    """CHANGE_ME placeholder must be rejected in production."""
    with patch.dict(os.environ, {
        "ENV": "production",
        "JWT_SECRET": "CHANGE_ME_generate_with_openssl_rand_hex_64",
        "DATABASE_URL": "postgresql+asyncpg://x:x@localhost/x",
    }):
        with pytest.raises(SystemExit):
            validate_production_secrets()
