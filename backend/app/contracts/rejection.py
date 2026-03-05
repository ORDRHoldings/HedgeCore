from __future__ import annotations

"""
app/contracts/rejection.py
HedgeCalc Contract: Rejection Registry (v1)

This module is the **authoritative rejection spine** for HedgeCalc.

TraceBundle **records** rejections; this registry defines:
- Canonical meaning of each rejection code (committee-safe semantics)
- Severity (hard fail vs soft block)
- Whether a residual R-vector is required at emission time
- Which engine stages are permitted to emit each code
- Deterministic ordering for stable outputs and stable audits
- Safe factory + validator helpers (fail-closed discipline)

Binding doctrine:
- No silent failures: every block must become a structured rejection.
- Fail-closed: a material rejection implies no partial HedgePlan output.
- Deterministic: ordering and defaults must be stable across runs.
- Audit-safe: messages must be human-safe and avoid secrets.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.contracts.trace_bundle import Rejection, RejectionCode, ResidualRiskVector, StageName

# ---------------------------
# Severity (committee semantics)
# ---------------------------

class RejectionSeverity(str, Enum):
    """
    HARD_FAIL: the run must be rejected (no partial hedge plan).
    SOFT_BLOCK: a specific branch/candidate is blocked but the run MAY continue
                if other candidates exist. (Core still fail-closed at run-level
                if residual material risks remain uncovered.)
    """
    HARD_FAIL = "HARD_FAIL"
    SOFT_BLOCK = "SOFT_BLOCK"


# ---------------------------
# Spec contract
# ---------------------------

class RejectionSpec(BaseModel):
    """
    Canonical spec for a rejection code.
    This is the single source of truth for governance.
    """
    code: RejectionCode = Field(..., description="Canonical rejection code")
    severity: RejectionSeverity = Field(..., description="Governance severity")

    default_message: str = Field(
        ...,
        description="Committee-safe default message (no secrets, no stack traces).",
        min_length=1,
    )

    permitted_stages: frozenset[StageName] = Field(
        ...,
        description="Stages allowed to emit this rejection code.",
    )

    requires_residual_risk: bool = Field(
        ...,
        description="If True, a ResidualRiskVector should be provided when emitting.",
    )

    is_terminal: bool = Field(
        ...,
        description="If True, this rejection is terminal for the run (fail-closed).",
    )

    @staticmethod
    def _fs(values: Iterable[StageName]) -> frozenset[StageName]:
        return frozenset(values)


@dataclass(frozen=True)
class RejectionValidationError(Exception):
    """
    Raised when a rejection violates registry rules.
    Use this for internal enforcement; endpoints should translate to structured output.
    """
    message: str


# ---------------------------
# Canonical registry (v1)
# ---------------------------

def _fs(*stages: StageName) -> frozenset[StageName]:
    return frozenset(stages)


REJECTION_REGISTRY: Mapping[RejectionCode, RejectionSpec] = {
    RejectionCode.REJECT_STALE_SNAPSHOT: RejectionSpec(
        code=RejectionCode.REJECT_STALE_SNAPSHOT,
        severity=RejectionSeverity.HARD_FAIL,
        default_message="Snapshot is stale or violates freshness policy; run rejected.",
        permitted_stages=_fs(StageName.EXPOSURE, StageName.RISK_CLASSIFIER, StageName.RECOMMEND),
        requires_residual_risk=False,
        is_terminal=True,
    ),
    RejectionCode.REJECT_INVALID_PORTFOLIO: RejectionSpec(
        code=RejectionCode.REJECT_INVALID_PORTFOLIO,
        severity=RejectionSeverity.HARD_FAIL,
        default_message="Portfolio snapshot is invalid or non-normalizable; run rejected.",
        permitted_stages=_fs(StageName.EXPOSURE, StageName.RISK_CLASSIFIER, StageName.RECOMMEND),
        requires_residual_risk=False,
        is_terminal=True,
    ),
    RejectionCode.REJECT_MISSING_MARKET_FIELDS: RejectionSpec(
        code=RejectionCode.REJECT_MISSING_MARKET_FIELDS,
        severity=RejectionSeverity.HARD_FAIL,
        default_message="Market snapshot is missing required fields for pricing/sizing; run rejected.",
        permitted_stages=_fs(StageName.EXPOSURE, StageName.RISK_CLASSIFIER, StageName.INSTRUMENT_MAPPER, StageName.HEDGE_SIZER, StageName.RECOMMEND),
        requires_residual_risk=False,
        is_terminal=True,
    ),
    RejectionCode.REJECT_NO_ELIGIBLE_INSTRUMENTS: RejectionSpec(
        code=RejectionCode.REJECT_NO_ELIGIBLE_INSTRUMENTS,
        severity=RejectionSeverity.HARD_FAIL,
        default_message="No eligible instruments remain after policy gating; run rejected.",
        permitted_stages=_fs(StageName.INSTRUMENT_MAPPER, StageName.RECOMMEND),
        requires_residual_risk=True,
        is_terminal=True,
    ),
    RejectionCode.REJECT_MANDATE_BLOCK: RejectionSpec(
        code=RejectionCode.REJECT_MANDATE_BLOCK,
        severity=RejectionSeverity.SOFT_BLOCK,
        default_message="Mandate policy blocks the requested hedge instrument/strategy.",
        permitted_stages=_fs(StageName.INSTRUMENT_MAPPER, StageName.COST_ENGINE, StageName.RECOMMEND),
        requires_residual_risk=True,
        is_terminal=False,
    ),
    RejectionCode.REJECT_LIQUIDITY_BLOCK: RejectionSpec(
        code=RejectionCode.REJECT_LIQUIDITY_BLOCK,
        severity=RejectionSeverity.SOFT_BLOCK,
        default_message="Liquidity gating blocks the requested hedge instrument/strategy.",
        permitted_stages=_fs(StageName.INSTRUMENT_MAPPER, StageName.COST_ENGINE, StageName.RECOMMEND),
        requires_residual_risk=True,
        is_terminal=False,
    ),
    RejectionCode.REJECT_COST_GOVERNANCE_FAIL: RejectionSpec(
        code=RejectionCode.REJECT_COST_GOVERNANCE_FAIL,
        severity=RejectionSeverity.SOFT_BLOCK,
        default_message="Cost governance policy rejects hedge candidates under current budgets/constraints.",
        permitted_stages=_fs(StageName.COST_ENGINE, StageName.RECOMMEND),
        requires_residual_risk=True,
        is_terminal=False,
    ),
    RejectionCode.REJECT_COVERAGE_FAILURE: RejectionSpec(
        code=RejectionCode.REJECT_COVERAGE_FAILURE,
        severity=RejectionSeverity.HARD_FAIL,
        default_message="Material risks remain uncovered under policy constraints; run rejected (fail-closed).",
        permitted_stages=_fs(StageName.STRATEGY_SELECTOR, StageName.INSTRUMENT_MAPPER, StageName.COST_ENGINE, StageName.RECOMMEND),
        requires_residual_risk=True,
        is_terminal=True,
    ),
}


# ---------------------------
# Deterministic ordering
# ---------------------------

def rejection_sort_key(r: Rejection) -> tuple[int, str, str]:
    """
    Deterministic ordering for output lists.
    (1) stage order by StageName enum declaration
    (2) code lexical
    (3) message lexical (stable tiebreak)
    """
    stage_order: dict[str, int] = {s.value: i for i, s in enumerate(StageName)}
    return (stage_order.get(r.stage.value, 10_000), r.code.value, (r.message or ""))


# ---------------------------
# Public helpers (factory + validation)
# ---------------------------

def get_rejection_spec(code: RejectionCode) -> RejectionSpec:
    spec = REJECTION_REGISTRY.get(code)
    if spec is None:
        raise RejectionValidationError(f"Unknown rejection code: {code}")
    return spec


def is_terminal_rejection(code: RejectionCode) -> bool:
    return get_rejection_spec(code).is_terminal


def is_hard_fail(code: RejectionCode) -> bool:
    return get_rejection_spec(code).severity == RejectionSeverity.HARD_FAIL


def validate_rejection(rej: Rejection) -> None:
    """
    Validate a Rejection against the canonical registry rules.
    Raises RejectionValidationError on violation.
    """
    spec = get_rejection_spec(rej.code)

    if rej.stage not in spec.permitted_stages:
        raise RejectionValidationError(
            f"Rejection {rej.code.value} is not permitted from stage {rej.stage.value}."
        )

    if spec.requires_residual_risk and rej.residual_risk is None:
        raise RejectionValidationError(
            f"Rejection {rej.code.value} requires residual_risk but none was provided."
        )

    # Enforce message safety (no empties; no stack traces in contract-level messaging)
    msg = (rej.message or "").strip()
    if not msg:
        raise RejectionValidationError(f"Rejection {rej.code.value} must include a non-empty message.")

    # Simple stacktrace/exception leakage guard (best-effort; not a security boundary)
    lowered = msg.lower()
    if "traceback" in lowered or "exception" in lowered:
        raise RejectionValidationError(
            f"Rejection {rej.code.value} message appears to include internal error text; provide a safe message."
        )


def make_rejection(
    *,
    code: RejectionCode,
    stage: StageName,
    message: str | None = None,
    details: dict[str, Any] | None = None,
    residual_risk: ResidualRiskVector | None = None,
) -> Rejection:
    """
    Safe factory:
    - applies default message if message is not provided
    - validates legality against registry
    - returns a Rejection ready to embed in TraceStep / TraceBundle
    """
    spec = get_rejection_spec(code)
    msg = (message or spec.default_message).strip()

    rej = Rejection(
        code=code,
        stage=stage,
        message=msg,
        details=details,
        residual_risk=residual_risk,
    )

    validate_rejection(rej)
    return rej
