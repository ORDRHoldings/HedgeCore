from __future__ import annotations

"""
app/contracts/portfolio_snapshot.py
HedgeCalc Contract: PortfolioSnapshot (v1)

This module defines the snapshot-bound **PortfolioSnapshot** contract used by HedgeCalc.

BINDING RULES (institutional):
- Snapshot-only: core engine consumes a portfolio snapshot (or hash reference). No live dependencies.
- Deterministic hashing: `portfolio_hash` is SHA-256 over canonical JSON of the snapshot
  excluding `portfolio_hash` and timestamps/metadata fields.
- Cross-language stability: payloads must be JSON-primitive-friendly; no NaN/Inf values.
- Eligibility: positions reference instruments by `instrument_id` (resolved via InstrumentCatalog).
- No pricing logic here: pricing belongs to MarketSnapshot; this contract only describes the portfolio.
- Any semantic change requires schema_version bump.

What this snapshot supports (v1):
- Base currency + optional AUM metadata (for reporting / governance only)
- Positions:
  - instrument_id (required)
  - asset_class and instrument_type hints (optional; non-binding)
  - quantity and side (long/short via sign discipline or explicit side)
  - optional cost_basis and tags
  - optional option-style exposure fields (strike/expiry/right) as metadata (NOT pricing)
- Deterministic normalization:
  - tags are sorted/deduped tuples
  - positions are deterministically ordered by (instrument_id, position_id)

Non-goals:
- Market pricing / valuation
- Greeks calculation
- Margin / broker requirements
"""

from collections.abc import Sequence
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator, model_validator

from app.contracts.run_envelope import _is_sha256_hex, hash_canonical, utcnow

# ============================================================
# Enums (frozen v1 semantics)
# ============================================================

class PositionSide(str, Enum):
    LONG = "LONG"
    SHORT = "SHORT"


class AssetClass(str, Enum):
    EQUITIES = "EQUITIES"
    OPTIONS = "OPTIONS"
    FUTURES = "FUTURES"
    FX = "FX"
    CRYPTO = "CRYPTO"
    RATES = "RATES"
    CREDIT = "CREDIT"
    COMMODITIES = "COMMODITIES"
    OTHER = "OTHER"


class OptionRight(str, Enum):
    CALL = "CALL"
    PUT = "PUT"


# ============================================================
# Helpers (internal; deterministic + audit-safe)
# ============================================================

def _finite_float(v: Any, *, field_name: str, allow_none: bool = False) -> float | None:
    if v is None:
        if allow_none:
            return None
        return 0.0
    try:
        fv = float(v)
    except Exception as e:
        raise ValueError(f"{field_name} must be numeric") from e
    if fv != fv or fv in (float("inf"), float("-inf")):
        raise ValueError(f"{field_name} must be finite (no NaN/Inf)")
    return fv


def _non_empty_str(v: Any, *, field_name: str) -> str:
    s = "" if v is None else str(v).strip()
    if not s:
        raise ValueError(f"{field_name} must be a non-empty string")
    return s


def _tuple_strs(v: Any) -> tuple[str, ...]:
    if v is None:
        return ()
    if not isinstance(v, list | tuple):
        raise ValueError("Expected list/tuple of strings")
    out: list[str] = []
    for item in v:
        if item is None:
            continue
        s = str(item).strip()
        if s:
            out.append(s)
    return tuple(sorted(set(out)))


def _upper_currency(v: Any) -> str:
    s = "USD" if v is None else str(v).strip().upper()
    return s or "USD"


def _normalize_side(quantity: float, side: PositionSide | None) -> tuple[float, PositionSide]:
    """
    Deterministic normalization:
    - If side is provided, quantity is coerced to absolute value and side is trusted.
    - If side is not provided, sign(quantity) determines side.
    """
    q = float(quantity)
    if side is not None:
        return abs(q), side
    # Infer side from sign
    if q < 0:
        return abs(q), PositionSide.SHORT
    return abs(q), PositionSide.LONG


# ============================================================
# Position contract
# ============================================================

class Position(BaseModel):
    """
    Single portfolio position.

    Institutional discipline:
    - instrument_id is the primary reference (resolves via InstrumentCatalog).
    - quantity must be finite.
    - side+quantity are normalized deterministically for consistent hashing.
    - Optional metadata fields are allowed but must remain audit-safe.
    """

    position_id: UUID = Field(default_factory=uuid4, description="Unique position identifier within the snapshot")
    instrument_id: str = Field(..., description="InstrumentCatalog.instrument_id reference (required)")

    asset_class: AssetClass = Field(default=AssetClass.OTHER, description="Optional classification hint (non-binding)")
    symbol_hint: str | None = Field(default=None, description="Optional symbol hint for UI (non-binding)")

    quantity: float = Field(..., description="Position size (units depend on instrument). Must be finite.")
    side: PositionSide | None = Field(
        default=None,
        description="If omitted, side is inferred from sign(quantity). If provided, quantity is treated as absolute.",
    )

    # Optional governance metadata (non-binding)
    tags: tuple[str, ...] = Field(default_factory=tuple, description="Sorted unique position tags for gating/reporting")
    cost_basis: float | None = Field(default=None, description="Optional cost basis (per unit); not used for pricing")

    # Optional option metadata (NOT used for pricing here; for audit/reference only)
    option_right: OptionRight | None = Field(default=None)
    option_strike: float | None = Field(default=None, description="Strike (if applicable)")
    option_expiry: str | None = Field(default=None, description="Expiry date/time string (ISO recommended)")

    @field_validator("instrument_id", mode="before")
    @classmethod
    def _iid(cls, v: Any) -> str:
        return _non_empty_str(v, field_name="instrument_id")

    @field_validator("symbol_hint", "option_expiry", mode="before")
    @classmethod
    def _opt_str(cls, v: Any) -> str | None:
        if v is None:
            return None
        s = str(v).strip()
        return s or None

    @field_validator("quantity", mode="before")
    @classmethod
    def _qty(cls, v: Any) -> float:
        fv = _finite_float(v, field_name="quantity")
        assert fv is not None
        # allow zero, but it should generally be filtered upstream
        return float(fv)

    @field_validator("cost_basis", "option_strike", mode="before")
    @classmethod
    def _finite_optional(cls, v: Any, info: Any) -> float | None:
        return _finite_float(v, field_name=str(info.field_name), allow_none=True)

    @field_validator("tags", mode="before")
    @classmethod
    def _tags(cls, v: Any) -> tuple[str, ...]:
        return _tuple_strs(v)

    @model_validator(mode="after")
    def _normalize(self) -> Position:
        q, s = _normalize_side(float(self.quantity), self.side)
        # Normalize fields deterministically
        return self.model_copy(update={"quantity": float(q), "side": s})


# ============================================================
# Snapshot envelope
# ============================================================

SNAPSHOT_SCHEMA_ID = "portfolio_snapshot"
SNAPSHOT_SCHEMA_VERSION = "v1"


class PortfolioSnapshot(BaseModel):
    """
    Portfolio snapshot container (snapshot-bound).

    Determinism rules:
    - `created_at` is metadata only and is excluded from portfolio_hash.
    - `portfolio_hash` is computed over canonical JSON excluding `portfolio_hash` and `created_at`.
    - Positions are deterministically ordered by (instrument_id, position_id).
    """

    schema_id: str = Field(default=SNAPSHOT_SCHEMA_ID)
    schema_version: str = Field(default=SNAPSHOT_SCHEMA_VERSION)

    snapshot_id: UUID = Field(default_factory=uuid4, description="Unique snapshot identifier")
    created_at: str = Field(
        default_factory=lambda: utcnow().isoformat(),
        description="UTC timestamp string (metadata only; excluded from portfolio_hash)",
    )

    base_currency: str = Field(default="USD", description="Base reporting currency")
    aum: float | None = Field(default=None, description="Optional AUM metadata (base_currency units)")

    positions: list[Position] = Field(default_factory=list, description="Ordered list of positions")

    portfolio_hash: str = Field(default="", description="Computed by finalize() if empty")

    @field_validator("base_currency", mode="before")
    @classmethod
    def _bc(cls, v: Any) -> str:
        return _upper_currency(v)

    @field_validator("aum", mode="before")
    @classmethod
    def _aum(cls, v: Any) -> float | None:
        return _finite_float(v, field_name="aum", allow_none=True)

    @field_validator("portfolio_hash", mode="before")
    @classmethod
    def _validate_hash(cls, v: Any) -> str:
        if v in (None, ""):
            return ""
        if not isinstance(v, str) or not _is_sha256_hex(v):
            raise ValueError("Expected SHA-256 hex digest")
        return v

    @model_validator(mode="after")
    def _validate_positions(self) -> PortfolioSnapshot:
        # Institutional safety: do not allow empty instrument_id; Position already enforces.
        # Enforce uniqueness of position_id (and optionally instrument_id duplicates allowed).
        seen: set[str] = set()
        dups: list[str] = []
        for p in self.positions:
            pid = str(p.position_id)
            if pid in seen:
                dups.append(pid)
            seen.add(pid)
        if dups:
            raise ValueError(f"Duplicate position_id(s) in portfolio snapshot: {sorted(set(dups))}")
        return self

    def to_canonical_dict(self) -> dict[str, Any]:
        d = self.model_dump(mode="json")
        d.pop("portfolio_hash", None)
        d.pop("created_at", None)  # never hash timestamps
        return d

    def compute_portfolio_hash(self) -> str:
        return hash_canonical(self.to_canonical_dict())

    def finalize(self) -> PortfolioSnapshot:
        """
        Deterministically normalize and seal snapshot integrity:
        - Sort positions by (instrument_id, position_id)
        - Compute portfolio_hash if missing
        """
        positions_sorted = sorted(self.positions, key=lambda p: (p.instrument_id, str(p.position_id)))
        candidate = self.model_copy(update={"positions": positions_sorted})
        ph = candidate.portfolio_hash or candidate.compute_portfolio_hash()
        return candidate.model_copy(update={"portfolio_hash": ph})

    def index_by_instrument_id(self) -> dict[str, list[Position]]:
        """
        Convenience accessor for exposure engine.
        NOTE: This does not mutate the snapshot and does not affect determinism.
        """
        out: dict[str, list[Position]] = {}
        for p in self.positions:
            out.setdefault(p.instrument_id, []).append(p)
        return out


def build_portfolio_snapshot(
    *,
    base_currency: str = "USD",
    aum: float | None = None,
    positions: Sequence[Position],
) -> PortfolioSnapshot:
    """
    Convenience builder for callers.
    Ensures deterministic ordering + sealed portfolio_hash.
    """
    snap = PortfolioSnapshot(base_currency=base_currency, aum=aum, positions=list(positions))
    return snap.finalize()


__all__ = [
    "PositionSide",
    "AssetClass",
    "OptionRight",
    "Position",
    "PortfolioSnapshot",
    "build_portfolio_snapshot",
]
