# backend/app/schemas_v1/gl.py
"""Pydantic schemas for GL journal entry endpoints."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class GLAccountMappingCreate(BaseModel):
    entry_type: str
    standard: str
    debit_account: str
    credit_account: str
    account_label: str = ""
    erp_system: str = "MANUAL"


class GLAccountMappingRead(GLAccountMappingCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class JournalEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    run_id: uuid.UUID | None
    ledger_entry_id: uuid.UUID | None
    settlement_event_id: uuid.UUID | None
    entry_type: str
    standard: str
    debit_account: str
    credit_account: str
    amount: Decimal
    currency: str
    base_amount: Decimal
    base_currency: str
    fx_rate_used: Decimal
    period_date: date
    description: str
    status: str
    posted_at: datetime | None
    posted_to: str | None
    posted_ref: str | None
    chain_seq: int
    created_at: datetime


class JournalEntryApproveRequest(BaseModel):
    pass  # No body required; checker identity from JWT


class JournalEntryRejectRequest(BaseModel):
    reason: str


class GLExportRequest(BaseModel):
    format: str = "csv"  # "csv" | "xml"
    status: str = "APPROVED"
    period_start: date | None = None
    period_end: date | None = None
