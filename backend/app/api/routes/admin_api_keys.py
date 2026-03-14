import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.dependencies import require_superuser
from app.models.api_key import ApiKey
from app.models.user import User
from app.schemas.api_keys import (
    ApiKeyCreateRequest,
    ApiKeyListResponse,
    ApiKeyResponse,
)
from app.services.api_keys import (
    create_api_key,
    revoke_api_key,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------
# CANONICAL ROUTER (REQUIRED EXPORT)
# ---------------------------------------------------------------------
router = APIRouter(
    prefix="/api/admin/api-keys",
    tags=["Admin / API Keys"],
)

# ---------------------------------------------------------------------
# ROUTES
# ---------------------------------------------------------------------
@router.post(
    "",
    response_model=ApiKeyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_api_key_endpoint(
    payload: ApiKeyCreateRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(require_superuser),
):
    api_key, token = await create_api_key(
        session=session,
        name=payload.name,
        scopes=payload.scopes,
        owner_user_id=payload.owner_user_id,
        expires_at=payload.expires_at,
    )
    return ApiKeyResponse.from_model(api_key, token=token)


@router.get(
    "",
    response_model=ApiKeyListResponse,
)
async def list_api_keys_endpoint(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(require_superuser),
):
    result = await session.execute(ApiKey.__table__.select())
    keys: list[ApiKey] = result.scalars().all()
    return ApiKeyListResponse.from_models(keys)


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_api_key_endpoint(
    key_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(require_superuser),
):
    api_key = await revoke_api_key(session, key_id)
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )
    return None
