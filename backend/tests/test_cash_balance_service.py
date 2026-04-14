# backend/tests/test_cash_balance_service.py
"""Unit tests for cash_balance_service."""
import uuid
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.models.cash import BankAccountStatus, ReconciliationStatus


@pytest.mark.asyncio
async def test_enter_balance_rejects_non_active_account():
    """Only ACTIVE accounts may receive balance entries."""
    from app.services.cash_balance_service import enter_balance, AccountNotActiveError

    mock_session = AsyncMock()
    account = MagicMock()
    account.status = BankAccountStatus.FROZEN.value
    account.currency = "EUR"
    account.id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = account
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(AccountNotActiveError):
        await enter_balance(
            mock_session,
            account_id=account.id,
            company_id=uuid.uuid4(),
            payload={"balance_date": "2026-04-14", "ledger_balance": "1000000.00",
                     "available_balance": "950000.00", "currency": "EUR"},
            created_by=uuid.uuid4(),
        )


@pytest.mark.asyncio
async def test_enter_balance_adds_balance_and_emits_audit():
    """Happy path: creates CashBalance row and audit event."""
    from app.services.cash_balance_service import enter_balance

    mock_session = AsyncMock()
    account = MagicMock()
    account.status = BankAccountStatus.ACTIVE.value
    account.currency = "EUR"
    account.id = uuid.uuid4()
    account.entity_id = uuid.uuid4()

    # First execute: account lookup; second execute: existing balance check (None)
    mock_account_result = MagicMock()
    mock_account_result.scalar_one_or_none.return_value = account
    mock_balance_result = MagicMock()
    mock_balance_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(side_effect=[mock_account_result, mock_balance_result])

    with patch("app.services.cash_balance_service.append_event", new_callable=AsyncMock) as mock_audit:
        balance = await enter_balance(
            mock_session,
            account_id=account.id,
            company_id=uuid.uuid4(),
            payload={"balance_date": "2026-04-14", "ledger_balance": "1000000.00",
                     "available_balance": "950000.00", "currency": "EUR"},
            created_by=uuid.uuid4(),
        )

    mock_session.add.assert_called_once()
    mock_audit.assert_called_once()


@pytest.mark.asyncio
async def test_enter_balance_duplicate_date_raises_409():
    """Duplicate (account, date) raises DuplicateBalanceDateError."""
    from app.services.cash_balance_service import enter_balance, DuplicateBalanceDateError

    mock_session = AsyncMock()
    account = MagicMock()
    account.status = BankAccountStatus.ACTIVE.value
    account.currency = "EUR"
    account.id = uuid.uuid4()

    existing_balance = MagicMock()
    mock_account_result = MagicMock()
    mock_account_result.scalar_one_or_none.return_value = account
    mock_balance_result = MagicMock()
    mock_balance_result.scalar_one_or_none.return_value = existing_balance  # already exists

    mock_session.execute = AsyncMock(side_effect=[mock_account_result, mock_balance_result])

    with pytest.raises(DuplicateBalanceDateError):
        await enter_balance(
            mock_session,
            account_id=account.id,
            company_id=uuid.uuid4(),
            payload={"balance_date": "2026-04-14", "ledger_balance": "1000000.00",
                     "available_balance": "950000.00", "currency": "EUR"},
            created_by=uuid.uuid4(),
        )
