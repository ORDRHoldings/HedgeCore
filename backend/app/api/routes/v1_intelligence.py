# backend/app/api/routes/v1_intelligence.py
"""v1 Intelligence Tier — NL query, report commentary, settings."""
from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.core.plan_enforcement import require_plan_tier
from app.models.user import User
from app.services.intelligence_service import (
    query_intelligence,
    draft_commentary,
    get_usage_stats,
)

router = APIRouter(prefix="/v1/intelligence", tags=["intelligence"])


# ── Schemas ────────────────────────────────────────────────────────────────


class IntelligenceQuery(BaseModel):
    q: str = Field(..., max_length=500)


class QueryResponse(BaseModel):
    query_id: str
    answer: str
    data_refs: list[str]
    tokens_used: int
    latency_ms: int


class CommentaryRequest(BaseModel):
    report_type: Literal["hedge_effectiveness"]  # committee_pack deferred to Phase 3b
    report_id: str


class CommentaryResponse(BaseModel):
    commentary_id: str
    draft: str
    report_type: str
    tokens_used: int


class IntelligenceSettingsResponse(BaseModel):
    enabled: bool
    queries_this_month: int
    tokens_this_month: int
    model: str


class IntelligenceSettingsPatch(BaseModel):
    enabled: bool


# ── Guards ─────────────────────────────────────────────────────────────────


def _require_intelligence_tier(
    current_user: User = Depends(require_plan_tier("intelligence")),
) -> User:
    """Raises HTTP 402 if intelligence plan tier not met."""
    return current_user


def _require_intelligence_enabled(
    current_user: User = Depends(_require_intelligence_tier),
) -> User:
    """Raises HTTP 402 if tenant has not opted in to intelligence."""
    if not getattr(current_user.company, "intelligence_enabled", False):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Intelligence is not enabled for your company. Enable it at /intelligence.",
        )
    return current_user


# ── Module-level helpers for testability ──────────────────────────────────


async def query_intelligence_helper(db, *, company_id, user_id, q):
    return await query_intelligence(db, company_id=company_id, user_id=user_id, q=q)


async def draft_commentary_helper(db, *, company_id, user_id, report_type, report_id):
    return await draft_commentary(
        db, company_id=company_id, user_id=user_id,
        report_type=report_type, report_id=report_id,
    )


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.post("/query", response_model=QueryResponse)
async def post_query(
    body: IntelligenceQuery,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(_require_intelligence_enabled),
):
    result = await query_intelligence_helper(
        db,
        company_id=current_user.company_id,
        user_id=current_user.id,
        q=body.q,
    )
    return QueryResponse(
        query_id=result.query_id,
        answer=result.answer,
        data_refs=result.data_refs,
        tokens_used=result.tokens_used,
        latency_ms=result.latency_ms,
    )


@router.post("/commentary", response_model=CommentaryResponse)
async def post_commentary(
    body: CommentaryRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(_require_intelligence_enabled),
):
    result = await draft_commentary_helper(
        db,
        company_id=current_user.company_id,
        user_id=current_user.id,
        report_type=body.report_type,
        report_id=body.report_id,
    )
    return CommentaryResponse(
        commentary_id=result.commentary_id,
        draft=result.draft,
        report_type=result.report_type,
        tokens_used=result.tokens_used,
    )


@router.get("/settings", response_model=IntelligenceSettingsResponse)
async def get_settings(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(_require_intelligence_tier),
):
    from app.core.config import settings as app_settings
    usage = await get_usage_stats(db, current_user.company_id)
    return IntelligenceSettingsResponse(
        enabled=getattr(current_user.company, "intelligence_enabled", False),
        queries_this_month=usage["queries_this_month"],
        tokens_this_month=usage["tokens_this_month"],
        model=app_settings.ANTHROPIC_MODEL,
    )


@router.patch("/settings", response_model=IntelligenceSettingsResponse)
async def patch_settings(
    body: IntelligenceSettingsPatch,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(_require_intelligence_tier),
):
    # Role check: only superuser or admin can toggle intelligence
    role = getattr(current_user, "role", "")
    is_superuser = getattr(current_user, "is_superuser", False)
    if not is_superuser and role not in ("admin", "cfo"):
        raise HTTPException(status_code=403, detail="Admin or superuser required to change intelligence settings.")

    from sqlalchemy import update
    from app.models.organization import Company
    await db.execute(
        update(Company)
        .where(Company.id == current_user.company_id)
        .values(intelligence_enabled=body.enabled)
    )
    await db.commit()
    # Refresh company on user object
    current_user.company.intelligence_enabled = body.enabled

    from app.core.config import settings as app_settings
    usage = await get_usage_stats(db, current_user.company_id)
    return IntelligenceSettingsResponse(
        enabled=body.enabled,
        queries_this_month=usage["queries_this_month"],
        tokens_this_month=usage["tokens_this_month"],
        model=app_settings.ANTHROPIC_MODEL,
    )
