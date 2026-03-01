"""
app/api/routes/v1_company_settings.py

Company governance & configuration settings.

Endpoints:
  GET  /v1/company/settings  -- read governance_mode and other company config
  PATCH /v1/company/settings -- update governance_mode (requires company.edit_settings)

governance_mode values:
  "solo"  -- single-user approval flow; proposer may self-approve
  "team"  -- 4-eyes enforcement; proposer != approver (default)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.organization import Company
from app.models.user import User
from app.services import rbac_service

router = APIRouter(prefix="/v1/company", tags=["v1-company"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CompanySettingsResponse(BaseModel):
    governance_mode: str = "team"
    name: str
    slug: str


class UpdateCompanySettingsRequest(BaseModel):
    governance_mode: Optional[str] = Field(
        default=None,
        pattern="^(solo|team)$",
        description="'solo' allows self-approval; 'team' enforces 4-eyes (default).",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_company(session: AsyncSession, company_id) -> Company:
    result = await session.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/settings", response_model=CompanySettingsResponse)
async def get_company_settings(
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """Return company settings including governance_mode."""
    company  = await _get_company(session, current_user.company_id)
    settings = company.settings or {}
    return CompanySettingsResponse(
        governance_mode=settings.get("governance_mode", "team"),
        name=company.name,
        slug=company.slug,
    )


@router.patch("/settings", response_model=CompanySettingsResponse)
async def update_company_settings(
    data:         UpdateCompanySettingsRequest,
    request:      Request,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """Update company settings. Requires company.edit_settings permission."""
    has_perm = await rbac_service.user_has_permission(
        session, current_user.id, "company.edit_settings"
    )
    if not has_perm and not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Requires company.edit_settings permission",
        )

    company  = await _get_company(session, current_user.company_id)
    settings = dict(company.settings or {})

    if data.governance_mode is not None:
        settings["governance_mode"] = data.governance_mode
        company.settings = settings

    await session.commit()
    await session.refresh(company)

    return CompanySettingsResponse(
        governance_mode=settings.get("governance_mode", "team"),
        name=company.name,
        slug=company.slug,
    )
