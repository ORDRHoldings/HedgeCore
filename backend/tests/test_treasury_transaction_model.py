# backend/tests/test_treasury_transaction_model.py
"""Unit tests for TreasuryTransaction WORM model and hash chain."""
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from app.models.treasury_transaction import (
    GENESIS_HASH as TX_GENESIS,
    TreasuryTransaction,
    TxSourceModule,
    TxType,
    _compute_tx_hash,
    _block_tx_delete,
    _block_tx_update,
)


def test_tx_genesis_hash_is_64_zeros():
    assert TX_GENESIS == "0" * 64


def test_compute_tx_hash_deterministic():
    cid = uuid.UUID("00000000-0000-0000-0000-000000000001")
    sid = uuid.UUID("00000000-0000-0000-0000-000000000002")
    kwargs = dict(
        company_id=cid, tx_type=TxType.FX_HEDGE.value,
        amount=Decimal("100000"), currency="EUR",
        value_date=date(2026, 3, 31), source_ref_id=sid,
        created_at=datetime(2026, 4, 1, tzinfo=UTC), chain_seq=1,
    )
    assert _compute_tx_hash(**kwargs) == _compute_tx_hash(**kwargs)


def test_compute_tx_hash_changes_with_chain_seq():
    cid, sid = uuid.uuid4(), uuid.uuid4()
    kwargs = dict(
        company_id=cid, tx_type="FX_HEDGE", amount=Decimal("100000"),
        currency="EUR", value_date=date(2026, 3, 31), source_ref_id=sid,
        created_at=datetime(2026, 4, 1, tzinfo=UTC),
    )
    assert _compute_tx_hash(**kwargs, chain_seq=1) != _compute_tx_hash(**kwargs, chain_seq=2)


def test_worm_delete_blocked():
    tx = TreasuryTransaction()
    tx.id = uuid.uuid4()
    with pytest.raises(RuntimeError, match="WORM.*deletes are forbidden"):
        _block_tx_delete(None, None, tx)


def test_worm_update_blocked():
    tx = TreasuryTransaction()
    tx.id = uuid.uuid4()
    with pytest.raises(RuntimeError, match="WORM.*updates are forbidden"):
        _block_tx_update(None, None, tx)


def test_tx_type_enum_has_required_values():
    required = {
        "FX_HEDGE", "SETTLEMENT", "BANK_RECEIPT", "BANK_PAYMENT",
        "INTERCOMPANY", "JOURNAL_ENTRY", "CASH_POOL_SWEEP",
    }
    actual = {t.value for t in TxType}
    assert required.issubset(actual)


def test_tx_source_module_enum_has_required_values():
    required = {"FX_LIFECYCLE", "CASH", "GL", "PAYMENT", "SETTLEMENT"}
    actual = {m.value for m in TxSourceModule}
    assert required.issubset(actual)
