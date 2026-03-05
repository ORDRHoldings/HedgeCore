"""
backend/tests/test_decision_desk_api.py

API-level tests for Decision Desk endpoints.
Validates the route-layer logic (position loading, policy parsing, snapshot handling)
by testing the engine inputs/outputs directly — no live DB or HTTP server required.
"""
from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from app.engine.decision_engine import (
    DecisionPolicyConfig,
    MarketSnapshotInput,
    PositionInput,
    run_decision_engine,
)


# ── Fixtures ────────────────────────────────────────────────────────────────────

def _snap(spot_rate: float = 17.50) -> MarketSnapshotInput:
    return MarketSnapshotInput(
        snapshot_id="snap-001",
        snapshot_hash="b" * 64,
        as_of=datetime.now(UTC),
        primary_currency="MXN",
        spot_rate=spot_rate,
        provider="test",
    )


def _policy(**overrides) -> DecisionPolicyConfig:
    defaults = {
        "immediate_hedge_threshold_usd": 500_000.0,
        "staged_min_usd": 50_000.0,
        "staging_window_months": 3,
        "premium_budget_pct": 1.0,
        "min_trade_size_usd": 10_000.0,
        "hedge_ratio_confirmed": 0.80,
        "hedge_ratio_forecast": 0.50,
        "allowed_instruments": ["NDF", "FORWARD"],
        "spread_bps": 30.0,
        "margin_pct": 3.0,
    }
    defaults.update(overrides)
    return DecisionPolicyConfig(**defaults)


def _pos(
    pid: str = "pos-001",
    currency: str = "MXN",
    amount_local: float = 10_000_000.0,
    flow_type: str = "AR",
) -> PositionInput:
    return PositionInput(
        position_id=pid,
        currency=currency,
        amount_local=amount_local,
        flow_type=flow_type,
        execution_status="READY_TO_EXECUTE",
        value_date=date(2025, 6, 30),
    )


# ── Test: decision run creation ────────────────────────────────────────────────

class TestDecisionRunCreation:
    def test_create_run_returns_proposals(self):
        """Simulates POST /v1/decisions/run flow."""
        positions = [_pos()]
        policy = _policy()
        snap = _snap()

        result = run_decision_engine("run-001", positions, policy, snap)

        assert len(result.proposals) == 1
        assert result.proposals[0].action == "HEDGE_IMMEDIATE"

    def test_run_hash_stable_same_inputs(self):
        positions = [_pos()]
        policy = _policy()
        snap = _snap()

        r1 = run_decision_engine("run-001", positions, policy, snap)
        r2 = run_decision_engine("run-001", positions, policy, snap)

        assert r1.run_hash == r2.run_hash

    def test_packets_generated_for_actionable_proposals(self):
        positions = [_pos(amount_local=10_000_000)]
        policy = _policy(immediate_hedge_threshold_usd=500_000.0)
        snap = _snap(17.50)

        result = run_decision_engine("run-002", positions, policy, snap)

        assert len(result.packets) > 0

    def test_no_snapshot_scenario_fails_closed(self):
        """Route layer should reject when no market snapshot available.
        Here we simulate with a spot_rate=0 which produces zero exposure → NO_ACTION."""
        positions = [_pos(amount_local=10_000_000)]
        policy = _policy(immediate_hedge_threshold_usd=500_000.0)
        # Spot rate 0 → _spot_to_usd returns 0
        snap = _snap(spot_rate=0.0)
        result = run_decision_engine("run-003", positions, policy, snap)
        # All NO_ACTION because net_usd = 0
        assert all(p.action == "NO_ACTION" for p in result.proposals)


# ── Test: get decision run (data structure) ───────────────────────────────────

class TestGetDecisionRun:
    def test_proposal_fields_present(self):
        """Verifies the fields expected by GET /v1/decisions/runs/{id} are present."""
        positions = [_pos()]
        policy = _policy()
        snap = _snap()
        result = run_decision_engine("run-get-01", positions, policy, snap)

        for p in result.proposals:
            d = p.to_dict()
            assert "rank" in d
            assert "action" in d
            assert "currency_pair" in d
            assert "instrument" in d
            assert "side" in d
            assert "notional_amount" in d
            assert "notional_currency" in d
            assert "hedge_ratio_pct" in d
            assert "residual_exposure" in d
            assert "cost_estimate_usd" in d
            assert "rationale" in d
            assert "proposal_hash" in d

    def test_trace_bundle_structure(self):
        positions = [_pos()]
        policy = _policy()
        snap = _snap()
        result = run_decision_engine("run-trace-01", positions, policy, snap)

        steps = {e.step for e in result.trace_events}
        assert "ENGINE_START" in steps
        assert "EXPOSURE_AGGREGATION" in steps
        assert "ENGINE_COMPLETE" in steps


# ── Test: get execution packets ────────────────────────────────────────────────

class TestGetDecisionPackets:
    def test_ibkr_payload_fields(self):
        """Verifies GET /v1/decisions/runs/{id}/packets IBKR payload format."""
        positions = [_pos(amount_local=10_000_000)]
        policy = _policy(immediate_hedge_threshold_usd=500_000.0)
        snap = _snap()
        result = run_decision_engine("run-pkt-01", positions, policy, snap)

        for pk in result.packets:
            ibkr = pk.ibkr_payload
            assert "symbol" in ibkr
            assert "secType" in ibkr
            assert "action" in ibkr
            assert "totalQuantity" in ibkr
            assert "orderType" in ibkr
            assert ibkr["action"] in ("BUY", "SELL")

    def test_packet_ticket_text_non_empty(self):
        positions = [_pos(amount_local=10_000_000)]
        policy = _policy(immediate_hedge_threshold_usd=500_000.0)
        snap = _snap()
        result = run_decision_engine("run-pkt-02", positions, policy, snap)

        for pk in result.packets:
            assert isinstance(pk.ticket_text, str)
            assert len(pk.ticket_text) > 20

    def test_packet_hash_sha256(self):
        positions = [_pos(amount_local=10_000_000)]
        policy = _policy()
        snap = _snap()
        result = run_decision_engine("run-pkt-03", positions, policy, snap)

        for pk in result.packets:
            assert len(pk.packet_hash) == 64
            assert all(c in "0123456789abcdef" for c in pk.packet_hash)


# ── Test: tenant isolation (simulated) ───────────────────────────────────────

class TestTenantIsolation:
    def test_different_run_ids_different_hashes(self):
        """Each decision run must be independently hashed — same positions, different run_id."""
        positions = [_pos()]
        policy = _policy()
        snap = _snap()

        r1 = run_decision_engine("run-tenant-A", positions, policy, snap)
        r2 = run_decision_engine("run-tenant-B", positions, policy, snap)

        # Different run_id → different inputs_hash → different run_hash
        assert r1.run_hash != r2.run_hash
        assert r1.inputs_hash != r2.inputs_hash

    def test_same_run_id_same_hash(self):
        """Idempotent: same run_id + same inputs = same outputs."""
        positions = [_pos()]
        policy = _policy()
        snap = _snap()

        r1 = run_decision_engine("run-idem-1", positions, policy, snap)
        r2 = run_decision_engine("run-idem-1", positions, policy, snap)

        assert r1.run_hash == r2.run_hash
        assert r1.outputs_hash == r2.outputs_hash
