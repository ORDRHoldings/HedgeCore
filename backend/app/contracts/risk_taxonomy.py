from __future__ import annotations

"""
app/contracts/risk_taxonomy.py
HedgeCalc Contract: Canonical Risk Taxonomy (R1-R8) -- v1 (FROZEN)

BINDING REQUIREMENTS
- Single source of truth for R1-R8 axis identifiers and semantics.
- Snapshot-bound + deterministic + audit-safe.
- No legacy aliases. All services validate against this table.
- Any semantic change requires schema_version bump + published crosswalk.

INSTITUTIONAL NOTES
- Axes are orthogonal decomposition + governance buckets -- NOT forecasts.
- Core engine remains non-probabilistic; weights/probabilities belong to optional packs only.
- R4 is a cost/carry GOVERNANCE axis (not a hedgeable market risk).
- Dual-use instruments (e.g., XBTF directional vs tail) are permitted, but per-run classification must be explicit
  and disclosed (TraceBundle).
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Tuple

from pydantic import BaseModel, Field, field_validator, model_validator

from app.contracts.run_envelope import _is_sha256_hex, hash_canonical


# ============================================================
# Canonical axis identifiers (frozen)
# ============================================================

class RiskAxis:
    """
    Stable axis identifiers (do not change).
    Using string constants (instead of Enum) is intentional for cross-language portability.
    """
    R1 = "R1"
    R2 = "R2"
    R3 = "R3"
    R4 = "R4"
    R5 = "R5"
    R6 = "R6"
    R7 = "R7"
    R8 = "R8"


@dataclass(frozen=True)
class RiskAxisSpec:
    axis: str
    name: str
    short: str
    description: str
    hedgeable: bool
    typical_units: str
    examples: Tuple[str, ...]


# ============================================================
# Contract object
# ============================================================

RISK_TAXONOMY_SCHEMA_ID = "risk_taxonomy"
RISK_TAXONOMY_SCHEMA_VERSION = "v1"


class RiskTaxonomy(BaseModel):
    """
    Snapshot artifact for /engine/catalog and for embedding into RunEnvelope/PolicyBundle references.

    Determinism rules:
    - `taxonomy_hash` is SHA-256 over canonical JSON of the taxonomy excluding `taxonomy_hash`.
    - Ordering of `axes` must be stable (R1..R8).
    """
    schema_id: str = Field(default=RISK_TAXONOMY_SCHEMA_ID, description="Stable schema identifier")
    schema_version: str = Field(default=RISK_TAXONOMY_SCHEMA_VERSION, description="Schema version (bump only on semantics)")
    taxonomy_name: str = Field(default="HedgeCalc R1-R8", description="Human-readable taxonomy name")

    axes: List[Dict[str, Any]] = Field(..., description="Canonical axis table, ordered R1..R8")

    taxonomy_hash: str = Field(
        default="",
        description="SHA-256 of canonical JSON of this taxonomy excluding taxonomy_hash (computed by finalize())",
    )

    @field_validator("taxonomy_hash", mode="before")
    @classmethod
    def _validate_taxonomy_hash(cls, v: Any) -> str:
        if v in (None, ""):
            return ""
        if not isinstance(v, str) or not _is_sha256_hex(v):
            raise ValueError("taxonomy_hash must be a SHA-256 hex digest")
        return v

    @model_validator(mode="after")
    def _validate_axes_shape_and_order(self) -> "RiskTaxonomy":
        if not isinstance(self.axes, list) or len(self.axes) != 8:
            raise ValueError("RiskTaxonomy.axes must be a list of exactly 8 axis records (R1..R8)")

        expected = risk_axis_order()
        got: List[str] = []
        for i, rec in enumerate(self.axes):
            if not isinstance(rec, dict):
                raise ValueError(f"RiskTaxonomy.axes[{i}] must be an object/dict")
            axis = str(rec.get("axis", "")).strip()
            if not axis:
                raise ValueError(f"RiskTaxonomy.axes[{i}] missing 'axis'")
            got.append(axis)

            # Required fields (fail-closed for institutional contract discipline)
            for req in ("name", "short", "description", "hedgeable", "typical_units", "examples"):
                if req not in rec:
                    raise ValueError(f"RiskTaxonomy.axes[{i}] missing required field '{req}'")

        if tuple(got) != expected:
            raise ValueError(f"RiskTaxonomy.axes must be ordered exactly {expected}; got {tuple(got)}")

        # Uniqueness check (belt-and-suspenders)
        if len(set(got)) != 8:
            raise ValueError("RiskTaxonomy.axes contains duplicate axis ids")

        return self

    def to_canonical_dict(self) -> Dict[str, Any]:
        d = self.model_dump(mode="json")
        d.pop("taxonomy_hash", None)
        return d

    def compute_taxonomy_hash(self) -> str:
        return hash_canonical(self.to_canonical_dict())

    def finalize(self) -> "RiskTaxonomy":
        """
        Deterministically seal the taxonomy:
        - Ensure stable axis ordering (R1..R8)
        - Compute taxonomy_hash if missing
        """
        # Normalize order defensively (even though validator enforces order)
        order = {a: i for i, a in enumerate(risk_axis_order())}
        axes_sorted = sorted(self.axes, key=lambda r: order.get(str(r.get("axis", "")).strip(), 10_000))
        candidate = self.model_copy(update={"axes": axes_sorted})
        th = candidate.taxonomy_hash or candidate.compute_taxonomy_hash()
        return candidate.model_copy(update={"taxonomy_hash": th})


# ============================================================
# Frozen table (v1)
# ============================================================

_RISK_AXIS_TABLE: Tuple[RiskAxisSpec, ...] = (
    RiskAxisSpec(
        axis=RiskAxis.R1,
        name="Directional / Delta",
        short="Market direction exposure (delta-like)",
        description=(
            "First-order directional exposure to underlying price moves. "
            "Covers equity/ETF/index directional sensitivity and futures linear exposure. "
            "Primary objective: neutralize material directional drawdowns under defined shocks."
        ),
        hedgeable=True,
        typical_units="USD per 1% move (or delta-dollar equivalent)",
        examples=(
            "Equities/ETFs/index positions",
            "Index futures overlays",
            "Protective puts for directional drawdown",
        ),
    ),
    RiskAxisSpec(
        axis=RiskAxis.R2,
        name="Volatility / Vega",
        short="Implied volatility & vol term structure exposure (vega-like)",
        description=(
            "Exposure to changes in implied volatility (and term structure), including volatility regime shifts. "
            "This is not a forecast; it is a sensitivity bucket. "
            "Institutional precision may use VIX/VXM ecosystem instruments where eligible."
        ),
        hedgeable=True,
        typical_units="USD per 1 vol point (vega-dollar equivalent)",
        examples=(
            "Options vega exposure",
            "Volatility futures/ETPs as eligible instruments (policy-gated)",
            "Vol term structure shocks",
        ),
    ),
    RiskAxisSpec(
        axis=RiskAxis.R3,
        name="Convexity / Gamma",
        short="Nonlinear exposure under large moves (gamma/convexity)",
        description=(
            "Second-order exposure capturing convexity and nonlinear P&L under shocks. "
            "Includes gap sensitivity where convexity dominates linear approximations. "
            "If gamma is proxied/linearized, it MUST be disclosed."
        ),
        hedgeable=True,
        typical_units="USD per (1% move)^2 (or gamma-dollar equivalent)",
        examples=(
            "Option gamma exposure",
            "Convex hedges vs crash moves (policy-gated)",
            "Nonlinear repricing under tail scenarios",
        ),
    ),
    RiskAxisSpec(
        axis=RiskAxis.R4,
        name="Carry / Cost Governance (Theta)",
        short="Time decay, financing, and explicit hedge cost governance",
        description=(
            "Governance axis for cost-of-hedge, carry, time decay, financing, and budget constraints. "
            "R4 is treated as a constraint/governance axis, not a pure hedgeable market risk. "
            "Engine uses R4 to reject hedges that violate cost policies."
        ),
        hedgeable=False,
        typical_units="USD per day/week (theta/carry equivalent) + policy budget metrics",
        examples=(
            "Option theta burn",
            "Funding/roll costs on futures hedges",
            "Budget caps and governance rejections",
        ),
    ),
    RiskAxisSpec(
        axis=RiskAxis.R5,
        name="Concentration / Correlation",
        short="Concentration risk, factor crowding, correlation breaks",
        description=(
            "Portfolio concentration and correlation structure risk: factor crowding, "
            "sector/mega-cap concentration, correlation spikes or breakdowns. "
            "This axis is policy-governed; correlation assumptions must be explicit in PolicyBundle."
        ),
        hedgeable=True,
        typical_units="Dimensionless concentration score + USD impact under correlation stress",
        examples=(
            "Mega-cap concentration overlays (policy-gated)",
            "Factor crowding stress",
            "Correlation spike scenarios",
        ),
    ),
    RiskAxisSpec(
        axis=RiskAxis.R6,
        name="Credit / Spread",
        short="Credit spread and credit beta exposure",
        description=(
            "Exposure to credit spread widening, credit beta, and credit regime stress. "
            "May be hedged with eligible credit instruments (policy-gated) or explicit proxies with disclosures."
        ),
        hedgeable=True,
        typical_units="USD per 1bp spread move (proxy-based) or credit beta impact",
        examples=(
            "High yield / investment grade credit beta",
            "Credit futures/indices as eligible instruments (policy-gated)",
            "Spread shock scenarios",
        ),
    ),
    RiskAxisSpec(
        axis=RiskAxis.R7,
        name="Liquidity / Microstructure",
        short="Liquidity stress, slippage, market impact, unwind risk",
        description=(
            "Liquidity and microstructure risk: slippage, market impact, wideners, "
            "depth collapse, unwind constraints. "
            "Instrument eligibility must enforce liquidity gating; approximations disclosed."
        ),
        hedgeable=True,
        typical_units="USD slippage/impact under stress + liquidity score",
        examples=(
            "Volume/OI gating and liquidity scores",
            "Slippage models under stress scenarios",
            "Unwind feasibility checks",
        ),
    ),
    RiskAxisSpec(
        axis=RiskAxis.R8,
        name="Tail / Gap / Crash",
        short="Extreme tail events, discontinuities, crash & gap risk",
        description=(
            "Tail risk: discontinuous moves, crashes, gaps, regime breaks beyond linear models. "
            "Tail hedges are explicitly labeled and policy-gated. "
            "Dual-use instruments (directional vs tail) must be classified explicitly per run."
        ),
        hedgeable=True,
        typical_units="USD loss under tail scenarios + tail-hedge premium metrics",
        examples=(
            "Crash scenarios beyond linear",
            "Deep OTM protection structures (policy-gated)",
            "Tail futures/structured overlays (policy-gated)",
        ),
    ),
)


# ============================================================
# Public API (used across contracts + engine)
# ============================================================

def risk_axis_order() -> Tuple[str, ...]:
    """Deterministic axis ordering (frozen)."""
    return tuple(a.axis for a in _RISK_AXIS_TABLE)


def validate_axis(axis: str) -> None:
    """Fail-fast validation for any emitted axis id."""
    ax = "" if axis is None else str(axis).strip()
    allowed = set(risk_axis_order())
    if ax not in allowed:
        raise ValueError(f"Unknown risk axis: {ax}. Allowed: {sorted(allowed)}")


def validate_r_vector(mapping: Mapping[str, Any]) -> None:
    """
    Validate that a dict-like R-vector contains only known axes.
    - Does NOT require presence of all axes (partial vectors allowed).
    - Does NOT validate numeric values here (numeric discipline is enforced in per-contract vector types).
    """
    if mapping is None:
        return
    if not isinstance(mapping, Mapping):
        raise ValueError("R-vector must be a mapping/dict-like object")
    for k in mapping.keys():
        validate_axis(str(k))


def get_risk_taxonomy(*, finalize: bool = True) -> RiskTaxonomy:
    """
    Return the canonical taxonomy object (ordered R1..R8).
    This is what /engine/catalog should emit verbatim.

    If finalize=True (default), taxonomy_hash is computed deterministically.
    """
    axes: List[Dict[str, Any]] = [
        {
            "axis": a.axis,
            "name": a.name,
            "short": a.short,
            "description": a.description,
            "hedgeable": bool(a.hedgeable),
            "typical_units": a.typical_units,
            "examples": list(a.examples),
        }
        for a in _RISK_AXIS_TABLE
    ]
    t = RiskTaxonomy(axes=axes)
    return t.finalize() if finalize else t


def compute_taxonomy_hash() -> str:
    """
    Convenience function for services that need the taxonomy hash without
    instantiating full catalog responses.
    """
    return get_risk_taxonomy(finalize=True).taxonomy_hash


__all__ = [
    "RiskAxis",
    "RiskAxisSpec",
    "RiskTaxonomy",
    "RISK_TAXONOMY_SCHEMA_ID",
    "RISK_TAXONOMY_SCHEMA_VERSION",
    "risk_axis_order",
    "validate_axis",
    "validate_r_vector",
    "get_risk_taxonomy",
    "compute_taxonomy_hash",
]
