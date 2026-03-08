"""engine_v1/vol_overlay.py — Volatility overlay (Layer 2)

Pure deterministic overlay that adjusts hedge sizing and strategy selection
based on volatility regime data. Preserves frozen kernel semantics.

When disabled (default): returns inputs unchanged — v1 parity guaranteed.
When enabled: applies volatility-scaled adjustments as a preprocessing layer.

Architecture: ADR-0004, Layer 2.
Calibration: docs/architecture/whitepapers/scenario-methodology.md
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


# ─────────────────────────────────────────────────────────────────────────────
# Fallback volatilities by region (calibrated to BIS Triennial 2022)
# ─────────────────────────────────────────────────────────────────────────────

FALLBACK_VOLS: dict[str, float] = {
    "G10":       0.08,  # 8% annualized
    "EM_LATAM":  0.14,  # 14%
    "EM_ASIA":   0.10,  # 10%
    "EM_CEEMEA": 0.16,  # 16%
}

BASELINE_VOL = 0.15  # 15% — reference for vol scaling

# Pair → region mapping (deterministic)
PAIR_REGION: dict[str, str] = {
    "EURUSD": "G10", "GBPUSD": "G10", "USDJPY": "G10", "USDCHF": "G10",
    "AUDUSD": "G10", "NZDUSD": "G10", "USDCAD": "G10", "EURGBP": "G10",
    "USDMXN": "EM_LATAM", "USDBRL": "EM_LATAM", "USDCOP": "EM_LATAM",
    "USDCLP": "EM_LATAM", "USDPEN": "EM_LATAM", "USDARS": "EM_LATAM",
    "USDINR": "EM_ASIA", "USDIDR": "EM_ASIA", "USDPHP": "EM_ASIA",
    "USDTHB": "EM_ASIA", "USDKRW": "EM_ASIA", "USDCNY": "EM_ASIA",
    "USDTRY": "EM_CEEMEA", "USDZAR": "EM_CEEMEA", "USDPLN": "EM_CEEMEA",
    "USDHUF": "EM_CEEMEA", "USDCZK": "EM_CEEMEA", "USDRON": "EM_CEEMEA",
}


def get_region(pair: str) -> str:
    """Deterministic region lookup with fallback."""
    return PAIR_REGION.get(pair.upper(), "EM_LATAM")


def get_fallback_vol(pair: str) -> float:
    """Fallback vol for a pair when no live data."""
    return FALLBACK_VOLS.get(get_region(pair), BASELINE_VOL)


# ─────────────────────────────────────────────────────────────────────────────
# Vol regime thresholds
# ─────────────────────────────────────────────────────────────────────────────

def classify_regime(vol: float) -> str:
    """Deterministic regime from annualized vol."""
    if vol < 0.06:
        return "LOW"
    if vol < 0.14:
        return "NORMAL"
    if vol < 0.22:
        return "ELEVATED"
    return "CRISIS"


# ─────────────────────────────────────────────────────────────────────────────
# Band widening — adjusts hedge ratio bands in elevated/crisis vol
# ─────────────────────────────────────────────────────────────────────────────

# Widening multipliers by regime (1.0 = no change, >1.0 = wider band)
BAND_WIDENING: dict[str, float] = {
    "LOW":      0.9,   # Tighter bands in low-vol (precision opportunity)
    "NORMAL":   1.0,   # Baseline
    "ELEVATED": 1.15,  # 15% wider bands
    "CRISIS":   1.30,  # 30% wider bands
}


def compute_band_widening(vol_regime: str) -> float:
    """Return band multiplier for current vol regime."""
    return BAND_WIDENING.get(vol_regime, 1.0)


# ─────────────────────────────────────────────────────────────────────────────
# Ratio adjustment — scales hedge ratios based on vol level
# ─────────────────────────────────────────────────────────────────────────────

def compute_ratio_adjustment(
    current_vol: float,
    baseline_vol: float = BASELINE_VOL,
    *,
    clamp_min: float = 0.85,
    clamp_max: float = 1.15,
) -> float:
    """Ratio scaling factor: higher vol → higher hedge ratio (up to cap).

    Formula: multiplier = clamp(current_vol / baseline_vol, clamp_min, clamp_max)
    When vol = baseline: multiplier = 1.0 (no change)
    When vol > baseline: multiplier > 1.0 (hedge more)
    When vol < baseline: multiplier < 1.0 (hedge less)
    """
    if baseline_vol <= 0.0:
        return 1.0
    raw = current_vol / baseline_vol
    return max(clamp_min, min(clamp_max, raw))


# ─────────────────────────────────────────────────────────────────────────────
# Main overlay function — preprocessing layer
# ─────────────────────────────────────────────────────────────────────────────

def apply_volatility_overlay(
    policy: Mapping[str, Any],
    vol_data: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Apply volatility overlay adjustments as a preprocessing layer.

    Parameters
    ----------
    policy : dict
        Policy config (ExtendedPolicyConfig-shaped or PolicyBundle-shaped).
        Must include volatility-related fields.
    vol_data : dict or None
        Current volatility data: {pair, vol_annualized, regime, ...}
        If None, overlay is inactive.

    Returns
    -------
    dict with keys:
        - adjustments: list of named adjustments applied
        - band_multiplier: float (1.0 = no change)
        - ratio_multiplier: float (1.0 = no change)
        - regime: str
        - active: bool
        - grading: 'HEURISTIC' — labels this as rule-based

    When inactive, all multipliers are 1.0 — v1 parity guaranteed.
    """
    result: dict[str, Any] = {
        "active": False,
        "adjustments": [],
        "band_multiplier": 1.0,
        "ratio_multiplier": 1.0,
        "regime": "NORMAL",
        "grading": "HEURISTIC",
    }

    # Check if overlay is enabled in policy
    vol_enabled = bool(policy.get("volatility_regime_enabled", False))
    if not vol_enabled or vol_data is None:
        return result

    result["active"] = True
    pair = str(vol_data.get("pair", ""))
    vol_annualized = float(vol_data.get("vol_annualized", 0.0) or 0.0)

    # Use live vol if available, else fallback
    if vol_annualized <= 0.0:
        vol_annualized = get_fallback_vol(pair)
        result["adjustments"].append({
            "name": "fallback_vol_substitution",
            "pair": pair,
            "fallback_vol": vol_annualized,
            "region": get_region(pair),
        })

    regime = vol_data.get("regime") or classify_regime(vol_annualized)
    result["regime"] = regime

    # Band widening
    band_widening_enabled = bool(policy.get("volatility_band_widening_enabled", False))
    if band_widening_enabled:
        multiplier = compute_band_widening(regime)
        result["band_multiplier"] = multiplier
        if multiplier != 1.0:
            result["adjustments"].append({
                "name": "band_widening",
                "regime": regime,
                "multiplier": multiplier,
            })

    # Ratio adjustment
    ratio_adjustment_enabled = bool(policy.get("volatility_ratio_adjustment_enabled", False))
    if ratio_adjustment_enabled:
        baseline = float(policy.get("volatility_baseline_vol", BASELINE_VOL) or BASELINE_VOL)
        ratio_mult = compute_ratio_adjustment(vol_annualized, baseline)
        result["ratio_multiplier"] = ratio_mult
        if ratio_mult != 1.0:
            result["adjustments"].append({
                "name": "ratio_adjustment",
                "current_vol": vol_annualized,
                "baseline_vol": baseline,
                "multiplier": ratio_mult,
            })

    return result
