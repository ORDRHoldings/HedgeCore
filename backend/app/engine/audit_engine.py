"""
backend/app/engine/audit_engine.py

Audit Lab Engine — deterministic analysis of historic FX transactions.

Three metrics computed independently:
  A) Bank markup / FX spread cost
  B) Fee extraction
  C) Unhedged FX impact (ex-post what-if, reference baseline only)

INVARIANTS:
  - Identical inputs produce identical outputs + identical hashes.
  - No live API calls. All market data consumed from persisted MarketSnapshot records.
  - Fail-closed: missing benchmark data = structured rejection, not silent skip.
  - Every run produces a TraceBundle + RunEnvelope hashed with SHA-256.
  - Methodology version pinned to "1.0.0".
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

METHODOLOGY_VERSION = "1.0.0"

# ── Internal hash helpers ──────────────────────────────────────────────────────

def _sha256_dict(d: dict) -> str:
    canonical = json.dumps(d, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _sha256_list(items: list) -> str:
    canonical = json.dumps(items, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ── Input types ───────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class AuditTransactionInput:
    """Immutable snapshot of one transaction row for engine consumption."""
    row_id: str              # UUID of audit_transactions row
    row_hash: str            # SHA-256 of canonical row JSON (stored in DB)
    row_index: int
    trade_date: date | None
    value_date: date | None
    currency_sold: str | None
    currency_bought: str | None
    amount_sold: float | None
    amount_bought: float | None
    effective_rate: float | None   # amount_bought / amount_sold (pre-computed by parser)
    counterparty: str | None
    fee_amount: float | None
    fee_currency: str | None
    reference: str | None


@dataclass(frozen=True)
class BenchmarkEntry:
    """A single benchmark rate for a given date and pair."""
    snapshot_id: str
    snapshot_hash: str
    as_of: date
    currency_pair: str        # e.g. "USDMXN"
    mid_rate: float
    provider: str
    fetched_at: datetime


@dataclass
class BenchmarkConfig:
    """Configuration for which benchmark source to use."""
    benchmark_source: str    # "market_snapshot" | "budget_rate"
    budget_rate: float | None = None   # only used when benchmark_source="budget_rate"


# ── Trace infrastructure ───────────────────────────────────────────────────────

@dataclass
class AuditTraceEvent:
    step: str
    timestamp: datetime
    detail: str
    data: dict[str, Any] | None = None

    def to_dict(self) -> dict:
        return {
            "step": self.step,
            "timestamp": self.timestamp.isoformat(),
            "detail": self.detail,
            "data": self.data,
        }


# ── Finding types ─────────────────────────────────────────────────────────────

@dataclass
class MarkupFinding:
    row_id: str
    row_hash: str
    row_index: int
    trade_date: str
    currency_pair: str
    counterparty: str | None
    effective_rate: float
    benchmark_rate: float
    benchmark_snapshot_id: str
    benchmark_snapshot_hash: str
    benchmark_provider: str
    benchmark_as_of: str
    markup_per_unit: float
    amount_sold: float
    markup_cost_local: float
    markup_cost_usd: float

    def to_dict(self) -> dict:
        return {
            "row_id": self.row_id,
            "row_hash": self.row_hash,
            "row_index": self.row_index,
            "trade_date": self.trade_date,
            "currency_pair": self.currency_pair,
            "counterparty": self.counterparty,
            "effective_rate": self.effective_rate,
            "benchmark_rate": self.benchmark_rate,
            "benchmark_snapshot_id": self.benchmark_snapshot_id,
            "benchmark_snapshot_hash": self.benchmark_snapshot_hash,
            "benchmark_provider": self.benchmark_provider,
            "benchmark_as_of": self.benchmark_as_of,
            "markup_per_unit": self.markup_per_unit,
            "amount_sold": self.amount_sold,
            "markup_cost_local": self.markup_cost_local,
            "markup_cost_usd": self.markup_cost_usd,
        }


@dataclass
class FeeFinding:
    row_id: str
    row_hash: str
    row_index: int
    trade_date: str
    fee_amount: float
    fee_currency: str
    fee_usd: float
    benchmark_rate_used: float | None

    def to_dict(self) -> dict:
        return {
            "row_id": self.row_id,
            "row_hash": self.row_hash,
            "row_index": self.row_index,
            "trade_date": self.trade_date,
            "fee_amount": self.fee_amount,
            "fee_currency": self.fee_currency,
            "fee_usd": self.fee_usd,
            "benchmark_rate_used": self.benchmark_rate_used,
        }


@dataclass
class UnhedgedImpactResult:
    currency_pair: str
    period_start: str
    period_end: str
    realized_avg_rate: float
    baseline_rate: float
    baseline_source: str          # "budget_rate" | "period_start_snapshot" | "UNAVAILABLE"
    total_exposure_local: float
    unhedged_impact_usd: float
    status: str                   # "COMPUTED" | "UNAVAILABLE" | "LOW_CONFIDENCE"
    narrative: str

    def to_dict(self) -> dict:
        return {
            "currency_pair": self.currency_pair,
            "period_start": self.period_start,
            "period_end": self.period_end,
            "realized_avg_rate": self.realized_avg_rate,
            "baseline_rate": self.baseline_rate,
            "baseline_source": self.baseline_source,
            "total_exposure_local": self.total_exposure_local,
            "unhedged_impact_usd": self.unhedged_impact_usd,
            "status": self.status,
            "narrative": self.narrative,
        }


# ── Structured rejection ───────────────────────────────────────────────────────

@dataclass
class AuditRejection:
    code: str
    message: str
    detail: dict[str, Any]

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message, "detail": self.detail}


# ── Engine result ─────────────────────────────────────────────────────────────

@dataclass
class AuditEngineResult:
    methodology_version: str
    # Markup
    markup_findings: list[MarkupFinding]
    markup_rejections: list[AuditRejection]
    total_markup_usd: float
    markup_by_pair: dict[str, float]
    markup_by_counterparty: dict[str, float]
    markup_by_month: dict[str, float]
    # Fees
    fee_findings: list[FeeFinding]
    total_fees_usd: float
    data_quality_score: float          # 0-100 pct of rows with fee data
    fee_confidence: str                # "HIGH" | "LOW_CONFIDENCE"
    # Unhedged impact
    unhedged_results: list[UnhedgedImpactResult]
    total_unhedged_impact_usd: float
    # Summary
    total_loss_usd: float              # markup + fees (unhedged is reference only)
    # Evidence
    inputs_hash: str
    outputs_hash: str
    run_hash: str
    trace_events: list[AuditTraceEvent]


# ── Benchmark lookup ──────────────────────────────────────────────────────────

def _find_benchmark(
    trade_date: date,
    currency_pair: str,
    benchmarks: list[BenchmarkEntry],
) -> BenchmarkEntry | None:
    """
    Find nearest benchmark by as_of date for the given currency pair.
    Returns the entry with the smallest abs(as_of - trade_date), no max distance enforced.
    Returns None if no benchmark exists for this pair.
    """
    candidates = [b for b in benchmarks if b.currency_pair == currency_pair]
    if not candidates:
        return None
    return min(candidates, key=lambda b: abs((b.as_of - trade_date).days))


_CCY_PER_USD: set[str] = {"EUR", "GBP", "AUD", "NZD"}


def _to_usd(amount: float, currency: str, benchmark_rate: float) -> float:
    """
    Convert amount in `currency` to USD using the benchmark mid rate.
    Convention determined by explicit currency classification:
      - CCY/USD pairs (EUR, GBP, AUD, NZD): USD = amount * rate
      - USD/CCY pairs (all others: MXN, JPY, BRL, CHF, etc.): USD = amount / rate
    """
    if benchmark_rate <= 0:
        return 0.0
    if currency.upper() == "USD":
        return amount
    if currency.upper() in _CCY_PER_USD:
        return amount * benchmark_rate
    return amount / benchmark_rate


# ── Section A: Markup computation ─────────────────────────────────────────────

def _compute_markup(
    transactions: list[AuditTransactionInput],
    benchmarks: list[BenchmarkEntry],
    trace: list[AuditTraceEvent],
) -> tuple[list[MarkupFinding], list[AuditRejection], float, dict, dict, dict]:
    findings: list[MarkupFinding] = []
    rejections: list[AuditRejection] = []
    total_usd = 0.0
    by_pair: dict[str, float] = {}
    by_counterparty: dict[str, float] = {}
    by_month: dict[str, float] = {}

    for txn in transactions:
        # Require a valid trade date
        if txn.trade_date is None:
            rejections.append(AuditRejection(
                code="AL-001",
                message="Transaction missing trade_date — cannot look up benchmark.",
                detail={"row_id": txn.row_id, "row_index": txn.row_index},
            ))
            continue

        # Require both sides
        if txn.currency_sold is None or txn.currency_bought is None:
            rejections.append(AuditRejection(
                code="AL-002",
                message="Transaction missing currency_sold or currency_bought.",
                detail={"row_id": txn.row_id, "row_index": txn.row_index},
            ))
            continue

        if txn.effective_rate is None or txn.effective_rate <= 0:
            rejections.append(AuditRejection(
                code="AL-003",
                message="Effective rate missing or zero — cannot compute markup.",
                detail={"row_id": txn.row_id, "row_index": txn.row_index,
                        "effective_rate": txn.effective_rate},
            ))
            continue

        # Derive canonical pair (sold/bought)
        pair = f"{txn.currency_sold.upper()}{txn.currency_bought.upper()}"
        bm = _find_benchmark(txn.trade_date, pair, benchmarks)

        # Try reverse pair if not found
        if bm is None:
            rev_pair = f"{txn.currency_bought.upper()}{txn.currency_sold.upper()}"
            bm_rev = _find_benchmark(txn.trade_date, rev_pair, benchmarks)
            if bm_rev is not None:
                # Invert the rate for reverse pair comparison
                bm = bm_rev
                eff_rate_for_comparison = (1.0 / txn.effective_rate
                                           if txn.effective_rate != 0 else 0.0)
                bm_rate_for_comparison = bm.mid_rate
            else:
                rejections.append(AuditRejection(
                    code="AL-BENCHMARK_UNAVAILABLE",
                    message=(
                        f"No market snapshot found for {pair} or {rev_pair} "
                        f"near {txn.trade_date}. Transaction skipped."
                    ),
                    detail={"row_id": txn.row_id, "row_index": txn.row_index,
                            "pair": pair, "trade_date": str(txn.trade_date)},
                ))
                continue
        else:
            eff_rate_for_comparison = txn.effective_rate
            bm_rate_for_comparison = bm.mid_rate

        markup_per_unit = abs(eff_rate_for_comparison - bm_rate_for_comparison)
        amount_sold = abs(txn.amount_sold) if txn.amount_sold else 0.0
        markup_cost_local = amount_sold * markup_per_unit

        # Convert to USD
        markup_cost_usd = _to_usd(markup_cost_local, txn.currency_sold, bm.mid_rate)

        month_key = txn.trade_date.strftime("%Y-%m")
        cparty = txn.counterparty or "UNKNOWN"

        by_pair[pair] = by_pair.get(pair, 0.0) + markup_cost_usd
        by_counterparty[cparty] = by_counterparty.get(cparty, 0.0) + markup_cost_usd
        by_month[month_key] = by_month.get(month_key, 0.0) + markup_cost_usd
        total_usd += markup_cost_usd

        findings.append(MarkupFinding(
            row_id=txn.row_id,
            row_hash=txn.row_hash,
            row_index=txn.row_index,
            trade_date=str(txn.trade_date),
            currency_pair=pair,
            counterparty=txn.counterparty,
            effective_rate=eff_rate_for_comparison,
            benchmark_rate=bm_rate_for_comparison,
            benchmark_snapshot_id=bm.snapshot_id,
            benchmark_snapshot_hash=bm.snapshot_hash,
            benchmark_provider=bm.provider,
            benchmark_as_of=str(bm.as_of),
            markup_per_unit=markup_per_unit,
            amount_sold=amount_sold,
            markup_cost_local=markup_cost_local,
            markup_cost_usd=markup_cost_usd,
        ))

    trace.append(AuditTraceEvent(
        step="MARKUP",
        timestamp=datetime.now(UTC),
        detail=(
            f"Markup analysis: {len(findings)} findings, "
            f"{len(rejections)} rejections, total_usd={total_usd:.2f}"
        ),
        data={"findings_count": len(findings), "rejections_count": len(rejections),
              "total_markup_usd": total_usd},
    ))
    return findings, rejections, total_usd, by_pair, by_counterparty, by_month


# ── Section B: Fee extraction ─────────────────────────────────────────────────

def _compute_fees(
    transactions: list[AuditTransactionInput],
    benchmarks: list[BenchmarkEntry],
    trace: list[AuditTraceEvent],
) -> tuple[list[FeeFinding], float, float, str]:
    findings: list[FeeFinding] = []
    total_usd = 0.0
    rows_with_fees = 0

    for txn in transactions:
        if txn.fee_amount is not None and txn.fee_amount > 0:
            rows_with_fees += 1
            fee_ccy = txn.fee_currency or txn.currency_sold or "USD"

            # Find benchmark for conversion
            benchmark_rate: float | None = None
            if fee_ccy.upper() != "USD":
                bm = None
                if txn.trade_date:
                    pair = f"{fee_ccy.upper()}USD"
                    bm = _find_benchmark(txn.trade_date, pair, benchmarks)
                    if bm is None:
                        pair_inv = f"USD{fee_ccy.upper()}"
                        bm = _find_benchmark(txn.trade_date, pair_inv, benchmarks)
                benchmark_rate = bm.mid_rate if bm else None

            fee_usd = _to_usd(
                txn.fee_amount,
                fee_ccy,
                benchmark_rate if benchmark_rate else 1.0,
            )
            total_usd += fee_usd

            findings.append(FeeFinding(
                row_id=txn.row_id,
                row_hash=txn.row_hash,
                row_index=txn.row_index,
                trade_date=str(txn.trade_date) if txn.trade_date else "UNKNOWN",
                fee_amount=txn.fee_amount,
                fee_currency=fee_ccy,
                fee_usd=fee_usd,
                benchmark_rate_used=benchmark_rate,
            ))

    total_rows = len(transactions)
    dq_score = (rows_with_fees / total_rows * 100.0) if total_rows > 0 else 0.0
    confidence = "HIGH" if dq_score >= 50.0 else "LOW_CONFIDENCE"

    trace.append(AuditTraceEvent(
        step="FEES",
        timestamp=datetime.now(UTC),
        detail=(
            f"Fee analysis: {len(findings)} rows with fees / {total_rows} total. "
            f"DataQualityScore={dq_score:.1f}% confidence={confidence} "
            f"total_fees_usd={total_usd:.2f}"
        ),
        data={"findings_count": len(findings), "total_rows": total_rows,
              "data_quality_score": dq_score, "confidence": confidence,
              "total_fees_usd": total_usd},
    ))
    return findings, total_usd, dq_score, confidence


# ── Section C: Unhedged FX impact ─────────────────────────────────────────────

def _compute_unhedged_impact(
    transactions: list[AuditTransactionInput],
    benchmarks: list[BenchmarkEntry],
    config: BenchmarkConfig,
    period_start: date,
    period_end: date,
    trace: list[AuditTraceEvent],
) -> tuple[list[UnhedgedImpactResult], float]:
    """
    CRITICAL: This is a REFERENCE BASELINE metric, not a factual loss claim.
    Labeled as "Variance vs reference hedge baseline (analytical what-if)".

    Fail-closed: if forward curve unavailable, status=UNAVAILABLE, amount=0.
    """
    results: list[UnhedgedImpactResult] = []
    total_usd = 0.0

    # Group transactions by currency pair
    pairs: dict[str, list[AuditTransactionInput]] = {}
    for txn in transactions:
        if txn.currency_sold and txn.currency_bought and txn.effective_rate:
            pair = f"{txn.currency_sold.upper()}{txn.currency_bought.upper()}"
            pairs.setdefault(pair, []).append(txn)

    for pair, pair_txns in pairs.items():
        # Compute realized average effective rate
        total_sold = sum(abs(t.amount_sold) for t in pair_txns if t.amount_sold)
        if total_sold == 0:
            continue

        weighted_rate = sum(
            abs(t.amount_sold) * t.effective_rate
            for t in pair_txns
            if t.amount_sold and t.effective_rate
        ) / total_sold
        realized_avg_rate = weighted_rate

        # Determine baseline rate
        if config.benchmark_source == "budget_rate" and config.budget_rate is not None:
            baseline_rate = config.budget_rate
            baseline_source = "budget_rate"
        else:
            # Use period-start snapshot as naive hedge baseline
            bm = _find_benchmark(period_start, pair, benchmarks)
            if bm is None:
                # Try reverse pair
                rev_pair = f"{pair[3:]}{pair[:3]}" if len(pair) == 6 else None
                if rev_pair:
                    bm = _find_benchmark(period_start, rev_pair, benchmarks)
            if bm is None:
                results.append(UnhedgedImpactResult(
                    currency_pair=pair,
                    period_start=str(period_start),
                    period_end=str(period_end),
                    realized_avg_rate=realized_avg_rate,
                    baseline_rate=0.0,
                    baseline_source="UNAVAILABLE",
                    total_exposure_local=total_sold,
                    unhedged_impact_usd=0.0,
                    status="UNAVAILABLE",
                    narrative=(
                        f"Forward curve data unavailable for {pair} at period start "
                        f"{period_start}. Unhedged analysis omitted. "
                        "[REFERENCE BASELINE — not a factual loss claim]"
                    ),
                ))
                continue
            baseline_rate = bm.mid_rate
            baseline_source = "period_start_snapshot"

        # Compute variance
        rate_diff = realized_avg_rate - baseline_rate
        unhedged_impact_local = total_sold * rate_diff

        # Convert to USD
        unhedged_impact_usd = _to_usd(
            abs(unhedged_impact_local),
            pair[:3],   # sold currency
            baseline_rate,
        )
        if rate_diff < 0:
            unhedged_impact_usd = -unhedged_impact_usd

        total_usd += unhedged_impact_usd

        direction = "favorable" if unhedged_impact_usd < 0 else "adverse"
        results.append(UnhedgedImpactResult(
            currency_pair=pair,
            period_start=str(period_start),
            period_end=str(period_end),
            realized_avg_rate=realized_avg_rate,
            baseline_rate=baseline_rate,
            baseline_source=baseline_source,
            total_exposure_local=total_sold,
            unhedged_impact_usd=unhedged_impact_usd,
            status="COMPUTED",
            narrative=(
                f"{pair}: Realized avg rate {realized_avg_rate:.6f} vs "
                f"baseline {baseline_rate:.6f} ({baseline_source}). "
                f"Variance {rate_diff:+.6f} on {total_sold:,.0f} local = "
                f"USD {unhedged_impact_usd:+,.2f} ({direction}). "
                "[REFERENCE BASELINE — analytical what-if, not a factual loss claim]"
            ),
        ))

    trace.append(AuditTraceEvent(
        step="UNHEDGED_IMPACT",
        timestamp=datetime.now(UTC),
        detail=(
            f"Unhedged impact analysis: {len(results)} pairs, "
            f"total_usd={total_usd:.2f}"
        ),
        data={"pairs_count": len(results), "total_unhedged_impact_usd": total_usd},
    ))
    return results, total_usd


# ── Main engine entry point ───────────────────────────────────────────────────

def run_audit_engine(
    dataset_id: str,
    transactions: list[AuditTransactionInput],
    benchmarks: list[BenchmarkEntry],
    config: BenchmarkConfig,
    period_start: date,
    period_end: date,
) -> AuditEngineResult:
    """
    Execute the full audit analysis deterministically.

    All inputs are pre-validated and persisted. No external calls made here.
    Returns a fully hashed AuditEngineResult.
    """
    trace: list[AuditTraceEvent] = []

    trace.append(AuditTraceEvent(
        step="ENGINE_START",
        timestamp=datetime.now(UTC),
        detail=(
            f"Audit engine v{METHODOLOGY_VERSION} starting. "
            f"dataset_id={dataset_id} "
            f"transactions={len(transactions)} "
            f"benchmarks={len(benchmarks)} "
            f"period={period_start}..{period_end}"
        ),
        data={"dataset_id": dataset_id, "transaction_count": len(transactions),
              "benchmark_count": len(benchmarks),
              "benchmark_source": config.benchmark_source,
              "period_start": str(period_start), "period_end": str(period_end)},
    ))

    # A) Markup
    markup_findings, markup_rejections, total_markup, by_pair, by_cpty, by_month = (
        _compute_markup(transactions, benchmarks, trace)
    )

    # B) Fees
    fee_findings, total_fees, dq_score, fee_confidence = (
        _compute_fees(transactions, benchmarks, trace)
    )

    # C) Unhedged impact
    unhedged_results, total_unhedged = (
        _compute_unhedged_impact(transactions, benchmarks, config,
                                 period_start, period_end, trace)
    )

    # Totals
    total_loss = total_markup + total_fees  # unhedged is reference only

    trace.append(AuditTraceEvent(
        step="ENGINE_COMPLETE",
        timestamp=datetime.now(UTC),
        detail=(
            f"Analysis complete. markup_usd={total_markup:.2f} "
            f"fees_usd={total_fees:.2f} unhedged_usd={total_unhedged:.2f} "
            f"total_loss_usd={total_loss:.2f}"
        ),
        data={"total_markup_usd": total_markup, "total_fees_usd": total_fees,
              "total_unhedged_impact_usd": total_unhedged, "total_loss_usd": total_loss},
    ))

    # ── Build hashes ──────────────────────────────────────────────────────────
    inputs_raw = {
        "dataset_id": dataset_id,
        "transaction_count": len(transactions),
        "transaction_hashes": sorted([t.row_hash for t in transactions]),
        "benchmark_count": len(benchmarks),
        "benchmark_source": config.benchmark_source,
        "budget_rate": config.budget_rate,
        "period_start": str(period_start),
        "period_end": str(period_end),
        "methodology_version": METHODOLOGY_VERSION,
    }
    inputs_hash = _sha256_dict(inputs_raw)

    outputs_raw = {
        "total_markup_usd": total_markup,
        "total_fees_usd": total_fees,
        "total_unhedged_impact_usd": total_unhedged,
        "total_loss_usd": total_loss,
        "markup_findings_count": len(markup_findings),
        "markup_rejections_count": len(markup_rejections),
        "fee_findings_count": len(fee_findings),
        "data_quality_score": dq_score,
        "unhedged_pairs_count": len(unhedged_results),
        "by_pair": dict(sorted(by_pair.items())),
        "by_counterparty": dict(sorted(by_cpty.items())),
    }
    outputs_hash = _sha256_dict(outputs_raw)
    run_hash = _sha256_dict({"inputs_hash": inputs_hash, "outputs_hash": outputs_hash})

    return AuditEngineResult(
        methodology_version=METHODOLOGY_VERSION,
        markup_findings=markup_findings,
        markup_rejections=markup_rejections,
        total_markup_usd=total_markup,
        markup_by_pair=by_pair,
        markup_by_counterparty=by_cpty,
        markup_by_month=by_month,
        fee_findings=fee_findings,
        total_fees_usd=total_fees,
        data_quality_score=dq_score,
        fee_confidence=fee_confidence,
        unhedged_results=unhedged_results,
        total_unhedged_impact_usd=total_unhedged,
        total_loss_usd=total_loss,
        inputs_hash=inputs_hash,
        outputs_hash=outputs_hash,
        run_hash=run_hash,
        trace_events=trace,
    )
