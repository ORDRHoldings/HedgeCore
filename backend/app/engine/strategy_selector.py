# backend/app/engine/strategy_selector.py
from __future__ import annotations

"""
app/engine/strategy_selector.py
HedgeCalc Engine Stage: strategy_selector (v1.5.1)

PURPOSE
- Deterministically map classified risks (canonical R1-R8 axis IDs) -> hedge strategies,
  and emit *axis-explicit* instrument candidate lists sourced ONLY from:
    - InstrumentCatalog snapshot (contract)
    - Policy (thresholds) (dict; PolicyBundle integration is upstream/next step)
    - Classified risk outputs from risk_classifier

BINDING DOCTRINE
- Snapshot-only: no live/unlogged dependency.
- Deterministic: same inputs -> same outputs/hashes.
- Fail-closed: if material risks exist but no strategies can be produced, emit structured rejection.
- Axis correctness: output axis IDs MUST be canonical (from risk_taxonomy).
- No pricing, no sizing, no execution, no forecasts.

OUTPUT
- strategies: list of strategy dicts intended for instrument_mapper consumption:
    - strategy_id (str)
    - required_axes_any (list[str])         # canonical axis IDs
    - candidate_instrument_ids (list[str])  # from InstrumentCatalog (deterministic)
    - allow_multiple (bool)
    - max_instruments (int)
    - score (float 0..1)                    # priority score for strategy ordering
    - liquidity (float 0..1)                # derived, deterministic heuristic (not market data)
    - complexity (int)                      # deterministic catalog value
- rejected: list of structured rejection dicts (from contract objects)
- disclosures: list of structured disclosures dicts (from contract objects)
- meta.trace_step: TraceStep JSON for TraceBundle construction by orchestrator

NOTES
- This module does NOT construct RunEnvelope/TraceBundle; it returns a TraceStep seed.
- This module MUST NOT introduce timestamps into hashing. (duration_ms is traced but not hashed)
"""

import hashlib
import json
import math
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from app.contracts.run_envelope import hash_canonical
from app.contracts.trace_bundle import (
    StageName,
    RejectionCode,
    DisclosureCode,
    Rejection,
    Disclosure,
    TraceStep,
)
from app.contracts.instrument_catalog import InstrumentCatalog, InstrumentType

try:
    # Preferred: canonical taxonomy singleton (if present)
    from app.contracts.risk_taxonomy import CANONICAL_TAXONOMY  # type: ignore
except Exception:  # pragma: no cover
    CANONICAL_TAXONOMY = None  # type: ignore


ENGINE_NAME = "strategy_selector"
ENGINE_VERSION = "1.5.1"  # PATCH: deterministic axis validation + policy sanitation + corrected disclosure codes


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
        default=str,
    )


def _stable_hash(obj: Any) -> str:
    return hashlib.sha256(_canonical_json(obj).encode("utf-8")).hexdigest()


def _as_float(x: Any, default: float = 0.0) -> float:
    try:
        v = float(x)
    except Exception:
        return default
    if not math.isfinite(v):
        return default
    return v


def _as_int(x: Any, default: int = 0) -> int:
    try:
        return int(x)
    except Exception:
        return default


def _as_str(x: Any) -> str:
    if x is None:
        return ""
    return str(x).strip()


def _as_list(x: Any) -> List[Any]:
    return x if isinstance(x, list) else []


def _clamp01(x: float) -> float:
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return x


# -----------------------------
# Canonical axis registry helpers
# -----------------------------
_CANONICAL_AXES: Tuple[str, ...] = (
    "R1_DELTA",
    "R2_VEGA",
    "R3_GAMMA",
    "R4_THETA",
    "R5_CORREL",
    "R6_CREDIT",
    "R7_LIQUIDITY",
    "R8_TAIL",
)


def _canonical_axis_set() -> Tuple[str, ...]:
    """
    Prefer the runtime taxonomy singleton if it exists; otherwise fall back to the
    frozen v1 list embedded here (still deterministic).
    """
    try:
        if CANONICAL_TAXONOMY is not None:
            axes = getattr(CANONICAL_TAXONOMY, "axes", None)
            if isinstance(axes, list) and axes:
                out: List[str] = []
                for a in axes:
                    aid = getattr(a, "id", None)
                    if aid:
                        out.append(str(aid).strip())
                out = [x for x in out if x]
                if out:
                    return tuple(out)
    except Exception:
        pass
    return _CANONICAL_AXES


def _validate_axis_id(axis_id: str, axis_set: Sequence[str]) -> bool:
    return axis_id in set(axis_set)


# Back-compat aliases: accept older/non-canonical incoming IDs and map explicitly.
# Any alias mapping emits a disclosure.
_AXIS_ALIASES: Dict[str, str] = {
    # Legacy / earlier drafts
    "R2_GAMMA": "R3_GAMMA",
    "R3_VEGA": "R2_VEGA",
    "R6_RATE": "R1_DELTA",        # explicit non-equivalence; treated as directional proxy, disclosed
    "R7_INFLATION": "R8_TAIL",    # explicit non-equivalence; treated as tail proxy, disclosed
    "R8_CRYPTO": "R8_TAIL",       # treat as tail/crypto proxy in core taxonomy, disclosed
}


def _normalize_axis_id(raw: str, axis_set: Sequence[str]) -> Tuple[str, Optional[str]]:
    """
    Returns (canonical_axis_id, alias_used_from) where alias_used_from is the original
    non-canonical ID if an alias mapping was applied.
    If raw is already canonical, alias_used_from is None.
    If raw is unknown, returns ("", None).
    """
    s = _as_str(raw)
    if not s:
        return "", None
    if _validate_axis_id(s, axis_set):
        return s, None
    if s in _AXIS_ALIASES:
        mapped = _AXIS_ALIASES[s]
        if _validate_axis_id(mapped, axis_set):
            return mapped, s
    return "", None


# -----------------------------
# Strategy definitions (decision catalog only)
# -----------------------------
@dataclass(frozen=True, slots=True)
class StrategyDef:
    strategy_id: str
    covers_axes: Tuple[str, ...]
    prefer_types: Tuple[InstrumentType, ...]
    allow_multiple: bool
    max_instruments: int
    complexity: int
    notes: str


STRATEGY_CATALOG: Tuple[StrategyDef, ...] = (
    StrategyDef(
        strategy_id="index_futures",
        covers_axes=("R1_DELTA",),
        prefer_types=(InstrumentType.FUTURE, InstrumentType.ETF, InstrumentType.INDEX),
        allow_multiple=False,
        max_instruments=1,
        complexity=1,
        notes="Linear delta hedge via index futures (or closest eligible proxy in catalog).",
    ),
    StrategyDef(
        strategy_id="index_puts",
        covers_axes=("R1_DELTA", "R8_TAIL"),
        prefer_types=(InstrumentType.OPTION, InstrumentType.FUTURE_OPTION),
        allow_multiple=False,
        max_instruments=1,
        complexity=2,
        notes="Downside convexity via index puts (if options exist in catalog).",
    ),
    StrategyDef(
        strategy_id="vol_futures",
        covers_axes=("R2_VEGA",),
        prefer_types=(InstrumentType.FUTURE, InstrumentType.INDEX),
        allow_multiple=False,
        max_instruments=1,
        complexity=2,
        notes="Volatility hedge via volatility-linked futures/proxies (catalog-gated).",
    ),
    StrategyDef(
        strategy_id="gamma_overlay",
        covers_axes=("R3_GAMMA",),
        prefer_types=(InstrumentType.OPTION, InstrumentType.FUTURE_OPTION),
        allow_multiple=True,
        max_instruments=2,
        complexity=3,
        notes="Convexity overlay via options (where available in catalog).",
    ),
    StrategyDef(
        strategy_id="credit_hedge",
        covers_axes=("R6_CREDIT",),
        prefer_types=(InstrumentType.FUTURE, InstrumentType.ETF, InstrumentType.BOND),
        allow_multiple=False,
        max_instruments=1,
        complexity=2,
        notes="Credit hedge via eligible credit instruments in catalog (CFE/Cboe/CME as provided).",
    ),
    StrategyDef(
        strategy_id="liquidity_buffer",
        covers_axes=("R7_LIQUIDITY",),
        prefer_types=(InstrumentType.ETF, InstrumentType.EQUITY, InstrumentType.OTHER),
        allow_multiple=True,
        max_instruments=2,
        complexity=2,
        notes="Liquidity risk mitigations via most liquid eligible instruments (policy-gated downstream).",
    ),
    StrategyDef(
        strategy_id="tail_overlay",
        covers_axes=("R8_TAIL",),
        prefer_types=(InstrumentType.OPTION, InstrumentType.FUTURE_OPTION, InstrumentType.FUTURE),
        allow_multiple=True,
        max_instruments=2,
        complexity=3,
        notes="Tail hedge overlay (gap/crash protection) using eligible instruments.",
    ),
)

_STRATEGY_BY_ID: Dict[str, StrategyDef] = {s.strategy_id: s for s in STRATEGY_CATALOG}


# -----------------------------
# Rejection helpers
# -----------------------------
def _make_rejection(code: RejectionCode, message: str, details: Optional[Dict[str, Any]] = None) -> Rejection:
    return Rejection(
        code=code,
        message=message.strip(),
        stage=StageName.STRATEGY_SELECTOR,
        details=details,
        residual_risk=None,
    )


def _make_disclosure(code: DisclosureCode, message: str, details: Optional[Dict[str, Any]] = None) -> Disclosure:
    return Disclosure(
        code=code,
        message=message.strip(),
        stage=StageName.STRATEGY_SELECTOR,
        details=details,
    )


# -----------------------------
# Candidate selection (catalog-driven)
# -----------------------------
def _rank_candidate_ids(catalog: InstrumentCatalog, ids: Sequence[str]) -> List[str]:
    """
    Deterministic ranking:
    1) higher liquidity_score (0..1)
    2) stable tiebreaker: instrument_id lexicographic
    """
    inst_by_id = {i.instrument_id: i for i in catalog.instruments}
    ranked: List[Tuple[float, str]] = []
    for iid in ids:
        inst = inst_by_id.get(iid)
        if inst is None:
            continue
        ranked.append((float(inst.liquidity.liquidity_score), inst.instrument_id))
    ranked.sort(key=lambda t: (-t[0], t[1]))
    return [iid for _, iid in ranked]


def _candidate_ids_for_strategy(catalog: InstrumentCatalog, strat: StrategyDef) -> List[str]:
    """
    Candidate list is derived from catalog metadata alone:
    - Instrument must declare eligibility for at least one covered axis (eligible_axes)
    - Instrument type should match prefer_types if possible; if none match, fall back to any eligible type
    """
    covered = set(strat.covers_axes)
    preferred_ids: List[str] = []
    fallback_ids: List[str] = []
    prefer_types = set(strat.prefer_types)

    for inst in catalog.instruments:
        eligible_axes = set(inst.eligible_axes or ())
        if not (eligible_axes & covered):
            continue
        if inst.instrument_type in prefer_types:
            preferred_ids.append(inst.instrument_id)
        else:
            fallback_ids.append(inst.instrument_id)

    ids = preferred_ids if preferred_ids else fallback_ids
    return _rank_candidate_ids(catalog, ids)


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
    notes: Optional[Sequence[str]] = None,
) -> TraceStep:
    input_hash = hash_canonical(stage_input)
    output_hash = hash_canonical(stage_output)
    return TraceStep(
        stage=StageName.STRATEGY_SELECTOR,
        input_hash=input_hash,
        output_hash=output_hash,
        duration_ms=int(duration_ms),
        decisions=[_as_str(x) for x in decisions if _as_str(x)],
        rejections=list(rejections),
        disclosures=list(disclosures),
        notes=[_as_str(x) for x in (notes or []) if _as_str(x)],
    )


# -----------------------------
# Public API
# -----------------------------
def select_strategies(
    payload: Mapping[str, Any],
    *,
    policy: Optional[Mapping[str, Any]] = None,
    instrument_catalog: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Deterministically select hedge strategies from classified risks, and emit
    axis-explicit instrument candidates derived from InstrumentCatalog.

    Inputs:
    - payload["classified_risks"]: list[{risk_id, score, ...}]
      risk_id is expected to be canonical axis IDs; aliases are handled explicitly w/ disclosure.
    - instrument_catalog: dict representing InstrumentCatalog snapshot.
      If omitted, payload["instrument_catalog"] is used if present.
    - policy: dict with thresholds:
        - min_risk_score (float, default 0.15)
        - max_strategy_complexity (int, default 3)
        - max_output_strategies (int, default 6)
        - max_candidates_per_strategy (int, default 6)

    Returns:
    - strategies, rejected, disclosures, meta.trace_step, meta.duration_ms
    """
    t0 = time.perf_counter()

    pol: Dict[str, Any] = {
        "min_risk_score": 0.15,
        "max_strategy_complexity": 3,
        "max_output_strategies": 6,
        "max_candidates_per_strategy": 6,
    }
    if isinstance(policy, Mapping):
        for k in list(pol.keys()):
            if k in policy:
                pol[k] = policy[k]

    # Sanitize policy deterministically (clamp ranges)
    min_score = _clamp01(_as_float(pol.get("min_risk_score"), 0.15))
    max_cx = max(1, min(10, _as_int(pol.get("max_strategy_complexity"), 3)))
    max_strats = max(1, min(50, _as_int(pol.get("max_output_strategies"), 6)))
    max_cands = max(1, min(25, _as_int(pol.get("max_candidates_per_strategy"), 6)))

    pol = {
        "min_risk_score": float(min_score),
        "max_strategy_complexity": int(max_cx),
        "max_output_strategies": int(max_strats),
        "max_candidates_per_strategy": int(max_cands),
    }

    axis_set = _canonical_axis_set()
    axis_order = list(axis_set)

    # Parse catalog snapshot (required for candidate emission)
    cat_src = instrument_catalog or payload.get("instrument_catalog")
    catalog: Optional[InstrumentCatalog] = None
    catalog_error: Optional[str] = None

    if isinstance(cat_src, dict):
        try:
            catalog = InstrumentCatalog(**cat_src).finalize()
        except Exception as e:
            catalog_error = str(e)

    if catalog is None:
        rej = _make_rejection(
            RejectionCode.REJECT_MISSING_MARKET_FIELDS,
            "InstrumentCatalog snapshot missing/invalid for strategy selection (candidates cannot be produced)",
            details={
                "expected": "instrument_catalog dict (InstrumentCatalog contract)",
                "got": type(cat_src).__name__,
                "error": catalog_error,
            },
        )
        duration_ms = int((time.perf_counter() - t0) * 1000)
        step = _build_trace_step(
            stage_input={
                "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
                "policy": dict(pol),
                "taxonomy_axes": list(axis_set),
                "classified_risks_fingerprint": _stable_hash({"classified_risks": _as_list(payload.get("classified_risks"))}),
            },
            stage_output={"strategies": [], "rejected": [rej.model_dump(mode="json")], "disclosures": []},
            duration_ms=duration_ms,
            decisions=["reject:missing_or_invalid_instrument_catalog"],
            rejections=[rej],
            disclosures=[],
            notes=["Fail-closed: strategy_selector requires catalog snapshot to emit candidates."],
        )
        return {
            "strategies": [],
            "rejected": [rej.model_dump(mode="json")],
            "disclosures": [],
            "meta": {
                "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
                "duration_ms": duration_ms,
                "trace_step": step.model_dump(mode="json"),
            },
        }

    # Parse risks
    risks = payload.get("classified_risks", [])
    if not isinstance(risks, list):
        risks = []

    selected: List[Dict[str, Any]] = []
    rejections: List[Rejection] = []
    disclosures: List[Disclosure] = []
    decisions: List[str] = []

    material_axes: List[str] = []
    normalized_axes: List[str] = []

    for r in risks:
        if not isinstance(r, dict):
            continue

        raw_axis = _as_str(r.get("risk_id"))
        raw_score = _as_float(r.get("score", 0.0), 0.0)
        score = _clamp01(raw_score)

        axis, alias_from = _normalize_axis_id(raw_axis, axis_set)
        if alias_from is not None:
            disclosures.append(
                _make_disclosure(
                    DisclosureCode.DISCLOSED_AXIS_ALIAS_MAPPING,
                    "Non-canonical axis id mapped to canonical taxonomy id",
                    details={"from": alias_from, "to": axis, "original_risk_id": raw_axis},
                )
            )

        if not axis:
            rejections.append(
                _make_rejection(
                    RejectionCode.REJECT_INVALID_PORTFOLIO,
                    "Unknown risk axis id; does not match canonical R1-R8 taxonomy",
                    details={"risk_id": raw_axis, "known_axes": list(axis_set)},
                )
            )
            decisions.append(f"axis:{raw_axis}:reject:unknown_axis_id")
            continue

        normalized_axes.append(axis)

        if score >= float(min_score):
            material_axes.append(axis)

    # Deduplicate material axes deterministically by taxonomy order
    material_axes = sorted(set(material_axes), key=lambda a: axis_order.index(a) if a in axis_order else 10_000)

    # For each material axis, choose strategies that cover it (within complexity policy)
    for axis in material_axes:
        candidates = [s for s in STRATEGY_CATALOG if axis in s.covers_axes and s.complexity <= max_cx]

        if not candidates:
            rejections.append(
                _make_rejection(
                    RejectionCode.REJECT_COVERAGE_FAILURE,
                    "No eligible strategy available for material risk axis (catalog-independent coverage failure)",
                    details={"axis": axis, "max_strategy_complexity": max_cx},
                )
            )
            decisions.append(f"{axis}:reject:no_strategy_coverage")
            continue

        candidates.sort(key=lambda s: (s.complexity, s.strategy_id))

        for strat in candidates:
            inst_ids = _candidate_ids_for_strategy(catalog, strat)

            if not inst_ids:
                rejections.append(
                    _make_rejection(
                        RejectionCode.REJECT_NO_ELIGIBLE_INSTRUMENTS,
                        "No candidate instruments found in catalog for strategy coverage of axis",
                        details={"axis": axis, "strategy_id": strat.strategy_id, "covers_axes": list(strat.covers_axes)},
                    )
                )
                decisions.append(f"{strat.strategy_id}:reject:no_catalog_candidates")
                continue

            inst_ids = inst_ids[:max_cands]

            # Proxy disclosure if all candidates are proxies
            try:
                inst_by_id = {i.instrument_id: i for i in catalog.instruments}
                proxy_count = sum(1 for iid in inst_ids if bool(getattr(inst_by_id.get(iid), "is_proxy", False)))
                if proxy_count == len(inst_ids):
                    disclosures.append(
                        _make_disclosure(
                            DisclosureCode.DISCLOSED_PROXY_INSTRUMENT_USED,
                            "All candidate instruments for this strategy are marked as proxies in catalog",
                            details={"strategy_id": strat.strategy_id, "axis": axis, "candidate_instrument_ids": inst_ids},
                        )
                    )
            except Exception:
                pass

            # Strategy score heuristic: best score among risks matching axis (deterministic)
            best_axis_score = 0.0
            for rr in risks:
                if not isinstance(rr, dict):
                    continue
                rid = _as_str(rr.get("risk_id"))
                rid_norm, _ = _normalize_axis_id(rid, axis_set)
                if rid_norm == axis:
                    best_axis_score = max(best_axis_score, _clamp01(_as_float(rr.get("score", 0.0), 0.0)))

            strategy_score = _clamp01(best_axis_score)

            selected.append(
                {
                    "strategy_id": strat.strategy_id,
                    "required_axes_any": list(strat.covers_axes),
                    "candidate_instrument_ids": list(inst_ids),
                    "allow_multiple": bool(strat.allow_multiple),
                    "max_instruments": int(strat.max_instruments),
                    "score": float(strategy_score),
                    "liquidity": float(strategy_score),  # deterministic heuristic only; real gating is downstream
                    "complexity": int(strat.complexity),
                    "notes": str(strat.notes),
                }
            )
            decisions.append(f"{axis}:select:{strat.strategy_id}:cands={len(inst_ids)}")

    # Deduplicate strategies deterministically by strategy_id, merging axes/candidates
    merged: Dict[str, Dict[str, Any]] = {}
    for s in selected:
        sid = _as_str(s.get("strategy_id"))
        if not sid:
            continue
        if sid not in merged:
            merged[sid] = dict(s)
            continue

        a = list(merged[sid].get("required_axes_any", []))
        b = list(s.get("required_axes_any", []))
        axes = [x for x in a + b if _validate_axis_id(_as_str(x), axis_set)]
        axes = sorted(set(axes), key=lambda x: axis_order.index(x) if x in axis_order else 10_000)

        c1 = list(merged[sid].get("candidate_instrument_ids", []))
        c2 = list(s.get("candidate_instrument_ids", []))
        cands = sorted(set([_as_str(x) for x in (c1 + c2) if _as_str(x)]))

        merged[sid]["required_axes_any"] = axes
        merged[sid]["candidate_instrument_ids"] = cands[:max_cands]
        merged[sid]["score"] = float(
            max(
                _as_float(merged[sid].get("score", 0.0), 0.0),
                _as_float(s.get("score", 0.0), 0.0),
            )
        )

    final_strategies = list(merged.values())

    # Deterministic ordering: higher score first, then lower complexity, then strategy_id
    final_strategies.sort(
        key=lambda x: (
            -_as_float(x.get("score", 0.0), 0.0),
            _as_int(x.get("complexity", 99), 99),
            _as_str(x.get("strategy_id")),
        )
    )
    final_strategies = final_strategies[:max_strats]

    # GLOBAL COVERAGE FAILURE: material axes exist but no strategies survived
    if material_axes and not final_strategies:
        rejections.append(
            _make_rejection(
                RejectionCode.REJECT_COVERAGE_FAILURE,
                "Material risks present but no strategies could be selected (coverage failure)",
                details={"material_axes": material_axes},
            )
        )
        decisions.append("reject:global_coverage_failure")

    duration_ms = int((time.perf_counter() - t0) * 1000)

    stage_input = {
        "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
        "policy": dict(pol),
        "taxonomy_axes": list(axis_set),
        "catalog_hash": getattr(catalog, "catalog_hash", ""),
        "classified_risks_fingerprint": _stable_hash({"classified_risks": risks}),
    }
    stage_output = {
        "strategies": final_strategies,
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
        notes=[
            "Deterministic strategy selection; candidates derived from InstrumentCatalog snapshot only.",
            "No sizing/pricing/execution; downstream stages enforce eligibility, mandates, liquidity, tradability.",
        ],
    )

    return {
        "strategies": final_strategies,
        "rejected": [r.model_dump(mode="json") for r in rejections],
        "disclosures": [d.model_dump(mode="json") for d in disclosures],
        "meta": {
            "engine": {"name": ENGINE_NAME, "version": ENGINE_VERSION},
            "duration_ms": duration_ms,
            "trace_step": step.model_dump(mode="json"),
            "trace_step_obj": step,
            "rejection_objs": rejections,
            "disclosure_objs": disclosures,
        },
    }


__all__ = [
    "ENGINE_NAME",
    "ENGINE_VERSION",
    "STRATEGY_CATALOG",
    "select_strategies",
]
