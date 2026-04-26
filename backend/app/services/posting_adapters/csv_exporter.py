"""
Generic CSV exporter for SAP/Oracle manual import.
Does not call any external API — returns formatted CSV payload.
"""
from __future__ import annotations

import csv
import io

from app.services.posting_adapters.base import GLPostingAdapter, PostingResult


class CSVExporter(GLPostingAdapter):
    system_name = "CSV"

    async def post(self, journal_entry) -> PostingResult:
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "entry_id", "entry_type", "standard",
            "debit_account", "credit_account",
            "amount", "currency", "base_amount", "base_currency",
            "fx_rate", "period_date", "description",
        ])
        writer.writerow([
            str(journal_entry.id),
            journal_entry.entry_type,
            journal_entry.standard,
            journal_entry.debit_account,
            journal_entry.credit_account,
            str(journal_entry.amount),
            journal_entry.currency,
            str(journal_entry.base_amount),
            journal_entry.base_currency,
            str(journal_entry.fx_rate_used),
            journal_entry.period_date.isoformat(),
            journal_entry.description,
        ])
        return PostingResult(success=True, payload=buf.getvalue())
