"""Route tests for /v1/tca/*.

Adapted from the plan — since the project's conftest.py provides only a single
synthetic `auth_headers` fixture (no `auth_client_pro/viewer/free`), we use
FastAPI dependency_overrides to simulate plan-tier + permission states.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.db import get_session
from app.core.dependencies import get_current_user
from app.core.plan_enforcement import require_plan_tier
from app.main import app


pytestmark = [pytest.mark.asyncio]

_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


# ---------------------------------------------------------------------------
# Fixtures: simulated user states
# ---------------------------------------------------------------------------


def _make_user(plan: str = "professional", permissions: set[str] | None = None, is_superuser: bool = False):
    user = MagicMock()
    user.id = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
    user.company_id = uuid.UUID("bbbbbbbb-0000-0000-0000-000000000001")
    user.email = "user@example.com"
    user.is_superuser = is_superuser
    user.is_active = True
    user.permissions = permissions or set()
    user.company = MagicMock()
    user.company.plan_tier = plan
    return user


def _mock_session() -> AsyncMock:
    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar.return_value = 0
    mock_result.scalar_one_or_none.return_value = None
    mock_result.scalars.return_value.all.return_value = []
    session.execute = AsyncMock(return_value=mock_result)
    return session


def _install_overrides(user, session):
    # Bypass plan-tier dependency by returning the desired user directly
    app.dependency_overrides[require_plan_tier("professional")] = lambda: user
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: session


def _clear_overrides():
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Pre-Trade estimate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pre_trade_estimate_happy_path():
    user = _make_user(plan="professional", permissions={"tca.estimate", "tca.read"})
    session = _mock_session()
    _install_overrides(user, session)

    fake_est = MagicMock()
    fake_est.id = uuid.uuid4()
    fake_est.estimate_type = "pre_trade"
    fake_est.created_at = datetime(2026, 4, 18)
    fake_est.inputs = {"pair": "EURUSD", "notional_usd": 1_000_000}
    fake_est.outputs = {
        "slippage_cost": 50.0,
        "broker_commission": 250.0,
        "exchange_fee": 50.0,
        "clearing_fee": 20.0,
        "vol_drift_adjustment": 30.0,
        "total_cost": 400.0,
        "total_cost_bps": 4.0,
    }
    fake_est.total_cost_usd = 400.0
    fake_est.total_cost_bps = 4.0
    fake_est.market_snapshot_id = uuid.uuid4()
    fake_est.reconciled_at = None
    fake_est.actual_cost_usd = None
    fake_est.variance_bps = None
    fake_est._benchmark = None

    try:
        with patch("app.services.tca_service.estimate_pre_trade", new=AsyncMock(return_value=fake_est)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    "/api/v1/tca/pre-trade/estimate",
                    headers=_BEARER,
                    json={
                        "pair": "EURUSD",
                        "notional_usd": 1_000_000,
                        "direction": "BUY",
                        "instrument": "FWD",
                        "execution_window_hours": 24,
                    },
                )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["estimate_type"] == "pre_trade"
        assert "breakdown" in body
        assert body["breakdown"]["total_cost"] == 400.0
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_pre_trade_no_snapshot_returns_503():
    user = _make_user(plan="professional", permissions={"tca.estimate", "tca.read"})
    session = _mock_session()
    _install_overrides(user, session)

    from app.services.tca_service import TCAServiceError

    try:
        with patch(
            "app.services.tca_service.estimate_pre_trade",
            new=AsyncMock(side_effect=TCAServiceError("no_market_snapshot")),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    "/api/v1/tca/pre-trade/estimate",
                    headers=_BEARER,
                    json={
                        "pair": "EURUSD",
                        "notional_usd": 1_000_000,
                        "direction": "BUY",
                        "instrument": "FWD",
                        "execution_window_hours": 24,
                    },
                )
        assert resp.status_code == 503
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_pre_trade_requires_tca_estimate_permission():
    """Viewer has tca.read but NOT tca.estimate -> 403."""
    user = _make_user(plan="professional", permissions={"tca.read"})
    session = _mock_session()
    _install_overrides(user, session)

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/tca/pre-trade/estimate",
                headers=_BEARER,
                json={
                    "pair": "EURUSD",
                    "notional_usd": 1_000_000,
                    "direction": "BUY",
                    "instrument": "FWD",
                    "execution_window_hours": 24,
                },
            )
        assert resp.status_code == 403
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# Calc-run attachment
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_calc_run_tca_404_for_unattached():
    user = _make_user(plan="professional", permissions={"tca.read"})
    session = _mock_session()
    _install_overrides(user, session)

    try:
        with patch(
            "app.services.tca_service._find_estimate_by_run_id",
            new=AsyncMock(return_value=None),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get(
                    "/api/v1/tca/calc-runs/nonexistent-run",
                    headers=_BEARER,
                )
        assert resp.status_code == 404
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# Accuracy report
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_accuracy_report_empty_not_error():
    from app.schemas_v1.tca import AccuracyReportResponse

    user = _make_user(plan="professional", permissions={"tca.read"})
    session = _mock_session()
    _install_overrides(user, session)

    try:
        with patch(
            "app.services.tca_service.get_accuracy_report",
            new=AsyncMock(
                return_value=AccuracyReportResponse(
                    period="Q4-2025",
                    group_by="pair",
                    total_reconciled=0,
                    buckets=[],
                )
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get(
                    "/api/v1/tca/accuracy-report?period=Q4-2025&group_by=pair",
                    headers=_BEARER,
                )
        assert resp.status_code == 200, resp.text
        assert resp.json()["total_reconciled"] == 0
    finally:
        _clear_overrides()


# ---------------------------------------------------------------------------
# Plan gate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_free_plan_gets_402():
    """Starter plan user without plan-gate override -> 402 Payment Required."""
    user = _make_user(plan="starter", permissions={"tca.estimate"})
    session = _mock_session()
    # Only override get_current_user (so plan gate runs naturally + rejects)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/tca/pre-trade/estimate",
                headers=_BEARER,
                json={
                    "pair": "EURUSD",
                    "notional_usd": 1_000_000,
                    "direction": "BUY",
                    "instrument": "FWD",
                    "execution_window_hours": 24,
                },
            )
        assert resp.status_code == 402
    finally:
        _clear_overrides()
