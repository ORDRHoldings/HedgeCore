# Onboarding Guide — New Developer / Operator

**Last updated:** 2026-03-27

Welcome to ORDR Terminal. This guide gets you from zero to a running local environment.

---

## Prerequisites

Install these before starting:

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.12 | pyenv or python.org |
| Node.js | 20 LTS | nvm or nodejs.org |
| PostgreSQL | 15+ | postgresql.org |
| Git | Any recent | git-scm.com |
| Docker (optional) | 24+ | docker.com |

**Windows note:** The repo uses bash scripts. Use Git Bash or WSL2. PowerShell is used
for Render deployment scripts (`scripts/render/*.ps1`).

---

## Repository Structure

```
TreasuryFX/
├── backend/          # Python 3.12 FastAPI API server
│   ├── app/          # Application code
│   │   ├── api/      # Route handlers
│   │   ├── engine/   # Orchestration layer (14 modules)
│   │   ├── engine_v1/ # FROZEN deterministic kernel (35 modules) ⚠️
│   │   ├── models/   # SQLAlchemy ORM models
│   │   └── core/     # Auth, config, dependencies
│   ├── migrations/   # Alembic database migrations
│   └── tests/        # ~2700 test cases
├── frontend/         # Next.js 15 TypeScript app
│   └── src/
│       ├── app/      # App Router pages
│       ├── components/ # React components
│       └── lib/      # Utilities, API client, auth
├── docs/
│   ├── architecture/ # Architecture freeze docs, ADRs ← READ THIS FIRST
│   └── ops/          # Operational runbooks ← YOU ARE HERE
├── infra/            # Docker, Nginx, K8s, Terraform (future)
├── scripts/          # Utility scripts
└── .claude/          # Claude Code operating framework
    └── rules/        # Coding rules (read before making changes)
```

---

## Local Development Setup

### 1. Clone and configure

```bash
git clone <repo-url>
cd TreasuryFX
cp backend/.env.example backend/.env
# Edit backend/.env — set DATABASE_URL, JWT_SECRET
```

**Minimum required env vars in `backend/.env`:**
```
DATABASE_URL=postgresql+asyncpg://hedgecalc:hedgecalc@localhost/hedgecalc
JWT_SECRET=dev-secret-key-at-least-32-characters-long
ENV=development
```

### 2. Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Create local PostgreSQL database
createdb hedgecalc

# Run migrations
alembic upgrade head

# Seed demo data
python seed_company.py

# Start server
uvicorn app.main:app --reload
# API running at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### 3. Frontend setup

```bash
cd frontend
npm ci

# Create local env file
cp .env.example .env.local 2>/dev/null || echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > .env.local

# Start dev server
npm run dev
# App running at http://localhost:3000
```

### 4. Login with demo credentials

- URL: http://localhost:3000
- Username: `demo`
- Password: `demo`

---

## Running Tests

```bash
# Backend tests (fast, uses SQLite in-memory)
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/ -x -q --tb=short

# Expected: ~2700 passing, 0 failed, ~130 skipped (Postgres-only tests)

# Frontend TypeScript check
cd frontend
npx tsc --noEmit

# Frontend build check
npx next build
```

---

## Architecture Rules — READ BEFORE CHANGING CODE

**v1 Architecture Freeze:** Several components are frozen and require an ADR to modify.

Key rules:
1. `engine_v1/` is a frozen deterministic kernel — never add non-deterministic logic
2. `R1-R8` risk taxonomy is immutable — never modify
3. Middleware order: Audit → Rate Limit → Auth — never reorder
4. WORM tables (`audit_events`, `calculation_runs`, `policy_revisions`) are append-only

Read before touching anything:
- `docs/architecture/architecture-freeze.md` — full freeze list
- `.claude/rules/` — domain-specific coding rules (6 files)

---

## Making Changes

Standard workflow:
```bash
# 1. Create feature branch
git checkout -b feat/my-feature

# 2. Make changes
# (follow rules in .claude/rules/ for your domain)

# 3. Run tests
cd backend && pytest tests/ -x -q
cd frontend && npx tsc --noEmit

# 4. Push — CI runs automatically
git push origin feat/my-feature
```

**CI jobs that run on every push:**
- Backend: ruff lint + pytest (must be >= 60% coverage)
- Frontend: tsc + build
- Architecture: freeze check + pre-merge gate + risk gate
- Docker: backend image build + Trivy scan
- Security: gitleaks secret scan

---

## Deployment

All deployments are automatic on push to `master` (production) or `dev` (preview).

| Branch | Backend | Frontend |
|--------|---------|---------|
| `master` | Render auto-deploy (`hedgecore`) | Vercel auto-deploy |
| `dev` | Render auto-deploy (`hedgecore-preview`) | Vercel preview |

Manual deploy: see `docs/ops/render-cli.md`

---

## Key URLs

| Resource | URL |
|----------|-----|
| Production app | https://ordr-terminal.vercel.app |
| Production API | https://hedgecore.onrender.com/api |
| API docs (dev) | http://localhost:8000/docs |
| Render dashboard | https://dashboard.render.com |
| Vercel dashboard | https://vercel.com/dashboard |
| GitHub Actions | https://github.com/<org>/<repo>/actions |

---

## Common Issues

| Problem | Solution |
|---------|---------|
| `ImportError` on startup | Check you're in the right venv and ran `pip install -r requirements.txt` |
| `DATABASE_URL` asyncpg errors | Use `postgresql+asyncpg://` prefix, not `postgresql://` |
| 401 on all requests after JWT change | JWT_SECRET changed — all tokens invalidated, re-login |
| `alembic upgrade head` fails | Check `alembic current` — may need to stamp baseline first (`docs/ops/alembic-runbook.md`) |
| Frontend build fails | Run `npx tsc --noEmit` to find TypeScript errors first |
| Tests fail with `requires_postgres` | Normal — these tests skip on SQLite. Run against real PG for full suite. |
