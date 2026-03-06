"""
app/api/routes/v1_admin_tenants.py

Superuser-only tenant (company) management.

Endpoints:
  GET   /v1/admin/tenants              — list all companies with stats
  GET   /v1/admin/tenants/{company_id} — company detail with usage metrics
  POST  /v1/admin/tenants              — create company
  PATCH /v1/admin/tenants/{company_id} — update company (name, tier, is_active)
  POST  /v1/admin/tenants/{company_id}/suspend — suspend company

All endpoints: superuser only. Non-superusers get 404 (surface not revealed).
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.dependencies import require_superuser
from app.models.organization import Company
from app.models.user import User

router = APIRouter(prefix="/v1/admin/tenants", tags=["v1-admin-tenants"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TenantSummary(BaseModel):
    id: str
    name: str
    slug: str
    plan_tier: str
    is_active: bool
    user_count: int
    position_count: int
    run_count: int
    created_at: str


class TenantDetail(TenantSummary):
    domain: str | None
    logo_url: str | None
    settings: dict | None
    governance_mode: str


class CreateTenantRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    slug: str = Field(..., min_length=2, max_length=64, pattern=r"^[a-z0-9-]+$")
    domain: str | None = None
    plan_tier: str = Field(default="smb", pattern=r"^(lite|smb|professional|enterprise)$")


class UpdateTenantRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    plan_tier: str | None = Field(default=None, pattern=r"^(lite|smb|professional|enterprise)$")
    is_active: bool | None = None
    governance_mode: str | None = Field(default=None, pattern=r"^(solo|team)$")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_company_or_404(session: AsyncSession, company_id: UUID) -> Company:
    result = await session.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


async def _build_tenant_stats(session: AsyncSession, company_ids: list[UUID]) -> dict[UUID, dict]:
    """Return {company_id: {user_count, position_count, run_count}} for a batch."""
    if not company_ids:
        return {}

    # User counts per company
    user_rows = await session.execute(
        text("SELECT company_id, COUNT(*) FROM users WHERE company_id = ANY(:ids) GROUP BY company_id"),
        {"ids": [str(cid) for cid in company_ids]},
    )
    user_map = {UUID(str(r[0])): int(r[1]) for r in user_rows.fetchall() if r[0]}

    # Position counts per company
    pos_rows = await session.execute(
        text("SELECT company_id, COUNT(*) FROM positions WHERE company_id = ANY(:ids) GROUP BY company_id"),
        {"ids": [str(cid) for cid in company_ids]},
    )
    pos_map = {UUID(str(r[0])): int(r[1]) for r in pos_rows.fetchall() if r[0]}

    # Calculation run counts per company
    run_rows = await session.execute(
        text("SELECT company_id, COUNT(*) FROM calculation_runs WHERE company_id = ANY(:ids) GROUP BY company_id"),
        {"ids": [str(cid) for cid in company_ids]},
    )
    run_map = {UUID(str(r[0])): int(r[1]) for r in run_rows.fetchall() if r[0]}

    result = {}
    for cid in company_ids:
        result[cid] = {
            "user_count": user_map.get(cid, 0),
            "position_count": pos_map.get(cid, 0),
            "run_count": run_map.get(cid, 0),
        }
    return result


def _company_to_summary(company: Company, stats: dict) -> TenantSummary:
    settings = company.settings or {}
    return TenantSummary(
        id=str(company.id),
        name=company.name,
        slug=company.slug,
        plan_tier=settings.get("plan_tier", "enterprise"),
        is_active=company.is_active,
        user_count=stats.get("user_count", 0),
        position_count=stats.get("position_count", 0),
        run_count=stats.get("run_count", 0),
        created_at=company.created_at.isoformat() if company.created_at else "",
    )


def _company_to_detail(company: Company, stats: dict) -> TenantDetail:
    settings = company.settings or {}
    base = _company_to_summary(company, stats)
    return TenantDetail(
        **base.model_dump(),
        domain=company.domain,
        logo_url=company.logo_url,
        settings=settings,
        governance_mode=settings.get("governance_mode", "team"),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=list[TenantSummary])
async def list_tenants(
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> list[TenantSummary]:
    """List all companies with usage stats. Superuser only."""
    companies = (await session.execute(select(Company).order_by(Company.created_at.desc()))).scalars().all()
    if not companies:
        return []
    stats = await _build_tenant_stats(session, [c.id for c in companies])
    return [_company_to_summary(c, stats.get(c.id, {})) for c in companies]


@router.get("/{company_id}", response_model=TenantDetail)
async def get_tenant(
    company_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> TenantDetail:
    """Company detail with usage metrics. Superuser only."""
    company = await _get_company_or_404(session, company_id)
    stats = await _build_tenant_stats(session, [company.id])
    return _company_to_detail(company, stats.get(company.id, {}))


@router.post("", response_model=TenantDetail, status_code=201)
async def create_tenant(
    data: CreateTenantRequest,
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> TenantDetail:
    """Create a new company. Superuser only."""
    # Check slug uniqueness
    existing = await session.execute(select(Company).where(Company.slug == data.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug already in use")

    company = Company(
        id=uuid.uuid4(),
        name=data.name,
        slug=data.slug,
        domain=data.domain,
        is_active=True,
        settings={"plan_tier": data.plan_tier, "governance_mode": "team"},
        created_at=datetime.now(UTC),
    )
    session.add(company)
    await session.commit()
    await session.refresh(company)
    return _company_to_detail(company, {})


@router.patch("/{company_id}", response_model=TenantDetail)
async def update_tenant(
    company_id: UUID,
    data: UpdateTenantRequest,
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> TenantDetail:
    """Update company name, tier, or active status. Superuser only."""
    company = await _get_company_or_404(session, company_id)
    settings = dict(company.settings or {})

    if data.name is not None:
        company.name = data.name
    if data.is_active is not None:
        company.is_active = data.is_active
    if data.plan_tier is not None:
        settings["plan_tier"] = data.plan_tier
    if data.governance_mode is not None:
        settings["governance_mode"] = data.governance_mode

    company.settings = settings

    from sqlalchemy.orm import attributes
    attributes.flag_modified(company, "settings")

    await session.commit()
    await session.refresh(company)
    stats = await _build_tenant_stats(session, [company.id])
    return _company_to_detail(company, stats.get(company.id, {}))


@router.post("/{company_id}/suspend", response_model=dict)
async def suspend_tenant(
    company_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> dict:
    """Suspend a company (set is_active=False). Superuser only."""
    company = await _get_company_or_404(session, company_id)
    company.is_active = False
    await session.commit()
    return {"detail": f"Company {company.name} suspended"}
