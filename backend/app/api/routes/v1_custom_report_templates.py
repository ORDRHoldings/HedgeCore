"""
Custom Report Templates API -- /v1/custom-report-templates/* (P2-B).

User-defined, tenant-scoped reusable report templates.

  GET    /v1/custom-report-templates              -> list this tenant's templates
  GET    /v1/custom-report-templates/{id}         -> detail
  POST   /v1/custom-report-templates              -> create
  PUT    /v1/custom-report-templates/{id}         -> update
  DELETE /v1/custom-report-templates/{id}         -> soft-delete

Professional-tier gated. Mutations require reports.write (or reports.read+
reports.write) RBAC permission.
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
from app.models.user import User
from app.services import custom_report_template_service as svc

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/v1/custom-report-templates",
    tags=["v1-custom-report-templates"],
)


# ── Schemas ──────────────────────────────────────────────────────────

class SectionInput(BaseModel):
    type: str = Field(..., description="SectionType enum")
    title: str = Field(..., min_length=1, max_length=200)
    order: int = Field(..., ge=0)
    status: str = Field(default="INCLUDED", description="INCLUDED|EXCLUDED|DRAFT")
    page_break_before: bool = False


class CreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    short_name: str = Field(..., min_length=1, max_length=64)
    category: str = Field(..., description="ReportCategory enum")
    description: str | None = None
    audience: list[str] = Field(default_factory=list)
    sections: list[SectionInput] = Field(..., min_length=1, max_length=40)
    default_bindings: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class UpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    category: str | None = None
    audience: list[str] | None = None
    sections: list[SectionInput] | None = Field(default=None, min_length=1, max_length=40)
    default_bindings: dict[str, Any] | None = None
    tags: list[str] | None = None
    is_active: bool | None = None


class TemplateResponse(BaseModel):
    id: UUID
    company_id: UUID
    user_id: UUID
    name: str
    short_name: str
    description: str | None
    category: str
    audience: list[str]
    sections: list[dict[str, Any]]
    default_bindings: dict[str, Any]
    tags: list[str]
    is_active: bool
    created_at: str | None
    updated_at: str | None

    @classmethod
    def from_model(cls, m) -> TemplateResponse:
        return cls(
            id=m.id,
            company_id=m.company_id,
            user_id=m.user_id,
            name=m.name,
            short_name=m.short_name,
            description=m.description,
            category=m.category,
            audience=m.audience or [],
            sections=m.sections or [],
            default_bindings=m.default_bindings or {},
            tags=m.tags or [],
            is_active=m.is_active,
            created_at=m.created_at.isoformat() if isinstance(m.created_at, datetime) else None,
            updated_at=m.updated_at.isoformat() if isinstance(m.updated_at, datetime) else None,
        )


class ListResponse(BaseModel):
    items: list[TemplateResponse]
    total: int


# ── Permission helper ────────────────────────────────────────────────

async def _require_reports_write(session: AsyncSession, user: User) -> None:
    if user.is_superuser:
        return
    from app.services import rbac_service
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if "reports.write" not in perms and "reports.create" not in perms:
        raise HTTPException(
            status_code=403, detail="Missing permission: reports.write"
        )


# ── Routes ───────────────────────────────────────────────────────────

@router.get("", response_model=ListResponse)
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
    tmpl = await svc.get_template(session, current_user, template_id)
    if tmpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return TemplateResponse.from_model(tmpl)


@router.post("", response_model=TemplateResponse, status_code=201)
async def create_template(
    body: CreateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    await _require_reports_write(session, current_user)
    try:
        tmpl = await svc.create_template(
            session, current_user,
            name=body.name,
            short_name=body.short_name,
            category=body.category,
            description=body.description,
            audience=body.audience,
            sections=[s.model_dump() for s in body.sections],
            default_bindings=body.default_bindings,
            tags=body.tags,
        )
    except svc.CustomReportTemplateError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return TemplateResponse.from_model(tmpl)


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: UUID,
    body: UpdateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    await _require_reports_write(session, current_user)
    try:
        tmpl = await svc.update_template(
            session, current_user, template_id,
            name=body.name,
            description=body.description,
            category=body.category,
            audience=body.audience,
            sections=(
                [s.model_dump() for s in body.sections]
                if body.sections is not None else None
            ),
            default_bindings=body.default_bindings,
            tags=body.tags,
            is_active=body.is_active,
        )
    except svc.CustomReportTemplateError as e:
        msg = str(e)
        if msg == "template not found":
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=422, detail=msg)
    return TemplateResponse.from_model(tmpl)


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
):
    await _require_reports_write(session, current_user)
    try:
        await svc.delete_template(session, current_user, template_id)
    except svc.CustomReportTemplateError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return None
