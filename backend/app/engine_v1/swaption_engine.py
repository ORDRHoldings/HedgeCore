"""
engine_v1/swaption_engine.py
Price European swaptions, caps, floors, and collars.

Uses Black-76 (log-normal) for rate > 0.5%, Bachelier (normal) otherwise.
Pure computation — no I/O, no state.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date

from app.engine_v1.ir_curve_engine import IRCurve
from app.engine_v1.swap_valuator import SwapSpec, value_swap


@dataclass
class SwaptionSpec:
    instrument_type: str   # "SWAPTION" | "CAP" | "FLOOR" | "COLLAR"
    notional: float
    option_expiry: date
    underlying_swap: SwapSpec
    strike: float
    vol: float
    model: str             # "BLACK76" | "BACHELIER" | "AUTO"


@dataclass
class SwaptionValuation:
    premium: float
    delta: float
    vega: float
    theta: float
    model_used: str

    def to_dict(self) -> dict:
        return {
            "premium": self.premium, "delta": self.delta,
            "vega": self.vega, "theta": self.theta, "model_used": self.model_used,
        }


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def _black76(F: float, K: float, T: float, vol: float, df: float, is_payer: bool) -> tuple[float, float, float]:
    """Black-76 formula. Returns (premium, delta, vega)."""
    if T <= 0 or vol <= 0:
        intrinsic = max(0.0, (F - K) if is_payer else (K - F))
        return df * intrinsic, 0.0, 0.0
    sqrtT = math.sqrt(T)
    d1 = (math.log(F / K) + 0.5 * vol**2 * T) / (vol * sqrtT) if F > 0 and K > 0 else 0.0
    d2 = d1 - vol * sqrtT
    if is_payer:
        premium = df * (F * _norm_cdf(d1) - K * _norm_cdf(d2))
        delta = df * _norm_cdf(d1)
    else:
        premium = df * (K * _norm_cdf(-d2) - F * _norm_cdf(-d1))
        delta = -df * _norm_cdf(-d1)
    vega = df * F * _norm_pdf(d1) * sqrtT
    return premium, delta, vega


def _bachelier(F: float, K: float, T: float, vol: float, df: float, is_payer: bool) -> tuple[float, float, float]:
    """Bachelier (normal) formula. Returns (premium, delta, vega)."""
    if T <= 0 or vol <= 0:
        intrinsic = max(0.0, (F - K) if is_payer else (K - F))
        return df * intrinsic, 0.0, 0.0
    sqrtT = math.sqrt(T)
    sigma_t = vol * sqrtT
    d = (F - K) / sigma_t if sigma_t > 0 else 0.0
    if is_payer:
        premium = df * ((F - K) * _norm_cdf(d) + sigma_t * _norm_pdf(d))
        delta = df * _norm_cdf(d)
    else:
        premium = df * ((K - F) * _norm_cdf(-d) + sigma_t * _norm_pdf(d))
        delta = -df * _norm_cdf(-d)
    vega = df * sqrtT * _norm_pdf(d)
    return premium, delta, vega


def price_swaption(spec: SwaptionSpec, curve: IRCurve, as_of: date) -> SwaptionValuation:
    """Price a European swaption using Black-76 or Bachelier model."""
    T = max((spec.option_expiry - as_of).days / 365.0, 0.0)
    df = curve.discount_factor(T)
    val = value_swap(spec.underlying_swap, curve)
    F = val.par_rate  # forward swap rate

    if spec.model == "AUTO":
        model = "BACHELIER" if F <= 0.005 else "BLACK76"
    else:
        model = spec.model

    is_payer = spec.underlying_swap.pay_fixed
    K = spec.strike

    if model == "BLACK76" and F > 0 and K > 0:
        premium, delta, vega = _black76(F, K, T, spec.vol, df, is_payer)
    else:
        premium, delta, vega = _bachelier(F, K, T, spec.vol, df, is_payer)
        model = "BACHELIER"

    # Scale to notional (Black-76/Bachelier returns per-unit rate premium)
    premium_scaled = premium * spec.notional

    # Theta (time decay per day)
    if T > 1 / 365:
        T_minus = T - 1 / 365
        if model == "BLACK76" and F > 0 and K > 0:
            p2, _, _ = _black76(F, K, T_minus, spec.vol, df, is_payer)
        else:
            p2, _, _ = _bachelier(F, K, T_minus, spec.vol, df, is_payer)
        theta = (p2 - premium) * spec.notional
    else:
        theta = 0.0

    return SwaptionValuation(
        premium=max(0.0, premium_scaled),
        delta=delta,
        vega=vega * spec.notional,
        theta=theta,
        model_used=model,
    )
