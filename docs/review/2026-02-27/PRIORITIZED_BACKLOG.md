# Prioritized Backlog — ORDR Terminal
**Review Date**: 2026-02-27
**Last Updated**: 2026-02-28
**Format**: NOW (this sprint) | NEXT (next sprint) | LATER (v1.1+)

---

## NOW — Fix Before Demo

These are blocking issues. Complete before any stakeholder or investor demo.

| ID | Item | Area | Effort | Status |
|----|------|------|--------|--------|
| N-01 | ~~**Fix BUG-002**: Connect Audit Trail to `GET /v1/audit` backend~~ | Governance | M | ✅ DONE 2026-02-28 |
| N-02 | ~~**Fix BUG-001**~~: `/execution-history` confirmed to exist — removed from backlog | — | — | ✅ FALSE POSITIVE |
| N-03 | ~~**Fix BUG-003**: WorkflowBreadcrumb Step 01 → change href to `/position-desk`~~ | Navigation | XS | ✅ DONE 2026-02-28 |
| N-04 | ~~**Fix BUG-005**: Execution Desk filter → include `READY_TO_EXECUTE` alongside `POLICY_ASSIGNED`~~ | Execution | XS | ✅ DONE 2026-02-28 |
| N-05 | ~~Verify `Nav.tsx` and `Header.tsx` are not imported by any active page; remove if orphaned~~ | Cleanup | S | ✅ DONE 2026-02-28 |
| N-06 | ~~Wire Audit Trail "Verify Chain" button to `GET /v1/audit/chain/verify`~~ | Governance | S | ✅ DONE 2026-02-28 |
| N-07 | ~~Add empty state to Execution Desk Step 1 when no POLICY_ASSIGNED positions exist~~ | UX | S | ✅ DONE 2026-02-28 |
| N-08 | ~~Run Viewer: add "no run selected" state with recent runs list when no `?id=` param present~~ | UX | S | ✅ DONE 2026-02-28 |
| N-09 | ~~Position Lineage: add "no position selected" state when no `?position=` param~~ | UX | XS | ✅ DONE 2026-02-28 |
| N-10 | ~~Normalize product name to "ORDR Terminal" in all user-facing text~~ | Branding | S | ✅ DONE 2026-02-28 |

**NOW progress: 10/10 complete ✅ — Alpha Demo criteria met**

---

## NEXT — Polish for Institutional Readiness

| ID | Item | Area | Effort | Status |
|----|------|------|--------|--------|
| X-01 | ~~**Fix BUG-006**: Load Access Control permission matrix from `GET /v1/admin/roles`~~ | Governance | M | ✅ DONE 2026-02-28 |
| X-02 | ~~**Fix BUG-007**: Remove Committee Pack duplicate from Governance menu~~ | IA | XS | ✅ DONE 2026-02-28 |
| X-03 | ~~**Fix BUG-008**: Remove Hedge Wiki duplicate from Dashboard menu~~ | IA | XS | ✅ DONE 2026-02-28 |
| X-04 | ~~**Fix BUG-009**: Add hash/query-param differentiation to Help sub-menu items~~ | Navigation | S | ✅ DONE 2026-02-28 |
| X-05 | ~~**Fix BUG-010**: Verify Settings hash anchors trigger correct tab activation~~ | Settings | S | ✅ DONE 2026-02-28 |
| X-06 | ~~**Fix BUG-013**: Wire "LIVE" indicator to `GET /health` polling (60s interval)~~ | UX | S | ✅ DONE 2026-02-28 |
| X-07 | ~~**Fix BUG-016**: Rename "Results Viewer" to "Trade Desk" in Execution menu~~ | Navigation | XS | ✅ DONE 2026-02-28 |
| X-08 | ~~Add bulk position select-all checkbox to Position Desk table header~~ | UX | S | ✅ DONE 2026-02-28 (already existed) |
| X-09 | ~~Add "SIMULATED DATA" badge to widgets/pages with mocked or fallback data~~ | Trust/CRO | S | ✅ DONE 2026-02-28 |
| X-10 | ~~Add drag-handle indicator (⠿ icon) to all dashboard widget headers~~ | UX | XS | ✅ DONE 2026-02-28 |
| X-11 | ~~Position Desk: add inline validation (field border highlight + label under field)~~ | UX | M | ✅ DONE 2026-02-28 |
| X-12 | ~~Execution Desk Step 2: show input summary before Calculate button ("5 positions, MXN 1.25M")~~ | UX | S | ✅ DONE 2026-02-28 |
| X-13 | ~~Policy Desk: show confirmation preview before bulk assign ("Assigning X to N positions")~~ | UX | S | ✅ DONE 2026-02-28 |
| X-14 | ~~After execution completes, show summary modal before redirecting to Position Desk~~ | UX | S | ✅ DONE 2026-02-28 |
| X-15 | ~~Add "Show/Hide Rejected" toggle with count badge to Position Desk~~ | UX | S | ✅ DONE 2026-02-28 |
| X-16 | ~~Help menu: add keyboard shortcut manifest accessible via `?` key~~ | UX | M | ✅ DONE 2026-02-28 |
| X-17 | ~~Add `aria-label` attributes to all icon-only buttons (WCAG AA)~~ | Accessibility | M | ✅ DONE 2026-02-28 |
| X-18 | ~~Add report generation audit events (`POST /v1/audit` on every report generate/export)~~ | Governance | M | ✅ DONE 2026-02-28 |
| X-19 | ~~Add per-user rate limiting to `POST /v1/calculate` (max 10/min)~~ | Backend | S | ✅ DONE 2026-02-28 |
| X-20 | ~~Minimum 5-char validation on rejection reason (frontend + backend Pydantic schema)~~ | Validation | S | ✅ DONE 2026-02-28 |

**NEXT progress: 20/20 complete ✅ — Beta / Institutional Pilot criteria met**

---

## LATER — v1.1 and Beyond

| ID | Item | Area | Priority |
|----|------|------|----------|
| ~~L-01~~ | ~~Backend risk-check endpoint (`POST /v1/risk-check`) that enforces policy limits server-side~~ | Backend | HIGH | ✅ DONE 2026-02-28 — v1_risk_check.py created; wraps decision_gate(), emits SYSTEM audit event |
| ~~L-02~~ | ~~Market data source audit trail (emit event with source, timestamp, hash per calculation)~~ | Governance | HIGH | ✅ DONE 2026-02-28 — MARKET_SOURCE TraceEvent with SHA-256 hash added to v1_calculate.py |
| ~~L-03~~ | ~~Verify Execution Desk exclusively uses 4-eyes ExecutionProposal pathway~~ | Security | HIGH | ✅ DONE 2026-02-28 — StepExecute.tsx rewritten; skip checkbox removed, now submits via POST /v1/proposals per position |
| ~~L-04~~ | ~~Policy template import checksum UI (display + user confirmation before activate)~~ | Security | MEDIUM | ✅ DONE 2026-02-28 — computePolicyHash() + activation confirmation modal in policies/page.tsx |
| ~~L-05~~ | ~~Add orphaned pages to nav or delete: `/hedges`, `/terminal`, `/ledger`, `/staging`~~ | IA | MEDIUM | ✅ DONE 2026-02-28 — /hedges → redirect("/position-desk"); /staging added to AppTopBar Governance menu |
| ~~L-06~~ | ~~XLSX export with column names matching Position Desk table labels~~ | Reports | MEDIUM | ✅ DONE 2026-02-28 — exportPositionsXlsx + exportDataXlsx added to clientExport.ts; XLSX button wired to all 5 ReportSection instances |
| ~~L-07~~ | ~~Committee Pack WCAG AA color contrast audit~~ | Accessibility | MEDIUM | ✅ DONE 2026-02-28 — scope="col" on all th, HashRow role/aria, caption on tables, tertiary→secondary for small text |
| ~~L-08~~ | ~~Widget catalog: show "On Board" badge for already-added widgets~~ | UX | LOW | ✅ DONE 2026-02-28 — "ON GRID" badge already existed in WidgetCatalog.tsx |
| ~~L-09~~ | ~~Dashboard: "Last refreshed" indicator + global Refresh All button~~ | UX | LOW | ✅ DONE 2026-02-28 — lastRefresh state + formatAgo() + ↻ Refresh All button; refreshKey forces widget remount |
| ~~L-10~~ | ~~HedgeWiki: print/export article to PDF~~ | UX | LOW | ✅ DONE 2026-02-28 — PRINT button + @media print CSS; data-wiki-sidebar/content attributes |
| ~~L-11~~ | ~~MFA enforcement for `trades.execute` permission~~ | Security | HIGH | ✅ DONE 2026-02-28 — UserMFA model, v1_mfa.py (5 endpoints), mfa_verified JWT claim, Settings Security tab, Login MFA challenge |
| ~~L-12~~ | ~~Dual-key approval for positions above configurable USD threshold~~ | Security | MEDIUM | ✅ DONE 2026-02-28 — 6 dual-key columns on ExecutionProposal, second-approve endpoint, dual_key_threshold_usd in PolicyConfig, staging queue badges |
| ~~L-13~~ | ~~Progressive disclosure redesign (simplified home screen for first-time users)~~ | UX | LOW | ✅ DONE 2026-02-28 — OnboardingModal.tsx created; mounted in dashboard/page.tsx |
| ~~L-14~~ | ~~Save report versioning (v1, v2…) instead of localStorage overwrite~~ | Reports | MEDIUM | ✅ DONE 2026-02-28 — SAVE VERSION button + collapsible SAVED REPORTS panel in ReportsContainer |
| ~~L-15~~ | ~~Portfolio Risk and Scenario Studio as "Analytics" sub-section (not under Dashboard)~~ | IA | LOW | ✅ DONE 2026-02-28 — new Analytics nav section (Portfolio Risk, Scenario Studio, Polisophic); Dashboard reduced to Summary only |

---

## Effort Estimates

| Size | Estimate |
|------|---------|
| XS | < 30 min (one-line fix) |
| S | 30min – 2hrs |
| M | 2–6hrs |
| L | 1–2 days |
| XL | 3–5 days |

---

## Release Criteria Summary

| Release | Definition | Blockers |
|---------|-----------|---------|
| **Alpha Demo** | Stakeholders can see the workflow | ✅ ALL NOW ITEMS COMPLETE |
| **Beta / Institutional Pilot** | CRO/auditor can review governance | ✅ ALL NEXT ITEMS COMPLETE |
| **v1.0 Production** | Full institutional readiness | ✅ ALL LATER HIGH items COMPLETE (L-01, L-02, L-03, L-11, L-12) |

---

## Changelog

| Date | Items Completed |
|------|----------------|
| 2026-02-28 | N-01, N-03, N-04, N-06 (audit trail backend, breadcrumb fix, execution filter, chain verify) |
| 2026-02-28 | X-01, X-02, X-03, X-04, X-05 (access control matrix, menu dedup ×2, help anchors, settings hash) |
| 2026-02-28 | N-05, N-07, N-08, N-09, N-10 (Nav cleanup, execution empty state, run/lineage pickers, ORDR branding) |
| 2026-02-28 | X-06, X-07 (LIVE health polling, Trade Desk rename) |
| 2026-02-28 | X-08 through X-20 (select-all confirmed, SIM DATA badges, drag handles, inline validation, input summary, confirm previews, summary modal, show/hide rejected, keyboard shortcuts, aria-labels, audit events, rate limiting, 5-char rejection validation) |
| 2026-02-28 | L-06 (XLSX export — exportPositionsXlsx + exportDataXlsx + XLSX buttons on all 5 report sections), L-08 (confirmed done — ON GRID badge existed), L-13 (OnboardingModal — 4-step first-time guide), L-14 (report versioning — SAVE VERSION + SAVED REPORTS collapsible panel) |
| 2026-02-28 | L-01 (POST /v1/risk-check — decision_gate wrapper), L-02 (MARKET_SOURCE audit trace), L-03 (StepExecute 4-eyes enforcement), L-04 (policy checksum modal), L-05 (/hedges redirect + /staging nav), L-07 (Committee Pack WCAG AA), L-09 (Dashboard refresh), L-10 (HedgeWiki print), L-11 (full TOTP MFA stack), L-12 (dual-key approval) — v1.0 Production criteria met |
| 2026-02-28 | L-15 (Analytics nav section — Portfolio Risk, Scenario Studio, Polisophic promoted; Dashboard → Summary only) — BACKLOG COMPLETE 15/15 |
