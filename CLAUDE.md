# HedgeCalc FXDemo - CLAUDE.md

## Execution Mode

**AUTONOMOUS EXECUTION**: Once the user approves a plan or gives a task instruction, execute ALL steps without pausing for confirmation. Do NOT ask "Should I proceed?", "Can I continue?", or any mid-task confirmations. Work silently until complete, then report what was accomplished. The only exception is destructive operations on production data (database drops, force pushes).

**NO VERBOSE OUTPUT**: Skip explanatory commentary during execution. No "Let me now...", "Next I'll...". Just do the work. Output only the final summary.

**PARALLEL EXECUTION**: Always launch independent tasks in parallel using the Task tool. Never serialize work that can be parallelized.

## Project Identity

- **Product**: ORDR Terminal - Institutional FX hedge calculation & governance platform
- **Domain**: Treasury/risk management for corporate FX exposure hedging
- **Stage**: v1 (architecture-frozen, no ML/auto-learning/broker execution)

## Architecture

### Monorepo Structure
```
backend/          Python 3.12, FastAPI, SQLAlchemy async, PostgreSQL
frontend/         Next.js 15.5 (App Router), TypeScript 5.9, React 19
```

### Deployment
- **Backend**: Render.com (hedgecore service, master branch)
- **Frontend**: Vercel (hedgecore.vercel.app / ordr-terminal.vercel.app)
- **Database**: Render PostgreSQL (hedge_user@dpg-d6abjuq48b3s73bqss00-a.oregon-postgres.render.com/hedge)
- **Preview**: dev branch → hedgecore-preview + hedgecore-preview-db

### Key Tech
- **Auth**: JWT HS256 (30min access + 7d refresh), API Keys (HK_live_ prefix), bcrypt passwords
- **RBAC**: 9 roles, 41 permissions, hierarchy_level 0-15
- **State**: Redux Toolkit + React Context (auth)
- **Charts**: ECharts 6, Recharts 2
- **Grid**: react-grid-layout (12-col responsive)
- **Styling**: Tailwind CSS 4 + CSS variables (inline styles pattern, NOT className-heavy)
- **Icons**: lucide-react
- **API Client**: `dashboardFetch()` from `@/lib/api/dashboardClient`

## Immutable Rules

1. **Architecture freeze**: No ML, auto-learning, broker execution, stateful logic in v1
2. **R1-R8 Risk Taxonomy**: Never modify
3. **Strategy → Instrument mapping**: Never modify
4. **Middleware order**: Audit → Rate Limit → Auth
5. **WORM tables**: audit_events, calculation_runs, policy_revisions are append-only
6. **Hash chain**: SHA-256, per-tenant, GENESIS_HASH = 0000...0000

## Database Schema (31 tables)

### Core Entities
- `companies` → `branches` → `departments` (multi-tenant hierarchy)
- `users` (UUID PK, email login, bcrypt hash, company/branch/department FKs)
- `roles` → `permissions` → `role_permissions` → `user_roles`

### Business Data
- `positions` (FX exposures, lifecycle: NEW → POLICY_ASSIGNED → READY_TO_EXECUTE → HEDGED/REJECTED)
- `policy_templates` → `policy_instances` → `policy_revisions`
- `proposals` → `staging_artifacts` → `approvals` → `ledger_entries`
- `execution_proposals` (4-eyes approval: maker/checker with SoD)
- `calculation_runs` (engine output, WORM)

### Current State (Production)
- Company: DemoCompany (id: 11111111-1111-1111-1111-111111111111)
- Login: demo/demo (admin, is_superuser=true)
- All business tables: EMPTY (blank slate)

## Frontend Patterns

### Widget Component Pattern
```tsx
// Every widget follows this exact pattern:
interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

// Style constants using CSS variables:
const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  // ... etc
} as const;

// Widget header MUST include className="widget-drag-handle"
// Widget header has: icon, title (uppercase mono), scope badge, flex spacer, close button
```

### Dashboard System
- 13 widgets registered in `frontend/src/lib/widgets/widgetRegistry.ts`
- Layout saved per-user: `localStorage.dashboard_layout_${userId}`
- Role-based default layouts for 11 roles
- Widget catalog for add/remove

### Import Patterns
```tsx
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { useAuth } from "@/lib/authContext";
import type { UserContext } from "@/lib/authContext";
import EmptyState from "@/components/ui/EmptyState";
import { SomeIcon } from "lucide-react";
```

### Design Tokens (from globals.css)
- Backgrounds: `--bg-deep` (lightest), `--bg-panel` (white), `--bg-sub` (gray)
- Borders: `--border-rim` (primary), `--border-soft` (lighter)
- Text: `--text-primary`, `--text-secondary`, `--text-tertiary`
- Accents: `--accent-cyan` (primary blue), `--accent-amber` (warning), `--accent-red`, `--status-pass` (green)
- Fonts: IBM Plex Sans (UI), IBM Plex Mono (data/labels), Manrope (headings), JetBrains Mono (code)
- Min font: 12px institutional minimum

## Backend Patterns

### Route Pattern
```python
@router.get("/endpoint", response_model=ResponseSchema)
async def endpoint(
    request: Request,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # RBAC check
    # Business logic
    # Return response
```

### Key API Endpoints for Dashboard
- `GET /v1/dashboard/summary` - KPIs (exposure, coverage, proposals, alerts)
- `GET /v1/dashboard/recent-runs` - Last 10 proposals
- `GET /v1/dashboard/pending-approvals` - Staging queue
- `GET /v1/dashboard/team-activity` - Audit feed
- `GET /v1/positions/exposure` - Currency exposure aggregation
- `GET /v1/policies/active` - Current policy instance
- `GET /v1/runs` - Calculation history

## Build & Deploy

```bash
# Frontend build
cd frontend && npx next build

# Backend (local)
cd backend && python -m uvicorn app.main:app --reload

# Database scripts (from backend/)
DATABASE_URL="postgresql+asyncpg://..." python seed_company.py
DATABASE_URL="postgresql+asyncpg://..." python reset_blank_state.py

# psql access
"C:\Program Files\PostgreSQL\17\bin\psql.exe" "postgresql://hedge_user:...@dpg-...render.com/hedge"
```

## File Locations Quick Reference

| What | Path |
|------|------|
| Dashboard page | `frontend/src/app/dashboard/page.tsx` |
| Widget registry | `frontend/src/lib/widgets/widgetRegistry.ts` |
| Widget components | `frontend/src/components/dashboard/widgets/` |
| API client | `frontend/src/lib/api/dashboardClient.ts` |
| Auth context | `frontend/src/lib/authContext.tsx` |
| Redux store | `frontend/src/lib/store/index.ts` |
| Design tokens | `frontend/src/app/globals.css` |
| Backend routes | `backend/app/api/routes/` |
| SQLAlchemy models | `backend/app/models/` |
| Security/auth | `backend/app/core/security.py` |
| Config | `backend/app/core/config.py` |
| Seed script | `backend/seed_company.py` |
| Reset script | `backend/reset_blank_state.py` |
