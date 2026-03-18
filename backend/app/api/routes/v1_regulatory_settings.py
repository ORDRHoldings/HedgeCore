"""
v1_regulatory_settings.py — Regulatory LEI & framework settings per company.

Endpoints:
  GET   /v1/settings/regulatory  — read current regulatory settings
  PATCH /v1/settings/regulatory  — update regulatory settings

Settings are stored under company.settings["regulatory"] (JSONB, no migration
needed). flag_modified is used to signal SQLAlchemy that the JSONB dict changed.

Requires: authenticated user (GET), reports.export permission (PATCH).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.organization import Company
from app.models.user import User
from app.services import rbac_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/settings", tags=["v1-regulatory-settings"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class RegulatorySettingsIn(BaseModel):
    reporting_entity_lei: str = ""
    counterparty_lei: str = ""
    executing_entity_lei: str = ""
    venue: str = "XOFF"
    regulatory_frameworks: list[str] = []
    is_financial_counterparty: bool = False


class RegulatorySettingsOut(RegulatorySettingsIn):
    lei_configured: bool
    frameworks_count: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_reg_settings(company: Company) -> dict:
    """Return the regulatory sub-dict from company.settings, defaulting to {}."""
    settings = company.settings or {}
    return settings.get("regulatory", {})


def _to_out(reg: dict) -> RegulatorySettingsOut:
    lei = reg.get("reporting_entity_lei", "")
    return RegulatorySettingsOut(
        reporting_entity_lei=lei,
        counterparty_lei=reg.get("counterparty_lei", ""),
        executing_entity_lei=reg.get("executing_entity_lei", ""),
        venue=reg.get("venue", "XOFF"),
        regulatory_frameworks=reg.get("regulatory_frameworks", []),
        is_financial_counterparty=reg.get("is_financial_counterparty", False),
        lei_configured=bool(lei and lei != "NOT_PROVIDED"),
        frameworks_count=len(reg.get("regulatory_frameworks", [])),
    )


async def _fetch_company(session: AsyncSession, company_id) -> Company:
    """Fetch company by id; raise 404 if not found."""
    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    return company


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/regulatory", response_model=RegulatorySettingsOut)
async def get_regulatory_settings(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> RegulatorySettingsOut:
    """
    GET /v1/settings/regulatory

    Read the current company's regulatory LEI and framework settings.
    Any authenticated user may read these settings.
    """
    company = await _fetch_company(session, current_user.company_id)
    reg = _extract_reg_settings(company)
    logger.info(
        "REG-SETTINGS: GET company=%s user=%s",
        current_user.company_id,
        current_user.email,
    )
    return _to_out(reg)


@router.patch("/regulatory", response_model=RegulatorySettingsOut)
async def update_regulatory_settings(
    body: RegulatorySettingsIn,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> RegulatorySettingsOut:
    """
    PATCH /v1/settings/regulatory

    Update the current company's regulatory LEI and framework settings.
    Stored under company.settings["regulatory"].

    Requires: reports.export
    """
    if not current_user.is_superuser:
        await rbac_service.require_permission(session, current_user, "reports.export")

    company = await _fetch_company(session, current_user.company_id)

    # Mutate the JSONB — must use flag_modified so SQLAlchemy tracks the change
    current_settings: dict = dict(company.settings or {})
    current_settings["regulatory"] = body.model_dump()
    company.settings = current_settings
    flag_modified(company, "settings")

    await session.commit()
    await session.refresh(company)

    logger.info(
        "REG-SETTINGS: PATCH company=%s user=%s lei=%s",
        current_user.company_id,
        current_user.email,
        body.reporting_entity_lei,
    )
    reg = _extract_reg_settings(company)
    return _to_out(reg)
