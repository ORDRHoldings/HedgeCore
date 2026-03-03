from __future__ import annotations

"""
app/engine/risk_classifier.py

HedgeCalc - Risk Classification Engine (v1.1.0)
------------------------------------------------
Purpose:
- Convert deterministic exposure output into deterministic risk classes (R1-R8)
- Produce explainable, auditable risk vectors
- NO machine learning
- NO randomness
- Institution-grade governance

Authoritative taxonomy (Hedge Engine Spec v1.0):
- R1 Directional (Delta)
- R2 Volatility (Vega)
- R3 Convexity (Gamma)
- R4 Time Decay (Theta)
- R5 Correlation (reserved in v1)
- R6 Credit (reserved in v1)
- R7 Liquidity (reserved in v1)
- R8 Tail (reserved in v1)

Consumes:
- Output of exposure stage (compute_portfolio_exposure / compute_exposure)

Produces (trace-first):
- risk_vector (R1-R8) as normalized shares in [0,1] (sum=1 for non-zero exposure)
- dominant_risk (stable tie-break)
- confidence (dominant share)
- stage_trace: input_hash/output_hash/decisions/disclosures/rejections/duration_ms
- meta: request_id, duration_ms

Fail-closed:
- Invalid payload shape -> explicit rejection
- Zero/empty usable exposure -> explicit rejection (no silent success)
"""

import hashlib
import json
import math
import time
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional


ENGINE_NAME = "risk_classifier"
ENGINE_VERSION = "1.1.0"  # CONTRACT-ALIGNED: trace-first + stable rejection codes


# ---------------------------------------------------------------------
# Risk Buckets (Canonical per spec)
# ---------------------------------------------------------------------
RISK_BUCKETS = (
    "R1_DELTA",      # Directional price exposure
    "R2_VEGA",       # Volatility sensitivity
    "R3_GAMMA",      # Convexity/Acceleration
    "R4_THETA",      # Time decay erosion
    "R5_CORREL",     # Diversification breakdown (reserved in v1 classifier)
    "R6_CREDIT",     # Spread widening (reserved in v1 classifier)
    "R7_LIQUIDITY",  # Exit difficulty (reserved in v1 classifier)
    "R8_TAIL",       # Extreme events (reserved in v1 classifier)
)


# ---------------------------------------------------------------------
# Rejection codes (stable)
# ---------------------------------------------------------------------
REJECT_INVALID_EXPOSURE_PAYLOAD = "REJECT_RISKCLASSIFIER_INVALID_EXPOSURE_PAYLOAD"
REJECT_ZERO_TOTAL_EXPOSURE = "REJECT_RISKCLASSIFIER_ZERO_TOTAL_EXPOSURE"


# ---------------------------------------------------------------------
# Stable primitives (audit-safe)
# ---------------------------------------------------------------------
def _normalize_for_hash(x: Any) -> Any:
    """
    Recursively normalize values into strict JSON-safe primitives for hashing.
    - NaN / +Inf / -Inf -> None
    - dict keys -> coerced to str (stable)
    - tuples/sets -> lists (stable ordering for sets)
    """
    if x is None:
        return None

    if isinstance(x, bool):
        return x

    if isinstance(x, int):
        return x

    if isinstance(x, float):
        if math.isnan(x) or math.isinf(x):
            return None
        return x

    if isinstance(x, str):
        return x

    if isinstance(x, Mapping):
        items = ((str(k), _normalize_for_hash(v)) for k, v in x.items())
        return {k: v for k, v in sorted(items, key=lambda kv: kv[0])}

    if isinstance(x, (list, tuple)):
        return [_normalize_for_hash(v) for v in x]

    if isinstance(x, set):
        norm = [_normalize_for_hash(v) for v in x]
        return sorted(norm, key=lambda v: json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False))

    return str(x)


def _canonical_json(obj: Any) -> str:
    return json.dumps(
        obj,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def _stable_hash(obj: Any) -> str:
    norm = _normalize_for_hash(obj)
    return hashlib.sha256(_canonical_json(norm).encode("utf-8")).hexdigest()


def _safe_float(x: Any, default: float = 0.0) -> float:
    try:
        v = float(x)
    except Exception:
        return default
    if math.isnan(v) or math.isinf(v):
        return default
    return v


def _clamp01(x: float) -> float:
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return x


# ---------------------------------------------------------------------
# Trace model
# ---------------------------------------------------------------------
@dataclass(frozen=True)
class StageTrace:
    stage: str
    engine: Dict[str, str]
    input_hash: str
    output_hash: str
    duration_ms: int
    decisions: Dict[str, Any]
    disclosures: list
    rejections: list


# ---------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------
def classify_risk(exposure: Dict[str, Any]) -> Dict[str, Any]:
    """
    Classify portfolio exposure into HedgeCalc risk buckets.

    Parameters
    ----------
    exposure : dict
        Output from exposure stage.

    Returns
    -------
    dict
        Risk classification vector with dominant risk and confidence.
        Includes stage_trace with deterministic hashes and any rejections.
    """
    t0 = time.perf_counter()

    if exposure is None or not isinstance(exposure, dict):
        exposure = {}

    # Contract alignment: exposure stage emits gamma_proxy (not gamma_usd).
    # Keep the bucket named R3_GAMMA but disclose it is proxy-derived in v1.
    delta = abs(_safe_float(exposure.get("delta_usd", 0.0), 0.0))
    vega = abs(_safe_float(exposure.get("vega_usd", 0.0), 0.0))
    gamma_proxy = abs(_safe_float(exposure.get("gamma_proxy", 0.0), 0.0))
    theta = abs(_safe_float(exposure.get("theta_usd", 0.0), 0.0))

    total = delta + vega + gamma_proxy + theta

    input_hash = _stable_hash(
        {
            "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
            "exposure": exposure,
        }
    )
    request_id = f"risk_{input_hash[:24]}"

    disclosures = [
        "Deterministic classification only; no ML, no randomness",
        "R3_GAMMA uses exposure.gamma_proxy (indicative convexity proxy), not dollar gamma",
        "R5/R6/R7/R8 are reserved and forced to 0.0 in v1 classifier",
    ]

    # Fail-closed: total exposure must be positive to produce a normalized vector
    if total <= 0.0:
        duration_ms = int((time.perf_counter() - t0) * 1000)
        rejections = [{"code": REJECT_ZERO_TOTAL_EXPOSURE, "reason": "Total (abs) exposure is zero after sanitization"}]
        output_hash = _stable_hash(
            {
                "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
                "input_hash": input_hash,
                "rejections": rejections,
            }
        )
        stage_trace = StageTrace(
            stage=ENGINE_NAME,
            engine={"name": ENGINE_NAME, "version": ENGINE_VERSION},
            input_hash=input_hash,
            output_hash=output_hash,
            duration_ms=duration_ms,
            decisions={
                "inputs_abs": {
                    "delta_usd_abs": delta,
                    "vega_usd_abs": vega,
                    "gamma_proxy_abs": gamma_proxy,
                    "theta_usd_abs": theta,
                },
                "total": total,
                "status": "rejected_zero_total",
            },
            disclosures=disclosures,
            rejections=rejections,
        )
        return {
            "risk_vector": {k: 0.0 for k in RISK_BUCKETS},
            "dominant_risk": None,
            "confidence": 0.0,
            "stage_trace": stage_trace.__dict__,
            "meta": {
                "request_id": request_id,
                "duration_ms": duration_ms,
            },
        }

    # Deterministic normalization (strict)
    r1 = _clamp01(delta / total)
    r2 = _clamp01(vega / total)
    r3 = _clamp01(gamma_proxy / total)
    r4 = _clamp01(theta / total)

    # Ensure deterministic sum=1 by computing remainder into R4 when rounding drift occurs.
    # This preserves audit replay without introducing randomness.
    base_sum = r1 + r2 + r3
    r4 = _clamp01(1.0 - base_sum)

    scores: Dict[str, float] = {
        "R1_DELTA": float(r1),
        "R2_VEGA": float(r2),
        "R3_GAMMA": float(r3),
        "R4_THETA": float(r4),
        "R5_CORREL": 0.0,
        "R6_CREDIT": 0.0,
        "R7_LIQUIDITY": 0.0,
        "R8_TAIL": 0.0,
    }

    # Deterministic dominant risk selection:
    # 1) highest score
    # 2) lexical tie-break (stable)
    dominant_risk = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]

    confidence = round(float(scores[dominant_risk]), 6)
    duration_ms = int((time.perf_counter() - t0) * 1000)

    decisions = {
        "inputs_abs": {
            "delta_usd_abs": delta,
            "vega_usd_abs": vega,
            "gamma_proxy_abs": gamma_proxy,
            "theta_usd_abs": theta,
        },
        "total": total,
        "risk_vector_raw": scores,
        "dominant_risk": dominant_risk,
        "tie_break": "(-score, bucket_lexical)",
    }

    # Deterministic output hash over stable result fields
    output_hash = _stable_hash(
        {
            "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
            "risk_vector": scores,
            "dominant_risk": dominant_risk,
            "confidence": confidence,
            "input_hash": input_hash,
            "rejections": [],
        }
    )

    stage_trace = StageTrace(
        stage=ENGINE_NAME,
        engine={"name": ENGINE_NAME, "version": ENGINE_VERSION},
        input_hash=input_hash,
        output_hash=output_hash,
        duration_ms=duration_ms,
        decisions=decisions,
        disclosures=disclosures,
        rejections=[],
    )

    return {
        "risk_vector": {k: round(float(v), 8) for k, v in scores.items()},
        "dominant_risk": dominant_risk,
        "confidence": confidence,
        "stage_trace": stage_trace.__dict__,
        "meta": {
            "request_id": request_id,
            "duration_ms": duration_ms,
        },
    }


__all__ = [
    "ENGINE_NAME",
    "ENGINE_VERSION",
    "RISK_BUCKETS",
    "classify_risk",
    "REJECT_INVALID_EXPOSURE_PAYLOAD",
    "REJECT_ZERO_TOTAL_EXPOSURE",
]
