from __future__ import annotations

"""
app/api/schemas/hedge.py

HedgeCalc Hedge API - Canonical Request / Response Schemas

PURPOSE:
- Freeze the public hedge API contract
- Enforce strict validation BEFORE engine execution
- Prevent silent coercion, drift, or ambiguous payloads
- Regulator / audit / institutional safe

HARD RULES:
- forbid extra fields
- explicit typing only
- no defaults that hide missing data
- deterministic serialization
"""

from typing import Dict, List, Optional, Literal, Any
from pydantic import BaseModel, Field, ConfigDict

# -------------------------------------------------------------------
# JSONValue (Non-recursive, OpenAPI-safe)
# -------------------------------------------------------------------
# IMPORTANT:
# Recursive JSON aliases cause infinite schema expansion in Pydantic v2.
# For public API schemas we use bounded JSON objects.
JSONValue = Any


# -------------------------------------------------------------------
# Base (strict)
# -------------------------------------------------------------------
class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        validate_assignment=True,
        frozen=False,
        str_strip_whitespace=True,
    )


# -------------------------------------------------------------------
# Market Inputs
# -------------------------------------------------------------------
class MarketInput(StrictModel):
    prices: Dict[str, float]
    option_deltas: Optional[Dict[str, float]] = None
    sensitivities: Optional[Dict[str, Dict[str, float]]] = None


# -------------------------------------------------------------------
# Instrument Metadata
# -------------------------------------------------------------------
class InstrumentMeta(StrictModel):
    asset_class: Literal["futures", "perp", "options"]
    underlying: str
    contract_multiplier: float


# -------------------------------------------------------------------
# Positions
# -------------------------------------------------------------------
class Position(StrictModel):
    instrument_id: str
    quantity: float


# -------------------------------------------------------------------
# Scenarios
# -------------------------------------------------------------------
class ScenarioShock(StrictModel):
    equity_move_pct: float = Field(
        ...,
        description="Equity price move as decimal (e.g. -0.05 = -5%)",
    )
    vol_move_pct: Optional[float] = Field(
        default=0.0,
        description="Volatility move as decimal (optional)",
    )


class Scenario(StrictModel):
    scenario_id: Optional[str] = None
    shocks: ScenarioShock


# -------------------------------------------------------------------
# Hedge Request
# -------------------------------------------------------------------
class HedgeRequest(StrictModel):
    """
    Canonical hedge request envelope.
    """

    positions: List[Position]
    instrument_meta: Dict[str, InstrumentMeta]
    market: MarketInput
    scenarios: List[Scenario]

    # Explicit JSON sections (bounded)
    assumptions: Optional[Dict[str, JSONValue]] = None
    policy: Optional[Dict[str, JSONValue]] = None


# -------------------------------------------------------------------
# Hedge Response
# -------------------------------------------------------------------
class WorstCaseValue(StrictModel):
    kind: Literal["number", "text"]
    number: Optional[float] = None
    text: Optional[str] = None


class HedgeSummary(StrictModel):
    cost_total_usd: float
    holding_period_days: Optional[int] = None
    hedge_effectiveness: Dict[str, Optional[float]]
    worst_case: Dict[str, WorstCaseValue]


class HedgeMeta(StrictModel):
    decision_trace: Dict[str, JSONValue]
    duration_ms: int


class HedgeResponse(StrictModel):
    plan_id: str
    summary: HedgeSummary
    meta: HedgeMeta

    stages: Optional[Dict[str, JSONValue]] = None
    plan: Optional[Dict[str, JSONValue]] = None


__all__ = [
    "HedgeRequest",
    "HedgeResponse",
    "MarketInput",
    "InstrumentMeta",
    "Scenario",
]
