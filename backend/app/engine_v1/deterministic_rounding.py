"""A33: Deterministic Rounding Layer.

Prevents floating-point replay divergence by applying fixed-precision
rounding before freeze_artifact creation.

Applied before freeze:
- 6 decimal places for ratios
- 2 decimals for currency amounts
- 8 decimals for FX rates

Replay compares rounded values only.
"""

from __future__ import annotations

from typing import Any


# Default precision map
DEFAULT_PRECISION: dict[str, int] = {
    "ratio": 6,
    "currency": 2,
    "fx_rate": 8,
}

# Fields that are ratios
_RATIO_FIELDS = {
    "hedge_ratio", "effective_ratio", "allocation_pct", "margin_utilization_pct",
    "liquidity_score", "participation_rate", "hedge_effectiveness",
    "hedge_effectiveness_ratio", "diversification_ratio", "netting_efficiency_pct",
    "capital_buffer_ratio", "concentration_pct",
}

# Fields that are currency amounts
_CURRENCY_FIELDS = {
    "amount_usd", "amount_local", "action_usd", "action_mxn", "notional_usd",
    "initial_margin", "maintenance_margin", "stress_margin", "funding_cost",
    "slippage_usd", "total_cost", "carry_cost_usd", "slippage_cost",
    "broker_commission", "exchange_fee", "clearing_fee", "vol_drift_adjustment",
    "nav_local", "nav_base", "fx_contribution", "carry_contribution",
    "basis_contribution", "funding_contribution", "total_pnl",
    "pre_hedge_loss_usd", "post_hedge_loss_usd", "margin_impact_usd",
    "gross_notional", "net_notional", "delta_fx", "carry_component",
    "basis_component", "duration_fx", "total_slippage_usd",
    "total_transaction_cost", "savings_usd", "worst_case_loss_usd",
    "margin_budget_usd",
}

# Fields that are FX rates
_FX_FIELDS = {
    "spot_usdmxn", "fx_rate", "forward_points", "actual_forward",
    "theoretical_forward", "deviation",
}


def _classify_field(name: str) -> str:
    """Classify a field name to determine rounding precision."""
    name_lower = name.lower()
    if name_lower in _RATIO_FIELDS or name_lower.endswith("_ratio") or name_lower.endswith("_pct"):
        return "ratio"
    if name_lower in _CURRENCY_FIELDS or name_lower.endswith("_usd") or name_lower.endswith("_mxn"):
        return "currency"
    if name_lower in _FX_FIELDS or "forward_point" in name_lower or "fx_rate" in name_lower:
        return "fx_rate"
    # Default to ratio precision for unknown numeric fields
    return "ratio"


def round_value(value: float, field_name: str, precision_map: dict[str, int] | None = None) -> float:
    """Round a single value based on field classification.

    Parameters
    ----------
    value : float
        Value to round.
    field_name : str
        Field name for classification.
    precision_map : dict[str, int] | None
        Custom precision map. Defaults to standard precision.

    Returns
    -------
    float
        Rounded value.
    """
    prec = precision_map or DEFAULT_PRECISION
    category = _classify_field(field_name)
    decimals = prec.get(category, 6)
    return round(value, decimals)


def round_dict(
    data: dict[str, Any],
    precision_map: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Recursively round all float values in a dict.

    Parameters
    ----------
    data : dict
        Dictionary to process.
    precision_map : dict[str, int] | None
        Custom precision map.

    Returns
    -------
    dict
        Dict with all floats rounded.
    """
    prec = precision_map or DEFAULT_PRECISION
    result: dict[str, Any] = {}

    for key, value in data.items():
        if isinstance(value, float):
            result[key] = round_value(value, key, prec)
        elif isinstance(value, dict):
            result[key] = round_dict(value, prec)
        elif isinstance(value, list):
            result[key] = round_list(value, key, prec)
        else:
            result[key] = value

    return result


def round_list(
    data: list,
    parent_key: str = "",
    precision_map: dict[str, int] | None = None,
) -> list:
    """Recursively round all float values in a list.

    Parameters
    ----------
    data : list
        List to process.
    parent_key : str
        Parent field name for classification context.
    precision_map : dict[str, int] | None
        Custom precision map.

    Returns
    -------
    list
        List with all floats rounded.
    """
    prec = precision_map or DEFAULT_PRECISION
    result: list = []

    for item in data:
        if isinstance(item, float):
            result.append(round_value(item, parent_key, prec))
        elif isinstance(item, dict):
            result.append(round_dict(item, prec))
        elif isinstance(item, list):
            result.append(round_list(item, parent_key, prec))
        else:
            result.append(item)

    return result


def round_freeze_artifact(
    artifact: dict[str, Any],
    precision_map: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Apply deterministic rounding to a complete freeze artifact.

    This is the primary entry point -- called before storing freeze_artifact
    in proposals and before replay comparison.

    Parameters
    ----------
    artifact : dict
        Complete freeze artifact dict.
    precision_map : dict[str, int] | None
        Custom precision map from policy.rounding_precision.

    Returns
    -------
    dict
        Rounded artifact.
    """
    return round_dict(artifact, precision_map)
