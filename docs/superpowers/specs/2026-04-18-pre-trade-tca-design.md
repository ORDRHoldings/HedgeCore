# Pre-Trade TCA (Transaction Cost Analysis) — Design Spec

> **Status:** Approved 2026-04-18
> **Author:** Synexiun / Claude Code

---

## Goal

Surface full execution cost estimates (slippage, commission, exchange fee, clearing fee, volatility drift) **before** a trade is committed, persist them as compliance artifacts, and close the loop with post-execution variance tracking against actual settlement costs.

## Architecture

```
FRONTEND
  /pre-trade-tca           — standalone estimator + recent estimates table
  /pre-trade-tca/accuracy  — rolling estimate-vs-actual accuracy dashboard
  /calculate/runs/[id]     — new "Transaction Costs" tab (auto-generated on first read)

        ↕ tcaClient.ts

ROUTES — v1_tca.py
  POST /v1/tca/pre-trade/estimate
  GET  /v1/tca/estimates
  GET  /v1/tca/estimates/{id}
  GET  /v1/tca/calc-runs/{run_id}        (idempotent: auto-generates on first call)
  POST /v1/tca/estimates/{id}/reconcile  (admin: manual settlement linkage)
  GET  /v1/tca/accuracy-report

        ↕

SERVICE — tca_service.py
  estimate_pre_trade()      build synthetic hedge_action → engine → persist
  attach_to_calc_run()      idempotent: compute + persist TCA for a calc run
  reconcile_actual()        backfill actual_cost_usd + variance_bps from settlement
  get_accuracy_report()     aggregate GROUP BY stats on reconciled estimates

        ↕                              ↕

ENGINE (existing)              MODEL (new)
transaction_cost_model.py      TransactionCostEstimate
compute_transaction_costs()    transaction_cost_estimates table

                                        ↑
AUTO-RECONCILE HOOK (settlement_service.py)
  On SettlementEvent create → best-effort match → reconcile_actual()
  Non-blocking: settlement write never fails on reconcile error
```

## Data Model

**Table: `transaction_cost_estimates`**

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID PK | — | |
| `tenant_id` | UUID FK companies | — | indexed |
| `user_id` | UUID FK users | — | |
| `estimate_type` | enum('pre_trade','post_calc') | — | |
| `calculation_run_id` | UUID FK calculation_runs | YES | set when type=post_calc |
| `market_snapshot_id` | UUID FK market_snapshots | — | snapshot used for calculation |
| `inputs` | JSONB | — | `{pair, notional_usd, direction, instrument, execution_window_hours}` |
| `outputs` | JSONB | — | full `TransactionCostResult.to_dict()` |
| `total_cost_usd` | NUMERIC(18,2) | — | extracted for indexing |
| `total_cost_bps` | NUMERIC(10,4) | — | extracted |
| `settlement_event_id` | UUID FK settlement_events | YES | set on reconciliation |
| `actual_cost_usd` | NUMERIC(18,2) | YES | from settlement |
| `variance_bps` | NUMERIC(10,4) | YES | `(actual − estimate) / notional × 10000` |
| `reconciled_at` | timestamptz | YES | |
| `created_at` | timestamptz | — | default now(), indexed |

**Indexes:**
- `(tenant_id, created_at DESC)` — list views
- `(tenant_id, estimate_type, reconciled_at)` — accuracy reports
- `(calculation_run_id)` — run-detail tab lookup

**Not WORM:** Estimates are advisory artifacts. `actual_cost_usd`, `variance_bps`, `settlement_event_id`, `reconciled_at` are mutable for reconciliation backfill. All other columns immutable post-insert (service-layer enforcement).

**Audit events:** Every create → `TCA_ESTIMATE_CREATED`; every reconcile → `TCA_RECONCILED` emitted via `build_audit_event()` into the existing hash-chain `audit_events` table as string-literal `event_type` values. Do NOT extend `CashAuditEventType` — that enum belongs to the cash management subsystem only.

**Migration:** `0027_transaction_cost_estimates` — table + indexes. No enum changes required (audit event_type is a plain `String(32)` column).

## API Surface

All routes: auth via `get_current_user`. Plan gate: Professional+.

### POST /v1/tca/pre-trade/estimate
RBAC: `tca.estimate`

Request:
```json
{
  "pair": "EURUSD",
  "notional_usd": 5000000,
  "direction": "BUY",
  "instrument": "FWD",
  "execution_window_hours": 24,
  "market_snapshot_id": null
}
```

Response (200):
```json
{
  "estimate_id": "uuid",
  "estimate_type": "pre_trade",
  "created_at": "2026-04-18T...",
  "inputs": { "...": "..." },
  "breakdown": {
    "slippage_cost": 412.50,
    "broker_commission": 1250.00,
    "exchange_fee": 250.00,
    "clearing_fee": 100.00,
    "vol_drift_adjustment": 875.20,
    "total_cost": 2887.70,
    "total_cost_bps": 5.78
  },
  // Note: breakdown is sourced from PositionCost.to_dict() on the single synthetic
  // hedge_action (pre_trade), or TransactionCostResult.to_dict() for post_calc.
  // Field names match PositionCost.to_dict() keys from transaction_cost_model.py.
  "benchmark": {
    "historical_avg_bps_same_pair": 6.12,
    "percentile": 42,
    "sample_size": 87
  },
  "market_snapshot_id": "uuid"
}
```

Benchmark field omitted if `sample_size < 5`.

Errors: 503 (no market snapshot), 422 (invalid inputs), 402 (plan tier), 403 (permission).

### GET /v1/tca/estimates
RBAC: `tca.read`
Query: `?type=pre_trade|post_calc&pair=EURUSD&from=2026-01-01&to=...&reconciled=true|false&limit=50&offset=0`

### GET /v1/tca/estimates/{id}
RBAC: `tca.read`
Full estimate detail including reconciliation fields if present.

### GET /v1/tca/calc-runs/{run_id}
RBAC: `tca.read`
Read-only lookup of the TCA estimate attached at calculation time. Returns 404 if no TCA was computed for this run (e.g., run predates the TCA feature). The frontend Transaction Costs tab must handle 404 gracefully (hide the tab rather than show an error).

### POST /v1/tca/estimates/{id}/reconcile
RBAC: `tca.estimate`
Body: `{ "settlement_event_id": "uuid" }`
SoD: user who created a post_calc estimate cannot reconcile it (403).

### GET /v1/tca/accuracy-report
RBAC: `tca.read`
Query: `?period=Q4-2025&pair=EURUSD|ALL&group_by=pair|instrument|month`
Response: per-group `{ sample_size, mean_variance_bps, stdev_variance_bps, mae_bps, rmse_bps, bias_direction }`

## RBAC

Two new permissions added to seed migration:
- `tca.read` — admin, treasurer, risk_analyst, trader, viewer
- `tca.estimate` — admin, treasurer, risk_analyst, trader (NOT viewer)

## Service Layer

**`backend/app/services/tca_service.py`**

### estimate_pre_trade()
1. Load MarketSnapshot (requested id or latest for tenant). None → `TCAServiceError("no_market_snapshot")`.
2. Build 1-element `hedge_actions` from trade intent (`bucket="PRE_TRADE"`, `action_usd=notional`).
3. Call `liquidity_model.estimate_slippage()` for the pair.
4. Call `compute_transaction_costs(hedge_actions, slippage, market, policy)`.
5. If `sample_size ≥ 5`: derive benchmark from last-90-days same-pair estimates.
6. Persist row, emit `TCA_ESTIMATE_CREATED`, return.

### attach_to_calc_run()
**Called eagerly from `v1_calculate.py` at the end of every successful `POST /v1/calculate` run**, while `hedge_actions`, `slippage_estimates`, `market`, and `policy` are still live in memory. NOT called lazily on first read — `CalculationRun.run_envelope` stores only hashes, not the full input dicts; lazy re-computation is architecturally impossible.

1. Query for existing estimate by `calculation_run_id`. If found → return (idempotent — safe to call twice).
2. Call `compute_transaction_costs(hedge_actions, slippage_estimates, market, policy)` with the live in-memory inputs passed in by `v1_calculate.py`.
3. Persist with `estimate_type='post_calc'`, `calculation_run_id` set, `market_snapshot_id` from the run's market snapshot. Emit `TCA_ESTIMATE_CREATED` audit event.

`GET /v1/tca/calc-runs/{run_id}` therefore does a **read-only lookup** (not auto-generate): returns 404 if TCA was not computed at run time (e.g., run predates this feature). Clients should handle 404 gracefully (hide the tab).

**Implementation note:** `attach_to_calc_run()` must be wired into BOTH `calculate()` (single-entity) AND `calculate_extended()` (multi-entity) endpoints in `v1_calculate.py`. `calculate_extended()` calls `calculate()` internally — ensure TCA is attached exactly once per run (idempotency guard in step 1 covers double-call).

### reconcile_actual()
1. Load estimate + settlement event. Enforce `settlement_event.company_id == estimate.tenant_id` (cross-tenant isolation guard — required on all FK lookups in this codebase).
2. SoD check: if `estimate.estimate_type == 'post_calc'` AND `reconciling_user_id == estimate.user_id` → `SODViolationError` → 403. Pre-trade estimates may be self-reconciled (intentional asymmetry — pre-trade is advisory; post-calc is a governance artifact tied to an approved run).
3. `actual_cost_usd = abs(float(settlement_event.pnl_impact))` — v1 proxy: total realized rate-deviation cost. `abs()` ensures favourable fills produce positive cost (not negative variance). This does not decompose into sub-components; full broker fee breakdown requires future broker fee API integration.
4. `variance_bps = (actual_cost_usd − estimate.total_cost_usd) / float(estimate.inputs['notional_usd']) × 10000`. Uses the original estimated notional as denominator (not `settlement_event.hedge_amount`) to keep `variance_bps` directly comparable to `total_cost_bps` on the estimate — both use the same notional base.
5. Persist backfill, emit `TCA_RECONCILED` via `build_audit_event()` with string literal event_type.

### Auto-reconcile hook (in settlement_service.py)
After `SettlementEvent` commit: match on `±5% hedge_amount`, `settlement_date == settlement_event.settlement_date` (date equality — not ±4h `created_at` which reflects DB insert time, not trade timing), same `company_id`, `reconciled_at IS NULL`. No pair/direction matching — `SettlementEvent` has no `pair` or `direction` columns. If exactly 1 match → call `reconcile_actual()`. Zero or >1 matches → skip, log warning. Wrapped in `try/except` — settlement write never fails on reconcile error.

## Frontend

### /pre-trade-tca
Two-panel layout:
- **Left:** Form (pair, notional, direction, product, window) + `[ESTIMATE COST →]` button.
- **Right:** Cost breakdown card (5 components + total + all-in bps) + benchmark strip (if available).
- **Bottom:** Recent estimates table (paginated, `GET /v1/tca/estimates?type=pre_trade`).
- Plan gate: `<PlanGate tier="professional">` wraps page.

### /pre-trade-tca/accuracy
Tab on TCA page:
- Period selector + group-by selector.
- Summary strip: total reconciled samples + mean error.
- Table: per-group `mean_variance_bps`, `stdev`, `MAE`, bias direction.

### /calculate/runs/[id] — Transaction Costs tab
New tab alongside Results / Evidence / Verification:
- Fetches `GET /v1/tca/calc-runs/{run_id}` — auto-generates on first load.
- Per-bucket table (bucket, instrument, notional, slippage, commission, total).
- Horizontal waterfall bar chart showing component % breakdown.
- Export CSV button.
- Hidden if user lacks `tca.read` permission.

### Sidebar
New item in TRADING section:
```tsx
{ label: "Pre-Trade TCA", desc: "Estimate execution cost", href: "/pre-trade-tca", icon: Calculator }
```
Plan-gated (professional). `Calculator` icon from `lucide-react`.

## Testing

**3 new test files:**

`tests/test_transaction_cost_model.py` (engine, pure unit, no DB):
- Basic cost decomposition, zero-notional skip, bps formula, missing fee schedule defaults, execution window scales vol drift.

`tests/test_tca_service.py` (service, AsyncMock):
- Persists row on pre-trade estimate, raises on no snapshot, attach idempotency, reconcile variance formula, SoD violation, auto-reconcile skips ambiguous matches.

`tests/test_v1_tca_routes.py` (routes, httpx AsyncClient):
- 200 on valid estimate, 503 on no snapshot (not 500), 403 for viewer role, list pagination, calc-run auto-generate idempotency, empty accuracy report (not error), 402 for free plan.

No `@pytest.mark.requires_postgres` needed — all tests SQLite-compatible. Accuracy report SQL stats mocked at service level.

## Fail-Closed Boundaries

| Scenario | Behaviour |
|---|---|
| No MarketSnapshot for tenant | 503 — never 200 with defaults |
| `calculation_run_id` not found | 404 |
| Engine ValueError | 422 with detail |
| `settlement_event_id` not found | 404 |
| SoD violation on reconcile (`post_calc` only) | 403 — creator cannot reconcile their own post-calc estimate; pre-trade self-reconcile is allowed (advisory artifact, not governance) |
| Cross-tenant settlement lookup | 403 — `settlement_event.company_id` must equal `estimate.tenant_id` |
| Market snapshot belongs to different tenant | 403 — snapshot lookup always includes `AND company_id = current_user.company_id` |
| Auto-reconcile hook failure | Swallowed — settlement write succeeds, warning logged |
| Plan tier check fails | 402 |
| Benchmark `sample_size < 5` | Benchmark omitted from response (not null — field absent) |

## Error Map

| Exception | HTTP |
|---|---|
| `TCAServiceError("no_market_snapshot")` | 503 |
| `ValueError` (engine) | 422 |
| `SODViolationError` | 403 |
| `PermissionDenied` | 403 |
| Plan tier gate | 402 |
| Not found | 404 |
