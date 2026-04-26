# backend/app/services/netting_service.py
"""
Netting service — orchestrates intercompany obligation management and netting.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import CashAuditEventType
from app.models.cash_forecast import CashForecastItem
from app.models.cash_netting import IntercompanyObligation, NettingProposal
from app.services.cash_audit_service import append_event
from app.services.netting_engine import compute_netting


async def create_obligation(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    payload: dict[str, Any],
    created_by: uuid.UUID,
) -> IntercompanyObligation:
    """Create a manual intercompany obligation."""
    obl = IntercompanyObligation(
        company_id=company_id,
        debtor_entity_id=payload["debtor_entity_id"],
        creditor_entity_id=payload["creditor_entity_id"],
        amount=payload["amount"],
        currency=payload["currency"],
        due_date=payload["due_date"],
        reference=payload.get("reference"),
        status="PENDING",
        created_by=created_by,
    )
    session.add(obl)
    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.NETTING_PROPOSED,
        payload={"action": "obligation_created", "obligation_id": str(obl.id),
                 "amount": str(obl.amount), "currency": obl.currency},
        performed_by=created_by,
    )
    return obl


async def list_obligations(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    status_filter: str | None = None,
) -> list[IntercompanyObligation]:
    """List obligations scoped to tenant, optionally filtered by status."""
    stmt = select(IntercompanyObligation).where(
        IntercompanyObligation.company_id == company_id,
    )
    if status_filter:
        stmt = stmt.where(IntercompanyObligation.status == status_filter)
    stmt = stmt.order_by(IntercompanyObligation.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def cancel_obligation(
    session: AsyncSession,
    *,
    obligation_id: uuid.UUID,
    company_id: uuid.UUID,
) -> IntercompanyObligation:
    """Cancel a PENDING obligation."""
    result = await session.execute(
        select(IntercompanyObligation).where(
            IntercompanyObligation.id == obligation_id,
            IntercompanyObligation.company_id == company_id,
        )
    )
    obl = result.scalar_one_or_none()
    if obl is None:
        raise HTTPException(status_code=404, detail="Obligation not found")
    if obl.status != "PENDING":
        raise HTTPException(status_code=422, detail=f"Cannot cancel obligation in {obl.status} state")
    obl.status = "CANCELLED"
    await session.flush()
    return obl


async def auto_detect_obligations(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    created_by: uuid.UUID,
) -> list[IntercompanyObligation]:
    """Scan CashForecastItems with counterparty_entity_id set and create obligations."""
    stmt = select(CashForecastItem).where(
        CashForecastItem.company_id == company_id,
        CashForecastItem.is_active.is_(True),
        CashForecastItem.counterparty_entity_id.is_not(None),
        CashForecastItem.entity_id.is_not(None),
    )
    result = await session.execute(stmt)
    items = list(result.scalars().all())

    created: list[IntercompanyObligation] = []
    for item in items:
        if item.direction == "OUTFLOW":
            debtor, creditor = item.entity_id, item.counterparty_entity_id
        else:
            debtor, creditor = item.counterparty_entity_id, item.entity_id

        obl = IntercompanyObligation(
            company_id=company_id,
            debtor_entity_id=debtor,
            creditor_entity_id=creditor,
            amount=item.amount,
            currency=item.currency,
            due_date=item.start_date,
            reference=f"AUTO:{item.label}",
            status="PENDING",
            created_by=created_by,
        )
        session.add(obl)
        created.append(obl)

    if created:
        await session.flush()
    return created


async def generate_proposals(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    created_by: uuid.UUID,
) -> list[NettingProposal]:
    """Gather PENDING obligations, run netting engine, create NettingProposal records."""
    result = await session.execute(
        select(IntercompanyObligation).where(
            IntercompanyObligation.company_id == company_id,
            IntercompanyObligation.status == "PENDING",
        )
    )
    obligations = list(result.scalars().all())

    if not obligations:
        return []

    obl_dicts = [
        {
            "id": obl.id,
            "debtor_entity_id": obl.debtor_entity_id,
            "creditor_entity_id": obl.creditor_entity_id,
            "amount": obl.amount,
            "currency": obl.currency,
        }
        for obl in obligations
    ]

    raw_proposals = compute_netting(obl_dicts)
    created: list[NettingProposal] = []

    for rp in raw_proposals:
        proposal = NettingProposal(
            company_id=company_id,
            status="PENDING_APPROVAL",
            entity_a_id=rp["entity_a_id"],
            entity_b_id=rp["entity_b_id"],
            currency=rp["currency"],
            gross_payable=rp["gross_payable"],
            gross_receivable=rp["gross_receivable"],
            net_amount=rp["net_amount"],
            net_direction=rp["net_direction"],
            savings=rp["savings"],
            obligation_ids=[str(oid) for oid in rp["obligation_ids"]],
            proposed_by=created_by,
        )
        session.add(proposal)
        created.append(proposal)

    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.NETTING_PROPOSED,
        payload={"proposals_count": len(created),
                 "total_savings": str(sum(Decimal(str(p.savings)) for p in created))},
        performed_by=created_by,
    )
    return created


async def approve_proposal(
    session: AsyncSession,
    *,
    proposal_id: uuid.UUID,
    company_id: uuid.UUID,
    approved_by: uuid.UUID,
) -> NettingProposal:
    """4-eyes approval — SoD: approved_by must differ from proposed_by."""
    result = await session.execute(
        select(NettingProposal).where(
            NettingProposal.id == proposal_id,
            NettingProposal.company_id == company_id,
        )
    )
    proposal = result.scalar_one_or_none()
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status != "PENDING_APPROVAL":
        raise HTTPException(status_code=422, detail=f"Cannot approve proposal in {proposal.status} state")
    if proposal.proposed_by == approved_by:
        raise HTTPException(status_code=403, detail="Cannot approve your own proposal (Separation of Duties)")

    proposal.status = "APPROVED"
    proposal.approved_by = approved_by
    proposal.approved_at = datetime.now(UTC)
    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.NETTING_APPROVED,
        payload={"proposal_id": str(proposal.id), "approved_by": str(approved_by)},
        performed_by=approved_by,
    )
    return proposal


async def reject_proposal(
    session: AsyncSession,
    *,
    proposal_id: uuid.UUID,
    company_id: uuid.UUID,
    rejected_by: uuid.UUID,
) -> NettingProposal:
    """Reject a pending proposal."""
    result = await session.execute(
        select(NettingProposal).where(
            NettingProposal.id == proposal_id,
            NettingProposal.company_id == company_id,
        )
    )
    proposal = result.scalar_one_or_none()
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status != "PENDING_APPROVAL":
        raise HTTPException(status_code=422, detail=f"Cannot reject proposal in {proposal.status} state")

    proposal.status = "REJECTED"
    await session.flush()
    return proposal


async def execute_proposal(
    session: AsyncSession,
    *,
    proposal_id: uuid.UUID,
    company_id: uuid.UUID,
    executed_by: uuid.UUID,
) -> NettingProposal:
    """Execute an APPROVED proposal — mark obligations as NETTED."""
    result = await session.execute(
        select(NettingProposal).where(
            NettingProposal.id == proposal_id,
            NettingProposal.company_id == company_id,
        )
    )
    proposal = result.scalar_one_or_none()
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status != "APPROVED":
        raise HTTPException(status_code=422, detail=f"Cannot execute proposal in {proposal.status} state")

    # Mark included obligations as NETTED
    obl_ids = [uuid.UUID(oid) for oid in proposal.obligation_ids]
    for oid in obl_ids:
        obl_result = await session.execute(
            select(IntercompanyObligation).where(IntercompanyObligation.id == oid)
        )
        obl = obl_result.scalar_one_or_none()
        if obl:
            obl.status = "NETTED"

    proposal.status = "EXECUTED"
    proposal.executed_at = datetime.now(UTC)
    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.NETTING_EXECUTED,
        payload={"proposal_id": str(proposal.id),
                 "net_amount": str(proposal.net_amount),
                 "savings": str(proposal.savings),
                 "currency": proposal.currency},
        performed_by=executed_by,
    )
    return proposal


async def get_savings_summary(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
) -> dict[str, Any]:
    """Aggregate historical savings from executed proposals."""
    result = await session.execute(
        select(NettingProposal).where(
            NettingProposal.company_id == company_id,
            NettingProposal.status == "EXECUTED",
        )
    )
    proposals = list(result.scalars().all())

    total = Decimal("0")
    by_currency: dict[str, Decimal] = {}
    for p in proposals:
        s = Decimal(str(p.savings))
        total += s
        by_currency[p.currency] = by_currency.get(p.currency, Decimal("0")) + s

    return {
        "total_savings": total,
        "netting_count": len(proposals),
        "savings_by_currency": by_currency,
    }
