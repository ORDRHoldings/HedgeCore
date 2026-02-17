# backend/app/engine/decision_gate.py
from __future__ import annotations

import hashlib
import json
import math
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Tuple


ENGINE_NAME = "decision_gate"
ENGINE_VERSION = "1.0.0"

# Verdict enum (string, audit-safe)
VERDICT_APPROVE = "APPROVE"
VERDICT_APPROVE_WITH_CONDITIONS = "APPROVE_WITH_CONDITIONS"
VERDICT_REJECT = "REJECT"


# -----------------------------
# Stable primitives (audit-safe)
# -----------------------------
def _canonical_json(obj: Any) -> str:
    """
    Strict canonical JSON for deterministic hashing and audit replay.

    Guarantees:
      - sort_keys=True for stable ordering
      - separators=(',', ':') to remove whitespace variance
      - ensure_ascii=False for UTF-8 determinism
      - allow_nan=False to forbid NaN/Inf in hashed artifacts (non-standard JSON)
      - NO default=str: unsupported types raise (no silent coercion)
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


def _is_finite_number(x: Any) -> bool:
    try:
        return isinstance(x, (int, float)) and math.isfinite(float(x))
    except Exception:
        return False


def _as_float(x: Any, default: float = 0.0) -> float:
    try:
        v = float(x)
        return v if math.isfinite(v) else default
    except Exception:
        return default


def _as_int(x: Any, default: int = 0) -> int:
    try:
        return int(x)
    except Exception:
        return default


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _as_str(x: Any, default: str = "") -> str:
    try:
        s = str(x)
        return s
    except Exception:
        return default


# -----------------------------
# Reason codes (institutional)
# -----------------------------
REASON_STAGE_FAILURE = "stage_failure"
REASON_POLICY_INVALID = "policy_invalid"
REASON_MISSING_REQUIRED_INPUT = "missing_required_input"
REASON_HARD_REJECTION = "hard_rejection"
REASON_COST_TOO_HIGH = "cost_too_high"
REASON_WORST_CASE_TOO_LOW = "worst_case_too_low"
REASON_EFFECTIVENESS_TOO_LOW = "effectiveness_too_low"
REASON_TOO_MANY_REJECTIONS = "too_many_rejections"
REASON_EMPTY_HEDGE_PLAN = "empty_hedge_plan"
REASON_UNHEDGED_MATERIAL_RISK = "unhedged_material_risk"


# -----------------------------
# Output models (audit-safe)
# -----------------------------
@dataclass(frozen=True, slots=True)
class GateReason:
    code: str
    severity: str  # HARD | SOFT
    message: str
    details: Dict[str, Any]


@dataclass(frozen=True, slots=True)
class GateCondition:
    code: str
    message: str
    details: Dict[str, Any]


@dataclass(frozen=True, slots=True)
class GateResidualRisk:
    code: str
    message: str
    details: Dict[str, Any]


def _build_trace_seed(*, policy: Mapping[str, Any], input_obj: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
        "policy": dict(policy),
        "input_fingerprint": _stable_hash(input_obj),
        "notes": [],
        "checks": [],
    }


def _policy_defaults() -> Dict[str, Any]:
    """
    Canonical gating defaults. These are conservative institutional rails.

    IMPORTANT:
    - This gate is decision-only: it does NOT resize, remap, or change hedges.
    - Fail-closed by default when inputs are missing or invalid.
    """
    return {
        # Cost governance
        # If portfolio_notional_usd is provided, cost is evaluated as bps.
        # Otherwise, cost gates fall back to absolute thresholds.
        "max_total_cost_bps": 75.0,          # 0.75% of notional over holding period
        "max_total_cost_usd": 25000.0,       # fallback when notional is unknown

        # Worst-case governance
        # Gate rejects if the worst net pnl across provided scenarios is below this.
        "min_worst_case_net_pnl_usd": -50000.0,

        # Effectiveness governance (if effectiveness computed; may be None when portfolio pnl >= 0)
        "min_effectiveness": 0.25,           # minimum fraction of downside offset (0..2 clamp exists upstream)

        # Quality governance
        "max_rejected_legs": 0,              # strict: any rejected leg fails (can be relaxed)
        "require_nonzero_hedges": True,      # must have at least one non-zero hedge contract

        # Residual risk governance
        # If risk_classifier output includes material risks not covered by strategy_selector, force reject/condition.
        "reject_on_unhedged_material_risks": True,

        # Threshold for "material" in the classifier summary (if present)
        "material_risk_score_threshold": 0.50,

        # Deterministic verbosity
        "include_inputs_used": True,
        "include_trace": True,
    }


def _merge_policy(user_policy: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    pol = _policy_defaults()
    if isinstance(user_policy, Mapping):
        for k, v in user_policy.items():
            if k in pol:
                pol[k] = v
    # sanitize numeric rails deterministically
    pol["max_total_cost_bps"] = float(_as_float(pol["max_total_cost_bps"], 75.0))
    pol["max_total_cost_usd"] = float(_as_float(pol["max_total_cost_usd"], 25000.0))
    pol["min_worst_case_net_pnl_usd"] = float(_as_float(pol["min_worst_case_net_pnl_usd"], -50000.0))
    pol["min_effectiveness"] = float(_clamp(_as_float(pol["min_effectiveness"], 0.25), 0.0, 2.0))
    pol["max_rejected_legs"] = int(max(0, _as_int(pol["max_rejected_legs"], 0)))
    pol["require_nonzero_hedges"] = bool(pol["require_nonzero_hedges"])
    pol["reject_on_unhedged_material_risks"] = bool(pol["reject_on_unhedged_material_risks"])
    pol["material_risk_score_threshold"] = float(_clamp(_as_float(pol["material_risk_score_threshold"], 0.50), 0.0, 1.0))
    pol["include_inputs_used"] = bool(pol["include_inputs_used"])
    pol["include_trace"] = bool(pol["include_trace"])
    return pol


def _extract_rejections(plan: Mapping[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    r = plan.get("rejections", {}) if isinstance(plan, Mapping) else {}
    if not isinstance(r, Mapping):
        return {"instrument_mapper": [], "hedge_sizer": [], "cost_engine": [], "scenario_engine": []}
    out: Dict[str, List[Dict[str, Any]]] = {}
    for k in ("instrument_mapper", "hedge_sizer", "cost_engine", "scenario_engine"):
        v = r.get(k, [])
        out[k] = v if isinstance(v, list) else []
    return out


def _count_rejected_legs(rejections: Mapping[str, List[Dict[str, Any]]]) -> int:
    # Count unique instrument rejections deterministically (by instrument_id when present)
    seen = set()
    n = 0
    for stage in ("instrument_mapper", "hedge_sizer", "cost_engine", "scenario_engine"):
        for row in rejections.get(stage, []) or []:
            if not isinstance(row, Mapping):
                continue
            iid = row.get("instrument_id")
            key = (stage, str(iid)) if iid is not None else (stage, _stable_hash(row))
            if key in seen:
                continue
            seen.add(key)
            n += 1
    return n


def _extract_sized_hedges(plan: Mapping[str, Any]) -> List[Dict[str, Any]]:
    v = plan.get("sized_hedges", [])
    return v if isinstance(v, list) else []


def _has_nonzero_hedges(sized: List[Dict[str, Any]]) -> bool:
    for h in sized:
        if not isinstance(h, Mapping):
            continue
        c = h.get("contracts", 0)
        if isinstance(c, int) and c != 0:
            return True
    return False


def _extract_cost_total_usd(plan: Mapping[str, Any]) -> Optional[float]:
    costs = plan.get("costs")
    if isinstance(costs, Mapping):
        total = costs.get("total")
        if _is_finite_number(total):
            return float(total)
    # Some callers may pass {"costs": {...}} wrapper
    if isinstance(costs, Mapping) and isinstance(costs.get("costs"), Mapping):
        total = costs["costs"].get("total")
        if _is_finite_number(total):
            return float(total)
    return None


def _extract_summary(plan: Mapping[str, Any]) -> Mapping[str, Any]:
    s = plan.get("summary", {})
    return s if isinstance(s, Mapping) else {}


def _extract_worst_case(plan: Mapping[str, Any]) -> Tuple[Optional[str], Optional[float]]:
    summary = _extract_summary(plan)
    wc = summary.get("worst_case", {})
    if not isinstance(wc, Mapping):
        return None, None
    sid = wc.get("scenario_id")
    pnl = wc.get("net_pnl_usd")
    sid_s = str(sid) if sid is not None else None
    pnl_f = float(pnl) if _is_finite_number(pnl) else None
    return sid_s, pnl_f


def _extract_effectiveness_min(plan: Mapping[str, Any]) -> Optional[float]:
    summary = _extract_summary(plan)
    he = summary.get("hedge_effectiveness", {})
    if not isinstance(he, Mapping):
        return None
    v = he.get("min")
    return float(v) if _is_finite_number(v) else None


def _extract_portfolio_notional(payload: Mapping[str, Any]) -> Optional[float]:
    """
    Optional notional for bps-based cost gating.
    This is NOT computed from positions in the gate (decision-only).
    """
    # Prefer explicit field if provided
    v = payload.get("portfolio_notional_usd")
    if _is_finite_number(v) and float(v) > 0.0:
        return float(v)

    # Alternate common nesting patterns
    port = payload.get("portfolio", {})
    if isinstance(port, Mapping):
        v2 = port.get("notional_usd")
        if _is_finite_number(v2) and float(v2) > 0.0:
            return float(v2)

    return None


def _extract_material_risks(payload: Mapping[str, Any]) -> List[Dict[str, Any]]:
    """
    Optional: if risk classifier output is passed into the gate payload, use it to detect residual risks.
    The gate never invents risk; it only reads explicit outputs.
    """
    risk_out = payload.get("risk_classifier_output")
    if not isinstance(risk_out, Mapping):
        return []
    risks = risk_out.get("risks") or risk_out.get("risk") or risk_out.get("classified_risks")
    if isinstance(risks, list):
        out = []
        for r in risks:
            if isinstance(r, Mapping):
                out.append(dict(r))
        return out
    return []


def decision_gate(
    payload: Mapping[str, Any],
    *,
    plan: Mapping[str, Any],
    policy: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Decision Gate (Institutional, Deterministic)

    Inputs:
      - payload: original request context (OPTIONAL: portfolio_notional_usd, risk_classifier_output)
      - plan: the orchestrator plan_core (strategies/mapped/sized/costs/scenarios/rejections/summary)
      - policy: gating policy overrides (constrained to known keys)

    Output:
      {
        "verdict": "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT",
        "reasons": [ {code,severity,message,details}, ... ],
        "conditions": [ {code,message,details}, ... ],
        "residual_risks": [ {code,message,details}, ... ],
        "decision_hash": "...",          # deterministic over decision core (timestamps excluded)
        "trace_fingerprint": "...",      # deterministic (timestamps excluded)
        "meta": { "decision_trace": {...}, "duration_ms": ... }
      }

    HARD RULES:
      - Decision-only (no remap/resize)
      - Fail-closed on missing/invalid required inputs
      - Deterministic hashing with strict canonical JSON
    """
    t0 = time.perf_counter()
    pol = _merge_policy(policy)

    # minimal input object for trace seeding
    input_obj = {
        "policy_keys": sorted(list(pol.keys())),
        "plan_keys": sorted(list(plan.keys())) if isinstance(plan, Mapping) else [],
        "payload_keys": sorted(list(payload.keys())) if isinstance(payload, Mapping) else [],
    }
    trace = _build_trace_seed(policy=pol, input_obj=input_obj)

    reasons: List[GateReason] = []
    conditions: List[GateCondition] = []
    residuals: List[GateResidualRisk] = []

    # -------------------------
    # Required inputs validation
    # -------------------------
    if not isinstance(payload, Mapping):
        reasons.append(GateReason(REASON_MISSING_REQUIRED_INPUT, "HARD", "payload must be a mapping", {"type": str(type(payload))}))
    if not isinstance(plan, Mapping):
        reasons.append(GateReason(REASON_MISSING_REQUIRED_INPUT, "HARD", "plan must be a mapping", {"type": str(type(plan))}))

    rejections = _extract_rejections(plan) if isinstance(plan, Mapping) else {}
    rejected_count = _count_rejected_legs(rejections) if isinstance(rejections, Mapping) else 0

    trace["checks"].append(
        {
            "check": "inputs_validated",
            "rejected_legs_count": int(rejected_count),
        }
    )

    # If the plan already indicates any structural failures upstream, treat as hard reject.
    # (We only read explicit fields; no inference.)
    if isinstance(plan, Mapping):
        if "rejected" in plan and isinstance(plan.get("rejected"), Mapping):
            reasons.append(
                GateReason(
                    REASON_STAGE_FAILURE,
                    "HARD",
                    "Upstream orchestrator reported stage failure envelope",
                    {"rejected": dict(plan.get("rejected") or {})},
                )
            )

    # -------------------------
    # Hedge plan quality checks
    # -------------------------
    sized = _extract_sized_hedges(plan) if isinstance(plan, Mapping) else []
    if bool(pol["require_nonzero_hedges"]) and not _has_nonzero_hedges(sized):
        reasons.append(
            GateReason(
                REASON_EMPTY_HEDGE_PLAN,
                "HARD",
                "Hedge plan contains no non-zero contract positions",
                {"require_nonzero_hedges": True},
            )
        )

    if rejected_count > int(pol["max_rejected_legs"]):
        reasons.append(
            GateReason(
                REASON_TOO_MANY_REJECTIONS,
                "HARD",
                "One or more hedge legs were rejected by upstream engines",
                {
                    "rejected_count": int(rejected_count),
                    "max_rejected_legs": int(pol["max_rejected_legs"]),
                    "rejections_by_stage": rejections,
                },
            )
        )

    # -------------------------
    # Cost governance
    # -------------------------
    cost_total = _extract_cost_total_usd(plan) if isinstance(plan, Mapping) else None
    notional = _extract_portfolio_notional(payload) if isinstance(payload, Mapping) else None

    if cost_total is None:
        reasons.append(
            GateReason(
                REASON_MISSING_REQUIRED_INPUT,
                "HARD",
                "Total hedge cost missing (plan.costs.total required)",
                {"required": "plan.costs.total"},
            )
        )
    else:
        if notional is not None and notional > 0.0:
            cost_bps = (float(cost_total) / float(notional)) * 10000.0
            trace["checks"].append({"check": "cost_bps", "cost_total_usd": float(cost_total), "portfolio_notional_usd": float(notional), "cost_bps": float(cost_bps)})
            if cost_bps > float(pol["max_total_cost_bps"]):
                reasons.append(
                    GateReason(
                        REASON_COST_TOO_HIGH,
                        "HARD",
                        "Total hedge cost exceeds policy maximum (bps)",
                        {"cost_bps": float(cost_bps), "max_total_cost_bps": float(pol["max_total_cost_bps"])},
                    )
                )
        else:
            trace["checks"].append({"check": "cost_abs", "cost_total_usd": float(cost_total), "portfolio_notional_usd": None})
            if float(cost_total) > float(pol["max_total_cost_usd"]):
                reasons.append(
                    GateReason(
                        REASON_COST_TOO_HIGH,
                        "HARD",
                        "Total hedge cost exceeds policy maximum (absolute USD; portfolio notional unknown)",
                        {"cost_total_usd": float(cost_total), "max_total_cost_usd": float(pol["max_total_cost_usd"])},
                    )
                )

    # -------------------------
    # Worst-case governance
    # -------------------------
    worst_sid, worst_pnl = _extract_worst_case(plan) if isinstance(plan, Mapping) else (None, None)
    if worst_pnl is None:
        reasons.append(
            GateReason(
                REASON_MISSING_REQUIRED_INPUT,
                "HARD",
                "Worst-case scenario net pnl missing (plan.summary.worst_case.net_pnl_usd required)",
                {"required": "plan.summary.worst_case.net_pnl_usd"},
            )
        )
    else:
        trace["checks"].append({"check": "worst_case", "scenario_id": worst_sid, "worst_net_pnl_usd": float(worst_pnl)})
        if float(worst_pnl) < float(pol["min_worst_case_net_pnl_usd"]):
            reasons.append(
                GateReason(
                    REASON_WORST_CASE_TOO_LOW,
                    "HARD",
                    "Worst-case scenario net pnl breaches policy floor",
                    {"scenario_id": worst_sid, "worst_net_pnl_usd": float(worst_pnl), "min_worst_case_net_pnl_usd": float(pol["min_worst_case_net_pnl_usd"])},
                )
            )

    # -------------------------
    # Effectiveness governance (soft if not computable)
    # -------------------------
    eff_min = _extract_effectiveness_min(plan) if isinstance(plan, Mapping) else None
    if eff_min is None:
        # Not always computable (e.g., portfolio pnl >= 0 for all scenarios).
        conditions.append(
            GateCondition(
                REASON_EFFECTIVENESS_TOO_LOW,
                "Effectiveness metric not available; require manual review of scenario results for downside cases",
                {"note": "effectiveness is computed only when portfolio_pnl < 0 in scenario_engine"},
            )
        )
    else:
        trace["checks"].append({"check": "effectiveness_min", "min": float(eff_min), "policy_min": float(pol["min_effectiveness"])})
        if float(eff_min) < float(pol["min_effectiveness"]):
            reasons.append(
                GateReason(
                    REASON_EFFECTIVENESS_TOO_LOW,
                    "HARD",
                    "Minimum hedge effectiveness across scenarios is below policy threshold",
                    {"min_effectiveness": float(eff_min), "policy_min_effectiveness": float(pol["min_effectiveness"])},
                )
            )

    # -------------------------
    # Residual risk detection (if explicit classifier output provided)
    # -------------------------
    material_risks = _extract_material_risks(payload) if isinstance(payload, Mapping) else []
    if material_risks:
        thr = float(pol["material_risk_score_threshold"])
        unhedged: List[Dict[str, Any]] = []
        for r in material_risks:
            score = _as_float(r.get("score", r.get("risk_score", 0.0)), 0.0)
            rid = _as_str(r.get("risk_id", r.get("id", "")), "")
            covered = r.get("covered")
            # Only treat as "unhedged" if explicitly marked uncovered OR if no covered flag but score is material and no strategies exist.
            if score >= thr and (covered is False):
                unhedged.append({"risk_id": rid, "score": float(score), "detail": dict(r)})

        if unhedged:
            residuals.append(
                GateResidualRisk(
                    REASON_UNHEDGED_MATERIAL_RISK,
                    "One or more material risks were explicitly marked as uncovered by upstream classification",
                    {"threshold": thr, " see": unhedged},
                )
            )
            if bool(pol["reject_on_unhedged_material_risks"]):
                reasons.append(
                    GateReason(
                        REASON_UNHEDGED_MATERIAL_RISK,
                        "HARD",
                        "Material uncovered risks present; policy requires rejection",
                        {"count": len(unhedged), "threshold": thr},
                    )
                )
            else:
                conditions.append(
                    GateCondition(
                        REASON_UNHEDGED_MATERIAL_RISK,
                        "Material uncovered risks present; proceed only with explicit sign-off",
                        {"count": len(unhedged), "threshold": thr},
                    )
                )

    # -------------------------
    # Verdict synthesis
    # -------------------------
    hard_fail = any(r.severity == "HARD" for r in reasons)
    if hard_fail:
        verdict = VERDICT_REJECT
    else:
        verdict = VERDICT_APPROVE_WITH_CONDITIONS if len(conditions) > 0 or len(residuals) > 0 else VERDICT_APPROVE

    duration_ms = int((time.perf_counter() - t0) * 1000)

    # -------------------------
    # Deterministic decision hash (timestamps excluded)
    # -------------------------
    reasons_obj = [
        {"code": r.code, "severity": r.severity, "message": r.message, "details": r.details}
        for r in reasons
    ]
    conditions_obj = [{"code": c.code, "message": c.message, "details": c.details} for c in conditions]
    residuals_obj = [{"code": rr.code, "message": rr.message, "details": rr.details} for rr in residuals]

    decision_core = {
        "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
        "verdict": verdict,
        "reasons": reasons_obj,
        "conditions": conditions_obj,
        "residual_risks": residuals_obj,
        "policy": pol,
        "plan_fingerprint": _stable_hash(plan) if isinstance(plan, Mapping) else None,
    }
    decision_hash = _stable_hash(decision_core)

    trace_no_time = dict(trace)
    trace_no_time["decision_hash"] = decision_hash
    trace_fingerprint = _stable_hash(trace_no_time)

    trace["decision_hash"] = decision_hash
    trace["trace_fingerprint"] = trace_fingerprint
    trace["timestamps"] = {"generated_at_ms": _now_ms(), "duration_ms": duration_ms}

    out: Dict[str, Any] = {
        "verdict": verdict,
        "reasons": reasons_obj,
        "conditions": conditions_obj,
        "residual_risks": residuals_obj,
        "decision_hash": decision_hash,
        "trace_fingerprint": trace_fingerprint,
        "meta": {"decision_trace": trace if bool(pol["include_trace"]) else {"engine": trace["engine"], "trace_fingerprint": trace_fingerprint}, "duration_ms": duration_ms},
    }

    if bool(pol["include_inputs_used"]):
        out["inputs_used"] = {
            "cost_total_usd": cost_total,
            "portfolio_notional_usd": notional,
            "worst_case": {"scenario_id": worst_sid, "net_pnl_usd": worst_pnl},
            "rejected_legs_count": int(rejected_count),
            "effectiveness_min": eff_min,
        }

    return out


__all__ = [
    "ENGINE_NAME",
    "ENGINE_VERSION",
    "VERDICT_APPROVE",
    "VERDICT_APPROVE_WITH_CONDITIONS",
    "VERDICT_REJECT",
    "decision_gate",
]
