"""Pure-function hedge plan kernel.

13-step per-bucket computation. No side effects, no external calls.
Same inputs always produce identical outputs.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from app.schemas_v1.market import MarketSnapshot
from app.schemas_v1.policy import PolicyConfig
from app.schemas_v1.results import BucketResult, HedgePlan, HedgePlanSummary, TraceEvent


def compute_hedge_plan(
    trades_df: pd.DataFrame,
    hedges_df: pd.DataFrame,
    market: MarketSnapshot,
    policy: PolicyConfig,
) -> tuple[HedgePlan, list[TraceEvent]]:
    trace_events: list[TraceEvent] = []
    spot = market.spot_usdmxn
    fwd_points = market.forward_points_by_month
    ratio_conf = policy.hedge_ratios.confirmed
    ratio_fore = policy.hedge_ratios.forecast
    spread_bps = policy.cost_assumptions.spread_bps
    min_trade = policy.min_trade_size_usd

    # Collect all buckets from trades (hedges may have extra but we only compute for trade buckets)
    trade_buckets = sorted(trades_df["bucket"].unique())

    buckets: list[BucketResult] = []

    for bucket in trade_buckets:
        bucket_trades = trades_df[trades_df["bucket"] == bucket]

        # Step 1: confirmed_flow
        confirmed_mask = bucket_trades["status"] == "CONFIRMED"
        confirmed_flow = float(bucket_trades.loc[confirmed_mask, "signed_mxn"].sum())

        # Step 2: forecast_flow
        forecast_mask = bucket_trades["status"] == "FORECAST"
        forecast_flow = float(bucket_trades.loc[forecast_mask, "signed_mxn"].sum())

        # Step 3: commercial_exposure
        commercial_exposure = confirmed_flow + forecast_flow

        # Step 4: existing_hedges
        if not hedges_df.empty:
            bucket_hedges = hedges_df[hedges_df["bucket"] == bucket]
            existing_hedges = float(bucket_hedges["signed_mxn"].sum())
        else:
            existing_hedges = 0.0

        # Step 5: target_signed
        target_signed = -1.0 * (
            confirmed_flow * ratio_conf + forecast_flow * ratio_fore
        )

        # Step 6: action
        action_mxn = target_signed - existing_hedges

        # Step 7: direction
        if action_mxn < 0:
            action_direction = "SELL_MXN_BUY_USD"
        elif action_mxn > 0:
            action_direction = "BUY_MXN_SELL_USD"
        else:
            action_direction = None

        # Step 8: forward_rate
        points = fwd_points.get(bucket, 0.0)
        forward_rate = spot + points

        # Step 9: action_usd
        action_usd = abs(action_mxn) / forward_rate if forward_rate != 0 else 0.0

        # Step 10: friction_usd
        friction_usd = (abs(action_mxn) / spot) * (spread_bps / 10000.0)

        # Step 11: suppressed (min trade filter)
        usd_equiv = abs(action_mxn) / spot if spot != 0 else 0.0
        suppressed = usd_equiv < min_trade

        if suppressed and action_mxn != 0:
            trace_events.append(
                TraceEvent(
                    step="KERNEL",
                    timestamp=datetime.now(timezone.utc),
                    detail=f"Bucket {bucket}: action suppressed (filtered_small_notional). "
                    f"USD equiv {usd_equiv:,.2f} < min {min_trade:,.2f}",
                    data={
                        "bucket": bucket,
                        "action_mxn": action_mxn,
                        "usd_equiv": usd_equiv,
                        "min_trade_size_usd": min_trade,
                        "reason": "filtered_small_notional",
                    },
                )
            )

        # Step 12: hedge_position
        effective_action = action_mxn if not suppressed else 0.0
        hedge_position = existing_hedges + effective_action

        # Step 13: residual
        residual = commercial_exposure + hedge_position

        # Carry note
        carry_note = (
            f"Forward points embedded (curve carry). Points={points} vs spot."
        )

        buckets.append(
            BucketResult(
                bucket=bucket,
                confirmed_flow_mxn=confirmed_flow,
                forecast_flow_mxn=forecast_flow,
                commercial_exposure_mxn=commercial_exposure,
                existing_hedges_mxn=existing_hedges,
                target_signed_mxn=target_signed,
                action_mxn=action_mxn,
                action_direction=action_direction,
                forward_rate=forward_rate,
                carry_note=carry_note,
                action_usd=action_usd,
                friction_usd=friction_usd,
                suppressed=suppressed,
                hedge_position_mxn=hedge_position,
                residual_mxn=residual,
            )
        )

    summary = HedgePlanSummary(
        total_commercial_exposure_mxn=sum(b.commercial_exposure_mxn for b in buckets),
        total_existing_hedges_mxn=sum(b.existing_hedges_mxn for b in buckets),
        total_action_mxn=sum(b.action_mxn for b in buckets),
        total_action_usd=sum(b.action_usd for b in buckets),
        total_friction_usd=sum(b.friction_usd for b in buckets),
        total_hedge_position_mxn=sum(b.hedge_position_mxn for b in buckets),
        total_residual_mxn=sum(b.residual_mxn for b in buckets),
    )

    return HedgePlan(buckets=buckets, summary=summary), trace_events


# ──────────────────────────────────────────────────────────────────────────────
# ARCH-01: Multi-currency kernel wrapper
# Backward compatible: USDMXN routes to legacy compute_hedge_plan unchanged.
# ──────────────────────────────────────────────────────────────────────────────

def compute_hedge_plan_multi(
    trades_df: "pd.DataFrame",
    hedges_df: "pd.DataFrame",
    market: "MarketSnapshot",
    policy: "PolicyConfig",
    pair: str = "USDMXN",
) -> "tuple[HedgePlan, list[TraceEvent]]":
    """Multi-currency kernel wrapper.

    Routes to the correct spot/forward data based on currency pair.
    For USDMXN (default): calls compute_hedge_plan directly — zero regression risk.
    For other pairs: extracts pair-specific data from market.pairs dict.

    Args:
        trades_df: Normalized trades DataFrame.
        hedges_df: Normalized hedges DataFrame.
        market: MarketSnapshot (may include .pairs for non-USDMXN pairs).
        policy: PolicyConfig.
        pair: Currency pair identifier, e.g. "USDMXN", "USDEUR". Default "USDMXN".

    Returns:
        (HedgePlan, list[TraceEvent]) — same as compute_hedge_plan.

    Raises:
        ValueError: If pair is not USDMXN and no market data exists for it.
    """
    if pair == "USDMXN":
        # Exact same code path as today — zero regression risk
        return compute_hedge_plan(trades_df, hedges_df, market, policy)

    # Multi-pair: extract pair-specific snapshot from market.pairs
    pairs_data = getattr(market, "pairs", {}) or {}
    pair_data = pairs_data.get(pair)
    if pair_data is None:
        raise ValueError(
            f"No market data for pair: {pair!r}. "
            f"Available pairs: {list(pairs_data.keys()) or ['USDMXN (default)']}"
        )

    # Build a compatible MarketSnapshot from pair-specific data
    pair_spot = pair_data.get("spot") if isinstance(pair_data, dict) else getattr(pair_data, "spot", None)
    pair_fwd = pair_data.get("forward_points") if isinstance(pair_data, dict) else getattr(pair_data, "forward_points", {})

    if pair_spot is None:
        raise ValueError(f"Pair {pair!r} market data missing 'spot' field")

    pair_market = MarketSnapshot(
        spot_usdmxn=pair_spot,
        forward_points_by_month=pair_fwd or {},
    )

    return compute_hedge_plan(trades_df, hedges_df, pair_market, policy)
