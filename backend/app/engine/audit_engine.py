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
  - Methodology version pinned to "1.1.0".
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

METHODOLOGY_VERSION = "1.1.0"

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
    trade_time: str | None = None


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
    bid_rate: float | None = None
    ask_rate: float | None = None
    forward_points: float | None = None


@dataclass
class BenchmarkConfig:
    """Configuration for which benchmark source to use."""
    benchmark_source: str    # "market_snapshot" | "budget_rate"
    budget_rate: float | None = None   # only used when benchmark_source="budget_rate"
    max_staleness_days: int = 7        # reject benchmarks older than this many days from trade_date


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
    markup_direction: str              # "ADVERSE" | "FAVORABLE" | "AT_MARKET"
    amount_sold: float
    markup_cost_local: float
    markup_cost_usd: float
    size_adjusted_markup_bps: float | None = None
    spread_classification: str = "SPREAD_UNKNOWN"  # "WITHIN_SPREAD" | "OUTSIDE_SPREAD" | "SPREAD_UNKNOWN"

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
            "markup_direction": self.markup_direction,
            "spread_classification": self.spread_classification,
            "amount_sold": self.amount_sold,
            "markup_cost_local": self.markup_cost_local,
            "markup_cost_usd": self.markup_cost_usd,
            "size_adjusted_markup_bps": self.size_adjusted_markup_bps,
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
class RateVarianceResult:
    """Rate variance (formerly UnhedgedImpactResult). Reference baseline only."""
    currency_pair: str
    period_start: str
    period_end: str
    realized_avg_rate: float
    baseline_rate: float
    baseline_source: str          # "budget_rate" | "period_start_snapshot" | "UNAVAILABLE"
    total_exposure_local: float
    rate_variance_usd: float
    status: str                   # "COMPUTED" | "UNAVAILABLE" | "LOW_CONFIDENCE"
    narrative: str

    # Backward compat alias
    @property
    def unhedged_impact_usd(self) -> float:
        return self.rate_variance_usd

    def to_dict(self) -> dict:
        return {
            "currency_pair": self.currency_pair,
            "period_start": self.period_start,
            "period_end": self.period_end,
            "realized_avg_rate": self.realized_avg_rate,
            "baseline_rate": self.baseline_rate,
            "baseline_source": self.baseline_source,
            "total_exposure_local": self.total_exposure_local,
            "rate_variance_usd": self.rate_variance_usd,
            "unhedged_impact_usd": self.rate_variance_usd,  # backward compat
            "status": self.status,
            "narrative": self.narrative,
        }

# Backward compat alias
UnhedgedImpactResult = RateVarianceResult


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
    # Rate variance (formerly "unhedged impact") — reference baseline only
    rate_variance_results: list[UnhedgedImpactResult]
    total_rate_variance_usd: float
    # Summary
    total_favorable_usd: float          # sum of favorable (negative) markup costs
    total_adverse_usd: float             # sum of adverse (positive) markup costs
    total_loss_usd: float              # markup + fees (rate_variance is reference only)
    # Evidence
    inputs_hash: str
    outputs_hash: str
    run_hash: str
    trace_events: list[AuditTraceEvent]
    # Advanced analytics (wired into engine, optional for backward compat)
    outlier_results: list[dict] | None = None
    counterparty_scores: list[CounterpartyScore] | None = None
    natural_hedge_results: list[NaturalHedgeResult] | None = None

    # Backward compat aliases for Item 20 rename
    @property
    def unhedged_results(self) -> list[UnhedgedImpactResult]:
        return self.rate_variance_results

    @property
    def total_unhedged_impact_usd(self) -> float:
        return self.total_rate_variance_usd


# ── Benchmark lookup ──────────────────────────────────────────────────────────

def _find_benchmark(
    trade_date: date,
    currency_pair: str,
    benchmarks: list[BenchmarkEntry],
    max_staleness_days: int | None = None,
) -> BenchmarkEntry | None:
    """
    Find nearest benchmark by as_of date for the given currency pair.
    Returns the entry with the smallest abs(as_of - trade_date).
    If max_staleness_days is not None, rejects the nearest benchmark when
    abs((b.as_of - trade_date).days) > max_staleness_days.
    Returns None if no benchmark exists for this pair or if nearest is stale.
    """
    candidates = [b for b in benchmarks if b.currency_pair == currency_pair]
    if not candidates:
        return None
    nearest = min(candidates, key=lambda b: abs((b.as_of - trade_date).days))
    if max_staleness_days is not None:
        if abs((nearest.as_of - trade_date).days) > max_staleness_days:
            return None
    return nearest


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

def _classify_spread(
    effective_rate: float,
    bid_rate: float | None,
    ask_rate: float | None,
) -> str:
    """Classify whether the effective rate falls within the bid/ask spread."""
    if bid_rate is None or ask_rate is None:
        return "SPREAD_UNKNOWN"
    low = min(bid_rate, ask_rate)
    high = max(bid_rate, ask_rate)
    if low <= effective_rate <= high:
        return "WITHIN_SPREAD"
    return "OUTSIDE_SPREAD"


def _markup_direction(markup_per_unit: float) -> str:
    """Classify markup direction: ADVERSE (bank spread hurts client), FAVORABLE, or AT_MARKET."""
    if abs(markup_per_unit) < 1e-8:
        return "AT_MARKET"
    return "ADVERSE" if markup_per_unit > 0 else "FAVORABLE"


def _compute_markup(
    transactions: list[AuditTransactionInput],
    benchmarks: list[BenchmarkEntry],
    trace: list[AuditTraceEvent],
    max_staleness_days: int | None = None,
) -> tuple[list[MarkupFinding], list[AuditRejection], float, dict, dict, dict, float, float]:
    findings: list[MarkupFinding] = []
    rejections: list[AuditRejection] = []
    total_usd = 0.0
    total_favorable = 0.0
    total_adverse = 0.0
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
        bm = _find_benchmark(txn.trade_date, pair, benchmarks, max_staleness_days)

        # Try reverse pair if not found
        if bm is None:
            rev_pair = f"{txn.currency_bought.upper()}{txn.currency_sold.upper()}"
            bm_rev = _find_benchmark(txn.trade_date, rev_pair, benchmarks, max_staleness_days)
            if bm_rev is not None:
                # Invert the rate for reverse pair comparison
                bm = bm_rev
                eff_rate_for_comparison = (1.0 / txn.effective_rate
                                           if txn.effective_rate != 0 else 0.0)
                # Apply forward rate adjustment when value_date differs from trade_date
                benchmark_rate = bm.mid_rate
                if txn.value_date and txn.trade_date and txn.value_date != txn.trade_date and bm.forward_points is not None:
                    benchmark_rate = bm.mid_rate + bm.forward_points
                bm_rate_for_comparison = benchmark_rate
            else:
                # Try cross-rate synthesis before rejecting
                cross_rate, cross_source = _synthesize_cross_rate(
                    txn.currency_sold, txn.currency_bought, benchmarks,
                    txn.trade_date, max_staleness_days
                )
                if cross_rate is not None:
                    # Create a synthetic benchmark entry
                    bm = BenchmarkEntry(
                        snapshot_id="SYNTHETIC",
                        snapshot_hash="SYNTHETIC",
                        as_of=txn.trade_date,
                        currency_pair=pair,
                        mid_rate=cross_rate,
                        provider=cross_source,
                        fetched_at=datetime.now(UTC),
                    )
                    eff_rate_for_comparison = txn.effective_rate
                    bm_rate_for_comparison = cross_rate
                else:
                    # Distinguish stale from unavailable: check without staleness filter
                    bm_any = _find_benchmark(txn.trade_date, pair, benchmarks, None)
                    if bm_any is None:
                        bm_any = _find_benchmark(txn.trade_date, rev_pair, benchmarks, None)
                    if bm_any is not None and max_staleness_days is not None:
                        days_off = abs((bm_any.as_of - txn.trade_date).days)
                        rejections.append(AuditRejection(
                            code="AL-BENCHMARK_STALE",
                            message=(
                                f"Nearest benchmark for {pair} is {days_off} days from "
                                f"trade_date {txn.trade_date}, exceeds "
                                f"{max_staleness_days}-day limit."
                            ),
                            detail={"row_id": txn.row_id, "row_index": txn.row_index,
                                    "pair": pair, "trade_date": str(txn.trade_date),
                                    "benchmark_as_of": str(bm_any.as_of),
                                    "days_off": days_off,
                                    "max_staleness_days": max_staleness_days},
                        ))
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
            # Apply forward rate adjustment when value_date differs from trade_date
            benchmark_rate = bm.mid_rate
            if txn.value_date and txn.trade_date and txn.value_date != txn.trade_date and bm.forward_points is not None:
                benchmark_rate = bm.mid_rate + bm.forward_points
            bm_rate_for_comparison = benchmark_rate

        markup_per_unit = eff_rate_for_comparison - bm_rate_for_comparison
        direction = _markup_direction(markup_per_unit)
        spread_class = _classify_spread(eff_rate_for_comparison, bm.bid_rate, bm.ask_rate)
        amount_sold = abs(txn.amount_sold) if txn.amount_sold else 0.0
        markup_cost_local = amount_sold * markup_per_unit

        # Convert to USD (preserve sign)
        markup_cost_usd = _to_usd(abs(markup_cost_local), txn.currency_sold, bm.mid_rate)
        if markup_cost_local < 0:
            markup_cost_usd = -markup_cost_usd

        # Size-adjusted markup (Item 30)
        markup_bps = (markup_per_unit / bm_rate_for_comparison * 10000) if bm_rate_for_comparison else 0
        trade_size_usd_est = _to_usd(amount_sold, txn.currency_sold, bm_rate_for_comparison) if bm_rate_for_comparison > 0 else 0
        adjusted_bps = size_adjusted_markup_bps(markup_bps, trade_size_usd_est)

        month_key = txn.trade_date.strftime("%Y-%m")
        cparty = txn.counterparty or "UNKNOWN"

        by_pair[pair] = by_pair.get(pair, 0.0) + markup_cost_usd
        by_counterparty[cparty] = by_counterparty.get(cparty, 0.0) + markup_cost_usd
        by_month[month_key] = by_month.get(month_key, 0.0) + markup_cost_usd
        total_usd += markup_cost_usd

        if markup_cost_usd > 0:
            total_adverse += markup_cost_usd
        elif markup_cost_usd < 0:
            total_favorable += markup_cost_usd

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
            markup_direction=direction,
            spread_classification=spread_class,
            amount_sold=amount_sold,
            markup_cost_local=markup_cost_local,
            markup_cost_usd=markup_cost_usd,
            size_adjusted_markup_bps=adjusted_bps,
        ))

    trace.append(AuditTraceEvent(
        step="MARKUP",
        timestamp=datetime.now(UTC),
        detail=(
            f"Markup analysis: {len(findings)} findings, "
            f"{len(rejections)} rejections, total_usd={total_usd:.2f}"
        ),
        data={"findings_count": len(findings), "rejections_count": len(rejections),
              "total_markup_usd": total_usd,
              "total_favorable_usd": total_favorable,
              "total_adverse_usd": total_adverse},
    ))
    return findings, rejections, total_usd, by_pair, by_counterparty, by_month, total_favorable, total_adverse


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
) -> tuple[list[RateVarianceResult], float]:
    """
    CRITICAL: This is a REFERENCE BASELINE metric, not a factual loss claim.
    Labeled as "Variance vs reference hedge baseline (analytical what-if)".

    Fail-closed: if forward curve unavailable, status=UNAVAILABLE, amount=0.
    """
    results: list[RateVarianceResult] = []
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
            bm = _find_benchmark(period_start, pair, benchmarks,
                                  config.max_staleness_days)
            if bm is None:
                # Try reverse pair
                rev_pair = f"{pair[3:]}{pair[:3]}" if len(pair) == 6 else None
                if rev_pair:
                    bm = _find_benchmark(period_start, rev_pair, benchmarks,
                                          config.max_staleness_days)
            if bm is None:
                results.append(RateVarianceResult(
                    currency_pair=pair,
                    period_start=str(period_start),
                    period_end=str(period_end),
                    realized_avg_rate=realized_avg_rate,
                    baseline_rate=0.0,
                    baseline_source="UNAVAILABLE",
                    total_exposure_local=total_sold,
                    rate_variance_usd=0.0,
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
        results.append(RateVarianceResult(
            currency_pair=pair,
            period_start=str(period_start),
            period_end=str(period_end),
            realized_avg_rate=realized_avg_rate,
            baseline_rate=baseline_rate,
            baseline_source=baseline_source,
            total_exposure_local=total_sold,
            rate_variance_usd=unhedged_impact_usd,
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
    (markup_findings, markup_rejections, total_markup, by_pair, by_cpty, by_month,
     total_favorable, total_adverse) = (
        _compute_markup(transactions, benchmarks, trace,
                        max_staleness_days=config.max_staleness_days)
    )

    # B) Fees
    fee_findings, total_fees, dq_score, fee_confidence = (
        _compute_fees(transactions, benchmarks, trace)
    )

    # C) Rate variance (formerly "unhedged impact") — reference baseline
    rate_variance_results, total_rate_variance = (
        _compute_unhedged_impact(transactions, benchmarks, config,
                                 period_start, period_end, trace)
    )

    # D) Advanced analytics — wired into engine
    outlier_results = _detect_outliers(markup_findings) if markup_findings else []
    counterparty_scores = _score_counterparties(markup_findings) if markup_findings else []
    natural_hedge_results = _detect_natural_hedges(transactions, benchmarks)

    trace.append(AuditTraceEvent(
        step="ANALYTICS",
        timestamp=datetime.now(UTC),
        detail=(
            f"Advanced analytics: {sum(1 for o in outlier_results if o.get('is_outlier'))} outliers, "
            f"{len(counterparty_scores)} counterparties scored, "
            f"{len(natural_hedge_results)} natural hedges"
        ),
        data={"outlier_count": sum(1 for o in outlier_results if o.get("is_outlier")),
              "counterparty_count": len(counterparty_scores),
              "natural_hedge_count": len(natural_hedge_results)},
    ))

    # Totals
    total_loss = total_markup + total_fees  # rate_variance is reference only

    trace.append(AuditTraceEvent(
        step="ENGINE_COMPLETE",
        timestamp=datetime.now(UTC),
        detail=(
            f"Analysis complete. markup_usd={total_markup:.2f} "
            f"fees_usd={total_fees:.2f} rate_variance_usd={total_rate_variance:.2f} "
            f"total_loss_usd={total_loss:.2f}"
        ),
        data={"total_markup_usd": total_markup, "total_fees_usd": total_fees,
              "total_rate_variance_usd": total_rate_variance,
              "total_unhedged_impact_usd": total_rate_variance,  # backward compat
              "total_loss_usd": total_loss},
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
        "total_rate_variance_usd": total_rate_variance,
        "total_loss_usd": total_loss,
        "markup_findings_count": len(markup_findings),
        "markup_rejections_count": len(markup_rejections),
        "fee_findings_count": len(fee_findings),
        "data_quality_score": dq_score,
        "rate_variance_pairs_count": len(rate_variance_results),
        "outlier_count": sum(1 for o in outlier_results if o.get("is_outlier")),
        "counterparty_scores_count": len(counterparty_scores),
        "natural_hedge_count": len(natural_hedge_results),
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
        rate_variance_results=rate_variance_results,
        total_rate_variance_usd=total_rate_variance,
        total_favorable_usd=total_favorable,
        total_adverse_usd=total_adverse,
        total_loss_usd=total_loss,
        inputs_hash=inputs_hash,
        outputs_hash=outputs_hash,
        run_hash=run_hash,
        trace_events=trace,
        outlier_results=outlier_results,
        counterparty_scores=counterparty_scores,
        natural_hedge_results=natural_hedge_results,
    )


# ── Section D: Cross-rate synthesis (Item 28) ────────────────────────────────

def _synthesize_cross_rate(
    base: str,
    quote: str,
    benchmarks: list[BenchmarkEntry],
    trade_date: date,
    max_staleness_days: int | None = None,
) -> tuple[float | None, str]:
    """
    Synthesize a cross rate from two USD legs: BASE/QUOTE = (BASE/USD) / (QUOTE/USD).
    Returns (rate, source) where source is "DIRECT" | "SYNTHETIC_CROSS".
    Wider staleness tolerance for synthetic: 2x direct.
    """
    cross_staleness = (max_staleness_days * 2) if max_staleness_days else None

    bm_base = _find_benchmark(trade_date, f"USD{base}", benchmarks, cross_staleness)
    bm_quote = _find_benchmark(trade_date, f"USD{quote}", benchmarks, cross_staleness)

    if bm_base and bm_quote and bm_quote.mid_rate > 0:
        cross = bm_base.mid_rate / bm_quote.mid_rate
        return cross, "SYNTHETIC_CROSS"

    bm_base2 = _find_benchmark(trade_date, f"{base}USD", benchmarks, cross_staleness)
    bm_quote2 = _find_benchmark(trade_date, f"{quote}USD", benchmarks, cross_staleness)

    if bm_base2 and bm_quote2 and bm_quote2.mid_rate > 0:
        cross = bm_base2.mid_rate / bm_quote2.mid_rate
        return cross, "SYNTHETIC_CROSS"

    return None, "UNAVAILABLE"


# ── Section E: Trade-size spread normalization (Item 30) ─────────────────────

@dataclass
class SizeTier:
    max_usd: float
    expected_spread_bps: float

DEFAULT_SIZE_TIERS = [
    SizeTier(max_usd=100_000, expected_spread_bps=10.0),
    SizeTier(max_usd=1_000_000, expected_spread_bps=5.0),
    SizeTier(max_usd=float("inf"), expected_spread_bps=2.0),
]


def size_adjusted_markup_bps(
    markup_bps: float,
    trade_size_usd: float,
    tiers: list[SizeTier] | None = None,
) -> float:
    """
    Normalize markup bps by expected spread for the trade's size tier.
    Returns the excess markup above expected spread for that tier.
    """
    if tiers is None:
        tiers = DEFAULT_SIZE_TIERS
    for tier in tiers:
        if trade_size_usd <= tier.max_usd:
            return markup_bps - tier.expected_spread_bps
    return markup_bps


# ── Section F: Outlier detection (Item 32) ───────────────────────────────────

import math


def _detect_outliers(
    findings: list[MarkupFinding],
    z_threshold: float = 2.0,
) -> list[dict]:
    """
    Per-pair z-score outlier detection on markup_per_unit.
    Returns list of {row_id, z_score, is_outlier, pair}.
    """
    by_pair: dict[str, list[MarkupFinding]] = {}
    for f in findings:
        by_pair.setdefault(f.currency_pair, []).append(f)

    results = []
    for pair, pair_findings in by_pair.items():
        values = [f.markup_per_unit for f in pair_findings]
        n = len(values)
        if n < 3:
            for f in pair_findings:
                results.append({"row_id": f.row_id, "z_score": None, "is_outlier": False, "pair": pair})
            continue

        mean = sum(values) / n
        variance = sum((v - mean) ** 2 for v in values) / n
        std = math.sqrt(variance) if variance > 0 else 0

        for f in pair_findings:
            z = (f.markup_per_unit - mean) / std if std > 0 else 0
            results.append({
                "row_id": f.row_id,
                "z_score": round(z, 4),
                "is_outlier": abs(z) > z_threshold,
                "pair": pair,
            })

    return results


# ── Section G: Counterparty best execution scoring (Item 33) ────────────────

@dataclass
class CounterpartyScore:
    counterparty: str
    avg_markup_bps: float
    median_markup_bps: float
    total_cost_usd: float
    trade_count: int
    pct_favorable: float
    composite_score: float  # 0-100, higher = better execution


def _score_counterparties(
    findings: list[MarkupFinding],
) -> list[CounterpartyScore]:
    """Score counterparties by execution quality. Higher composite_score = better."""
    by_cp: dict[str, list[MarkupFinding]] = {}
    for f in findings:
        cp = f.counterparty or "UNKNOWN"
        by_cp.setdefault(cp, []).append(f)

    scores = []
    all_avgs = []
    for cp, cp_findings in by_cp.items():
        markups = [f.markup_per_unit for f in cp_findings]
        costs = [f.markup_cost_usd for f in cp_findings]
        n = len(markups)
        avg = sum(markups) / n if n else 0
        sorted_m = sorted(markups)
        median = sorted_m[n // 2] if n else 0
        total = sum(costs)
        favorable_count = sum(1 for d in cp_findings if d.markup_direction == "FAVORABLE")
        pct_fav = (favorable_count / n * 100) if n else 0
        all_avgs.append(avg)
        scores.append(CounterpartyScore(
            counterparty=cp, avg_markup_bps=avg * 10000, median_markup_bps=median * 10000,
            total_cost_usd=total, trade_count=n, pct_favorable=pct_fav, composite_score=0,
        ))

    # Compute composite score (normalized inverse rank)
    if scores:
        max_avg = max(abs(s.avg_markup_bps) for s in scores) or 1.0
        for s in scores:
            cost_factor = max(0, 100 - (abs(s.avg_markup_bps) / max_avg * 50))
            fav_factor = s.pct_favorable * 0.5
            s.composite_score = round(min(100, cost_factor + fav_factor), 1)

    return sorted(scores, key=lambda s: s.composite_score, reverse=True)


# ── Section H: Natural hedge detection (Item 34) ────────────────────────────

@dataclass
class NaturalHedgeResult:
    currency_pair: str
    date: str
    gross_buy: float
    gross_sell: float
    net: float
    savings_estimate_usd: float


def _detect_natural_hedges(
    transactions: list[AuditTransactionInput],
    benchmarks: list[BenchmarkEntry],
) -> list[NaturalHedgeResult]:
    """
    Detect offsetting buy/sell flows on the same date+pair.
    Natural hedges reduce FX exposure without external hedge cost.
    """
    # Group by date + base currency pair
    groups: dict[str, list[AuditTransactionInput]] = {}
    for txn in transactions:
        if txn.trade_date and txn.currency_sold and txn.currency_bought:
            base = sorted([txn.currency_sold.upper(), txn.currency_bought.upper()])
            key = f"{txn.trade_date}|{''.join(base)}"
            groups.setdefault(key, []).append(txn)

    results = []
    for key, txns in groups.items():
        date_str, pair = key.split("|", 1)
        gross_buy = sum(abs(t.amount_bought or 0) for t in txns)
        gross_sell = sum(abs(t.amount_sold or 0) for t in txns)
        net = abs(gross_buy - gross_sell)

        if gross_buy > 0 and gross_sell > 0:
            offset = min(gross_buy, gross_sell)
            # Estimate savings: offset amount * typical spread (5 bps)
            savings = offset * 0.0005
            # Convert to USD if we have a benchmark
            td = txns[0].trade_date
            if td:
                bm = _find_benchmark(td, f"USD{pair[:3]}", benchmarks)
                if bm and bm.mid_rate > 0:
                    savings = savings / bm.mid_rate

            results.append(NaturalHedgeResult(
                currency_pair=pair,
                date=date_str,
                gross_buy=gross_buy,
                gross_sell=gross_sell,
                net=net,
                savings_estimate_usd=round(savings, 2),
            ))

    return results
