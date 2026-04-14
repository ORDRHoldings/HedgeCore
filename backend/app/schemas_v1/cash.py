# backend/app/schemas_v1/cash.py
"""
Pydantic request/response schemas for Treasury Suite Phase 2a cash endpoints.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from pydantic import BaseModel, Field


# ── LegalEntity ───────────────────────────────────────────────────────────

class LegalEntityCreate(BaseModel):
    legal_name: str
    short_name: str
    country: str = Field(..., min_length=2, max_length=2)
    functional_currency: str = Field(..., min_length=3, max_length=3)
    reporting_currency: str = Field(..., min_length=3, max_length=3)
    parent_entity_id: uuid.UUID | None = None
    lei: str | None = None
    giin: str | None = None
    registration_number: str | None = None
    jurisdiction: str | None = None


class LegalEntityUpdate(BaseModel):
    legal_name: str | None = None
    short_name: str | None = None
    lei: str | None = None
    giin: str | None = None
    jurisdiction: str | None = None
    version: int  # required for optimistic locking


class LegalEntityCloseRequest(BaseModel):
    status: str = Field(..., pattern="^(DORMANT|LIQUIDATED)$")


class LegalEntityResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    parent_entity_id: uuid.UUID | None
    legal_name: str
    short_name: str
    lei: str | None
    giin: str | None
    country: str
    functional_currency: str
    reporting_currency: str
    status: str
    version: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── BankAccount ───────────────────────────────────────────────────────────

class BankAccountCreate(BaseModel):
    entity_id: uuid.UUID
    bank_name: str
    bank_bic: str | None = None
    account_number: str | None = None  # plaintext — encrypted at service layer
    iban: str | None = None             # plaintext — encrypted at service layer
    account_type: str = "OPERATING"
    currency: str = Field(..., min_length=3, max_length=3)
    nickname: str
    purpose: str | None = None
    overdraft_limit: Decimal = Decimal("0")
    min_balance_threshold: Decimal | None = None
    gl_debit_code: str | None = None
    gl_credit_code: str | None = None
    api_connection_id: uuid.UUID | None = None


class BankAccountResponse(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    bank_name: str
    bank_bic: str | None
    account_number: str | None  # masked unless cfo role
    iban: str | None            # masked unless cfo role
    account_type: str
    currency: str
    nickname: str
    status: str
    overdraft_limit: Decimal
    min_balance_threshold: Decimal | None
    gl_debit_code: str | None
    gl_credit_code: str | None
    version: int
    created_by: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class BankAccountUpdate(BaseModel):
    """Updatable non-sensitive fields. Sensitive fields (account_number, iban) are immutable."""
    nickname: str | None = None
    purpose: str | None = None
    overdraft_limit: Decimal | None = None
    min_balance_threshold: Decimal | None = None
    gl_debit_code: str | None = None
    gl_credit_code: str | None = None


# ── BankConnection ────────────────────────────────────────────────────────

class AuthUrlRequest(BaseModel):
    provider: str = Field(..., pattern="^(TRUELAYER|PLAID)$")
    redirect_uri: str


class AuthUrlResponse(BaseModel):
    url: str
    connection_id: uuid.UUID


class OAuthCallbackRequest(BaseModel):
    state: str
    code: str


class BankConnectionResponse(BaseModel):
    id: uuid.UUID
    provider: str
    institution_name: str
    status: str
    consecutive_failure_count: int
    last_successful_pull_at: datetime | None
    last_error_message: str | None
    created_at: datetime

    class Config:
        from_attributes = True


# ── CashBalance ───────────────────────────────────────────────────────────

class CashBalanceCreate(BaseModel):
    account_id: uuid.UUID
    balance_date: date
    value_date: date | None = None
    ledger_balance: Decimal
    available_balance: Decimal
    value_date_balance: Decimal | None = None
    in_transit_debit: Decimal = Decimal("0")
    in_transit_credit: Decimal = Decimal("0")
    currency: str = Field(..., min_length=3, max_length=3)
    note: str | None = None


class BulkBalanceCreate(BaseModel):
    rows: list[CashBalanceCreate]


class ReconcileRequest(BaseModel):
    status: str = Field(..., pattern="^(RECONCILED|DISPUTED|PENDING_REVIEW)$")
    note: str | None = None


class CashBalanceResponse(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    balance_date: date
    ledger_balance: Decimal
    available_balance: Decimal
    in_transit_debit: Decimal
    in_transit_credit: Decimal
    currency: str
    source: str
    reconciliation_status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Position views ────────────────────────────────────────────────────────

class CurrencyPosition(BaseModel):
    currency: str
    ledger_balance: Decimal
    available_balance: Decimal
    in_transit_net: Decimal  # credit - debit
    account_count: int


class ConsolidatedPositionResponse(BaseModel):
    as_of_date: date
    positions: list[CurrencyPosition]


class EntityPosition(BaseModel):
    entity_id: uuid.UUID
    entity_name: str
    currency: str
    ledger_balance: Decimal
    available_balance: Decimal


class EntityPositionResponse(BaseModel):
    as_of_date: date
    positions: list[EntityPosition]
