"""
app/schemas/api_key.py

HedgeCalc - Phase VI
Pydantic schemas for Service API Keys & Integration Tokens.

Purpose:
- Defines admin request/response DTOs for creating, listing, and rotating API keys.
- Secrets are only returned once on creation/rotation.
- Aligns tightly with ORM model (app.models.api_key.ApiKey).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, constr
from app.models.api_key import ApiKeyStatus


# -------------------------------------------------------------------------
# ? Base Schema (shared fields)
# -------------------------------------------------------------------------
class ApiKeyBase(BaseModel):
    """Shared read-only structure (never includes secret)."""

    key_id: str = Field(..., description="Public identifier for this key.")
    name: Optional[str] = Field(None, description="Human-readable label for the API key.")
    scopes: List[str] = Field(default_factory=list, description="List of allowed scopes.")
    status: ApiKeyStatus = Field(..., description="Status of the API key (active or revoked).")
    owner_user_id: Optional[uuid.UUID] = Field(None, description="User ID of owner (if any).")
    created_at: Optional[datetime] = Field(None, description="Creation timestamp.")
    last_used_at: Optional[datetime] = Field(None, description="Last use timestamp.")
    expires_at: Optional[datetime] = Field(None, description="Expiration timestamp, if set.")


# -------------------------------------------------------------------------
# ? Request Schemas
# -------------------------------------------------------------------------
class ApiKeyCreateRequest(BaseModel):
    """Admin request to create a new API key."""

    name: Optional[str] = Field(None, description="Human label (e.g., 'MarketData Service').")
    scopes: List[str] = Field(
        default_factory=list,
        description="List of allowed scopes (e.g., ['read:quotes', 'write:orders']).",
    )
    owner_user_id: Optional[uuid.UUID] = Field(None, description="Optional user who owns this key.")
    expires_at: Optional[datetime] = Field(None, description="Optional expiration timestamp.")


class ApiKeyRotateRequest(BaseModel):
    """Request schema for rotation. May optionally change expiry or label."""

    name: Optional[str] = Field(None, description="Optional new name/label.")
    expires_at: Optional[datetime] = Field(None, description="Optional new expiry date.")


# -------------------------------------------------------------------------
# ? Response Schemas
# -------------------------------------------------------------------------
class ApiKeyPublic(BaseModel):
    """Redacted public view of API key (used in listings)."""

    id: uuid.UUID = Field(..., description="Internal UUID identifier.")
    key_id: str = Field(..., description="Short identifier for this key.")
    name: Optional[str] = Field(None, description="Human-readable label.")
    scopes: List[str] = Field(default_factory=list, description="Allowed scopes.")
    status: ApiKeyStatus = Field(..., description="Lifecycle status.")
    owner_user_id: Optional[uuid.UUID] = Field(None, description="User owner ID, if set.")
    created_at: datetime = Field(..., description="Creation timestamp.")
    last_used_at: Optional[datetime] = Field(None, description="Last used timestamp.")
    expires_at: Optional[datetime] = Field(None, description="Expiration timestamp.")

    model_config = {"from_attributes": True}


class ApiKeySecretResponse(BaseModel):
    """
    Returned ONCE on creation or rotation.
    Contains full key token (HK_live_{keyid}.{secret}) -- never stored, never logged.
    """

    key_id: str = Field(..., description="Public identifier portion of the key.")
    token: str = Field(..., description="Full API key string (returned once only). Example: HK_live_abcd1234.xyzSecretValue")
    expires_at: Optional[datetime] = Field(None, description="Expiration timestamp if applicable.")


# -------------------------------------------------------------------------
# ? Admin Composite Schemas
# -------------------------------------------------------------------------
class ApiKeyListResponse(BaseModel):
    """Paginated or bulk list of API keys for admin UI."""

    total: int = Field(..., description="Total number of keys in system (filtered).")
    items: List[ApiKeyPublic] = Field(..., description="List of API keys.")


# -------------------------------------------------------------------------
# ? Validation & Metadata
# -------------------------------------------------------------------------
class ApiKeyVerifyHeader(BaseModel):
    """Schema to validate X-API-Key header for manual inspection or testing."""

    x_api_key: constr(
        pattern=r"^HK_live_[A-Za-z0-9]+?\.[A-Za-z0-9\-_]{20,64}$"
    ) = Field(
        ...,
        description="Full API key format: HK_live_{keyid}.{secret}. Must match expected pattern.",
        examples=["HK_live_8F2k3bC7zL.sR4TxQm1u9vWyzD8hPnJ5cK2aR"],
    )
