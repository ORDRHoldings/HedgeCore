"""Multi-currency generalized hedge plan kernel.

15-step per-bucket computation generalizing the 13-step USDMXN kernel.
Frozen files preserved: kernel.py, normalizer.py, scenarios.py are UNCHANGED.

REGRESSION GUARANTEE:
  For USDMXN (ADDITIVE forward, DIRECT quote):
    compute_forward_rate(spot, points) = spot + points  (same as kernel.py step 8)
    convert_local_to_usd(abs_action, fwd)  = abs_action / fwd  (same as kernel.py step 9)
    convert_local_to_usd(abs_action, spot) = abs_action / spot (same as kernel.py steps 10-11)
  All outputs are numerically identical.

New generalizations vs legacy kernel:
  Step 8:  forward_rate uses meta.compute_forward_rate() — handles PERCENTAGE NDF pairs
  Step 9:  action_usd uses meta.convert_local_to_usd(amt, forward_rate)
  Step 10: friction_usd uses meta.convert_local_to_usd(amt, spot)
  Step 11: suppressed uses meta.convert_local_to_usd(amt, spot)
  Step 14: carry_note includes settlement type + NDF flag
  Step 15: returns GenericBucketResult (not BucketResult)
"""
from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from app.engine_v1.pair_registry import get_pair_meta
from app.schemas_v1.market import MarketSnapshot
from app.schemas_v1.policy import PolicyConfig
from app.schemas_v1.results import (
    GenericBucketResult,
    GenericHedgePlan,
    GenericHedgePlanSummary,
    TraceEvent,
)


def compute_hedge_plan_generic(
    trades_df: pd.DataFrame,
    hedges_df: pd.DataFrame,
    market: MarketSnapshot,
    policy: PolicyConfig,
    pair: str = "USDMXN",
) -> tuple[GenericHedgePlan, list[TraceEvent]]:
    """15-step multi-currency hedge plan kernel.

    Args:
        trades_df: Normalized trades DataFrame with columns:
            bucket, status, signed_local (local-currency signed amount)
        hedges_df: Normalized hedges DataFrame with columns:
            bucket, signed_local (local-currency signed amount)
        market: MarketSnapshot (legacy USDMXN fields or MultiCurrencyMarketSnapshot.pairs)
        policy: PolicyConfig (uses get_hedge_ratios/get_spread_bps/get_min_trade_size for pair-aware lookup)
        pair: Currency pair code, e.g. "USDMXN", "EURUSD", "USDBRL"

    Returns:
        (GenericHedgePlan, list[TraceEvent])
    """
    meta = get_pair_meta(pair)
    trace_events: list[TraceEvent] = []

    # Extract market data — support both legacy MarketSnapshot and MultiCurrencyMarketSnapshot
    if pair == "USDMXN":
        spot = market.spot_usdmxn
        fwd_points = market.forward_points_by_month
    else:
        pairs_attr = getattr(market, "pairs", None) or {}
        pair_data = pairs_attr.get(pair)
        if pair_data is None:
            raise ValueError(
                f"No market data for pair {pair!r}. "
                f"Populate market.pairs[{pair!r}] in a MultiCurrencyMarketSnapshot."
            )
        spot = pair_data.spot
        fwd_points = pair_data.forward_points_by_month

    # Policy parameters (pair-aware fallback to global policy)
    ratios = policy.get_hedge_ratios(pair)
    ratio_conf = ratios.confirmed
    ratio_fore = ratios.forecast
    spread_bps = policy.get_spread_bps(pair)
    min_trade = policy.get_min_trade_size(pair)

    local_ccy = meta.local_ccy
    trade_buckets = sorted(trades_df["bucket"].unique())
    buckets: list[GenericBucketResult] = []

    for bucket in trade_buckets:
        bucket_trades = trades_df[trades_df["bucket"] == bucket]

        # Step 1: confirmed_flow_local
        confirmed_mask = bucket_trades["status"] == "CONFIRMED"
        confirmed_flow = float(bucket_trades.loc[confirmed_mask, "signed_local"].sum())

        # Step 2: forecast_flow_local
        forecast_mask = bucket_trades["status"] == "FORECAST"
        forecast_flow = float(bucket_trades.loc[forecast_mask, "signed_local"].sum())

        # Step 3: commercial_exposure_local
        commercial_exposure = confirmed_flow + forecast_flow

        # Step 4: existing_hedges_local
        if not hedges_df.empty and "bucket" in hedges_df.columns:
            bucket_hedges = hedges_df[hedges_df["bucket"] == bucket]
            existing_hedges = float(bucket_hedges["signed_local"].sum())
        else:
            existing_hedges = 0.0

        # Step 5: target_signed_local
        target_signed = -1.0 * (
            confirmed_flow * ratio_conf + forecast_flow * ratio_fore
        )

        # Step 6: action_local
        action_local = target_signed - existing_hedges

        # Step 7: direction string (pair-specific naming)
        if action_local < 0:
            action_direction = meta.sell_local_direction   # e.g. "SELL_MXN_BUY_USD"
        elif action_local > 0:
            action_direction = meta.buy_local_direction    # e.g. "BUY_MXN_SELL_USD"
        else:
            action_direction = None

        # Step 8: forward_rate (pair-aware: ADDITIVE vs PERCENTAGE)
        points = fwd_points.get(bucket, 0.0)
        forward_rate = meta.compute_forward_rate(spot, points)

        # Step 9: action_usd (pair-aware: DIRECT=divide, INDIRECT=multiply)
        action_usd = meta.convert_local_to_usd(abs(action_local), forward_rate)

        # Step 10: friction_usd (at spot, pair-aware)
        friction_usd = meta.convert_local_to_usd(abs(action_local), spot) * (spread_bps / 10_000.0)

        # Step 11: suppressed (min trade filter at spot)
        usd_equiv = meta.convert_local_to_usd(abs(action_local), spot)
        suppressed = usd_equiv < min_trade

        if suppressed and action_local != 0.0:
            trace_events.append(
                TraceEvent(
                    step="KERNEL_MULTI",
                    timestamp=datetime.now(timezone.utc),
                    detail=(
                        f"Bucket {bucket} [{pair}]: action suppressed "
                        f"(filtered_small_notional). "
                        f"USD equiv {usd_equiv:,.2f} < min {min_trade:,.2f}"
                    ),
                    data={
                        "bucket": bucket,
                        "pair": pair,
                        "action_local": action_local,
                        "usd_equiv": usd_equiv,
                        "min_trade_size_usd": min_trade,
                        "reason": "filtered_small_notional",
                    },
                )
            )

        # Step 12: hedge_position_local
        effective_action = action_local if not suppressed else 0.0
        hedge_position = existing_hedges + effective_action

        # Step 13: residual_local
        residual = commercial_exposure + hedge_position

        # Step 14: carry_note (includes NDF + settlement type info)
        settlement_note = "NDF cash-settled" if meta.is_ndf else "deliverable"
        fmt_note = (
            f"percentage (points={points}%)"
            if meta.forward_point_format.value == "PERCENTAGE"
            else f"additive (points={points})"
        )
        carry_note = (
            f"Forward points embedded ({fmt_note}, {settlement_note}). "
            f"Pair={pair} spot={spot}."
        )

        # Step 15: build GenericBucketResult
        buckets.append(
            GenericBucketResult(
                bucket=bucket,
                pair=pair,
                local_ccy=local_ccy,
                confirmed_flow_local=confirmed_flow,
                forecast_flow_local=forecast_flow,
                commercial_exposure_local=commercial_exposure,
                existing_hedges_local=existing_hedges,
                target_signed_local=target_signed,
                action_local=action_local,
                action_direction=action_direction,
                forward_rate=forward_rate,
                carry_note=carry_note,
                action_usd=action_usd,
                friction_usd=friction_usd,
                suppressed=suppressed,
                hedge_position_local=hedge_position,
                residual_local=residual,
            )
        )

    summary = GenericHedgePlanSummary(
        pair=pair,
        local_ccy=local_ccy,
        total_commercial_exposure_local=sum(b.commercial_exposure_local for b in buckets),
        total_existing_hedges_local=sum(b.existing_hedges_local for b in buckets),
        total_action_local=sum(b.action_local for b in buckets),
        total_action_usd=sum(b.action_usd for b in buckets),
        total_friction_usd=sum(b.friction_usd for b in buckets),
        total_hedge_position_local=sum(b.hedge_position_local for b in buckets),
        total_residual_local=sum(b.residual_local for b in buckets),
    )

    return GenericHedgePlan(pair=pair, local_ccy=local_ccy, buckets=buckets, summary=summary), trace_events
