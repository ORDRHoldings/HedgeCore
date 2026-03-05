"""
backend/tests/test_audit_lab_api.py

API-level tests for Audit Lab endpoints.
Uses the engine directly (no HTTP server needed) to validate parser + engine integration.
"""
from __future__ import annotations

import hashlib
import io
from datetime import UTC, date, datetime

import pytest

from app.engine.audit_engine import (
    AuditTransactionInput,
    BenchmarkConfig,
    BenchmarkEntry,
    run_audit_engine,
)
from app.api.routes.v1_audit_lab import (
    _parse_csv,
    _parse_date,
    _parse_float,
    _normalize_headers,
    _row_hash,
    _FIELD_ALIASES,
)


# ── Fixtures ────────────────────────────────────────────────────────────────────

SAMPLE_CSV = b"""trade_date,value_date,currency_sold,currency_bought,amount_sold,amount_bought,counterparty,fee_amount,fee_currency,reference
2025-01-15,2025-01-17,MXN,USD,500000,27600,Santander,200,USD,REF001
2025-01-20,2025-01-22,MXN,USD,750000,41250,BBVA,300,USD,REF002
2025-02-05,2025-02-07,MXN,USD,1000000,54800,Santander,400,USD,REF003
"""

EMPTY_CSV = b"""trade_date,currency_sold,currency_bought,amount_sold,amount_bought
"""

ALIAS_CSV = b"""tradedate,sold_ccy,buy_ccy,sell_amount,buy_amount,bank
2025-03-01,MXN,USD,800000,43600,Santander
"""


def _make_benchmark(
    as_of: date = date(2025, 1, 15),
    currency_pair: str = "MXNUSD",
    mid_rate: float = 0.0556,
) -> BenchmarkEntry:
    return BenchmarkEntry(
        snapshot_id="snap-test",
        snapshot_hash="a" * 64,
        as_of=as_of,
        currency_pair=currency_pair,
        mid_rate=mid_rate,
        provider="test",
        fetched_at=datetime.now(UTC),
    )


def _make_txn_input(
    i: int = 0,
    amount_sold: float = 500_000.0,
    amount_bought: float = 27_000.0,
    fee_amount: float | None = 200.0,
) -> AuditTransactionInput:
    rate = amount_bought / amount_sold if amount_sold else None
    return AuditTransactionInput(
        row_id=f"row-{i}",
        row_hash=f"hash-{i:064d}",
        row_index=i,
        trade_date=date(2025, 1, 15),
        value_date=None,
        currency_sold="MXN",
        currency_bought="USD",
        amount_sold=amount_sold,
        amount_bought=amount_bought,
        effective_rate=rate,
        counterparty="Santander",
        fee_amount=fee_amount,
        fee_currency="USD",
        reference=f"REF-{i:04d}",
    )


# ── Test: CSV parser ─────────────────────────────────────────────────────────────

class TestCsvParser:
    def test_parse_standard_headers(self):
        rows, warnings, pairs = _parse_csv(SAMPLE_CSV)
        assert len(rows) == 3
        assert rows[0]["currency_sold"] == "MXN"
        assert rows[0]["currency_bought"] == "USD"
        assert rows[0]["amount_sold"] == 500_000.0
        assert rows[0]["counterparty"] == "Santander"
        assert rows[0]["fee_amount"] == 200.0

    def test_parse_alias_headers(self):
        rows, warnings, pairs = _parse_csv(ALIAS_CSV)
        assert len(rows) == 1
        assert rows[0]["currency_sold"] == "MXN"
        assert rows[0]["currency_bought"] == "USD"
        assert rows[0]["amount_sold"] == 800_000.0
        assert rows[0]["counterparty"] == "Santander"

    def test_currency_pairs_detected(self):
        rows, warnings, pairs = _parse_csv(SAMPLE_CSV)
        assert "MXNUSD" in pairs

    def test_effective_rate_computed(self):
        rows, warnings, pairs = _parse_csv(SAMPLE_CSV)
        r = rows[0]
        # 27600 / 500000 = 0.0552
        assert abs(r["effective_rate"] - 0.0552) < 1e-6

    def test_empty_csv_returns_zero_rows(self):
        rows, warnings, pairs = _parse_csv(EMPTY_CSV)
        assert len(rows) == 0

    def test_row_hash_is_deterministic(self):
        rows, _, _ = _parse_csv(SAMPLE_CSV)
        h1 = _row_hash(rows[0])
        h2 = _row_hash(rows[0])
        assert h1 == h2
        assert len(h1) == 64

    def test_row_hash_differs_for_different_rows(self):
        rows, _, _ = _parse_csv(SAMPLE_CSV)
        assert _row_hash(rows[0]) != _row_hash(rows[1])


# ── Test: header normalization ────────────────────────────────────────────────

class TestHeaderNormalization:
    def test_canonical_headers_unchanged(self):
        headers = ["trade_date", "currency_sold", "currency_bought", "amount_sold"]
        mapping = _normalize_headers(headers)
        assert mapping["trade_date"] == "trade_date"
        assert mapping["currency_sold"] == "currency_sold"

    def test_alias_tradedate(self):
        headers = ["tradedate", "sold_ccy", "buy_ccy", "sell_amount", "buy_amount"]
        mapping = _normalize_headers(headers)
        assert "trade_date" in mapping
        assert "currency_sold" in mapping
        assert "currency_bought" in mapping


# ── Test: date and float parsers ──────────────────────────────────────────────

class TestParsers:
    def test_parse_date_iso(self):
        d = _parse_date("2025-01-15")
        assert d == date(2025, 1, 15)

    def test_parse_date_slash(self):
        d = _parse_date("15/01/2025")
        assert d == date(2025, 1, 15)

    def test_parse_date_none(self):
        assert _parse_date("") is None
        assert _parse_date(None) is None

    def test_parse_float_basic(self):
        assert _parse_float("500000") == 500_000.0

    def test_parse_float_with_comma(self):
        assert _parse_float("500,000.00") == 500_000.0

    def test_parse_float_none(self):
        assert _parse_float("") is None
        assert _parse_float(None) is None


# ── Test: engine integration via API layer inputs ─────────────────────────────

class TestEngineApiIntegration:
    def test_upload_then_run_produces_findings(self):
        """Simulate the upload → run flow by calling the engine directly."""
        rows, _, _ = _parse_csv(SAMPLE_CSV)
        transactions = []
        for row in rows:
            transactions.append(AuditTransactionInput(
                row_id=f"row-{row['row_index']}",
                row_hash=_row_hash(row),
                row_index=row["row_index"],
                trade_date=_parse_date(row["trade_date"]),
                value_date=_parse_date(row["value_date"]),
                currency_sold=row["currency_sold"],
                currency_bought=row["currency_bought"],
                amount_sold=row["amount_sold"],
                amount_bought=row["amount_bought"],
                effective_rate=row["effective_rate"],
                counterparty=row["counterparty"],
                fee_amount=row["fee_amount"],
                fee_currency=row["fee_currency"],
                reference=row["reference"],
            ))

        benchmarks = [_make_benchmark(date(2025, 1, 15), "MXNUSD", 0.0556)]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")
        result = run_audit_engine(
            "ds-001", transactions, benchmarks, cfg,
            date(2025, 1, 1), date(2025, 2, 28)
        )

        # 3 rows of MXN→USD with mid_rate MXNUSD=0.0556, effective_rate ≈ 0.0552
        assert len(result.markup_findings) == 3
        assert result.total_markup_usd > 0
        assert len(result.fee_findings) == 3
        assert result.total_fees_usd > 0

    def test_missing_benchmark_fails_closed(self):
        txns = [_make_txn_input(0)]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")
        result = run_audit_engine(
            "ds-002", txns, [], cfg,
            date(2025, 1, 1), date(2025, 1, 31)
        )
        assert len(result.markup_findings) == 0
        assert len(result.markup_rejections) == 1
        assert result.markup_rejections[0].code == "AL-BENCHMARK_UNAVAILABLE"
        assert result.total_markup_usd == 0.0

    def test_duplicate_source_hash_detection(self):
        """Same content → same SHA-256 → must produce identical hash."""
        h1 = hashlib.sha256(SAMPLE_CSV).hexdigest()
        h2 = hashlib.sha256(SAMPLE_CSV).hexdigest()
        assert h1 == h2

    def test_different_content_different_hash(self):
        other_csv = b"trade_date,currency_sold\n2025-01-01,EUR\n"
        h1 = hashlib.sha256(SAMPLE_CSV).hexdigest()
        h2 = hashlib.sha256(other_csv).hexdigest()
        assert h1 != h2

    def test_run_hash_is_sha256_hex(self):
        txns = [_make_txn_input(i) for i in range(3)]
        bms = [_make_benchmark()]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")
        result = run_audit_engine(
            "ds-003", txns, bms, cfg,
            date(2025, 1, 1), date(2025, 1, 31)
        )
        assert len(result.run_hash) == 64
        assert all(c in "0123456789abcdef" for c in result.run_hash)

    def test_tenant_isolation_hash_includes_dataset_id(self):
        """Different dataset_ids produce different run hashes."""
        txns = [_make_txn_input(0)]
        bms = [_make_benchmark()]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot")

        r_a = run_audit_engine("ds-A", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))
        r_b = run_audit_engine("ds-B", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert r_a.run_hash != r_b.run_hash
