# Current Sprint

Sprint: Sprint 6 — Regulatory Reporting (IFRS 9 / ASC 815)
Status: COMPLETE ✓
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
