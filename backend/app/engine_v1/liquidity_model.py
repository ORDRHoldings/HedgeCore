"""A14: Liquidity & Slippage Estimator.

Uses Almgren-Chriss square-root impact model to estimate execution slippage.

Formula: slippage_bps = impact_factor ? sqrt(order_size / avg_daily_volume)

Pure computational -- accepts injectable ADV data via ExtendedMarketSnapshot.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any


# Conservative institutional estimate
DEFAULT_IMPACT_FACTOR = 0.1


@dataclass
class SlippageEstimate:
    """Slippage estimate for a single position."""

    bucket: str
    instrument: str
    order_size_usd: float
    adv_usd: float
    participation_rate: float  # order_size / ADV
    slippage_bps: float
    slippage_usd: float
    liquidity_score: float     # 0.0 (illiquid) to 1.0 (liquid)

    def to_dict(self) -> dict:
        return {
            "bucket": self.bucket,
            "instrument": self.instrument,
            "order_size_usd": self.order_size_usd,
            "adv_usd": self.adv_usd,
            "participation_rate": self.participation_rate,
            "slippage_bps": self.slippage_bps,
            "slippage_usd": self.slippage_usd,
            "liquidity_score": self.liquidity_score,
        }


@dataclass
class LiquidityResult:
    """Portfolio-level liquidity and slippage summary."""

    estimates: list[SlippageEstimate] = field(default_factory=list)
    total_slippage_usd: float = 0.0
    total_slippage_bps: float = 0.0
    avg_liquidity_score: float = 1.0
    min_liquidity_score: float = 1.0
    liquidity_warning: bool = False

    def to_dict(self) -> dict:
        return {
            "estimates": [e.to_dict() for e in self.estimates],
            "total_slippage_usd": self.total_slippage_usd,
            "total_slippage_bps": self.total_slippage_bps,
            "avg_liquidity_score": self.avg_liquidity_score,
            "min_liquidity_score": self.min_liquidity_score,
            "liquidity_warning": self.liquidity_warning,
        }


def _compute_liquidity_score(participation_rate: float) -> float:
    """Map participation rate to liquidity score (0-1).

    < 1% ADV  -> 1.0  (very liquid)
    1-5% ADV  -> 0.8
    5-10% ADV -> 0.5
    10-25%    -> 0.3
    > 25%     -> 0.1  (illiquid)
    """
    if participation_rate < 0.01:
        return 1.0
    if participation_rate < 0.05:
        return 0.8
    if participation_rate < 0.10:
        return 0.5
    if participation_rate < 0.25:
        return 0.3
    return 0.1


def estimate_slippage(
    hedge_actions: list[dict],
    market: dict[str, Any],
    policy: dict[str, Any],
    impact_factor: float = DEFAULT_IMPACT_FACTOR,
    require_adv: bool = False,
) -> LiquidityResult:
    """Estimate execution slippage using square-root impact model.

    Parameters
    ----------
    hedge_actions : list[dict]
        Per-bucket hedge actions from kernel. Each has 'bucket', 'action_usd',
        'instrument' (optional).
    market : dict
        ExtendedMarketSnapshot as dict. Uses 'adv_data'.
    policy : dict
        ExtendedPolicyConfig as dict. Uses 'execution_product', 'min_liquidity_score'.
    impact_factor : float
        Market impact coefficient. Default 0.1 (conservative institutional).

    Returns
    -------
    LiquidityResult
    """
    adv_data: dict[str, float] = market.get("adv_data", {})
    execution_product = policy.get("execution_product", "FWD")
    min_liquidity = policy.get("min_liquidity_score", 0.0)

    estimates: list[SlippageEstimate] = []
    total_notional = 0.0

    for action in hedge_actions:
        bucket = action.get("bucket", "unknown")
        order_size = abs(action.get("action_usd", 0.0))
        instrument = action.get("instrument", execution_product)

        if order_size < 1.0:
            continue

        # Look up ADV -- try specific pair+instrument, then pair-only, then registry fallback
        pair = action.get("pair", "USDMXN")
        adv_key = f"{pair}_{instrument}"

        adv = adv_data.get(adv_key, None)
        if adv is None:
            adv = adv_data.get(pair, None)

        if adv is None:
            if require_adv:
                raise ValueError(
                    f"ADV data required for {pair} but not provided in market.adv_data. "
                    f"Pass require_adv=False to use registry fallback. Missing key: {adv_key}"
                )
            # FIX-05: pair-aware registry fallback (replaces $5B flat default)
            try:
                from app.engine_v1.pair_registry import get_pair_meta
                meta = get_pair_meta(pair)
                adv = meta.typical_adv_usd
            except (ValueError, ImportError):
                adv = 5_000_000_000  # Ultimate fallback

        participation_rate = order_size / adv if adv > 0 else 1.0
        liquidity_score = _compute_liquidity_score(participation_rate)

        # Almgren-Chriss: slippage_bps = impact_factor ? sqrt(order / ADV) ? 10000
        slippage_bps = impact_factor * math.sqrt(participation_rate) * 10000
        slippage_usd = order_size * (slippage_bps / 10000.0)

        total_notional += order_size

        estimates.append(SlippageEstimate(
            bucket=bucket,
            instrument=instrument,
            order_size_usd=order_size,
            adv_usd=adv,
            participation_rate=participation_rate,
            slippage_bps=slippage_bps,
            slippage_usd=slippage_usd,
            liquidity_score=liquidity_score,
        ))

    total_slippage_usd = sum(e.slippage_usd for e in estimates)
    total_slippage_bps = (total_slippage_usd / total_notional * 10000) if total_notional > 0 else 0.0
    scores = [e.liquidity_score for e in estimates]
    avg_score = sum(scores) / len(scores) if scores else 1.0
    min_score = min(scores) if scores else 1.0

    return LiquidityResult(
        estimates=estimates,
        total_slippage_usd=total_slippage_usd,
        total_slippage_bps=total_slippage_bps,
        avg_liquidity_score=avg_score,
        min_liquidity_score=min_score,
        liquidity_warning=min_score < min_liquidity,
    )
