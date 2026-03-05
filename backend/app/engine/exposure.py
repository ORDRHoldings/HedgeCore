from __future__ import annotations

"""
app/engine/exposure.py

HedgeCalc Hedge Engine - Exposure Engine (v1.1.0)

ROLE (STRICT):
- Deterministic exposure decomposition ONLY
- NOT a pricing engine
- NOT a risk simulation engine

CONTRACT ALIGNMENT (v1):
- Consumes snapshot-bound inputs (RunEnvelope-like payloads)
- Emits trace-first, fail-closed stage output (input_hash/output_hash/decisions/disclosures/rejections/duration_ms)
- Does NOT mutate contracts

NOTE:
This module remains intentionally conservative: it computes first-order exposure proxies and
documents every approximation explicitly. Any policy-based gating is handled by later stages
(or by an upstream orchestrator) unless explicitly enabled here via policy flags.
"""

import hashlib
import json
import logging
import math
import time
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any, Literal

logger = logging.getLogger("hedgecalc.engine.exposure")


ENGINE_NAME = "exposure"
ENGINE_VERSION = "1.1.0"  # CONTRACT-ALIGNED: trace-first + deterministic hashing + rejection codes


# -----------------------------
# Exceptions
# -----------------------------
class ExposureError(Exception):
    pass


class ValidationError(ExposureError):
    pass


# -----------------------------
# Rejection codes (stable)
# -----------------------------
REJECT_INVALID_PAYLOAD = "REJECT_EXPOSURE_INVALID_PAYLOAD"
REJECT_EMPTY_POSITIONS = "REJECT_EXPOSURE_EMPTY_POSITIONS"
REJECT_ALL_POSITIONS_INVALID = "REJECT_EXPOSURE_ALL_POSITIONS_INVALID"


# -----------------------------
# Models (internal)
# -----------------------------
AssetType = Literal["equity", "option", "future", "crypto", "cash", "other"]
OptionType = Literal["call", "put"]


@dataclass(frozen=True)
class Position:
    type: AssetType
    symbol: str
    qty: float

    price: float | None = None

    # option fields
    underlying_price: float | None = None
    strike: float | None = None
    days_to_expiry: float | None = None
    implied_vol: float | None = None
    option_type: OptionType | None = None
    contract_multiplier: float = 100.0
    risk_free_rate: float = 0.02

    # optional caller-provided greeks
    delta: float | None = None
    gamma: float | None = None
    vega: float | None = None
    theta: float | None = None

    meta: dict[str, Any] | None = None


@dataclass(frozen=True)
class StageTrace:
    stage: str
    engine: dict[str, str]
    input_hash: str
    output_hash: str
    duration_ms: int
    decisions: list[dict[str, Any]]
    disclosures: list[str]
    rejections: list[dict[str, Any]]


# -----------------------------
# Canonical hashing (audit-safe)
# Prefer contract helpers if available; fall back to local canonical JSON hashing.
# -----------------------------
def _canonical_json(obj: Any) -> str:
    return json.dumps(
        obj,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def _stable_hash(obj: Any) -> str:
    return hashlib.sha256(_canonical_json(obj).encode("utf-8")).hexdigest()


def _is_finite(x: Any) -> bool:
    try:
        return isinstance(x, int | float) and math.isfinite(float(x))
    except Exception:
        return False


def _log_event(event: str, **fields: Any) -> None:
    try:
        logger.info(json.dumps({"event": event, **fields}, sort_keys=True))
    except Exception:
        # logging must never break determinism or execution
        pass


# -----------------------------
# Math helpers
# -----------------------------
_SQRT_2PI = math.sqrt(2.0 * math.pi)


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / _SQRT_2PI


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


# -----------------------------
# Black-Scholes Greeks (pure)
# -----------------------------
def _bs_d1_d2(S: float, K: float, T: float, r: float, sigma: float) -> tuple[float, float]:
    if S <= 0 or K <= 0 or T <= 0 or sigma <= 0:
        raise ValidationError("Invalid BS inputs (S,K,T,sigma must be > 0)")
    vsqrt = sigma * math.sqrt(T)
    d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / vsqrt
    d2 = d1 - vsqrt
    return d1, d2


def bs_greeks(
    *,
    S: float,
    K: float,
    T_years: float,
    r: float,
    sigma: float,
    option_type: OptionType,
) -> dict[str, float]:
    d1, d2 = _bs_d1_d2(S, K, T_years, r, sigma)

    Nd1 = _norm_cdf(d1)
    nd1 = _norm_pdf(d1)

    delta = Nd1 if option_type == "call" else Nd1 - 1.0
    gamma = nd1 / (S * sigma * math.sqrt(T_years))
    vega = S * nd1 * math.sqrt(T_years)

    disc = math.exp(-r * T_years)
    if option_type == "call":
        theta = -(S * nd1 * sigma) / (2 * math.sqrt(T_years)) - r * K * disc * _norm_cdf(d2)
    else:
        theta = -(S * nd1 * sigma) / (2 * math.sqrt(T_years)) + r * K * disc * _norm_cdf(-d2)

    return {"delta": delta, "gamma": gamma, "vega": vega, "theta": theta}


# -----------------------------
# Normalization
# -----------------------------
def normalize_position(raw: dict[str, Any]) -> Position:
    """
    Normalize a raw position dict to internal Position.

    Supported shapes (deterministic, permissive):
    - {type, symbol, qty, price, delta/gamma/vega/theta, meta, ...}
    - option fields may be nested under raw["option"] or in the top level.

    Fail-closed behavior:
    - Validation errors are raised; caller decides whether to reject the run or skip the position.
    """
    if not isinstance(raw, dict):
        raise ValidationError("Position must be dict")

    ptype = str(raw.get("type", "")).lower().strip()
    if ptype not in {"equity", "option", "future", "crypto", "cash", "other"}:
        raise ValidationError("Invalid position.type")

    symbol = str(raw.get("symbol", "")).strip()
    if not symbol:
        raise ValidationError("position.symbol required")

    qty = float(raw.get("qty"))
    if not math.isfinite(qty):
        raise ValidationError("position.qty must be finite")

    op = raw.get("option", raw)

    opt_type = op.get("option_type")
    if opt_type is not None:
        opt_type = str(opt_type).lower().strip()

    return Position(
        type=ptype,  # type: ignore
        symbol=symbol,
        qty=qty,
        price=raw.get("price"),
        underlying_price=op.get("underlying_price"),
        strike=op.get("strike"),
        days_to_expiry=op.get("days_to_expiry"),
        implied_vol=op.get("implied_vol"),
        option_type=opt_type if opt_type in {"call", "put"} else None,  # type: ignore
        contract_multiplier=float(op.get("contract_multiplier", 100.0)),
        risk_free_rate=float(op.get("risk_free_rate", 0.02)),
        delta=raw.get("delta"),
        gamma=raw.get("gamma"),
        vega=raw.get("vega"),
        theta=raw.get("theta"),
        meta=raw.get("meta"),
    )


# -----------------------------
# Payload extraction (RunEnvelope-friendly)
# -----------------------------
def _extract_positions(payload: Any) -> list[dict[str, Any]]:
    """
    Deterministically extract positions list from common RunEnvelope-like shapes.

    Accepted (in priority order):
    1) payload is a list -> positions
    2) payload["positions"] is list
    3) payload["portfolio"]["positions"] is list
    4) payload["exposure_input"]["positions"] is list

    Any other shape -> ValidationError (fail-closed).
    """
    if isinstance(payload, list):
        return payload

    if isinstance(payload, dict):
        if isinstance(payload.get("positions"), list):
            return payload["positions"]  # type: ignore[return-value]

        portfolio = payload.get("portfolio")
        if isinstance(portfolio, dict) and isinstance(portfolio.get("positions"), list):
            return portfolio["positions"]  # type: ignore[return-value]

        exposure_input = payload.get("exposure_input")
        if isinstance(exposure_input, dict) and isinstance(exposure_input.get("positions"), list):
            return exposure_input.get("positions") or []  # type: ignore[return-value]

    raise ValidationError("compute_exposure expects a payload containing a positions list")


def _extract_policy(payload: Any, explicit_policy: Mapping[str, Any] | None) -> Mapping[str, Any]:
    """
    Exposure does not enforce full PolicyBundle semantics, but may honor explicit flags.

    Priority:
    - explicit_policy (argument)
    - payload["policy_bundle"] if present and mapping
    - payload["policy"] if present and mapping
    - empty mapping
    """
    if explicit_policy is not None:
        return dict(explicit_policy)

    if isinstance(payload, dict):
        pb = payload.get("policy_bundle")
        if isinstance(pb, dict):
            return pb
        pol = payload.get("policy")
        if isinstance(pol, dict):
            return pol
    return {}


# -----------------------------
# Exposure computation (core)
# -----------------------------
def compute_portfolio_exposure(
    positions: Iterable[dict[str, Any]],
    *,
    request_id: str | None = None,
    user_id: str | None = None,
    policy: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Compute deterministic exposure proxies for a portfolio.

    Returns a dict with:
    - engine info
    - exposure fields (delta_usd, gamma_proxy, vega_usd, theta_usd)
    - stage_trace (trace-first doctrine)
    - meta (fingerprints, disclosures)

    Fail-closed behavior:
    - If positions is empty -> rejection
    - If all positions are invalid/unusable -> rejection
    - Individual invalid positions are recorded as decisions and skipped
    """
    t0 = time.time()
    rid = request_id or f"exp_{int(t0 * 1_000_000)}"
    pol = dict(policy or {})

    raw_positions = list(positions)
    if not raw_positions:
        duration_ms = int((time.time() - t0) * 1000)
        input_hash = _stable_hash({"positions": []})
        rejection = {"code": REJECT_EMPTY_POSITIONS, "reason": "positions list is empty"}
        stage = StageTrace(
            stage=ENGINE_NAME,
            engine={"name": ENGINE_NAME, "version": ENGINE_VERSION},
            input_hash=input_hash,
            output_hash=_stable_hash(
                {
                    "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
                    "rejections": [rejection],
                    "input_hash": input_hash,
                }
            ),
            duration_ms=duration_ms,
            decisions=[],
            disclosures=[
                "Deterministic first-order exposure proxies only",
                "gamma_proxy is NOT dollar gamma; indicative convexity proxy only",
                "BS fallback excludes dividends, skew, surface effects",
            ],
            rejections=[rejection],
        )
        out = {
            "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
            "delta_usd": 0.0,
            "gamma_proxy": 0.0,
            "vega_usd": 0.0,
            "theta_usd": 0.0,
            "stage_trace": stage.__dict__,
            "meta": {
                "request_id": rid,
                "user_id": user_id,
                "duration_ms": duration_ms,
            },
        }
        _log_event("exposure_rejected", request_id=rid, code=REJECT_EMPTY_POSITIONS, duration_ms=duration_ms)
        return out

    # Deterministic input hashing: hash only the declared inputs (positions + minimal policy flags).
    # We do NOT hash volatile/unused policy fields here; only exposure-relevant flags (explicit).
    exposure_policy_flags = {
        # If true, missing spot prices are treated as "invalid position" (skipped) rather than trace-only.
        "strict_spot_price_required": bool(pol.get("strict_spot_price_required", False)),
        # If true, an option missing required BS inputs is treated as invalid (skipped), same as now,
        # but keeps the decision reason explicit.
        "strict_option_inputs_required": bool(pol.get("strict_option_inputs_required", False)),
    }
    input_hash = _stable_hash({"positions": raw_positions, "policy_flags": exposure_policy_flags})

    delta_usd = 0.0
    gamma_proxy = 0.0
    vega_usd = 0.0
    theta_usd = 0.0

    decisions: list[dict[str, Any]] = []
    usable_count = 0

    for idx, raw in enumerate(raw_positions):
        try:
            p = normalize_position(raw)
        except ValidationError as e:
            decisions.append(
                {
                    "position_index": idx,
                    "symbol": str(raw.get("symbol", "")) if isinstance(raw, dict) else "",
                    "mode": "position_rejected_validation",
                    "reason": str(e),
                }
            )
            continue

        # 1) Caller-provided greeks (deterministic)
        if all(v is not None for v in (p.delta, p.gamma, p.vega, p.theta)):
            mult = p.contract_multiplier if p.type == "option" else 1.0
            px = p.underlying_price if p.type == "option" else p.price

            d = float(p.delta) * p.qty * mult
            g = float(p.gamma) * p.qty * mult
            v = float(p.vega) * p.qty * mult
            th = float(p.theta) * p.qty * mult

            if px is not None and _is_finite(px) and float(px) > 0:
                delta_usd += d * float(px)
                gamma_proxy += g * float(px)
                mode = "provided_greeks_scaled"
            else:
                delta_usd += d
                gamma_proxy += g
                mode = "provided_greeks_unscaled"

            vega_usd += v
            theta_usd += th

            usable_count += 1
            decisions.append({"position_index": idx, "symbol": p.symbol, "mode": mode})
            continue

        # 2) Option BS fallback (validated, deterministic)
        if p.type == "option":
            try:
                if p.underlying_price is None or p.strike is None or p.implied_vol is None or p.days_to_expiry is None:
                    raise ValidationError("Missing option inputs for BS (underlying_price/strike/implied_vol/days_to_expiry)")
                T = max(float(p.days_to_expiry), 0.0) / 365.0
                if exposure_policy_flags["strict_option_inputs_required"] and T <= 0:
                    raise ValidationError("Option has non-positive time to expiry under strict policy")
                if T <= 0:
                    raise ValidationError("Option has non-positive time to expiry")

                greeks = bs_greeks(
                    S=float(p.underlying_price),
                    K=float(p.strike),
                    T_years=T,
                    r=float(p.risk_free_rate),
                    sigma=float(p.implied_vol),
                    option_type=p.option_type or "call",
                )
            except ValidationError as e:
                decisions.append(
                    {
                        "position_index": idx,
                        "symbol": p.symbol,
                        "mode": "option_skipped_invalid_inputs",
                        "reason": str(e),
                    }
                )
                continue

            mult = p.contract_multiplier
            delta_usd += greeks["delta"] * p.qty * mult * float(p.underlying_price)
            gamma_proxy += greeks["gamma"] * p.qty * mult * float(p.underlying_price)
            vega_usd += greeks["vega"] * p.qty * mult
            theta_usd += (greeks["theta"] / 365.0) * p.qty * mult

            usable_count += 1
            decisions.append({"position_index": idx, "symbol": p.symbol, "mode": "bs_fallback"})
            continue

        # 3) Spot-like (equity/future/crypto/cash/other)
        if p.price is not None and _is_finite(p.price) and float(p.price) > 0:
            delta_usd += p.qty * float(p.price)
            usable_count += 1
            decisions.append({"position_index": idx, "symbol": p.symbol, "mode": "spot_delta"})
        else:
            # strict policy: treat as invalid (skipped) but recorded
            if exposure_policy_flags["strict_spot_price_required"]:
                decisions.append(
                    {
                        "position_index": idx,
                        "symbol": p.symbol,
                        "mode": "spot_skipped_missing_price",
                        "reason": "Missing or invalid spot price under strict policy",
                    }
                )
            else:
                decisions.append({"position_index": idx, "symbol": p.symbol, "mode": "spot_missing_price"})

    duration_ms = int((time.time() - t0) * 1000)

    disclosures = [
        "Deterministic first-order exposure proxies only",
        "gamma_proxy is NOT dollar gamma; indicative convexity proxy only",
        "BS fallback excludes dividends, skew, surface effects",
        "theta_usd is approximated as per-day from BS theta/365 when BS fallback is used",
    ]

    rejections: list[dict[str, Any]] = []
    if usable_count == 0:
        rejections.append({"code": REJECT_ALL_POSITIONS_INVALID, "reason": "No usable positions after validation/fallback rules"})

    # Deterministic output hash: hash only stable computed fields + input_hash + engine id + rejections
    output_hash = _stable_hash(
        {
            "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
            "delta_usd": delta_usd,
            "gamma_proxy": gamma_proxy,
            "vega_usd": vega_usd,
            "theta_usd": theta_usd,
            "input_hash": input_hash,
            "rejections": rejections,
        }
    )

    stage = StageTrace(
        stage=ENGINE_NAME,
        engine={"name": ENGINE_NAME, "version": ENGINE_VERSION},
        input_hash=input_hash,
        output_hash=output_hash,
        duration_ms=duration_ms,
        decisions=decisions,
        disclosures=disclosures,
        rejections=rejections,
    )

    output = {
        "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
        "delta_usd": delta_usd,
        "gamma_proxy": gamma_proxy,
        "vega_usd": vega_usd,
        "theta_usd": theta_usd,
        "stage_trace": stage.__dict__,
        "meta": {
            "request_id": rid,
            "user_id": user_id,
            "duration_ms": duration_ms,
        },
    }

    if rejections:
        _log_event(
            "exposure_rejected",
            request_id=rid,
            input_hash=input_hash,
            output_hash=output_hash,
            duration_ms=duration_ms,
            codes=[r.get("code") for r in rejections],
        )
    else:
        _log_event(
            "exposure_computed",
            request_id=rid,
            input_hash=input_hash,
            output_hash=output_hash,
            duration_ms=duration_ms,
        )

    return output


def compute_exposure(payload: Any, *, policy: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """
    Contract-friendly wrapper.

    Accepts:
    - RunEnvelope-like dict (preferred)
    - raw dict with "positions"
    - list of positions

    Extracts policy flags if present, but does not require full PolicyBundle structure here.
    """
    pol = _extract_policy(payload, policy)
    positions = _extract_positions(payload)
    return compute_portfolio_exposure(positions, policy=pol)


__all__ = [
    "ENGINE_NAME",
    "ENGINE_VERSION",
    "Position",
    "ValidationError",
    "ExposureError",
    "normalize_position",
    "bs_greeks",
    "compute_portfolio_exposure",
    "compute_exposure",
    "REJECT_INVALID_PAYLOAD",
    "REJECT_EMPTY_POSITIONS",
    "REJECT_ALL_POSITIONS_INVALID",
]
