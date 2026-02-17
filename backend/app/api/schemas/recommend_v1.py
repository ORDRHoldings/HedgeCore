# backend/app/api/schemas/recommend_v1.py
from __future__ import annotations

"""
UI JSON Schemas — HedgeCalc Recommend (v1)

Purpose
-------
Frontend-ready, versioned schemas that describe the *contract* of /engine/recommend.
These schemas are:
  • Deterministic
  • Backward-compatible
  • Explicit about optionality
  • Safe for visualization (charts, tables)
  • Version-pinned (v1)

Usage
-----
- Import and expose via OpenAPI if desired
- Use directly in frontend validators (AJV / Zod via JSON export)
- Lock this file for v1; add new versions alongside (recommend_v2.py)

No engine logic lives here.
"""

from typing import Any, Dict, List, Literal, Optional, TypedDict


# -----------------------------
# Common primitives
# -----------------------------
RiskCode = Literal[
    "R1_DELTA",
    "R2_GAMMA",
    "R3_VEGA",
    "R4_THETA",
    "R5_VOL_OF_VOL",
    "R6_RATE",
    "R7_INFLATION",
    "R8_CRYPTO",
]

AssetClass = Literal["futures", "options", "etf", "perp", "fx", "crypto_spot"]


# -----------------------------
# Stage payloads (read-only)
# -----------------------------
class ExposureStage(TypedDict, total=False):
    exposures: Dict[str, float]
    meta: Dict[str, Any]


class RiskClassifierStage(TypedDict, total=False):
    dominant_risk: RiskCode
    confidence: float
    normalized: Dict[RiskCode, float]
    meta: Dict[str, Any]


class StrategySelectorStage(TypedDict, total=False):
    strategies: List[Dict[str, Any]]
    rejected: List[Dict[str, Any]]
    meta: Dict[str, Any]


class InstrumentMapperStage(TypedDict, total=False):
    mapped_instruments: List[Dict[str, Any]]
    rejected: List[Dict[str, Any]]
    meta: Dict[str, Any]


class HedgeSizerStage(TypedDict, total=False):
    sized_hedges: List[Dict[str, Any]]
    rejected: List[Dict[str, Any]]
    meta: Dict[str, Any]


class CostEngineStage(TypedDict, total=False):
    costs: Dict[str, Any]
    breakdown: List[Dict[str, Any]]
    rejected: List[Dict[str, Any]]
    meta: Dict[str, Any]


class ScenarioEngineStage(TypedDict, total=False):
    results: List[Dict[str, Any]]
    rejected: List[Dict[str, Any]]
    meta: Dict[str, Any]


# -----------------------------
# Final Plan object
# -----------------------------
class HedgeRow(TypedDict, total=False):
    strategy_id: str
    instrument_id: str
    asset_class: AssetClass
    contracts: float
    notional_usd: float
    cost_model: str
    constraints: Dict[str, Any]


class RejectionsByStage(TypedDict):
    instrument_mapper: List[Dict[str, Any]]
    hedge_sizer: List[Dict[str, Any]]
    cost_engine: List[Dict[str, Any]]
    scenario_engine: List[Dict[str, Any]]


class PlanSummary(TypedDict):
    total_cost_usd: float
    cost_per_1k_hedged: Optional[float]
    scenarios_evaluated: int
    avg_hedge_effectiveness: Optional[float]
    worst_case_pnl_usd: Optional[float]


class FinalPlan(TypedDict):
    hedges: List[HedgeRow]
    rejections: RejectionsByStage
    summary: PlanSummary


# -----------------------------
# Orchestration metadata
# -----------------------------
class DecisionTrace(TypedDict, total=False):
    engine: Dict[str, Any]
    stages: Dict[str, Any]
    fingerprints: Dict[str, str]
    timestamps: Dict[str, int]


class RecommendMeta(TypedDict):
    decision_trace: DecisionTrace
    duration_ms: int


# -----------------------------
# Top-level response schema
# -----------------------------
class RecommendResponseV1(TypedDict):
    """
    Canonical response for /engine/recommend (v1).

    Notes for UI:
      • `plan_id` is stable for identical inputs
      • `summary` is safe to show at top-level dashboard
      • `stages` is OPTIONAL and present only when requested via policy
      • `plan` contains execution-ready rows + rejections
    """

    plan_id: str
    summary: PlanSummary
    meta: RecommendMeta

    # Optional blocks
    stages: Optional[Dict[str, Any]]
    plan: Optional[FinalPlan]


# -----------------------------
# Minimal request schema (UI)
# -----------------------------
class RecommendRequestV1(TypedDict, total=False):
    """
    Minimal UI-side request shape.

    Frontend should not fabricate data.
    Missing inputs are allowed; engine will reject deterministically.
    """

    positions: Optional[Any]
    exposure_input: Optional[Dict[str, Any]]
    market: Dict[str, Any]
    instrument_specs: Dict[str, Any]
    instrument_meta: Dict[str, Any]
    assumptions: Dict[str, Any]
    scenarios: List[Dict[str, Any]]
    policy: Dict[str, Any]


__all__ = [
    "RecommendRequestV1",
    "RecommendResponseV1",
    "ExposureStage",
    "RiskClassifierStage",
    "StrategySelectorStage",
    "InstrumentMapperStage",
    "HedgeSizerStage",
    "CostEngineStage",
    "ScenarioEngineStage",
    "FinalPlan",
    "PlanSummary",
]
