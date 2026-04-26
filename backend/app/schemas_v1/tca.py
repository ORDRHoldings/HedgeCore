"""Pydantic schemas for Pre-Trade TCA API."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Direction = Literal["BUY", "SELL"]
Instrument = Literal["FWD", "SPOT", "NDF", "OPT"]
EstimateType = Literal["pre_trade", "post_calc"]


class PreTradeEstimateRequest(BaseModel):
    pair: str = Field(..., min_length=6, max_length=7)  # EURUSD or EUR/USD
    notional_usd: float = Field(..., gt=0)
    direction: Direction
    instrument: Instrument
    execution_window_hours: float = Field(default=24.0, gt=0, le=720)
    market_snapshot_id: UUID | None = None


class TCABreakdown(BaseModel):
    slippage_cost: float
    broker_commission: float
    exchange_fee: float
    clearing_fee: float
    vol_drift_adjustment: float
    total_cost: float
    total_cost_bps: float


class TCABenchmark(BaseModel):
    historical_avg_bps_same_pair: float
    percentile: int  # 0-100
    sample_size: int


class TCAEstimateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    estimate_id: UUID
    estimate_type: EstimateType
    created_at: datetime
    inputs: dict
    breakdown: TCABreakdown
    benchmark: TCABenchmark | None = None
    market_snapshot_id: UUID
    reconciled_at: datetime | None = None
    actual_cost_usd: float | None = None
    variance_bps: float | None = None


class ReconcileRequest(BaseModel):
    settlement_event_id: UUID


class AccuracyBucket(BaseModel):
    key: str  # pair or instrument or month
    sample_size: int
    mean_variance_bps: float
    stdev_variance_bps: float
    mae_bps: float
    rmse_bps: float
    bias_direction: Literal["OVER_ESTIMATE", "UNDER_ESTIMATE", "NEUTRAL"]


class AccuracyReportResponse(BaseModel):
    period: str
    group_by: Literal["pair", "instrument", "month"]
    total_reconciled: int
    buckets: list[AccuracyBucket]
