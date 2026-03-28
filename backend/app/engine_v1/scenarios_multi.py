"""Multi-currency scenario engine.

Generalizes scenarios.py (FROZEN) to work with GenericBucketResult.
Same sigma shocks. Same pure-function design.
"""
from __future__ import annotations

from typing import Any

from app.engine_v1.pair_registry import get_pair_meta
from app.schemas_v1.results import (
    GenericBucketResult,
    ScenarioBucketResult,
    ScenarioResults,
    ScenarioTotalResult,
)

SIGMAS: list[float] = [-0.10, -0.05, 0.05, 0.10]


def compute_scenarios_multi(
    buckets: list[GenericBucketResult],
    spot: float,
    pair: str = "USDMXN",
) -> ScenarioResults:
    """Compute scenario shocks for any currency pair.

    Args:
        buckets: List of GenericBucketResult from compute_hedge_plan_generic.
        spot: Current spot rate for the pair.
        pair: Currency pair code.

    Returns:
        ScenarioResults — same schema as the legacy compute_scenarios().
    """
    meta = get_pair_meta(pair)
    per_bucket: list[ScenarioBucketResult] = []
    totals_map: dict[float, dict[str, Any]] = {
        s: {"unhedged": 0.0, "hedged": 0.0, "benefit": 0.0, "shocked_spot": 0.0}
        for s in SIGMAS
    }

    for sigma in SIGMAS:
        shocked_spot = spot * (1.0 + sigma)
        totals_map[sigma]["shocked_spot"] = shocked_spot

        for b in buckets:
            # Unhedged: commercial exposure converted at shocked spot (pair-aware)
            unhedged_usd = meta.convert_local_to_usd(b.commercial_exposure_local, shocked_spot)

            # Hedged: hedge position at locked forward + residual at shocked spot
            hedged_usd = (
                meta.convert_local_to_usd(b.hedge_position_local, b.forward_rate)
                + meta.convert_local_to_usd(b.residual_local, shocked_spot)
            )

            benefit = hedged_usd - unhedged_usd

            per_bucket.append(
                ScenarioBucketResult(
                    bucket=b.bucket,
                    sigma=sigma,
                    shocked_spot=shocked_spot,
                    unhedged_usd=unhedged_usd,
                    hedged_usd=hedged_usd,
                    hedge_benefit_usd=benefit,
                )
            )

            totals_map[sigma]["unhedged"] += unhedged_usd
            totals_map[sigma]["hedged"] += hedged_usd
            totals_map[sigma]["benefit"] += benefit

    totals = [
        ScenarioTotalResult(
            sigma=sigma,
            shocked_spot=totals_map[sigma]["shocked_spot"],
            total_unhedged_usd=totals_map[sigma]["unhedged"],
            total_hedged_usd=totals_map[sigma]["hedged"],
            total_hedge_benefit_usd=totals_map[sigma]["benefit"],
        )
        for sigma in SIGMAS
    ]

    return ScenarioResults(sigmas=SIGMAS, per_bucket=per_bucket, totals=totals)
