from __future__ import annotations

"""
app/contracts/market_snapshot.py
HedgeCalc Contract: MarketSnapshot (v1)

MarketSnapshot is the frozen, snapshot-bound representation of market state consumed by the HedgeCalc engine.

BINDING DOCTRINE (institutional):
- Snapshot-only: no live feeds, no mutable references.
- Deterministic: identical snapshots -> identical hashes and downstream decisions.
- Audit-safe: canonical JSON hashing; timestamps are NEVER included in hashes.
- Pricing-only: Greeks, forecasts, signals, and execution are OUT OF SCOPE.

Used for:
- Exposure valuation anchors (spot/reference prices)
- Scenario baseline reference
- Cost/carry computations where applicable (via other stages)

NON-GOALS:
- Forecasting
- Vol surface construction
- Correlation modeling
- Order book / microstructure
"""

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator, model_validator

from app.contracts.run_envelope import _is_sha256_hex, hash_canonical, utcnow

# ============================================================
# Helpers (deterministic, audit-safe)
# ============================================================

def _finite_float(v: Any, *, field_name: str) -> float:
    try:
        fv = float(v)
    except Exception as e:
        raise ValueError(f"{field_name} must be numeric") from e
    if fv != fv or fv in (float("inf"), float("-inf")):
        raise ValueError(f"{field_name} must be finite (no NaN/Inf)")
    return float(fv)


def _non_empty_str(v: Any, *, field_name: str) -> str:
    s = "" if v is None else str(v).strip()
    if not s:
        raise ValueError(f"{field_name} must be non-empty")
    return s


def _optional_str(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


# ============================================================
# Atomic pricing record
# ============================================================

class MarketPrice(BaseModel):
    """
    Atomic market price record for a single instrument.

    Contract rules:
    - instrument_id must match InstrumentCatalog.instrument_id
    - price must be finite
    - currency is informational only (no FX conversion here)
    - source/as_of are metadata only and never affect snapshot_hash directly except as raw fields
      (hash excludes created_at but DOES include price records; therefore keep price records stable).
    """

    instrument_id: str = Field(..., description="Instrument id matching InstrumentCatalog.instrument_id")
    price: float = Field(..., description="Spot or reference price used by engine stages")
    currency: str = Field(default="USD", description="Informational currency code (no conversion performed)")
    source: str | None = Field(default=None, description="Snapshot source label (vendor/file/venue)")
    as_of: str | None = Field(default=None, description="ISO timestamp string for the price record (optional)")

    @field_validator("instrument_id", mode="before")
    @classmethod
    def _iid(cls, v: Any) -> str:
        return _non_empty_str(v, field_name="instrument_id")

    @field_validator("price", mode="before")
    @classmethod
    def _price(cls, v: Any) -> float:
        return _finite_float(v, field_name="price")

    @field_validator("currency", mode="before")
    @classmethod
    def _currency(cls, v: Any) -> str:
        s = "USD" if v is None else str(v).strip().upper()
        return s or "USD"

    @field_validator("source", "as_of", mode="before")
    @classmethod
    def _meta(cls, v: Any) -> str | None:
        return _optional_str(v)


# ============================================================
# MarketSnapshot contract
# ============================================================

class MarketSnapshot(BaseModel):
    """
    MarketSnapshot: frozen pricing state for a run.

    Determinism rules:
    - created_at is metadata ONLY (never hashed)
    - snapshot_hash is SHA-256 over canonical JSON excluding snapshot_hash + created_at
    - prices are deterministically sorted by instrument_id in finalize()
    - duplicate instrument_id is forbidden (fail-closed)
    """

    schema_id: str = Field(default="market_snapshot", description="Stable schema identifier")
    schema_version: str = Field(default="v1", description="Schema version")

    snapshot_id: UUID = Field(default_factory=uuid4, description="Unique snapshot identifier")
    created_at: datetime = Field(default_factory=utcnow, description="UTC timestamp (metadata only; excluded from hash)")

    prices: list[MarketPrice] = Field(default_factory=list, description="List of instrument prices")

    snapshot_hash: str = Field(default="", description="Computed by finalize() if empty")

    # --------------------
    # Validators
    # --------------------

    @field_validator("snapshot_hash", mode="before")
    @classmethod
    def _validate_hash(cls, v: Any) -> str:
        if v in (None, ""):
            return ""
        if not isinstance(v, str) or not _is_sha256_hex(v):
            raise ValueError("snapshot_hash must be a SHA-256 hex digest")
        return v

    @model_validator(mode="after")
    def _validate_uniqueness(self) -> MarketSnapshot:
        seen: set[str] = set()
        dups: list[str] = []
        for p in self.prices:
            iid = p.instrument_id
            if iid in seen:
                dups.append(iid)
            seen.add(iid)
        if dups:
            raise ValueError(f"Duplicate instrument_id(s) in MarketSnapshot: {sorted(set(dups))}")
        return self

    # --------------------
    # Hashing / sealing
    # --------------------

    def to_canonical_dict(self) -> dict[str, Any]:
        """
        Canonical dict used for hashing.
        Excludes snapshot_hash and created_at (timestamps are never hashed).
        """
        d = self.model_dump(mode="json")
        d.pop("snapshot_hash", None)
        d.pop("created_at", None)
        return d

    def compute_snapshot_hash(self) -> str:
        return hash_canonical(self.to_canonical_dict())

    def finalize(self) -> MarketSnapshot:
        """
        Deterministically seal snapshot:
        - sort prices by instrument_id
        - compute snapshot_hash if missing
        """
        prices_sorted = sorted(self.prices, key=lambda p: p.instrument_id)
        candidate = self.model_copy(update={"prices": prices_sorted})
        sh = candidate.snapshot_hash or candidate.compute_snapshot_hash()
        return candidate.model_copy(update={"snapshot_hash": sh})

    # --------------------
    # Convenience accessors
    # --------------------

    def index_by_id(self) -> dict[str, MarketPrice]:
        """Deterministic lookup map. Does not mutate snapshot."""
        return {p.instrument_id: p for p in self.prices}


# ============================================================
# Convenience builder
# ============================================================

def build_market_snapshot(prices: list[MarketPrice]) -> MarketSnapshot:
    """Convenience constructor for callers (sealed + hashed)."""
    snap = MarketSnapshot(prices=prices)
    return snap.finalize()


__all__ = [
    "MarketPrice",
    "MarketSnapshot",
    "build_market_snapshot",
]
