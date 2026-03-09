"""
Audit Lab Scheduler -- schedule recurring audit runs.

v1 stub: in-memory schedule store, no actual APScheduler integration.
Each schedule definition captures the cron expression and benchmark config
needed to trigger the same engine path as manual runs.  Actual background
execution would require a worker process (deferred to v2).

Usage:
    from app.services.audit_scheduler import (
        create_schedule,
        get_schedules,
        get_schedule,
        delete_schedule,
    )
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class AuditSchedule:
    """A single recurring audit run definition."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str = ""
    dataset_id: str = ""
    benchmark_config: dict[str, Any] = field(default_factory=dict)
    cron_expression: str = "0 0 * * 1"  # weekly Monday midnight
    enabled: bool = True
    created_by: str = ""
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None


# ---------------------------------------------------------------------------
# In-memory schedule store (v1 -- no persistence beyond process lifetime)
# ---------------------------------------------------------------------------
_schedules: dict[str, AuditSchedule] = {}


def create_schedule(
    company_id: str,
    dataset_id: str,
    benchmark_config: dict[str, Any],
    cron_expression: str,
    created_by: str,
) -> AuditSchedule:
    """Create and store a new audit schedule.

    Parameters
    ----------
    company_id:
        Tenant scope -- schedules are isolated per company.
    dataset_id:
        The uploaded dataset to run the audit against.
    benchmark_config:
        Benchmark parameters forwarded to ``run_audit_engine``.
    cron_expression:
        Standard 5-field cron expression (min hour dom mon dow).
    created_by:
        User ID of the creator (for audit trail).

    Returns
    -------
    AuditSchedule
        The newly created schedule with a generated UUID.
    """
    schedule = AuditSchedule(
        company_id=company_id,
        dataset_id=dataset_id,
        benchmark_config=benchmark_config,
        cron_expression=cron_expression,
        created_by=created_by,
    )
    _schedules[schedule.id] = schedule
    logger.info(
        "Created audit schedule id=%s company=%s cron=%s",
        schedule.id,
        company_id,
        cron_expression,
    )
    return schedule


def get_schedules(company_id: str) -> list[AuditSchedule]:
    """List all schedules for a company, ordered by creation time descending."""
    return sorted(
        [s for s in _schedules.values() if s.company_id == company_id],
        key=lambda s: s.created_at,
        reverse=True,
    )


def get_schedule(schedule_id: str, company_id: str) -> AuditSchedule | None:
    """Get a single schedule by ID, scoped to company.

    Returns ``None`` if the schedule does not exist or belongs to a
    different company.
    """
    schedule = _schedules.get(schedule_id)
    if schedule is None or schedule.company_id != company_id:
        return None
    return schedule


def delete_schedule(schedule_id: str, company_id: str) -> bool:
    """Delete a schedule by ID, scoped to company.

    Returns ``True`` if the schedule was found and deleted, ``False``
    otherwise.
    """
    schedule = _schedules.get(schedule_id)
    if schedule is None or schedule.company_id != company_id:
        return False
    del _schedules[schedule_id]
    logger.info("Deleted audit schedule id=%s company=%s", schedule_id, company_id)
    return True


def update_last_run(schedule_id: str, company_id: str) -> AuditSchedule | None:
    """Mark a schedule as having just run (sets ``last_run_at``).

    Returns the updated schedule, or ``None`` if not found.
    """
    schedule = get_schedule(schedule_id, company_id)
    if schedule is None:
        return None
    schedule.last_run_at = datetime.now(UTC)
    return schedule


def toggle_enabled(schedule_id: str, company_id: str) -> AuditSchedule | None:
    """Toggle a schedule's enabled flag.

    Returns the updated schedule, or ``None`` if not found.
    """
    schedule = get_schedule(schedule_id, company_id)
    if schedule is None:
        return None
    schedule.enabled = not schedule.enabled
    logger.info(
        "Toggled audit schedule id=%s enabled=%s", schedule_id, schedule.enabled
    )
    return schedule


def clear_company_schedules(company_id: str) -> int:
    """Remove all schedules for a company. Returns count deleted.

    Primarily useful for testing and tenant cleanup.
    """
    to_delete = [sid for sid, s in _schedules.items() if s.company_id == company_id]
    for sid in to_delete:
        del _schedules[sid]
    return len(to_delete)
