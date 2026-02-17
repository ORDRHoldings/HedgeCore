from __future__ import annotations

"""
backend/app/engine/audit_bundle.py
HedgeCalc Engine: AuditBundle (v1.0)

Purpose
-------
Create a single immutable, replay-safe audit artifact for one HedgeCalc run.

This module is **governance infrastructure**, not analytics.

Non-negotiables (institutional / audit):
- Deterministic: bundle_id is SHA-256 over strict canonical JSON (no NaN/Inf).
- Fail-closed: invalid inputs raise ValueError/TypeError (no silent coercion).
- No secrets: safe to log and store in WORM archives.
- Stable ordering: trace_steps are kept in pipeline order; never sorted.
- Time excluded from hash domain: timestamps may exist in metadata but are excluded from bundle_id.

What it aggregates
------------------
- plan_id (from recommend.py)
- decision object (from decision_gate.py)
- PolicyBundle hashes/fingerprints (policy_bundle.py)
- Stage traces for exposure/risk/strategy/map/size/cost/scenario/decision

It produces:
- AuditBundle dict with:
    - bundle_id
    - bundle (content)
    - fingerprints (input/output/trace)
    - metadata (timestamps, duration, versions) OUTSIDE hash domain

Notes on JSON Canonicalization
------------------------------
- allow_nan=False to forbid NaN/Inf (non-standard JSON => audit drift risk)
- ensure_ascii=False (UTF-8 stable)
- separators=(",", ":") (no whitespace variance)
- sort_keys=True ONLY for the canonical encoder. Ordering inside lists is preserved.

"""

import hashlib
import json
import time
from typing import Any, Dict, List, Mapping, Optional, Tuple


ENGINE_NAME = "audit_bundle"
ENGINE_VERSION = "1.0.0"


# -----------------------------
# Canonical + hashing (strict)
# -----------------------------
def _canonical_json(obj: Any) -> str:
    """
    Strict canonical JSON for deterministic hashing.

    Hard rules:
    - Reject NaN/Inf (allow_nan=False)
    - Reject non-serializable objects (no default=str)
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


def _is_mapping(x: Any) -> bool:
    return isinstance(x, Mapping)


def _as_dict(x: Any, *, name: str) -> Dict[str, Any]:
    if not isinstance(x, dict):
        raise TypeError(f"{name} must be a dict")
    return x


def _as_list(x: Any, *, name: str) -> List[Any]:
    if not isinstance(x, list):
        raise TypeError(f"{name} must be a list")
    return x


def _maybe_dict(x: Any) -> Optional[Dict[str, Any]]:
    return x if isinstance(x, dict) else None


def _require_str(x: Any, *, name: str) -> str:
    if not isinstance(x, str) or not x.strip():
        raise ValueError(f"{name} must be a non-empty string")
    return x.strip()


def _strip_timestamps(obj: Any) -> Any:
    """
    Remove timestamp-like keys from a nested structure.

    This is deliberately conservative:
    - Only removes common keys that are explicitly non-deterministic
      and should not affect bundle_id.

    Keys removed (if present):
      - "timestamps"
      - "generated_at_ms"
      - "duration_ms"
      - "time_ms"
      - "created_at"
      - "updated_at"
      - "now_ms"

    List ordering is preserved.
    """
    TS_KEYS = {
        "timestamps",
        "generated_at_ms",
        "duration_ms",
        "time_ms",
        "created_at",
        "updated_at",
        "now_ms",
    }

    if isinstance(obj, dict):
        out: Dict[str, Any] = {}
        for k, v in obj.items():
            if k in TS_KEYS:
                continue
            out[k] = _strip_timestamps(v)
        return out

    if isinstance(obj, list):
        return [_strip_timestamps(v) for v in obj]

    return obj


# -----------------------------
# Reason codes
# -----------------------------
REASON_BAD_INPUT = "bad_input"
REASON_MISSING_PLAN_ID = "missing_plan_id"
REASON_MISSING_DECISION = "missing_decision"
REASON_MISSING_POLICY = "missing_policy"
REASON_MISSING_TRACE = "missing_trace"


# -----------------------------
# Build seed
# -----------------------------
def _build_trace_seed(*, policy: Mapping[str, Any], input_obj: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
        "policy": dict(policy),
        "input_fingerprint": _stable_hash(input_obj),
        "notes": [],
    }


# -----------------------------
# Public API
# -----------------------------
def build_audit_bundle(payload: Mapping[str, Any], *, policy: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
    """
    Build an immutable AuditBundle.

    Expected input (minimum viable):
      {
        "plan_id": "<sha256>",
        "plan": {...}  # optional but recommended: include plan core
        "decision": {...}  # decision_gate output (must include decision_hash)
        "policy_bundle": {...}  # policy bundle object or {"policy_hash": "...", ...}
        "stage_traces": [
          {"stage":"exposure", "decision_trace": {...}},
          {"stage":"risk_classifier", "decision_trace": {...}},
          ...
          {"stage":"recommend", "decision_trace": {...}},  # optional
          {"stage":"decision_gate", "decision_trace": {...}}  # recommended
        ],
        "assumptions_registry": {...},  # optional
        "disclosures_registry": {...}   # optional
      }

    Output:
      {
        "bundle_id": "<sha256 of canonical bundle>",
        "bundle": { ... hash-domain content ... },
        "fingerprints": { ... },
        "meta": { "decision_trace": {...}, "duration_ms": ... }
      }

    Fail-closed:
      - missing plan_id or decision => reject (returns with rejected envelope)
      - non-dict shapes => reject
      - any non-canonical JSON content (NaN/Inf) => raises ValueError/TypeError
    """
    t0 = time.perf_counter()

    pol: Dict[str, Any] = {
        # Enforce that decision_gate decision_hash must be present
        "require_decision_hash": True,
        # Enforce that policy_bundle must have policy_hash or trace_fingerprint
        "require_policy_fingerprint": True,
        # Enforce that stage_traces must exist (can be empty only if explicitly allowed)
        "require_stage_traces": True,
        # If true, include plan (large) inside bundle; otherwise include plan fingerprint only.
        "include_plan_object": True,
        # If true, strip timestamps from stage traces and decision/policy inside hash domain.
        "strip_timestamps_in_hash_domain": True,
        # Max traces to include (defensive cap)
        "max_stage_traces": 50,
    }
    if isinstance(policy, dict):
        for k, v in policy.items():
            if k in pol:
                pol[k] = v

    # Normalize payload access
    if not _is_mapping(payload):
        return _reject(t0, pol, reason=REASON_BAD_INPUT, details={"payload_not_mapping": True})

    plan_id = payload.get("plan_id")
    decision = payload.get("decision")
    policy_bundle = payload.get("policy_bundle")
    stage_traces = payload.get("stage_traces")

    plan_obj = payload.get("plan")
    assumptions_registry = payload.get("assumptions_registry")
    disclosures_registry = payload.get("disclosures_registry")

    # Validate required inputs
    try:
        plan_id_s = _require_str(plan_id, name="plan_id")
    except Exception:
        return _reject(t0, pol, reason=REASON_MISSING_PLAN_ID, details={"plan_id": plan_id})

    if not isinstance(decision, dict):
        return _reject(t0, pol, reason=REASON_MISSING_DECISION, details={"decision_type": str(type(decision).__name__)})

    if not isinstance(policy_bundle, dict):
        return _reject(t0, pol, reason=REASON_MISSING_POLICY, details={"policy_bundle_type": str(type(policy_bundle).__name__)})

    if bool(pol["require_stage_traces"]) and not isinstance(stage_traces, list):
        return _reject(t0, pol, reason=REASON_MISSING_TRACE, details={"stage_traces_type": str(type(stage_traces).__name__)})

    # Policy fingerprint requirements
    policy_hash = policy_bundle.get("policy_hash")
    policy_trace_fp = policy_bundle.get("trace_fingerprint") or policy_bundle.get("policy_fingerprint")
    if bool(pol["require_policy_fingerprint"]) and not (isinstance(policy_hash, str) and policy_hash.strip()) and not (isinstance(policy_trace_fp, str) and policy_trace_fp.strip()):
        return _reject(
            t0,
            pol,
            reason=REASON_MISSING_POLICY,
            details={"required": "policy_bundle.policy_hash OR policy_bundle.trace_fingerprint/policy_fingerprint"},
        )

    # Decision hash requirements
    decision_hash = decision.get("decision_hash")
    if bool(pol["require_decision_hash"]) and not (isinstance(decision_hash, str) and decision_hash.strip()):
        return _reject(
            t0,
            pol,
            reason=REASON_MISSING_DECISION,
            details={"required": "decision.decision_hash"},
        )

    # Stage traces cap (deterministic)
    traces_in: List[Any] = stage_traces if isinstance(stage_traces, list) else []
    max_traces = int(pol.get("max_stage_traces", 50)) if isinstance(pol.get("max_stage_traces"), int) else 50
    if max_traces < 1:
        max_traces = 1
    traces_in = traces_in[:max_traces]

    # Normalize trace entries
    norm_traces: List[Dict[str, Any]] = []
    for i, tr in enumerate(traces_in):
        if not isinstance(tr, dict):
            continue
        stage = tr.get("stage")
        stage_name = str(stage).strip() if isinstance(stage, str) and stage.strip() else f"stage_{i+1:02d}"
        dt = tr.get("decision_trace") or tr.get("trace") or tr
        if not isinstance(dt, dict):
            # keep a placeholder; never silently drop a provided stage index
            norm_traces.append(
                {
                    "stage": stage_name,
                    "status": "invalid_trace",
                    "trace_fingerprint": _stable_hash({"stage": stage_name, "invalid_trace": True}),
                }
            )
            continue

        # Optional timestamp stripping inside hash domain
        dt_use = _strip_timestamps(dt) if bool(pol["strip_timestamps_in_hash_domain"]) else dt

        norm_traces.append(
            {
                "stage": stage_name,
                "status": "ok",
                "trace_fingerprint": _stable_hash(dt_use),
                "trace": dt_use,
            }
        )

    # Plan inclusion policy
    plan_included: Optional[Dict[str, Any]] = None
    plan_fp: Optional[str] = None
    if isinstance(plan_obj, dict):
        plan_use = _strip_timestamps(plan_obj) if bool(pol["strip_timestamps_in_hash_domain"]) else plan_obj
        plan_fp = _stable_hash(plan_use)
        if bool(pol["include_plan_object"]):
            plan_included = plan_use
    else:
        # if plan object missing, we still produce a bundle; plan_fp remains None
        plan_fp = None
        plan_included = None

    # Registries are optional but must be dicts if present
    if assumptions_registry is not None and not isinstance(assumptions_registry, dict):
        return _reject(t0, pol, reason=REASON_BAD_INPUT, details={"assumptions_registry_type": str(type(assumptions_registry).__name__)})
    if disclosures_registry is not None and not isinstance(disclosures_registry, dict):
        return _reject(t0, pol, reason=REASON_BAD_INPUT, details={"disclosures_registry_type": str(type(disclosures_registry).__name__)})

    # Hash-domain bundle content
    decision_use = _strip_timestamps(decision) if bool(pol["strip_timestamps_in_hash_domain"]) else decision
    policy_use = _strip_timestamps(policy_bundle) if bool(pol["strip_timestamps_in_hash_domain"]) else policy_bundle

    bundle_core: Dict[str, Any] = {
        "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
        "plan_id": plan_id_s,
        "plan_fingerprint": plan_fp,
        "plan": plan_included,  # may be None if include_plan_object=False or plan missing
        "policy_bundle": policy_use,
        "decision": decision_use,
        "stage_traces": norm_traces,  # stable order preserved
        "registries": {
            "assumptions": _strip_timestamps(assumptions_registry) if (isinstance(assumptions_registry, dict) and bool(pol["strip_timestamps_in_hash_domain"])) else assumptions_registry,
            "disclosures": _strip_timestamps(disclosures_registry) if (isinstance(disclosures_registry, dict) and bool(pol["strip_timestamps_in_hash_domain"])) else disclosures_registry,
        },
    }

    # Deterministic bundle_id (hash domain excludes timestamps already)
    bundle_id = _stable_hash(bundle_core)

    # Fingerprints
    fingerprints = {
        "bundle_id": bundle_id,
        "bundle_fingerprint": _stable_hash(bundle_core),
        "plan_fingerprint": plan_fp,
        "decision_fingerprint": _stable_hash(decision_use),
        "policy_bundle_fingerprint": _stable_hash(policy_use),
        "stage_traces_fingerprint": _stable_hash(norm_traces),
    }

    # Build audit trace (meta)
    input_obj = {
        "plan_id": plan_id_s,
        "has_plan": isinstance(plan_obj, dict),
        "has_assumptions_registry": isinstance(assumptions_registry, dict),
        "has_disclosures_registry": isinstance(disclosures_registry, dict),
        "num_stage_traces_in": int(len(traces_in)),
        "num_stage_traces_norm": int(len(norm_traces)),
        "decision_hash_present": bool(isinstance(decision_hash, str) and decision_hash.strip()),
        "policy_hash_present": bool(isinstance(policy_hash, str) and policy_hash.strip()),
    }
    trace = _build_trace_seed(policy=pol, input_obj=input_obj)
    trace["notes"].append({"hash_domain": "timestamps_stripped" if bool(pol["strip_timestamps_in_hash_domain"]) else "timestamps_included"})
    trace["notes"].append({"plan_included": bool(plan_included is not None)})

    # Add stable output fingerprints to trace
    trace["output_fingerprint"] = _stable_hash({"bundle_id": bundle_id, "fingerprints": fingerprints})
    trace_no_time = dict(trace)
    trace_no_time["timestamps"] = {"generated_at_ms": None, "duration_ms": None}
    trace["trace_fingerprint"] = _stable_hash(trace_no_time)

    duration_ms = int((time.perf_counter() - t0) * 1000)
    trace["timestamps"] = {"generated_at_ms": _now_ms(), "duration_ms": duration_ms}

    return {
        "bundle_id": bundle_id,
        "bundle": bundle_core,
        "fingerprints": fingerprints,
        "meta": {"decision_trace": trace, "duration_ms": duration_ms},
    }


def _reject(t0: float, pol: Mapping[str, Any], *, reason: str, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    duration_ms = int((time.perf_counter() - t0) * 1000)
    input_obj = {"reason": reason, "details": details or {}}
    trace = _build_trace_seed(policy=dict(pol), input_obj=input_obj)
    trace["notes"].append({"rejected": True, "reason": reason})
    trace["output_fingerprint"] = _stable_hash({"rejected": {"reason": reason, "details": details or {}}})
    trace_no_time = dict(trace)
    trace_no_time["timestamps"] = {"generated_at_ms": None, "duration_ms": None}
    trace["trace_fingerprint"] = _stable_hash(trace_no_time)
    trace["timestamps"] = {"generated_at_ms": _now_ms(), "duration_ms": duration_ms}

    return {
        "rejected": {"reason": reason, "details": details or {}},
        "bundle_id": None,
        "bundle": None,
        "fingerprints": None,
        "meta": {"decision_trace": trace, "duration_ms": duration_ms},
    }


__all__ = [
    "ENGINE_NAME",
    "ENGINE_VERSION",
    "build_audit_bundle",
]
