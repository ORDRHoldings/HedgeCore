"""Service-layer tests for statement_service — AsyncMock DB session."""
import uuid
import hashlib
from datetime import date, datetime, UTC
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_detect_format_mt940():
    """detect_format identifies MT940 content."""
    from app.services.statement_service import detect_format
    assert detect_format("{1:F01BANK...") == "MT940"
    assert detect_format(":20:STMT\n:25:ACC") == "MT940"


@pytest.mark.asyncio
async def test_detect_format_camt053():
    """detect_format identifies CAMT.053 XML."""
    from app.services.statement_service import detect_format
    assert detect_format('<?xml version="1.0"?><Document>') == "CAMT053"
    assert detect_format("<Document xmlns=") == "CAMT053"


@pytest.mark.asyncio
async def test_detect_format_bai2():
    """detect_format identifies BAI2 content."""
    from app.services.statement_service import detect_format
    assert detect_format("01,BANKID,COMPID,260401") == "BAI2"


@pytest.mark.asyncio
async def test_import_statement_creates_records():
    """import_statement creates BankStatement + BankTransaction rows."""
    from app.services.statement_service import import_statement

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    account_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    mt940_content = """\
{4:
:20:STMT
:25:BE68539007547034
:28C:1/1
:60F:C260401EUR100000,00
:61:2604010401C5000,00N051REF
:86:Test payment
:62F:C260401EUR105000,00
-}
"""
    # Mock: no existing statement with this hash
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.statement_service.append_event", new_callable=AsyncMock):
        result = await import_statement(
            mock_session, company_id=company_id, account_id=account_id,
            content=mt940_content, filename="test.mt940", created_by=actor_id,
        )

    assert result["duplicate"] is False
    assert result["transaction_count"] == 1
    assert mock_session.add.called
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_import_statement_rejects_duplicate():
    """import_statement returns duplicate=True for matching source_hash."""
    from app.services.statement_service import import_statement

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    account_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    content = "some content"

    # Mock: existing statement with this hash
    existing = MagicMock()
    existing.id = uuid.uuid4()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing
    mock_session.execute = AsyncMock(return_value=mock_result)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await import_statement(
            mock_session, company_id=company_id, account_id=account_id,
            content=content, filename="dup.mt940", created_by=actor_id,
        )
    assert exc_info.value.status_code == 409
