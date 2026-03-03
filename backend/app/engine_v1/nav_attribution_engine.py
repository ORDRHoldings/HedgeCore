"""A28: NAV Attribution Engine.

Multi-base currency P&L reporting.

Computes per position:
- nav_local: value in local currency
- nav_base: value in base currency
- fx_contribution: FX rate change impact
- carry_contribution: interest differential impact
- basis_contribution: cross-currency basis impact
- funding_contribution: funding cost impact

Single-currency backward compatible (fx_contribution = 0 when single pair).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class PositionAttribution:
    """NAV attribution for a single position."""

    position_id: str
    currency: str
    nav_local: float
    nav_base: float
    fx_contribution: float
    carry_contribution: float
    basis_contribution: float
    funding_contribution: float
    total_pnl: float

    def to_dict(self) -> dict:
        return {
            "position_id": self.position_id,
            "currency": self.currency,
            "nav_local": self.nav_local,
            "nav_base": self.nav_base,
            "fx_contribution": self.fx_contribution,
            "carry_contribution": self.carry_contribution,
            "basis_contribution": self.basis_contribution,
            "funding_contribution": self.funding_contribution,
            "total_pnl": self.total_pnl,
        }


@dataclass
class NavAttributionResult:
    """Portfolio-level NAV attribution."""

    positions: list[PositionAttribution] = field(default_factory=list)
    total_nav_base: float = 0.0
    total_fx_contribution: float = 0.0
    total_carry_contribution: float = 0.0
    total_basis_contribution: float = 0.0
    total_funding_contribution: float = 0.0
    total_pnl: float = 0.0
    base_currency: str = "USD"

    def to_dict(self) -> dict:
        return {
            "positions": [p.to_dict() for p in self.positions],
            "total_nav_base": self.total_nav_base,
            "total_fx_contribution": self.total_fx_contribution,
            "total_carry_contribution": self.total_carry_contribution,
            "total_basis_contribution": self.total_basis_contribution,
            "total_funding_contribution": self.total_funding_contribution,
            "total_pnl": self.total_pnl,
            "base_currency": self.base_currency,
        }


def compute_nav_attribution(
    positions: list[dict],
    market: dict[str, Any],
    fx_delta: float | None = None,
    base_currency: str = "USD",
) -> NavAttributionResult:
    """Compute multi-currency NAV attribution.

    Parameters
    ----------
    positions : list[dict]
        Positions with currency, amount_local, amount_usd, maturity, etc.
    market : dict
        ExtendedMarketSnapshot as dict.
    base_currency : str
        Base currency for reporting.

    Returns
    -------
    NavAttributionResult
    """
    fx_rates: dict[str, float] = market.get("fx_rates", {})
    interest_curves: dict[str, dict[str, float]] = market.get("interest_curves", {})
    basis_spreads: dict[str, float] = market.get("basis_spreads", {})
    funding_bps = market.get("funding_rate_bps", 0.0)

    attributions: list[PositionAttribution] = []

    for pos in positions:
        pos_id = pos.get("trade_id", pos.get("bucket", "unknown"))
        currency = pos.get("currency", pos.get("asset_currency", "MXN"))
        amount_local = pos.get("amount_local", 0.0)
        amount_usd = pos.get("amount_usd", 0.0)
        maturity_months = _estimate_months(pos.get("maturity", ""))

        # FX rate for this currency
        if base_currency == "USD":
            pair = f"USD{currency}" if currency != "USD" else ""
            fx_rate = fx_rates.get(pair, market.get("spot_usdmxn", 1.0))
        else:
            pair = f"{base_currency}{currency}"
            fx_rate = fx_rates.get(pair, 1.0)

        # NAV in local and base
        nav_local = amount_local
        nav_base = amount_usd  # Already in USD

        # FX contribution: actual delta cascade (FIX-04)
        fx_contrib = 0.0
        if currency != base_currency and abs(amount_usd) > 0:
            if fx_delta is not None:
                # Priority 0: caller-supplied fx_delta (backward compat)
                fx_contrib = amount_usd * fx_delta
            else:
                # Priority 1: actual fx_deltas from market snapshot
                fx_deltas_map: dict[str, float] = market.get("fx_deltas", {})
                pair_key = f"USD{currency}" if base_currency == "USD" else f"{base_currency}{currency}"
                actual_delta = fx_deltas_map.get(pair_key, None)

                if actual_delta is not None:
                    fx_contrib = amount_usd * actual_delta
                else:
                    # Priority 2: compute from spot vs previous_close
                    prev_rates: dict[str, float] = market.get("previous_close_rates", {})
                    current_rate = fx_rates.get(pair_key, 0.0)
                    prev_rate = prev_rates.get(pair_key, 0.0)
                    if current_rate > 0 and prev_rate > 0:
                        implied_delta = (current_rate - prev_rate) / prev_rate
                        fx_contrib = amount_usd * implied_delta
                    else:
                        # Priority 3: pair-specific daily vol proxy from registry
                        try:
                            from app.engine_v1.pair_registry import get_pair_meta
                            import math
                            meta = get_pair_meta(pair_key)
                            # Daily vol ≈ annual vol proxy × 10 = conservative daily move
                            daily_move = (meta.typical_spread_bps / 10000.0) * 10
                            fx_contrib = amount_usd * daily_move
                        except (ValueError, ImportError):
                            fx_contrib = amount_usd * 0.01  # Ultimate fallback

        # Carry contribution: interest differential ? notional ? time
        time_frac = maturity_months / 12.0
        r_base = _get_rate(interest_curves, base_currency)
        r_local = _get_rate(interest_curves, currency)
        carry_contrib = abs(amount_usd) * (r_local - r_base) / 100.0 * time_frac

        # Basis contribution
        basis_key = f"{base_currency}{currency}"
        basis_bps = basis_spreads.get(basis_key, 0.0)
        basis_contrib = abs(amount_usd) * (basis_bps / 10000.0)

        # Funding contribution
        funding_contrib = abs(amount_usd) * (funding_bps / 10000.0) * time_frac

        total_pnl = fx_contrib + carry_contrib + basis_contrib - funding_contrib

        attributions.append(PositionAttribution(
            position_id=pos_id,
            currency=currency,
            nav_local=nav_local,
            nav_base=nav_base,
            fx_contribution=fx_contrib,
            carry_contribution=carry_contrib,
            basis_contribution=basis_contrib,
            funding_contribution=funding_contrib,
            total_pnl=total_pnl,
        ))

    total_nav = sum(a.nav_base for a in attributions)
    total_fx = sum(a.fx_contribution for a in attributions)
    total_carry = sum(a.carry_contribution for a in attributions)
    total_basis = sum(a.basis_contribution for a in attributions)
    total_funding = sum(a.funding_contribution for a in attributions)
    total_pnl = sum(a.total_pnl for a in attributions)

    return NavAttributionResult(
        positions=attributions,
        total_nav_base=total_nav,
        total_fx_contribution=total_fx,
        total_carry_contribution=total_carry,
        total_basis_contribution=total_basis,
        total_funding_contribution=total_funding,
        total_pnl=total_pnl,
        base_currency=base_currency,
    )


def _get_rate(curves: dict[str, dict[str, float]], currency: str) -> float:
    curve = curves.get(currency, {})
    return curve.get("3M", 0.0)


def _estimate_months(maturity: str) -> int:
    try:
        parts = maturity.split("-")
        return max(1, int(parts[1])) if len(parts) >= 2 else 3
    except (ValueError, IndexError):
        return 3
