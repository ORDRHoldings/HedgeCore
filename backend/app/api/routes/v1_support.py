"""
Support Ticketing API -- /v1/support

Endpoints:
  POST   /v1/support/tickets                      -- submit a new support ticket
  GET    /v1/support/tickets                      -- list tickets for current company
  GET    /v1/support/tickets/{ticket_id}          -- get single ticket with full event log
  POST   /v1/support/tickets/{ticket_id}/comments -- add a comment to a ticket

All endpoints require a valid JWT (get_current_user).
Tenant isolation is enforced via current_user.company_id.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.support_ticket import SupportTicket, TicketEvent
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/support", tags=["support"])


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class TicketCreate(BaseModel):
    subject: str
    description: str
    severity: Literal["S0", "S1", "S2", "S3", "S4"]
    category: str
    diagnostics_bundle: Optional[dict] = None


class CommentCreate(BaseModel):
    comment: str


class TicketEventOut(BaseModel):
    id: UUID
    event_type: str
    old_status: Optional[str]
    new_status: Optional[str]
    comment: Optional[str]
    actor_email: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class TicketOut(BaseModel):
    id: UUID
    ticket_ref: str
    subject: str
    description: str
    severity: str
    category: str
    status: str
    submitted_by_email: Optional[str]
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime]
    resolution_notes: Optional[str]
    events: List[TicketEventOut] = []

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Helper: generate next ticket_ref for a company
# ---------------------------------------------------------------------------

async def _next_ticket_ref(session: AsyncSession, company_id: UUID) -> str:
    """
    Returns the next zero-padded ticket ref for the given company.
    Format: TKT-XXXX (4 digits, e.g. TKT-0001)
    Uses a COUNT(*) query so it is safe under concurrent inserts --
    collisions are prevented by the UNIQUE(company_id, ticket_ref) constraint;
    callers should retry on IntegrityError if needed (rare under low concurrency).
    """
    result = await session.execute(
        select(func.count()).where(SupportTicket.company_id == company_id)
    )
    count = result.scalar() or 0
    return f"TKT-{count + 1:04d}"


# ---------------------------------------------------------------------------
# Helper: load ticket (with tenant check)
# ---------------------------------------------------------------------------

async def _get_ticket(
    session: AsyncSession,
    ticket_id: UUID,
    company_id: UUID,
    with_events: bool = False,
) -> SupportTicket:
    result = await session.execute(
        select(SupportTicket).where(
            SupportTicket.id == ticket_id,
            SupportTicket.company_id == company_id,
        )
    )
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


async def _load_events(session: AsyncSession, ticket_id: UUID) -> List[TicketEvent]:
    result = await session.execute(
        select(TicketEvent)
        .where(TicketEvent.ticket_id == ticket_id)
        .order_by(TicketEvent.created_at.asc())
    )
    return list(result.scalars().all())


def _ticket_to_out(ticket: SupportTicket, events: List[TicketEvent]) -> TicketOut:
    return TicketOut(
        id=ticket.id,
        ticket_ref=ticket.ticket_ref,
        subject=ticket.subject,
        description=ticket.description,
        severity=ticket.severity,
        category=ticket.category,
        status=ticket.status,
        submitted_by_email=ticket.submitted_by_email,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        resolved_at=ticket.resolved_at,
        resolution_notes=ticket.resolution_notes,
        events=[
            TicketEventOut(
                id=ev.id,
                event_type=ev.event_type,
                old_status=ev.old_status,
                new_status=ev.new_status,
                comment=ev.comment,
                actor_email=ev.actor_email,
                created_at=ev.created_at,
            )
            for ev in events
        ],
    )


# ---------------------------------------------------------------------------
# POST /v1/support/tickets  -- create ticket
# ---------------------------------------------------------------------------

@router.post("/tickets", response_model=TicketOut, status_code=201)
async def create_ticket(
    body: TicketCreate,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> TicketOut:
    async with session.begin():
        ticket_ref = await _next_ticket_ref(session, current_user.company_id)

        ticket = SupportTicket(
            company_id=current_user.company_id,
            branch_id=current_user.branch_id,
            submitted_by=current_user.id,
            submitted_by_email=current_user.email,
            ticket_ref=ticket_ref,
            subject=body.subject,
            description=body.description,
            severity=body.severity,
            category=body.category,
            status="OPEN",
            diagnostics_bundle=body.diagnostics_bundle,
        )
        session.add(ticket)
        await session.flush()  # populate ticket.id

        event = TicketEvent(
            ticket_id=ticket.id,
            company_id=current_user.company_id,
            actor_id=current_user.id,
            actor_email=current_user.email,
            event_type="CREATED",
            new_status="OPEN",
        )
        session.add(event)

    # Reload outside transaction for clean read
    async with session.begin():
        ticket = await _get_ticket(session, ticket.id, current_user.company_id)
        events = await _load_events(session, ticket.id)

    logger.info(
        "Support ticket %s created by %s (company %s)",
        ticket.ticket_ref,
        current_user.email,
        current_user.company_id,
    )
    return _ticket_to_out(ticket, events)


# ---------------------------------------------------------------------------
# GET /v1/support/tickets  -- list tickets for company
# ---------------------------------------------------------------------------

@router.get("/tickets", response_model=List[TicketOut])
async def list_tickets(
    status: Optional[str] = Query(None, description="Filter by status: OPEN, IN_PROGRESS, RESOLVED, CLOSED"),
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> List[TicketOut]:
    async with session.begin():
        q = select(SupportTicket).where(
            SupportTicket.company_id == current_user.company_id
        )
        if status:
            q = q.where(SupportTicket.status == status.upper())
        q = q.order_by(SupportTicket.created_at.desc()).offset(offset).limit(limit)

        result = await session.execute(q)
        tickets = list(result.scalars().all())

        out = []
        for t in tickets:
            events = await _load_events(session, t.id)
            out.append(_ticket_to_out(t, events))

    return out


# ---------------------------------------------------------------------------
# GET /v1/support/tickets/{ticket_id}  -- get single ticket with events
# ---------------------------------------------------------------------------

@router.get("/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(
    ticket_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> TicketOut:
    async with session.begin():
        ticket = await _get_ticket(session, ticket_id, current_user.company_id)
        events = await _load_events(session, ticket.id)

    return _ticket_to_out(ticket, events)


# ---------------------------------------------------------------------------
# POST /v1/support/tickets/{ticket_id}/comments  -- add comment
# ---------------------------------------------------------------------------

@router.post("/tickets/{ticket_id}/comments", response_model=TicketOut)
async def add_comment(
    ticket_id: UUID,
    body: CommentCreate,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> TicketOut:
    if not body.comment or not body.comment.strip():
        raise HTTPException(status_code=422, detail="Comment must not be empty")

    async with session.begin():
        ticket = await _get_ticket(session, ticket_id, current_user.company_id)

        event = TicketEvent(
            ticket_id=ticket.id,
            company_id=current_user.company_id,
            actor_id=current_user.id,
            actor_email=current_user.email,
            event_type="COMMENT_ADDED",
            comment=body.comment.strip(),
        )
        session.add(event)

        # Touch updated_at
        ticket.updated_at = datetime.now(timezone.utc)

    async with session.begin():
        ticket = await _get_ticket(session, ticket_id, current_user.company_id)
        events = await _load_events(session, ticket.id)

    return _ticket_to_out(ticket, events)
