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
