"""Deterministic scenario engine -- fixed sigma shocks only.

No probabilities, no forecasting. Pure function.
"""

from __future__ import annotations

from app.schemas.market import MarketSnapshot
from app.schemas.results import (
    BucketResult,
    ScenarioBucketResult,
    ScenarioResults,
    ScenarioTotalResult,
)

SIGMAS: list[float] = [-0.10, -0.05, 0.05, 0.10]


def compute_scenarios(
    buckets: list[BucketResult],
    market: MarketSnapshot,
) -> ScenarioResults:
    spot = market.spot_usdmxn
    per_bucket: list[ScenarioBucketResult] = []
    totals_map: dict[float, dict] = {
        s: {"unhedged": 0.0, "hedged": 0.0, "benefit": 0.0, "shocked_spot": 0.0}
        for s in SIGMAS
    }

    for sigma in SIGMAS:
        shocked_spot = spot * (1.0 + sigma)
        totals_map[sigma]["shocked_spot"] = shocked_spot

        for b in buckets:
            # Unhedged: all commercial exposure converted at shocked spot
            unhedged_usd = b.commercial_exposure_mxn / shocked_spot

            # Hedged: hedge position at forward rate + residual at shocked spot
            hedged_usd = (
                b.hedge_position_mxn / b.forward_rate
                + b.residual_mxn / shocked_spot
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
