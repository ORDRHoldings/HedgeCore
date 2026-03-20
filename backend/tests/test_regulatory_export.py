"""Tests for app.services.regulatory_export.

Covers:
  - ISDA XML: structure, escaping, empty transactions, field population
  - FINRA 17a-4: header/record/trailer structure, hash chain continuity,
    record hashing, empty findings, integrity hash
  - EMIR Article 9: XML structure, hedge actions, exposures, risk mitigation
  - MiFID II RTS 25: XML structure, transactions, exposure summary, compliance
  - Dodd-Frank Title VII: header/swap/exposure/trailer, hash chain, integrity
"""

from __future__ import annotations

import hashlib
import re
from xml.etree import ElementTree as ET

import pytest

from app.services.regulatory_export import (
    export_dodd_frank,
    export_emir_xml,
    export_finra_17a4,
    export_isda_xml,
    export_mifid_xml,
)


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


# ---------------------------------------------------------------------------
# Shared fixtures for new regulatory exports
# ---------------------------------------------------------------------------

def _sample_reg_run() -> dict:
    return {
        "run_id": "run-reg-001",
        "trade_date": "2026-03-12",
        "value_date": "2026-03-14",
        "reporting_entity_lei": "5493001KJTIIGC8Y1R12",
        "counterparty_lei": "213800ABCD1234567890",
        "executing_entity_lei": "5493001KJTIIGC8Y1R12",
        "venue": "XOFF",
        "decision_maker": "treasury@acme.com",
        "generated_by": "ordr_terminal",
        "report_date": "2026-03-12",
    }


def _sample_hedge_actions() -> list[dict]:
    return [
        {
            "currency": "MXN",
            "instrument": "FX_FORWARD",
            "hedge_notional": 5_000_000,
            "hedge_rate": 17.25,
            "value_date": "2026-06-15",
            "position_id": "pos-001",
        },
        {
            "currency": "EUR",
            "instrument": "FX_OPTION",
            "hedge_notional": -2_000_000,
            "hedge_rate": 1.085,
            "value_date": "2026-09-30",
            "position_id": "pos-002",
        },
    ]


def _sample_positions() -> list[dict]:
    return [
        {
            "record_id": "REC-001",
            "currency": "MXN",
            "amount": 5_500_000,
            "flow_type": "PAYABLE",
            "entity": "Acme Mexico SA",
        },
        {
            "record_id": "REC-002",
            "currency": "EUR",
            "amount": 2_200_000,
            "flow_type": "RECEIVABLE",
            "entity": "Acme GmbH",
        },
    ]


# ---------------------------------------------------------------------------
# EMIR Article 9 tests
# ---------------------------------------------------------------------------

class TestExportEmirXml:
    def test_valid_xml(self) -> None:
        """Output must be well-formed XML."""
        xml = export_emir_xml(_sample_reg_run(), _sample_hedge_actions(), _sample_positions())
        parseable = xml.replace("emir:", "").replace("xmlns:emir=", "xmlns=")
        ET.fromstring(parseable)

    def test_report_header_fields(self) -> None:
        xml = export_emir_xml(_sample_reg_run(), _sample_hedge_actions(), _sample_positions())
        assert "<reportType>TRADE</reportType>" in xml
        assert "<actionType>NEW</actionType>" in xml
        assert "5493001KJTIIGC8Y1R12" in xml
        assert "213800ABCD1234567890" in xml
        assert "EMIR Refit" in xml

    def test_uti_present(self) -> None:
        xml = export_emir_xml(_sample_reg_run(), _sample_hedge_actions(), [])
        assert "UTI-run-reg-001" in xml

    def test_asset_class_fx(self) -> None:
        xml = export_emir_xml(_sample_reg_run(), [], [])
        assert "<assetClass>FOREIGN_EXCHANGE</assetClass>" in xml
        assert "<hedgeFlag>true</hedgeFlag>" in xml

    def test_hedge_actions_present(self) -> None:
        xml = export_emir_xml(_sample_reg_run(), _sample_hedge_actions(), [])
        assert xml.count("<action seq=") == 2
        assert "<currency>MXN</currency>" in xml
        assert "<instrument>FX_FORWARD</instrument>" in xml
        assert "<notionalAmount>5000000" in xml

    def test_aggregate_notional(self) -> None:
        xml = export_emir_xml(_sample_reg_run(), _sample_hedge_actions(), [])
        assert "<aggregateNotional>7000000.0</aggregateNotional>" in xml

    def test_exposures_present(self) -> None:
        xml = export_emir_xml(_sample_reg_run(), [], _sample_positions())
        assert xml.count("<exposure>") == 2
        assert "<recordId>REC-001</recordId>" in xml
        assert "<flowType>PAYABLE</flowType>" in xml

    def test_risk_mitigation_section(self) -> None:
        xml = export_emir_xml(_sample_reg_run(), [], [])
        assert "<article11Compliance>true</article11Compliance>" in xml
        assert "<portfolioReconciliation>DAILY</portfolioReconciliation>" in xml

    def test_empty_actions_and_positions(self) -> None:
        xml = export_emir_xml(_sample_reg_run(), [], [])
        parseable = xml.replace("emir:", "").replace("xmlns:emir=", "xmlns=")
        ET.fromstring(parseable)
        assert "<aggregateNotional>0.0</aggregateNotional>" in xml

    def test_xml_escaping(self) -> None:
        run = _sample_reg_run()
        run["reporting_entity_lei"] = "LEI & <Special>"
        xml = export_emir_xml(run, [], [])
        assert "LEI &amp; &lt;Special&gt;" in xml

    def test_missing_keys_default(self) -> None:
        xml = export_emir_xml({}, [], [])
        assert "NOT_PROVIDED" in xml
        parseable = xml.replace("emir:", "").replace("xmlns:emir=", "xmlns=")
        ET.fromstring(parseable)


# ---------------------------------------------------------------------------
# MiFID II RTS 25 tests
# ---------------------------------------------------------------------------

class TestExportMifidXml:
    def test_valid_xml(self) -> None:
        xml = export_mifid_xml(_sample_reg_run(), _sample_hedge_actions(), _sample_positions())
        parseable = xml.replace("mifid:", "").replace("xmlns:mifid=", "xmlns=")
        ET.fromstring(parseable)

    def test_report_header(self) -> None:
        xml = export_mifid_xml(_sample_reg_run(), _sample_hedge_actions(), [])
        assert "TRN-run-reg-001" in xml
        assert "5493001KJTIIGC8Y1R12" in xml
        assert "<venue>XOFF</venue>" in xml
        assert "MiFID II" in xml

    def test_transactions_present(self) -> None:
        xml = export_mifid_xml(_sample_reg_run(), _sample_hedge_actions(), [])
        assert xml.count("<transaction seq=") == 2
        assert "<instrumentType>FX_FORWARD</instrumentType>" in xml
        assert "<instrumentId>FX-MXN-USD</instrumentId>" in xml

    def test_buy_sell_indicator(self) -> None:
        xml = export_mifid_xml(_sample_reg_run(), _sample_hedge_actions(), [])
        assert "<buySellIndicator>BUY</buySellIndicator>" in xml
        assert "<buySellIndicator>SELL</buySellIndicator>" in xml

    def test_quantity_absolute(self) -> None:
        xml = export_mifid_xml(_sample_reg_run(), _sample_hedge_actions(), [])
        assert "<quantity>5000000" in xml
        assert "<quantity>2000000" in xml

    def test_waiver_hedging(self) -> None:
        xml = export_mifid_xml(_sample_reg_run(), _sample_hedge_actions(), [])
        assert "<waiver>HEDGING_EXEMPTION</waiver>" in xml

    def test_exposure_summary(self) -> None:
        xml = export_mifid_xml(_sample_reg_run(), _sample_hedge_actions(), _sample_positions())
        assert "<positionCount>2</positionCount>" in xml
        assert "<hedgeActionCount>2</hedgeActionCount>" in xml
        assert "<totalExposure>7700000" in xml
        assert "<coverageRatio>" in xml

    def test_compliance_flags(self) -> None:
        xml = export_mifid_xml(_sample_reg_run(), [], [])
        assert "<hedgingTransaction>true</hedgingTransaction>" in xml
        assert "<algorithmicTrading>false</algorithmicTrading>" in xml

    def test_empty_actions(self) -> None:
        xml = export_mifid_xml(_sample_reg_run(), [], [])
        parseable = xml.replace("mifid:", "").replace("xmlns:mifid=", "xmlns=")
        ET.fromstring(parseable)
        assert "<hedgeActionCount>0</hedgeActionCount>" in xml

    def test_missing_keys_default(self) -> None:
        xml = export_mifid_xml({}, [], [])
        assert "NOT_PROVIDED" in xml
        parseable = xml.replace("mifid:", "").replace("xmlns:mifid=", "xmlns=")
        ET.fromstring(parseable)


# ---------------------------------------------------------------------------
# Dodd-Frank Title VII tests
# ---------------------------------------------------------------------------

class TestExportDoddFrank:
    def test_structure(self) -> None:
        """Output has HEADER, SWAP(s), EXPOSURE(s), TRAILER."""
        text = export_dodd_frank(
            _sample_reg_run(), _sample_hedge_actions(), _sample_positions(), []
        )
        lines = text.strip().split("\n")
        assert lines[0].startswith("HEADER")
        assert lines[-1].startswith("TRAILER")
        swaps = [l for l in lines if l.startswith("SWAP")]
        exposures = [l for l in lines if l.startswith("EXPOSURE")]
        assert len(swaps) == 2
        assert len(exposures) == 2

    def test_header_fields(self) -> None:
        text = export_dodd_frank(
            _sample_reg_run(), _sample_hedge_actions(), [], []
        )
        header = text.split("\n")[0]
        assert "USI-run-reg-001" in header
        assert "ASSET_CLASS=FX" in header
        assert "DODD_FRANK_TITLE_VII" in header
        assert "CFTC_PART=45" in header

    def test_header_chain_length(self) -> None:
        chain = ["hash1", "hash2", "hash3"]
        text = export_dodd_frank(_sample_reg_run(), [], [], chain)
        header = text.split("\n")[0]
        assert "CHAIN_LENGTH=3" in header

    def test_swap_sequential_numbering(self) -> None:
        text = export_dodd_frank(
            _sample_reg_run(), _sample_hedge_actions(), [], []
        )
        lines = text.split("\n")
        swaps = [l for l in lines if l.startswith("SWAP")]
        assert "|000001|" in swaps[0]
        assert "|000002|" in swaps[1]

    def test_swap_contains_hedge_data(self) -> None:
        text = export_dodd_frank(
            _sample_reg_run(), _sample_hedge_actions(), [], []
        )
        lines = text.split("\n")
        swaps = [l for l in lines if l.startswith("SWAP")]
        assert "MXN" in swaps[0]
        assert "FX_FORWARD" in swaps[0]
        assert "NOTIONAL=5000000.00" in swaps[0]
        assert "DIRECTION=BUY" in swaps[0]

    def test_swap_direction_sell(self) -> None:
        text = export_dodd_frank(
            _sample_reg_run(), _sample_hedge_actions(), [], []
        )
        lines = text.split("\n")
        swaps = [l for l in lines if l.startswith("SWAP")]
        assert "DIRECTION=SELL" in swaps[1]

    def test_swap_hash_is_sha256(self) -> None:
        text = export_dodd_frank(
            _sample_reg_run(), _sample_hedge_actions(), [], []
        )
        lines = text.split("\n")
        swaps = [l for l in lines if l.startswith("SWAP")]
        for rec in swaps:
            match = re.search(r"HASH=([0-9a-f]{64})", rec)
            assert match is not None

    def test_swap_hash_chain_continuity(self) -> None:
        text = export_dodd_frank(
            _sample_reg_run(), _sample_hedge_actions(), [], []
        )
        lines = text.split("\n")
        swaps = [l for l in lines if l.startswith("SWAP")]

        prev_hashes = []
        record_hashes = []
        for rec in swaps:
            prev_match = re.search(r"PREV_HASH=([0-9a-f]{64})", rec)
            hash_match = re.search(r"\|HASH=([0-9a-f]{64})", rec)
            assert prev_match and hash_match
            prev_hashes.append(prev_match.group(1))
            record_hashes.append(hash_match.group(1))

        assert prev_hashes[0] == "0" * 64
        assert prev_hashes[1] == record_hashes[0]

    def test_swap_hash_verifiable(self) -> None:
        text = export_dodd_frank(
            _sample_reg_run(), _sample_hedge_actions(), [], []
        )
        lines = text.split("\n")
        swaps = [l for l in lines if l.startswith("SWAP")]
        for rec in swaps:
            body, _, hash_part = rec.rpartition("|HASH=")
            expected = hashlib.sha256(body.encode("utf-8")).hexdigest()
            assert hash_part == expected

    def test_exposure_lines(self) -> None:
        text = export_dodd_frank(
            _sample_reg_run(), [], _sample_positions(), []
        )
        lines = text.split("\n")
        exposures = [l for l in lines if l.startswith("EXPOSURE")]
        assert len(exposures) == 2
        assert "REC-001" in exposures[0]
        assert "FLOW_TYPE=PAYABLE" in exposures[0]
        assert "ENTITY=Acme Mexico SA" in exposures[0]

    def test_trailer_counts(self) -> None:
        text = export_dodd_frank(
            _sample_reg_run(), _sample_hedge_actions(), _sample_positions(), []
        )
        trailer = text.split("\n")[-1]
        assert "SWAP_COUNT=2" in trailer
        assert "EXPOSURE_COUNT=2" in trailer
        assert "TOTAL_NOTIONAL=7000000.00" in trailer

    def test_trailer_integrity_hash(self) -> None:
        text = export_dodd_frank(
            _sample_reg_run(), _sample_hedge_actions(), [], []
        )
        trailer = text.split("\n")[-1]
        match = re.search(r"INTEGRITY_HASH=([0-9a-f]{64})", trailer)
        assert match is not None

    def test_empty_all(self) -> None:
        text = export_dodd_frank(_sample_reg_run(), [], [], [])
        lines = text.split("\n")
        assert len(lines) == 2  # HEADER + TRAILER
        assert "SWAP_COUNT=0" in lines[-1]
        assert "EXPOSURE_COUNT=0" in lines[-1]

    def test_empty_integrity_hash(self) -> None:
        text = export_dodd_frank(_sample_reg_run(), [], [], [])
        trailer = text.split("\n")[-1]
        expected = hashlib.sha256(b"EMPTY").hexdigest()
        assert f"INTEGRITY_HASH={expected}" in trailer

    def test_existing_chain(self) -> None:
        chain = ["aaa", "bbb"]
        text = export_dodd_frank(
            _sample_reg_run(), _sample_hedge_actions(), [], chain
        )
        lines = text.split("\n")
        swaps = [l for l in lines if l.startswith("SWAP")]
        first_prev = re.search(r"PREV_HASH=(\S+?)(?:\|)", swaps[0])
        assert first_prev is not None
        assert first_prev.group(1) == "bbb"

    def test_missing_keys_default(self) -> None:
        text = export_dodd_frank({}, [], [], [])
        header = text.split("\n")[0]
        assert header.startswith("HEADER")
        assert "NOT_PROVIDED" in header


# ---------------------------------------------------------------------------
# IFRS 9 / ASC 815 XML tests
# ---------------------------------------------------------------------------

def _sample_eff_run_data() -> dict:
    return {
        "run_id": "eff-run-001",
        "standard": "IFRS_9",
        "hedge_type": "cash_flow",
        "currency_pair": "EUR/USD",
        "designation_date": "2026-01-01",
        "methodology_version": "1.0.0",
        "overall_effective": True,
        "dollar_offset_ratio": 0.978,
        "dollar_offset_effective": True,
        "regression_r_squared": 0.9923,
        "regression_slope": -0.995,
        "regression_effective": True,
        "run_hash": "abc123def456",
        "inputs_hash": "aaabbbccc111",
        "outputs_hash": "ddd222eee333",
        "dataset_name": "Q1 2026 EUR hedges",
        "generated_by": "audit_lab",
        "report_date": "2026-03-20",
    }


def _sample_eff_periods() -> list[dict]:
    return [
        {
            "period_index": 0,
            "period_date": "2026-01-31",
            "hedged_item_fv_change": -12500.0,
            "instrument_fv_change": 12250.0,
        },
        {
            "period_index": 1,
            "period_date": "2026-02-28",
            "hedged_item_fv_change": -8300.0,
            "instrument_fv_change": 8125.0,
        },
    ]


from app.services.regulatory_export import export_ifrs9_xml


def test_ifrs9_xml_round_trip() -> None:
    """export_ifrs9_xml with full run_data produces parseable XML with all key fields."""
    xml = export_ifrs9_xml(
        _sample_eff_run_data(),
        {},
        _sample_eff_periods(),
        standard="IFRS_9",
    )
    parseable = xml.replace("ordr:", "").replace("xmlns:ordr=", "xmlns=")
    root = ET.fromstring(parseable)
    assert root is not None
    assert "eff-run-001" in xml
    assert "<overallEffective>true</overallEffective>" in xml
    assert xml.count("<period seq=") == 2


def test_isda_export_via_public_api() -> None:
    """Confirm export_isda_xml produces a full ISDA-namespace XML document."""
    xml = export_isda_xml(_sample_run(), _sample_transactions())
    assert xml.startswith("<?xml")
    assert 'xmlns:isda=' in xml
    assert "<runId>run-001</runId>" in xml


class TestExportIfrs9Xml:
    def test_valid_xml(self) -> None:
        """Output must be well-formed XML."""
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, _sample_eff_periods())
        parseable = xml.replace("ordr:", "").replace("xmlns:ordr=", "xmlns=")
        ET.fromstring(parseable)

    def test_namespace_prefix(self) -> None:
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, _sample_eff_periods())
        assert 'xmlns:ordr="urn:ordr:hedge-effectiveness:2024"' in xml

    def test_header_fields(self) -> None:
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, _sample_eff_periods())
        assert "<runId>eff-run-001</runId>" in xml
        assert "<standard>IFRS_9</standard>" in xml
        assert "<hedgeType>cash_flow</hedgeType>" in xml
        assert "<currencyPair>EUR/USD</currencyPair>" in xml
        assert "<designationDate>2026-01-01</designationDate>" in xml
        assert "<methodologyVersion>1.0.0</methodologyVersion>" in xml
        assert "<generatedAt>" in xml

    def test_hedge_designation(self) -> None:
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, _sample_eff_periods())
        assert "<datasetName>Q1 2026 EUR hedges</datasetName>" in xml

    def test_effectiveness_results(self) -> None:
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, _sample_eff_periods())
        assert "<overallEffective>true</overallEffective>" in xml
        assert "<dollarOffsetRatio>0.978</dollarOffsetRatio>" in xml
        assert "<dollarOffsetEffective>true</dollarOffsetEffective>" in xml
        assert "<regressionRSquared>0.9923</regressionRSquared>" in xml
        assert "<regressionSlope>-0.995</regressionSlope>" in xml
        assert "<regressionEffective>true</regressionEffective>" in xml

    def test_periods_present(self) -> None:
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, _sample_eff_periods())
        assert xml.count("<period seq=") == 2
        assert "<periodDate>2026-01-31</periodDate>" in xml
        assert "<hedgedItemFvChange>-12500.0</hedgedItemFvChange>" in xml
        assert "<instrumentFvChange>12250.0</instrumentFvChange>" in xml

    def test_empty_periods(self) -> None:
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, [])
        parseable = xml.replace("ordr:", "").replace("xmlns:ordr=", "xmlns=")
        ET.fromstring(parseable)
        assert "<periods>" in xml
        assert "<period seq=" not in xml

    def test_audit_trace(self) -> None:
        xml = export_ifrs9_xml(_sample_eff_run_data(), {}, [])
        assert "<runHash>abc123def456</runHash>" in xml
        assert "<inputsHash>aaabbbccc111</inputsHash>" in xml
        assert "<outputsHash>ddd222eee333</outputsHash>" in xml

    def test_missing_keys_default(self) -> None:
        xml = export_ifrs9_xml({}, {}, [])
        parseable = xml.replace("ordr:", "").replace("xmlns:ordr=", "xmlns=")
        ET.fromstring(parseable)
        assert "<runId></runId>" in xml

    def test_xml_escaping(self) -> None:
        run = _sample_eff_run_data()
        run["dataset_name"] = "Hedge & <Special>"
        xml = export_ifrs9_xml(run, {}, [])
        assert "Hedge &amp; &lt;Special&gt;" in xml

    def test_asc815_standard(self) -> None:
        """standard kwarg is honoured — affects header only."""
        xml = export_ifrs9_xml(
            _sample_eff_run_data(), {}, [], standard="ASC_815"
        )
        assert "<standard>ASC_815</standard>" in xml
