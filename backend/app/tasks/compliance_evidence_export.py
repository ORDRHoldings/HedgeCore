"""
app/tasks/compliance_evidence_export.py
ORDR Terminal — Nightly SOC2 compliance evidence export.

Runs nightly at 02:00 UTC via APScheduler.
For each active tenant, collects three evidence metrics and writes
a ComplianceEvidence row (WORM — never updated or deleted).
"""
from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent
from app.models.compliance_evidence import ComplianceEvidence
from app.models.organization import Company
from app.models.policy_revision import PolicyRevision
from app.models.user import User

log = logging.getLogger(__name__)


async def collect_evidence_snapshot(
    session: AsyncSession,
    company_id,
    snapshot_date: date | None = None,
) -> list[ComplianceEvidence]:
    """Collect the three SOC2 evidence metrics for one tenant."""
    today = snapshot_date or date.today()
    cutoff = datetime.now(UTC) - timedelta(hours=24)

    user_result = await session.execute(
        select(func.count()).select_from(User).where(
            User.company_id == company_id,
            User.is_active.is_(True),
        )
    )
    user_count = user_result.scalar() or 0

    policy_result = await session.execute(
        select(func.count()).select_from(PolicyRevision).where(
            PolicyRevision.company_id == company_id,
            PolicyRevision.created_at >= cutoff,
        )
    )
    policy_count = policy_result.scalar() or 0

    failed_result = await session.execute(
        select(func.count()).select_from(AuditEvent).where(
            AuditEvent.company_id == company_id,
            AuditEvent.event_type == "LOGIN",
            AuditEvent.created_at >= cutoff,
            AuditEvent.payload["success"].as_boolean().is_(False),
        )
    )
    failed_count = failed_result.scalar() or 0

    latest_hash_result = await session.execute(
        select(AuditEvent.event_hash)
        .where(AuditEvent.company_id == company_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(1)
    )
    latest_hash = latest_hash_result.scalar()

    return [
        ComplianceEvidence(
            company_id=company_id,
            evidence_date=today,
            evidence_type="user_count",
            payload={"count": user_count},
            latest_audit_event_hash=latest_hash,
        ),
        ComplianceEvidence(
            company_id=company_id,
            evidence_date=today,
            evidence_type="policy_change_count",
            payload={"count": policy_count, "window_hours": 24},
            latest_audit_event_hash=latest_hash,
        ),
        ComplianceEvidence(
            company_id=company_id,
            evidence_date=today,
            evidence_type="failed_auth_count",
            payload={"count": failed_count, "window_hours": 24},
            latest_audit_event_hash=latest_hash,
        ),
    ]


async def run_compliance_evidence_export() -> None:
    """Entry point called by APScheduler at 02:00 UTC."""
    from app.core.db import async_session_maker

    log.info("Starting nightly compliance evidence export")

    async with async_session_maker() as session:
        try:
            companies_result = await session.execute(
                select(Company.id).where(Company.is_active.is_(True))
            )
            company_ids = [row[0] for row in companies_result.fetchall()]
            total_rows = 0
            for company_id in company_ids:
                rows = await collect_evidence_snapshot(session, company_id)
                for row in rows:
                    session.add(row)
                total_rows += len(rows)
            await session.commit()
            log.info(
                "Compliance evidence export complete: %d companies, %d rows",
                len(company_ids),
                total_rows,
            )
        except Exception:
            log.exception("Compliance evidence export failed — rolling back")
            await session.rollback()
