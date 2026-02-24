"""

Pydantic v2 schemas for Policy templates and activation instances.

"""

from __future__ import annotations



from datetime import datetime

from typing import Any, Optional

from uuid import UUID



from pydantic import BaseModel, ConfigDict, Field





class PolicyConfigSchema(BaseModel):

    """Mirrors frontend PolicyConfig interface."""

    bucket_mode:        str   = Field(default="CALENDAR_MONTH")

    hedge_ratios:       dict  = Field(...)   # {"confirmed": float, "forecast": float}

    cost_assumptions:   dict  = Field(...)   # {"spread_bps": float}

    execution_product:  str   = Field(...)   # "NDF" | "FWD"

    min_trade_size_usd: float = Field(default=0)





class PolicyTemplateResponse(BaseModel):

    model_config = ConfigDict(from_attributes=True)



    id:          UUID

    company_id:  Optional[UUID]  = None      # None -> system template

    name:        str

    short_name:  str

    description: Optional[str]  = None

    risk_posture: str

    category:    str

    config:      Any             # JSONB dict -- passed through as-is

    version:     int

    is_system:   bool

    created_at:  datetime





class PolicyInstanceResponse(BaseModel):

    model_config = ConfigDict(from_attributes=True)



    id:           UUID

    company_id:   UUID

    branch_id:    Optional[UUID] = None

    template_id:  UUID

    activated_by: UUID

    activated_at: datetime

    is_active:    bool

    # Denormalized for convenience -- filled in by route handler

    template:     Optional[PolicyTemplateResponse] = None





class ActivatePolicyRequest(BaseModel):

    template_id: UUID = Field(..., description="ID of the PolicyTemplate to activate")





class CreateTemplateRequest(BaseModel):

    name:        str   = Field(..., min_length=1, max_length=255)

    short_name:  str   = Field(..., min_length=1, max_length=16)

    description: Optional[str] = Field(default=None)

    risk_posture: str  = Field(..., pattern=r"^(CONSERVATIVE|MODERATE|AGGRESSIVE)$")

    category:    str   = Field(..., pattern=r"^(CORPORATE|FINANCIAL|SOVEREIGN|SECTOR)$")

    config:      PolicyConfigSchema



class UpdateTemplateRequest(BaseModel):
    name:         Optional[str]               = Field(default=None, min_length=1, max_length=255)
    short_name:   Optional[str]               = Field(default=None, min_length=1, max_length=16)
    description:  Optional[str]               = Field(default=None)
    risk_posture: Optional[str]               = Field(default=None, pattern=r"^(CONSERVATIVE|MODERATE|AGGRESSIVE)$")
    category:     Optional[str]               = Field(default=None, pattern=r"^(CORPORATE|FINANCIAL|SOVEREIGN|SECTOR)$")
    config:       Optional[PolicyConfigSchema] = Field(default=None)
