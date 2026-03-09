# Audit Lab — Canonical Truth Memo

**Date**: 2026-03-09
**Author**: Claude Code (autonomous)
**Methodology version**: 1.1.0
**Test evidence**: 3157 passed, 134 skipped, 0 failed | Frontend build clean

---

## 1. Final Classification Table

Classification criteria:
- **OPERATIONALLY PROVEN**: Code exists, wired into live paths, runtime-tested with representative data, deployable without blockers
- **CODE COMPLETE**: Code exists, wired, tests pass — but tests use synthetic/mocked/programmatic data only, not validated against real-world inputs
- **PARTIAL**: Code exists but incomplete wiring, missing key functionality, or structurally incomplete
- **STUB/BLOCKED**: Interface/stub exists, blocked on external dependency, never imported into live paths

| # | Item | Code exists | Wired | Real-data validated | Deployment-ready | Ext. blocked | Status | Proof |
|---|------|:-----------:|:-----:|:-------------------:|:----------------:|:------------:|--------|-------|
| 1 | FK constraints + indexes | YES | YES | NO (SQLite only) | PG-only | NO | CODE COMPLETE | `migrations/versions/*_audit_lab_integrity.py` exists; PG triggers not runtime-verified |
| 2 | Batch INSERT | YES | YES | NO (synthetic rows) | YES | NO | CODE COMPLETE | `v1_audit_lab.py:229-262` batch path; tested with programmatic data |
| 3 | Date range filter (±30d) | YES | YES | YES (trivial guard) | YES | NO | OPERATIONALLY PROVEN | `v1_audit_lab.py:392-416`; logic is a WHERE clause — synthetic data is representative |
| 4 | Upload size limit (10MB) | YES | YES | YES (trivial guard) | YES | NO | OPERATIONALLY PROVEN | `v1_audit_lab.py:~172`; byte-length check — behavior identical for any file |
| 5 | Admin metrics fix | YES | YES | NO (source-inspection test) | YES | NO | CODE COMPLETE | `test_admin_metrics.py` uses `inspect.getsource()`, not runtime query |
| 6 | Benchmark staleness (7d) | YES | YES | NO (synthetic benchmarks) | YES | NO | CODE COMPLETE | `audit_engine.py:235-248`; tested with hand-crafted dates, not live market data |
| 7 | ORM models (5 tables) | YES | PARTIAL | NO | NO | NO | PARTIAL | `models/audit_lab.py` exists; imported in tests only, routes still use raw `text()` SQL |
| 8 | Signed markup (remove abs) | YES | YES | NO (synthetic rates) | YES | NO | CODE COMPLETE | `audit_engine.py:341`; abs() removed, direction assigned; tested with synthetic rate pairs |
| 9 | Bid/ask columns | YES | YES | NO (SQLite fallback) | PG-only | NO | CODE COMPLETE | Migration exists; model updated; SQLite try/except fallback in route; PG not verified |
| 10 | Within-spread classification | YES | YES | NO (synthetic bid/ask) | YES | NO | CODE COMPLETE | `audit_engine.py`; classification logic tested with hand-crafted spread data |
| 11 | MXN default removal | YES | YES | YES (trivial guard) | YES | NO | OPERATIONALLY PROVEN | `v1_audit_lab.py:366`; null-check fail-closed — behavior is binary, synthetic is representative |
| 12 | CSV preview component | YES | YES | NO (no E2E) | YES | NO | CODE COMPLETE | `CsvPreview.tsx` wired via dynamic import in upload page; no browser test |
| 13 | Transaction drill-down | YES | YES | NO (synthetic) | YES | NO | CODE COMPLETE | Backend endpoint + 5th tab; tested with programmatic transaction data |
| 14 | Markup by month chart | YES | YES | NO (no visual test) | YES | NO | CODE COMPLETE | `MarkupByMonthChart.tsx`; renders from `run.markup_by_month`; no screenshot/visual test |
| 15 | Rate scatter chart | YES | YES | NO (no visual test) | YES | NO | CODE COMPLETE | `RateScatterChart.tsx`; no visual regression test |
| 16 | Counterparty matrix | YES | YES | NO (no visual test) | YES | NO | CODE COMPLETE | `CounterpartyMatrix.tsx`; heatmap renders from scores; no visual test |
| 17 | PDF report | YES | YES | NO (no real PDF opened) | YES | NO | CODE COMPLETE | `auditLabExport.ts:exportAuditLabPdf()`; button wired; no PDF output verified |
| 18 | XLSX export | YES | YES | NO (no real XLSX opened) | YES | NO | CODE COMPLETE | `auditLabExport.ts:exportAuditLabXlsx()`; button wired; no XLSX output verified |
| 19 | Run comparison | YES | YES | NO (synthetic) | YES | NO | CODE COMPLETE | Backend compare endpoint + frontend page; tested with programmatic runs |
| 20 | Rename unhedged→rate_variance | YES | YES | NO (synthetic) | YES | NO | CODE COMPLETE | Full rename with `@property` backward compat; finding type updated; tested |
| 21 | XLSX parser | YES | YES | NO (programmatic XLSX) | YES | NO | CODE COMPLETE | `audit_lab_parsers.py:parse_xlsx()`; tested with openpyxl-generated files, not real bank exports |
| 22 | PDF table extraction | YES | YES | NO (mocked pdfplumber) | YES | NO | CODE COMPLETE | `audit_lab_parsers.py:parse_pdf()`; tests mock `pdfplumber.open()`, never ran against real PDF |
| 23 | Field confidence scoring | YES | YES | NO (synthetic) | YES | NO | CODE COMPLETE | Confidence tiers coded (CSV=1.0, XLSX=0.8-1.0, PDF=0.5-0.9, SWIFT=0.95); synthetic tests |
| 24 | Review queue | YES | YES | NO (synthetic) | YES | NO | CODE COMPLETE | Backend GET/POST + frontend rewrite; tested with synthetic low-confidence rows |
| 25 | SWIFT MT300 parser | YES | YES | NO (hand-crafted fixture) | YES | NO | CODE COMPLETE | `audit_lab_parsers.py:parse_swift_mt()`; fixture is hand-crafted, not a real bank MT300 |
| 26 | Forward point integration | YES | YES | NO (synthetic forward points) | YES | NO | CODE COMPLETE | `audit_engine.py:~340` applies `mid_rate + forward_points`; tested with hand-crafted data |
| 27 | Intraday rate snapshots | YES | PARTIAL | NO | NO | NO | PARTIAL | `trade_time` field added to `AuditTransactionInput`; no hourly matching logic implemented |
| 28 | Cross-rate synthesis | YES | YES | NO (synthetic) | YES | NO | CODE COMPLETE | `_synthesize_cross_rate()` wired as fallback in `_compute_markup()`; tested with synthetic pairs |
| 29 | Benchmark provider connector | YES | NO | NO | NO | YES (Refinitiv/Bloomberg/AV) | STUB/BLOCKED | `benchmark_provider.py` exists with ABC + 3 stubs; never imported by any route |
| 30 | Trade-size spread normalization | YES | YES | NO (synthetic) | YES | NO | CODE COMPLETE | 3-tier expected spreads; `size_adjusted_markup_bps` on MarkupFinding; synthetic tests |
| 31 | Exposure gap analysis | YES | YES | NO (synthetic) | YES | NO | CODE COMPLETE | Endpoint exists; pair normalization fixed; tested with synthetic position/transaction data |
| 32 | Outlier detection (z-score) | YES | YES | NO (synthetic) | YES | NO | CODE COMPLETE | `_detect_outliers()` called in `run_audit_engine()`; OUTLIER findings persisted; synthetic tests |
| 33 | Counterparty scoring | YES | YES | NO (synthetic) | YES | NO | CODE COMPLETE | `_score_counterparties()` with composite 0-100; wired into engine pipeline; synthetic tests |
| 34 | Natural hedge detection | YES | YES | NO (synthetic) | YES | NO | CODE COMPLETE | `_detect_natural_hedges()` groups same-day offsetting flows; wired; synthetic tests |
| 35 | Trend analysis | YES | YES | NO (synthetic) | YES | NO | CODE COMPLETE | Backend trends endpoint + frontend TrendChart; counterparty_breakdown added; synthetic tests |
| 36 | Board-ready PDF | YES | YES | NO (no real PDF opened) | YES | NO | CODE COMPLETE | `auditLabExport.ts:exportBoardSummaryPdf()`; button wired on run detail; no output verified |
| 37 | Regulatory exports (ISDA/FINRA) | YES | YES | NO (never validated against schemas) | NO | NO | CODE COMPLETE | ISDA XML envelope + FINRA pipe format exist; loads real transactions; but never validated against actual ISDA/FINRA schema specs |
| 38 | Audit trail page | YES | YES | NO (synthetic events) | YES | NO | CODE COMPLETE | Frontend page + sidebar nav; queries audit_events; tested with synthetic events |
| 39 | Scheduled audit runs | YES | PARTIAL | NO | NO | NO | PARTIAL | In-memory schedule CRUD works; no background executor (APScheduler not wired) |
| 40 | Trend dashboard | YES | YES | NO (synthetic) | YES | NO | CODE COMPLETE | Full-page dashboard wired to trends endpoint; no visual regression test |

---

## 2. Corrected Counts

| Classification | Count | Items |
|----------------|-------|-------|
| OPERATIONALLY PROVEN | 3 | 3, 4, 11 |
| CODE COMPLETE | 33 | 1, 2, 5, 6, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38, 40 |
| PARTIAL | 3 | 7, 27, 39 |
| STUB/BLOCKED | 1 | 29 |
| **Total** | **40** | |

**Prior inflated claim**: "37/40 production-ready, 3 partial"
**Corrected truth**: 3/40 operationally proven, 33/40 code complete (not runtime-validated), 3/40 partial, 1/40 stub

---

## 3. Hard Truths

### What "Code Complete" actually means
Every item classified CODE COMPLETE has working code that is wired into the application and passes tests. But those tests use synthetic, programmatic, or mocked data. No item in this list has been validated against:
- Real bank CSV/XLSX transaction exports
- Real Bloomberg/Refinitiv benchmark rate snapshots
- Real SWIFT MT300 messages from a correspondent bank
- Real pdfplumber extraction against a scanned bank statement
- Visual verification of chart rendering or PDF output

### P3 is document parsing foundation, not document intelligence
Items 21-25 provide parser dispatch (CSV/XLSX/PDF/SWIFT), column aliasing, and confidence scoring. This is a parsing framework. It is NOT:
- OCR-grade document intelligence
- ML-based field extraction
- Production-tested against messy real-world bank documents
- Validated against the diversity of formats institutions actually produce

### P4 market data is structural, not connected
Forward points, cross-rates, and size normalization are wired into the engine pipeline but operate on synthetic data only. No live market data feed exists. The benchmark provider (Item 29) is dead code — never imported by any route.

### P6 regulatory exports are format stubs
ISDA XML and FINRA 17a-4 formats produce structured output but have never been validated against actual regulatory schema specifications. They should not be presented to compliance without expert review.

### ORM migration is incomplete
Item 7 ORM models exist but are only imported in tests. All route handlers still use raw `text()` SQL. The ORM is an unused parallel path, not a migration.

### Scheduler has no executor
Item 39 provides CRUD for schedule records but no background job runner. APScheduler is not wired. Schedules can be created and listed but never execute.

---

## 4. Canonical Verdict

The Audit Lab has a complete code surface covering all 40 planned items. The deterministic engine core (audit_engine.py) is sound: fail-closed, SHA-256 hashed, WORM-persisted. The methodology upgrade (signed markup, spread classification, outlier detection, counterparty scoring, natural hedges) is mathematically correct against synthetic inputs. The frontend surfaces (charts, exports, drill-downs, review queue, comparison, trend dashboard) exist and compile. However, only 3 trivial guard items qualify as operationally proven under conservative criteria. The remaining 33 code-complete items require validation against representative real-world data before any institutional deployment claim is honest. Three items are structurally incomplete (ORM migration, intraday matching, scheduler execution), and one is dead code (benchmark provider). No item in this system has been tested against production-grade institutional data. The gap between "code complete" and "operationally proven" is the gap between a demo and a product.

---

## 5. Repo State Update

Files updated in this pass:
- `docs/audits/2026-03-09-audit-lab-canonical-truth-memo.md` — this file (NEW)
- `.claude/state/CURRENT_STATE.md` — inflated claims removed, conservative counts applied
- `.claude/state/CHANGELOG_AI.md` — "37/40 production-ready" corrected to "3/40 operationally proven, 33/40 code complete"

---

## 6. Final Output Discipline

- Every classification in this memo was verified by reading source code, test files, and fixture files
- No item was upgraded based on test existence alone — test methodology (synthetic vs real, mocked vs runtime, source-inspection vs behavioral) was evaluated
- Mandatory downgrades applied: Items 5, 21, 22, 25, 26, 37 → CODE COMPLETE; Item 29 → STUB/BLOCKED; Item 39 → PARTIAL
- P3 explicitly labeled as "document parsing foundation, not true OCR-grade document intelligence"
- This memo is the canonical Audit Lab truth document for the repository
