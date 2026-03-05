"""
app/api/routes/admin.py

HedgeCalc - Phase VI
Admin Routes for API Keys & Integration Tokens Management
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_superuser
from app.db.session import get_session
from app.models.api_key import ApiKey
from app.schemas.api_key import (
    ApiKeyCreateRequest,
    ApiKeyPublic,
    ApiKeyRotateRequest,
)

router = APIRouter(prefix="/admin", tags=["admin"])


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
async def get_api_key_by_id(db: AsyncSession, api_key_id: str) -> ApiKey:
    result = await db.execute(
        select(ApiKey).where(ApiKey.key_id == api_key_id)
    )
    api_key = result.scalars().first()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )
    return api_key


# ----------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------
@router.post("/api-keys", response_model=ApiKeyPublic)
async def create_api_key(
    payload: ApiKeyCreateRequest,
    db: AsyncSession = Depends(get_session),
    _: object = Depends(require_superuser),
):
    """
    Create a new API key (admin only).
    """
    new_api_key = ApiKey(
        key_id=f"HK_live_{uuid.uuid4().hex}",
        name=payload.name,
        scopes=payload.scopes,
        status="active",
        owner_user_id=payload.owner_user_id,
        created_at=datetime.utcnow(),
        expires_at=payload.expires_at,
    )

    db.add(new_api_key)
    await db.commit()
    await db.refresh(new_api_key)

    return ApiKeyPublic.model_validate(new_api_key)


@router.post("/api-keys/{api_key_id}/revoke", response_model=ApiKeyPublic)
async def revoke_api_key(
    api_key_id: str,
    db: AsyncSession = Depends(get_session),
    _: object = Depends(require_superuser),
):
    """
    Revoke an API key (admin only).
    """
    api_key = await get_api_key_by_id(db, api_key_id)
    api_key.status = "revoked"

    await db.commit()
    await db.refresh(api_key)

    return ApiKeyPublic.model_validate(api_key)


@router.post("/api-keys/{api_key_id}/rotate", response_model=ApiKeyPublic)
async def rotate_api_key(
    api_key_id: str,
    payload: ApiKeyRotateRequest,
    db: AsyncSession = Depends(get_session),
    _: object = Depends(require_superuser),
):
    """
    Rotate an API key metadata (admin only).
    Secret rotation is handled by the security layer.
    """
    api_key = await get_api_key_by_id(db, api_key_id)

    if payload.name is not None:
        api_key.name = payload.name

    if payload.expires_at is not None:
        api_key.expires_at = payload.expires_at

    api_key.created_at = datetime.utcnow()

    await db.commit()
    await db.refresh(api_key)

    return ApiKeyPublic.model_validate(api_key)


@router.get("/api-keys", response_model=list[ApiKeyPublic])
async def list_api_keys(
    db: AsyncSession = Depends(get_session),
    _: object = Depends(require_superuser),
):
    """
    List all API keys (admin only).
    """
    result = await db.execute(
        select(ApiKey).order_by(ApiKey.created_at.desc())
    )
    api_keys = result.scalars().all()

    return [ApiKeyPublic.model_validate(k) for k in api_keys]
