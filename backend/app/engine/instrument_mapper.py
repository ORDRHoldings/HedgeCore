# backend/app/engine/instrument_mapper.py
from __future__ import annotations

"""
app/engine/instrument_mapper.py
HedgeCalc Engine Stage: instrument_mapper (v1.5.1)

PURPOSE
- Deterministically map approved hedge strategies -> eligible instruments, using ONLY:
  - InstrumentCatalog snapshot (contract)
  - PolicyBundle (contract)
  - Strategy outputs (from upstream stage)

BINDING DOCTRINE (institutional)
- Snapshot-only: no live/unlogged dependencies.
- Deterministic: same inputs -> same outputs/hashes.
- Fail-closed: if nothing eligible for a material strategy, emit structured rejection.
- Eligibility gating occurs HERE (first enforcement point):
  1) Axis eligibility (eligible_axes)
  2) Mandate allow/prohibit tags
  3) Liquidity policy floors
  4) Tradability: required contract specs for derivatives
- Disclosures: proxy usage must be explicit (catalog.is_proxy)

OUTPUT (stage-local)
- mapped_instruments (deterministically ordered)
- rejected (structured, contract objects + json)
- disclosures (structured)
- trace_step (hashes + decisions + timing) for TraceBundle construction upstream
"""

import hashlib
import json
import time
from collections.abc import Mapping, Sequence
from typing import Any

from app.contracts.instrument_catalog import InstrumentCatalog, InstrumentType
from app.contracts.policy_bundle import PolicyBundle
from app.contracts.run_envelope import hash_canonical
from app.contracts.trace_bundle import (
    Disclosure,
    DisclosureCode,
    Rejection,
    RejectionCode,
    StageName,
    TraceStep,
)

ENGINE_NAME = "instrument_mapper"
ENGINE_VERSION = "1.5.1"  # PATCH: stricter fail-closed semantics + deterministic trace parity


# -----------------------------
# Stable primitives (audit-safe)
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


def _as_int(x: Any, default: int = 0) -> int:
    try:
        return int(x)
    except Exception:
        return default


def _as_str(x: Any) -> str:
    if x is None:
        return ""
    return str(x).strip()


def _as_list(x: Any) -> list[Any]:
    return x if isinstance(x, list) else []


def _clamp_int(value: int, lo: int, hi: int) -> int:
    if value < lo:
        return lo
    if value > hi:
        return hi
    return value


# -----------------------------
# Eligibility gating helpers
# -----------------------------
def _instrument_has_required_specs(inst: Any) -> bool:
    if inst.instrument_type in (InstrumentType.FUTURE, InstrumentType.FUTURE_OPTION, InstrumentType.OPTION):
        return inst.contract is not None
    return True


def _mandate_allowed(inst: Any, mandate_allow: Sequence[str], mandate_prohibit: Sequence[str]) -> bool:
    inst_allow = set(inst.mandates.allow or ())
    inst_prohibit = set(inst.mandates.prohibit or ())

    allow_set = set(_as_str(x) for x in mandate_allow if _as_str(x))
    prohibit_set = set(_as_str(x) for x in mandate_prohibit if _as_str(x))

    if prohibit_set and (prohibit_set & (inst_allow | inst_prohibit)):
        return False

    if allow_set:
        return bool(allow_set & inst_allow)

    return True


def _liquidity_allowed(inst: Any, policy: PolicyBundle) -> bool:
    liq = inst.liquidity
    if liq.liquidity_score < float(policy.liquidity.min_liquidity_score):
        return False

    if policy.liquidity.min_avg_daily_volume is not None:
        if liq.avg_daily_volume is None or float(liq.avg_daily_volume) < float(policy.liquidity.min_avg_daily_volume):
            return False

    if policy.liquidity.min_open_interest is not None:
        if liq.open_interest is None or float(liq.open_interest) < float(policy.liquidity.min_open_interest):
            return False

    return True


def _axes_allowed(inst: Any, required_axes_any: Sequence[str]) -> bool:
    req = [_as_str(x) for x in required_axes_any if _as_str(x)]
    if not req:
        return True
    eligible = set(inst.eligible_axes or ())
    return any(a in eligible for a in req)


def _rank_instruments(instances: Sequence[Any]) -> list[Any]:
    return sorted(
        list(instances),
        key=lambda x: (-float(x.liquidity.liquidity_score), _as_str(x.instrument_id)),
    )


def _make_rejection(code: RejectionCode, message: str, details: dict[str, Any] | None = None) -> Rejection:
    return Rejection(
        code=code,
        message=message.strip(),
        stage=StageName.INSTRUMENT_MAPPER,
        details=details,
        residual_risk=None,
    )


def _make_disclosure(code: DisclosureCode, message: str, details: dict[str, Any] | None = None) -> Disclosure:
    return Disclosure(
        code=code,
        message=message.strip(),
        stage=StageName.INSTRUMENT_MAPPER,
        details=details,
    )


# -----------------------------
# Public API
# -----------------------------
def map_instruments(
    payload: Mapping[str, Any],
    *,
    policy: Mapping[str, Any] | None = None,
    instrument_catalog: Mapping[str, Any] | None = None,
    mandate_allow: Sequence[str] | None = None,
    mandate_prohibit: Sequence[str] | None = None,
) -> dict[str, Any]:
    """
    Deterministically map strategies -> eligible instruments using InstrumentCatalog + PolicyBundle.
    """
    t0 = time.perf_counter()

    # ---- PolicyBundle (fail-closed) ----
    try:
        pb = PolicyBundle(**(policy or {})).finalize()
    except Exception as e:
        rej = _make_rejection(
            RejectionCode.REJECT_INVALID_PORTFOLIO,
            "PolicyBundle invalid for instrument mapping",
            {"error": str(e)},
        )
        duration_ms = int((time.perf_counter() - t0) * 1000)
        step = _build_trace_step(
            stage_input={"policy": policy or {}},
            stage_output={"mapped_instruments": [], "rejected": [rej.model_dump(mode="json")]},
            duration_ms=duration_ms,
            decisions=["reject:invalid_policy_bundle"],
            rejections=[rej],
            disclosures=[],
        )
        return _final_response([], [rej], [], duration_ms, step)

    # ---- InstrumentCatalog snapshot (required) ----
    cat_src = instrument_catalog or payload.get("instrument_catalog")
    if not isinstance(cat_src, dict):
        rej = _make_rejection(
            RejectionCode.REJECT_MISSING_MARKET_FIELDS,
            "InstrumentCatalog snapshot missing for instrument mapping",
            {"expected": "instrument_catalog dict", "got": type(cat_src).__name__},
        )
        duration_ms = int((time.perf_counter() - t0) * 1000)
        step = _build_trace_step(
            stage_input={"policy_hash": pb.policy_hash},
            stage_output={"mapped_instruments": [], "rejected": [rej.model_dump(mode="json")]},
            duration_ms=duration_ms,
            decisions=["reject:missing_instrument_catalog"],
            rejections=[rej],
            disclosures=[],
        )
        return _final_response([], [rej], [], duration_ms, step)

    try:
        catalog = InstrumentCatalog(**cat_src).finalize()
    except Exception as e:
        rej = _make_rejection(
            RejectionCode.REJECT_MISSING_MARKET_FIELDS,
            "InstrumentCatalog snapshot invalid for instrument mapping",
            {"error": str(e)},
        )
        duration_ms = int((time.perf_counter() - t0) * 1000)
        step = _build_trace_step(
            stage_input={"policy_hash": pb.policy_hash},
            stage_output={"mapped_instruments": [], "rejected": [rej.model_dump(mode="json")]},
            duration_ms=duration_ms,
            decisions=["reject:invalid_instrument_catalog"],
            rejections=[rej],
            disclosures=[],
        )
        return _final_response([], [rej], [], duration_ms, step)

    inst_by_id = {i.instrument_id: i for i in catalog.instruments}

    strategies = payload.get("strategies", [])
    if not isinstance(strategies, list):
        strategies = []

    mapped: list[dict[str, Any]] = []
    rejections: list[Rejection] = []
    disclosures: list[Disclosure] = []
    decisions: list[str] = []

    mandate_allow = list(mandate_allow or [])
    mandate_prohibit = list(mandate_prohibit or [])

    # ---- Per-strategy deterministic processing ----
    for idx, s in enumerate(strategies):
        if not isinstance(s, dict):
            rejections.append(
                _make_rejection(
                    RejectionCode.REJECT_INVALID_PORTFOLIO,
                    "Strategy record is not an object",
                    {"i": idx},
                )
            )
            decisions.append(f"strategy[{idx}]:reject:not_object")
            continue

        strategy_id = _as_str(s.get("strategy_id"))
        if not strategy_id:
            rejections.append(
                _make_rejection(
                    RejectionCode.REJECT_INVALID_PORTFOLIO,
                    "Strategy missing strategy_id",
                    {"i": idx},
                )
            )
            decisions.append(f"strategy[{idx}]:reject:missing_strategy_id")
            continue

        required_axes_any = _as_list(s.get("required_axes_any")) or _as_list(s.get("risks"))
        candidate_ids = _as_list(s.get("candidate_instrument_ids"))

        if not candidate_ids:
            rejections.append(
                _make_rejection(
                    RejectionCode.REJECT_COVERAGE_FAILURE,
                    "No candidate instruments provided for strategy",
                    {"strategy_id": strategy_id, "i": idx},
                )
            )
            decisions.append(f"{strategy_id}:reject:no_candidates")
            continue

        resolved = [inst_by_id.get(_as_str(cid)) for cid in candidate_ids]
        resolved = [r for r in resolved if r is not None]

        if not resolved:
            rejections.append(
                _make_rejection(
                    RejectionCode.REJECT_NO_ELIGIBLE_INSTRUMENTS,
                    "No candidate instruments found in catalog",
                    {"strategy_id": strategy_id, "candidate_ids": candidate_ids},
                )
            )
            decisions.append(f"{strategy_id}:reject:candidates_not_in_catalog")
            continue

        gated: list[Any] = []
        for inst in resolved:
            if not _axes_allowed(inst, required_axes_any):
                continue
            if not _mandate_allowed(inst, mandate_allow, mandate_prohibit):
                continue
            if not _liquidity_allowed(inst, pb):
                continue
            if not _instrument_has_required_specs(inst):
                continue
            gated.append(inst)

        if not gated:
            rejections.append(
                _make_rejection(
                    RejectionCode.REJECT_NO_ELIGIBLE_INSTRUMENTS,
                    "No eligible instruments after gating",
                    {"strategy_id": strategy_id},
                )
            )
            decisions.append(f"{strategy_id}:reject:none_survived_gates")
            continue

        ranked = _rank_instruments(gated)

        allow_multiple = bool(s.get("allow_multiple", False))
        max_out = _clamp_int(_as_int(s.get("max_instruments", 1), 1), 1, 10)
        selected = ranked[:max_out] if allow_multiple else ranked[:1]

        decisions.append(f"{strategy_id}:selected:{','.join([x.instrument_id for x in selected])}")

        for inst in selected:
            if bool(inst.is_proxy):
                disclosures.append(
                    _make_disclosure(
                        DisclosureCode.DISCLOSED_PROXY_INSTRUMENT_USED,
                        "Proxy instrument selected by instrument_mapper",
                        {"strategy_id": strategy_id, "instrument_id": inst.instrument_id, "proxy_for": inst.proxy_for},
                    )
                )

            mapped.append(
                {
                    "strategy_id": strategy_id,
                    "instrument_id": inst.instrument_id,
                    "symbol": inst.symbol,
                    "exchange": inst.exchange.value,
                    "instrument_type": inst.instrument_type.value,
                    "eligible_axes": list(inst.eligible_axes),
                    "liquidity_score": float(inst.liquidity.liquidity_score),
                    "slippage_model_id": inst.slippage.model_id,
                    "is_proxy": bool(inst.is_proxy),
                    "proxy_for": inst.proxy_for,
                }
            )

    duration_ms = int((time.perf_counter() - t0) * 1000)

    stage_input = {
        "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
        "policy_hash": pb.policy_hash,
        "catalog_hash": catalog.catalog_hash,
        "strategies_fingerprint": _stable_hash({"strategies": strategies}),
        "mandate_allow": list(mandate_allow),
        "mandate_prohibit": list(mandate_prohibit),
    }
    stage_output = {
        "mapped_instruments": mapped,
        "rejected": [r.model_dump(mode="json") for r in rejections],
        "disclosures": [d.model_dump(mode="json") for d in disclosures],
    }

    step = _build_trace_step(
        stage_input=stage_input,
        stage_output=stage_output,
        duration_ms=duration_ms,
        decisions=decisions,
        rejections=rejections,
        disclosures=disclosures,
    )

    return _final_response(mapped, rejections, disclosures, duration_ms, step)


# -----------------------------
# TraceStep builder
# -----------------------------
def _build_trace_step(
    *,
    stage_input: Mapping[str, Any],
    stage_output: Mapping[str, Any],
    duration_ms: int,
    decisions: Sequence[str],
    rejections: Sequence[Rejection],
    disclosures: Sequence[Disclosure],
) -> TraceStep:
    return TraceStep(
        stage=StageName.INSTRUMENT_MAPPER,
        input_hash=hash_canonical(stage_input),
        output_hash=hash_canonical(stage_output),
        duration_ms=int(duration_ms),
        decisions=[_as_str(x) for x in decisions if _as_str(x)],
        rejections=list(rejections),
        disclosures=list(disclosures),
        notes=[],
    )


def _final_response(
    mapped: list[dict[str, Any]],
    rejections: list[Rejection],
    disclosures: list[Disclosure],
    duration_ms: int,
    step: TraceStep,
) -> dict[str, Any]:
    return {
        "mapped_instruments": mapped,
        "rejected": [r.model_dump(mode="json") for r in rejections],
        "disclosures": [d.model_dump(mode="json") for d in disclosures],
        "meta": {
            "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
            "duration_ms": int(duration_ms),
            "trace_step": step.model_dump(mode="json"),
            "trace_step_obj": step,
            "rejection_objs": rejections,
            "disclosure_objs": disclosures,
        },
    }


__all__ = [
    "ENGINE_NAME",
    "ENGINE_VERSION",
    "map_instruments",
]
