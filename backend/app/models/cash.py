# backend/app/models/cash.py
"""
app/models/cash.py

Treasury Suite Phase 2a — all cash/banking ORM models.

Models:
  LegalEntity     — group treasury entity hierarchy (Company -> LegalEntity tree)
  BankConnection  — OAuth connection per institution per tenant (TrueLayer/Plaid)
  BankAccount     — bank account registry (WORM-adjacent: mutable lifecycle, encrypted fields)
  CashBalance     — daily closing balance time-series (partial WORM)
  CashAuditEvent  — SHA-256 hash-chained immutable audit log (full WORM)

WORM semantics:
  CashBalance:    financial columns immutable; reconciliation columns mutable
  CashAuditEvent: full WORM (no UPDATE, no DELETE)
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from enum import Enum

from sqlalchemy import (
    BigInteger, Date, DateTime, Integer, Numeric, String,
    UniqueConstraint, event as sa_event,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

GENESIS_HASH = "0" * 64


# ── Enums ──────────────────────────────────────────────────────────────────


class LegalEntityStatus(str, Enum):
    ACTIVE = "ACTIVE"
    DORMANT = "DORMANT"
    LIQUIDATED = "LIQUIDATED"


class BankConnectionProvider(str, Enum):
    TRUELAYER = "TRUELAYER"
    PLAID = "PLAID"


class BankConnectionStatus(str, Enum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"
    ERROR = "ERROR"


class BankAccountType(str, Enum):
    OPERATING = "OPERATING"
    CONCENTRATION = "CONCENTRATION"
    PAYROLL = "PAYROLL"
    RESTRICTED = "RESTRICTED"
    MONEY_MARKET = "MONEY_MARKET"
    ESCROW = "ESCROW"
    NOSTRO = "NOSTRO"
    VOSTRO = "VOSTRO"


class BankAccountStatus(str, Enum):
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    ACTIVE = "ACTIVE"
    FROZEN = "FROZEN"
    CLOSED = "CLOSED"


# State machine: keys = FROM state, values = allowed TO states
BANK_ACCOUNT_TRANSITIONS: dict[BankAccountStatus, set[BankAccountStatus]] = {
    BankAccountStatus.PENDING_VERIFICATION: {BankAccountStatus.ACTIVE},
    BankAccountStatus.ACTIVE: {BankAccountStatus.FROZEN, BankAccountStatus.CLOSED},
    BankAccountStatus.FROZEN: {BankAccountStatus.ACTIVE, BankAccountStatus.CLOSED},
    BankAccountStatus.CLOSED: set(),  # terminal
}


class CashBalanceSource(str, Enum):
    MANUAL = "MANUAL"
    API_PULL = "API_PULL"
    MT940_IMPORT = "MT940_IMPORT"
    RECONCILED = "RECONCILED"


class ReconciliationStatus(str, Enum):
    UNRECONCILED = "UNRECONCILED"
    RECONCILED = "RECONCILED"
    DISPUTED = "DISPUTED"
    PENDING_REVIEW = "PENDING_REVIEW"


class CashAuditEventType(str, Enum):
    ACCOUNT_CREATED = "ACCOUNT_CREATED"
    ACCOUNT_VERIFIED = "ACCOUNT_VERIFIED"
    ACCOUNT_FROZEN = "ACCOUNT_FROZEN"
    ACCOUNT_UNFROZEN = "ACCOUNT_UNFROZEN"
    ACCOUNT_CLOSED = "ACCOUNT_CLOSED"
    BALANCE_ENTERED = "BALANCE_ENTERED"
    BALANCE_CORRECTED = "BALANCE_CORRECTED"
    BALANCE_RECONCILED = "BALANCE_RECONCILED"
    BALANCE_DISPUTED = "BALANCE_DISPUTED"
    CONNECTION_LINKED = "CONNECTION_LINKED"
    CONNECTION_REVOKED = "CONNECTION_REVOKED"
    ENTITY_CREATED = "ENTITY_CREATED"
    ENTITY_UPDATED = "ENTITY_UPDATED"
    ENTITY_CLOSED = "ENTITY_CLOSED"
    FORECAST_CREATED = "FORECAST_CREATED"
    FORECAST_SCENARIO_RUN = "FORECAST_SCENARIO_RUN"


# ── Models ─────────────────────────────────────────────────────────────────


class LegalEntity(Base):
    __tablename__ = "legal_entities"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    parent_entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    short_name: Mapped[str] = mapped_column(String(100), nullable=False)
    lei: Mapped[str | None] = mapped_column(String(20), nullable=True)
    giin: Mapped[str | None] = mapped_column(String(19), nullable=True)
    registration_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    jurisdiction: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str] = mapped_column(String(2), nullable=False)
    functional_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    reporting_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default=LegalEntityStatus.ACTIVE.value)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class BankConnection(Base):
    __tablename__ = "bank_connections"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    institution_id: Mapped[str] = mapped_column(String(100), nullable=False)
    institution_name: Mapped[str] = mapped_column(String(255), nullable=False)
    access_token_enc: Mapped[str | None] = mapped_column(String, nullable=True)
    refresh_token_enc: Mapped[str | None] = mapped_column(String, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scope: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default=BankConnectionStatus.ACTIVE.value)
    last_successful_pull_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    consecutive_failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pending_oauth_state: Mapped[str | None] = mapped_column(String(128), nullable=True)
    pending_oauth_state_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    bank_name: Mapped[str] = mapped_column(String(255), nullable=False)
    bank_lei: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bank_bic: Mapped[str | None] = mapped_column(String(11), nullable=True)
    account_number_enc: Mapped[str | None] = mapped_column(String, nullable=True)
    iban_enc: Mapped[str | None] = mapped_column(String, nullable=True)
    account_type: Mapped[str] = mapped_column(String(32), nullable=False, default=BankAccountType.OPERATING.value)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    nickname: Mapped[str] = mapped_column(String(100), nullable=False)
    purpose: Mapped[str | None] = mapped_column(String, nullable=True)
    overdraft_limit: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False, default=0)
    min_balance_threshold: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)
    gl_debit_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    gl_credit_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    api_connection_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    api_account_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default=BankAccountStatus.PENDING_VERIFICATION.value)
    verified_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class CashBalance(Base):
    __tablename__ = "cash_balances"
    __table_args__ = (
        UniqueConstraint("account_id", "balance_date", name="uq_cash_balance_account_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    balance_date: Mapped[date] = mapped_column(Date, nullable=False)
    value_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    ledger_balance: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    available_balance: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    value_date_balance: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)
    in_transit_debit: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False, default=0)
    in_transit_credit: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default=CashBalanceSource.MANUAL.value)
    reconciliation_status: Mapped[str] = mapped_column(String(32), nullable=False, default=ReconciliationStatus.UNRECONCILED.value)
    reconciled_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    reconciled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pulled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


_CASH_BALANCE_IMMUTABLE = frozenset({
    "account_id", "balance_date", "ledger_balance", "available_balance",
    "value_date_balance", "in_transit_debit", "in_transit_credit",
    "currency", "source", "created_by", "created_at",
    "value_date", "pulled_at", "note",
})


@sa_event.listens_for(CashBalance, "before_delete")
def _block_cash_balance_delete(mapper, connection, target):
    raise ValueError(f"cash_balances is WORM — deletes forbidden (id={target.id})")


@sa_event.listens_for(CashBalance, "before_update")
def _guard_cash_balance_immutable(mapper, connection, target):
    """Block updates to financial columns at ORM level (mirrors DB partial WORM trigger).

    Needed for SQLite-based unit tests where the PostgreSQL trigger is absent.
    """
    from sqlalchemy import inspect as sa_inspect
    state = sa_inspect(target)
    for col in mapper.columns:
        if col.key in _CASH_BALANCE_IMMUTABLE:
            hist = state.attrs[col.key].history
            if hist.added or hist.deleted:
                raise ValueError(
                    f"cash_balances.{col.key} is immutable after creation (WORM financial column)"
                )


class CashAuditEvent(Base):
    __tablename__ = "cash_audit_events"
    __table_args__ = (
        UniqueConstraint("company_id", "chain_seq", name="uq_cash_audit_chain"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    balance_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    performed_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    event_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    prev_event_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    chain_seq: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


@sa_event.listens_for(CashAuditEvent, "before_delete")
def _block_audit_delete(mapper, connection, target):
    raise ValueError(f"cash_audit_events is WORM — deletes forbidden (id={target.id})")


@sa_event.listens_for(CashAuditEvent, "before_update")
def _block_audit_update(mapper, connection, target):
    raise ValueError(f"cash_audit_events is WORM — updates forbidden (id={target.id})")
