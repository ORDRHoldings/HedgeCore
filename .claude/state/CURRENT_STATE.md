# Current State

Last updated: 2026-03-08

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

## Codebase Counts (repo-verified 2026-03-08)
- engine/: 14 orchestrator modules
- engine_v1/: 41 production modules (+vol_overlay, geo_overlay, netting_overlay, backtesting, prospective_effectiveness, enhanced_scenarios)
- models/: 27 model files (+market_data.py)
- routes/: 50 route files (+v1_forward_curves, v1_volatility_snapshots, v1_geo_snapshots)
- services/: 22 service files (+forward_curve_service, volatility_snapshot_service, geo_snapshot_service)
- DDL tables in main.py: 38 (+3 market data snapshot tables)
- Widgets in registry: 21
- ADRs: 4 accepted (+0004-policy-engine-v1-extensions)
- Whitepapers: 3 (hedge-effectiveness-thresholds, scenario-methodology, overlay-activation-contracts)
- Tests: [snapshot 2026-03-08] 2725 passing, 134 skipped, 0 failed

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
- HIGH: No regulatory reporting exports
- MEDIUM: Overlays neutralized (framework ready, activation pending live data feeds)
- REDUCED: Test coverage improved (2725 tests, estimated 62%+)
