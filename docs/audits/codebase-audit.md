 ORDR TERMINAL — FULL CODEBASE AUDIT

  Date: 2026-03-04 | Auditor: Claude Code (Architect + Engineer + QA + Security + Product + CRO)

  ---
  EXECUTIVE SUMMARY (12 bullets)

  1. Solid institutional core — 35 deterministic calculation modules, WORM audit chain, 4-eyes SoD, 110+ REST endpoints,
   25 ORM models. The governance engine is production-grade.
  2. Frontend overbuilt for its data — 54 routes and 22 widgets exist, but production data is empty (blank slate). The
  gap between surface area and actual content creates a hollow first impression.
  3. Critical secret exposure — A real OpenAI API key is committed to .env and tracked in git. Rotate immediately.
  4. CSRF disabled — marked SEC-06: disabled until fully wired. State-changing endpoints are CSRF-vulnerable.
  5. Two unused dependencies costing bundle weight — @tanstack/react-query and recharts are installed but never imported
   in production code.
  6. get_current_user() missing selectinload — User.company/branch/department are lazy="raise" but the core auth
  dependency doesn't eagerly load them, creating latent 500 risk on any code path that accesses org hierarchy post-auth.
  7. Legacy dead code — app/api/deps.py (deprecated auth), backend/schemas/ folder, 3 redirect-only frontend routes, and
   8+ seed scripts are accumulated technical debt.
  8. CRO gap is severe — There is no guided onboarding, no activation checklist, no contextual help inline, and no
  empty-state coaching. A new user lands on a blank dashboard with zero guidance.
  9. 24 files contain console.log — shipping to production; some are in Next.js API route handlers (server-side, visible
   in logs).
  10. Test posture is strong on engine, weak on UI — 35 backend tests cover calculation determinism and 4-eyes flows
  well; frontend has Jest + Playwright installed but minimal active test coverage.
  11. Multi-head Alembic migrations — 4 merge migration files indicate divergent schema branches; risk of schema drift
  on non-standard DB states.
  12. Plan tier defaulting to "enterprise" — authContext.tsx hardcodes plan_tier: "enterprise" as fallback, making
  feature gating non-functional unless backend explicitly sets the tier.

  ---
  DELIVERABLE 1 — SYSTEM ATLAS

  Navigation Map (Top Nav + All Subroutes)

  Based on AppTopBar.tsx and route files:

  ┌────────────┬──────────────────┬────────────────────────┬──────────────────────┬─────────────────────────────────┐
  │  Section   │    Nav Label     │          URL           │        Status        │              Notes              │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Core       │ Dashboard        │ /dashboard             │ Working              │ Fixed 4-widget layout, no       │
  │            │                  │                        │                      │ react-grid-layout               │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Positions  │ Position Desk    │ /position-desk         │ Working              │ Full CRUD + lifecycle           │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Hedge      │ Hedge Desk       │ /hedge-desk            │ Working              │ Calc engine UI                  │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Hedge      │ Policy Desk      │ /policy-desk           │ Working              │ Template management             │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Pipeline   │ Execution        │ /execution             │ Working              │ Proposal create                 │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Pipeline   │ Staging          │ /staging               │ Working              │ Approval queue                  │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Pipeline   │ Ledger           │ /ledger                │ Working              │ WORM ledger view                │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Analytics  │ Results          │ /results               │ Working              │ Run viewer                      │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Analytics  │ Run Viewer       │ /run-viewer            │ Partial              │ Overlaps /results               │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Analytics  │ Hedge Monitor    │ /hedge-monitor         │ Working              │ MTM + effectiveness             │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Analytics  │ Reports          │ /reports               │ Working              │ PDF/Excel export                │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Analytics  │ Scenario Studio  │ /scenario-studio       │ Partial              │ No confirmed backend route      │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Analytics  │ Portfolio Risk   │ /portfolio-risk        │ Partial              │ Multi-currency                  │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Analytics  │ Portfolio Multi  │ /portfolio-multi       │ Partial              │ Overlaps portfolio-risk         │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Market     │ FX Market        │ /fx-market             │ Working              │ Rate display                    │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Market     │ Audit Trail      │ /audit-trail           │ Working              │ WORM chain view                 │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Market     │ Lineage          │ /lineage               │ Partial              │ No confirmed linkage            │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Input      │ Input            │ /input                 │ Working              │ Manual trade entry              │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Input      │ Upload CSV       │ /upload-csv            │ Working              │ CSV import                      │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Input      │ Import History   │ /import-history        │ Working              │ Connector log                   │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Connectors │ Connectors       │ /connectors            │ Partial              │ IBKR/ERP stubs                  │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Connectors │ Database         │ /database-connection   │ Stub                 │ No backend                      │
  │            │ Connection       │                        │                      │                                 │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Connectors │ ERP Integration  │ /erp-integration       │ Stub                 │ OAuth skeleton                  │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Connectors │ Accounting       │ /accounting-connection │ Stub                 │ OAuth skeleton                  │
  │            │ Connection       │                        │                      │                                 │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Admin      │ Access Control   │ /access-control        │ Working              │ RBAC UI                         │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Admin      │ Settings         │ /settings              │ Working              │ Company settings                │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Help       │ Help             │ /help                  │ Working              │ Static                          │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Help       │ FAQ              │ /help/faq              │ Working              │ Static                          │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Help       │ Support          │ /help/support          │ Working              │ Ticket form                     │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Help       │ Contact          │ /help/contact          │ Working              │ Static                          │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Special    │ Sandbox          │ /sandbox               │ Working              │ Isolated calculation            │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Special    │ Terminal         │ /terminal              │ Partial              │ Voice agent UI                  │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Special    │ HedgeWiki        │ /hedgewiki             │ Working              │ Methodology docs                │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Special    │ AI Policy Wizard │ /ai-policy-wizard      │ Partial              │ Permissions-gated               │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Special    │ Polisophic       │ /polisophic            │ Enterprise           │ Risk intel                      │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Special    │ Committee Pack   │ /committee-pack        │ Partial              │ Export bundle                   │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Special    │ Welcome          │ /welcome               │ Working              │ Onboarding start                │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Special    │ Methodology      │ /methodology           │ Working              │ Engine docs                     │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Dead       │ Execution Desk   │ /execution-desk        │ Redirect →           │ Legacy URL                      │
  │            │                  │                        │ /hedge-desk          │                                 │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Dead       │ Currency FX      │ /currency-fx           │ Redirect →           │ Legacy URL                      │
  │            │                  │                        │ /fx-market           │                                 │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Dead       │ Hedges           │ /hedges                │ Redirect →           │ Legacy URL                      │
  │            │                  │                        │ /position-desk       │                                 │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Dead       │ Trade History    │ /trade-history         │ UNVERIFIED           │ No clear nav entry              │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Dead       │ Execution        │ /execution-history     │ UNVERIFIED           │ No clear nav entry              │
  │            │ History          │                        │                      │                                 │
  ├────────────┼──────────────────┼────────────────────────┼──────────────────────┼─────────────────────────────────┤
  │ Dead       │ Saved Policies   │ /saved-policies        │ Partial              │ Linked from policy-desk         │
  └────────────┴──────────────────┴────────────────────────┴──────────────────────┴─────────────────────────────────┘

  Duplicate Flows

  ┌──────────────────┬────────────────────────────┬─────────────────────────────────────┬──────────────────────────┐
  │   Duplication    │          Route A           │               Route B               │      Recommendation      │
  ├──────────────────┼────────────────────────────┼─────────────────────────────────────┼──────────────────────────┤
  │ Run/result       │ /results                   │ /run-viewer                         │ Merge into               │
  │ viewing          │                            │                                     │ /results/{run_id}        │
  ├──────────────────┼────────────────────────────┼─────────────────────────────────────┼──────────────────────────┤
  │ Portfolio        │ /portfolio-risk            │ /portfolio-multi                    │ Merge or tab-ify         │
  │ exposure         │                            │                                     │                          │
  ├──────────────────┼────────────────────────────┼─────────────────────────────────────┼──────────────────────────┤
  │ ERP/accounting   │ /erp-integration +         │ /accounting-connection +            │ Consolidate into         │
  │ stubs            │ /erp-oauth-callback        │ /accounting-oauth-callback          │ /connectors/{type}       │
  └──────────────────┴────────────────────────────┴─────────────────────────────────────┴──────────────────────────┘

  ---
  DELIVERABLE 2 — ARCHITECTURE (Real)

  A) High-Level Diagram

  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                           ORDR TERMINAL                                      │
  │                                                                              │
  │  ┌─────────────────────────────────────────────────────────────────────┐    │
  │  │                    FRONTEND (Next.js 15.5, React 19)                 │    │
  │  │                                                                      │    │
  │  │  UI Layer                State Layer           Service Layer          │    │
  │  │  ┌────────────┐          ┌─────────────┐       ┌──────────────────┐ │    │
  │  │  │ 54 pages   │ ◄──────► │ Redux (5    │       │ dashboardClient  │ │    │
  │  │  │ 22 widgets │          │ slices)     │       │ (fetch+auth)     │ │    │
  │  │  │ 200+       │          │             │       │                  │ │    │
  │  │  │ components │          │ Auth Context│       │ pipelineClient   │ │    │
  │  │  └────────────┘          │ (cookies)   │       │ positionClient   │ │    │
  │  │         │                └─────────────┘       │ policyClient     │ │    │
  │  │         └──────────────────────────────────────► apiBase.ts       │ │    │
  │  │                                                 └──────────────────┘ │    │
  │  └──────────────────────────────────┬──────────────────────────────────┘    │
  │                                     │ HTTPS/REST + WebSocket                 │
  │  ┌──────────────────────────────────▼──────────────────────────────────┐    │
  │  │                    BACKEND (FastAPI, Python 3.12)                     │    │
  │  │                                                                      │    │
  │  │  Middleware Stack                                                    │    │
  │  │  AuditHeaders → RateLimit → APIKeyAuth → CORS → GZip               │    │
  │  │                                                                      │    │
  │  │  Router Layer (20+ route files, 110+ endpoints)                     │    │
  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │    │
  │  │  │ /v1/     │ │ /auth/   │ │/dashboard│ │ /admin/  │              │    │
  │  │  │positions │ │ login    │ │ summary  │ │ users    │              │    │
  │  │  │proposals │ │ refresh  │ │ runs     │ │ roles    │              │    │
  │  │  │audit     │ │ me       │ │ approvals│ │ API keys │              │    │
  │  │  └────┬─────┘ └──────────┘ └──────────┘ └──────────┘              │    │
  │  │       │                                                             │    │
  │  │  Service Layer                                                      │    │
  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │    │
  │  │  │ position_svc │ │ policy_svc   │ │ exec_prop_svc│               │    │
  │  │  │ pipeline_svc │ │ rbac_svc     │ │ audit_svc    │               │    │
  │  │  └──────────────┘ └──────────────┘ └──────────────┘               │    │
  │  │                                                                      │    │
  │  │  Engine (35 modules — deterministic, WORM-safe)                     │    │
  │  │  kernel.py → normalizer → validator → scenarios → hasher            │    │
  │  │                                                                      │    │
  │  │  Persistence Layer (SQLAlchemy async + asyncpg)                     │    │
  │  └──────────────────────────────────┬──────────────────────────────────┘    │
  │                                     │                                         │
  │  ┌──────────────────────────────────▼──────────────────────────────────┐    │
  │  │              PostgreSQL (Render, 31 tables)                           │    │
  │  │  WORM:  audit_events │ calculation_runs │ policy_revisions │ ledger  │    │
  │  │  Core:  users │ positions │ proposals │ policies │ roles             │    │
  │  │  Org:   companies │ branches │ departments                          │    │
  │  └─────────────────────────────────────────────────────────────────────┘    │
  │                                                                              │
  │  External (UNVERIFIED/stub):                                                │
  │  yfinance (market data) │ Anthropic API (voice) │ Alpha Vantage/Finnhub     │
  │  IBKR connector (stub) │ ERP/accounting OAuth (stub)                        │
  └─────────────────────────────────────────────────────────────────────────────┘

  B) Request Lifecycle Traces

  Workflow 1: User logs in and views dashboard

  1. User submits /auth/login form
     → POST /auth/login (FastAPI)
     → auth.py route → services/auth.py
     → bcrypt.verify(password, hash)
     → create_access_token() + create_refresh_token()
     → RevokePriorRefreshToken → Insert new RefreshToken
     → Insert AuthAuditLog
     → Return {access_token, refresh_token, user}
     → authContext.tsx stores tokens in js-cookie
     → Silent refresh scheduled at T-5min (25min)

  2. Dashboard page mounts (/dashboard/page.tsx)
     → 4 useEffect calls fire (KPI, FxRates, RecentRuns, PendingApprovals)
     → dashboardFetch("/v1/dashboard/summary", token)
     → GET /v1/dashboard/summary (FastAPI)
     → get_current_user() (JWT decode, User DB load)
     → RBAC check (permission: "dashboard.view")
     → Query positions, proposals, alerts for company_id
     → Return {total_exposure, coverage_ratio, pending_count, alerts}
     → KpiSummaryWidget renders with local useState

  Workflow 2: Analyst creates position → runs hedge → proposes execution

  1. POST /v1/positions (position_desk/page.tsx)
     → PositionCreateForm → dashboardFetch POST
     → v1_positions.py → position_service.create_position()
     → Insert Position(status=NEW, company_id=tenant, record_id)
     → Insert AuditEvent (WORM, SHA-256 hash-chained)
     → Return position_id

  2. POST /v1/policies/activate (policy_desk/page.tsx)
     → Assigns PolicyInstance to company
     → PATCH /v1/positions/{id}/assign-policy
     → Position.status → POLICY_ASSIGNED
     → AuditEvent inserted

  3. POST /v1/calculate (hedge_desk/page.tsx)
     → CalculateRequest {position_id, market_snapshot, policy_config}
     → v1_calculate.py → engine_v1/normalizer.py → validator.py → kernel.py
     → Deterministic outputs: hedge_ratio, notional, NPV, scenarios
     → determinism_key = SHA-256(canonical_input)
     → run_hash = SHA-256(determinism_key + outputs)
     → Insert CalculationRun (WORM)
     → Return RunEnvelope {run_id, outputs, trace_bundle}

  4. POST /v1/proposals (execution/page.tsx) [MAKER]
     → ExecutionProposalCreate → v1_execution_proposals.py
     → execution_proposal_service.create_proposal()
     → SoD check: proposed_by = current user
     → Insert ExecutionProposal(status=PROPOSED, maker=user_id)
     → proposal_hash = SHA-256(proposal_payload)
     → AuditEvent inserted
     → Position.status → READY_TO_EXECUTE

  5. PATCH /v1/proposals/{id}/approve [CHECKER — different user]
     → RBAC: requires "proposals.approve"
     → SoD: approved_by != proposed_by (DB CHECK constraint)
     → ExecutionProposal.status → APPROVED
     → approval_hash = SHA-256(proposal_hash + approver_id + timestamp)
     → AuditEvent inserted

  6. POST /v1/proposals/{id}/execute [CHECKER or MAKER]
     → ExecutionProposal.status → EXECUTED
     → Position.status → HEDGED
     → Insert LedgerEntry (WORM, trigger-protected: no UPDATE/DELETE)
     → AuditEvent inserted

  Workflow 3: CFO views branch comparison + exports committee pack

  1. BranchComparisonWidget mounts
     → GET /v1/dashboard/branch-comparison (requires "reports.view_all_branches")
     → RBAC gate: cfo/head_of_risk/cro only
     → Query positions aggregated by branch_id
     → Return {branches: [{name, exposure, coverage, proposals}]}

  2. ReportsContainer → ExportPDF
     → GET /v1/export/committee-pack/{run_id}
     → exports_v1/pdf_builder.py → Generate PDF
     → Returns binary PDF stream
     → Browser downloads as "committee_pack_{date}.pdf"

  C) Data Contracts

  ┌─────────────────────────┬──────────────────────────────────────────┬─────────────────────────┬──────────────────┐
  │        Contract         │                 Location                 │       Key Fields        │    Drift Risk    │
  ├─────────────────────────┼──────────────────────────────────────────┼─────────────────────────┼──────────────────┤
  │                         │                                          │ position_id,            │ MEDIUM —         │
  │ CalculateRequest        │ backend/app/schemas_v1/calculate.py      │ market_snapshot,        │ frontend builds  │
  │                         │                                          │ policy_config           │ payload manually │
  ├─────────────────────────┼──────────────────────────────────────────┼─────────────────────────┼──────────────────┤
  │                         │                                          │ run_id, trade_rows,     │ LOW — WORM       │
  │ RunEnvelope             │ backend/app/contracts/run_envelope.py    │ trace_bundle,           │ prevents drift   │
  │                         │                                          │ determinism_key         │                  │
  ├─────────────────────────┼──────────────────────────────────────────┼─────────────────────────┼──────────────────┤
  │                         │                                          │ id, email, roles,       │ HIGH — plan_tier │
  │ UserContext             │ frontend/src/lib/authContext.tsx         │ permissions, plan_tier  │  defaults        │
  │                         │                                          │                         │ "enterprise"     │
  ├─────────────────────────┼──────────────────────────────────────────┼─────────────────────────┼──────────────────┤
  │ DashboardSummary        │ backend/app/api/routes/dashboard.py      │ total_exposure,         │ LOW              │
  │                         │                                          │ coverage_ratio          │                  │
  ├─────────────────────────┼──────────────────────────────────────────┼─────────────────────────┼──────────────────┤
  │                         │                                          │ position_id,            │                  │
  │ ExecutionProposalCreate │ backend/app/schemas_v1/proposals.py      │ proposed_notional,      │ LOW              │
  │                         │                                          │ currency_pair           │                  │
  ├─────────────────────────┼──────────────────────────────────────────┼─────────────────────────┼──────────────────┤
  │                         │                                          │ short_name,             │                  │
  │ PolicyTemplate          │ backend/app/schemas_v1/policies.py       │ hedge_bands,            │ LOW              │
  │                         │                                          │ strategy_config         │                  │
  ├─────────────────────────┼──────────────────────────────────────────┼─────────────────────────┼──────────────────┤
  │                         │                                          │ spot, forward_points,   │ MEDIUM — demo    │
  │ MarketSnapshot          │ backend/app/contracts/market_snapshot.py │ vol_surface             │ fixtures can     │
  │                         │                                          │                         │ substitute       │
  └─────────────────────────┴──────────────────────────────────────────┴─────────────────────────┴──────────────────┘

  ---
  DELIVERABLE 3 — DATAFLOW + STATE MANAGEMENT AUDIT

  State Management Approach

  ┌────────────┬─────────────────────────────────┬───────────────────────────────────┬─────────────────────────────┐
  │   Layer    │              Tool               │             Used For              │           Issues            │
  ├────────────┼─────────────────────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ Global     │ React Context (authContext)     │ Token, user, roles                │ Good — cookie-backed        │
  │ auth       │                                 │                                   │                             │
  ├────────────┼─────────────────────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ Global app │ Redux Toolkit (5 slices)        │ hedge, pipeline, positions,       │ Partial use — widgets       │
  │            │                                 │ terminal, auth                    │ bypass Redux                │
  ├────────────┼─────────────────────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ Widget     │ Local useState                  │ Each widget fetches independently │ No shared cache, no dedup   │
  │ data       │                                 │                                   │                             │
  ├────────────┼─────────────────────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ Server     │ None (React Query installed but │ —                                 │ WASTE — 80KB+ bundle weight │
  │ state      │  unused)                        │                                   │                             │
  └────────────┴─────────────────────────────────┴───────────────────────────────────┴─────────────────────────────┘

  Critical State Issues

  Issue 1: No cross-widget data sharing
  - Evidence: Every widget (21 components) calls its own dashboardFetch() on mount
  - On dashboard load: 4+ parallel API calls to different endpoints, but also potential duplication if same data needed
  by 2 widgets
  - Fix: Implement React Query or SWR with shared cache keys. File: frontend/src/lib/api/dashboardClient.ts

  Issue 2: plan_tier hardcoded to "enterprise"
  - Evidence: frontend/src/lib/authContext.tsx — plan_tier: user.plan_tier ?? "enterprise"
  - Effect: Feature gating is completely bypassed — every user sees Enterprise features
  - Fix: Remove fallback OR gate it to "lite" until backend explicitly grants tier

  Issue 3: Redux slices populated but widgets don't read from them
  - store/index.ts defines positionsSlice, hedgeSlice, pipelineSlice
  - Most widget components don't useSelector — they re-fetch on every mount
  - Fix: Wire position/pipeline data into Redux; widgets read from store, refetch on invalidation signal

  Issue 4: Silent token refresh race condition
  - Evidence: authContext.tsx — deduplicated in-flight promise exists (good), but refresh timer resets on page
  navigation, potentially double-firing
  - Fix: Move refresh timer to a singleton (service worker or top-level singleton), not component state

  Issue 5: No optimistic updates on proposal approval
  - PendingApprovalsWidget re-fetches after approve action but shows stale count in KpiSummaryWidget
  - Fix: Emit a cross-widget event (Redux action or custom event bus) on approval to trigger KPI refetch

  ---
  DELIVERABLE 4 — USER JOURNEYS

  Journey 1: First-time user → Login → First success moment

  ┌──────────────────┬─────────────────────────────────┬────────────────────────┬──────────────────────────────────┐
  │       Step       │          What happens           │     Drop-off Risk      │             Friction             │
  ├──────────────────┼─────────────────────────────────┼────────────────────────┼──────────────────────────────────┤
  │ 1                │ User visits                     │ —                      │ Landing page is / — UNVERIFIED   │
  │                  │ hedgecore.vercel.app            │                        │ what it shows                    │
  ├──────────────────┼─────────────────────────────────┼────────────────────────┼──────────────────────────────────┤
  │ 2                │ User navigates to /auth/login   │ HIGH — no "Sign up"    │ Login form is functional         │
  │                  │                                 │ CTA visible            │                                  │
  ├──────────────────┼─────────────────────────────────┼────────────────────────┼──────────────────────────────────┤
  │ 3                │ User logs in as demo/demo       │ LOW                    │ Works                            │
  ├──────────────────┼─────────────────────────────────┼────────────────────────┼──────────────────────────────────┤
  │ 4                │ Redirect to /dashboard          │ —                      │ 4 widgets render with empty data │
  ├──────────────────┼─────────────────────────────────┼────────────────────────┼──────────────────────────────────┤
  │ 5                │ User sees empty KPIs, no        │ CRITICAL               │ No guidance, no onboarding rail  │
  │                  │ positions                       │                        │                                  │
  ├──────────────────┼─────────────────────────────────┼────────────────────────┼──────────────────────────────────┤
  │ 6                │ User must find /position-desk   │ HIGH                   │ Nav has 30+ items — overwhelming │
  │                  │ in nav                          │                        │                                  │
  ├──────────────────┼─────────────────────────────────┼────────────────────────┼──────────────────────────────────┤
  │ 7                │ User creates position manually  │ MEDIUM                 │ Form exists, not guided          │
  ├──────────────────┼─────────────────────────────────┼────────────────────────┼──────────────────────────────────┤
  │ 8                │ User must find policy desk      │ HIGH                   │ No wizard linking steps          │
  │                  │ separately                      │                        │                                  │
  ├──────────────────┼─────────────────────────────────┼────────────────────────┼──────────────────────────────────┤
  │ 9                │ User must navigate to hedge     │ HIGH                   │ 3+ clicks to first calculation   │
  │                  │ desk                            │                        │                                  │
  ├──────────────────┼─────────────────────────────────┼────────────────────────┼──────────────────────────────────┤
  │ Time-to-value    │ 8–15 minutes minimum if user    │                        │                                  │
  │                  │ reads nav                       │                        │                                  │
  ├──────────────────┼─────────────────────────────────┼────────────────────────┼──────────────────────────────────┤
  │ CRO Friction     │ 9/10 (very high friction)       │                        │                                  │
  │ Index            │                                 │                        │                                  │
  └──────────────────┴─────────────────────────────────┴────────────────────────┴──────────────────────────────────┘

  Missing: No welcome flow, no onboarding checklist, no guided mode, no sample data auto-insert on first login.

  Journey 2: Add Position → Hedge → Execute → Audit

  ┌────────────────────┬────────────────┬───────────────────┬──────────────────────────────────────────────┐
  │        Step        │    Location    │     Working?      │                   Friction                   │
  ├────────────────────┼────────────────┼───────────────────┼──────────────────────────────────────────────┤
  │ Create position    │ /position-desk │ Yes               │ Form is functional                           │
  ├────────────────────┼────────────────┼───────────────────┼──────────────────────────────────────────────┤
  │ Assign policy      │ /policy-desk   │ Yes               │ Requires existing template                   │
  ├────────────────────┼────────────────┼───────────────────┼──────────────────────────────────────────────┤
  │ Mark ready         │ /position-desk │ Yes               │ One-click PATCH                              │
  ├────────────────────┼────────────────┼───────────────────┼──────────────────────────────────────────────┤
  │ Run calculation    │ /hedge-desk    │ Yes               │ Market snapshot required                     │
  ├────────────────────┼────────────────┼───────────────────┼──────────────────────────────────────────────┤
  │ Review results     │ /results       │ Yes               │ Run viewer shows outputs                     │
  ├────────────────────┼────────────────┼───────────────────┼──────────────────────────────────────────────┤
  │ Create proposal    │ /execution     │ Yes               │ MAKER action                                 │
  ├────────────────────┼────────────────┼───────────────────┼──────────────────────────────────────────────┤
  │ Approve proposal   │ /staging       │ Blocked by SoD    │ Need second user — demo blocks self-approval │
  ├────────────────────┼────────────────┼───────────────────┼──────────────────────────────────────────────┤
  │ Execute            │ /staging       │ Yes (if approved) │ Works                                        │
  ├────────────────────┼────────────────┼───────────────────┼──────────────────────────────────────────────┤
  │ View ledger        │ /ledger        │ Yes               │ WORM entry visible                           │
  ├────────────────────┼────────────────┼───────────────────┼──────────────────────────────────────────────┤
  │ Audit trail        │ /audit-trail   │ Yes               │ Hash chain integrity shown                   │
  ├────────────────────┼────────────────┼───────────────────┼──────────────────────────────────────────────┤
  │ CRO Friction Index │ 7/10           │                   │ SoD demo blocker is biggest pain             │
  └────────────────────┴────────────────┴───────────────────┴──────────────────────────────────────────────┘

  Key UX issue: The SoD requirement (second user to approve) is architecturally correct but kills the solo demo
  experience. There's no sandbox mode that bypasses SoD for demonstration purposes.

  Journey 3: Daily workflow → "what do I do today?"

  ┌───────────────────────┬────────────────────────────┬──────────────────────────────────┐
  │         Step          │        What exists         │          What's missing          │
  ├───────────────────────┼────────────────────────────┼──────────────────────────────────┤
  │ Open dashboard        │ 4-widget view              │ No "today's actions" panel       │
  ├───────────────────────┼────────────────────────────┼──────────────────────────────────┤
  │ See pending approvals │ PendingApprovalsWidget     │ No notification badge on nav     │
  ├───────────────────────┼────────────────────────────┼──────────────────────────────────┤
  │ Click to approve      │ Navigate to /staging       │ No inline approval from widget   │
  ├───────────────────────┼────────────────────────────┼──────────────────────────────────┤
  │ Check exposure        │ ExposureSummaryWidget      │ Works                            │
  ├───────────────────────┼────────────────────────────┼──────────────────────────────────┤
  │ Review new positions  │ Navigate to /position-desk │ No "new since last login" filter │
  ├───────────────────────┼────────────────────────────┼──────────────────────────────────┤
  │ Generate daily report │ Navigate to /reports       │ No scheduled/auto reports        │
  ├───────────────────────┼────────────────────────────┼──────────────────────────────────┤
  │ CRO Friction Index    │ 6/10                       │                                  │
  └───────────────────────┴────────────────────────────┴──────────────────────────────────┘

  ---
  DELIVERABLE 5 — CRO REVIEW

  Primary Funnel

  Visitor → Login → Dashboard → First Position → First Hedge Run → First Approval → Repeat

  Activation metric proposal: User is "activated" when they complete:
  1. First calculation run (CalculationRun created)
  2. First proposal approved (ExecutionProposal status=APPROVED)
  3. First ledger entry (Position status=HEDGED)

  Top 15 CRO Improvements (Prioritized)

  ┌─────┬───────────────────────────────────────────────────────┬───────────────────────────────┬────────┬──────────┐
  │  #  │                      Improvement                      │           Location            │ Effort │  Impact  │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │     │ Guided onboarding wizard — 5-step checklist on first  │ /welcome page + persistent    │        │          │
  │ 1   │ login: "Add position → Set policy → Run hedge →       │ sidebar rail                  │ M      │ Critical │
  │     │ Propose → Approve"                                    │                               │        │          │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │     │ Auto-seed demo data on first login — Insert 3 sample  │ authContext.tsx post-login    │        │          │
  │ 2   │ positions + 1 active policy for demo users; call      │ hook                          │ S      │ Critical │
  │     │ /v1/admin/seed-mxn001 automatically                   │                               │        │          │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │     │ Empty state coaching — When KPI widget shows 0        │ All 21 widgets + EmptyState   │        │          │
  │ 3   │ positions: "No positions yet. [+ Add your first       │ component                     │ S      │ High     │
  │     │ position →]" inline CTA                               │                               │        │          │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │ 4   │ "1-click sandbox demo" — Bypass SoD in sandbox mode;  │ /sandbox + engine validator   │ M      │ High     │
  │     │ show "SANDBOX — not a real trade" banner              │                               │        │          │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │ 5   │ Nav declutter — Group 30+ nav items into 5 sections   │ AppTopBar.tsx +               │ M      │ High     │
  │     │ with expand/collapse; show role-relevant items only   │ AppSidebar.tsx                │        │          │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │ 6   │ Notification badges — Show pending approval count in  │ AppTopBar.tsx +               │ S      │ High     │
  │     │ nav badge; pulse animation                            │ PendingApprovalsWidget        │        │          │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │     │ Inline quick-approve — Approve proposals directly     │                               │        │          │
  │ 7   │ from PendingApprovalsWidget without navigating to     │ PendingApprovalsWidget.tsx    │ M      │ High     │
  │     │ /staging                                              │                               │        │          │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │ 8   │ Audit trail preview panel — Show last 5 audit events  │ New AuditPreviewWidget        │ M      │ Medium   │
  │     │ on dashboard with hash chain status indicator         │                               │        │          │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │ 9   │ "Explain this calculation" panel — Inline expandable  │ results/page.tsx +            │ M      │ Medium   │
  │     │ breakdown of how hedge ratio was computed             │ RunEnvelope trace             │        │          │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │ 10  │ Trust banner — "Your calculations are immutable and   │ Dashboard header              │ S      │ Medium   │
  │     │ hash-chain verified" with link to /audit-trail        │                               │        │          │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │ 11  │ Committee pack one-click — "Export to PDF" CTA        │ /staging/[id] page            │ S      │ Medium   │
  │     │ prominent on proposal detail page                     │                               │        │          │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │ 12  │ Role-gated feature preview — For Lite/SMB users, show │ widgetRegistry.ts + plan_tier │ M      │ Medium   │
  │     │  Enterprise features as locked with upgrade CTA       │  gating                       │        │          │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │     │ Progress indicator on hedge pipeline — Visual step    │                               │        │          │
  │ 13  │ tracker: Position → Policy → Ready → Proposed →       │ /position-desk position card  │ S      │ Medium   │
  │     │ Approved → Hedged                                     │                               │        │          │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │ 14  │ Daily digest email — Summary of pending approvals +   │ New Celery task + email       │ L      │ Medium   │
  │     │ exposure changes (requires backend email job)         │ template                      │        │          │
  ├─────┼───────────────────────────────────────────────────────┼───────────────────────────────┼────────┼──────────┤
  │ 15  │ "What's changed since last login" highlight — Red dot │ /dashboard KPI + position     │ M      │ Low      │
  │     │  on positions added since last session                │ list                          │        │          │
  └─────┴───────────────────────────────────────────────────────┴───────────────────────────────┴────────┴──────────┘

  ---
  DELIVERABLE 6 — CODE HEALTH

  Delete/Archive List

  Item: Legacy auth deps
  Path: backend/app/api/deps.py
  Evidence: Comment: "DEPRECATED use core/dependencies.py"
  Action: Delete
  ────────────────────────────────────────
  Item: Legacy schemas
  Path: backend/app/schemas/ folder
  Evidence: Superseded by schemas_v1/
  Action: Archive → delete in v2
  ────────────────────────────────────────
  Item: Redirect-only routes
  Path: frontend/src/app/execution-desk/, /currency-fx/, /hedges/
  Evidence: Pure redirect() — no content
  Action: Delete after confirming zero inbound links
  ────────────────────────────────────────
  Item: Duplicate seed scripts
  Path: backend/seed_demo.py, seed_smb.py, seed_smb_mxn001.py, seed_two_companies.py, seed_presentation.py
  Evidence: Multiple overlapping seed files
  Action: Consolidate into seed_company.py + seed_demo.py
  ────────────────────────────────────────
  Item: app/api/engine.py + app/api/hedge.py (root level)
  Path: backend/app/api/engine.py, backend/app/api/hedge.py
  Evidence: Superseded by routes/v1_calculate.py
  Action: UNVERIFIED — verify if still imported, then delete
  ────────────────────────────────────────
  Item: React Query
  Path: frontend/package.json
  Evidence: Installed, never imported
  Action: Remove from dependencies
  ────────────────────────────────────────
  Item: Recharts
  Path: frontend/package.json
  Evidence: Installed, never imported
  Action: Remove from dependencies
  ────────────────────────────────────────
  Item: src/app/trade-history/
  Path: frontend/src/app/trade-history/page.tsx
  Evidence: No nav entry found
  Action: UNVERIFIED — audit before removing
  ────────────────────────────────────────
  Item: src/app/execution-history/
  Path: frontend/src/app/execution-history/page.tsx
  Evidence: No clear nav entry
  Action: UNVERIFIED — audit before removing

  Refactor List

  ┌────────────────────┬─────────────────────────────────────┬────────────────────────────────┬────────────────────┐
  │        Item        │                Files                │             Issue              │        Fix         │
  ├────────────────────┼─────────────────────────────────────┼────────────────────────────────┼────────────────────┤
  │ Widget data        │ All 21 widget .tsx files            │ Each widget re-fetches         │ Implement SWR or   │
  │ fetching           │                                     │ independently on mount         │ React Query cache  │
  ├────────────────────┼─────────────────────────────────────┼────────────────────────────────┼────────────────────┤
  │ Dashboard page     │                                     │ Fixed 4-widget grid, not using │ Wire to            │
  │ layout             │ frontend/src/app/dashboard/page.tsx │  react-grid-layout             │ widgetRegistry +   │
  │                    │                                     │                                │ react-grid-layout  │
  ├────────────────────┼─────────────────────────────────────┼────────────────────────────────┼────────────────────┤
  │ Dual portfolio     │ /portfolio-risk + /portfolio-multi  │ Overlapping exposure views     │ Merge into tabbed  │
  │ pages              │                                     │                                │ single page        │
  ├────────────────────┼─────────────────────────────────────┼────────────────────────────────┼────────────────────┤
  │ Dual result pages  │ /results + /run-viewer              │ Both display calculation runs  │ Merge into         │
  │                    │                                     │                                │ /results/[run_id]  │
  ├────────────────────┼─────────────────────────────────────┼────────────────────────────────┼────────────────────┤
  │ get_current_user() │ backend/app/core/dependencies.py:62 │ No selectinload for            │ Add selectinload   │
  │                    │                                     │ User.company/branch/department │ to base query      │
  ├────────────────────┼─────────────────────────────────────┼────────────────────────────────┼────────────────────┤
  │ console.log in     │                                     │ Dev logging shipped to         │ Strip via ESLint   │
  │ production         │ 24 frontend files                   │ production                     │ no-console rule +  │
  │                    │                                     │                                │ lint enforcement   │
  ├────────────────────┼─────────────────────────────────────┼────────────────────────────────┼────────────────────┤
  │ ESLint ignored in  │                                     │                                │ Fix lint errors,   │
  │ builds             │ frontend/next.config.js             │ ignoreDuringBuilds: true       │ re-enable          │
  │                    │                                     │                                │ enforcement        │
  └────────────────────┴─────────────────────────────────────┴────────────────────────────────┴────────────────────┘

  Performance List

  ┌───────────────────────┬──────────────────────────┬─────────────────────────────┬────────────────────────────────┐
  │         Issue         │         Location         │           Impact            │              Fix               │
  ├───────────────────────┼──────────────────────────┼─────────────────────────────┼────────────────────────────────┤
  │ 4+ sequential widget  │ Dashboard mount          │ Adds 400–800ms to first     │ Single aggregated              │
  │ fetches on dashboard  │                          │ paint                       │ /v1/dashboard/all endpoint     │
  ├───────────────────────┼──────────────────────────┼─────────────────────────────┼────────────────────────────────┤
  │ No HTTP caching       │ GET /v1/market/fx/rates  │ Same data fetched per-user  │ Add Cache-Control: public,     │
  │ headers on FX rates   │                          │ per-widget mount            │ max-age=60                     │
  ├───────────────────────┼──────────────────────────┼─────────────────────────────┼────────────────────────────────┤
  │ React Query unused    │ Frontend                 │ No stale-while-revalidate   │ Install + wire to replace raw  │
  │ (missed opportunity)  │                          │                             │ useState fetches               │
  ├───────────────────────┼──────────────────────────┼─────────────────────────────┼────────────────────────────────┤
  │ Bundle includes       │                          │                             │                                │
  │ unused recharts +     │ package.json             │ ~120KB wasted bundle        │ Remove both packages           │
  │ react-query           │                          │                             │                                │
  ├───────────────────────┼──────────────────────────┼─────────────────────────────┼────────────────────────────────┤
  │ No DB indexes         │                          │ UNVERIFIED — audit slow     │ Add EXPLAIN ANALYZE on         │
  │ verified on query     │ backend/app/models/      │ queries                     │ positions/proposals queries    │
  │ patterns              │                          │                             │                                │
  ├───────────────────────┼──────────────────────────┼─────────────────────────────┼────────────────────────────────┤
  │ Alembic schema check  │ backend/main.py startup  │ Adds ~200ms to cold start   │ Run schema check only in       │
  │ on every startup      │                          │                             │ dev/staging                    │
  ├───────────────────────┼──────────────────────────┼─────────────────────────────┼────────────────────────────────┤
  │ yfinance for market   │ backend/requirements.txt │ yfinance is slow,           │ Replace with Alpha Vantage API │
  │ data                  │                          │ rate-limited, unofficial    │  (already keyed in .env.local) │
  └───────────────────────┴──────────────────────────┴─────────────────────────────┴────────────────────────────────┘

  ---
  DELIVERABLE 7 — SECURITY + GOVERNANCE

  Auth & Session

  ┌─────────────────────────┬──────────────────────────────────────────────┬────────────────────────────────────────┐
  │          Area           │                Implementation                │                 Status                 │
  ├─────────────────────────┼──────────────────────────────────────────────┼────────────────────────────────────────┤
  │ JWT                     │ HS256, 30min access / 7d refresh             │ Good                                   │
  ├─────────────────────────┼──────────────────────────────────────────────┼────────────────────────────────────────┤
  │ High-privilege session  │ 15min for                                    │ Good                                   │
  │                         │ CFO/CRO/head_of_risk/board_observer          │                                        │
  ├─────────────────────────┼──────────────────────────────────────────────┼────────────────────────────────────────┤
  │ Token storage           │ js-cookie (httpOnly? — UNVERIFIED)           │ Risk if NOT httpOnly                   │
  ├─────────────────────────┼──────────────────────────────────────────────┼────────────────────────────────────────┤
  │ Single-session          │ RefreshToken revokes prior on login          │ Good                                   │
  │ enforcement             │                                              │                                        │
  ├─────────────────────────┼──────────────────────────────────────────────┼────────────────────────────────────────┤
  │ MFA                     │ TOTP (pyotp) — setup/activate/verify/disable │ Good, UNVERIFIED if enforced for       │
  │                         │                                              │ high-privilege                         │
  ├─────────────────────────┼──────────────────────────────────────────────┼────────────────────────────────────────┤
  │ API Keys                │ HK_live_{keyid}.{secret}, bcrypt-hashed,     │ Good                                   │
  │                         │ expiry                                       │                                        │
  ├─────────────────────────┼──────────────────────────────────────────────┼────────────────────────────────────────┤
  │ CSRF                    │ DISABLED ("SEC-06: disabled")                │ CRITICAL                               │
  └─────────────────────────┴──────────────────────────────────────────────┴────────────────────────────────────────┘

  Tenancy Isolation

  ┌───────────────────────────────┬────────────────────────────┬────────────────────────────────────────────────┐
  │             Check             │           Status           │                    Evidence                    │
  ├───────────────────────────────┼────────────────────────────┼────────────────────────────────────────────────┤
  │ All queries filter company_id │ VERIFIED (routes reviewed) │ where(Position.company_id == user.company_id)  │
  ├───────────────────────────────┼────────────────────────────┼────────────────────────────────────────────────┤
  │ Cross-tenant data access      │ LOW RISK                   │ JWT sub → User → company_id chain              │
  ├───────────────────────────────┼────────────────────────────┼────────────────────────────────────────────────┤
  │ Branch-level isolation        │ Partial                    │ Some routes scope to branch, others to company │
  ├───────────────────────────────┼────────────────────────────┼────────────────────────────────────────────────┤
  │ API key tenant binding        │ VERIFIED                   │ ApiKey.company_id FK enforced                  │
  └───────────────────────────────┴────────────────────────────┴────────────────────────────────────────────────┘

  Secrets Management

  ┌───────────────────┬──────────────────────────────────────┬────────────────────────────────────────────────────┐
  │      Secret       │               Location               │                        Risk                        │
  ├───────────────────┼──────────────────────────────────────┼────────────────────────────────────────────────────┤
  │ OpenAI API key    │ .env (committed to git)              │ CRITICAL — rotate immediately                      │
  ├───────────────────┼──────────────────────────────────────┼────────────────────────────────────────────────────┤
  │ JWT_SECRET        │ .env = ***REDACTED*** │ HIGH — weak, predictable                           │
  ├───────────────────┼──────────────────────────────────────┼────────────────────────────────────────────────────┤
  │ DB password       │ .env = ***REDACTED***                  │ HIGH — weak demo password                          │
  ├───────────────────┼──────────────────────────────────────┼────────────────────────────────────────────────────┤
  │ Alpha Vantage key │ .env.local                           │ MEDIUM — frontend-side exposure risk               │
  ├───────────────────┼──────────────────────────────────────┼────────────────────────────────────────────────────┤
  │ Finnhub key       │ .env.local                           │ MEDIUM — NEXT_PUBLIC_ prefix means browser-visible │
  └───────────────────┴──────────────────────────────────────┴────────────────────────────────────────────────────┘

  Top Security Risks (Ranked)

  ┌──────┬───────────────────────┬──────────┬─────────────────────────────────────┬─────────────────────────────────┐
  │ Rank │         Risk          │ Severity │              Evidence               │           Mitigation            │
  ├──────┼───────────────────────┼──────────┼─────────────────────────────────────┼─────────────────────────────────┤
  │ 1    │ OpenAI key committed  │ Critical │ backend/.env                        │ Rotate key, add .env to         │
  │      │ to git                │          │                                     │ .gitignore, use Vault/AWS SM    │
  ├──────┼───────────────────────┼──────────┼─────────────────────────────────────┼─────────────────────────────────┤
  │ 2    │ CSRF middleware       │ High     │ backend/app/main.py:63 comment      │ Re-enable CSRFMiddleware, test  │
  │      │ disabled              │          │                                     │ all state-changing POSTs        │
  ├──────┼───────────────────────┼──────────┼─────────────────────────────────────┼─────────────────────────────────┤
  │ 3    │ Weak JWT_SECRET in    │ High     │ backend/.env                        │ Generate 256-bit random secret, │
  │      │ dev                   │          │                                     │  inject via Vault               │
  ├──────┼───────────────────────┼──────────┼─────────────────────────────────────┼─────────────────────────────────┤
  │ 4    │ plan_tier defaults to │ High     │ frontend/src/lib/authContext.tsx    │ Fix fallback to "lite", enforce │
  │      │  "enterprise"         │          │                                     │  backend-driven tier            │
  ├──────┼───────────────────────┼──────────┼─────────────────────────────────────┼─────────────────────────────────┤
  │ 5    │ Finnhub/Alpha Vantage │ Medium   │ .env.local                          │ Move to server-side Next.js API │
  │      │  keys in NEXT_PUBLIC_ │          │                                     │  routes (already partial)       │
  ├──────┼───────────────────────┼──────────┼─────────────────────────────────────┼─────────────────────────────────┤
  │      │ js-cookie token       │          │                                     │ Verify cookie flags: httpOnly:  │
  │ 6    │ storage — httpOnly    │ Medium   │ authContext.tsx                     │ true, secure: true, sameSite:   │
  │      │ UNVERIFIED            │          │                                     │ strict                          │
  ├──────┼───────────────────────┼──────────┼─────────────────────────────────────┼─────────────────────────────────┤
  │ 7    │ get_current_user()    │ Medium   │ backend/app/core/dependencies.py:62 │ Add selectinload(User.company,  │
  │      │ missing selectinload  │          │                                     │ User.branch, User.department)   │
  ├──────┼───────────────────────┼──────────┼─────────────────────────────────────┼─────────────────────────────────┤
  │      │ INDICATIVE_FALLBACK   │          │                                     │ Add hard kill-switch: if        │
  │ 8    │ data in engine        │ Low      │ engine_v1/validator.py:349          │ ENV=production and              │
  │      │                       │          │                                     │ INDICATIVE_FALLBACK, raise      │
  ├──────┼───────────────────────┼──────────┼─────────────────────────────────────┼─────────────────────────────────┤
  │      │ Legacy deps.py still  │          │                                     │ Delete — any accidental import  │
  │ 9    │ on disk               │ Low      │ backend/app/api/deps.py             │ re-introduction would use old   │
  │      │                       │          │                                     │ int-parsing auth                │
  ├──────┼───────────────────────┼──────────┼─────────────────────────────────────┼─────────────────────────────────┤
  │ 10   │ Console.log in 24     │ Low      │ Grep results                        │ Enable ESLint no-console rule,  │
  │      │ frontend files        │          │                                     │ CI gate                         │
  └──────┴───────────────────────┴──────────┴─────────────────────────────────────┴─────────────────────────────────┘

  ---
  DELIVERABLE 8 — QA / RELEASE POSTURE

  Test Inventory

  ┌───────────────────────┬───────────────────────────────────────────────────┬─────────────────┬──────────────────┐
  │         Area          │                       Files                       │    Framework    │      Status      │
  ├───────────────────────┼───────────────────────────────────────────────────┼─────────────────┼──────────────────┤
  │ Engine determinism    │ test_engine_determinism.py, test_kernel_*.py (4   │ pytest          │ Strong           │
  │                       │ files)                                            │                 │                  │
  ├───────────────────────┼───────────────────────────────────────────────────┼─────────────────┼──────────────────┤
  │ Auth flow             │ test_api_auth.py, test_auth.py                    │ pytest          │ Good             │
  ├───────────────────────┼───────────────────────────────────────────────────┼─────────────────┼──────────────────┤
  │ API keys              │ test_api_keys_integration.py                      │ pytest          │ Good             │
  ├───────────────────────┼───────────────────────────────────────────────────┼─────────────────┼──────────────────┤
  │ 4-eyes workflow       │ test_execution_hardening.py,                      │ pytest          │ Good             │
  │                       │ test_cycle_lifecycle.py                           │                 │                  │
  ├───────────────────────┼───────────────────────────────────────────────────┼─────────────────┼──────────────────┤
  │ Policy lifecycle      │ test_e2e_policy_lifecycle.py                      │ pytest          │ Good             │
  ├───────────────────────┼───────────────────────────────────────────────────┼─────────────────┼──────────────────┤
  │ Calculation           │ test_calc_assurance.py (47KB)                     │ pytest          │ Excellent        │
  │ correctness           │                                                   │                 │                  │
  ├───────────────────────┼───────────────────────────────────────────────────┼─────────────────┼──────────────────┤
  │ Hedge accounting      │ test_hedge_accounting.py                          │ pytest          │ Good             │
  ├───────────────────────┼───────────────────────────────────────────────────┼─────────────────┼──────────────────┤
  │ Input                 │ test_input_limits.py                              │ pytest          │ Good             │
  │ limits/boundaries     │                                                   │                 │                  │
  ├───────────────────────┼───────────────────────────────────────────────────┼─────────────────┼──────────────────┤
  │ Security/kill switch  │ test_killswitch_edge_cases.py,                    │ pytest          │ Good             │
  │                       │ test_dev_fault_guard.py                           │                 │                  │
  ├───────────────────────┼───────────────────────────────────────────────────┼─────────────────┼──────────────────┤
  │ Frontend unit         │ src/__tests__/                                    │ Jest            │ Minimal/empty    │
  │                       │                                                   │ (installed)     │                  │
  ├───────────────────────┼───────────────────────────────────────────────────┼─────────────────┼──────────────────┤
  │ Frontend E2E          │ Playwright configured                             │ Playwright      │ Not actively     │
  │                       │                                                   │                 │ used             │
  └───────────────────────┴───────────────────────────────────────────────────┴─────────────────┴──────────────────┘

  Critical Path Tests Missing

  ┌──────────────────────────────────────────┬────────┬─────────────────────────────────────────────────┐
  │               Missing Test               │  Risk  │                 File to Create                  │
  ├──────────────────────────────────────────┼────────┼─────────────────────────────────────────────────┤
  │ Plan tier enforcement (enterprise gates) │ High   │ test_plan_tier_gating.py                        │
  ├──────────────────────────────────────────┼────────┼─────────────────────────────────────────────────┤
  │ CSRF protection (once re-enabled)        │ High   │ test_csrf_e2e.py                                │
  ├──────────────────────────────────────────┼────────┼─────────────────────────────────────────────────┤
  │ Token cookie flags (httpOnly, Secure)    │ High   │ test_auth_cookies.py                            │
  ├──────────────────────────────────────────┼────────┼─────────────────────────────────────────────────┤
  │ SoD cross-company isolation              │ High   │ test_sod_tenant_isolation.py                    │
  ├──────────────────────────────────────────┼────────┼─────────────────────────────────────────────────┤
  │ Dashboard widget data contracts          │ Medium │ src/__tests__/widgets/KpiSummaryWidget.test.tsx │
  ├──────────────────────────────────────────┼────────┼─────────────────────────────────────────────────┤
  │ Export PDF/Excel integrity               │ Medium │ test_export_integrity.py                        │
  ├──────────────────────────────────────────┼────────┼─────────────────────────────────────────────────┤
  │ Audit chain verify after reset           │ Medium │ test_audit_chain_reset.py                       │
  ├──────────────────────────────────────────┼────────┼─────────────────────────────────────────────────┤
  │ Rate limiter per-user bucketing          │ Low    │ test_rate_limit_per_user.py                     │
  └──────────────────────────────────────────┴────────┴─────────────────────────────────────────────────┘

  Smoke Test Checklist (Production Deploy)

  □ GET /health → 200 OK
  □ GET /schema-health → all tables present
  □ POST /auth/login demo/demo → token pair returned
  □ GET /auth/me → user context correct
  □ GET /v1/dashboard/summary → 200 (even if empty)
  □ GET /v1/audit/chain/verify → is_intact=true
  □ POST /v1/calculate (demo request) → run_id returned
  □ GET /v1/runs/{run_id} → full RunEnvelope
  □ WS /v1/voice/realtime → websocket connects
  □ GET /v1/export/pdf/{run_id} → binary PDF returned

  Suggested CI Gates

  # .github/workflows/ci.yml
  backend:
    - pytest (all 35 tests, fail on any red)
    - ruff lint
    - mypy type check
    - alembic check (schema in sync)

  frontend:
    - tsc --noEmit (already enforced)
    - eslint (re-enable, fix violations)
    - jest --coverage (minimum 60% on widget components)
    - next build (smoke)

  ---
  DELIVERABLE 9 — ROADMAP

  P0 (0–48 hours) — Urgent

  ┌────────────────────────┬───────────────┬──────────┬────────┬────────────────────────────────────────────────────┐
  │          Item          │  User Value   │   Risk   │ Effort │                       Files                        │
  ├────────────────────────┼───────────────┼──────────┼────────┼────────────────────────────────────────────────────┤
  │                        │ Prevent       │          │        │                                                    │
  │ Rotate OpenAI API key  │ account       │ Critical │ S      │ .env, Render env vars                              │
  │                        │ compromise    │          │        │                                                    │
  ├────────────────────────┼───────────────┼──────────┼────────┼────────────────────────────────────────────────────┤
  │                        │ Prevent       │          │        │ backend/app/core/dependencies.py:62 — add          │
  │ Fix get_current_user() │ latent 500    │ High     │ S      │ .options(selectinload(User.company),               │
  │  selectinload          │ errors        │          │        │ selectinload(User.branch),                         │
  │                        │               │          │        │ selectinload(User.department))                     │
  ├────────────────────────┼───────────────┼──────────┼────────┼────────────────────────────────────────────────────┤
  │                        │ Enable proper │          │        │ frontend/src/lib/authContext.tsx — change ??       │
  │ Fix plan_tier fallback │  feature      │ High     │ S      │ "enterprise" to ?? "lite"                          │
  │                        │ gating        │          │        │                                                    │
  ├────────────────────────┼───────────────┼──────────┼────────┼────────────────────────────────────────────────────┤
  │ Remove React Query +   │ Reduce bundle │          │        │ frontend/package.json, run npm uninstall           │
  │ Recharts from          │  ~120KB       │ Low      │ S      │ @tanstack/react-query recharts                     │
  │ package.json           │               │          │        │                                                    │
  ├────────────────────────┼───────────────┼──────────┼────────┼────────────────────────────────────────────────────┤
  │ Strip console.log via  │ Clean         │          │        │ frontend/.eslintrc — add "no-console": "warn", fix │
  │ ESLint rule            │ production    │ Low      │ S      │  24 files                                          │
  │                        │ logs          │          │        │                                                    │
  ├────────────────────────┼───────────────┼──────────┼────────┼────────────────────────────────────────────────────┤
  │ Re-enable ESLint in    │ Catch         │ Medium   │ S      │ frontend/next.config.js — ignoreDuringBuilds:      │
  │ builds                 │ regressions   │          │        │ false                                              │
  └────────────────────────┴───────────────┴──────────┴────────┴────────────────────────────────────────────────────┘

  P1 (1–2 weeks) — Architecture Hardening + UX

  ┌───────────────────┬──────────────────┬──────────┬────────┬───────────────────────────────────────────────────────┐
  │       Item        │    User Value    │   Risk   │ Effort │                         Files                         │
  ├───────────────────┼──────────────────┼──────────┼────────┼───────────────────────────────────────────────────────┤
  │ Re-enable CSRF    │ Prevent CSRF     │ High     │ M      │ backend/app/main.py + middleware/csrf.py + frontend   │
  │ middleware        │ attacks          │          │        │ X-CSRFToken header in dashboardClient.ts              │
  ├───────────────────┼──────────────────┼──────────┼────────┼───────────────────────────────────────────────────────┤
  │ Secrets migration │ Production-grade │          │        │ backend/app/core/config.py (already has Vault         │
  │  to Vault/AWS SM  │  secret          │ High     │ M      │ integration — just configure)                         │
  │                   │ management       │          │        │                                                       │
  ├───────────────────┼──────────────────┼──────────┼────────┼───────────────────────────────────────────────────────┤
  │ Auto-seed demo    │ Eliminate blank  │ Critical │        │ backend/app/api/routes/v1_admin_reset.py → call seed  │
  │ data on first     │ dashboard        │  UX      │ S      │ on first position-desk visit; or authContext.tsx      │
  │ login             │                  │          │        │ post-login                                            │
  ├───────────────────┼──────────────────┼──────────┼────────┼───────────────────────────────────────────────────────┤
  │ Guided onboarding │ Time-to-value    │ Critical │        │ New                                                   │
  │  wizard           │ from 15min →     │  UX      │ M      │ frontend/src/components/onboarding/OnboardingRail.tsx │
  │                   │ 3min             │          │        │  + /welcome page update                               │
  ├───────────────────┼──────────────────┼──────────┼────────┼───────────────────────────────────────────────────────┤
  │ Empty state CTAs  │ Reduce confusion │ High UX  │ S      │ frontend/src/components/ui/EmptyState.tsx — add to    │
  │ in all widgets    │                  │          │        │ all 21 widgets                                        │
  ├───────────────────┼──────────────────┼──────────┼────────┼───────────────────────────────────────────────────────┤
  │ Consolidate       │ Matches widget   │          │        │ frontend/src/app/dashboard/page.tsx — replace fixed   │
  │ dashboard to use  │ registry intent  │ Medium   │ M      │ grid with <GridLayout>                                │
  │ react-grid-layout │                  │          │        │                                                       │
  ├───────────────────┼──────────────────┼──────────┼────────┼───────────────────────────────────────────────────────┤
  │ Wire Redux slices │ Eliminate        │          │        │                                                       │
  │  to widgets       │ duplicate        │ Medium   │ M      │ frontend/src/lib/store/ slices + widget useSelector   │
  │                   │ fetches          │          │        │                                                       │
  ├───────────────────┼──────────────────┼──────────┼────────┼───────────────────────────────────────────────────────┤
  │                   │ Reduce           │          │        │                                                       │
  │ Delete dead code  │ maintenance      │ Low      │ S      │ See Delete/Archive list above                         │
  │                   │ burden           │          │        │                                                       │
  ├───────────────────┼──────────────────┼──────────┼────────┼───────────────────────────────────────────────────────┤
  │ Merge /results +  │ Reduce duplicate │ Medium   │ S      │ Delete /run-viewer/page.tsx, add dynamic route        │
  │ /run-viewer       │  pages           │          │        │ /results/[run_id]/page.tsx                            │
  ├───────────────────┼──────────────────┼──────────┼────────┼───────────────────────────────────────────────────────┤
  │ Add SoD bypass in │ Fix demo         │ High UX  │ M      │ backend/app/api/routes/v1_execution_proposals.py — if │
  │  sandbox mode     │ experience       │          │        │  is_sandbox: skip_sod_check                           │
  ├───────────────────┼──────────────────┼──────────┼────────┼───────────────────────────────────────────────────────┤
  │ Notification      │ Daily workflow   │ High UX  │ S      │ frontend/src/components/layout/AppTopBar.tsx +        │
  │ badge on nav      │ efficiency       │          │        │ polling or WebSocket for badge count                  │
  └───────────────────┴──────────────────┴──────────┴────────┴───────────────────────────────────────────────────────┘

  P2 (1–2 months) — Features + Scale

  ┌─────────────┬─────────────────────┬───────┬───────┬────────────────────────────────────────────────────────────┐
  │    Item     │     User Value      │ Risk  │ Effor │                           Files                            │
  │             │                     │       │   t   │                                                            │
  ├─────────────┼─────────────────────┼───────┼───────┼────────────────────────────────────────────────────────────┤
  │ React Query │ Stale-while-revalid │       │       │ Replace all widget useState fetches with useQuery; add     │
  │  data layer │ ate, shared cache,  │ High  │ L     │ QueryClient to providers                                   │
  │             │ automatic refetch   │       │       │                                                            │
  ├─────────────┼─────────────────────┼───────┼───────┼────────────────────────────────────────────────────────────┤
  │ Aggregated  │ Reduce dashboard    │ High  │       │ New GET /v1/dashboard/all → merges summary + rates + runs  │
  │ dashboard   │ load from 4+        │ perf  │ M     │ + approvals                                                │
  │ endpoint    │ requests to 1       │       │       │                                                            │
  ├─────────────┼─────────────────────┼───────┼───────┼────────────────────────────────────────────────────────────┤
  │ Plan tier   │ Enable              │ High  │       │ frontend/src/lib/widgets/widgetRegistry.ts — add locked    │
  │ enforcement │ SMB/Enterprise      │ CRO   │ M     │ overlay; authContext.tsx tier enforcement                  │
  │  UI         │ packaging           │       │       │                                                            │
  ├─────────────┼─────────────────────┼───────┼───────┼────────────────────────────────────────────────────────────┤
  │ Daily       │ Retention/engagemen │ Mediu │       │                                                            │
  │ digest      │ t                   │ m     │ L     │ New backend/app/tasks/daily_digest.py + email templates    │
  │ Celery task │                     │       │       │                                                            │
  ├─────────────┼─────────────────────┼───────┼───────┼────────────────────────────────────────────────────────────┤
  │ Inline      │ Daily workflow 3    │ High  │       │ frontend/src/components/dashboard/widgets/PendingApprovals │
  │ approve     │ clicks → 1          │ UX    │ M     │ Widget.tsx — add approve/reject actions                    │
  │ from widget │                     │       │       │                                                            │
  ├─────────────┼─────────────────────┼───────┼───────┼────────────────────────────────────────────────────────────┤
  │ Committee   │ Enterprise trust    │       │       │ frontend/src/app/staging/[staging_id]/page.tsx — add       │
  │ pack        │ signal              │ High  │ S     │ prominent "Export Committee Pack" button                   │
  │ one-click   │                     │       │       │                                                            │
  ├─────────────┼─────────────────────┼───────┼───────┼────────────────────────────────────────────────────────────┤
  │ "Explain    │                     │       │       │                                                            │
  │ this calcul │ Transparency/trust  │ High  │ M     │ frontend/src/app/results/page.tsx — expandable             │
  │ ation"      │                     │       │       │ trace_bundle renderer                                      │
  │ panel       │                     │       │       │                                                            │
  ├─────────────┼─────────────────────┼───────┼───────┼────────────────────────────────────────────────────────────┤
  │ Audit chain │ Trust signal on     │ Mediu │       │                                                            │
  │  preview    │ dashboard           │ m     │ M     │ New AuditPreviewWidget.tsx + GET /v1/audit?limit=5         │
  │ widget      │                     │       │       │                                                            │
  ├─────────────┼─────────────────────┼───────┼───────┼────────────────────────────────────────────────────────────┤
  │ ERP/account │ Enterprise          │       │       │ backend/app/api/routes/v1_connectors.py — implement actual │
  │ ing OAuth   │ connector value     │ High  │ L     │  OAuth flow                                                │
  │ completion  │                     │       │       │                                                            │
  ├─────────────┼─────────────────────┼───────┼───────┼────────────────────────────────────────────────────────────┤
  │ Frontend    │                     │       │       │ Jest tests for all 22 widgets; Playwright E2E for full     │
  │ test        │ Regression safety   │ High  │ L     │ hedge workflow                                             │
  │ coverage    │                     │       │       │                                                            │
  ├─────────────┼─────────────────────┼───────┼───────┼────────────────────────────────────────────────────────────┤
  │ Performance │ DB query            │ Mediu │       │ EXPLAIN ANALYZE on hot queries; add missing indexes via    │
  │  indexes    │ performance         │ m     │ M     │ new Alembic migration                                      │
  │ audit       │                     │       │       │                                                            │
  ├─────────────┼─────────────────────┼───────┼───────┼────────────────────────────────────────────────────────────┤
  │ Replace     │                     │       │       │                                                            │
  │ yfinance    │ Reliable market     │ Mediu │ M     │ backend/app/services/market_snapshot_service.py — swap     │
  │ with Alpha  │ data                │ m     │       │ data source                                                │
  │ Vantage     │                     │       │       │                                                            │
  └─────────────┴─────────────────────┴───────┴───────┴────────────────────────────────────────────────────────────┘

  ---
  APPENDIX: Commands Run + Evidence

  Key Greps Executed

  # TODOs
  grep -r "TODO\|FIXME\|deprecated\|mock\|demo\|hardcoded" backend/ --include="*.py"
  # Result: demo_fixtures.py (5 functions), counterparty_risk.py hardcoded 97.5%, CSRF disabled SEC-06

  # Direct SQL
  grep -r "text(" backend/app/ --include="*.py"
  # Result: schema_state.py, v1_admin_reset.py (parameterized), v1_support.py (advisory lock)

  # Sensitive logging
  grep -r "logger.*password\|logger.*token\|logger.*secret" backend/app/ --include="*.py"
  # Result: CLEAN — passwords/tokens not logged; API keys redacted

  # N+1 checks
  grep -r "lazy=" backend/app/models/ --include="*.py"
  # Result: lazy="raise" on User.company/branch/department — GOOD

  # Frontend console.log
  grep -r "console\.log\|console\.error\|console\.warn" frontend/src/ --include="*.tsx" --include="*.ts"
  # Result: 24 files

  # Unused packages
  grep -r "react-query\|@tanstack" frontend/src/ --include="*.tsx" --include="*.ts"
  # Result: 0 imports (package installed but unused)

  grep -r "from 'recharts'\|from \"recharts\"" frontend/src/ --include="*.tsx" --include="*.ts"
  # Result: 0 imports (package installed but unused)

  # plan_tier fallback
  grep -r "plan_tier" frontend/src/ --include="*.tsx" --include="*.ts"
  # Result: authContext.tsx line: user.plan_tier ?? "enterprise"

  # CSRF
  grep -r "CSRF\|csrf" backend/ --include="*.py"
  # Result: main.py:63 "# from app.middleware.csrf import CSRFMiddleware  # SEC-06: disabled"

  Evidence Excerpts

  backend/.env (critical exposure):
  OPENAI_API_KEY=***REDACTED***  ← REAL KEY, tracked in git (git status shows "M backend/.env")
  JWT_SECRET=***REDACTED***

  frontend/src/lib/authContext.tsx (plan_tier issue):
  plan_tier: user.plan_tier ?? "enterprise"  // ← BYPASSES ALL FEATURE GATING

  backend/app/core/dependencies.py:62 (missing selectinload):
  result = await db.execute(select(User).where(User.id == user_id))
  # ← No .options(selectinload(User.company)) — will 500 if org accessed

  backend/app/main.py:63 (CSRF disabled):
  # from app.middleware.csrf import CSRFMiddleware  # SEC-06: disabled until fully wired

  frontend/next.config.js (lint ignored):
  eslint: { ignoreDuringBuilds: true }

  frontend/src/lib/widgets/widgetRegistry.ts: 22 widgets registered, 11 role-based default layouts — well-structured and
   production-ready.

  backend/app/engine_v1/ (35 modules): Deterministic engine with SHA-256 run_hash, WORM CalculationRun — architecturally
   excellent.

  ---
  Audit complete. The ORDR Terminal has a strong institutional backend and governance engine, but a significant gap
  between its feature surface and user guidance infrastructure. The most valuable immediate investments are: secret
  rotation, onboarding flow, empty-state coaching, and CSRF re-enablement. The roadmap above is ordered by user impact ×
   risk reduction.