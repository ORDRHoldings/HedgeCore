"""
Architecture-freeze invariant: R1-R8 Risk Taxonomy.

CLAUDE.md immutable rule #2: "R1-R8 Risk Taxonomy: NEVER modify."

The taxonomy is the canonical contract that engine + policy + catalog
all key off. A silent rename (e.g. "Volatility / Vega" → "Vega") looks
benign but breaks every downstream consumer that string-matches the
axis name, including saved policies and audit-trail labels.

These tests pin the contract so that any change to:
  - axis identifiers (R1..R8)
  - axis order
  - human-readable names
  - hedgeable classification (R4 is the only governance-only axis)
  - schema_version

requires a deliberate, ADR-reviewed update to this file.
"""
from __future__ import annotations

from app.contracts.risk_taxonomy import (
    RISK_TAXONOMY_SCHEMA_ID,
    RISK_TAXONOMY_SCHEMA_VERSION,
    RiskAxis,
    compute_taxonomy_hash,
    get_risk_taxonomy,
    risk_axis_order,
    validate_axis,
    validate_r_vector,
)


# ── Identifiers and ordering ────────────────────────────────────────


def test_axis_identifiers_are_r1_through_r8():
    expected = ("R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8")
    assert risk_axis_order() == expected


def test_riskaxis_constants_match_canonical_ids():
    """
    The RiskAxis class constants are imported by callers across the
    codebase. Renumbering or renaming them would cause silent breakage.
    """
    assert (
        RiskAxis.R1, RiskAxis.R2, RiskAxis.R3, RiskAxis.R4,
        RiskAxis.R5, RiskAxis.R6, RiskAxis.R7, RiskAxis.R8,
    ) == ("R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8")


# ── Names and hedgeable classification ──────────────────────────────


CANONICAL_AXIS_NAMES: dict[str, str] = {
    "R1": "Directional / Delta",
    "R2": "Volatility / Vega",
    "R3": "Convexity / Gamma",
    "R4": "Carry / Cost Governance (Theta)",
    "R5": "Concentration / Correlation",
    "R6": "Credit / Spread",
    "R7": "Liquidity / Microstructure",
    "R8": "Tail / Gap / Crash",
}


def test_axis_names_match_canonical():
    """
    Renaming an axis silently breaks any UI/policy/audit consumer that
    string-matches the name. If a rename is genuinely needed, update
    CANONICAL_AXIS_NAMES here AND publish a crosswalk per the contract.
    """
    taxonomy = get_risk_taxonomy()
    by_axis = {rec["axis"]: rec["name"] for rec in taxonomy.axes}
    assert by_axis == CANONICAL_AXIS_NAMES


def test_only_r4_is_non_hedgeable():
    """
    R4 is the cost/carry governance axis — explicitly non-hedgeable per
    the taxonomy spec. Every other axis is a hedgeable market risk.
    Flipping R4 to hedgeable=True (or any other axis to False) silently
    changes engine behavior on policy validation.
    """
    taxonomy = get_risk_taxonomy()
    by_axis = {rec["axis"]: rec["hedgeable"] for rec in taxonomy.axes}
    assert by_axis["R4"] is False, "R4 must be non-hedgeable (governance axis)"
    for axis in ("R1", "R2", "R3", "R5", "R6", "R7", "R8"):
        assert by_axis[axis] is True, f"{axis} must be hedgeable"


# ── Schema version and required fields ──────────────────────────────


def test_schema_version_is_v1():
    """Bumping schema_version is a contract change — requires ADR."""
    assert RISK_TAXONOMY_SCHEMA_ID == "risk_taxonomy"
    assert RISK_TAXONOMY_SCHEMA_VERSION == "v1"


def test_every_axis_has_required_fields():
    taxonomy = get_risk_taxonomy()
    required = {"axis", "name", "short", "description", "hedgeable", "typical_units", "examples"}
    for rec in taxonomy.axes:
        missing = required - rec.keys()
        assert not missing, f"axis {rec.get('axis')!r} missing fields: {missing}"


# ── Hash stability (regression guard) ───────────────────────────────


def test_taxonomy_hash_is_deterministic():
    """Same code path → same hash, every call. No clock or rng dependency."""
    h1 = compute_taxonomy_hash()
    h2 = compute_taxonomy_hash()
    assert h1 == h2
    assert len(h1) == 64
    assert all(c in "0123456789abcdef" for c in h1)


def test_finalized_taxonomy_carries_hash():
    """get_risk_taxonomy(finalize=True) must populate taxonomy_hash."""
    t = get_risk_taxonomy(finalize=True)
    assert t.taxonomy_hash != ""
    assert len(t.taxonomy_hash) == 64


# ── Validators ──────────────────────────────────────────────────────


def test_validate_axis_accepts_canonical_ids():
    for axis in risk_axis_order():
        validate_axis(axis)  # should not raise


def test_validate_axis_rejects_unknown():
    import pytest
    for bad in ("R0", "R9", "r1", "  ", "RX", ""):
        with pytest.raises(ValueError):
            validate_axis(bad)


def test_validate_r_vector_partial_ok_unknown_rejected():
    import pytest
    # Partial is allowed
    validate_r_vector({"R1": 1.0, "R3": 2.0})
    # Unknown axis rejected
    with pytest.raises(ValueError):
        validate_r_vector({"R1": 1.0, "RX": 2.0})
    # None is a no-op
    validate_r_vector(None)
