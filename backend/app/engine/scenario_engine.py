# backend/app/engine/scenario_engine.py
from __future__ import annotations

import hashlib
import json
import math
import time
from typing import Any, Dict, List, Mapping, Optional


ENGINE_NAME = "scenario_engine"
ENGINE_VERSION = "1.0.2"  # PATCH: strict canonical JSON + clamp policy + explicit skip/rejects


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
    - NO default=str: unsupported types must raise (no silent coercion)
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


def _is_effectively_zero(x: float, eps: float) -> bool:
    try:
        return math.isfinite(x) and abs(x) <= eps
    except Exception:
        return True


def _build_trace_seed(*, policy: Mapping[str, Any], input_obj: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
        "policy": dict(policy),
        "input_fingerprint": _stable_hash(input_obj),
    }


# -----------------------------
# Rejection reason codes
# -----------------------------
REASON_BAD_INPUT = "bad_input"
REASON_MISSING_MARKET_INPUT = "missing_market_input"
REASON_UNSUPPORTED_ASSET_CLASS = "unsupported_asset_class"
REASON_INVALID_CONTRACTS = "invalid_contracts"
REASON_INVALID_SCENARIOS = "invalid_scenarios"
REASON_NO_VALID_HEDGES = "no_valid_hedges"
REASON_OPTION_DELTA_MISSING = "option_delta_missing"


def _price_key_for_instrument(instrument_id: str, asset_class: str) -> str:
    return f"{instrument_id}_UNDERLYING" if asset_class == "options" else instrument_id


def _scenario_id_from_obj(s: Mapping[str, Any], idx: int) -> str:
    sid = s.get("scenario_id")
    return sid.strip() if isinstance(sid, str) and sid.strip() else f"SCENARIO_{idx+1:02d}"


def run_scenarios(payload: Mapping[str, Any], *, policy: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
    """
    Scenario Stress Engine (Deterministic, Linear Proxy)

    IMPORTANT DISCLOSURE:
    - Linear Delta/Vega proxies only
    - Gamma, Theta, convexity, correlation, and liquidity effects ignored
    - Deterministic stress lens -- NOT a pricing or capital model
    """

    t0 = time.perf_counter()

    pol: Dict[str, Any] = {
        "max_scenarios": 50,
        "max_hedges": 200,
        "clamp_equity_move_pct": 1.0,
        "clamp_vol_move_pct": 3.0,
        "require_prices": True,
        "require_option_delta_for_options": True,
        "prefer_vega_model_for_vol_underlyings": True,
        "sensitivity_zero_epsilon": 1e-12,
        "include_net_after_costs": True,
    }
    if isinstance(policy, dict):
        for k, v in policy.items():
            if k in pol:
                pol[k] = v

    portfolio = payload.get("portfolio", {}) or {}
    sized_hedges = payload.get("sized_hedges", []) or []
    instrument_meta = payload.get("instrument_meta", {}) or {}
    market = payload.get("market", {}) or {}
    scenarios = payload.get("scenarios", []) or []
    costs = payload.get("costs", {}) or {}

    exposures = portfolio.get("exposures", {}) or {}
    delta_usd = _as_float(exposures.get("delta_usd", 0.0))
    vega_usd = _as_float(exposures.get("vega_usd", 0.0))
    baseline_pnl = _as_float(portfolio.get("baseline_pnl_proxy_usd", 0.0))

    prices = market.get("prices", {}) or {}
    option_deltas = market.get("option_deltas", {}) or {}
    sensitivities = market.get("sensitivities", {}) or {}

    costs_total = costs.get("total")
    costs_total_f = float(costs_total) if _is_finite_number(costs_total) else None

    scenarios = scenarios[: _as_int(pol["max_scenarios"], 50)]
    sized_hedges = sized_hedges[: _as_int(pol["max_hedges"], 200)]

    input_obj = {
        "portfolio": {"delta_usd": delta_usd, "vega_usd": vega_usd, "baseline": baseline_pnl},
        "hedges": sized_hedges,
        "scenarios": scenarios,
        "costs_total": costs_total_f,
    }

    trace = _build_trace_seed(policy=pol, input_obj=input_obj)
    results: List[Dict[str, Any]] = []
    rejected: List[Dict[str, Any]] = []
    trace_steps: List[Dict[str, Any]] = []

    if not scenarios:
        rejected.append({"scenario_id": None, "reason": REASON_INVALID_SCENARIOS})
        return {"results": [], "rejected": rejected, "meta": {"decision_trace": trace}}

    # Normalize hedges deterministically (and reject invalid contracts)
    hedges: List[Dict[str, Any]] = []
    for hi, h in enumerate(sized_hedges):
        if not isinstance(h, dict):
            continue
        instrument_id = h.get("instrument_id")
        if not isinstance(instrument_id, str) or not instrument_id.strip():
            continue

        meta = instrument_meta.get(instrument_id)
        if not isinstance(meta, dict):
            continue

        contracts_raw = h.get("contracts", 0)
        contracts = _as_int(contracts_raw, 0)
        # If contracts is not representable as int but raw was non-empty/non-zero-like, reject explicitly
        if contracts == 0 and contracts_raw not in (0, "0", None, "", False):
            rejected.append(
                {
                    "scenario_id": None,
                    "instrument_id": instrument_id,
                    "reason": REASON_INVALID_CONTRACTS,
                    "details": {"contracts": contracts_raw},
                }
            )
            continue

        asset_class = meta.get("asset_class")
        if asset_class not in ("futures", "perp", "options"):
            rejected.append(
                {
                    "scenario_id": None,
                    "instrument_id": instrument_id,
                    "reason": REASON_UNSUPPORTED_ASSET_CLASS,
                    "details": {"asset_class": asset_class},
                }
            )
            continue

        hedges.append(
            {
                "strategy_id": h.get("strategy_id"),
                "instrument_id": instrument_id,
                "contracts": int(contracts),
                "asset_class": asset_class,
                "underlying": str(meta.get("underlying", "")),
                "multiplier": _as_float(meta.get("contract_multiplier", 0.0)),
            }
        )

    if not hedges:
        rejected.append({"scenario_id": None, "reason": REASON_NO_VALID_HEDGES})

    eps = _as_float(pol["sensitivity_zero_epsilon"], 1e-12)
    clamp_eq = abs(_as_float(pol["clamp_equity_move_pct"], 1.0))
    clamp_vol = abs(_as_float(pol["clamp_vol_move_pct"], 3.0))

    for si, s in enumerate(scenarios):
        if not isinstance(s, dict):
            scenario_id = f"SCENARIO_{si+1:02d}"
            rejected.append({"scenario_id": scenario_id, "reason": REASON_BAD_INPUT, "details": {"non_dict_scenario": True}})
            continue

        scenario_id = _scenario_id_from_obj(s, si)
        shocks = s.get("shocks", {}) or {}

        eq_move = _clamp(_as_float(shocks.get("equity_move_pct", 0.0)), -clamp_eq, clamp_eq)
        vol_move = _clamp(_as_float(shocks.get("vol_move_pct", 0.0)), -clamp_vol, clamp_vol)

        port_delta = delta_usd * eq_move
        port_vega = vega_usd * vol_move
        portfolio_pnl = baseline_pnl + port_delta + port_vega

        hedge_pnl = 0.0
        hedge_rows: List[Dict[str, Any]] = []

        for h in hedges:
            contracts = h["contracts"]
            instrument_id = h["instrument_id"]

            if contracts == 0:
                hedge_rows.append({"instrument_id": instrument_id, "pnl_usd": 0.0})
                continue

            price_key = _price_key_for_instrument(instrument_id, h["asset_class"])
            px = prices.get(price_key)

            if bool(pol["require_prices"]) and not _is_finite_number(px):
                rejected.append(
                    {
                        "scenario_id": scenario_id,
                        "instrument_id": instrument_id,
                        "reason": REASON_MISSING_MARKET_INPUT,
                        "details": {"missing_price_key": price_key},
                    }
                )
                # Explicitly include row as skipped with None pnl to prevent silent disappearance
                hedge_rows.append({"instrument_id": instrument_id, "pnl_usd": None, "skipped": True, "reason": REASON_MISSING_MARKET_INPUT})
                continue

            pnl = 0.0

            if h["asset_class"] in ("futures", "perp"):
                if (
                    bool(pol["prefer_vega_model_for_vol_underlyings"])
                    and h["underlying"].upper() == "VIX"
                    and isinstance(sensitivities.get(instrument_id), dict)
                ):
                    vega_pc = sensitivities[instrument_id].get("vega_usd_per_contract")
                    if _is_finite_number(vega_pc) and not _is_effectively_zero(float(vega_pc), eps):
                        pnl = contracts * float(vega_pc) * vol_move
                    else:
                        pnl = contracts * h["multiplier"] * float(px) * eq_move
                else:
                    pnl = contracts * h["multiplier"] * float(px) * eq_move

            elif h["asset_class"] == "options":
                od = option_deltas.get(instrument_id)
                if _is_finite_number(od):
                    pnl = contracts * float(od) * float(px) * eq_move * h["multiplier"]
                else:
                    if bool(pol["require_option_delta_for_options"]):
                        rejected.append(
                            {
                                "scenario_id": scenario_id,
                                "instrument_id": instrument_id,
                                "reason": REASON_OPTION_DELTA_MISSING,
                            }
                        )
                        hedge_rows.append({"instrument_id": instrument_id, "pnl_usd": None, "skipped": True, "reason": REASON_OPTION_DELTA_MISSING})
                        continue
                    pnl = 0.0

            hedge_pnl += float(pnl)
            hedge_rows.append({"instrument_id": instrument_id, "pnl_usd": float(pnl)})

        net_pnl = portfolio_pnl + hedge_pnl
        net_after_costs = net_pnl - costs_total_f if costs_total_f is not None else None

        effectiveness = None
        if portfolio_pnl < 0.0:
            offset = max(0.0, hedge_pnl)
            denom = abs(portfolio_pnl)
            if denom > 0:
                effectiveness = _clamp(offset / denom, 0.0, 2.0)

        results.append(
            {
                "scenario_id": scenario_id,
                "portfolio": {
                    "pnl_usd": portfolio_pnl,
                    "delta_component_usd": port_delta,
                    "vega_component_usd": port_vega,
                    "baseline_pnl_proxy_usd": baseline_pnl,
                },
                "hedges": hedge_rows,
                "net": {
                    "pnl_usd": net_pnl,
                    "hedge_pnl_usd": hedge_pnl,
                    "hedge_effectiveness": effectiveness,
                    "net_after_costs_usd": net_after_costs,
                },
                "meta": {
                    "trace": {
                        "notes": (
                            "proxy models (linear Delta/Vega only); "
                            "Gamma, Theta, convexity, correlation ignored; "
                            "deterministic; no stochastic simulation; "
                            "no sizing or execution changes"
                        )
                    }
                },
            }
        )

        trace_steps.append(
            {
                "scenario_id": scenario_id,
                "portfolio_pnl_usd": portfolio_pnl,
                "hedge_pnl_usd": hedge_pnl,
                "net_pnl_usd": net_pnl,
                "hedge_effectiveness": effectiveness,
            }
        )

    duration_ms = int((time.perf_counter() - t0) * 1000)

    trace["steps"] = trace_steps
    trace["output_fingerprint"] = _stable_hash({"results": results, "rejected": rejected})

    # stable trace fingerprint (timestamps excluded)
    trace_no_time = dict(trace)
    trace_fingerprint = _stable_hash(trace_no_time)
    trace["trace_fingerprint"] = trace_fingerprint

    trace["timestamps"] = {"generated_at_ms": _now_ms(), "duration_ms": duration_ms}

    return {
        "results": results,
        "rejected": rejected,
        "meta": {"decision_trace": trace, "duration_ms": duration_ms},
    }


__all__ = ["ENGINE_NAME", "ENGINE_VERSION", "run_scenarios"]
