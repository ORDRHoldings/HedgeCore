"""engine_v1/geo_overlay.py — Geopolitical overlay (Layer 3)

Pure deterministic overlay that applies geopolitical risk adjustments
to hedge ratios. Preserves frozen kernel semantics.

When disabled (default): returns inputs unchanged — v1 parity guaranteed.
When enabled: applies ratio haircuts based on corridor risk scores.

Architecture: ADR-0004, Layer 3.
Source: Polisophic corridor scores.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


# ─────────────────────────────────────────────────────────────────────────────
# Corridor → currency pair mapping (deterministic)
# ─────────────────────────────────────────────────────────────────────────────

PAIR_TO_CORRIDOR: dict[str, str] = {
    "USDMXN": "US-MX", "USDCAD": "US-CA", "USDBRL": "US-BR",
    "USDCOP": "US-CO", "USDCLP": "US-CL", "USDPEN": "US-PE",
    "USDARS": "US-AR", "EURUSD": "EU-US", "GBPUSD": "UK-US",
    "USDJPY": "US-JP", "USDCNY": "US-CN", "USDINR": "US-IN",
    "USDTRY": "US-TR", "USDZAR": "US-ZA", "USDKRW": "US-KR",
    "USDIDR": "US-ID", "USDPHP": "US-PH", "USDTHB": "US-TH",
    "USDPLN": "EU-PL", "USDHUF": "EU-HU", "USDCZK": "EU-CZ",
    "USDRON": "EU-RO", "USDCHF": "EU-CH", "AUDUSD": "AU-US",
    "NZDUSD": "NZ-US", "EURGBP": "EU-UK",
}


def pair_to_corridor(pair: str) -> str | None:
    """Map currency pair to geopolitical corridor."""
    return PAIR_TO_CORRIDOR.get(pair.upper())


# ─────────────────────────────────────────────────────────────────────────────
# Ratio haircut — reduces hedge ratio based on escalation risk
# ─────────────────────────────────────────────────────────────────────────────

def compute_ratio_haircut(
    normalized_score: float,
    escalation_threshold: float = 0.7,
    max_haircut: float = 0.10,
) -> float:
    """Compute hedge ratio haircut for geopolitical risk.

    Parameters
    ----------
    normalized_score : float
        Polisophic corridor score [0.0, 1.0]. 0 = stable, 1 = crisis.
    escalation_threshold : float
        Score above which haircut applies (default 0.7).
    max_haircut : float
        Maximum ratio reduction (default 10% = 0.10).

    Returns
    -------
    float : haircut in [0.0, max_haircut].
        0.0 = no haircut (below threshold).
        Linear interpolation from threshold to 1.0.

    When score < threshold: haircut = 0.0 (no impact).
    When score = 1.0: haircut = max_haircut.
    """
    if normalized_score <= escalation_threshold:
        return 0.0
    # Linear interpolation: threshold → 1.0 maps to 0 → max_haircut
    range_width = 1.0 - escalation_threshold
    if range_width <= 0.0:
        return max_haircut
    progress = (normalized_score - escalation_threshold) / range_width
    return min(max_haircut, progress * max_haircut)


def apply_haircut_to_ratio(
    hedge_ratio: float,
    haircut: float,
) -> float:
    """Apply haircut: effective_ratio = max(0, ratio - haircut)."""
    return max(0.0, hedge_ratio - haircut)


# ─────────────────────────────────────────────────────────────────────────────
# Main overlay function — preprocessing layer
# ─────────────────────────────────────────────────────────────────────────────

def apply_geopolitical_overlay(
    policy: Mapping[str, Any],
    corridor_scores: Mapping[str, float] | None = None,
    *,
    pair: str | None = None,
) -> dict[str, Any]:
    """Apply geopolitical risk overlay as a preprocessing layer.

    Parameters
    ----------
    policy : dict
        Policy config with geopolitical fields.
    corridor_scores : dict or None
        Map of corridor → normalized_score (0.0-1.0).
        From GeopoliticalRiskSnapshot data.
    pair : str or None
        Currency pair to look up corridor for.

    Returns
    -------
    dict with keys:
        - active: bool
        - corridor: str or None
        - score: float
        - regime: str
        - haircut: float (0.0 = no haircut)
        - adjustments: list of named adjustments
        - grading: 'HEURISTIC'

    When inactive, haircut is 0.0 — v1 parity guaranteed.
    """
    result: dict[str, Any] = {
        "active": False,
        "corridor": None,
        "score": 0.0,
        "regime": "STABLE",
        "haircut": 0.0,
        "adjustments": [],
        "grading": "HEURISTIC",
    }

    # Check if overlay is enabled
    geo_enabled = bool(policy.get("geopolitical_overlay_enabled", False))
    if not geo_enabled:
        return result

    if corridor_scores is None or not corridor_scores:
        return result

    result["active"] = True

    # Determine corridor from pair
    corridor = None
    if pair:
        corridor = pair_to_corridor(pair)
    result["corridor"] = corridor

    if corridor is None or corridor not in corridor_scores:
        result["adjustments"].append({
            "name": "no_corridor_data",
            "pair": pair,
            "corridor": corridor,
            "impact": "none",
        })
        return result

    score = float(corridor_scores[corridor])
    result["score"] = score

    # Classify regime
    if score < 0.3:
        result["regime"] = "STABLE"
    elif score < 0.7:
        result["regime"] = "ELEVATED"
    else:
        result["regime"] = "CRISIS"

    # Compute haircut
    threshold = float(policy.get("geopolitical_escalation_threshold", 0.7))
    max_hc = float(policy.get("geopolitical_ratio_haircut_max", 0.10))
    haircut = compute_ratio_haircut(score, threshold, max_hc)
    result["haircut"] = haircut

    if haircut > 0.0:
        result["adjustments"].append({
            "name": "ratio_haircut",
            "corridor": corridor,
            "score": score,
            "threshold": threshold,
            "haircut": haircut,
            "max_haircut": max_hc,
        })

    return result
