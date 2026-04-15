"""Common dataclasses for parsed bank statement data."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal


@dataclass
class ParsedTransaction:
    tx_date: date
    value_date: date | None
    amount: Decimal
    direction: str  # "DEBIT" or "CREDIT"
    description: str = ""
    reference: str = ""
    counterparty: str = ""
    tx_code: str = ""


@dataclass
class ParsedStatement:
    account_identifier: str  # IBAN or account number
    statement_date: date
    opening_balance: Decimal
    closing_balance: Decimal
    currency: str
    transactions: list[ParsedTransaction] = field(default_factory=list)
