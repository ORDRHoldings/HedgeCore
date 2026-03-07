"""
backend/app/engine/hedge_effectiveness_engine.py

IFRS 9 / ASC 815 Hedge Effectiveness Testing Engine

Deterministic assessment of hedge relationship effectiveness using:
  1. Dollar-offset method (cumulative ratio test, ASC 815 band: 0.80-1.25)
  2. Regression method (R^2 >= 0.80, slope in [-1.25, -0.80], requires >= 30 data points)
  3. Combined assessment (both methods for comprehensive compliance)

INVARIANTS:
  - Identical inputs produce identical outputs + identical hashes.
  - No live API calls. All data consumed from pre-validated input structures.
  - Fail-closed: insufficient data = structured rejection, not silent pass.
  - Every run produces a TraceBundle + RunEnvelope hashed with SHA-256.
  - Methodology version pinned to "1.0.0".
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime

from app.engine_v1.hedge_accounting import (
    EffectivenessResult,
    assess_hedge_effectiveness_dollar_offset,
    assess_hedge_effectiveness_regression,
)

METHODOLOGY_VERSION = "1.0.0"


# -- Hash helpers ------------------------------------------------------------

def _sha256_dict(d: dict) -> str:
    canonical = json.dumps(d, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# -- Input types -------------------------------------------------------------

@dataclass(frozen=True)
class EffectivenessPeriod:
    """One observation period in the effectiveness dataset."""
    period_index: int
    period_date: str | None
    hedged_item_fv_change: float
    instrument_fv_change: float

    def to_dict(self) -> dict:
        return {
            "period_index": self.period_index,
            "period_date": self.period_date,
            "hedged_item_fv_change": self.hedged_item_fv_change,
            "instrument_fv_change": self.instrument_fv_change,
        }


@dataclass(frozen=True)
class EffectivenessConfig:
    """Configuration for the effectiveness assessment."""
    standard: str = "ASC_815"
    method: str = "both"
    hedge_type: str = "cash_flow"
    currency_pair: str | None = None
    designation_date: str | None = None

    def to_dict(self) -> dict:
        return {
            "standard": self.standard,
            "method": self.method,
            "hedge_type": self.hedge_type,
            "currency_pair": self.currency_pair,
            "designation_date": self.designation_date,
        }


# -- Trace infrastructure ----------------------------------------------------

@dataclass
class TraceEvent:
    """Single trace event for audit transparency."""
    step: str
    description: str
    data: dict
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            object.__setattr__(self, "timestamp", datetime.now(UTC).isoformat())

    def to_dict(self) -> dict:
        return {
            "step": self.step,
            "description": self.description,
            "data": self.data,
            "timestamp": self.timestamp,
        }


# -- Output types ------------------------------------------------------------

@dataclass
class PeriodAnalysis:
    """Per-period detailed analysis."""
    period_index: int
    period_date: str | None
    hedged_item_fv_change: float
    instrument_fv_change: float
    cumulative_hedged: float
    cumulative_instrument: float
    period_ratio: float | None
    cumulative_ratio: float | None

    def to_dict(self) -> dict:
        return {
            "period_index": self.period_index,
            "period_date": self.period_date,
            "hedged_item_fv_change": self.hedged_item_fv_change,
            "instrument_fv_change": self.instrument_fv_change,
            "cumulative_hedged": self.cumulative_hedged,
            "cumulative_instrument": self.cumulative_instrument,
            "period_ratio": self.period_ratio,
            "cumulative_ratio": self.cumulative_ratio,
        }


@dataclass
class EffectivenessRunResult:
    """Complete result of a hedge effectiveness assessment run."""
    methodology_version: str
    standard: str
    hedge_type: str
    currency_pair: str | None
    period_count: int
    dollar_offset: EffectivenessResult | None
    regression: EffectivenessResult | None
    overall_effective: bool
    determination_narrative: str
    period_analysis: list[PeriodAnalysis]
    compliance_notes: list[str]
    inputs_hash: str
    outputs_hash: str
    run_hash: str
    trace_events: list[TraceEvent]

    def to_dict(self) -> dict:
        return {
            "methodology_version": self.methodology_version,
            "standard": self.standard,
            "hedge_type": self.hedge_type,
            "currency_pair": self.currency_pair,
            "period_count": self.period_count,
            "dollar_offset": self.dollar_offset.to_dict() if self.dollar_offset else None,
            "regression": self.regression.to_dict() if self.regression else None,
            "overall_effective": self.overall_effective,
            "determination_narrative": self.determination_narrative,
            "period_analysis": [p.to_dict() for p in self.period_analysis],
            "compliance_notes": self.compliance_notes,
            "inputs_hash": self.inputs_hash,
            "outputs_hash": self.outputs_hash,
            "run_hash": self.run_hash,
        }


# -- Engine ------------------------------------------------------------------

def run_hedge_effectiveness(
    dataset_id: str,
    periods: list[EffectivenessPeriod],
    config: EffectivenessConfig,
) -> EffectivenessRunResult:
    """
    Run a complete hedge effectiveness assessment.

    Given period-by-period fair value changes for the hedged item and hedging
    instrument, compute dollar-offset ratio, regression analysis, per-period
    ratios, overall effectiveness determination, and compliance narrative.

    All outputs are deterministic and SHA-256 hashed.
    """
    trace: list[TraceEvent] = []

    # -- Step 1: Validate inputs ---------------------------------------------
    trace.append(TraceEvent(
        step="VALIDATE_INPUTS",
        description=f"Received {len(periods)} periods for {config.standard} assessment",
        data={"period_count": len(periods), "standard": config.standard, "method": config.method},
    ))

    if len(periods) < 2:
        raise ValueError("At least 2 observation periods required for effectiveness testing")

    sorted_periods = sorted(periods, key=lambda p: p.period_index)

    # -- Step 2: Hash inputs -------------------------------------------------
    inputs_payload = {
        "dataset_id": dataset_id,
        "periods": [p.to_dict() for p in sorted_periods],
        "config": config.to_dict(),
        "methodology_version": METHODOLOGY_VERSION,
    }
    inputs_hash = _sha256_dict(inputs_payload)

    trace.append(TraceEvent(
        step="HASH_INPUTS",
        description=f"Inputs hashed: {inputs_hash[:16]}...",
        data={"inputs_hash": inputs_hash},
    ))

    # -- Step 3: Extract fair value change vectors ---------------------------
    hedged_changes = [p.hedged_item_fv_change for p in sorted_periods]
    instrument_changes = [p.instrument_fv_change for p in sorted_periods]

    trace.append(TraceEvent(
        step="EXTRACT_VECTORS",
        description=f"Extracted {len(hedged_changes)} FV change observations",
        data={
            "sum_hedged": round(sum(hedged_changes), 2),
            "sum_instrument": round(sum(instrument_changes), 2),
        },
    ))

    # -- Step 4: Per-period analysis -----------------------------------------
    period_analysis: list[PeriodAnalysis] = []
    cum_hedged = 0.0
    cum_instrument = 0.0

    for p in sorted_periods:
        cum_hedged += p.hedged_item_fv_change
        cum_instrument += p.instrument_fv_change

        period_ratio = None
        if abs(p.hedged_item_fv_change) > 1e-10:
            period_ratio = round(-p.instrument_fv_change / p.hedged_item_fv_change, 6)

        cum_ratio = None
        if abs(cum_hedged) > 1e-10:
            cum_ratio = round(-cum_instrument / cum_hedged, 6)

        period_analysis.append(PeriodAnalysis(
            period_index=p.period_index,
            period_date=p.period_date,
            hedged_item_fv_change=p.hedged_item_fv_change,
            instrument_fv_change=p.instrument_fv_change,
            cumulative_hedged=round(cum_hedged, 2),
            cumulative_instrument=round(cum_instrument, 2),
            period_ratio=period_ratio,
            cumulative_ratio=cum_ratio,
        ))

    trace.append(TraceEvent(
        step="PERIOD_ANALYSIS",
        description=f"Computed {len(period_analysis)} period ratios",
        data={
            "cumulative_hedged": round(cum_hedged, 2),
            "cumulative_instrument": round(cum_instrument, 2),
            "final_cumulative_ratio": period_analysis[-1].cumulative_ratio if period_analysis else None,
        },
    ))

    # -- Step 5: Dollar-offset test ------------------------------------------
    dollar_offset_result: EffectivenessResult | None = None
    method = config.method

    if method in ("dollar_offset", "both", "auto"):
        dollar_offset_result = assess_hedge_effectiveness_dollar_offset(
            hedged_changes, instrument_changes,
        )
        trace.append(TraceEvent(
            step="DOLLAR_OFFSET",
            description=(
                f"Dollar-offset ratio: {dollar_offset_result.dollar_offset_ratio:.4f}, "
                f"effective: {dollar_offset_result.is_effective}"
            ),
            data=dollar_offset_result.to_dict(),
        ))

    # -- Step 6: Regression test ---------------------------------------------
    regression_result: EffectivenessResult | None = None
    run_regression = method in ("regression", "both") or (
        method == "auto" and len(hedged_changes) >= 30
    )

    if run_regression:
        regression_result = assess_hedge_effectiveness_regression(
            hedged_changes, instrument_changes,
        )
        trace.append(TraceEvent(
            step="REGRESSION",
            description=(
                f"Regression R2: {regression_result.regression_r_squared}, "
                f"slope: {regression_result.regression_slope}, "
                f"effective: {regression_result.is_effective}, "
                f"method: {regression_result.method}"
            ),
            data=regression_result.to_dict(),
        ))

    if method == "auto" and dollar_offset_result is None:
        dollar_offset_result = assess_hedge_effectiveness_dollar_offset(
            hedged_changes, instrument_changes,
        )

    # -- Step 7: Overall determination ---------------------------------------
    compliance_notes: list[str] = []
    overall_effective = False

    if config.standard == "ASC_815":
        if dollar_offset_result:
            overall_effective = dollar_offset_result.is_effective
            compliance_notes.append(
                f"ASC 815 dollar-offset ratio: {dollar_offset_result.dollar_offset_ratio:.4f} "
                f"({'PASS' if dollar_offset_result.is_effective else 'FAIL'} "
                f"-- required: 0.80-1.25)"
            )
        if regression_result and regression_result.method != "regression_insufficient_data":
            compliance_notes.append(
                f"Supplementary regression: "
                f"R2={regression_result.regression_r_squared:.4f}, "
                f"slope={regression_result.regression_slope:.4f} "
                f"({'PASS' if regression_result.is_effective else 'FAIL'})"
            )

    elif config.standard in ("IFRS_9", "IAS_39"):
        if regression_result and regression_result.method != "regression_insufficient_data":
            overall_effective = regression_result.is_effective
            compliance_notes.append(
                f"IFRS 9 regression test: "
                f"R2={regression_result.regression_r_squared:.4f}, "
                f"slope={regression_result.regression_slope:.4f} "
                f"({'PASS' if regression_result.is_effective else 'FAIL'} "
                f"-- required: R2>=0.80, slope in [-1.25, -0.80])"
            )
        elif dollar_offset_result:
            overall_effective = dollar_offset_result.is_effective
            compliance_notes.append(
                f"IFRS 9 dollar-offset fallback (< 30 data points for regression): "
                f"ratio={dollar_offset_result.dollar_offset_ratio:.4f} "
                f"({'PASS' if dollar_offset_result.is_effective else 'FAIL'})"
            )
        compliance_notes.append(
            "Note: IFRS 9 also requires qualitative prospective assessment "
            "(economic relationship, credit risk, hedge ratio). "
            "This engine performs retrospective quantitative testing only."
        )

    else:
        if dollar_offset_result and dollar_offset_result.is_effective:
            overall_effective = True
        if regression_result and regression_result.is_effective:
            overall_effective = True

    # Build narrative
    pair_desc = config.currency_pair or "the designated exposure"
    if overall_effective:
        determination_narrative = (
            f"Hedge relationship is EFFECTIVE under {config.standard}. "
            f"The {config.hedge_type} hedge of {pair_desc} meets the retrospective "
            f"quantitative effectiveness threshold based on "
            f"{len(sorted_periods)} observation periods."
        )
    else:
        determination_narrative = (
            f"Hedge relationship is INEFFECTIVE under {config.standard}. "
            f"The {config.hedge_type} hedge of {pair_desc} does NOT meet the "
            f"retrospective quantitative effectiveness threshold. "
            f"Consider redesignation or hedging strategy adjustment."
        )

    trace.append(TraceEvent(
        step="DETERMINATION",
        description=f"Overall: {'EFFECTIVE' if overall_effective else 'INEFFECTIVE'} under {config.standard}",
        data={
            "overall_effective": overall_effective,
            "standard": config.standard,
            "compliance_notes_count": len(compliance_notes),
        },
    ))

    # -- Step 8: Hash outputs ------------------------------------------------
    outputs_payload = {
        "dollar_offset": dollar_offset_result.to_dict() if dollar_offset_result else None,
        "regression": regression_result.to_dict() if regression_result else None,
        "overall_effective": overall_effective,
        "period_analysis": [p.to_dict() for p in period_analysis],
        "compliance_notes": compliance_notes,
    }
    outputs_hash = _sha256_dict(outputs_payload)

    run_hash = _sha256_dict({
        "inputs_hash": inputs_hash,
        "outputs_hash": outputs_hash,
        "methodology_version": METHODOLOGY_VERSION,
    })

    trace.append(TraceEvent(
        step="HASH_OUTPUTS",
        description=f"Run hash: {run_hash[:16]}...",
        data={"inputs_hash": inputs_hash, "outputs_hash": outputs_hash, "run_hash": run_hash},
    ))

    return EffectivenessRunResult(
        methodology_version=METHODOLOGY_VERSION,
        standard=config.standard,
        hedge_type=config.hedge_type,
        currency_pair=config.currency_pair,
        period_count=len(sorted_periods),
        dollar_offset=dollar_offset_result,
        regression=regression_result,
        overall_effective=overall_effective,
        determination_narrative=determination_narrative,
        period_analysis=period_analysis,
        compliance_notes=compliance_notes,
        inputs_hash=inputs_hash,
        outputs_hash=outputs_hash,
        run_hash=run_hash,
        trace_events=trace,
    )
