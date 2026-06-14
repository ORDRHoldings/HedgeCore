# ORDR Treasury — Frontend

The Next.js application for ORDR Treasury: the institutional FX hedge, governance, and audit
terminal, plus the public marketing landing served at `/`.

> This is a **Next.js 15.5 App Router** application — not a Vite/CRA app. Use `next` commands.

---

## Stack

| Concern | Choice |
|---------|--------|
| Framework | Next.js 15.5 (App Router) |
| UI runtime | React 19.1 |
| Language | TypeScript 5.9 (`strict`) |
| Styling | Inline styles over CSS variables (design tokens in `src/app/globals.css`) — not Tailwind-heavy |
| Icons | `lucide-react` only |
| Fonts | IBM Plex Sans (UI), IBM Plex Mono (data), Manrope (headings), JetBrains Mono (code) |
| Hosting | Vercel — `ordr-treasury.vercel.app` |

---

## Getting started

```bash
npm ci

# create .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > .env.local

npm run dev          # http://localhost:3000
```

The backend (see `../backend`) must be running on the URL in `NEXT_PUBLIC_API_URL` for
authenticated routes to work. The marketing landing at `/` is public and renders without a backend.

---

## Scripts

```bash
npm run dev          # dev server (Turbopack)
npx next build       # production build (ESLint is ignored during build by config)
npx tsc --noEmit     # type check — the canonical correctness gate
npm run lint         # eslint
npx playwright test --project=smoke   # 44-test E2E smoke project
```

---

## Project structure

```
src/
  app/                     App Router
    page.tsx               Public marketing landing (ORDR Treasury)
    layout.tsx             Root layout — metadata, ThemeProvider, ClientProviders, CMD+K
    globals.css            Design tokens (CSS variables), responsive breakpoints
    dashboard/             Role-based widget dashboard
    hedge-desk/ position-desk/ pre-trade-tca/ natural-hedging/ hedge-templates/
    cash-positions/ cash-forecast/ cash-management/ intercompany-netting/ payments/
    debt/ ir-risk/ counterparties/
    staging/ ledger/ audit-trail/ lineage/        Governance & audit (team mode)
    audit-lab/             Forensic FX cost analysis
    regulatory-submissions/ reports/ committee-pack/
    intelligence/          AI advisory settings (Intelligence tier)
    settings/ admin/ auth/ ...                     (~86 route pages total)
  components/
    layout/AppSidebar.tsx  Primary navigation (11 sections, plan-tier + governance-mode gated)
    pipeline/ClientProviders.tsx
    intelligence/CmdKOverlay.tsx                   Global CMD+K natural-language query
    ui/ widgets/ ...
  lib/
    api/                   API clients (dashboardClient, tcaClient, debtClient, ...) — 13 modules
    authContext.tsx        useAuth() hook + PlanTier
    widgets/widgetRegistry.ts                      21 dashboard widgets + role layouts
    theme/                 ThemeProvider
e2e/                       Playwright specs (smoke + full suites)
```

---

## Conventions

These mirror `.claude/rules/frontend.md` — follow them for any new component.

- **API calls** go through `dashboardFetch(path, token)` from `@/lib/api/dashboardClient` — never raw `fetch`.
- **Auth** comes from the `useAuth()` hook — never read `localStorage` directly.
- **Styling** uses inline styles referencing CSS variables (e.g. `var(--bg-panel)`), not className-heavy Tailwind. Minimum font size is 12px (institutional density floor).
- **Widgets** must give their header `className="widget-drag-handle"`; the registry lives at `src/lib/widgets/widgetRegistry.ts`.
- **Pages using `useSearchParams`** must be wrapped in a `<Suspense>` boundary.
- **Navigation** is gated by **plan tier** (`lite` → `smb` → `professional` → `enterprise` → `intelligence`) and **governance mode** (governance section is visible only in `team` mode).

---

## Dashboard

- 21 widgets registered in `widgetRegistry.ts` (KPI summary, recent runs, pending approvals, FX rates, market pulse, hedge monitor, multi-pair exposure, geopolitical, …).
- Per-user layout persisted at `localStorage.dashboard_layout_${userId}`.
- Role-based default layouts for 10 personas (admin, CFO, head of risk, branch manager, supervisor, senior/risk/junior analyst, auditor).

---

## Marketing landing

The public landing page is `src/app/page.tsx`. `ClientProviders` treats `/` as a public route (no
sidebar, no voice). Every figure on the page is sourced from the codebase — keep it that way when
editing. Theme tokens are inherited from `globals.css`.

---

## Build & deploy

Production deploys to Vercel from `master`. The build is a standard server-side `next build` (not
`--prebuilt`). See `../docs/runbooks/vercel-env-rotation.md` and the root `README.md` for the
deployment topology and the auto-deploy notes.
