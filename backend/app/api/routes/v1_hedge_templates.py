"""
Hedge Templates API -- /v1/hedge-templates/* (P2-C).

Library of reusable hedge strategy blueprints:
  GET    /v1/hedge-templates                -> list system + company templates
  GET    /v1/hedge-templates/{id}           -> detail
  POST   /v1/hedge-templates                -> create company template
  PUT    /v1/hedge-templates/{id}           -> update company template
  DELETE /v1/hedge-templates/{id}           -> soft-delete company template
  POST   /v1/hedge-templates/{id}/apply     -> project template onto a position

Professional-tier gated. Mutations require trades.create permission.
System templates are immutable and visible to all tenants.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.plan_enforcement import require_plan_tier
from app.models.position import Position
from app.models.user import User
from app.services import hedge_template_service as svc
from app.services.audit_emit import emit_audit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/hedge-templates", tags=["v1-hedge-templates"])


# ── Schemas ──────────────────────────────────────────────────────────

class InstrumentLegInput(BaseModel):
    instrument: str = Field(..., description="FORWARD|VANILLA_CALL|VANILLA_PUT|NDF|COLLAR")
    weight: float = Field(..., gt=0, le=1.0)
    tenor_days: int | None = Field(default=None, gt=0)
    strike_pct: float | None = Field(default=None, gt=0)
    direction: str = Field(..., description="BUY|SELL")
    tranche_label: str | None = None


class TemplateCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    short_name: str = Field(..., min_length=1, max_length=32)
    category: str = Field(..., description="FORWARD|OPTION|LAYERED|ROLLING|COLLAR|MIXED")
    description: str | None = None
    instrument_mix: list[InstrumentLegInput] = Field(..., min_length=1, max_length=24)


class TemplateUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    category: str | None = None
    instrument_mix: list[InstrumentLegInput] | None = Field(default=None, min_length=1, max_length=24)
    is_active: bool | None = None


class ApplyRequest(BaseModel):
    position_id: UUID


class TemplateResponse(BaseModel):
    id: UUID
    company_id: UUID | None
    name: str
    short_name: str
    description: str | None
    category: str
    instrument_mix: list[dict[str, Any]]
    version: int
    is_system: bool
    is_active: bool
    created_at: str | None
    updated_at: str | None

    @classmethod
    def from_model(cls, m) -> "TemplateResponse":
        return cls(
            id=m.id,
            company_id=m.company_id,
            name=m.name,
            short_name=m.short_name,
            description=m.description,
            category=m.category,
            instrument_mix=m.instrument_mix,
            version=m.version or 1,
            is_system=m.is_system,
            is_active=m.is_active,
            created_at=m.created_at.isoformat() if isinstance(m.created_at, datetime) else None,
            updated_at=m.updated_at.isoformat() if isinstance(m.updated_at, datetime) else None,
        )


class TemplateListResponse(BaseModel):
    items: list[TemplateResponse]
    total: int


class ApplyResponse(BaseModel):
    template_id: UUID
    position_id: UUID
    legs: list[dict[str, Any]]
    total_notional: float
    currency: str


# ── Permission helper ────────────────────────────────────────────────

async def _require_trades_create(session: AsyncSession, user: User) -> None:
    if user.is_superuser:
        return
    from app.services import rbac_service
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if "trades.create" not in perms:
        raise HTTPException(status_code=403, detail="Missing permission: trades.create")


# ── Routes ───────────────────────────────────────────────────────────

@router.get("", response_model=TemplateListResponse)
async def list_templates(
    category: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    templates = await svc.list_templates(
        session, current_user,
        category=category, include_inactive=include_inactive,
    )
    items = [TemplateResponse.from_model(t) for t in templates]
    return {"items": items, "total": len(items)}


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    try:
        tmpl = await svc.get_template(session, current_user, template_id)
    except svc.HedgeTemplateError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return TemplateResponse.from_model(tmpl)


@router.post("", response_model=TemplateResponse, status_code=201)
async def create_template(
    body: TemplateCreateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    await _require_trades_create(session, current_user)
    try:
        tmpl = await svc.create_template(
            session, current_user,
            name=body.name,
            short_name=body.short_name,
            category=body.category,
            description=body.description,
            instrument_mix=[leg.model_dump() for leg in body.instrument_mix],
        )
    except svc.HedgeTemplateError as e:
        raise HTTPException(status_code=422, detail=str(e))

    await emit_audit(
        session=session, user=current_user,
        event_type="CONFIG",
        description=f"Hedge template created: {tmpl.short_name} ({tmpl.category})",
        entity_type="hedge_template",
        entity_id=str(tmpl.id),
        payload={"name": tmpl.name, "category": tmpl.category, "legs": len(tmpl.instrument_mix)},
    )
    return TemplateResponse.from_model(tmpl)


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: UUID,
    body: TemplateUpdateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    await _require_trades_create(session, current_user)
    try:
        tmpl = await svc.update_template(
            session, current_user, template_id,
            name=body.name,
            description=body.description,
            category=body.category,
            instrument_mix=[leg.model_dump() for leg in body.instrument_mix] if body.instrument_mix else None,
            is_active=body.is_active,
        )
    except svc.HedgeTemplateError as e:
        status = 422 if "system" in str(e).lower() or "must be" in str(e).lower() else 404
        raise HTTPException(status_code=status, detail=str(e))

    await emit_audit(
        session=session, user=current_user,
        event_type="CONFIG",
        description=f"Hedge template updated: {tmpl.short_name} (v{tmpl.version})",
        entity_type="hedge_template", entity_id=str(tmpl.id),
        payload={"version": tmpl.version, "is_active": tmpl.is_active},
    )
    return TemplateResponse.from_model(tmpl)


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    await _require_trades_create(session, current_user)
    try:
        await svc.delete_template(session, current_user, template_id)
    except svc.HedgeTemplateError as e:
        status = 422 if "system" in str(e).lower() else 404
        raise HTTPException(status_code=status, detail=str(e))

    await emit_audit(
        session=session, user=current_user,
        event_type="CONFIG",
        description=f"Hedge template soft-deleted: {template_id}",
        entity_type="hedge_template", entity_id=str(template_id),
        payload={"action": "soft_delete"},
    )
    return None


@router.post("/{template_id}/apply", response_model=ApplyResponse)
async def apply_to_position(
    template_id: UUID,
    body: ApplyRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    try:
        tmpl = await svc.get_template(session, current_user, template_id)
    except svc.HedgeTemplateError as e:
        raise HTTPException(status_code=404, detail=str(e))

    position = await session.get(Position, body.position_id)
    if position is None or position.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="position not found")

    legs = svc.apply_template_to_position(tmpl, position)
    total = round(sum(float(leg["notional"]) for leg in legs), 2)

    return ApplyResponse(
        template_id=tmpl.id,
        position_id=position.id,
        legs=legs,
        total_notional=total,
        currency=position.currency,
    )
