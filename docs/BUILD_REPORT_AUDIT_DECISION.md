# Build Report: Audit Lab + Decision Desk
**Branch**: `feat/audit-lab-decision-desk`
**Date**: 2026-03-05
**Methodology Version**: `1.0.0`

---

## Summary

Two new revenue-grade modules built and integrated into ORDR Terminal:

| Module | Routes | Engine | Tests | Frontend Pages |
|--------|--------|--------|-------|----------------|
| Audit Lab | 5 endpoints | `audit_engine.py` | 12 unit + 6 API-level | 3 pages |
| Decision Desk | 4 endpoints | `decision_engine.py` | 14 unit + 9 API-level | 2 pages |

---

## Phase 0 — Reconnaissance

- Read 14 existing files covering RunEnvelope/TraceLite patterns, SHA-256 hasher, WORM trigger DDL, connector_service, market_snapshots, policy models
- Produced `docs/PHASE0_RECON.md` with canonical patterns

---

## Phase 1 — Audit Lab

### DDL (8 new WORM tables in `main.py`)
- `audit_datasets` — UNIQUE(company_id, source_hash) for dedup
- `audit_transactions` — FK → audit_datasets
- `audit_runs` — WORM, methodology_version, run_hash, inputs_hash, outputs_hash
- `audit_findings` — MARKUP / FEE / UNHEDGED_IMPACT per run
- `audit_reports` — JSON report blob, WORM
- `decision_runs` — WORM
- `decision_proposals` — FK → decision_runs
- `execution_packets` — FK → decision_runs + decision_proposals

All 8 tables have NO_UPDATE + NO_DELETE PostgreSQL triggers (16 triggers total, following market_snapshots_worm() pattern).

### Engine: `backend/app/engine/audit_engine.py`
Three deterministic sections:

**A) Markup analysis** (`_compute_markup`):
- Per-transaction: benchmark lookup by pair + trade_date proximity
- Reverse pair fallback (MXNUSD ↔ USDMXN with rate inversion)
- Fail-closed: missing benchmark → `AL-BENCHMARK_UNAVAILABLE` rejection
- Aggregated by pair, counterparty, month

**B) Fee extraction** (`_compute_fees`):
- Explicit fee_amount/fee_currency per row
- Data quality score = rows_with_fees / total_rows × 100
- Confidence: HIGH (≥ 50%) vs LOW_CONFIDENCE

**C) Unhedged FX impact** (`_compute_unhedged_impact`):
- Reference baseline metric only (NOT factual loss claim)
- Budget rate or period-start snapshot as baseline
- Fail-closed: no forward curve → status=UNAVAILABLE, amount=0
- Narrative includes `[REFERENCE BASELINE — analytical what-if, not a factual loss claim]` disclaimer

**Invariants verified**:
- `run_hash = sha256({"inputs_hash": ..., "outputs_hash": ...})`
- Identical inputs → identical `run_hash` (tested across 5 runs)
- `METHODOLOGY_VERSION = "1.0.0"` pinned

### API: `backend/app/api/routes/v1_audit_lab.py`
| Method | Path | Permission |
|--------|------|------------|
| POST | `/v1/audit-lab/datasets/upload` | `audit.upload` |
| POST | `/v1/audit-lab/runs` | `audit.run` |
| GET | `/v1/audit-lab/runs/{run_id}` | JWT required |
| GET | `/v1/audit-lab/runs/{run_id}/export` | JWT required |
| GET | `/v1/audit-lab/datasets` | JWT required |

CSV parser supports 10 field aliases. SHA-256 dedup check: 409 on duplicate source hash per tenant.

### Permissions
Added to `SEED_PERMISSIONS`:
- `audit.upload` — Upload FX transaction dataset
- `audit.run` — Execute Audit Lab analysis run

Added to `supervisor` role in `DEFAULT_ROLE_PERMISSIONS`.

---

## Phase 2 — Decision Desk

### Engine: `backend/app/engine/decision_engine.py`
Deterministic 6-step pipeline:

1. **Aggregate** net exposure per currency pair (AR = long, AP = short)
2. **Classify** per policy thresholds:
   - `HEDGE_IMMEDIATE`: abs(net_usd) ≥ immediate_hedge_threshold
   - `HEDGE_STAGED`: abs(net_usd) ≥ staged_min_usd
   - `REDUCE_RATIO`: cost_pct > premium_budget_pct/100 → shrink hedge ratio
   - `NO_ACTION`: abs(net_usd) < min_trade_size_usd
3. **Select instrument**: NDF if pair in ndf_pairs + allowed; else FORWARD; else OPTION
4. **Rank**: primary = abs exposure descending; tiebreaker = currency pair alphabetical
5. **Build packets**: IBKR FX Forwards payload format
6. **Hash**: SHA-256 inputs_hash + outputs_hash → run_hash

**Invariants verified**:
- Same inputs + same run_id → same run_hash (tested 5×)
- Different run_ids → different run_hash (tenant isolation)
- `rationale` is deterministic template string, never LLM-generated

### API: `backend/app/api/routes/v1_decision_desk.py`
| Method | Path | Permission |
|--------|------|------------|
| POST | `/v1/decisions/run` | `decisions.run` |
| GET | `/v1/decisions/runs/{run_id}` | JWT required |
| GET | `/v1/decisions/runs/{run_id}/packets` | JWT required |
| GET | `/v1/decisions/runs` | `decisions.view` |

Fail-closed: no market snapshot → 422 `NO_MARKET_SNAPSHOT` error.

### Permissions
Added to `SEED_PERMISSIONS`:
- `decisions.run` — Create Decision Desk run
- `decisions.view` — View Decision Desk runs

Added to `supervisor` role.

---

## Phase 3 — Evidence Infrastructure

Evidence binder already wired inline in export endpoints:
- `GET /v1/audit-lab/runs/{run_id}/export` returns manifest with:
  - `manifest_version`, `run_type`, `run_id`, `run_hash`, `inputs_hash`, `outputs_hash`
  - `artifacts[]` with dataset hash + trace bundle hash
  - `findings_count`, `findings_total_usd`
  - Full `trace_bundle`

Frontend: evidence rail tab on run detail page shows SHA-256 chain.

---

## Phase 4 — Completion Gate

Script: `scripts/completion_gate.sh`

Checks:
1. File existence (15 required files)
2. ruff lint on new engine + route files
3. Python unit tests (31 tests across 4 test files)
4. `tsc --noEmit`
5. `next build`

---

## Files Created / Modified

### New files
| File | Lines |
|------|-------|
| `backend/app/engine/audit_engine.py` | ~685 |
| `backend/app/engine/decision_engine.py` | ~668 |
| `backend/app/api/routes/v1_audit_lab.py` | ~760 |
| `backend/app/api/routes/v1_decision_desk.py` | ~462 |
| `backend/tests/test_audit_engine.py` | ~258 |
| `backend/tests/test_decision_engine.py` | ~315 |
| `backend/tests/test_audit_lab_api.py` | ~200 |
| `backend/tests/test_decision_desk_api.py` | ~185 |
| `backend/tests/fixtures/audit_sample.csv` | 21 |
| `frontend/src/app/audit-lab/page.tsx` | ~165 |
| `frontend/src/app/audit-lab/upload/page.tsx` | ~230 |
| `frontend/src/app/audit-lab/runs/[run_id]/page.tsx` | ~250 |
| `frontend/src/app/decision-desk/page.tsx` | ~285 |
| `frontend/src/app/decision-desk/runs/[run_id]/page.tsx` | ~255 |
| `frontend/e2e/audit-lab.spec.ts` | 28 |
| `frontend/e2e/decision-desk.spec.ts` | 24 |
| `scripts/completion_gate.sh` | 95 |
| `docs/PHASE0_RECON.md` | ~90 |
| `docs/BUILD_REPORT_AUDIT_DECISION.md` | this file |

### Modified files
| File | Change |
|------|--------|
| `backend/app/main.py` | +8 WORM tables + 16 triggers |
| `backend/app/api/router.py` | +2 router registrations |
| `backend/app/models/permission.py` | +4 permissions + supervisor role grants |
| `frontend/src/components/layout/AppTopBar.tsx` | +2 nav sections (Audit Lab, Decision Desk) + 2 icons |

---

## Non-Negotiable Invariant Compliance

| # | Invariant | Status |
|---|-----------|--------|
| 1 | Deterministic | ✅ Identical inputs → identical run_hash (tested) |
| 2 | Snapshot-bound | ✅ No live API calls in engines — all data pre-loaded |
| 3 | Fail-closed | ✅ Missing benchmark/snapshot → structured rejection |
| 4 | Evidence-first | ✅ SHA-256 trace + WORM storage + evidence binder export |
| 5 | Tenant isolation | ✅ All DB queries WHERE company_id = :cid |
| 6 | WORM tables | ✅ NO_UPDATE + NO_DELETE triggers on all 8 tables |
| 7 | No AI in calculations | ✅ rationale = deterministic f-string; no LLM in engines |
