from __future__ import annotations

"""
app/contracts/instrument_catalog.py
HedgeCalc Contract: InstrumentCatalog (v2, v1 schema)

This module defines the institution-grade **InstrumentCatalog** used by HedgeCalc.

BINDING RULES:
- Catalog is a snapshot artifact: core consumes a catalog snapshot (or a hash reference).
- Deterministic: catalog_hash is SHA-256 over canonical JSON (excluding catalog_hash).
- Eligibility gating MUST be possible using catalog metadata alone (plus PolicyBundle).
- No live/unlogged dependency: all contract specs must be embedded in the snapshot.
- Any semantic change requires schema_version bump.

What this catalog supports (v1 schema):
- Exchange/contract specs: symbol, exchange, type, currency, multiplier, tick, settlement, hours
- Liquidity metadata: ADV, OI, liquidity_score (0..1), staleness timestamps (optional)
- Mandate gating: allow/prohibit tags (policy-driven usage)
- Risk-axis eligibility: which R axes the instrument is permitted to hedge
- Slippage model parameters (deterministic inputs; modeling happens elsewhere)
- Disclosures: proxy instruments and approximations are recorded by engine stages, not here

Non-goals (catalog):
- Pricing
- Forecasts
- Execution routing
- Broker connectivity

INSTITUTIONAL HARDENING (added in this revision):
- Stable, deterministic ordering guarantees (instrument list + eligible_axes + tags)
- Strong validation for finite numeric fields (no NaN/Inf)
- Catalog-level uniqueness enforcement (instrument_id uniqueness)
- Deterministic dedupe + ordering for instruments
- Optional helper methods for lookup without mutating catalog
"""

from collections.abc import Sequence
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator, model_validator

from app.contracts.risk_taxonomy import validate_axis
from app.contracts.run_envelope import _is_sha256_hex, hash_canonical, utcnow

# ============================================================
# Enums (frozen semantics for v1)
# ============================================================


class Exchange(str, Enum):
    CBOE = "CBOE"
    CFE = "CFE"
    CME = "CME"
    CBOT = "CBOT"
    NYSE = "NYSE"
    NASDAQ = "NASDAQ"
    OTC = "OTC"
    OTHER = "OTHER"


class InstrumentType(str, Enum):
    EQUITY = "EQUITY"
    ETF = "ETF"
    INDEX = "INDEX"
    OPTION = "OPTION"
    FUTURE = "FUTURE"
    FUTURE_OPTION = "FUTURE_OPTION"
    FX = "FX"
    CRYPTO = "CRYPTO"
    BOND = "BOND"
    OTHER = "OTHER"


class SettlementType(str, Enum):
    CASH = "CASH"
    PHYSICAL = "PHYSICAL"
    OTHER = "OTHER"


class QuoteConvention(str, Enum):
    PRICE = "PRICE"  # quoted as price (e.g., 19.25)
    INDEX_POINTS = "INDEX_POINTS"
    PERCENT = "PERCENT"
    YIELD = "YIELD"
    OTHER = "OTHER"


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
    # NaN / Inf checks without importing math (works deterministically)
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
        return tuple()
    if not isinstance(v, (list, tuple)):
        raise ValueError("Expected list/tuple of strings")
    out: list[str] = []
    for item in v:
        if item is None:
            continue
        s = str(item).strip()
        if s:
            out.append(s)
    # deterministic ordering + dedupe
    return tuple(sorted(set(out)))


def _sorted_unique_axes(v: Any) -> tuple[str, ...]:
    if v is None:
        return tuple()
    if not isinstance(v, (list, tuple)):
        raise ValueError("eligible_axes must be list/tuple of axis ids")
    out: list[str] = []
    for a in v:
        if a is None:
            continue
        axis = str(a).strip()
        if not axis:
            continue
        validate_axis(axis)  # canonical validator (single source of truth)
        out.append(axis)
    return tuple(sorted(set(out)))


# ============================================================
# Sub-objects
# ============================================================


class TradingHours(BaseModel):
    """
    Trading hours are captured as strings for portability.
    Interpretation is policy/UI responsibility.
    """

    timezone: str = Field(default="UTC")
    regular: str | None = Field(default=None, description="Human-readable regular hours")
    extended: str | None = Field(default=None, description="Human-readable extended hours")
    notes: str | None = Field(default=None)

    @field_validator("timezone", mode="before")
    @classmethod
    def _tz(cls, v: Any) -> str:
        # Keep permissive but deterministic; no tz database lookups here.
        s = "UTC" if v is None else str(v).strip()
        return s or "UTC"


class ContractSpecs(BaseModel):
    """
    Minimal deterministic contract specs needed for sizing and audit.
    """

    multiplier: float = Field(..., description="Contract multiplier (e.g., $50 per point)")
    tick_size: float = Field(..., description="Minimum tick increment")
    tick_value: float = Field(..., description="Value of one tick in currency units")
    currency: str = Field(default="USD")
    settlement: SettlementType = Field(default=SettlementType.CASH)
    quote_convention: QuoteConvention = Field(default=QuoteConvention.PRICE)

    @field_validator("multiplier", "tick_size", "tick_value", mode="before")
    @classmethod
    def _finite_positive(cls, v: Any, info: Any) -> float:
        fv = _finite_float(v, field_name=str(info.field_name))
        assert fv is not None
        if fv <= 0.0:
            raise ValueError(f"{info.field_name} must be > 0")
        return float(fv)

    @field_validator("currency", mode="before")
    @classmethod
    def _currency(cls, v: Any) -> str:
        s = "USD" if v is None else str(v).strip().upper()
        return s or "USD"


class LiquidityMetrics(BaseModel):
    """
    Liquidity metadata for gating and disclosures.
    Values may be None if unavailable, but liquidity_score must be provided (0..1).
    """

    avg_daily_volume: float | None = Field(default=None, description="ADV (units depend on instrument)")
    open_interest: float | None = Field(default=None, description="Open interest (contracts)")
    liquidity_score: float = Field(default=0.0, description="Normalized liquidity score in [0,1]")
    as_of: str | None = Field(default=None, description="ISO timestamp string for when liquidity was measured")

    @field_validator("avg_daily_volume", "open_interest", mode="before")
    @classmethod
    def _finite_optional(cls, v: Any, info: Any) -> float | None:
        return _finite_float(v, field_name=str(info.field_name), allow_none=True)

    @field_validator("liquidity_score", mode="before")
    @classmethod
    def _score(cls, v: Any) -> float:
        fv = _finite_float(v, field_name="liquidity_score")
        assert fv is not None
        if not 0.0 <= float(fv) <= 1.0:
            raise ValueError("liquidity_score must be within [0,1]")
        return float(fv)

    @field_validator("as_of", mode="before")
    @classmethod
    def _as_of(cls, v: Any) -> str | None:
        if v is None:
            return None
        s = str(v).strip()
        return s or None


class SlippageModelParams(BaseModel):
    """
    Deterministic inputs to slippage estimation models.
    Modeling occurs in cost_engine; this is just the parameter container.
    """

    model_id: str = Field(default="simple_bps_v1")
    half_spread_bps: float = Field(default=0.0, ge=0.0)
    impact_bps_per_1pct_adv: float = Field(default=0.0, ge=0.0)
    fixed_fee_per_contract: float = Field(default=0.0, ge=0.0)
    notes: str | None = Field(default=None)

    @field_validator("model_id", mode="before")
    @classmethod
    def _model_id(cls, v: Any) -> str:
        s = "simple_bps_v1" if v is None else str(v).strip()
        if not s:
            raise ValueError("model_id must be non-empty")
        return s

    @field_validator("half_spread_bps", "impact_bps_per_1pct_adv", "fixed_fee_per_contract", mode="before")
    @classmethod
    def _finite_ge0(cls, v: Any, info: Any) -> float:
        fv = _finite_float(v, field_name=str(info.field_name))
        assert fv is not None
        if float(fv) < 0.0:
            raise ValueError(f"{info.field_name} must be >= 0")
        return float(fv)

    @field_validator("notes", mode="before")
    @classmethod
    def _notes(cls, v: Any) -> str | None:
        if v is None:
            return None
        s = str(v).strip()
        return s or None


class MandateTags(BaseModel):
    """
    Tags used for allow/prohibit gating in PolicyBundle or tenant mandates.

    Contract discipline:
    - Stored as sorted, unique tuples for deterministic behavior.
    """

    allow: tuple[str, ...] = Field(default_factory=tuple)
    prohibit: tuple[str, ...] = Field(default_factory=tuple)

    @field_validator("allow", "prohibit", mode="before")
    @classmethod
    def _tuple_strs_validator(cls, v: Any) -> tuple[str, ...]:
        return _tuple_strs(v)


# ============================================================
# Instrument definition
# ============================================================


class Instrument(BaseModel):
    """
    Single instrument definition for eligibility + sizing.

    NOTE:
    - This contract is intentionally pricing-agnostic.
    - Any required sizing components for derivatives must be embedded in `contract`.
    """

    instrument_id: str = Field(..., description="Stable internal id (unique within catalog)")
    symbol: str = Field(..., description="Tradable symbol")
    exchange: Exchange = Field(default=Exchange.OTHER)
    instrument_type: InstrumentType = Field(default=InstrumentType.OTHER)

    name: str | None = Field(default=None)
    description: str | None = Field(default=None)

    contract: ContractSpecs | None = Field(default=None, description="Required for futures/options sizing")
    trading_hours: TradingHours | None = Field(default=None)

    eligible_axes: tuple[str, ...] = Field(
        default_factory=tuple,
        description="Which R axes this instrument is eligible to hedge (R1..R8 ids)",
    )

    liquidity: LiquidityMetrics = Field(default_factory=LiquidityMetrics)
    mandates: MandateTags = Field(default_factory=MandateTags)
    slippage: SlippageModelParams = Field(default_factory=SlippageModelParams)

    # Optional metadata for disclosures
    is_proxy: bool = Field(default=False, description="True if instrument is a proxy for another risk")
    proxy_for: str | None = Field(default=None, description="Optional description of what it proxies")

    @field_validator("instrument_id", mode="before")
    @classmethod
    def _instrument_id(cls, v: Any) -> str:
        return _non_empty_str(v, field_name="instrument_id")

    @field_validator("symbol", mode="before")
    @classmethod
    def _symbol(cls, v: Any) -> str:
        # Keep raw symbol (do not upper() blindly); exchanges may require case.
        return _non_empty_str(v, field_name="symbol")

    @field_validator("name", "description", "proxy_for", mode="before")
    @classmethod
    def _optional_str(cls, v: Any) -> str | None:
        if v is None:
            return None
        s = str(v).strip()
        return s or None

    @field_validator("eligible_axes", mode="before")
    @classmethod
    def _validate_axes(cls, v: Any) -> tuple[str, ...]:
        return _sorted_unique_axes(v)

    @model_validator(mode="after")
    def _validate_proxy(self) -> Instrument:
        # Proxy hygiene: if marked proxy, proxy_for should be present (not strictly required,
        # but strongly recommended to prevent silent ambiguity).
        if bool(self.is_proxy) and not (self.proxy_for and self.proxy_for.strip()):
            # Fail-closed at contract level (institutions prefer explicitness).
            raise ValueError("Instrument marked is_proxy=True must include proxy_for")
        return self


# ============================================================
# Catalog envelope
# ============================================================

CATALOG_SCHEMA_ID = "instrument_catalog"
CATALOG_SCHEMA_VERSION = "v1"


class InstrumentCatalog(BaseModel):
    """
    Snapshot-bound catalog container.

    Determinism rules:
    - `created_at` is metadata ONLY and is never included in the hash.
    - `catalog_hash` is over canonical JSON of the catalog excluding `catalog_hash` and `created_at`.
    - Instruments are deterministically ordered by instrument_id in `finalize()`.
    """

    schema_id: str = Field(default=CATALOG_SCHEMA_ID)
    schema_version: str = Field(default=CATALOG_SCHEMA_VERSION)

    catalog_id: UUID = Field(default_factory=uuid4, description="Unique catalog snapshot id")
    created_at: str = Field(
        default_factory=lambda: utcnow().isoformat(),
        description="UTC timestamp string (metadata only; excluded from catalog_hash)",
    )

    instruments: list[Instrument] = Field(default_factory=list, description="Ordered list of instruments")

    catalog_hash: str = Field(default="", description="Computed by finalize() if empty")

    @field_validator("catalog_hash", mode="before")
    @classmethod
    def _validate_hash(cls, v: Any) -> str:
        if v in (None, ""):
            return ""
        if not isinstance(v, str) or not _is_sha256_hex(v):
            raise ValueError("Expected SHA-256 hex digest")
        return v

    @model_validator(mode="after")
    def _validate_uniqueness(self) -> InstrumentCatalog:
        # Enforce uniqueness for institutional safety (catalog must be internally consistent).
        seen: set[str] = set()
        dups: list[str] = []
        for inst in self.instruments:
            iid = inst.instrument_id
            if iid in seen:
                dups.append(iid)
            seen.add(iid)
        if dups:
            raise ValueError(f"Duplicate instrument_id(s) in catalog: {sorted(set(dups))}")
        return self

    def to_canonical_dict(self) -> dict[str, Any]:
        d = self.model_dump(mode="json")
        d.pop("catalog_hash", None)
        d.pop("created_at", None)  # never hash timestamps
        return d

    def compute_catalog_hash(self) -> str:
        return hash_canonical(self.to_canonical_dict())

    def finalize(self) -> InstrumentCatalog:
        """
        Deterministically normalize and seal catalog integrity.
        - Sort instruments by instrument_id
        - Compute catalog_hash if missing
        """
        instruments_sorted = sorted(self.instruments, key=lambda x: x.instrument_id)
        candidate = self.model_copy(update={"instruments": instruments_sorted})
        ch = candidate.catalog_hash or candidate.compute_catalog_hash()
        return candidate.model_copy(update={"catalog_hash": ch})

    def index_by_id(self) -> dict[str, Instrument]:
        """
        Convenience accessor for orchestrators/stages.
        NOTE: This does not mutate the catalog and does not affect determinism.
        """
        return {i.instrument_id: i for i in self.instruments}


def build_catalog(instruments: Sequence[Instrument]) -> InstrumentCatalog:
    """
    Convenience builder for callers.
    Ensures deterministic ordering + sealed catalog_hash.
    """
    cat = InstrumentCatalog(instruments=list(instruments))
    return cat.finalize()


__all__ = [
    "Exchange",
    "InstrumentType",
    "SettlementType",
    "QuoteConvention",
    "TradingHours",
    "ContractSpecs",
    "LiquidityMetrics",
    "SlippageModelParams",
    "MandateTags",
    "Instrument",
    "InstrumentCatalog",
    "build_catalog",
]
