# Current Sprint

Sprint: Mobile-Responsive Core Pages
Status: COMPLETE (2026-04-21)
Started: 2026-04-21
Completed: 2026-04-21

## Goal
Close the P2 competitive-parity gap on mobile usability. The product was desktop-only. This sprint makes the 6 most critical user-facing pages usable on mobile (375px–768px width) without breaking the existing desktop experience.

## Pages Targeted
| # | Page | Route | Why Critical |
|---|------|-------|--------------|
| M1 | Dashboard | `/dashboard` | Landing page after login — first impression |
| M2 | Calculate | `/calculate` | Core FX hedge workflow — revenue-adjacent |
| M3 | Hedge Desk | `/hedge-desk` | Execution workflow — 5-step wizard |
| M4 | Cash Positions | `/cash-positions` | Treasury Suite entry point |
| M5 | Payments | `/payments` | Payment initiation — high-frequency |
| M6 | Portfolio | `/portfolio` | Portfolio overview — exec-facing |

## Deliverables
| # | Item | Status |
|---|------|--------|
| M1 | Add responsive breakpoints to `globals.css` (sm: 640px, md: 768px, lg: 1024px) | DONE |
| M2 | `AppSidebar.tsx` — hamburger overlay on <768px, backdrop, auto-close on nav | DONE |
| M3 | `/dashboard` — widget grid stacks 3→1 column, KPI strip wraps, chart+FX rates vertical | DONE |
| M4 | `/calculate` — grids stack on mobile, bucket table scrolls horizontally | DONE |
| M5 | `/hedge-desk` — shell page; pipeline components inherit sidebar fix | DONE |
| M6 | `/cash-positions` — tables wrapped in horizontal scroll containers | DONE |
| M7 | `/payments` — grids stack, forms full-width | DONE |
| M8 | `/portfolio` — grids stack, chart+table vertical | DONE |
| M9 | Root `layout.tsx` — viewport meta, overflow-x guard, safe-area inset | DONE |
| M10 | `useBreakpoint.ts` hook — `useIsMobile`, `useIsSmallMobile` | DONE |
| M11 | tsc clean; `next build --no-lint` exit 0 | DONE |

## Architectural Notes
- **No Tailwind rewrite** — kept inline-style + CSS variable approach. Added media queries in `globals.css` using custom properties.
- **Breakpoints** — single source in `globals.css`: `--bp-sm: 640px`, `--bp-md: 768px`, `--bp-lg: 1024px`.
- **Sidebar** — on <768px: fixed overlay nav with backdrop, triggered by hamburger in mobile header. Auto-closes on item selection.
- **Tables** — wrapped in `overflowX: "auto"` containers with `minWidth` so they scroll horizontally on mobile instead of squashing.
- **Safe areas** — respect `env(safe-area-inset-*)` for iPhone notch.
- **Touch targets** — minimum 44×44px for all interactive elements on mobile via CSS.

## Commits
- `db9172a` — feat(mobile): responsive breakpoints, sidebar overlay, viewport meta
- `db9172a` — feat(mobile): dashboard, calculate, payments, portfolio, cash-positions responsive grids

## Next
P2 backlog remaining after this sprint:
- Mobile-responsive layouts for remaining 50+ pages (lower priority, can be done page-by-page in future sprints)
