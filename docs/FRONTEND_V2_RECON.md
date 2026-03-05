# ORDR Terminal — Frontend v2 Build Report

## Overview

`frontend-v2/` is a ground-up rewrite of the ORDR Terminal frontend.
Built on Next.js 15 App Router, React 19, TypeScript strict, Tailwind CSS v4.

Branch: `feat/frontend-v2`
Build date: 2026-03-05
Routes: **31** | tsc: **clean** | next build: **clean**

---

## Stack Differences (v1 → v2)

| Concern | frontend/ (v1) | frontend-v2/ (v2) |
|---------|---------------|-------------------|
| State | Redux Toolkit | Zustand (lighter) |
| Data fetching | Custom `dashboardFetch()` | React Query v5 |
| Auth token | localStorage | In-memory (Zustand) |
| API client | Per-route fetch calls | Centralized `ApiClient` with 401 retry |
| Charts | ECharts 6 | Recharts 2 |
| Grid | react-grid-layout | None (widgets removed) |
| Tier enforcement | Client-only | RSC TierGate + client fallback |
| Auth flow | JWT email/password only | JWT + passwordless OTP (Free tier) |
| Pages | 54 routes | 31 routes (consolidated) |

---

## Route Inventory

### Auth (unauthenticated)
| Route | Description |
|-------|-------------|
| `/auth/login` | Email + password login (OAuth2 form) |
| `/auth/signup` | Passwordless signup — email → OTP flow |
| `/auth/verify` | 6-digit OTP verification, issues JWT |

### App Shell (requires auth, `(app)` route group)
| Route | Tier | Description |
|-------|------|-------------|
| `/` | any | Root redirect → `/dashboard` |
| `/dashboard` | any | Tier-adaptive: Free shows last audit run + upgrade CTA; SMB/Enterprise shows KPIs + recent runs + chain integrity |
| `/audit-lab` | FREE+ | Dataset + run history list |
| `/audit-lab/upload` | FREE+ | 3-step upload wizard — CSV column mapping, benchmark config, submit |
| `/audit-lab/runs/[run_id]` | FREE+ | Money-shot results: KPIs, by-pair chart, flags table, upgrade CTA |
| `/exposures` | SMB+ | Position desk, deep-linkable slide-over via `?position=ID` |
| `/hedge-plan` | SMB+ | Decision desk — position selector + run decision engine |
| `/hedge-plan/runs/[run_id]` | SMB+ | Run detail — proposals / packets / trace / hashes tabs |
| `/policies` | SMB+ | Policy library — active policy + template grid + activate/deactivate |
| `/execute` | SMB+ | 4-step wizard: Review → Calculate → Risk Check → Execute |
| `/analytics/portfolio` | Enterprise | Risk heat map (mock) + live exposure table |
| `/analytics/scenarios` | Enterprise | Coming soon — 6-feature preview grid |
| `/governance/audit-trail` | Enterprise | Full event log, chain verify, export |
| `/governance/staging` | Enterprise | 4-eyes staging queue with SoD notice |
| `/governance/ledger` | Enterprise | WORM ledger, read-only |
| `/settings` | any | Tabs by tier: Profile / Company / Team / Security / API Keys |
| `/help` | any | Getting started steps + HedgeWiki FAQ + support ticket form |
| `/onboarding` | any | 4-step SMB onboarding wizard (standalone, no sidebar) |

### Admin Command Center (superuser only — returns 404 for others)
| Route | Description |
|-------|-------------|
| `/admin` | War Room — live status + tenant overview + alerts |
| `/admin/tenants` | Tenant management (mock data) |
| `/admin/users` | Real user list from `GET /v1/admin/users` + create form |
| `/admin/system` | Schema health, WORM tables, middleware stack |
| `/admin/audit` | Cross-tenant audit log + chain verify + export |
| `/admin/api-keys` | API key management (GET/POST/revoke) |
| `/admin/metrics` | Funnel KPIs + top tenants (demo data) |
| `/admin/config` | Feature flags + default tier + maintenance mode (demo) |

---

## Tier System

```
lite (0) < smb/professional (1) < enterprise (2)
```

### Enforcement layers

1. **RSC TierGate** (`components/tier/TierGate.tsx`) — server component reads `user_tier` cookie
   set on login; renders blurred preview + upgrade CTA for locked features.
   Zero locked content sent to client.

2. **TierGateClient** (`components/tier/TierGateClient.tsx`) — client-side fallback for pages
   that can't use RSC (need Zustand auth state).

3. **Sidebar lock** (`components/layout/Sidebar.tsx`) — locked items render as disabled with
   hover popover showing required tier + upgrade link.

4. **API enforcement** — backend enforces tier independently; frontend gating is UX only.

### Login cookies set on auth

```
user_tier={plan_tier}   ; path=/; SameSite=Lax   (non-httpOnly — read by RSC TierGate)
user_su={0|1}            ; path=/; SameSite=Lax   (non-httpOnly — superuser flag for admin access)
rt={refresh_token}      ; path=/api/auth/refresh  (httpOnly — 7d refresh token)
csrf_token={token}       ; path=/                  (non-httpOnly — read by ApiClient for X-CSRF-Token)
```

---

## Key Infrastructure

### ApiClient (`lib/api/client.ts`)

- Singleton `api` instance used across all pages
- Injects `Authorization: Bearer {token}` from Zustand in-memory store
- Injects `X-CSRF-Token` from `csrf_token` cookie on all non-safe methods
- 401 → silent refresh via `POST /auth/refresh` (deduplicated with shared promise) → retry once → logout
- `api.upload()` for multipart form data (omits Content-Type to let browser set boundary)

### Zustand auth store (`lib/auth/store.ts`)

- Token stored in memory only (not localStorage — XSS-resistant)
- `AuthProvider` calls `GET /v1/auth/me` on mount to rehydrate from existing session
- `hasPermission(codename)` for fine-grained RBAC checks

### Deep-linkable slide-overs (`lib/hooks/useSearchParamsState.ts`)

- `useSearchParamsState("position")` → reads/writes URL search param
- `/exposures?position=uuid` opens the slide-over for that position
- All slide-overs use `SlideOver` component with ESC + backdrop dismiss

### Passwordless auth (backend: `auth_passwordless.py`)

- `POST /auth/passwordless/start` — generates 6-digit OTP, stores in `_OTP_STORE` (in-memory, 5min TTL)
- `POST /auth/passwordless/verify` — validates OTP, creates Free-tier user if new, issues JWT pair
- Dev/demo mode: OTP returned in response body (no email sending)
- Production: remove `code` from response; add SES/SendGrid call before return

---

## Deployment

### Prerequisites

1. Create a new Vercel project:
   - **Repo**: `Synexiun/HedgeCore`
   - **Root Directory**: `frontend-v2`
   - **Framework Preset**: Next.js

2. Set environment variable in Vercel dashboard:
   ```
   NEXT_PUBLIC_API_URL = https://hedgecore.onrender.com/api
   ```

3. Add new Vercel domain to backend CORS (in `render.yaml` or Render env var):
   ```
   CORS_ALLOW_ORIGINS = ["https://hedgecore.vercel.app","https://ordr-terminal.vercel.app","https://<new-v2-domain>.vercel.app","http://localhost:3000"]
   ```

### Local dev

```bash
cd frontend-v2
npm install
NEXT_PUBLIC_API_URL=https://hedgecore.onrender.com/api npm run dev
# or against local backend:
NEXT_PUBLIC_API_URL=http://localhost:8000/api npm run dev
```

### Build verification

```bash
cd frontend-v2
npx tsc --noEmit   # type check
npx next build     # production build gate
```

---

## File Structure

```
frontend-v2/src/
├── app/
│   ├── (app)/               # Authenticated shell (auth guard in layout.tsx)
│   │   ├── layout.tsx       # Fixed sidebar + scrollable main
│   │   ├── page.tsx         # redirect("/dashboard")
│   │   ├── dashboard/
│   │   ├── audit-lab/
│   │   ├── exposures/
│   │   ├── hedge-plan/
│   │   ├── policies/
│   │   ├── execute/
│   │   ├── analytics/
│   │   ├── governance/
│   │   ├── settings/
│   │   ├── help/
│   │   └── onboarding/      ← standalone (bypasses app shell)
│   ├── admin/               # Superuser only (404 for others)
│   ├── auth/                # Unauthenticated pages
│   ├── globals.css          # Design tokens (matches frontend/ exactly)
│   ├── layout.tsx           # Root layout (fonts + providers)
│   ├── page.tsx             # Root redirect (auth check → /dashboard or /auth/login)
│   └── providers.tsx        # QueryClientProvider + AuthProvider
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx      # Tier-aware nav, collapsible, admin COMMAND CENTER
│   │   └── PageHeader.tsx   # Standard label/title/subtitle/action header
│   ├── tier/
│   │   ├── TierGate.tsx     # RSC — reads user_tier cookie server-side
│   │   ├── TierGateClient.tsx # Client fallback using Zustand
│   │   └── BlurredPreview.tsx # Blurred content + upgrade CTA overlay
│   └── ui/
│       ├── Badge.tsx        # Status/tier chip
│       └── SlideOver.tsx    # Right-side panel, URL-driven
├── lib/
│   ├── api/client.ts        # ApiClient singleton
│   ├── auth/
│   │   ├── store.ts         # Zustand auth store
│   │   └── AuthProvider.tsx # Session rehydration on mount
│   ├── hooks/
│   │   └── useSearchParamsState.ts  # URL param ↔ state sync
│   └── tier/features.ts     # meetsRequirement(), TIER_RANK, TIER_LABELS
└── types/api.ts             # Shared TypeScript types (Position, AuditRun, etc.)
```
