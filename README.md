# ORDR Terminal

**Institutional FX hedge calculation and governance platform.**

> Deterministic, audit-safe hedge calculations with 4-eyes approval workflow, WORM audit trail, and role-based access control.

---

## Architecture

```
backend/    Python 3.12 · FastAPI · SQLAlchemy async · PostgreSQL
frontend/   Next.js 15.5 (App Router) · TypeScript 5.9 · React 19
```

**Deployment**

| Service | Provider | URL |
|---------|----------|-----|
| Backend API | Render.com | `hedgecore.onrender.com` |
| Frontend | Vercel | `hedgecore.vercel.app` |
| Database | Render PostgreSQL | `dpg-d6abjuq48b3s73bqss00-a` |

---

## Quick Start (Local Dev)

### Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL 15+ (or use `ALLOW_SQLITE_DEMO=true`)

### Backend
```bash
cd backend
pip install -r requirements.txt
export DATABASE_URL="postgresql+asyncpg://..."
export JWT_SECRET="<32+ char secret>"
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm ci
# Create frontend/.env.local:
#   NEXT_PUBLIC_API_URL=http://localhost:8000/api
npm run dev
```

### Database Setup
```bash
cd backend
python seed_company.py   # creates DemoCo + demo/demo user
```

---

## Key Concepts

### Position Lifecycle
```
NEW → POLICY_ASSIGNED → READY_TO_EXECUTE → HEDGED | REJECTED
```

### Tri-State Pipeline
```
SANDBOX (calculation_runs) → STAGING (staging_artifacts) → LEDGER (ledger_entries)
```

### 4-Eyes SoD
Execution proposals require maker + separate checker approval. The same user cannot approve their own proposals.

### Audit Trail
SHA-256 hash-chained `audit_events` table — append-only (WORM), per-tenant, tamper-evident.

---

## API Endpoints (Key)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | Get JWT access + refresh tokens |
| GET | `/api/v1/auth/me` | Current user + roles + permissions |
| GET | `/api/v1/dashboard/aggregate` | KPIs + recent runs + pending approvals |
| GET | `/api/v1/positions` | List positions |
| POST | `/api/v1/runs` | Run hedge calculation |
| GET | `/api/v1/runs/{id}` | Get calculation result |

Full Swagger: `http://localhost:8000/docs`

---

## Development

### Tests
```bash
# Backend
cd backend && pytest --cov=app --cov-report=term-missing

# Frontend (TypeScript)
cd frontend && npx tsc --noEmit
```

### Linting
```bash
# Backend
cd backend && ruff check app/ && mypy app/

# Frontend
cd frontend && npx tsc --noEmit
```

### Bundle Analysis
```bash
cd frontend && ANALYZE=true npx next build
```

---

## Security

- JWT HS256 (30 min access / 7 day refresh)
- CSRF double-submit cookie on all mutations
- bcrypt password hashing
- RBAC: 9 roles, 41 permissions, hierarchy_level 0–15
- API keys: `HK_live_` prefix, HMAC-SHA256 hashed in DB
- WORM tables: `audit_events`, `calculation_runs`, `policy_revisions`, `ledger_entries`

See `docs/ops/runbook.md` for operational procedures.

---

## Deployment

### Render (backend)
- Service: `hedgecore` (Web Service, master branch)
- Build: `pip install -r backend/requirements.txt`
- Start: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Required env vars: `DATABASE_URL`, `JWT_SECRET`, `ENV=production`

### Vercel (frontend)
- Project: `hedgecore` / `ordr-terminal`
- Framework: Next.js
- Required env vars: `NEXT_PUBLIC_API_URL`, `FINNHUB_API_KEY`, `ANTHROPIC_API_KEY`

### Docker
```bash
docker build -t ordr-backend:latest .
docker-compose -f docker-compose.prod.yml up -d
```
