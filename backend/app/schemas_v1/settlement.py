"""Pydantic schemas for settlement endpoints."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class SettlementConfirmRequest(BaseModel):
    actual_rate: Decimal
    settlement_ref: str
    hedge_rate: Decimal
    hedge_notional: Decimal
    currency: str = "USD"
    standard: str = "IFRS_9"


class SettlementEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ledger_entry_id: uuid.UUID
    hedge_rate: Decimal
    actual_rate: Decimal
    hedge_amount: Decimal
    settlement_amount: Decimal
    rate_variance: Decimal
    pnl_impact: Decimal
    settlement_date: date
    value_date: date | None
    settlement_ref: str
    status: str
    created_at: datetime
