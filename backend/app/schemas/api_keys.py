from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.api_key import ApiKey, ApiKeyStatus


# ---------------------------------------------------------------------
# REQUEST SCHEMAS
# ---------------------------------------------------------------------
class ApiKeyCreateRequest(BaseModel):
    name: str | None = Field(
        default=None,
        description="Human-readable name for the API key",
    )
    scopes: list[str] | None = Field(
        default=None,
        description="List of scopes granted to this API key",
    )
    owner_user_id: uuid.UUID | None = Field(
        default=None,
        description="Owning user ID (optional)",
    )
    expires_at: datetime | None = Field(
        default=None,
        description="UTC expiration timestamp",
    )


# ---------------------------------------------------------------------
# RESPONSE SCHEMAS
# ---------------------------------------------------------------------
class ApiKeyResponse(BaseModel):
    id: uuid.UUID
    key_id: str
    name: str | None
    scopes: list[str]
    status: ApiKeyStatus
    owner_user_id: uuid.UUID | None
    expires_at: datetime | None
    created_at: datetime
    last_used_at: datetime | None
    token: str | None = Field(
        default=None,
        description="Full API token (ONLY returned at creation/rotation)",
    )

    @classmethod
    def from_model(cls, model: ApiKey, *, token: str | None = None) -> ApiKeyResponse:
        return cls(
            id=model.id,
            key_id=model.key_id,
            name=model.name,
            scopes=model.scopes or [],
            status=model.status,
            owner_user_id=model.owner_user_id,
            expires_at=model.expires_at,
            created_at=model.created_at,
            last_used_at=model.last_used_at,
            token=token,
        )


class ApiKeyListResponse(BaseModel):
    items: list[ApiKeyResponse]

    @classmethod
    def from_models(cls, models: list[ApiKey]) -> ApiKeyListResponse:
        return cls(
            items=[ApiKeyResponse.from_model(m) for m in models],
        )
