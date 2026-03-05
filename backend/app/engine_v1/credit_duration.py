"""A16: Credit Spread Duration Mapping.

Maps equity exposure to credit spread duration equivalent for HYG/LQD sizing.

Formula:
    spread_duration_equiv = equity_delta ? credit_equity_correlation ? (equity_vol / credit_vol)

Pure computational -- accepts injectable correlation via ExtendedPolicyConfig.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# Demo defaults
DEFAULT_EQUITY_VOL = 0.20
DEFAULT_CREDIT_VOL = 0.08


@dataclass
class CreditDurationResult:
    """Result of credit duration mapping."""

    equity_delta: float
    credit_equity_correlation: float
    equity_vol: float
    credit_vol: float
    spread_duration_equiv: float
    hyg_notional_equivalent: float    # High-yield credit equivalent
    lqd_notional_equivalent: float    # Investment-grade credit equivalent
    credit_dv01: float                # DV01 in credit spread space

    def to_dict(self) -> dict:
        return {
            "equity_delta": self.equity_delta,
            "credit_equity_correlation": self.credit_equity_correlation,
            "equity_vol": self.equity_vol,
            "credit_vol": self.credit_vol,
            "spread_duration_equiv": self.spread_duration_equiv,
            "hyg_notional_equivalent": self.hyg_notional_equivalent,
            "lqd_notional_equivalent": self.lqd_notional_equivalent,
            "credit_dv01": self.credit_dv01,
        }


def map_credit_duration(
    equity_delta: float,
    policy: dict[str, Any],
    equity_vol: float | None = None,   # None triggers auto-detect from market
    credit_vol: float | None = None,
    market: dict[str, Any] | None = None,  # NEW: for vol lookup
) -> CreditDurationResult:
    """Map equity exposure to credit spread duration equivalent.

    Parameters
    ----------
    equity_delta : float
        Net equity delta exposure in USD.
    policy : dict
        ExtendedPolicyConfig as dict. Uses 'credit_equity_correlation'.
    equity_vol : float
        Annualized equity volatility (default 20%).
    credit_vol : float
        Annualized credit spread volatility (default 8%).

    Returns
    -------
    CreditDurationResult
    """
    # Auto-detect vol from market snapshot when not explicitly provided
    if equity_vol is None:
        if market:
            vol_surface = market.get("vol_surface", {})
            equity_vol = vol_surface.get("SPX_REALIZED_1M", DEFAULT_EQUITY_VOL)
        else:
            equity_vol = DEFAULT_EQUITY_VOL

    if credit_vol is None:
        if market:
            vol_surface = market.get("vol_surface", {})
            credit_vol = vol_surface.get("HYG_SPREAD_VOL", DEFAULT_CREDIT_VOL)
        else:
            credit_vol = DEFAULT_CREDIT_VOL

    correlation = policy.get("credit_equity_correlation", 0.7)

    # Core formula: equity -> credit spread duration
    vol_ratio = equity_vol / credit_vol if credit_vol > 0 else 2.5
    spread_duration_equiv = equity_delta * correlation * vol_ratio

    # HYG duration ~4 years, LQD duration ~8 years
    hyg_duration = 4.0
    lqd_duration = 8.0

    # Notional = spread_duration_equiv / instrument_duration
    hyg_notional = abs(spread_duration_equiv) / hyg_duration if hyg_duration > 0 else 0.0
    lqd_notional = abs(spread_duration_equiv) / lqd_duration if lqd_duration > 0 else 0.0

    # Credit DV01: 1bp move ? spread_duration_equiv
    credit_dv01 = abs(spread_duration_equiv) / 10000.0

    return CreditDurationResult(
        equity_delta=equity_delta,
        credit_equity_correlation=correlation,
        equity_vol=equity_vol,
        credit_vol=credit_vol,
        spread_duration_equiv=spread_duration_equiv,
        hyg_notional_equivalent=hyg_notional,
        lqd_notional_equivalent=lqd_notional,
        credit_dv01=credit_dv01,
    )
