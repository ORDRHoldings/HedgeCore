# backend/tests/test_settlement_service.py
"""Unit tests for settlement service — AsyncMock, no DB."""
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_confirm_settlement_creates_draft_journal_entry():
    """
    Confirming a settlement MUST create a JournalEntry in DRAFT status.
    It must NOT auto-approve the entry.
    """
    from app.services.settlement_service import confirm_settlement

    ledger_entry_id = uuid.uuid4()
    company_id = uuid.uuid4()
    mock_session = AsyncMock()

    mock_ledger = MagicMock()
    mock_ledger.id = ledger_entry_id
    mock_ledger.company_id = company_id
    mock_ledger.frozen_artifact = {}

    call_count = [0]

    def _execute(query, *args, **kwargs):
        call_count[0] += 1
        r = MagicMock()
        if call_count[0] == 1:
            r.scalar_one_or_none.return_value = mock_ledger  # ledger lookup
        else:
            r.scalar_one_or_none.return_value = None  # settlement existence check
        return r

    mock_session.execute = AsyncMock(side_effect=_execute)
    mock_session.add = MagicMock()
    mock_session.flush = AsyncMock()

    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()
    mock_user.company = MagicMock()
    mock_user.company.id = company_id
    mock_user.company.settings = {}

    mock_mapping = MagicMock()
    mock_mapping.debit_account = "7100"
    mock_mapping.credit_account = "3200"

    with patch("app.services.gl_service._get_gl_mapping", AsyncMock(return_value=mock_mapping)):
        with patch("app.services.gl_service._extend_journal_chain", AsyncMock(return_value=(1, "0" * 64))):
            result = await confirm_settlement(
                mock_session,
                ledger_entry_id=ledger_entry_id,
                actual_rate=Decimal("1.15"),
                settlement_ref="CONF-12345",
                hedge_rate=Decimal("1.12"),
                hedge_notional=Decimal("100000"),
                user=mock_user,
            )

    # Verify a JournalEntry was added with DRAFT status
    added_objects = [call.args[0] for call in mock_session.add.call_args_list]
    journal_entries = [
        o for o in added_objects
        if hasattr(o, "status") and o.status == "DRAFT"
    ]
    assert len(journal_entries) >= 1, "Expected at least one DRAFT JournalEntry"


@pytest.mark.asyncio
async def test_confirm_settlement_raises_if_already_settled():
    """Confirming an already-settled ledger entry raises ValueError."""
    from app.services.settlement_service import confirm_settlement

    ledger_entry_id = uuid.uuid4()
    company_id = uuid.uuid4()
    mock_session = AsyncMock()

    mock_ledger = MagicMock()
    mock_ledger.id = ledger_entry_id
    mock_ledger.company_id = company_id
    mock_ledger.frozen_artifact = {"rate": "1.12", "notional": "100000",
                                    "currency": "EUR", "value_date": "2026-03-31",
                                    "standard": "IFRS_9"}

    existing_settlement = MagicMock()

    call_count = [0]
    def _execute(query, *args, **kwargs):
        call_count[0] += 1
        r = MagicMock()
        if call_count[0] == 1:
            r.scalar_one_or_none.return_value = mock_ledger
        else:
            r.scalar_one_or_none.return_value = existing_settlement
        return r

    mock_session.execute = AsyncMock(side_effect=_execute)
    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()
    mock_user.company = MagicMock()
    mock_user.company.id = company_id

    with pytest.raises(ValueError, match="already settled"):
        await confirm_settlement(
            mock_session,
            ledger_entry_id=ledger_entry_id,
            actual_rate=Decimal("1.15"),
            settlement_ref="CONF-99",
            hedge_rate=Decimal("1.12"),
            hedge_notional=Decimal("100000"),
            user=mock_user,
        )
