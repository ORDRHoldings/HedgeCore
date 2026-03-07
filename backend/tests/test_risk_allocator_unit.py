"""Tests for app.engine_v1.risk_allocator."""

import pytest

from app.engine_v1.risk_allocator import (
    HedgeCandidate,
    AllocatedHedge,
    AllocatorResult,
    allocate_hedges,
    _passthrough,
    _build_candidates,
    _greedy_allocate,
    compute_mctr_delta_var,
)


# ---------------------------------------------------------------------------
# Dataclass serialization
# ---------------------------------------------------------------------------

class TestHedgeCandidateToDict:
    def test_to_dict(self):
        c = HedgeCandidate(
            bucket="2026-03", instrument="FWD", notional_usd=1_000_000,
            margin_required=30_000, hedge_cost_bps=5.0, liquidity_score=0.9,
            marginal_risk_reduction=50_000, priority=1,
        )
        d = c.to_dict()
        assert d["bucket"] == "2026-03"
        assert d["selected"] is True


class TestAllocatedHedgeToDict:
    def test_to_dict(self):
        h = AllocatedHedge(
            bucket="2026-03", instrument="FWD",
            original_notional_usd=1_000_000, allocated_notional_usd=800_000,
            allocation_pct=80.0, margin_used=24_000, hedge_cost_usd=40,
            selected=True,
        )
        d = h.to_dict()
        assert d["allocation_pct"] == 80.0


class TestAllocatorResultToDict:
    def test_to_dict_empty(self):
        r = AllocatorResult()
        d = r.to_dict()
        assert d["hedges"] == []
        assert d["optimization_method"] == "passthrough"


# ---------------------------------------------------------------------------
# _passthrough
# ---------------------------------------------------------------------------

class TestPassthrough:
    def test_all_candidates_selected(self):
        candidates = [
            HedgeCandidate("2026-03", "FWD", 1_000_000, 30_000, 5.0, 0.9, 50_000, 1),
            HedgeCandidate("2026-06", "FWD", 500_000, 15_000, 5.0, 0.8, 25_000, 2),
        ]
        result = _passthrough(candidates)
        assert result.constrained is False
        assert result.selected_count == 2
        assert result.candidates_count == 2
        assert all(h.selected for h in result.hedges)
        assert all(h.allocation_pct == 100.0 for h in result.hedges)

    def test_total_allocated_matches_sum(self):
        candidates = [
            HedgeCandidate("2026-03", "FWD", 1_000_000, 30_000, 5.0, 0.9, 50_000, 1),
        ]
        result = _passthrough(candidates)
        assert result.total_allocated_usd == 1_000_000

    def test_hedge_cost_calculated(self):
        # 5 bps on 1M = 500
        candidates = [
            HedgeCandidate("2026-03", "FWD", 1_000_000, 30_000, 5.0, 0.9, 50_000, 1),
        ]
        result = _passthrough(candidates)
        assert result.total_hedge_cost_usd == pytest.approx(500.0)


# ---------------------------------------------------------------------------
# _build_candidates
# ---------------------------------------------------------------------------

class TestBuildCandidates:
    def test_skips_zero_notional(self):
        actions = [{"bucket": "2026-03", "action_usd": 0.5}]
        result = _build_candidates(actions, [], [], {})
        assert len(result) == 0

    def test_builds_candidate_from_action(self):
        actions = [{"bucket": "2026-03", "action_usd": 100_000}]
        margins = [{"bucket": "2026-03", "initial_margin": 3_000}]
        liquidity = [{"bucket": "2026-03", "liquidity_score": 0.8, "slippage_bps": 2.0}]
        policy = {"execution_product": "FWD", "cost_assumptions": {"spread_bps": 5.0}}
        result = _build_candidates(actions, margins, liquidity, policy)
        assert len(result) == 1
        assert result[0].bucket == "2026-03"
        assert result[0].notional_usd == 100_000
        assert result[0].margin_required == 3_000
        assert result[0].hedge_cost_bps == 7.0  # 5 spread + 2 slippage

    def test_negative_action_usd_uses_absolute_value(self):
        actions = [{"bucket": "2026-03", "action_usd": -200_000}]
        result = _build_candidates(actions, [], [], {})
        assert result[0].notional_usd == 200_000

    def test_priority_descending(self):
        actions = [
            {"bucket": "2026-03", "action_usd": 100_000},
            {"bucket": "2026-06", "action_usd": 200_000},
        ]
        result = _build_candidates(actions, [], [], {})
        assert result[0].priority > result[1].priority


# ---------------------------------------------------------------------------
# allocate_hedges
# ---------------------------------------------------------------------------

class TestAllocateHedges:
    def test_unconstrained_passthrough(self):
        actions = [{"bucket": "2026-03", "action_usd": 100_000}]
        policy = {}
        result = allocate_hedges(actions, [], [], {}, policy)
        assert "passthrough" in result.optimization_method
        assert result.constrained is False

    def test_empty_actions_returns_empty(self):
        result = allocate_hedges([], [], [], {}, {})
        assert result.optimization_method == "empty"
        assert result.hedges == []

    def test_margin_budget_activates_constraint(self):
        actions = [
            {"bucket": "2026-03", "action_usd": 1_000_000},
            {"bucket": "2026-06", "action_usd": 1_000_000},
        ]
        margins = [
            {"bucket": "2026-03", "initial_margin": 50_000},
            {"bucket": "2026-06", "initial_margin": 50_000},
        ]
        policy = {"margin_budget_usd": 60_000}  # Can only fit ~1 of 2
        result = allocate_hedges(actions, margins, [], {}, policy)
        assert result.constrained is True
        assert result.total_margin_used <= 60_000 + 1  # small float tolerance

    def test_liquidity_filter(self):
        actions = [
            {"bucket": "2026-03", "action_usd": 100_000},
            {"bucket": "2026-06", "action_usd": 100_000},
        ]
        liquidity = [
            {"bucket": "2026-03", "liquidity_score": 0.9, "slippage_bps": 1.0},
            {"bucket": "2026-06", "liquidity_score": 0.1, "slippage_bps": 10.0},
        ]
        policy = {"min_liquidity_score": 0.5}
        result = allocate_hedges(actions, [], liquidity, {}, policy)
        assert result.constrained is True


# ---------------------------------------------------------------------------
# _greedy_allocate
# ---------------------------------------------------------------------------

class TestGreedyAllocate:
    def test_partial_allocation_when_budget_tight(self):
        candidates = [
            HedgeCandidate("2026-03", "FWD", 1_000_000, 50_000, 5.0, 1.0, 100_000, 1),
            HedgeCandidate("2026-06", "FWD", 1_000_000, 50_000, 5.0, 1.0, 50_000, 2),
        ]
        result = _greedy_allocate(candidates, [], 70_000, None, {})
        assert result.constrained is True
        # First candidate (higher risk_reduction) fully allocated: 50k margin
        # Second: 20k/50k = 40% partial
        selected = [h for h in result.hedges if h.selected]
        assert len(selected) == 2  # Both get some allocation

    def test_zero_budget_means_unconstrained(self):
        """margin_budget=0 is falsy → treated as 'no budget constraint' (inf)."""
        candidates = [
            HedgeCandidate("2026-03", "FWD", 1_000_000, 50_000, 5.0, 1.0, 100_000, 1),
        ]
        result = _greedy_allocate(candidates, [], 0, None, {})
        # 0 is falsy → defaults to float("inf") → full allocation
        assert result.total_allocated_usd == 1_000_000.0

    def test_excluded_added_with_zero_allocation(self):
        eligible = [
            HedgeCandidate("2026-03", "FWD", 100_000, 3_000, 5.0, 1.0, 50_000, 1),
        ]
        excluded = [
            HedgeCandidate("2026-06", "FWD", 200_000, 6_000, 5.0, 0.1, 30_000, 2),
        ]
        result = _greedy_allocate(eligible, excluded, None, None, {})
        assert len(result.hedges) == 2
        excluded_hedge = [h for h in result.hedges if h.bucket == "2026-06"][0]
        assert excluded_hedge.selected is False
        assert excluded_hedge.allocated_notional_usd == 0.0


# ---------------------------------------------------------------------------
# compute_mctr_delta_var
# ---------------------------------------------------------------------------

class _MockPos:
    def __init__(self, id: str, weight: float):
        self.id = id
        self.weight = weight


class TestComputeMctrDeltaVar:
    def test_empty_positions(self):
        result = compute_mctr_delta_var([], {})
        assert result == {}

    def test_single_position(self):
        positions = [_MockPos("A", 1.0)]
        cov = {(0, 0): 0.04}  # 20% vol
        result = compute_mctr_delta_var(positions, cov)
        assert "A" in result
        assert result["A"] > 0

    def test_two_positions(self):
        positions = [_MockPos("A", 0.5), _MockPos("B", 0.5)]
        cov = {
            (0, 0): 0.04, (0, 1): 0.01,
            (1, 0): 0.01, (1, 1): 0.09,
        }
        result = compute_mctr_delta_var(positions, cov)
        assert "A" in result
        assert "B" in result
        # B has higher variance, should have higher MCTR
        assert result["B"] > result["A"]

    def test_zero_covariance(self):
        positions = [_MockPos("A", 1.0)]
        cov = {(0, 0): 0.0}
        result = compute_mctr_delta_var(positions, cov)
        assert result["A"] == 0.0

    def test_custom_confidence(self):
        positions = [_MockPos("A", 1.0)]
        cov = {(0, 0): 0.04}
        result_95 = compute_mctr_delta_var(positions, cov, confidence=0.95)
        result_99 = compute_mctr_delta_var(positions, cov, confidence=0.99)
        assert result_99["A"] > result_95["A"]
