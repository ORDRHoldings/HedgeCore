"""KPI and flag calculations for scenario matrix outcomes."""

from __future__ import annotations

from app.schemas.results import HedgePlan, ScenarioResults


TAIL_THRESHOLDS_BY_ARCHETYPE: dict[str, float] = {
    "IMPORTER": 250_000.0,
    "EXPORTER": 250_000.0,
    "MIXED": 200_000.0,
    "STRESS": 350_000.0,
}


def _safe_ratio(numerator: float, denominator: float) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def compute_kpis(
    *,
    hedge_plan: HedgePlan,
    scenario_results: ScenarioResults,
) -> dict[str, float]:
    summary = hedge_plan.summary
    benefits = [t.total_hedge_benefit_usd for t in scenario_results.totals]
    worst_case_benefit = min(benefits) if benefits else 0.0
    best_case_benefit = max(benefits) if benefits else 0.0
    tail_spread = best_case_benefit - worst_case_benefit

    coverage_ratio = abs(
        _safe_ratio(
            summary.total_hedge_position_mxn,
            summary.total_commercial_exposure_mxn,
        )
    )
    residual_ratio = abs(
        _safe_ratio(
            summary.total_residual_mxn,
            summary.total_commercial_exposure_mxn,
        )
    )
    friction_ratio = abs(
        _safe_ratio(
            summary.total_friction_usd,
            summary.total_action_usd,
        )
    )
    suppressed_count = sum(1 for bucket in hedge_plan.buckets if bucket.suppressed)

    return {
        "coverage_ratio": coverage_ratio,
        "residual_ratio": residual_ratio,
        "friction_ratio": friction_ratio,
        "worst_case_benefit_usd": worst_case_benefit,
        "best_case_benefit_usd": best_case_benefit,
        "tail_spread_usd": tail_spread,
        "suppressed_bucket_count": float(suppressed_count),
    }


def classify_flags(
    *,
    archetype: str,
    kpis: dict[str, float],
) -> list[str]:
    flags: list[str] = []

    if kpis["residual_ratio"] > 0.35:
        flags.append("RISK_HIGH")
    if kpis["friction_ratio"] > 0.015:
        flags.append("COST_HIGH")

    tail_threshold = TAIL_THRESHOLDS_BY_ARCHETYPE.get(archetype, 250_000.0)
    if kpis["tail_spread_usd"] > tail_threshold:
        flags.append("UNSTABLE_TAIL")

    return flags

