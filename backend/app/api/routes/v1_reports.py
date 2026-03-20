"""
v1_reports.py -- RPT-04 (Report Persistence) + RPT-06 (Report Scheduling)
              + RPT-07 (Server-side Report Generation).

RPT-04 endpoints:
  POST   /v1/reports/save                        -- save a report snapshot
  GET    /v1/reports/saved                       -- list user's saved reports
  DELETE /v1/reports/saved/{report_id}           -- delete one saved report

RPT-06 endpoints:
  POST   /v1/reports/schedules                   -- create a report schedule
  GET    /v1/reports/schedules                   -- list user's schedules
  PATCH  /v1/reports/schedules/{schedule_id}     -- update a schedule
  DELETE /v1/reports/schedules/{schedule_id}     -- delete a schedule

RPT-07 endpoints:
  GET    /v1/reports/{run_id}/excel              -- CSV download (positions + hedge plan)
  GET    /v1/reports/{run_id}/pdf                -- Committee pack text report
  GET    /v1/reports/{run_id}/bank-pdf           -- Bank compliance format text

All endpoints require a valid JWT (get_current_user) and the reports.view or
reports.export permission as noted per endpoint.

NOTE on RPT-06: actual email delivery is NOT implemented in v1 (architecture
freeze). Schedule rows are persisted but no SMTP/Celery task is triggered.
"""

import csv
import io
import logging
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID

from app.services.regulatory_export import (
    export_dodd_frank,
    export_emir_xml,
    export_finra_17a4,
    export_isda_xml,
    export_mifid_xml,
)

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event
from app.models.calculation_run import CalculationRun
from app.models.organization import Company
from app.models.position import Position
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
@router.get("/saved", response_model=list[SavedReportOut])
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
    recipients: list[str] = Field(default_factory=list, description="List of recipient email addresses")
class ScheduleUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    frequency: FrequencyEnum | None = None
    recipients: list[str] | None = None
    is_active: bool | None = None
class ScheduleOut(BaseModel):
    id: UUID
    name: str
    frequency: str
    report_type: str
    recipients: Any  # list[str] stored as JSONB
    last_run_at: datetime | None
    next_run_at: datetime | None
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
@router.get("/schedules", response_model=list[ScheduleOut])
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
# ===========================================================================
# RPT-07: Server-side Report Generation
# ===========================================================================

# ── Internal helpers ─────────────────────────────────────────────────────────

async def _fetch_run(session: AsyncSession, run_id: str, company_id: UUID) -> CalculationRun:
    """Fetch CalculationRun, enforce tenant isolation, raise 404 if missing."""
    row = await session.get(CalculationRun, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Calculation run '{run_id}' not found.")
    if row.company_id is not None and row.company_id != company_id:
        raise HTTPException(status_code=403, detail="Access denied.")
    return row
async def _fetch_positions(session: AsyncSession, position_ids: list, company_id: UUID) -> list[Position]:
    """Fetch Position rows by IDs, filtered to the caller's company."""
    if not position_ids:
        return []
    q = (
        select(Position)
        .where(
            Position.company_id == company_id,
            Position.id.in_(list(position_ids)),
        )
        .order_by(Position.record_id)
    )
    return list((await session.execute(q)).scalars().all())
async def _emit_report_audit(
    session: AsyncSession,
    user: User,
    run_id: str,
    report_type: str,
) -> None:
    """Emit a REPORT_DOWNLOADED audit event (non-fatal on failure)."""
    try:
        prev_q = (
            select(AuditEvent.event_hash)
            .where(AuditEvent.company_id == user.company_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(1)
        )
        prev_hash = (await session.execute(prev_q)).scalars().first() or GENESIS_HASH

        event = build_audit_event(
            event_type="SYSTEM",
            description=f"Report downloaded: type={report_type}, run_id={run_id}",
            payload={"run_id": run_id, "report_type": report_type},
            prev_event_hash=prev_hash,
            company_id=user.company_id,
            branch_id=user.branch_id,
            actor_id=user.id,
            actor_email=user.email,
            entity_type="calculation_run",
            entity_id=run_id,
        )
        session.add(event)
        await session.commit()
    except Exception:
        logger.warning("RPT-07: audit emit failed for run=%s type=%s", run_id, report_type)
def _fmt_decimal(val: Any, decimals: int = 2) -> str:
    """Format a numeric value or return empty string."""
    if val is None:
        return ""
    try:
        return f"{float(val):,.{decimals}f}"
    except (TypeError, ValueError):
        return str(val)
# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/{run_id}/excel")
async def download_excel(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/reports/{run_id}/excel

    Generate and stream a CSV (Excel-compatible) report for the given
    calculation run. Includes position data and hedge plan buckets.

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    run = await _fetch_run(session, run_id, current_user.company_id)
    positions = await _fetch_positions(session, run.position_ids or [], current_user.company_id)

    hedge_plan = (run.run_envelope or {}).get("hedge_plan") or {}
    buckets: list[dict] = hedge_plan.get("buckets", [])
    bucket_by_pos: dict[str, dict] = {}
    for b in buckets:
        pid = b.get("position_id") or b.get("positionId")
        if pid:
            bucket_by_pos[str(pid)] = b

    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "Record ID", "Entity", "Flow Type", "Currency",
        "Amount", "Value Date", "Status", "Execution Status",
        "Hedge Amount", "Hedge Rate",
        "Instrument", "Hedge Notional (USD)",
    ])

    for pos in positions:
        b = bucket_by_pos.get(str(pos.id), {})
        writer.writerow([
            pos.record_id,
            pos.entity,
            pos.flow_type,
            pos.currency,
            _fmt_decimal(pos.amount),
            pos.value_date,
            pos.status,
            pos.execution_status,
            _fmt_decimal(pos.hedge_amount) if pos.hedge_amount else _fmt_decimal(b.get("hedge_notional")),
            _fmt_decimal(pos.hedge_rate, 6) if pos.hedge_rate else _fmt_decimal(b.get("hedge_rate"), 6),
            b.get("instrument", ""),
            _fmt_decimal(b.get("hedge_notional_usd") or b.get("hedge_notional")),
        ])

    # Summary section
    writer.writerow([])
    writer.writerow(["SUMMARY"])
    writer.writerow(["Run ID", run_id])
    writer.writerow(["Generated At", datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")])
    writer.writerow(["Trade Count", run.trade_count])
    writer.writerow(["Hedge Count", run.hedge_count])
    writer.writerow(["Run Hash", run.run_hash])

    csv_bytes = ("\ufeff" + output.getvalue()).encode("utf-8")

    await _emit_report_audit(session, current_user, run_id, "excel")
    logger.info("RPT-07: excel download run=%s user=%s", run_id, current_user.email)

    filename = f"hedge-report-{run_id[:8]}.csv"
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
@router.get("/{run_id}/pdf")
async def download_pdf(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/reports/{run_id}/pdf

    Generate and stream an institutional committee pack text report for the
    given calculation run.

    NOTE: v1 generates a structured plain-text document. PDF rendering is
    not implemented in v1 (architecture freeze).

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    run = await _fetch_run(session, run_id, current_user.company_id)
    positions = await _fetch_positions(session, run.position_ids or [], current_user.company_id)

    hedge_plan = (run.run_envelope or {}).get("hedge_plan") or {}
    buckets: list[dict] = hedge_plan.get("buckets", [])
    bucket_by_pos: dict[str, dict] = {}
    for b in buckets:
        pid = b.get("position_id") or b.get("positionId")
        if pid:
            bucket_by_pos[str(pid)] = b

    now_str = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")
    lines: list[str] = []

    lines += [
        "=" * 72,
        "  ORDR TERMINAL — COMMITTEE PACK",
        "=" * 72,
        f"  Run ID   : {run_id}",
        f"  Generated: {now_str}",
        f"  User     : {current_user.email}",
        f"  Run Hash : {run.run_hash}",
        "=" * 72,
        "",
        "HEDGE SUMMARY",
        "-" * 72,
        f"  Positions included : {len(positions)}",
        f"  Hedge buckets      : {run.hedge_count}",
        f"  Trade legs         : {run.trade_count}",
        "",
    ]

    if positions:
        lines += [
            "POSITION DETAIL",
            "-" * 72,
            f"  {'Record ID':<16} {'Entity':<20} {'CCY':<4} {'Amount':>14} {'Ex Status':<20} {'Instrument':<12}",
            f"  {'-'*16} {'-'*20} {'-'*4} {'-'*14} {'-'*20} {'-'*12}",
        ]
        for pos in positions:
            b = bucket_by_pos.get(str(pos.id), {})
            lines.append(
                f"  {pos.record_id:<16} {pos.entity:<20} {pos.currency:<4}"
                f" {_fmt_decimal(pos.amount):>14} {pos.execution_status:<20}"
                f" {b.get('instrument', '—'):<12}"
            )
        lines.append("")

    if buckets:
        lines += [
            "HEDGE PLAN BUCKETS",
            "-" * 72,
            f"  {'#':<4} {'CCY':<4} {'Instrument':<16} {'Hedge Notional':>16} {'Rate':>12}",
            f"  {'-'*4} {'-'*4} {'-'*16} {'-'*16} {'-'*12}",
        ]
        for i, b in enumerate(buckets, 1):
            lines.append(
                f"  {i:<4} {b.get('currency',''):<4} {b.get('instrument',''):<16}"
                f" {_fmt_decimal(b.get('hedge_notional')):>16}"
                f" {_fmt_decimal(b.get('hedge_rate',''), 6):>12}"
            )
        lines.append("")

    lines += [
        "AUDIT TRAIL",
        "-" * 72,
        f"  inputs_hash  : {run.inputs_hash}",
        f"  outputs_hash : {run.outputs_hash}",
        f"  run_hash     : {run.run_hash}",
        f"  policy_hash  : {run.policy_hash or '—'}",
        "",
        "=" * 72,
        "  ORDR Terminal v1 — Institutional FX Governance Platform",
        "  This document is generated deterministically from immutable run data.",
        "=" * 72,
        "",
    ]

    content = "\n".join(lines).encode("utf-8")

    await _emit_report_audit(session, current_user, run_id, "pdf")
    logger.info("RPT-07: pdf download run=%s user=%s", run_id, current_user.email)

    filename = f"committee-pack-{run_id[:8]}.txt"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
@router.get("/{run_id}/bank-pdf")
async def download_bank_pdf(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/reports/{run_id}/bank-pdf

    Generate and stream a bank compliance format report for the given
    calculation run. Structured for submission to counterparty banks.

    NOTE: v1 generates a structured plain-text document. PDF rendering is
    not implemented in v1 (architecture freeze).

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    run = await _fetch_run(session, run_id, current_user.company_id)
    positions = await _fetch_positions(session, run.position_ids or [], current_user.company_id)

    hedge_plan = (run.run_envelope or {}).get("hedge_plan") or {}
    buckets: list[dict] = hedge_plan.get("buckets", [])

    now_str = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")
    lines: list[str] = []

    lines += [
        "=" * 72,
        "  BANK COMPLIANCE REPORT — FX HEDGE EXECUTION",
        "  ORDR TERMINAL v1",
        "=" * 72,
        "",
        f"  DOCUMENT DATE  : {now_str}",
        f"  REFERENCE      : {run_id}",
        f"  PREPARED BY    : {current_user.email}",
        f"  INTEGRITY HASH : {run.run_hash}",
        "",
        "  This document confirms the following FX hedge execution instructions",
        "  were generated by the ORDR deterministic calculation engine and are",
        "  subject to 4-eyes approval before settlement.",
        "",
    ]

    if buckets:
        lines += [
            "SECTION 1 — HEDGE INSTRUCTIONS",
            "-" * 72,
        ]
        for i, b in enumerate(buckets, 1):
            lines += [
                f"  Instruction {i}",
                f"    Currency Pair  : {b.get('currency', '—')}/USD",
                f"    Instrument     : {b.get('instrument', '—')}",
                f"    Notional       : {_fmt_decimal(b.get('hedge_notional'))} {b.get('currency', '')}",
                f"    Rate           : {_fmt_decimal(b.get('hedge_rate', ''), 6)}",
                f"    Value Date     : {b.get('value_date', '—')}",
                "",
            ]

    if positions:
        hedged = [p for p in positions if p.execution_status == "HEDGED"]
        lines += [
            "SECTION 2 — UNDERLYING EXPOSURE",
            "-" * 72,
            f"  Total positions : {len(positions)}",
            f"  Hedged          : {len(hedged)}",
            f"  Pending         : {len(positions) - len(hedged)}",
            "",
        ]
        for pos in positions:
            lines.append(
                f"  {pos.record_id:<16} {pos.currency} {pos.flow_type}"
                f" {_fmt_decimal(pos.amount):>16}  [{pos.execution_status}]"
            )
        lines.append("")

    lines += [
        "SECTION 3 — AUDIT ATTESTATION",
        "-" * 72,
        f"  Calculation engine inputs hash  : {run.inputs_hash}",
        f"  Calculation engine outputs hash : {run.outputs_hash}",
        f"  Run hash (determinism key)      : {run.run_hash}",
        f"  Policy revision hash            : {run.policy_hash or 'N/A'}",
        "",
        "  The above hashes provide cryptographic proof that the hedge",
        "  instructions above were produced from the stated inputs without",
        "  manual modification.",
        "",
        "=" * 72,
        "  AUTHORISED SIGNATORY (Checker): ________________________",
        "  DATE: ________________  TIME: ________________",
        "=" * 72,
        "",
    ]

    content = "\n".join(lines).encode("utf-8")

    await _emit_report_audit(session, current_user, run_id, "bank-pdf")
    logger.info("RPT-07: bank-pdf download run=%s user=%s", run_id, current_user.email)

    filename = f"bank-compliance-{run_id[:8]}.txt"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ===========================================================================
# RPT-09: Regulatory Exports — EMIR, MiFID II, Dodd-Frank
# ===========================================================================

def _positions_to_dicts(positions: list[Position]) -> list[dict]:
    """Convert Position ORM rows to plain dicts for regulatory export."""
    return [
        {
            "record_id": p.record_id,
            "currency": p.currency,
            "amount": float(p.amount) if p.amount is not None else 0,
            "flow_type": p.flow_type,
            "entity": p.entity,
        }
        for p in positions
    ]


async def _build_reg_run_data(
    run: CalculationRun,
    current_user: User,
    run_id: str,
    session: AsyncSession,
) -> dict:
    """Build run_data dict for regulatory export functions.

    Reads LEI and framework settings from company.settings["regulatory"].
    Falls back to "NOT_PROVIDED" when no regulatory settings exist yet.
    """
    reg: dict = {}
    try:
        company = await session.get(Company, current_user.company_id)
        if company is not None:
            settings = company.settings or {}
            reg = settings.get("regulatory", {})
    except Exception:
        logger.warning(
            "RPT-09: failed to load regulatory settings for company=%s",
            current_user.company_id,
        )

    return {
        "run_id": run_id,
        "trade_date": run.created_at.strftime("%Y-%m-%d") if run.created_at else "",
        "value_date": "",
        "reporting_entity_lei": reg.get("reporting_entity_lei") or "NOT_PROVIDED",
        "counterparty_lei": reg.get("counterparty_lei") or "NOT_PROVIDED",
        "executing_entity_lei": reg.get("executing_entity_lei") or "NOT_PROVIDED",
        "venue": reg.get("venue") or "XOFF",
        "decision_maker": current_user.email,
        "generated_by": current_user.email,
        "report_date": datetime.now(UTC).strftime("%Y-%m-%d"),
    }


@router.get("/{run_id}/emir")
async def download_emir(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/reports/{run_id}/emir

    Generate EMIR Article 9 trade report XML for the given calculation run.
    Reports FX derivative hedge actions to EU trade repositories per
    EMIR Refit (EU 2024/2987).

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    run = await _fetch_run(session, run_id, current_user.company_id)
    positions = await _fetch_positions(
        session, run.position_ids or [], current_user.company_id
    )

    hedge_plan = (run.run_envelope or {}).get("hedge_plan") or {}
    buckets: list[dict] = hedge_plan.get("buckets", [])
    run_data = await _build_reg_run_data(run, current_user, run_id, session)

    content = export_emir_xml(
        run_data, buckets, _positions_to_dicts(positions)
    )

    await _emit_report_audit(session, current_user, run_id, "emir")
    logger.info("RPT-09: EMIR export run=%s user=%s", run_id, current_user.email)

    filename = f"emir-report-{run_id[:8]}.xml"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/xml; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{run_id}/isda")
async def download_isda(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/reports/{run_id}/isda

    Generate ISDA-format XML trade confirmation for the given calculation run.

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    run = await _fetch_run(session, run_id, current_user.company_id)
    run_data = await _build_reg_run_data(run, current_user, run_id, session)

    # Supplement with envelope fields expected by export_isda_xml
    envelope = run.run_envelope or {}
    run_data.setdefault("counterparty", envelope.get("counterparty", ""))
    run_data.setdefault("currency_base", envelope.get("currency_base", ""))
    run_data.setdefault("currency_quote", envelope.get("currency_quote", ""))
    run_data.setdefault("notional", envelope.get("notional", ""))
    run_data.setdefault("rate", envelope.get("rate", ""))

    # Build transaction list from hedge buckets
    hedge_plan = envelope.get("hedge_plan") or {}
    buckets: list[dict] = hedge_plan.get("buckets", [])
    transactions = [
        {
            "transaction_id": b.get("position_id", f"txn-{i}"),
            "direction": "BUY" if float(b.get("hedge_notional", 0) or 0) >= 0 else "SELL",
            "currency": b.get("currency", ""),
            "amount": abs(float(b.get("hedge_notional", 0) or 0)),
            "rate": b.get("hedge_rate", ""),
            "value_date": b.get("value_date", ""),
        }
        for i, b in enumerate(buckets, 1)
    ]

    content = export_isda_xml(run_data, transactions)

    await _emit_report_audit(session, current_user, run_id, "isda")
    logger.info("RPT-09: ISDA export run=%s user=%s", run_id, current_user.email)

    filename = f"isda-confirmation-{run_id[:8]}.xml"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/xml; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{run_id}/finra-17a4")
async def download_finra_17a4(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/reports/{run_id}/finra-17a4

    Generate FINRA Rule 17a-4 immutable record for the given calculation run.
    Pipe-delimited text format with SHA-256 hash chain.

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    run = await _fetch_run(session, run_id, current_user.company_id)
    run_data = await _build_reg_run_data(run, current_user, run_id, session)

    # Derive findings from run envelope audit flags
    envelope = run.run_envelope or {}
    findings_raw: list[dict] = (envelope.get("audit_flags") or [])
    findings = [
        {
            "finding_id": f.get("flag_id", f"F-{i:03d}"),
            "timestamp": f.get("timestamp", run_data.get("report_date", "")),
            "category": f.get("category", "AUDIT_FINDING"),
            "severity": f.get("severity", "INFO"),
            "description": f.get("description", ""),
        }
        for i, f in enumerate(findings_raw, 1)
    ]

    # Build hash chain from recent audit events
    from sqlalchemy import select as sa_select
    hash_q = (
        sa_select(AuditEvent.event_hash)
        .where(AuditEvent.company_id == current_user.company_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(10)
    )
    hash_rows = (await session.execute(hash_q)).scalars().all()
    hash_chain = list(reversed(hash_rows)) if hash_rows else []

    content = export_finra_17a4(run_data, findings, hash_chain)

    await _emit_report_audit(session, current_user, run_id, "finra-17a4")
    logger.info("RPT-09: FINRA 17a-4 export run=%s user=%s", run_id, current_user.email)

    filename = f"finra-17a4-{run_id[:8]}.txt"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{run_id}/mifid")
async def download_mifid(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/reports/{run_id}/mifid

    Generate MiFID II RTS 25 transaction report XML for the given
    calculation run. Reports FX derivative transactions per
    MiFID II (EU 2014/65) Article 26.

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    run = await _fetch_run(session, run_id, current_user.company_id)
    positions = await _fetch_positions(
        session, run.position_ids or [], current_user.company_id
    )

    hedge_plan = (run.run_envelope or {}).get("hedge_plan") or {}
    buckets: list[dict] = hedge_plan.get("buckets", [])
    run_data = await _build_reg_run_data(run, current_user, run_id, session)

    content = export_mifid_xml(
        run_data, buckets, _positions_to_dicts(positions)
    )

    await _emit_report_audit(session, current_user, run_id, "mifid")
    logger.info("RPT-09: MiFID export run=%s user=%s", run_id, current_user.email)

    filename = f"mifid-report-{run_id[:8]}.xml"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/xml; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{run_id}/dodd-frank")
async def download_dodd_frank(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    GET /v1/reports/{run_id}/dodd-frank

    Generate Dodd-Frank Title VII swap data report for the given
    calculation run. Reports FX swap/forward transactions per
    CFTC Part 45 real-time reporting requirements.

    Requires: reports.export
    """
    await _require(session, current_user, "reports.export")

    run = await _fetch_run(session, run_id, current_user.company_id)
    positions = await _fetch_positions(
        session, run.position_ids or [], current_user.company_id
    )

    hedge_plan = (run.run_envelope or {}).get("hedge_plan") or {}
    buckets: list[dict] = hedge_plan.get("buckets", [])
    run_data = await _build_reg_run_data(run, current_user, run_id, session)

    # Build hash chain from audit events
    from sqlalchemy import select as sa_select
    hash_q = (
        sa_select(AuditEvent.event_hash)
        .where(AuditEvent.company_id == current_user.company_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(10)
    )
    hash_rows = (await session.execute(hash_q)).scalars().all()
    hash_chain = list(reversed(hash_rows)) if hash_rows else []

    content = export_dodd_frank(
        run_data, buckets, _positions_to_dicts(positions), hash_chain
    )

    await _emit_report_audit(session, current_user, run_id, "dodd-frank")
    logger.info(
        "RPT-09: Dodd-Frank export run=%s user=%s", run_id, current_user.email
    )

    filename = f"dodd-frank-{run_id[:8]}.txt"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
