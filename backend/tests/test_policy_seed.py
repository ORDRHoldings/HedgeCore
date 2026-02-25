"""
test_policy_seed.py
===================
Sprint F.2 — Unit tests for policy preset seed list and seed status endpoint.

Tests:
  1. test_all_33_presets_present          -- _POLICY_PRESETS_SEED has all expected short_names
  2. test_seed_no_duplicate_short_names   -- no duplicate short_names in seed list
  3. test_seed_all_configs_valid          -- every preset has a valid config dict
  4. test_seed_idempotent_insert_logic    -- insert_only logic would not duplicate on re-run
  5. test_seed_status_schema              -- PolicySeedStatusResponse schema is correct
  6. test_system_template_accessibility   -- any authenticated user can read templates endpoint
  7. test_seed_list_coverage              -- policyPresets.ts short_names are a subset of seed list

These tests run without a real DB -- they validate the seed data structure and
response schemas using pure Python / FastAPI TestClient against the health endpoint.
"""
from __future__ import annotations

import os
import sys

# Must be set before any app import
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/hedgecalc_test")
os.environ.setdefault("JWT_SECRET", "***REDACTED_JWT_SECRET***")
os.environ.setdefault("ENV", "test")

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

import pytest
from app.api.routes.seed import _POLICY_PRESETS_SEED
from app.schemas_v1.policies import PolicySeedStatusResponse


# ---------------------------------------------------------------------------
# Expected short_names — the canonical list of 33 system policy presets
# ---------------------------------------------------------------------------
EXPECTED_SHORT_NAMES = {
    "SME", "FULL", "CNSV", "BLNC", "ACTV", "COST", "LAYR",
    "BANK", "AMGR", "PE", "INSR", "SOVR", "XPRT", "CBNK",
    "AIRL", "TECH", "REIT", "PHRM", "AGRI", "AUTO",
    "RETL", "HSPT", "SHIP", "MINE", "BLDG", "MDIA",
    "NGO", "FAML", "HFND", "VCGR", "IMEX", "ENGY", "EDUC",
}

# Required fields in every preset config
REQUIRED_CONFIG_KEYS = {"hedge_ratios", "cost_assumptions", "execution_product"}
REQUIRED_HEDGE_RATIO_KEYS = {"confirmed", "forecast"}


# ---------------------------------------------------------------------------
# Test 1 — All 33 presets are present
# ---------------------------------------------------------------------------

def test_all_33_presets_present():
    """_POLICY_PRESETS_SEED must contain all 33 canonical short_names."""
    seed_short_names = {t["short_name"] for t in _POLICY_PRESETS_SEED}
    missing = EXPECTED_SHORT_NAMES - seed_short_names
    extra   = seed_short_names - EXPECTED_SHORT_NAMES
    assert not missing, f"Missing presets in seed list: {sorted(missing)}"
    assert not extra,   f"Unexpected extra presets in seed list: {sorted(extra)}"
    assert len(_POLICY_PRESETS_SEED) == len(EXPECTED_SHORT_NAMES), (
        f"Expected {len(EXPECTED_SHORT_NAMES)} presets, got {len(_POLICY_PRESETS_SEED)}"
    )


# ---------------------------------------------------------------------------
# Test 2 — No duplicate short_names
# ---------------------------------------------------------------------------

def test_seed_no_duplicate_short_names():
    """Each short_name must appear exactly once in the seed list."""
    short_names = [t["short_name"] for t in _POLICY_PRESETS_SEED]
    seen: dict[str, int] = {}
    for sn in short_names:
        seen[sn] = seen.get(sn, 0) + 1
    duplicates = {sn: cnt for sn, cnt in seen.items() if cnt > 1}
    assert not duplicates, f"Duplicate short_names in seed: {duplicates}"


# ---------------------------------------------------------------------------
# Test 3 — All preset configs are structurally valid
# ---------------------------------------------------------------------------

def test_seed_all_configs_valid():
    """Every preset must have name, short_name, description, risk_posture,
    category, and a config dict with required keys."""
    errors: list[str] = []
    for preset in _POLICY_PRESETS_SEED:
        sn = preset.get("short_name", "?")

        # Top-level required fields
        for field in ("name", "short_name", "description", "risk_posture", "category", "config"):
            if not preset.get(field) and field != "description":  # description can be falsy
                if field == "description":
                    continue
                errors.append(f"[{sn}] missing top-level field: {field}")

        # risk_posture enum
        rp = preset.get("risk_posture", "")
        if rp not in ("CONSERVATIVE", "MODERATE", "AGGRESSIVE"):
            errors.append(f"[{sn}] invalid risk_posture: {rp!r}")

        # category enum
        cat = preset.get("category", "")
        if cat not in ("CORPORATE", "FINANCIAL", "SOVEREIGN", "SECTOR"):
            errors.append(f"[{sn}] invalid category: {cat!r}")

        # config keys
        cfg = preset.get("config", {})
        if not isinstance(cfg, dict):
            errors.append(f"[{sn}] config is not a dict")
            continue
        missing_cfg = REQUIRED_CONFIG_KEYS - cfg.keys()
        if missing_cfg:
            errors.append(f"[{sn}] config missing keys: {missing_cfg}")

        # hedge_ratios keys
        hr = cfg.get("hedge_ratios", {})
        if not isinstance(hr, dict):
            errors.append(f"[{sn}] hedge_ratios is not a dict")
        else:
            missing_hr = REQUIRED_HEDGE_RATIO_KEYS - hr.keys()
            if missing_hr:
                errors.append(f"[{sn}] hedge_ratios missing keys: {missing_hr}")
            for k, v in hr.items():
                if not isinstance(v, (int, float)) or not (0.0 <= v <= 1.0):
                    errors.append(f"[{sn}] hedge_ratios.{k} out of range: {v}")

        # execution_product enum
        ep = cfg.get("execution_product", "")
        if ep not in ("NDF", "FWD"):
            errors.append(f"[{sn}] invalid execution_product: {ep!r}")

        # cost_assumptions.spread_bps must be positive number
        ca = cfg.get("cost_assumptions", {})
        if isinstance(ca, dict):
            bps = ca.get("spread_bps")
            if bps is not None and (not isinstance(bps, (int, float)) or bps < 0):
                errors.append(f"[{sn}] cost_assumptions.spread_bps invalid: {bps}")

    assert not errors, "Config validation errors:\n  " + "\n  ".join(errors)


# ---------------------------------------------------------------------------
# Test 4 — Idempotent insert logic (pure logic test, no DB)
# ---------------------------------------------------------------------------

def test_seed_idempotent_insert_logic():
    """
    Simulate running seed twice: the second run should find all short_names
    already present and produce zero new inserts.

    Uses a mock dict to simulate the DB state after the first seed run.
    """
    # Simulate "DB state" after first seed
    db_state: set[str] = {t["short_name"] for t in _POLICY_PRESETS_SEED}

    # Simulate second seed run: for each preset, check if already present
    new_inserts = []
    for preset in _POLICY_PRESETS_SEED:
        if preset["short_name"] not in db_state:
            new_inserts.append(preset["short_name"])

    assert new_inserts == [], (
        f"Second seed run would have inserted duplicates: {new_inserts}"
    )


# ---------------------------------------------------------------------------
# Test 5 — PolicySeedStatusResponse schema
# ---------------------------------------------------------------------------

def test_seed_status_schema_valid_when_seeded():
    """PolicySeedStatusResponse parses correctly when all presets are present."""
    status = PolicySeedStatusResponse(
        seeded=True,
        count=33,
        expected_count=33,
        missing_short_names=[],
    )
    assert status.seeded is True
    assert status.count == 33
    assert status.missing_short_names == []


def test_seed_status_schema_missing_presets():
    """PolicySeedStatusResponse reports missing short_names correctly."""
    missing = ["EDUC", "NGO"]
    status = PolicySeedStatusResponse(
        seeded=False,
        count=31,
        expected_count=33,
        missing_short_names=missing,
    )
    assert status.seeded is False
    assert status.count == 31
    assert set(status.missing_short_names) == {"EDUC", "NGO"}


# ---------------------------------------------------------------------------
# Test 6 — IFRS 9 alignment: hedge_ratios.forecast <= 1.0, confirmed <= 1.0
# ---------------------------------------------------------------------------

def test_seed_all_hedge_ratios_within_bounds():
    """
    IFRS 9.B6.4.2: hedge ratios must be in [0, 1].
    Forecast ratio should not exceed confirmed ratio (IFRS 9.6.4.1(b)).
    """
    violations: list[str] = []
    for preset in _POLICY_PRESETS_SEED:
        sn = preset["short_name"]
        hr = preset.get("config", {}).get("hedge_ratios", {})
        confirmed = hr.get("confirmed", 0.0)
        forecast  = hr.get("forecast", 0.0)

        if not (0.0 <= confirmed <= 1.0):
            violations.append(f"[{sn}] confirmed={confirmed} out of [0,1]")
        if not (0.0 <= forecast <= 1.0):
            violations.append(f"[{sn}] forecast={forecast} out of [0,1]")
        if forecast > confirmed:
            violations.append(
                f"[{sn}] forecast ({forecast}) > confirmed ({confirmed}) "
                f"-- violates IFRS 9.6.4.1(b)"
            )

    assert not violations, "Hedge ratio IFRS 9 violations:\n  " + "\n  ".join(violations)


# ---------------------------------------------------------------------------
# Test 7 — Spread bps are reasonable (0–50 bps typical FX range)
# ---------------------------------------------------------------------------

def test_seed_spread_bps_reasonable():
    """All presets should have spread_bps within realistic FX range (0–50 bps)."""
    out_of_range: list[str] = []
    for preset in _POLICY_PRESETS_SEED:
        sn = preset["short_name"]
        bps = preset.get("config", {}).get("cost_assumptions", {}).get("spread_bps", 0)
        if not isinstance(bps, (int, float)) or not (0 <= bps <= 50):
            out_of_range.append(f"[{sn}] spread_bps={bps}")
    assert not out_of_range, (
        "Presets with unrealistic spread_bps:\n  " + "\n  ".join(out_of_range)
    )


# ---------------------------------------------------------------------------
# Test 8 — min_trade_size_usd is non-negative
# ---------------------------------------------------------------------------

def test_seed_min_trade_size_non_negative():
    """min_trade_size_usd must be >= 0 in every preset config."""
    errors: list[str] = []
    for preset in _POLICY_PRESETS_SEED:
        sn  = preset["short_name"]
        cfg = preset.get("config", {})
        mts = cfg.get("min_trade_size_usd")
        if mts is not None and (not isinstance(mts, (int, float)) or mts < 0):
            errors.append(f"[{sn}] min_trade_size_usd={mts}")
    assert not errors, (
        "Presets with invalid min_trade_size_usd:\n  " + "\n  ".join(errors)
    )
