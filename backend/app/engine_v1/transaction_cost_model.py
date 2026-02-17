"""A26: Full Transaction Cost Model.

Complete execution cost decomposition beyond simple spread.

Components:
- slippage_cost (from liquidity_model A14)
- broker_commission
- exchange_fee
- clearing_fee
- volatility_drift_adjustment
- total_transaction_cost

Pure computational — fee schedule injectable via ExtendedMarketSnapshot.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class PositionCost:
    """Cost breakdown for a single position."""

    bucket: str
    instrument: str
    notional_usd: float
    slippage_cost: float
    broker_commission: float
    exchange_fee: float
    clearing_fee: float
    vol_drift_adjustment: float
    total_cost: float
    total_cost_bps: float

    def to_dict(self) -> dict:
        return {
            "bucket": self.bucket,
            "instrument": self.instrument,
            "notional_usd": self.notional_usd,
            "slippage_cost": self.slippage_cost,
            "broker_commission": self.broker_commission,
            "exchange_fee": self.exchange_fee,
            "clearing_fee": self.clearing_fee,
            "vol_drift_adjustment": self.vol_drift_adjustment,
            "total_cost": self.total_cost,
            "total_cost_bps": self.total_cost_bps,
        }


@dataclass
class TransactionCostResult:
    """Portfolio-level transaction cost summary."""

    positions: list[PositionCost] = field(default_factory=list)
    total_slippage: float = 0.0
    total_commission: float = 0.0
    total_exchange_fees: float = 0.0
    total_clearing_fees: float = 0.0
    total_vol_drift: float = 0.0
    total_transaction_cost: float = 0.0
    total_cost_bps: float = 0.0

    def to_dict(self) -> dict:
        return {
            "positions": [p.to_dict() for p in self.positions],
            "total_slippage": self.total_slippage,
            "total_commission": self.total_commission,
            "total_exchange_fees": self.total_exchange_fees,
            "total_clearing_fees": self.total_clearing_fees,
            "total_vol_drift": self.total_vol_drift,
            "total_transaction_cost": self.total_transaction_cost,
            "total_cost_bps": self.total_cost_bps,
        }


def compute_transaction_costs(
    hedge_actions: list[dict],
    slippage_estimates: list[dict],
    market: dict[str, Any],
    policy: dict[str, Any],
) -> TransactionCostResult:
    """Compute full transaction cost decomposition.

    Parameters
    ----------
    hedge_actions : list[dict]
        Per-bucket hedge actions (bucket, action_usd, instrument).
    slippage_estimates : list[dict]
        Slippage data from liquidity_model (bucket, slippage_usd, slippage_bps).
    market : dict
        ExtendedMarketSnapshot as dict. Uses 'fee_schedule', 'vol_surface'.
    policy : dict
        ExtendedPolicyConfig as dict. Uses 'broker_commission_bps', 'execution_product'.

    Returns
    -------
    TransactionCostResult
    """
    fee_schedule: dict[str, dict[str, float]] = market.get("fee_schedule", {})
    broker_bps = policy.get("broker_commission_bps", 0.0)
    execution_product = policy.get("execution_product", "FWD")

    # Index slippage by bucket
    slippage_by_bucket = {s.get("bucket"): s for s in slippage_estimates}

    # Get vol for drift calculation
    vol_surface = market.get("vol_surface", {})
    pair_vol = vol_surface.get("USDMXN_1M", 12.5) / 100.0  # Convert to decimal

    positions: list[PositionCost] = []
    total_notional = 0.0

    for action in hedge_actions:
        bucket = action.get("bucket", "unknown")
        notional = abs(action.get("action_usd", 0.0))
        instrument = action.get("instrument", execution_product)

        if notional < 1.0:
            continue

        total_notional += notional

        # Slippage from liquidity model
        slip_data = slippage_by_bucket.get(bucket, {})
        slippage_cost = slip_data.get("slippage_usd", 0.0)

        # Broker commission
        commission = notional * (broker_bps / 10000.0)

        # Exchange and clearing fees from schedule
        fees = fee_schedule.get(instrument, {})
        exchange_bps = fees.get("exchange", 0.0)
        clearing_bps = fees.get("clearing", 0.0)
        exchange_fee = notional * (exchange_bps / 10000.0)
        clearing_fee = notional * (clearing_bps / 10000.0)

        # Volatility drift adjustment: vol × sqrt(execution_time) × notional
        # Assume 1 day execution time = 1/252 year
        import math
        execution_time = 1.0 / 252.0
        vol_drift = pair_vol * math.sqrt(execution_time) * notional

        total_cost = slippage_cost + commission + exchange_fee + clearing_fee + vol_drift
        cost_bps = (total_cost / notional * 10000.0) if notional > 0 else 0.0

        positions.append(PositionCost(
            bucket=bucket,
            instrument=instrument,
            notional_usd=notional,
            slippage_cost=slippage_cost,
            broker_commission=commission,
            exchange_fee=exchange_fee,
            clearing_fee=clearing_fee,
            vol_drift_adjustment=vol_drift,
            total_cost=total_cost,
            total_cost_bps=cost_bps,
        ))

    total_slip = sum(p.slippage_cost for p in positions)
    total_comm = sum(p.broker_commission for p in positions)
    total_exch = sum(p.exchange_fee for p in positions)
    total_clear = sum(p.clearing_fee for p in positions)
    total_drift = sum(p.vol_drift_adjustment for p in positions)
    grand_total = sum(p.total_cost for p in positions)
    total_bps = (grand_total / total_notional * 10000.0) if total_notional > 0 else 0.0

    return TransactionCostResult(
        positions=positions,
        total_slippage=total_slip,
        total_commission=total_comm,
        total_exchange_fees=total_exch,
        total_clearing_fees=total_clear,
        total_vol_drift=total_drift,
        total_transaction_cost=grand_total,
        total_cost_bps=total_bps,
    )
