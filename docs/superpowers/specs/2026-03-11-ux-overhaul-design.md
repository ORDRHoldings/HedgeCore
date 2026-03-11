# ORDR Terminal — Full UX Overhaul Design Spec

**Date**: 2026-03-11
**Status**: Approved
**Author**: Architecture Team
**Scope**: Frontend restructure — design system, navigation, page consolidation, new pages

---

## 1. Problem Statement

The ORDR Terminal frontend has 71 pages that feel like 71 separate apps. Users cannot complete core tasks within 3 clicks. Pages duplicate functionality (4 policy pages, 3 position entry pages, 2 execution history pages). Five different design token systems create visual inconsistency. No shared components (PageHeader, Button, EmptyState) means every page reinvents chrome. The product does not feel like a single, cohesive institutional platform.

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Dashboard model | Mission Control — greeting + 3 live-data cards + KPI strip | Cards with live stats pull users into the right workflow |
| Navigation | Sidebar, open by default (260px), 7 primary sections | Readable, visible, institutional. User can collapse to 64px |
| Icon system | Lucide React, 20px, strokeWidth=1.5, square caps, miter joins | Cold, authoritative. Already installed, zero new deps |
| Color palette | Monochrome + single accent (#1C62F2 blue). Status colors on data only | Bloomberg-cold. No colored badges on UI chrome |
| Page structure | Flexible PageShell (shared header + freeform content) | Connective tissue without constraining page layouts |
| Page count | 71 → ~30 (5 deletions, 8 merges) | Eliminate duplicate entry points |
| Market data | Single Market Overview page, hybrid (own FX + TradingView embeds) | ORDR Market is a separate app; this is context for hedging |
| Audit Lab | Public demo mode at /audit-lab/demo (no auth required) | Product-led growth hook for prospects |
| Hedge Desk | UNTOUCHED — all 7 pipeline phases preserved as-is | Working workflow, no regressions |
| Rollout | Big bang on master, all changes ship together | No half-states |

## 3. Design System

### 3.0 Theme Strategy

**The entire app moves to dark theme.** The existing `:root` CSS variables in `globals.css` are updated IN-PLACE to the dark palette values below. This means ALL pages — including Hedge Desk pipeline phases — receive the dark theme automatically via CSS variables. No code changes needed in Hedge Desk components because they already reference `var(--bg-panel)`, `var(--text-primary)`, etc. The variable NAMES stay the same; only the VALUES change.

`lib/design/tokens.ts` re-exports CSS variable REFERENCES (e.g., `"var(--bg-panel)"`) — not hex values. This ensures a single source of truth. Pages that currently define local `S` or `T` objects with CSS var references will continue to work; those with hardcoded hex values (e.g., dashboard's `#F8FAFC`) must be updated to use the shared tokens import.

### 3.1 Color Tokens (single source of truth: `globals.css` `:root` + `lib/design/tokens.ts`)

**`globals.css` `:root` values (updated):**
```
SURFACE
  --bg-deep:    #111827    (page background)
  --bg-panel:   #1F2937    (cards, panels)
  --bg-sub:     #293548    (nested elements)
  --bg-sidebar: #0B1120    (sidebar only — new variable)

BORDER
  --border-rim:  #374151   (panel borders)
  --border-soft: #1F2937   (subtle dividers)

TEXT
  --text-primary:   #E5E7EB
  --text-secondary: #9CA3AF
  --text-tertiary:  #6B7280
  --text-disabled:  #374151

ACCENT
  --accent-blue:     #1C62F2   (active states, CTAs, links)
  --accent-blue-dim: rgba(28, 98, 242, 0.10)
  --accent-cyan:     (REMOVED — use --accent-blue only)
  --accent-amber:    (REMOVED from chrome — kept only as --status-warn)

STATUS (data values only — never on UI chrome)
  --status-pass: #059669
  --status-fail: #DC2626
  --status-warn: #D97706
```

**`lib/design/tokens.ts` exports CSS var references:**
```ts
export const T = {
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  // ... all reference CSS vars, never hardcoded hex
} as const;
```

### 3.2 Typography

| Use | Font | Size | Weight |
|-----|------|------|--------|
| Page title | IBM Plex Sans | 20px | 700 |
| Section header | IBM Plex Sans | 14px | 600 |
| Body text | IBM Plex Sans | 13px | 400 |
| Data values | IBM Plex Mono | 13px | 400-700 |
| Labels | IBM Plex Sans | 12px | 500 |
| **Minimum** | Any | **12px** | — |

No text below 12px. No exceptions.

### 3.3 Shared Components

| Component | File | Purpose |
|-----------|------|---------|
| `PageShell` | `components/layout/PageShell.tsx` | Wraps every page: header + content slot |
| `PageHeader` | `components/layout/PageHeader.tsx` | Icon + title + breadcrumb + action buttons |
| `KpiStrip` | `components/ui/KpiStrip.tsx` | Horizontal stat bar (N items, equal width) |
| `ActionButton` | `components/ui/ActionButton.tsx` | Primary (blue fill) / secondary (border) / ghost |
| `StatusDot` | `components/ui/StatusDot.tsx` | Colored dot for data status (pass/fail/warn) |
| `EmptyState` | `components/ui/EmptyState.tsx` | Enforce on all pages (exists, underused) |
| `DataTable` | `components/ui/DataTable.tsx` | Standard sortable table with header |
| `Icon` | `components/ui/Icon.tsx` | Lucide wrapper with sharp caps/joins |
| `tokens` | `lib/design/tokens.ts` | Single design token export, replaces 5 local objects |

**DataTable interface:**
```tsx
interface Column<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onSort?: (key: keyof T, direction: "asc" | "desc") => void;
  onRowClick?: (row: T) => void;
}
```

**Note:** `EmptyState` already exists at `components/ui/EmptyState.tsx` — not a new file. The task is to enforce its usage across all pages (replace inline loading/error text).

### 3.4 Icon Standard

- Library: `lucide-react` (already installed)
- Size: 20px (nav), 16px (inline)
- Stroke: 1.5px
- Caps: `square` (not `round`)
- Joins: `miter` (not `round`)
- Colors: `--text-tertiary` default, `--accent-blue` active, `--text-primary` hover

**Icon wrapper component** (`components/ui/Icon.tsx`):
```tsx
import type { LucideIcon } from "lucide-react";

interface IconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
}

export function Icon({ icon: LucideIcon, size = 20, className }: IconProps) {
  return <LucideIcon size={size} strokeWidth={1.5}
    strokeLinecap="square" strokeLinejoin="miter" className={className} />;
}
```

All new code uses `<Icon icon={LayoutDashboard} />` — never raw Lucide imports with manual props.

### 3.5 Accessibility

- All interactive elements (buttons, links, nav items) must be keyboard-focusable
- Sidebar nav items: `role="navigation"`, `aria-label="Main navigation"`
- Active nav item: `aria-current="page"`
- Mission Control cards: `role="link"`, `aria-label` describing destination
- PageShell breadcrumb: `aria-label="Breadcrumb"`, `<nav>` element
- ActionButton: includes `aria-disabled` when disabled
- Focus visible: 2px outline using `--accent-blue` on `:focus-visible`
- Color contrast: all text/background combinations meet WCAG AA (4.5:1 ratio)

## 4. Sidebar Redesign

### 4.1 Behavior
- **Default state**: OPEN (260px). Saved to `localStorage.ordr_sidebar_expanded`.
- **First visit**: Always open (override previous default of closed).
- **Collapsed**: 64px icon rail. Tooltip on hover showing section name (no flyout sub-nav panels — intentional simplification; flyouts were fragile and disappeared on cursor movement).
- **Toggle**: `[` key or collapse button at bottom.
- **Active indicator**: 2px left border (#1C62F2) + blue icon + white text.
- **Plan-tier gating**: Research + Governance require `enterprise` tier (preserved from current).
- **Governance-mode gating**: Governance section requires `teamOnly` mode (preserved from current).
- **Superuser gating**: Admin section requires superuser role (preserved from current).

### 4.1.1 Section Migration Map (12 old → 10 new)

| Old Section | New Location |
|-------------|-------------|
| Dashboard | → Dashboard (unchanged) |
| Hedge Desk | → Hedge Desk (+ Effectiveness items absorbed) |
| ORDR Market | → REMOVED (separate app). Market Overview replaces |
| Reports | → Reports (unchanged) |
| Connectors | → Settings (as tabs: Connectors, ERP, Import History) |
| Audit Lab | → Audit Lab (promoted to position #4) |
| Decisions | → REMOVED (deleted) |
| Effectiveness | → Hedge Desk (as COMPLIANCE sub-group) |
| Research | → Research (unchanged) |
| Governance | → Governance (unchanged) |
| Settings | → Settings (+ Connectors tabs absorbed) |
| Admin | → Admin (unchanged) |
| Help | → Help (unchanged) |

### 4.2 Sections (7 primary + 3 utility)

| Tier | Section | Icon (Lucide) | Sub-items |
|------|---------|---------------|-----------|
| PRIMARY | Dashboard | `LayoutDashboard` | — (single page) |
| PRIMARY | Hedge Desk | `Play` | Overview, Active Run, Monitor, History, Effectiveness, Assessment History, Policy Library, Position Desk |
| PRIMARY | Reports | `FileText` | Studio, Preset Library, AI Builder, Saved, Run Results, Committee Pack |
| PRIMARY | Audit Lab | `Microscope` | Audit Lab, Upload, Compare, Audit Trail, Trends |
| PRIMARY | Market Overview | `BarChart3` | — (single page) |
| SECONDARY | Research | `Zap` | Simulation Lab, Scenario Studio, Methodology |
| SECONDARY | Governance | `Globe` | Staging, Ledger, Audit Trail, Run Viewer, Lineage, Wiki |
| UTILITY | Settings | `Settings` | General, Policy Limits, Execution, API, Notifications, Security, Connectors, ERP, Import History, Users, API Keys, Organisation, Audit Trail |
| UTILITY | Admin | `Monitor` | Operations Center, DevOps (superuser only) |
| UTILITY | Help | `HelpCircle` | Docs, FAQ, Support, Contact |

### 4.3 Visual Tiers
- PRIMARY: icon color `#9CA3AF`, text `#E5E7EB`
- SECONDARY: icon color `#6B7280`, text `#9CA3AF`
- UTILITY: icon color `#4A5A74`, text `#6B7280`
- Divider lines between tiers

## 5. Dashboard — Mission Control

### 5.1 Layout
```
┌──────────────────────────────────────┐
│ Greeting: "Good morning, {name}"     │
│ {org} · {role} · {date}             │
├──────────┬──────────┬───────────────┤
│ NEW HEDGE│ MONITOR  │ MARKET DATA   │  ← 3 mission cards
│ {count}  │ {count}  │ {spot rate}   │     with live stats
│ positions│ active   │ EUR/USD       │
│ ready    │ hedges   │               │
│ START →  │ VIEW →   │ OVERVIEW →    │
├──────────┴──────────┴───────────────┤
│ Exposure │ Coverage │ Pending │ P&L │  ← KPI strip
│ $24.8M   │ 67%      │ 2       │+142K│
└──────────────────────────────────────┘
```

### 5.2 Data Sources
- Greeting: `useAuth()` → user name, role, company
- New Hedge card: `GET /v1/positions?execution_status=READY_TO_EXECUTE` → count
- Monitor card: `GET /v1/positions?execution_status=HEDGED` → count + pending approvals from staging
- Market card: `GET /v1/market-data/status` → latest EUR/USD spot
- KPI strip: `GET /v1/dashboard/kpis` (existing endpoint)

### 5.3 Card behavior
- Click card → navigate to target page
- Cards refresh every 60s
- Loading: monochrome skeleton (no spinner)

### 5.4 Widget System Deprecation

The existing widget grid dashboard (21 widgets, `widgetRegistry.ts`, role-based layouts, `localStorage.dashboard_layout_${userId}`) is **replaced** by Mission Control. The widget registry and widget components are **kept as library code** (not deleted) for potential future use in a configurable advanced dashboard, but the default `/dashboard` page no longer renders the widget grid.

On upgrade, existing `localStorage.dashboard_layout_*` keys become orphaned. The new dashboard ignores them — no migration needed, no user data lost (layout preferences only).

Widget components (`components/dashboard/widgets/`) remain in the codebase. They are not imported by the new dashboard. No deletion.

## 6. Page Consolidation

### 6.1 Deletions (5 pages — remove route + page.tsx)

| Route | Reason | Files to delete |
|-------|--------|-----------------|
| `/execution` | Self-labeled LEGACY with deprecation banner | `app/execution/` |
| `/decision-desk` | Removed from nav, duplicates Hedge Desk | `app/decision-desk/` |
| `/currency-fx` | Belongs to ORDR Market (separate app) | `app/currency-fx/` |
| `/execution-history` | Duplicate of `/trade-history` | `app/execution-history/` |
| `/access-control` | Duplicate of Settings → Users & Roles | `app/access-control/` |

### 6.2 Merges (8 pages → 2 target pages)

#### Policy pages (4 → 1): `/policies`
- `/policies` — becomes LIBRARY tab (existing code)
- `/saved-policies` — becomes MY POLICIES tab (move component)
- `/policy-desk` — becomes ASSIGN tab (move component)
- `/policy-dashboard` — becomes ANALYTICS tab (move component)
- Implementation: tabbed layout, each tab renders the existing component

#### Position pages (3 → 1): `/position-desk`
- `/position-desk` — stays as main grid (existing code)
- `/input` — becomes "Add Position" modal/drawer (extract form component)
- `/upload-csv` — becomes "Import CSV" modal (extract upload component)
- Implementation: Position Desk gets two buttons in PageHeader: "Add" and "Import"

#### Market pages (2 → 1): `/market-overview`
- `/fx-market` — data feeds into Market Overview
- `/market-intelligence` — replaced by Market Overview
- Implementation: new page (see section 8)

#### Calculate page
- `/calculate` — only accessible as Hedge Desk pipeline step 3, not standalone
- Remove from any direct navigation; keep component for pipeline use
- **IMPORTANT**: `pipelineNextStep.ts` returns `href: "/calculate"` — update to `/hedge-desk?mode=run`

### 6.3 Redirect Map (`next.config.js`)

Every deleted/merged route gets a permanent redirect so bookmarks and external links don't break:

| Old Route | Redirect To | Type |
|-----------|-------------|------|
| `/input` | `/position-desk` | 301 |
| `/upload-csv` | `/position-desk` | 301 |
| `/calculate` | `/hedge-desk?mode=run` | 301 |
| `/policy-desk` | `/policies?tab=assign` | 301 |
| `/saved-policies` | `/policies?tab=saved` | 301 |
| `/policy-dashboard` | `/policies?tab=analytics` | 301 |
| `/execution` | `/hedge-desk` | 301 |
| `/decision-desk` | `/hedge-desk` | 301 |
| `/currency-fx` | `/market-overview` | 301 |
| `/fx-market` | `/market-overview` | 301 |
| `/market-intelligence` | `/market-overview` | 301 |
| `/execution-history` | `/trade-history` | 301 |
| `/access-control` | `/settings?tab=users_roles` | 301 |

### 6.4 Broken Reference Sweep

Files that hardcode references to deleted routes must be updated:

| File | References | Update To |
|------|-----------|-----------|
| `lib/pipelineNextStep.ts` | `/input`, `/policy-desk`, `/calculate` | `/position-desk`, `/policies?tab=assign`, `/hedge-desk?mode=run` |
| `lib/pipelineNextStep.test.ts` | Same hrefs in assertions | Match updated values |
| `lib/helpContent.ts` | `/input` (8+ refs) | `/position-desk` |
| `components/dashboard/widgets/RecentRunsWidget.tsx` | `/input` | `/position-desk` |
| `components/dashboard/widgets/ExposureSummaryWidget.tsx` | `/input` | `/position-desk` |
| `components/dashboard/widgets/PolisophicMiniWidget.tsx` | `/input` | `/position-desk` |
| `components/smb/SmbQuickActions.tsx` | `/input` | `/position-desk` |
| `app/connectors/page.tsx` | `/input?tab=upload` | `/position-desk` |
| `app/sandbox/page.tsx` | `/input` (2 refs) | `/position-desk` |
| `components/onboarding/OnboardingModal.tsx` | `/policy-desk` | `/policies?tab=assign` |
| `components/hedge-desk/StepReview.tsx` | `/policy-desk` | `/policies?tab=assign` |
| `next.config.js` | `/currency-fx` → `/fx-market` redirect | `/currency-fx` → `/market-overview` |

This sweep runs as step 6.5 in the implementation order (after merges, before applying PageShell).

### 6.5 Preserved Pages (explicit inventory)

**Hedge Desk (LOCKED — no code changes):**
- `/hedge-desk` (pipeline orchestrator + overview)
- `/hedge-desk?mode=run` (7-phase pipeline)
- `/hedge-monitor` (live MTM)
- `/trade-history` (execution log)
- `/hedge-effectiveness` (IFRS 9 testing)

**Audit Lab (5 pages):**
- `/audit-lab` (hub)
- `/audit-lab/upload` (CSV upload)
- `/audit-lab/compare` (run comparison)
- `/audit-lab/audit-trail` (event log)
- `/audit-lab/trends` (period trends)
- `/audit-lab/runs/[run_id]` (run detail)
- `/audit-lab/review` (review)

**Governance (6 pages):**
- `/staging` + `/staging/[staging_id]`
- `/ledger` + `/ledger/[ledger_id]`
- `/audit-trail`
- `/run-viewer`
- `/lineage`
- `/hedgewiki`

**Research (3 pages):**
- `/sandbox` + `/sandbox/whitepaper`
- `/scenario-studio`
- `/methodology`

**Dashboard sub-pages:**
- `/portfolio-risk`
- `/polisophic`
- `/portfolio-multi`

**Help (4 pages):**
- `/help`, `/help/faq`, `/help/support`, `/help/contact`

**Admin (2 pages):**
- `/admin-monitor`
- `/devops`

**Settings:**
- `/settings` (10+ tabs)

**Auth/Utility:**
- `/auth/login`, `/auth/logout`
- `/welcome`
- `/api-health`
- `/accounting-oauth-callback`, `/erp-oauth-callback`

**Public (no auth):**
- `/` (landing page)
- `/market` (public charting — ORDR Market)
- `/chart` (terminal charting — kept but removed from this app's nav)
- `/terminal` (kept, no nav link)
- `/audit-lab/demo` (NEW — public demo)

**AI/Wizard (kept, accessed from Hedge Desk flow):**
- `/ai-policy-wizard`

**Nested routes of deleted pages (also deleted):**
- `/decision-desk/runs/[run_id]`
- `/position-desk/import` (absorbed into Position Desk import modal)

## 7. PageShell — Shared Page Wrapper

### 7.1 Interface
```tsx
interface PageShellProps {
  icon: LucideIcon;
  title: string;
  breadcrumb?: string[];       // ["Dashboard", "Audit Lab"]
  actions?: React.ReactNode;   // Button slot (top-right)
  children: React.ReactNode;
}
```

### 7.2 Structure
```
┌─────────────────────────────────────────┐
│ [icon] Title          [action buttons]  │
│        Dashboard → Audit Lab            │
├─────────────────────────────────────────┤
│                                         │
│  {children} — freeform content          │
│                                         │
└─────────────────────────────────────────┘
```

### 7.3 Rules
- Every authenticated page MUST use PageShell
- Hedge Desk pipeline phases: PageShell wraps the pipeline, phases render inside
- Settings: PageShell wraps the settings container, tabs render inside
- Full-bleed pages (chart): PageShell with no padding option

## 8. Market Overview Page

### 8.1 Layout
```
┌─────────────────────────────────────────┐
│ PageShell: "Market Overview"            │
├──────────┬──────────┬───────────────────┤
│ FX HEAT  │ INDICES  │ COMMODITIES       │
│ MAP      │ (TV)     │ (TV)              │
│ (own)    │          │                   │
├──────────┴──────────┼───────────────────┤
│ ECONOMIC CALENDAR   │ TECHNICAL SUMMARY │
│ (embed)             │ (own)             │
├─────────────────────┼───────────────────┤
│ VOLATILITY GAUGE    │                   │
│ (own)               │                   │
└─────────────────────┴───────────────────┘
```

### 8.2 Data Sources
- **FX Heatmap**: Own — TwelveData `/v1/market-data/status` (17 pairs)
- **Indices**: TradingView embed widget (S&P 500, FTSE 100, DAX, Nikkei 225)
- **Commodities**: TradingView embed widget (Gold, Crude Oil, Silver)
- **Economic Calendar**: TradingView Economic Calendar widget embed
- **Technical Summary**: Own — TwelveData indicators (RSI, MA signals)
- **Volatility Gauge**: Own — VIX from TwelveData, implied vol from backend

### 8.3 Embed Policy
- TradingView widgets: `<iframe>` with `sandbox="allow-scripts allow-same-origin"`
- CSP header: add `frame-src: https://s.tradingview.com` to security headers
- Dark theme parameter on all embeds to match monochrome palette

## 9. Audit Lab — Public Demo Mode

### 9.1 Route
- `/audit-lab/demo` — no authentication required
- `/audit-lab` — requires authentication (full version)

### 9.2 Demo Constraints
- Pre-loaded sample dataset (hardcoded, no API calls)
- 1 comparison run allowed
- No upload capability
- No trends view
- CTA banner at bottom: "See the full picture — Create your free account" → `/auth/login`

### 9.3 Implementation
- **Separate `page.tsx`** at `app/audit-lab/demo/page.tsx` — does NOT call `useAuth()` or redirect to login
- `isDemo={true}` prop passed to a shared `AuditLabContent` component
- Demo data: static JSON fixture in `lib/fixtures/audit-lab-demo.ts`
- No query parameters processed on the demo route (prevents open redirect / phishing)
- Rate limiting: existing backend rate limiter (60 req/min per IP) applies to unauthenticated routes
- Next.js middleware auth guard must explicitly SKIP `/audit-lab/demo` route

## 10. Security & Compliance

### 10.1 SOC 2 Controls
| Control | Implementation |
|---------|---------------|
| AC-1: Access control | Public routes (/audit-lab/demo, /auth/login, /) only. All others require JWT |
| AC-2: Least privilege | RBAC enforced per-route. Enterprise sections gated by plan tier |
| AC-3: Session management | JWT 30min + 7d refresh unchanged. Sidebar state in localStorage (no PII) |
| AU-1: Audit logging | PageShell logs page views to audit_events (existing middleware) |
| CM-1: Change management | Design tokens in single file — changes tracked via git |
| SC-1: System boundaries | TradingView embeds sandboxed via iframe sandbox attribute |

### 10.2 ISO 27001 Controls
| Control | Implementation |
|---------|---------------|
| A.9.1.1: Access control policy | No new public routes except /audit-lab/demo (read-only, no PII) |
| A.9.4.1: Secure authentication | Auth flow unchanged. Demo mode has no auth bypass to real data |
| A.12.6.1: Technical vulnerabilities | No new dependencies added (Lucide already installed) |
| A.14.1.2: Secure development | All shared components include input validation. No dangerouslySetInnerHTML |
| A.14.2.5: Secure system engineering | TradingView embeds use Content-Security-Policy frame-src whitelist |

### 10.3 CSP Implementation

TradingView embeds require Content-Security-Policy `frame-src` whitelist. Configured in `next.config.js`:

```js
async headers() {
  return [{
    source: '/market-overview',
    headers: [{
      key: 'Content-Security-Policy',
      value: "frame-src 'self' https://s.tradingview.com https://www.tradingview.com"
    }]
  }];
}
```

Only the `/market-overview` page gets the relaxed frame-src. All other pages retain default (no framing).

### 10.4 Security Audit Checklist (per module)
- [ ] No new secrets introduced
- [ ] No localStorage PII leakage
- [ ] CSP headers configured in `next.config.js` for `/market-overview` only
- [ ] iframe sandbox attributes enforced (`sandbox="allow-scripts allow-same-origin"`)
- [ ] RBAC tier-gating preserved on all enterprise routes
- [ ] Public demo route (`/audit-lab/demo`) serves only static fixture data (no API calls)
- [ ] Demo route does not process query parameters
- [ ] Demo page does not call `useAuth()` or access JWT tokens
- [ ] No XSS vectors in dynamic content rendering
- [ ] CSRF protection unchanged on all mutation endpoints
- [ ] Rate limiting applies to unauthenticated routes (verified)
- [ ] Keyboard navigation works on sidebar (Tab, Enter, arrow keys)
- [ ] ARIA labels on all interactive elements in new components

## 11. Testing Strategy

### 11.1 Per-Module Testing

| Module | Test Type | Coverage Target |
|--------|-----------|----------------|
| `tokens.ts` | Unit — token values, no undefined vars | 100% |
| `PageShell` | Unit — renders title, breadcrumb, actions, children | 100% |
| `PageHeader` | Unit — icon, title, breadcrumb rendering | 100% |
| `ActionButton` | Unit — 3 variants, disabled state, click handler | 100% |
| `KpiStrip` | Unit — renders N items, handles loading/error | 100% |
| `EmptyState` | Unit — all 6 types render correctly | 100% |
| `StatusDot` | Unit — 4 color states | 100% |
| `DataTable` | Unit — sort, render rows, empty state | 90%+ |
| Sidebar | Integration — 7 sections render, active state, expand/collapse, keyboard | 90%+ |
| Dashboard | Integration — greeting, 3 cards with mock data, KPI strip, navigation | 90%+ |
| Policy tabs | Integration — 4 tabs render, tab switching, data loading | 80%+ |
| Position Desk | Integration — grid + Add modal + Import modal | 80%+ |
| Market Overview | Integration — 6 boxes render, embeds load, own data displays | 70%+ |
| Audit Lab demo | Integration — demo mode loads, gates enforced, CTA visible | 90%+ |

### 11.2 Cross-Cutting Tests
- [ ] TypeScript: `npx tsc --noEmit` — zero errors
- [ ] Build: `npx next build` — zero errors
- [ ] 12px minimum: grep for font-size values < 12 in all changed files
- [ ] No colored badges on chrome: grep for badgeColor in sidebar config
- [ ] Lucide imports only: grep for custom SVG icon definitions in new code
- [ ] PageShell usage: every page.tsx imports PageShell (except public routes)

### 11.3 Security Tests
- [ ] Public route access: unauthenticated fetch to /audit-lab/demo returns 200
- [ ] Protected route access: unauthenticated fetch to /dashboard returns redirect to /auth/login
- [ ] Demo data isolation: /audit-lab/demo makes zero API calls to backend
- [ ] CSP header: frame-src includes s.tradingview.com
- [ ] iframe sandbox: all TradingView embeds have sandbox attribute

### 11.4 Review Gates
Every module passes through:
1. **Implementation** — code written
2. **Unit/Integration tests** — written and passing
3. **Security audit** — checklist items verified
4. **Code review** — reviewer agent checks regressions, contract drift, architecture violations
5. **Build verification** — `tsc --noEmit` + `next build` green
6. **Visual verification** — page renders correctly with design system

## 12. Implementation Order

1. **Design tokens + shared components** — `tokens.ts`, `Icon`, `PageShell`, `PageHeader`, `ActionButton`, `KpiStrip`, `StatusDot`, `EmptyState` enforcement, `DataTable`
2. **globals.css dark theme** — update `:root` values to dark palette
3. **Sidebar rebuild** — Lucide icons, 7+3 sections, open default, sharp style, tier gating
4. **Dashboard (Mission Control)** — greeting, 3 live-data cards, KPI strip
5. **Delete legacy pages** — 5 route deletions + nested routes
6. **Merge policy pages** — 4 → 1 tabbed layout
7. **Merge position pages** — 3 → 1 with Add/Import modals
8. **Broken reference sweep** — update all files referencing deleted routes (see Section 6.4)
9. **Redirect map** — add 301 redirects to `next.config.js` (see Section 6.3)
10. **Apply PageShell + tokens to all remaining pages** — wrap every authenticated page
11. **Build Market Overview page** — hybrid FX + TradingView embeds + CSP headers
12. **Build Audit Lab public demo** — `/audit-lab/demo` with static fixtures
13. **Final audit pass:**
    - 12px minimum enforcement across ALL pages (including preserved pages)
    - Remove colored badges from UI chrome (status colors on data only)
    - Consistent loading states (EmptyState on all pages)
    - Consistent error states (EmptyState type="error")
    - Security checklist verification (Section 10.4)
    - Accessibility verification (keyboard nav, ARIA labels, focus visible)
    - `npx tsc --noEmit` + `npx next build` green
    - Backend tests unaffected: `python -m pytest tests/ -x -q`

---

## Appendix: Files Affected

### New files
- `frontend/src/lib/design/tokens.ts`
- `frontend/src/components/layout/PageShell.tsx`
- `frontend/src/components/layout/PageHeader.tsx`
- `frontend/src/components/ui/ActionButton.tsx`
- `frontend/src/components/ui/KpiStrip.tsx`
- `frontend/src/components/ui/StatusDot.tsx`
- `frontend/src/components/ui/DataTable.tsx`
- `frontend/src/components/ui/Icon.tsx`
- `frontend/src/app/market-overview/page.tsx`
- `frontend/src/app/audit-lab/demo/page.tsx`
- `frontend/src/lib/fixtures/audit-lab-demo.ts`

### Modified files
- `frontend/src/components/layout/AppSidebar.tsx` — full rewrite
- `frontend/src/app/dashboard/page.tsx` — full rewrite
- `frontend/src/app/policies/page.tsx` — add tabs for saved/assign/analytics
- `frontend/src/app/position-desk/page.tsx` — add Add/Import modals
- `frontend/src/app/globals.css` — update CSS variables to match tokens
- All remaining page.tsx files — wrap in PageShell, use shared tokens

### Deleted files
- `frontend/src/app/execution/` (entire directory)
- `frontend/src/app/decision-desk/` (entire directory)
- `frontend/src/app/currency-fx/` (entire directory)
- `frontend/src/app/execution-history/` (entire directory)
- `frontend/src/app/access-control/` (entire directory)
- `frontend/src/app/input/page.tsx` (merged into position-desk)
- `frontend/src/app/upload-csv/page.tsx` (merged into position-desk)
- `frontend/src/app/saved-policies/page.tsx` (merged into policies)
- `frontend/src/app/policy-desk/page.tsx` (merged into policies)
- `frontend/src/app/policy-dashboard/page.tsx` (merged into policies)
- `frontend/src/app/fx-market/` (replaced by market-overview)
- `frontend/src/app/market-intelligence/` (replaced by market-overview)
- `frontend/src/app/calculate/page.tsx` (pipeline-only, no standalone route)
