"""A10: Risk Priority & Capital Allocator.

Resolves conflicts between hedge recommendations when capital/margin constrained.
Uses linear optimization (scipy.optimize.linprog) to maximize marginal risk reduction
subject to margin, liquidity, and cost constraints.

Pure computational -- when no constraints active (margin_budget=None),
passes through all hedge recommendations unchanged (v1 behavior preserved).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

try:
    from scipy.optimize import linprog  # type: ignore[import-untyped]
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


@dataclass
class HedgeCandidate:
    """Single hedge candidate for allocation."""

    bucket: str
    instrument: str
    notional_usd: float
    margin_required: float
    hedge_cost_bps: float
    liquidity_score: float
    marginal_risk_reduction: float  # risk reduced per dollar hedged
    priority: int = 0               # higher = more important

    def to_dict(self) -> dict:
        return {
            "bucket": self.bucket,
            "instrument": self.instrument,
            "notional_usd": self.notional_usd,
            "margin_required": self.margin_required,
            "hedge_cost_bps": self.hedge_cost_bps,
            "liquidity_score": self.liquidity_score,
            "marginal_risk_reduction": self.marginal_risk_reduction,
            "priority": self.priority,
            "selected": True,
        }


@dataclass
class AllocatedHedge:
    """Hedge after allocation (may be scaled down)."""

    bucket: str
    instrument: str
    original_notional_usd: float
    allocated_notional_usd: float
    allocation_pct: float
    margin_used: float
    hedge_cost_usd: float
    selected: bool

    def to_dict(self) -> dict:
        return {
            "bucket": self.bucket,
            "instrument": self.instrument,
            "original_notional_usd": self.original_notional_usd,
            "allocated_notional_usd": self.allocated_notional_usd,
            "allocation_pct": self.allocation_pct,
            "margin_used": self.margin_used,
            "hedge_cost_usd": self.hedge_cost_usd,
            "selected": self.selected,
        }


@dataclass
class AllocatorResult:
    """Result of capital allocation optimization."""

    hedges: list[AllocatedHedge] = field(default_factory=list)
    total_allocated_usd: float = 0.0
    total_margin_used: float = 0.0
    total_hedge_cost_usd: float = 0.0
    margin_budget_usd: float | None = None
    margin_utilization_pct: float = 0.0
    candidates_count: int = 0
    selected_count: int = 0
    constrained: bool = False
    optimization_method: str = "passthrough"

    def to_dict(self) -> dict:
        return {
            "hedges": [h.to_dict() for h in self.hedges],
            "total_allocated_usd": self.total_allocated_usd,
            "total_margin_used": self.total_margin_used,
            "total_hedge_cost_usd": self.total_hedge_cost_usd,
            "margin_budget_usd": self.margin_budget_usd,
            "margin_utilization_pct": self.margin_utilization_pct,
            "candidates_count": self.candidates_count,
            "selected_count": self.selected_count,
            "constrained": self.constrained,
            "optimization_method": self.optimization_method,
        }


def _build_candidates(
    hedge_actions: list[dict],
    margin_positions: list[dict],
    liquidity_estimates: list[dict],
    policy: dict[str, Any],
) -> list[HedgeCandidate]:
    """Build candidate list from kernel output + margin/liquidity data."""
    execution_product = policy.get("execution_product", "FWD")
    spread_bps = policy.get("cost_assumptions", {}).get("spread_bps", 5.0)

    # Index margin and liquidity by bucket
    margin_by_bucket = {m.get("bucket"): m for m in margin_positions}
    liquidity_by_bucket = {l.get("bucket"): l for l in liquidity_estimates}

    candidates: list[HedgeCandidate] = []
    for i, action in enumerate(hedge_actions):
        bucket = action.get("bucket", f"bucket_{i}")
        notional = abs(action.get("action_usd", 0.0))
        if notional < 1.0:
            continue

        margin_info = margin_by_bucket.get(bucket, {})
        liq_info = liquidity_by_bucket.get(bucket, {})

        margin_req = margin_info.get("initial_margin", notional * 0.03)
        liq_score = liq_info.get("liquidity_score", 1.0)
        slippage_bps = liq_info.get("slippage_bps", 0.0)

        # Marginal risk reduction: simplified as inverse of bucket index
        # In production, this would come from delta/VaR computation
        risk_reduction = notional * (1.0 - i * 0.05)

        candidates.append(HedgeCandidate(
            bucket=bucket,
            instrument=action.get("instrument", execution_product),
            notional_usd=notional,
            margin_required=margin_req,
            hedge_cost_bps=spread_bps + slippage_bps,
            liquidity_score=liq_score,
            marginal_risk_reduction=max(risk_reduction, 0.0),
            priority=len(hedge_actions) - i,
        ))

    return candidates


def allocate_hedges(
    hedge_actions: list[dict],
    margin_positions: list[dict],
    liquidity_estimates: list[dict],
    market: dict[str, Any],
    policy: dict[str, Any],
) -> AllocatorResult:
    """Optimize hedge allocation subject to margin/liquidity/cost constraints.

    When no constraints are active (margin_budget=None, max_hedge_cost_bps=None),
    passes through all hedge recommendations unchanged (v1 behavior preserved).

    Parameters
    ----------
    hedge_actions : list[dict]
        Per-bucket actions from kernel (action_usd, bucket, instrument).
    margin_positions : list[dict]
        Margin data per position from margin_model.
    liquidity_estimates : list[dict]
        Liquidity data per position from liquidity_model.
    market : dict
        ExtendedMarketSnapshot as dict.
    policy : dict
        ExtendedPolicyConfig as dict.

    Returns
    -------
    AllocatorResult
    """
    margin_budget = policy.get("margin_budget_usd")
    max_cost_bps = policy.get("max_hedge_cost_bps")
    min_liquidity = policy.get("min_liquidity_score", 0.0)

    candidates = _build_candidates(
        hedge_actions, margin_positions, liquidity_estimates, policy
    )

    if not candidates:
        return AllocatorResult(optimization_method="empty")

    # Check if any constraints are active
    is_constrained = (
        (margin_budget is not None and margin_budget > 0)
        or (max_cost_bps is not None and max_cost_bps > 0)
        or min_liquidity > 0
    )

    if not is_constrained:
        return _passthrough(candidates)

    # Filter by minimum liquidity
    eligible = [c for c in candidates if c.liquidity_score >= min_liquidity]
    excluded = [c for c in candidates if c.liquidity_score < min_liquidity]

    if not eligible:
        return _passthrough(candidates, note="all_below_liquidity_threshold")

    # Try LP optimization
    if HAS_SCIPY and margin_budget and margin_budget > 0:
        return _optimize_lp(eligible, excluded, margin_budget, max_cost_bps, policy)

    # Fallback: greedy allocation by priority
    return _greedy_allocate(eligible, excluded, margin_budget, max_cost_bps, policy)


def _passthrough(
    candidates: list[HedgeCandidate],
    note: str = "unconstrained",
) -> AllocatorResult:
    """Pass all candidates through without constraint (v1 behavior)."""
    hedges = []
    for c in candidates:
        cost_usd = c.notional_usd * (c.hedge_cost_bps / 10000.0)
        hedges.append(AllocatedHedge(
            bucket=c.bucket,
            instrument=c.instrument,
            original_notional_usd=c.notional_usd,
            allocated_notional_usd=c.notional_usd,
            allocation_pct=100.0,
            margin_used=c.margin_required,
            hedge_cost_usd=cost_usd,
            selected=True,
        ))

    total_alloc = sum(h.allocated_notional_usd for h in hedges)
    total_margin = sum(h.margin_used for h in hedges)
    total_cost = sum(h.hedge_cost_usd for h in hedges)

    return AllocatorResult(
        hedges=hedges,
        total_allocated_usd=total_alloc,
        total_margin_used=total_margin,
        total_hedge_cost_usd=total_cost,
        candidates_count=len(candidates),
        selected_count=len(hedges),
        constrained=False,
        optimization_method=f"passthrough_{note}",
    )


def _optimize_lp(
    eligible: list[HedgeCandidate],
    excluded: list[HedgeCandidate],
    margin_budget: float,
    max_cost_bps: float | None,
    policy: dict[str, Any],
) -> AllocatorResult:
    """Linear programming optimization.

    Maximize: ?(marginal_risk_reduction[i] ? x[i])
    Subject to: ?(margin[i] ? x[i]) <= margin_budget
                0 <= x[i] <= 1  (allocation fraction)
    """
    n = len(eligible)

    # Objective: maximize risk reduction -> minimize negative
    c = [-cand.marginal_risk_reduction for cand in eligible]

    # Constraint: margin <= budget
    A_ub = [[cand.margin_required for cand in eligible]]
    b_ub = [margin_budget]

    # Optional: cost constraint
    if max_cost_bps and max_cost_bps > 0:
        total_notional = sum(cand.notional_usd for cand in eligible)
        max_cost_usd = total_notional * (max_cost_bps / 10000.0)
        cost_row = [cand.notional_usd * (cand.hedge_cost_bps / 10000.0) for cand in eligible]
        A_ub.append(cost_row)
        b_ub.append(max_cost_usd)

    bounds = [(0.0, 1.0) for _ in range(n)]

    try:
        result = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method="highs")
        if result.success:
            allocations = result.x
        else:
            return _greedy_allocate(eligible, excluded, margin_budget, max_cost_bps, policy)
    except Exception:
        return _greedy_allocate(eligible, excluded, margin_budget, max_cost_bps, policy)

    hedges: list[AllocatedHedge] = []
    for i, cand in enumerate(eligible):
        alloc_frac = allocations[i]
        alloc_notional = cand.notional_usd * alloc_frac
        cost_usd = alloc_notional * (cand.hedge_cost_bps / 10000.0)

        hedges.append(AllocatedHedge(
            bucket=cand.bucket,
            instrument=cand.instrument,
            original_notional_usd=cand.notional_usd,
            allocated_notional_usd=alloc_notional,
            allocation_pct=alloc_frac * 100.0,
            margin_used=cand.margin_required * alloc_frac,
            hedge_cost_usd=cost_usd,
            selected=alloc_frac > 0.01,
        ))

    # Add excluded hedges as zero-allocated
    for cand in excluded:
        hedges.append(AllocatedHedge(
            bucket=cand.bucket,
            instrument=cand.instrument,
            original_notional_usd=cand.notional_usd,
            allocated_notional_usd=0.0,
            allocation_pct=0.0,
            margin_used=0.0,
            hedge_cost_usd=0.0,
            selected=False,
        ))

    total_alloc = sum(h.allocated_notional_usd for h in hedges)
    total_margin = sum(h.margin_used for h in hedges)
    total_cost = sum(h.hedge_cost_usd for h in hedges)
    selected = sum(1 for h in hedges if h.selected)

    return AllocatorResult(
        hedges=hedges,
        total_allocated_usd=total_alloc,
        total_margin_used=total_margin,
        total_hedge_cost_usd=total_cost,
        margin_budget_usd=margin_budget,
        margin_utilization_pct=(total_margin / margin_budget * 100.0) if margin_budget > 0 else 0.0,
        candidates_count=len(eligible) + len(excluded),
        selected_count=selected,
        constrained=True,
        optimization_method="linprog_highs",
    )


def _greedy_allocate(
    eligible: list[HedgeCandidate],
    excluded: list[HedgeCandidate],
    margin_budget: float | None,
    max_cost_bps: float | None,
    policy: dict[str, Any],
) -> AllocatorResult:
    """Greedy allocation: prioritize by marginal risk reduction."""
    sorted_candidates = sorted(eligible, key=lambda c: c.marginal_risk_reduction, reverse=True)

    budget_remaining = margin_budget if margin_budget else float("inf")
    hedges: list[AllocatedHedge] = []

    for cand in sorted_candidates:
        if cand.margin_required <= budget_remaining:
            alloc_frac = 1.0
        elif budget_remaining > 0:
            alloc_frac = budget_remaining / cand.margin_required
        else:
            alloc_frac = 0.0

        alloc_notional = cand.notional_usd * alloc_frac
        cost_usd = alloc_notional * (cand.hedge_cost_bps / 10000.0)
        margin_used = cand.margin_required * alloc_frac

        hedges.append(AllocatedHedge(
            bucket=cand.bucket,
            instrument=cand.instrument,
            original_notional_usd=cand.notional_usd,
            allocated_notional_usd=alloc_notional,
            allocation_pct=alloc_frac * 100.0,
            margin_used=margin_used,
            hedge_cost_usd=cost_usd,
            selected=alloc_frac > 0.01,
        ))

        budget_remaining -= margin_used

    # Add excluded
    for cand in excluded:
        hedges.append(AllocatedHedge(
            bucket=cand.bucket,
            instrument=cand.instrument,
            original_notional_usd=cand.notional_usd,
            allocated_notional_usd=0.0,
            allocation_pct=0.0,
            margin_used=0.0,
            hedge_cost_usd=0.0,
            selected=False,
        ))

    total_alloc = sum(h.allocated_notional_usd for h in hedges)
    total_margin = sum(h.margin_used for h in hedges)
    total_cost = sum(h.hedge_cost_usd for h in hedges)
    selected = sum(1 for h in hedges if h.selected)

    return AllocatorResult(
        hedges=hedges,
        total_allocated_usd=total_alloc,
        total_margin_used=total_margin,
        total_hedge_cost_usd=total_cost,
        margin_budget_usd=margin_budget,
        margin_utilization_pct=(total_margin / margin_budget * 100.0) if margin_budget and margin_budget > 0 else 0.0,
        candidates_count=len(eligible) + len(excluded),
        selected_count=selected,
        constrained=True,
        optimization_method="greedy_priority",
    )


# ──────────────────────────────────────────────────────────────────────────────
# RISK-01: Delta-VaR based MCTR
# Replaces simplified linear index decay for production use.
# Original allocate_hedges() is UNCHANGED.
# ──────────────────────────────────────────────────────────────────────────────

def compute_mctr_delta_var(
    positions: list,
    covariance_matrix: dict,
    confidence: float = 0.95,
) -> dict[str, float]:
    """Marginal Contribution to Risk using delta-VaR methodology.

    MCTR_i = (Σ × w)_i / sqrt(w' × Σ × w) × VaR_portfolio
    where VaR_portfolio = sqrt(w' Σ w) × z_α

    This replaces the simplified 5%-per-bucket-index decay in _build_candidates.

    Args:
        positions: List of objects with .id (str) and .weight (float).
        covariance_matrix: Dict keyed by (i, j) integer tuples → covariance.
        confidence: VaR confidence level. Default 0.95.

    Returns:
        Dict mapping position.id → MCTR float. Empty dict if positions empty.
    """
    n = len(positions)
    if n == 0:
        return {}

    try:
        from scipy.stats import norm  # type: ignore[import]
        z_alpha = norm.ppf(confidence)
    except ImportError:
        # scipy not available — use normal approximation table
        _z_table = {0.90: 1.282, 0.95: 1.645, 0.99: 2.326}
        z_alpha = _z_table.get(confidence, 1.645)

    # Build weight vector
    weights = [getattr(pos, "weight", 1.0 / n) for pos in positions]

    # Build covariance matrix from dict
    cov = [[covariance_matrix.get((i, j), 0.0) for j in range(n)] for i in range(n)]

    # Portfolio variance: w' Σ w
    portfolio_variance = 0.0
    for i in range(n):
        for j in range(n):
            portfolio_variance += weights[i] * cov[i][j] * weights[j]

    portfolio_vol = portfolio_variance ** 0.5
    portfolio_var = portfolio_vol * z_alpha

    if portfolio_vol < 1e-12:
        # Zero variance — all MCTRs are zero
        return {getattr(pos, "id", str(i)): 0.0 for i, pos in enumerate(positions)}

    # Sigma × w (matrix-vector product)
    sigma_w = [
        sum(cov[i][j] * weights[j] for j in range(n))
        for i in range(n)
    ]

    # MCTR_i = σ_w[i] / portfolio_vol × VaR_portfolio
    result: dict[str, float] = {}
    for i, pos in enumerate(positions):
        pos_id = getattr(pos, "id", str(i))
        beta_i = sigma_w[i] / portfolio_vol
        result[pos_id] = beta_i * portfolio_var

    return result
