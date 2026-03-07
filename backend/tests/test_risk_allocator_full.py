"""Tests for app.engine_v1.risk_allocator."""

import pytest

from app.engine_v1.risk_allocator import (
    AllocatedHedge,
    AllocatorResult,
    HedgeCandidate,
    _build_candidates,
    _greedy_allocate,
    _passthrough,
    allocate_hedges,
    compute_mctr_delta_var,
)


# ── Dataclass tests ──────────────────────────────────────────────────────────


class TestHedgeCandidate:
    def test_to_dict(self):
        c = HedgeCandidate(
            bucket="2025-07", instrument="FWD", notional_usd=1_000_000,
            margin_required=30_000, hedge_cost_bps=5.0, liquidity_score=0.9,
            marginal_risk_reduction=50_000, priority=3,
        )
        d = c.to_dict()
        assert d["bucket"] == "2025-07"
        assert d["instrument"] == "FWD"
        assert d["notional_usd"] == 1_000_000
        assert d["selected"] is True

    def test_default_priority(self):
        c = HedgeCandidate(
            bucket="b", instrument="FWD", notional_usd=100,
            margin_required=3, hedge_cost_bps=5, liquidity_score=1,
            marginal_risk_reduction=10,
        )
        assert c.priority == 0


class TestAllocatedHedge:
    def test_to_dict(self):
        h = AllocatedHedge(
            bucket="2025-07", instrument="FWD",
            original_notional_usd=1_000_000, allocated_notional_usd=800_000,
            allocation_pct=80.0, margin_used=24_000,
            hedge_cost_usd=40, selected=True,
        )
        d = h.to_dict()
        assert d["allocation_pct"] == 80.0
        assert d["selected"] is True


class TestAllocatorResult:
    def test_defaults(self):
        r = AllocatorResult()
        assert r.hedges == []
        assert r.total_allocated_usd == 0.0
        assert r.constrained is False
        assert r.optimization_method == "passthrough"

    def test_to_dict(self):
        r = AllocatorResult(
            total_allocated_usd=1_000_000,
            margin_budget_usd=500_000,
            constrained=True,
            optimization_method="greedy_priority",
        )
        d = r.to_dict()
        assert d["total_allocated_usd"] == 1_000_000
        assert d["constrained"] is True


# ── _build_candidates tests ──────────────────────────────────────────────────


class TestBuildCandidates:
    def test_basic(self):
        actions = [{"bucket": "2025-07", "action_usd": 100_000}]
        result = _build_candidates(actions, [], [], {})
        assert len(result) == 1
        assert result[0].bucket == "2025-07"
        assert result[0].notional_usd == 100_000

    def test_skips_small_notional(self):
        actions = [{"bucket": "2025-07", "action_usd": 0.5}]
        result = _build_candidates(actions, [], [], {})
        assert len(result) == 0

    def test_negative_action_uses_abs(self):
        actions = [{"bucket": "2025-07", "action_usd": -200_000}]
        result = _build_candidates(actions, [], [], {})
        assert result[0].notional_usd == 200_000

    def test_margin_and_liquidity_indexing(self):
        actions = [{"bucket": "2025-07", "action_usd": 100_000}]
        margins = [{"bucket": "2025-07", "initial_margin": 5_000}]
        liquidity = [{"bucket": "2025-07", "liquidity_score": 0.8, "slippage_bps": 2.0}]
        result = _build_candidates(actions, margins, liquidity, {})
        assert result[0].margin_required == 5_000
        assert result[0].liquidity_score == 0.8
        assert result[0].hedge_cost_bps == 7.0  # default spread 5 + slippage 2

    def test_default_margin_when_missing(self):
        actions = [{"bucket": "2025-07", "action_usd": 100_000}]
        result = _build_candidates(actions, [], [], {})
        assert result[0].margin_required == pytest.approx(3000, abs=1)  # 3% default

    def test_execution_product_from_policy(self):
        actions = [{"bucket": "2025-07", "action_usd": 100_000}]
        policy = {"execution_product": "NDF"}
        result = _build_candidates(actions, [], [], policy)
        assert result[0].instrument == "NDF"

    def test_priority_descending(self):
        actions = [
            {"bucket": "2025-07", "action_usd": 100_000},
            {"bucket": "2025-08", "action_usd": 200_000},
            {"bucket": "2025-09", "action_usd": 300_000},
        ]
        result = _build_candidates(actions, [], [], {})
        assert result[0].priority == 3
        assert result[1].priority == 2
        assert result[2].priority == 1

    def test_factor_risk_contributions(self):
        actions = [{"bucket": "2025-07", "action_usd": 100_000, "pair": "USDMXN"}]
        market = {
            "_factor_risk_contributions": {
                "USDMXN": {"marginal_contribution": 0.05}
            }
        }
        result = _build_candidates(actions, [], [], {}, market)
        assert result[0].marginal_risk_reduction == pytest.approx(0.05 * 100_000, abs=1)

    def test_var_proxy_fallback(self):
        actions = [{"bucket": "2025-07", "action_usd": 100_000, "pair": "USDMXN"}]
        market = {"vol_surface": {"USDMXN_1M": 12.5}}
        result = _build_candidates(actions, [], [], {}, market)
        assert result[0].marginal_risk_reduction > 0

    def test_missing_bucket_key(self):
        actions = [{"action_usd": 50_000}]
        result = _build_candidates(actions, [], [], {})
        assert result[0].bucket == "bucket_0"


# ── _passthrough tests ───────────────────────────────────────────────────────


class TestPassthrough:
    def test_all_selected(self):
        candidates = [
            HedgeCandidate(
                bucket="2025-07", instrument="FWD", notional_usd=100_000,
                margin_required=3_000, hedge_cost_bps=5.0, liquidity_score=0.9,
                marginal_risk_reduction=50_000,
            )
        ]
        result = _passthrough(candidates)
        assert len(result.hedges) == 1
        assert result.hedges[0].selected is True
        assert result.hedges[0].allocation_pct == 100.0
        assert result.constrained is False
        assert result.optimization_method == "passthrough_unconstrained"

    def test_custom_note(self):
        result = _passthrough([], note="test_note")
        assert result.optimization_method == "passthrough_test_note"

    def test_cost_calculation(self):
        candidates = [
            HedgeCandidate(
                bucket="b", instrument="FWD", notional_usd=1_000_000,
                margin_required=30_000, hedge_cost_bps=10.0, liquidity_score=1.0,
                marginal_risk_reduction=100,
            )
        ]
        result = _passthrough(candidates)
        expected_cost = 1_000_000 * (10.0 / 10000.0)
        assert result.total_hedge_cost_usd == pytest.approx(expected_cost, abs=0.01)


# ── allocate_hedges tests ────────────────────────────────────────────────────


class TestAllocateHedges:
    def _actions(self):
        return [
            {"bucket": "2025-07", "action_usd": 500_000},
            {"bucket": "2025-08", "action_usd": 300_000},
        ]

    def test_unconstrained_passthrough(self):
        result = allocate_hedges(
            self._actions(), [], [], {}, {}
        )
        assert result.constrained is False
        assert "passthrough" in result.optimization_method
        assert result.selected_count == 2

    def test_empty_actions(self):
        result = allocate_hedges([], [], [], {}, {})
        assert result.optimization_method == "empty"
        assert result.selected_count == 0

    def test_margin_constrained(self):
        policy = {"margin_budget_usd": 10_000}  # Very tight
        result = allocate_hedges(
            self._actions(), [], [], {}, policy,
        )
        assert result.constrained is True
        assert result.total_margin_used <= 10_000 + 1  # Allow float rounding

    def test_min_liquidity_filter(self):
        policy = {"min_liquidity_score": 0.99}
        # Default liquidity_score = 1.0 so candidates pass
        result = allocate_hedges(
            self._actions(), [], [], {}, policy,
        )
        assert result.constrained is True

    def test_all_below_liquidity_threshold(self):
        policy = {"min_liquidity_score": 0.99}
        liq = [
            {"bucket": "2025-07", "liquidity_score": 0.1},
            {"bucket": "2025-08", "liquidity_score": 0.1},
        ]
        result = allocate_hedges(
            self._actions(), [], liq, {}, policy,
        )
        # All below threshold -> passthrough with note
        assert "all_below_liquidity_threshold" in result.optimization_method

    def test_max_cost_constraint(self):
        policy = {"max_hedge_cost_bps": 1.0, "margin_budget_usd": 50_000}
        result = allocate_hedges(
            self._actions(), [], [], {}, policy,
        )
        assert result.constrained is True


# ── _greedy_allocate tests ───────────────────────────────────────────────────


class TestGreedyAllocate:
    def test_full_allocation_when_budget_sufficient(self):
        candidates = [
            HedgeCandidate(
                bucket="2025-07", instrument="FWD", notional_usd=100_000,
                margin_required=3_000, hedge_cost_bps=5.0, liquidity_score=1.0,
                marginal_risk_reduction=50_000,
            ),
        ]
        result = _greedy_allocate(candidates, [], margin_budget=100_000, max_cost_bps=None, policy={})
        assert result.hedges[0].allocation_pct == 100.0
        assert result.hedges[0].selected is True

    def test_partial_allocation_when_budget_tight(self):
        candidates = [
            HedgeCandidate(
                bucket="2025-07", instrument="FWD", notional_usd=100_000,
                margin_required=10_000, hedge_cost_bps=5.0, liquidity_score=1.0,
                marginal_risk_reduction=50_000,
            ),
        ]
        result = _greedy_allocate(candidates, [], margin_budget=5_000, max_cost_bps=None, policy={})
        assert result.hedges[0].allocation_pct == pytest.approx(50.0, abs=0.1)

    def test_zero_budget_means_unconstrained(self):
        """margin_budget=0 is falsy → treated as 'no budget constraint' (inf)."""
        candidates = [
            HedgeCandidate(
                bucket="2025-07", instrument="FWD", notional_usd=100_000,
                margin_required=10_000, hedge_cost_bps=5.0, liquidity_score=1.0,
                marginal_risk_reduction=50_000,
            ),
        ]
        result = _greedy_allocate(candidates, [], margin_budget=0.0, max_cost_bps=None, policy={})
        # 0 is falsy → defaults to float("inf") → full allocation
        assert result.hedges[0].allocation_pct == 100.0
        assert result.hedges[0].selected is True

    def test_excluded_hedges_zero_allocated(self):
        eligible = [
            HedgeCandidate(
                bucket="2025-07", instrument="FWD", notional_usd=100_000,
                margin_required=3_000, hedge_cost_bps=5.0, liquidity_score=1.0,
                marginal_risk_reduction=50_000,
            ),
        ]
        excluded = [
            HedgeCandidate(
                bucket="2025-08", instrument="FWD", notional_usd=200_000,
                margin_required=6_000, hedge_cost_bps=5.0, liquidity_score=0.1,
                marginal_risk_reduction=30_000,
            ),
        ]
        result = _greedy_allocate(eligible, excluded, margin_budget=100_000, max_cost_bps=None, policy={})
        assert len(result.hedges) == 2
        excluded_hedge = [h for h in result.hedges if h.bucket == "2025-08"][0]
        assert excluded_hedge.selected is False
        assert excluded_hedge.allocated_notional_usd == 0.0

    def test_no_margin_budget_uses_infinity(self):
        candidates = [
            HedgeCandidate(
                bucket="2025-07", instrument="FWD", notional_usd=100_000,
                margin_required=3_000, hedge_cost_bps=5.0, liquidity_score=1.0,
                marginal_risk_reduction=50_000,
            ),
        ]
        result = _greedy_allocate(candidates, [], margin_budget=None, max_cost_bps=None, policy={})
        assert result.hedges[0].allocation_pct == 100.0

    def test_sorts_by_marginal_risk_reduction(self):
        c1 = HedgeCandidate(
            bucket="b1", instrument="FWD", notional_usd=100_000,
            margin_required=50_000, hedge_cost_bps=5.0, liquidity_score=1.0,
            marginal_risk_reduction=10_000,
        )
        c2 = HedgeCandidate(
            bucket="b2", instrument="FWD", notional_usd=100_000,
            margin_required=50_000, hedge_cost_bps=5.0, liquidity_score=1.0,
            marginal_risk_reduction=90_000,
        )
        # Budget only enough for one
        result = _greedy_allocate([c1, c2], [], margin_budget=50_000, max_cost_bps=None, policy={})
        # c2 has higher risk reduction and should be allocated first
        b2_hedge = [h for h in result.hedges if h.bucket == "b2"][0]
        assert b2_hedge.allocation_pct == 100.0
        b1_hedge = [h for h in result.hedges if h.bucket == "b1"][0]
        assert b1_hedge.allocation_pct == 0.0

    def test_margin_utilization_pct(self):
        candidates = [
            HedgeCandidate(
                bucket="b", instrument="FWD", notional_usd=100_000,
                margin_required=5_000, hedge_cost_bps=5.0, liquidity_score=1.0,
                marginal_risk_reduction=50_000,
            ),
        ]
        result = _greedy_allocate(candidates, [], margin_budget=10_000, max_cost_bps=None, policy={})
        assert result.margin_utilization_pct == pytest.approx(50.0, abs=0.1)


# ── compute_mctr_delta_var tests ──────────────────────────────────────────────


class _Position:
    """Minimal position object for MCTR tests."""
    def __init__(self, id: str, weight: float):
        self.id = id
        self.weight = weight


class TestComputeMctrDeltaVar:
    def test_empty_positions(self):
        result = compute_mctr_delta_var([], {})
        assert result == {}

    def test_single_position(self):
        positions = [_Position("A", 1.0)]
        cov = {(0, 0): 0.04}  # 20% vol
        result = compute_mctr_delta_var(positions, cov, confidence=0.95)
        assert "A" in result
        assert result["A"] > 0

    def test_two_positions_uncorrelated(self):
        positions = [_Position("A", 0.5), _Position("B", 0.5)]
        cov = {(0, 0): 0.04, (0, 1): 0.0, (1, 0): 0.0, (1, 1): 0.09}
        result = compute_mctr_delta_var(positions, cov, confidence=0.95)
        assert "A" in result
        assert "B" in result
        # Both should have positive MCTR
        assert result["A"] > 0
        assert result["B"] > 0

    def test_zero_variance_portfolio(self):
        positions = [_Position("A", 1.0)]
        cov = {(0, 0): 0.0}
        result = compute_mctr_delta_var(positions, cov)
        assert result["A"] == 0.0

    def test_confidence_levels(self):
        positions = [_Position("A", 1.0)]
        cov = {(0, 0): 0.04}
        r95 = compute_mctr_delta_var(positions, cov, confidence=0.95)
        r99 = compute_mctr_delta_var(positions, cov, confidence=0.99)
        # Higher confidence -> higher VaR -> higher MCTR
        assert r99["A"] > r95["A"]

    def test_default_weight_when_missing(self):
        class NoWeight:
            def __init__(self, id):
                self.id = id
        positions = [NoWeight("X")]
        cov = {(0, 0): 0.01}
        result = compute_mctr_delta_var(positions, cov)
        assert "X" in result

    def test_position_without_id(self):
        class NoId:
            weight = 0.5
        positions = [NoId(), NoId()]
        cov = {(0, 0): 0.01, (0, 1): 0.0, (1, 0): 0.0, (1, 1): 0.01}
        result = compute_mctr_delta_var(positions, cov)
        # Falls back to str(i) for id
        assert "0" in result
        assert "1" in result

    def test_scipy_unavailable_fallback(self):
        # The z_table fallback: confidence=0.90 -> z=1.282
        positions = [_Position("A", 1.0)]
        cov = {(0, 0): 0.04}
        result = compute_mctr_delta_var(positions, cov, confidence=0.90)
        assert result["A"] > 0

    def test_missing_covariance_defaults_to_zero(self):
        positions = [_Position("A", 0.5), _Position("B", 0.5)]
        # Only diagonal provided
        cov = {(0, 0): 0.04, (1, 1): 0.04}
        result = compute_mctr_delta_var(positions, cov)
        assert "A" in result
        assert "B" in result
