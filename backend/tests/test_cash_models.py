# backend/tests/test_cash_models.py
"""Tests for cash.py model enums and constants."""
import pytest
from app.models.cash import (
    GENESIS_HASH,
    BankAccountStatus,
    BankAccountType,
    BankConnectionStatus,
    BankConnectionProvider,
    CashBalanceSource,
    CashAuditEventType,
    LegalEntityStatus,
    ReconciliationStatus,
    BANK_ACCOUNT_TRANSITIONS,
)


def test_genesis_hash_is_64_zeros():
    assert GENESIS_HASH == "0" * 64


def test_bank_account_transitions_active_to_frozen():
    assert BankAccountStatus.FROZEN in BANK_ACCOUNT_TRANSITIONS[BankAccountStatus.ACTIVE]


def test_bank_account_transitions_closed_is_terminal():
    assert BANK_ACCOUNT_TRANSITIONS[BankAccountStatus.CLOSED] == set()


def test_bank_account_transitions_pending_cannot_skip_to_closed():
    assert BankAccountStatus.CLOSED not in BANK_ACCOUNT_TRANSITIONS[BankAccountStatus.PENDING_VERIFICATION]


def test_bank_account_transitions_pending_to_active():
    assert BankAccountStatus.ACTIVE in BANK_ACCOUNT_TRANSITIONS[BankAccountStatus.PENDING_VERIFICATION]


def test_all_account_types_defined():
    types = {t.value for t in BankAccountType}
    assert "OPERATING" in types
    assert "NOSTRO" in types
    assert "VOSTRO" in types


def test_cash_audit_event_types_cover_lifecycle():
    types = {t.value for t in CashAuditEventType}
    assert "ACCOUNT_CREATED" in types
    assert "BALANCE_ENTERED" in types
    assert "CONNECTION_LINKED" in types
