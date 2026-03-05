# backend/app/engine/cost_engine.py
from __future__ import annotations

import hashlib
import json
import math
import time
from collections.abc import Mapping
from typing import Any

ENGINE_NAME = "cost_engine"
ENGINE_VERSION = "1.0.0"

# Explicit audit methodology declaration:
# This engine models costs as a conservative "gross outflow" estimate.
# It does NOT net premium/funding credits for short legs unless a future module
# explicitly adds netting rules with audited sign conventions.
COST_METHODOLOGY = "gross_outflow_conservative"


# -----------------------------
# Stable primitives (audit-safe)
# -----------------------------
def _canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


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
        if math.isfinite(v):
            return v
        return default
    except Exception:
        return default


def _as_int(x: Any, default: int = 0) -> int:
    try:
        return int(x)
    except Exception:
        return default


def _clamp_float(v: float, lo: float, hi: float) -> float:
    if v < lo:
        return lo
    if v > hi:
        return hi
    return v


# -----------------------------
# Cost model reason codes
# -----------------------------
REASON_BAD_INPUT = "bad_input"
REASON_MISSING_MARKET_INPUT = "missing_market_input"
REASON_UNSUPPORTED_COST_MODEL = "unsupported_cost_model"
REASON_INVALID_CONTRACTS = "invalid_contracts"


def _build_trace_seed(*, policy: Mapping[str, Any], input_obj: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
        "methodology": {"cost_methodology": COST_METHODOLOGY},
        "policy": dict(policy),
        "input_fingerprint": _stable_hash(input_obj),
    }


def _pick_price_key(instrument_id: str, asset_class: str, market_prices: Mapping[str, Any]) -> tuple[str | None, float | None]:
    """
    Deterministic pricing key selection:
      - futures/perp: price by instrument_id
      - options: use underlying proxy by "<instrument_id>_UNDERLYING"
      - other: price by instrument_id
    """
    if asset_class == "options":
        k = f"{instrument_id}_UNDERLYING"
        px = market_prices.get(k)
        if _is_finite_number(px) and float(px) > 0.0:
            return k, float(px)
        return None, None

    px = market_prices.get(instrument_id)
    if _is_finite_number(px) and float(px) > 0.0:
        return instrument_id, float(px)
    return None, None


def compute_costs(payload: Mapping[str, Any], *, policy: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """
    Cost & Carry Engine

    Purpose:
      Quantify the real-world cost of a hedge portfolio (transaction + carry),
      using deterministic, explicitly provided assumptions. No live feeds.

    Expected minimum input:
      {
        "sized_hedges": [
          {
            "strategy_id": "...",
            "instrument_id": "...",
            "contracts": 12,
            "notional_usd": 420006.0,
            "sizing_method": "delta_neutral",
            "constraints_applied": {...},
            "inputs_used": {...}
          }
        ],
        "instrument_meta": {
          "MNQ_FUT": {"asset_class":"futures", "cost_model":"spread_plus_margin", "contract_multiplier":2.0},
          "SPY_OPT": {"asset_class":"options", "cost_model":"spread_plus_premium", "contract_multiplier":100.0}
        },
        "market": {
          "prices": {
            "MNQ_FUT": 17500.25,
            "SPY_OPT_UNDERLYING": 510.12
          }
        },
        "assumptions": {
          "spreads_bps": {"MNQ_FUT": 0.4, "SPY_OPT": 2.0},
          "fees_per_contract": {"MNQ_FUT": 2.2, "SPY_OPT": 0.65},
          "margin_rate": {"MNQ_FUT": 0.05, "VIX_FUT": 0.10},
          "funding_rate_annual": {"BTC_PERP": 0.12},
          "option_premium_per_contract": {"SPY_OPT": 180.0},
          "holding_period_days": 21
        }
      }

    Output:
      {
        "costs": {
          "one_time": {"spread": 123.0, "fees": 45.0, "premium": 900.0, "total": 1068.0},
          "carry": {"margin_posted_estimate_usd": 21000.0, "margin_financing": 88.0, "funding": 12.0, "total": 100.0},
          "total": 1168.0,
          "holding_period_days": 21,
          "cost_methodology": "gross_outflow_conservative"
        },
        "breakdown": [... per hedge row ...],
        "rejected": [...],
        "meta": {"decision_trace": {...}, "duration_ms": ...}
      }

    Notes:
      - This engine is conservative and deterministic. If a cost component is required
        for a cost_model but missing, it rejects that instrument row with explicit reason.
      - Notional inputs are taken from sizer output; if missing, recomputed from price*multiplier*contracts.
      - Cost methodology is explicitly declared as gross outflow and is included in outputs and trace.
    """
    t0 = time.perf_counter()

    pol: dict[str, Any] = {
        # default holding period for carry normalization
        "default_holding_period_days": 21,
        # annual financing rate for posting margin (cash opportunity cost), if not specified per instrument
        "default_margin_financing_annual": 0.05,
        # allow missing spreads/fees by substituting 0? (False keeps institutional strictness)
        "allow_missing_spread_bps": False,
        "allow_missing_fees": False,
        # cap insane inputs deterministically (safety rail)
        "max_spread_bps": 2000.0,
        "max_fee_per_contract": 500.0,
        "max_margin_rate": 1.0,
        "max_funding_rate_annual": 5.0,
        # cost direction: assume a full round-trip? default is entry only (can be changed upstream)
        "assume_round_trip": False,
    }
    if policy:
        for k, v in policy.items():
            if k in pol:
                pol[k] = v

    sized_hedges = payload.get("sized_hedges", []) or []
    instrument_meta = payload.get("instrument_meta", {}) or {}
    market = payload.get("market", {}) or {}
    assumptions = payload.get("assumptions", {}) or {}

    if not isinstance(sized_hedges, list):
        sized_hedges = []
    if not isinstance(instrument_meta, dict):
        instrument_meta = {}
    if not isinstance(market, dict):
        market = {}
    if not isinstance(assumptions, dict):
        assumptions = {}

    prices = market.get("prices", {}) or {}
    if not isinstance(prices, dict):
        prices = {}

    spreads_bps = assumptions.get("spreads_bps", {}) or {}
    fees_per_contract = assumptions.get("fees_per_contract", {}) or {}
    margin_rate = assumptions.get("margin_rate", {}) or {}
    funding_rate_annual = assumptions.get("funding_rate_annual", {}) or {}
    option_premium_per_contract = assumptions.get("option_premium_per_contract", {}) or {}

    if not isinstance(spreads_bps, dict):
        spreads_bps = {}
    if not isinstance(fees_per_contract, dict):
        fees_per_contract = {}
    if not isinstance(margin_rate, dict):
        margin_rate = {}
    if not isinstance(funding_rate_annual, dict):
        funding_rate_annual = {}
    if not isinstance(option_premium_per_contract, dict):
        option_premium_per_contract = {}

    holding_period_days = _as_int(
        assumptions.get("holding_period_days", pol["default_holding_period_days"]),
        pol["default_holding_period_days"],
    )
    if holding_period_days <= 0:
        holding_period_days = int(pol["default_holding_period_days"])

    input_obj = {
        "sized_hedges": sized_hedges,
        "instrument_meta_keys": sorted(list(instrument_meta.keys())),
        "market_keys": {"prices": sorted(list(prices.keys()))},
        "assumption_keys": {
            "spreads_bps": sorted(list(spreads_bps.keys())),
            "fees_per_contract": sorted(list(fees_per_contract.keys())),
            "margin_rate": sorted(list(margin_rate.keys())),
            "funding_rate_annual": sorted(list(funding_rate_annual.keys())),
            "option_premium_per_contract": sorted(list(option_premium_per_contract.keys())),
            "holding_period_days": holding_period_days,
        },
    }

    trace: dict[str, Any] = _build_trace_seed(policy=pol, input_obj=input_obj)
    steps: list[dict[str, Any]] = []

    rejected: list[dict[str, Any]] = []
    breakdown: list[dict[str, Any]] = []

    one_time_spread = 0.0
    one_time_fees = 0.0
    one_time_premium = 0.0

    carry_margin_posted_estimate = 0.0
    carry_margin_financing = 0.0
    carry_funding = 0.0

    assume_round_trip = bool(pol["assume_round_trip"])
    trade_multiplier = 2.0 if assume_round_trip else 1.0

    for i, row in enumerate(sized_hedges):
        if not isinstance(row, dict):
            rejected.append({"strategy_id": None, "instrument_id": None, "reason": REASON_BAD_INPUT, "details": {"non_dict_row": True}})
            steps.append({"i": i, "status": "rejected", "reason": REASON_BAD_INPUT, "details": {"non_dict_row": True}})
            continue

        strategy_id = str(row.get("strategy_id", "")).strip()
        instrument_id = str(row.get("instrument_id", "")).strip()
        contracts = row.get("contracts", None)

        step: dict[str, Any] = {"i": i, "strategy_id": strategy_id, "instrument_id": instrument_id, "status": None}

        if not instrument_id:
            rejected.append({"strategy_id": strategy_id or None, "instrument_id": None, "reason": REASON_BAD_INPUT, "details": {"missing_instrument_id": True}})
            step["status"] = "rejected"
            step["reason"] = REASON_BAD_INPUT
            step["details"] = {"missing_instrument_id": True}
            steps.append(step)
            continue

        if contracts is None or not isinstance(contracts, int):
            rejected.append({"strategy_id": strategy_id or None, "instrument_id": instrument_id, "reason": REASON_INVALID_CONTRACTS, "details": {"contracts": contracts}})
            step["status"] = "rejected"
            step["reason"] = REASON_INVALID_CONTRACTS
            step["details"] = {"contracts": contracts}
            steps.append(step)
            continue

        abs_contracts = abs(int(contracts))
        if abs_contracts == 0:
            # zero position => zero cost, but still trace it deterministically
            breakdown.append(
                {
                    "strategy_id": strategy_id,
                    "instrument_id": instrument_id,
                    "contracts": int(contracts),
                    "cost_methodology": COST_METHODOLOGY,
                    "one_time": {"spread": 0.0, "fees": 0.0, "premium": 0.0, "total": 0.0},
                    "carry": {"margin_posted_estimate_usd": 0.0, "margin_financing": 0.0, "funding": 0.0, "total": 0.0},
                    "total": 0.0,
                    "inputs_used": {"note": "zero_contracts"},
                }
            )
            step["status"] = "ok_zero"
            steps.append(step)
            continue

        meta = instrument_meta.get(instrument_id)
        if not isinstance(meta, dict):
            rejected.append({"strategy_id": strategy_id or None, "instrument_id": instrument_id, "reason": REASON_BAD_INPUT, "details": {"missing_instrument_meta": True}})
            step["status"] = "rejected"
            step["reason"] = REASON_BAD_INPUT
            step["details"] = {"missing_instrument_meta": True}
            steps.append(step)
            continue

        asset_class = str(meta.get("asset_class", "")).strip()
        cost_model = str(meta.get("cost_model", "")).strip()
        multiplier = _as_float(meta.get("contract_multiplier", 0.0), 0.0)
        if not asset_class or not cost_model or multiplier <= 0.0:
            rejected.append(
                {
                    "strategy_id": strategy_id or None,
                    "instrument_id": instrument_id,
                    "reason": REASON_BAD_INPUT,
                    "details": {"asset_class": asset_class, "cost_model": cost_model, "contract_multiplier": multiplier},
                }
            )
            step["status"] = "rejected"
            step["reason"] = REASON_BAD_INPUT
            step["details"] = {"asset_class": asset_class, "cost_model": cost_model, "contract_multiplier": multiplier}
            steps.append(step)
            continue

        # Determine price input for spread/margin sizing
        price_key, px = _pick_price_key(instrument_id, asset_class, prices)
        if px is None:
            # Some cost models might not need price. In v1: all supported models require px for spread or margin computations.
            rejected.append(
                {
                    "strategy_id": strategy_id or None,
                    "instrument_id": instrument_id,
                    "reason": REASON_MISSING_MARKET_INPUT,
                    "details": {"required": f"market.prices[{instrument_id}] or underlying key", "asset_class": asset_class},
                }
            )
            step["status"] = "rejected"
            step["reason"] = REASON_MISSING_MARKET_INPUT
            step["details"] = {"required_price": True, "asset_class": asset_class}
            steps.append(step)
            continue

        # Notional: prefer sizer output, else recompute deterministically
        notional_usd = row.get("notional_usd")
        if _is_finite_number(notional_usd) and float(notional_usd) >= 0.0:
            notional = float(notional_usd)
            notional_source = "sizer_output"
        else:
            notional = float(abs_contracts) * float(px) * float(multiplier)
            notional_source = "recomputed_price_x_multiplier"

        # Fetch assumptions deterministically (per instrument, else defaults)
        spread_bps = spreads_bps.get(instrument_id)
        fee_pc = fees_per_contract.get(instrument_id)

        # clamp rails
        if _is_finite_number(spread_bps):
            spread_bps_f = _clamp_float(float(spread_bps), 0.0, float(pol["max_spread_bps"]))
        else:
            spread_bps_f = None

        if _is_finite_number(fee_pc):
            fee_pc_f = _clamp_float(float(fee_pc), 0.0, float(pol["max_fee_per_contract"]))
        else:
            fee_pc_f = None

        # Compute one-time costs based on cost model
        spread_cost = 0.0
        fees_cost = 0.0
        premium_cost = 0.0
        margin_posted = 0.0
        margin_financing = 0.0
        funding_cost = 0.0

        # Spread cost: notional * bps * trade_multiplier
        if cost_model in ("spread_plus_margin", "spread_plus_premium", "spread_only", "fee_plus_spread"):
            if spread_bps_f is None:
                if bool(pol["allow_missing_spread_bps"]):
                    spread_bps_f = 0.0
                else:
                    rejected.append({"strategy_id": strategy_id or None, "instrument_id": instrument_id, "reason": REASON_BAD_INPUT, "details": {"missing_spreads_bps": True}})
                    step["status"] = "rejected"
                    step["reason"] = REASON_BAD_INPUT
                    step["details"] = {"missing_spreads_bps": True}
                    steps.append(step)
                    continue
            spread_cost = float(notional) * (float(spread_bps_f) / 10000.0) * float(trade_multiplier)

        # Fees: abs_contracts * fee_per_contract * trade_multiplier
        if cost_model in ("spread_plus_margin", "spread_plus_premium", "fee_plus_spread", "spread_only"):
            if fee_pc_f is None:
                if bool(pol["allow_missing_fees"]):
                    fee_pc_f = 0.0
                else:
                    rejected.append({"strategy_id": strategy_id or None, "instrument_id": instrument_id, "reason": REASON_BAD_INPUT, "details": {"missing_fees_per_contract": True}})
                    step["status"] = "rejected"
                    step["reason"] = REASON_BAD_INPUT
                    step["details"] = {"missing_fees_per_contract": True}
                    steps.append(step)
                    continue
            fees_cost = float(abs_contracts) * float(fee_pc_f) * float(trade_multiplier)

        # Premium: options only (spread_plus_premium) requires explicit premium per contract (deterministic input)
        if cost_model == "spread_plus_premium":
            prem = option_premium_per_contract.get(instrument_id)
            if not _is_finite_number(prem) or float(prem) < 0.0:
                rejected.append(
                    {
                        "strategy_id": strategy_id or None,
                        "instrument_id": instrument_id,
                        "reason": REASON_MISSING_MARKET_INPUT,
                        "details": {"required": "assumptions.option_premium_per_contract[instrument_id] >= 0"},
                    }
                )
                step["status"] = "rejected"
                step["reason"] = REASON_MISSING_MARKET_INPUT
                step["details"] = {"required_premium": True}
                steps.append(step)
                continue
            premium_cost = float(abs_contracts) * float(prem)  # entry only; round-trip premium doesn't apply

        # Margin financing: futures/perp typically (spread_plus_margin)
        if cost_model == "spread_plus_margin" and asset_class in ("futures", "perp"):
            mr = margin_rate.get(instrument_id)
            if _is_finite_number(mr):
                mr_f = _clamp_float(float(mr), 0.0, float(pol["max_margin_rate"]))
            else:
                mr_f = 0.0  # default 0 margin rate if not specified (strictness is handled upstream via policies)
            margin_posted = float(notional) * float(mr_f)
            margin_fin_rate = _clamp_float(_as_float(pol["default_margin_financing_annual"], 0.05), 0.0, 5.0)
            # simple prorated opportunity cost over holding period
            margin_financing = float(margin_posted) * float(margin_fin_rate) * (float(holding_period_days) / 365.0)

        # Funding (perps): funding_rate_annual prorated on notional (gross outflow, clamped to >= 0)
        if asset_class == "perp":
            fr = funding_rate_annual.get(instrument_id)
            if _is_finite_number(fr):
                fr_f = _clamp_float(float(fr), 0.0, float(pol["max_funding_rate_annual"]))
            else:
                fr_f = 0.0
            funding_cost = float(notional) * float(fr_f) * (float(holding_period_days) / 365.0)

        # Validate supported models
        supported = {"spread_plus_margin", "spread_plus_premium", "spread_only", "fee_plus_spread"}
        if cost_model not in supported:
            rejected.append({"strategy_id": strategy_id or None, "instrument_id": instrument_id, "reason": REASON_UNSUPPORTED_COST_MODEL, "details": {"cost_model": cost_model}})
            step["status"] = "rejected"
            step["reason"] = REASON_UNSUPPORTED_COST_MODEL
            step["details"] = {"cost_model": cost_model}
            steps.append(step)
            continue

        one_time_total = float(spread_cost) + float(fees_cost) + float(premium_cost)
        carry_total = float(margin_financing) + float(funding_cost)
        total = one_time_total + carry_total

        one_time_spread += float(spread_cost)
        one_time_fees += float(fees_cost)
        one_time_premium += float(premium_cost)

        carry_margin_posted_estimate += float(margin_posted)
        carry_margin_financing += float(margin_financing)
        carry_funding += float(funding_cost)

        out = {
            "strategy_id": strategy_id,
            "instrument_id": instrument_id,
            "contracts": int(contracts),
            "cost_methodology": COST_METHODOLOGY,
            "notional_usd": float(notional),
            "notional_source": notional_source,
            "one_time": {
                "spread": float(spread_cost),
                "fees": float(fees_cost),
                "premium": float(premium_cost),
                "total": float(one_time_total),
            },
            "carry": {
                "margin_posted_estimate_usd": float(margin_posted),
                "margin_financing": float(margin_financing),
                "funding": float(funding_cost),
                "total": float(carry_total),
            },
            "total": float(total),
            "inputs_used": {
                "asset_class": asset_class,
                "cost_model": cost_model,
                "contract_multiplier": float(multiplier),
                "price_key": price_key,
                "price": float(px),
                "spread_bps": float(spread_bps_f) if spread_bps_f is not None else None,
                "fee_per_contract": float(fee_pc_f) if fee_pc_f is not None else None,
                "holding_period_days": int(holding_period_days),
                "assume_round_trip": assume_round_trip,
                "cost_methodology": COST_METHODOLOGY,
            },
        }
        breakdown.append(out)

        step["status"] = "ok"
        step["computed"] = {
            "notional_usd": float(notional),
            "one_time_total": float(one_time_total),
            "carry_total": float(carry_total),
            "total": float(total),
            "margin_posted_estimate_usd": float(margin_posted),
        }
        step["inputs_used"] = out["inputs_used"]
        steps.append(step)

    totals = {
        "one_time": {
            "spread": float(one_time_spread),
            "fees": float(one_time_fees),
            "premium": float(one_time_premium),
            "total": float(one_time_spread + one_time_fees + one_time_premium),
        },
        "carry": {
            "margin_posted_estimate_usd": float(carry_margin_posted_estimate),
            "margin_financing": float(carry_margin_financing),
            "funding": float(carry_funding),
            "total": float(carry_margin_financing + carry_funding),
        },
        "total": float(one_time_spread + one_time_fees + one_time_premium + carry_margin_financing + carry_funding),
        "holding_period_days": int(holding_period_days),
        "cost_methodology": COST_METHODOLOGY,
    }

    duration_ms = int((time.perf_counter() - t0) * 1000)

    trace["steps"] = steps
    trace["totals"] = totals
    trace["output_fingerprint"] = _stable_hash({"costs": totals, "breakdown": breakdown, "rejected": rejected})
    trace["trace_fingerprint"] = _stable_hash(trace)
    trace["timestamps"] = {"generated_at_ms": _now_ms(), "duration_ms": duration_ms}

    return {
        "costs": totals,
        "breakdown": breakdown,
        "rejected": rejected,
        "meta": {"decision_trace": trace, "duration_ms": duration_ms},
    }


__all__ = [
    "ENGINE_NAME",
    "ENGINE_VERSION",
    "COST_METHODOLOGY",
    "compute_costs",
]
