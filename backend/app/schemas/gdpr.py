"""Pydantic schemas for GDPR data-export and erasure endpoints."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class UserDataExportResponse(BaseModel):
    user_id: UUID
    email: str
    full_name: str | None
    created_at: datetime
    company_id: UUID | None
    branch_id: UUID | None
    is_active: bool
    is_superuser: bool
    audit_event_count: int

    model_config = {"from_attributes": True}


class AccountErasureResponse(BaseModel):
    status: str
    user_id: UUID
    message: str
