"""A13: FX Roll Ladder Engine.

Generates roll schedules for forward positions approaching maturity.

Outputs per roll:
- roll_date, from_bucket, to_bucket
- carry_cost = (forward_points_new - forward_points_old) ? notional / spot
- slippage_estimate = notional ? (spread_bps / 10000)

Uses existing market.forward_points_by_month for monthly roll math.
Pure computational -- accepts injectable data.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RollEntry:
    """Single roll event in the ladder."""

    roll_date: str           # YYYY-MM
    from_bucket: str
    to_bucket: str
    notional_usd: float
    forward_points_old: float
    forward_points_new: float
    carry_cost_usd: float
    slippage_usd: float
    total_roll_cost_usd: float
    instrument: str = "FWD"                    # FIX-08: track instrument at each roll
    instrument_transition: str | None = None   # FIX-08: "FWD→NDF" if transitioned

    def to_dict(self) -> dict[str, Any]:
        return {
            "roll_date": self.roll_date,
            "from_bucket": self.from_bucket,
            "to_bucket": self.to_bucket,
            "notional_usd": self.notional_usd,
            "forward_points_old": self.forward_points_old,
            "forward_points_new": self.forward_points_new,
            "carry_cost_usd": self.carry_cost_usd,
            "slippage_usd": self.slippage_usd,
            "total_roll_cost_usd": self.total_roll_cost_usd,
            "instrument": self.instrument,
            "instrument_transition": self.instrument_transition,
        }


@dataclass
class RollLadderResult:
    """Complete roll ladder for the portfolio."""

    rolls: list[RollEntry] = field(default_factory=list)
    total_carry_cost_usd: float = 0.0
    total_slippage_usd: float = 0.0
    total_roll_cost_usd: float = 0.0
    roll_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "rolls": [r.to_dict() for r in self.rolls],
            "total_carry_cost_usd": self.total_carry_cost_usd,
            "total_slippage_usd": self.total_slippage_usd,
            "total_roll_cost_usd": self.total_roll_cost_usd,
            "roll_count": self.roll_count,
        }


def _next_month(bucket: str) -> str:
    """Get next month bucket string YYYY-MM."""
    try:
        parts = bucket.split("-")
        year = int(parts[0])
        month = int(parts[1])
        month += 1
        if month > 12:
            month = 1
            year += 1
        return f"{year}-{month:02d}"
    except (ValueError, IndexError):
        return bucket


def _bucket_to_months(bucket: str, as_of: str | None = None) -> int:
    """Compute months from as_of to bucket mid-month."""
    from datetime import date, datetime
    ref = date.today()
    if as_of:
        try:
            ref = datetime.strptime(as_of[:10], "%Y-%m-%d").date()
        except ValueError:
            pass
    try:
        parts = bucket.split("-")
        year, month = int(parts[0]), int(parts[1])
        target = date(year, month, 15)
        delta = (target.year - ref.year) * 12 + (target.month - ref.month)
        return max(0, delta)
    except (ValueError, IndexError):
        return 0


def generate_roll_ladder(
    hedge_positions: list[dict[str, Any]],
    market: dict[str, Any],
    policy: dict[str, Any],
    roll_horizon_months: int = 3,
    pair: str = "USDMXN",  # FIX-08: pair for instrument transition logic
) -> RollLadderResult:
    """Generate roll schedule for forward positions.

    Parameters
    ----------
    hedge_positions : list[dict]
        Active hedge positions. Each has 'bucket' (YYYY-MM), 'notional_usd',
        'instrument' (FWD/NDF).
    market : dict
        MarketSnapshot or ExtendedMarketSnapshot as dict.
        Uses 'forward_points_by_month', 'spot_rate'.
    policy : dict
        PolicyConfig as dict. Uses 'cost_assumptions.spread_bps'.
    roll_horizon_months : int
        How many months forward to project rolls.
    pair : str
        Currency pair for instrument transition detection. Default USDMXN.

    Returns
    -------
    RollLadderResult
    """
    fwd_points = market.get("forward_points_by_month", {})
    spot = market.get("spot_rate", market.get("spot_usdmxn", 17.15))
    spread_bps = policy.get("cost_assumptions", {}).get("spread_bps", 5.0)
    as_of = market.get("as_of", None)

    # FIX-08: load pair metadata for instrument transition detection
    pair_meta = None
    try:
        from app.engine_v1.pair_registry import get_pair_meta
        pair_meta = get_pair_meta(pair)
    except (ValueError, ImportError):
        pass

    rolls: list[RollEntry] = []

    for position in hedge_positions:
        bucket = position.get("bucket", "")
        notional = abs(position.get("notional_usd", position.get("action_usd", 0.0)))
        instrument = position.get("instrument", policy.get("execution_product", "FWD"))

        if notional < 1.0 or not bucket:
            continue

        # Generate rolls for each month from current bucket forward
        current_bucket = bucket
        for _ in range(roll_horizon_months):
            next_bucket = _next_month(current_bucket)

            fwd_old = fwd_points.get(current_bucket, 0.0)
            fwd_new = fwd_points.get(next_bucket, 0.0)

            # Carry cost: (fwd_new - fwd_old) × notional / spot
            # Sign is preserved: positive = cost (rolling into steeper curve),
            # negative = benefit (rolling into flatter/cheaper curve).
            carry_cost = (fwd_new - fwd_old) * notional / spot if spot > 0 else 0.0

            # Slippage: notional × (spread_bps / 10000)
            slippage = notional * (spread_bps / 10000.0)

            # Net economic impact: positive = net cost, negative = net benefit.
            # Do NOT take abs(carry_cost) — a cheaper new forward is a genuine benefit
            # and should reduce total_roll_cost_usd, not inflate it.
            total_cost = carry_cost + slippage

            # FIX-08: detect instrument transition for next tenor
            next_instrument = instrument
            transition_note: str | None = None
            if pair_meta:
                months_to_next = _bucket_to_months(next_bucket, as_of=str(as_of) if as_of else None)
                if months_to_next > pair_meta.max_tenor_months and instrument == "FWD":
                    next_instrument = "NDF"
                    transition_note = f"FWD→NDF at {next_bucket} (exceeds {pair_meta.max_tenor_months}M tenor)"
                elif pair_meta.is_ndf and instrument == "FWD":
                    next_instrument = "NDF"
                    transition_note = f"FWD→NDF: {pair} is NDF-only pair"

            rolls.append(RollEntry(
                roll_date=next_bucket,
                from_bucket=current_bucket,
                to_bucket=next_bucket,
                notional_usd=notional,
                forward_points_old=fwd_old,
                forward_points_new=fwd_new,
                carry_cost_usd=carry_cost,
                slippage_usd=slippage,
                total_roll_cost_usd=total_cost,
                instrument=next_instrument,
                instrument_transition=transition_note,
            ))

            current_bucket = next_bucket
            instrument = next_instrument  # carry instrument forward

    total_carry = sum(r.carry_cost_usd for r in rolls)
    total_slippage = sum(r.slippage_usd for r in rolls)
    total_cost = sum(r.total_roll_cost_usd for r in rolls)

    return RollLadderResult(
        rolls=rolls,
        total_carry_cost_usd=total_carry,
        total_slippage_usd=total_slippage,
        total_roll_cost_usd=total_cost,
        roll_count=len(rolls),
    )
