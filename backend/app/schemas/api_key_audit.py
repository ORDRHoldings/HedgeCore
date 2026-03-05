"""
app/schemas/api_key_audit.py

HedgeCalc - API Key Audit Schemas
Admin-only, read-only representations.
No secrets, no hashes, no tokens.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ApiKeyAuditBase(BaseModel):
    api_key_id: str = Field(..., description="Public API key identifier")
    event: str = Field(
        ...,
        description="Audit event type (used, denied, revoked, rotated, expired)",
    )
    ip_address: str | None = Field(None, description="Client IP address")
    user_agent: str | None = Field(None, description="HTTP user agent")
    request_path: str | None = Field(None, description="API endpoint path")
    request_method: str | None = Field(None, description="HTTP method")
    created_at: datetime = Field(..., description="Event timestamp (UTC)")


class ApiKeyAuditLogPublic(ApiKeyAuditBase):
    """
    Public-facing admin audit log record.
    Used by /admin/api-key-audit endpoints.
    """

    id: str = Field(..., description="Audit log UUID")


class ApiKeyAuditLogListResponse(BaseModel):
    total: int = Field(..., description="Total audit records")
    items: list[ApiKeyAuditLogPublic]
