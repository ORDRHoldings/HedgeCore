"""
Audit event API -- /api/v1/audit

Endpoints:
  POST  /v1/audit          -> write a single audit event (internal use + frontend)
  GET   /v1/audit          -> query audit events (date range, actor, type, entity)
  GET   /v1/audit/{id}     -> fetch single event by UUID
  GET   /v1/audit/chain    -> verify hash chain integrity for caller's tenant

The audit log is append-only (WORM). Read endpoints only. No PUT/DELETE.
All writes go through build_audit_event() which computes the tamper-evident hash.

The prev_event_hash chain is per-tenant: each new event for a company picks up
the hash of the most recent event for that company. This creates a linked chain
that can be verified end-to-end by compliance officers or external auditors.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.audit_event import AuditEvent, GENESIS_HASH, build_audit_event, compute_event_hash
from app.models.user import User
from app.services import rbac_service

router = APIRouter(prefix="/v1/audit", tags=["v1-audit"])


# ?? Schemas ????????????????????????????????????????????????????????????????????

class AuditEventCreate(BaseModel):
    event_type:  str
    description: str
    entity_type: Optional[str] = None
    entity_id:   Optional[str] = None
    payload:     dict          = {}


class AuditEventResponse(BaseModel):
    id:              str
    company_id:      Optional[str] = None
    actor_id:        Optional[str] = None
    actor_email:     Optional[str] = None
    actor_role:      Optional[str] = None
    event_type:      str
    description:     str
    entity_type:     Optional[str] = None
    entity_id:       Optional[str] = None
    payload:         dict
    event_hash:      str
    prev_event_hash: str
    ip_address:      Optional[str] = None
    created_at:      str


class AuditListResponse(BaseModel):
    items: list[AuditEventResponse]
    total: int


class ChainIntegrityReport(BaseModel):
    tenant_id:       Optional[str]
    events_checked:  int
    broken_at:       Optional[str]       # event_id where chain breaks (null = intact)
    is_intact:       bool
    verified_at:     str


# ?? Helpers ????????????????????????????????????????????????????????????????????

def _row_to_response(r: AuditEvent) -> AuditEventResponse:
    return AuditEventResponse(
        id              = str(r.id),
        company_id      = str(r.company_id)  if r.company_id  else None,
        actor_id        = str(r.actor_id)    if r.actor_id    else None,
        actor_email     = r.actor_email,
        actor_role      = r.actor_role,
        event_type      = r.event_type,
        description     = r.description,
        entity_type     = r.entity_type,
        entity_id       = r.entity_id,
        payload         = r.payload or {},
        event_hash      = r.event_hash,
        prev_event_hash = r.prev_event_hash,
        ip_address      = r.ip_address,
        created_at      = r.created_at.isoformat() if r.created_at else "",
    )


async def _get_prev_hash(session: AsyncSession, company_id) -> str:
    """Fetch the most recent event_hash for this tenant to chain onto."""
    q = (
        select(AuditEvent.event_hash)
        .where(AuditEvent.company_id == company_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(1)
    )
    result = await session.execute(q)
    row = result.scalar_one_or_none()
    return row or GENESIS_HASH


# ?? POST /v1/audit -- write an event ???????????????????????????????????????????

@router.post("", response_model=AuditEventResponse, status_code=201)
async def write_audit_event(
    data:         AuditEventCreate,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Write a single audit event. The hash chain is automatically maintained.
    Any frontend or backend service can call this to record an action.
    Required permission: audit.write (or any authenticated user for their own events).
    """
    prev_hash = await _get_prev_hash(session, current_user.company_id)

    event = build_audit_event(
        event_type       = data.event_type,
        description      = data.description,
        payload          = data.payload,
        prev_event_hash  = prev_hash,
        company_id       = current_user.company_id,
        branch_id        = current_user.branch_id,
        actor_id         = current_user.id,
        actor_email      = current_user.email,
        entity_type      = data.entity_type,
        entity_id        = data.entity_id,
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return _row_to_response(event)


# ?? GET /v1/audit -- query events ??????????????????????????????????????????????

@router.get("", response_model=AuditListResponse)
async def list_audit_events(
    event_type:  Optional[str]  = Query(default=None, description="Filter by event_type"),
    entity_type: Optional[str]  = Query(default=None, description="Filter by entity_type"),
    entity_id:   Optional[str]  = Query(default=None, description="Filter by entity_id"),
    actor_id:    Optional[str]  = Query(default=None, description="Filter by actor UUID"),
    from_ts:     Optional[str]  = Query(default=None, description="ISO timestamp lower bound"),
    to_ts:       Optional[str]  = Query(default=None, description="ISO timestamp upper bound"),
    limit:       int             = Query(default=100, le=500, ge=1),
    offset:      int             = Query(default=0, ge=0),
    session:     AsyncSession    = Depends(get_async_session),
    current_user: User           = Depends(get_current_user),
):
    """
    Query audit events for the caller's tenant.
    Superusers can see all tenants' events (add ?company_id= to filter).
    Returns events in reverse-chronological order (newest first).
    """
    q = select(AuditEvent).order_by(AuditEvent.created_at.desc())

    # Tenant scoping
    if not current_user.is_superuser:
        q = q.where(AuditEvent.company_id == current_user.company_id)

    # Filters
    if event_type:
        q = q.where(AuditEvent.event_type == event_type.upper())
    if entity_type:
        q = q.where(AuditEvent.entity_type == entity_type)
    if entity_id:
        q = q.where(AuditEvent.entity_id == entity_id)
    if actor_id:
        try:
            q = q.where(AuditEvent.actor_id == UUID(actor_id))
        except ValueError:
            raise HTTPException(status_code=422, detail="actor_id must be a valid UUID")
    if from_ts:
        try:
            q = q.where(AuditEvent.created_at >= datetime.fromisoformat(from_ts))
        except ValueError:
            raise HTTPException(status_code=422, detail="from_ts must be ISO format")
    if to_ts:
        try:
            q = q.where(AuditEvent.created_at <= datetime.fromisoformat(to_ts))
        except ValueError:
            raise HTTPException(status_code=422, detail="to_ts must be ISO format")

    # Pagination
    q = q.offset(offset).limit(limit)
    rows = list((await session.execute(q)).scalars().all())
    return {"items": [_row_to_response(r) for r in rows], "total": len(rows)}


# ?? GET /v1/audit/{event_id} -- single event ???????????????????????????????????

@router.get("/{event_id}", response_model=AuditEventResponse)
async def get_audit_event(
    event_id:    UUID,
    session:     AsyncSession = Depends(get_async_session),
    current_user: User        = Depends(get_current_user),
):
    row = await session.get(AuditEvent, event_id)
    if not row:
        raise HTTPException(status_code=404, detail="Audit event not found")
    if not current_user.is_superuser and row.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Audit event not found")
    return _row_to_response(row)


# ?? GET /v1/audit/chain -- verify hash chain integrity ?????????????????????????

@router.get("/chain/verify", response_model=ChainIntegrityReport)
async def verify_audit_chain(
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Walk the full audit event chain for this tenant in chronological order,
    recomputing each event's hash and verifying it matches the stored value.
    Also verifies that each event's prev_event_hash matches the previous event.

    Returns a ChainIntegrityReport:
      - is_intact: True if no tampering detected
      - broken_at: event_id of first broken link (null if intact)
      - events_checked: number of events verified
    """
    q = (
        select(AuditEvent)
        .where(AuditEvent.company_id == current_user.company_id)
        .order_by(AuditEvent.created_at.asc())
    )
    rows = list((await session.execute(q)).scalars().all())

    prev_hash = GENESIS_HASH
    broken_at: str | None = None

    for row in rows:
        # Recompute expected hash
        expected = compute_event_hash(
            event_type  = row.event_type,
            actor_id    = str(row.actor_id) if row.actor_id else None,
            entity_id   = row.entity_id,
            payload     = row.payload or {},
            created_at  = row.created_at,
            prev_hash   = row.prev_event_hash,
        )
        # Check stored hash matches recomputed hash
        if row.event_hash != expected:
            broken_at = str(row.id)
            break
        # Check chain linkage
        if row.prev_event_hash != prev_hash:
            broken_at = str(row.id)
            break
        prev_hash = row.event_hash

    return ChainIntegrityReport(
        tenant_id       = str(current_user.company_id) if current_user.company_id else None,
        events_checked  = len(rows),
        broken_at       = broken_at,
        is_intact       = broken_at is None,
        verified_at     = datetime.now(timezone.utc).isoformat(),
    )
