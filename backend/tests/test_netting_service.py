# backend/tests/test_netting_service.py
"""Service-layer tests for netting_service — AsyncMock DB session."""
import uuid
from datetime import date, datetime, UTC
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


def _mock_obligation(obl_id=None, debtor=None, creditor=None, amount=100_000,
                     currency="EUR", status="PENDING", company_id=None):
    obl = MagicMock()
    obl.id = obl_id or uuid.uuid4()
    obl.company_id = company_id or uuid.uuid4()
    obl.debtor_entity_id = debtor or uuid.uuid4()
    obl.creditor_entity_id = creditor or uuid.uuid4()
    obl.amount = Decimal(str(amount))
    obl.currency = currency
    obl.due_date = date(2026, 5, 1)
    obl.reference = "INV-001"
    obl.status = status
    obl.created_by = uuid.uuid4()
    obl.created_at = datetime.now(UTC)
    obl.updated_at = datetime.now(UTC)
    return obl


@pytest.mark.asyncio
async def test_create_obligation():
    """create_obligation creates a new IntercompanyObligation and flushes."""
    from app.services.netting_service import create_obligation

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    payload = {
        "debtor_entity_id": uuid.uuid4(),
        "creditor_entity_id": uuid.uuid4(),
        "amount": Decimal("100000"),
        "currency": "EUR",
        "due_date": date(2026, 5, 1),
        "reference": "INV-001",
    }

    with patch("app.services.netting_service.append_event", new_callable=AsyncMock):
        result = await create_obligation(mock_session, company_id=company_id,
                                         payload=payload, created_by=actor_id)

    mock_session.add.assert_called_once()
    mock_session.flush.assert_awaited_once()
    assert result.company_id == company_id
    assert result.status == "PENDING"


@pytest.mark.asyncio
async def test_generate_proposals():
    """generate_proposals gathers PENDING obligations and creates NettingProposal records."""
    from app.services.netting_service import generate_proposals

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    a, b = uuid.uuid4(), uuid.uuid4()

    obl1 = _mock_obligation(debtor=a, creditor=b, amount=100_000, company_id=company_id)
    obl2 = _mock_obligation(debtor=b, creditor=a, amount=60_000, company_id=company_id)

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [obl1, obl2]
    mock_session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.netting_service.append_event", new_callable=AsyncMock):
        proposals = await generate_proposals(mock_session, company_id=company_id,
                                             created_by=actor_id)

    assert len(proposals) == 1
    assert mock_session.add.called
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_approve_proposal_sod_enforced():
    """approve_proposal rejects if approved_by == proposed_by (SoD violation)."""
    from app.services.netting_service import approve_proposal

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    proposal = MagicMock()
    proposal.id = uuid.uuid4()
    proposal.company_id = company_id
    proposal.status = "PENDING_APPROVAL"
    proposal.proposed_by = actor_id

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = proposal
    mock_session.execute = AsyncMock(return_value=mock_result)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await approve_proposal(mock_session, proposal_id=proposal.id,
                               company_id=company_id, approved_by=actor_id)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_approve_proposal_success():
    """approve_proposal succeeds when checker differs from maker."""
    from app.services.netting_service import approve_proposal

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    maker = uuid.uuid4()
    checker = uuid.uuid4()

    proposal = MagicMock()
    proposal.id = uuid.uuid4()
    proposal.company_id = company_id
    proposal.status = "PENDING_APPROVAL"
    proposal.proposed_by = maker

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = proposal
    mock_session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.netting_service.append_event", new_callable=AsyncMock):
        result = await approve_proposal(mock_session, proposal_id=proposal.id,
                                        company_id=company_id, approved_by=checker)

    assert result.status == "APPROVED"
    assert result.approved_by == checker
