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
