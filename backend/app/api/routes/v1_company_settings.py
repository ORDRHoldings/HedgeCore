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

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.audit_event import build_audit_event
from app.models.organization import Company
from app.models.user import User
from app.services import rbac_service

router = APIRouter(prefix="/v1/company", tags=["v1-company"])


# ---------------------------------------------------------------------------
# Sub-models for structured payload validation
# ---------------------------------------------------------------------------

class PolicyLimitsPayload(BaseModel):
    confirmed_hedge_ratio: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    forecast_hedge_ratio: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    min_trade_size_usd: Optional[float] = Field(default=None, ge=10_000)
    max_single_trade_usd: Optional[float] = Field(default=None, ge=100_000)
    cooling_off_hours: Optional[int] = Field(default=None, ge=0, le=168)
    spread_bps: Optional[int] = Field(default=None, ge=0, le=500)
    required_approvals: Optional[int] = Field(default=None, ge=1, le=10)
    integrity_threshold: Optional[int] = Field(default=None, ge=0, le=100)


_VALID_PRODUCTS = {"NDF", "FWD", "FUTURES"}
_VALID_STRESS_SIGMAS = {0.08, 0.15, 0.22}


class ExecutionSettingsPayload(BaseModel):
    default_product: Optional[str] = Field(default=None)
    stress_sigma: Optional[float] = Field(default=None)
    max_friction_bps: Optional[int] = Field(default=None, ge=0, le=500)
    auto_submit_below_usd: Optional[float] = Field(default=None, ge=0)
    counterparty_limit_usd: Optional[float] = Field(default=None, ge=0)

    @field_validator("default_product")
    @classmethod
    def validate_default_product(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_PRODUCTS:
            raise ValueError(f"default_product must be one of {sorted(_VALID_PRODUCTS)}")
        return v

    @field_validator("stress_sigma")
    @classmethod
    def validate_stress_sigma(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v not in _VALID_STRESS_SIGMAS:
            raise ValueError(f"stress_sigma must be one of {sorted(_VALID_STRESS_SIGMAS)}")
        return v


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CompanySettingsResponse(BaseModel):
    governance_mode: str = "team"
    name: str
    slug: str
    policy_limits: Optional[dict] = None
    execution_settings: Optional[dict] = None
    last_modified_at: Optional[str] = None
    last_modified_by: Optional[str] = None


class UpdateCompanySettingsRequest(BaseModel):
    governance_mode: Optional[str] = Field(
        default=None,
        pattern="^(solo|team)$",
        description="'solo' allows self-approval; 'team' enforces 4-eyes (default).",
    )
    policy_limits: Optional[PolicyLimitsPayload] = None
    execution_settings: Optional[ExecutionSettingsPayload] = None


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
    """Return company settings including governance_mode, policy_limits, and execution_settings."""
    company  = await _get_company(session, current_user.company_id)
    settings = company.settings or {}
    return CompanySettingsResponse(
        governance_mode=settings.get("governance_mode", "team"),
        name=company.name,
        slug=company.slug,
        policy_limits=settings.get("policy_limits"),
        execution_settings=settings.get("execution_settings"),
        last_modified_at=settings.get("last_modified_at"),
        last_modified_by=settings.get("last_modified_by"),
    )


@router.patch("/settings", response_model=CompanySettingsResponse)
async def update_company_settings(
    data:         UpdateCompanySettingsRequest,
    request:      Request,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """Update company settings. Requires company.edit_settings permission."""
    perms = await rbac_service.get_permissions_by_user(session, current_user.id)
    has_perm = "company.edit_settings" in perms
    if not has_perm and not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Requires company.edit_settings permission",
        )

    company  = await _get_company(session, current_user.company_id)
    settings = dict(company.settings or {})

    changed_fields: list[str] = []

    if data.governance_mode is not None:
        settings["governance_mode"] = data.governance_mode
        changed_fields.append("governance_mode")

    if data.policy_limits is not None:
        existing = dict(settings.get("policy_limits") or {})
        incoming = data.policy_limits.model_dump(exclude_none=True)
        existing.update(incoming)
        settings["policy_limits"] = existing
        changed_fields.append("policy_limits")

    if data.execution_settings is not None:
        existing = dict(settings.get("execution_settings") or {})
        incoming = data.execution_settings.model_dump(exclude_none=True)
        existing.update(incoming)
        settings["execution_settings"] = existing
        changed_fields.append("execution_settings")

    settings["last_modified_at"] = datetime.now(timezone.utc).isoformat()
    settings["last_modified_by"] = current_user.email

    from sqlalchemy.orm import attributes
    attributes.flag_modified(company, "settings")
    company.settings = settings

    # Stash all ORM attributes needed after commit — async session expires all
    # objects on commit, so any post-commit attribute access triggers lazy loads
    # which raise MissingGreenlet in async context.
    company_name    = company.name
    company_slug    = company.slug
    actor_company_id = current_user.company_id
    actor_id        = current_user.id
    actor_email     = current_user.email

    await session.commit()

    audit_event = build_audit_event(
        event_type="SYSTEM",
        description=f"Company settings updated: {', '.join(changed_fields)}",
        payload={
            "changed_fields": changed_fields,
            "governance_mode": settings.get("governance_mode"),
            "policy_limits_snapshot": settings.get("policy_limits"),
            "execution_settings_snapshot": settings.get("execution_settings"),
        },
        company_id=actor_company_id,
        actor_id=actor_id,
        actor_email=actor_email,
        entity_type="company_settings",
        entity_id=str(actor_company_id),
    )
    session.add(audit_event)
    await session.commit()

    return CompanySettingsResponse(
        governance_mode=settings.get("governance_mode", "team"),
        name=company_name,
        slug=company_slug,
        policy_limits=settings.get("policy_limits"),
        execution_settings=settings.get("execution_settings"),
        last_modified_at=settings.get("last_modified_at"),
        last_modified_by=settings.get("last_modified_by"),
    )
