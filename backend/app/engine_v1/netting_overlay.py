"""engine_v1/netting_overlay.py — Netting preprocessing overlay (Layer 6)

Pure deterministic overlay that applies currency netting as a preprocessing
step before the frozen kernel computes individual hedge legs.

When disabled (default): returns inputs unchanged — v1 parity guaranteed.
When enabled: nets offsetting exposures across positions, reducing gross
notional and hedge leg count. Uses existing currency_netting_matrix.py.

Architecture: ADR-0004, Layer 6.
This module does NOT modify the frozen kernel. It modifies the INPUT to the
kernel (exposure aggregation), preserving deterministic replay semantics.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

# ─────────────────────────────────────────────────────────────────────────────
# Netting engine — pure deterministic exposure aggregation
# ─────────────────────────────────────────────────────────────────────────────

def compute_net_exposures(
    exposures: list[dict[str, Any]],
    *,
    net_confirmed_forecast: bool = False,
) -> dict[str, Any]:
    """Net offsetting exposures across currency pairs.

    Parameters
    ----------
    exposures : list[dict]
        Each has: pair, notional_usd, direction ('BUY'|'SELL'), flow_type ('confirmed'|'forecast')
    net_confirmed_forecast : bool
        If True, net confirmed against forecast (more aggressive netting).
        If False, net only within same flow type (conservative).

    Returns
    -------
    dict with:
        - net_exposures: list[dict] — netted exposure set
        - netting_savings: dict — savings metrics
        - legs_eliminated: int
        - gross_notional: float
        - net_notional: float
        - adjustments: list of named netting actions
    """
    if not exposures:
        return {
            "net_exposures": [],
            "netting_savings": {"gross_notional": 0.0, "net_notional": 0.0, "savings_pct": 0.0},
            "legs_eliminated": 0,
            "adjustments": [],
        }

    # Aggregate by (pair, flow_type if not cross-netting)
    gross_notional = 0.0
    pair_buckets: dict[str, dict[str, Any]] = {}

    for exp in exposures:
        pair = str(exp.get("pair", "")).upper()
        notional = float(exp.get("notional_usd", 0.0))
        direction = str(exp.get("direction", "BUY")).upper()
        flow_type = str(exp.get("flow_type", "confirmed")).lower()

        gross_notional += abs(notional)

        # Signed notional: BUY = positive, SELL = negative
        signed = notional if direction == "BUY" else -notional

        key = pair if net_confirmed_forecast else f"{pair}:{flow_type}"
        if key not in pair_buckets:
            pair_buckets[key] = {"buy": 0.0, "sell": 0.0, "pair": pair, "flow_type": flow_type}

        if signed >= 0:
            pair_buckets[key]["buy"] += signed
        else:
            pair_buckets[key]["sell"] += abs(signed)

    # Compute net for each bucket
    net_exposures: list[dict[str, Any]] = []
    adjustments: list[dict[str, Any]] = []
    legs_before = len(exposures)

    for key, bucket in sorted(pair_buckets.items()):
        buy = bucket["buy"]
        sell = bucket["sell"]
        net = buy - sell
        pair = bucket["pair"]

        if abs(net) < 1.0:
            # Fully netted — eliminate this leg
            adjustments.append({
                "name": "full_netting",
                "pair": pair,
                "buy_notional": buy,
                "sell_notional": sell,
                "net": 0.0,
            })
            continue

        direction = "BUY" if net > 0 else "SELL"
        net_exposures.append({
            "pair": pair,
            "notional_usd": abs(net),
            "direction": direction,
            "flow_type": bucket["flow_type"],
            "netted": True,
            "gross_buy": buy,
            "gross_sell": sell,
        })

        if buy > 0 and sell > 0:
            adjustments.append({
                "name": "partial_netting",
                "pair": pair,
                "buy_notional": buy,
                "sell_notional": sell,
                "net_notional": abs(net),
                "savings": min(buy, sell),
            })

    net_notional = sum(e["notional_usd"] for e in net_exposures)
    legs_eliminated = legs_before - len(net_exposures)
    savings_pct = ((gross_notional - net_notional) / gross_notional * 100) if gross_notional > 0 else 0.0

    return {
        "net_exposures": net_exposures,
        "netting_savings": {
            "gross_notional": gross_notional,
            "net_notional": net_notional,
            "savings_pct": round(savings_pct, 2),
            "margin_savings_estimate": round(net_notional * 0.03, 2),  # ~3% margin on netted
        },
        "legs_eliminated": legs_eliminated,
        "adjustments": adjustments,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Main overlay function — preprocessing layer
# ─────────────────────────────────────────────────────────────────────────────

def apply_netting_overlay(
    policy: Mapping[str, Any],
    exposures: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Apply netting overlay as exposure preprocessing.

    Parameters
    ----------
    policy : dict
        Policy config with netting fields:
        - netting_enabled: bool (default False)
        - netting_net_confirmed_forecast: bool (default False)
        - netting_settlement_cycle_days: int (default 2)
    exposures : list[dict] or None
        Exposure list to net.

    Returns
    -------
    dict with keys:
        - active: bool
        - net_exposures: list[dict] — netted or original exposures
        - netting_savings: dict
        - settlement_cycle_days: int
        - adjustments: list
        - grading: 'HEURISTIC'

    When inactive, returns original exposures unchanged — v1 parity guaranteed.
    """
    original = exposures or []

    result: dict[str, Any] = {
        "active": False,
        "net_exposures": original,
        "netting_savings": {"gross_notional": 0.0, "net_notional": 0.0, "savings_pct": 0.0},
        "legs_eliminated": 0,
        "settlement_cycle_days": 2,
        "adjustments": [],
        "grading": "HEURISTIC",
    }

    netting_enabled = bool(policy.get("netting_enabled", False))
    if not netting_enabled or not exposures:
        return result

    result["active"] = True
    result["settlement_cycle_days"] = int(policy.get("netting_settlement_cycle_days", 2))

    net_confirmed_forecast = bool(policy.get("netting_net_confirmed_forecast", False))
    netting_result = compute_net_exposures(
        exposures,
        net_confirmed_forecast=net_confirmed_forecast,
    )

    result["net_exposures"] = netting_result["net_exposures"]
    result["netting_savings"] = netting_result["netting_savings"]
    result["legs_eliminated"] = netting_result["legs_eliminated"]
    result["adjustments"] = netting_result["adjustments"]

    return result
