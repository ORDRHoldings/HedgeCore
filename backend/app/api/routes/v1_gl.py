# backend/app/api/routes/v1_gl.py
"""
GL Journal Entry routes.

All routes: PROFESSIONAL+ plan tier (Phase 1 core feature).
4-eyes SoD enforced in service layer (checker != creator).
"""
from __future__ import annotations

import csv
import io as _io
import uuid
from datetime import UTC, date, datetime, time
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.dependencies import get_current_user
from app.deps.plan_tier import require_plan
from app.models.journal_entry import GLMappingNotConfiguredError, JournalEntryStatus
from app.models.user import User
from app.schemas_v1.gl import (
    GLAccountMappingCreate,
    GLAccountMappingRead,
    JournalEntryApproveRequest,
    JournalEntryRead,
    JournalEntryRejectRequest,
)
from app.connectors import registry
from app.services import gl_service
from app.services.audit_emit import emit_audit
from app.services.gl_posting_service import post_journal_entry as _post_je

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
    _body: JournalEntryApproveRequest = JournalEntryApproveRequest(),  # noqa: B008
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


# ── GL Posting ────────────────────────────────────────────────────────────────

@router.post(
    "/journal-entries/{entry_id}/post",
    response_model=JournalEntryRead,
    dependencies=_PLAN_DEPS,
)
async def post_journal_entry(
    entry_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import select as sa_select  # noqa: PLC0415

    from app.models.journal_entry import JournalEntry as JE  # noqa: PLC0415
    result = await session.execute(
        sa_select(JE).where(JE.id == entry_id, JE.company_id == current_user.company.id)
    )
    je = result.scalar_one_or_none()
    if je is None:
        raise HTTPException(status_code=404, detail=f"JournalEntry {entry_id} not found")

    company = current_user.company
    erp_system = (company.settings or {}).get("erp_system", "CSV")

    if erp_system.lower() in ("quickbooks", "xero"):
        from app.connectors.base import JournalLine, JournalPayload  # noqa: PLC0415
        from app.connectors.errors import ConnectorError, ConnectorNotConfiguredError  # noqa: PLC0415

        provider = erp_system.lower()
        connector = registry.get_connector(provider)
        payload = JournalPayload(
            journal_entry_id=je.id,
            reference=f"ORDR-{str(je.id)[:21]}",
            memo=f"ORDR {je.entry_type} {je.id}",
            posting_date=datetime.combine(je.period_date, time.min, tzinfo=UTC),
            lines=(
                JournalLine(
                    account_external_id=je.debit_account,
                    debit=Decimal(str(je.amount)),
                    credit=Decimal("0"),
                    description=je.description or "",
                    currency=je.currency,
                ),
                JournalLine(
                    account_external_id=je.credit_account,
                    debit=Decimal("0"),
                    credit=Decimal(str(je.amount)),
                    description=je.description or "",
                    currency=je.currency,
                ),
            ),
        )
        try:
            result = await connector.post_journal(
                tenant_id=current_user.company.id, payload=payload
            )
        except ConnectorNotConfiguredError as exc:
            raise HTTPException(
                status_code=409,
                detail="No ERP connected — complete OAuth setup in Accounting Settings.",
            ) from exc
        except ConnectorError as exc:
            raise HTTPException(
                status_code=502, detail=f"ERP posting failed: {exc.message}"
            ) from exc

        je.status = JournalEntryStatus.POSTED.value
        je.posted_to = provider[:4].upper()
        je.posted_ref = result.external_ref or ""
        je.posted_at = datetime.now(UTC)
    else:
        try:
            posting_result = await _post_je(
                session, je, current_user, erp_system="CSV", connector_settings={}
            )
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        if not posting_result.success:
            raise HTTPException(status_code=502, detail="GL export failed")

    await session.commit()
    await emit_audit(
        session=session, user=current_user,
        event_type="SYSTEM",
        description=f"Journal entry {entry_id} posted to {erp_system}",
        entity_type="journal_entry", entity_id=str(entry_id),
        payload={"erp_system": erp_system},
    )
    return je


# ── GL Export ─────────────────────────────────────────────────────────────────

@router.get("/export", dependencies=_PLAN_DEPS)
async def export_journal_entries(
    format: str = "csv",
    status_filter: str = "APPROVED",
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    entries = await gl_service.list_journal_entries(
        session, current_user.company.id, status=status_filter
    )
    buf = _io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "entry_type", "standard", "debit_account", "credit_account",
        "amount", "currency", "period_date", "status", "posted_to", "posted_ref",
    ])
    for e in entries:
        writer.writerow([
            str(e.id), e.entry_type, e.standard, e.debit_account, e.credit_account,
            str(e.amount), e.currency, e.period_date.isoformat(),
            e.status, e.posted_to or "", e.posted_ref or "",
        ])
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=journal_entries.csv"},
    )
