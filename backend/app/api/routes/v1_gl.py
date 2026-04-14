# backend/app/api/routes/v1_gl.py
"""
GL Journal Entry routes.

All routes: PROFESSIONAL+ plan tier (Phase 1 core feature).
4-eyes SoD enforced in service layer (checker != creator).
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.dependencies import get_current_user
from app.deps.plan_tier import require_plan
from app.models.journal_entry import GLMappingNotConfiguredError
from app.models.user import User
from app.schemas_v1.gl import (
    GLAccountMappingCreate,
    GLAccountMappingRead,
    JournalEntryRead,
    JournalEntryRejectRequest,
)
from app.services import gl_service
from app.services.audit_emit import emit_audit

router = APIRouter(prefix="/v1/gl", tags=["v1-gl"])

_PLAN_DEPS = [require_plan("professional", "enterprise")]


async def _get_run(run_id: uuid.UUID, session: AsyncSession):
    """Fetch HedgeEffectivenessRun — raises 404 if not found."""
    from sqlalchemy import select
    from app.models.hedge_effectiveness import HedgeEffectivenessRun  # noqa: PLC0415

    result = await session.execute(
        select(HedgeEffectivenessRun).where(HedgeEffectivenessRun.id == run_id)
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return run


# ── GL Account Mapping CRUD ───────────────────────────────────────────────────

@router.get(
    "/account-mappings",
    response_model=list[GLAccountMappingRead],
    dependencies=_PLAN_DEPS,
)
async def list_account_mappings(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    return await gl_service.list_gl_mappings(session, current_user.company.id)


@router.post(
    "/account-mappings",
    response_model=GLAccountMappingRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=_PLAN_DEPS,
)
async def upsert_account_mapping(
    body: GLAccountMappingCreate,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    mapping = await gl_service.upsert_gl_mapping(
        session, current_user.company.id, body, current_user  # pass body directly (typed schema)
    )
    await session.commit()
    await emit_audit(
        session=session,
        user=current_user,
        event_type="SYSTEM",
        description=f"GL mapping upserted: {body.entry_type}/{body.standard}",
        entity_type="gl_account_mapping",
        entity_id=str(mapping.id),
        payload={"entry_type": body.entry_type, "standard": body.standard},
    )
    return mapping


# ── Journal Entry CRUD ────────────────────────────────────────────────────────

@router.get(
    "/journal-entries",
    response_model=list[JournalEntryRead],
    dependencies=_PLAN_DEPS,
)
async def list_journal_entries(
    status_filter: str | None = None,
    run_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    return await gl_service.list_journal_entries(
        session,
        current_user.company.id,
        status=status_filter,
        run_id=run_id,
    )


@router.post(
    "/journal-entries/generate/{run_id}",
    response_model=list[JournalEntryRead],
    status_code=status.HTTP_201_CREATED,
    dependencies=_PLAN_DEPS,
)
async def generate_journal_entries(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    run = await _get_run(run_id, session)
    if run.company_id != current_user.company.id:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        entries = await gl_service.generate_journal_entries(session, run, current_user)
    except GLMappingNotConfiguredError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    await emit_audit(
        session=session,
        user=current_user,
        event_type="SYSTEM",
        description=f"Generated {len(entries)} journal entries for run {run_id}",
        entity_type="journal_entry",
        entity_id=str(run_id),
        payload={"count": len(entries), "run_id": str(run_id)},
    )
    return entries


@router.post(
    "/journal-entries/{entry_id}/approve",
    response_model=JournalEntryRead,
    dependencies=_PLAN_DEPS,
)
async def approve_journal_entry(
    entry_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    try:
        je = await gl_service.approve_journal_entry(session, entry_id, current_user)
    except ValueError as exc:
        msg = str(exc)
        code = 403 if "SoD" in msg else 409
        raise HTTPException(status_code=code, detail=msg) from exc
    await session.commit()
    await emit_audit(
        session=session,
        user=current_user,
        event_type="APPROVAL",
        description=f"Journal entry {entry_id} approved (4-eyes)",
        entity_type="journal_entry",
        entity_id=str(entry_id),
        payload={},
    )
    return je


@router.post(
    "/journal-entries/{entry_id}/reject",
    response_model=JournalEntryRead,
    dependencies=_PLAN_DEPS,
)
async def reject_journal_entry(
    entry_id: uuid.UUID,
    body: JournalEntryRejectRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    try:
        je = await gl_service.reject_journal_entry(
            session, entry_id, current_user, reason=body.reason
        )
    except ValueError as exc:
        msg = str(exc)
        code = 403 if "SoD" in msg else 409
        raise HTTPException(status_code=code, detail=msg) from exc
    await session.commit()
    await emit_audit(
        session=session,
        user=current_user,
        event_type="REJECTION",
        description=f"Journal entry {entry_id} rejected: {body.reason}",
        entity_type="journal_entry",
        entity_id=str(entry_id),
        payload={"reason": body.reason},
    )
    return je
