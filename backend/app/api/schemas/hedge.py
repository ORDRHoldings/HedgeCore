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

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

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
    prices: dict[str, float]
    option_deltas: dict[str, float] | None = None
    sensitivities: dict[str, dict[str, float]] | None = None


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
    vol_move_pct: float | None = Field(
        default=0.0,
        description="Volatility move as decimal (optional)",
    )


class Scenario(StrictModel):
    scenario_id: str | None = None
    shocks: ScenarioShock


# -------------------------------------------------------------------
# Hedge Request
# -------------------------------------------------------------------
class HedgeRequest(StrictModel):
    """
    Canonical hedge request envelope.
    """

    positions: list[Position]
    instrument_meta: dict[str, InstrumentMeta]
    market: MarketInput
    scenarios: list[Scenario]

    # Explicit JSON sections (bounded)
    assumptions: dict[str, JSONValue] | None = None
    policy: dict[str, JSONValue] | None = None


# -------------------------------------------------------------------
# Hedge Response
# -------------------------------------------------------------------
class WorstCaseValue(StrictModel):
    kind: Literal["number", "text"]
    number: float | None = None
    text: str | None = None


class HedgeSummary(StrictModel):
    cost_total_usd: float
    holding_period_days: int | None = None
    hedge_effectiveness: dict[str, float | None]
    worst_case: dict[str, WorstCaseValue]


class HedgeMeta(StrictModel):
    decision_trace: dict[str, JSONValue]
    duration_ms: int


class HedgeResponse(StrictModel):
    plan_id: str
    summary: HedgeSummary
    meta: HedgeMeta

    stages: dict[str, JSONValue] | None = None
    plan: dict[str, JSONValue] | None = None


__all__ = [
    "HedgeRequest",
    "HedgeResponse",
    "MarketInput",
    "InstrumentMeta",
    "Scenario",
]
