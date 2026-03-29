"""
GET  /v1/user/data-export  — GDPR Article 15 right of access
DELETE /v1/user/account    — GDPR Article 17 right to erasure (anonymise, not hard delete)
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.dependencies import get_current_user
from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event
from app.models.user import User
from app.schemas.gdpr import AccountErasureResponse, UserDataExportResponse
from app.tasks.gdpr_anonymise import anonymise_user

log = logging.getLogger(__name__)

router = APIRouter(tags=["gdpr"])


@router.get("/v1/user/data-export", response_model=UserDataExportResponse)
async def export_user_data(
    request: Request,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> UserDataExportResponse:
    """GDPR Article 15 — Right of access."""
    count_result = await db.execute(
        select(func.count()).select_from(AuditEvent).where(
            AuditEvent.actor_id == current_user.id
        )
    )
    audit_count = count_result.scalar() or 0
    log.info("GDPR data export requested by user=%s", current_user.id)

    return UserDataExportResponse(
        user_id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        created_at=current_user.created_at,
        company_id=current_user.company_id,
        branch_id=current_user.branch_id,
        is_active=current_user.is_active,
        is_superuser=current_user.is_superuser,
        audit_event_count=audit_count,
    )


@router.delete("/v1/user/account", response_model=AccountErasureResponse)
async def erase_user_account(
    request: Request,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> AccountErasureResponse:
    """
    GDPR Article 17 — Right to erasure.
    Anonymises PII. WORM audit event written before anonymisation.
    User row retained to preserve WORM table FK integrity.
    """
    user_id = current_user.id
    log.info("GDPR erasure requested by user=%s", user_id)

    # Fetch the tail of the tenant's audit chain for hash linking
    prev_result = await db.execute(
        select(AuditEvent.event_hash)
        .where(AuditEvent.company_id == current_user.company_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(1)
    )
    prev_hash = prev_result.scalars().first() or GENESIS_HASH

    # Write WORM audit event BEFORE anonymising so actor PII is still intact
    audit_event = build_audit_event(
        event_type="GDPR_ERASURE_REQUESTED",
        description=f"GDPR Article 17 erasure requested by user {user_id}",
        payload={"user_id": str(user_id), "company_id": str(current_user.company_id)},
        prev_event_hash=prev_hash,
        company_id=current_user.company_id,
        branch_id=current_user.branch_id,
        actor_id=current_user.id,
        actor_email=current_user.email,
        entity_type="user",
        entity_id=str(user_id),
        ip_address=request.client.host if request.client else None,
        request_id=request.headers.get("X-Request-Id"),
    )
    db.add(audit_event)
    await db.flush()  # persist audit event before anonymising

    await anonymise_user(db, current_user)
    return AccountErasureResponse(
        status="anonymised",
        user_id=user_id,
        message=(
            "Your personal data has been anonymised in accordance with GDPR Article 17. "
            "Immutable audit records referencing your account are retained as required "
            "by financial regulation (MiFID II, EMIR)."
        ),
    )
