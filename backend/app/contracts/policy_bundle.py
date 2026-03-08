from __future__ import annotations

"""
app/contracts/policy_bundle.py
HedgeCalc Contract: PolicyBundle (v1)

This module defines the **PolicyBundle**: the snapshot-bound governance object that
controls eligibility, cost governance, risk thresholds, and scenario policy for a run.

BINDING RULES (institutional / audit):
- Snapshot-only: PolicyBundle is an explicit input artifact (or hash reference), never implicit.
- Deterministic: `policy_hash` is SHA-256 over canonical JSON excluding `policy_hash` + timestamps.
- Fail-closed: invalid policy must be rejected by consuming stages.
- Governance-first: policy describes what is allowed; engines must not silently override policy.
- No secrets: policy is safe to log (do not store API keys, creds, tokens).
- Schema stability: semantic changes require schema_version bump.

Scope (v1):
- Liquidity gating floors (liquidity_score, optional ADV/OI)
- Mandate gating (allow/prohibit tags)
- Cost governance limits (max_total_cost_bps, max_slippage_bps, max_contracts, etc.)
- Strategy limits (max complexity, max instruments)
- Scenario policy (which scenario families are enabled, stress multipliers, etc.)
- Deterministic taxonomy binding (taxonomy_hash required upstream; PolicyBundle stores its own copy)

This file is a CONTRACT. It must remain portable and cross-language friendly.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator, model_validator

from app.contracts.run_envelope import _is_sha256_hex, hash_canonical, utcnow

# ============================================================
# Constants
# ============================================================

POLICY_SCHEMA_ID = "policy_bundle"
POLICY_SCHEMA_VERSION = "v1"


# ============================================================
# Helpers (deterministic, audit-safe)
# ============================================================

def _finite_float(v: Any, *, field_name: str, allow_none: bool = False) -> float | None:
    if v is None:
        return None if allow_none else 0.0
    try:
        fv = float(v)
    except Exception as e:
        raise ValueError(f"{field_name} must be numeric") from e
    if fv != fv or fv in (float("inf"), float("-inf")):
        raise ValueError(f"{field_name} must be finite (no NaN/Inf)")
    return float(fv)


def _finite_ge0(v: Any, *, field_name: str, allow_none: bool = False) -> float | None:
    fv = _finite_float(v, field_name=field_name, allow_none=allow_none)
    if fv is None:
        return None
    if fv < 0.0:
        raise ValueError(f"{field_name} must be >= 0")
    return float(fv)


def _finite_in_0_1(v: Any, *, field_name: str, default: float) -> float:
    if v is None:
        return float(default)
    fv = _finite_float(v, field_name=field_name)
    assert fv is not None
    if not 0.0 <= float(fv) <= 1.0:
        raise ValueError(f"{field_name} must be within [0,1]")
    return float(fv)


def _tuple_strs(v: Any, *, field_name: str) -> tuple[str, ...]:
    if v is None:
        return ()
    if not isinstance(v, list | tuple):
        raise ValueError(f"{field_name} must be list/tuple of strings")
    out: list[str] = []
    for item in v:
        if item is None:
            continue
        s = str(item).strip()
        if s:
            out.append(s)
    # Deterministic ordering + dedupe
    return tuple(sorted(set(out)))


def _optional_non_empty_str(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


# ============================================================
# Sub-objects
# ============================================================

class MandatePolicy(BaseModel):
    """
    Tenant / mandate gating.

    Semantics:
    - allow: if non-empty, instruments MUST match at least one allow tag
    - prohibit: instruments MUST NOT match any prohibit tag
    """

    allow: tuple[str, ...] = Field(default_factory=tuple)
    prohibit: tuple[str, ...] = Field(default_factory=tuple)

    @field_validator("allow", "prohibit", mode="before")
    @classmethod
    def _validate_tuple_strs(cls, v: Any, info: Any) -> tuple[str, ...]:
        return _tuple_strs(v, field_name=str(info.field_name))

    @model_validator(mode="after")
    def _validate_no_overlap(self) -> MandatePolicy:
        # Institutional hygiene: a tag cannot be both allowed and prohibited.
        overlap = set(self.allow) & set(self.prohibit)
        if overlap:
            raise ValueError(f"MandatePolicy allow/prohibit overlap: {sorted(overlap)}")
        return self


class LiquidityPolicy(BaseModel):
    """
    Liquidity gating floors.

    - min_liquidity_score: normalized [0..1] score required for eligibility
    - min_avg_daily_volume: optional ADV floor (units are instrument-defined)
    - min_open_interest: optional OI floor (contracts)
    """

    min_liquidity_score: float = Field(default=0.30, description="Minimum normalized liquidity score [0..1]")
    min_avg_daily_volume: float | None = Field(default=None, description="Optional ADV floor")
    min_open_interest: float | None = Field(default=None, description="Optional open interest floor")

    @field_validator("min_liquidity_score", mode="before")
    @classmethod
    def _score(cls, v: Any) -> float:
        return _finite_in_0_1(v, field_name="min_liquidity_score", default=0.30)

    @field_validator("min_avg_daily_volume", mode="before")
    @classmethod
    def _adv(cls, v: Any) -> float | None:
        return _finite_ge0(v, field_name="min_avg_daily_volume", allow_none=True)

    @field_validator("min_open_interest", mode="before")
    @classmethod
    def _oi(cls, v: Any) -> float | None:
        return _finite_ge0(v, field_name="min_open_interest", allow_none=True)


class StrategyPolicy(BaseModel):
    """
    Strategy selection + mapping constraints.
    """

    min_risk_score: float = Field(default=0.15, description="Minimum risk score (0..1) for strategy consideration")
    max_strategy_complexity: int = Field(default=3, ge=1, le=10)
    max_output_strategies: int = Field(default=5, ge=1, le=50)
    max_instruments_per_strategy: int = Field(default=3, ge=1, le=10)

    @field_validator("min_risk_score", mode="before")
    @classmethod
    def _risk_score(cls, v: Any) -> float:
        return _finite_in_0_1(v, field_name="min_risk_score", default=0.15)


class CostGovernancePolicy(BaseModel):
    """
    Cost governance constraints.

    Interpreting cost is engine-specific (cost_engine), but these are stable limits used
    for gating / rejection.
    """

    max_total_cost_bps: float = Field(default=25.0, ge=0.0, description="Max total expected cost (bps) allowed")
    max_slippage_bps: float = Field(default=10.0, ge=0.0, description="Max slippage component (bps) allowed")
    max_fee_bps: float = Field(default=10.0, ge=0.0, description="Max fees component (bps) allowed")

    max_contracts: int | None = Field(default=None, description="Optional hard cap on contracts")
    max_notional_usd: float | None = Field(default=None, description="Optional hard cap on notional")

    @field_validator("max_total_cost_bps", "max_slippage_bps", "max_fee_bps", mode="before")
    @classmethod
    def _finite_nonneg(cls, v: Any, info: Any) -> float:
        fv = _finite_ge0(v, field_name=str(info.field_name), allow_none=False)
        assert fv is not None
        return float(fv)

    @field_validator("max_contracts", mode="before")
    @classmethod
    def _optional_int_cap(cls, v: Any) -> int | None:
        if v is None:
            return None
        try:
            iv = int(v)
        except Exception as e:
            raise ValueError("max_contracts must be an integer when provided") from e
        if iv <= 0:
            raise ValueError("max_contracts must be > 0 when provided")
        return iv

    @field_validator("max_notional_usd", mode="before")
    @classmethod
    def _optional_notional(cls, v: Any) -> float | None:
        fv = _finite_float(v, field_name="max_notional_usd", allow_none=True)
        if fv is None:
            return None
        if fv <= 0.0:
            raise ValueError("max_notional_usd must be > 0 when provided")
        return float(fv)


class ScenarioPolicy(BaseModel):
    """
    Scenario engine configuration policy (v1).

    This is not a scenario generator; it only governs what families can be applied,
    and coarse multipliers.
    """

    enabled: bool = Field(default=True)

    enabled_families: tuple[str, ...] = Field(
        default_factory=lambda: (
            "equity_gap",
            "vol_spike",
            "rates_shift",
            "credit_spread",
            "liquidity_freeze",
        ),
        description="Deterministic list of enabled scenario families",
    )

    stress_multiplier: float = Field(default=1.0, ge=0.0, description="Global multiplier for scenario severity")

    @field_validator("enabled_families", mode="before")
    @classmethod
    def _families(cls, v: Any) -> tuple[str, ...]:
        # If omitted: preserve default families (do not silently empty).
        if v is None:
            return (
                "equity_gap",
                "vol_spike",
                "rates_shift",
                "credit_spread",
                "liquidity_freeze",
            )
        return _tuple_strs(v, field_name="enabled_families")

    @field_validator("stress_multiplier", mode="before")
    @classmethod
    def _finite_nonneg(cls, v: Any) -> float:
        fv = _finite_ge0(v, field_name="stress_multiplier", allow_none=False)
        assert fv is not None
        return float(fv)


# ============================================================
# Extended policy sections (Phase 1 foundation)
# ============================================================

class VolatilityPolicy(BaseModel):
    """Layer 2: Volatility-aware policy behavior. Neutral by default."""
    enabled: bool = False
    method: Literal["EWMA", "REALIZED", "GARCH"] = "EWMA"
    ewma_lambda: float = Field(default=0.94, ge=0.8, le=0.99)
    lookback_days: int = Field(default=60, ge=5, le=504)
    band_widening_enabled: bool = False
    ratio_adjustment_enabled: bool = False
    fallback_vols: dict[str, float] = Field(
        default_factory=lambda: {"G10": 0.08, "EM_LATAM": 0.14, "EM_ASIA": 0.10, "EM_CEEMEA": 0.16}
    )
    fallback_correlations: dict[str, float] = Field(
        default_factory=lambda: {"intra_region": 0.60, "cross_region": 0.30}
    )


class GeopoliticalPolicy(BaseModel):
    """Layer 3: Geopolitical risk overlay from Polisophic. Neutralized until activated."""
    enabled: bool = False
    source: str = "polisophic"
    escalation_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    ratio_haircut_max: float = Field(default=0.10, ge=0.0, le=0.5)
    corridor_scores: dict[str, float] = Field(default_factory=dict,
        description="Per-corridor normalized risk scores [0,1]. Empty = no data / neutral.")


class ProspectiveEffectivenessPolicy(BaseModel):
    """Layer 5: IFRS 9 prospective effectiveness testing configuration."""
    method: Literal["CRITICAL_TERMS_MATCH", "STATISTICAL_FORECAST", "NONE"] = "NONE"
    confidence: float = Field(default=0.95, ge=0.80, le=0.99)
    effectiveness_band_min: float = Field(default=0.80, ge=0.50, le=0.95)
    effectiveness_band_max: float = Field(default=1.25, ge=1.05, le=2.0)
    regression_r2_min: float = Field(default=0.80, ge=0.50, le=1.0)
    regression_slope_min: float = Field(default=-1.25, le=-0.5)
    regression_slope_max: float = Field(default=-0.80, ge=-1.5, le=-0.1)


class DecisionGatePolicy(BaseModel):
    """Layer 5: Decision gate thresholds. All configurable, all with documented defaults."""
    max_total_cost_bps: float = Field(default=75.0, ge=0.0,
        description="GFMA best practice: 75bps for EM FX hedging programs.")
    max_total_cost_usd: float = Field(default=25000.0, ge=0.0)
    min_worst_case_pnl_usd: float = Field(default=-50000.0, le=0.0)
    min_effectiveness: float = Field(default=0.25, ge=0.0, le=2.0)
    max_rejected_legs: int = Field(default=0, ge=0)
    require_nonzero_hedges: bool = True
    reject_on_unhedged_material_risks: bool = True
    material_risk_threshold: float = Field(default=0.50, ge=0.0, le=1.0)


# ============================================================
# PolicyBundle contract
# ============================================================

class PolicyBundle(BaseModel):
    """
    Snapshot-bound governance object.

    Determinism rules:
    - created_at is metadata only (never hashed)
    - policy_hash hashes canonical JSON excluding policy_hash + created_at
    """

    schema_id: str = Field(default=POLICY_SCHEMA_ID, description="Stable schema identifier")
    schema_version: str = Field(default=POLICY_SCHEMA_VERSION, description="Schema version")

    policy_id: UUID = Field(default_factory=uuid4, description="Unique policy snapshot id")
    created_at: str = Field(
        default_factory=lambda: utcnow().isoformat(),
        description="UTC timestamp string (metadata only; excluded from policy_hash)",
    )

    # Binding / provenance
    taxonomy_hash: str = Field(..., description="Hash of canonical R1-R8 taxonomy table used by this policy")

    # Governance sections
    mandate: MandatePolicy = Field(default_factory=MandatePolicy)
    liquidity: LiquidityPolicy = Field(default_factory=LiquidityPolicy)
    strategy: StrategyPolicy = Field(default_factory=StrategyPolicy)
    cost: CostGovernancePolicy = Field(default_factory=CostGovernancePolicy)
    scenario: ScenarioPolicy = Field(default_factory=ScenarioPolicy)

    # Extended governance sections (Phase 1)
    volatility: VolatilityPolicy = Field(default_factory=VolatilityPolicy)
    geopolitical: GeopoliticalPolicy = Field(default_factory=GeopoliticalPolicy)
    prospective_effectiveness: ProspectiveEffectivenessPolicy = Field(default_factory=ProspectiveEffectivenessPolicy)
    decision_gate: DecisionGatePolicy = Field(default_factory=DecisionGatePolicy)

    # Integrity
    policy_hash: str = Field(default="", description="Computed by finalize() if empty")

    @field_validator("taxonomy_hash", mode="before")
    @classmethod
    def _validate_taxonomy_hash(cls, v: Any) -> str:
        if not isinstance(v, str) or not _is_sha256_hex(v):
            raise ValueError("taxonomy_hash must be a SHA-256 hex digest")
        return v

    @field_validator("policy_hash", mode="before")
    @classmethod
    def _validate_policy_hash(cls, v: Any) -> str:
        if v in (None, ""):
            return ""
        if not isinstance(v, str) or not _is_sha256_hex(v):
            raise ValueError("policy_hash must be a SHA-256 hex digest")
        return v

    def to_canonical_dict(self) -> dict[str, Any]:
        d = self.model_dump(mode="json")
        d.pop("policy_hash", None)
        d.pop("created_at", None)  # never hash timestamps
        return d

    def compute_policy_hash(self) -> str:
        return hash_canonical(self.to_canonical_dict())

    def finalize(self) -> PolicyBundle:
        """
        Deterministically seal PolicyBundle by computing policy_hash if missing.
        Intentionally pure: callers should not mutate policies in-place.
        """
        ph = self.policy_hash or self.compute_policy_hash()
        return self.model_copy(update={"policy_hash": ph})


# ============================================================
# Convenience builder
# ============================================================

@dataclass(frozen=True)
class PolicyBundleSeed:
    taxonomy_hash: str
    mandate: Mapping[str, Any] | None = None
    liquidity: Mapping[str, Any] | None = None
    strategy: Mapping[str, Any] | None = None
    cost: Mapping[str, Any] | None = None
    scenario: Mapping[str, Any] | None = None
    volatility: Mapping[str, Any] | None = None
    geopolitical: Mapping[str, Any] | None = None
    prospective_effectiveness: Mapping[str, Any] | None = None
    decision_gate: Mapping[str, Any] | None = None


def build_policy_bundle(seed: PolicyBundleSeed) -> PolicyBundle:
    pb = PolicyBundle(
        taxonomy_hash=seed.taxonomy_hash,
        mandate=MandatePolicy(**(seed.mandate or {})),
        liquidity=LiquidityPolicy(**(seed.liquidity or {})),
        strategy=StrategyPolicy(**(seed.strategy or {})),
        cost=CostGovernancePolicy(**(seed.cost or {})),
        scenario=ScenarioPolicy(**(seed.scenario or {})),
        volatility=VolatilityPolicy(**(seed.volatility or {})),
        geopolitical=GeopoliticalPolicy(**(seed.geopolitical or {})),
        prospective_effectiveness=ProspectiveEffectivenessPolicy(**(seed.prospective_effectiveness or {})),
        decision_gate=DecisionGatePolicy(**(seed.decision_gate or {})),
    )
    return pb.finalize()


__all__ = [
    "POLICY_SCHEMA_ID",
    "POLICY_SCHEMA_VERSION",
    "MandatePolicy",
    "LiquidityPolicy",
    "StrategyPolicy",
    "CostGovernancePolicy",
    "ScenarioPolicy",
    "VolatilityPolicy",
    "GeopoliticalPolicy",
    "ProspectiveEffectivenessPolicy",
    "DecisionGatePolicy",
    "PolicyBundle",
    "PolicyBundleSeed",
    "build_policy_bundle",
]
