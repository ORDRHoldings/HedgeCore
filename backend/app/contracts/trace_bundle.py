from __future__ import annotations

"""
app/contracts/trace_bundle.py
HedgeCalc Contract: TraceBundle (v1)

This module defines the **TraceBundle**: a complete, stage-by-stage audit trace that MUST
exist for all engine runs (simulate/recommend). It enforces trace-first doctrine:
no decision exists without a traceable path.

Design goals (binding):
- Replayability: per-stage input/output hashes enable reconstruction and verification.
- Explicit disclosures: approximations/fallbacks/proxies are captured and aggregated.
- Structured rejections: failures/gatings are explicit with codes + residuals.
- Timings: per-stage durations for audit/performance investigation.
- Determinism: hashes are over canonical JSON; timestamps are NEVER used in hashes.

Hashing:
- `bundle_hash` is SHA-256 over canonical JSON of the bundle excluding `bundle_hash`.
- Aggregated lists (`all_rejections`, `all_disclosures`) are deterministically ordered.

Notes:
- Stage names are canonical and frozen for v1.
- Rejection/disclosure registries are intentionally limited in v1. Extend by adding new
  enum values (or bump schema_version if semantics change).
"""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator

from app.contracts.run_envelope import _is_sha256_hex, hash_canonical, utcnow

# ---------------------------
# Enums (frozen v1)
# ---------------------------

class StageName(str, Enum):
    """
    Canonical engine stage names (frozen for v1).
    Order reflects the pipeline as implemented in the HedgeCalc engine.
    """
    EXPOSURE = "exposure"
    RISK_CLASSIFIER = "risk_classifier"
    STRATEGY_SELECTOR = "strategy_selector"
    INSTRUMENT_MAPPER = "instrument_mapper"
    HEDGE_SIZER = "hedge_sizer"
    COST_ENGINE = "cost_engine"
    SCENARIO_ENGINE = "scenario_engine"
    RECOMMEND = "recommend"  # orchestrator stage for /engine/recommend


class RejectionCode(str, Enum):
    """
    Structured rejection codes (frozen for v1).
    Extend by adding new values (or version bump if semantics change).
    """
    REJECT_STALE_SNAPSHOT = "REJECT_STALE_SNAPSHOT"
    REJECT_INVALID_PORTFOLIO = "REJECT_INVALID_PORTFOLIO"
    REJECT_MISSING_MARKET_FIELDS = "REJECT_MISSING_MARKET_FIELDS"
    REJECT_NO_ELIGIBLE_INSTRUMENTS = "REJECT_NO_ELIGIBLE_INSTRUMENTS"
    REJECT_MANDATE_BLOCK = "REJECT_MANDATE_BLOCK"
    REJECT_LIQUIDITY_BLOCK = "REJECT_LIQUIDITY_BLOCK"
    REJECT_COST_GOVERNANCE_FAIL = "REJECT_COST_GOVERNANCE_FAIL"
    REJECT_COVERAGE_FAILURE = "REJECT_COVERAGE_FAILURE"


class DisclosureCode(str, Enum):
    """
    Disclosure codes for approximations/fallbacks (frozen for v1).
    Extend by adding new values (or version bump if semantics change).
    """
    DISCLOSED_LINEAR_GREEKS_ONLY = "DISCLOSED_LINEAR_GREEKS_ONLY"
    DISCLOSED_GAMMA_PROXY_USED = "DISCLOSED_GAMMA_PROXY_USED"
    DISCLOSED_VOL_PROXY_SUBSTITUTION = "DISCLOSED_VOL_PROXY_SUBSTITUTION"
    DISCLOSED_PROXY_INSTRUMENT_USED = "DISCLOSED_PROXY_INSTRUMENT_USED"
    DISCLOSED_BETA_ASSUMPTION_USED = "DISCLOSED_BETA_ASSUMPTION_USED"


# ---------------------------
# Core data objects
# ---------------------------

class ResidualRiskVector(BaseModel):
    """
    Residual R1-R8 vector (at rejection point, or post-hedge residual).
    This is intentionally numeric-only to keep the contract stable and cross-language portable.
    """
    r1: float = Field(default=0.0, description="R1 residual (delta / directional)")
    r2: float = Field(default=0.0, description="R2 residual (vega / volatility)")
    r3: float = Field(default=0.0, description="R3 residual (gamma / convexity)")
    r4: float = Field(default=0.0, description="R4 residual (theta / carry & cost governance axis)")
    r5: float = Field(default=0.0, description="R5 residual (concentration / correlation)")
    r6: float = Field(default=0.0, description="R6 residual (credit)")
    r7: float = Field(default=0.0, description="R7 residual (liquidity)")
    r8: float = Field(default=0.0, description="R8 residual (tail / gap / crash)")

    @field_validator("r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", mode="before")
    @classmethod
    def _coerce_float(cls, v: Any) -> Any:
        if v is None:
            return 0.0
        try:
            fv = float(v)
        except Exception as e:
            raise ValueError("ResidualRiskVector values must be numeric") from e
        # Disallow NaN/Inf in contracts
        if fv != fv or fv in (float("inf"), float("-inf")):
            raise ValueError("ResidualRiskVector values must be finite")
        return fv


class Rejection(BaseModel):
    """Structured rejection (fail-closed) emitted by any stage."""
    code: RejectionCode
    message: str
    stage: StageName
    details: dict[str, Any] | None = Field(default=None, description="Code-specific details (audit-safe)")
    residual_risk: ResidualRiskVector | None = Field(default=None, description="Residual R-vector at rejection")

    @field_validator("message")
    @classmethod
    def _validate_message(cls, v: Any) -> Any:
        if not isinstance(v, str) or not v.strip():
            raise ValueError("Rejection.message must be a non-empty string")
        return v.strip()


class Disclosure(BaseModel):
    """Explicit disclosure emitted by any stage (approximations/fallbacks/proxies)."""
    code: DisclosureCode
    message: str
    stage: StageName
    details: dict[str, Any] | None = Field(default=None, description="Code-specific details (audit-safe)")

    @field_validator("message")
    @classmethod
    def _validate_message(cls, v: Any) -> Any:
        if not isinstance(v, str) or not v.strip():
            raise ValueError("Disclosure.message must be a non-empty string")
        return v.strip()


class TraceStep(BaseModel):
    """
    Per-stage trace record (ordered). This is the atomic unit for TraceBundle.

    Contract discipline:
    - input_hash and output_hash are SHA-256 hex digests of canonical stage I/O JSON.
    - duration_ms is required and non-negative.
    - decisions are short stable strings; do not include secrets.
    """
    stage: StageName

    input_hash: str = Field(..., description="Hash of stage input canonical JSON")
    output_hash: str | None = Field(default=None, description="Hash of stage output canonical JSON (if any)")

    duration_ms: int = Field(..., ge=0, description="Stage execution duration in milliseconds")

    decisions: list[str] = Field(
        default_factory=list,
        description="Short stable decision strings, e.g., 'selected_strategy:collar_v1'",
    )

    rejections: list[Rejection] = Field(default_factory=list, description="Rejections emitted by this stage")
    disclosures: list[Disclosure] = Field(default_factory=list, description="Disclosures emitted by this stage")

    notes: list[str] = Field(default_factory=list, description="Audit-safe notes; avoid secrets")

    @field_validator("input_hash", "output_hash", mode="before")
    @classmethod
    def _validate_hash(cls, v: Any) -> Any:
        if v is None:
            return v
        if not isinstance(v, str) or not _is_sha256_hex(v):
            raise ValueError("Expected SHA-256 hex digest")
        return v

    @field_validator("decisions", "notes")
    @classmethod
    def _validate_str_lists(cls, v: Any) -> Any:
        if v is None:
            return []
        if not isinstance(v, list):
            raise ValueError("Expected list")
        out: list[str] = []
        for item in v:
            if item is None:
                continue
            if not isinstance(item, str):
                raise ValueError("Expected list[str]")
            s = item.strip()
            if s:
                out.append(s)
        return out


# ---------------------------
# TraceBundle contract
# ---------------------------

class TraceBundle(BaseModel):
    """TraceBundle: complete audit trace for a run."""
    schema_id: str = Field(default="trace_bundle", description="Stable schema identifier")
    schema_version: str = Field(default="v1", description="Schema version")

    bundle_id: UUID = Field(default_factory=uuid4, description="Unique bundle identifier")
    run_id: UUID = Field(..., description="Associated run_id from RunEnvelope")
    created_at: datetime = Field(default_factory=utcnow, description="UTC timestamp when bundle was created")

    steps: list[TraceStep] = Field(default_factory=list, description="Ordered stage-by-stage traces")

    all_rejections: list[Rejection] = Field(
        default_factory=list,
        description="Aggregated, deterministically ordered unique rejections",
    )
    all_disclosures: list[Disclosure] = Field(
        default_factory=list,
        description="Aggregated, deterministically ordered unique disclosures",
    )

    bundle_hash: str = Field(
        default="",
        description="Hash of the TraceBundle itself (excluding bundle_hash). Computed by finalize() if empty.",
    )

    @field_validator("bundle_hash", mode="before")
    @classmethod
    def _validate_bundle_hash(cls, v: Any) -> Any:
        if v in (None, ""):
            return ""
        if not isinstance(v, str) or not _is_sha256_hex(v):
            raise ValueError("Expected SHA-256 hex digest")
        return v

    def to_canonical_dict(self) -> dict[str, Any]:
        """
        Canonical dict used for hashing. Excludes `bundle_hash` so the hash is self-contained.
        """
        d = self.model_dump(mode="json")
        d.pop("bundle_hash", None)
        return d

    def compute_bundle_hash(self) -> str:
        return hash_canonical(self.to_canonical_dict())

    @staticmethod
    def _dedupe_rejections(steps: list[TraceStep]) -> list[Rejection]:
        """
        Deduplicate rejections deterministically.
        Key: (code, stage). Keep the LAST occurrence (later stages override earlier detail).
        Output order: StageName order (as enum values appear in this file) then code string.
        """
        order_stage: dict[str, int] = {s.value: i for i, s in enumerate(StageName)}
        idx: dict[tuple[str, str], Rejection] = {}
        for step in steps:
            for r in step.rejections:
                idx[(r.code.value, r.stage.value)] = r

        out = list(idx.values())
        out.sort(key=lambda r: (order_stage.get(r.stage.value, 10_000), r.code.value))
        return out

    @staticmethod
    def _dedupe_disclosures(steps: list[TraceStep]) -> list[Disclosure]:
        """
        Deduplicate disclosures deterministically.
        Key: (code, stage). Keep the LAST occurrence.
        Output order: StageName order then code string.
        """
        order_stage: dict[str, int] = {s.value: i for i, s in enumerate(StageName)}
        idx: dict[tuple[str, str], Disclosure] = {}
        for step in steps:
            for d in step.disclosures:
                idx[(d.code.value, d.stage.value)] = d

        out = list(idx.values())
        out.sort(key=lambda d: (order_stage.get(d.stage.value, 10_000), d.code.value))
        return out

    def finalize(self) -> TraceBundle:
        """
        Return a bundle with:
        - aggregated/deduped `all_rejections` and `all_disclosures`
        - computed `bundle_hash`

        Intentionally pure: callers should not mutate bundles in-place.
        """
        all_rej = self._dedupe_rejections(self.steps)
        all_disc = self._dedupe_disclosures(self.steps)

        candidate = self.model_copy(
            update={
                "all_rejections": all_rej,
                "all_disclosures": all_disc,
            }
        )

        bh = candidate.bundle_hash or candidate.compute_bundle_hash()
        return candidate.model_copy(update={"bundle_hash": bh})


# ---------------------------
# Convenience builder
# ---------------------------

@dataclass(frozen=True)
class TraceBundleSeed:
    run_id: UUID
    steps: list[TraceStep]


def build_trace_bundle(seed: TraceBundleSeed) -> TraceBundle:
    """Construct and finalize a TraceBundle from a seed."""
    b = TraceBundle(run_id=seed.run_id, steps=seed.steps)
    return b.finalize()
