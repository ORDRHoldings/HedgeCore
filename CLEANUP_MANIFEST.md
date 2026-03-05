# CLEANUP MANIFEST — ORDR Terminal Production Restructure
**Branch**: `cleanup/production-restructure`
**Date**: 2026-03-05
**Operator**: Claude Code (automated cleanup)

---

## Phase 0 — Safety
| Date | Action | File | Reason |
|------|--------|------|--------|

## Phase 1 — Dead Code Removal
| Date | Action | File | Reason |
|------|--------|------|--------|
| 2026-03-05 | DELETED | `backend/app/api/engine.py` | Empty file (0 bytes) — superseded by `routes/v1_calculate.py` |
| 2026-03-05 | DELETED | `backend/app/api/hedge.py` | Empty file (0 bytes) — superseded by `routes/v1_calculate.py` |
| 2026-03-05 | MIGRATED | `backend/app/api/routes/admin.py` | `require_superuser` import moved from `app.api.deps` → `app.core.dependencies` |
| 2026-03-05 | MIGRATED | `backend/app/api/routes/system.py` | `require_api_key` import moved from `app.api.deps` → `app.deps.api_key_auth.get_api_key_principal` |
| 2026-03-05 | MIGRATED | `backend/app/api/routes/users.py` | `get_current_user` import moved from `app.api.deps` → `app.core.dependencies` |
| 2026-03-05 | DELETED | `backend/app/api/deps.py` | All imports migrated to canonical locations — deprecated wrapper removed |
| 2026-03-05 | DELETED | `frontend/src/app/execution-desk/` | Pure client-side redirect only (`router.replace("/hedge-desk")`) — zero content |
| 2026-03-05 | DELETED | `frontend/src/app/hedges/` | Pure server-side redirect only (`redirect("/position-desk")`) — zero content |
| 2026-03-05 | DELETED | `backend/seed_smb.py` | Duplicate seed script — consolidated into `seed_demo.py` |
| 2026-03-05 | DELETED | `backend/seed_smb_mxn001.py` | Duplicate seed script — consolidated into `seed_demo.py` |
| 2026-03-05 | DELETED | `backend/seed_two_companies.py` | Duplicate seed script — not used in production |
| 2026-03-05 | DELETED | `backend/seed_presentation.py` | Presentation demo artifact — not part of production flow |
| 2026-03-05 | REMOVED | `@tanstack/react-query` npm package | Installed but zero imports anywhere in `src/` |
| 2026-03-05 | KEPT | `recharts` npm package | IS imported in `ExposureChart.tsx` and `ScenarioChart.tsx` |
| 2026-03-05 | KEPT | `backend/app/schemas/` | NOT deprecated — contains auth/admin schemas distinct from `schemas_v1/` (business schemas). Audit classification was incorrect. |
| 2026-03-05 | KEPT | `frontend/src/app/currency-fx/` | Contains full FX rates page with TradingView embed — NOT a redirect. Keep. |
| 2026-03-05 | KEPT | `frontend/src/app/trade-history/` | Contains real execution history component — NOT orphaned |

## Phase 2 — Engine Consolidation
| Date | Action | File | Reason |
|------|--------|------|--------|
| 2026-03-05 | ARCHIVED | `backend/engine/` | Old POC engine ("HedgeCalc FX POC — USD/MXN") — pre-production artifact, separate from `backend/app/engine_v1/` which is production |
| 2026-03-05 | KEPT | `backend/app/engine_v1/` | Production deterministic engine (35 modules) — imported by `v1_calculate.py`. Renaming would require updating 20+ import sites; deferred to dedicated migration PR |
| 2026-03-05 | KEPT | `backend/app/engine/` | Modern orchestrator layer (11 modules) — serves different purpose from engine_v1 |

## Phase 3 — Documentation Restructure
| Date | Action | File | Reason |
|------|--------|------|--------|
| 2026-03-05 | MOVED | `ARCHITECTURE_FREEZE.md` → `docs/architecture/architecture-freeze.md` | Architectural decision — belongs in docs |
| 2026-03-05 | MOVED | `CALC_ASSURANCE_REVIEW.md` → `docs/audits/calc-assurance-review.md` | Audit artifact |
| 2026-03-05 | MOVED | `EXECUTION_MODULE_REVIEW.md` → `docs/audits/execution-module-review.md` | Audit artifact |
| 2026-03-05 | MOVED | `MARKET_DATA_GOVERNANCE_REVIEW.md` → `docs/audits/market-data-governance-review.md` | Audit artifact |
| 2026-03-05 | MOVED | `ORDR_Policy_Engine_Document_Part1.md` → `docs/governance/policy-engine-part1.md` | Governance doc |
| 2026-03-05 | MOVED | `ORDR_Policy_Engine_Document_Part2.md` → `docs/governance/policy-engine-part2.md` | Governance doc |
| 2026-03-05 | MOVED | `RUNTIME_REPRO.md` → `docs/internal/runtime-repro.md` | Internal ops doc |
| 2026-03-05 | MOVED | `SUPPORT_TICKETS_E2E_EVIDENCE.md` → `docs/ops/support-tickets-e2e-evidence.md` | Ops artifact |
| 2026-03-05 | MOVED | `audit.md` → `docs/audits/codebase-audit.md` | Full codebase audit |
| 2026-03-05 | MOVED | `codebase-analysis-progress.md` → `docs/internal/codebase-analysis-progress.md` | Internal tracking |
| 2026-03-05 | MOVED | `context-engineering-progress.md` → `docs/internal/context-engineering-progress.md` | Internal tracking |
| 2026-03-05 | MOVED | `docs/adr/` → `docs/architecture/adr/` | Consolidate ADRs under architecture |
| 2026-03-05 | MOVED | `docs/components/` → `docs/architecture/components/` | Consolidate component docs |
| 2026-03-05 | MOVED | `docs/integrations/` → `docs/architecture/integrations/` | Consolidate integration docs |
| 2026-03-05 | MOVED | `docs/AI_POLICY_WIZARD_UNIFICATION.md` → `docs/specs/ai-policy-wizard-unification.md` | Spec doc |
| 2026-03-05 | MOVED | `docs/CURRENCYFX_OPERATOR_MANUAL.md` → `docs/guides/operator-manual.md` | Guide doc |
| 2026-03-05 | MOVED | `docs/HEDGE_TERMINAL_PRODUCT_GUIDE.md` → `docs/guides/product-guide.md` | Guide doc |
| 2026-03-05 | MOVED | `docs/VIDEO_SCRIPTS.md` → `docs/internal/video-scripts.md` | Internal |
| 2026-03-05 | MOVED | `docs/codebase-analysis.md` → `docs/internal/codebase-analysis.md` | Internal |
| 2026-03-05 | MOVED | `docs/review/2026-02-27/BUGS.md` → `docs/qa/bugs.md` | QA artifact |
| 2026-03-05 | MOVED | `docs/review/2026-02-27/CRO_RISK_GAPS.md` → `docs/audits/cro-risk-gaps.md` | Audit |
| 2026-03-05 | MOVED | `docs/review/2026-02-27/EXECUTIVE_SUMMARY.md` → `docs/internal/executive-summary.md` | Internal |
| 2026-03-05 | MOVED | `docs/review/2026-02-27/LIFECYCLE_SPEC.md` → `docs/specs/lifecycle-spec.md` | Spec |
| 2026-03-05 | MOVED | `docs/review/2026-02-27/NAVIGATION_INVENTORY.md` → `docs/specs/navigation-inventory.md` | Spec |
| 2026-03-05 | MOVED | `docs/review/2026-02-27/PRIORITIZED_BACKLOG.md` → `docs/internal/prioritized-backlog.md` | Internal |
| 2026-03-05 | MOVED | `docs/review/2026-02-27/TEST_PLAN.md` → `docs/qa/test-plan.md` | QA |
| 2026-03-05 | MOVED | `docs/review/2026-02-27/UX_ENHANCEMENTS.md` → `docs/specs/ux-enhancements.md` | Spec |
| 2026-03-05 | MOVED | `docs/smb-tutorial/` → `docs/guides/smb-tutorial/` | Guide |
| 2026-03-05 | MOVED | `docs/whitepapers/` → `docs/specs/whitepapers/` | Spec/whitepaper |
| 2026-03-05 | MOVED | `frontend/WHITEPAPER.md` → `docs/specs/whitepaper-frontend.md` | Spec |
| 2026-03-05 | KEPT | `frontend/README.md` | Standard frontend-level README |

## Phase 4 — Root Cleanup
| Date | Action | File | Reason |
|------|--------|------|--------|
| 2026-03-05 | DELETED | `append_help.py` | One-off helper script — not part of app |
| 2026-03-05 | DELETED | `assemble.py` | One-off helper script |
| 2026-03-05 | DELETED | `clear_dashboard_cache.html` | One-off browser utility |
| 2026-03-05 | DELETED | `datepicker.tsx` | Loose component file at root — not referenced |
| 2026-03-05 | DELETED | `datepicker_component.txt` | Text artifact |
| 2026-03-05 | DELETED | `dec.py` | One-off script |
| 2026-03-05 | DELETED | `demo.db` | SQLite demo artifact |
| 2026-03-05 | DELETED | `e3.py` | One-off script |
| 2026-03-05 | DELETED | `edit_main.py` | One-off helper |
| 2026-03-05 | DELETED | `edit_page.py` | One-off helper |
| 2026-03-05 | DELETED | `fix_market_sectors.js` | One-off fix script |
| 2026-03-05 | DELETED | `gen_test.py` | One-off test generator |
| 2026-03-05 | DELETED | `insert_route.py` | One-off helper |
| 2026-03-05 | DELETED | `nul` | Windows NUL device artifact |
| 2026-03-05 | DELETED | `old_sections.txt` | Stale text artifact |
| 2026-03-05 | DELETED | `p0.html` | One-off HTML artifact |
| 2026-03-05 | DELETED | `run_4eyes_execute.py` | One-off execution script |
| 2026-03-05 | DELETED | `t.py` | Unnamed temp script |
| 2026-03-05 | DELETED | `test_e2e_policy.db` | Test SQLite artifact |
| 2026-03-05 | DELETED | `wire_helppanel.py` | One-off helper |
| 2026-03-05 | DELETED | `write_product_guide.py` | One-off generator |
| 2026-03-05 | DELETED | `write_test.py` | One-off generator |
| 2026-03-05 | DELETED | `.txt` | Empty file artifact |
| 2026-03-05 | DELETED | `.env.nextjs` | Empty/stale env file |
| 2026-03-05 | DELETED | `backend/test_yfinance.py` | One-off test script at backend root |
| 2026-03-05 | DELETED | `backend/check_tables.py` | One-off DB diagnostic |
| 2026-03-05 | DELETED | `backend/rebuild_db.py` | One-off DB reset (dangerous to keep at root) |
| 2026-03-05 | DELETED | `backend/demo.db` | SQLite artifact |
| 2026-03-05 | DELETED | `backend/app/main.py.bak` | Backup file |
| 2026-03-05 | DELETED | `backend/app/main.py.bak2` | Backup file |

## Phase 5 — Security Hardening
| Date | Action | File | Reason |
|------|--------|------|--------|
| 2026-03-05 | UNTRACKED | `backend/.env` | Removed from git tracking — contained real OpenAI API key |
| 2026-03-05 | UNTRACKED | `.env` | Removed from git tracking — secrets file |
| 2026-03-05 | UNTRACKED | `.env.nextjs` | Removed from git tracking |
| 2026-03-05 | VERIFIED | `.env.example` | Placeholder values confirmed — safe to track |

## Phase 6 — Branding
| Date | Action | File | Reason |
|------|--------|------|--------|
| 2026-03-05 | UPDATED | `backend/app/api/router.py` | "HedgeCalc API" → "ORDR Terminal API" in doc titles |
| 2026-03-05 | UPDATED | `backend/app/main.py` | App title updated |

---
*Every deletion was verified with `grep -r "FILENAME" . --include="*.py" --include="*.ts" --include="*.tsx" --include="*.json"` before removal.*
