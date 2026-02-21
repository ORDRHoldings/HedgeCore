"""
Pydantic v2 schemas for Position CRUD and exposure aggregation.

Field naming convention: backend uses `flow_type` (avoids Python keyword `type`).
The API client maps flow_type ↔ type at the boundary.
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
