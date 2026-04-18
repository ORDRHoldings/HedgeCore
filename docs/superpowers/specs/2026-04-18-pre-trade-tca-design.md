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

**Audit events:** Every create → `TCA_ESTIMATE_CREATED`; every reconcile → `TCA_RECONCILED` emitted into existing hash-chain `audit_events` table.

**Migration:** `0023_transaction_cost_estimates` — table + indexes + 2 new `CashAuditEventType` enum values.

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
    "total_cost_usd": 2887.70,
    "total_cost_bps": 5.78
  },
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
Idempotent: if estimate exists return it; otherwise compute + persist on first call.

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
1. Query for existing estimate by `calculation_run_id`. If found → return (idempotent).
2. Load `CalculationRun.result_payload` → extract `hedge_actions`, `slippage_estimates`, `market`, `policy`.
3. Run engine, persist with `estimate_type='post_calc'`, emit audit event.

### reconcile_actual()
1. Load estimate + settlement event.
2. SoD check (post_calc estimates only).
3. `actual_cost_usd` from `settlement_event.fees` JSONB.
4. `variance_bps = (actual − estimate) / notional × 10000`.
5. Persist backfill, emit `TCA_RECONCILED`.

### Auto-reconcile hook (in settlement_service.py)
After `SettlementEvent` commit: match on `±5% notional`, `±4h timestamp`, same `tenant+pair+direction`, `reconciled_at IS NULL`. If exactly 1 match → call `reconcile_actual()`. Zero or >1 matches → skip, log warning. Wrapped in `try/except` — settlement write never fails on reconcile error.

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
| SoD violation on reconcile | 403 |
| Auto-reconcile hook failure | Swallowed — settlement write succeeds, warning logged |
| Plan tier check fails | 402 |
| Benchmark `sample_size < 5` | Benchmark omitted from response |

## Error Map

| Exception | HTTP |
|---|---|
| `TCAServiceError("no_market_snapshot")` | 503 |
| `ValueError` (engine) | 422 |
| `SODViolationError` | 403 |
| `PermissionDenied` | 403 |
| Plan tier gate | 402 |
| Not found | 404 |
