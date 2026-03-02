"""Pipeline DB persistence layer -- async CRUD for proposals, staging, ledger.

Translates between Pydantic pipeline schemas and SQLAlchemy ORM models.
Sandbox runs remain in-memory (ephemeral simulations).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, update as sa_update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.proposal import Proposal as ProposalORM
from app.models.staging import StagingArtifact as StagingORM, Approval as ApprovalORM
from app.models.ledger import LedgerEntry as LedgerORM

from app.schemas_v1.pipeline import (
    ApprovalRecord,
    AuthorizationStatus,
    FreezeArtifact,
    LedgerEntry,
    Proposal,
    ProposalStatus,
    ProvenanceChain,
    StagedArtifact,
    TimelineEvent,
    WaterfallResult,
)


# ---------------------------------------------------------------------------
# Proposal CRUD
# ---------------------------------------------------------------------------


def _proposal_orm_to_schema(row: ProposalORM) -> Proposal:
    """Convert ORM Proposal to Pydantic schema."""
    return Proposal(
        proposal_id=row.proposal_id,
        status=ProposalStatus(row.status),
        created_by=str(row.created_by),
        created_at=row.created_at,
        snapshot_hash=row.snapshot_hash,
        policy_version=row.policy_version,
        exposure_digest=row.exposure_digest,
        engine_version=row.engine_version,
        calculate_response=row.calculate_response,
        waterfall=WaterfallResult(**row.waterfall_result),
        frozen_inputs=row.frozen_inputs,
        freeze_artifact=FreezeArtifact(**row.freeze_artifact),
        residual_risk_vector=row.residual_risk_vector,
        capability_flags=row.capability_flags,
    )


async def save_proposal(session: AsyncSession, proposal: Proposal, run_id: str) -> None:
    """Persist a Pydantic Proposal to the database."""
    # Determine user UUID -- use a nil UUID for anonymous
    try:
        user_uuid = uuid.UUID(proposal.created_by)
    except (ValueError, AttributeError):
        user_uuid = uuid.UUID("00000000-0000-0000-0000-000000000000")

    orm = ProposalORM(
        id=uuid.uuid4(),
        proposal_id=proposal.proposal_id,
        status=proposal.status.value if hasattr(proposal.status, "value") else str(proposal.status),
        created_by=user_uuid,
        created_at=proposal.created_at,
        run_id=run_id,
        engine_version=proposal.engine_version,
        snapshot_hash=proposal.snapshot_hash,
        policy_hash=proposal.freeze_artifact.policy_hash if proposal.freeze_artifact else "",
        exposure_digest=proposal.exposure_digest,
        policy_version=proposal.policy_version,
        frozen_inputs=proposal.frozen_inputs,
        calculate_response=proposal.calculate_response,
        waterfall_result=proposal.waterfall.model_dump(mode="json"),
        freeze_artifact=proposal.freeze_artifact.model_dump(mode="json"),
        residual_risk_vector=proposal.residual_risk_vector,
        capability_flags=proposal.capability_flags,
    )
    session.add(orm)
    await session.commit()


async def update_proposal_status(session: AsyncSession, proposal_id: str, status: str) -> None:
    """Update the status of a proposal."""
    result = await session.execute(
        select(ProposalORM).where(ProposalORM.proposal_id == proposal_id)
    )
    row = result.scalars().first()
    if row:
        row.status = status
        await session.commit()


async def load_proposal(session: AsyncSession, proposal_id: str) -> Proposal | None:
    """Load a Proposal from the database."""
    result = await session.execute(
        select(ProposalORM).where(ProposalORM.proposal_id == proposal_id)
    )
    row = result.scalars().first()
    if not row:
        return None
    return _proposal_orm_to_schema(row)


async def load_all_proposals(session: AsyncSession) -> list[Proposal]:
    """Load all proposals."""
    result = await session.execute(
        select(ProposalORM).order_by(ProposalORM.created_at.desc())
    )
    return [_proposal_orm_to_schema(r) for r in result.scalars().all()]


# ---------------------------------------------------------------------------
# Staging CRUD
# ---------------------------------------------------------------------------


def _staging_orm_to_schema(row: StagingORM) -> StagedArtifact:
    """Convert ORM StagingArtifact to Pydantic schema."""
    approvals = []
    for a in (row.approvals or []):
        approvals.append(ApprovalRecord(
            approver_id=str(a.approver_id),
            approver_role=a.approver_role,
            action=a.action,
            signature_hash=a.signature_hash,
            comment=a.comment or "",
            timestamp=a.created_at,
        ))
    return StagedArtifact(
        staging_id=row.staging_id,
        proposal_id=row.proposal_id,
        submitted_by=str(row.submitted_by),
        submitted_at=row.submitted_at,
        justification=row.justification,
        integrity_score=row.integrity_score,
        authorization_status=AuthorizationStatus(row.authorization_status),
        required_approvals=row.required_approvals,
        version=row.version,
        approvals=approvals,
        company_id=str(row.company_id) if row.company_id else None,
    )


async def save_staging(session: AsyncSession, artifact: StagedArtifact) -> None:
    """Persist a StagedArtifact to the database."""
    try:
        user_uuid = uuid.UUID(artifact.submitted_by)
    except (ValueError, AttributeError):
        user_uuid = uuid.UUID("00000000-0000-0000-0000-000000000000")

    orm = StagingORM(
        id=uuid.uuid4(),
        staging_id=artifact.staging_id,
        proposal_id=artifact.proposal_id,
        submitted_by=user_uuid,
        submitted_at=artifact.submitted_at,
        justification=artifact.justification,
        integrity_score=artifact.integrity_score,
        authorization_status=artifact.authorization_status.value
            if hasattr(artifact.authorization_status, "value")
            else str(artifact.authorization_status),
        required_approvals=artifact.required_approvals,
        company_id=uuid.UUID(artifact.company_id) if artifact.company_id else None,
    )
    session.add(orm)
    await session.commit()


async def save_approval(
    session: AsyncSession,
    staging_id: str,
    approval: ApprovalRecord,
) -> bool:
    """Save an approval record. Returns False (idempotent) if duplicate exists."""
    result = await session.execute(
        select(StagingORM).where(StagingORM.staging_id == staging_id)
    )
    staging_row = result.scalars().first()
    if not staging_row:
        return False

    try:
        approver_uuid = uuid.UUID(approval.approver_id)
    except (ValueError, AttributeError):
        approver_uuid = uuid.UUID("00000000-0000-0000-0000-000000000000")

    orm = ApprovalORM(
        id=uuid.uuid4(),
        staging_artifact_id=staging_row.id,
        approver_id=approver_uuid,
        approver_role=approval.approver_role,
        action=approval.action.value if hasattr(approval.action, "value") else str(approval.action),
        signature_hash=approval.signature_hash,
        comment=approval.comment or "",
        created_at=approval.timestamp,
    )
    try:
        session.add(orm)
        await session.commit()
        return True
    except IntegrityError:
        await session.rollback()
        return False


async def update_staging_status(
    session: AsyncSession,
    staging_id: str,
    status: str,
) -> None:
    """Update authorization status of a staging artifact."""
    result = await session.execute(
        select(StagingORM).where(StagingORM.staging_id == staging_id)
    )
    row = result.scalars().first()
    if row:
        row.authorization_status = status
        await session.commit()


async def update_staging_status_versioned(
    session: AsyncSession,
    staging_id: str,
    status: str,
    expected_version: int,
) -> bool:
    """Optimistic-lock update: only succeeds if current version == expected_version.
    Returns True if updated, False if version conflict (concurrent modification)."""
    stmt = (
        sa_update(StagingORM)
        .where(
            StagingORM.staging_id == staging_id,
            StagingORM.version == expected_version,
        )
        .values(authorization_status=status, version=expected_version + 1)
        .execution_options(synchronize_session="fetch")
    )
    result = await session.execute(stmt)
    await session.commit()
    return result.rowcount == 1


async def load_staging(session: AsyncSession, staging_id: str) -> StagedArtifact | None:
    """Load a StagedArtifact from the database."""
    result = await session.execute(
        select(StagingORM)
        .options(selectinload(StagingORM.approvals))
        .where(StagingORM.staging_id == staging_id)
    )
    row = result.scalars().first()
    if not row:
        return None
    return _staging_orm_to_schema(row)


async def load_all_staging(
    session: AsyncSession,
    limit: int = 100,
    offset: int = 0,
    status_filter: str | None = None,
    company_id_filter: str | None = None,
) -> list[StagedArtifact]:
    """Load staging artifacts with optional status and tenant filters."""
    q = select(StagingORM).options(selectinload(StagingORM.approvals))
    if status_filter:
        q = q.where(StagingORM.authorization_status == status_filter)
    if company_id_filter:
        try:
            cid = uuid.UUID(company_id_filter)
            q = q.where(StagingORM.company_id == cid)
        except (ValueError, AttributeError):
            pass
    q = q.order_by(StagingORM.submitted_at.desc()).limit(limit).offset(offset)
    result = await session.execute(q)
    return [_staging_orm_to_schema(r) for r in result.scalars().all()]


async def count_staging(
    session: AsyncSession,
    status_filter: str | None = None,
    company_id_filter: str | None = None,
) -> int:
    """Count total staging artifacts, optionally filtered by status and tenant."""
    q = select(func.count()).select_from(StagingORM)
    if status_filter:
        q = q.where(StagingORM.authorization_status == status_filter)
    if company_id_filter:
        try:
            cid = uuid.UUID(company_id_filter)
            q = q.where(StagingORM.company_id == cid)
        except (ValueError, AttributeError):
            pass
    result = await session.execute(q)
    return result.scalar_one()


# ---------------------------------------------------------------------------
# Ledger CRUD
# ---------------------------------------------------------------------------


def _ledger_orm_to_schema(row: LedgerORM) -> LedgerEntry:
    """Convert ORM LedgerEntry to Pydantic schema."""
    provenance = ProvenanceChain(**row.provenance_chain) if row.provenance_chain else None
    freeze = FreezeArtifact(**row.frozen_artifact) if row.frozen_artifact else None
    return LedgerEntry(
        ledger_id=row.ledger_id,
        order_id=row.order_id,
        staging_id=row.staging_id,
        authorized_by=str(row.authorized_by),
        authorized_at=row.authorized_at,
        signature_hash=row.signature_hash,
        provenance_chain=provenance,
        root_hash=row.root_hash,
        freeze_artifact=freeze,
        replay_verified=row.replay_verified,
    )


async def save_ledger(session: AsyncSession, entry: LedgerEntry) -> None:
    """Persist a LedgerEntry to the database."""
    try:
        auth_uuid = uuid.UUID(entry.authorized_by)
    except (ValueError, AttributeError):
        auth_uuid = uuid.UUID("00000000-0000-0000-0000-000000000000")

    orm = LedgerORM(
        id=uuid.uuid4(),
        ledger_id=entry.ledger_id,
        order_id=entry.order_id,
        staging_id=entry.staging_id,
        authorized_by=auth_uuid,
        authorized_at=entry.authorized_at,
        signature_hash=entry.signature_hash,
        root_hash=entry.root_hash,
        provenance_chain=entry.provenance_chain.model_dump(mode="json")
            if entry.provenance_chain else {},
        frozen_artifact=entry.freeze_artifact.model_dump(mode="json")
            if entry.freeze_artifact else {},
        replay_verified=entry.replay_verified,
    )
    session.add(orm)
    await session.commit()


async def load_ledger(session: AsyncSession, ledger_id: str) -> LedgerEntry | None:
    """Load a LedgerEntry from the database."""
    result = await session.execute(
        select(LedgerORM).where(LedgerORM.ledger_id == ledger_id)
    )
    row = result.scalars().first()
    if not row:
        return None
    return _ledger_orm_to_schema(row)


async def load_all_ledger(session: AsyncSession) -> list[LedgerEntry]:
    """Load all ledger entries."""
    result = await session.execute(
        select(LedgerORM).order_by(LedgerORM.authorized_at.desc())
    )
    return [_ledger_orm_to_schema(r) for r in result.scalars().all()]
