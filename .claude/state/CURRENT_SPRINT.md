# Current Sprint

Sprint: Live Market Data Integration
Started: 2026-03-22

## Goals
Wire all 5 live providers end-to-end, validate sandbox autofill→calculate flow,
rotate production secrets, and close the remaining HIGH risks.

## Items
| # | Item | Status | Priority |
|---|------|--------|----------|
| 1 | Secret rotation — Render + Vercel env vars | open | high |
| 2 | IBKR: enable when TWS running — verify CIP forward points live | open | high |
| 3 | Sandbox end-to-end: autofill → calculate with live spot | open | high |
| 4 | Wire Twelve Data to backend market routes (complement yfinance) | open | medium |
| 5 | Dashboard FX rates widget: verify live data renders | open | medium |
| 6 | frontend-v2: reconcile deleted files or remove from git tracking | open | medium |
| 7 | Close risk #2 (market data feed) once IBKR confirmed live | open | low |

## Completed: 0/7
## Sprint Status: IN PROGRESS

## Provider Status (2026-03-22)
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
