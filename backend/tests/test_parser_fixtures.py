"""
Tests for audit lab parsers against real fixture files.

These tests validate that parsers handle real-world file formats correctly.
Fixtures in tests/fixtures/audit_lab/ represent realistic transaction data.
"""
from __future__ import annotations

from pathlib import Path

import pytest

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "audit_lab"


def _read_fixture(name: str) -> bytes:
    path = FIXTURE_DIR / name
    if not path.exists():
        pytest.skip(f"Fixture {name} not found at {path}")
    return path.read_bytes()


def _read_fixture_text(name: str) -> str:
    path = FIXTURE_DIR / name
    if not path.exists():
        pytest.skip(f"Fixture {name} not found at {path}")
    return path.read_text(encoding="utf-8")


# ═══════════════════════════════════════════════════════════════════════════════
# CSV — standard headers
# ═══════════════════════════════════════════════════════════════════════════════

class TestCsvFixtures:
    """Tests for parse_csv against sample_transactions.csv."""

    def test_parse_standard_csv(self):
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_transactions.csv")
        rows, warnings, pairs = parse_csv(raw)
        assert len(rows) == 5
        assert "MXNUSD" in pairs
        assert "EURUSD" in pairs
        assert "USDMXN" in pairs
        assert "GBPUSD" in pairs

    def test_csv_amounts_with_commas(self):
        """Row 2 has quoted '1,200,000.00' which must parse to 1200000.0."""
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_transactions.csv")
        rows, _, _ = parse_csv(raw)
        row_1200k = [r for r in rows if r.get("amount_sold") == 1200000.0]
        assert len(row_1200k) == 1
        assert row_1200k[0]["amount_bought"] == pytest.approx(66240.0)

    def test_csv_missing_fee_handled(self):
        """Row 3 (EUR/USD) has an empty fee field."""
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_transactions.csv")
        rows, _, _ = parse_csv(raw)
        eur_rows = [r for r in rows if r.get("currency_sold") == "EUR"]
        assert len(eur_rows) == 1
        assert eur_rows[0]["fee_amount"] is None

    def test_csv_effective_rate_computed(self):
        """Row 1: effective_rate = 27600 / 500000 = 0.0552."""
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_transactions.csv")
        rows, _, _ = parse_csv(raw)
        assert rows[0]["effective_rate"] == pytest.approx(0.0552, abs=0.001)

    def test_csv_all_rows_have_required_keys(self):
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_transactions.csv")
        rows, _, _ = parse_csv(raw)
        required = {
            "trade_date", "currency_sold", "currency_bought",
            "amount_sold", "amount_bought",
        }
        for row in rows:
            assert required.issubset(row.keys()), (
                f"Missing keys in row {row.get('row_index')}: "
                f"{required - row.keys()}"
            )

    def test_csv_no_warnings_on_clean_file(self):
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_transactions.csv")
        _, warnings, _ = parse_csv(raw)
        assert warnings == []

    def test_csv_row_index_sequential(self):
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_transactions.csv")
        rows, _, _ = parse_csv(raw)
        for i, row in enumerate(rows):
            assert row["row_index"] == i

    def test_csv_trade_date_is_string(self):
        """Parser stores trade_date as raw string, not date object."""
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_transactions.csv")
        rows, _, _ = parse_csv(raw)
        assert rows[0]["trade_date"] == "2025-01-15"
        assert isinstance(rows[0]["trade_date"], str)

    def test_csv_counterparties_preserved(self):
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_transactions.csv")
        rows, _, _ = parse_csv(raw)
        cps = [r["counterparty"] for r in rows]
        assert "Citi" in cps
        assert "HSBC" in cps
        assert "JPMorgan" in cps
        assert "BankOfAmerica" in cps
        assert "Barclays" in cps

    def test_csv_references_preserved(self):
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_transactions.csv")
        rows, _, _ = parse_csv(raw)
        refs = [r["reference"] for r in rows]
        assert refs == [
            "FX-2025-0001", "FX-2025-0002", "FX-2025-0003",
            "FX-2025-0004", "FX-2025-0005",
        ]

    def test_csv_value_date_null_when_absent(self):
        """The transactions fixture has no value_date column."""
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_transactions.csv")
        rows, _, _ = parse_csv(raw)
        for row in rows:
            assert row["value_date"] is None

    def test_csv_fee_currency_present(self):
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_transactions.csv")
        rows, _, _ = parse_csv(raw)
        # Row 5 (GBP/USD) has fee_currency=GBP
        gbp_row = [r for r in rows if r["currency_sold"] == "GBP"][0]
        assert gbp_row["fee_currency"] == "GBP"


# ═══════════════════════════════════════════════════════════════════════════════
# CSV — alias headers
# ═══════════════════════════════════════════════════════════════════════════════

class TestCsvAliasFixtures:
    """Tests for parse_csv with non-standard (aliased) column headers."""

    def test_alias_headers_normalize(self):
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_aliases.csv")
        rows, warnings, pairs = parse_csv(raw)
        assert len(rows) == 2
        assert rows[0]["currency_sold"] == "MXN"
        assert rows[0]["counterparty"] == "Citi"

    def test_alias_pairs_detected(self):
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_aliases.csv")
        _, _, pairs = parse_csv(raw)
        assert "MXNUSD" in pairs
        assert "EURUSD" in pairs

    def test_alias_amounts_parsed(self):
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_aliases.csv")
        rows, _, _ = parse_csv(raw)
        assert rows[0]["amount_sold"] == pytest.approx(500000.0)
        assert rows[0]["amount_bought"] == pytest.approx(27600.0)

    def test_alias_missing_fee_is_none(self):
        """Second alias row has an empty fee field."""
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_aliases.csv")
        rows, _, _ = parse_csv(raw)
        assert rows[1]["fee_amount"] is None

    def test_alias_reference_mapped(self):
        from app.services.audit_lab_parsers import parse_csv

        raw = _read_fixture("sample_aliases.csv")
        rows, _, _ = parse_csv(raw)
        assert rows[0]["reference"] == "FX-A001"
        assert rows[1]["reference"] == "FX-A002"


# ═══════════════════════════════════════════════════════════════════════════════
# SWIFT MT300
# ═══════════════════════════════════════════════════════════════════════════════

class TestSwiftFixtures:
    """Tests for parse_swift_mt against sample_mt300.txt."""

    def test_parse_mt300_messages(self):
        from app.services.audit_lab_parsers import parse_swift_mt

        text = _read_fixture_text("sample_mt300.txt")
        rows, warnings, pairs = parse_swift_mt(text)
        assert len(rows) == 2
        assert warnings == []

    def test_mt300_first_trade(self):
        from app.services.audit_lab_parsers import parse_swift_mt

        text = _read_fixture_text("sample_mt300.txt")
        rows, _, _ = parse_swift_mt(text)
        r = rows[0]
        # Parser stores dates as ISO strings, not date objects
        assert r["trade_date"] == "2025-01-15"
        assert r["value_date"] == "2025-01-17"
        assert r["currency_sold"] == "MXN"
        assert r["amount_sold"] == pytest.approx(500000.0)
        assert r["currency_bought"] == "USD"
        assert r["amount_bought"] == pytest.approx(27624.31)
        assert r["reference"] == "FX-MT300-001"

    def test_mt300_first_trade_no_fee(self):
        """First SWIFT message has no tag 34B, so fee must be None."""
        from app.services.audit_lab_parsers import parse_swift_mt

        text = _read_fixture_text("sample_mt300.txt")
        rows, _, _ = parse_swift_mt(text)
        assert rows[0]["fee_amount"] is None
        assert rows[0]["fee_currency"] is None

    def test_mt300_second_trade_with_fee(self):
        """Second SWIFT message has tag 34B:USD200,00."""
        from app.services.audit_lab_parsers import parse_swift_mt

        text = _read_fixture_text("sample_mt300.txt")
        rows, _, _ = parse_swift_mt(text)
        r = rows[1]
        assert r["fee_amount"] == pytest.approx(200.0)
        assert r["fee_currency"] == "USD"

    def test_mt300_exchange_rate_override(self):
        """Tag 36 overrides the computed effective_rate."""
        from app.services.audit_lab_parsers import parse_swift_mt

        text = _read_fixture_text("sample_mt300.txt")
        rows, _, _ = parse_swift_mt(text)
        # Message 1: tag 36 = 18,0500 -> 18.05
        assert rows[0]["effective_rate"] == pytest.approx(18.05)
        # Message 2: tag 36 = 0,9250 -> 0.925
        assert rows[1]["effective_rate"] == pytest.approx(0.925)

    def test_mt300_counterparty_from_82a(self):
        """Counterparty is taken from tag 82A (party A BIC)."""
        from app.services.audit_lab_parsers import parse_swift_mt

        text = _read_fixture_text("sample_mt300.txt")
        rows, _, _ = parse_swift_mt(text)
        assert rows[0]["counterparty"] == "CITIUS33"
        assert rows[1]["counterparty"] == "HSBCGB2L"

    def test_mt300_confidence_high(self):
        from app.services.audit_lab_parsers import parse_swift_mt, row_confidence

        text = _read_fixture_text("sample_mt300.txt")
        rows, _, _ = parse_swift_mt(text)
        for r in rows:
            conf = row_confidence(r)
            assert conf >= 0.9, f"Expected confidence >= 0.9, got {conf}"

    def test_mt300_confidence_exact(self):
        """SWIFT parser sets confidence to exactly 0.95."""
        from app.services.audit_lab_parsers import parse_swift_mt, row_confidence

        text = _read_fixture_text("sample_mt300.txt")
        rows, _, _ = parse_swift_mt(text)
        for r in rows:
            assert row_confidence(r) == pytest.approx(0.95)

    def test_mt300_pairs_detected(self):
        from app.services.audit_lab_parsers import parse_swift_mt

        text = _read_fixture_text("sample_mt300.txt")
        _, _, pairs = parse_swift_mt(text)
        assert "MXNUSD" in pairs
        assert "EURUSD" in pairs

    def test_mt300_row_indices(self):
        from app.services.audit_lab_parsers import parse_swift_mt

        text = _read_fixture_text("sample_mt300.txt")
        rows, _, _ = parse_swift_mt(text)
        assert rows[0]["row_index"] == 0
        assert rows[1]["row_index"] == 1


# ═══════════════════════════════════════════════════════════════════════════════
# File type detection
# ═══════════════════════════════════════════════════════════════════════════════

class TestFileTypeDetection:
    """Tests for detect_file_type against fixture files."""

    def test_detect_csv_by_extension(self):
        from app.services.audit_lab_parsers import detect_file_type

        raw = _read_fixture("sample_transactions.csv")
        assert detect_file_type("sample_transactions.csv", raw) == "csv"

    def test_detect_swift_by_content(self):
        """A .txt file with SWIFT content should be detected via heuristic."""
        from app.services.audit_lab_parsers import detect_file_type

        raw = _read_fixture("sample_mt300.txt")
        assert detect_file_type("sample_mt300.txt", raw) == "swift"

    def test_detect_swift_by_mt300_extension(self):
        from app.services.audit_lab_parsers import detect_file_type

        raw = _read_fixture("sample_mt300.txt")
        assert detect_file_type("sample.mt300", raw) == "swift"

    def test_detect_swift_by_fin_extension(self):
        from app.services.audit_lab_parsers import detect_file_type

        raw = _read_fixture("sample_mt300.txt")
        assert detect_file_type("trades.fin", raw) == "swift"


# ═══════════════════════════════════════════════════════════════════════════════
# Cross-parser consistency
# ═══════════════════════════════════════════════════════════════════════════════

class TestCrossParserConsistency:
    """Verify CSV and SWIFT parsers produce rows with a consistent schema."""

    def test_csv_and_swift_row_keys_match(self):
        from app.services.audit_lab_parsers import parse_csv, parse_swift_mt

        csv_rows, _, _ = parse_csv(_read_fixture("sample_transactions.csv"))
        swift_rows, _, _ = parse_swift_mt(
            _read_fixture_text("sample_mt300.txt"),
        )
        csv_keys = set(csv_rows[0].keys())
        swift_keys = set(swift_rows[0].keys())
        required = {
            "trade_date", "currency_sold", "currency_bought",
            "amount_sold", "amount_bought", "effective_rate",
            "counterparty", "reference",
        }
        assert required.issubset(csv_keys), (
            f"CSV missing: {required - csv_keys}"
        )
        assert required.issubset(swift_keys), (
            f"SWIFT missing: {required - swift_keys}"
        )

    def test_csv_and_swift_full_key_parity(self):
        """Both parsers should produce identical key sets."""
        from app.services.audit_lab_parsers import parse_csv, parse_swift_mt

        csv_rows, _, _ = parse_csv(_read_fixture("sample_transactions.csv"))
        swift_rows, _, _ = parse_swift_mt(
            _read_fixture_text("sample_mt300.txt"),
        )
        assert set(csv_rows[0].keys()) == set(swift_rows[0].keys())

    def test_row_hash_deterministic(self):
        """row_hash must be deterministic across calls."""
        from app.services.audit_lab_parsers import parse_csv, row_hash

        raw = _read_fixture("sample_transactions.csv")
        rows_a, _, _ = parse_csv(raw)
        rows_b, _, _ = parse_csv(raw)
        for a, b in zip(rows_a, rows_b):
            assert row_hash(a) == row_hash(b)

    def test_csv_confidence_is_one(self):
        """CSV rows with no parse warnings should have confidence 1.0."""
        from app.services.audit_lab_parsers import parse_csv, row_confidence

        raw = _read_fixture("sample_transactions.csv")
        rows, _, _ = parse_csv(raw)
        for r in rows:
            assert row_confidence(r) == 1.0
