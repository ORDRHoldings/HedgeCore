"""regulatory_submission_service — TR submission lifecycle orchestrator.

Wraps the pure-function export layer in `services/regulatory_export.py` with:
  - UTI generation (format: UTI-<tenantShort>-<framework>-<yyyymmdd>-<hex>)
  - Status lifecycle: PENDING -> SUBMITTED -> ACKNOWLEDGED | REJECTED | FAILED
  - SHA-256 of the exported document (tamper-evident anchor)
  - Audit trail via existing `audit_events` hash chain (WORM)

NOT a WORM table itself — status mutates. Evidence integrity is via
document_hash + audit chain entries referencing the submission entity.

Public surface:
  - create_submission(db, tenant_id, user_id, framework, source_run_id=None, uti=None)
  - list_submissions(db, tenant_id, filters)
  - get_submission(db, submission_id, caller_tenant_id)
  - mark_submitted(db, submission_id, tenant_id, user_id, submitted_at=None)
  - acknowledge(db, submission_id, tenant_id, user_id, ack_reference, ack_received_at=None)
  - reject(db, submission_id, tenant_id, user_id, rejection_reason)
  - mark_failed(db, submission_id, tenant_id, user_id, reason)
  - get_stats(db, tenant_id)
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calculation_run import CalculationRun
from app.models.regulatory_submission import (
    FRAMEWORKS,
    STATUSES,
    RegulatorySubmission,
)
from app.schemas_v1.regulatory import SubmissionListFilters
from app.services import regulatory_export


class RegulatorySubmissionError(Exception):
    def __init__(self, code: str, message: str = "") -> None:
        self.code = code
        self.message = message or code
        super().__init__(self.message)


class InvalidTransitionError(RegulatorySubmissionError):
    def __init__(self, from_status: str, to_status: str) -> None:
        super().__init__(
            "invalid_transition",
            f"cannot transition from {from_status} to {to_status}",
        )


# Allowed state transitions. Terminal states (ACKNOWLEDGED) cannot move.
_TRANSITIONS = {
    "PENDING":      {"SUBMITTED", "FAILED"},
    "SUBMITTED":    {"ACKNOWLEDGED", "REJECTED", "FAILED"},
    "REJECTED":     {"SUBMITTED", "FAILED"},  # allow resubmit after fix
    "FAILED":       {"PENDING", "SUBMITTED"},  # retry
    "ACKNOWLEDGED": set(),  # terminal
}


def _generate_uti(tenant_id: UUID, framework: str) -> str:
    """Deterministic-format, globally-unique UTI.

    Format: UTI-<tenantShort>-<framework>-<yyyymmdd>-<10-hex>
    Example: UTI-7a3f4b9c-EMIR-20260418-a1b2c3d4e5
    """
    tenant_short = str(tenant_id).replace("-", "")[:8]
    date_str = datetime.now(UTC).strftime("%Y%m%d")
    rand = secrets.token_hex(5)
    return f"UTI-{tenant_short}-{framework}-{date_str}-{rand}"


def _sha256_hex(data: str | bytes) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


async def _emit_regulatory_audit(
    db: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
    event_type: str,
    submission_id: UUID,
    extra: dict[str, Any] | None = None,
) -> None:
    """Emit into hash-chained audit_events. Uses FOR UPDATE to serialise."""
    from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event

    prev_hash_row = (await db.execute(
        select(AuditEvent.event_hash)
        .where(AuditEvent.company_id == tenant_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(1)
        .with_for_update()
    )).scalar_one_or_none()
    prev_hash = prev_hash_row or GENESIS_HASH

    payload: dict[str, Any] = {"submission_id": str(submission_id)}
    if extra:
        payload.update(extra)

    event = build_audit_event(
        event_type=event_type,
        description=f"{event_type} for regulatory_submission {submission_id}",
        payload=payload,
        prev_event_hash=prev_hash,
        company_id=tenant_id,
        actor_id=user_id,
        entity_type="regulatory_submission",
        entity_id=str(submission_id),
    )
    db.add(event)


async def _load_run_bundle(
    db: AsyncSession, tenant_id: UUID, source_run_id: str
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Load CalculationRun and derive (run_data, transactions) for export.

    run_envelope JSONB is the source of truth. If missing fields, falls back to empty.
    """
    stmt = select(CalculationRun).where(
        CalculationRun.id == source_run_id,
        CalculationRun.company_id == tenant_id,
    )
    run = (await db.execute(stmt)).scalar_one_or_none()
    if run is None:
        raise RegulatorySubmissionError(
            "run_not_found", f"calculation_run {source_run_id} not found for tenant"
        )

    envelope = run.run_envelope or {}
    inputs = envelope.get("inputs", {}) if isinstance(envelope, dict) else {}
    outputs = envelope.get("outputs", {}) if isinstance(envelope, dict) else {}

    run_data: dict[str, Any] = {
        "run_id": run.id,
        "trade_date": inputs.get("trade_date", ""),
        "value_date": inputs.get("value_date", ""),
        "counterparty": inputs.get("counterparty", ""),
        "currency_base": inputs.get("currency_base", ""),
        "currency_quote": inputs.get("currency_quote", ""),
        "notional": inputs.get("notional", 0),
        "rate": outputs.get("rate", inputs.get("rate", 0)),
    }

    # Transactions may live in run_envelope.outputs.transactions or outputs.hedges
    txns_raw = outputs.get("transactions") or outputs.get("hedges") or []
    transactions: list[dict[str, Any]] = []
    if isinstance(txns_raw, list):
        for i, t in enumerate(txns_raw):
            if not isinstance(t, dict):
                continue
            transactions.append({
                "transaction_id": t.get("id") or t.get("transaction_id") or f"{run.id}-{i}",
                "direction": t.get("direction", "BUY"),
                "currency": t.get("currency", ""),
                "amount": t.get("amount", 0),
                "rate": t.get("rate", 0),
                "value_date": t.get("value_date", ""),
            })
    return run_data, transactions


def _render_document(
    framework: str,
    run_data: dict[str, Any],
    transactions: list[dict[str, Any]],
    uti: str,
) -> str:
    """Dispatch to the correct export function. Injects UTI into run_data."""
    run_data = dict(run_data)
    run_data["uti"] = uti

    if framework == "ISDA":
        return regulatory_export.export_isda_xml(run_data, transactions)
    if framework == "FINRA_17A4":
        return regulatory_export.export_finra_17a4(run_data, transactions)
    if framework == "EMIR":
        return regulatory_export.export_emir_xml(run_data, transactions)
    if framework == "MIFID_II":
        return regulatory_export.export_mifid_xml(run_data, transactions)
    if framework == "DODD_FRANK":
        return regulatory_export.export_dodd_frank(run_data, transactions)
    if framework == "IFRS9":
        return regulatory_export.export_ifrs9_xml(run_data, transactions)
    raise RegulatorySubmissionError(
        "unsupported_framework", f"framework={framework} not supported"
    )


async def create_submission(
    db: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
    framework: str,
    source_run_id: str | None = None,
    uti: str | None = None,
) -> RegulatorySubmission:
    """Generate the report, hash it, persist PENDING submission, emit audit."""
    if framework not in FRAMEWORKS:
        raise RegulatorySubmissionError(
            "invalid_framework", f"framework must be one of {FRAMEWORKS}"
        )

    run_data: dict[str, Any] = {}
    transactions: list[dict[str, Any]] = []
    if source_run_id:
        run_data, transactions = await _load_run_bundle(db, tenant_id, source_run_id)

    submission_uti = uti or _generate_uti(tenant_id, framework)
    document = _render_document(framework, run_data, transactions, submission_uti)
    doc_bytes = len(document.encode("utf-8"))
    doc_hash = _sha256_hex(document)

    submission = RegulatorySubmission(
        tenant_id=tenant_id,
        framework=framework,
        uti=submission_uti,
        source_run_id=source_run_id,
        status="PENDING",
        document_bytes=doc_bytes,
        document_hash=doc_hash,
        created_by_user_id=user_id,
    )
    db.add(submission)
    await db.flush()

    await _emit_regulatory_audit(
        db, tenant_id, user_id,
        event_type="REGULATORY_SUBMISSION_CREATED",
        submission_id=submission.id,
        extra={
            "framework": framework,
            "uti": submission_uti,
            "document_hash": doc_hash,
            "source_run_id": source_run_id,
        },
    )
    await db.commit()
    await db.refresh(submission)
    return submission


async def get_submission(
    db: AsyncSession, submission_id: UUID, caller_tenant_id: UUID
) -> RegulatorySubmission:
    stmt = select(RegulatorySubmission).where(
        RegulatorySubmission.id == submission_id,
        RegulatorySubmission.tenant_id == caller_tenant_id,
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise RegulatorySubmissionError("not_found", "submission not found")
    return row


async def list_submissions(
    db: AsyncSession, tenant_id: UUID, filters: SubmissionListFilters
) -> list[RegulatorySubmission]:
    stmt = select(RegulatorySubmission).where(
        RegulatorySubmission.tenant_id == tenant_id
    )
    if filters.framework:
        stmt = stmt.where(RegulatorySubmission.framework == filters.framework)
    if filters.status:
        stmt = stmt.where(RegulatorySubmission.status == filters.status)
    if filters.source_run_id:
        stmt = stmt.where(RegulatorySubmission.source_run_id == filters.source_run_id)
    stmt = stmt.order_by(RegulatorySubmission.created_at.desc()).limit(filters.limit)
    return list((await db.execute(stmt)).scalars().all())


def _require_transition(current: str, target: str) -> None:
    allowed = _TRANSITIONS.get(current, set())
    if target not in allowed:
        raise InvalidTransitionError(current, target)


async def _transition(
    db: AsyncSession,
    submission_id: UUID,
    tenant_id: UUID,
    user_id: UUID,
    target_status: str,
    event_type: str,
    mutate: dict[str, Any] | None = None,
    audit_extra: dict[str, Any] | None = None,
) -> RegulatorySubmission:
    """Shared path: load, validate, mutate, audit, commit."""
    if target_status not in STATUSES:
        raise RegulatorySubmissionError("invalid_status", target_status)

    submission = await get_submission(db, submission_id, tenant_id)
    prior_status = submission.status
    _require_transition(prior_status, target_status)

    submission.status = target_status
    if mutate:
        for k, v in mutate.items():
            setattr(submission, k, v)

    await db.flush()
    await _emit_regulatory_audit(
        db, tenant_id, user_id,
        event_type=event_type,
        submission_id=submission.id,
        extra={"from_status": prior_status, "to_status": target_status, **(audit_extra or {})},
    )
    await db.commit()
    await db.refresh(submission)
    return submission


async def mark_submitted(
    db: AsyncSession,
    submission_id: UUID,
    tenant_id: UUID,
    user_id: UUID,
    submitted_at: datetime | None = None,
) -> RegulatorySubmission:
    return await _transition(
        db, submission_id, tenant_id, user_id,
        target_status="SUBMITTED",
        event_type="REGULATORY_SUBMISSION_SUBMITTED",
        mutate={"submitted_at": submitted_at or datetime.now(UTC)},
    )


async def acknowledge(
    db: AsyncSession,
    submission_id: UUID,
    tenant_id: UUID,
    user_id: UUID,
    ack_reference: str,
    ack_received_at: datetime | None = None,
) -> RegulatorySubmission:
    return await _transition(
        db, submission_id, tenant_id, user_id,
        target_status="ACKNOWLEDGED",
        event_type="REGULATORY_SUBMISSION_ACKNOWLEDGED",
        mutate={
            "ack_reference": ack_reference,
            "ack_received_at": ack_received_at or datetime.now(UTC),
        },
        audit_extra={"ack_reference": ack_reference},
    )


async def reject(
    db: AsyncSession,
    submission_id: UUID,
    tenant_id: UUID,
    user_id: UUID,
    rejection_reason: str,
) -> RegulatorySubmission:
    return await _transition(
        db, submission_id, tenant_id, user_id,
        target_status="REJECTED",
        event_type="REGULATORY_SUBMISSION_REJECTED",
        mutate={"rejection_reason": rejection_reason},
        audit_extra={"rejection_reason": rejection_reason[:200]},
    )


async def mark_failed(
    db: AsyncSession,
    submission_id: UUID,
    tenant_id: UUID,
    user_id: UUID,
    reason: str,
) -> RegulatorySubmission:
    submission = await get_submission(db, submission_id, tenant_id)
    _require_transition(submission.status, "FAILED")
    submission.status = "FAILED"
    submission.rejection_reason = reason
    submission.retry_count = (submission.retry_count or 0) + 1
    await db.flush()
    await _emit_regulatory_audit(
        db, tenant_id, user_id,
        event_type="REGULATORY_SUBMISSION_FAILED",
        submission_id=submission.id,
        extra={"reason": reason[:200], "retry_count": submission.retry_count},
    )
    await db.commit()
    await db.refresh(submission)
    return submission


async def get_stats(db: AsyncSession, tenant_id: UUID) -> dict[str, Any]:
    stmt = (
        select(RegulatorySubmission.status, func.count())
        .where(RegulatorySubmission.tenant_id == tenant_id)
        .group_by(RegulatorySubmission.status)
    )
    rows = (await db.execute(stmt)).all()
    counts = {s: 0 for s in STATUSES}
    for status, n in rows:
        counts[status] = int(n)
    total = sum(counts.values())
    submitted_or_past = counts["SUBMITTED"] + counts["ACKNOWLEDGED"] + counts["REJECTED"]
    ack_rate_pct = (counts["ACKNOWLEDGED"] / submitted_or_past * 100.0) if submitted_or_past else 0.0
    return {
        "total": total,
        "pending": counts["PENDING"],
        "submitted": counts["SUBMITTED"],
        "acknowledged": counts["ACKNOWLEDGED"],
        "rejected": counts["REJECTED"],
        "failed": counts["FAILED"],
        "ack_rate_pct": round(ack_rate_pct, 2),
    }
