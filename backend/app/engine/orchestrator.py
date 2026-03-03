# backend/app/engine/orchestrator.py
from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Dict, Mapping

from backend.app.engine.recommend import recommend


ENGINE_NAME = "orchestrator"
ENGINE_VERSION = "1.0.0"


# ---------------------------------------------------------------------
# Strict canonical primitives (shared doctrine)
# ---------------------------------------------------------------------
def _canonical_json(obj: Any) -> str:
    """
    Strict canonical JSON:
    - sort_keys=True
    - separators=(',', ':')
    - ensure_ascii=False
    - allow_nan=False (reject NaN / Inf)
    """
    return json.dumps(
        obj,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def _stable_hash(obj: Any) -> str:
    return hashlib.sha256(_canonical_json(obj).encode("utf-8")).hexdigest()


def _now_ms() -> int:
    return int(time.time() * 1000)


# ---------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------
def run_engine(envelope: Mapping[str, Any]) -> Dict[str, Any]:
    """
    HedgeCalc v1 Orchestrator -- SINGLE ENTRYPOINT

    Responsibilities:
      - Validate RunEnvelope shape (light structural validation only)
      - Invoke recommend() exactly once
      - Wrap result into a TraceBundle-compatible envelope
      - Fail-closed on any error

    Explicitly DOES NOT:
      - Modify payload
      - Apply overrides
      - Retry stages
      - Catch and continue
      - Invent defaults

    Expected envelope (minimum):
      {
        "run_id": "...",
        "market_snapshot": {...},
        "policy_bundle": {...},
        "payload": {...}
      }
    """

    t0 = time.perf_counter()

    # -------------------------
    # Minimal structural checks
    # -------------------------
    if not isinstance(envelope, Mapping):
        return _reject(
            reason="bad_envelope",
            details={"expected": "mapping", "received": type(envelope).__name__},
            started_at=t0,
        )

    run_id = envelope.get("run_id")
    market_snapshot = envelope.get("market_snapshot")
    policy_bundle = envelope.get("policy_bundle")
    payload = envelope.get("payload")

    if not isinstance(payload, Mapping):
        return _reject(
            reason="missing_payload",
            details={"field": "payload"},
            started_at=t0,
        )

    # Snapshot & policy are opaque to orchestrator -- only hashed
    snapshot_hash = _stable_hash(market_snapshot) if market_snapshot is not None else None
    policy_hash = _stable_hash(policy_bundle) if policy_bundle is not None else None

    # -------------------------
    # Build orchestrator trace
    # -------------------------
    trace: Dict[str, Any] = {
        "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
        "run_id": run_id,
        "snapshot_hash": snapshot_hash,
        "policy_hash": policy_hash,
        "input_fingerprint": _stable_hash(
            {
                "payload_keys": sorted(list(payload.keys())),
                "has_market_snapshot": market_snapshot is not None,
                "has_policy_bundle": policy_bundle is not None,
            }
        ),
        "started_at_ms": _now_ms(),
    }

    # -------------------------
    # Execute engine (fail-closed)
    # -------------------------
    try:
        result = recommend(payload, policy=policy_bundle)
    except Exception as e:
        return _reject(
            reason="engine_exception",
            details={"type": type(e).__name__},
            started_at=t0,
            trace=trace,
        )

    # -------------------------
    # Finalize TraceBundle
    # -------------------------
    duration_ms = int((time.perf_counter() - t0) * 1000)

    plan_id = result.get("plan_id")
    decision_trace = result.get("meta", {}).get("decision_trace")

    trace["plan_id"] = plan_id
    trace["engine_trace_fingerprint"] = (
        decision_trace.get("trace_fingerprint")
        if isinstance(decision_trace, dict)
        else None
    )
    trace["completed_at_ms"] = _now_ms()
    trace["duration_ms"] = duration_ms

    # Stable TraceBundle hash (timestamps excluded)
    trace_no_time = dict(trace)
    trace_no_time.pop("started_at_ms", None)
    trace_no_time.pop("completed_at_ms", None)
    trace["trace_bundle_fingerprint"] = _stable_hash(trace_no_time)

    return {
        "status": "ok",
        "run_id": run_id,
        "plan_id": plan_id,
        "trace": trace,
        "result": result,
    }


# ---------------------------------------------------------------------
# Rejection helper (deterministic)
# ---------------------------------------------------------------------
def _reject(
    *,
    reason: str,
    details: Dict[str, Any],
    started_at: float,
    trace: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    duration_ms = int((time.perf_counter() - started_at) * 1000)

    base_trace = trace or {
        "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION}
    }

    rejection = {
        "status": "rejected",
        "reason": reason,
        "details": details,
        "duration_ms": duration_ms,
    }

    base_trace["rejection"] = {
        "reason": reason,
        "details": details,
    }
    base_trace["completed_at_ms"] = _now_ms()
    base_trace["duration_ms"] = duration_ms

    # Stable rejection fingerprint
    trace_no_time = dict(base_trace)
    trace_no_time.pop("completed_at_ms", None)
    trace_no_time.pop("duration_ms", None)

    base_trace["trace_bundle_fingerprint"] = _stable_hash(trace_no_time)

    return {
        "status": "rejected",
        "trace": base_trace,
        "rejection": rejection,
    }


__all__ = ["ENGINE_NAME", "ENGINE_VERSION", "run_engine"]
