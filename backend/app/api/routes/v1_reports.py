"""
v1_reports.py -- RPT-04 (Report Persistence) + RPT-06 (Report Scheduling).

RPT-04 endpoints:
  POST   /v1/reports/save                        -- save a report snapshot
  GET    /v1/reports/saved                       -- list user's saved reports
  DELETE /v1/reports/saved/{report_id}           -- delete one saved report

RPT-06 endpoints:
  POST   /v1/reports/schedules                   -- create a report schedule
  GET    /v1/reports/schedules                   -- list user's schedules
  PATCH  /v1/reports/schedules/{schedule_id}     -- update a schedule
  DELETE /v1/reports/schedules/{schedule_id}     -- delete a schedule

All endpoints require a valid JWT (get_current_user) and the reports.view or
reports.export permission as noted per endpoint.

NOTE on RPT-06: actual email delivery is NOT implemented in v1 (architecture
freeze). Schedule rows are persisted but no SMTP/Celery task is triggered.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.report_schedule import ReportSchedule
from app.models.saved_report import SavedReport
from app.models.user import User
from app.services import rbac_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/reports", tags=["v1-reports"])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_SAVED_REPORTS_PER_USER = 20


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

async def _require(session: AsyncSession, user: User, permission: str) -> None:
    """Raise HTTP 403 if user lacks permission (superusers bypass)."""
    if user.is_superuser:
        return
    await rbac_service.require_permission(session, user, permission)


# ===========================================================================
# RPT-04: Saved Reports
# ===========================================================================

# ── Pydantic schemas ────────────────────────────────────────────────────────

class SaveReportRequest(BaseModel):
    run_id: str = Field(..., description="ID of the calculation run this report is based on")
    name: str = Field(..., min_length=1, max_length=255, description="Human-readable report name")
    snapshot: dict = Field(default_factory=dict, description="Serialised report state (sections, filters, etc.)")


class SavedReportOut(BaseModel):
    id: UUID
    run_id: str
    name: str
    snapshot: dict
    version_number: int
    saved_at: datetime

    class Config:
        from_attributes = True


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/save", response_model=SavedReportOut, status_code=201)
async def save_report(
    body: SaveReportRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    POST /v1/reports/save

    Save a report snapshot tied to a calculation run. At most
    MAX_SAVED_REPORTS_PER_USER (20) rows are kept per user; the oldest rows
    are deleted when the limit is exceeded.

    Requires: reports.view
    """
    await _require(session, current_user, "reports.view")

    # Count existing saved reports for this user
    count_q = select(SavedReport).where(SavedReport.user_id == current_user.id)
    rows = (await session.execute(count_q)).scalars().all()
    count = len(rows)

    # Cull oldest if at limit
    if count >= MAX_SAVED_REPORTS_PER_USER:
        overflow = count - MAX_SAVED_REPORTS_PER_USER + 1
        oldest_q = (
            select(SavedReport)
            .where(SavedReport.user_id == current_user.id)
            .order_by(SavedReport.saved_at.asc())
            .limit(overflow)
        )
        oldest_rows = (await session.execute(oldest_q)).scalars().all()
        for old in oldest_rows:
            await session.delete(old)
        await session.flush()

    # Determine version number for this run_id
    existing_versions_q = (
        select(SavedReport.version_number)
        .where(
            SavedReport.user_id == current_user.id,
            SavedReport.run_id == body.run_id,
        )
        .order_by(SavedReport.version_number.desc())
        .limit(1)
    )
    last_version = (await session.execute(existing_versions_q)).scalars().first()
    next_version = (last_version or 0) + 1

    report = SavedReport(
        user_id=current_user.id,
        company_id=current_user.company_id,
        run_id=body.run_id,
        name=body.name,
        snapshot=body.snapshot,
        version_number=next_version,
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)

    logger.info(
        "RPT-04: saved report id=%s run=%s user=%s",
        report.id, body.run_id, current_user.email,
    )
    return report


@router.get("/saved", response_model=List[SavedReportOut])
async def list_saved_reports(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/reports/saved

    Return the current user's saved reports, sorted newest-first.

    Requires: reports.view
    """
    await _require(session, current_user, "reports.view")

    q = (
        select(SavedReport)
        .where(SavedReport.user_id == current_user.id)
        .order_by(SavedReport.saved_at.desc())
    )
    rows = (await session.execute(q)).scalars().all()
    return rows


@router.delete("/saved/{report_id}", status_code=204)
async def delete_saved_report(
    report_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    DELETE /v1/reports/saved/{report_id}

    Delete a saved report. Users may only delete their own reports.

    Requires: reports.view
    """
    await _require(session, current_user, "reports.view")

    row = await session.get(SavedReport, report_id)
    if row is None or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail=f"Saved report '{report_id}' not found.")

    await session.delete(row)
    await session.commit()
    logger.info("RPT-04: deleted saved report id=%s user=%s", report_id, current_user.email)


# ===========================================================================
# RPT-06: Report Schedules
# ===========================================================================

# ── Pydantic schemas ────────────────────────────────────────────────────────

FrequencyEnum = Literal["DAILY", "WEEKLY", "MONTHLY"]
ReportTypeEnum = Literal["committee_pack", "coverage", "compliance"]


class ScheduleCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    frequency: FrequencyEnum
    report_type: ReportTypeEnum
    recipients: List[str] = Field(default_factory=list, description="List of recipient email addresses")


class ScheduleUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    frequency: Optional[FrequencyEnum] = None
    recipients: Optional[List[str]] = None
    is_active: Optional[bool] = None


class ScheduleOut(BaseModel):
    id: UUID
    name: str
    frequency: str
    report_type: str
    recipients: Any  # list[str] stored as JSONB
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ScheduleCreateResponse(BaseModel):
    schedule: ScheduleOut
    status: str
    note: str


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/schedules", response_model=ScheduleCreateResponse, status_code=201)
async def create_schedule(
    body: ScheduleCreateRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    POST /v1/reports/schedules

    Create a report delivery schedule. Actual email sending is NOT implemented
    in v1 (architecture freeze). The schedule row is persisted and will be
    actioned once SMTP/Celery is configured.

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    schedule = ReportSchedule(
        user_id=current_user.id,
        company_id=current_user.company_id,
        name=body.name,
        frequency=body.frequency,
        report_type=body.report_type,
        recipients=body.recipients,
        is_active=True,
    )
    session.add(schedule)
    await session.commit()
    await session.refresh(schedule)

    logger.info(
        "RPT-06: created schedule id=%s name=%r freq=%s user=%s",
        schedule.id, body.name, body.frequency, current_user.email,
    )
    return ScheduleCreateResponse(
        schedule=ScheduleOut.model_validate(schedule),
        status="scheduled",
        note="Email delivery requires SMTP configuration",
    )


@router.get("/schedules", response_model=List[ScheduleOut])
async def list_schedules(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/reports/schedules

    Return the current user's report schedules.

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    q = (
        select(ReportSchedule)
        .where(ReportSchedule.user_id == current_user.id)
        .order_by(ReportSchedule.created_at.desc())
    )
    rows = (await session.execute(q)).scalars().all()
    return rows


@router.patch("/schedules/{schedule_id}", response_model=ScheduleOut)
async def update_schedule(
    schedule_id: UUID,
    body: ScheduleUpdateRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    PATCH /v1/reports/schedules/{schedule_id}

    Update a report schedule (name, frequency, recipients, is_active).
    Users may only update their own schedules.

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    row = await session.get(ReportSchedule, schedule_id)
    if row is None or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail=f"Schedule '{schedule_id}' not found.")

    if body.name is not None:
        row.name = body.name
    if body.frequency is not None:
        row.frequency = body.frequency
    if body.recipients is not None:
        row.recipients = body.recipients
    if body.is_active is not None:
        row.is_active = body.is_active

    await session.commit()
    await session.refresh(row)
    logger.info("RPT-06: updated schedule id=%s user=%s", schedule_id, current_user.email)
    return row


@router.delete("/schedules/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    DELETE /v1/reports/schedules/{schedule_id}

    Delete a report schedule. Users may only delete their own schedules.

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    row = await session.get(ReportSchedule, schedule_id)
    if row is None or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail=f"Schedule '{schedule_id}' not found.")

    await session.delete(row)
    await session.commit()
    logger.info("RPT-06: deleted schedule id=%s user=%s", schedule_id, current_user.email)
