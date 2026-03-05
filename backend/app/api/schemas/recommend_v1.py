# backend/app/api/schemas/recommend_v1.py
from __future__ import annotations

"""
UI JSON Schemas -- HedgeCalc Recommend (v1)

Purpose
-------
Frontend-ready, versioned schemas that describe the *contract* of /engine/recommend.
These schemas are:
  - Deterministic
  - Backward-compatible
  - Explicit about optionality
  - Safe for visualization (charts, tables)
  - Version-pinned (v1)

Usage
-----
- Import and expose via OpenAPI if desired
- Use directly in frontend validators (AJV / Zod via JSON export)
- Lock this file for v1; add new versions alongside (recommend_v2.py)

No engine logic lives here.
"""

from typing import Any, Literal, TypedDict

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
    exposures: dict[str, float]
    meta: dict[str, Any]


class RiskClassifierStage(TypedDict, total=False):
    dominant_risk: RiskCode
    confidence: float
    normalized: dict[RiskCode, float]
    meta: dict[str, Any]


class StrategySelectorStage(TypedDict, total=False):
    strategies: list[dict[str, Any]]
    rejected: list[dict[str, Any]]
    meta: dict[str, Any]


class InstrumentMapperStage(TypedDict, total=False):
    mapped_instruments: list[dict[str, Any]]
    rejected: list[dict[str, Any]]
    meta: dict[str, Any]


class HedgeSizerStage(TypedDict, total=False):
    sized_hedges: list[dict[str, Any]]
    rejected: list[dict[str, Any]]
    meta: dict[str, Any]


class CostEngineStage(TypedDict, total=False):
    costs: dict[str, Any]
    breakdown: list[dict[str, Any]]
    rejected: list[dict[str, Any]]
    meta: dict[str, Any]


class ScenarioEngineStage(TypedDict, total=False):
    results: list[dict[str, Any]]
    rejected: list[dict[str, Any]]
    meta: dict[str, Any]


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
    constraints: dict[str, Any]


class RejectionsByStage(TypedDict):
    instrument_mapper: list[dict[str, Any]]
    hedge_sizer: list[dict[str, Any]]
    cost_engine: list[dict[str, Any]]
    scenario_engine: list[dict[str, Any]]


class PlanSummary(TypedDict):
    total_cost_usd: float
    cost_per_1k_hedged: float | None
    scenarios_evaluated: int
    avg_hedge_effectiveness: float | None
    worst_case_pnl_usd: float | None


class FinalPlan(TypedDict):
    hedges: list[HedgeRow]
    rejections: RejectionsByStage
    summary: PlanSummary


# -----------------------------
# Orchestration metadata
# -----------------------------
class DecisionTrace(TypedDict, total=False):
    engine: dict[str, Any]
    stages: dict[str, Any]
    fingerprints: dict[str, str]
    timestamps: dict[str, int]


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
      - `plan_id` is stable for identical inputs
      - `summary` is safe to show at top-level dashboard
      - `stages` is OPTIONAL and present only when requested via policy
      - `plan` contains execution-ready rows + rejections
    """

    plan_id: str
    summary: PlanSummary
    meta: RecommendMeta

    # Optional blocks
    stages: dict[str, Any] | None
    plan: FinalPlan | None


# -----------------------------
# Minimal request schema (UI)
# -----------------------------
class RecommendRequestV1(TypedDict, total=False):
    """
    Minimal UI-side request shape.

    Frontend should not fabricate data.
    Missing inputs are allowed; engine will reject deterministically.
    """

    positions: Any | None
    exposure_input: dict[str, Any] | None
    market: dict[str, Any]
    instrument_specs: dict[str, Any]
    instrument_meta: dict[str, Any]
    assumptions: dict[str, Any]
    scenarios: list[dict[str, Any]]
    policy: dict[str, Any]


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
