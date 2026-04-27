"""Tests that route handlers emit the correct webhook events."""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")

import contextlib
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.db import get_async_session, get_session
from app.core.dependencies import get_current_user
from app.core.schema_state import set_schema_ready
from app.core.security import create_access_token
from app.main import app

BASE_URL = "http://test"
CALC = "/api/v1"

USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
COMPANY_ID = "11111111-2222-3333-4444-555555555555"
BRANCH_ID = "55555555-6666-7777-8888-999999999999"


def _make_superuser() -> MagicMock:
    user = MagicMock()
    user.id = UUID(USER_ID)
    user.is_active = True
    user.is_superuser = True
    user.company_id = UUID(COMPANY_ID)
    user.branch_id = UUID(BRANCH_ID)
    user.email = "test@example.com"
    branch = MagicMock()
    branch.code = "HQ"
    branch.currency = "USD"
    user.branch = branch
    company = MagicMock()
    company.name = "TestCorp"
    user.company = company
    return user


def _make_token() -> str:
    return create_access_token(sub=USER_ID, email="test@example.com")


def _make_db_session() -> AsyncMock:
    empty_result = MagicMock()
    empty_result.scalars.return_value.all.return_value = []
    empty_result.scalars.return_value.first.return_value = None
    empty_result.scalar.return_value = None

    db = AsyncMock()
    db.execute = AsyncMock(return_value=empty_result)
    db.get = AsyncMock(return_value=None)
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    return db


def _override_session(mock_db: AsyncMock):
    async def _gen():
        yield mock_db
    return _gen


def _override_user(user: MagicMock):
    async def _dep():
        return user
    return _dep


@contextlib.contextmanager
def _with_overrides(user: MagicMock, db: AsyncMock | None = None):
    if db is None:
        db = _make_db_session()
    app.dependency_overrides[get_async_session] = _override_session(db)
    app.dependency_overrides[get_session] = _override_session(db)
    app.dependency_overrides[get_current_user] = _override_user(user)
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_async_session, None)
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_current_user, None)


def _full_request() -> dict:
    return {
        "trades": [
            {
                "record_id": "TR-001",
                "entity": "ACME Corp",
                "type": "AR",
                "currency": "MXN",
                "amount": 1_000_000.0,
                "value_date": "2025-03-31",
                "status": "CONFIRMED",
                "description": "Test trade",
            }
        ],
        "hedges": [],
        "market": {
            "as_of": "2025-01-15T09:00:00Z",
            "spot_rate": 17.15,
            "forward_points_by_month": {"1": 0.05, "3": 0.12},
            "provider_metadata": {},
        },
        "policy": {
            "bucket_mode": "CALENDAR_MONTH",
            "hedge_ratios": {"confirmed": 0.9, "forecast": 0.5},
            "cost_assumptions": {"spread_bps": 5.0},
            "execution_product": "NDF",
            "min_trade_size_usd": 50_000.0,
            "allow_indicative_proxy": True,
        },
    }


def _setup_engine_mocks(mock_validate, mock_kernel, mock_scenarios, mock_envelope, mock_trace):
    from app.schemas_v1.results import (
        BucketResult, HedgePlan, HedgePlanSummary,
        RunEnvelope, ScenarioResults, TraceLite, ValidationReport,
    )
    from datetime import datetime, timezone

    validation_report = ValidationReport(status="PASS", errors=[], warnings=[])
    mock_validate.return_value = validation_report

    bucket = BucketResult(
        bucket="2025-03",
        confirmed_flow_mxn=1_000_000.0,
        forecast_flow_mxn=0.0,
        commercial_exposure_mxn=1_000_000.0,
        existing_hedges_mxn=0.0,
        target_signed_mxn=900_000.0,
        action_mxn=900_000.0,
        action_direction="BUY",
        forward_rate=17.20,
        carry_note="",
        action_usd=52_000.0,
        friction_usd=260.0,
        suppressed=False,
        hedge_position_mxn=900_000.0,
        residual_mxn=100_000.0,
    )
    summary = HedgePlanSummary(
        total_commercial_exposure_mxn=1_000_000.0,
        total_existing_hedges_mxn=0.0,
        total_action_mxn=900_000.0,
        total_action_usd=52_000.0,
        total_friction_usd=260.0,
        total_hedge_position_mxn=900_000.0,
        total_residual_mxn=100_000.0,
    )
    hedge_plan = HedgePlan(buckets=[bucket], summary=summary)
    mock_kernel.return_value = (hedge_plan, [])

    scenario_results = ScenarioResults(sigmas=[], per_bucket=[], totals=[])
    mock_scenarios.return_value = scenario_results

    run_id_placeholder = "00000000-0000-0000-0000-000000000001"
    run_envelope = RunEnvelope(
        run_id=run_id_placeholder,
        timestamp=datetime.now(timezone.utc),
        engine_version="test",
        inputs_hash="a" * 64,
        outputs_hash="b" * 64,
        run_hash="c" * 64,
        trades_hash="d" * 64,
        hedges_hash="e" * 64,
        market_hash="f" * 64,
        policy_hash="g" * 64,
    )
    mock_envelope.return_value = run_envelope

    trace_lite = TraceLite(run_id=run_id_placeholder, events=[])
    mock_trace.return_value = trace_lite


@pytest.fixture(autouse=True)
def _schema_ready():
    set_schema_ready(True)
    yield


@pytest.mark.asyncio
async def test_hedge_run_completed_dispatched():
    """POST /v1/calculate emits hedge_run.completed via dispatch_to_company."""
    user = _make_superuser()

    with (
        _with_overrides(user),
        patch("app.api.routes.v1_calculate.dispatch_to_company") as mock_dispatch,
        patch("app.api.routes.v1_calculate._distributed_rate_limiter.is_allowed", return_value=True),
        patch("app.api.routes.v1_calculate.validate_all") as mock_validate,
        patch("app.api.routes.v1_calculate.normalize_trades", return_value=MagicMock()),
        patch("app.api.routes.v1_calculate.normalize_hedges", return_value=MagicMock()),
        patch("app.api.routes.v1_calculate.compute_hedge_plan") as mock_kernel,
        patch("app.api.routes.v1_calculate.compute_scenarios") as mock_scenarios,
        patch("app.api.routes.v1_calculate.build_run_envelope") as mock_envelope,
        patch("app.api.routes.v1_calculate.build_trace_lite") as mock_trace,
        patch("app.api.routes.v1_calculate._persist_run", new=AsyncMock()),
        patch("app.api.routes.v1_calculate._snapshot_create_or_get", new=AsyncMock(side_effect=Exception("skip"))),
    ):
        mock_dispatch.return_value = None
        _setup_engine_mocks(mock_validate, mock_kernel, mock_scenarios, mock_envelope, mock_trace)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as client:
            resp = await client.post(
                f"{CALC}/calculate",
                json=_full_request(),
                headers={"Authorization": f"Bearer {_make_token()}"},
            )

    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    called_event_types = [
        call.args[2] if len(call.args) >= 3 else call.kwargs.get("event_type")
        for call in mock_dispatch.call_args_list
    ]
    assert "hedge_run.completed" in called_event_types, (
        f"hedge_run.completed not in dispatched events: {called_event_types}"
    )
    assert "calculation.completed" in called_event_types, (
        f"calculation.completed not in dispatched events: {called_event_types}"
    )
