# backend/app/engine/recommend.py
from __future__ import annotations

import hashlib
import importlib
import inspect
import json
import time
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple


ENGINE_NAME = "recommend"
ENGINE_VERSION = "1.0.3"


# ---------------------------------------------------------------------
# Stable primitives (STRICT audit-safe)
# ---------------------------------------------------------------------
def _canonical_json(obj: Any) -> str:
    """
    Strict canonical JSON for hashing + trace fingerprints.

    Properties:
      - sort_keys=True: stable key order
      - separators=(",", ":"): no whitespace variance
      - ensure_ascii=False: UTF-8 stable
      - allow_nan=False: rejects NaN/Inf (prevents non-standard JSON + audit drift)

    Hard rule:
      - Rejects unsupported/non-JSON-serializable objects (no silent stringification).
    """
    try:
        return json.dumps(
            obj,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
    except (TypeError, ValueError) as e:
        # ValueError can occur for NaN/Inf when allow_nan=False
        raise TypeError(f"Non-canonical object encountered during hashing: {type(e).__name__}: {e}") from e


def _stable_hash(obj: Any) -> str:
    return hashlib.sha256(_canonical_json(obj).encode("utf-8")).hexdigest()


def _now_ms() -> int:
    return int(time.time() * 1000)


# ---------------------------------------------------------------------
# Deterministic callable resolution
# ---------------------------------------------------------------------
def _resolve_callable(module_name: str, candidates: Tuple[str, ...]) -> Callable[..., Any]:
    """
    Deterministic, audit-safe callable resolver.
    Candidate order is authoritative and stable.
    """
    mod = importlib.import_module(module_name)
    for name in candidates:
        fn = getattr(mod, name, None)
        if callable(fn):
            return fn
    raise AttributeError(f"{module_name}: none of {candidates} found")


def _call_stage(fn: Callable[..., Any], inp: Any, policy: Dict[str, Any]) -> Any:
    """
    Deterministically invoke stage with or without policy depending on signature.
    """
    sig = inspect.signature(fn)
    if "policy" in sig.parameters:
        return fn(inp, policy=policy)
    return fn(inp)


# ---------------------------------------------------------------------
# Trace helpers
# ---------------------------------------------------------------------
def _build_trace_seed(*, policy: Mapping[str, Any], input_obj: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
        "policy": dict(policy),
        "input_fingerprint": _stable_hash(input_obj),  # NOTE: shape/structure fingerprint (v1)
        "input_content_fingerprint": None,  # NOTE: payload content fingerprint (v1.0.3+)
        "module_fingerprints": {},
        "stages": [],
        "notes": [],
    }


def _safe_stage(stages_policy: Dict[str, Any], stage_key: str) -> Dict[str, Any]:
    v = stages_policy.get(stage_key, {})
    return dict(v) if isinstance(v, dict) else {}


def _stage_failure(stage: str, err: Exception) -> Dict[str, Any]:
    """
    Deterministic failure envelope.
    IMPORTANT: does not include exception text/tracebacks (non-deterministic).
    """
    code = f"{type(err).__name__}"
    return {
        "failed": True,
        "stage": stage,
        "error_code": code,
        "error_fingerprint": _stable_hash({"stage": stage, "error": code}),
    }


def _run_stage(
    *,
    trace: Dict[str, Any],
    stage: str,
    fn: Callable[..., Any],
    inp: Any,
    stage_policy: Dict[str, Any],
) -> Any:
    """
    Run one stage with:
      - deterministic input/output fingerprints
      - explicit stage failure envelope on exception
    """
    stage_rec: Dict[str, Any] = {
        "stage": stage,
        "input_fingerprint": _stable_hash(inp),
    }
    try:
        out = _call_stage(fn, inp, stage_policy)
        stage_rec["output_fingerprint"] = _stable_hash(out)
        stage_rec["status"] = "ok"
        trace["stages"].append(stage_rec)
        return out
    except Exception as e:
        stage_rec["status"] = "failed"
        stage_rec["failure"] = _stage_failure(stage, e)
        # Important: do NOT include exception strings/tracebacks (non-deterministic / environment-dependent)
        trace["stages"].append(stage_rec)
        raise


def _last_stage_failure(trace: Mapping[str, Any]) -> Optional[Dict[str, Any]]:
    stages = trace.get("stages")
    if not isinstance(stages, list) or not stages:
        return None
    last = stages[-1]
    if isinstance(last, dict) and last.get("status") == "failed":
        failure = last.get("failure")
        return failure if isinstance(failure, dict) else None
    return None


def _trace_sanitized_for_fingerprint(trace: Mapping[str, Any], *, plan_id: Optional[str]) -> Dict[str, Any]:
    """
    Deterministic trace view used only for hashing (trace_fingerprint).
    Strips ephemeral values.
    """
    out: Dict[str, Any] = {
        "engine": trace.get("engine"),
        "policy": trace.get("policy"),
        "input_fingerprint": trace.get("input_fingerprint"),
        "input_content_fingerprint": trace.get("input_content_fingerprint"),
        "module_fingerprints": trace.get("module_fingerprints"),
        "stages": trace.get("stages"),
        "notes": trace.get("notes"),
        "timestamps": {"generated_at_ms": None, "duration_ms": None},
    }
    if plan_id is not None:
        out["plan_id"] = plan_id
    return out


def _safe_trace_fingerprint(trace: Dict[str, Any], *, plan_id: Optional[str]) -> str:
    """
    Fail-safe trace fingerprint setter to prevent double-fault crashes.

    If trace contains non-canonical / non-serializable content (e.g., a stage output leaked
    an object), hashing the sanitized trace can raise. In ANY rejection path we must not
    crash again while building the audit envelope.

    Determinism:
      - On failure, returns a fixed sentinel string and records a boolean note.
    """
    try:
        return _stable_hash(_trace_sanitized_for_fingerprint(trace, plan_id=plan_id))
    except Exception:
        try:
            notes = trace.get("notes")
            if isinstance(notes, list):
                notes.append({"trace_fingerprint_unavailable": True})
        except Exception:
            pass
        return "UNAVAILABLE"


def _attach_trace_fingerprint_and_timestamps(*, trace: Dict[str, Any], plan_id: Optional[str], duration_ms: int) -> None:
    trace["trace_fingerprint"] = _safe_trace_fingerprint(trace, plan_id=plan_id)
    trace["timestamps"] = {"generated_at_ms": _now_ms(), "duration_ms": int(duration_ms)}


# ---------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------
def _summarize_results(*, costs: Mapping[str, Any], scenarios: Mapping[str, Any]) -> Dict[str, Any]:
    cost_total = 0.0
    holding_days = None

    if isinstance(costs, dict):
        c = costs.get("costs", {})
        if isinstance(c, dict):
            try:
                cost_total = float(c.get("total", 0.0))
            except Exception:
                cost_total = 0.0
            holding_days = c.get("holding_period_days")

    eff_values: List[float] = []
    worst_net_pnl: Optional[float] = None
    worst_scenario_id: Optional[str] = None

    results = scenarios.get("results", []) if isinstance(scenarios, dict) else []
    if isinstance(results, list):
        for r in results:
            if not isinstance(r, dict):
                continue
            net = r.get("net", {})
            if not isinstance(net, dict):
                net = {}

            pnl = net.get("pnl_usd")
            eff = net.get("hedge_effectiveness")

            # IMPORTANT: bool is a subclass of int -> exclude it explicitly
            if isinstance(eff, (int, float)) and not isinstance(eff, bool):
                eff_values.append(float(eff))

            if isinstance(pnl, (int, float)) and not isinstance(pnl, bool):
                fp = float(pnl)
                if worst_net_pnl is None or fp < worst_net_pnl:
                    worst_net_pnl = fp
                    sid = r.get("scenario_id")
                    worst_scenario_id = str(sid) if sid is not None else None

    return {
        "cost_total_usd": float(cost_total),
        "holding_period_days": holding_days,
        "hedge_effectiveness": {
            "avg": (sum(eff_values) / float(len(eff_values))) if eff_values else None,
            "min": min(eff_values) if eff_values else None,
            "max": max(eff_values) if eff_values else None,
            "count": int(len(eff_values)),
        },
        "worst_case": {
            "scenario_id": worst_scenario_id,
            "net_pnl_usd": worst_net_pnl,
        },
    }


# ---------------------------------------------------------------------
# Main Orchestrator
# ---------------------------------------------------------------------
def recommend(payload: Mapping[str, Any], *, policy: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
    """
    HedgeCalc Engine Orchestrator (Deterministic v1)

    Pipeline (canonical):
      Exposure -> Risk Classification -> Strategy Selection -> Instrument Mapping
        -> Hedge Sizing -> Cost & Carry -> Scenario Stress -> Final Recommendation

    HARD CONSTRAINTS:
      - Deterministic (no randomness)
      - No I/O
      - No pricing/feeds/execution in this orchestrator
      - Explainable decision trace with stable hashing

    v1 governance:
      - payload["overrides"] is explicitly ignored (recorded in trace notes)
      - Fail-closed: if any stage fails, no partial hedge plan is emitted
    """
    t0 = time.perf_counter()

    # -------------------------
    # Validate input (fail-closed)
    # -------------------------
    if not isinstance(payload, Mapping):
        rej = _stage_failure("input_validation", TypeError("payload_must_be_mapping"))
        return {"rejected": rej, "meta": {"decision_trace": None, "duration_ms": 0}}

    # -------------------------
    # Deterministic policy merge
    # -------------------------
    pol: Dict[str, Any] = {
        "stages": {
            "exposure": {},
            "risk_classifier": {},
            "strategy_selector": {},
            "instrument_mapper": {},
            "hedge_sizer": {},
            "cost_engine": {},
            "scenario_engine": {},
        },
        "include_stage_outputs": True,
        "max_strategies_forward": 25,
    }

    if isinstance(policy, Mapping):
        stages = policy.get("stages")
        if isinstance(stages, Mapping):
            for k in pol["stages"].keys():
                v = stages.get(k)
                if isinstance(v, Mapping):
                    pol["stages"][k] = dict(v)

        if "include_stage_outputs" in policy:
            pol["include_stage_outputs"] = bool(policy["include_stage_outputs"])

        if "max_strategies_forward" in policy:
            try:
                pol["max_strategies_forward"] = int(policy["max_strategies_forward"])
            except Exception:
                pass

    # --- Overrides explicitly ignored in v1 ---
    ignored_overrides: List[str] = []
    try:
        if "overrides" in payload:
            ov = payload.get("overrides")
            if isinstance(ov, Mapping):
                ignored_overrides = sorted([str(k) for k in ov.keys()])
    except Exception:
        ignored_overrides = []

    # -------------------------
    # Resolve engine package base (portable)
    # -------------------------
    # Preferred: package-based resolution. Fallback keeps prior behavior deterministic.
    if isinstance(__package__, str) and __package__.endswith(".engine"):
        engine_pkg = __package__  # e.g., "backend.app.engine"
    elif "." in __name__:
        engine_pkg = __name__.rsplit(".", 1)[0]  # e.g., "backend.app.engine"
    else:
        engine_pkg = "backend.app.engine"  # deterministic fallback for non-package execution

    exposure_mod = f"{engine_pkg}.exposure"
    risk_mod = f"{engine_pkg}.risk_classifier"
    strategy_mod = f"{engine_pkg}.strategy_selector"
    mapper_mod = f"{engine_pkg}.instrument_mapper"
    sizer_mod = f"{engine_pkg}.hedge_sizer"
    cost_mod = f"{engine_pkg}.cost_engine"
    scenario_mod = f"{engine_pkg}.scenario_engine"

    # --- Validate that payload keys are strings (required for JSON serialization + sorting) ---
    try:
        non_str_keys = [k for k in payload.keys() if not isinstance(k, str)]
        if non_str_keys:
            raise TypeError(f"payload keys must be strings; got non-string keys: {non_str_keys!r}")
    except Exception as e:
        rej = _stage_failure("initialization", e)
        return {"rejected": rej, "meta": {"decision_trace": None, "duration_ms": 0}}

    # --- Trace seed (minimal, deterministic input descriptor) ---
    try:
        input_obj = {
            "keys": sorted(list(payload.keys())),
            "market_keys": sorted(list((payload.get("market", {}) or {}).keys()))
            if isinstance(payload.get("market", {}), Mapping)
            else [],
            "has_positions": bool(("positions" in payload) or ("exposure_input" in payload)),
            "has_instrument_specs": bool("instrument_specs" in payload),
            "has_instrument_meta": bool("instrument_meta" in payload),
            "has_assumptions": bool("assumptions" in payload),
            "has_scenarios": bool("scenarios" in payload),
        }
    except Exception as e:
        rej = _stage_failure("initialization", e)
        return {"rejected": rej, "meta": {"decision_trace": None, "duration_ms": 0}}

    trace = _build_trace_seed(policy=pol, input_obj=input_obj)
    trace["notes"].append({"overrides_ignored_v1": ignored_overrides})
    if engine_pkg == "backend.app.engine" and "." not in __name__ and not (isinstance(__package__, str) and __package__):
        trace["notes"].append({"engine_pkg_fallback_used": True})

    # Add payload content fingerprint (best-effort, deterministic fail-closed behavior)
    try:
        trace["input_content_fingerprint"] = _stable_hash(payload)
    except Exception as e:
        trace["input_content_fingerprint"] = None
        # Best-effort: if building the failure envelope itself fails, we still proceed.
        try:
            trace["notes"].append({"input_content_fingerprint_failed": _stage_failure("input_content_fingerprint", e)})
        except Exception:
            trace["notes"].append({"input_content_fingerprint_failed": True})

    # --- Resolve callables (deterministic candidate lists) ---
    try:
        exposure_fn = _resolve_callable(
            exposure_mod,
            ("compute_exposure", "calculate_exposure", "exposure", "run_exposure"),
        )
    except Exception as e:
        duration_ms_fail = int((time.perf_counter() - t0) * 1000)
        failure = _stage_failure(f"callable_resolution:{exposure_mod}", e)
        _attach_trace_fingerprint_and_timestamps(trace=trace, plan_id=None, duration_ms=duration_ms_fail)
        return {"rejected": failure, "meta": {"decision_trace": trace, "duration_ms": duration_ms_fail}}

    try:
        risk_fn = _resolve_callable(
            risk_mod,
            ("classify_risk", "risk_classify", "run_risk_classifier"),
        )
    except Exception as e:
        duration_ms_fail = int((time.perf_counter() - t0) * 1000)
        failure = _stage_failure(f"callable_resolution:{risk_mod}", e)
        _attach_trace_fingerprint_and_timestamps(trace=trace, plan_id=None, duration_ms=duration_ms_fail)
        return {"rejected": failure, "meta": {"decision_trace": trace, "duration_ms": duration_ms_fail}}

    try:
        strategy_fn = _resolve_callable(
            strategy_mod,
            ("select_strategies", "strategy_select", "run_strategy_selector"),
        )
    except Exception as e:
        duration_ms_fail = int((time.perf_counter() - t0) * 1000)
        failure = _stage_failure(f"callable_resolution:{strategy_mod}", e)
        _attach_trace_fingerprint_and_timestamps(trace=trace, plan_id=None, duration_ms=duration_ms_fail)
        return {"rejected": failure, "meta": {"decision_trace": trace, "duration_ms": duration_ms_fail}}

    try:
        instrument_map_fn = _resolve_callable(mapper_mod, ("map_instruments",))
    except Exception as e:
        duration_ms_fail = int((time.perf_counter() - t0) * 1000)
        failure = _stage_failure(f"callable_resolution:{mapper_mod}", e)
        _attach_trace_fingerprint_and_timestamps(trace=trace, plan_id=None, duration_ms=duration_ms_fail)
        return {"rejected": failure, "meta": {"decision_trace": trace, "duration_ms": duration_ms_fail}}

    try:
        sizer_fn = _resolve_callable(sizer_mod, ("size_hedges",))
    except Exception as e:
        duration_ms_fail = int((time.perf_counter() - t0) * 1000)
        failure = _stage_failure(f"callable_resolution:{sizer_mod}", e)
        _attach_trace_fingerprint_and_timestamps(trace=trace, plan_id=None, duration_ms=duration_ms_fail)
        return {"rejected": failure, "meta": {"decision_trace": trace, "duration_ms": duration_ms_fail}}

    try:
        cost_fn = _resolve_callable(cost_mod, ("compute_costs",))
    except Exception as e:
        duration_ms_fail = int((time.perf_counter() - t0) * 1000)
        failure = _stage_failure(f"callable_resolution:{cost_mod}", e)
        _attach_trace_fingerprint_and_timestamps(trace=trace, plan_id=None, duration_ms=duration_ms_fail)
        return {"rejected": failure, "meta": {"decision_trace": trace, "duration_ms": duration_ms_fail}}

    try:
        scenario_fn = _resolve_callable(scenario_mod, ("run_scenarios",))
    except Exception as e:
        duration_ms_fail = int((time.perf_counter() - t0) * 1000)
        failure = _stage_failure(f"callable_resolution:{scenario_mod}", e)
        _attach_trace_fingerprint_and_timestamps(trace=trace, plan_id=None, duration_ms=duration_ms_fail)
        return {"rejected": failure, "meta": {"decision_trace": trace, "duration_ms": duration_ms_fail}}

    def _fn_fingerprint(fn: Callable[..., Any]) -> str:
        """Return a stable fingerprint for a callable; safe for Mock/wrapped objects.

        Uses qualname > name > type name as fallback to stay deterministic even when
        the callable is a unittest.mock.MagicMock (which has no stable __name__).
        """
        m = str(getattr(fn, "__module__", None) or "")
        # Prefer __qualname__ (most stable), then __name__, then type name (deterministic for mocks)
        n = (
            str(getattr(fn, "__qualname__", None) or "")
            or str(getattr(fn, "__name__", None) or "")
            or type(fn).__name__
        )
        return _stable_hash({"m": m, "n": n})

    trace["module_fingerprints"] = {
        "exposure": _fn_fingerprint(exposure_fn),
        "risk_classifier": _fn_fingerprint(risk_fn),
        "strategy_selector": _fn_fingerprint(strategy_fn),
        "instrument_mapper": _fn_fingerprint(instrument_map_fn),
        "hedge_sizer": _fn_fingerprint(sizer_fn),
        "cost_engine": _fn_fingerprint(cost_fn),
        "scenario_engine": _fn_fingerprint(scenario_fn),
    }

    # -------------------------
    # Execute stages (fail-closed)
    # -------------------------
    try:
        # Stage 1: Exposure
        if "exposure_input" in payload:
            exposure_input: Any = payload.get("exposure_input")
        elif "positions" in payload:
            exposure_input = {"positions": payload.get("positions")}
        else:
            exposure_input = {}

        exposure_out = _run_stage(
            trace=trace,
            stage="exposure",
            fn=exposure_fn,
            inp=exposure_input,
            stage_policy=_safe_stage(pol["stages"], "exposure"),
        )

        # Stage 2: Risk Classification
        risk_input = {"exposures": exposure_out.get("exposures", exposure_out)} if isinstance(exposure_out, dict) else {"exposures": exposure_out}
        risk_out = _run_stage(
            trace=trace,
            stage="risk_classifier",
            fn=risk_fn,
            inp=risk_input,
            stage_policy=_safe_stage(pol["stages"], "risk_classifier"),
        )

        # Stage 3: Strategy Selector
        strategy_input = {"risk": risk_out}
        strategy_out = _run_stage(
            trace=trace,
            stage="strategy_selector",
            fn=strategy_fn,
            inp=strategy_input,
            stage_policy=_safe_stage(pol["stages"], "strategy_selector"),
        )

        # Cap strategies deterministically
        strategies = strategy_out.get("strategies", []) if isinstance(strategy_out, dict) else []
        dropped = 0
        if isinstance(strategies, list):
            max_n = int(pol.get("max_strategies_forward", 25))
            if max_n < 1:
                max_n = 1
            dropped = max(0, len(strategies) - max_n)
            strategies = strategies[:max_n]
        else:
            strategies = []
        if dropped > 0:
            trace["notes"].append({"strategies_truncated": {"dropped": dropped, "kept": len(strategies)}})

        # Stage 4: Instrument Mapper
        mapper_input = {"strategies": strategies}
        mapped_out = _run_stage(
            trace=trace,
            stage="instrument_mapper",
            fn=instrument_map_fn,
            inp=mapper_input,
            stage_policy=_safe_stage(pol["stages"], "instrument_mapper"),
        )

        # Stage 5: Hedge Sizer
        market = payload.get("market", {}) if isinstance(payload.get("market", {}), Mapping) else {}
        instrument_specs = payload.get("instrument_specs", {}) if isinstance(payload.get("instrument_specs", {}), Mapping) else {}

        sizer_input = {
            "exposures": exposure_out.get("exposures", exposure_out) if isinstance(exposure_out, dict) else exposure_out,
            "mapped_instruments": mapped_out.get("mapped_instruments", []) if isinstance(mapped_out, dict) else [],
            "instrument_specs": dict(instrument_specs),
            "market": dict(market),
        }
        sized_out = _run_stage(
            trace=trace,
            stage="hedge_sizer",
            fn=sizer_fn,
            inp=sizer_input,
            stage_policy=_safe_stage(pol["stages"], "hedge_sizer"),
        )

        # Stage 6: Cost Engine
        instrument_meta = payload.get("instrument_meta", {}) if isinstance(payload.get("instrument_meta", {}), Mapping) else {}
        assumptions = payload.get("assumptions", {}) if isinstance(payload.get("assumptions", {}), Mapping) else {}

        cost_input = {
            "sized_hedges": sized_out.get("sized_hedges", []) if isinstance(sized_out, dict) else [],
            "instrument_meta": dict(instrument_meta),
            "market": dict(market),
            "assumptions": dict(assumptions),
        }
        costs_out = _run_stage(
            trace=trace,
            stage="cost_engine",
            fn=cost_fn,
            inp=cost_input,
            stage_policy=_safe_stage(pol["stages"], "cost_engine"),
        )

        # Stage 7: Scenario Engine
        scenarios = payload.get("scenarios", []) if isinstance(payload.get("scenarios", []), list) else []
        scenario_input = {
            "portfolio": {"exposures": exposure_out.get("exposures", exposure_out) if isinstance(exposure_out, dict) else exposure_out},
            "sized_hedges": sized_out.get("sized_hedges", []) if isinstance(sized_out, dict) else [],
            "instrument_meta": dict(instrument_meta),
            "market": dict(market),
            "scenarios": scenarios,
        }
        scenario_out = _run_stage(
            trace=trace,
            stage="scenario_engine",
            fn=scenario_fn,
            inp=scenario_input,
            stage_policy=_safe_stage(pol["stages"], "scenario_engine"),
        )

    except Exception as e:
        duration_ms_fail = int((time.perf_counter() - t0) * 1000)
        failure = _last_stage_failure(trace) or _stage_failure("orchestrator", e)

        _attach_trace_fingerprint_and_timestamps(trace=trace, plan_id=None, duration_ms=duration_ms_fail)

        return {
            "rejected": failure,
            "meta": {"decision_trace": trace, "duration_ms": duration_ms_fail},
        }

    # -------------------------
    # Final recommendation object (MUST be fail-closed)
    # -------------------------
    try:
        summary = _summarize_results(costs=costs_out, scenarios=scenario_out)

        plan_core = {
            "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
            "engine_build": trace["module_fingerprints"],
            "summary": summary,
            "strategies": strategies,
            "mapped_instruments": mapped_out.get("mapped_instruments", []) if isinstance(mapped_out, dict) else [],
            "sized_hedges": sized_out.get("sized_hedges", []) if isinstance(sized_out, dict) else [],
            "costs": costs_out.get("costs", costs_out) if isinstance(costs_out, dict) else costs_out,
            "scenario_results": scenario_out.get("results", []) if isinstance(scenario_out, dict) else [],
            "rejections": {
                # Include ALL stage rejections so plan_id reflects coverage/quality
                "exposure": exposure_out.get("rejected", []) if isinstance(exposure_out, dict) else [],
                "risk_classifier": risk_out.get("rejected", []) if isinstance(risk_out, dict) else [],
                "strategy_selector": strategy_out.get("rejected", []) if isinstance(strategy_out, dict) else [],
                "instrument_mapper": mapped_out.get("rejected", []) if isinstance(mapped_out, dict) else [],
                "hedge_sizer": sized_out.get("rejected", []) if isinstance(sized_out, dict) else [],
                "cost_engine": costs_out.get("rejected", []) if isinstance(costs_out, dict) else [],
                "scenario_engine": scenario_out.get("rejected", []) if isinstance(scenario_out, dict) else [],
            },
        }

        plan_id = _stable_hash(plan_core)
        duration_ms = int((time.perf_counter() - t0) * 1000)

        trace["plan_id"] = plan_id
        trace["summary_fingerprint"] = _stable_hash(summary)
        trace["output_fingerprint"] = _stable_hash({"plan_id": plan_id, "plan": plan_core})
        trace["trace_fingerprint"] = _safe_trace_fingerprint(trace, plan_id=plan_id)
        trace["timestamps"] = {"generated_at_ms": _now_ms(), "duration_ms": duration_ms}

        out: Dict[str, Any] = {
            "plan_id": plan_id,
            "summary": summary,
            "meta": {"decision_trace": trace, "duration_ms": duration_ms},
        }

        if bool(pol.get("include_stage_outputs", True)):
            out["stages"] = {
                "exposure": exposure_out,
                "risk_classifier": risk_out,
                "strategy_selector": strategy_out,
                "instrument_mapper": mapped_out,
                "hedge_sizer": sized_out,
                "cost_engine": costs_out,
                "scenario_engine": scenario_out,
            }
            out["plan"] = plan_core

        return out

    except Exception as e:
        # FAIL-CLOSED FINALIZATION: never crash outward
        duration_ms_fail = int((time.perf_counter() - t0) * 1000)
        failure = _stage_failure("finalization", e)

        _attach_trace_fingerprint_and_timestamps(trace=trace, plan_id=None, duration_ms=duration_ms_fail)

        return {
            "rejected": failure,
            "meta": {"decision_trace": trace, "duration_ms": duration_ms_fail},
        }


__all__ = ["ENGINE_NAME", "ENGINE_VERSION", "recommend"]
