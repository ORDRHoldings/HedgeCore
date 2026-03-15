# Admin Hub — Design Specification
**Date**: 2026-03-15
**Status**: Approved
**Author**: Claude Sonnet 4.6 (brainstorming session)

---

## 1. Problem Statement

The existing admin surfaces (`/admin-monitor`, `/devops`) are broken at three levels:
- **API mismatches**: Frontend calls wrong endpoint paths (e.g., `/v1/admin/health` vs correct `/v1/admin/monitor/health`)
- **TypeScript/build errors**: Type shape mismatches between frontend expectations and backend responses
- **Layout issues**: Outer flex wrappers, Tailwind class mixing, duplicate chrome layers

Both pages are deleted and replaced by a single, clean `/admin` hub.

---

## 2. Approach

**Full rebuild** — delete both broken pages, build a unified `/admin` hub from scratch with a proper 8-tab architecture. Each tab is a focused, independent component file. All styles use CSS variables only (no hardcoded hex). Full test coverage: ~60 backend unit tests + 8 E2E scenarios.

---

## 3. Route & File Structure

**Route**: `/admin?tab=<name>` (default tab: `operations`)
**Auth**: Superuser-only — `is_superuser` check client-side; 403 card shown to non-superusers.
**Sidebar**: "Admin" section updated to point to `/admin` with `prefixes: ["/admin"]`.
**Deleted**: `frontend/src/app/admin-monitor/` and `frontend/src/app/devops/`

```
frontend/src/app/admin/
  page.tsx                        ← hub shell: auth gate, tab router, passes token+user
  components/
    AdminTabBar.tsx               ← 8-tab strip, active=cyan underline, 44px height
    tabs/
      OperationsTab.tsx           ← system health, services, DB, engine, errors, activity
      UsersTab.tsx                ← cross-tenant users: list, edit, role assign, revoke
      TenantsTab.tsx              ← companies: list, create, edit tier/mode, suspend
      RolesTab.tsx                ← RBAC: roles list, permissions catalog, create role
      ApiKeysTab.tsx              ← API key create/revoke + full audit log
      MetricsTab.tsx              ← KPIs, conversion funnel, MRR, activity feed
      ConfigTab.tsx               ← feature flags, maintenance, rate limits, CORS
      DevOpsTab.tsx               ← sprint, risks, freeze, sessions, decisions
```

---

## 4. Tab Definitions

### Tab 1 — OPERATIONS
**URL param**: `?tab=operations` (default)
**Purpose**: Platform health monitoring and service control.

**Sections (top to bottom)**:
1. **KPI strip** — 6 cards: Total Users, Active Users, Companies, Calc Runs, Uptime, Memory (from `/v1/admin/monitor/health`)
2. **Service Status** — 4 cards (Backend API, Database, Redis, Celery) with status dot + uptime + action buttons: `CLEAR CACHE`, `RESTART SCHEDULER` → `POST /v1/admin/monitor/restart/{service}`
3. **Database Tables** — scrollable table: table name, row count, last insert (from `/v1/admin/monitor/tables`)
4. **Engine Modules** — list of engine_v1 modules with WIRED/UNWIRED status badges (from `/v1/admin/monitor/engine`)
5. **Error Summary (24h)** — table: event type, count, latest timestamp (from `/v1/admin/monitor/errors`)
6. **Live Activity Feed** — last 50 audit events: event badge, actor email, company, hash prefix, timestamp (from `/v1/admin/activity?limit=50`)

**Auto-refresh**: 30s polling.
**API endpoints**:
- `GET /v1/admin/monitor/health`
- `GET /v1/admin/monitor/services`
- `GET /v1/admin/monitor/tables`
- `GET /v1/admin/monitor/engine`
- `GET /v1/admin/monitor/errors?hours=24`
- `GET /v1/admin/activity?limit=50`
- `POST /v1/admin/monitor/restart/{service}`

---

### Tab 2 — USERS
**URL param**: `?tab=users`
**Purpose**: Cross-tenant user management.

**Layout**: Full-width searchable + filterable table. Right-side edit drawer slides in on row click.

**Table columns**: Email, Full Name, Company, Roles (chips), MFA, Plan Tier, Status (ACTIVE/INACTIVE badge), Created At.

**Actions**:
- **Search** by email or name (client-side filter)
- **Filter** by company, plan tier, active status
- **Edit drawer**: update `full_name`, `job_title`, toggle `is_active`, toggle `is_superuser` — `PATCH /v1/admin/users/{user_id}`
- **Assign role**: dropdown → `POST /v1/admin/roles/assign` (if available) or display-only
- **REVOKE SESSIONS**: confirmation → `POST /v1/admin/users/{user_id}/revoke-sessions`
- **Pagination**: 25 per page with prev/next controls

**API endpoints**:
- `GET /v1/admin/users?page={n}&size=25&company_id={id}`
- `PATCH /v1/admin/users/{user_id}`
- `POST /v1/admin/users/{user_id}/revoke-sessions`
- `GET /v1/admin/roles` (for role assign dropdown)

---

### Tab 3 — TENANTS
**URL param**: `?tab=tenants`
**Purpose**: Multi-tenant company management.

**Layout**: Sortable table + CREATE button (top-right) + edit drawer on row click.

**Table columns**: Company Name, Slug, Plan Tier (badge), Gov Mode, Users, Positions, Runs, Status, Created At.

**Actions**:
- **CREATE TENANT**: modal → name, slug, domain (optional), plan_tier → `POST /v1/admin/tenants`
- **Edit drawer**: update name, plan_tier, governance_mode, is_active → `PATCH /v1/admin/tenants/{id}`
- **SUSPEND**: confirmation modal → `POST /v1/admin/tenants/{id}/suspend`
- **Sort** by name, users, runs, created_at

**Plan tier badges**: `lite`=gray, `professional`=cyan, `enterprise`=amber

**API endpoints**:
- `GET /v1/admin/tenants`
- `GET /v1/admin/tenants/{company_id}`
- `POST /v1/admin/tenants`
- `PATCH /v1/admin/tenants/{company_id}`
- `POST /v1/admin/tenants/{company_id}/suspend`

---

### Tab 4 — ROLES
**URL param**: `?tab=roles`
**Purpose**: RBAC role and permission management.

**Layout**: Left rail (role list, 200px) + right pane (permission catalog grouped by module).

**Left rail**: Role name, hierarchy level badge, permission count. Click to load permissions in right pane. CREATE ROLE button at bottom.

**Right pane**: Permission groups (each module = collapsible section). Each permission shows: name, code, description. Permissions are display-only in v1 (no toggle — architecture freeze on RBAC).

**CREATE ROLE modal**: name, description, hierarchy_level (0–15), select permissions from catalog → `POST /v1/admin/roles`

**API endpoints**:
- `GET /v1/admin/roles`
- `GET /v1/admin/roles/permissions`
- `POST /v1/admin/roles`

---

### Tab 5 — API KEYS
**URL param**: `?tab=apikeys`
**Purpose**: Superuser API key management across all tenants + usage audit log.

**Layout**: Top half = active keys table. Bottom half = audit log table (paginated).

**Keys table columns**: Key ID (prefix), Name, Owner, Scopes, Status, Created At, Last Used, Actions (REVOKE).

**CREATE KEY flow**:
1. Click `+ CREATE API KEY`
2. Modal: enter name
3. `POST /admin/api-keys` → returns full token
4. Show-once display: token in mono box with COPY button. Warning: "This is the only time this token will be shown."
5. After closing modal, token is gone.

**REVOKE**: confirmation popover → `POST /admin/api-keys/{key_id}/revoke`

**Audit log**: key_id prefix, path, method, status code, timestamp. Filter by key ID. `GET /admin/api-key-audit?limit=50`

**API endpoints**:
- `GET /admin/api-keys`
- `POST /admin/api-keys`
- `POST /admin/api-keys/{key_id}/revoke`
- `GET /admin/api-key-audit?limit=50`

---

### Tab 6 — METRICS
**URL param**: `?tab=metrics`
**Purpose**: Platform-wide KPIs, growth, conversion funnel, and activity.

**Sections**:
1. **Period selector**: 7d / 30d / 90d buttons (updates all sections)
2. **KPI cards** (8): Total Users, Signups (period), Active Users, Total Companies, SMB, Enterprise, Calc Runs, Audit Runs
3. **Conversion funnel**: horizontal bar chart (CSS `width: ${pct}%` bars, no external charting lib). Steps: Signup → First Position → First Run → First Hedge
4. **Activity feed**: last 50 events (same as Operations tab but focused on business events)

**API endpoints**:
- `GET /v1/admin/metrics?days={n}`
- `GET /v1/admin/metrics/funnel?days={n}`
- `GET /v1/admin/activity?limit=50`

---

### Tab 7 — CONFIG
**URL param**: `?tab=config`
**Purpose**: Live system configuration — feature flags, maintenance, rate limits, CORS.

**Layout**: 4 section cards, each independently saveable.

**Section 1 — Feature Flags**: Toggle grid (8 flags). Each flag: name, description, ON/OFF toggle. `PATCH /v1/admin/config` with `{ "feature_flags": { ... } }`.

**Section 2 — Maintenance Mode**: ON/OFF toggle + message textarea. When ON, show amber warning banner at top of card. `PATCH /v1/admin/config` with `{ "maintenance_mode": true, "maintenance_message": "..." }`.

**Section 3 — Rate Limits**: 6 editable text fields (strings like "100/minute"). Save → diff preview modal showing before/after. `PATCH /v1/admin/config` with `{ "rate_limits": { ... } }`.

**Section 4 — CORS Origins**: Textarea (one origin per line). Parse on save, show diff. `PATCH /v1/admin/config` with `{ "cors_origins": [...] }`.

**Save flow**: Each section has its own `SAVE` button → diff preview → confirm → PATCH → success toast.

**API endpoints**:
- `GET /v1/admin/config`
- `PATCH /v1/admin/config`

---

### Tab 8 — DEVOPS
**URL param**: `?tab=devops`
**Purpose**: Claude Code operating system state (AI memory database). Read-only.

**Sections**:
1. **Sprint Progress**: Task counts (open, in_progress, done, blocked) + progress bar
2. **Risk Heat Map**: CRITICAL (red), HIGH (amber), MEDIUM (yellow), LOW (cyan) — card per risk
3. **Architecture Freeze**: Frozen components list with ADR references
4. **Recent Sessions**: Last 3 session rollups (date + summary)
5. **Decisions Log**: Decision history with status badges (ACCEPTED/REJECTED/PENDING)
6. **Validation Runs**: Test results (PASS green / FAIL red) with dates
7. **File Facts**: Count of tracked files in memory DB

**Auto-refresh**: 30s.
**API endpoints**:
- `GET /v1/devops/status`
- `GET /v1/devops/risks`
- `GET /v1/devops/decisions`

---

## 5. Design System

**Token object** `A` (defined once in `page.tsx`, passed to all tabs via props or re-defined per tab):

```typescript
const A = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontHead: "'Manrope','Inter',sans-serif",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  red:      "var(--accent-red)",
  green:    "var(--accent-green)",
  indigo:   "var(--accent-indigo)",
  pass:     "var(--status-pass)",
  fail:     "var(--status-fail)",
  cyanBg:   "var(--accent-blue-dim)",
} as const;
```

**Rules**:
- Zero hardcoded hex anywhere
- Inline styles only — no Tailwind className on page/tab code
- Minimum font size 12px
- IBM Plex Sans for UI text, IBM Plex Mono for data/codes/hashes
- All tables: `borderCollapse: "collapse"`, `1px solid var(--border-rim)` borders
- Status badges: `color-mix(in srgb, <color> 10%, transparent)` backgrounds
- Loading state: centered mono `LOADING…` label
- Error state: `1px solid var(--accent-red)` banner with error message

---

## 6. Sidebar Update

In `AppSidebar.tsx`, update the Admin section:

```typescript
// Before
{ label: "Admin", href: "/admin-monitor", prefixes: ["/admin-monitor", "/devops"], items: [
  { label: "Operations Center", href: "/admin-monitor" },
  { label: "DevOps Console", href: "/devops" },
]}

// After
{ label: "Admin", href: "/admin", prefixes: ["/admin"], items: [
  { label: "Admin Hub", desc: "Users, tenants, config, operations", href: "/admin" },
]}
```

---

## 7. Backend Unit Tests

**Location**: `backend/tests/`
**Runner**: `JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_admin_*.py -x -q`

| Test File | Cases | Coverage |
|---|---|---|
| `test_admin_monitor.py` | 10 | health, services, tables, engine, errors, restart (valid + invalid service) |
| `test_admin_users.py` | 12 | list pagination, search, PATCH fields, 404, revoke sessions, non-superuser 403 |
| `test_admin_tenants.py` | 12 | list, create (unique slug, duplicate slug 409), PATCH, suspend, detail, 404 |
| `test_admin_roles.py` | 8 | list roles, list permissions, create role, non-superuser 403 |
| `test_admin_config.py` | 10 | GET shape, PATCH feature flags, PATCH maintenance, PATCH rate limits, PATCH CORS |
| `test_admin_metrics.py` | 8 | metrics shape, funnel steps, activity feed, period param |

**Total**: ~60 test cases. All use `require_superuser` dependency override + `AsyncClient`.

---

## 8. Frontend E2E Tests

**File**: `frontend/e2e/admin.spec.ts`
**Runner**: Playwright, chromium only
**Auth**: `demo/demo` login. Test fixture sets `is_superuser=True` on demo user (or uses a separate superuser test account seeded in DB).

| Scenario | Steps |
|---|---|
| Auth gate | Login as non-superuser → navigate to `/admin` → expect 403 card, no tab bar |
| Tab navigation | Login as superuser → click each of 8 tabs → URL updates → panel heading visible |
| Operations tab | Open operations tab → service cards visible → REFRESH button clickable |
| Users tab | Open users tab → table rows visible → click row → edit drawer opens → close |
| Tenants tab | Open tenants tab → table visible → click CREATE → modal opens → cancel |
| Config tab | Open config tab → feature flags section visible → toggle → SAVE → diff modal appears |
| API Keys tab | Open API keys tab → CREATE KEY → modal → enter name → submit → token shown |
| Metrics tab | Open metrics tab → KPI cards visible → period selector → 7d button active |

---

## 9. Deletion Plan

Remove after new `/admin` hub is live and tested:
- `frontend/src/app/admin-monitor/page.tsx` (and directory)
- `frontend/src/app/devops/page.tsx` (and directory)

Sidebar redirects updated before deletion to avoid broken nav links.

---

## 10. Out of Scope (v1)

- Permission toggles per role (display-only; modifying RBAC requires ADR)
- Bulk user import (CSV)
- Tenant analytics deep-dive per company
- Webhook event management
- Config persistence to Redis/DB (remains in-memory singleton)
