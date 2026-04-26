"""Pydantic schemas for Counterparty Hub API."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

LimitType = Literal["notional", "pfe", "settlement", "isda_threshold"]
RiskLevel = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class CounterpartyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    internal_code: str | None = Field(default=None, max_length=32)
    legal_entity_name: str | None = Field(default=None, max_length=240)
    lei: str | None = Field(default=None, max_length=20)
    credit_rating: str | None = Field(default=None, max_length=8)
    rating_agency: str | None = Field(default=None, max_length=32)
    country_iso: str | None = Field(default=None, min_length=2, max_length=2)


class CounterpartyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    internal_code: str | None = Field(default=None, max_length=32)
    legal_entity_name: str | None = Field(default=None, max_length=240)
    lei: str | None = Field(default=None, max_length=20)
    credit_rating: str | None = Field(default=None, max_length=8)
    rating_agency: str | None = Field(default=None, max_length=32)
    country_iso: str | None = Field(default=None, min_length=2, max_length=2)
    active: bool | None = None


class CounterpartyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    name: str
    internal_code: str | None
    legal_entity_name: str | None
    lei: str | None
    credit_rating: str | None
    rating_agency: str | None
    country_iso: str | None
    active: bool
    last_exposure_usd: float | None
    last_pfe_usd: float | None
    risk_level_cached: RiskLevel | None
    last_scored_at: datetime | None
    created_at: datetime
    updated_at: datetime


class CreditLimitCreate(BaseModel):
    counterparty_id: UUID
    limit_type: LimitType
    limit_amount_usd: float = Field(..., gt=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    effective_date: datetime
    expiry_date: datetime | None = None


class CreditLimitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    counterparty_id: UUID
    tenant_id: UUID
    limit_type: LimitType
    limit_amount_usd: float
    currency: str
    effective_date: datetime
    expiry_date: datetime | None
    active: bool
    created_at: datetime
    created_by_user_id: UUID


class ExposureBreakdown(BaseModel):
    counterparty_id: str
    counterparty_name: str
    gross_notional_usd: float
    net_notional_usd: float
    pfe_97_5: float
    mark_to_market: float
    isda_threshold: float
    exposure_above_threshold: float
    concentration_pct: float


class LimitBreach(BaseModel):
    limit_id: UUID
    limit_type: LimitType
    limit_amount_usd: float
    actual_amount_usd: float
    utilization_pct: float  # actual / limit
    severity: Literal["WARNING", "BREACH"]  # WARNING >= 80%, BREACH >= 100%


class ExposureResponse(BaseModel):
    counterparty_id: UUID
    counterparty_name: str
    as_of: datetime
    exposure: ExposureBreakdown
    limits: list[CreditLimitResponse]
    breaches: list[LimitBreach]
    risk_level: RiskLevel


class PortfolioRiskResponse(BaseModel):
    as_of: datetime
    total_gross_usd: float
    total_net_usd: float
    total_pfe_usd: float
    largest_cp_pct: float
    risk_level: RiskLevel
    exposures: list[ExposureBreakdown]
