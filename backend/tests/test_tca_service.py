"""Tests for tca_service (also validates the ORM model)."""
import pytest

def test_transaction_cost_estimate_model_has_required_columns():
    from app.models.transaction_cost_estimate import TransactionCostEstimate
    required = {
        "id", "tenant_id", "user_id", "estimate_type",
        "calculation_run_id", "market_snapshot_id",
        "inputs", "outputs",
        "total_cost_usd", "total_cost_bps",
        "settlement_event_id", "actual_cost_usd", "variance_bps",
        "reconciled_at", "created_at",
    }
    columns = {c.name for c in TransactionCostEstimate.__table__.columns}
    assert required.issubset(columns), f"missing: {required - columns}"


def test_tca_schemas_importable():
    from app.schemas_v1.tca import (
        PreTradeEstimateRequest,
        TCAEstimateResponse,
        TCABreakdown,
        TCABenchmark,
        ReconcileRequest,
        AccuracyReportResponse,
        AccuracyBucket,
    )
    # Basic shape check
    req = PreTradeEstimateRequest(
        pair="EURUSD", notional_usd=1_000_000, direction="BUY",
        instrument="FWD", execution_window_hours=24,
    )
    assert req.pair == "EURUSD"


import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4


@pytest.mark.asyncio
async def test_estimate_pre_trade_persists_row(monkeypatch):
    from app.services import tca_service
    from app.schemas_v1.tca import PreTradeEstimateRequest

    tenant_id, user_id, snapshot_id = uuid4(), uuid4(), uuid4()

    # Mock dependencies
    mock_snapshot = MagicMock(
        id=snapshot_id,
        company_id=tenant_id,
        market_data={"fee_schedule": {"FWD": {"exchange": 0.5}}, "vol_surface": {"USDMXN_1M": 12.0}},
    )
    mock_db = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    async def fake_get_latest(db, tid):
        return mock_snapshot
    monkeypatch.setattr(tca_service, "_get_market_snapshot_for_pretrade", fake_get_latest)
    monkeypatch.setattr(tca_service, "_estimate_slippage", lambda pair, notional: [{"bucket": "PRE_TRADE", "slippage_usd": 50.0}])
    monkeypatch.setattr(tca_service, "_emit_tca_audit", AsyncMock())
    monkeypatch.setattr(tca_service, "_compute_benchmark", AsyncMock(return_value=None))

    req = PreTradeEstimateRequest(
        pair="EURUSD", notional_usd=1_000_000, direction="BUY",
        instrument="FWD", execution_window_hours=24,
    )
    estimate = await tca_service.estimate_pre_trade(
        db=mock_db, tenant_id=tenant_id, user_id=user_id, request=req,
    )
    assert estimate.estimate_type == "pre_trade"
    assert estimate.tenant_id == tenant_id
    assert estimate.total_cost_usd > 0
    mock_db.add.assert_called_once()
    mock_db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_estimate_pre_trade_no_snapshot_raises(monkeypatch):
    from app.services import tca_service
    from app.services.tca_service import TCAServiceError
    from app.schemas_v1.tca import PreTradeEstimateRequest

    async def fake_no_snapshot(db, tid):
        return None
    monkeypatch.setattr(tca_service, "_get_market_snapshot_for_pretrade", fake_no_snapshot)

    req = PreTradeEstimateRequest(
        pair="EURUSD", notional_usd=1_000_000, direction="BUY",
        instrument="FWD", execution_window_hours=24,
    )
    with pytest.raises(TCAServiceError) as exc_info:
        await tca_service.estimate_pre_trade(
            db=AsyncMock(), tenant_id=uuid4(), user_id=uuid4(), request=req,
        )
    assert exc_info.value.code == "no_market_snapshot"


@pytest.mark.asyncio
async def test_attach_to_calc_run_idempotent(monkeypatch):
    from app.services import tca_service

    existing = MagicMock(id=uuid4(), estimate_type="post_calc")
    mock_db = AsyncMock()

    async def fake_query_existing(db, run_id):
        return existing
    monkeypatch.setattr(tca_service, "_find_estimate_by_run_id", fake_query_existing)

    result = await tca_service.attach_to_calc_run(
        db=mock_db,
        calculation_run_id="run-abc",
        tenant_id=uuid4(), user_id=uuid4(),
        hedge_actions=[], slippage_estimates=[],
        market={}, policy={}, market_snapshot_id=uuid4(),
    )
    assert result is existing
    mock_db.add.assert_not_called()  # idempotent — no new insert
