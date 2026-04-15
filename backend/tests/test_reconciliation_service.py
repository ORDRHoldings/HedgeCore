"""Service-layer tests for reconciliation_service — AsyncMock DB session."""
import uuid
from datetime import date, datetime, UTC, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


def _mock_bank_tx(amount=Decimal("50000"), currency="EUR", tx_date=date(2026, 4, 1)):
    tx = MagicMock()
    tx.id = uuid.uuid4()
    tx.amount = amount
    tx.currency = currency
    tx.tx_date = tx_date
    tx.value_date = None
    tx.direction = "CREDIT"
    tx.reference = ""
    tx.reconciliation_status = "UNMATCHED"
    tx.matched_settlement_id = None
    tx.matched_journal_id = None
    tx.company_id = uuid.uuid4()
    return tx


@pytest.mark.asyncio
async def test_run_reconciliation_applies_matches():
    """run_reconciliation calls engine and updates matched transactions."""
    from app.services.reconciliation_service import run_reconciliation

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    tx = _mock_bank_tx()
    se_id = uuid.uuid4()

    # Mock: unmatched transactions query
    tx_result = MagicMock()
    tx_result.scalars.return_value.all.return_value = [tx]

    # Mock: settlement+journal candidates query (returns a row with settlement + journal currency)
    se_row = MagicMock()
    se_row.id = se_id
    se_row.settlement_amount = Decimal("50000")
    se_row.settlement_date = date(2026, 4, 1)
    se_row.value_date = None
    se_row.settlement_ref = "REF001"
    se_row.currency = "EUR"  # resolved from journal

    se_result = MagicMock()
    se_result.all.return_value = [se_row]

    je_result = MagicMock()
    je_result.scalars.return_value.all.return_value = []

    mock_session.execute = AsyncMock(side_effect=[tx_result, se_result, je_result])

    with patch("app.services.reconciliation_service.append_event", new_callable=AsyncMock):
        result = await run_reconciliation(
            mock_session, company_id=company_id, performed_by=actor_id,
        )

    assert result["matched_count"] == 1
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_manual_match_sets_fk():
    """manual_match updates the transaction with the matched FK."""
    from app.services.reconciliation_service import manual_match

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    tx_id = uuid.uuid4()
    se_id = uuid.uuid4()

    tx = _mock_bank_tx()
    tx.id = tx_id

    tx_result = MagicMock()
    tx_result.scalar_one_or_none.return_value = tx
    mock_session.execute = AsyncMock(return_value=tx_result)

    await manual_match(
        mock_session, transaction_id=tx_id, company_id=company_id,
        match_type="SETTLEMENT", matched_id=se_id, performed_by=actor_id,
    )

    assert tx.matched_settlement_id == se_id
    assert tx.reconciliation_status == "MATCHED"
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_mark_exception():
    """mark_exception sets status to EXCEPTION."""
    from app.services.reconciliation_service import mark_exception

    mock_session = AsyncMock()
    tx = _mock_bank_tx()

    tx_result = MagicMock()
    tx_result.scalar_one_or_none.return_value = tx
    mock_session.execute = AsyncMock(return_value=tx_result)

    await mark_exception(
        mock_session, transaction_id=tx.id,
        company_id=tx.company_id, performed_by=uuid.uuid4(),
    )

    assert tx.reconciliation_status == "EXCEPTION"
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_unmatch_clears_fk():
    """unmatch resets status and clears FK columns."""
    from app.services.reconciliation_service import unmatch

    mock_session = AsyncMock()
    tx = _mock_bank_tx()
    tx.reconciliation_status = "MATCHED"
    tx.matched_settlement_id = uuid.uuid4()

    tx_result = MagicMock()
    tx_result.scalar_one_or_none.return_value = tx
    mock_session.execute = AsyncMock(return_value=tx_result)

    await unmatch(
        mock_session, transaction_id=tx.id,
        company_id=tx.company_id, performed_by=uuid.uuid4(),
    )

    assert tx.reconciliation_status == "UNMATCHED"
    assert tx.matched_settlement_id is None
    assert tx.matched_journal_id is None
    mock_session.flush.assert_awaited()
