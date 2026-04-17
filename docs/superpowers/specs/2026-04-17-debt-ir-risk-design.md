# Phase 4: Debt Management + Interest Rate Risk — Design Spec

**Date:** 2026-04-17
**Author:** Brainstorming session
**Status:** Approved for implementation
**Target:** Both corporate treasury AND fund/asset manager treasury (multi-entity)
**Approach:** Engine-first (deterministic kernel → service → routes → frontend)

---

## 1. Overview

Phase 4 adds two interconnected modules to ORDR TreasuryFX:

1. **Debt Management** — loan/credit facility registry, drawdown tracking, amortization schedules, covenant monitoring
2. **Interest Rate Risk** — full derivatives suite (IRS, XCCY, caps/floors/collars, swaptions, CMS), yield curve bootstrapping, MTM valuation, IFRS 9 hedge effectiveness testing

Together they complete the liability side of the treasury balance sheet. The existing platform covers FX risk and cash assets with institutional depth; this phase covers the cost of funding and rate exposure on that funding.

All engine modules are pure functions (no DB access), following the existing `engine_v1` freeze contract. `IRHedgeRun` is a WORM append-only table with hash chain, mirroring `CalculationRun`.

---

## 2. Architecture

```
market data (IBKR + TwelveData rates — existing snapshots)
        ↓
engine_v1/ir_curve_engine.py       ← bootstrap OIS + swap curves
        ↓
engine_v1/swap_valuator.py         ← NPV, DV01, PVBP for IRS / XCCY
engine_v1/swaption_engine.py       ← Black-76 + Bachelier for swaptions/caps/floors
engine_v1/debt_cashflow_engine.py  ← amortization, accrual, covenants
        ↓
engine_v1/ir_hedge_effectiveness.py  ← IFRS 9 dollar-offset + regression
        ↓
services: debt_service.py / ir_swap_service.py / ir_hedge_service.py
        ↓
routes:   v1_debt.py  /  v1_ir_risk.py
        ↓
pages:    /debt   /debt/[id]   /ir-risk
```

### Key architectural decisions

- **No curve persistence** — yield curves are recomputed on demand from existing market data snapshots. Avoids stale-curve NPV bugs.
- **Scheduler integration** — `mark_to_market_all` plugs into the existing market data scheduler (fail-open: last known NPV preserved on bootstrap failure).
- **Multi-entity** — `DebtFacility` and `IRSwap` both FK to `LegalEntity` (existing model), supporting corporate + fund structures.
- **Plan gating** — new sidebar section gated at `professional:2`.

---

## 3. IR Analytics Engine (5 modules)

### 3.1 `engine_v1/ir_curve_engine.py`

**Purpose:** Bootstrap OIS and swap discount curves from market rate quotes.

**Input:**
```python
@dataclass
class RateQuote:
    tenor: str          # "1M", "3M", "6M", "1Y", "2Y", "5Y", "10Y", "30Y"
    rate: float         # decimal (e.g. 0.0525 for 5.25%)
    instrument: str     # "OIS" | "IRS" | "FRA"
    index: str          # "SOFR" | "EURIBOR" | "SONIA" | "TONAR"
```

**Output:**
```python
@dataclass
class IRCurve:
    index: str
    as_of: date
    nodes: list[CurveNode]   # (date, discount_factor, zero_rate, forward_rate)
```

**Method:** Log-linear interpolation on discount factors. Bootstraps from short end to long end, solving for discount factors that reprice each input instrument to par. Supports SOFR, EURIBOR, SONIA, TONAR.

---

### 3.2 `engine_v1/swap_valuator.py`

**Purpose:** Value interest rate swaps and cross-currency swaps.

**Input:**
```python
@dataclass
class SwapSpec:
    notional: float
    currency: str
    fixed_rate: float
    float_index: str        # "SOFR" | "EURIBOR" | "SONIA"
    start_date: date
    maturity_date: date
    pay_fixed: bool
    day_count: str          # "ACT360" | "ACT365" | "30_360" | "ACTACT"
    reset_frequency: str    # "MONTHLY" | "QUARTERLY" | "SEMI" | "ANNUAL"
    amortization_schedule: list[tuple[date, float]] | None
    fx_basis_bps: float     # for XCCY swaps, 0.0 for plain IRS
```

**Output:**
```python
@dataclass
class SwapValuation:
    npv: float              # net present value in notional currency
    dv01: float             # $ change per 1bp parallel shift
    pvbp: float             # price value of basis point
    accrued_interest: float
    par_rate: float         # current fair rate (zero-NPV rate)
    fixed_leg_pv: float
    floating_leg_pv: float
```

Handles: bullet IRS, amortizing IRS, cross-currency swaps (adds FX basis leg using existing spot/forward data from market snapshots).

---

### 3.3 `engine_v1/swaption_engine.py`

**Purpose:** Price European swaptions, interest rate caps, floors, and collars.

**Input:**
```python
@dataclass
class SwaptionSpec:
    instrument_type: str    # "SWAPTION" | "CAP" | "FLOOR" | "COLLAR"
    notional: float
    option_expiry: date
    underlying_swap: SwapSpec
    strike: float
    vol: float              # implied vol from options_snapshots table
    model: str              # "BLACK76" | "BACHELIER" — auto-selected based on rate level
```

**Output:**
```python
@dataclass
class SwaptionValuation:
    premium: float
    delta: float
    vega: float
    theta: float
    model_used: str
```

**Model selection:** Black-76 (log-normal) when forward rate > 0.5%; Bachelier (normal) when forward rate ≤ 0.5%. This handles negative rate environments (EURIBOR 2014–2022) where Black-76 produces mathematically invalid negative premiums.

Vol surface sourced from existing `options_snapshots` table.

---

### 3.4 `engine_v1/debt_cashflow_engine.py`

**Purpose:** Generate amortization schedules, interest accruals, and covenant ratios.

**Input:**
```python
@dataclass
class DebtFacilitySpec:
    principal: float
    margin_bps: int
    rate_index: str         # "SOFR" | "EURIBOR" | "FIXED"
    index_rate: float       # current index fixing
    day_count: str
    repayment_type: str     # "BULLET" | "AMORTIZING" | "BALLOON"
    start_date: date
    maturity_date: date
    payment_frequency: str  # "MONTHLY" | "QUARTERLY" | "SEMI" | "ANNUAL"
    covenants: list[CovenantSpec]
```

**Output:**
```python
@dataclass
class DebtSchedule:
    periods: list[DebtPeriod]   # date, principal, interest, total, outstanding
    total_interest_expense: float
    weighted_avg_life: float     # WAL in years
    covenant_results: list[CovenantResult]  # type, threshold, current, headroom_pct, status
```

Day count conventions: ACT/360, ACT/365, 30/360, ACT/ACT (ISDA).
Covenant types: DSCR, LTV, interest coverage ratio, net leverage, minimum liquidity.

---

### 3.5 `engine_v1/ir_hedge_effectiveness.py`

**Purpose:** IFRS 9.6.4.1 hedge effectiveness testing for IR hedges.

Mirrors `engine_v1/hedge_accounting.py` exactly in structure. Input is hedged item cashflows (from `debt_cashflow_engine`) vs. hedging instrument cashflows (from `swap_valuator`). 

Two methods:
- **Dollar-offset:** ratio of change in fair value of hedging instrument to change in fair value of hedged item. Pass: 80–125%.
- **Regression:** R² ≥ 0.80, slope between -1.25 and -0.80.

**Output:**
```python
@dataclass
class IREffectivenessResult:
    method: str
    ratio: float            # dollar-offset ratio, or R² for regression
    passed: bool            # within 80–125% window
    prospective: bool
    retrospective: bool
    evidence_bundle: dict   # inputs + curve snapshot + result, for audit ZIP
```

---

## 4. ORM Models (4 new models)

### 4.1 `DebtFacility`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | FK → Company | multi-tenant |
| `legal_entity_id` | FK → LegalEntity | which entity borrowed |
| `facility_type` | enum | REVOLVER, TERM_LOAN, BILATERAL, SYNDICATED, BOND, REPO, MARGIN_LINE |
| `counterparty` | str | lender name |
| `currency` | str(3) | |
| `committed_amount` | Numeric(20,6) | total facility size |
| `drawn_amount` | Numeric(20,6) | current utilisation (updated on drawdown) |
| `margin_bps` | int | spread over index |
| `rate_index` | str | SOFR, EURIBOR, SONIA, FIXED |
| `maturity_date` | date | |
| `day_count` | enum | ACT360, ACT365, 30_360, ACTACT |
| `payment_frequency` | enum | MONTHLY, QUARTERLY, SEMI, ANNUAL |
| `repayment_type` | enum | BULLET, AMORTIZING, BALLOON |
| `status` | enum | ACTIVE, COMMITTED_UNDRAWN, EXPIRED, CANCELLED |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

---

### 4.2 `DebtDrawdown`

Append-only in practice (amend via new superseding record). SHA-256 hash for tamper detection.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `facility_id` | FK → DebtFacility | |
| `drawdown_date` | date | |
| `amount` | Numeric(20,6) | |
| `repayment_date` | date | |
| `rate_fixed_at` | Numeric | null if floating |
| `drawdown_hash` | str(64) | SHA-256(facility_id + amount + date) |
| `created_at` | timestamp | |

---

### 4.3 `DebtCovenant`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `facility_id` | FK → DebtFacility | |
| `covenant_type` | enum | DSCR, LTV, INTEREST_COVERAGE, NET_LEVERAGE, MIN_LIQUIDITY |
| `threshold` | Numeric | breach level |
| `current_value` | Numeric | updated on each effectiveness run |
| `headroom_pct` | Numeric | computed: (current − threshold) / threshold × 100 |
| `status` | enum | COMPLIANT, WARNING, BREACH |
| `tested_at` | timestamp | |

---

### 4.4 `IRSwap`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | FK → Company | |
| `legal_entity_id` | FK → LegalEntity | |
| `linked_facility_id` | FK → DebtFacility | nullable — hedge designation |
| `instrument_type` | enum | IRS, XCCY, CAP, FLOOR, COLLAR, SWAPTION, CMS |
| `notional` | Numeric(20,6) | |
| `currency` | str(3) | |
| `fixed_rate` | Numeric | null for caps/floors |
| `strike` | Numeric | for caps/floors/swaptions |
| `float_index` | str | SOFR, EURIBOR, SONIA |
| `start_date` | date | |
| `maturity_date` | date | |
| `pay_fixed` | bool | direction |
| `day_count` | enum | |
| `reset_frequency` | enum | |
| `last_npv` | Numeric | updated by MTM run |
| `last_dv01` | Numeric | |
| `last_mtm_at` | timestamp | |
| `status` | enum | ACTIVE, TERMINATED, EXPIRED |
| `created_at` | timestamp | |

---

### 4.5 `IRHedgeRun` (WORM)

Append-only, hash-chained. Mirrors `CalculationRun`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `tenant_id` | FK → Company | |
| `swap_id` | FK → IRSwap | |
| `facility_id` | FK → DebtFacility | |
| `run_at` | timestamp | |
| `method` | str | DOLLAR_OFFSET, REGRESSION |
| `ratio` | Numeric | |
| `passed` | bool | |
| `inputs_hash` | str(64) | SHA-256 of engine inputs |
| `run_hash` | str(64) | SHA-256(inputs_hash + prior_hash) — chain |
| `prior_run_hash` | str(64) | GENESIS_HASH if first |
| `evidence_json` | JSONB | full engine output |

---

## 5. Services (3 files)

### `backend/app/services/debt_service.py`

| Function | Purpose |
|----------|---------|
| `create_facility(tenant_id, spec)` | Create DebtFacility, post DEBT_FACILITY_CREATED audit event |
| `record_drawdown(facility_id, amount, date)` | Create DebtDrawdown, update drawn_amount, compute drawdown_hash |
| `get_maturity_calendar(tenant_id)` | All facilities sorted by maturity_date with days-to-maturity |
| `get_debt_schedule(facility_id)` | Call debt_cashflow_engine, return amortization + interest schedule |
| `check_covenants(facility_id)` | Recompute covenant ratios, update DebtCovenant, fire alert if BREACH |
| `get_total_exposure(tenant_id)` | Aggregate drawn_amount by currency + entity |

### `backend/app/services/ir_swap_service.py`

| Function | Purpose |
|----------|---------|
| `create_swap(tenant_id, spec)` | Create IRSwap, validate notional ≤ facility notional, audit event |
| `mark_to_market(swap_id)` | Bootstrap IR curve, call swap_valuator, update last_npv + last_dv01 |
| `mark_to_market_all(tenant_id)` | Batch MTM all ACTIVE swaps, fail-open on curve error |
| `terminate_swap(swap_id)` | Set TERMINATED, record termination P&L, audit event |
| `get_dv01_ladder(tenant_id)` | Aggregate DV01 by tenor bucket (1Y/2Y/5Y/10Y/30Y) |

### `backend/app/services/ir_hedge_service.py`

| Function | Purpose |
|----------|---------|
| `run_effectiveness_test(swap_id, facility_id, method)` | Call ir_hedge_effectiveness, write IRHedgeRun (WORM), return result |
| `get_evidence_bundle(run_id)` | Package IRHedgeRun + inputs + curve snapshot into audit ZIP |
| `get_hedge_ratio(swap_id, facility_id)` | DV01(swap) / DV01(facility) — hedge sizing check |

---

## 6. Routes (2 files)

### `backend/app/api/routes/v1_debt.py` — 8 endpoints

```
POST   /v1/debt/facilities                    create facility
GET    /v1/debt/facilities                    list (filter: entity, status, currency)
GET    /v1/debt/facilities/{id}               facility detail + drawdowns + covenants
POST   /v1/debt/facilities/{id}/drawdowns     record drawdown
GET    /v1/debt/maturity-calendar             all facilities sorted by maturity
GET    /v1/debt/schedule                      amortization + interest expense schedule
GET    /v1/debt/covenants                     all covenants: headroom + status
GET    /v1/debt/exposure                      total drawn by currency + entity
```

### `backend/app/api/routes/v1_ir_risk.py` — 7 endpoints

```
POST   /v1/ir-risk/swaps                      create swap
GET    /v1/ir-risk/swaps                      list (filter: type, status, entity)
GET    /v1/ir-risk/swaps/{id}                 swap detail + last valuation
POST   /v1/ir-risk/swaps/{id}/mtm             mark single swap to market
POST   /v1/ir-risk/mtm-all                    batch MTM all active swaps
GET    /v1/ir-risk/dv01-ladder                DV01 by tenor bucket
POST   /v1/ir-risk/effectiveness              run IFRS 9 test → writes IRHedgeRun
```

All endpoints use `get_current_user` + RBAC permission check. Require `debt:read` / `debt:write` / `ir_risk:read` / `ir_risk:write` permissions (new entries in permissions table).

---

## 7. Frontend Pages (3 pages)

### `frontend/src/app/debt/page.tsx` — Debt Portfolio Dashboard

Four panels:
1. **Summary bar** — Total committed / total drawn / available headroom / weighted avg cost of debt (WACD), by currency
2. **Maturity ladder** — horizontal bar chart, one bar per facility coloured by type, x-axis = calendar months
3. **Facility table** — sortable by maturity / drawn / currency / entity, expandable rows showing drawdowns, status badge
4. **Covenant health panel** — traffic-light grid: BREACH (red) / WARNING (amber, within 15% of threshold) / COMPLIANT (green)

### `frontend/src/app/debt/[id]/page.tsx` — Facility Detail

Three tabs:
- **Schedule** — amortization table (period / principal / interest / total / outstanding), Excel export
- **Covenants** — per-covenant 12-period history chart, edit threshold, trigger retest
- **Linked Hedges** — IRSwap table with NPV / DV01 / hedge ratio / last MTM. Button → run effectiveness test

### `frontend/src/app/ir-risk/page.tsx` — IR Risk Dashboard

Two panels:
- **Left — Exposure:** floating vs. fixed debt totals by index, net unhedged floating, DV01 ladder (debt vs. swap vs. net as stacked bars by tenor)
- **Right — Swap portfolio:** active derivatives table with NPV / DV01 / last MTM, batch MTM button, effectiveness test button (modal → pass/fail badge → writes IRHedgeRun)

### Sidebar

New **DEBT & IR RISK** section in `AppSidebar.tsx` between TREASURY and ACCOUNTING:
- Debt Portfolio (`CreditCard` icon)
- IR Risk (`TrendingDown` icon)

Gated at `professional:2` plan tier.

---

## 8. Migrations

Two Alembic migrations:
- `migration_XXXX`: `debt_facilities`, `debt_drawdowns`, `debt_covenants` tables + indexes
- `migration_XXXX+1`: `ir_swaps`, `ir_hedge_runs` tables + WORM trigger on `ir_hedge_runs` + indexes

WORM trigger on `ir_hedge_runs`: PostgreSQL `BEFORE UPDATE OR DELETE` trigger raising exception (mirrors existing WORM triggers on `calculation_runs`).

---

## 9. Testing

| Layer | Tests |
|-------|-------|
| Engine unit tests | `test_ir_curve_engine.py` — curve bootstrap accuracy vs. known fixtures |
| | `test_swap_valuator.py` — NPV = 0 at inception (par swap), DV01 sign convention |
| | `test_swaption_engine.py` — Black-76 vs. Bachelier switch, put-call parity |
| | `test_debt_cashflow_engine.py` — amortization sum = principal, day count accuracy |
| | `test_ir_hedge_effectiveness.py` — 80/125 boundary cases |
| Service tests | `test_debt_service.py`, `test_ir_swap_service.py`, `test_ir_hedge_service.py` — AsyncMock |
| Route tests | `test_v1_debt_routes.py`, `test_v1_ir_risk_routes.py` — httpx AsyncClient |
| WORM tests | Verify IRHedgeRun cannot be updated or deleted (requires_postgres marker) |

Target: ≥ 30 new tests, maintaining ≥ 75% coverage.

---

## 10. Build Sequence

1. Five engine modules + unit tests
2. Four ORM models + two Alembic migrations
3. Three services + service tests
4. Two route files + route tests
5. WORM trigger + WORM tests
6. Three frontend pages + sidebar update
7. Browser verification on all three pages

---

## 11. Out of Scope (Phase 4)

- Commodity hedging
- Credit default swaps (CDS)
- Collateral management / ISDA margin calls
- Investment portfolio management (Phase 5)
- SWIFT connectivity
- Mobile app
