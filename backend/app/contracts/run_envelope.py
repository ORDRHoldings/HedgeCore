from __future__ import annotations

"""
app/contracts/run_envelope.py
HedgeCalc Contract: RunEnvelope (v1)

RunEnvelope is the **authoritative provenance + replay header** for every HedgeCalc run
(simulate / recommend). It binds inputs, policies, taxonomy, and outputs under a single
deterministic envelope suitable for audit, replay, and institutional governance.

BINDING DOCTRINE
- Snapshot-only: all dependencies are referenced by content hash
- Deterministic: identical snapshots + policy + engine build -> identical determinism_key
- Replay-safe: a run can be reconstructed from logged artifacts alone
- Trace-first: run_id binds all TraceBundle + logs across stages

NON-GOALS
- Runtime orchestration
- Business logic
- Mutable state
"""

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator

# ===========================
# Canonical utilities
# ===========================

def utcnow() -> datetime:
    """Timezone-aware UTC timestamp."""
    return datetime.now(UTC)


def _json_default(obj: Any) -> Any:
    """
    Canonical JSON fallback encoder.

    NOTE:
    Prefer primitives in contracts.
    This exists only to preserve replayability for edge metadata.
    """
    if isinstance(obj, datetime):
        return obj.astimezone(UTC).isoformat()
    if isinstance(obj, UUID):
        return str(obj)
    return str(obj)


def canonical_dumps(obj: Any) -> str:
    """Deterministic JSON serialization."""
    return json.dumps(
        obj,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=_json_default,
    )


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hash_canonical(obj: Any) -> str:
    """SHA-256 hash of canonical JSON representation."""
    return sha256_hex(canonical_dumps(obj).encode("utf-8"))


def _is_sha256_hex(value: str) -> bool:
    if not isinstance(value, str) or len(value) != 64:
        return False
    try:
        int(value, 16)
        return True
    except Exception:
        return False


# ===========================
# Enums
# ===========================

class RunMode(str, Enum):
    SIMULATE = "simulate"
    RECOMMEND = "recommend"


class EngineEndpoint(str, Enum):
    ENGINE_SIMULATE = "/engine/simulate"
    ENGINE_RECOMMEND = "/engine/recommend"
    ENGINE_CATALOG = "/engine/catalog"
    ENGINE_HEALTH = "/engine/health"


class CapabilityPack(str, Enum):
    """
    Optional capability packs.
    Core engine behavior must NOT depend on pack internals.
    """
    FORECAST = "forecast"
    LIVE_FEEDS = "live_feeds"
    EXECUTION = "execution"
    ALPHA_AI = "alpha_ai"


# ===========================
# Sub-contracts
# ===========================

class CorrelationIds(BaseModel):
    """Cross-system correlation identifiers (optional, audit-safe)."""
    request_id: str | None = Field(default=None)
    traceparent: str | None = Field(default=None)
    session_id: str | None = Field(default=None)


class InputDigest(BaseModel):
    """
    Input snapshot + policy digests.

    All hashes MUST be SHA-256 hex digests of canonical JSON.
    """
    portfolio_snapshot_hash: str
    market_snapshot_hash: str
    policy_bundle_hash: str
    scenario_set_hash: str | None = None

    @field_validator(
        "portfolio_snapshot_hash",
        "market_snapshot_hash",
        "policy_bundle_hash",
        "scenario_set_hash",
        mode="before",
    )
    @classmethod
    def _validate_hash(cls, v: Any) -> Any:
        if v is None:
            return v
        if not _is_sha256_hex(v):
            raise ValueError("Expected SHA-256 hex digest")
        return v


class OutputDigest(BaseModel):
    """
    Output artifact digests.
    Filled incrementally by orchestrator.
    """
    hedge_plan_hash: str | None = None
    trace_bundle_hash: str | None = None
    rejections_hash: str | None = None
    disclosures_hash: str | None = None

    @field_validator(
        "hedge_plan_hash",
        "trace_bundle_hash",
        "rejections_hash",
        "disclosures_hash",
        mode="before",
    )
    @classmethod
    def _validate_hash(cls, v: Any) -> Any:
        if v is None:
            return v
        if not _is_sha256_hex(v):
            raise ValueError("Expected SHA-256 hex digest")
        return v


# ===========================
# RunEnvelope
# ===========================

class RunEnvelope(BaseModel):
    """
    RunEnvelope: immutable provenance + replay header.

    This object is persisted verbatim for audit and replay.
    """

    # Schema
    schema_id: str = Field(default="run_envelope")
    schema_version: str = Field(default="v1")

    # Identity
    run_id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=utcnow)

    # Tenancy / actor
    tenant_id: str
    actor_user_id: str | None = None
    api_key_id: str | None = None

    # Request context (best-effort, non-sensitive)
    client_ip: str | None = None
    user_agent: str | None = None
    correlation: CorrelationIds = Field(default_factory=CorrelationIds)

    # Engine identity
    engine_name: str = Field(default="HedgeCalc")
    engine_version: str = Field(default="unknown")
    engine_build: str = Field(default="unknown")
    environment: str = Field(default="unknown")

    # Invocation
    run_mode: RunMode
    endpoint: EngineEndpoint

    # Canon references
    taxonomy_hash: str

    # Inputs / outputs
    inputs: InputDigest
    outputs: OutputDigest = Field(default_factory=OutputDigest)

    # Capability packs
    packs_enabled: list[CapabilityPack] = Field(default_factory=list)
    pack_artifacts: dict[str, str] = Field(default_factory=dict)

    # Determinism
    determinism_key: str = Field(default="")
    run_hash: str = Field(default="")
    is_replay: bool = Field(default=False)
    replay_of_run_id: UUID | None = None

    # Audit-safe notes
    warnings: list[str] = Field(default_factory=list)

    # -----------------------
    # Validators
    # -----------------------

    @field_validator("taxonomy_hash", mode="before")
    @classmethod
    def _validate_taxonomy_hash(cls, v: Any) -> Any:
        if not _is_sha256_hex(v):
            raise ValueError("taxonomy_hash must be SHA-256 hex")
        return v

    @field_validator("pack_artifacts")
    @classmethod
    def _validate_pack_artifacts(cls, v: Any) -> dict[str, str]:
        if v is None:
            return {}
        if not isinstance(v, dict):
            raise ValueError("pack_artifacts must be a dict")
        for k, hv in v.items():
            if not isinstance(k, str) or not k:
                raise ValueError("pack_artifacts keys must be non-empty strings")
            if not _is_sha256_hex(hv):
                raise ValueError("pack_artifacts values must be SHA-256 hex digests")
        return v

    @field_validator("determinism_key", "run_hash", mode="before")
    @classmethod
    def _validate_optional_hash(cls, v: Any) -> Any:
        if v in (None, ""):
            return ""
        if not _is_sha256_hex(v):
            raise ValueError("Expected SHA-256 hex digest")
        return v

    # -----------------------
    # Hashing / determinism
    # -----------------------

    def to_canonical_dict(self) -> dict[str, Any]:
        """
        Canonical dict for hashing.

        Excludes run_hash to keep hash self-contained.
        """
        d = self.model_dump(mode="json")
        d.pop("run_hash", None)
        return d

    def compute_determinism_key(self) -> str:
        """
        Determinism key binds all immutable decision determinants.
        """
        payload = {
            "engine_build": self.engine_build,
            "engine_version": self.engine_version,
            "taxonomy_hash": self.taxonomy_hash,
            "inputs": self.inputs.model_dump(mode="json"),
            "packs_enabled": sorted(p.value for p in self.packs_enabled),
        }
        return hash_canonical(payload)

    def compute_run_hash(self) -> str:
        """Hash of the envelope itself (excluding run_hash)."""
        return hash_canonical(self.to_canonical_dict())

    def finalize(self) -> RunEnvelope:
        """
        Return a finalized envelope with:
        - determinism_key
        - run_hash

        Intentionally pure.
        """
        dk = self.determinism_key or self.compute_determinism_key()
        rh = self.run_hash or hash_canonical(
            {**self.to_canonical_dict(), "determinism_key": dk}
        )
        return self.model_copy(update={"determinism_key": dk, "run_hash": rh})


# ===========================
# Convenience builder
# ===========================

@dataclass(frozen=True)
class RunEnvelopeSeed:
    """
    Minimal seed for endpoint layers.
    """
    tenant_id: str
    run_mode: RunMode
    endpoint: EngineEndpoint
    taxonomy_hash: str
    inputs: InputDigest

    actor_user_id: str | None = None
    api_key_id: str | None = None
    client_ip: str | None = None
    user_agent: str | None = None
    correlation: CorrelationIds | None = None

    engine_version: str = "unknown"
    engine_build: str = "unknown"
    environment: str = "unknown"

    packs_enabled: list[CapabilityPack] | None = None
    pack_artifacts: dict[str, str] | None = None


def build_run_envelope(seed: RunEnvelopeSeed) -> RunEnvelope:
    """Construct and finalize a RunEnvelope from a seed."""
    env = RunEnvelope(
        tenant_id=seed.tenant_id,
        actor_user_id=seed.actor_user_id,
        api_key_id=seed.api_key_id,
        client_ip=seed.client_ip,
        user_agent=seed.user_agent,
        correlation=seed.correlation or CorrelationIds(),
        engine_version=seed.engine_version,
        engine_build=seed.engine_build,
        environment=seed.environment,
        run_mode=seed.run_mode,
        endpoint=seed.endpoint,
        taxonomy_hash=seed.taxonomy_hash,
        inputs=seed.inputs,
        packs_enabled=seed.packs_enabled or [],
        pack_artifacts=seed.pack_artifacts or {},
    )
    return env.finalize()
