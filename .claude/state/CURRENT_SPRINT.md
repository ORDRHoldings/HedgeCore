# Current Sprint

Sprint: Sprint 29 — Compare Export, Dataset Clone & D.O. Sparkline
Status: COMPLETE [PENDING BROWSER CONFIRMATION]
Started: 2026-04-10
Completed: 2026-04-10

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 29.1 | Compare modal: EXPORT CSV button (client-side Blob download; columns: run_id, dataset, standard, do_ratio, r_squared, verdict, date) | DONE [PENDING BROWSER CONFIRMATION] | high |
| 29.2 | Dataset clone: `POST /datasets/{id}/clone` backend + amber copy-icon button in DatasetsTab row (cloningId spinner guard) | DONE [PENDING BROWSER CONFIRMATION] | high |
| 29.3 | DatasetsTab accordion: per-dataset D.O. ratio trend sparkline (ECharts SVG line; effective band dashes; point colours; only shown when ≥2 runs with D.O. data) | DONE [PENDING BROWSER CONFIRMATION] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

## Notes
- 29.1: Pure client-side; no backend; CSV constructed from in-memory `compareRuns`; `URL.createObjectURL` + anchor click + `revokeObjectURL`; button in modal header between title and close icon
- 29.2: Backend `POST /datasets/{id}/clone` → copies period data + metadata, appends '(Copy)', new UUID, emits audit event. Frontend: `handleCloneDataset` in Inner; `onCloneDataset` prop on DatasetsTab; `cloningId` state guards double-click; amber hover
- 29.3: ECharts SVG renderer (height=80); filtered to dataset runs with non-null D.O.; chronological sort; green dashed band lines at 0.80/1.25; series point colors green/red by band membership; tooltip shows date + D.O. ratio
- Backend tests: 4801 passed, 158 skipped (no regressions)
- tsc clean (no output from noEmit)

---

# Sprint: Sprint 28 — Bulk Tag, Period Viewer & Rolling Pass-Rate
Status: COMPLETE [PENDING BROWSER CONFIRMATION]
Started: 2026-04-10
Completed: 2026-04-10

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 28.1 | RunsTab: bulk tag all selected (TAG ALL dropdown → REVIEW/APPROVED/FLAGGED/Clear; applies to all selectedIds in localStorage) | DONE [PENDING BROWSER CONFIRMATION] | high |
| 28.2 | DatasetsTab: period data viewer (VIEW DATA toggle in accordion → fetches GET /datasets/{id} → scrollable period table with cumulative D.O.) | DONE [PENDING BROWSER CONFIRMATION] | high |
| 28.3 | OverviewTab: rolling pass-rate KPI (LAST 5 / LAST 10 / ALL toggle; shows % + Δpp vs prior window) | DONE [PENDING BROWSER CONFIRMATION] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

## Notes
- 28.1: `tagBulkOpen` state + `applyBulkTag()` in RunsTab; shares TAGS_KEY/TAG_COLORS/TagValue with existing per-run tag system; dropdown mirrors per-run tag menu; appears when selectedIds.size >= 1
- 28.2: `viewDataId/periodsCache/loadingPeriods/toggleViewData` state in DatasetsTab; `token` prop added; lazy fetch from `GET /v1/hedge-effectiveness/datasets/{id}`; table shows index, date, hedged FV Δ, instrument FV Δ, cumulative D.O. (green if in band, red if out); backend: new `GET /datasets/{dataset_id}` endpoint returns metadata + periods array
- 28.3: `passWindow: 5|10|0` local state in OverviewTab; sorted desc by created_at; window slice + prior window slice; delta in pp vs prior; cyan/amber/red by pass %
- tsc clean, next build clean (99/99 static pages)

---

# Sprint: Sprint 27 — Bulk Delete, Dataset Editor & Best/Worst Tile
Status: COMPLETE [PENDING BROWSER CONFIRMATION]
Started: 2026-04-10
Completed: 2026-04-10

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 27.1 | RunsTab: bulk delete selected runs (trash button → inline confirm → POST /runs/batch-delete) | DONE [PENDING BROWSER CONFIRMATION] | high |
| 27.2 | DatasetsTab: dataset metadata editor (pencil icon → inline edit form for name/pair/designation date → PATCH /datasets/{id}) | DONE [PENDING BROWSER CONFIRMATION] | high |
| 27.3 | OverviewTab: best/worst run tile (D.O. ratio closest to 1.0 vs most out-of-band; clickable to run detail) | DONE [PENDING BROWSER CONFIRMATION] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

## Notes
- 27.1: `deleteConfirm` + `deleting` state in RunsTab; trash icon in toolbar when ≥1 selected; inline confirm strip (red); `onDeleteRuns` prop; backend: `POST /v1/hedge-effectiveness/runs/batch-delete`, `BatchDeleteRunsRequest`, tenant-scoped deletes, audit event
- 27.2: `editingDsId/editName/editPair/editDesig/saving` state in DatasetsTab; pencil icon in each row last column; edit strip in accordion body; `onUpdateDataset` prop; backend: `PATCH /v1/hedge-effectiveness/datasets/{dataset_id}`, `UpdateDatasetRequest`; `designation_date` added to Dataset interface
- 27.3: Pure OverviewTab computation; effective runs sorted by abs(D.O.-1.0); ineffective sorted by max distance; `RunCard` sub-component; only shown when ≥2 runs; green/red accent bars; clickable to run detail
- tsc clean (no errors), next build clean (only pre-existing warnings)

---

# Sprints 16–26 — COMPLETE ✓ (reconstructed from git log)

| Sprint | Commit | Delivered |
|--------|--------|-----------|
| 16 | 986e76d | RE-RUN button, date range filter, effectiveness streak |
| 17 | f7b4fa8 | Health matrix, out-of-band markers, export selected |
| 18 | a78483a | Monthly chart, smart compliance notes, pagination |
| 19 | baba3fd | KPI tiles, sibling runs panel, search highlight |
| 20 | ed0658b | Risk alerts, JSON export, perfect hedge line |
| 21 | e21ec11 | Group-by-dataset, hash chain viz, assessment cadence |
| 22 | 7d37261 | D.O. range filter, row density toggle, worst performers |
| 23 | 15067e4 | Filter presets, trend direction badge, anomaly flags |
| 24 | e1dbb63 | Column visibility, hover popover, activity calendar heatmap |
| 25 | 7f0388c | Keyboard nav, quick tags, dataset sticky notes |
| 26 | 788921d | Tag filter, D.O. statistics panel, per-run analyst notes |

---

# Sprint: Sprint 15 — Comparison, Trend & Print — COMPLETE ✓
Started: 2026-04-05 | Completed: 2026-04-05 | Commit: ed43065

---

# Sprint: Sprint 14 — Bookmarks, Unassessed Alert & Dataset Sort — COMPLETE ✓
Started: 2026-04-05
Completed: 2026-04-05

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 14.1 | RunsTab: star/bookmark runs with localStorage persistence | DONE [PENDING BROWSER CONFIRMATION] | high |
| 14.2 | OverviewTab: unassessed datasets alert panel | DONE [PENDING BROWSER CONFIRMATION] | medium |
| 14.3 | DatasetsTab: sort selector (newest/name/runs/last assessed) | DONE [PENDING BROWSER CONFIRMATION] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

---

# Sprint: Sprint 12 — Standards Breakdown & Distribution — COMPLETE ✓
Started: 2026-04-04
Completed: 2026-04-04

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 12.1 | Overview: per-standard KPI tiles (pass rate % + mini bar per standard) | DONE [PENDING BROWSER CONFIRMATION] | medium |
| 12.2 | Overview: D.O. ratio distribution histogram (ECharts, 10 bins 0.5–1.5, green band, threshold markers) | DONE [PENDING BROWSER CONFIRMATION] | high |
| 12.3 | Run detail: regression narrative panel (qualitative interpretation of R² and slope values) | DONE [PENDING BROWSER CONFIRMATION] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

## Notes
- 12.1: `page.tsx` OverviewTab — groups runs by standard, shows only when ≥2 standards; % pass rate with green/amber/red, mini progress bar
- 12.2: `page.tsx` OverviewTab — fixed bin edges [0.5..1.5], green bars for effective band, ECharts markArea green overlay, shows only when runs.length ≥ 3
- 12.3: `runs/[run_id]/page.tsx` RegressionPanel — deterministic text for 4 R² tiers + slope in/out band; pill badge + prose sentence
- tsc clean, next build clean

---

# Sprint: Sprint 11 — Runs Sort & Upload Intelligence — COMPLETE ✓
Started: 2026-04-04
Completed: 2026-04-04

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 11.1 | RunsTab: sortable column headers (DATASET, D.O. RATIO, R², VERDICT, DATE) with chevron | DONE [PENDING BROWSER CONFIRMATION] | high |
| 11.2 | UploadTab: live D.O. ratio preview panel (appears once ≥2 filled periods, IN/OUT BAND) | DONE [PENDING BROWSER CONFIRMATION] | high |
| 11.3 | UploadTab: inline row validation (non-numeric values get red border on hedged/instrument inputs) | DONE [PENDING BROWSER CONFIRMATION] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

## Notes
- 11.1: `SortKey` type + `sortKey/sortDir` state; `displayRuns = [...filteredRuns].sort(...)`; column headers are buttons with up/down SVG chevron; null-safe via -Infinity for missing ratios
- 11.2: IIFE after period rows; sums all filled periods; ratio = abs(instr)/abs(hedged); green/red banner with D.O. value, IN/OUT BAND pill, filled count
- 11.3: `hedgedInvalid`/`instrInvalid` flags per row; non-empty + NaN = red border; blurs to cyan if valid
- tsc clean, next build clean

---

# Sprint: Sprint 10 — Run Detail Polish — COMPLETE ✓
Started: 2026-04-04
Completed: 2026-04-04

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 10.1 | Period table: out-of-band row highlighting (red tint + IN/OUT badge on CUM RATIO), footer summary | DONE [PENDING BROWSER CONFIRMATION] | high |
| 10.2 | Keyboard navigation: ← prev run, → next run, Esc → back to runs list | DONE [PENDING BROWSER CONFIRMATION] | medium |
| 10.3 | Copy summary button in run detail header (dataset, standard, verdict, D.O., R², hash → clipboard) | DONE [PENDING BROWSER CONFIRMATION] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

## Notes
- All work in: `frontend/src/app/hedge-effectiveness/runs/[run_id]/page.tsx`
- 10.1: `outOfBand` flag drives `background: red08`, `borderLeft: red40`; IN/OUT pill replaces dot; footer shows "N PERIODS | ✓ X IN BAND | ✗ Y OUT OF BAND"
- 10.2: `useEffect` on `allRunIds + runId`; skips input/textarea targets; separate from `load` effect
- 10.3: `navigator.clipboard.writeText` with 2s `copied` flash state; copies 8-field summary
- tsc clean, next build clean

---

# Sprint: Sprint 9 — Overview Depth & Dataset Drill-down — COMPLETE ✓
Started: 2026-04-04
Completed: 2026-04-04

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 9.1 | Portfolio health gauge in Overview (ECharts semicircular gauge, pass rate %) | DONE [PENDING BROWSER CONFIRMATION] | medium |
| 9.2 | Recent assessments feed in Overview (last 6 runs, clickable timeline) | DONE [PENDING BROWSER CONFIRMATION] | medium |
| 9.3 | DatasetsTab accordion expand (click row → show last 3 runs with verdict + D.O.) | DONE [PENDING BROWSER CONFIRMATION] | high |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

## Notes
- All work in: `frontend/src/app/hedge-effectiveness/page.tsx`
- 9.1: ECharts gauge, startAngle 200/endAngle -20, color zones (green/amber/red by pass rate)
- 9.2: Last 6 runs sorted desc by created_at, colored dot, dataset name, currency, date, clickable
- 9.3: DatasetsTab: `expandedId` state, chevron toggle, sub-section shows last 3 runs per dataset_id; `onNavigateRun` prop added; RUN ASSESSMENT button stopPropagation to avoid accordion toggle
- tsc clean, next build clean

---

# Sprint: Sprint 8 — Dataset Intelligence & Run Navigation — COMPLETE ✓
Started: 2026-04-04
Completed: 2026-04-04

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 8.1 | Per-dataset run summary badge in DatasetsTab (run count + last verdict pill) | DONE [PENDING BROWSER CONFIRMATION] | medium |
| 8.2 | Dataset search/filter bar in DatasetsTab (text search by name or pair) | DONE [PENDING BROWSER CONFIRMATION] | high |
| 8.3 | Run detail prev/next navigation arrows (← PREV N/total NEXT →) | DONE [PENDING BROWSER CONFIRMATION] | medium |

## Completed: 3/3
## Sprint Status: COMPLETE [PENDING BROWSER CONFIRMATION]

## Notes
- 8.1 + 8.2: `frontend/src/app/hedge-effectiveness/page.tsx` — DatasetsTab: added `runs: Run[]` prop, `dsStats` map computed from runs grouped by dataset_id, per-row verdict badge + run count
- 8.2: search input filters `filteredDs` by name or currency_pair; shows "N OF M" count
- 8.3: `frontend/src/app/hedge-effectiveness/runs/[run_id]/page.tsx` — parallel fetch of `/v1/hedge-effectiveness/runs`; sorted by `created_at` desc; prev/next computed from `allRunIds.indexOf(runId)`; arrows hidden when only 1 run
- tsc clean, next build clean

---

# Sprint: Sprint 7 — Analytics & Export — COMPLETE ✓
Started: 2026-04-04
Completed: 2026-04-04

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 7.1 | PASS RATE KPI tile (5th tile in header strip, green ≥ 80%) | DONE ✓ BROWSER CONFIRMED | medium |
| 7.2 | Effectiveness trend stacked bar chart in Overview tab (ECharts, last 20 runs) | DONE ✓ BROWSER CONFIRMED | medium |
| 7.3 | Filter toolbar on ASSESSMENT RUNS tab (text search, standard, verdict) | DONE ✓ BROWSER CONFIRMED | high |
| 7.4 | CSV export button on ASSESSMENT RUNS tab (exports filtered runs) | DONE ✓ BROWSER CONFIRMED | high |

## Completed: 4/4
## Sprint Status: COMPLETE ✓

## Browser Confirmation Evidence (2026-04-04)
- 7.1: KPI strip shows "PASS RATE 66.7%" (2 effective / 3 total — correct)
- 7.2: "EFFECTIVENESS TREND" chart rendered in Overview tab
- 7.3: Verdict pills ALL/EFFECTIVE/INEFFECTIVE present; INEFFECTIVE filter → "1 OF 3 RUNS" showing only GBP/USD
- 7.4: "EXPORT CSV" button present in Runs toolbar

## Notes
- All work in: `frontend/src/app/hedge-effectiveness/page.tsx`
- ECharts loaded via `dynamic(() => import("echarts-for-react"), { ssr: false })`
- CSV export uses createObjectURL blob pattern (no backend call)
- Filter is client-side only — no new API endpoints
- tsc clean, next build clean (422f4ad)

---

# Sprint: Sprint 6 — Regulatory Reporting (IFRS 9 / ASC 815) — COMPLETE ✓
Started: 2026-04-04
Completed: 2026-04-04

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 6.1 | IFRS 9 XML + ASC 815 XML download buttons on run detail page header | DONE ✓ BROWSER CONFIRMED | high |
| 6.2 | Fix PageShell-inside-traces.map() bug on run detail page | DONE | high |
| 6.3 | Add designation_date to RunDetail interface + header metadata strip | DONE ✓ BROWSER CONFIRMED | medium |
| 6.4 | Fix PageShell-inside-RunsTab bug on hedge-effectiveness/page.tsx | DONE | high |
| 6.5 | At-risk hedges monitor in OverviewTab (approaching 0.80 lower / 1.25 upper boundary) | DONE ✓ BROWSER CONFIRMED | medium |
| 6.6 | Methodology & Standards disclosure panel in ComplianceSection (EVIDENCE tab) | DONE | medium |

## Completed: 6/6
## Sprint Status: COMPLETE ✓

## Browser Confirmation Evidence (2026-04-04)
- 6.1: "IFRS 9 XML" + "ASC 815 XML" buttons visible in run detail header
- 6.3: "Designated: 2026-01-01" rendered in header metadata strip
- 6.5: "AT-RISK HEDGES — 1 approaching effectiveness boundary" banner with USDJPY run flagged NEAR LOWER BOUND (D.O. 0.8300)
- 6.6: Run detail page rendered cleanly with ComplianceSection loading (no render errors)
- At-risk boundary fix confirmed: ratio > 0.80 (exclusive) correctly flags 0.83 but would not flag 0.80

## Notes
- Backend XML endpoints were pre-built (Sprint: Regulatory Reporting Exports, 2026-03-20)
- Frontend: tsc clean, next build passed (after cache clean), 4801 tests passed 158 skipped
- Run detail page: `frontend/src/app/hedge-effectiveness/runs/[run_id]/page.tsx`
- Download handler uses `dashboardFetch` to `/v1/hedge-effectiveness/runs/{run_id}/ifrs9-xml` or `/asc815-xml`
- At-risk monitor: flags hedges within 10% of 0.80 lower / 1.25 upper IFRS 9 boundary
- Methodology panel: accounting standard, methodology version, dollar-offset/regression pass/fail, hedge type, designation date with standards citations (IFRS 9.6.4.1 / ASC 815-20-25)

## Human Actions Pending (carried from Sprint 5)
- BROWSER: Verify IFRS 9 / ASC 815 XML download buttons on run detail page
- Run k6 full load test against Render staging (100 VUs, 5 min) — populate docs/performance/load-test-baseline.md
- Add WORKOS_API_KEY, WORKOS_CLIENT_ID to Render env vars
- Add STRIPE_SECRET_KEY_TEST, STRIPE_WEBHOOK_SECRET to Render env vars
- Add SENTRY_DSN to Render + Vercel env vars
- Run scripts/scrub-git-secrets.sh (git history scrub)
- Rotate all API keys

---

# Sprint: Sprint 5 — Scale & Performance — COMPLETE
Started: 2026-03-28
Completed: 2026-03-29

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 5.1 | k6 load testing baseline (100 concurrent users, p95 < 500ms) | DONE | high |
| 5.2 | Market data caching in Redis (60s TTL, cache-hit counter on /system/health) | DONE | high |
| 5.3 | Connection pool tuning (pool_size=20, max_overflow=10) | DONE | high |
| 5.4 | Webhook support (POST/GET/DELETE /v1/webhooks, HMAC-SHA256 signed delivery) | DONE | medium |
| 5.5 | Horizontal scaling prep (stateless deployment docs, multi-instance topology) | DONE | medium |

## Completed: 5/5
## Validation: 4801 passed, 0 failed, 158 skipped; 27 files changed, 2196 insertions

---

# Sprint: Sprint 4 — Compliance Pipeline — COMPLETE ✓
Started: 2026-03-28
Completed: 2026-03-28

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 4.1 | SOC2 Controls Matrix | DONE | high |
| 4.2 | GDPR Enforcement — data export + erasure endpoints + retention job | DONE | high |
| 4.3 | Tenant Isolation Audit — RLS policies on positions + calculation_runs | DONE | high |
| 4.4 | Vendor Security Registry | DONE | medium |

## Completed: 4/4
## Validation: 4767 passed, 0 failed, 158 skipped

---

# Sprint: Sprint 3 — SSO + Billing — COMPLETE ✓
Started: 2026-03-28
Completed: 2026-03-28

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 3.1 | WorkOS SSO: POST /auth/sso/callback | DONE | high |
| 3.2 | Stripe billing webhook (invoice.paid / payment_failed / subscription.deleted) | DONE | high |
| 3.3 | Plan enforcement: require_plan_tier() FastAPI dependency | DONE | high |
| 3.4 | Self-service signup: POST /v1/signup (atomic Company + User + GENESIS) | DONE | high |
| 3.5 | GENESIS hash chain: provision_tenant() + test_genesis_hash_chain.py | DONE | high |
| 3.6 | Frontend signup wizard: /signup 3-step wizard | DONE | medium |
| 3.7 | Scalar API docs: GET /docs route handler | DONE | medium |
| 3.8 | DB migration h1a2b3c4d5e6: sso_provider, sso_domain, stripe_customer_id, stripe_subscription_id, plan_tier | DONE | high |

## Completed: 8/8
## Validation: 4746 passed, 0 failed, 156 skipped

---

# Sprint: Live Market Data Integration
Started: 2026-03-22

## Goals
Wire all 5 live providers end-to-end, validate sandbox autofill→calculate flow,
rotate production secrets, and close the remaining HIGH risks.

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 1 | Secret rotation — Render + Vercel env vars | open | high |
| 2 | IBKR: enable when TWS running — verify CIP forward points live | blocked | high |
| 3 | Sandbox end-to-end: autofill → calculate with live spot | DONE | high |
| 4 | Wire Twelve Data to backend market routes (complement yfinance) | DONE | medium |
| 5 | Dashboard FX rates widget: verify live data renders | DONE | medium |
| 6 | frontend-v2: reconcile deleted files or remove from git tracking | DONE | medium |
| 7 | Close risk #2 (market data feed) once IBKR confirmed live | blocked | low |

## Completed: 4/7
## Sprint Status: IN PROGRESS

## Provider Status (2026-03-25)
| Provider | Status | Key |
|---|---|---|
| yfinance | ✅ live | none needed |
| Twelve Data | ✅ live — verified prod 2026-03-25 (EURUSD 1.1564, USDJPY 159.35, USDMXN 17.78) | ea3629bd... |
| Alpha Vantage | ✅ live | 00GCMPHP... |
| Finnhub | ✅ live | d6h68mpr... |
| exchangerate-api.com | ✅ live | none needed |
| IBKR | ⏳ blocked | requires TWS on port 4001 |

## Key Fix 2026-03-25
- `fix(middleware)`: /api/v1/market-data/live/* added to public_prefixes in APIKeyAuthMiddleware
  → TwelveData provider chain now active in production (was falling back to exchangerate-api.com due to 401)
- Production DB stamped: alembic_version = 2026_03_24_baseline

## Provider Status (2026-03-22 — historical)
| Provider | Status | Key |
|---|---|---|
| yfinance | ✅ live | none needed |
| Twelve Data | ✅ live | 76ffbba2... |
| Alpha Vantage | ✅ live | 00GCMPHP... |
| Finnhub | ✅ live | d6h68mpr... |
| exchangerate-api.com | ✅ live | none needed |
| IBKR | ⏳ pending | requires TWS on port 4001 |

---

# Sprint: Regulatory Reporting Exports — COMPLETE ✓
Started: 2026-03-20
Completed: 2026-03-20

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 1 | export_ifrs9_xml service function + 11 unit tests | DONE | high |
| 2 | GET /{run_id}/isda endpoint (v1_reports.py) | DONE | high |
| 3 | GET /{run_id}/finra-17a4 endpoint (v1_reports.py) | DONE | high |
| 4 | GET /runs/{run_id}/ifrs9-xml endpoint (v1_hedge_effectiveness.py) | DONE | high |
| 5 | GET /runs/{run_id}/asc815-xml endpoint (v1_hedge_effectiveness.py) | DONE | high |
| 6 | RegulatoryTab.tsx — 4 new cards + hedge accounting section | DONE | high |
| 7 | API_CONTRACTS.md — document 4 new endpoints | DONE | medium |

## Completed: 7/7
## Validation: 4615 passed, 154 skipped, 0 failed. Frontend build clean.

## Previous Sprint: Market Intelligence & Portfolio Expansion (COMPLETED 2026-03-19, 9/9 items)

---

# Sprint: Market Intelligence & Portfolio Expansion
Started: 2026-03-19

## Goals
1. Wire Watchlist backend persistence + real-time WebSocket ticks (Option A)
2. Portfolio Multi-Currency Matrix — correlation heatmap, concentration alerts (Option B)
3. Settings tab audit + complete any stubs (Option C)
4. Governance visualization — ledger hash chain, merkle layout (Option D)
5. Signals alerting engine — custom rules, alert triggers (Option E)

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 1 | [A] Backend: UserWatchlist model + CRUD routes + migration | DONE | high |
| 2 | [A] Frontend: WatchlistsTab → backend sync + localStorage fallback | DONE | high |
| 3 | [A] Frontend: useMarketTicker hook → WebSocket live prices in watchlist | DONE | high |
| 4 | [B] Portfolio Multi: 26-pair correlation heatmap + concentration alerts | DONE | high |
| 5 | [B] Portfolio Multi: hedging recommendations panel | DONE | medium |
| 6 | [C] Settings: audit all 12 tabs, build out any stubs | DONE | medium |
| 7 | [D] Ledger: hash chain visualization + merkle tree layout | DONE | medium |
| 8 | [D] Audit Trail: event grouping + impact analysis | DONE | low |
| 9 | [E] Signals: custom alert rules engine (frontend UI) | DONE | low |

## Completed: 9/9
## Sprint Status: COMPLETE ✓

## Previous Sprint: Admin Hub (COMPLETED 2026-03-15, 9/9 items)

---

# Sprint: Admin Hub
Started: 2026-03-15
Completed: 2026-03-18

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 1 | Backend tests — users, tenants, roles, config, metrics | DONE | high |
| 2 | Frontend hub shell + AdminTabBar + sidebar update | DONE | high |
| 3 | OperationsTab + DevOpsTab | DONE | high |
| 4 | UsersTab + TenantsTab | DONE | high |
| 5 | RolesTab + ApiKeysTab | DONE | high |
| 6 | MetricsTab + ConfigTab | DONE | high |
| 7 | Delete old broken pages + full build | DONE | high |
| 8 | E2E spec (admin.spec.ts) | DONE | medium |
| 9 | Final validation + push | DONE | medium |

## Completed: 9/9
