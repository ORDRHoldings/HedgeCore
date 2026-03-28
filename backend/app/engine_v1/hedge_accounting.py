"""
app/engine_v1/hedge_accounting.py
ASC 815 / IAS 39 Hedge Effectiveness Assessment.

RPT-03: Retrospective effectiveness testing using two methods:
  1. Dollar-offset method (simple, widely used)
  2. Regression method (for 30+ data points; preferred under IFRS 9)

Pure computation — no I/O, no state.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class EffectivenessResult:
    """Result of a hedge effectiveness test."""

    dollar_offset_ratio: float
    """Ratio of hedging instrument FV change to hedged item FV change (negated).
    Effective band: 0.80 – 1.25 (ASC 815 / IAS 39)."""

    is_effective: bool
    """True if ratio falls within [0.80, 1.25]."""

    regression_r_squared: float | None
    """R² from regression test (None if dollar-offset method used)."""

    regression_slope: float | None
    """Regression slope β (None if dollar-offset method used)."""

    method: str
    """'dollar_offset' | 'regression' | 'regression_insufficient_data'"""

    def to_dict(self) -> dict[str, Any]:
        return {
            "dollar_offset_ratio": self.dollar_offset_ratio,
            "is_effective": self.is_effective,
            "regression_r_squared": self.regression_r_squared,
            "regression_slope": self.regression_slope,
            "method": self.method,
        }


# --------------------------------------------------------------------------
# Method 1: Dollar-Offset
# --------------------------------------------------------------------------

def assess_hedge_effectiveness_dollar_offset(
    hedged_item_fair_value_changes: list[float],
    hedging_instrument_fair_value_changes: list[float],
) -> EffectivenessResult:
    """ASC 815 / IAS 39 retrospective dollar-offset effectiveness test.

    Ratio = -(sum of hedging instrument FV changes) / (sum of hedged item FV changes)
    Effective if 0.80 <= ratio <= 1.25.

    Args:
        hedged_item_fair_value_changes: Period-by-period FV changes for the hedged item.
        hedging_instrument_fair_value_changes: Period-by-period FV changes for the hedge.

    Returns:
        EffectivenessResult with dollar_offset_ratio and is_effective flag.
    """
    sum_hedged = sum(hedged_item_fair_value_changes)
    sum_instrument = sum(hedging_instrument_fair_value_changes)

    if abs(sum_hedged) < 1e-10:
        return EffectivenessResult(
            dollar_offset_ratio=0.0,
            is_effective=False,
            regression_r_squared=None,
            regression_slope=None,
            method="dollar_offset",
        )

    ratio = -sum_instrument / sum_hedged

    return EffectivenessResult(
        dollar_offset_ratio=ratio,
        is_effective=(0.80 <= ratio <= 1.25),
        regression_r_squared=None,
        regression_slope=None,
        method="dollar_offset",
    )


# --------------------------------------------------------------------------
# Method 2: Regression
# --------------------------------------------------------------------------

def assess_hedge_effectiveness_regression(
    hedged_item_changes: list[float],
    instrument_changes: list[float],
) -> EffectivenessResult:
    """Regression-based effectiveness test (requires ≥30 data points).

    Effective if: R² ≥ 0.80, slope between -1.25 and -0.80, relationship significant.

    Args:
        hedged_item_changes: Period-by-period changes for the hedged item (X).
        instrument_changes: Period-by-period changes for the hedging instrument (Y).

    Returns:
        EffectivenessResult with R² and slope.
    """
    n = len(hedged_item_changes)
    if n < 30:
        return EffectivenessResult(
            dollar_offset_ratio=0.0,
            is_effective=False,
            regression_r_squared=None,
            regression_slope=None,
            method="regression_insufficient_data",
        )

    x = hedged_item_changes
    y = instrument_changes
    x_mean = sum(x) / n
    y_mean = sum(y) / n

    ss_xy = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, y, strict=False))
    ss_xx = sum((xi - x_mean) ** 2 for xi in x)
    ss_yy = sum((yi - y_mean) ** 2 for yi in y)

    if ss_xx < 1e-10 or ss_yy < 1e-10:
        return EffectivenessResult(
            dollar_offset_ratio=0.0,
            is_effective=False,
            regression_r_squared=0.0,
            regression_slope=0.0,
            method="regression",
        )

    slope = ss_xy / ss_xx
    r_squared = (ss_xy ** 2) / (ss_xx * ss_yy)

    is_effective = (r_squared >= 0.80) and (-1.25 <= slope <= -0.80)

    return EffectivenessResult(
        dollar_offset_ratio=-slope,
        is_effective=is_effective,
        regression_r_squared=r_squared,
        regression_slope=slope,
        method="regression",
    )
