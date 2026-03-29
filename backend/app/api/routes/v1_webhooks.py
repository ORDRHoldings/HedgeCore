"""
app/api/routes/v1_webhooks.py

POST   /v1/webhooks         -- register endpoint (max 5 per tenant, HTTPS only)
GET    /v1/webhooks         -- list active endpoints (secret redacted)
DELETE /v1/webhooks/{id}    -- soft-delete (sets is_active=False)
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.webhook import MAX_WEBHOOKS_PER_TENANT, SUPPORTED_EVENTS, WebhookEndpoint
from app.services import rbac_service
from app.services.webhook_service import generate_webhook_secret

router = APIRouter(prefix="/v1/webhooks", tags=["v1-webhooks"])


class WebhookRegisterRequest(BaseModel):
    url: str
    description: str | None = None
    events: list[str] = []

    @field_validator("events")
    @classmethod
    def validate_events(cls, v: list[str]) -> list[str]:
        invalid = set(v) - SUPPORTED_EVENTS
        if invalid:
            raise ValueError(f"Unsupported events: {invalid}")
        return v

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith("https://"):
            raise ValueError("Webhook URL must use HTTPS.")
        return v


class WebhookResponse(BaseModel):
    id: str
    url: str
    description: str | None
    events: list[str]
    is_active: bool
    created_at: str | None


class WebhookRegisterResponse(WebhookResponse):
    secret: str


async def _check_permission(db: AsyncSession, user: User, codename: str) -> None:
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(db, user.id)
    if codename not in perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permission: {codename}",
        )


def _endpoint_to_dict(ep: WebhookEndpoint) -> dict[str, Any]:
    return {
        "id": str(ep.id),
        "url": ep.url,
        "description": ep.description,
        "events": sorted(ep.get_events()),
        "is_active": ep.is_active,
        "created_at": ep.created_at.isoformat() if ep.created_at else None,
    }


@router.post("", status_code=status.HTTP_201_CREATED, response_model=WebhookRegisterResponse)
async def register_webhook(
    request: Request,
    body: WebhookRegisterRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _check_permission(db, current_user, "api_keys.manage")
    count_result = await db.execute(
        select(func.count(WebhookEndpoint.id))
        .where(WebhookEndpoint.company_id == current_user.company_id)
        .where(WebhookEndpoint.is_active.is_(True))
    )
    count = count_result.scalar()
    if count >= MAX_WEBHOOKS_PER_TENANT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Maximum of {MAX_WEBHOOKS_PER_TENANT} active webhooks per tenant reached.",
        )

    secret = generate_webhook_secret()
    events_str = ",".join(sorted(body.events)) if body.events else ""

    endpoint = WebhookEndpoint(
        company_id=current_user.company_id,
        url=body.url,
        secret=secret,
        description=body.description,
        events=events_str,
        is_active=True,
    )
    db.add(endpoint)
    await db.commit()
    await db.refresh(endpoint)

    return {**_endpoint_to_dict(endpoint), "secret": secret}


@router.get("", response_model=list[WebhookResponse])
async def list_webhooks(
    request: Request,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _check_permission(db, current_user, "api_keys.manage")
    result = await db.execute(
        select(WebhookEndpoint)
        .where(WebhookEndpoint.company_id == current_user.company_id)
        .where(WebhookEndpoint.is_active.is_(True))
        .order_by(WebhookEndpoint.created_at.asc())
    )
    endpoints = result.scalars().all()
    return [_endpoint_to_dict(ep) for ep in endpoints]


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    request: Request,
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    await _check_permission(db, current_user, "api_keys.manage")
    result = await db.execute(
        select(WebhookEndpoint)
        .where(WebhookEndpoint.id == webhook_id)
        .where(WebhookEndpoint.company_id == current_user.company_id)
    )
    endpoint = result.scalar_one_or_none()
    if endpoint is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook endpoint not found.")
    endpoint.is_active = False
    await db.commit()
    return None
