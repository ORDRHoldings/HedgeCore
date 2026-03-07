# Current State

Last updated: 2026-03-07

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
- Architecture canon: 5 files (docs/architecture/)
- CI governance: freeze-check + pre-merge-gate + risk-gate in GitHub Actions (all enforced, no advisory)
- Pre-commit: freeze-check hook wired

## Codebase Counts (repo-verified)
- engine/: 14 orchestrator modules
- engine_v1/: 35 production modules
- models/: 26 model files
- routes/: 47 route files
- DDL tables in main.py: 35
- Widgets in registry: 21
- ADRs: 3 accepted

## Architecture
- Freeze: ACTIVE (v1, 7 frozen files + 5 conceptual invariants)
- Tests: [snapshot 2026-03-06] 2158 passing, 59% coverage

## Active Risks
- HIGH: Leaked secrets in git history (current files sanitized, rotation needed)
- HIGH: No institutional market data feed (Finnhub only)
- HIGH: Secret rotation not done
- HIGH: No regulatory reporting exports
- MEDIUM: Test coverage at 59% (target 75%+)
