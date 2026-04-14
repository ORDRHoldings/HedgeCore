"""
Abstract ERP pull adapter base class.
Defines the ERPInvoice dataclass and ERPPullAdapter interface.
"""
from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal


@dataclass
class ERPInvoice:
    """Normalised invoice record from any ERP system."""
    source_system: str      # "XERO" | "NETSUITE" | "QB" | "SAGE"
    source_ref: str         # ERP-assigned invoice ID
    amount: Decimal         # Foreign currency amount
    currency: str           # ISO 4217 currency code
    due_date: date          # Payment due date (becomes Position.value_date)
    counterparty: str       # Customer or vendor name
    direction: str = "AR"   # "AR" (receivable) or "AP" (payable)
    invoice_date: date | None = None
    raw: dict = field(default_factory=dict)

    @property
    def dedup_hash(self) -> str:
        """Stable dedup hash — same invoice produces same hash across pulls."""
        content = "|".join([
            self.source_system,
            self.source_ref,
            str(self.amount),
            self.currency,
            self.due_date.isoformat(),
        ])
        return hashlib.sha256(content.encode("utf-8")).hexdigest()


class ERPPullAdapter(ABC):
    """Interface all ERP pull adapters must implement."""

    @abstractmethod
    async def pull_open_invoices(self, *, base_currency: str) -> list[ERPInvoice]:
        """
        Fetch all open foreign-currency invoices from the ERP.
        Returns only invoices in currency != base_currency.
        """
        ...

    @property
    @abstractmethod
    def system_name(self) -> str:
        """e.g. "XERO", "NETSUITE" """
        ...
