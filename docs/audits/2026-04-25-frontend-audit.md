# ORDR TreasuryFX — Frontend Audit

**Date**: 2026-04-25
**Scope**: 109 `page.tsx` files under `frontend/src/app/`, plus shared components, design tokens, AppSidebar nav taxonomy, dashboard widget registry.
**Method**: Six parallel deep-dive agents (one per nav-section group). Each agent read every page in its scope, verified against CLAUDE.md frontend rules, and graded findings P0 (broken/blocking), P1 (wrong pattern), P2 (polish).
**Deliverable**: This document. Pre-launch hardening punch list.

---

## Executive Summary

The frontend is **structurally sound** — `dashboardFetch`, `useAuth`, `PageShell`, WORM enforcement on audit pages, hash-chain display, and tri-state pipeline visualisation are all wired correctly. The codebase is NOT broken; it is, however, **not yet institutional-grade polished**.

Three failure modes recur across the entire surface:

1. **Design-token drift** — a dual namespace (`--bg-deep` vs `--terminal-bg`), hardcoded hex fallbacks, per-page local `S` / `T` / `HEX` objects, font-family literals. Theming is not centrally controllable.
2. **Defensive UX gaps** — silent error catches, missing per-widget error boundaries, missing destructive-action confirmations, color-only state encoding.
3. **OAuth / auth lifecycle gaps** — no OAuth `state` validation, raw `fetch()` bypassing `dashboardFetch`, tokens persisted in component state, client-side-only RBAC.

| Severity | Count | Examples |
|----------|-------|----------|
| **P0**   | ~22   | Raw `fetch()` in hedge-effectiveness, OAuth state missing, useSearchParams without Suspense, hardcoded fallback API URL in login |
| **P1**   | ~55   | Hardcoded hex colors throughout, missing `PageShell`, missing destructive confirms, font sizes <12px |
| **P2**   | ~40+  | Missing aria-labels on icon-only buttons, missing keyboard handlers on dropdowns, table `<th scope="col">` semantics |

**Recommendation**: ship a P0/P1 hardening sprint (estimated 2-3 days of focused work) before any external institutional pilot. P2 items can land continuously.

---

## Section 1 — Treasury Suite: Hedge & Trading

Pages: `position-desk`, `portfolio`, `hedge-effectiveness`, `pre-trade-tca`, `trade-history`, `settlement`, `counterparties`.

### P0
- **`hedge-effectiveness/page.tsx:300`** — Raw `fetch()` instead of `dashboardFetch`. Bypasses unified auth/CSRF/error handling.
- **`hedge-effectiveness/page.tsx:14,118`** — `useSearchParams` not properly inside a Suspense boundary at the consuming component.
- **`settlement/page.tsx:80,85`** — Hardcoded `#7ed321` / `#d0021b` instead of `var(--status-pass)` / `var(--accent-red)`.
- **`position-desk/page.tsx:23,343`** — Page depends on Redux (`useDispatch`/`useSelector`) for an otherwise-unused state layer; lifecycle does not align with `useAuth()` token rotation.

### P1
- **Missing `PageShell`** — `pre-trade-tca/page.tsx`, `counterparties/page.tsx`. Bare `<div>` containers, no breadcrumb, no scope-aware identity bar.
- **`hedge-effectiveness/page.tsx:3408-5147`** — Direct `localStorage` for UI state (notes, tags, pins, presets). Should be context/zustand.
- **`hedge-effectiveness/page.tsx:42-55`** — Inline `HEX` palette duplicates the `S` token vars; two sources of truth on the same page.
- **`portfolio/page.tsx:115`** — `localStorage` direct read for auth token (the file already imports `useAuth`).
- **`counterparties/page.tsx:322`** — `href={/counterparties/${r.id}}` assumes a sub-route that does not exist in the `app/` tree.

### P2
- All seven data tables omit `scope="col"` on `<th>`.
- **`position-desk/page.tsx:312`** — `0.625rem` (~10px) font on policy chip — below 12px institutional minimum.
- Modals in `settlement` and `position-desk` lack Escape-key handlers.
- `trade-history` refresh button has no spinner state.

---

## Section 2 — Treasury Suite: Accounting / ERP / Cash

Pages: `accounting-connection`, `accounting-oauth-callback`, `erp-integration`, `erp-oauth-callback`, `database-connection`, `cash-positions`, `bank-statements`, `gl-postings`, `debt`.

### P0 — security-critical
- **`accounting-connection/page.tsx:329-380`** — OAuth popup flow stores auth state in `localStorage` keyed by system ID with **no `state` parameter** in the OAuth URL → state-mismatch / CSRF risk.
- **`accounting-connection/page.tsx:399`**, **`erp-integration/page.tsx:414-420`** — Raw `fetch()` to backend with manual `Authorization: Bearer` header. No CSRF token, no token refresh, no error centralisation.
- **`accounting-oauth-callback/page.tsx:28-43`**, **`erp-oauth-callback/page.tsx:15-30`** — `error_description` echoed from URL directly into JSX without sanitisation. **XSS risk** if attacker controls the redirect.
- **`erp-integration/page.tsx:392`** — Reads `ordr_erp_oauth_${system}` from `localStorage` without validating `system` is in the allowlist (`ERP_TABS`, line 55). Attacker-controlled `system` → arbitrary localStorage key collisions.
- **`cash-positions/page.tsx:28`**, **`debt/page.tsx:36`**, **`gl-postings/page.tsx:53`** — `useAuth()` returns nullable token; no early-return guard before client calls fire with `undefined`.

### P1
- **`useSearchParams` outside Suspense** — both OAuth callback pages (`accounting-oauth-callback:156-162`, `erp-oauth-callback:7-130`).
- **Missing `PageShell`** — `accounting-connection`, `cash-positions`, `bank-statements` all use raw flex containers.
- **`erp-integration/page.tsx:32-47`**, **`bank-statements/page.tsx:27-32`** — Local `HEX` constant with hardcoded hex (`#B91C1C`, `#1C62F2`, `#22d3ee`).
- **`accounting-connection/page.tsx:1464`** — Inline `<style>` tag for `@keyframes spin`; should live in `globals.css`.

### P2
- Field-mapping `×` delete buttons (lines 1336+) have no `aria-label`.
- Spinner glyph `◌` used inconsistently with `lucide-react`'s `Loader`.
- `OAuth authorize` buttons text-only ("AUTHORIZE →"), no descriptive aria-label.

---

## Section 3 — Audit Lab / Audit Trail / Reports

Pages: `audit-lab/*`, `audit-trail/*`, `reports/*`, supporting components.

### P0
- **`audit-trail/page.tsx:373`** — Hardcoded `0.75rem` (11.25px), below the 12px institutional minimum.
- **Hardcoded color fallbacks** — `audit-lab/page.tsx:29-30`, `audit-lab/runs/[run_id]/page.tsx:34-35`, `audit-trail/page.tsx:40` — `#22c55e`, `#f87171`, `#B91C1C` literals where tokens already exist.

### P1
- **Local design-token duplication** — `audit-lab/upload`, `audit-lab/audit-trail`, `audit-lab/compare`, `audit-lab/runs/[run_id]` all redefine an `S` / `T` const instead of importing from `@/lib/design/tokens`.
- **Silent export failures** — `reports/components/studio/ExportBar.tsx:126-128,140-143` and `RegulatoryTab` swallow PDF/XLSX export errors with empty catches. Users see disabled buttons but no reason.
- **PDF disclosure missing at page level** — `reports/page.tsx:100-109` HTML template has no "AI-Generated, not advice" disclaimer; comment at line 47-48 declares intent but doesn't enforce.

### P2
- `audit-trail/page.tsx:846-906` — filter inputs (search, date range) lack `aria-label`.
- `audit-lab/audit-trail/page.tsx:339` — table hard-pinned to 6 columns; not responsive.
- `audit-lab/compare/page.tsx:245` — `repeat(${runs.length}, 1fr)` breaks visually with >3 runs.

**Positive findings**: WORM enforcement is correctly UI-side (no edit/delete buttons on audit events), hash chain display is present (`event.hash`, `event.fullHash`), event-bucket filters work, CSV export is wired and disables on empty result, evidence-binder JSON + PDF + XLSX exports all functional.

---

## Section 4 — Auth / Settings / Admin

Pages: `auth/login`, `auth/logout`, `signup`, `settings/*`, `admin/*`, `ai-policy-wizard`.

### P0 — security-critical
- **`auth/login/page.tsx:171,199`** — Hardcoded fallback `https://hedgecore.onrender.com/api` if `NEXT_PUBLIC_API_URL` unset. Should fail loudly.
- **`auth/login/page.tsx:185`** — `catch { /* fail-open */ }` on MFA status check. Backend hiccup → MFA silently bypassed.
- **`auth/login/page.tsx:165-173`** — Direct `document.cookie` parsing instead of `useAuth()`.
- **`signup/page.tsx:47`** — Raw `fetch()`. **`signup/page.tsx:38-42`** — password strength = "≥8 chars". No upper/digit/symbol requirement. **Line 46** — empty-string fallback for `apiUrl`.
- **`admin/page.tsx:74-75,99-100`** — Client-side-only `is_superuser` check. No server-side gate; admin tabs may load before role check resolves.
- **`settings/components/tabs/ApiKeyManagementTab.tsx:114`** — Newly created API key persists in React state until logout/page-refresh. Shown-once design is undermined.
- **Missing destructive confirms** — MFA disable (`SecurityTab.tsx:170`), API key revoke (`ApiKeyManagementTab.tsx:350`), role removal (`UsersRolesTab.tsx:257`).

### P1
- **`settings/page.tsx:105`** — Tab-routing `useSearchParams()` not at Suspense root.
- **`SecurityTab.tsx:315`** — IP allowlist input accepts arbitrary string, no CIDR validation.
- **`SecurityTab.tsx:262-273`** — Toggle styled as switch but rendered as `<button>` with no `role="switch"` or `aria-checked`.
- **`UsersRolesTab.tsx:70-92`** — `Promise.all([users, roles])` with no per-call error isolation.
- **`UsersRolesTab.tsx:143-145`** — Search filters only client-loaded users; pagination breaks search.
- **`OrganisationTab.tsx:38`** — Default `govMode = "team"` even when company.governance_mode is `null` in API response.

### P2
- `aria-live="polite"` region missing for login/signup error announcements.
- `SecurityTab.tsx:252-253` — TOTP backup codes rendered in DOM; visible to clipboard managers.
- `signup/page.tsx:299` — password input lacks `autoComplete="new-password"`.
- `UsersRolesTab.tsx:235-236` — User IDs truncated with `…`, not copyable.

---

## Section 5 — Dashboard / Market / Research / Intelligence / HedgeWiki

Pages: root `page.tsx`, `dashboard/*`, `market/*`, `intelligence/*`, `hedgewiki/*`.

### P0
- **`hedgewiki/page.tsx:261,379,518`** — `fontSize: "0.4rem"` (≈5px). Far below 12px floor; unreadable.
- **`dashboard/page.tsx:435-436,609`** — Silent fallback to zero state on `/v1/positions` failure; TradingView CDN failure shows blank space (no "chart unavailable" UI).
- **`intelligence/page.tsx:41`** — `getIntelligenceSettings(token)` with no early-return on `!token` (a guard exists at component root but the catch path doesn't differentiate "no token" from "API error").

### P1
- **Hardcoded hex everywhere** — `market/page.tsx:22-33` (`BG = "#131722"`, `RED = "#EF5350"`), root `page.tsx:157-161` STATUS_CONFIG, dashboard inline `T` object built per-component.
- **Per-widget error boundaries missing** — FX rates widget (`dashboard/page.tsx:610-656`), recent runs (`700-756`), pipeline status all show "no data" instead of explicit error state on fetch failure.
- **Missing PageShell** — `intelligence/page.tsx:68` uses raw `<div>`.
- **Hardcoded role check** — `intelligence/page.tsx:65` (`user?.roles?.includes("admin") || user?.is_superuser`) — should use `usePermission()` helper.
- **`market/page.tsx:291`** — `usePublicChartData(pair, interval, 500)` has no debounce; rapid-clicking pairs floods backend.
- **`hedgewiki/page.tsx:464,616`** — Inline `color-mix(in srgb, var(--accent-cyan) 6%, transparent)` repeated; should be a derived token.

### P2
- Color-only state on FX rate up/down (no aria-label).
- Timeframe buttons (`1m`, `5m`, etc.) `onClick`-only, no keyboard nav.
- `widgetRegistry.ts` defines widget specs but has no TS-level enforcement that headers carry `className="widget-drag-handle"`.
- `dashboard/error.tsx` delegates to `FeatureErrorPage` with no dashboard-specific messaging.

---

## Section 6 — Shared Components & Design System

Files: `PageShell`, `AppSidebar`, `EmptyState`, `Skeleton*`, `ui/*`, `dashboardClient`, `authContext`, `globals.css`.

### P0
- **`AppSidebar.tsx:587,641`** — Hardcoded `color: "#fff"` for the brand "O" letter (collapsed + expanded). No fallback for non-dark themes.
- **`SkipToContent.tsx:17`** — `color: "#FFFFFF"` literal; should be `var(--text-primary)`.

### P1
- **`AppSidebar.tsx:38-50`** — Local `ST` token object's CSS-var fallbacks **diverge from the actual token values in `globals.css`**:
  - `var(--bg-sidebar, #0E0E0E)` ← but `globals.css` declares `--bg-sidebar: #0B1120`.
  - Risk: if CSS hasn't loaded, sidebar paints with the wrong fallback color.
- **`dashboardClient.ts:47-70`** — `dashboardFetch()` has **no `AbortSignal` / no timeout**. A hung backend call lives until the browser default (~2 min). `authContext.tsx:192` already uses 30 s for login — these should match.
- **`authContext.tsx:151,166`** — `refreshTokens()` returns `null` on 401 but caller does **not redirect to `/auth/login`**. Window of `user === null` while `isAuthenticated === true` is reachable.
- **`AppSidebar.tsx:267-269`** — `mobileOpen` prop exists but no `@media (max-width: 640px)` styles; sidebar always at fixed width.
- **`AppSidebar.tsx:259`** — `roleColor("auditor")` returns `#93C5FD` literal; other roles use `ST` tokens.
- **`HelpPanel.tsx:150-151`** — `#F97316` / `#EA580C` orange hardcoded; `--accent-amber` exists.

### P2
- `PageShell.tsx:18` — `padding: "24px 28px"` magic numbers; should use `--space-xl`.
- `EmptyState.tsx:44-201` — no override props for icon/colors; consumers must fork.
- `authContext.tsx:84` — no concurrent-login dedup (refresh has it at line 106).
- `AppSidebar.tsx:415,547` — collapsed nav items lack `aria-label` / `title`.
- No retry/backoff in `dashboardFetch` for idempotent GETs.

### Dual-Token-Namespace Risk

`globals.css` exposes two parallel token sets — the original (`--bg-deep`, `--text-primary`, `--accent-cyan`, …) and the "Terminal Design System" mirror (`--terminal-bg`, `--terminal-text-primary`, `--terminal-accent`, …). They have largely the same values today, but nothing keeps them in sync. Consumers pick freely. Recommend **deprecating one set with a single PR** and codifying the choice in `frontend.md`.

### Dead-Link Audit

Spot-checked all `AppSidebar.tsx` `href` values against `frontend/src/app/**/page.tsx`. **All 50+ nav routes resolve.** No dead links.

---

## Cross-Cutting Top 15

Ordered by ROI on a hardening sprint:

| # | Severity | Issue | Fix sketch |
|---|----------|-------|-----------|
| 1 | P0 | Raw `fetch()` bypassing `dashboardFetch` (hedge-effectiveness, signup, login MFA, accounting OAuth, ERP sync) | Replace each with `dashboardFetch`. |
| 2 | P0 | OAuth flows lack `state` parameter + URL-error XSS in callbacks | Generate cryptographic `state` per OAuth init; verify in callback; sanitise `error_description` before render. |
| 3 | P0 | Hardcoded fallback API URL in login (`hedgecore.onrender.com`) and empty-string fallback in signup | Throw on missing `NEXT_PUBLIC_API_URL` at build time. |
| 4 | P0 | `useSearchParams` without Suspense (hedge-effectiveness, both OAuth callbacks, settings root) | Wrap each consumer in `<Suspense>` at the `useSearchParams` call site. |
| 5 | P0 | Missing destructive-action confirms (MFA disable, API key revoke, role removal) | Standard confirm modal; require typed-name confirmation for revoke. |
| 6 | P0 | API key persists in React state past banner close | `sessionStorage` with TTL or `useEffect` cleanup. |
| 7 | P0 | Font sizes <12px (hedgewiki `0.4rem`, audit-trail `0.75rem`, position-desk `0.625rem`) | Raise to 12px floor; add ESLint rule against `fontSize: "0.X"` literals. |
| 8 | P0 | Client-only RBAC on admin pages | Add server-side role middleware; keep client check only for UX. |
| 9 | P0 | Per-widget silent error fallback in dashboard | Per-widget `<ErrorBoundary>` with explicit error state UI. |
| 10 | P1 | Hardcoded hex colors / per-page local token objects (≥6 pages) | One canonical `T` token export from `@/lib/design/tokens`; ESLint rule against hex literals. |
| 11 | P1 | Missing `PageShell` (pre-trade-tca, counterparties, accounting-connection, cash-positions, bank-statements, intelligence) | Wrap each page; remove redundant flex containers. |
| 12 | P1 | Direct `localStorage` for auth or UI state (hedge-effectiveness, portfolio, login) | Centralise via `useAuth()` and a shared `useUiPreferences()` hook. |
| 13 | P1 | Silent error catches (`catch { /* fail-open */ }`) — login MFA, exports, debt page, audit-lab exports | Replace empty catches with `console.error` + user-visible toast. |
| 14 | P1 | `dashboardFetch` lacks AbortSignal/timeout | Wrap with `AbortSignal.timeout(15_000)`; emit toast on timeout. |
| 15 | P1 | Dual design-token namespaces (`--bg-deep` vs `--terminal-bg`) | ADR + single-PR consolidation. |

---

## Recommended Hardening Sprint

**Day 1 — Security P0**
- OAuth `state` parameter + callback XSS sanitisation.
- Replace raw `fetch()` with `dashboardFetch` everywhere (8 sites).
- Fail-loud on missing `NEXT_PUBLIC_API_URL`.
- Add destructive-action confirm modals.
- API-key-after-close cleanup.

**Day 2 — UX P0/P1**
- Per-widget error boundaries on dashboard.
- Suspense wrappers for `useSearchParams` consumers (4 pages).
- Add `PageShell` to the 6 missing pages.
- Add `dashboardFetch` AbortSignal + timeout; standardise on 15 s.
- Raise <12px font sizes.

**Day 3 — Design system**
- Move all per-page `S` / `T` / `HEX` objects to the canonical `@/lib/design/tokens` export.
- ADR: deprecate one of the two token namespaces.
- Add ESLint rule: no `#[0-9a-fA-F]{6}` color literals in TSX outside `globals.css`.
- Add ESLint rule: no `fontSize` below `0.75rem`.
- AppSidebar mobile breakpoint + collapsed-item aria-labels.

**Out of sprint scope (continuous polish)** — table `<th scope="col">`, keyboard nav on dropdowns, color-only state encoding, table responsiveness.

---

## Coverage Notes

- **Audited deeply**: 50+ application page.tsx files across 6 nav-section groups.
- **Skim coverage only**: marketing/about pages (intentionally — different rules).
- **Not yet browser-verified**: this audit is static analysis. Recommended next step is to spin up dev server (`cd frontend && npm run dev`) and use Chrome MCP to verify a sample of P0 findings (login fallback URL, OAuth callback XSS, hedge-effectiveness raw fetch path, dashboard widget failure modes).
