"""
engine_v1/ir_hedge_effectiveness.py
IFRS 9.6.4.1 hedge effectiveness testing for IR hedges.

Mirrors hedge_accounting.py structure. Pure computation — no I/O, no state.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class IREffectivenessResult:
    method: str
    ratio: float          # dollar-offset ratio, or R² for regression
    passed: bool
    prospective: bool
    retrospective: bool
    evidence_bundle: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "method": self.method,
            "ratio": self.ratio,
            "passed": self.passed,
            "prospective": self.prospective,
            "retrospective": self.retrospective,
            "evidence_bundle": self.evidence_bundle,
        }


_LOWER = 0.80
_UPPER = 1.25


def test_ir_effectiveness(
    hedged_item_fv_changes: list[float],
    instrument_fv_changes: list[float],
    method: str = "DOLLAR_OFFSET",
) -> IREffectivenessResult:
    """IFRS 9 hedge effectiveness test for IR hedges.

    Dollar-offset: ratio = -(sum instrument FV changes) / (sum hedged item FV changes).
    Pass: 0.80 <= ratio <= 1.25.

    Regression: pass when R² >= 0.80 and slope in [-1.25, -0.80].
    """
    if method == "DOLLAR_OFFSET":
        return _dollar_offset(hedged_item_fv_changes, instrument_fv_changes)
    return _regression(hedged_item_fv_changes, instrument_fv_changes)


def _dollar_offset(
    hedged: list[float],
    instrument: list[float],
) -> IREffectivenessResult:
    if len(hedged) != len(instrument):
        raise ValueError(f"Length mismatch: {len(hedged)} hedged vs {len(instrument)} instrument periods")
    sum_hedged = sum(hedged)
    sum_instrument = sum(instrument)

    if abs(sum_hedged) < 1e-10:
        ratio = 0.0
    else:
        ratio = -sum_instrument / sum_hedged

    passed = _LOWER <= ratio <= _UPPER
    return IREffectivenessResult(
        method="DOLLAR_OFFSET",
        ratio=round(ratio, 6),
        passed=passed,
        prospective=passed,
        retrospective=passed,
        evidence_bundle={
            "hedged_item_fv_changes": hedged,
            "instrument_fv_changes": instrument,
            "sum_hedged": sum_hedged,
            "sum_instrument": sum_instrument,
            "ratio": ratio,
            "lower_bound": _LOWER,
            "upper_bound": _UPPER,
        },
    )


def _regression(
    hedged: list[float],
    instrument: list[float],
) -> IREffectivenessResult:
    if len(hedged) != len(instrument):
        raise ValueError(f"Length mismatch: {len(hedged)} hedged vs {len(instrument)} instrument periods")
    n = len(hedged)
    if n < 2:
        return IREffectivenessResult(
            method="REGRESSION_INSUFFICIENT_DATA",
            ratio=0.0,
            passed=False,
            prospective=False,
            retrospective=False,
            evidence_bundle={"error": "need at least 2 data points"},
        )

    mean_x = sum(hedged) / n
    mean_y = sum(instrument) / n
    ss_xx = sum((x - mean_x) ** 2 for x in hedged)
    ss_yy = sum((y - mean_y) ** 2 for y in instrument)
    ss_xy = sum((x - mean_x) * (y - mean_y) for x, y in zip(hedged, instrument))

    if ss_xx < 1e-10 or ss_yy < 1e-10:
        return IREffectivenessResult(
            method="REGRESSION",
            ratio=0.0,
            passed=False,
            prospective=False,
            retrospective=False,
            evidence_bundle={"error": "zero variance"},
        )

    slope = ss_xy / ss_xx
    r_squared = (ss_xy ** 2) / (ss_xx * ss_yy)
    passed = r_squared >= 0.80 and -1.25 <= slope <= -0.80

    return IREffectivenessResult(
        method="REGRESSION",
        ratio=round(r_squared, 6),
        passed=passed,
        prospective=passed,
        retrospective=passed,
        evidence_bundle={
            "hedged_item_fv_changes": hedged,
            "instrument_fv_changes": instrument,
            "r_squared": r_squared,
            "slope": slope,
        },
    )
