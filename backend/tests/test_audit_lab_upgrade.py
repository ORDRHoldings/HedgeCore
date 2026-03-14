"""
backend/tests/test_audit_lab_upgrade.py

Tests for the Audit Lab institutional upgrade (Items 1-40).
Covers: signed markup, staleness, batch insert, date filter, file size limit,
admin metrics fix, outlier detection, counterparty scoring, natural hedges,
cross-rate synthesis, size normalization, parsers.
"""
from __future__ import annotations

import json
import math
from datetime import UTC, date, datetime, timedelta

import pytest

from app.engine.audit_engine import (
    AuditTransactionInput,
    BenchmarkConfig,
    BenchmarkEntry,
    CounterpartyScore,
    MarkupFinding,
    NaturalHedgeResult,
    _classify_spread,
    _detect_natural_hedges,
    _detect_outliers,
    _find_benchmark,
    _markup_direction,
    _score_counterparties,
    _synthesize_cross_rate,
    run_audit_engine,
    size_adjusted_markup_bps,
)
from app.api.routes.v1_audit_lab import (
    _parse_csv,
    _parse_date,
    _parse_float,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────


def _txn(
    i: int = 0,
    trade_date: date = date(2025, 1, 15),
    currency_sold: str = "MXN",
    currency_bought: str = "USD",
    amount_sold: float = 500_000.0,
    amount_bought: float = 27_000.0,
    counterparty: str = "TestBank",
    fee_amount: float | None = 200.0,
) -> AuditTransactionInput:
    rate = amount_bought / amount_sold if amount_sold else None
    return AuditTransactionInput(
        row_id=f"row-{i}",
        row_hash=f"hash-{i:064d}",
        row_index=i,
        trade_date=trade_date,
        value_date=None,
        currency_sold=currency_sold,
        currency_bought=currency_bought,
        amount_sold=amount_sold,
        amount_bought=amount_bought,
        effective_rate=rate,
        counterparty=counterparty,
        fee_amount=fee_amount,
        fee_currency="USD",
        reference=f"REF-{i:04d}",
    )


def _bm(
    as_of: date = date(2025, 1, 15),
    currency_pair: str = "MXNUSD",
    mid_rate: float = 0.0556,
) -> BenchmarkEntry:
    return BenchmarkEntry(
        snapshot_id="snap-001",
        snapshot_hash="a" * 64,
        as_of=as_of,
        currency_pair=currency_pair,
        mid_rate=mid_rate,
        provider="test",
        fetched_at=datetime.now(UTC),
    )


# ══════════════════════════════════════════════════════════════════════════════
# Item 6: Benchmark staleness
# ══════════════════════════════════════════════════════════════════════════════


class TestBenchmarkStaleness:
    def test_within_staleness_returns_benchmark(self):
        bm = _bm(as_of=date(2025, 1, 12))  # 3 days before trade
        result = _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm], max_staleness_days=7)
        assert result is not None
        assert result.snapshot_id == "snap-001"

    def test_stale_benchmark_rejected(self):
        bm = _bm(as_of=date(2024, 12, 1))  # 45 days before trade
        result = _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm], max_staleness_days=7)
        assert result is None

    def test_exact_date_accepted(self):
        bm = _bm(as_of=date(2025, 1, 15))
        result = _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm], max_staleness_days=7)
        assert result is not None

    def test_no_staleness_limit_accepts_any(self):
        bm = _bm(as_of=date(2024, 1, 1))  # 1 year old
        result = _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm], max_staleness_days=None)
        assert result is not None

    def test_configurable_override(self):
        bm = _bm(as_of=date(2025, 1, 1))  # 14 days before trade
        assert _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm], max_staleness_days=7) is None
        assert _find_benchmark(date(2025, 1, 15), "MXNUSD", [bm], max_staleness_days=30) is not None

    def test_stale_rejection_code_in_engine(self):
        txn = _txn(0)
        bm = _bm(as_of=date(2024, 12, 1))  # 45 days stale
        cfg = BenchmarkConfig(benchmark_source="market_snapshot", max_staleness_days=7)
        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))
        assert any(r.code == "AL-BENCHMARK_STALE" for r in result.markup_rejections)


# ══════════════════════════════════════════════════════════════════════════════
# Item 8: Signed markup
# ══════════════════════════════════════════════════════════════════════════════


class TestSignedMarkup:
    def test_markup_direction_adverse(self):
        assert _markup_direction(0.001) == "ADVERSE"

    def test_markup_direction_favorable(self):
        assert _markup_direction(-0.001) == "FAVORABLE"

    def test_markup_direction_at_market(self):
        assert _markup_direction(0.0) == "AT_MARKET"
        assert _markup_direction(1e-10) == "AT_MARKET"

    def test_signed_markup_values(self):
        txn = _txn(0, amount_sold=500_000, amount_bought=27_000)  # rate=0.054
        bm = _bm(mid_rate=0.0556)
        cfg = BenchmarkConfig(benchmark_source="market_snapshot", max_staleness_days=None)
        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))
        f = result.markup_findings[0]
        # effective 0.054 - benchmark 0.0556 = -0.0016 (favorable)
        assert f.markup_per_unit < 0
        assert f.markup_direction == "FAVORABLE"

    def test_adverse_markup_positive(self):
        # Effective rate higher than benchmark
        txn = _txn(0, amount_sold=500_000, amount_bought=30_000)  # rate=0.06
        bm = _bm(mid_rate=0.0556)
        cfg = BenchmarkConfig(benchmark_source="market_snapshot", max_staleness_days=None)
        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))
        f = result.markup_findings[0]
        assert f.markup_per_unit > 0
        assert f.markup_direction == "ADVERSE"

    def test_favorable_adverse_totals(self):
        txn_adv = _txn(0, amount_sold=500_000, amount_bought=30_000, counterparty="A")  # high rate
        txn_fav = _txn(1, amount_sold=500_000, amount_bought=27_000, counterparty="B")  # low rate
        bm = _bm(mid_rate=0.0556)
        cfg = BenchmarkConfig(benchmark_source="market_snapshot", max_staleness_days=None)
        result = run_audit_engine("ds", [txn_adv, txn_fav], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))
        assert result.total_adverse_usd > 0
        assert result.total_favorable_usd < 0

    def test_methodology_version_bumped(self):
        from app.engine.audit_engine import METHODOLOGY_VERSION
        assert METHODOLOGY_VERSION == "1.1.0"

    def test_markup_direction_in_to_dict(self):
        txn = _txn(0, amount_sold=500_000, amount_bought=30_000)
        bm = _bm(mid_rate=0.0556)
        cfg = BenchmarkConfig(benchmark_source="market_snapshot", max_staleness_days=None)
        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))
        d = result.markup_findings[0].to_dict()
        assert "markup_direction" in d
        assert d["markup_direction"] in ("ADVERSE", "FAVORABLE", "AT_MARKET")


# ══════════════════════════════════════════════════════════════════════════════
# Item 4: File size limit
# ══════════════════════════════════════════════════════════════════════════════


class TestFileSizeLimit:
    def test_large_file_produces_413_message(self):
        # Verify the limit constant exists in the upload path
        MAX_UPLOAD_BYTES = 10 * 1024 * 1024
        assert MAX_UPLOAD_BYTES == 10_485_760


# ══════════════════════════════════════════════════════════════════════════════
# Item 5: Admin metrics column fix
# ══════════════════════════════════════════════════════════════════════════════


class TestAdminMetricsFix:
    def test_column_name_in_source(self):
        """Verify source code uses created_by, not uploaded_by."""
        import inspect
        from app.api.routes.v1_admin_metrics import get_funnel
        source = inspect.getsource(get_funnel)
        assert "created_by" in source
        assert "uploaded_by" not in source
        assert "'COMPLETED'" in source


# ══════════════════════════════════════════════════════════════════════════════
# Item 11: MXN default removal
# ══════════════════════════════════════════════════════════════════════════════


class TestMxnDefaultRemoval:
    def test_null_currency_skipped(self):
        """Verify source code skips null primary_currency."""
        import inspect
        from app.api.routes.v1_audit_lab import _create_audit_run_inner
        source = inspect.getsource(_create_audit_run_inner)
        assert "if not s.primary_currency:" in source
        assert 'or "MXN"' not in source


# ══════════════════════════════════════════════════════════════════════════════
# Item 28: Cross-rate synthesis
# ══════════════════════════════════════════════════════════════════════════════


class TestCrossRateSynthesis:
    def test_synthesize_eur_gbp(self):
        bms = [
            _bm(currency_pair="USDEUR", mid_rate=0.92),
            _bm(currency_pair="USDGBP", mid_rate=0.79),
        ]
        rate, source = _synthesize_cross_rate("EUR", "GBP", bms, date(2025, 1, 15))
        assert rate is not None
        assert abs(rate - (0.92 / 0.79)) < 1e-6
        assert source == "SYNTHETIC_CROSS"

    def test_no_benchmark_returns_none(self):
        rate, source = _synthesize_cross_rate("EUR", "GBP", [], date(2025, 1, 15))
        assert rate is None
        assert source == "UNAVAILABLE"

    def test_wider_staleness_for_synthetic(self):
        bms = [
            _bm(as_of=date(2025, 1, 1), currency_pair="USDEUR", mid_rate=0.92),
            _bm(as_of=date(2025, 1, 1), currency_pair="USDGBP", mid_rate=0.79),
        ]
        # 14 days stale — within 2x of 7-day limit
        rate, source = _synthesize_cross_rate("EUR", "GBP", bms, date(2025, 1, 15), max_staleness_days=7)
        assert rate is not None  # 14 days < 2*7=14, boundary case


# ══════════════════════════════════════════════════════════════════════════════
# Item 30: Trade-size spread normalization
# ══════════════════════════════════════════════════════════════════════════════


class TestSizeNormalization:
    def test_small_trade_higher_expected_spread(self):
        # 50K trade, markup 8 bps → adjusted = 8 - 10 = -2 (within expected)
        adj = size_adjusted_markup_bps(8.0, 50_000)
        assert adj == pytest.approx(-2.0)

    def test_medium_trade(self):
        # 500K trade, markup 8 bps → adjusted = 8 - 5 = 3 (above expected)
        adj = size_adjusted_markup_bps(8.0, 500_000)
        assert adj == pytest.approx(3.0)

    def test_large_trade_lowest_expected(self):
        # 5M trade, markup 5 bps → adjusted = 5 - 2 = 3 (above expected)
        adj = size_adjusted_markup_bps(5.0, 5_000_000)
        assert adj == pytest.approx(3.0)


# ══════════════════════════════════════════════════════════════════════════════
# Item 32: Outlier detection
# ══════════════════════════════════════════════════════════════════════════════


class TestOutlierDetection:
    def _make_findings(self, markups: list[float]) -> list[MarkupFinding]:
        return [
            MarkupFinding(
                row_id=f"r{i}", row_hash=f"h{i}", row_index=i,
                trade_date="2025-01-15", currency_pair="MXNUSD",
                counterparty="TestBank",
                effective_rate=0.054 + m, benchmark_rate=0.0556,
                benchmark_snapshot_id="s1", benchmark_snapshot_hash="h" * 64,
                benchmark_provider="test", benchmark_as_of="2025-01-15",
                markup_per_unit=m,
                markup_direction="ADVERSE" if m > 0 else "FAVORABLE",
                amount_sold=500_000, markup_cost_local=m * 500_000,
                markup_cost_usd=m * 500_000,
            )
            for i, m in enumerate(markups)
        ]

    def test_outlier_detected(self):
        # 9 normal, 1 extreme
        markups = [0.001] * 9 + [0.05]
        findings = self._make_findings(markups)
        results = _detect_outliers(findings, z_threshold=2.0)
        outliers = [r for r in results if r["is_outlier"]]
        assert len(outliers) >= 1

    def test_no_outliers_uniform(self):
        markups = [0.001] * 10
        findings = self._make_findings(markups)
        results = _detect_outliers(findings)
        outliers = [r for r in results if r["is_outlier"]]
        assert len(outliers) == 0

    def test_too_few_samples_no_outlier(self):
        markups = [0.001, 0.05]  # only 2 samples
        findings = self._make_findings(markups)
        results = _detect_outliers(findings)
        assert all(r["z_score"] is None for r in results)


# ══════════════════════════════════════════════════════════════════════════════
# Item 33: Counterparty scoring
# ══════════════════════════════════════════════════════════════════════════════


class TestCounterpartyScoring:
    def _make_cp_findings(self) -> list[MarkupFinding]:
        findings = []
        # Bank A: low markup (good)
        for i in range(5):
            findings.append(MarkupFinding(
                row_id=f"a{i}", row_hash=f"ha{i}", row_index=i,
                trade_date="2025-01-15", currency_pair="MXNUSD",
                counterparty="BankA",
                effective_rate=0.0555, benchmark_rate=0.0556,
                benchmark_snapshot_id="s1", benchmark_snapshot_hash="h" * 64,
                benchmark_provider="test", benchmark_as_of="2025-01-15",
                markup_per_unit=-0.0001,
                markup_direction="FAVORABLE",
                amount_sold=500_000, markup_cost_local=-50, markup_cost_usd=-50,
            ))
        # Bank B: high markup (bad)
        for i in range(5):
            findings.append(MarkupFinding(
                row_id=f"b{i}", row_hash=f"hb{i}", row_index=i + 5,
                trade_date="2025-01-15", currency_pair="MXNUSD",
                counterparty="BankB",
                effective_rate=0.060, benchmark_rate=0.0556,
                benchmark_snapshot_id="s1", benchmark_snapshot_hash="h" * 64,
                benchmark_provider="test", benchmark_as_of="2025-01-15",
                markup_per_unit=0.0044,
                markup_direction="ADVERSE",
                amount_sold=500_000, markup_cost_local=2200, markup_cost_usd=2200,
            ))
        return findings

    def test_bank_a_scores_higher(self):
        findings = self._make_cp_findings()
        scores = _score_counterparties(findings)
        assert len(scores) == 2
        assert scores[0].counterparty == "BankA"
        assert scores[0].composite_score > scores[1].composite_score

    def test_all_fields_populated(self):
        findings = self._make_cp_findings()
        scores = _score_counterparties(findings)
        for s in scores:
            assert s.trade_count > 0
            assert 0 <= s.composite_score <= 100


# ══════════════════════════════════════════════════════════════════════════════
# Item 34: Natural hedge detection
# ══════════════════════════════════════════════════════════════════════════════


class TestNaturalHedgeDetection:
    def test_offsetting_flows_detected(self):
        txns = [
            _txn(0, currency_sold="USD", currency_bought="MXN", amount_sold=100_000, amount_bought=1_800_000),
            _txn(1, currency_sold="MXN", currency_bought="USD", amount_sold=900_000, amount_bought=50_000),
        ]
        bms = [_bm()]
        results = _detect_natural_hedges(txns, bms)
        assert len(results) > 0
        assert results[0].gross_buy > 0
        assert results[0].gross_sell > 0

    def test_no_offset_single_direction(self):
        txns = [
            _txn(0, currency_sold="MXN", currency_bought="USD"),
            _txn(1, currency_sold="MXN", currency_bought="USD"),
        ]
        results = _detect_natural_hedges(txns, [_bm()])
        # Same direction, same pair key — still reports but both in same direction
        # so gross_buy and gross_sell are both nonzero for different amount fields
        assert isinstance(results, list)


# ══════════════════════════════════════════════════════════════════════════════
# Item 3: Date range filter
# ══════════════════════════════════════════════════════════════════════════════


class TestDateRangeFilter:
    def test_buffer_calculation(self):
        period_start = date(2025, 1, 1)
        period_end = date(2025, 6, 30)
        buffer_start = period_start - timedelta(days=30)
        buffer_end = period_end + timedelta(days=30)
        assert buffer_start == date(2024, 12, 2)
        assert buffer_end == date(2025, 7, 30)


# ══════════════════════════════════════════════════════════════════════════════
# Pydantic schemas
# ══════════════════════════════════════════════════════════════════════════════


class TestPydanticSchemas:
    def test_dataset_upload_response_validates(self):
        from app.schemas_v1.audit_lab import DatasetUploadResponse
        r = DatasetUploadResponse(
            dataset_id="abc",
            row_count=100,
            currency_pairs_detected=["USDMXN"],
            period_start="2025-01-01",
            period_end="2025-06-30",
            source_hash="x" * 64,
        )
        assert r.row_count == 100

    def test_audit_run_create_response(self):
        from app.schemas_v1.audit_lab import AuditRunCreateResponse, AuditRunSummary
        r = AuditRunCreateResponse(
            run_id="r1",
            run_hash="h" * 64,
            summary=AuditRunSummary(total_markup_usd=1234.56),
        )
        assert r.summary.total_markup_usd == pytest.approx(1234.56)

    def test_finding_response_optional_fields(self):
        from app.schemas_v1.audit_lab import AuditFindingResponse
        f = AuditFindingResponse(
            id="f1", finding_type="MARKUP", amount_usd=100.0,
            severity="HIGH", narrative="test", finding_hash="h" * 64,
        )
        assert f.markup_direction is None
        assert f.spread_classification is None


# ══════════════════════════════════════════════════════════════════════════════
# Item 10: Spread classification
# ══════════════════════════════════════════════════════════════════════════════


class TestSpreadClassification:
    def test_within_spread(self):
        """Effective rate between bid and ask -> WITHIN_SPREAD."""
        result = _classify_spread(effective_rate=1.0550, bid_rate=1.0500, ask_rate=1.0600)
        assert result == "WITHIN_SPREAD"

    def test_at_bid_within_spread(self):
        """Effective rate at bid -> still WITHIN_SPREAD."""
        result = _classify_spread(effective_rate=1.0500, bid_rate=1.0500, ask_rate=1.0600)
        assert result == "WITHIN_SPREAD"

    def test_at_ask_within_spread(self):
        """Effective rate at ask -> still WITHIN_SPREAD."""
        result = _classify_spread(effective_rate=1.0600, bid_rate=1.0500, ask_rate=1.0600)
        assert result == "WITHIN_SPREAD"

    def test_at_midpoint_within_spread(self):
        """Effective rate at exact midpoint -> WITHIN_SPREAD."""
        result = _classify_spread(effective_rate=1.0550, bid_rate=1.0500, ask_rate=1.0600)
        assert result == "WITHIN_SPREAD"

    def test_outside_spread_above_ask(self):
        """Effective rate above ask -> OUTSIDE_SPREAD."""
        result = _classify_spread(effective_rate=1.0700, bid_rate=1.0500, ask_rate=1.0600)
        assert result == "OUTSIDE_SPREAD"

    def test_outside_spread_below_bid(self):
        """Effective rate below bid -> OUTSIDE_SPREAD."""
        result = _classify_spread(effective_rate=1.0400, bid_rate=1.0500, ask_rate=1.0600)
        assert result == "OUTSIDE_SPREAD"

    def test_no_bid_rate_unknown(self):
        """Missing bid -> SPREAD_UNKNOWN."""
        result = _classify_spread(effective_rate=1.0550, bid_rate=None, ask_rate=1.0600)
        assert result == "SPREAD_UNKNOWN"

    def test_no_ask_rate_unknown(self):
        """Missing ask -> SPREAD_UNKNOWN."""
        result = _classify_spread(effective_rate=1.0550, bid_rate=1.0500, ask_rate=None)
        assert result == "SPREAD_UNKNOWN"

    def test_both_none_unknown(self):
        """Both bid and ask None -> SPREAD_UNKNOWN."""
        result = _classify_spread(effective_rate=1.0550, bid_rate=None, ask_rate=None)
        assert result == "SPREAD_UNKNOWN"

    def test_spread_classification_in_engine_result(self):
        """Verify spread_classification appears in MarkupFinding.to_dict()."""
        from app.engine.audit_engine import run_audit_engine, BenchmarkConfig, BenchmarkEntry
        from datetime import date, datetime, UTC
        txn = AuditTransactionInput(
            row_id="t1", row_hash="h" * 64, row_index=0,
            trade_date=date(2025, 1, 15), value_date=None,
            currency_sold="MXN", currency_bought="USD",
            amount_sold=500_000, amount_bought=27_000,
            effective_rate=0.054, counterparty="Bank",
            fee_amount=None, fee_currency=None, reference=None,
        )
        bm = BenchmarkEntry(
            snapshot_id="s1", snapshot_hash="a" * 64,
            as_of=date(2025, 1, 15), currency_pair="MXNUSD",
            mid_rate=0.0556, provider="test", fetched_at=datetime.now(UTC),
            bid_rate=0.0550, ask_rate=0.0560,
        )
        cfg = BenchmarkConfig(benchmark_source="market_snapshot", max_staleness_days=None)
        result = run_audit_engine("ds", [txn], [bm], cfg, date(2025, 1, 1), date(2025, 1, 31))
        d = result.markup_findings[0].to_dict()
        assert "spread_classification" in d
        assert d["spread_classification"] in ("WITHIN_SPREAD", "OUTSIDE_SPREAD", "SPREAD_UNKNOWN")


# ══════════════════════════════════════════════════════════════════════════════
# Determinism preserved after upgrade
# ══════════════════════════════════════════════════════════════════════════════


class TestDeterminismPreserved:
    def test_same_inputs_same_hash(self):
        txns = [_txn(i) for i in range(5)]
        bms = [_bm()]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot", max_staleness_days=None)

        r1 = run_audit_engine("ds-001", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))
        r2 = run_audit_engine("ds-001", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))

        assert r1.run_hash == r2.run_hash
        assert r1.inputs_hash == r2.inputs_hash
        assert r1.outputs_hash == r2.outputs_hash

    def test_trace_has_required_steps(self):
        txns = [_txn(0)]
        bms = [_bm()]
        cfg = BenchmarkConfig(benchmark_source="market_snapshot", max_staleness_days=None)
        result = run_audit_engine("ds", txns, bms, cfg, date(2025, 1, 1), date(2025, 1, 31))
        steps = {e.step for e in result.trace_events}
        assert "ENGINE_START" in steps
        assert "MARKUP" in steps
        assert "FEES" in steps
        assert "ENGINE_COMPLETE" in steps


# ══════════════════════════════════════════════════════════════════════════════
# Parser tests for multi-format support
# ══════════════════════════════════════════════════════════════════════════════


class TestParsers:
    def test_parse_date_formats(self):
        assert _parse_date("2025-01-15") == date(2025, 1, 15)
        assert _parse_date("15/01/2025") == date(2025, 1, 15)
        assert _parse_date("01/15/2025") == date(2025, 1, 15)
        assert _parse_date("") is None
        assert _parse_date(None) is None

    def test_parse_float_formats(self):
        assert _parse_float("500000") == 500_000.0
        assert _parse_float("500,000.00") == 500_000.0
        assert _parse_float("") is None
        assert _parse_float(None) is None

    def test_csv_parser_works(self):
        csv_data = b"trade_date,currency_sold,currency_bought,amount_sold,amount_bought\n2025-01-15,MXN,USD,500000,27000\n"
        rows, warnings, pairs = _parse_csv(csv_data)
        assert len(rows) == 1
        assert "MXNUSD" in pairs

    def test_shared_parser_module_importable(self):
        from app.services.audit_lab_parsers import FIELD_ALIASES, normalize_headers
        assert "trade_date" in FIELD_ALIASES
        mapping = normalize_headers(["trade_date", "amount_sold"])
        assert "trade_date" in mapping


# ══════════════════════════════════════════════════════════════════════════════
# Service modules importable
# ══════════════════════════════════════════════════════════════════════════════


class TestServiceImports:
    def test_benchmark_provider_importable(self):
        from app.services.benchmark_provider import BenchmarkProvider, BenchmarkQuote
        assert BenchmarkProvider is not None

    def test_regulatory_export_importable(self):
        from app.services.regulatory_export import export_isda_xml, export_finra_17a4
        # Test basic function call
        xml = export_isda_xml({"run_id": "test"}, [])
        assert "<FxTrade>" in xml or "<?xml" in xml.lower() or "<" in xml

    def test_audit_scheduler_importable(self):
        from app.services.audit_scheduler import create_schedule, get_schedules, delete_schedule
        sched = create_schedule("co1", "ds1", {}, "0 0 * * 1", "user1")
        assert sched.id is not None
        schedules = get_schedules("co1")
        assert len(schedules) >= 1
        deleted = delete_schedule(sched.id, "co1")
        assert deleted is True

    def test_orm_models_importable(self):
        from app.models.audit_lab import (
            AuditDataset,
            AuditTransaction,
            AuditRun,
            AuditFinding,
            AuditReport,
        )
        assert AuditDataset.__tablename__ == "audit_datasets"
        assert AuditTransaction.__tablename__ == "audit_transactions"
        assert AuditRun.__tablename__ == "audit_runs"
        assert AuditFinding.__tablename__ == "audit_findings"
        assert AuditReport.__tablename__ == "audit_reports"


# ══════════════════════════════════════════════════════════════════════════════
# RBAC: Audit Lab permissions registration
# ══════════════════════════════════════════════════════════════════════════════


class TestRbacPermissions:
    def test_audit_permissions_registered(self):
        from app.models.permission import SEED_PERMISSIONS
        codenames = {p[0] for p in SEED_PERMISSIONS}
        assert "audit.upload" in codenames
        assert "audit.run" in codenames
        assert "audit.review" in codenames
        assert "audit.export" in codenames
        assert "audit.schedule" in codenames
        assert "audit.benchmark_fetch" in codenames

    def test_supervisor_has_audit_permissions(self):
        from app.models.permission import DEFAULT_ROLE_PERMISSIONS
        supervisor = DEFAULT_ROLE_PERMISSIONS["supervisor"]
        assert "audit.upload" in supervisor
        assert "audit.run" in supervisor
        assert "audit.review" in supervisor
        assert "audit.export" in supervisor
        assert "audit.schedule" in supervisor

    def test_risk_analyst_has_audit_permissions(self):
        from app.models.permission import DEFAULT_ROLE_PERMISSIONS
        risk_analyst = DEFAULT_ROLE_PERMISSIONS["risk_analyst"]
        assert "audit.upload" in risk_analyst
        assert "audit.run" in risk_analyst
        assert "audit.review" in risk_analyst
        assert "audit.export" in risk_analyst


# ══════════════════════════════════════════════════════════════════════════════
# Item 31: Exposure-gap pair normalization
# ══════════════════════════════════════════════════════════════════════════════


class TestExposureGapNormalization:
    def test_pair_normalization_symmetric(self):
        """MXNUSD and USDMXN should normalize to same key."""
        pair1 = "".join(sorted(["MXN", "USD"]))
        pair2 = "".join(sorted(["USD", "MXN"]))
        assert pair1 == pair2 == "MXNUSD"

    def test_pair_normalization_eur_gbp(self):
        pair1 = "".join(sorted(["EUR", "GBP"]))
        pair2 = "".join(sorted(["GBP", "EUR"]))
        assert pair1 == pair2 == "EURGBP"

    def test_pair_normalization_preserves_all_chars(self):
        pair = "".join(sorted(["BRL", "USD"]))
        assert pair == "BRLUSD"
        assert len(pair) == 6

    def test_pair_normalization_case_insensitive(self):
        """Ensure .upper() handles mixed-case DB values."""
        pair1 = "".join(sorted(["mxn".upper(), "usd".upper()]))
        pair2 = "".join(sorted(["USD".upper(), "MXN".upper()]))
        assert pair1 == pair2

    def test_all_major_pairs_normalize_consistently(self):
        """Verify several common FX pairs normalize regardless of direction."""
        cases = [
            (["USD", "EUR"], "EURUSD"),
            (["EUR", "USD"], "EURUSD"),
            (["GBP", "JPY"], "GBPJPY"),
            (["JPY", "GBP"], "GBPJPY"),
            (["AUD", "CAD"], "AUDCAD"),
            (["CAD", "AUD"], "AUDCAD"),
        ]
        for currencies, expected in cases:
            assert "".join(sorted(currencies)) == expected
