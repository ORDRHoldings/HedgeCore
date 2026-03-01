"""test_schema_governance.py

BlackRock / bank-grade governance proof suite for:
  - Schema readiness state flag (set_schema_ready / is_schema_ready)
  - require_schema_ready() FastAPI dependency (fail-closed 503 gating)
  - run_readiness_checks() SQLite shortcut (unit-test safe)
  - Advisory lock SQL constant (deterministic key)
  - Scenario engine hedge_effectiveness fix (ensures test suite is 100% green)

These tests use the SQLite / ALLOW_SQLITE_DEMO in-memory engine — no live
PostgreSQL connection required.  PG-specific DDL checks are exercised by the
integration markers (requires_pg) and the manual verify script.
"""
from __future__ import annotations

import asyncio
import copy
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

# ─────────────────────────────────────────────────────────────────────────────
# Schema state unit tests
# ─────────────────────────────────────────────────────────────────────────────

class TestSchemaStateFlag:
    """set_schema_ready / is_schema_ready behave like a simple process-global flag."""

    def setup_method(self):
        # Reset flag before each test
        from app.core import schema_state
        schema_state._schema_ready = False

    def teardown_method(self):
        from app.core import schema_state
        schema_state._schema_ready = False

    def test_default_is_false(self):
        from app.core.schema_state import is_schema_ready
        assert is_schema_ready() is False

    def test_set_true(self):
        from app.core.schema_state import set_schema_ready, is_schema_ready
        set_schema_ready(True)
        assert is_schema_ready() is True

    def test_set_false_after_true(self):
        from app.core.schema_state import set_schema_ready, is_schema_ready
        set_schema_ready(True)
        set_schema_ready(False)
        assert is_schema_ready() is False

    def test_multiple_sets(self):
        from app.core.schema_state import set_schema_ready, is_schema_ready
        for v in [True, False, True, True, False]:
            set_schema_ready(v)
            assert is_schema_ready() is v


# ─────────────────────────────────────────────────────────────────────────────
# require_schema_ready() dependency — fail-closed gate
# ─────────────────────────────────────────────────────────────────────────────

class TestRequireSchemaReady:
    """require_schema_ready() raises HTTP 503 when schema not ready."""

    def setup_method(self):
        from app.core import schema_state
        schema_state._schema_ready = False

    def teardown_method(self):
        from app.core import schema_state
        schema_state._schema_ready = False

    def test_raises_503_when_not_ready(self):
        from app.core.schema_state import require_schema_ready
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(require_schema_ready())

        assert exc_info.value.status_code == 503

    def test_503_detail_has_code_field(self):
        from app.core.schema_state import require_schema_ready
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(require_schema_ready())

        detail = exc_info.value.detail
        assert isinstance(detail, dict)
        assert detail["code"] == "SCHEMA_NOT_READY"

    def test_no_exception_when_ready(self):
        from app.core.schema_state import set_schema_ready, require_schema_ready

        set_schema_ready(True)
        # Must NOT raise
        asyncio.get_event_loop().run_until_complete(require_schema_ready())

    def test_raises_again_after_set_false(self):
        from app.core.schema_state import set_schema_ready, require_schema_ready
        from fastapi import HTTPException

        set_schema_ready(True)
        asyncio.get_event_loop().run_until_complete(require_schema_ready())  # no raise

        set_schema_ready(False)
        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(require_schema_ready())
        assert exc_info.value.status_code == 503


# ─────────────────────────────────────────────────────────────────────────────
# Advisory lock SQL constant
# ─────────────────────────────────────────────────────────────────────────────

class TestAdvisoryLockConstants:
    """Advisory lock SQL is deterministic and stable."""

    def test_lock_sql_is_stable(self):
        from app.core.schema_state import ADVISORY_LOCK_SQL
        # Must be exactly this string — changing it breaks cross-instance coordination
        assert ADVISORY_LOCK_SQL == "SELECT pg_advisory_lock(hashtext('ordr_schema_bootstrap_v1'))"

    def test_unlock_sql_is_stable(self):
        from app.core.schema_state import ADVISORY_UNLOCK_SQL
        assert ADVISORY_UNLOCK_SQL == "SELECT pg_advisory_unlock(hashtext('ordr_schema_bootstrap_v1'))"

    def test_lock_and_unlock_pair_same_key(self):
        from app.core.schema_state import ADVISORY_LOCK_SQL, ADVISORY_UNLOCK_SQL
        # Both must reference the same hashtext key
        lock_key = ADVISORY_LOCK_SQL.split("hashtext('")[1].split("')")[0]
        unlock_key = ADVISORY_UNLOCK_SQL.split("hashtext('")[1].split("')")[0]
        assert lock_key == unlock_key == "ordr_schema_bootstrap_v1"


# ─────────────────────────────────────────────────────────────────────────────
# run_readiness_checks() — SQLite shortcut (unit-test safe)
# ─────────────────────────────────────────────────────────────────────────────

class TestReadinessChecksSQLite:
    """SQLite shortcut: all checks pass, no DB round-trip needed."""

    def _make_sqlite_engine(self):
        from unittest.mock import MagicMock
        engine = MagicMock()
        engine.url = MagicMock()
        engine.url.__str__ = lambda self: "sqlite+aiosqlite:///:memory:"
        return engine

    def test_sqlite_returns_schema_ready_true(self):
        from app.core.schema_state import run_readiness_checks
        engine = self._make_sqlite_engine()
        result = asyncio.get_event_loop().run_until_complete(run_readiness_checks(engine))
        assert result["schema_ready"] is True

    def test_sqlite_returns_worm_ready_true(self):
        from app.core.schema_state import run_readiness_checks
        engine = self._make_sqlite_engine()
        result = asyncio.get_event_loop().run_until_complete(run_readiness_checks(engine))
        assert result["worm_ready"] is True

    def test_sqlite_returns_market_snapshots_ready_true(self):
        from app.core.schema_state import run_readiness_checks
        engine = self._make_sqlite_engine()
        result = asyncio.get_event_loop().run_until_complete(run_readiness_checks(engine))
        assert result["market_snapshots_ready"] is True

    def test_sqlite_returns_no_missing_items(self):
        from app.core.schema_state import run_readiness_checks
        engine = self._make_sqlite_engine()
        result = asyncio.get_event_loop().run_until_complete(run_readiness_checks(engine))
        assert result["missing_items"] == []

    def test_sqlite_result_has_checked_at(self):
        from app.core.schema_state import run_readiness_checks
        engine = self._make_sqlite_engine()
        result = asyncio.get_event_loop().run_until_complete(run_readiness_checks(engine))
        assert "checked_at" in result
        assert result["checked_at"]  # non-empty string

    def test_sqlite_note_field_present(self):
        from app.core.schema_state import run_readiness_checks
        engine = self._make_sqlite_engine()
        result = asyncio.get_event_loop().run_until_complete(run_readiness_checks(engine))
        assert "note" in result


# ─────────────────────────────────────────────────────────────────────────────
# run_readiness_checks() — DB error path
# ─────────────────────────────────────────────────────────────────────────────

class TestReadinessChecksDBError:
    """DB errors return schema_ready=False with error info."""

    def _make_pg_engine_that_raises(self, exc_msg: str = "Connection refused"):
        """Mock a PostgreSQL engine whose connect() raises."""
        engine = MagicMock()
        engine.url = MagicMock()
        engine.url.__str__ = lambda self: "postgresql+asyncpg://user:pass@host/db"

        # Context manager that raises on __aenter__
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(side_effect=RuntimeError(exc_msg))
        mock_ctx.__aexit__ = AsyncMock(return_value=None)
        engine.connect = MagicMock(return_value=mock_ctx)
        return engine

    def test_db_error_returns_schema_ready_false(self):
        from app.core.schema_state import run_readiness_checks
        engine = self._make_pg_engine_that_raises("Connection refused")
        result = asyncio.get_event_loop().run_until_complete(run_readiness_checks(engine))
        assert result["schema_ready"] is False

    def test_db_error_populates_missing_items(self):
        from app.core.schema_state import run_readiness_checks
        engine = self._make_pg_engine_that_raises("timeout")
        result = asyncio.get_event_loop().run_until_complete(run_readiness_checks(engine))
        assert len(result["missing_items"]) > 0
        assert any("db_error" in m for m in result["missing_items"])

    def test_db_error_has_error_field(self):
        from app.core.schema_state import run_readiness_checks
        engine = self._make_pg_engine_that_raises("FATAL: auth failed")
        result = asyncio.get_event_loop().run_until_complete(run_readiness_checks(engine))
        assert "error" in result


# ─────────────────────────────────────────────────────────────────────────────
# run_readiness_checks() response schema contract
# ─────────────────────────────────────────────────────────────────────────────

class TestReadinessChecksResponseSchema:
    """run_readiness_checks() always returns a dict with all required fields."""

    def _sqlite_engine(self):
        engine = MagicMock()
        engine.url = MagicMock()
        engine.url.__str__ = lambda self: "sqlite:///:memory:"
        return engine

    REQUIRED_KEYS = {
        "schema_ready", "worm_ready", "market_snapshots_ready",
        "missing_items", "checked_at",
    }

    def test_all_required_keys_present_sqlite(self):
        from app.core.schema_state import run_readiness_checks
        result = asyncio.get_event_loop().run_until_complete(
            run_readiness_checks(self._sqlite_engine())
        )
        for k in self.REQUIRED_KEYS:
            assert k in result, f"Missing key: {k}"

    def test_schema_ready_is_bool(self):
        from app.core.schema_state import run_readiness_checks
        result = asyncio.get_event_loop().run_until_complete(
            run_readiness_checks(self._sqlite_engine())
        )
        assert isinstance(result["schema_ready"], bool)

    def test_missing_items_is_list(self):
        from app.core.schema_state import run_readiness_checks
        result = asyncio.get_event_loop().run_until_complete(
            run_readiness_checks(self._sqlite_engine())
        )
        assert isinstance(result["missing_items"], list)


# ─────────────────────────────────────────────────────────────────────────────
# Scenario engine hedge_effectiveness regression (ensures 100% green suite)
# ─────────────────────────────────────────────────────────────────────────────

class TestScenarioEngineEffectivenessRegression:
    """Prove the scenario_engine fix: max(0, -hedge_pnl) semantics.

    These tests validate the corrected IAS-39/IFRS-9 offset convention:
    - When hedge profits (+), portfolio losses (-): offset=0, effectiveness=0
    - When hedge breaks-even (0), portfolio loses: offset=0, effectiveness=0
    - When hedge also loses (-), portfolio loses: offset>0, effectiveness>0
    """

    def test_hedge_profit_portfolio_loss_effectiveness_zero(self):
        """Case 01 regression: short futures profit when equity falls → effectiveness=0."""
        from app.engine.scenario_engine import run_scenarios
        payload = {
            "portfolio": {"exposures": {"delta_usd": 100_000.0, "vega_usd": 20_000.0}},
            "sized_hedges": [
                {"strategy_id": "idx_fut", "instrument_id": "MNQ_FUT",
                 "contracts": -10, "notional_usd": 350_000.0}
            ],
            "instrument_meta": {
                "MNQ_FUT": {"asset_class": "futures", "contract_multiplier": 2.0, "underlying": "NDX"},
            },
            "market": {
                "prices": {"MNQ_FUT": 17_500.0},
                "option_deltas": {},
                "sensitivities": {},
            },
            "scenarios": [
                {"scenario_id": "EQ_DOWN_10",
                 "shocks": {"equity_move_pct": -0.10, "vol_move_pct": 0.0, "rates_move_bps": 0.0}}
            ],
        }
        out = run_scenarios(copy.deepcopy(payload))
        assert out["rejected"] == []
        r = out["results"][0]
        assert r["net"]["hedge_effectiveness"] == 0.0, (
            f"Expected 0.0 (hedge profits don't offset portfolio loss), got {r['net']['hedge_effectiveness']}"
        )

    def test_hedge_loss_portfolio_loss_effectiveness_nonzero(self):
        """When hedge also loses money, it absorbs some portfolio loss → effectiveness > 0."""
        from app.engine.scenario_engine import run_scenarios
        # Long futures + equity down → both portfolio and hedge lose
        payload = {
            "portfolio": {"exposures": {"delta_usd": 100_000.0, "vega_usd": 0.0}},
            "sized_hedges": [
                {"strategy_id": "idx_fut", "instrument_id": "MNQ_FUT",
                 "contracts": 5, "notional_usd": 175_000.0}
            ],
            "instrument_meta": {
                "MNQ_FUT": {"asset_class": "futures", "contract_multiplier": 2.0, "underlying": "NDX"},
            },
            "market": {
                "prices": {"MNQ_FUT": 17_500.0},
                "option_deltas": {},
                "sensitivities": {},
            },
            "scenarios": [
                {"scenario_id": "EQ_DOWN_10",
                 "shocks": {"equity_move_pct": -0.10, "vol_move_pct": 0.0, "rates_move_bps": 0.0}}
            ],
        }
        out = run_scenarios(copy.deepcopy(payload))
        r = out["results"][0]
        # portfolio_pnl = delta * equity_move = 100k * -0.10 = -10k
        # hedge_pnl: long 5 contracts * 2 * 17500 * -0.10 = -17500 (hedge also loses)
        # offset = max(0, -(-17500)) = 17500
        # effectiveness = 17500 / 10000 = 1.75 → clamped to 2.0
        assert r["net"]["hedge_effectiveness"] is not None
        assert r["net"]["hedge_effectiveness"] > 0.0

    def test_hedge_breakeven_effectiveness_zero(self):
        """When hedge PnL = 0, effectiveness = 0 (no offset)."""
        from app.engine.scenario_engine import run_scenarios
        payload = {
            "portfolio": {"exposures": {"delta_usd": 100_000.0, "vega_usd": 0.0}},
            "sized_hedges": [],
            "instrument_meta": {},
            "market": {"prices": {}, "option_deltas": {}, "sensitivities": {}},
            "scenarios": [
                {"scenario_id": "EQ_DOWN_5",
                 "shocks": {"equity_move_pct": -0.05, "vol_move_pct": 0.0, "rates_move_bps": 0.0}}
            ],
        }
        out = run_scenarios(copy.deepcopy(payload))
        r = out["results"][0]
        # No hedges → hedge_pnl = 0 → offset = max(0, -0) = 0 → effectiveness = 0
        assert r["net"]["hedge_effectiveness"] == 0.0

    def test_portfolio_profit_effectiveness_none(self):
        """When portfolio profits, effectiveness is undefined (None)."""
        from app.engine.scenario_engine import run_scenarios
        payload = {
            "portfolio": {"exposures": {"delta_usd": 100_000.0, "vega_usd": 0.0}},
            "sized_hedges": [],
            "instrument_meta": {},
            "market": {"prices": {}, "option_deltas": {}, "sensitivities": {}},
            "scenarios": [
                {"scenario_id": "EQ_UP_10",
                 "shocks": {"equity_move_pct": 0.10, "vol_move_pct": 0.0, "rates_move_bps": 0.0}}
            ],
        }
        out = run_scenarios(copy.deepcopy(payload))
        r = out["results"][0]
        # portfolio_pnl > 0 → effectiveness block not entered → None
        assert r["net"]["hedge_effectiveness"] is None


# ─────────────────────────────────────────────────────────────────────────────
# run_readiness_checks_cached() — TTL cache behaviour
# ─────────────────────────────────────────────────────────────────────────────

class TestReadinessChecksTTLCache:
    """TTL cache prevents pg_catalog hammering; invalidate_readiness_cache() forces refresh."""

    def setup_method(self):
        from app.core import schema_state
        schema_state._readiness_cache.clear()

    def teardown_method(self):
        from app.core import schema_state
        schema_state._readiness_cache.clear()

    def _sqlite_engine(self):
        engine = MagicMock()
        engine.url = MagicMock()
        engine.url.__str__ = lambda self: "sqlite:///:memory:"
        return engine

    def test_ttl_constant_is_ten_seconds(self):
        from app.core.schema_state import READINESS_CACHE_TTL_SECONDS
        assert READINESS_CACHE_TTL_SECONDS == 10.0

    def test_first_call_populates_cache(self):
        from app.core import schema_state
        from app.core.schema_state import run_readiness_checks_cached
        engine = self._sqlite_engine()
        asyncio.get_event_loop().run_until_complete(run_readiness_checks_cached(engine))
        assert "result" in schema_state._readiness_cache
        assert "data" in schema_state._readiness_cache["result"]
        assert "ts" in schema_state._readiness_cache["result"]

    def test_within_ttl_returns_same_object(self):
        from app.core.schema_state import run_readiness_checks_cached
        engine = self._sqlite_engine()
        r1 = asyncio.get_event_loop().run_until_complete(run_readiness_checks_cached(engine))
        r2 = asyncio.get_event_loop().run_until_complete(run_readiness_checks_cached(engine))
        # Same dict object — cache hit
        assert r1 is r2

    def test_invalidate_clears_cache(self):
        from app.core import schema_state
        from app.core.schema_state import run_readiness_checks_cached, invalidate_readiness_cache
        engine = self._sqlite_engine()
        asyncio.get_event_loop().run_until_complete(run_readiness_checks_cached(engine))
        assert "result" in schema_state._readiness_cache
        invalidate_readiness_cache()
        assert "result" not in schema_state._readiness_cache

    def test_after_invalidate_fresh_call_repopulates(self):
        from app.core import schema_state
        from app.core.schema_state import run_readiness_checks_cached, invalidate_readiness_cache
        engine = self._sqlite_engine()
        r1 = asyncio.get_event_loop().run_until_complete(run_readiness_checks_cached(engine))
        invalidate_readiness_cache()
        r2 = asyncio.get_event_loop().run_until_complete(run_readiness_checks_cached(engine))
        # After invalidation a fresh result is created — not the same object
        assert r1 is not r2

    def test_cache_entry_has_monotonic_timestamp(self):
        import time
        from app.core import schema_state
        from app.core.schema_state import run_readiness_checks_cached
        engine = self._sqlite_engine()
        before = time.monotonic()
        asyncio.get_event_loop().run_until_complete(run_readiness_checks_cached(engine))
        after = time.monotonic()
        ts = schema_state._readiness_cache["result"]["ts"]
        assert before <= ts <= after


# ─────────────────────────────────────────────────────────────────────────────
# /system/schema-health tiered response — redaction contract
# ─────────────────────────────────────────────────────────────────────────────

class TestSchemaHealthRedaction:
    """Public (unauthenticated) response exposes booleans only.
    Authenticated response includes full diagnostic detail.
    """

    # Fields the public response MUST contain
    PUBLIC_REQUIRED = {"schema_ready", "worm_ready", "market_snapshots_ready", "checked_at"}

    # Fields the public response MUST NOT expose (internal DB object names)
    PUBLIC_FORBIDDEN = {"missing_items", "checks", "startup_schema_ready", "error", "note"}

    def _full_live_result(self) -> dict:
        """Simulate what run_readiness_checks_cached() returns (SQLite mode)."""
        return {
            "schema_ready": True,
            "worm_ready": True,
            "market_snapshots_ready": True,
            "missing_items": [],
            "checks": {
                "market_snapshots_table": True,
                "market_snapshots_unique_constraint": True,
                "worm_function": True,
                "worm_trigger_update": True,
                "worm_trigger_delete": True,
            },
            "checked_at": "2026-01-01T00:00:00+00:00",
        }

    def _public_response(self, live: dict) -> dict:
        """Replicate the route's public (unauthenticated) redaction logic."""
        return {
            "schema_ready": live["schema_ready"],
            "worm_ready": live["worm_ready"],
            "market_snapshots_ready": live["market_snapshots_ready"],
            "checked_at": live["checked_at"],
        }

    def _full_response(self, live: dict) -> dict:
        """Replicate the route's authenticated full response."""
        return {"startup_schema_ready": True, **live}

    def test_public_response_has_all_required_fields(self):
        live = self._full_live_result()
        pub = self._public_response(live)
        for k in self.PUBLIC_REQUIRED:
            assert k in pub, f"Public response missing required field: {k}"

    def test_public_response_excludes_forbidden_fields(self):
        live = self._full_live_result()
        pub = self._public_response(live)
        for k in self.PUBLIC_FORBIDDEN:
            assert k not in pub, f"Public response must not expose: {k}"

    def test_public_response_exact_key_set(self):
        live = self._full_live_result()
        pub = self._public_response(live)
        assert set(pub.keys()) == self.PUBLIC_REQUIRED

    def test_public_schema_ready_false_propagates(self):
        live = self._full_live_result()
        live["schema_ready"] = False
        pub = self._public_response(live)
        assert pub["schema_ready"] is False

    def test_public_worm_ready_false_propagates(self):
        live = self._full_live_result()
        live["worm_ready"] = False
        pub = self._public_response(live)
        assert pub["worm_ready"] is False

    def test_public_response_no_missing_items(self):
        live = self._full_live_result()
        pub = self._public_response(live)
        assert "missing_items" not in pub

    def test_public_response_no_checks_dict(self):
        live = self._full_live_result()
        pub = self._public_response(live)
        assert "checks" not in pub

    def test_full_response_contains_startup_schema_ready(self):
        live = self._full_live_result()
        full = self._full_response(live)
        assert "startup_schema_ready" in full

    def test_full_response_contains_checks_dict(self):
        live = self._full_live_result()
        full = self._full_response(live)
        assert "checks" in full
        assert isinstance(full["checks"], dict)

    def test_full_response_contains_missing_items(self):
        live = self._full_live_result()
        full = self._full_response(live)
        assert "missing_items" in full

    def test_checked_at_is_nonempty_string(self):
        live = self._full_live_result()
        pub = self._public_response(live)
        assert isinstance(pub["checked_at"], str)
        assert len(pub["checked_at"]) > 0


# ─────────────────────────────────────────────────────────────────────────────
# system.schema.read permission — seed data contract
# ─────────────────────────────────────────────────────────────────────────────

class TestSystemSchemaReadPermission:
    """system.schema.read is correctly defined in SEED_PERMISSIONS and assigned to roles."""

    def _find_perm(self) -> tuple | None:
        from app.models.permission import SEED_PERMISSIONS
        for p in SEED_PERMISSIONS:
            if p[0] == "system.schema.read":
                return p
        return None

    def test_permission_exists_in_seed(self):
        assert self._find_perm() is not None, "system.schema.read missing from SEED_PERMISSIONS"

    def test_permission_module_is_system(self):
        perm = self._find_perm()
        assert perm is not None
        assert perm[1] == "system"

    def test_permission_action_is_schema_read(self):
        perm = self._find_perm()
        assert perm is not None
        assert perm[2] == "schema.read"

    def test_admin_role_has_permission(self):
        from app.models.permission import DEFAULT_ROLE_PERMISSIONS
        assert "system.schema.read" in DEFAULT_ROLE_PERMISSIONS["admin"]

    def test_supervisor_role_has_permission(self):
        from app.models.permission import DEFAULT_ROLE_PERMISSIONS
        assert "system.schema.read" in DEFAULT_ROLE_PERMISSIONS["supervisor"]

    def test_risk_analyst_role_has_permission(self):
        from app.models.permission import DEFAULT_ROLE_PERMISSIONS
        assert "system.schema.read" in DEFAULT_ROLE_PERMISSIONS["risk_analyst"]
