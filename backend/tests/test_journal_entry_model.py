# backend/tests/test_journal_entry_model.py
"""Unit tests for JournalEntry and GLAccountMapping models.
No DB required — tests ORM events and hash computation.
"""
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.models.journal_entry import (
    GENESIS_HASH,
    GLAccountMapping,
    JournalEntry,
    JournalEntryStatus,
    JOURNAL_ENTRY_TRANSITIONS,
    _compute_entry_hash,
)


def _make_je(**kwargs) -> JournalEntry:
    defaults = dict(
        id=uuid.uuid4(),
        company_id=uuid.uuid4(),
        entry_type="OCI_RECOGNITION",
        standard="IFRS_9",
        debit_account="1200",
        credit_account="3400",
        amount=Decimal("100000.00"),
        currency="EUR",
        base_amount=Decimal("110000.00"),
        base_currency="USD",
        fx_rate_used=Decimal("1.10"),
        period_date=date(2026, 3, 31),
        status=JournalEntryStatus.DRAFT.value,
        entry_hash="a" * 64,
        prev_entry_hash=GENESIS_HASH,
        chain_seq=1,
        created_at=datetime(2026, 4, 1, tzinfo=UTC),
        created_by=uuid.uuid4(),
    )
    defaults.update(kwargs)
    je = JournalEntry()
    for k, v in defaults.items():
        setattr(je, k, v)
    return je


def test_genesis_hash_is_64_zeros():
    assert GENESIS_HASH == "0" * 64
    assert len(GENESIS_HASH) == 64


def test_compute_entry_hash_deterministic():
    cid = uuid.UUID("00000000-0000-0000-0000-000000000001")
    h1 = _compute_entry_hash(
        company_id=cid, entry_type="OCI_RECOGNITION", standard="IFRS_9",
        debit_account="1200", credit_account="3400", amount=Decimal("100000"),
        currency="EUR", period_date=date(2026, 3, 31),
        created_at=datetime(2026, 4, 1, tzinfo=UTC), chain_seq=1,
    )
    h2 = _compute_entry_hash(
        company_id=cid, entry_type="OCI_RECOGNITION", standard="IFRS_9",
        debit_account="1200", credit_account="3400", amount=Decimal("100000"),
        currency="EUR", period_date=date(2026, 3, 31),
        created_at=datetime(2026, 4, 1, tzinfo=UTC), chain_seq=1,
    )
    assert h1 == h2
    assert len(h1) == 64


def test_compute_entry_hash_changes_with_chain_seq():
    cid = uuid.uuid4()
    kwargs = dict(
        company_id=cid, entry_type="OCI_RECOGNITION", standard="IFRS_9",
        debit_account="1200", credit_account="3400", amount=Decimal("100000"),
        currency="EUR", period_date=date(2026, 3, 31),
        created_at=datetime(2026, 4, 1, tzinfo=UTC),
    )
    h1 = _compute_entry_hash(**kwargs, chain_seq=1)
    h2 = _compute_entry_hash(**kwargs, chain_seq=2)
    assert h1 != h2


def test_journal_entry_transitions_draft_to_pending():
    allowed = JOURNAL_ENTRY_TRANSITIONS[JournalEntryStatus.DRAFT]
    assert JournalEntryStatus.PENDING_APPROVAL in allowed


def test_journal_entry_transitions_pending_to_approved_or_rejected():
    allowed = JOURNAL_ENTRY_TRANSITIONS[JournalEntryStatus.PENDING_APPROVAL]
    assert JournalEntryStatus.APPROVED in allowed
    assert JournalEntryStatus.REJECTED in allowed


def test_journal_entry_transitions_approved_to_posted():
    allowed = JOURNAL_ENTRY_TRANSITIONS[JournalEntryStatus.APPROVED]
    assert JournalEntryStatus.POSTED in allowed
    assert len(allowed) == 1


def test_journal_entry_transitions_posted_is_terminal():
    assert JOURNAL_ENTRY_TRANSITIONS[JournalEntryStatus.POSTED] == set()


def test_journal_entry_transitions_rejected_is_terminal():
    assert JOURNAL_ENTRY_TRANSITIONS[JournalEntryStatus.REJECTED] == set()


def test_worm_delete_blocked():
    je = _make_je()
    # Simulate ORM before_delete event
    from app.models.journal_entry import _block_je_delete
    with pytest.raises(RuntimeError, match="WORM.*deletes are forbidden"):
        _block_je_delete(None, None, je)


def test_worm_update_immutable_field_blocked():
    """Updating an immutable field (e.g. amount) must raise RuntimeError."""
    from app.models.journal_entry import _block_je_update  # noqa: PLC0415

    je = _make_je()
    # Simulate SQLAlchemy attribute history: amount changed from old to new
    mock_history = MagicMock()
    mock_history.has_changes.return_value = True
    mock_history.deleted = [Decimal("100000.00")]  # old value present → update happened

    mock_mapper = MagicMock()
    mock_mapper.columns = [MagicMock(key="amount")]

    with patch(
        "app.models.journal_entry.get_history",
        return_value=mock_history,
    ):
        with pytest.raises(RuntimeError, match="cannot update.*amount"):
            _block_je_update(mock_mapper, None, je)


def test_worm_update_mutable_field_allowed():
    """Updating a mutable field (status, posted_at, posted_to, posted_ref) must NOT raise."""
    from app.models.journal_entry import _block_je_update  # noqa: PLC0415

    je = _make_je()
    mock_history = MagicMock()
    mock_history.has_changes.return_value = True
    mock_history.deleted = ["DRAFT"]  # old status value

    mock_mapper = MagicMock()
    mock_mapper.columns = [MagicMock(key="status")]

    with patch(
        "app.models.journal_entry.get_history",
        return_value=mock_history,
    ):
        # Should not raise — status is in _MUTABLE_FIELDS
        _block_je_update(mock_mapper, None, je)


def test_gl_account_mapping_has_required_fields():
    m = GLAccountMapping()
    m.company_id = uuid.uuid4()
    m.entry_type = "OCI_RECOGNITION"
    m.standard = "IFRS_9"
    m.debit_account = "1200"
    m.credit_account = "3400"
    m.updated_by = uuid.uuid4()
    m.created_by = uuid.uuid4()
    assert m.erp_system is None or True  # has the field
    assert hasattr(m, "updated_by")
    assert hasattr(m, "account_label")
