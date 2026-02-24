"""
Pydantic v2 schemas for Position CRUD, lifecycle transitions, and exposure aggregation.

Field naming convention: backend uses `flow_type` (avoids Python keyword `type`).
The API client maps flow_type ↔ type at the boundary.

Lifecycle schemas (Phase 0 regulated backbone):
  ExecutePositionRequest  — confirms execution, transitions → HEDGED
  AssignPolicyRequest     — assigns policy_id, transitions → POLICY_ASSIGNED
  RejectPositionRequest   — rejects, transitions → REJECTED
  ReadyToExecuteRequest   — marks ready after run, transitions → READY_TO_EXECUTE
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PositionCreate(BaseModel):
    record_id:   str           = Field(..., min_length=1, max_length=128,
                                       description="Unique identifier within company")
    entity:      str           = Field(..., min_length=1, max_length=255,
                                       description="Legal entity or business division")
    flow_type:   str           = Field(..., pattern=r"^(AR|AP)$",
                                       description="AR = receivable, AP = payable")
    currency:    str           = Field(..., min_length=3, max_length=3,
                                       description="ISO 4217 currency code (3 chars)")
    amount:      float         = Field(..., gt=0, description="Absolute amount > 0")
    value_date:  str           = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$",
                                       description="Settlement date YYYY-MM-DD")
    status:      str           = Field(default="CONFIRMED",
                                       pattern=r"^(CONFIRMED|FORECAST)$")
    description: Optional[str] = Field(default=None, max_length=512)

    @field_validator("currency")
    @classmethod
    def currency_uppercase(cls, v: str) -> str:
        return v.upper()


class PositionUpdate(BaseModel):
    """Partial update — all fields optional. Only provided fields are changed."""
    entity:      Optional[str]   = Field(default=None, min_length=1, max_length=255)
    flow_type:   Optional[str]   = Field(default=None, pattern=r"^(AR|AP)$")
    currency:    Optional[str]   = Field(default=None, min_length=3, max_length=3)
    amount:      Optional[float] = Field(default=None, gt=0)
    value_date:  Optional[str]   = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    status:      Optional[str]   = Field(default=None, pattern=r"^(CONFIRMED|FORECAST)$")
    description: Optional[str]   = Field(default=None, max_length=512)

    @field_validator("currency")
    @classmethod
    def currency_uppercase(cls, v: Optional[str]) -> Optional[str]:
        return v.upper() if v else v


# ── Lifecycle transition request schemas ──────────────────────────────────────

class AssignPolicyRequest(BaseModel):
    """PATCH /v1/positions/{id}/assign-policy — assigns policy, transitions → POLICY_ASSIGNED."""
    policy_instance_id: UUID = Field(
        ..., description="ID of the active PolicyInstance to assign to this position"
    )


class ReadyToExecuteRequest(BaseModel):
    """PATCH /v1/positions/{id}/ready — links a run, transitions → READY_TO_EXECUTE."""
    run_id: str = Field(
        ..., min_length=1, max_length=64,
        description="run_id from POST /v1/calculate that produced the hedge plan"
    )
    hedge_amount: Optional[float] = Field(
        default=None, gt=0,
        description="Hedge notional from the calculation result (locked at this transition)"
    )
    hedge_rate: Optional[float] = Field(
        default=None, gt=0,
        description="Hedge rate from the calculation result (locked at this transition)"
    )


class ExecutePositionRequest(BaseModel):
    """PATCH /v1/positions/{id}/execute — confirms execution, transitions → HEDGED."""
    execution_ref: str = Field(
        ..., min_length=1, max_length=128,
        description="External reference: IBKR order ID, bank ref, broker ticket"
    )
    hedge_amount: Optional[float] = Field(
        default=None, gt=0,
        description="Final executed notional (may differ from planned hedge_amount)"
    )
    hedge_rate: Optional[float] = Field(
        default=None, gt=0,
        description="Final executed rate at confirmation"
    )


class RejectPositionRequest(BaseModel):
    """PATCH /v1/positions/{id}/reject — rejects position, transitions → REJECTED."""
    reason: str = Field(
        ..., min_length=1, max_length=512,
        description="Mandatory rejection reason for audit trail"
    )


# ── Response schema ───────────────────────────────────────────────────────────

class PositionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:          UUID
    company_id:  UUID
    branch_id:   Optional[UUID]  = None
    created_by:  UUID
    record_id:   str
    entity:      str
    flow_type:   str
    currency:    str
    amount:      float
    value_date:  str
    status:      str
    description: Optional[str]   = None
    is_active:   bool
    created_at:  datetime
    updated_at:  datetime

    # Lifecycle fields
    execution_status: str        = "NEW"
    policy_id:        Optional[UUID]    = None
    last_run_id:      Optional[str]     = None
    executed_at:      Optional[datetime] = None
    execution_ref:    Optional[str]     = None
    hedge_amount:     Optional[float]   = None
    hedge_rate:       Optional[float]   = None
    rejection_reason: Optional[str]     = None


class PositionListResponse(BaseModel):
    items: list[PositionResponse]
    total: int


class ExposureAggregation(BaseModel):
    """Per-currency exposure summary for ExposureSummaryWidget."""
    currency:        str
    total_confirmed: float
    total_forecast:  float
    count_confirmed: int
    count_forecast:  int
