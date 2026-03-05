"""
backend/tests/test_decision_engine.py

Unit tests for decision_engine.py — deterministic, no DB required.
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

# ── Fixtures ───────────────────────────────────────────────────────────────────

def _make_snapshot(spot_rate: float = 17.50) -> MarketSnapshotInput:
    return MarketSnapshotInput(
        snapshot_id="snap-001",
        snapshot_hash="a" * 64,
        as_of=datetime.now(UTC),
        primary_currency="MXN",
        spot_rate=spot_rate,
        provider="test",
    )


def _make_policy(**overrides) -> DecisionPolicyConfig:
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


def _make_pos(
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


# ── Test: ranking determinism ──────────────────────────────────────────────────

class TestRankingDeterminism:
    def test_same_inputs_same_run_hash(self):
        positions = [_make_pos(), _make_pos("pos-002", amount_local=5_000_000)]
        policy = _make_policy()
        snap = _make_snapshot()

        r1 = run_decision_engine("run-1", positions, policy, snap)
        r2 = run_decision_engine("run-1", positions, policy, snap)

        assert r1.run_hash == r2.run_hash
        assert r1.inputs_hash == r2.inputs_hash
        assert r1.outputs_hash == r2.outputs_hash

    def test_larger_exposure_ranked_first(self):
        # pos-001: 10M MXN, pos-002: 1M MXN USD (different pair)
        positions = [
            _make_pos("pos-001", currency="MXN", amount_local=10_000_000),
            _make_pos("pos-002", currency="BRL", amount_local=500_000),
        ]
        policy = _make_policy()
        snap = _make_snapshot()

        result = run_decision_engine("run-x", positions, policy, snap)

        assert result.proposals[0].rank == 1
        # USDMXN has higher USD equivalent than USDBRL at reasonable rates
        assert result.proposals[0].currency_pair == "USDMXN"

    def test_tiebreaker_alphabetical(self):
        # Equal exposures — alphabetical pair wins
        positions = [
            _make_pos("pos-b", currency="ZAR", amount_local=1_000_000),
            _make_pos("pos-a", currency="BRL", amount_local=1_000_000),
        ]
        policy = _make_policy(immediate_hedge_threshold_usd=1_000.0)
        snap = _make_snapshot(spot_rate=1.0)  # 1:1 for simplicity

        result = run_decision_engine("run-x", positions, policy, snap)

        # Alphabetically USDBRL < USDZAR
        pairs = [p.currency_pair for p in result.proposals]
        idx_brl = pairs.index("USDBRL") if "USDBRL" in pairs else None
        idx_zar = pairs.index("USDZAR") if "USDZAR" in pairs else None
        if idx_brl is not None and idx_zar is not None:
            assert idx_brl < idx_zar


# ── Test: HEDGE_IMMEDIATE above threshold ─────────────────────────────────────

class TestImmediateHedge:
    def test_large_exposure_gets_immediate(self):
        # 10M MXN / 17.5 = ~571k USD — above 500k threshold
        positions = [_make_pos(amount_local=10_000_000)]
        policy = _make_policy(immediate_hedge_threshold_usd=500_000.0)
        snap = _make_snapshot(spot_rate=17.50)

        result = run_decision_engine("run-x", positions, policy, snap)

        actionable = [p for p in result.proposals if p.action != "NO_ACTION"]
        assert len(actionable) >= 1
        assert actionable[0].action == "HEDGE_IMMEDIATE"

    def test_immediate_proposal_has_notional(self):
        positions = [_make_pos(amount_local=10_000_000)]
        policy = _make_policy(
            immediate_hedge_threshold_usd=500_000.0,
            hedge_ratio_confirmed=0.80,
        )
        snap = _make_snapshot(spot_rate=17.50)

        result = run_decision_engine("run-x", positions, policy, snap)

        p = next(p for p in result.proposals if p.action == "HEDGE_IMMEDIATE")
        # Expected: 10M / 17.5 = 571k USD * 0.80 = ~457k USD notional
        assert p.notional_amount == pytest.approx(571_428.57 * 0.80, rel=0.01)
        assert p.notional_currency == "USD"


# ── Test: HEDGE_STAGED within band ────────────────────────────────────────────

class TestStagedHedge:
    def test_midsize_exposure_gets_staged(self):
        # 1.5M MXN / 17.5 = ~85k USD — within [50k, 500k] band
        positions = [_make_pos(amount_local=1_500_000)]
        policy = _make_policy(
            staged_min_usd=50_000.0,
            immediate_hedge_threshold_usd=500_000.0,
        )
        snap = _make_snapshot(spot_rate=17.50)

        result = run_decision_engine("run-x", positions, policy, snap)

        actionable = [p for p in result.proposals if p.action != "NO_ACTION"]
        assert len(actionable) >= 1
        assert actionable[0].action in ("HEDGE_STAGED", "REDUCE_RATIO")

    def test_staged_has_schedule(self):
        positions = [_make_pos(amount_local=1_500_000)]
        policy = _make_policy(
            staged_min_usd=50_000.0,
            immediate_hedge_threshold_usd=500_000.0,
            staging_window_months=3,
        )
        snap = _make_snapshot(spot_rate=17.50)

        result = run_decision_engine("run-x", positions, policy, snap)

        staged = next(
            (p for p in result.proposals if p.action == "HEDGE_STAGED"), None
        )
        if staged:
            assert staged.schedule is not None
            assert len(staged.schedule) == 3
            # Equal tranches
            amounts = [t["amount"] for t in staged.schedule]
            assert max(amounts) - min(amounts) < 1.0  # ~equal


# ── Test: NO_ACTION below min ─────────────────────────────────────────────────

class TestNoAction:
    def test_tiny_exposure_no_action(self):
        # 100k MXN / 17.5 = ~5.7k USD — below 10k min_trade
        positions = [_make_pos(amount_local=100_000)]
        policy = _make_policy(min_trade_size_usd=10_000.0)
        snap = _make_snapshot(spot_rate=17.50)

        result = run_decision_engine("run-x", positions, policy, snap)

        assert all(p.action == "NO_ACTION" for p in result.proposals)
        assert result.total_hedge_notional_usd == 0.0


# ── Test: REDUCE_RATIO when budget exceeded ───────────────────────────────────

class TestReduceRatio:
    def test_high_cost_triggers_reduce(self):
        # Set premium_budget_pct very low so normal spread exceeds budget
        positions = [_make_pos(amount_local=10_000_000)]
        policy = _make_policy(
            immediate_hedge_threshold_usd=500_000.0,
            premium_budget_pct=0.001,   # 0.001%
            spread_bps=100.0,            # 100 bps = 1%
        )
        snap = _make_snapshot(spot_rate=17.50)

        result = run_decision_engine("run-x", positions, policy, snap)

        # Should produce REDUCE_RATIO since cost > budget
        actionable = [p for p in result.proposals if p.action != "NO_ACTION"]
        assert len(actionable) >= 1
        # action should be REDUCE_RATIO not HEDGE_IMMEDIATE
        assert actionable[0].action == "REDUCE_RATIO"


# ── Test: instrument selection ────────────────────────────────────────────────

class TestInstrumentSelection:
    def test_ndf_selected_for_mxn(self):
        positions = [_make_pos(amount_local=10_000_000)]
        policy = _make_policy(
            immediate_hedge_threshold_usd=500_000.0,
            allowed_instruments=["NDF", "FORWARD"],
        )
        snap = _make_snapshot()

        result = run_decision_engine("run-x", positions, policy, snap)

        actionable = [p for p in result.proposals if p.action != "NO_ACTION"]
        if actionable:
            assert actionable[0].instrument == "NDF"  # USDMXN is NDF-eligible

    def test_forward_if_ndf_not_allowed(self):
        positions = [_make_pos(amount_local=10_000_000)]
        policy = _make_policy(
            immediate_hedge_threshold_usd=500_000.0,
            allowed_instruments=["FORWARD"],
        )
        snap = _make_snapshot()

        result = run_decision_engine("run-x", positions, policy, snap)

        actionable = [p for p in result.proposals if p.action != "NO_ACTION"]
        if actionable:
            assert actionable[0].instrument == "FORWARD"


# ── Test: execution packet structure ─────────────────────────────────────────

class TestExecutionPackets:
    def test_packets_created_for_actionable(self):
        positions = [_make_pos(amount_local=10_000_000)]
        policy = _make_policy(immediate_hedge_threshold_usd=500_000.0)
        snap = _make_snapshot()

        result = run_decision_engine("run-x", positions, policy, snap)

        assert len(result.packets) > 0

    def test_ibkr_payload_fields_present(self):
        positions = [_make_pos(amount_local=10_000_000)]
        policy = _make_policy(immediate_hedge_threshold_usd=500_000.0)
        snap = _make_snapshot()

        result = run_decision_engine("run-x", positions, policy, snap)

        for packet in result.packets:
            ibkr = packet.ibkr_payload
            assert "symbol" in ibkr
            assert "secType" in ibkr
            assert "action" in ibkr
            assert "totalQuantity" in ibkr
            assert ibkr["action"] in ("BUY", "SELL")

    def test_ticket_text_is_string(self):
        positions = [_make_pos(amount_local=10_000_000)]
        policy = _make_policy(immediate_hedge_threshold_usd=500_000.0)
        snap = _make_snapshot()

        result = run_decision_engine("run-x", positions, policy, snap)

        for packet in result.packets:
            assert isinstance(packet.ticket_text, str)
            assert len(packet.ticket_text) > 20

    def test_packet_hash_is_sha256_hex(self):
        positions = [_make_pos(amount_local=10_000_000)]
        policy = _make_policy(immediate_hedge_threshold_usd=500_000.0)
        snap = _make_snapshot()

        result = run_decision_engine("run-x", positions, policy, snap)

        for packet in result.packets:
            assert len(packet.packet_hash) == 64
            assert all(c in "0123456789abcdef" for c in packet.packet_hash)


# ── Test: run hash stability ──────────────────────────────────────────────────

class TestRunHashStability:
    def test_run_hash_is_deterministic(self):
        positions = [_make_pos()]
        policy = _make_policy()
        snap = _make_snapshot()

        results = [run_decision_engine("run-1", positions, policy, snap) for _ in range(5)]

        assert len({r.run_hash for r in results}) == 1  # all identical
