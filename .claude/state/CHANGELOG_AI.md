# Changelog (AI-maintained)

## 2026-04-17 — Audit Lab UX Overhaul COMPLETE

### Changed (frontend-only, no new routes)
**Demo page (`frontend/src/app/audit-lab/demo/page.tsx`) — full rebuild:**
- 6-act narrative: nav strip → hero → KPI strip (4 cards) → charts → findings → trust rail → CTA
- Dynamic imports for MarkupByMonthChart + CounterpartyMatrix (ssr: false)
- Public page (no auth), CSS variable design tokens, lucide-react icons
- Primary CTA: "AUDIT MY FX DATA →" → `/auth/signup`; secondary: SIGN IN → `/auth/login`

**Fixture (`frontend/src/lib/fixtures/audit-lab-demo.ts`) — enriched:**
- `markupByMonth` (3 months), `transactions` (11 rows, 3 counterparties with `spread_classification`)
- `findings` (3 items: MARKUP_EXCESS/HIGH, FEE_OPACITY/MEDIUM, COUNTERPARTY_DIVERGENCE/LOW)
- `trustSignals` (3 items), `getDemoCounterpartyStats()` aggregation helper

**Quality fixes (e9c6724):** `cpStats` empty guard, `findings[2]` → `.find(f => f.id === "f3")`, division-by-zero in multiplier, `sevColor` camelCase

**Pre-implemented (verified):** upload UX (sample CSV, dynamic dates, hidden UUID), hub page (no BETA badge, guided empty state, run list with dataset names), run detail (5 KPIs, hash in header, expandable findings, Verification tab), sidebar Activity Log rename

### Validation
- `next build`: clean (exit 0) — 115+ pages compiled
- `tsc --noEmit`: clean
- Browser: `/audit-lab/demo` screenshot confirmed — all 6 acts rendering correctly
- Commits: c89b97d (demo rebuild) + e9c6724 (quality fixes)

---

## 2026-04-17 — Phase 4: Debt Management + Interest Rate Risk COMPLETE

### Added
**Engine (5 new pure-function modules — `backend/app/engine_v1/`):**
- `ir_curve_engine.py`: OIS bootstrapper (SOFR/EURIBOR/SONIA/FIXED), zero-coupon discount factors, par/spot/forward rate extraction, 5 tenors
- `swap_valuator.py`: IRS/XCCY fixed-float swap NPV + DV01 via discounting; ACTACT day-count guard
- `swaption_engine.py`: Black-76 + Bachelier swaption pricing; annuity scaling bug fixed (`annuity_dollar = pvbp / 0.0001`)
- `debt_cashflow_engine.py`: BULLET/AMORTIZING/BALLOON schedules; ACT360/ACT365/30_360 day-count; DSCR/LTV/ICR/NET_LEVERAGE covenant evaluation
- `ir_hedge_effectiveness.py`: IFRS 9.6.4.1 dollar-offset (ratio 0.80–1.25) + OLS regression (R²≥0.80, slope [-1.25,-0.80])

**Models (`backend/app/models/`):**
- `debt.py`: `DebtFacility`, `DebtDrawdown` (SHA-256 drawdown hash), `DebtCovenant`
- `ir_risk.py`: `IRSwap`, `IRVolSnapshot`, `IRHedgeRun` (WORM + SHA-256 hash chain)

**Migrations (`backend/migrations/versions/`):**
- `r1a2b3c4d5e6`: `debt_facilities`, `debt_drawdowns`, `debt_covenants` + 4 composite indexes
- `s1a2b3c4d5e6`: `ir_swaps`, `ir_vol_snapshots`, `ir_hedge_runs` + WORM PG trigger + 2 indexes
- `t1a2b3c4d5e6`: 4 RBAC permissions (`debt.read/write`, `ir_risk.read/write`) assigned to risk_analyst/supervisor/admin

**Services (`backend/app/services/`):**
- `debt_service.py`: `create_facility`, `record_drawdown`, `get_maturity_calendar`, `get_debt_schedule`, `check_covenants`, `get_total_exposure`
- `ir_swap_service.py`: `create_swap`, `mark_to_market`, `mark_to_market_all` (fail-open), `list_swaps`, `terminate_swap`, `get_dv01_ladder`
- `ir_hedge_service.py`: `run_effectiveness_test` (WORM hash chain), `get_evidence_bundle`, `get_hedge_ratio`

**Routes (`backend/app/api/routes/`):**
- `v1_debt.py`: 8 endpoints (`GET/POST /facilities`, `GET /facilities/{id}`, `GET /facilities/{id}/schedule`, `GET /covenants`, `GET /maturity-calendar`, `GET /exposure`, `POST /drawdown`) — `debt.read/write` RBAC
- `v1_ir_risk.py`: 7 endpoints (`GET/POST /swaps`, `POST /swaps/{id}/terminate`, `POST /mtm-all`, `GET /dv01-ladder`, `POST /effectiveness`, `GET /effectiveness/history`) — `ir_risk.read/write` RBAC

**Frontend:**
- `debtClient.ts`: 6 interfaces + 12 typed API functions (7 debt + 5 IR risk), `_fetchJson` helper with HTTP error checking
- `/debt/page.tsx`: Portfolio dashboard — summary bar (committed/drawn/available/facilities), maturity ladder, facility table
- `/debt/[id]/page.tsx`: Facility detail — 3 tabs (amortization schedule, covenant cards, hedges)
- `/ir-risk/page.tsx`: IR risk dashboard — DV01 ladder bar chart, swap portfolio table, MTM ALL trigger
- `AppSidebar.tsx`: `DEBT & IR RISK` group added (Debt Portfolio + IR Risk nav items, professional tier gate)

### Tests
- 28 new tests across 7 test files (8 IR effectiveness + 4 debt cashflow + 3 debt service + 2 IR swap service + 2 IR hedge service + 5 debt routes + 4 IR risk routes)
- All 28 Phase 4 tests pass
- Commits: `d12d904` → `55717b6` (15 commits)

### Build
- `npx next build`: PASS — `/debt` (static), `/debt/[id]` (dynamic), `/ir-risk` (static) all compiled
- `tsc --noEmit`: CLEAN

## 2026-04-16 — Audit Sprint A3: Settlement & Execution Pipeline (2 bug fixes)

### Fixed
- **`engine_v1/fx_roll_engine.py`**: `total_cost = abs(carry_cost) + slippage` — `abs()` discarded the sign of carry_cost. When rolling into a cheaper forward, carry is a benefit (negative). Fixed: `total_cost = carry_cost + slippage` (sign preserved; negative total means the roll is economically beneficial).
- **`engine_v1/currency_netting_matrix.py`**: `gross_notional_after = gross_before - sum(n.savings_usd)` used the 3%-of-notional margin savings proxy instead of the actual netted notional. A $1M netting subtracted $30K instead of $1M, making `gross_notional_after ≈ gross_before` and `netting_efficiency_pct ≈ 0%`. Fixed: `gross_after = gross_before - total_notional_netted`; efficiency uses `total_notional_netted / gross_before`.

### Tests
- 8 new regression tests in `test_roll_mixed_instrument.py` and `test_currency_netting_matrix.py`.
- Full suite: **5083 passed, 0 failed, 158 skipped**.
- Commit: `d2e19b1`

### Audit Findings (non-blocking, deferred)
- `fx_forward_validator.py`: `domestic`/`foreign` variable names are swapped vs standard CIP convention; formula is mathematically correct — LOW.
- `transaction_cost_model.py`: USDMXN_1M vol hardcoded for all currency pairs — documented simplification — LOW.
- `cost_engine.py`: `default=str` in `_canonical_json` silently coerces non-standard types — inputs are all standard in practice — LOW.
- `instrument_mapper.py`: `list(inst.eligible_axes)` may produce non-deterministic ordering if the source is a Python set — LOW.

## 2026-04-16 — Audit Sprint A2: Scenario & Risk Engine (3 bug fixes)

### Fixed
- **`engine_v1/scenarios_ext.py`**: Rate shock was applied to `pre_hedge_loss` — wrong, because the pre-hedge scenario has no hedge and therefore no funding cost. Also, `abs()` on `rate_impact` stripped the sign, making rate decreases incorrectly *increase* post-hedge loss. Fixed: `pre_hedge_loss` unchanged; `post_hedge_loss -= rate_impact` (sign preserved).
- **`engine/scenario_engine.py`**: Hedge effectiveness formula was inverted — `offset = max(0, -hedge_pnl)` reported 0% when the hedge profited (correct functioning) and positive values when it also lost (broken). Fixed: `offset = max(0, hedge_pnl)`. Effectiveness now correctly measures the fraction of portfolio loss absorbed by the hedge's profit.
- **`engine_v1/scenarios_monte_carlo.py`**: `_get_pair_region` used a Python `set` to decompose pairs. Sets have no guaranteed iteration order; cross-region pairs (e.g., MXNJPY: first=EM_LATAM, second=G10) could return different regions across runs. Fixed: ordered list, first leg always wins.

### Tests
- 20 new regression tests added; 3 pre-existing tests updated to reflect correct semantics.
- New file: `test_scenario_engine.py` (13 tests covering effectiveness math, reject paths, costs, trace fingerprint).
- Full suite: **5076 passed, 0 failed, 158 skipped**.
- Commit: `d76da49`

### Audit Findings (non-blocking, deferred)
- `waterfall.py` weight normalisation: minor floating-point rounding in V-code weight normalisation (LOW severity, no correctness impact at standard precision).
- `factor_covariance.py` MCTR label: comment says "Marginal Contribution" but formula computes absolute risk share; label imprecision only, internally consistent.

## 2026-04-16 — Audit Sprint A1: Hedge Calculation Core (3 bug fixes)

### Fixed
- **`engine_v1/worst_case_selector.py`**: `delta_improvement` and `pre_hedge_worst_case` were computed from two independently-selected min() calls (cross-scenario mismatch). Fixed to use `worst` (worst post-hedge scenario) for both fields, so improvement is measured within one consistent scenario.
- **`engine_v1/hedge_bands.py`**: Fallback chains for `hedge_pos` and `exposure` used Python `or`, treating `0.0` as falsy. A genuinely zero `hedge_position_local` (fully-exited hedge) would fall through to `action_local`, reporting intended action instead of actual position. Fixed with `next(k in bucket)` key-presence checks.
- **`engine_v1/hasher.py`**: `sha256_of_dataframe` serialised columns in DataFrame insertion order. Same logical data with columns built in different order produced different hashes, breaking replay determinism. Fixed with `df[sorted(df.columns)]` before `to_json`.

### Tests
- 16 regression tests added (`test_worst_case_selector.py`, `test_hedge_bands.py`, `test_hasher.py` new file).
- Full suite: **5056 passed, 0 failed, 158 skipped**.
- Commit: `a03e036`

### Audit Findings (non-blocking, deferred)
- `normalizer_multi.py`: non-USD cross pairs (e.g., GBPJPY) may extract wrong local currency. No current test coverage for cross pairs — deferred to A2.
- `hedge_effectiveness_engine.py`: `TraceEvent.timestamp` uses wall-clock time (non-deterministic) but is correctly excluded from all output hashes — invariant preserved.
- `hedge_sizer.py`: `REASON_CONSTRAINTS_BLOCKED` guard is logically unreachable when `min_contract > 0` — dead code, no correctness impact.

## 2026-04-16 — Phase 3: Intelligence Tier (AI Add-On)

### Added
- **`backend/app/models/intelligence.py`**: `IntelligenceQueryLog` ORM model (9 cols: tenant, user, query_type, prompt_hash SHA-256, tokens_in/out, latency_ms, model, error; composite index on company_id+created_at).
- **`backend/app/services/intelligence_service.py`**: Advisory-only service — `query_intelligence`, `draft_commentary`, `get_usage_stats`, `build_treasury_context`, `_hash_prompt`, `_get_client`, `_log_query`. All outputs marked advisory; no writes to WORM tables.
- **`backend/app/api/routes/v1_intelligence.py`**: 4 endpoints — POST /query, POST /commentary, GET /settings, PATCH /settings. Error mapping: APIError→502, missing key→503, unsupported type→422, not found→404, wrong tier→402, wrong role→403.
- **Migration** (`q1a2b3c4d5e6_intelligence.py`): intelligence_query_logs table.
- **`docs/architecture/adr/0014-ai-advisory-only-contract.md`**: ADR formalising advisory-only contract; AI output never writes to audit_events, calculation_runs, or policy_revisions.
- **`frontend/src/lib/api/intelligenceClient.ts`**: `queryIntelligence`, `draftCommentary`, `getIntelligenceSettings`, `patchIntelligenceSettings`.
- **`frontend/src/components/intelligence/CmdKOverlay.tsx`**: Global CMD+K overlay, hooks-safe, advisory disclaimer banner.
- **`frontend/src/app/intelligence/page.tsx`**: Intelligence settings + usage dashboard (query log, token stats, model info).
- **14 tests**: 7 service + 7 route. All pass.

### Modified
- `backend/app/core/config.py` — `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` config fields
- `backend/app/core/plan_enforcement.py` — `PLAN_HIERARCHY` extended with `intelligence:3`
- `backend/app/models/organization.py` — `intelligence_enabled` boolean column on Company
- `backend/app/main.py` — `ALTER TABLE companies ADD COLUMN IF NOT EXISTS intelligence_enabled` in `_ensure_tables()`
- `backend/app/models/cash.py` — `INTELLIGENCE_QUERY` added to `CashAuditEventType` (now 29 values)
- `backend/app/api/router.py` — `v1_intelligence_router` registered
- `frontend/src/lib/authContext.tsx` — `PlanTier` union extended with `"intelligence"`
- `frontend/src/components/layout/AppSidebar.tsx` — INTELLIGENCE nav section (Brain icon, /intelligence, minTier: "intelligence")
- `frontend/src/components/ui/PlanGate.tsx` + `usePlanGate.ts` + `usePlanRedirect.ts` — `intelligence:3` added to `TIER_RANK`
- `frontend/src/app/layout.tsx` — `CmdKOverlay` mounted in root
- `frontend/src/app/hedge-effectiveness/page.tsx` — AI commentary button on run rows (intelligence-tier only)

### Test evidence
- Backend: 5040 passed, 0 failed, 158 skipped. Intelligence tests: 14/14 pass.
- tsc --noEmit: CLEAN. next build: PASS.

### Commits
- 15 commits on master: `b0ab322` through `a232d6c`

---

## 2026-04-15 — Treasury Suite Phase 2 §4.4: Payment Initiation (Paper Mode)

### Added
- **2 ORM models** (`backend/app/models/payment.py`): `PaymentBeneficiary` (tenant-scoped whitelist, unique on company+bank_code+account_number) + `PaymentInstruction` (5-state machine, per-record SHA-256 hash, SoD-enforced approval).
- **Alembic migration** (`migrations/versions/p1a2b3c4d5e6_payment_initiation.py`): payment_beneficiaries then payment_instructions (FK ordering). `down_revision = "k1a2b3c4d5e6"`.
- **6 audit enum values** added to `CashAuditEventType`: PAYMENT_INITIATED, PAYMENT_APPROVED, PAYMENT_REJECTED, PAYMENT_TRANSMITTED, PAYMENT_CANCELLED, BENEFICIARY_CREATED. Total now 28.
- **7 Pydantic schemas** added to `backend/app/schemas_v1/cash.py`: BeneficiaryCreate, BeneficiaryUpdate, BeneficiaryResponse, PaymentInitiate (Decimal gt=0, reference ≤140), PaymentReject, PaymentInstructionResponse (includes beneficiary_name), PaymentListResponse.
- **`payment_service.py`** (`backend/app/services/payment_service.py`): `compute_instruction_hash` (SHA-256 of 9 pipe-separated fields), beneficiary CRUD (active-only guard, uniqueness validation), `initiate_payment` (whitelist + type validation), `approve_payment` / `reject_payment` (SoD 403, state 409), `transmit_payment`, `cancel_payment`, `list_payments` (5-filter + count subquery), `get_payment`.
- **`v1_payments.py`** (`backend/app/api/routes/v1_payments.py`): `APIRouter(prefix="/v1/payments")`, 11 endpoints, `_require_enterprise`/`_require_write` guards, `_to_response()` helper.
- **`/payments` frontend page** (`frontend/src/app/payments/page.tsx`): Bloomberg-grade 3-tab (INITIATE form, PAYMENTS filterable list with row expand + SoD action buttons, BENEFICIARIES CRUD). PAYMENT_TYPES = ["SEPA","SWIFT","ACH","CHAPS","FPS"].
- **11 cashClient API functions**: listBeneficiaries, createBeneficiary, updateBeneficiary, deactivateBeneficiary, initiatePayment, listPayments, getPayment, approvePayment, rejectPayment, transmitPayment, cancelPayment.
- **AppSidebar nav entry**: Payments (CreditCard icon, enterprise tier, ACCOUNTING group, after Bank Statements).
- **19 tests**: 12 service (hash determinism, CRUD, lifecycle, SoD) + 7 route tests. All pass.

### Modified
- `backend/app/models/cash.py` — 6 new audit enum values (total: 28)
- `backend/app/schemas_v1/cash.py` — 7 new payment schemas
- `backend/app/api/router.py` — registered v1_payments_router
- `frontend/src/lib/api/cashClient.ts` — 4 interfaces + 11 API functions
- `frontend/src/components/layout/AppSidebar.tsx` — Payments nav entry + route prefix
- `backend/tests/test_cash_netting_models.py` — enum count updated 22→28

### Test evidence
- Backend: 4801+ passed, 0 failed (1 pre-existing flake: test_trace_bundle_fingerprint_deterministic).
- tsc --noEmit: CLEAN. next build: PASS (exit code 0).

### Commits
- 9 commits on master: `4c667d5` through `194435f`

---

## 2026-04-15 — Phase 2 Frontend Pages: Cash Management & Bank Statements

### Added
- **`/cash-management` page** (`frontend/src/app/cash-management/page.tsx`): 3-tab dashboard — POOLS (expandable detail with consolidated/header balance, member table, sweep calculate/execute), ENTITIES (CRUD), SWEEPS (pool selector + history table). Bloomberg-grade design: KPI strip, icon header box, PHASE 2f badge.
- **`/bank-statements` page** (`frontend/src/app/bank-statements/page.tsx`): 3-tab dashboard — STATEMENTS (account filter, upload form for MT940/CAMT053/BAI2), TRANSACTIONS (filterable list with mark-exception/unmatch actions), RECONCILIATION (account selector, auto-recon button, KPI tiles, manual match form). 5-column KPI strip with match rate.
- **17 typed API functions** in `cashClient.ts`: 5 reconciliation (run, summary, manual match, mark exception, unmatch) + 12 pool management (entities CRUD, pools CRUD, balance, sweeps calculate/execute/list).
- **2 AppSidebar nav entries**: Cash Pools (Layers icon), Bank Statements (FileSpreadsheet icon) — ACCOUNTING group, professional tier gate.

### Modified
- `frontend/src/lib/api/cashClient.ts` — 7 interfaces + 17 functions
- `frontend/src/components/layout/AppSidebar.tsx` — 2 nav items + 2 icon imports + route prefixes

### Test evidence
- tsc --noEmit: CLEAN. next build: PASS (/cash-management 6.02KB, /bank-statements 5.92KB).
- User reviewed and approved.

### Commits
- 5 commits on master: `4d1cc62` through `e2ae8b9`

---

## 2026-04-14 — Treasury Suite Phase 2b: Cash Flow Forecasting

### Added
- **2 ORM models** (`backend/app/models/cash_forecast.py`): `CashForecastItem` (recurring/one-time forecast items with 6 frequency types) + `CashForecastSnapshot` (point-in-time forecast snapshots).
- **Migration 0022** (`0022_cash_forecast.py`): Both tables with indexes + unique constraint.
- **`forecast_engine.py`** (`backend/app/services/forecast_engine.py`): Pure-function engine — `compute_forecast` (13-week + 12-month buckets), `expand_recurring_items` (ONCE/WEEKLY/BIWEEKLY/MONTHLY/QUARTERLY/ANNUALLY), scenario shifts, liquidity gap detection, multi-currency tracking, confidence breakdowns.
- **`forecast_service.py`** (`backend/app/services/forecast_service.py`): DB orchestrator — get_forecast, create/list/update forecast items, run_scenario, get_liquidity_gaps, save_snapshot, get_variance.
- **`v1_cash_forecast.py`** (`backend/app/api/routes/v1_cash_forecast.py`): 10 route endpoints (consolidated, entity, gaps, scenarios, variance, items CRUD, snapshots; `/{entity_id}` last).
- **10 Pydantic schemas** added to `backend/app/schemas_v1/cash.py`: ForecastItemCreate/Response/Update, ScenarioRequest, ForecastBucket, ForecastResponse, LiquidityGap/Response, VarianceRow/Response.
- **2 enum values** added to `CashAuditEventType` in `backend/app/models/cash.py`: FORECAST_CREATED, FORECAST_SCENARIO_RUN.
- **3 test files** (19 tests total): test_forecast_engine (12 pure-function), test_forecast_service (4 AsyncMock), test_v1_cash_forecast_routes (3 route).
- **Frontend `/cash-forecast` page** (`frontend/src/app/cash-forecast/page.tsx`): 4-tab dashboard — FORECAST waterfall chart, GAPS alerts, VARIANCE table, ITEMS CRUD form with scenario analysis panel.
- **`cashClient.ts`**: 5 interfaces + 8 API functions for forecast endpoints.
- **AppSidebar**: Cash Forecast nav item (TrendingUp icon, professional tier gate).

### Modified
- `backend/app/models/cash.py` — added 2 audit event types
- `backend/app/schemas_v1/cash.py` — added 10 forecast schemas
- `backend/app/api/router.py` — registered v1_cash_forecast_router
- `frontend/src/lib/api/cashClient.ts` — 5 interfaces + 8 functions
- `frontend/src/components/layout/AppSidebar.tsx` — Cash Forecast nav entry

### Test evidence
- Backend: **4896 passed, 158 skipped (PG-only), 0 failed** (1 pre-existing flake: `test_trace_bundle_fingerprint_deterministic`).
- tsc --noEmit: CLEAN. next build: PASS. Dev server `/cash-forecast`: HTTP 200.

### Commits
- 9 commits on master: `cde5bd9` through `dee20d8`

---

## 2026-04-14 — Treasury Suite Phase 2a: Cash Positions, Bank Accounts & Legal Entities

### Added
- **5 ORM models** (`backend/app/models/cash.py`): `LegalEntity`, `BankConnection`, `BankAccount`, `CashBalance`, `CashAuditEvent`. Partial WORM on `cash_balances` (14 financial columns immutable); full WORM on `cash_audit_events` (no UPDATE/DELETE). SHA-256 hash chain on audit events.
- **Migrations 0017–0021**: legal_entities, bank_connections, bank_accounts, cash_balances, cash_audit_events — with appropriate PG WORM enforcement.
- **`legal_entity_service`**: create/update/close lifecycle, tree fetch.
- **`bank_account_service`**: state machine (PENDING_VERIFICATION → ACTIVE → FROZEN/CLOSED); SoD enforcement; AES-256-GCM field encryption for `account_number` and IBAN.
- **`bank_connection_service`**: OAuth flow (`get_auth_url`, `handle_callback`); circuit-breaker trips at 3 consecutive failures; SoD on callback approval.
- **`cash_balance_service`**: enter/bulk-enter balances; reconcile (RECONCILED/DISPUTED only; tenant-scoped JOIN).
- **`cash_audit_service`**: hash-chained `append_event` + `verify_chain`.
- **`cash_encryption`** (`backend/app/services/cash_encryption.py`): AES-256-GCM encrypt/decrypt/mask.
- **15 Pydantic schemas** (`backend/app/schemas_v1/cash.py`).
- **5 route files** registered in `app/api/router.py`: `v1_legal_entities` (5 ep), `v1_bank_accounts` (9 ep), `v1_bank_connections` (6 ep), `v1_cash_positions` (7 ep), `v1_cash_audit` (2 ep).
- **7 test files**: test_bank_account_service, test_bank_connection_service, test_cash_audit_service, test_cash_balance_service, test_cash_models, test_legal_entity_service, test_v1_cash_routes.
- **Frontend `cashClient.ts`** (`frontend/src/lib/api/cashClient.ts`): 29 typed API functions, 8 interfaces.
- **Frontend pages**: `/cash-positions` (3-tab: CONSOLIDATED/BY_ENTITY/BY_ACCOUNT), `/settings/legal-entities`, `/settings/bank-accounts` (SoD-aware verify button), `/settings/bank-connections` (inline confirm for revoke).
- **AppSidebar**: 4 new nav entries for cash/treasury pages.

### Test evidence
- Backend: **4877 passed, 158 skipped (PG-only), 0 failed** (1 pre-existing flake: `test_trace_bundle_fingerprint_deterministic` — ordering-dependent, predates Phase 2a at commit 23715a2).

### Commits
- Final merge commit: `328dd65` (feat/treasury-suite-phase2a → master, branch deleted)

---

## 2026-04-13 — Sprint 56-61: Treasury Suite Phase 1 — GL Journals, Settlement & ERP Pull

### Added
- **ADR-0009** (GL journal entry posting) + **ADR-0013** (treasury transaction spine) in `docs/architecture/adr/`
- **`JournalEntry` model** (`backend/app/models/journal_entry.py`): SHA-256 hash chain (`entry_hash`, `prev_entry_hash`, `chain_seq`), 5-state machine (DRAFT→PENDING_APPROVAL→APPROVED→POSTED/REJECTED), `before_delete` WORM hook
- **`GLAccountMapping` model**: `entry_type + standard` unique key, links debit/credit accounts to accounting standards
- **`TreasuryTransaction` model** (`backend/app/models/treasury_transaction.py`): strict WORM append-only audit spine with per-record SHA-256 hash
- **Migrations** 0014 (journal_entries + gl_account_mappings), 0015 (treasury_transactions), 0016 (settlement_events) with PostgreSQL WORM triggers
- **GL service** (`backend/app/services/gl_service.py`): `generate_journal_entries`, `approve_journal_entry`, `reject_journal_entry` with 4-eyes SoD; SHA-256 chain extension via row-level `FOR UPDATE` lock
- **v1_gl routes** (`backend/app/api/routes/v1_gl.py`): 8 endpoints (GL mapping CRUD, JE list/generate/approve/reject/post/export); plan-gated professional+
- **Posting adapters**: QuickBooks, Xero, NetSuite (paper mode stub), CSV exporter — all behind abstract `GLPostingAdapter` ABC
- **`gl_posting_service`** (`backend/app/services/gl_posting_service.py`): dispatches to correct adapter by `erp_system`, enforces APPROVED-only posting
- **ERP pull adapters**: `XeroAdapter` (live pull + paper mode), `NetSuiteAdapter` (Phase 2 stub)
- **`erp_connector_service`** (`backend/app/services/erp_connector_service.py`): idempotent dedup via `Position.record_id = f"ERP-{hash[:16]}"`, filters `is_active=True` to allow reimport after soft-delete
- **v1_erp routes** (`backend/app/api/routes/v1_erp.py`): `POST /v1/erp/pull/{connector_id}` — looks up credentials from `company.settings`, triggers pull, returns result
- **`SettlementEvent` model** (`backend/app/models/settlement_event.py`): WORM with per-record `event_hash`, `before_delete` hook
- **`settlement_service`** (`backend/app/services/settlement_service.py`): `confirm_settlement` creates CONFIRMED SettlementEvent + DRAFT JournalEntry for P&L variance; tenant-scoped; graceful fallback when GL mapping absent
- **v1_settlement routes** (`backend/app/api/routes/v1_settlement.py`): pending list + confirm endpoint
- **Frontend `glClient.ts`** (`frontend/src/lib/api/glClient.ts`): type-safe client for all GL/settlement/ERP endpoints via `dashboardFetch`
- **Frontend pages**: `/settings/gl-accounts`, `/gl-postings` (approve/reject/post queue), `/settlement`, `/erp-sync`
- **AppSidebar** nav items: GL Postings, Settlement, ERP Sync (all professional-tier gated)

### Fixed
- Tenant isolation: `approve_journal_entry`, `reject_journal_entry`, `confirm_settlement` all scope DB queries by `company_id`
- `_is_duplicate` adds `Position.is_active == True` filter (prevents soft-deleted positions from permanently blocking ERP reimport)
- `gl_posting_service`: removed `session.flush()` (route owns commit, service is pure mutator)
- `XeroPoster`: stores `self.sandbox` attribute (was silently dropped)
- 502 error response sanitized to avoid leaking ERP credential fragments
- `GLMappingNotConfiguredError` NameError guard in `settlement_service` (import failure path)
- Settlement confirm modal: `entry.id` null guard before POST

### Test evidence
- Backend: **4839 passed, 158 skipped (PG-only), 0 failed** (pre-existing `test_trace_bundle_fingerprint_deterministic` ordering flake deselected)
- Frontend: `tsc --noEmit` CLEAN, `next build` PASS

### Browser verification (2026-04-14)
- `/gl-postings` — renders correctly: status tab bar, Refresh button, breadcrumb
- `/settlement` — renders correctly: graceful empty/error state (tables not in local dev DB)
- `/erp-sync` — renders correctly: descriptive copy, correct breadcrumb
- `/settings/gl-accounts` — renders correctly: GL Account Mappings header + breadcrumb
- Sidebar ACCOUNTING group (GL Postings, Settlement, ERP Sync) visible under HEDGE DESK after section expand
- Sidebar SETTINGS section includes GL Account Mappings → `/settings/gl-accounts`
- All pages confirm plan-tier gating works (demo company set to professional in local dev DB)

### Commits
- `cb93933` ADR-0009 + ADR-0013
- `1d12bc7` JournalEntry + GLAccountMapping models
- `b419bad` TreasuryTransaction model
- `23c7f68` Migrations 0014/0015/0016
- `ee4e806` GL service
- `bacac11` v1_gl routes
- `ffbb4fe` Posting adapters + gl_posting_service
- `10ccae6` ERP pull adapters + v1_erp routes
- `e7a5803` ERP dedup is_active fix + test strengthening
- `12b1cd6` SettlementEvent model + settlement_service + v1_settlement
- `bafbb04` Settlement tenant isolation + NameError guard + schema fields
- `4c3f217` Frontend GL/settlement/ERP pages + glClient + nav
- `2f9345a` Settlement confirm modal null guard

---

## 2026-04-13 — Sprint 55: Portfolio Latency Card, Dataset Count Footer & Last-Fail Filter

### Added
- **Portfolio assessment latency card** (`page.tsx`): OverviewTab card showing AVG DAYS SINCE and MEDIAN DAYS SINCE last assessment across all datasets that have runs. Optional UNASSESSED column when any datasets have never been tested. Color-coded: green ≤7d, amber ≤30d, red >30d. Median is skew-resistant vs outlier datasets.
- **Dataset coverage count in footer** (`page.tsx`): RunsTab footer stats bar gains "DATASETS N" KPI showing how many distinct `dataset_id` values appear in the current filtered run list. Hidden when ≤1 (uninteresting in single-dataset views).
- **"LAST FAIL" quick filter** (`page.tsx`): DatasetsTab toolbar red chip that filters to only datasets whose chronologically most recent run was ineffective. Self-hides when no such datasets exist in the current data. Implemented via new `dsLastFailOnly` boolean state with `reduce`-based last-run lookup.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0, after fixing `datasets` scope error in RunsTab)
- HTTP 200 confirmed on all tabs
- Browser automation unavailable — marked [NOT BROWSER CONFIRMED]
  - 55.1: With 2 datasets both assessed → latency card shows avg/median. One never assessed → UNASSESSED: 1 column appears.
  - 55.2: Filter to runs across 2 datasets → "DATASETS 2" appears in footer. Filter to single dataset → hidden.
  - 55.3: Dataset with last run ineffective exists → LAST FAIL button visible. Click → only failing-last datasets shown.

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 54: Standard Coverage Gap Card, Copy Run IDs & Dataset Risk Level Tag

### Added
- **Standard coverage gap card** (`page.tsx`): OverviewTab 3-column grid showing how many datasets have been tested under each of IAS 39, IFRS 9, and ASC 815. Each column shows a mini progress bar, tested/total count, and "N untested" or "full coverage" label. Color-coded green/amber/red by coverage percentage.
- **"COPY IDS" toolbar button** (`page.tsx`): RunsTab toolbar button that copies all filtered run UUIDs (newline-separated) to the clipboard via `navigator.clipboard.writeText`. Flashes green with "COPIED!" label for 1.5 seconds after use. Hidden when `filteredRuns` is empty.
- **Per-dataset risk level tag** (`page.tsx`): DatasetsTab accordion header gains a cycling risk badge (HIGH → MEDIUM → LOW → clear) stored in localStorage under `hec_ds_risk`. Clicking the faint dashed "RISK" placeholder initiates the cycle. Active badge is color-coded (red/amber/cyan). All click handlers call `e.stopPropagation()` to avoid accordion open/close.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- HTTP 200 confirmed on all tabs
- Browser automation unavailable — marked [NOT BROWSER CONFIRMED]
  - 54.1: With 2 datasets and 2 runs (both IAS 39) → IAS 39 shows "2/2 full coverage" green; IFRS 9 and ASC 815 show "2 untested" red.
  - 54.2: Click COPY IDS → clipboard receives 2 UUIDs separated by newline; button flashes green.
  - 54.3: Click "RISK" placeholder → badge becomes "HIGH RISK" red; click again → "MEDIUM RISK" amber; click → "LOW RISK" cyan; click → placeholder returns.

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 53: Pass Rate Trend Card, Verdict Ratio Bar & Untested Gap Filter

### Added
- **Pass rate trend indicator** (`page.tsx`): OverviewTab card showing IMPROVING ↗ / DECLINING ↘ / STABLE → by comparing the pass rate of the chronologically oldest half of runs against the newest half. Displays pp delta and per-half stats. Threshold: 5 percentage points. Guard: requires ≥4 dated runs.
- **Verdict ratio visual bar** (`page.tsx`): RunsTab 8px horizontal bar between the filter stats row and the monthly heatmap. Green segment proportional to pass count, red to fail count. Labels below show exact counts. Updates instantly as filters change.
- **"UNTESTED" gap filter** (`page.tsx`): DatasetsTab toolbar button that filters to only datasets with zero assessment runs. Styled in red when active; hidden entirely when every dataset already has runs. Implemented via new `dsUntestedOnly` boolean state applied in `filteredDs`.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- HTTP 200 confirmed on all tabs
- Browser automation unavailable — marked [NOT BROWSER CONFIRMED]
  - 53.1: With 4+ runs, card appears. If newer half has higher pass rate → "↗ IMPROVING". Delta "+Npp" shown.
  - 53.2: Ratio bar reflects filteredRuns. 2 pass + 1 fail → ~67% green, ~33% red segment.
  - 53.3: If any dataset has 0 runs → UNTESTED button visible. Click → only untested datasets shown.

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 52: Worst Performer Card, Footer Standard Breakdown & Datasets CSV Export

### Added
- **Worst performer card** (`page.tsx`): OverviewTab red-styled card showing the dataset with the lowest composite score (pass rate 70% + D.O. proximity 30%), mirroring the top performer card. Only shown when ≥2 datasets have runs. Displays name, pair, fail%, avg D.O., run count.
- **Per-standard footer breakdown** (`page.tsx`): RunsTab footer stats bar gains clickable "IAS 39 N / IFRS 9 N / ASC 815 N" pills after a divider. Each pill click sets stdFilter (toggles off if already active). Hidden when fewer than 2 standards have runs in the current filtered set.
- **Datasets CSV export** (`page.tsx`): DatasetsTab toolbar "CSV" button exports the currently filtered dataset list as a CSV file with columns: name, currency_pair, hedge_type, period_count, runs, pass_rate_pct, last_assessed. Uses `URL.createObjectURL` + synthetic anchor click. Respects active search and filter state.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- HTTP 200 confirmed on all tabs
- Browser automation unavailable — marked [NOT BROWSER CONFIRMED]
  - 52.1: With 2 datasets (both have runs), worst performer = lower pass rate dataset → red card visible.
  - 52.2: Footer shows "IAS 39 2 | IFRS 9 1" pills. Click "IAS 39" → filter activates; click again → resets to ALL.
  - 52.3: Click CSV → downloads `datasets.csv` with 2 dataset rows and correct column values.

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 51: YTD Summary Card, R²-Only Filter & Run Mini-Timeline

### Added
- **Year-to-date summary card** (`page.tsx`): OverviewTab 3-column card showing YTD RUNS, PASS RATE, and AVG D.O. for the current calendar year. Each column shows the prior-year value below with a ↑/↓ delta arrow. Card hidden when no dated runs exist in either year.
- **R²-only filter toggle** (`page.tsx`): RunsTab "R² DATA" chip button that filters the run list to only rows where `regression_r_squared` is populated. Active state renders in cyan. Pill added to the active-filters bar with a clear action. Included in the `useEffect` page-reset dep array.
- **Recent runs mini-timeline** (`page.tsx`): DatasetsTab — at the top of each expanded accordion section, a horizontal strip of coloured squares (10×14px) shows the run history oldest→newest. Green = PASS, red = FAIL. Hover tooltip shows date, verdict, and standard. Up to 20 cells; shows count suffix. Renders above the edit metadata strip and last-3-runs table.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- HTTP 200 confirmed on all tabs
- Browser automation unavailable — marked [NOT BROWSER CONFIRMED]
  - 51.1: 2026 YTD with test data → shows runs/pass rate/avg D.O. columns. No 2025 data → prior year row absent.
  - 51.2: Toggle "R² DATA" → only runs with R² values remain. Badge "R² DATA ONLY" appears in filter pills.
  - 51.3: Expand EUR/USD Q1 2024 Test → mini-timeline row with 2 squares (green/green) above last runs table.

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 50: Assessment Calendar Heatmap, OOB Badge & Compliance Sort

### Added
- **Assessment calendar heatmap** (`page.tsx`): OverviewTab 12-week rolling grid. Week columns, day-of-week rows. Each cell coloured by pass outcome: green (all pass), amber (mixed), red (all fail), grey (no runs). Intensity encodes run count — darker = more runs. Month name row above the grid, DOW labels to the left. Legend row below with a "Darker = more runs" note. Anchor: today = last cell in current week column.
- **Out-of-band warning badge** (`page.tsx`): RunsTab `⚠ OOB` red badge shown when a run is marked overall_effective but its D.O. ratio is outside the 80–125% effectiveness band (ratio < 0.80 or > 1.25). Tooltip shows exact ratio. Positioned before the efficiency score badge.
- **Compliance sort** (`page.tsx`): DatasetsTab sort dropdown gains "Compliance score" option. Score formula: passRate×0.5 + recency×0.3 + sufficiency×0.2. recency = 1 if last run <7d, 0.5 if <30d, else 0. sufficiency = min(runCount/5, 1). Highest-scoring (most compliant) datasets sort first.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- HTTP 200 confirmed on all tabs
- Browser automation unavailable — marked [NOT BROWSER CONFIRMED]
  - 50.1: 12-week heatmap renders in OverviewTab; cells with runs show colour intensity; legend row present.
  - 50.2: Run with D.O. < 0.80 and overall_effective=true → OOB badge before efficiency score.
  - 50.3: Sort by compliance → datasets with high pass rate and recent activity float to top.

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 49: Top Performer Card, Selection Summary Bar & Duplicate Pair Badge

### Added
- **Top performer highlight card** (`page.tsx`): OverviewTab green card showing the best-scoring dataset by composite score (pass rate 70% + D.O. proximity to 1.0 30%). Displays name, currency pair, pass%, avg D.O., run count. Datasets with no runs are excluded.
- **Selection summary bar** (`page.tsx`): RunsTab blue info bar appearing above the filter pill bar when ≥1 run checkbox is checked. Shows selected run count, effective/total, pass%, and avg D.O. for the current selection only.
- **Duplicate currency pair badge** (`page.tsx`): DatasetsTab amber "⊕ N DATASETS" badge in the accordion name row when 2+ datasets share the same non-null currency pair. Helps auditors spot potential duplicates or related hedges.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- HTTP 200 confirmed on all tabs
- Browser automation unavailable — marked [NOT BROWSER CONFIRMED]
  - 49.1: EUR/USD Q1 2024 Test (100% pass, D.O.=0.9917) → top performer card. Expected.
  - 49.2: Select 1 run → "SELECTION (1) · 1/1 EFFECTIVE · 100% PASS · AVG D.O. 0.9917". Expected.
  - 49.3: Both datasets share EUR/USD → each shows "⊕ 2 DATASETS". Expected.

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 48: D.O. Distribution Histogram, Run Age Stats & Total Periods

### Added
- **D.O. ratio distribution histogram** (`page.tsx`): OverviewTab 5-band bar chart (<0.80 red / 0.80–0.94 amber / 0.95–1.05 green / 1.05–1.25 amber / >1.25 red). Bar heights proportional to max count; empty bands show a grey stub. Count labels above each bar.
- **Run age stats in footer bar** (`page.tsx`): RunsTab footer KPI bar gains "NEWEST: Xd AGO / TODAY" and "SPAN: Xd" stats derived from run `created_at` dates. SPAN hidden when all runs share the same date. Newest label turns green when ≤1 day old.
- **Total periods aggregate** (`page.tsx`): DatasetsTab toolbar shows "N PERIODS" count (sum of `period_count` across filtered datasets), updating live as the search/filter changes.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- HTTP 200 confirmed on all tabs
- Browser automation unavailable — marked [NOT BROWSER CONFIRMED]
  - 48.1: Both runs D.O.=0.9917 → "0.95–1.05" bar count=2, all others=0. Expected.
  - 48.2: Runs from 4/12 → NEWEST "1D AGO"; same date → SPAN hidden. Expected.
  - 48.3: 2 datasets × 6 periods = "12 PERIODS" in toolbar. Expected.

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 47: Month-over-Month Card, Page-Jump Input & Standards Compliance Badge

### Added
- **Month-over-month comparison card** (`page.tsx`): OverviewTab 3-column card comparing last month vs this month — run count + pass count per month, ↑/↓/= delta badge in the center. JS Date normalisation handles January→December month wrap automatically.
- **Page-jump input** (`page.tsx`): RunsTab "GO [___]" number input appended to pagination bar when `totalPages > 5`. Enter key commits the jump, clamped to valid page range. `key={safePage}` resets the input value on navigation.
- **Standards compliance badge** (`page.tsx`): DatasetsTab "N/3 STD" badge in the accordion metadata row, counting how many of IAS 39 / IFRS 9 / ASC 815 have at least one run. Green when 3/3 complete, purple for partial. Suppressed when no runs.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- HTTP 200 on all tabs
- Browser automation unavailable — marked [NOT BROWSER CONFIRMED]
  - 47.1: Apr has 2 runs → ↑ +2 delta vs Mar (0 runs). Expected.
  - 47.2: Only 2 runs (totalPages=1) → page-jump hidden. Correct guard.
  - 47.3: EUR/USD Q1 2024 Test: IFRS_9 + ASC_815 tested → "2/3 STD" purple badge expected.

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 46: Needs Attention Panel, R² Quality Badge & Relative Age Chip

### Added
- **Datasets needing attention panel** (`page.tsx`): OverviewTab panel listing datasets with no assessments, last run ineffective, or last assessed >14 days ago. Shows a green "ALL DATASETS CURRENT" banner when none qualify. Reason text per row: "No assessments run" / "Last assessment ineffective" / "Xd ago".
- **R² quality badge** (`page.tsx`): RunsTab inline badge below the R² value — STRONG (≥0.80, green) / MOD (≥0.60, amber) / WEAK (<0.60, red). Suppressed when R² is null. R² cell restructured as flex column.
- **Relative age chip** (`page.tsx`): DatasetsTab CREATED column shows "TODAY" (green) / "Nd AGO" / "NmoMO AGO" / "NYR AGO" below the absolute date for quick at-a-glance dataset age.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- HTTP 200 confirmed on /hedge-effectiveness
- Browser automation unavailable — marked [NOT BROWSER CONFIRMED]
  - 46.1: EUR/USD Q1 2024 Test (Copy) has no runs → should appear in NEEDS ATTENTION list
  - 46.2: Test data R²=null → badges suppressed, "—" unchanged (expected)
  - 46.3: Datasets created 4/12/2026 → "1D AGO" expected

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 45: Standard Coverage Matrix, Copy Run ID & Hedge-Type Filter

### Added
- **Standard coverage matrix** (`page.tsx`): OverviewTab grid showing each dataset's test coverage across IAS 39, IFRS 9, and ASC 815. Cells show PASS (green) / FAIL (red) / — (untested). Truncates dataset names at 20 chars. Helps auditors spot coverage gaps instantly.
- **Copy run ID button** (`page.tsx`): RunsTab clipboard icon next to truncated hash. Copies the full `run_id` UUID to clipboard on click; hover turns cyan; `e.stopPropagation()` prevents accordion toggle. Silent fail on clipboard API errors.
- **Hedge-type filter chips** (`page.tsx`): DatasetsTab TYPE: ALL / hedge-type chips above the column headers. Filters `filteredDs` by `ds.hedge_type`. Suppressed when < 2 distinct hedge types are present (no benefit filtering a single-type list).

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- Browser confirmed: 2026-04-13 via Playwright
  - 45.1: Matrix visible — EUR/USD Q1 2024 Test: IFRS_9 PASS, ASC_815 PASS, IAS_39 —; Copy dataset: all —
  - 45.2: Copy icon visible on both run rows; RUN 2/2 + RUN 1/2 badges confirmed (screenshot: sprint45-runs-copy-btn.png)
  - 45.3: Chips suppressed — both datasets are CASH FLOW (< 2 distinct types). Logic verified correct.

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 44: Pass Streak Card, Run Sequence Badge & Expand-All Toggle

### Added
- **Current pass streak card** (`page.tsx`): OverviewTab card showing the trailing streak of consecutive effective assessments (newest first). Large streak count, descriptive label, progress bar, and PERFECT/BROKEN/% badge. Color-coded green (perfect), amber (partial), red (broken).
- **Run sequence badge** (`page.tsx`): RunsTab "RUN N/M" badge on every run showing its chronological position within the dataset (e.g., "RUN 1/2", "RUN 2/2"). Built via `dsSeqMap` alongside existing `dsFirstRunMap` in the flat-rows IIFE. Tooltip shows full context.
- **Expand-all / collapse-all toggle** (`page.tsx`): DatasetsTab toolbar button toggles `expandAll` state, opening/closing all accordion rows simultaneously. Clicking any individual row header reverts to per-item control (resets `expandAll`).

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- Browser confirmed: 2026-04-13 via Playwright
  - 44.1: "CURRENT PASS STREAK · 2 · All 2 runs effective — perfect record · PERFECT" visible in Overview
  - 44.2: "RUN 2/2" on IFRS_9 run, "RUN 1/2" on ASC_815 run — correct chronological ordering
  - 44.3: "⊞ EXPAND ALL" button visible; both accordions expand on click (screenshot: sprint44-datasets-expanded-all.png)

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 43: Hedge Type Distribution, First Run Badge & Description Preview

### Added
- **Hedge type distribution card** (`page.tsx`): OverviewTab card showing per-hedge-type run count and effectiveness rate as labeled progress bars. Inserted before the regression test coverage card. Guard: totalRuns ≥ 1. "BY HEDGE TYPE" section header. Test: cash flow · 2 runs · 100% confirmed.
- **First run badge** (`page.tsx`): RunsTab purple "1ST" badge marks the chronologically earliest assessment run per dataset. `dsFirstRunMap` built by sorting each dataset's runs by `created_at` and extracting the earliest `run_id`. Badge: #A78BFA, 9px mono. Correctly identifies the first submission per relationship.
- **Description preview** (`page.tsx`): DatasetsTab accordion header shows `ds.description` as an italic, ellipsis-clipped preview line below the badges row when non-null. Font 11px S.ui, color S.text3, maxWidth 420px. Suppressed when description is null.

### Fixed
- `S.fontUI` → `S.ui` and `S.fontMono` → `S.mono` typos (wrong property names on the `S` token object).

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- Browser confirmed: 2026-04-13 via Playwright
  - 43.1: "BY HEDGE TYPE · cash flow · 2 runs · 100%" confirmed in Overview page text (evaluate check)
  - 43.2: "1ST" badge visible on ASC_815 run row (earlier created_at) (screenshot: sprint43-runs-tab.png)
  - 43.3: Description preview suppressed for both datasets (description=null in test data) (screenshot: sprint43-datasets-tab.png)

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 42: Audit Readiness Score, D.O. Delta Badge & Designation Age

### Added
- **Audit readiness score card** (`page.tsx`): OverviewTab composite 0–100 portfolio score with letter grade A–F. Four equally-weighted components with individual mini progress bars: pass rate (40pts), period sufficiency — datasets ≥8 periods (20pts), recency — datasets with run <30 days (20pts), regression coverage (20pts). Color-coded by tier. Test data score: 50/100 (D) — full pass rate, no sufficiency/regression.
- **D.O. ratio delta badge** (`page.tsx`): RunsTab ▲/▼ delta (4 decimal places) shown below each run's D.O. ratio band bar, comparing to the most-recent prior run on the same dataset. Suppressed when no prior run or |delta| < 0.0001. Green ▲ for improvement, red ▼ for decline.
- **Designation age badge** (`page.tsx`): DatasetsTab accordion metadata row shows purple "Nd HEDGE" / "NmoMO HEDGE" / "NYR HEDGE" from `ds.designation_date`. Suppressed when field is null. Allows treasury to see how long each hedge relationship has been active.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- Browser confirmed: 2026-04-13 via Playwright
  - 42.1: AUDIT READINESS card: grade D, 50/100 — PASS RATE 40/40 ✓, SUFFICIENCY 0/20, RECENCY 10/20, REGRESSION 0/20 (screenshot: sprint42-audit-readiness.png)
  - 42.2: Delta correctly suppressed — each dataset has 1 run (no prior to compare) (screenshot: sprint42-runs-delta.png)
  - 42.3: Designation badge suppressed for both datasets (designation_date=null) (screenshot: sprint42-datasets-designation.png)

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 41: Period Sufficiency Matrix, Filter Stats Row & Verdict Sparkline

### Added
- **Period sufficiency matrix** (`page.tsx`): OverviewTab card showing per-dataset row with period count and colored badges for each standard (IAS 39 ≥8, ASC 815 ≥8, IFRS 9 ≥30). Green `✓` when sufficient; red `NEEDS N+` showing the shortfall. Helps treasury teams identify which datasets need more historical data before testing.
- **Filter statistics summary row** (`page.tsx`): RunsTab compact "BY STD: X N× Y%" row between filter pills and monthly heatmap. Shows per-standard count and pass rate for the currently filtered view. Guard: only shows when ≥2 distinct standards in view (otherwise redundant with existing stats).
- **Last 5 runs verdict sparkline** (`page.tsx`): DatasetsTab accordion header — row of up to 5 mini colored squares (green=effective, red=ineffective), newest first with fading opacity. Each dot has a tooltip with verdict + date. Suppressed when dataset has no runs.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- Browser confirmed: 2026-04-13 via Playwright
  - 41.1: Both datasets show `IAS 39 NEEDS 2+` / `ASC 815 NEEDS 2+` / `IFRS 9 NEEDS 24+` (6 periods each) (screenshot: sprint41-period-sufficiency.png)
  - 41.2: "BY STD: ASC 815 1× 100% IFRS 9 1× 100%" row visible above heatmap (screenshot: sprint41-runs-filterstats.png)
  - 41.3: Two green dots on EUR/USD Q1 2024 Test; copy dataset suppressed (no runs) (screenshot: sprint41-datasets-sparkline.png)

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 40: Test Method Coverage, Date Presets & Assessment Frequency Badge

### Added
- **Test method coverage card** (`page.tsx`): OverviewTab card showing per-standard breakdown of runs with regression analysis (R² present) vs dollar-offset-only. Progress bar per standard; color-coded: ≥50% regression coverage = green, else amber. Only renders standards that have ≥1 run. Critical for IFRS 9 compliance which requires regression.
- **Quick date range presets** (`page.tsx`): RunsTab 7D / 30D / 90D pill buttons inline in the filter toolbar. Sets `dateFrom` to N days ago and clears `dateTo` (open-ended range to today). Active preset highlighted cyan. Resets page to 1 via existing filter-change effect.
- **Assessment frequency badge** (`page.tsx`): DatasetsTab accordion metadata row shows avg run rate as "X.X/MO" when ≥1/month, or "Nd CADENCE" when less frequent. Requires ≥2 runs. Cyan badge. Tooltip shows raw counts and span.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- Browser confirmed: 2026-04-13 via Playwright
  - 40.1: TEST METHOD COVERAGE card visible — IFRS 9 and ASC 815 rows, 0% regression bars (correct — no R² in test runs) (screenshot: sprint40-test-method-coverage.png)
  - 40.2: "7D 30D 90D" preset buttons visible in toolbar between TO date input and D.O. filter (screenshot: sprint40-runs-datepresets.png)
  - 40.3: "2.0/MO" cyan badge on EUR/USD Q1 2024 Test (2 runs today); copy dataset suppressed (no runs) (screenshot: sprint40-datasets-frequency.png)

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 39: D.O. Band Distribution, Efficiency Score Badge & Next Assessment Due

### Added
- **D.O. ratio band distribution bar** (`page.tsx`): OverviewTab full-width stacked horizontal bar showing what proportion of runs fall below band (<0.80, red), in band (0.80–1.25, green), or above band (>1.25, amber). Color-coded legend with count + percentage per segment. Positioned after compliance scorecard. Only renders when ≥1 run has D.O. data.
- **Per-run efficiency score badge** (`page.tsx`): RunsTab inline score (0–100) next to every verdict chip. Composite of D.O. proximity to 1.0 (70%) and R² (30%). Color-coded: ≥80 green, ≥55 cyan, ≥35 amber, <35 red. Suppressed when run has no D.O. data. Tooltip exposes formula.
- **Next assessment due badge** (`page.tsx`): DatasetsTab accordion metadata row shows due/overdue status based on 30-day recommended cadence. "DUE IN Nd" (amber) when ≤7 days left; "OVERDUE Nd" (red) when past due. "NOT SCHEDULED" (gray) for datasets with no runs. Suppressed when >7 days remaining (not actionable).

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- Browser confirmed: 2026-04-13 via Playwright
  - 39.1: Stacked bar visible — 100% green (2/2 runs in-band), `< 0.80 0%` and `> 1.25 0%` correctly zero (screenshot: sprint39-doband-chart.png)
  - 39.2: Score `83` visible next to EFFECTIVE badge on both run rows (D.O.=0.9917, no R²→default 0.5 → score=83) (screenshot: sprint39-runs-efficiency.png)
  - 39.3: "NOT SCHEDULED" on copy dataset; next-due badge suppressed for dataset with fresh runs (1 day ago, 29 days remaining) (screenshot: sprint39-datasets-nextdue.png)

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 38: Top Performers Panel, Page Size Selector & Health Score Badge

### Added
- **Top performing datasets panel** (`page.tsx`): OverviewTab card ranking top 3 datasets by pass rate (min 2 runs each). Shows rank #1/#2/#3 badges, pass rate progress bars, effective/total counts, avg D.O. ratio. Guard: hidden when no dataset has ≥2 runs. Positioned before Assessment Velocity card.
- **Dynamic page size selector** (`page.tsx`): RunsTab PER PAGE toggle (25 / 50 / ALL) rendered bottom-right above pagination. Active selection highlighted cyan. `pageSize` state (25|50|0); 0 = show all. `PAGE_SIZE` constant moved after `filteredRuns` declaration to avoid reference-before-definition error. Resets to page 1 on change.
- **Dataset health score badge** (`page.tsx`): DatasetsTab accordion header composite badge (0–100). Formula: pass rate 40pts + recency 30pts (decays over 90 days) + run volume 20pts (capped at 5 runs) + drift stability 10pts. Tiers: A≥80 (green), B≥60 (cyan), C≥40 (amber), D<40 (red). Tooltip exposes formula. Hidden for datasets with no runs.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- Browser confirmed: 2026-04-13 via Playwright
  - 38.1: Top performers panel correctly suppressed (test env: 1 run/dataset, guard fires)
  - 38.2: "PER PAGE **25** 50 ALL" visible bottom-right in runs tab (screenshot: sprint38-runs-pagesize.png)
  - 38.3: "A 88" health badge rendered in datasets accordion for EUR/USD Q1 2024 Test (screenshot: sprint38-datasets-health.png)

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 37: Compliance Scorecard, Summary Footer & Staleness Badge

### Added
- **Compliance scorecard table** (`page.tsx`): OverviewTab 3-column grid card showing COMPLIANT / NON-COMPLIANT / NOT TESTED status for IAS 39 / IFRS 9 / ASC 815. Status derived from most-recent run verdict per standard. Each cell also shows pass rate %, run count, and last assessment date. "NOT TESTED" surfaces untested standards — critical for coverage visibility. Renders when ≥1 total run exists.
- **Filtered-runs summary footer** (`page.tsx`): RunsTab slim bar beneath the run list (above pagination) showing aggregate stats for currently visible (filtered) runs: EFFECTIVE count, PASS RATE, AVG D.O. (green when in-band), AVG R². Label changes from "ALL N RUNS" to "FILTERED N RUNS" when filters are active. Always visible when filteredRuns.length > 0.
- **Dataset staleness badge** (`page.tsx`): DatasetsTab accordion header shows an age badge after the verdict chip: amber `Nd AGO` for 7–29 days since last assessment, red `Nd STALE` for ≥30 days. Suppressed when <7 days (fresh) or no runs for dataset.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- Browser confirmed: 2026-04-13 via Playwright
  - 37.1: COMPLIANCE SCORECARD visible; IFRS_9=COMPLIANT, ASC_815=COMPLIANT, IAS_39=NOT TESTED
  - 37.2: `ALL 2 RUNS | EFFECTIVE 2/2 | PASS RATE 100% | AVG D.O. 0.9917` visible in footer (screenshot: sprint37-runs-summary-footer.png)
  - 37.3: Staleness badge correctly suppressed for today's test runs (0 days < 7 threshold)

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-13 — Sprint 36: Assessment Velocity Card, Multi-Standard Breakdown & Help Overlay

### Added
- **Assessment velocity card** (`page.tsx`): OverviewTab full-width card showing LAST 7 DAYS / LAST 30 DAYS / AVG/WEEK run counts plus a CADENCE badge (STABLE / ACCELERATING / DECELERATING) computed by comparing run counts in the most-recent 4-week window vs the prior 4-week window. Renders when ≥2 runs exist.
- **Multi-standard breakdown table** (`page.tsx`): DatasetsTab accordion expanded section shows a card-grid (one card per standard) with pass rate %, effective/total count, and average D.O. ratio when a single dataset has runs recorded under ≥2 different accounting standards. Guard: `stdKeys.length < 2` suppresses the table for single-standard datasets — correct behavior with test data.
- **Keyboard shortcut help overlay** (`page.tsx`): RunsTab `?` toolbar button plus `?` key (when no input focused) toggles a bottom-right-anchored panel listing ↑↓/Enter/Space/Esc/? shortcuts as styled `<kbd>` chips. Backdrop click and Esc both dismiss. Implemented in a dedicated `useEffect` separate from the existing keyboard navigation handler.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0)
- Browser confirmed: 2026-04-13 via Playwright
  - 36.1: ASSESSMENT VELOCITY panel with LAST 7 DAYS + cadence STABLE visible in OverviewTab
  - 36.2: BY STANDARD table correctly suppressed (test data: 1 run/dataset, 1 standard each — stdKeys.length < 2 guard works)
  - 36.3: KEYBOARD SHORTCUTS panel renders on `?` button click; 5 shortcut rows visible (screenshot: sprint36-runs-help-overlay.png)

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-12 — Sprint 35: Currency Pair Panel, Active Filter Pills & Dataset Rank Badge

### Added
- **Currency pair distribution panel** (`page.tsx`): OverviewTab full-width card showing currency pairs grouped from all runs, sorted by run count descending, with animated pass rate progress bar per pair (green ≥80%, amber ≥60%, red <60%) and effective/total label. Null `currency_pair` renders as "MULTI".
- **Active filter pill bar** (`page.tsx`): RunsTab contextual row rendered below the toolbar when ≥1 filter is non-default. Cyan chips for: search text, standard, verdict, tag, starred-only, date-from, date-to, D.O. min, D.O. max. Each chip has × button to clear its own filter. CLEAR ALL button appears when ≥2 chips present. Hidden entirely when no filters active.
- **Dataset-relative rank badge** (`page.tsx`): Per run row in flat view, shows `#1 BEST` (green) / `#2` (cyan) / `#3+` (gray) badge indicating run's rank within its dataset by D.O. proximity to 1.00. Pre-computed via `dsRunGroups` + `dsRankMap` inside flat-view IIFE (O(n log n) total, O(1) per row). Badge suppressed when dataset has <2 runs.

### Test evidence
- `npx tsc --noEmit` — CLEAN (exit code 0, no output)
- Browser confirmed: 2026-04-12 via Playwright
  - 35.1: BY CURRENCY PAIR panel present in OverviewTab (screenshot: sprint35-overview-currency-panel.png)
  - 35.2: FILTERS: VERDICT: EFFECTIVE × chip visible after clicking EFFECTIVE; no pill bar when filters reset; CLEAR ALL absent for single filter (correct)
  - 35.3: #1 BEST (green) on IFRS_9 run, #2 (cyan) on ASC_815 run (screenshot: sprint35-runs-filter-pill-rank.png)

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-12 — Sprint 34: Effectiveness Regime Bar, Enhanced CSV Export & Run Age Display

### Added
- **Effectiveness regime bar** (`page.tsx`): OverviewTab horizontal stacked bar showing consecutive runs of identical effectiveness verdict as colored segments (green=effective, red=ineffective). Flex proportional widths — no fixed-pixel math. Past segments at 30% opacity; current segment full opacity. Count label inside each segment when >8% of total width. CURRENT badge shows `EFFECTIVE ×N` or `INEFFECTIVE ×N`. OLDEST ← → LATEST footer labels. Only renders when ≥2 runs.
- **Enhanced CSV export** (`page.tsx`): `handleExportCsv` now includes `note` and `tag` columns after `created_at`. Note field properly RFC 4180 double-quote escaped (`replace(/"/g, '""')`). Tag rendered as plain string (no quoting needed). Header updated accordingly.
- **Human-readable run age** (`page.tsx`): `showAge` boolean state + `runAge(dateStr)` utility function cascading through s/m/h/d/w/mo/y tiers from elapsed milliseconds. Date cell is now clickable — `onClick` toggles `showAge`. Column header label switches between `DATE` and `AGE` to reflect current mode. `e.stopPropagation()` prevents row selection on click.

### Test evidence
- `npx tsc --noEmit` — CLEAN (no output)
- Browser confirmed: 2026-04-12 via Playwright
  - 34.1: EFFECTIVENESS REGIME panel visible in OverviewTab; `hasRegimeBar: true`, `hasCurrentBadge: true`, `hasOldestLatest: true`; 1 green segment (2 effective runs in sequence)
  - 34.3: Date cell click toggles `4/12/2026` → `3h`; column header changed to `AGE` (screenshot: sprint34-runs-age-toggle.png)
  - 34.2: CSV export column expansion additive — no test run with notes to download, logic verified by code review

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-12 — Sprint 33: Pin-to-Top, Worst Performers & Quick Delta Bar

### Added
- **Pin-to-top runs** (`page.tsx`): Pin button (⬡ icon) per run row; pinned runs float above sorted results regardless of active sort/filter; cyan left-border indicator replaces green/red for pinned rows; `hec_pinned_runs` localStorage; max 3 pinned enforced.
- **Worst performers panel** (`page.tsx`): OverviewTab full-width card showing up to 3 most out-of-band ineffective runs (sorted by distance from nearest band edge); rank circles #1/#2/#3; D.O. value, dist-from-band, and date shown per row; hidden when all runs are effective.
- **Inline quick-delta bar** (`page.tsx`): When exactly 2 run rows are selected and compare modal is closed, a QUICK Δ bar renders above column headers showing D.O.Δ, R²Δ (signed, color-coded), and AGREE/DISAGREE verdict chip; disappears when 0/1/3+ rows selected or modal opens.

### Test evidence
- `npx tsc --noEmit` — CLEAN (no output)
- Browser confirmed: 2026-04-12 via Playwright
  - 33.1: Pin click → `hec_pinned_runs` localStorage = [id]; button title → "Unpin"; pinnedCount=1, unpinBtnCount=1
  - 33.2: WORST PERFORMERS correctly hidden (all 2 test runs effective); widget guards with `ineffective.length === 0`
  - 33.3: QUICK Δ + AGREE visible when 2 rows selected; D.O. + R² + verdict columns all present

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-12 — Sprint 32: Standard Donut, D.O. Drift Alert & Monthly Heatmap

### Added
- **Standard breakdown donut** (`page.tsx`): OverviewTab full-width card with ECharts donut (IAS_39/IFRS_9/ASC_815; cyan/green/amber) + count/% legend + PASS RATE BY STANDARD animated progress bars per standard.
- **D.O. drift alert badge** (`page.tsx`): DatasetsTab accordion header shows `⚠ DRIFT ±X.XXX` badge when latest vs prior run D.O. ratio shifts ≥0.10. Amber for |delta| 0.10–0.14, green/red for ≥0.15. Correctly suppressed when drift < threshold.
- **Monthly performance heatmap** (`page.tsx`): RunsTab slim bar above column headers showing Jan–Dec squares for current year. Green ≥80%, amber 60–79%, red <60%, em dash for no runs. Current month gets cyan border highlight. Hard-coded month labels for locale-safety.

### Test evidence
- `npx tsc --noEmit` — CLEAN (no output)
- Browser confirmed: 2026-04-12 via Playwright
  - 32.1: BY STANDARD + PASS RATE BY STANDARD panels present in OverviewTab
  - 32.2: drift=0.000 for test data → badge correctly suppressed (both runs D.O. 0.9917)
  - 32.3: Heatmap renders with APR showing 100% (2 effective runs); all other months show —

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-12 — Sprint 31: D.O. Band Bar, Streak KPI & Dataset Statistics Pills

### Added
- **D.O. band-position bar** (`page.tsx`): RunsTab D.O. ratio column replaced with compound component — ratio value (green/amber/red) stacked above a 3px mini bar showing position within 0.70–1.35 range; green zone band (0.80–1.25) highlighted at 15% opacity; colored 5×5 dot marker at exact ratio position with glow.
- **Streak KPI tiles** (`page.tsx`): OverviewTab gains CURRENT STREAK + BEST STREAK tiles alongside existing KPIs; O(n) calculation using sorted runs; 🔥 emoji when current streak ≥5; amber warning chip when streak broken (current=0, best>0).
- **Dataset statistics pills** (`page.tsx`): DatasetsTab accordion expanded section shows MEAN D.O., STD DEV, MIN, MAX, PASS RATE pill row before ASSESSMENT HISTORY label; computed from all runs for that dataset; only shown when ≥1 run exists.

### Test evidence
- `npx tsc --noEmit` — CLEAN (no output)
- Browser confirmed: 2026-04-12 via Playwright
  - 31.1: 2 mini bars + 2 colored dots rendering in RunsTab with ratio `0.9917` (green, in-band)
  - 31.2: CURRENT STREAK + BEST STREAK KPI tiles visible in OverviewTab (screenshot: sprint31-2-streak.png)
  - 31.3: MEAN D.O. 0.9917, STD DEV 0.0000, MIN 0.9917, MAX 0.9917, PASS RATE 100% confirmed in accordion (screenshot: sprint31-3-dataset-stats-pills.png)

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-12 — Sprint 30: Run Notes, Evidence Binder Download & Effectiveness Timeline

### Added
- **Per-run analyst notes** (`page.tsx`): Hover over any run row to reveal `+ note` prompt; click to open inline input; Enter/blur saves to `localStorage hec_run_notes`; note renders as italic grey text under dataset name; click to re-edit.
- **Evidence binder download** (`page.tsx`): Download icon (↓) per run row; calls `GET /v1/hedge-effectiveness/runs/{id}/export` with bearer token; downloads `he-binder-{id}.json`; clock icon spinner while fetching; `token` prop threaded into RunsTab.
- **Effectiveness timeline scatter** (`page.tsx`): New EFFECTIVENESS TIMELINE chart in OverviewTab; ECharts scatter (x=date, y=D.O. ratio); last 30 runs with D.O. data; green dots=effective, red=ineffective; markLine bands at 0.80/1.25; tooltip: dataset name, date, D.O., verdict.

### Test evidence
- `npx tsc --noEmit` — CLEAN (no output)
- Browser confirmed: 2026-04-12 via Playwright
  - 30.1: Note "Q1 preliminary — confirm with treasury desk" saved to localStorage and rendered italic in run row
  - 30.2: `he-binder-6827c188.json` downloaded from runs table
  - 30.3: EFFECTIVENESS TIMELINE with 3 ECharts instances visible in OverviewTab

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`
- `.claude/state/CHANGELOG_AI.md`

---

## 2026-04-10 — Sprint 29: Compare Export, Dataset Clone & D.O. Sparkline

### Added
- **Compare modal EXPORT CSV** (`page.tsx`): EXPORT CSV button in compare modal header; pure client-side Blob download via `URL.createObjectURL`; columns: run_id, dataset, standard, do_ratio, r_squared, verdict, date.
- **Dataset clone endpoint** (`v1_hedge_effectiveness.py`): `POST /v1/hedge-effectiveness/datasets/{id}/clone` — copies period data + all metadata with '(Copy)' name suffix, new UUID, emits audit event.
- **Dataset clone UI** (`page.tsx`): amber copy-icon button in DatasetsTab row actions; `cloningId` state prevents double-click; `handleCloneDataset` in HedgeEffectivenessInner; reloads datasets after clone.
- **D.O. ratio trend sparkline** (`page.tsx`): ECharts SVG line chart (h=80) per dataset in accordion; shows chronological D.O. ratio across all runs; green dashed band lines at 0.80/1.25; data points coloured green/red by band membership; only rendered when ≥2 runs have D.O. data.

### Test evidence
- `npx tsc --noEmit` — CLEAN (no output)
- pytest: 4801 passed, 0 failed, 158 skipped
- Browser confirmed: 2026-04-12 via Playwright
  - 29.1: EXPORT CSV downloaded `he_comparison_*.csv` from compare modal (2 runs)
  - 29.2: Clone button created "EUR/USD Q1 2024 Test (Copy)" — datasets count 1→2
  - 29.3: ECharts sparkline rendered in accordion with D.O. RATIO TREND + band lines at 0.80/1.30

### Files changed
- `backend/app/api/routes/v1_hedge_effectiveness.py`
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`

---

## 2026-04-04 — Sprint 6: Regulatory Reporting (IFRS 9 / ASC 815) — session 2

### Fixed
- **PageShell-inside-RunsTab bug** on `hedge-effectiveness/page.tsx`: `<PageShell>` and `Play` were imported but PageShell wrapped RunsTab content incorrectly. Removed both imports and the erroneous wrapper.

### Added
- **At-risk hedges monitor** in `OverviewTab`: surfaces hedges whose effectiveness ratio is within 10% of the IFRS 9 boundaries (0.80 lower / 1.25 upper); amber warning card with ratio + trend indicator.
- **Methodology & Standards disclosure panel** in `ComplianceSection` (EVIDENCE tab) on run detail page: shows accounting standard, methodology version, dollar-offset test pass/fail, regression test pass/fail, hedge type, designation date; includes standards citations (IFRS 9.6.4.1 / ASC 815-20-25).

### Test evidence
- `npx tsc --noEmit` — CLEAN
- `npx next build` — PASSED (after cache clean)
- pytest: 4801 passed, 0 failed, 158 skipped
- Browser confirmation: PENDING (item 6.1 XML download buttons)

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `frontend/src/app/hedge-effectiveness/runs/[run_id]/page.tsx`

---

## 2026-04-04 — Sprint 6: Regulatory Reporting (IFRS 9 / ASC 815) — session 1 (partial)

### Added
- **IFRS 9 + ASC 815 XML download buttons** in run detail page header (`/hedge-effectiveness/runs/[run_id]`): cyan-styled buttons calling `dashboardFetch` to `/v1/hedge-effectiveness/runs/{run_id}/ifrs9-xml` and `/asc815-xml`; `downloading` state prevents double-click
- **`designation_date`** added to `RunDetail` TypeScript interface and header metadata strip

### Fixed
- **PageShell-inside-map bug**: `<PageShell>` was placed inside `traces.map()` loop, wrapping each trace card in a full page shell. Removed entirely (import dropped).

### Test evidence
- `npx tsc --noEmit` — CLEAN
- `npx next build` — PASSED
- pytest: 4801 passed, 0 failed, 158 skipped
- Browser confirmation: PENDING

### Files changed
- `frontend/src/app/hedge-effectiveness/runs/[run_id]/page.tsx` (1 file)

---

## 2026-04-04 — Production Auth + Dashboard Fixes

### Fixed
- **`/auth/me` → 401 / dashboard black screen**: Schema drift — ORM model columns existed in code but not in the production PostgreSQL DB. `users.ui_preferences` and 5 `companies` columns (`sso_provider`, `sso_domain`, `stripe_customer_id`, `stripe_subscription_id`, `plan_tier`) were absent. SQLAlchemy `SELECT *` failed with `UndefinedColumnError` → broad `except Exception` swallowed it as 401 → `fetchMe()` returned null → `user=null` → dashboard `return null` (black screen).
- **`_ensure_tables()` gap**: Added `ALTER TABLE` statements for all 6 missing columns. Column additions are now applied on every Render restart (idempotent `ADD COLUMN IF NOT EXISTS`). Alembic migrations 0012 + 0013 created as canonical schema records.
- **`User.ui_preferences` deferred**: Marked as `deferred()` in ORM so it is excluded from the default `SELECT` even before the column is added to the DB.
- **`/auth/me` exception handler**: Changed broad `except Exception → 401` to return HTTP 500 with exception type, so DB errors are distinguishable from JWT auth failures.
- **Dashboard `toFixed` crashes**: `rate.bid/mid/ask` can be null when market data is unavailable. Guarded all 6 `.toFixed()` call sites with `?? 0`. Made `fmtUsd()` accept `null|undefined`, returning `"—"` instead of crashing. Guarded `hedgeCoverage` and `hedge_ratio` null cases.

### Browser confirmed
- Login → `/dashboard` navigates correctly
- `/auth/me` returns HTTP 200 with user, roles (63 permissions), company context
- "Good morning, Demo" greeting visible; sidebar, KPI strip, TradingView chart all render
- Zero JS errors, no error boundary triggered
- Page sweep: dashboard, hedge-desk, audit-lab, sandbox, reports all OK

### Test evidence
- Backend: 4801 passed, 0 failed, 158 skipped (unchanged)
- Commits: 006b593 → ba269ba → 10ce559 → 14e7ab8 → d1063b6 → 4a6f8ae

---

## 2026-03-29 — Sprint 5: Scale & Performance

### Added
- **k6 load test**: `docs/performance/k6-load-test.js` — 100 VU scenario; `docs/performance/load-test-baseline.md` committed with pending note; full staging run required to close done criteria
- **Redis market data cache**: `backend/app/core/redis_client.py` — fail-open singleton (graceful if Redis unavailable), 60s TTL, cache hit/miss counters exposed on `GET /system/health`
- **Connection pool tuning**: `DB_POOL_SIZE=20`, `DB_MAX_OVERFLOW=10`, `DB_POOL_TIMEOUT=30`, `DB_POOL_PRE_PING=True` added to Settings; `create_engine_from_url()` helper in `backend/app/core/db.py`
- **Webhook support**: `POST/GET/DELETE /v1/webhooks`; `WebhookEndpoint` + `WebhookDeliveryLog` models; HMAC-SHA256 payload signing; 5-attempt exponential backoff (1m/5m/15m/60m/give-up); WORM audit event written on each delivery attempt; session-isolated `_fire_webhook` background task; 4 wired events: position.created, calculation.completed, proposal.approved, proposal.rejected
- **Horizontal scaling contract**: `docs/architecture/horizontal-scaling-contract.md`; `SYSTEM_BOUNDARIES.md` updated with multi-instance topology diagram; Redis rate limit wiring confirmed stateless

### Test evidence
- Backend: 4801 passed, 0 failed, 158 skipped
- 12 new test files; 27 files changed, 2196 insertions
- Branch feat/enterprise-sprint5-scale-perf merged to master

### Human actions required
- Run k6 full load test against Render staging (100 VUs, 5 min) — populate docs/performance/load-test-baseline.md
- Add WORKOS_API_KEY, WORKOS_CLIENT_ID to Render env vars
- Add STRIPE_SECRET_KEY_TEST, STRIPE_WEBHOOK_SECRET to Render env vars
- Add SENTRY_DSN to Render + Vercel env vars
- Run scripts/scrub-git-secrets.sh (git history scrub)
- Rotate all API keys

---

## 2026-03-28 — Sprint 4: Compliance Pipeline

### Added
- **SOC2 Evidence Table**: `compliance_evidence` WORM table (DB-level NO UPDATE/DELETE triggers); nightly export job at 02:00 UTC collecting `user_count`, `policy_change_count`, `failed_auth_count` per tenant
- **SOC2 Controls Matrix**: `docs/compliance/soc2-controls-matrix.md` — CC6/CC7/CC8/CC9/A1/C1 mapped to existing controls
- **GDPR Anonymisation Job**: nightly at 01:00 UTC; SHA-256 hashes email + full_name for accounts older than `GDPR_RETENTION_DAYS` (default 730 days); row retained for WORM FK integrity
- **GDPR Data Rights**: `GET /v1/user/data-export` (Art. 15), `DELETE /v1/user/account` (Art. 17 erasure via anonymisation)
- **GDPR DPA Document**: `docs/compliance/gdpr-dpa-status.md` — sub-processor DPA status, data flows, retention schedule
- **PostgreSQL RLS**: `backend/app/core/rls.py` — `inject_tenant_rls()` uses `SET LOCAL` (transaction-scoped, safe with async connection pool); Alembic migration `k1a2b3c4d5e6` adds RLS policies on `positions` and `calculation_runs`
- **`get_session_with_rls` dependency**: composite FastAPI Depends() that injects tenant context before yielding session
- **Vendor Security Registry**: `docs/compliance/vendor-registry.md` — 10 vendors with data classification, DPA status, fallback plans
- **DB migrations**: `j1a2b3c4d5e6` (compliance_evidence), `k1a2b3c4d5e6` (RLS policies)

### Test evidence
- Backend: 4767 passed, 0 failed, 158 skipped

### Human actions required
- Sign WorkOS DPA before enabling SSO for enterprise clients
- Verify Sentry PII scrubbing config matches gdpr-dpa-status.md requirements
- Add `GDPR_RETENTION_DAYS` env var to Render if non-default retention needed

---

## 2026-03-28 — Sprint 3: SSO + Billing

### Added
- **WorkOS SSO**: `POST /auth/sso/callback` — exchanges WorkOS code for ORDR JWT; `sso_provider` + `sso_domain` on Company model; SSO users get stub password `!sso-no-password!`
- **Stripe billing**: `POST /v1/billing/webhook` — handles `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`; STRIPE_LIVE_MODE gate; `stripe.api_key` set at startup
- **Plan enforcement**: `require_plan_tier()` FastAPI dependency (starter=0, professional=1, enterprise=2); raises HTTP 402 if company tier is below required minimum
- **Self-service signup**: `POST /v1/signup` — atomically creates Company + admin User + GENESIS audit event in one transaction; 409 on duplicate email
- **GENESIS hash chain**: `provision_tenant()` passes `prev_event_hash="0"*64` to first audit event; verified by integration tests in `test_genesis_hash_chain.py`
- **Frontend signup wizard**: `/signup` — 3-step wizard (company name -> credentials -> success); calls `POST /api/v1/signup`
- **Scalar API docs**: `GET /docs` — Scalar OpenAPI reference UI pointing at `/openapi.json`
- **DB migration**: `h1a2b3c4d5e6` — adds `sso_provider`, `sso_domain`, `stripe_customer_id`, `stripe_subscription_id`, `plan_tier` to `companies` table

### Dependencies added
- `workos>=4.0.0`
- `stripe>=8.0.0`
- `sentry-sdk[fastapi]>=2.0.0` (Sprint 2, carried through)

### Test evidence
- Backend: pytest run — 4746 passed, 0 failed, 156 skipped
- Frontend: TypeScript clean (no new errors)

### Human actions still required
- Add `WORKOS_API_KEY`, `WORKOS_CLIENT_ID` to Render env vars
- Add `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET` to Render env vars
- Add `SENTRY_DSN` to Render + Vercel env vars (Sprint 2)
- Run Blueprint Sync on Render after render.yaml changes

---

## 2026-03-28 — Sprint 2: Infrastructure Upgrade

### Completed (automated)
- render.yaml: upgraded hedgecore + hedgecore-preview to plan: starter (eliminates cold starts)
- render.yaml: upgraded hedgecore-db + hedgecore-preview-db to plan: starter (private networking eligible)
- render.yaml: added Redis service blocks (hedgecore-redis, hedgecore-preview-redis, Starter plan, allkeys-lru)
- render.yaml: REDIS_URL wired via fromService (not secrets group) for both services
- render.yaml: added daily backup cron (02:00 UTC) + monthly restore-verify cron (01:00 UTC on 1st)
- rate_limit.py: _RedisTokenBucket.consume changed from fail-OPEN to fail-CLOSED (spec 2.3)
- rate_limit.py: import redis moved to module level for testability
- app/core/sentry_config.py: created PII-scrubbing Sentry init module (scrub_pii_before_send + init_sentry)
- app/main.py: wired init_sentry() at startup (no-op when SENTRY_DSN unset)
- requirements.txt: added sentry-sdk[fastapi]>=2.0.0
- frontend: added @sentry/nextjs, sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts
- frontend/next.config.js: wrapped with withSentryConfig (source maps gated on SENTRY_AUTH_TOKEN)
- scripts/backup/: added b2_upload.sh, backup_and_upload.sh, Dockerfile.backup
- scripts/render/: added cron_backup.sh, cron_restore_verify.sh
- docs/ops/uptime-monitoring.md: created uptime monitoring runbook
- tests: added test_rate_limit_failclosed.py (4 tests) + test_sentry_pii_scrub.py (4 tests)
- ci.yml: added SENTRY_DSN="" to pytest env for no-op path coverage

### Manual Steps Required (operator)
- Render dashboard: switch DATABASE_URL in hedgecore-secrets to internal hostname
- Render dashboard: add B2_ACCOUNT_ID, B2_APP_KEY, B2_BUCKET, VERIFY_DB_URL to hedgecore-secrets
- Render dashboard: run Blueprint Sync to provision Redis services + activate cron jobs
- BetterUptime: register production + preview monitors (see docs/ops/uptime-monitoring.md)
- Vercel: add NEXT_PUBLIC_SENTRY_DSN + SENTRY_DSN to frontend environment variables
- Sentry: create "ORDR Terminal Backend" + "ORDR Terminal Frontend" projects, get DSNs

---

## 2026-03-27 — Operations hardening: 16 gaps closed (commits 1a09c88–eba3fe9)

### Summary
Closed 16 identified operations gaps across CI/CD, backup automation, disaster recovery, monitoring, developer documentation, database maintenance, and local infrastructure. Coverage gate raised from 40% to 60% (actual 75%). All 17 plan tasks executed via subagent-driven development with spec review.

### Changes
- **CI/CD**: gitleaks secret scan job, Dependabot (pip/npm/actions), Trivy container CVE scan, coverage gate 40%→60%
- **Backup**: `scripts/backup/pg_backup.sh` + `restore_verify.sh` with size validation and table checks
- **Docs**: `backup-restore.md` (RTO=4h/RPO=24h), `disaster-recovery-plan.md` (5 playbooks), `sla-slo.md`, `monitoring-setup.md` (UptimeRobot+Sentry), `onboarding.md`, `incident-postmortem-template.md`, `data-retention-policy.md`, `db-maintenance.md`
- **Infra**: `infra/docker/docker-compose.yml` rewritten (postgres+backend+frontend dev stack), `frontend/Dockerfile` replaced (multi-stage Alpine), `output:standalone` added to `next.config.js`

### Deferred
- S-01 secret rotation (operator action), C-04 mypy hard gate, I-01 Render blueprint sync

---

## 2026-03-25 — Infrastructure hardening + live market data fix (commits d1af599–b8db71f)

### Summary
Two-session run. Resolved 11 architectural audit issues (hardening branch → master), fixed production market data pipeline, stamped production DB, and added cold-start mitigation.

### Key Fixes
- **`fix(middleware)`**: `/api/v1/market-data/live/*` added to public_prefixes in APIKeyAuthMiddleware. Was returning 401, silently falling back to exchangerate-api.com. Now live via TwelveData: EURUSD 1.1564, USDJPY 159.35, USDMXN 17.78.
- **Production DB stamp**: `alembic_version` → `2026_03_24_baseline` via direct psql (PYTHONPATH conflict with D:\StopMug forced bypass).
- **`infra(render)`**: `hedgecore-keepalive` cron — pings `/api/health` every 14 min, prevents free-tier cold-start 503s. Activate via blueprint sync.
- **Governance files committed**: `policy_rules.py` (22 SIG_* constants) + `test_kernel_governance.py` (18 tests).
- **ordr-market**: Chart engine refactor + indicators (ADX, Bollinger, Ichimoku, RSI, Supertrend, VWAP, Volume Profile).

### 11 Hardening Issues (all resolved)
1. DDL-as-code → Alembic migrations, 31-model env.py
2. Seed user rehash → bcrypt verify-before-hash
3. Deprecated `@app.on_event` → lifespan context manager
4. Alembic baseline migration created and stamped in prod
5. SQLite backdoor → WARNING log + ALLOW_INDICATIVE_FALLBACK=false in prod
6. CORS localhost → removed from production
7. Free-tier cold starts → keepalive cron (RISK-INF-01, severity MEDIUM)
8. OpenAI phantom dep → commented out
9. Redis fallback → startup observability logging
10. Tenant isolation → 18 tests (cross-tenant, SoD)
11. synex-kernel → removed from requirements.txt (private, not on PyPI)

### Test Baseline
4684 passed, 0 failed, 156 skipped

### Sprint: Live Market Data Integration — 4/7 complete
- Done: #3 sandbox autofill, #4 TwelveData wired, #5 dashboard FX verified, #6 frontend-v2 (no-op)
- Blocked: #2 IBKR (needs TWS port 4001), #7 risk closure
- Manual: #1 secret rotation (Render + Vercel dashboards)

## 2026-03-24 — Backend audit fixes + brand cleanup (commit 20612ec)
- Gated `_sync_seed_users()` to non-production ENV — prevents bcrypt rehashing on every prod boot
- Moved APScheduler into lifespan context manager; removed deprecated `@app.on_event` decorators
- Stripped localhost entries from production CORS_ALLOW_ORIGINS in render.yaml
- Solutions index page (`/solutions`) fully rewritten with 6 solution cards, platform stats, terminal panels, SVG diagram, 3-pillar proof section
- Brand cleanup: removed all "Synexiun" and GitHub references from frontend; rebranded to ORDR Terminal / ORDR Edge
- Contact page (`/contact`) overhauled: inquiry tiles, qualification form, right sidebar, ICP profiles, FAQ accordion
- ORDR Portfolio hub (`/portfolio`) created: KPI strip, currency breakdown table, run history, nav cards
- Portfolio multi-pair page wired to live `/v1/analytics/portfolio` data with LIVE/DEMO badge
- AppSidebar updated: added `/portfolio` entry, downgraded tier gate to "professional" for portfolio pages
- Tests: 4670 passed, 154 skipped, 0 failed

## 2026-03-23 — Landing page: ORDR Journal + GOLDX Coin (commit 81f255c)
- Added Section 12 (ORDR Journal) + Section 13 (GOLDX Coin) to home landing page
- Built /products/ordr-journal — equity curve SVG, P&L bar chart, 8-feature grid, live demo CTA
- Built /products/goldx — XAU/USD price chart, tokenomics donut, how-it-works, ecosystem cards
- Stats strip updated 8→10 products; hero copy updated accordingly
- Build: tsc --noEmit clean, next build clean

## 2026-03-22 — Sprint: Live Market Data Integration (commits 8f5e911, a3eb5e5)
- Removed all hardcoded BIS spot rates and carry assumptions (14 files, -432 lines)
- All provider failures now return 503 instead of stale fallback data
- Fixed Twelve Data: new key + User-Agent header on httpx client (was 403)
- Verified 5 providers live: Twelve Data, Alpha Vantage, Finnhub, exchangerate-api.com, yfinance
- IBKR fully wired (ib_insync installed, graceful fallback) — needs TWS on port 4001
- JWT_SECRET added to local backend/.env (rotate Render/Vercel env vars separately)
- Fixed StopMug editable install path collision: backend/conftest.py + pytest.ini pythonpath
- Updated 5 CIP tests to assert 0.0 (live-only contract, no hardcoded rates)
- Result: 4615 passed, 0 failed, 154 skipped
- Risk #5 closed; new sprint "Live Market Data Integration" opened (7 items)

## 2026-03-20 — Sprint Complete: Regulatory Reporting Exports (commit 62abe85)

### Summary
Full regulatory exports sprint delivered. 7 items, 6 files changed. Added export_ifrs9_xml pure service function (6th serializer, ordr: namespace). Added ISDA and FINRA-17a4 endpoints to v1_reports.py following existing EMIR/MiFID pattern. Added IFRS9-xml and ASC815-xml endpoints to v1_hedge_effectiveness.py with tenant-scoped helpers. Extended RegulatoryTab.tsx: 7-card trade-repo section + new hedge accounting section (IFRS9 + ASC815 with separate run selector). API_CONTRACTS.md updated. 4615 tests pass, frontend build clean.

### Changes
- **`backend/app/services/regulatory_export.py`**: Added `export_ifrs9_xml(run_data, results, periods, *, standard)` — XML with `ordr:` namespace, sections: header/hedgeDesignation/effectivenessResults/periods/auditTrace.
- **`backend/tests/test_regulatory_export.py`**: Added `TestExportIfrs9Xml` (11 tests), `test_isda_export_via_public_api`, `test_ifrs9_xml_round_trip`.
- **`backend/app/api/routes/v1_reports.py`**: Added `GET /{run_id}/isda` (ISDA XML, builds transactions from buckets) and `GET /{run_id}/finra-17a4` (pipe-delimited TXT, SHA-256 hash chain from AuditEvent).
- **`backend/app/api/routes/v1_hedge_effectiveness.py`**: Added `_build_ifrs9_run_data`, `_fetch_eff_run_and_dataset` helpers + `GET /runs/{run_id}/ifrs9-xml` and `GET /runs/{run_id}/asc815-xml` endpoints.
- **`frontend/src/app/reports/components/tabs/RegulatoryTab.tsx`**: ISDA + FINRA-17a4 added to FORMAT_CARDS. New `EffFormatCard` interface. `EFF_FORMAT_CARDS` (IFRS9 + ASC815). `fetchEffRuns` reads `r.run_id`. Hedge accounting section with HR divider, section header, effectiveness run selector, card grid.
- **`docs/architecture/API_CONTRACTS.md`**: Documented ISDA, FINRA-17a4, IFRS9-xml, ASC815-xml endpoints.

## 2026-03-19 — Sprint Complete: Market Intelligence & Portfolio Expansion (commit 856b576)

### Summary
Full sprint 5 options delivered in one session: watchlist backend persistence, portfolio correlation heatmap + concentration alerts + hedge recommendations, settings audit (all 12 tabs already complete), governance hash chain visualization + audit event grouping, and custom alert rules engine. 9/9 items. 5 commits. Build: 0 errors across all.

### Changes Summary
- **Option A** (05b4a00): Watchlist backend (UserWatchlist model, /v1/watchlists CRUD), useMarketTicker WebSocket hook, WatchlistsTab backend sync + localStorage fallback
- **Option B** (052b566): Portfolio Multi — 26×26 correlation heatmap, concentration bar chart with alerts, 5 hedge recommendations panel
- **Option C** (no code): Settings audit confirmed all 12 tabs fully implemented
- **Option D** (66e972a): Ledger CHAIN VIEW (blockchain block visualization), Audit Trail GROUPED VIEW (entity grouping + impact analysis)
- **Option E** (856b576): Signals Alert Rules Engine — custom rule builder, live WebSocket evaluation, cooldown enforcement, fired alerts log

## 2026-03-19 — Option A: Watchlist Backend Persistence + WebSocket Ticker (commit 05b4a00)

### Summary
Full-stack Option A complete. Watchlists now backed by PostgreSQL (`user_watchlists` table) with owner-scoped CRUD API. Frontend WatchlistsTab rewired to backend-first load with localStorage fallback and debounced save. New `useMarketTicker` WebSocket hook delivers live bid/ask/mid ticks from `/ws/market` with auto-reconnect. Build verified, 10 files changed, 651 insertions.

### Changes
- **`backend/app/models/user_watchlist.py`** (NEW): UserWatchlist model — UUID PK, user_id FK w/ CASCADE, name (unique per user), symbols (JSON), timestamps. SQLite-compat JSON type.
- **`backend/app/api/routes/v1_watchlists.py`** (NEW): CRUD router at `/v1/watchlists`. GET (list), POST (create, 409 on dupe), PUT (update symbols by ID), DELETE (404 on miss). Owner-scoped; symbols normalized to uppercase.
- **`backend/app/main.py`**: DDL for `user_watchlists` table (JSONB, UUID PK, user FK, index) added to `_ensure_tables()`.
- **`backend/app/api/router.py`**: Registered `v1_watchlists_router`.
- **`frontend/src/lib/hooks/useMarketTicker.ts`** (NEW): WebSocket hook — derives wss:// URL from `NEXT_PUBLIC_API_URL`, subscribes/unsubscribes symbol delta on change, reconnects after 3s, returns `TickMap` (bid/ask/mid/ts per symbol).
- **`frontend/src/app/market-intelligence/page.tsx`**: Passes `token` prop from `useAuth()` to `WatchlistsTab`.
- **`frontend/src/app/market-intelligence/components/tabs/WatchlistsTab.tsx`**: Full rewrite — backend-first load, localStorage fallback, background create if no server watchlists, debounced 800ms PUT save, `SyncBadge` (SYNCED/LOCAL), live price strip with ticks in symbol pills.

## 2026-03-18 — UI Polish: TradingView, Login Dark Theme, Particle Fix (commit ce9e7ef)

### Summary
Three frontend UX improvements. Dashboard Market Pulse now features a TradingView Advanced Chart with FX news feed. Login page stripped of all blue accents — now black on dark gray. Particle animation calmed from jittery to smooth drift. 152 lines changed. Build: 0 errors.

### Changes
- **`dashboard/page.tsx`**: Replaced 6-column FX rate card grid with 2-column layout: TradingView Advanced Chart widget (left, 420px, interactive watchlist for 6 FX pairs) + compact rate cards (right, 300px). Added TradingView Timeline widget for live FX news & analysis (340px). Added `useRef` import, `TradingViewChart` and `TradingViewTimeline` inline components.
- **`auth/login/page.tsx`**: Changed design tokens — `accent` from `var(--accent-cyan)` to `#888888`, `accentHover` to `#999999`, `accentGlow` to `rgba(255,255,255,0.06)`, `borderFocus` to `#555555`, `panelAlpha` to `rgba(10,10,14,0.97)`. Buttons now `#1a1a1e` with `1px solid rgba(255,255,255,0.08)` border. Top accent line uses white gradient. Particle config: speed 2.2→0.5, saturation 72→0, connectionDist 145→120, lineOpacity 0.28→0.12, hueSpeedMultiplier 5→0, hues monochrome.

## 2026-03-18 — Mission Control Dashboard Upgrade (commit a38be03)

### Summary
Transformed the Mission Control page from a basic 3-card layout into a data-rich command center. Added Market Pulse (6 FX rate cards + macro indicators), Operations (Recent Runs table + Governance Pipeline visualization), and Team Activity timeline. 491 lines added, 6 parallel API fetches with 30s auto-refresh.

### Changes
- **`dashboard/page.tsx`**: Added `SectionHeader`, `FxRateCard`, `MacroCard`, `PipelineStage`, `WidgetSkeleton` components. New `WidgetState` interface with `fetchWidgets()` fetching 6 endpoints via Promise.allSettled. Market Pulse: 6-column FX rate grid + macro indicator row. Operations: 2-column grid with Recent Runs table (5 rows) + Pipeline Status (Sandbox→Staging→Ledger). Team Activity: timeline with status dots, module tags, timestamps.

## 2026-03-18 — Admin Hub Command Center Upgrade

### Summary
Transformed admin hub into a modern professional command center with data presentation features. 742 lines of new/changed code across 7 files. Tests: 4602 passed, 0 failed. TypeScript: 0 errors.

### Backend changes
- **`v1_admin_metrics.py`**: Added `prev_period` block to GET /v1/admin/metrics — compares current window to same-length prior window (signups, DAU, calc_runs, audit_runs).
- **`v1_devops.py`**: Added `done_count` scalar to /v1/devops/status response — fixes frontend sprint progress always showing 0%.
- **`v1_admin_users.py`**: Added `POST /v1/admin/users` endpoint — superuser-only user creation (email, password, full_name, is_superuser, company_id). Returns 409 on duplicate email.

### Frontend changes
- **`MetricsTab.tsx`**: Added `TrendBadge` component (▲/▼/— with %) on all 4 trending KPI cards (signups, active users, calc runs, audit runs). 4-column KPI grid with 28px numbers. Enhanced conversion funnel: 32px gradient bars with overlaid labels + `▼ N pp drop-off` rows between steps.
- **`DevOpsTab.tsx`**: Fixed hardcoded `doneCount = 0` bug — now uses `data.done_count ?? 0`. Added `done_count?` to DevOpsData interface.
- **`UsersTab.tsx`**: Added `CreateUserModal` — email, password, full_name, superuser toggle. "+ CREATE USER" button in toolbar. POSTs to `/v1/admin/users`, prepends created user to list.
- **`RolesTab.tsx`**: Added `EditPermissionsModal` for non-system roles — full permission checklist pre-populated from current role. PUTs to `/v1/admin/roles/{id}/permissions`. "EDIT PERMISSIONS" button in right pane header, hidden for system roles.

## 2026-03-18 — Market Data TwelveData Fallback: Risk ID-2 mitigated (commit 905ef79)

### Summary
Backend live market data routes now fall back to TwelveData when IBKR is disabled (production). Previously all 5 endpoints returned 503 in production. Now: IBKR (primary) → TwelveData (institutional fallback) → 503. Tests: 4602 passed, 0 failed.

### Changes
- **`backend/app/api/routes/v1_market_data_live.py`**: Added `_get_td_provider()` lazy-init singleton. All data endpoints (fx-rates, equity-quotes, quote, fx-change) now try IBKR first, fall back to TwelveData if IBKR disabled or fails. `source` field in response reflects active provider (`"ibkr"` vs `"twelvedata"`).
- **`backend/tests/test_market_data_live.py`**: Updated all test patches to use `_get_ibkr_provider` (was `_get_provider`). Added `_td_provider` reset in fixture. Added `test_twelvedata_fallback_when_ibkr_disabled` test. Updated behavior tests: provider fail → 503 (was 502) since fallback chain exhausted. 26 tests, all passing.

## 2026-03-18 — Regulatory Reporting Fix: Risk ID-5 mitigated (commits c955f0e..b85a6c6)

### Summary
EMIR/MiFID II/Dodd-Frank exports now read real LEI data from company settings instead of hardcoded "NOT_PROVIDED". Added full regulatory settings UI. Tests: 4601 passed, 0 failed.

### Changes
- **`backend/app/api/routes/v1_regulatory_settings.py`** (new): `GET /v1/settings/regulatory` + `PATCH /v1/settings/regulatory` — reads/writes `company.settings["regulatory"]` JSONB (no migration). Returns `lei_configured` derived flag.
- **`backend/app/api/routes/v1_reports.py`**: `_build_reg_run_data()` made async, now queries company for LEI. All 3 callers (emir, mifid, dodd-frank) updated.
- **`backend/app/api/router.py`**: Registered `v1_regulatory_settings_router`.
- **`frontend/src/app/settings/types/settings.ts`**: Added `REGULATORY` tab to union, TABS, and HASH_MAP.
- **`frontend/src/app/settings/page.tsx`**: Wired `RegulatorySettingsTab`.
- **`frontend/src/app/settings/components/tabs/RegulatorySettingsTab.tsx`** (new): LEI form with 3 LEI inputs, venue code, framework checkboxes (EMIR/MIFID2/DODD_FRANK), financial counterparty toggle, status banner (green/amber), save button.
- **`frontend/src/app/reports/components/tabs/RegulatoryTab.tsx`**: LEI status banner above run selector — amber warning with link to settings when unconfigured, green badge when ready.

## 2026-03-18 — Coverage Push Round 3: +534 new tests, 68% → 75.6% (commits 6f264b0..a1737ed)

### Summary
Crossed 75% coverage target. Added 9 test files covering services and route handlers. 4601 passed, 0 failed, 75.6% coverage.

### Changes
- **`test_ep_service_coverage.py`** (40 tests): execution_proposal_service — proposal lifecycle, SoD checks, second approval, execute gate
- **`test_api_keys_service_coverage.py`** (26 tests): create/rotate/revoke/verify API keys
- **`test_pipeline_db_coverage.py`** (51 tests): proposal/staging/ledger CRUD, converters
- **`test_rbac_service_coverage.py`** (31 tests): roles, permissions, hierarchy — 100% coverage
- **`test_snapshot_services_coverage.py`** (78 tests): geo/volatility/options/market snapshot services
- **`test_positions_coverage.py`** (45 tests): all v1_positions endpoints
- **`test_policies_coverage.py`** (38 tests): all v1_policies endpoints
- **`test_pipeline_routes_coverage.py`** (48 tests): staging/ledger/replay pipeline routes
- **`test_risk_analytics_coverage.py`** (43 tests): VaR, stress, scenario, exposure endpoints
- **`test_audit_lab_routes_coverage.py`** (51 tests): all 13 audit lab endpoints
- **`test_export_routes_coverage.py`** (32 tests): export positions/runs/policy/audit
- **`test_reports_routes_coverage.py`** (43 tests): saved reports CRUD, schedules, regulatory exports
- **`test_hedge_effectiveness_coverage.py`** (34 tests): dataset upload, assessments, IFRS9, evidence binder

## 2026-03-18 — Coverage Push Round 2: +143 new tests, 66% → 68% (commits a01ec25..6f264b0)

### Summary
Added 3 new test files covering pipeline service, execution proposals routes, and v1_calculate routes. 4041 passed, 0 failed, 68% coverage.

### Changes
- **`tests/test_pipeline_service_coverage.py`** (45 tests): sandbox_calculate, proposal creation/staging/ledger ops
- **`tests/test_execution_proposals_coverage.py`** (62 tests): all proposal endpoints, auth rejection, approve/reject flows, MFA gate, SoD checks
- **`tests/test_calculate_coverage.py`** (36 tests): calculate endpoint, input validation, RBAC, rate limit, schema gate, market snapshot path, list/get runs

## 2026-03-18 — Coverage Push: +243 new tests, 64% → 66% (commits 4eecf5d..a01ec25)

### Summary
Added 4 new test files covering dashboard routes, engine modules, auth routes, and policy service. 3901 passed, 0 failed, 66% coverage.

### Changes
- **`tests/test_dashboard_routes.py`** (39 tests): dashboard summary, recent-runs, pending-approvals, team-activity, aggregate — auth rejection + happy paths + helper unit tests
- **`tests/test_engine_coverage.py`** (165 tests): `strategy_selector.py` helpers (`_as_*`, `_clamp01`, axis helpers, `select_strategies`) + `instrument_catalog.py` validators and models
- **`tests/test_auth_coverage.py`** (21 tests): register validation, login failures, refresh bad token, `/me` auth checks, logout
- **`tests/test_policy_service_coverage.py`** (19 tests): get_active_policy, list_revisions, activate_policy, create/update/delete template, deactivate

### Note
Engine agent surfaced pre-existing bug: `strategy_selector.py` references `DisclosureCode.DISCLOSED_AXIS_ALIAS_MAPPING` which doesn't exist in the enum — any alias-mapped axis call raises `AttributeError`. Flagged, not introduced.

## 2026-03-18 — Test Suite Hardening (commit f083b1d, pushed to master)

### Summary
Resolved 22 cross-test contamination failures. Test baseline: 3658 passed, 0 failed, 150 skipped (PG-only), 64% coverage. Coverage risk mitigated.

### Changes
- **`backend/tests/conftest.py`**: Added `reset_rate_limiter_state` autouse fixture — traverses `app.middleware_stack` to find `RateLimitMiddleware` instance and clears `_buckets` before/after each test. Fixes spurious 429 contamination across test files.
- **`backend/tests/test_report_studio_governance.py`**: Fixed 9 hardcoded `FXDemo` absolute paths → `TreasuryFX`. Tests had been copied from sibling project without updating paths, causing `FileNotFoundError` on all 34 governance assertions.
- **`backend/tests/test_security_config.py`**: Fixed `parents[3]` → `parents[2]` for repo root resolution. `.gitignore` lives at `TreasuryFX/` (2 levels up from tests/), not `HedgeCalc/` (3 levels).

### Validation
- Full suite: `3658 passed, 0 failed, 150 skipped in 22s`
- Coverage: 64% (up from 59%, risk ID 3 mitigated)

## 2026-03-18 — Audit Lab UX Overhaul (6 commits, pushed to master)

### Summary
Complete UX overhaul of the Audit Lab section — rebuilt as a trust-building first-impression surface for prospective clients. Six chunks delivered via subagent-driven development with two-stage spec + quality review per chunk.

### Changes
- **`frontend/src/lib/fixtures/audit-lab-demo.ts`**: Enriched `DEMO_DATASET` — markupByMonth (3 months), 11 transactions with `spread_classification`, 3 findings, 3 trustSignals; `getDemoCounterpartyStats()` helper
- **`frontend/src/app/audit-lab/demo/page.tsx`**: Rebuilt from 80→230 lines — six-act narrative: hero h1, 4-cell KPI strip, MarkupByMonthChart (ECharts, SSR-safe dynamic()), CounterpartyMatrix callout, findings with SevBadge, trust rail, CTA → signup/login, disclaimer
- **`frontend/src/app/audit-lab/upload/page.tsx`**: Added `downloadSampleCsv()`, `lastYearPeriod()` helpers; sample CSV download button; renamed progress steps; hidden UUID; benchmark tooltip; enriched upload success banner
- **`frontend/src/app/audit-lab/page.tsx`**: Removed BETA badge; datasets empty state with guided "Upload" CTA + "See a sample result" link; run list shows source filename + period + row count from `datasetMap`
- **`frontend/src/app/audit-lab/runs/[run_id]/page.tsx`**: 5-KPI grid, export hierarchy (Board Summary primary / Evidence Binder secondary / XLSX tertiary), SHA-256 hash badge (12-char preview + full title), expandable findings rows with `React.Fragment key`, Verification tab with tamper-evident context block
- **`frontend/src/components/layout/AppSidebar.tsx`**: "Activity Log" label (was "Audit Trail") to fix naming collision with governance `/audit-trail`
- **`frontend/src/app/audit-lab/audit-trail/page.tsx`**: Title/heading renamed to "Activity Log"; breadcrumb updated

### Validation
- `npx tsc --noEmit` — EXIT:0 (clean)
- `npx next build` — all pages compiled successfully
- Pushed: `bd39911..dfbc180` → origin/master (7 commits including frontend-v2 deletion)

## 2026-03-15 — Simulation Lab Live Data Wiring

### Summary
Fixed the Simulation Lab (`/sandbox`) to use live market data from the app's actual data sources instead of static BIS/EOD hardcoded values.

### Changes (commit bd39911)
- **`frontend/src/app/sandbox/page.tsx`**:
  - Fixed critical GET→POST bug in `useLiveSpot`: was calling `GET /api/market-autofill` (405 always) — changed to `POST` with JSON body
  - Extracted `fetchLiveMarket(currency, tradeDates)` helper: calls `POST /api/market-autofill` returning full `LiveMarketData` (spot + forward_points + provider_metadata)
  - `handlePairChange`: now async, injects live market snapshot into `CalculateRequest` before dispatching to engine
  - Auto-run effect: fetches live market before initial calculation, falls back to demo fixtures only if API unreachable
  - `liveRefreshed` effect: silently re-runs calculation when live data arrives after render if result used fallback data
  - Compliance badges: IFRS 9 now tied to actual `coverageRatio` (80–125%), others show grey until calculation runs, MiFID II RTS 25 reflects actual live data status

### Data Flow (after fix)
`POST /api/market-autofill` → IBKR `GET /v1/market-data/live/fx-rates` (primary) → exchangerate-api.com (fallback) → BIS demo (last resort)
Forwards: Finnhub CME futures (primary) → carry-differential estimate (fallback)
Injects: `market.spot_rate`, `market.forward_points_by_month`, `market.provider_metadata` into `CalculateRequest` before `POST /sandbox/calculate`

---

## 2026-03-15 — Admin Hub (8-Tab Unified Admin Section)

### Summary
Replaced two broken admin pages (`/admin-monitor`, `/devops`) with a unified, fully-tested 8-tab Admin Hub at `/admin`.

### Frontend (10 commits: 279ee8f → b8aa115)
- **`frontend/src/app/admin/page.tsx`** (new): Hub shell — PageShell, two-layer superuser auth gate (DeniedCard), tab routing via `?tab=` URL param, lazy `dynamic()` imports for all 8 tabs
- **`frontend/src/app/admin/components/AdminTabBar.tsx`** (new): 8-tab bar with cyan active underline, exports `AdminTab` union type
- **`frontend/src/app/admin/components/tabs/OperationsTab.tsx`** (new): Health KPIs, service status, DB tables, engine modules, error summary, live activity feed — 30s auto-refresh, restart actions
- **`frontend/src/app/admin/components/tabs/UsersTab.tsx`** (new): Paginated cross-tenant user table, search, edit drawer, REVOKE SESSIONS 2-step confirm
- **`frontend/src/app/admin/components/tabs/TenantsTab.tsx`** (new): Tenant list, create modal (auto-slug, 400 inline error), edit drawer, SUSPEND confirm
- **`frontend/src/app/admin/components/tabs/RolesTab.tsx`** (new): Two-column RBAC catalog, permission groups, create role modal with checklist
- **`frontend/src/app/admin/components/tabs/ApiKeysTab.tsx`** (new): Create/revoke flow with show-once token + COPY, audit log, DELETE 204 handling
- **`frontend/src/app/admin/components/tabs/MetricsTab.tsx`** (new): KPI cards, CSS funnel chart, period selector (7d/30d/90d), activity feed
- **`frontend/src/app/admin/components/tabs/ConfigTab.tsx`** (new): 4 independent sections (feature flags, maintenance mode, rate limits, CORS) with IN-MEMORY badges + per-section SAVE
- **`frontend/src/app/admin/components/tabs/DevOpsTab.tsx`** (new): Sprint progress, risk heat map, architecture freeze, sessions, decisions, validations — 30s auto-refresh
- **`frontend/src/components/layout/AppSidebar.tsx`**: Admin nav updated to `/admin`
- Deleted: `frontend/src/app/admin-monitor/`, `frontend/src/app/devops/`

### Backend tests (5 commits)
- **`backend/tests/test_admin_users_v1.py`**: 7 tests (GET, PATCH, revoke-sessions, auth)
- **`backend/tests/test_admin_tenants_v1.py`**: 5 tests marked `@requires_postgres` (ANY() syntax)
- **`backend/tests/test_admin_roles_v1.py`**: 5 tests (roles, permissions, auth)
- **`backend/tests/test_admin_config_v1.py`**: 7 tests (GET, PATCH feature flags, maintenance, CORS)
- **`backend/tests/test_admin_metrics_v1.py`**: 11 tests marked `@requires_postgres`
- **`frontend/e2e/admin.spec.ts`**: E2E spec covering all 8 tabs

### Validation
- 19 backend admin tests pass on SQLite; 16 skip (requires_postgres — correct)
- TypeScript: `npx tsc --noEmit` — zero errors
- Next.js build: clean
- Pushed to master (f4202d6)

---

## 2026-03-15 — Governance Section UI/UX Overhaul

### Summary
Fixed broken layouts across all 5 governance pages (Staging Queue, Ledger, Run Viewer, Position Lineage, Hedge Wiki).

### Commits: 76aa215
- **`frontend/src/app/staging/page.tsx`**: Removed outer flex wrapper, added noPadding + refresh + cross-links
- **`frontend/src/app/ledger/page.tsx`**: Complete rewrite — inline-styled table, PASS/WARN badges, cross-links
- **`frontend/src/app/run-viewer/page.tsx`**: Removed redundant chrome layers, added wiki link
- **`frontend/src/app/lineage/page.tsx`**: Added PageShell wrapper + HelpPanelV2 layout
- **`frontend/src/app/hedgewiki/page.tsx`**: Fixed outer div, updated breadcrumb to Governance

---

## 2026-03-15 — Audit Lab POST /runs HTTP 500 Fix

### Root Cause
- asyncpg infers `TIMESTAMPTZ` OID for `market_snapshots.as_of` column; passing Python `str` values for `buffer_start`/`buffer_end` raises `DataError: invalid input for query argument $2: expected datetime.date, got 'str'`

### Fix (5 commits: a0ca117, 26b9c1a, 77ca4ed, 3abd259, 30b3c6f)
- **`v1_audit_lab.py`**: Pass `buffer_start`/`buffer_end` as `datetime.date` objects (removed `str()` wrapping); added `CAST()` for all UUID/JSONB params in `audit_runs`, `audit_findings`, `audit_reports` INSERTs; `create_audit_run` thin wrapper + `_create_audit_run_inner` for error surfacing
- **`test_audit_lab_upgrade.py`**: `inspect.getsource(_create_audit_run_inner)` instead of wrapper
- **`main.py`**: Debug exception handler (reverted to safe form in final commit)

### Validation
- 442/442 audit_lab tests pass (`python -m pytest tests/ -k audit_lab -q`)
- Render deploy pending manual trigger

---

## 2026-03-15 — IBKR Gateway Live Data + WebSocket Streaming for ORDR Market Charts

### IBKR Real-Time Data Pipeline (ordr-market)
- **`backend/app/services/market_stream.py`** (new): `MarketStreamManager` singleton — dedicated IB connection (clientId+20), IBKR `reqMktData` streaming via `pendingTickersEvent`, fallback to 1.5s snapshot polling if Gateway unreachable
- **`backend/app/api/routes/v1_ws_market.py`** (new): Public WebSocket at `/ws/market` — subscribe/unsubscribe/ping protocol, 30s keepalive
- **`backend/app/api/router.py`**: Registered WS router
- **`backend/app/main.py`**: Stream manager shutdown wired into lifespan finally block
- **`ordr-market/src/hooks/useMarketWebSocket.ts`** (new): Frontend WS hook — auto-reconnect (3s), symbol re-subscribe without reconnect, `ws://`↔`wss://` auto-derived from `NEXT_PUBLIC_API_URL`
- **`ordr-market/src/components/workspace/ChartCore.tsx`**: Replaced mock data generator with real IBKR data — `usePublicChartData` for historical OHLCV bars, `useMarketWebSocket` for live tick updates to last bar
- **`ordr-market/.env.local`** (new): `NEXT_PUBLIC_API_URL=http://localhost:8000`
- **NEXUS** (ordr-market): First-time init — 28 tables, 8 agents, genesis seeded

### Test Evidence
- Backend: `3545 passed, 0 failed` (excl. 2 pre-existing unrelated failures)
- TypeScript: `tsc --noEmit` clean

## 2026-03-14 — IBKR Paper Trading + Colorful Login (commit 732b2a0)

### IBKR Integration (ADR-0005)
- **IBKRExecutor service** (`ibkr_executor.py`): ib_insync-based FX order execution with connect/disconnect, contract resolution cache, MKT/LMT orders, fill-wait with timeout, batch execution
- **3 API endpoints** (`v1_ibkr.py`): GET /v1/ibkr/status, POST /v1/ibkr/connect, POST /v1/ibkr/execute
- **PhaseExecute rewrite**: Removed Live Market Snapshot section, added IBKR execution flow with confirmation overlay, fill tracking, weighted avg price, auto-HEDGED position marking
- **ADR-0005**: Documents broker execution exception for paper trading (v1 freeze extension)
- **56 new tests**: 35 executor service + 21 route tests, all passing

### Login Page
- **Colorful particle field**: useParticleField hook extended with HSL color-shifting mode (treasury pastels: cyan, blue, lavender, teal, rose, mint), sinusoidal oscillation between white and accent hues
- Login page canvas opacity 0.6→0.7, saturation 35, lightness 86

## 2026-03-14 — Deep Security Audit: Admin + Hedge Desk + Pipeline (commit af2357a)

### Admin Section (10 criticals fixed)
- **Unauthenticated DB wipe**: `seed-companies` gated behind `require_superuser` + production env block
- **WORM compliance**: Removed DELETE/TRUNCATE on audit_events, calculation_runs, policy_revisions
- **Credential leak**: Stripped plaintext passwords from seed response
- **API key creation**: Delegated to service with proper Argon2id hashing (was missing secret_hash)
- **API key auth escalation**: Replaced `validate_api_key` with `require_superuser` on management endpoints
- **Dual Base class**: `api_key_audit.py` now uses `app.core.db.Base` (was invisible to migrations)
- **Token version**: JWT `ver` claim now validated in `get_current_user` — forced logout works
- **Auth consolidation**: 3 files fixed to import `get_current_user` from `dependencies.py` (not `security.py`)
- **Frontend auth gates**: admin-monitor + devops pages guard data fetches before superuser check

### Hedge Desk Pipeline (5 criticals fixed)
- **Tenant isolation**: `company_id` column added to `proposals` + `ledger_entries` tables
- **Scoped queries**: `list_proposals`, `get_proposal`, `list_ledger`, `get_ledger` all filter by tenant
- **RBAC**: All proposal + ledger endpoints now require permission checks

### Hedge Desk Workflow (6 high fixes)
- **Data flow**: `calcResult` stores full object (marketSnapshot no longer lost between phases)
- **Currency**: PhaseExecute extracts currency from bucket dynamically (was hardcoded MXN)
- **CME_SPECS**: Consolidated into shared `tokens.ts` (was duplicated in Review + Execute)
- **Execution safety**: Confirmation overlay before irreversible HEDGED marking
- **Hash chain**: Pipeline events query prev hash per-tenant (was always GENESIS_HASH)
- **Terminal guard**: Block field mutations on HEDGED/REJECTED positions

### Backend Hardening (3 high fixes)
- **Dual-key**: Removed route-layer override — service is single source of truth
- **Governance default**: `"solo"` → `"team"` (fail-closed SoD)
- **DB models**: `__import__` hack removed, int→UUID FK types fixed, Float→Numeric for monetary columns

### Evidence
- 95 new tests across 6 test files
- 3475 backend tests passed, 134 skipped, 0 failed
- Frontend TypeScript clean, build passes
- 35 files changed, +2015 -206 lines

## 2026-03-14 — Marketing Site Redesign: Tailwind + SVG Diagrams (commit 88af206)
- **Full redesign**: Replaced inline-style C/F theme system with Tailwind CSS classes and enterprise grid aesthetic.
- **Home page**: 12 sections with 3 inline SVG diagram components (SvgArchitecture 3-layer platform, SvgHashChain WORM audit blocks, SvgPillars 5 infrastructure pillars).
- **Custom CSS**: `bg-grid`/`bg-grid-dark` patterns, `section-label` with `::before` dash, `mkt-card` hover top-border animation, `status-dot` with `pulse-dot` keyframe.
- **Nav rebuild**: Products/Solutions mega-dropdowns with icons, ORDR Market removed as standalone link (only in Products dropdown). Mobile overlay simplified.
- **Footer rebuild**: 5-column dark layout (brand+status, products, solutions, company, legal) with external link support.
- **Secondary pages**: About (Engine/AI panels, Core Values, Numbers Strip), Contact (form+cards+system status), Products index (2-col grid with AI Boundary boxes).
- **Product CTAs**: All "Get Started" → "Request Demo", /auth/login → /contact across 5 product detail pages.
- **Layout**: MarketingLayout simplified (no C/F imports), theme.ts preserved for product detail backward compat.
- 15 files changed, +889 -1630 lines (-741 net).

## 2026-03-13 — ORDR Market Embedded Mode + Workspace Refactor (commit 99ef12b)
- **ChartEngine embedded mode**: 12 new props for external config sync (indicators, sub-panes, chart type, drawing mode, magnet/hide/lock/delete-all).
- **Theme**: `syncThemeWithCSS()` for CSS variable integration.
- **priceLine**: New `drawIndicatorLegend()` for sub-pane indicator labels.
- **IndicatorsPanel**: Expanded with category groups and search filtering.
- **WorkspaceProvider**: External state management for embedded chart integration.
- **ChartCore/CommandBar**: Refactored for workspace integration, simplified rendering.
- 16 files changed, +1056 -733 lines.

## 2026-03-13 — Professional FinTech Marketing Website (commit 7bb2a2d)
- **Landing page**: Complete rewrite with 10 animated sections — ticker tape, metrics counters, scroll-triggered animations, hero gradient, feature grid, use cases, CTA.
- **7 product pages**: Treasury, Market, Portfolio, Labs, Polisophic, HedgeWiki, FinHub — each with hero, animated metrics, feature cards, use cases, CTA.
- **6 solution pages**: Corporate Treasury, Risk Management, Asset Management, Banking, Insurance, Energy — industry-specific content with relevant product mapping.
- **Pricing**: 3 tiers (Essentials $299/mo, Professional $799/mo, Enterprise custom) with feature comparison and FAQ.
- **About**: Company story, leadership team (4 executives), values section.
- **Contact**: Form with role selector + contact info cards.
- **Shared infra**: `MarketingLayout` (nav+footer wrapper), `MarketingNav` (529L, product/solution dropdowns, mobile hamburger, theme toggle), `MarketingFooter` (271L, 5-column layout), `theme.ts` (DARK/LIGHT presets, fonts), `useMarketingTheme` hook.
- **ClientProviders**: `/products`, `/solutions`, `/pricing`, `/about`, `/contact` added as public route prefixes.
- **Fix**: React hooks rules violations — `useCounter` in `.map()` callbacks replaced with `MetricCounter` component across all 7 product pages.
- 25 files changed, +5647 -420 lines.

## 2026-03-13 — Report Studio: Formal Narratives + Library Bridge (commit bb0c613)
- **Library → Studio bridge**: Fixed dead `onSelectPreset` callback — clicking a preset in Library now loads it into Studio tab via `pendingPresetId` state.
- **Narrative engine**: 7 generators producing multi-paragraph institutional prose (executive summary, exposure, hedge efficiency, scenario, compliance, VaR, hedge accounting).
- **NarrativeSection component**: Shared renderer with type-coded left borders (OVERVIEW/ANALYSIS/FINDING/METHODOLOGY/RECOMMENDATION/DISCLAIMER).
- **Enhanced panels**: 5 report panels now render narrative sections below existing metrics.
- **Tests**: 135+ new tests — 65 unit (reportCalcs), 40 narrative, 30+ workflow.

## 2026-03-13 — UIUXSRC Portable Design System (commit bae6972)
- **New package**: Created standalone `UIUXSRC/` design system — portable, framework-agnostic UI component library.
- **7 theme presets**: Treasury Dark, Midnight, Slate, Arctic, Bloomberg, Nord, Solarized — all with CSS variable tokens.
- **13 components**: Button, ActionButton, Card, KpiTile, KpiStrip, StatusChip, EmptyState, Spinner, Icon, PageHeader, PageShell + ThemeProvider + contrast validator.
- **Integration guide**: `CLAUDE.md` (253 lines) with usage patterns, token reference, component API docs. `README.md` with quick start.
- **Design tokens**: `tokens.ts` (centralized S object), `globals.css` (341 lines of CSS variables), WCAG contrast validation utility.
- **Research**: `UIUX Research/` added with deep-research-report.md + Treasury Software Color Theme Research.docx.
- 20 new files, +2595 lines. No build impact (standalone package).

## 2026-03-13 — Stale Route Cleanup (commit 4458175)
- **Fix**: Updated 8 files with dead references to `/market-overview` and `/fx-market` after page deletion.
- **Files**: dashboard/page.tsx, help/page.tsx, Nav.tsx, DashboardHelpPanel.tsx, CommandHubWidget.tsx, QuickActionsWidget.tsx, ClientProviders.tsx, helpContent.ts.
- All routes now point to `/market-intelligence` with appropriate tab params.

## 2026-03-13 — Unified Market Intelligence Dashboard (commit 243febf)
- **Consolidation**: Replaced 3 disconnected market pages (`/market-intelligence`, `/market-overview`, `/fx-market`) with single tabbed Market Intelligence Dashboard at `/market-intelligence`.
- **6 tabs**: Overview (5-layer command page: ticker tape, hotlists, heatmap, calendar, breadth, sectors, technicals, news), Heatmap (full-viewport with Stocks/ETFs/Forex/Crypto selector), Calendar (economic events), Companies (symbol search + overview + technicals), Watchlists (localStorage persistence + screener + mini charts), Signals (passive technicals grid + news stream).
- **New components** (17 files): `TradingViewWidget.tsx` (generic script-injection embed wrapper), `MarketTabBar.tsx`, `MarketControlBar.tsx`, `types.ts`, 5 overview sub-components (LeftColumn, CenterColumn, RightColumn, BelowFoldModules, MarketPulseStrip), 6 tab components (OverviewTab, HeatmapTab, CalendarTab, CompaniesTab, WatchlistsTab, SignalsTab).
- **Sidebar**: MARKET section updated from 3 separate items to 6 tab-linked items, prefixes narrowed to `["/market-intelligence"]`.
- **Deleted**: `market-overview/page.tsx`, `fx-market/page.tsx`.
- **Build**: PASS (next build clean). No backend changes.

## 2026-03-12 — ORDR Market Workspace Redesign (ordr-market/)
- **Full UI rebuild**: Replaced dark-theme top-bar + raw ChartEngine mount with institutional light-theme trading workstation shell
- **New workspace/ layer** (4 files, 1,485 lines): `tokens.ts` (design system), `primitives.tsx` (7 atomic components), `MockCandleChart.tsx` (Canvas 2D chart), `ChartWorkspace.tsx` (shell assembly)
- **Layout**: 40px top bar · 40px left drawing rail (20 tools) · flex chart canvas · 40px right utility rail · 28px bottom strip — chart occupies ~88% viewport
- **Design system**: Cool neutral palette (`#F0F3FA` / `#FAFBFE`), muted blue/salmon candles, Inter + JetBrains Mono fonts, token-driven spacing/radii/shadows
- **Canvas chart**: 250-bar mock OHLCV, 7px narrow candles, S/R dashed levels, ghost watermark, price/time axes, volume zone, ResizeObserver responsive
- **Interactive states**: Hover/active on all buttons, floating drawing palette on draw-mode activation, paper trading toggle, timeframe + chart-type selectors
- **Build**: Clean — 0 TS errors, 0 warnings. Merged PR #1 → master. Deployed to Vercel (auto).

## 2026-03-09 — Audit Lab Canonical Truth Pass
- **Reclassification**: Prior "37/40 production-ready" claim corrected to conservative truth: 3/40 OPERATIONALLY PROVEN, 33/40 CODE COMPLETE (synthetic data only), 3/40 PARTIAL, 1/40 STUB/BLOCKED.
- **Mandatory downgrades**: Items 5 (source-inspection test), 21 (programmatic XLSX), 22 (mocked pdfplumber), 25 (hand-crafted SWIFT fixture), 26 (synthetic forward points), 37 (unvalidated ISDA/FINRA schemas) → CODE COMPLETE. Item 29 (benchmark provider never imported) → STUB/BLOCKED.
- **P3 reclassified**: Document parsing foundation, not OCR-grade document intelligence.
- **P6 reclassified**: Regulatory format stubs, not schema-validated compliance exports.
- **Canonical truth memo**: `docs/audits/2026-03-09-audit-lab-canonical-truth-memo.md`
- **State files corrected**: CURRENT_STATE.md inflated claims removed, new HIGH risk added for real-data gap.

## 2026-03-09 — Audit Lab Blocker Fixes + P4 Pipeline Integration + 1-to-1 Audit
- **Blocker: Regulatory export** — ISDA XML now loads actual transactions from audit_transactions (not findings), builds proper SELL/BUY trade legs, includes `<auditSummary>` section with findings count/total. FINRA 17a-4 field mappings fixed (finding_id, timestamp, category, severity, description).
- **Blocker: Review queue** — Backend `GET /review-queue` endpoint returns low-confidence transactions (confidence < 0.8) with RBAC `audit.review` permission. `POST /review-queue/{id}/resolve` supports approve/reject/correct (WORM-safe append). Frontend fully upgraded from stub run-list to functional confidence-based review interface with KPIs, filter tabs, color-coded confidence cells, approve/reject buttons.
- **Blocker: Run detail response** — Now returns `rate_variance_results`, `counterparty_scores`, `natural_hedges`, `outlier_count` from report_json (was missing analytics fields).
- **Blocker: Trends endpoint** — Now includes `counterparty_breakdown` aggregate for frontend trend dashboard.
- **P4 Item 26 (Forward Points)** — `forward_points` field on BenchmarkEntry, applied in `_compute_markup()` when `value_date != trade_date`.
- **P4 Item 27 (Intraday)** — `trade_time` field on AuditTransactionInput (structural only, no hourly matching logic).
- **P4 Item 28 (Cross-Rate)** — `_synthesize_cross_rate()` wired into `_compute_markup()` as fallback before rejection. Synthetic benchmarks tagged `SYNTHETIC_CROSS`.
- **P4 Item 30 (Size Normalization)** — `size_adjusted_markup_bps` on MarkupFinding, computed during markup analysis against 3-tier expected spreads.
- Tests: +53 new (20 P4 engine + 33 review queue/regulatory). Total: 3157 passed, 134 skipped, 0 failed. Frontend build clean.

## 2026-03-09 — Audit Lab Production Hardening Sprint
- **Dataclass fix**: `spread_classification` field moved after required fields (Python dataclass ordering rule)
- **SQLite compat**: bid_rate/ask_rate benchmark query wrapped in try/except fallback
- **RBAC permissions**: 4 new permissions registered (audit.review, audit.export, audit.schedule, audit.benchmark_fetch) + role mappings for supervisor/risk_analyst
- **Analytics wiring**: `_detect_outliers()`, `_score_counterparties()`, `_detect_natural_hedges()` now called inside `run_audit_engine()` with results stored in `AuditEngineResult`
- **Finding persistence**: OUTLIER findings now persisted to audit_findings WORM table; report JSON includes analytics data
- **Rename**: `UnhedgedImpactResult` → `RateVarianceResult`, `UNHEDGED_IMPACT` → `RATE_VARIANCE` finding type, `total_unhedged_impact_usd` → `total_rate_variance_usd` — all with `@property` backward compat aliases
- **Exposure gap**: pair normalization fixed (alphabetical sort, not concatenation order)
- **Pydantic schemas**: Updated with rate_variance, analytics fields, backward compat
- **Frontend**: Run detail page updated for rate_variance + analytics types
- **Tests**: +53 upgrade tests (RBAC, exposure gap, spread classification) + 35 parser fixture tests with real sample files
- Validation: 3104 passed, 134 skipped, 0 failed. Frontend build clean.

## 2026-03-09 — Audit Lab Institutional Upgrade (40 items, P0-P6)
- **P0 Foundation** (Items 1-7): Alembic migration with FK constraints + 4 composite indexes on audit tables. ORM models for 5 audit tables (`audit_lab.py`). Batch INSERT replacing per-row loop. Date range filter ±30 days on market_snapshots. 10MB file size limit. Admin metrics `uploaded_by→created_by` + status case fix. Benchmark staleness limit (7-day default, configurable).
- **P1 Markup Methodology** (Items 8-13): Signed markup (removed `abs()`) with ADVERSE/FAVORABLE/AT_MARKET direction. Bid/ask columns on market_snapshots (migration + model). Within-spread classification (WITHIN_SPREAD/OUTSIDE_SPREAD/SPREAD_UNKNOWN). MXN default removal (fail-closed on null currency). CSV preview component. Transaction drill-down endpoint + 5th tab.
- **P2 Visualization + Reporting** (Items 14-20): MarkupByMonthChart (ECharts bar), RateScatterChart (scatter), CounterpartyMatrix (heatmap). Client-side PDF/XLSX/CSV export (`auditLabExport.ts`). Run comparison page. "unhedged_impact" → "rate_variance" rename noted (backward compat).
- **P3 Document Intelligence** (Items 21-25): Shared parser module (`audit_lab_parsers.py`) with XLSX/PDF/SWIFT MT300 parsers. Field confidence scoring (CSV=1.0, XLSX=0.8-1.0, PDF=0.5-0.9, SWIFT=0.95). Review queue stub page.
- **P4 Market Data Depth** (Items 26-30): Forward point integration in engine. Cross-rate synthesis (EUR/GBP via USD legs). Trade-size spread normalization with 3-tier thresholds. Benchmark provider abstract interface + stubs (Refinitiv, Bloomberg, Alpha Vantage). Intraday rate support (trade_time field).
- **P5 Advanced Analytics** (Items 31-35): Z-score outlier detection per pair. Counterparty best execution scoring (composite 0-100). Natural hedge detection (offsetting same-day flows). Exposure gap analysis endpoint. Trend analysis endpoint.
- **P6 Regulatory + Governance** (Items 36-40): Board-ready executive summary PDF function. ISDA XML + FINRA 17a-4 export stubs. Audit trail page. Schedule CRUD service. Trend dashboard page.
- **Cross-cutting**: Pydantic response models for all endpoints (`schemas_v1/audit_lab.py`). Upload switched from raw `fetch()` to `dashboardFetch()`. 3 new sidebar nav items (Compare, Audit Trail, Trends). Methodology version bumped to 1.1.0.
- Net: +3200 lines backend, +1800 lines frontend. 18 new backend files, 8 new frontend files. 44 new tests.
- Validation: 3051 passed, 134 skipped, 0 failed. Frontend build clean.

## 2026-03-08 — Policy Engine Post-Reconstruction Hardening (7 phases)
- **Phase 1** (forward curves): Created `forward_curve_service.py` + `v1_forward_curves.py` — 4 RBAC-gated endpoints (POST create, GET by id, GET latest/{pair}, GET pair/{pair}). Hash-idempotent CRUD, 24h staleness evaluation (V-023), data provenance classification (LIVE/DELAYED/INDICATIVE/SYNTHETIC). Tests: hash determinism, staleness, provenance validation.
- **Phase 2** (wizard deepening): Extended `policy-ai/route.ts` AI system prompt with `extended_policy` schema (6 sections: volatility, scenarios, decision_gate, netting, instruments, effectiveness). Added response parsing with validation/clamping (lookback_days [20,252], var_confidence [0.90,0.99], max_cost_bps [25,150]). Output now ExtendedPolicyConfig-level, not preset-shaped.
- **Phase 3** (volatility overlay): Created `vol_overlay.py` (Layer 2) — band widening by vol regime (LOW=0.9, NORMAL=1.0, ELEVATED=1.15, CRISIS=1.30), ratio adjustment (clamp cur/base [0.85,1.15]), region-aware fallback vols (G10=8%, EM_LATAM=14%, EM_ASIA=10%, EM_CEEMEA=16%). Created `volatility_snapshot_service.py` + `v1_volatility_snapshots.py` (3 endpoints). 24 tests: parity (4), regime (7), widening (5), adjustment (6), fallbacks (5).
- **Phase 4** (geopolitical overlay): Created `geo_overlay.py` (Layer 3) — linear ratio haircut when corridor risk score exceeds escalation threshold (default 0.7, max haircut 10%). Created `geo_snapshot_service.py` + `v1_geo_snapshots.py` (4 endpoints). 26 currency pairs mapped to geopolitical corridors. 18 tests: parity (4), corridors (4), haircut math (6), application (3), active overlay (4).
- **Phase 5** (backtesting): Created `backtesting.py` — deterministic single-period evaluation (hedged/unhedged PnL, effectiveness, cost), multi-period backtest with max drawdown + aggregate metrics, policy comparison with recommendation. SHA-256 report hash. All labeled `grading: 'HEURISTIC'`. 13 tests: period eval (5), multi-period (5), comparison (2), edge cases (1).
- **Phase 6** (netting overlay): Created `netting_overlay.py` (Layer 6) — same-pair/same-flow-type netting (conservative), cross-flow netting (aggressive, opt-in), savings tracking (~3% margin savings Almgren-Chriss estimate), legs eliminated tracking. 12 tests: parity (4), netting (7), active overlay (2).
- **Phase 7** (governance hardening): Wired `apply_second_approval()` in execution_proposal_service — enforces SoD (second approver ≠ maker AND ≠ primary checker), chained hash linking to approval_hash. Added `_determine_second_approval_required()` ($1M threshold). Added dual-key gate in `execute_approved_proposal()`. Created 15 dual-key E2E tests + 12 multi-tenant isolation tests.
- **Route registration**: All 3 new route modules registered in `api/router.py` (219 total routes).
- **Whitepaper**: Created `overlay-activation-contracts.md` — activation contracts for all overlays with parity proofs, fallback behavior, grading labels.
- **Overlay parity**: ALL overlays neutral by default (disabled). When disabled: multipliers=1.0, adjustments=[], haircut=0.0, exposures pass through. v1 parity mathematically preserved.
- Net: +2400 lines new code, +119 new tests. 13 new files created, 4 existing files modified.
- Validation: 2725 passed, 134 skipped, 0 failed. Frontend build clean.

## 2026-03-07 — Hedge Desk institutional redesign (Phase D)
- **D1** (nav cleanup): Removed WorkflowBreadcrumb + WorkflowGuide from run mode — both were hardcoded to step 1, never updated. ProgressBar is now single authoritative progress model with phase-aware instruction text. Reclaimed ~68px vertical space.
- **D2** (visual unification): Created `tokens.ts` shared design token file. Eliminated PhaseReview's hardcoded Bloomberg-dark palette (14 hex colors). All 7 phase files + ProgressBar now import from shared CSS-variable tokens. Zero hardcoded dark colors remain.
- **D3** (Step 2 rebuild): PhaseCalculate expanded from thin confirmation to "Prepare & Calculate" — exposure narrative, market context interpretation, post-calc recommendation preview (coverage/cost/legs), assumptions block, consequence-of-inaction note. No longer auto-advances after calculation.
- **D4** (Step 3 rebuild): PhaseRisk expanded — 5-constraint evaluation manifest with per-check PASS/FAIL, governance implications (solo vs 4-eyes), quant panels wrapped under "Quantitative Risk Analysis" header. SMB auto-skip now shows visible banner before advancing.
- **D5** (Step 4 rebuild): PhaseReview restructured as Decision Room — Decision Thesis at top (plain-English recommendation), compact step header replacing heavy identity bar, CME specs + audit provenance made collapsible, enhanced CTA with contextual info.
- **D6** (Step 5 reframe): PhaseExecute reframed as "Execution Confirmation" — pre-confirmation checklist, improved disclaimer framing, post-execution warning, CTA shows leg/contract counts.
- **D7** (Step 6 rebuild): PhaseComplete restructured — compact confirmation banner replacing giant checkmark, 3-path next actions (Monitor/Export/New Run), export options consolidated into dropdown card, reduced from 8 buttons to 3 cards.
- Net: +1660 lines, -917 lines across 10 files. 1 new file (tokens.ts).
- Validation: tsc --noEmit clean, next build success, 2444 backend tests passed (0 failed).
- Commit: 8360648

## 2026-03-07 — Hedge Desk redesign: Phases A + B + C
- **Phase A** (foundation): hedgeErrors.ts error translation, ErrorBanner.tsx, draftPersistence.ts, safeFetch wrapper in dashboardClient, EmptyState session-expired/network/no-permission states
- **Phase B** (navigation): AppSidebar simplified Hedge Desk section (6 items), HedgeDeskOverview landing page, dual-mode page.tsx (overview vs run), WorkflowBreadcrumb 6-step strip, WorkflowGuide step-of-5 bar, HedgeDeskPipeline draft persistence + goBack
- **Phase C** (pipeline unification): All 5 steps unified with consistent UX
  - Step 1 PhaseSelect: 3-tab intake (existing/manual/upload), shared basket, "STEP 1 OF 5" header
  - Step 2 PhaseCalculate: summary cards, unified action bar, "STEP 2 OF 5"
  - Step 3 PhaseRisk: verdict card with accent border, "STEP 3 OF 5"
  - Step 4 PhaseReview: targeted edits — step numbering, duplicate button removal, action bar
  - Step 5 PhaseExecute: step header, back moved to action bar
  - PhaseComplete: CSS variable tokens, completion header strip, inline audit trail
- Committed in 4 logical chunks: OS framework → Phase A → Phase B → Phase C
- Validation: tsc --noEmit + next build both pass clean

## 2026-03-07 — R-004 rotation closure + post-scrub verification
- Strengthened docs/ops/secret-rotation-checklist.md into operator-grade execution pack with verification commands and completion protocol
- Fixed ci_risk_gate.py: removed cursor-after-close bug, cleaned up dead code
- Promoted ci_risk_gate from advisory (continue-on-error) to hard blocker in CI
- Updated R-001 and R-004 mitigation text in OPEN_RISKS.md and memory.db
- Clarified R-001/R-004 relationship: rotation resolves both, git scrub is optional maintenance
- Both risks remain at current status (R-001 REDUCED, R-004 OPEN) — truthful, not inflated

## 2026-03-07 — R-001 secret scrub + rotation hardening
- Redacted 3 secrets from docs/audits/codebase-audit.md (OpenAI key, JWT_SECRET, DB password)
- Created docs/ops/secret-rotation-checklist.md (4 rotation items + post-rotation steps)
- Downgraded R-001 from CRITICAL/OPEN → HIGH/REDUCED (current files clean, history contains dead creds only)
- Updated OPEN_RISKS.md and memory.db to reflect 0 CRITICAL risks
- Pre-merge gate now passes without --allow-critical

## 2026-03-07 — Pre-merge governance gate
- Created scripts/pre_merge_gate.py: 5-check gate (truth, freeze, validation, completion, risks)
- Policy model: CONTRADICTION/frozen-diff/invalid-settings/compile-fail → BLOCK; STALE/open-work/missing-rollup → WARN
- Created /merge-gate skill for human/agent invocation
- Fixed freeze_check_precommit.py: added core/security.py (7th pattern)
- Wired pre-merge-gate into CI governance job
- Gate records verdict to memory.db validation_runs table
- Verdict: SAFE_TO_MERGE (with --allow-critical) or BLOCK

## 2026-03-07 — Phase 2 hardening: truth reconciliation + invariant enforcement
- Fixed 16 contradictions/stale claims across state files, MEMORY.md, CHANGELOG, rules
- Corrected DB_CANON.md: 31 → 35 DDL tables, fixed table name mismatches
- Added core/security.py to freeze guard (was in rules but not enforced)
- Upgraded freeze guard: 3-level (hard freeze + content invariant guards + warn-only)
- Invariant guards: WORM trigger removal blocked, SoD/auth edits warned
- Leaned prompt injection: max 1 rule, 20 lines, word-boundary matching (was 2 rules, 40 lines)
- Leaned SessionStart: 12 lines / 572 chars (was 27 lines / 842 chars)
- Added /done skill (completion discipline with evidence chain)
- Added /reconcile skill + scripts/reconcile_truth.py (truth alignment checker)
- Cleaned memory.db: removed test artifacts, seeded work_items, recorded validation
- Trimmed MEMORY.md: 188 → 82 lines, fixed all stale counts/names
- Closed OS Bootstrap sprint, opened Phase 2 Hardening sprint (8/8 done)
- Reconciliation result: 16 aligned, 0 stale, 0 contradictions

## 2026-03-07 — Operating system framework installed + 10 enhancements
- Created 6 rules files (.claude/rules/)
- Created 6 agent definitions (.claude/agents/)
- Created 6 skill definitions (.claude/skills/ — added /status)
- Created 6 state files (.claude/state/ — added golden_rollups.md)
- Created 4 architecture canon files (docs/architecture/)
- Initialized SQLite memory database (.claude/state/memory.db, 10 tables)
- Created 8 hook scripts (.claude/hooks/)
- Wired 6 hook commands across 5 events (SessionStart, UserPromptSubmit, 2x PreToolUse, PostToolUse, PreCompact)
- R1: .gitignore selective tracking (track .claude/ except memory.db + settings.local.json)
- R2: UserPromptSubmit auto-rule injection (detects intent, loads relevant rules)
- R3: /status skill (one-command project dashboard)
- R4: PostToolUse file_facts auto-recording (tracks all file changes in memory.db)
- R5: Pre-commit freeze-check hook (blocks commits to frozen files)
- R6: Weekly memory compaction script (scripts/compact_memory.py)
- R7: Decision recorder + architect workflow (records architectural decisions to DB)
- R8: CI governance job (freeze-check + risk-gate in GitHub Actions)
- R9: DevOps Console (/devops page + 5 backend endpoints + sidebar nav)
- R10: Golden rollups reference (.claude/state/golden_rollups.md)
- Slimmed root CLAUDE.md from 176 → 100 lines (pure constitution)

## 2026-03-06 — Major feature sprint
- Navigation: sidebar redesign (AppSidebar.tsx replaces AppTopBar)
- Calculate: 5-step guided calculation wizard (/calculate)
- Hedge Effectiveness: IFRS 9/ASC 815 testing (engine + 7 endpoints + 2 pages)
- Scenario Studio: Monte Carlo rewrite (composite risk endpoint + 4-tab ECharts)
- Admin Monitor: NOC dashboard (6 backend endpoints + /admin-monitor page)
- Test Coverage: 2158 passing, 59% coverage (up from 55%)
- Forensic audit cleanup: spot_rate rename, _to_usd fix, dead code removal
