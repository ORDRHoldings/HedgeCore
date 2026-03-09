"""Tests for app.services.regulatory_export.

Covers:
  - ISDA XML: structure, escaping, empty transactions, field population
  - FINRA 17a-4: header/record/trailer structure, hash chain continuity,
    record hashing, empty findings, integrity hash
"""

from __future__ import annotations

import hashlib
import re
from xml.etree import ElementTree as ET

import pytest

from app.services.regulatory_export import export_finra_17a4, export_isda_xml


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sample_run() -> dict:
    return {
        "run_id": "run-001",
        "trade_date": "2026-03-09",
        "value_date": "2026-03-11",
        "counterparty": "Acme Corp",
        "currency_base": "EUR",
        "currency_quote": "USD",
        "notional": 1_000_000,
        "rate": 1.085,
        "generated_by": "audit_lab",
        "report_date": "2026-03-09",
    }


def _sample_transactions() -> list[dict]:
    return [
        {
            "transaction_id": "txn-1",
            "direction": "BUY",
            "currency": "EUR",
            "amount": 500_000,
            "rate": 1.085,
            "value_date": "2026-03-11",
        },
        {
            "transaction_id": "txn-2",
            "direction": "SELL",
            "currency": "USD",
            "amount": 542_500,
            "rate": 1.085,
            "value_date": "2026-03-11",
        },
    ]


def _sample_findings() -> list[dict]:
    return [
        {
            "finding_id": "F-001",
            "timestamp": "2026-03-09T10:00:00Z",
            "category": "LIMIT_BREACH",
            "severity": "HIGH",
            "description": "Notional exceeds desk limit",
        },
        {
            "finding_id": "F-002",
            "timestamp": "2026-03-09T10:01:00Z",
            "category": "POLICY_MISMATCH",
            "severity": "MEDIUM",
            "description": "Hedge ratio outside corridor",
        },
    ]


# ---------------------------------------------------------------------------
# ISDA XML tests
# ---------------------------------------------------------------------------

class TestExportIsdaXml:
    def test_valid_xml(self) -> None:
        """Output must be well-formed XML."""
        xml = export_isda_xml(_sample_run(), _sample_transactions())
        # ElementTree requires namespace handling; strip isda prefix for parse
        parseable = xml.replace("isda:", "").replace("xmlns:isda=", "xmlns=")
        ET.fromstring(parseable)  # raises on malformed XML

    def test_header_fields(self) -> None:
        xml = export_isda_xml(_sample_run(), _sample_transactions())
        assert "<runId>run-001</runId>" in xml
        assert "<tradeDate>2026-03-09</tradeDate>" in xml
        assert "<valueDate>2026-03-11</valueDate>" in xml
        assert "<counterparty>Acme Corp</counterparty>" in xml

    def test_trade_details(self) -> None:
        xml = export_isda_xml(_sample_run(), _sample_transactions())
        assert "<currencyBase>EUR</currencyBase>" in xml
        assert "<currencyQuote>USD</currencyQuote>" in xml
        assert "<notional>1000000</notional>" in xml
        assert "<rate>1.085</rate>" in xml

    def test_transactions_present(self) -> None:
        xml = export_isda_xml(_sample_run(), _sample_transactions())
        assert xml.count("<transaction>") == 2
        assert "<transactionId>txn-1</transactionId>" in xml
        assert "<direction>SELL</direction>" in xml

    def test_empty_transactions(self) -> None:
        xml = export_isda_xml(_sample_run(), [])
        assert "<transactions>" in xml
        assert "<transaction>" not in xml

    def test_xml_escaping(self) -> None:
        run = _sample_run()
        run["counterparty"] = "A & B <Corp>"
        xml = export_isda_xml(run, [])
        assert "A &amp; B &lt;Corp&gt;" in xml

    def test_missing_keys_default_empty(self) -> None:
        xml = export_isda_xml({}, [])
        assert "<runId></runId>" in xml
        assert "<counterparty></counterparty>" in xml

    def test_generated_at_present(self) -> None:
        xml = export_isda_xml(_sample_run(), [])
        assert "<generatedAt>" in xml


# ---------------------------------------------------------------------------
# FINRA 17a-4 tests
# ---------------------------------------------------------------------------

class TestExportFinra17a4:
    def test_three_sections(self) -> None:
        """Output has HEADER, RECORD(s), TRAILER."""
        text = export_finra_17a4(_sample_run(), _sample_findings(), [])
        lines = text.strip().split("\n")
        assert lines[0].startswith("HEADER")
        assert lines[-1].startswith("TRAILER")
        record_lines = [l for l in lines if l.startswith("RECORD")]
        assert len(record_lines) == 2

    def test_header_fields(self) -> None:
        text = export_finra_17a4(_sample_run(), _sample_findings(), [])
        header = text.split("\n")[0]
        parts = header.split("|")
        assert parts[0] == "HEADER"
        assert parts[1] == "run-001"
        assert parts[2] == "audit_lab"
        assert "CHAIN_LENGTH=0" in header

    def test_header_chain_length(self) -> None:
        chain = ["abc123", "def456"]
        text = export_finra_17a4(_sample_run(), _sample_findings(), chain)
        header = text.split("\n")[0]
        assert "CHAIN_LENGTH=2" in header

    def test_record_sequential_numbering(self) -> None:
        text = export_finra_17a4(_sample_run(), _sample_findings(), [])
        lines = text.split("\n")
        records = [l for l in lines if l.startswith("RECORD")]
        assert "|000001|" in records[0]
        assert "|000002|" in records[1]

    def test_record_contains_finding_data(self) -> None:
        text = export_finra_17a4(_sample_run(), _sample_findings(), [])
        lines = text.split("\n")
        records = [l for l in lines if l.startswith("RECORD")]
        assert "F-001" in records[0]
        assert "LIMIT_BREACH" in records[0]
        assert "HIGH" in records[0]

    def test_record_hash_is_sha256(self) -> None:
        text = export_finra_17a4(_sample_run(), _sample_findings(), [])
        lines = text.split("\n")
        records = [l for l in lines if l.startswith("RECORD")]
        for rec in records:
            match = re.search(r"HASH=([0-9a-f]{64})", rec)
            assert match is not None, f"No SHA-256 hash in record: {rec}"

    def test_hash_chain_continuity(self) -> None:
        """Each record's PREV_HASH must equal the prior record's HASH."""
        text = export_finra_17a4(_sample_run(), _sample_findings(), [])
        lines = text.split("\n")
        records = [l for l in lines if l.startswith("RECORD")]

        prev_hashes = []
        record_hashes = []
        for rec in records:
            prev_match = re.search(r"PREV_HASH=([0-9a-f]{64})", rec)
            hash_match = re.search(r"\|HASH=([0-9a-f]{64})", rec)
            assert prev_match and hash_match
            prev_hashes.append(prev_match.group(1))
            record_hashes.append(hash_match.group(1))

        # First record's PREV_HASH is genesis (64 zeros when no chain)
        assert prev_hashes[0] == "0" * 64
        # Second record's PREV_HASH is first record's HASH
        assert prev_hashes[1] == record_hashes[0]

    def test_hash_chain_continuity_with_existing_chain(self) -> None:
        """When hash_chain is provided, first record links to its last entry."""
        existing = ["aaa", "bbb", "ccc111"]
        text = export_finra_17a4(_sample_run(), _sample_findings(), existing)
        lines = text.split("\n")
        records = [l for l in lines if l.startswith("RECORD")]
        first_prev = re.search(r"PREV_HASH=(\S+?)(?:\|)", records[0])
        assert first_prev is not None
        assert first_prev.group(1) == "ccc111"

    def test_record_hash_verifiable(self) -> None:
        """Recompute the hash from the record body and verify it matches."""
        text = export_finra_17a4(_sample_run(), _sample_findings(), [])
        lines = text.split("\n")
        records = [l for l in lines if l.startswith("RECORD")]

        for rec in records:
            # Body is everything before |HASH=...
            body, _, hash_part = rec.rpartition("|HASH=")
            expected = hashlib.sha256(body.encode("utf-8")).hexdigest()
            assert hash_part == expected, f"Hash mismatch for record body"

    def test_trailer_record_count(self) -> None:
        text = export_finra_17a4(_sample_run(), _sample_findings(), [])
        trailer = text.split("\n")[-1]
        assert "RECORD_COUNT=2" in trailer

    def test_trailer_integrity_hash(self) -> None:
        text = export_finra_17a4(_sample_run(), _sample_findings(), [])
        trailer = text.split("\n")[-1]
        match = re.search(r"INTEGRITY_HASH=([0-9a-f]{64})", trailer)
        assert match is not None

    def test_empty_findings(self) -> None:
        text = export_finra_17a4(_sample_run(), [], [])
        lines = text.split("\n")
        assert len(lines) == 2  # HEADER + TRAILER only
        assert "RECORD_COUNT=0" in lines[-1]

    def test_empty_findings_integrity_hash(self) -> None:
        """With no records, integrity hash is SHA-256 of 'EMPTY'."""
        text = export_finra_17a4(_sample_run(), [], [])
        trailer = text.split("\n")[-1]
        expected = hashlib.sha256(b"EMPTY").hexdigest()
        assert f"INTEGRITY_HASH={expected}" in trailer

    def test_missing_run_keys(self) -> None:
        """Gracefully handles missing keys in run_data."""
        text = export_finra_17a4({}, [], [])
        header = text.split("\n")[0]
        assert header.startswith("HEADER")
        assert "|SYSTEM|" in header
