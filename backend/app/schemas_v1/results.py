from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

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
    run_hash: str
    trades_hash: str
    hedges_hash: str
    market_hash: str
    policy_hash: str
    # Market snapshot provenance (populated when backend-authoritative snapshot is used)
    market_snapshot_id: str | None = None
    market_snapshot_hash: str | None = None
    market_provider: str | None = None
    market_fetched_at: str | None = None
    market_as_of: str | None = None
    market_data_class: str | None = None
    market_is_synthetic_forward: bool | None = None


class TraceEvent(BaseModel):
    step: str
    timestamp: datetime
    detail: str
    data: dict = {}


class TraceLite(BaseModel):
    run_id: str
    events: list[TraceEvent]


class CalculateRequest(BaseModel):
    trades: list = Field(..., max_length=10_000)
    hedges: list = Field(default_factory=list, max_length=10_000)
    market: dict
    policy: dict
    # Optional: pass a previously-persisted market snapshot ID instead of
    # embedding raw market data. When provided, the backend loads the snapshot
    # from the WORM store and uses it as the authoritative market input.
    market_snapshot_id: str | None = None


class CalculateResponse(BaseModel):
    run_id: str
    validation_report: ValidationReport
    hedge_plan: HedgePlan
    scenario_results: ScenarioResults
    run_envelope: RunEnvelope
    trace_lite: TraceLite


# ── Multi-Currency Generic Results (backward-compatible additions) ────────────

class GenericHedgePlanSummary(BaseModel):
    pair: str
    local_ccy: str
    total_commercial_exposure_local: float
    total_existing_hedges_local: float
    total_action_local: float
    total_action_usd: float
    total_friction_usd: float
    total_hedge_position_local: float
    total_residual_local: float


class GenericBucketResult(BaseModel):
    """Currency-agnostic bucket result for any pair."""
    bucket: str
    pair: str
    local_ccy: str
    confirmed_flow_local: float
    forecast_flow_local: float
    commercial_exposure_local: float
    existing_hedges_local: float
    target_signed_local: float
    action_local: float
    action_direction: str | None
    forward_rate: float
    carry_note: str
    action_usd: float
    friction_usd: float
    suppressed: bool
    hedge_position_local: float
    residual_local: float

    def to_legacy_bucket(self) -> "BucketResult":
        """Convert to legacy BucketResult for USDMXN backward compat."""
        return BucketResult(
            bucket=self.bucket,
            confirmed_flow_mxn=self.confirmed_flow_local,
            forecast_flow_mxn=self.forecast_flow_local,
            commercial_exposure_mxn=self.commercial_exposure_local,
            existing_hedges_mxn=self.existing_hedges_local,
            target_signed_mxn=self.target_signed_local,
            action_mxn=self.action_local,
            action_direction=self.action_direction,
            forward_rate=self.forward_rate,
            carry_note=self.carry_note,
            action_usd=self.action_usd,
            friction_usd=self.friction_usd,
            suppressed=self.suppressed,
            hedge_position_mxn=self.hedge_position_local,
            residual_mxn=self.residual_local,
        )


class GenericHedgePlan(BaseModel):
    """Multi-currency hedge plan."""
    pair: str
    local_ccy: str
    buckets: list[GenericBucketResult]
    summary: GenericHedgePlanSummary

    def to_legacy_plan(self) -> "HedgePlan":
        """Convert to legacy HedgePlan for USDMXN backward compat."""
        from app.schemas_v1.results import HedgePlan, HedgePlanSummary
        legacy_buckets = [b.to_legacy_bucket() for b in self.buckets]
        return HedgePlan(
            buckets=legacy_buckets,
            summary=HedgePlanSummary(
                total_commercial_exposure_mxn=self.summary.total_commercial_exposure_local,
                total_existing_hedges_mxn=self.summary.total_existing_hedges_local,
                total_action_mxn=self.summary.total_action_local,
                total_action_usd=self.summary.total_action_usd,
                total_friction_usd=self.summary.total_friction_usd,
                total_hedge_position_mxn=self.summary.total_hedge_position_local,
                total_residual_mxn=self.summary.total_residual_local,
            ),
        )
