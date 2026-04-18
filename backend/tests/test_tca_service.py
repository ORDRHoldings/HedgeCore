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
