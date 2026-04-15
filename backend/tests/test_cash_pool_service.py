"""Service-layer tests for cash_pool_service — AsyncMock DB session."""
import uuid
from datetime import date, datetime, UTC
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


def _mock_pool(pool_type="NOTIONAL", pool_id=None, company_id=None):
    pool = MagicMock()
    pool.id = pool_id or uuid.uuid4()
    pool.company_id = company_id or uuid.uuid4()
    pool.name = "Test Pool"
    pool.pool_type = pool_type
    pool.header_account_id = uuid.uuid4()
    pool.currency = "EUR"
    pool.base_currency = "EUR"
    pool.is_active = True
    pool.created_by = uuid.uuid4()
    return pool


def _mock_member(pool_id, account_id=None, entity_id=None, target_balance=None):
    m = MagicMock()
    m.id = uuid.uuid4()
    m.pool_id = pool_id
    m.account_id = account_id or uuid.uuid4()
    m.entity_id = entity_id or uuid.uuid4()
    m.participation_type = "FULL"
    m.target_balance = target_balance
    return m


@pytest.mark.asyncio
async def test_create_pool():
    """create_pool persists a CashPool and flushes."""
    from app.services.cash_pool_service import create_pool

    mock_session = AsyncMock()
    company_id = uuid.uuid4()

    data = MagicMock()
    data.name = "EUR Pool"
    data.pool_type = "NOTIONAL"
    data.header_account_id = uuid.uuid4()
    data.currency = "EUR"
    data.base_currency = "EUR"

    # Mock: header account lookup
    acct = MagicMock()
    acct_result = MagicMock()
    acct_result.scalar_one_or_none.return_value = acct
    mock_session.execute = AsyncMock(return_value=acct_result)

    pool = await create_pool(mock_session, company_id=company_id, data=data, created_by=uuid.uuid4())
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_add_member():
    """add_member creates a CashPoolMember."""
    from app.services.cash_pool_service import add_member

    mock_session = AsyncMock()
    pool = _mock_pool("PHYSICAL")
    company_id = pool.company_id

    data = MagicMock()
    data.account_id = uuid.uuid4()
    data.entity_id = uuid.uuid4()
    data.participation_type = "FULL"
    data.target_balance = Decimal("10000")

    # Mock: pool lookup, then account lookup
    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    acct_result = MagicMock()
    acct_result.scalar_one_or_none.return_value = MagicMock()
    mock_session.execute = AsyncMock(side_effect=[pool_result, acct_result])

    member = await add_member(mock_session, pool_id=pool.id, company_id=company_id, data=data)
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_remove_member():
    """remove_member deletes a CashPoolMember."""
    from app.services.cash_pool_service import remove_member

    mock_session = AsyncMock()
    pool = _mock_pool()
    member = _mock_member(pool.id)

    # Mock: pool lookup, then member lookup
    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    member_result = MagicMock()
    member_result.scalar_one_or_none.return_value = member
    mock_session.execute = AsyncMock(side_effect=[pool_result, member_result])

    await remove_member(mock_session, pool_id=pool.id, member_id=member.id, company_id=pool.company_id)
    mock_session.delete.assert_called_once_with(member)
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_get_pool_balance_notional():
    """NOTIONAL pool balance = SUM of member ledger_balances."""
    from app.services.cash_pool_service import get_pool_balance

    mock_session = AsyncMock()
    pool = _mock_pool("NOTIONAL")
    m1 = _mock_member(pool.id)
    m2 = _mock_member(pool.id)

    # Mock: pool lookup
    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    # Mock: members lookup
    members_result = MagicMock()
    members_result.scalars.return_value.all.return_value = [m1, m2]
    # Mock: balance lookup — returns rows with account_id + ledger_balance
    bal_row_1 = MagicMock()
    bal_row_1.account_id = m1.account_id
    bal_row_1.ledger_balance = Decimal("50000")
    bal_row_2 = MagicMock()
    bal_row_2.account_id = m2.account_id
    bal_row_2.ledger_balance = Decimal("30000")
    bal_result = MagicMock()
    bal_result.all.return_value = [bal_row_1, bal_row_2]

    mock_session.execute = AsyncMock(side_effect=[pool_result, members_result, bal_result])

    result = await get_pool_balance(mock_session, pool_id=pool.id, company_id=pool.company_id)
    assert result["consolidated_balance"] == Decimal("80000")
    assert result["header_balance"] is None
    assert len(result["member_balances"]) == 2


@pytest.mark.asyncio
async def test_get_pool_balance_physical():
    """PHYSICAL pool balance = header + SUM(member excess over target)."""
    from app.services.cash_pool_service import get_pool_balance

    mock_session = AsyncMock()
    pool = _mock_pool("PHYSICAL")
    m1 = _mock_member(pool.id, target_balance=Decimal("10000"))

    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    members_result = MagicMock()
    members_result.scalars.return_value.all.return_value = [m1]
    # Balance rows: header + member
    hdr_row = MagicMock()
    hdr_row.account_id = pool.header_account_id
    hdr_row.ledger_balance = Decimal("200000")
    m1_row = MagicMock()
    m1_row.account_id = m1.account_id
    m1_row.ledger_balance = Decimal("15000")
    bal_result = MagicMock()
    bal_result.all.return_value = [hdr_row, m1_row]

    mock_session.execute = AsyncMock(side_effect=[pool_result, members_result, bal_result])

    result = await get_pool_balance(mock_session, pool_id=pool.id, company_id=pool.company_id)
    # Consolidated = header(200000) + excess(15000 - 10000 = 5000) = 205000
    assert result["consolidated_balance"] == Decimal("205000")
    assert result["header_balance"] == Decimal("200000")


@pytest.mark.asyncio
async def test_get_pool_balance_zba():
    """ZBA pool balance = header balance. Non-zero members flagged as exceptions."""
    from app.services.cash_pool_service import get_pool_balance

    mock_session = AsyncMock()
    pool = _mock_pool("ZBA")
    m1 = _mock_member(pool.id, target_balance=Decimal("0"))

    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    members_result = MagicMock()
    members_result.scalars.return_value.all.return_value = [m1]
    hdr_row = MagicMock()
    hdr_row.account_id = pool.header_account_id
    hdr_row.ledger_balance = Decimal("100000")
    m1_row = MagicMock()
    m1_row.account_id = m1.account_id
    m1_row.ledger_balance = Decimal("500")  # exception: should be 0
    bal_result = MagicMock()
    bal_result.all.return_value = [hdr_row, m1_row]

    mock_session.execute = AsyncMock(side_effect=[pool_result, members_result, bal_result])

    result = await get_pool_balance(mock_session, pool_id=pool.id, company_id=pool.company_id)
    assert result["consolidated_balance"] == Decimal("100000")
    assert result["member_balances"][0]["is_exception"] is True


@pytest.mark.asyncio
async def test_calculate_sweeps_physical():
    """PHYSICAL sweep: member excess over target → CONCENTRATION."""
    from app.services.cash_pool_service import calculate_sweeps

    mock_session = AsyncMock()
    pool = _mock_pool("PHYSICAL")
    m1 = _mock_member(pool.id, target_balance=Decimal("10000"))

    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    members_result = MagicMock()
    members_result.scalars.return_value.all.return_value = [m1]
    m1_row = MagicMock()
    m1_row.account_id = m1.account_id
    m1_row.ledger_balance = Decimal("25000")
    bal_result = MagicMock()
    bal_result.all.return_value = [m1_row]

    mock_session.execute = AsyncMock(side_effect=[pool_result, members_result, bal_result])

    sweeps = await calculate_sweeps(mock_session, pool_id=pool.id, company_id=pool.company_id)
    assert len(sweeps) == 1
    assert sweeps[0]["amount"] == Decimal("15000")
    assert sweeps[0]["direction"] == "CONCENTRATION"


@pytest.mark.asyncio
async def test_calculate_sweeps_notional_raises():
    """NOTIONAL pool cannot have sweeps."""
    from app.services.cash_pool_service import calculate_sweeps
    from fastapi import HTTPException

    mock_session = AsyncMock()
    pool = _mock_pool("NOTIONAL")

    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    mock_session.execute = AsyncMock(return_value=pool_result)

    with pytest.raises(HTTPException) as exc_info:
        await calculate_sweeps(mock_session, pool_id=pool.id, company_id=pool.company_id)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_execute_sweeps_persists_and_audits():
    """execute_sweeps persists CashPoolSweep records and audit-logs."""
    from app.services.cash_pool_service import execute_sweeps

    mock_session = AsyncMock()
    pool = _mock_pool("PHYSICAL")
    m1 = _mock_member(pool.id, target_balance=Decimal("0"))

    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    members_result = MagicMock()
    members_result.scalars.return_value.all.return_value = [m1]
    m1_row = MagicMock()
    m1_row.account_id = m1.account_id
    m1_row.ledger_balance = Decimal("5000")
    bal_result = MagicMock()
    bal_result.all.return_value = [m1_row]

    mock_session.execute = AsyncMock(side_effect=[pool_result, members_result, bal_result])

    with patch("app.services.cash_pool_service.append_event", new_callable=AsyncMock):
        result = await execute_sweeps(
            mock_session, pool_id=pool.id, company_id=pool.company_id,
            performed_by=uuid.uuid4(),
        )

    assert result["sweep_count"] == 1
    mock_session.flush.assert_awaited()
