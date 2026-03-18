"""
tests/test_risk_analytics_coverage.py

Coverage tests for app/api/routes/v1_risk_analytics.py

Endpoints covered:
  POST /api/v1/risk/hedge-effectiveness
  POST /api/v1/risk/margin
  POST /api/v1/risk/concentration
  POST /api/v1/risk/monte-carlo
  GET  /api/v1/risk/summary/{run_id}
  POST /api/v1/risk/stress-scenarios
  POST /api/v1/risk/composite
  POST /api/v1/risk/counterparty
  POST /api/v1/risk/credit-duration
  POST /api/v1/risk/vega-mapping

Auth failures: 401 without token.
Permission failures: 403 when neither calculate.run_production nor trades.view present.
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")

import contextlib
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.db import get_session, get_async_session
from app.core.security import create_access_token, get_current_user

BASE_URL = "http://test"
RISK = "/api/v1/risk"

USER_ID = "cccccccc-0000-0000-0000-000000000001"
COMPANY_ID = "dddddddd-0000-0000-0000-000000000002"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_token(user_id: str = USER_ID) -> str:
    return create_access_token(sub=user_id, email="risk@test.com")


def _make_user(
    user_id: str = USER_ID,
    is_superuser: bool = True,
    company_id: str | None = COMPANY_ID,
) -> MagicMock:
    user = MagicMock()
    user.id = UUID(user_id)
    user.is_active = True
    user.is_superuser = is_superuser
    user.company_id = UUID(company_id) if company_id else None
    return user


def _make_db() -> AsyncMock:
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    empty = MagicMock()
    empty.scalars.return_value.all.return_value = []
    empty.scalars.return_value.first.return_value = None
    empty.scalar.return_value = 0
    db.execute = AsyncMock(return_value=empty)
    return db


def _session_override(mock_db: AsyncMock):
    async def _override():
        yield mock_db
    return _override


@contextlib.contextmanager
def _with_overrides(mock_user: MagicMock, mock_db: AsyncMock | None = None):
    db = mock_db or _make_db()

    async def _get_user():
        return mock_user

    app.dependency_overrides[get_current_user] = _get_user
    app.dependency_overrides[get_session] = _session_override(db)
    app.dependency_overrides[get_async_session] = _session_override(db)
    try:
        yield db
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_async_session, None)


def _auth_header(token: str | None = None) -> dict[str, str]:
    return {"Authorization": f"Bearer {token or _make_token()}"}


def _engine_result(data: dict) -> MagicMock:
    """Mock an engine result object with .to_dict()."""
    result = MagicMock()
    result.to_dict.return_value = data
    return result


# ---------------------------------------------------------------------------
# Auth failure tests (401)
# ---------------------------------------------------------------------------

class TestRiskAuthRequired:
    """All risk endpoints must return 401 when no auth token provided."""

    @pytest.mark.asyncio
    async def test_hedge_effectiveness_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{RISK}/hedge-effectiveness", json={})
        # CSRF middleware returns 403 for POST without auth header before auth check runs
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_margin_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{RISK}/margin", json={})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_concentration_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{RISK}/concentration", json={})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_monte_carlo_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{RISK}/monte-carlo", json={})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_summary_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{RISK}/summary/{uuid4()}")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_stress_scenarios_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{RISK}/stress-scenarios", json={})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_composite_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{RISK}/composite", json={})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_counterparty_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{RISK}/counterparty", json={})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_credit_duration_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{RISK}/credit-duration", json={})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_vega_mapping_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{RISK}/vega-mapping", json={})
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Permission gate tests (403)
# ---------------------------------------------------------------------------

class TestRiskPermissionGate:
    """Non-superuser lacking calculate.run_production and trades.view gets 403."""

    @pytest.mark.asyncio
    async def test_hedge_effectiveness_no_permission_403(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_risk_analytics.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/hedge-effectiveness",
                        json={
                            "hedged_item_changes": [1.0, 2.0],
                            "instrument_changes": [-1.0, -2.0],
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_margin_no_permission_403(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_risk_analytics.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/margin",
                        json={"hedge_actions": [{"bucket": "1M", "action_usd": 100000}]},
                        headers=_auth_header(),
                    )
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_summary_no_permission_403(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_risk_analytics.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{RISK}/summary/{uuid4()}",
                        headers=_auth_header(),
                    )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# POST /v1/risk/hedge-effectiveness
# ---------------------------------------------------------------------------

class TestHedgeEffectiveness:

    @pytest.mark.asyncio
    async def test_dollar_offset_method_returns_200(self):
        user = _make_user()
        result = _engine_result({"is_effective": True, "ratio": 1.0, "method": "dollar_offset"})
        with _with_overrides(user):
            with patch(
                "app.engine_v1.hedge_accounting.assess_hedge_effectiveness_dollar_offset",
                return_value=result,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/hedge-effectiveness",
                        json={
                            "hedged_item_changes": [100.0, -50.0, 200.0],
                            "instrument_changes": [-95.0, 48.0, -190.0],
                            "method": "dollar_offset",
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
        assert r.json()["is_effective"] is True

    @pytest.mark.asyncio
    async def test_regression_method_returns_200(self):
        user = _make_user()
        # Need 30+ data points for regression
        changes = list(range(1, 31))
        instrument = [-x * 0.95 for x in changes]
        result = _engine_result({"is_effective": True, "r_squared": 0.99, "method": "regression"})
        with _with_overrides(user):
            with patch(
                "app.engine_v1.hedge_accounting.assess_hedge_effectiveness_regression",
                return_value=result,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/hedge-effectiveness",
                        json={
                            "hedged_item_changes": changes,
                            "instrument_changes": instrument,
                            "method": "regression",
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_auto_method_picks_dollar_offset_for_small_dataset(self):
        user = _make_user()
        result = _engine_result({"is_effective": True, "method": "dollar_offset"})
        with _with_overrides(user):
            with patch(
                "app.engine_v1.hedge_accounting.assess_hedge_effectiveness_dollar_offset",
                return_value=result,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/hedge-effectiveness",
                        json={
                            "hedged_item_changes": [10.0, 20.0, 30.0],
                            "instrument_changes": [-9.0, -19.0, -28.0],
                            "method": "auto",
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_mismatched_series_lengths_returns_422(self):
        user = _make_user()
        with _with_overrides(user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{RISK}/hedge-effectiveness",
                    json={
                        "hedged_item_changes": [1.0, 2.0, 3.0],
                        "instrument_changes": [-1.0, -2.0],
                        "method": "dollar_offset",
                    },
                    headers=_auth_header(),
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_non_superuser_with_trades_view_gets_200(self):
        user = _make_user(is_superuser=False)
        result = _engine_result({"is_effective": True})
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_risk_analytics.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.view"]),
            ), patch(
                "app.engine_v1.hedge_accounting.assess_hedge_effectiveness_dollar_offset",
                return_value=result,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/hedge-effectiveness",
                        json={
                            "hedged_item_changes": [1.0, 2.0],
                            "instrument_changes": [-1.0, -2.0],
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# POST /v1/risk/margin
# ---------------------------------------------------------------------------

class TestMarginAnalysis:

    @pytest.mark.asyncio
    async def test_margin_returns_200(self):
        user = _make_user()
        result = _engine_result({
            "total_initial_margin_usd": 50000.0,
            "total_maintenance_margin_usd": 25000.0,
            "positions": [],
        })
        with _with_overrides(user):
            with patch(
                "app.engine_v1.margin_model.compute_margin",
                return_value=result,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/margin",
                        json={
                            "hedge_actions": [
                                {"bucket": "3M", "action_usd": 500000, "instrument": "forward"}
                            ],
                            "market": {"spot_rate": 17.15},
                            "policy": {"margin_budget": 100000},
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
        assert "total_initial_margin_usd" in r.json()

    @pytest.mark.asyncio
    async def test_margin_empty_actions_returns_422(self):
        user = _make_user()
        with _with_overrides(user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{RISK}/margin",
                    json={"hedge_actions": []},
                    headers=_auth_header(),
                )
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# POST /v1/risk/concentration
# ---------------------------------------------------------------------------

class TestConcentrationAnalysis:

    @pytest.mark.asyncio
    async def test_concentration_returns_200(self):
        user = _make_user()
        result = _engine_result({
            "positions": [],
            "status": "OK",
            "total_notional_usd": 1000000.0,
        })
        with _with_overrides(user):
            with patch(
                "app.engine_v1.concentration_limits.check_concentration_limits",
                return_value=result,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/concentration",
                        json={
                            "hedge_actions": [
                                {"instrument": "USDMXN_forward", "notional_usd": 1000000}
                            ],
                            "policy": {"max_instrument_concentration_pct": 0.30},
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_concentration_empty_actions_returns_422(self):
        user = _make_user()
        with _with_overrides(user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{RISK}/concentration",
                    json={"hedge_actions": []},
                    headers=_auth_header(),
                )
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# POST /v1/risk/monte-carlo
# ---------------------------------------------------------------------------

class TestMonteCarlo:

    @pytest.mark.asyncio
    async def test_monte_carlo_returns_200(self):
        user = _make_user()
        result = _engine_result({
            "var_95": -10000.0,
            "cvar_95": -15000.0,
            "num_simulations": 1000,
        })
        with _with_overrides(user):
            with patch(
                "app.engine_v1.scenarios_monte_carlo.run_monte_carlo",
                return_value=result,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/monte-carlo",
                        json={
                            "hedge_actions": [
                                {"bucket": "1M", "action_usd": 100000}
                            ],
                            "market": {"spot_rate": 17.15},
                            "num_simulations": 1000,
                            "seed": 42,
                            "confidence_levels": [0.95, 0.99],
                            "horizon_days": 1,
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_monte_carlo_empty_actions_returns_422(self):
        user = _make_user()
        with _with_overrides(user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{RISK}/monte-carlo",
                    json={"hedge_actions": []},
                    headers=_auth_header(),
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_monte_carlo_with_seed_returns_200(self):
        user = _make_user()
        result = _engine_result({"var_95": -5000.0})
        with _with_overrides(user):
            with patch(
                "app.engine_v1.scenarios_monte_carlo.run_monte_carlo",
                return_value=result,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/monte-carlo",
                        json={
                            "hedge_actions": [{"bucket": "3M", "action_usd": 500000}],
                            "seed": 123,
                            "num_simulations": 500,
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# GET /v1/risk/summary/{run_id}
# ---------------------------------------------------------------------------

class TestRiskSummary:

    @pytest.mark.asyncio
    async def test_summary_run_not_found_returns_404(self):
        user = _make_user()
        db = _make_db()
        db.get = AsyncMock(return_value=None)
        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{RISK}/summary/{uuid4()}",
                    headers=_auth_header(),
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_summary_run_found_empty_buckets(self):
        user = _make_user()
        db = _make_db()

        run = MagicMock()
        run.run_envelope = {}
        run.company_id = UUID(COMPANY_ID)
        db.get = AsyncMock(return_value=run)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{RISK}/summary/{uuid4()}",
                    headers=_auth_header(),
                )
        assert r.status_code == 200
        body = r.json()
        assert "run_id" in body
        # Empty buckets -> all analytics should be None
        assert body["margin"] is None
        assert body["concentration"] is None
        assert body["hedge_effectiveness"] is None
        assert body["monte_carlo"] is None
        assert body["stress_scenarios"] is None

    @pytest.mark.asyncio
    async def test_summary_run_found_with_buckets(self):
        user = _make_user()
        db = _make_db()

        run = MagicMock()
        run.run_envelope = {
            "hedge_plan": {
                "buckets": [
                    {
                        "bucket": "1M",
                        "action_usd": 100000,
                        "instrument": "forward",
                        "commercial_exposure_mxn": 1715000.0,
                        "hedge_position_mxn": -1715000.0,
                    }
                ]
            },
            "policy": {},
            "market": {"spot_rate": 17.15},
        }
        run.company_id = UUID(COMPANY_ID)
        db.get = AsyncMock(return_value=run)

        margin_result = _engine_result({"total_initial_margin_usd": 5000.0})
        conc_result = _engine_result({"status": "OK"})
        eff_result = _engine_result({"is_effective": True})
        mc_result = _engine_result({"var_95": -1000.0})
        stress_result = _engine_result({"scenarios": []})

        with _with_overrides(user, db):
            with patch("app.engine_v1.margin_model.compute_margin", return_value=margin_result), \
                 patch("app.engine_v1.concentration_limits.check_concentration_limits", return_value=conc_result), \
                 patch("app.engine_v1.hedge_accounting.assess_hedge_effectiveness_dollar_offset", return_value=eff_result), \
                 patch("app.engine_v1.scenarios_monte_carlo.run_monte_carlo", return_value=mc_result), \
                 patch("app.engine_v1.scenarios_ext.apply_extended_scenarios", return_value=stress_result), \
                 patch("app.engine_v1.scenarios_ext.INSTITUTIONAL_SCENARIOS", {"crisis": {}, "vol_crush": {}}):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{RISK}/summary/{uuid4()}",
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_summary_cross_tenant_access_returns_404(self):
        """Non-superuser cannot access run belonging to another company."""
        user = _make_user(is_superuser=False)
        db = _make_db()

        run = MagicMock()
        run.run_envelope = {}
        # Different company_id than user's
        run.company_id = UUID("eeeeeeee-0000-0000-0000-000000000099")
        user.company_id = UUID(COMPANY_ID)
        user.is_superuser = False
        db.get = AsyncMock(return_value=run)

        with _with_overrides(user, db):
            with patch(
                "app.api.routes.v1_risk_analytics.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["calculate.run_production"]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{RISK}/summary/{uuid4()}",
                        headers=_auth_header(),
                    )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# POST /v1/risk/stress-scenarios
# ---------------------------------------------------------------------------

class TestStressScenarios:

    @pytest.mark.asyncio
    async def test_stress_scenarios_returns_200(self):
        user = _make_user()
        result = _engine_result({"scenarios": [{"name": "crisis", "pnl": -500000.0}]})
        with _with_overrides(user):
            with patch(
                "app.engine_v1.scenarios_ext.apply_extended_scenarios",
                return_value=result,
            ), patch(
                "app.engine_v1.scenarios_ext.INSTITUTIONAL_SCENARIOS",
                {"crisis": {}, "vol_crush": {}},
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/stress-scenarios",
                        json={
                            "exposure_usd": 10_000_000.0,
                            "hedge_notional_usd": 8_000_000.0,
                            "market": {"spot_rate": 17.15},
                            "margin_total": 50000.0,
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_stress_scenarios_with_specific_scenarios(self):
        user = _make_user()
        result = _engine_result({"scenarios": []})
        with _with_overrides(user):
            with patch(
                "app.engine_v1.scenarios_ext.apply_extended_scenarios",
                return_value=result,
            ), patch(
                "app.engine_v1.scenarios_ext.INSTITUTIONAL_SCENARIOS",
                {"crisis": {}, "vol_crush": {}, "slow_bleed": {}},
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/stress-scenarios",
                        json={
                            "exposure_usd": 5_000_000.0,
                            "hedge_notional_usd": 4_000_000.0,
                            "scenarios": ["crisis"],
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_stress_scenarios_no_permission_403(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_risk_analytics.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/stress-scenarios",
                        json={
                            "exposure_usd": 1_000_000.0,
                            "hedge_notional_usd": 800_000.0,
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# POST /v1/risk/composite
# ---------------------------------------------------------------------------

class TestCompositeRisk:

    @pytest.mark.asyncio
    async def test_composite_returns_200(self):
        user = _make_user()
        mc_result = _engine_result({"var_95": -10000.0})
        stress_result = _engine_result({"scenarios": []})
        fcov_result = _engine_result({"portfolio_var": 5000.0})
        with _with_overrides(user):
            with patch("app.engine_v1.scenarios_monte_carlo.run_monte_carlo", return_value=mc_result), \
                 patch("app.engine_v1.scenarios_ext.apply_extended_scenarios", return_value=stress_result), \
                 patch("app.engine_v1.scenarios_ext.INSTITUTIONAL_SCENARIOS", {"crisis": {}}), \
                 patch("app.engine_v1.factor_covariance.compute_factor_covariance", return_value=fcov_result):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/composite",
                        json={
                            "hedge_actions": [
                                {
                                    "bucket": "3M",
                                    "action_usd": 500000,
                                    "pair": "USDMXN",
                                    "commercial_exposure_mxn": 8575000.0,
                                    "hedge_position_mxn": -8575000.0,
                                }
                            ],
                            "market": {"spot_rate": 17.15},
                            "policy": {},
                            "num_simulations": 500,
                            "seed": 42,
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
        body = r.json()
        # Even if sub-modules fail gracefully, top-level keys should exist
        assert "monte_carlo" in body
        assert "stress_scenarios" in body
        assert "factor_covariance" in body

    @pytest.mark.asyncio
    async def test_composite_empty_actions_returns_422(self):
        user = _make_user()
        with _with_overrides(user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{RISK}/composite",
                    json={"hedge_actions": []},
                    headers=_auth_header(),
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_composite_graceful_degradation_on_engine_error(self):
        """When engine modules raise exceptions, composite returns None for those keys."""
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.engine_v1.scenarios_monte_carlo.run_monte_carlo",
                side_effect=Exception("MC failed"),
            ), patch(
                "app.engine_v1.scenarios_ext.apply_extended_scenarios",
                side_effect=Exception("Stress failed"),
            ), patch(
                "app.engine_v1.scenarios_ext.INSTITUTIONAL_SCENARIOS",
                {},
            ), patch(
                "app.engine_v1.factor_covariance.compute_factor_covariance",
                side_effect=Exception("Fcov failed"),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/composite",
                        json={
                            "hedge_actions": [{"bucket": "1M", "action_usd": 100000}],
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
        body = r.json()
        assert body["monte_carlo"] is None
        assert body["stress_scenarios"] is None
        assert body["factor_covariance"] is None


# ---------------------------------------------------------------------------
# POST /v1/risk/counterparty
# ---------------------------------------------------------------------------

class TestCounterpartyRisk:

    @pytest.mark.asyncio
    async def test_counterparty_returns_200(self):
        user = _make_user()
        result = _engine_result({
            "positions": [],
            "total_exposure_usd": 0.0,
            "total_pfe_usd": 0.0,
        })
        with _with_overrides(user):
            with patch(
                "app.engine_v1.counterparty_risk.compute_counterparty_exposure",
                return_value=result,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/counterparty",
                        json={
                            "positions": [
                                {
                                    "counterparty_id": "cp1",
                                    "counterparty_name": "Bank A",
                                    "notional_usd": 1000000,
                                    "mtm_usd": 50000,
                                    "isda_threshold_usd": 200000,
                                }
                            ],
                            "volatility_annual": 0.10,
                            "time_horizon_years": 1.0,
                            "confidence": 0.975,
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_counterparty_empty_positions_422(self):
        user = _make_user()
        with _with_overrides(user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{RISK}/counterparty",
                    json={"positions": []},
                    headers=_auth_header(),
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_counterparty_no_permission_403(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_risk_analytics.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/counterparty",
                        json={
                            "positions": [{"counterparty_id": "cp1", "notional_usd": 100000}],
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# POST /v1/risk/credit-duration
# ---------------------------------------------------------------------------

class TestCreditDuration:

    @pytest.mark.asyncio
    async def test_credit_duration_returns_200(self):
        user = _make_user()
        result = _engine_result({
            "credit_notional_usd": 5000000.0,
            "duration_years": 5.0,
            "hyg_shares": 1000,
        })
        with _with_overrides(user):
            with patch(
                "app.engine_v1.credit_duration.map_credit_duration",
                return_value=result,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/credit-duration",
                        json={
                            "equity_delta": 10_000_000.0,
                            "market": {"vix": 20.0},
                            "policy": {},
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_credit_duration_no_permission_403(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_risk_analytics.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/credit-duration",
                        json={"equity_delta": 1_000_000.0},
                        headers=_auth_header(),
                    )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# POST /v1/risk/vega-mapping
# ---------------------------------------------------------------------------

class TestVegaMapping:

    @pytest.mark.asyncio
    async def test_vega_mapping_returns_200(self):
        user = _make_user()
        result = _engine_result({
            "vix_notional_usd": 500000.0,
            "vix_contracts": 10,
        })
        with _with_overrides(user):
            with patch(
                "app.engine_v1.vol_mapping.map_vega_to_vix",
                return_value=result,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/vega-mapping",
                        json={
                            "portfolio_vega": 50000.0,
                            "market": {"vix": 20.0},
                            "policy": {},
                            "target_tenor_months": 3,
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_vega_mapping_no_permission_403(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_risk_analytics.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/vega-mapping",
                        json={"portfolio_vega": 10000.0},
                        headers=_auth_header(),
                    )
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_vega_mapping_with_calculate_run_production_permission(self):
        user = _make_user(is_superuser=False)
        result = _engine_result({"vix_notional_usd": 100000.0})
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_risk_analytics.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["calculate.run_production"]),
            ), patch(
                "app.engine_v1.vol_mapping.map_vega_to_vix",
                return_value=result,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{RISK}/vega-mapping",
                        json={"portfolio_vega": 10000.0},
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
