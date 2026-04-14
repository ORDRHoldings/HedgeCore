# backend/tests/test_cash_audit_service.py
"""Unit tests for cash_audit_service — chain extension and verification."""
import hashlib
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.cash import GENESIS_HASH, CashAuditEventType


@pytest.mark.asyncio
async def test_append_event_uses_genesis_on_first_event():
    """First event in a company chain uses GENESIS_HASH as prev_event_hash."""
    from app.services.cash_audit_service import append_event

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.first.return_value = None  # no prior events
    mock_session.execute = AsyncMock(return_value=mock_result)

    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    event = await append_event(
        mock_session,
        company_id=company_id,
        event_type=CashAuditEventType.ENTITY_CREATED,
        payload={"name": "Acme Ltd"},
        performed_by=actor_id,
    )

    assert event.prev_event_hash == GENESIS_HASH
    assert event.chain_seq == 1
    mock_session.add.assert_called_once()


@pytest.mark.asyncio
async def test_append_event_increments_chain_seq():
    """Subsequent event has chain_seq = prev_chain_seq + 1."""
    from app.services.cash_audit_service import append_event

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.first.return_value = (42, "abc" * 21 + "ab")  # (chain_seq, event_hash)
    mock_session.execute = AsyncMock(return_value=mock_result)

    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    event = await append_event(
        mock_session,
        company_id=company_id,
        event_type=CashAuditEventType.ACCOUNT_CREATED,
        payload={},
        performed_by=actor_id,
    )

    assert event.chain_seq == 43


@pytest.mark.asyncio
async def test_append_event_hash_is_sha256():
    """event_hash is a 64-char hex string (SHA-256 output)."""
    from app.services.cash_audit_service import append_event

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.first.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    event = await append_event(
        mock_session,
        company_id=uuid.uuid4(),
        event_type=CashAuditEventType.BALANCE_ENTERED,
        payload={},
        performed_by=uuid.uuid4(),
    )

    assert len(event.event_hash) == 64
    int(event.event_hash, 16)  # valid hex


@pytest.mark.asyncio
async def test_verify_chain_detects_tampered_hash():
    """verify_chain returns ok=False when stored event_hash doesn't match recomputed hash."""
    from datetime import UTC, datetime
    from app.services.cash_audit_service import verify_chain

    company_id = uuid.uuid4()

    # Build an event with a fake/tampered event_hash
    event = MagicMock()
    event.chain_seq = 1
    event.prev_event_hash = GENESIS_HASH
    event.event_hash = "deadbeef" * 8  # 64 chars but will NOT match recomputed hash
    event.event_type = "ENTITY_CREATED"
    event.payload = {"name": "Acme"}
    event.performed_by = uuid.uuid4()
    event.created_at = datetime.now(UTC)

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [event]
    mock_session.execute = AsyncMock(return_value=mock_result)

    result = await verify_chain(mock_session, company_id=company_id)

    assert result["ok"] is False
    assert result["broken_at_seq"] == 1
