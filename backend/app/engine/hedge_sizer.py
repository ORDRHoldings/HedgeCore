# backend/app/engine/hedge_sizer.py
from __future__ import annotations

import hashlib
import json
import math
import time
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

ENGINE_NAME = "hedge_sizer"
ENGINE_VERSION = "1.0.1"  # adds deterministic margin utilization estimate


# -----------------------------
# Stable primitives (audit-safe)
# -----------------------------
def _canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def _stable_hash(obj: Any) -> str:
    return hashlib.sha256(_canonical_json(obj).encode("utf-8")).hexdigest()


def _now_ms() -> int:
    return int(time.time() * 1000)


def _clamp_int(value: int, lo: int, hi: int) -> int:
    if value < lo:
        return lo
    if value > hi:
        return hi
    return value


def _is_finite_number(x: Any) -> bool:
    try:
        return isinstance(x, (int, float)) and math.isfinite(float(x))
    except Exception:
        return False


def _as_float(x: Any, default: float = 0.0) -> float:
    try:
        v = float(x)
        if math.isfinite(v):
            return v
        return default
    except Exception:
        return default


def _as_int(x: Any, default: int = 0) -> int:
    try:
        v = int(x)
        return v
    except Exception:
        return default


# -----------------------------
# Rounding (deterministic)
# -----------------------------
ROUNDING_NEAREST = "nearest"
ROUNDING_FLOOR = "floor"
ROUNDING_CEIL = "ceil"
ROUNDING_TOWARD_ZERO = "toward_zero"
ROUNDING_AWAY_FROM_ZERO = "away_from_zero"


def _round_contracts(value: float, mode: str) -> int:
    """
    Deterministic rounding. No banker's rounding ambiguity:
    - nearest: halves go away from zero (0.5 -> 1, -0.5 -> -1)
    """
    if not math.isfinite(value):
        return 0

    if mode == ROUNDING_FLOOR:
        return int(math.floor(value))
    if mode == ROUNDING_CEIL:
        return int(math.ceil(value))
    if mode == ROUNDING_TOWARD_ZERO:
        return int(math.trunc(value))
    if mode == ROUNDING_AWAY_FROM_ZERO:
        return int(math.copysign(math.ceil(abs(value)), value))

    # nearest (ties away from zero)
    a = abs(value)
    base = math.floor(a)
    frac = a - base
    if frac > 0.5:
        out = base + 1
    elif frac < 0.5:
        out = base
    else:
        out = base + 1  # tie -> away from zero
    return int(math.copysign(out, value))


# -----------------------------
# Rejection reason codes
# -----------------------------
REASON_BAD_INPUT = "bad_input"
REASON_MISSING_EXPOSURE = "missing_exposure"
REASON_MISSING_INSTRUMENT_SPEC = "missing_instrument_spec"
REASON_MISSING_MARKET_INPUT = "missing_market_input"
REASON_UNSUPPORTED_SIZING = "unsupported_sizing"
REASON_CONSTRAINTS_BLOCKED = "constraints_blocked"
REASON_ZERO_SENSITIVITY = "zero_sensitivity"
REASON_MISSING_MARGIN_MODEL = "missing_margin_model"


# -----------------------------
# Minimal instrument spec model
# -----------------------------
@dataclass(frozen=True, slots=True)
class InstrumentSpec:
    instrument_id: str
    asset_class: str  # futures | options | etf | perp | ...
    contract_multiplier: float
    constraints: dict[str, Any]


def _build_trace_seed(*, policy: Mapping[str, Any], input_obj: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
        "policy": dict(policy),
        "input_fingerprint": _stable_hash(input_obj),
    }


def size_hedges(payload: Mapping[str, Any], *, policy: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """
    Hedge Sizing Engine

    Purpose:
      Convert mapped hedge instruments into concrete sizes (contracts/lots), using
      deterministic contract math and explicit market/sensitivity inputs.

    Expected input (minimum viable):
      {
        "exposures": {
          "delta_usd": -125000.0,
          "gamma_usd": 0.0,
          "vega_usd":  24000.0,
          "theta_usd": -900.0
        },
        "mapped_instruments": [
          {
            "strategy_id": "index_futures",
            "instrument_id": "MNQ_FUT",
            "symbol": "MNQ",
            "asset_class": "futures",
            "liquidity_score": 5,
            "cost_model": "spread_plus_margin",
            "constraints": {"min_contract": 1, "max_contract": 200}
          },
          ...
        ],
        "instrument_specs": {
          "MNQ_FUT": {
            "asset_class":"futures",
            "contract_multiplier": 2.0,
            "constraints":{
              "min_contract":1,"max_contract":200,
              "initial_margin_per_contract": 1800.0
            }
          },
          "SPY_OPT": {
            "asset_class":"options",
            "contract_multiplier": 100.0,
            "constraints":{
              "min_contract":1,"max_contract":500,
              "margin_pct_notional": 0.10
            }
          }
        },
        "market": {
          "prices": {
            "MNQ_FUT": 17500.25,
            "SPY_OPT_UNDERLYING": 510.12
          },
          "option_deltas": {
            "SPY_OPT": -0.30
          },
          "sensitivities": {
            "VIX_FUT": {"vega_usd_per_contract": 1200.0}
          }
        }
      }

    Output:
      {
        "sized_hedges": [
          {
            "strategy_id": "...",
            "instrument_id": "...",
            "contracts": 12,
            "notional_usd": 420006.0,
            "estimated_margin_usd": 21600.0,
            "margin_model_used": {"type":"per_contract","field":"initial_margin_per_contract","value":1800.0},
            "sizing_method_toggle": "delta_neutral",
            "constraints_applied": {...},
            "inputs_used": {...}
          }
        ],
        "rejected": [{"strategy_id":"...","instrument_id":"...","reason":"...","details":{...}}],
        "meta": {"decision_trace": {...}, "duration_ms": ..., "total_estimated_margin_usd": ...}
      }

    Notes:
      - No pricing feeds. All market inputs must be passed in `payload["market"]`.
      - Deterministic, audit-safe. No randomness, no I/O.
      - Margin is computed via static constraint parameters ONLY (no broker feeds).
    """
    t0 = time.perf_counter()

    pol: dict[str, Any] = {
        # which exposures to target for sizing by default
        "primary_objective": "delta_neutral",  # delta_neutral | vega_target
        # rounding for contract counts
        "rounding_mode": ROUNDING_NEAREST,
        # global caps (additional to per-instrument constraints)
        "global_min_contract": 0,  # allow 0 sizing outcome (but min constraints may bump)
        "global_max_contract": 500,
        # if computed size is 0 but exposure is material, bump to min_contract if allowed
        "min_bump_if_exposure_abs_usd_gte": 2500.0,
        # treat these strategies as delta-driven sizing unless sensitivities are provided
        "delta_driven_strategies": (
            "index_futures",
            "index_options_puts",
            "rates_futures",
            "gold_futures",
            "crypto_perp_hedge",
        ),
        # vega-driven strategies require explicit vega_usd_per_contract
        "vega_driven_strategies": ("volatility_futures",),
        # safety: treat sensitivity as effectively zero if abs(x) < epsilon
        "sensitivity_zero_epsilon": 1e-12,
        # margin: if contracts != 0 and no margin model found -> reject
        "require_margin_model_when_sized": True,
    }
    if policy:
        for k, v in policy.items():
            if k in pol:
                pol[k] = v

    # --- Inputs ---
    exposures = payload.get("exposures", {}) or {}
    mapped_instruments = payload.get("mapped_instruments", []) or []
    instrument_specs_in = payload.get("instrument_specs", {}) or {}
    market = payload.get("market", {}) or {}

    # normalize types
    if not isinstance(exposures, dict):
        exposures = {}
    if not isinstance(mapped_instruments, list):
        mapped_instruments = []
    if not isinstance(instrument_specs_in, dict):
        instrument_specs_in = {}
    if not isinstance(market, dict):
        market = {}

    prices = market.get("prices", {}) or {}
    option_deltas = market.get("option_deltas", {}) or {}
    sensitivities = market.get("sensitivities", {}) or {}

    if not isinstance(prices, dict):
        prices = {}
    if not isinstance(option_deltas, dict):
        option_deltas = {}
    if not isinstance(sensitivities, dict):
        sensitivities = {}

    # exposures
    delta_usd = _as_float(exposures.get("delta_usd", 0.0), 0.0)
    vega_usd = _as_float(exposures.get("vega_usd", 0.0), 0.0)

    input_obj = {
        "exposures": {"delta_usd": delta_usd, "vega_usd": vega_usd},
        "mapped_instruments": mapped_instruments,
        # include full spec fingerprint to ensure margin param changes are trace-visible
        "instrument_specs_fingerprint": _stable_hash(instrument_specs_in),
        "market_keys": {
            "prices": sorted(list(prices.keys())),
            "option_deltas": sorted(list(option_deltas.keys())),
            "sensitivities": sorted(list(sensitivities.keys())),
        },
    }

    trace: dict[str, Any] = _build_trace_seed(policy=pol, input_obj=input_obj)
    trace_steps: list[dict[str, Any]] = []

    sized: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    total_estimated_margin_usd = 0.0

    # basic exposure existence
    if pol["primary_objective"] == "delta_neutral" and not math.isfinite(delta_usd):
        return {
            "sized_hedges": [],
            "rejected": [
                {
                    "strategy_id": None,
                    "instrument_id": None,
                    "reason": REASON_MISSING_EXPOSURE,
                    "details": {"field": "delta_usd"},
                }
            ],
            "meta": {"decision_trace": trace, "duration_ms": int((time.perf_counter() - t0) * 1000), "total_estimated_margin_usd": 0.0},
        }
    if pol["primary_objective"] == "vega_target" and not math.isfinite(vega_usd):
        return {
            "sized_hedges": [],
            "rejected": [
                {
                    "strategy_id": None,
                    "instrument_id": None,
                    "reason": REASON_MISSING_EXPOSURE,
                    "details": {"field": "vega_usd"},
                }
            ],
            "meta": {"decision_trace": trace, "duration_ms": int((time.perf_counter() - t0) * 1000), "total_estimated_margin_usd": 0.0},
        }

    eps = _as_float(pol.get("sensitivity_zero_epsilon", 1e-12), 1e-12)
    require_margin_model = bool(pol.get("require_margin_model_when_sized", True))

    # helper: build InstrumentSpec from input dict
    def _get_spec(instrument_id: str) -> InstrumentSpec | None:
        spec = instrument_specs_in.get(instrument_id)
        if not isinstance(spec, dict):
            return None
        asset_class = str(spec.get("asset_class", "")).strip()
        mult = _as_float(spec.get("contract_multiplier", 0.0), 0.0)
        constraints = spec.get("constraints", {}) or {}
        if not isinstance(constraints, dict):
            constraints = {}
        if not asset_class or mult <= 0.0:
            return None
        return InstrumentSpec(
            instrument_id=instrument_id,
            asset_class=asset_class,
            contract_multiplier=mult,
            constraints=dict(constraints),
        )

    def _merge_constraints(mapped_row: Mapping[str, Any], spec: InstrumentSpec) -> dict[str, Any]:
        """
        Deterministic constraint merge:
          - Start from spec.constraints
          - Overlay mapped_row["constraints"] (more specific)
          - Do NOT invent fields
        """
        out = dict(spec.constraints or {})
        row_c = mapped_row.get("constraints", {}) or {}
        if isinstance(row_c, dict):
            for k, v in row_c.items():
                out[k] = v
        return out

    def _apply_caps(n: int, constraints: Mapping[str, Any]) -> tuple[int, dict[str, Any]]:
        gmin = _as_int(pol["global_min_contract"], 0)
        gmax = _as_int(pol["global_max_contract"], 500)
        gmax = _clamp_int(gmax, 1, 100000)

        min_c = _as_int(constraints.get("min_contract", gmin), gmin)
        max_c = _as_int(constraints.get("max_contract", gmax), gmax)

        # enforce sane ordering deterministically
        if max_c < min_c:
            max_c = min_c

        before = n
        n = _clamp_int(n, min_c, max_c)
        n = _clamp_int(n, gmin, gmax)

        applied = {
            "global_min_contract": gmin,
            "global_max_contract": gmax,
            "min_contract": min_c,
            "max_contract": max_c,
            "before": before,
            "after": n,
        }
        return n, applied

    # sizing primitives
    def _delta_usd_per_contract_for_futures(price: float, multiplier: float) -> float:
        # 1 contract delta ~= price * multiplier (USD per 1x move in underlying unit)
        return float(price) * float(multiplier)

    def _delta_usd_per_contract_for_options(underlying_price: float, multiplier: float, option_delta: float) -> float:
        # delta-dollar per contract = option_delta * underlying_price * multiplier
        return float(option_delta) * float(underlying_price) * float(multiplier)

    def _vega_usd_per_contract_from_market(instrument_id: str) -> float | None:
        s = sensitivities.get(instrument_id)
        if not isinstance(s, dict):
            return None
        v = s.get("vega_usd_per_contract")
        if _is_finite_number(v) and abs(float(v)) >= eps:
            return float(v)
        return None

    # margin model resolution (deterministic precedence)
    def _resolve_margin_model(constraints: Mapping[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
        """
        Returns (margin_model_used, error_reason_detail).

        Supported models (deterministic precedence):
          1) initial_margin_per_contract (preferred)
          2) maintenance_margin_per_contract
          3) margin_per_contract
          4) margin_pct_notional  (requires notional_usd > 0)

        All values must be finite and >= 0.
        """
        # per-contract fields
        for field in ("initial_margin_per_contract", "maintenance_margin_per_contract", "margin_per_contract"):
            v = constraints.get(field)
            if _is_finite_number(v) and float(v) >= 0.0:
                return ({"type": "per_contract", "field": field, "value": float(v)}, None)

        # % notional field
        pct = constraints.get("margin_pct_notional")
        if _is_finite_number(pct) and float(pct) >= 0.0:
            return ({"type": "pct_notional", "field": "margin_pct_notional", "value": float(pct)}, None)

        return (None, "no_supported_margin_fields_present")

    def _estimate_margin_usd(*, contracts: int, notional_usd: float, margin_model: dict[str, Any]) -> float:
        c = abs(int(contracts))
        if c == 0:
            return 0.0
        mtype = str(margin_model.get("type", "")).strip()
        val = _as_float(margin_model.get("value", 0.0), 0.0)

        if mtype == "per_contract":
            return float(c) * float(val)

        if mtype == "pct_notional":
            # uses deterministic proxy notional; no external feeds.
            if not math.isfinite(notional_usd) or float(notional_usd) <= 0.0:
                return float("nan")
            return float(notional_usd) * float(val)

        return float("nan")

    # main loop
    for i, row in enumerate(mapped_instruments):
        if not isinstance(row, dict):
            rejected.append({"strategy_id": None, "instrument_id": None, "reason": REASON_BAD_INPUT, "details": {"non_dict_row": True}})
            trace_steps.append({"i": i, "status": "rejected", "reason": REASON_BAD_INPUT, "details": {"non_dict_row": True}})
            continue

        strategy_id = str(row.get("strategy_id", "")).strip()
        instrument_id = str(row.get("instrument_id", "")).strip()
        asset_class_row = str(row.get("asset_class", "")).strip()

        step: dict[str, Any] = {
            "i": i,
            "strategy_id": strategy_id,
            "instrument_id": instrument_id,
            "status": None,
            "inputs": {"asset_class": asset_class_row},
        }

        if not instrument_id:
            rejected.append({"strategy_id": strategy_id or None, "instrument_id": None, "reason": REASON_BAD_INPUT, "details": {"missing_instrument_id": True}})
            step["status"] = "rejected"
            step["reason"] = REASON_BAD_INPUT
            step["details"] = {"missing_instrument_id": True}
            trace_steps.append(step)
            continue

        spec = _get_spec(instrument_id)
        if spec is None:
            rejected.append({"strategy_id": strategy_id or None, "instrument_id": instrument_id, "reason": REASON_MISSING_INSTRUMENT_SPEC, "details": {}})
            step["status"] = "rejected"
            step["reason"] = REASON_MISSING_INSTRUMENT_SPEC
            trace_steps.append(step)
            continue

        constraints = _merge_constraints(row, spec)

        # Decide sizing method deterministically based on strategy id and available sensitivity inputs.
        delta_driven = strategy_id in tuple(pol["delta_driven_strategies"])
        vega_driven = strategy_id in tuple(pol["vega_driven_strategies"])

        sizing_method: str
        contracts_float: float | None = None
        sensitivity_used: float | None = None
        inputs_used: dict[str, Any] = {"contract_multiplier": spec.contract_multiplier, "asset_class": spec.asset_class}

        if vega_driven:
            sizing_method = "vega_target"
            vega_per_contract = _vega_usd_per_contract_from_market(instrument_id)
            if vega_per_contract is None:
                rejected.append(
                    {
                        "strategy_id": strategy_id or None,
                        "instrument_id": instrument_id,
                        "reason": REASON_MISSING_MARKET_INPUT,
                        "details": {"required": "market.sensitivities[instrument_id].vega_usd_per_contract (abs >= epsilon)"},
                    }
                )
                step["status"] = "rejected"
                step["reason"] = REASON_MISSING_MARKET_INPUT
                step["details"] = {"required": "vega_usd_per_contract"}
                trace_steps.append(step)
                continue

            sensitivity_used = float(vega_per_contract)
            inputs_used["vega_usd_per_contract"] = float(vega_per_contract)

            if abs(float(vega_per_contract)) < eps:
                rejected.append({"strategy_id": strategy_id or None, "instrument_id": instrument_id, "reason": REASON_ZERO_SENSITIVITY, "details": {"vega_usd_per_contract": float(vega_per_contract), "epsilon": eps}})
                step["status"] = "rejected"
                step["reason"] = REASON_ZERO_SENSITIVITY
                trace_steps.append(step)
                continue

            # target vega is to offset exposure (negative exposure -> long vega instruments, etc.)
            contracts_float = (-float(vega_usd)) / float(vega_per_contract)

        elif delta_driven:
            sizing_method = "delta_neutral"

            # Futures/perp: need direct price per instrument_id
            if spec.asset_class in ("futures", "perp"):
                px = prices.get(instrument_id)
                if not _is_finite_number(px) or float(px) <= 0.0:
                    rejected.append(
                        {
                            "strategy_id": strategy_id or None,
                            "instrument_id": instrument_id,
                            "reason": REASON_MISSING_MARKET_INPUT,
                            "details": {"required": f"market.prices['{instrument_id}'] > 0"},
                        }
                    )
                    step["status"] = "rejected"
                    step["reason"] = REASON_MISSING_MARKET_INPUT
                    step["details"] = {"required": f"prices[{instrument_id}]"}
                    trace_steps.append(step)
                    continue

                px = float(px)
                per_contract = _delta_usd_per_contract_for_futures(px, spec.contract_multiplier)
                sensitivity_used = per_contract
                inputs_used["price"] = px
                inputs_used["delta_usd_per_contract"] = per_contract

                if abs(float(per_contract)) < eps:
                    rejected.append({"strategy_id": strategy_id or None, "instrument_id": instrument_id, "reason": REASON_ZERO_SENSITIVITY, "details": {"delta_usd_per_contract": float(per_contract), "epsilon": eps}})
                    step["status"] = "rejected"
                    step["reason"] = REASON_ZERO_SENSITIVITY
                    trace_steps.append(step)
                    continue

                contracts_float = (-float(delta_usd)) / float(per_contract)

            # Options: require underlying price + option delta
            elif spec.asset_class == "options":
                # Convention: underlying price key can be passed explicitly as "<INSTRUMENT_ID>_UNDERLYING"
                underlying_key = f"{instrument_id}_UNDERLYING"
                und_px = prices.get(underlying_key)
                opt_delta = option_deltas.get(instrument_id)

                if not _is_finite_number(und_px) or float(und_px) <= 0.0:
                    rejected.append(
                        {
                            "strategy_id": strategy_id or None,
                            "instrument_id": instrument_id,
                            "reason": REASON_MISSING_MARKET_INPUT,
                            "details": {"required": f"market.prices['{underlying_key}'] > 0"},
                        }
                    )
                    step["status"] = "rejected"
                    step["reason"] = REASON_MISSING_MARKET_INPUT
                    step["details"] = {"required": f"prices[{underlying_key}]"}
                    trace_steps.append(step)
                    continue

                if not _is_finite_number(opt_delta) or abs(float(opt_delta)) < eps:
                    rejected.append(
                        {
                            "strategy_id": strategy_id or None,
                            "instrument_id": instrument_id,
                            "reason": REASON_MISSING_MARKET_INPUT,
                            "details": {"required": f"market.option_deltas['{instrument_id}'] (abs >= epsilon)"},
                        }
                    )
                    step["status"] = "rejected"
                    step["reason"] = REASON_MISSING_MARKET_INPUT
                    step["details"] = {"required": f"option_deltas[{instrument_id}]"}
                    trace_steps.append(step)
                    continue

                und_px = float(und_px)
                opt_delta = float(opt_delta)
                per_contract = _delta_usd_per_contract_for_options(und_px, spec.contract_multiplier, opt_delta)
                sensitivity_used = per_contract
                inputs_used["underlying_price"] = und_px
                inputs_used["option_delta"] = opt_delta
                inputs_used["delta_usd_per_contract"] = per_contract

                if abs(float(per_contract)) < eps:
                    rejected.append({"strategy_id": strategy_id or None, "instrument_id": instrument_id, "reason": REASON_ZERO_SENSITIVITY, "details": {"delta_usd_per_contract": float(per_contract), "epsilon": eps}})
                    step["status"] = "rejected"
                    step["reason"] = REASON_ZERO_SENSITIVITY
                    trace_steps.append(step)
                    continue

                contracts_float = (-float(delta_usd)) / float(per_contract)

            else:
                rejected.append(
                    {
                        "strategy_id": strategy_id or None,
                        "instrument_id": instrument_id,
                        "reason": REASON_UNSUPPORTED_SIZING,
                        "details": {"asset_class": spec.asset_class},
                    }
                )
                step["status"] = "rejected"
                step["reason"] = REASON_UNSUPPORTED_SIZING
                step["details"] = {"asset_class": spec.asset_class}
                trace_steps.append(step)
                continue

        else:
            # If strategy is neither delta-driven nor vega-driven, require explicit sensitivities
            rejected.append(
                {
                    "strategy_id": strategy_id or None,
                    "instrument_id": instrument_id,
                    "reason": REASON_UNSUPPORTED_SIZING,
                    "details": {"strategy_id": strategy_id, "note": "strategy not configured for delta or vega sizing"},
                }
            )
            step["status"] = "rejected"
            step["reason"] = REASON_UNSUPPORTED_SIZING
            trace_steps.append(step)
            continue

        # At this point we have contracts_float
        if contracts_float is None or not math.isfinite(float(contracts_float)):
            rejected.append({"strategy_id": strategy_id or None, "instrument_id": instrument_id, "reason": REASON_BAD_INPUT, "details": {"contracts_float_invalid": True}})
            step["status"] = "rejected"
            step["reason"] = REASON_BAD_INPUT
            step["details"] = {"contracts_float_invalid": True}
            trace_steps.append(step)
            continue

        rounding_mode = str(pol["rounding_mode"]).strip() or ROUNDING_NEAREST
        contracts_raw = float(contracts_float)
        contracts_int = _round_contracts(contracts_raw, rounding_mode)

        # Optional bump: if exposure is material but rounding yields 0, attempt min_contract
        bump_threshold = _as_float(pol["min_bump_if_exposure_abs_usd_gte"], 2500.0)
        exposure_mag = abs(float(vega_usd)) if sizing_method == "vega_target" else abs(float(delta_usd))
        if contracts_int == 0 and exposure_mag >= bump_threshold:
            min_contract = _as_int(constraints.get("min_contract", 0), 0)
            if min_contract > 0:
                contracts_int = int(math.copysign(min_contract, contracts_raw if contracts_raw != 0 else (-1.0 if delta_usd > 0 else 1.0)))
                inputs_used["min_bump_applied"] = True
                inputs_used["min_bump_threshold_usd"] = bump_threshold

        # Apply constraints + global caps
        contracts_capped, applied = _apply_caps(contracts_int, constraints)

        # If constraints force a zero when sizing method indicates material hedge, reject deterministically
        if contracts_capped == 0 and exposure_mag >= bump_threshold and _as_int(constraints.get("min_contract", 0), 0) > 0:
            rejected.append(
                {
                    "strategy_id": strategy_id or None,
                    "instrument_id": instrument_id,
                    "reason": REASON_CONSTRAINTS_BLOCKED,
                    "details": {"requested_contracts": contracts_int, "applied": applied},
                }
            )
            step["status"] = "rejected"
            step["reason"] = REASON_CONSTRAINTS_BLOCKED
            step["details"] = {"requested_contracts": contracts_int, "applied": applied}
            trace_steps.append(step)
            continue

        # Notional estimation (deterministic):
        # - For futures/perp: abs(contracts) * price * multiplier
        # - For options: abs(contracts) * underlying_price * multiplier (proxy notional)
        notional_usd = 0.0
        if spec.asset_class in ("futures", "perp") and "price" in inputs_used:
            notional_usd = abs(float(contracts_capped)) * float(inputs_used["price"]) * float(spec.contract_multiplier)
        elif spec.asset_class == "options" and "underlying_price" in inputs_used:
            notional_usd = abs(float(contracts_capped)) * float(inputs_used["underlying_price"]) * float(spec.contract_multiplier)

        # Margin utilization estimate (deterministic; no external feeds)
        margin_model_used, margin_model_err = _resolve_margin_model(constraints)
        estimated_margin_usd = 0.0
        if int(contracts_capped) != 0:
            if margin_model_used is None:
                if require_margin_model:
                    rejected.append(
                        {
                            "strategy_id": strategy_id or None,
                            "instrument_id": instrument_id,
                            "reason": REASON_MISSING_MARGIN_MODEL,
                            "details": {
                                "note": "contracts non-zero but no supported margin model found in constraints",
                                "supported": [
                                    "initial_margin_per_contract",
                                    "maintenance_margin_per_contract",
                                    "margin_per_contract",
                                    "margin_pct_notional",
                                ],
                                "error": margin_model_err,
                            },
                        }
                    )
                    step["status"] = "rejected"
                    step["reason"] = REASON_MISSING_MARGIN_MODEL
                    step["details"] = {"error": margin_model_err}
                    trace_steps.append(step)
                    continue
            else:
                estimated_margin_usd = _estimate_margin_usd(
                    contracts=int(contracts_capped),
                    notional_usd=float(notional_usd),
                    margin_model=margin_model_used,
                )
                if not math.isfinite(float(estimated_margin_usd)) or float(estimated_margin_usd) < 0.0:
                    # deterministically reject margin models that cannot be evaluated safely (e.g., pct model but no notional)
                    rejected.append(
                        {
                            "strategy_id": strategy_id or None,
                            "instrument_id": instrument_id,
                            "reason": REASON_MISSING_MARGIN_MODEL,
                            "details": {
                                "note": "margin model present but could not be evaluated deterministically",
                                "margin_model_used": margin_model_used,
                                "notional_usd": float(notional_usd),
                            },
                        }
                    )
                    step["status"] = "rejected"
                    step["reason"] = REASON_MISSING_MARGIN_MODEL
                    step["details"] = {"margin_model_used": margin_model_used, "notional_usd": float(notional_usd)}
                    trace_steps.append(step)
                    continue

        total_estimated_margin_usd += float(estimated_margin_usd)

        out_row = {
            "strategy_id": strategy_id,
            "instrument_id": instrument_id,
            "contracts": int(contracts_capped),
            "notional_usd": float(notional_usd),
            "estimated_margin_usd": float(estimated_margin_usd),
            "margin_model_used": margin_model_used,
            "sizing_method": sizing_method,
            "constraints_applied": applied,
            "inputs_used": inputs_used,
        }
        sized.append(out_row)

        step["status"] = "sized"
        step["sizing_method"] = sizing_method
        step["contracts"] = {
            "raw_float": contracts_raw,
            "rounded": contracts_int,
            "capped": contracts_capped,
            "rounding_mode": rounding_mode,
        }
        step["constraints_applied"] = applied
        step["inputs_used"] = inputs_used
        step["sensitivity_used"] = sensitivity_used
        step["notional_usd"] = float(notional_usd)
        step["estimated_margin_usd"] = float(estimated_margin_usd)
        step["margin_model_used"] = margin_model_used
        trace_steps.append(step)

    duration_ms = int((time.perf_counter() - t0) * 1000)

    trace["steps"] = trace_steps
    trace["output_fingerprint"] = _stable_hash({"sized_hedges": sized, "rejected": rejected, "total_estimated_margin_usd": float(total_estimated_margin_usd)})
    trace["trace_fingerprint"] = _stable_hash(trace)
    trace["timestamps"] = {"generated_at_ms": _now_ms(), "duration_ms": duration_ms}

    return {
        "sized_hedges": sized,
        "rejected": rejected,
        "meta": {
            "decision_trace": trace,
            "duration_ms": duration_ms,
            "total_estimated_margin_usd": float(total_estimated_margin_usd),
        },
    }


__all__ = [
    "ENGINE_NAME",
    "ENGINE_VERSION",
    "ROUNDING_NEAREST",
    "ROUNDING_FLOOR",
    "ROUNDING_CEIL",
    "ROUNDING_TOWARD_ZERO",
    "ROUNDING_AWAY_FROM_ZERO",
    "size_hedges",
]
