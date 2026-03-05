"""

Pydantic v2 schemas for Policy templates and activation instances.

"""

from __future__ import annotations

from datetime import datetime
from typing import Any
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

    company_id:  UUID | None  = None      # None -> system template

    name:        str

    short_name:  str

    description: str | None  = None

    risk_posture: str

    category:    str

    config:      Any             # JSONB dict -- passed through as-is

    version:     int

    is_system:   bool

    created_at:  datetime
    created_by:  UUID | None = None
    updated_by:  UUID | None = None
    updated_at:  datetime | None = None
    status:      str | None = None


class PolicyInstanceResponse(BaseModel):

    model_config = ConfigDict(from_attributes=True)



    id:           UUID

    company_id:   UUID

    branch_id:    UUID | None = None

    template_id:  UUID

    activated_by: UUID

    activated_at: datetime

    is_active:    bool

    # Denormalized for convenience -- filled in by route handler

    template:     PolicyTemplateResponse | None = None





class ActivatePolicyRequest(BaseModel):

    template_id: UUID = Field(..., description="ID of the PolicyTemplate to activate")





class CreateTemplateRequest(BaseModel):

    name:        str   = Field(..., min_length=1, max_length=255)

    short_name:  str   = Field(..., min_length=1, max_length=16)

    description: str | None = Field(default=None)

    risk_posture: str  = Field(..., pattern=r"^(CONSERVATIVE|MODERATE|AGGRESSIVE)$")

    category:    str   = Field(..., pattern=r"^(CORPORATE|FINANCIAL|SOVEREIGN|SECTOR)$")

    config:      PolicyConfigSchema

    # SEC-POLICY-1: status is optional; ACTIVE/APPROVED require policy.activate permission
    status: str | None = Field(
        default=None,
        pattern=r"^(DRAFT|REVIEW|APPROVED|ACTIVE|ARCHIVED)$",
        description="Template lifecycle status. ACTIVE/APPROVED require policy.activate permission.",
    )



class UpdateTemplateRequest(BaseModel):
    name:         str | None               = Field(default=None, min_length=1, max_length=255)
    short_name:   str | None               = Field(default=None, min_length=1, max_length=16)
    description:  str | None               = Field(default=None)
    risk_posture: str | None               = Field(default=None, pattern=r"^(CONSERVATIVE|MODERATE|AGGRESSIVE)$")
    category:     str | None               = Field(default=None, pattern=r"^(CORPORATE|FINANCIAL|SOVEREIGN|SECTOR)$")
    config:       PolicyConfigSchema | None = Field(default=None)

class PolicyFavoriteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:          UUID
    user_id:     UUID
    template_id: UUID
    notes:       str | None = None
    created_at:  datetime
    template:    PolicyTemplateResponse | None = None


class AddFavoriteRequest(BaseModel):
    notes: str | None = Field(default=None)


class PolicyExportResponse(BaseModel):
    """Used for export/import of policy templates."""
    export_version: str
    exported_at:    str
    checksum:       str
    template:       PolicyTemplateResponse


class ImportTemplateRequest(BaseModel):
    export_blob:          dict = Field(...)
    name_override:        str | None = Field(default=None, max_length=255)
    short_name_override:  str | None = Field(default=None, max_length=16)


class PolicyAuditEventResponse(BaseModel):
    id:          UUID
    event_type:  str
    description: str
    payload:     dict
    actor_email: str | None = None
    created_at:  datetime


class PolicySeedStatusResponse(BaseModel):
    seeded:               bool
    count:                int
    expected_count:       int
    missing_short_names:  list[str]
