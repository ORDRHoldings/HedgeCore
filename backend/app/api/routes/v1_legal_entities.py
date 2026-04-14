# backend/app/api/routes/v1_legal_entities.py
"""v1 legal entities — group treasury entity hierarchy."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.user import User
from app.schemas_v1.cash import (
    LegalEntityCreate, LegalEntityUpdate, LegalEntityCloseRequest, LegalEntityResponse,
)
from app.services.legal_entity_service import (
    create_entity, update_entity, close_entity, list_entities, get_entity, EntityNotFoundError,
)

router = APIRouter(prefix="/v1/cash/entities", tags=["cash-entities"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role for this action")


@router.get("", response_model=list[LegalEntityResponse])
async def list_entities_route(
    status: str | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_entities(db, company_id=current_user.company_id, status=status)


@router.post("", response_model=LegalEntityResponse, status_code=201)
async def create_entity_route(
    payload: LegalEntityCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    return await create_entity(db, company_id=current_user.company_id,
                                payload=payload.model_dump(exclude_none=True),
                                created_by=current_user.id)


@router.get("/{entity_id}", response_model=LegalEntityResponse)
async def get_entity_route(
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    try:
        return await get_entity(db, entity_id=entity_id, company_id=current_user.company_id)
    except EntityNotFoundError:
        raise HTTPException(status_code=404, detail="Entity not found")


@router.patch("/{entity_id}", response_model=LegalEntityResponse)
async def update_entity_route(
    entity_id: uuid.UUID,
    payload: LegalEntityUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    try:
        return await update_entity(db, entity_id=entity_id, company_id=current_user.company_id,
                                    payload=payload.model_dump(exclude_none=True),
                                    actor_id=current_user.id)
    except EntityNotFoundError:
        raise HTTPException(status_code=404, detail="Entity not found")


@router.post("/{entity_id}/close", response_model=LegalEntityResponse)
async def close_entity_route(
    entity_id: uuid.UUID,
    payload: LegalEntityCloseRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    try:
        return await close_entity(db, entity_id=entity_id, company_id=current_user.company_id,
                                   status=payload.status, actor_id=current_user.id)
    except EntityNotFoundError:
        raise HTTPException(status_code=404, detail="Entity not found")
