# Frontend Rules

## Widget Pattern
```tsx
interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
} as const;
```
- Every widget header MUST include `className="widget-drag-handle"`.
- Widget header has: icon, title (uppercase mono), scope badge, flex spacer, close button.

## Styling
- Use inline styles with CSS variables. NOT className-heavy Tailwind.
- Design tokens from `frontend/src/app/globals.css`.
- Minimum font size: 12px (institutional minimum).
- Fonts: IBM Plex Sans (UI), IBM Plex Mono (data), Manrope (headings), JetBrains Mono (code).

## Imports
```tsx
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { useAuth } from "@/lib/authContext";
import type { UserContext } from "@/lib/authContext";
import EmptyState from "@/components/ui/EmptyState";
```
- API calls: `dashboardFetch(path, token)` — never raw fetch.
- Auth: `useAuth()` hook — never direct localStorage access.
- Icons: `lucide-react` only.

## Dashboard
- Widget registry: `frontend/src/lib/widgets/widgetRegistry.ts`
- Layout saved per-user: `localStorage.dashboard_layout_${userId}`
- Role-based default layouts defined in registry.

## Navigation
- `AppSidebar.tsx` is primary nav (~1020 lines).
- Collapsed: 64px icon rail. Expanded: 260px.
- Toggle: `[` key or button. State in `localStorage.ordr_sidebar_expanded`.
- 12 nav sections with plan-tier + governance-mode gating.

## Pages with useSearchParams
- Must wrap in `<Suspense>` boundary.

## Build
- `cd frontend && npx next build` — ESLint ignored during build.
- TypeScript check: `npx tsc --noEmit`.
