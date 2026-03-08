"""engine_v1/backtesting.py — Policy backtesting / historical validation engine

Pure deterministic module for validating hedge policy recommendations
against historical market data. No ML, no auto-learning.

Supports:
  - Snapshot-bound replay: re-evaluate policy decisions against historical snapshots
  - Policy comparison: compare two policies against same historical data
  - Institutional validation outputs: effectiveness, slippage, cost analysis

Architecture: ADR-0004, Layer 5 extension.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any


# ─────────────────────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class HistoricalPeriod:
    """A single historical period for backtesting."""
    period_id: str        # e.g., "2025-01" for monthly
    spot_rate: float
    forward_points: dict[str, float]  # bucket → points
    realized_vol: float | None = None
    geo_score: float | None = None


@dataclass(frozen=True)
class BacktestResult:
    """Result of a single-period backtest evaluation."""
    period_id: str
    hedged_pnl_usd: float
    unhedged_pnl_usd: float
    hedge_effectiveness: float  # (unhedged - hedged) / unhedged if applicable
    cost_bps: float
    forward_rate_used: float
    spot_at_maturity: float
    hedge_ratio_applied: float
    notional_hedged_usd: float


@dataclass
class BacktestReport:
    """Aggregate backtesting report across multiple periods."""
    policy_id: str
    pair: str
    periods_tested: int
    periods: list[BacktestResult] = field(default_factory=list)
    # Aggregate metrics
    total_hedged_pnl: float = 0.0
    total_unhedged_pnl: float = 0.0
    avg_effectiveness: float = 0.0
    avg_cost_bps: float = 0.0
    max_drawdown_usd: float = 0.0
    # Validation
    report_hash: str = ""
    grading: str = "HEURISTIC"

    def compute_hash(self) -> str:
        """Deterministic hash of the report for audit trail."""
        payload = {
            "policy_id": self.policy_id,
            "pair": self.pair,
            "periods_tested": self.periods_tested,
            "total_hedged_pnl": self.total_hedged_pnl,
            "total_unhedged_pnl": self.total_unhedged_pnl,
            "avg_effectiveness": self.avg_effectiveness,
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# Single-period evaluation (deterministic)
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_period(
    *,
    period: HistoricalPeriod,
    policy: Mapping[str, Any],
    notional_usd: float,
    spot_at_maturity: float,
    pair: str = "USDMXN",
) -> BacktestResult:
    """Evaluate hedge policy for a single historical period.

    Parameters
    ----------
    period : HistoricalPeriod
        Historical market data for the period.
    policy : dict
        PolicyConfig with hedge_ratios, cost_assumptions, etc.
    notional_usd : float
        Notional exposure amount.
    spot_at_maturity : float
        Realized spot at hedge maturity.

    Returns
    -------
    BacktestResult — single period evaluation.
    """
    # Extract policy parameters
    hedge_ratios = policy.get("hedge_ratios", {})
    confirmed_ratio = float(hedge_ratios.get("confirmed", 0.75) if isinstance(hedge_ratios, dict) else 0.75)
    cost_assumptions = policy.get("cost_assumptions", {})
    spread_bps = float(cost_assumptions.get("spread_bps", 5.0) if isinstance(cost_assumptions, dict) else 5.0)

    # Compute forward rate
    fwd_points = period.forward_points.get(period.period_id, 0.0)
    forward_rate = period.spot_rate + fwd_points

    # Hedge mechanics
    notional_hedged = notional_usd * confirmed_ratio
    notional_unhedged = notional_usd - notional_hedged

    # PnL calculation (from perspective of USD buyer / MXN seller)
    # Hedged portion: locked at forward rate
    # Unhedged portion: exposed to spot at maturity
    if period.spot_rate > 0:
        hedged_pnl = notional_hedged * (forward_rate - spot_at_maturity) / period.spot_rate
        unhedged_pnl = notional_usd * (period.spot_rate - spot_at_maturity) / period.spot_rate
    else:
        hedged_pnl = 0.0
        unhedged_pnl = 0.0

    # Cost
    cost_usd = notional_hedged * (spread_bps / 10_000)
    hedged_pnl -= cost_usd

    # Effectiveness
    if abs(unhedged_pnl) > 0.01:
        effectiveness = 1.0 - abs(hedged_pnl) / abs(unhedged_pnl)
    else:
        effectiveness = 1.0  # No exposure change → perfectly effective

    effectiveness = max(0.0, min(1.0, effectiveness))

    return BacktestResult(
        period_id=period.period_id,
        hedged_pnl_usd=round(hedged_pnl, 2),
        unhedged_pnl_usd=round(unhedged_pnl, 2),
        hedge_effectiveness=round(effectiveness, 4),
        cost_bps=spread_bps,
        forward_rate_used=forward_rate,
        spot_at_maturity=spot_at_maturity,
        hedge_ratio_applied=confirmed_ratio,
        notional_hedged_usd=notional_hedged,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Multi-period backtest
# ─────────────────────────────────────────────────────────────────────────────

def run_backtest(
    *,
    periods: Sequence[HistoricalPeriod],
    spots_at_maturity: Sequence[float],
    policy: Mapping[str, Any],
    notional_usd: float,
    policy_id: str = "backtest",
    pair: str = "USDMXN",
) -> BacktestReport:
    """Run a full backtest across multiple historical periods.

    Parameters
    ----------
    periods : list[HistoricalPeriod]
        Historical market snapshots (one per period).
    spots_at_maturity : list[float]
        Realized spot rates at each period's maturity.
        Must be same length as periods.
    policy : dict
        PolicyConfig to test.
    notional_usd : float
        Constant notional per period.
    policy_id : str
        Identifier for this policy being tested.
    pair : str
        Currency pair.

    Returns
    -------
    BacktestReport — aggregate report with hash.
    """
    if len(periods) != len(spots_at_maturity):
        raise ValueError(
            f"periods ({len(periods)}) and spots_at_maturity ({len(spots_at_maturity)}) must match"
        )

    results: list[BacktestResult] = []
    for period, spot_mat in zip(periods, spots_at_maturity, strict=True):
        result = evaluate_period(
            period=period,
            policy=policy,
            notional_usd=notional_usd,
            spot_at_maturity=spot_mat,
            pair=pair,
        )
        results.append(result)

    # Aggregate
    total_hedged = sum(r.hedged_pnl_usd for r in results)
    total_unhedged = sum(r.unhedged_pnl_usd for r in results)
    avg_eff = sum(r.hedge_effectiveness for r in results) / len(results) if results else 0.0
    avg_cost = sum(r.cost_bps for r in results) / len(results) if results else 0.0

    # Max drawdown (cumulative hedged PnL)
    cumulative = 0.0
    peak = 0.0
    max_dd = 0.0
    for r in results:
        cumulative += r.hedged_pnl_usd
        if cumulative > peak:
            peak = cumulative
        dd = peak - cumulative
        if dd > max_dd:
            max_dd = dd

    report = BacktestReport(
        policy_id=policy_id,
        pair=pair,
        periods_tested=len(results),
        periods=results,
        total_hedged_pnl=round(total_hedged, 2),
        total_unhedged_pnl=round(total_unhedged, 2),
        avg_effectiveness=round(avg_eff, 4),
        avg_cost_bps=round(avg_cost, 2),
        max_drawdown_usd=round(max_dd, 2),
        grading="HEURISTIC",
    )
    report.report_hash = report.compute_hash()
    return report


# ─────────────────────────────────────────────────────────────────────────────
# Policy comparison
# ─────────────────────────────────────────────────────────────────────────────

def compare_policies(
    *,
    periods: Sequence[HistoricalPeriod],
    spots_at_maturity: Sequence[float],
    policy_a: Mapping[str, Any],
    policy_b: Mapping[str, Any],
    notional_usd: float,
    pair: str = "USDMXN",
) -> dict[str, Any]:
    """Compare two policies against the same historical data.

    Returns dict with:
    - policy_a_report: BacktestReport
    - policy_b_report: BacktestReport
    - comparison: dict with relative metrics
    """
    report_a = run_backtest(
        periods=periods,
        spots_at_maturity=spots_at_maturity,
        policy=policy_a,
        notional_usd=notional_usd,
        policy_id="policy_a",
        pair=pair,
    )
    report_b = run_backtest(
        periods=periods,
        spots_at_maturity=spots_at_maturity,
        policy=policy_b,
        notional_usd=notional_usd,
        policy_id="policy_b",
        pair=pair,
    )

    pnl_diff = report_a.total_hedged_pnl - report_b.total_hedged_pnl
    eff_diff = report_a.avg_effectiveness - report_b.avg_effectiveness
    cost_diff = report_a.avg_cost_bps - report_b.avg_cost_bps

    return {
        "policy_a": {
            "total_hedged_pnl": report_a.total_hedged_pnl,
            "avg_effectiveness": report_a.avg_effectiveness,
            "avg_cost_bps": report_a.avg_cost_bps,
            "max_drawdown_usd": report_a.max_drawdown_usd,
            "report_hash": report_a.report_hash,
        },
        "policy_b": {
            "total_hedged_pnl": report_b.total_hedged_pnl,
            "avg_effectiveness": report_b.avg_effectiveness,
            "avg_cost_bps": report_b.avg_cost_bps,
            "max_drawdown_usd": report_b.max_drawdown_usd,
            "report_hash": report_b.report_hash,
        },
        "comparison": {
            "pnl_advantage_a_usd": round(pnl_diff, 2),
            "effectiveness_advantage_a": round(eff_diff, 4),
            "cost_advantage_a_bps": round(-cost_diff, 2),  # negative cost_diff = A cheaper
            "recommendation": "policy_a" if pnl_diff > 0 else "policy_b",
        },
        "grading": "HEURISTIC",
    }
