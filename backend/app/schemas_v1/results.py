from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas_v1.errors import ValidationErrorDetail
from app.schemas_v1.policy import PolicyConfig


class ValidationReport(BaseModel):
    status: Literal["PASS", "FAIL"]
    errors: list[ValidationErrorDetail]
    warnings: list[str]


class BucketResult(BaseModel):
    bucket: str
    confirmed_flow_mxn: float
    forecast_flow_mxn: float
    commercial_exposure_mxn: float
    existing_hedges_mxn: float
    target_signed_mxn: float
    action_mxn: float
    action_direction: str | None
    forward_rate: float
    carry_note: str
    action_usd: float
    friction_usd: float
    suppressed: bool
    hedge_position_mxn: float
    residual_mxn: float


class HedgePlanSummary(BaseModel):
    total_commercial_exposure_mxn: float
    total_existing_hedges_mxn: float
    total_action_mxn: float
    total_action_usd: float
    total_friction_usd: float
    total_hedge_position_mxn: float
    total_residual_mxn: float


class HedgePlan(BaseModel):
    buckets: list[BucketResult]
    summary: HedgePlanSummary


class ScenarioBucketResult(BaseModel):
    bucket: str
    sigma: float
    shocked_spot: float
    unhedged_usd: float
    hedged_usd: float
    hedge_benefit_usd: float


class ScenarioTotalResult(BaseModel):
    sigma: float
    shocked_spot: float
    total_unhedged_usd: float
    total_hedged_usd: float
    total_hedge_benefit_usd: float


class ScenarioResults(BaseModel):
    sigmas: list[float]
    per_bucket: list[ScenarioBucketResult]
    totals: list[ScenarioTotalResult]


class RunEnvelope(BaseModel):
    run_id: str
    timestamp: datetime
    engine_version: str
    inputs_hash: str
    outputs_hash: str
    trades_hash: str
    hedges_hash: str
    market_hash: str
    policy_hash: str


class TraceEvent(BaseModel):
    step: str
    timestamp: datetime
    detail: str
    data: dict = {}


class TraceLite(BaseModel):
    run_id: str
    events: list[TraceEvent]


class CalculateRequest(BaseModel):
    trades: list  # Will accept TradeRow dicts
    hedges: list  # Will accept HedgeRow dicts
    market: dict
    policy: dict


class CalculateResponse(BaseModel):
    run_id: str
    validation_report: ValidationReport
    hedge_plan: HedgePlan
    scenario_results: ScenarioResults
    run_envelope: RunEnvelope
    trace_lite: TraceLite
