# Admin Hub — Design Specification
**Date**: 2026-03-15
**Status**: Approved (rev 2 — spec-review fixes applied)
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

**Auth — two-layer gate**:
1. **Client-side**: `useAuth()` checks `user.is_superuser`. If false, render a denial card ("Access restricted to superusers") before making any API calls. This prevents UI flash and unnecessary requests.
2. **Backend**: All `/v1/admin/*` routes use `require_superuser` which returns **404** (not 403) to avoid surface disclosure. The client-side gate should catch this before the API is ever called; if an API call does return 404, treat it as auth failure.

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
      ApiKeysTab.tsx              ← API key create/revoke + usage audit log
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
1. **KPI strip** — 6 cards: Total Users, Active Users, Companies, Calc Runs, Uptime, Memory
2. **Service Status** — 4 cards (Backend API, Database, Redis, Celery) with status dot + uptime + action buttons: `CLEAR CACHE` (service=`cache`), `RESTART SCHEDULER` (service=`scheduler`)
3. **Database Tables** — scrollable table: table name, row count, last insert
4. **Engine Modules** — list of engine_v1 modules with WIRED/UNWIRED status badges
5. **Error Summary (24h)** — table: event type, count, latest timestamp
6. **Live Activity Feed** — last 50 audit events: event badge, actor email, company, hash prefix, timestamp

**Auto-refresh**: 30s polling.
**API endpoints**:
- `GET /v1/admin/monitor/health`
- `GET /v1/admin/monitor/services`
- `GET /v1/admin/monitor/tables`
- `GET /v1/admin/monitor/engine`
- `GET /v1/admin/monitor/errors?hours=24`
- `GET /v1/admin/activity?limit=50`
- `POST /v1/admin/monitor/restart/{service}` (valid services: `cache`, `scheduler`)

---

### Tab 2 — USERS
**URL param**: `?tab=users`
**Purpose**: Cross-tenant user management.

**Layout**: Full-width searchable + filterable table. Right-side edit drawer slides in on row click.

**Table columns**: Email, Full Name, Company, Roles (chips, display-only), MFA, Plan Tier, Status (ACTIVE/INACTIVE badge), Created At.

**Actions**:
- **Search** by email or name (client-side filter on loaded data)
- **Filter** by company, plan tier, active status
- **Edit drawer**: update `full_name`, `job_title`, toggle `is_active`, toggle `is_superuser` → `PATCH /v1/admin/users/{user_id}`
- **Roles**: displayed as read-only chips in the drawer. No role assignment endpoint exists in the admin namespace — role assignment is display-only in v1.
- **REVOKE SESSIONS**: confirmation popover → `POST /v1/admin/users/{user_id}/revoke-sessions`
- **Pagination**: 25 per page with prev/next controls

**API endpoints**:
- `GET /v1/admin/users?page={n}&size=25`
- `PATCH /v1/admin/users/{user_id}`
- `POST /v1/admin/users/{user_id}/revoke-sessions`

---

### Tab 3 — TENANTS
**URL param**: `?tab=tenants`
**Purpose**: Multi-tenant company management.

**Layout**: Sortable table + CREATE button (top-right) + edit drawer on row click.

**Table columns**: Company Name, Slug, Plan Tier (badge), Gov Mode, Users, Positions, Runs, Status, Created At.

**Actions**:
- **CREATE TENANT**: modal → name, slug, domain (optional), plan_tier → `POST /v1/admin/tenants`. On duplicate slug the backend returns **400** ("Slug already in use") — show inline error in modal.
- **Edit drawer**: update name, plan_tier, governance_mode, is_active → `PATCH /v1/admin/tenants/{id}`
- **SUSPEND**: confirmation modal → `POST /v1/admin/tenants/{id}/suspend`
- **Sort** by name, users, runs, created_at

**Plan tier badges**:
- `lite` = gray (var(--text-tertiary))
- `smb` = gray (var(--text-tertiary)) — same as lite
- `professional` = cyan (var(--accent-cyan))
- `enterprise` = amber (var(--accent-amber))

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

**Auth note**: These endpoints (`/v1/admin/roles/*`) use `get_current_user` + `@require_permission("users.assign_roles")`, NOT `require_superuser`. Since the hub shell already gates on `is_superuser`, and superusers have all permissions, this is safe. The test cases must not expect a 403 for authenticated non-superusers who happen to have `users.assign_roles` — instead they should test that users WITHOUT the permission receive 403.

**Layout**: Left rail (role list, 200px) + right pane (permission catalog grouped by module).

**Left rail**: Role name, hierarchy level badge, permission count. Click to load permissions in right pane. CREATE ROLE button at bottom.

**Right pane**: Permission groups (each module = collapsible section). Each permission shows: name, code, description. Permissions within roles are display-only in v1 (no per-role permission toggle — RBAC is architecture-frozen).

**CREATE ROLE modal**: name, description, hierarchy_level (0–15), select permissions from catalog → `POST /v1/admin/roles`

**API endpoints**:
- `GET /v1/admin/roles` (requires `users.assign_roles` permission)
- `GET /v1/admin/roles/permissions` (requires `users.assign_roles` permission)
- `POST /v1/admin/roles` (requires `users.assign_roles` permission)

---

### Tab 5 — API KEYS
**URL param**: `?tab=apikeys`
**Purpose**: Superuser API key management across all tenants + usage audit log.

**Layout**: Top half = active keys table. Bottom half = audit log table (paginated).

**Keys table columns**: Key ID (prefix), Name, Owner, Scopes, Status, Created At, Last Used, Actions (REVOKE).

**CREATE KEY flow**:
1. Click `+ CREATE API KEY`
2. Modal: enter name
3. `POST /api/admin/api-keys` → returns full token in response body
4. Show-once display: token in mono box with COPY button. Warning: "This is the only time this token will be shown."
5. After closing modal, token is gone from state.

**REVOKE**: confirmation popover → `DELETE /api/admin/api-keys/{key_id}` (returns 204 No Content).

**Audit log**: `GET /api/admin/api-key-audit?limit=50` — shows key_id prefix, path, method, status code, timestamp. Filter by key ID client-side. (Note: this endpoint follows the `/api/admin/` prefix pattern matching the other API key routes, not the `/v1/admin/` prefix.)

**API endpoints**:
- `GET /api/admin/api-keys`
- `POST /api/admin/api-keys`
- `DELETE /api/admin/api-keys/{key_id}`
- `GET /api/admin/api-key-audit?limit=50`

---

### Tab 6 — METRICS
**URL param**: `?tab=metrics`
**Purpose**: Platform-wide KPIs, growth, conversion funnel, and activity.

**Sections**:
1. **Period selector**: 7d / 30d / 90d buttons (updates all sections, maps to `days` param)
2. **KPI cards** (8): Total Users, Signups (period), Active Users, Total Companies, SMB, Enterprise, Calc Runs, Audit Runs
3. **Conversion funnel**: horizontal CSS bar chart (`width: ${pct}%`, no external lib). Steps from `/metrics/funnel` response.
4. **Activity feed**: last 50 events from `/v1/admin/activity`

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

**Section 3 — Rate Limits**: 6 editable text inputs (strings like "100/minute"). Save → inline before/after diff → confirm → PATCH. `PATCH /v1/admin/config` with `{ "rate_limits": { ... } }`.

**Section 4 — CORS Origins**: Textarea (one origin per line). Parse into array on save, show diff. `PATCH /v1/admin/config` with `{ "cors_origins": [...] }`.

**Save flow**: Each section has its own `SAVE` button → diff preview (inline, not modal) → confirm → PATCH → success toast.

**Note**: Config is stored in-memory on the backend — changes reset on dyno restart. This is acknowledged in the UI with a small "IN-MEMORY — resets on restart" badge.

**API endpoints**:
- `GET /v1/admin/config`
- `PATCH /v1/admin/config`

---

### Tab 8 — DEVOPS
**URL param**: `?tab=devops`
**Purpose**: Claude Code operating system state (AI memory database). Read-only.

**Single API call strategy**: Use `GET /v1/devops/status` as the primary source — it returns all sections bundled. Supplement with `GET /v1/devops/risks` and `GET /v1/devops/decisions` for detail views only if the status response is insufficient.

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
- `GET /v1/devops/status` (primary — returns all sections)
- `GET /v1/devops/risks` (supplemental — risk detail)
- `GET /v1/devops/decisions` (supplemental — decision detail)

---

## 5. Design System

**Token object** named `S` (matching codebase convention — all other page components use `S`):

```typescript
const S = {
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
- Each tab re-declares `S` locally (same values) — no cross-tab import required

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
| `test_admin_monitor.py` | 10 | health shape, services shape, tables shape, engine shape, errors shape, restart cache (200), restart scheduler (200), restart invalid service (400), non-superuser → 404, unauthenticated → 401 |
| `test_admin_users.py` | 12 | list returns items, list pagination (page/size), PATCH full_name, PATCH is_active, PATCH is_superuser, PATCH invalid field ignored, revoke sessions (200), revoke non-existent user (404), non-superuser → 404, unauthenticated → 401, user not found (404), response schema shape |
| `test_admin_tenants.py` | 12 | list returns items, create valid tenant (201), create duplicate slug (400 — not 409), PATCH name, PATCH plan_tier, PATCH governance_mode, suspend active tenant (200), suspend already-suspended (200), detail endpoint, detail 404, non-superuser → 404, response schema shape. **Note**: uses `@pytest.mark.requires_postgres` on all cases — `_build_tenant_stats()` uses `ANY(:ids)` which is PostgreSQL-only syntax. These tests are skipped on SQLite CI. |
| `test_admin_roles.py` | 9 | list roles (requires users.assign_roles permission), list permissions grouped by module, create role valid, create role missing name (422), user WITHOUT users.assign_roles → 403, user WITH users.assign_roles but NOT superuser → 200 (backend allows it; UI gate is client-side only), unauthenticated → 401, permissions response structure, role response structure |
| `test_admin_config.py` | 10 | GET config shape (all sections present), PATCH feature_flags single flag, PATCH feature_flags all flags, PATCH maintenance_mode true, PATCH maintenance_message, PATCH rate_limits single key, PATCH cors_origins list, PATCH unknown key ignored, non-superuser → 404, config persists within session |
| `test_admin_metrics.py` | 8 | metrics shape (all KPI fields), metrics period param (7/30/90 days), funnel steps present, funnel pct values 0–100, activity feed items, activity feed limit param, non-superuser → 404, unauthenticated → 401 |

**Total**: ~60 test cases.

---

## 8. Frontend E2E Tests

**File**: `frontend/e2e/admin.spec.ts`
**Runner**: Playwright, chromium only
**Auth**: Uses `demo/demo` login where demo user has `is_superuser=True` in the seeded DB. Auth gate test uses a non-superuser fixture account.

| Scenario | Assertions |
|---|---|
| Auth gate | Navigate to `/admin` as non-superuser → denial card visible, no tab bar rendered |
| Tab navigation | Login as superuser → each of 8 tab labels visible in tab bar → click each → URL `?tab=` updates → section heading in page visible |
| Operations tab | Service status cards visible (≥1 card), REFRESH button present and clickable |
| Users tab | Table has ≥1 row, click row → drawer slides in with email field, CLOSE button closes |
| Tenants tab | Table has ≥1 row, CREATE TENANT button → modal opens → cancel button → modal closes |
| Config tab | Feature flags section heading visible, toggle changes visual state, SAVE button → diff section appears |
| API Keys tab | CREATE API KEY button → modal opens → name input → submit → token display appears |
| Metrics tab | KPI card strip renders ≥4 cards, period selector shows 30d active by default |

---

## 9. Deletion Plan

Remove after new `/admin` hub is live and TypeScript-clean:
1. Delete `frontend/src/app/admin-monitor/` directory
2. Delete `frontend/src/app/devops/` directory
3. Sidebar already updated in step 6 above

---

## 10. Out of Scope (v1)

- Per-role permission toggles (display-only; RBAC modification requires ADR)
- Bulk user import (CSV upload)
- Tenant analytics deep-dive per company
- Webhook event management UI
- Config persistence to Redis/DB (in-memory singleton remains)
- Role assignment from admin user drawer (no endpoint exists; display-only)
