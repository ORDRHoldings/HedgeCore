"""
tests/test_calculate_coverage.py

Coverage tests for app/api/routes/v1_calculate.py

Covers:
  - POST /api/v1/calculate  (happy path, RBAC, rate limit, validation, schema gate)
  - GET  /api/v1/runs        (list runs)
  - GET  /api/v1/runs/{id}   (run detail — cache hit, DB hit, 404, tenant isolation)
  - POST /api/v1/calculate/extended (happy path + extended fields)
  - Auth rejection (401) for all endpoints

Auth: standard JWT via get_current_user dependency override.
DB:   AsyncMock session; WORM persist is non-fatal so failures are swallowed.
"""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")

import contextlib
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.db import get_async_session, get_session
from app.core.schema_state import set_schema_ready
from app.core.security import create_access_token, get_current_user
from app.main import app

BASE_URL = "http://test"
CALC = "/api/v1"

USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
COMPANY_ID = "11111111-2222-3333-4444-555555555555"
BRANCH_ID = "55555555-6666-7777-8888-999999999999"


# ---------------------------------------------------------------------------
# Minimal valid payloads
# ---------------------------------------------------------------------------

def _market_payload() -> dict:
    return {
        "as_of": "2025-01-15T09:00:00Z",
        "spot_rate": 17.15,
        "forward_points_by_month": {"1": 0.05, "3": 0.12},
        "provider_metadata": {},
    }


def _trade_payload() -> dict:
    return {
        "record_id": "TR-001",
        "entity": "ACME Corp",
        "type": "AR",
        "currency": "MXN",
        "amount": 1_000_000.0,
        "value_date": "2025-03-31",
        "status": "CONFIRMED",
        "description": "Test trade",
    }


def _policy_payload() -> dict:
    return {
        "bucket_mode": "CALENDAR_MONTH",
        "hedge_ratios": {"confirmed": 0.9, "forecast": 0.5},
        "cost_assumptions": {"spread_bps": 5.0},
        "execution_product": "NDF",
        "min_trade_size_usd": 50_000.0,
        "allow_indicative_proxy": True,
    }


def _full_request() -> dict:
    return {
        "trades": [_trade_payload()],
        "hedges": [],
        "market": _market_payload(),
        "policy": _policy_payload(),
    }


# ---------------------------------------------------------------------------
# Mock factories
# ---------------------------------------------------------------------------

def _make_user(
    user_id: str = USER_ID,
    company_id: str = COMPANY_ID,
    is_superuser: bool = False,
) -> MagicMock:
    user = MagicMock()
    user.id = UUID(user_id)
    user.is_active = True
    user.is_superuser = is_superuser
    user.company_id = UUID(company_id)
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


def _make_token(user_id: str = USER_ID) -> str:
    return create_access_token(sub=user_id, email="test@example.com")


def _make_db_session() -> AsyncMock:
    """Generic empty async DB session (all queries return empty)."""
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
    """Install and clean up FastAPI dependency overrides."""
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


# ---------------------------------------------------------------------------
# Helper: build a CalculateResponse mock (returned by mocked calculate())
# ---------------------------------------------------------------------------

def _make_calculate_response(run_id: str | None = None) -> MagicMock:
    run_id = run_id or str(uuid4())
    resp = MagicMock()
    resp.run_id = run_id

    bucket = MagicMock()
    bucket.model_dump.return_value = {
        "bucket": "2025-03",
        "commercial_exposure_mxn": 1_000_000.0,
        "hedge_position_mxn": 900_000.0,
    }
    hedge_plan = MagicMock()
    hedge_plan.buckets = [bucket]
    hedge_plan.model_dump.return_value = {"buckets": [], "summary": {}}
    resp.hedge_plan = hedge_plan

    run_envelope = MagicMock()
    run_envelope.inputs_hash = "a" * 64
    run_envelope.outputs_hash = "b" * 64
    run_envelope.run_hash = "c" * 64
    run_envelope.model_dump.return_value = {
        "run_id": run_id,
        "inputs_hash": "a" * 64,
        "outputs_hash": "b" * 64,
        "run_hash": "c" * 64,
    }
    resp.run_envelope = run_envelope

    scenario_results = MagicMock()
    scenario_results.sigmas = [-2.0, -1.0, 0.0, 1.0, 2.0]
    scenario_results.model_dump.return_value = {"sigmas": [], "per_bucket": [], "totals": []}
    resp.scenario_results = scenario_results

    trace_lite = MagicMock()
    trace_lite.model_dump.return_value = {"run_id": run_id, "events": []}
    resp.trace_lite = trace_lite

    return resp


# ---------------------------------------------------------------------------
# Ensure schema is marked ready for all tests in this module
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _schema_ready():
    set_schema_ready(True)
    yield
    # Leave it set — it affects nothing else in test isolation


# ---------------------------------------------------------------------------
# 1. Auth rejection (401) — no token or bad token
# ---------------------------------------------------------------------------

class TestAuthRejection:
    @pytest.mark.asyncio
    async def test_calculate_no_auth_returns_4xx(self):
        # CSRF middleware fires before auth on POST endpoints — returns 403 (not 401)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{CALC}/calculate", json=_full_request())
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_calculate_bad_token_returns_401(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(
                f"{CALC}/calculate",
                json=_full_request(),
                headers={"Authorization": "Bearer not.a.valid.token"},
            )
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_list_runs_no_auth_returns_401(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{CALC}/runs")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_get_run_detail_no_auth_returns_401(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{CALC}/runs/{uuid4()}")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_calculate_extended_no_auth_returns_4xx(self):
        # CSRF middleware fires before auth on POST endpoints — returns 403 (not 401)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{CALC}/calculate/extended", json=_full_request())
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# 2. RBAC: non-superuser without calculate.run_production gets 403
# ---------------------------------------------------------------------------

class TestRBAC:
    @pytest.mark.asyncio
    async def test_calculate_missing_permission_returns_403(self):
        user = _make_user(is_superuser=False)
        with (
            _with_overrides(user),
            patch(
                "app.api.routes.v1_calculate.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate",
                    json=_full_request(),
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 403
        assert "calculate.run_production" in r.json()["detail"]

    @pytest.mark.asyncio
    async def test_calculate_superuser_bypasses_rbac(self):
        """Superuser skips the RBAC check entirely."""
        user = _make_user(is_superuser=True)
        with _with_overrides(user):
            with (
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
                _setup_engine_mocks(mock_validate, mock_kernel, mock_scenarios, mock_envelope, mock_trace)
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{CALC}/calculate",
                        json=_full_request(),
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        # Should succeed (200) or at worst fail on DB but not on RBAC
        assert r.status_code != 403


# ---------------------------------------------------------------------------
# Helper: configure engine mock return values for a successful calculation
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# 3. Rate limiting: 429 when rate limiter denies
# ---------------------------------------------------------------------------

class TestRateLimit:
    @pytest.mark.asyncio
    async def test_calculate_rate_limited_returns_429(self):
        user = _make_user(is_superuser=True)
        with (
            _with_overrides(user),
            patch("app.api.routes.v1_calculate._distributed_rate_limiter.is_allowed", return_value=False),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate",
                    json=_full_request(),
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 429
        assert "Rate limit" in r.json()["detail"]


# ---------------------------------------------------------------------------
# 4. Input validation errors (422)
# ---------------------------------------------------------------------------

class TestInputValidation:
    @pytest.mark.asyncio
    async def test_calculate_missing_trades_field_returns_422(self):
        user = _make_user(is_superuser=True)
        payload = _full_request()
        del payload["trades"]
        with _with_overrides(user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate",
                    json=payload,
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_calculate_missing_market_returns_422(self):
        user = _make_user(is_superuser=True)
        payload = _full_request()
        del payload["market"]
        with _with_overrides(user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate",
                    json=payload,
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_calculate_missing_policy_returns_422(self):
        user = _make_user(is_superuser=True)
        payload = _full_request()
        del payload["policy"]
        with _with_overrides(user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate",
                    json=payload,
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_calculate_empty_body_returns_422(self):
        user = _make_user(is_superuser=True)
        with _with_overrides(user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate",
                    json={},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_calculate_invalid_market_snapshot_id_returns_422(self):
        """Non-UUID market_snapshot_id triggers 422 early."""
        user = _make_user(is_superuser=True)
        payload = _full_request()
        payload["market_snapshot_id"] = "not-a-uuid"
        with (
            _with_overrides(user),
            patch("app.api.routes.v1_calculate._distributed_rate_limiter.is_allowed", return_value=True),
            patch("app.api.routes.v1_calculate.rbac_service.get_permissions_by_user",
                  new=AsyncMock(return_value=["calculate.run_production"])),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate",
                    json=payload,
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 422
        assert "market_snapshot_id" in r.json()["detail"]


# ---------------------------------------------------------------------------
# 5. Schema gate: 503 when schema not ready
# ---------------------------------------------------------------------------

class TestSchemaGate:
    @pytest.mark.asyncio
    async def test_calculate_503_when_schema_not_ready(self):
        user = _make_user(is_superuser=True)
        set_schema_ready(False)
        try:
            with (
                _with_overrides(user),
                patch("app.api.routes.v1_calculate._distributed_rate_limiter.is_allowed", return_value=True),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{CALC}/calculate",
                        json=_full_request(),
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
            assert r.status_code == 503
        finally:
            set_schema_ready(True)


# ---------------------------------------------------------------------------
# 6. POST /v1/calculate — happy path (full engine mocked)
# ---------------------------------------------------------------------------

class TestCalculateHappyPath:
    @pytest.mark.asyncio
    async def test_calculate_returns_200_with_run_id(self):
        user = _make_user(is_superuser=True)
        with (
            _with_overrides(user),
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
            _setup_engine_mocks(mock_validate, mock_kernel, mock_scenarios, mock_envelope, mock_trace)
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate",
                    json=_full_request(),
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert "run_id" in data
        assert "hedge_plan" in data
        assert "validation_report" in data
        assert "run_envelope" in data
        assert "trace_lite" in data

    @pytest.mark.asyncio
    async def test_calculate_validation_report_status_pass(self):
        user = _make_user(is_superuser=True)
        with (
            _with_overrides(user),
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
            _setup_engine_mocks(mock_validate, mock_kernel, mock_scenarios, mock_envelope, mock_trace)
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate",
                    json=_full_request(),
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert r.json()["validation_report"]["status"] == "PASS"

    @pytest.mark.asyncio
    async def test_calculate_validation_fail_returns_422(self):
        """When engine validator returns FAIL, endpoint returns 422."""
        from app.schemas_v1.results import ValidationReport
        from app.schemas_v1.errors import ValidationErrorDetail

        user = _make_user(is_superuser=True)
        fail_report = ValidationReport(
            status="FAIL",
            errors=[
                ValidationErrorDetail(
                    code="V-001",
                    field="trades",
                    message="Test critical failure",
                    severity="CRITICAL",
                )
            ],
            warnings=[],
        )
        with (
            _with_overrides(user),
            patch("app.api.routes.v1_calculate._distributed_rate_limiter.is_allowed", return_value=True),
            patch("app.api.routes.v1_calculate.validate_all", return_value=fail_report),
            patch("app.api.routes.v1_calculate.normalize_trades", return_value=MagicMock()),
            patch("app.api.routes.v1_calculate.normalize_hedges", return_value=MagicMock()),
            patch("app.api.routes.v1_calculate._snapshot_create_or_get", new=AsyncMock(side_effect=Exception("skip"))),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate",
                    json=_full_request(),
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 422
        assert "validation_report" in r.json()["detail"]

    @pytest.mark.asyncio
    async def test_calculate_db_persist_failure_still_returns_200(self):
        """Non-fatal DB persist: even if _persist_run raises, the response is 200."""
        user = _make_user(is_superuser=True)
        with (
            _with_overrides(user),
            patch("app.api.routes.v1_calculate._distributed_rate_limiter.is_allowed", return_value=True),
            patch("app.api.routes.v1_calculate.validate_all") as mock_validate,
            patch("app.api.routes.v1_calculate.normalize_trades", return_value=MagicMock()),
            patch("app.api.routes.v1_calculate.normalize_hedges", return_value=MagicMock()),
            patch("app.api.routes.v1_calculate.compute_hedge_plan") as mock_kernel,
            patch("app.api.routes.v1_calculate.compute_scenarios") as mock_scenarios,
            patch("app.api.routes.v1_calculate.build_run_envelope") as mock_envelope,
            patch("app.api.routes.v1_calculate.build_trace_lite") as mock_trace,
            patch("app.api.routes.v1_calculate._persist_run", new=AsyncMock(side_effect=Exception("DB down"))),
            patch("app.api.routes.v1_calculate._snapshot_create_or_get", new=AsyncMock(side_effect=Exception("skip"))),
        ):
            _setup_engine_mocks(mock_validate, mock_kernel, mock_scenarios, mock_envelope, mock_trace)
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate",
                    json=_full_request(),
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_calculate_non_superuser_with_permission_succeeds(self):
        """Non-superuser WITH calculate.run_production permission proceeds past RBAC."""
        user = _make_user(is_superuser=False)
        with (
            _with_overrides(user),
            patch(
                "app.api.routes.v1_calculate.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["calculate.run_production"]),
            ),
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
            _setup_engine_mocks(mock_validate, mock_kernel, mock_scenarios, mock_envelope, mock_trace)
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate",
                    json=_full_request(),
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 7. Market snapshot ID path: 404 when snapshot not found
# ---------------------------------------------------------------------------

class TestMarketSnapshotPath:
    @pytest.mark.asyncio
    async def test_calculate_with_missing_snapshot_id_returns_404(self):
        user = _make_user(is_superuser=True)
        payload = _full_request()
        valid_uuid = str(uuid4())
        payload["market_snapshot_id"] = valid_uuid
        with (
            _with_overrides(user),
            patch("app.api.routes.v1_calculate._distributed_rate_limiter.is_allowed", return_value=True),
            patch("app.api.routes.v1_calculate._snapshot_get_by_id", new=AsyncMock(return_value=None)),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate",
                    json=payload,
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404
        assert valid_uuid[:8] in r.json()["detail"] or "not found" in r.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_calculate_with_valid_snapshot_id_uses_worm_data(self):
        """When snapshot found, market data is loaded from the WORM store."""
        user = _make_user(is_superuser=True)
        snap = MagicMock()
        snap.id = uuid4()
        snap.payload = _market_payload()
        snap.market_snapshot_hash = "h" * 64
        snap.provider = "manual"
        snap.fetched_at = datetime(2025, 1, 15, 9, 0, 0, tzinfo=timezone.utc)
        snap.as_of = datetime(2025, 1, 15, 9, 0, 0, tzinfo=timezone.utc)
        snap.data_class = "LIVE"
        snap.is_synthetic_forward = False

        valid_uuid = str(snap.id)
        payload = _full_request()
        payload["market_snapshot_id"] = valid_uuid

        with (
            _with_overrides(user),
            patch("app.api.routes.v1_calculate._distributed_rate_limiter.is_allowed", return_value=True),
            patch("app.api.routes.v1_calculate._snapshot_get_by_id", new=AsyncMock(return_value=snap)),
            patch("app.api.routes.v1_calculate.validate_all") as mock_validate,
            patch("app.api.routes.v1_calculate.normalize_trades", return_value=MagicMock()),
            patch("app.api.routes.v1_calculate.normalize_hedges", return_value=MagicMock()),
            patch("app.api.routes.v1_calculate.compute_hedge_plan") as mock_kernel,
            patch("app.api.routes.v1_calculate.compute_scenarios") as mock_scenarios,
            patch("app.api.routes.v1_calculate.build_run_envelope") as mock_envelope,
            patch("app.api.routes.v1_calculate.build_trace_lite") as mock_trace,
            patch("app.api.routes.v1_calculate._persist_run", new=AsyncMock()),
        ):
            _setup_engine_mocks(mock_validate, mock_kernel, mock_scenarios, mock_envelope, mock_trace)
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate",
                    json=payload,
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 8. GET /v1/runs — list runs
# ---------------------------------------------------------------------------

class TestListRuns:
    @pytest.mark.asyncio
    async def test_list_runs_returns_200_with_items_and_total(self):
        user = _make_user(is_superuser=False)
        db = _make_db_session()
        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{CALC}/runs",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)

    @pytest.mark.asyncio
    async def test_list_runs_empty_in_zero_state(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{CALC}/runs",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert r.json()["items"] == []
        assert r.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_list_runs_with_data_returns_run_summaries(self):
        user = _make_user(is_superuser=False)
        run = MagicMock()
        run.id = str(uuid4())
        run.inputs_hash = "a" * 64
        run.outputs_hash = "b" * 64
        run.run_hash = "c" * 64
        run.trade_count = 3
        run.hedge_count = 2
        run.company_id = UUID(COMPANY_ID)
        run.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)

        runs_result = MagicMock()
        runs_result.scalars.return_value.all.return_value = [run]
        runs_result.scalar.return_value = None

        db = _make_db_session()
        db.execute = AsyncMock(return_value=runs_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{CALC}/runs",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        item = items[0]
        assert "run_id" in item
        assert "inputs_hash" in item
        assert "trade_count" in item
        assert item["trade_count"] == 3

    @pytest.mark.asyncio
    async def test_list_runs_superuser_sees_all(self):
        """Superuser query does not filter by company_id."""
        user = _make_user(is_superuser=True)
        with _with_overrides(user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{CALC}/runs",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_list_runs_limit_param_accepted(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{CALC}/runs?limit=10",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_list_runs_limit_too_large_returns_422(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{CALC}/runs?limit=9999",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# 9. GET /v1/runs/{run_id} — run detail
# ---------------------------------------------------------------------------

class TestGetRunDetail:
    @pytest.mark.asyncio
    async def test_get_run_detail_not_found_returns_404(self):
        user = _make_user(is_superuser=False)
        db = _make_db_session()
        db.get = AsyncMock(return_value=None)
        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{CALC}/runs/{uuid4()}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_get_run_detail_from_db_returns_fields(self):
        user = _make_user(is_superuser=False)
        run_id = str(uuid4())
        row = MagicMock()
        row.id = run_id
        row.run_envelope = {"run_id": run_id, "inputs_hash": "a" * 64}
        row.trace_lite = {"events": []}
        row.trade_count = 2
        row.hedge_count = 1
        row.inputs_hash = "a" * 64
        row.outputs_hash = "b" * 64
        row.run_hash = "c" * 64
        row.policy_revision_id = None
        row.policy_hash = None
        row.created_at = datetime(2025, 1, 15, tzinfo=timezone.utc)
        row.company_id = UUID(COMPANY_ID)

        db = _make_db_session()
        db.get = AsyncMock(return_value=row)

        # Clear cache for this run_id
        from app.api.routes.v1_calculate import _run_store
        _run_store.pop(f"{COMPANY_ID}:{run_id}", None)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{CALC}/runs/{run_id}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["run_id"] == run_id
        assert "run_envelope" in data
        assert "trade_count" in data
        assert data["trade_count"] == 2

    @pytest.mark.asyncio
    async def test_get_run_detail_tenant_isolation_returns_404(self):
        """A run owned by another company is not accessible (returns 404)."""
        user = _make_user(is_superuser=False, company_id=COMPANY_ID)
        other_company_id = "99999999-9999-9999-9999-999999999999"
        run_id = str(uuid4())

        row = MagicMock()
        row.id = run_id
        row.company_id = UUID(other_company_id)
        row.run_envelope = {}
        row.trace_lite = {}
        row.trade_count = 1
        row.hedge_count = 0
        row.inputs_hash = "a" * 64
        row.outputs_hash = "b" * 64
        row.run_hash = "c" * 64
        row.policy_revision_id = None
        row.policy_hash = None
        row.created_at = datetime(2025, 1, 15, tzinfo=timezone.utc)

        db = _make_db_session()
        db.get = AsyncMock(return_value=row)

        # Ensure not in cache
        from app.api.routes.v1_calculate import _run_store
        _run_store.pop(f"{COMPANY_ID}:{run_id}", None)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{CALC}/runs/{run_id}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_get_run_detail_superuser_accesses_any_company(self):
        """Superuser can access runs from any company."""
        user = _make_user(is_superuser=True, company_id=COMPANY_ID)
        other_company_id = "99999999-9999-9999-9999-999999999999"
        run_id = str(uuid4())

        row = MagicMock()
        row.id = run_id
        row.company_id = UUID(other_company_id)
        row.run_envelope = {}
        row.trace_lite = {}
        row.trade_count = 1
        row.hedge_count = 0
        row.inputs_hash = "a" * 64
        row.outputs_hash = "b" * 64
        row.run_hash = "c" * 64
        row.policy_revision_id = None
        row.policy_hash = None
        row.created_at = datetime(2025, 1, 15, tzinfo=timezone.utc)

        db = _make_db_session()
        db.get = AsyncMock(return_value=row)

        from app.api.routes.v1_calculate import _run_store
        _run_store.pop(f"{COMPANY_ID}:{run_id}", None)
        _run_store.pop(f"{other_company_id}:{run_id}", None)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{CALC}/runs/{run_id}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 10. POST /v1/calculate/extended — basic smoke test
# ---------------------------------------------------------------------------

class TestCalculateExtended:
    @pytest.mark.asyncio
    async def test_calculate_extended_returns_200_with_base_and_extended(self):
        user = _make_user(is_superuser=True)
        with (
            _with_overrides(user),
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
            _setup_engine_mocks(mock_validate, mock_kernel, mock_scenarios, mock_envelope, mock_trace)
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate/extended",
                    json=_full_request(),
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert "base" in data
        assert "extended" in data
        # base must contain standard calculate fields
        assert "run_id" in data["base"]
        assert "hedge_plan" in data["base"]

    @pytest.mark.asyncio
    async def test_calculate_extended_extended_dict_has_known_keys(self):
        """Extended result should have margin, concentration, etc. (may be None on failure)."""
        user = _make_user(is_superuser=True)
        with (
            _with_overrides(user),
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
            _setup_engine_mocks(mock_validate, mock_kernel, mock_scenarios, mock_envelope, mock_trace)
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate/extended",
                    json=_full_request(),
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        extended = r.json()["extended"]
        expected_keys = {"margin", "concentration", "hedge_effectiveness", "factor_covariance", "capital", "waterfall"}
        for key in expected_keys:
            assert key in extended, f"Expected key '{key}' in extended result"

    @pytest.mark.asyncio
    async def test_calculate_extended_missing_permission_returns_403(self):
        """Extended endpoint inherits the same RBAC check as base calculate."""
        user = _make_user(is_superuser=False)
        with (
            _with_overrides(user),
            patch(
                "app.api.routes.v1_calculate.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{CALC}/calculate/extended",
                    json=_full_request(),
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# 11. Unit: _check_calc_rate helper
# ---------------------------------------------------------------------------

class TestCheckCalcRate:
    def test_rate_allows_first_requests(self):
        from app.api.routes.v1_calculate import _check_calc_rate, _calc_timestamps
        uid = "unit-test-user-rate-" + str(uuid4())[:8]
        _calc_timestamps.pop(uid, None)
        for _ in range(10):
            assert _check_calc_rate(uid) is True

    def test_rate_blocks_after_limit(self):
        from app.api.routes.v1_calculate import _check_calc_rate, _calc_timestamps
        uid = "unit-test-user-rate-full-" + str(uuid4())[:8]
        _calc_timestamps.pop(uid, None)
        for _ in range(10):
            _check_calc_rate(uid)
        # 11th call should be blocked
        assert _check_calc_rate(uid) is False
