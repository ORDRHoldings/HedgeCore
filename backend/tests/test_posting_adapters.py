# backend/tests/test_posting_adapters.py
"""Unit tests for GL posting adapters (no HTTP calls — all stubbed)."""
import io
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from app.services.posting_adapters.base import PostingResult
from app.services.posting_adapters.csv_exporter import CSVExporter


def _make_je(**kwargs):
    from unittest.mock import MagicMock
    je = MagicMock()
    je.id = uuid.uuid4()
    je.entry_type = "OCI_RECOGNITION"
    je.standard = "IFRS_9"
    je.debit_account = "1200"
    je.credit_account = "3400"
    je.amount = Decimal("100000.00")
    je.currency = "EUR"
    je.base_amount = Decimal("110000.00")
    je.base_currency = "USD"
    je.fx_rate_used = Decimal("1.10")
    je.period_date = date(2026, 3, 31)
    je.description = "OCI recognition Q1"
    je.company_id = uuid.uuid4()
    for k, v in kwargs.items():
        setattr(je, k, v)
    return je


@pytest.mark.asyncio
async def test_csv_exporter_produces_valid_csv():
    exporter = CSVExporter()
    je = _make_je()
    result = await exporter.post(je)
    assert result.success is True
    assert "1200" in result.payload  # debit account in CSV


@pytest.mark.asyncio
async def test_csv_exporter_includes_all_fields():
    exporter = CSVExporter()
    je = _make_je()
    result = await exporter.post(je)
    assert "OCI_RECOGNITION" in result.payload
    assert "EUR" in result.payload
    assert "100000" in result.payload


def test_posting_result_failure():
    r = PostingResult(success=False, payload="", error="Connection timeout")
    assert r.success is False
    assert "timeout" in r.error
