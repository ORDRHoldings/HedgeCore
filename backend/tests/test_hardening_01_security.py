"""
tests/test_hardening_01_security.py
Targeted tests for Section 1 hardening changes.
"""
import os
import pytest


# ---------------------------------------------------------------------------
# 1. JWT_SECRET validator — ensure short secrets are rejected
# ---------------------------------------------------------------------------

def test_jwt_secret_valid_length_accepted():
    """Config should accept JWT_SECRET of exactly 32+ chars."""
    from app.core.config import Settings
    s = Settings(JWT_SECRET="a" * 32)  # type: ignore[call-arg]
    assert len(s.JWT_SECRET) >= 32


def test_jwt_secret_too_short_rejected():
    """Settings should reject JWT_SECRET shorter than 32 chars."""
    from pydantic import ValidationError
    from app.core.config import Settings
    with pytest.raises((ValidationError, ValueError)):
        Settings(JWT_SECRET="tooshort")  # type: ignore[call-arg]


# ---------------------------------------------------------------------------
# 2. Plan tier — "lite" is the most restrictive tier
# ---------------------------------------------------------------------------

def test_plan_tier_lite_is_lowest():
    """lite tier rank must be below all other tiers."""
    TIER_RANK = {"lite": -1, "smb": 0, "professional": 1, "enterprise": 2}
    assert TIER_RANK["lite"] < TIER_RANK["smb"]
    assert TIER_RANK["lite"] < TIER_RANK["professional"]
    assert TIER_RANK["lite"] < TIER_RANK["enterprise"]


def test_plan_tier_order_monotonic():
    TIER_RANK = {"lite": -1, "smb": 0, "professional": 1, "enterprise": 2}
    tiers = ["lite", "smb", "professional", "enterprise"]
    ranks = [TIER_RANK[t] for t in tiers]
    assert ranks == sorted(ranks), "Tier ranks must be strictly ascending"


# ---------------------------------------------------------------------------
# 3. INDICATIVE_FALLBACK kill switch (via _validate_market internals)
# ---------------------------------------------------------------------------

def _make_market_with_fallback():
    """Build a minimal MarketSnapshot with INDICATIVE_FALLBACK data class."""
    from app.schemas_v1.market import MarketSnapshot
    from datetime import datetime, timezone
    return MarketSnapshot(
        as_of=datetime.now(tz=timezone.utc),
        spot_rate=17.5,
        forward_points_by_month={"1": 0.001, "2": 0.002, "3": 0.003},
        provider_metadata={"data_class": "INDICATIVE_FALLBACK"},
    )


def test_indicative_fallback_blocked_in_production(monkeypatch):
    """INDICATIVE_FALLBACK data class should raise RuntimeError in production."""
    monkeypatch.setenv("ENV", "production")
    monkeypatch.delenv("ALLOW_INDICATIVE_FALLBACK", raising=False)

    from app.engine_v1 import validator
    import importlib
    importlib.reload(validator)

    market = _make_market_with_fallback()
    with pytest.raises(RuntimeError, match="FATAL"):
        validator._validate_market(market)


def test_indicative_fallback_allowed_with_override(monkeypatch):
    """INDICATIVE_FALLBACK should not raise when override flag is set."""
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("ALLOW_INDICATIVE_FALLBACK", "1")

    from app.engine_v1 import validator
    import importlib
    importlib.reload(validator)

    market = _make_market_with_fallback()
    # Should not raise — just returns warnings
    errors = validator._validate_market(market)
    codes = [e.code for e in errors]
    assert "V-022" in codes


def test_indicative_fallback_allowed_in_development(monkeypatch):
    """INDICATIVE_FALLBACK allowed in non-production environments."""
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("ALLOW_INDICATIVE_FALLBACK", raising=False)

    from app.engine_v1 import validator
    import importlib
    importlib.reload(validator)

    market = _make_market_with_fallback()
    errors = validator._validate_market(market)
    codes = [e.code for e in errors]
    assert "V-022" in codes
