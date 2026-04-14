# backend/tests/test_erp_adapters.py
"""Unit tests for ERP pull adapters — no real HTTP calls."""
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch
import pytest

from app.services.erp_adapters.base import ERPInvoice


def test_erp_invoice_deduplication_hash_is_deterministic():
    inv1 = ERPInvoice(
        source_system="XERO",
        source_ref="INV-001",
        amount=Decimal("50000"),
        currency="EUR",
        due_date=date(2026, 6, 30),
        counterparty="ACME Corp",
    )
    inv2 = ERPInvoice(
        source_system="XERO",
        source_ref="INV-001",
        amount=Decimal("50000"),
        currency="EUR",
        due_date=date(2026, 6, 30),
        counterparty="ACME Corp",
    )
    assert inv1.dedup_hash == inv2.dedup_hash


def test_erp_invoice_dedup_hash_changes_on_amount():
    inv1 = ERPInvoice(
        source_system="XERO", source_ref="INV-001",
        amount=Decimal("50000"), currency="EUR",
        due_date=date(2026, 6, 30), counterparty="ACME",
    )
    inv2 = ERPInvoice(
        source_system="XERO", source_ref="INV-001",
        amount=Decimal("60000"), currency="EUR",
        due_date=date(2026, 6, 30), counterparty="ACME",
    )
    assert inv1.dedup_hash != inv2.dedup_hash


@pytest.mark.asyncio
async def test_is_duplicate_returns_true_when_position_exists():
    """_is_duplicate returns True when a matching active position exists."""
    import uuid
    from unittest.mock import AsyncMock
    from app.services.erp_connector_service import _is_duplicate

    inv = ERPInvoice(
        source_system="XERO", source_ref="INV-001",
        amount=Decimal("50000"), currency="EUR",
        due_date=date(2026, 6, 30), counterparty="ACME",
    )
    expected_prefix = f"ERP-{inv.dedup_hash[:16]}"

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = MagicMock()  # existing position
    mock_session.execute = AsyncMock(return_value=mock_result)

    result = await _is_duplicate(mock_session, inv.dedup_hash, uuid.uuid4())
    assert result is True


@pytest.mark.asyncio
async def test_process_invoices_skips_duplicate_and_increments_count():
    """process_invoices skips an invoice when _is_duplicate returns True."""
    import uuid
    from unittest.mock import AsyncMock, patch
    from app.services.erp_connector_service import process_invoices

    inv = ERPInvoice(
        source_system="XERO", source_ref="INV-001",
        amount=Decimal("50000"), currency="EUR",
        due_date=date(2026, 6, 30), counterparty="ACME",
    )

    mock_session = AsyncMock()
    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()

    with patch(
        "app.services.erp_connector_service._is_duplicate",
        AsyncMock(return_value=True),
    ):
        created, skipped = await process_invoices(
            mock_session, [inv], uuid.uuid4(), mock_user
        )

    assert skipped == 1
    assert created == []
    mock_session.add.assert_not_called()
