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
- **Modular workspace redesign shipped (2026-03-13, 22bcb23)**: Complete decomposition from monolithic ChartWorkspace.tsx into 23-file modular system
- Architecture: WorkspaceProvider (useReducer+Context) → WorkspaceShell (flexbox layout) → 5 regions (CommandBar, LeftRail, ChartCore, RightStack, BottomDock) → 12 panel components
- 3 Operating Modes: Focus (max chart), Workspace (full panels), Execution (trade-ready)
- Left rail: 44px icons → expandable 216px panels (watchlist, draw tools, indicators, screener, layouts)
- Right stack: 280px tabbed sidebar (properties, layers, AI, orderflow, alerts, news, trade)
- Bottom dock: collapsible + drag-resize (MTF strip, scanner, replay, strategy, orders)
- 12 functional panels: WatchlistPanel, DrawToolsPanel, IndicatorsPanel, ScreenerPanel, LayoutsPanel, PropertiesPanel, LayersPanel, AIPanel, OrderflowPanel, AlertsPanel, NewsPanel, TradePanel
- Layer governance: visibility/opacity/lock/solo per indicator
- Extended tokens: 30+ new chart/panel/semantic tokens
- Keyboard shortcuts: Ctrl+B/J/Shift+B, V, Shift+V, M, F11, Esc
- State persisted to localStorage
- Theme engine: 7 presets, 8 accents, 6 templates, WCAG contrast validator
- Canvas chart: 300-bar OHLCV mock, S/R, FVG overlays, responsive
- Old ChartWorkspace.tsx preserved (not deleted) for reference
- Deployed to Vercel — last push: 22bcb23

## Market Intelligence Dashboard (2026-03-13, commits 243febf..4458175)
- Unified 3 disconnected pages (/market-intelligence, /market-overview, /fx-market) into single 6-tab dashboard
- 6 tabs: Overview, Heatmap, Calendar, Companies, Watchlists, Signals
- TradingViewWidget.tsx: generic embed wrapper (script injection pattern)
- Sidebar MARKET section: 6 tab-linked items (was 3 separate pages)
- 17 new files under frontend/src/app/market-intelligence/, 2 pages deleted
- Stale route fix (4458175): 8 files updated — dead /market-overview and /fx-market references cleaned
- Build: PASS (next build clean). No backend changes.

## UIUXSRC Design System Package (2026-03-13, commit bae6972)
- Portable UI/UX design system extracted as standalone package (UIUXSRC/)
- 7 theme presets, 13 reusable components (Button, Card, KpiTile, StatusChip, EmptyState, etc.)
- Framework-agnostic: inline CSS variable styles, no Tailwind dependency
- ThemeProvider + contrast validator (WCAG), tokens.ts design token file
- Integration guide: CLAUDE.md (253 lines) + README.md
- 20 new files, 2595 lines added
- Companion: UIUX Research/ directory with deep-research-report.md + color theme research doc

## Codebase Counts (updated 2026-03-13)
- engine/: 14 orchestrator modules
- engine_v1/: 41 production modules (+vol_overlay, geo_overlay, netting_overlay, backtesting, prospective_effectiveness, enhanced_scenarios)
- models/: 27 model files (+market_data.py)
- routes/: 50 route files (+v1_forward_curves, v1_volatility_snapshots, v1_geo_snapshots)
- services/: 21 service files (+forward_curve_service, volatility_snapshot_service, geo_snapshot_service)
- DDL tables in main.py: 38 (+3 market data snapshot tables)
- Widgets in registry: 21
- Frontend market pages: 1 unified (/market-intelligence, 6 tabs) — was 3 separate pages
- UIUXSRC: standalone design system package (7 themes, 13 components, 20 files)
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
