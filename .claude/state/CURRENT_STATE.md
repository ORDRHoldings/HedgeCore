# Current State

Last updated: 2026-03-13

## System Status
- Backend: Render (hedgecore.onrender.com) — master branch
- Frontend: Vercel (hedgecore.vercel.app) — master branch
- Database: Render PostgreSQL — operational
- CI: GitHub Actions — backend + frontend + E2E + Docker + Governance

## Operating System
- Rules: 6 files (.claude/rules/)
- Agents: 6 definitions (.claude/agents/)
- Skills: 9 definitions (.claude/skills/)
- Hooks: 8 scripts (.claude/hooks/) — 6 commands across 5 events in settings.json
- State: SQLite memory.db (10 tables) + 6 markdown state files
- Architecture canon: 5 files (docs/architecture/) + 4 ADRs
- CI governance: freeze-check + pre-merge-gate + risk-gate in GitHub Actions (all enforced, no advisory)
- Pre-commit: freeze-check hook wired

## ORDR Market Sub-Project (ordr-market/, 2026-03-13)
- Workspace redesign complete: institutional light-theme shell, PR #1 merged to master
- Theme engine shipped (2026-03-13): `src/lib/theme/` — 7 presets, 8 curated accents, 6 operational templates, WCAG contrast validator, ThemeProvider (CSS var injection + localStorage), AppearanceSettings type system
- ThemeSwitcher component: dropdown with color swatches + template shortcuts, wired in workspace toolbar
- Design system: Inter/JetBrains Mono, cool neutral palette, muted blue/salmon candles
- Canvas chart: 250-bar OHLCV mock, S/R levels, price/time axes, volume zone
- Deployed to Vercel (auto-deploy on master push) — last push: 2fb3858

## Market Intelligence Dashboard (2026-03-13, commit 243febf)
- Unified 3 disconnected pages (/market-intelligence, /market-overview, /fx-market) into single 6-tab dashboard
- 6 tabs: Overview, Heatmap, Calendar, Companies, Watchlists, Signals
- TradingViewWidget.tsx: generic embed wrapper (script injection pattern)
- Sidebar MARKET section: 6 tab-linked items (was 3 separate pages)
- 17 new files under frontend/src/app/market-intelligence/
- Build: PASS (next build clean). No backend changes.

## Codebase Counts (updated 2026-03-13)
- engine/: 14 orchestrator modules
- engine_v1/: 41 production modules (+vol_overlay, geo_overlay, netting_overlay, backtesting, prospective_effectiveness, enhanced_scenarios)
- models/: 27 model files (+market_data.py)
- routes/: 50 route files (+v1_forward_curves, v1_volatility_snapshots, v1_geo_snapshots)
- services/: 21 service files (+forward_curve_service, volatility_snapshot_service, geo_snapshot_service)
- DDL tables in main.py: 38 (+3 market data snapshot tables)
- Widgets in registry: 21
- Frontend market pages: 1 unified (/market-intelligence, 6 tabs) — was 3 separate pages
- ADRs: 4 accepted (+0004-policy-engine-v1-extensions)
- Whitepapers: 3 (hedge-effectiveness-thresholds, scenario-methodology, overlay-activation-contracts)
- Tests: [snapshot 2026-03-09] 3157 passing, 134 skipped, 0 failed

## Architecture
- Freeze: ACTIVE (v1, 7 frozen files + 5 conceptual invariants)
- 7-Layer overlay architecture (ADR-0004): L1 frozen kernel → L2 vol overlay → L3 geo overlay → L4 enhanced scenarios → L5 prospective effectiveness → L6 template extensions → L7 WORM/audit preserved

## Policy Engine Hardening (completed 2026-03-08)
- Phase 1: Forward curve ingestion service + 4 API endpoints + staleness governance
- Phase 2: Wizard deepened — ExtendedPolicyConfig-level AI output with validation/clamping
- Phase 3: Volatility overlay module + snapshot service + 3 API endpoints + 24 tests
- Phase 4: Geopolitical overlay module + snapshot service + 4 API endpoints + 18 tests
- Phase 5: Backtesting engine — single/multi-period evaluation + policy comparison + 13 tests
- Phase 6: Netting overlay module — same-pair + cross-flow netting + savings tracking + 12 tests
- Phase 7: Governance hardening — dual-key enforcement wired, multi-tenant isolation tests + 27 tests
- Route registration: All 3 new route modules registered in api/router.py (219 total routes)
- All overlays neutral by default (v1 parity preserved)

## Active Risks
- HIGH: Leaked secrets in git history (current files sanitized, rotation needed)
- HIGH: No institutional market data feed (forward curves synthetic, snapshot models ready)
- HIGH: Secret rotation not done
- HIGH: No regulatory reporting exports (format stubs exist, never validated against ISDA/FINRA schemas)
- HIGH: Audit Lab not validated against real institutional data (33/40 items code-complete only)
- MEDIUM: Overlays neutralized (framework ready, activation pending live data feeds)
- REDUCED: Test coverage improved (3051 tests, estimated 65%+)

## Audit Lab Institutional Upgrade (canonical truth, 2026-03-09)
- Plan: 40 items across P0-P6 — all code written, conservatively classified
- Classification: 3 OPERATIONALLY PROVEN, 33 CODE COMPLETE, 3 PARTIAL, 1 STUB/BLOCKED
- OPERATIONALLY PROVEN (3): date filter, upload size limit, MXN null-check — trivial guards
- CODE COMPLETE (33): all code wired + tests pass, but tested with synthetic/mocked data only
- PARTIAL (3): ORM models (not imported by routes), intraday rates (field only, no matching), scheduler (CRUD only, no executor)
- STUB/BLOCKED (1): benchmark provider (file exists, never imported by any route)
- P3 is document parsing foundation, not OCR-grade document intelligence
- P6 regulatory exports not validated against actual ISDA/FINRA schema specs
- No item validated against production-grade institutional data
- Canonical truth memo: docs/audits/2026-03-09-audit-lab-canonical-truth-memo.md
- Methodology version: 1.1.0
- Tests: 3157 passing, 134 skipped, 0 failed
