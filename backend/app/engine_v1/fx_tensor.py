"""A9: Multi-Currency FX Tensor Engine.

Decomposes FX risk across asset/base/funding currencies into
delta, carry, basis, and duration components per currency pair.

Pure computational -- accepts injectable data via ExtendedMarketSnapshot.
Falls back gracefully when extended market data absent (single-pair = v1 behavior).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class CurrencyExposure:
    """Exposure decomposition for a single currency pair."""

    pair: str
    delta_fx: float = 0.0          # position_value ? FX_rate
    carry_component: float = 0.0   # interest_diff ? notional ? time_fraction
    basis_component: float = 0.0   # cross_currency_basis ? notional
    duration_fx: float = 0.0       # carry sensitivity to rate shift (DV01-like)
    gross_notional: float = 0.0
    net_notional: float = 0.0

    def to_dict(self) -> dict:
        return {
            "pair": self.pair,
            "delta_fx": self.delta_fx,
            "carry_component": self.carry_component,
            "basis_component": self.basis_component,
            "duration_fx": self.duration_fx,
            "gross_notional": self.gross_notional,
            "net_notional": self.net_notional,
        }


@dataclass
class ExposureTensor:
    """Full multi-currency exposure tensor."""

    exposures: list[CurrencyExposure] = field(default_factory=list)
    total_delta_fx: float = 0.0
    total_carry: float = 0.0
    total_basis: float = 0.0
    currency_count: int = 0

    def to_dict(self) -> dict:
        return {
            "exposures": [e.to_dict() for e in self.exposures],
            "total_delta_fx": self.total_delta_fx,
            "total_carry": self.total_carry,
            "total_basis": self.total_basis,
            "currency_count": self.currency_count,
        }


# ---------------------------------------------------------------------------
# Tenor to year-fraction mapping
# ---------------------------------------------------------------------------

_TENOR_MONTHS: dict[str, float] = {
    "1M": 1 / 12,
    "3M": 3 / 12,
    "6M": 6 / 12,
    "12M": 12 / 12,
}


def _tenor_to_fraction(tenor: str) -> float:
    """Convert tenor string to year fraction."""
    return _TENOR_MONTHS.get(tenor, 3 / 12)  # default 3M


def _get_rate(curves: dict[str, dict[str, float]], currency: str, tenor: str = "3M") -> float:
    """Get interest rate for currency at tenor (annualized %)."""
    curve = curves.get(currency, {})
    return curve.get(tenor, 0.0)


def _estimate_maturity_months(maturity: str) -> int:
    """Estimate months until maturity from YYYY-MM string. Returns 3 as default."""
    try:
        parts = maturity.split("-")
        if len(parts) >= 2:
            # Simple month count -- not calendar-precise but sufficient
            return max(1, int(parts[1]))
        return 3
    except (ValueError, IndexError):
        return 3


def _months_to_tenor(months: int) -> str:
    """Map maturity months to nearest standard tenor."""
    if months <= 1:
        return "1M"
    if months <= 3:
        return "3M"
    if months <= 6:
        return "6M"
    return "12M"


# ---------------------------------------------------------------------------
# Core tensor computation
# ---------------------------------------------------------------------------

def compute_exposure_tensor(
    trades: list[dict],
    market: dict[str, Any],
) -> ExposureTensor:
    """Decompose multi-currency exposures into delta/carry/basis/duration.

    Parameters
    ----------
    trades : list[dict]
        Trade rows. Each may have 'currency', 'asset_currency', 'funding_currency',
        'amount_usd', 'maturity'.
    market : dict
        ExtendedMarketSnapshot as dict. Uses fx_rates, interest_curves, basis_spreads.

    Returns
    -------
    ExposureTensor
        Decomposed risk per currency pair.
    """
    fx_rates: dict[str, float] = market.get("fx_rates", {})
    interest_curves: dict[str, dict[str, float]] = market.get("interest_curves", {})
    basis_spreads: dict[str, float] = market.get("basis_spreads", {})

    # Group trades by currency pair
    pair_buckets: dict[str, list[dict]] = {}
    for trade in trades:
        asset_ccy = trade.get("asset_currency", trade.get("currency", "USD"))
        funding_ccy = trade.get("funding_currency", "USD")
        pair = f"{funding_ccy}{asset_ccy}"
        pair_buckets.setdefault(pair, []).append(trade)

    exposures: list[CurrencyExposure] = []

    for pair, pair_trades in pair_buckets.items():
        funding_ccy = pair[:3]
        asset_ccy = pair[3:]
        fx_rate = fx_rates.get(pair, market.get("spot_rate", market.get("spot_usdmxn", 1.0)))

        gross = 0.0
        net = 0.0
        total_carry = 0.0
        total_basis = 0.0
        total_duration = 0.0

        for trade in pair_trades:
            amount_usd = trade.get("amount_usd", 0.0)
            maturity = trade.get("maturity", "")
            months = _estimate_maturity_months(maturity)
            tenor = _months_to_tenor(months)
            time_frac = _tenor_to_fraction(tenor)

            gross += abs(amount_usd)
            net += amount_usd

            # Interest differential
            r_funding = _get_rate(interest_curves, funding_ccy, tenor) / 100.0
            r_asset = _get_rate(interest_curves, asset_ccy, tenor) / 100.0
            carry = (r_asset - r_funding) * abs(amount_usd) * time_frac
            total_carry += carry

            # Cross-currency basis
            basis_bps = basis_spreads.get(pair, 0.0)
            basis = (basis_bps / 10000.0) * abs(amount_usd)
            total_basis += basis

            # Duration (DV01-like: carry sensitivity to 1bp rate shift)
            duration = abs(amount_usd) * time_frac / 10000.0
            total_duration += duration

        delta_fx = net * fx_rate

        exp = CurrencyExposure(
            pair=pair,
            delta_fx=delta_fx,
            carry_component=total_carry,
            basis_component=total_basis,
            duration_fx=total_duration,
            gross_notional=gross,
            net_notional=net,
        )
        exposures.append(exp)

    tensor = ExposureTensor(
        exposures=exposures,
        total_delta_fx=sum(e.delta_fx for e in exposures),
        total_carry=sum(e.carry_component for e in exposures),
        total_basis=sum(e.basis_component for e in exposures),
        currency_count=len(exposures),
    )
    return tensor
