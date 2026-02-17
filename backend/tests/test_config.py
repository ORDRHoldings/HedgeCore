"""
tests/test_config.py
Validates HedgeCalc environment and configuration schema (Phase II–IV baseline).
"""

import pytest
from app.core.config import settings


def test_settings_loaded():
    """Ensure essential environment variables and derived URLs are valid."""
    assert settings is not None
    assert settings.JWT_SECRET, "JWT_SECRET must be set in .env"
    assert len(settings.JWT_SECRET) >= 16, "JWT_SECRET must be secure length"
    assert settings.db_url.startswith("postgresql+asyncpg://"), "Async DB URL invalid"
    # accept either asyncpg or psycopg2 driver for sync url
    assert settings.sync_db_url.startswith(("postgresql+asyncpg://", "postgresql+psycopg2://")), "Sync DB URL invalid"



def test_settings_types_and_values():
    """Confirm types and positive durations for tokens."""
    assert isinstance(settings.JWT_ALG, str)
    assert isinstance(settings.ACCESS_EXPIRE_MIN, int)
    assert isinstance(settings.REFRESH_EXPIRE_MIN, int)
    assert settings.ACCESS_EXPIRE_MIN > 0
    assert settings.REFRESH_EXPIRE_MIN > 0
    assert settings.PASSWORD_MIN_LENGTH >= 8
    assert isinstance(settings.CORS_ALLOW_ORIGINS, list)
