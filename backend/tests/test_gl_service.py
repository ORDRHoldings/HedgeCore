# backend/tests/test_gl_service.py
"""Unit tests for gl_service using AsyncMock — no DB required."""
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.journal_entry import (
    GENESIS_HASH,
    GLMappingNotConfiguredError,
    JournalEntryStatus,
)


@pytest.mark.asyncio
async def test_generate_raises_if_no_mapping():
    """generate_journal_entries raises GLMappingNotConfiguredError when no mapping configured."""
    from app.services.gl_service import generate_journal_entries

    mock_session = AsyncMock()
    # Simulate no mapping found
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_run = MagicMock()
    mock_run.id = uuid.uuid4()
    mock_run.company_id = uuid.uuid4()
    mock_run.standard = "IFRS_9"
    mock_run.report_json = {"oci_amount": "100000"}

    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()

    with pytest.raises(GLMappingNotConfiguredError):
        await generate_journal_entries(mock_session, mock_run, mock_user)


@pytest.mark.asyncio
async def test_submit_for_approval_changes_status():
    """submit_for_approval transitions DRAFT → PENDING_APPROVAL."""
    from app.services.gl_service import submit_for_approval

    mock_session = AsyncMock()
    mock_je = MagicMock()
    mock_je.status = JournalEntryStatus.DRAFT.value
    mock_je.created_by = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_je
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()

    result = await submit_for_approval(mock_session, uuid.uuid4(), mock_user)
    assert result.status == JournalEntryStatus.PENDING_APPROVAL.value


@pytest.mark.asyncio
async def test_approve_enforces_sod():
    """approve raises ValueError when checker == creator."""
    from app.services.gl_service import approve_journal_entry

    creator_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_je = MagicMock()
    mock_je.status = JournalEntryStatus.PENDING_APPROVAL.value
    mock_je.created_by = creator_id

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_je
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_user = MagicMock()
    mock_user.id = creator_id  # same as creator → SoD violation

    with pytest.raises(ValueError, match="SoD"):
        await approve_journal_entry(mock_session, uuid.uuid4(), mock_user)


@pytest.mark.asyncio
async def test_reject_requires_reason():
    """reject raises ValueError when reason is empty."""
    from app.services.gl_service import reject_journal_entry

    mock_session = AsyncMock()
    mock_je = MagicMock()
    mock_je.status = JournalEntryStatus.PENDING_APPROVAL.value
    mock_je.created_by = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_je
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()  # different from creator

    with pytest.raises(ValueError, match="reason"):
        await reject_journal_entry(mock_session, uuid.uuid4(), mock_user, reason="")
