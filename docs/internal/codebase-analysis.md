# Codebase analysis: HedgeCalc FXDemo

## Phase 1: Discovery and architecture

### Structure overview
- backend/: FastAPI API, engine_v1, services, models, middleware
- frontend/: Next.js 15 app with app router, API clients, UI components
- infra/: nginx, docker, k8s, terraform
- docs/: manuals, QA stories, whitepapers, ADRs

### Tech stack
- Backend: FastAPI, Pydantic, SQLAlchemy, Alembic, Celery, Redis, Postgres
- Frontend: Next.js (React 19), Redux Toolkit, React Query, Tailwind
- Infra: Docker Compose, Nginx reverse proxy

### High-level architecture
- Nginx routes to API and frontend containers
- API exposes /api and /v1 endpoints with middleware ordering for audit
- Engine executes deterministic hedge logic and returns trace bundles
- Pipeline governs SANDBOX -> STAGING -> LEDGER transitions
## Phase 2: Component analysis

### Backend API
- Entry: `backend/app/main.py` configures middleware, lifespan, and routers
- Routes: `backend/app/api/router.py` aggregates feature routers
- Security: API key + JWT, RBAC checks in pipeline routes
- Config: `backend/app/core/config.py` handles secrets and env settings

### Hedge engine
- Orchestrator: `backend/app/engine/orchestrator.py` is a strict entrypoint
- Determinism: canonical JSON hashing and stable fingerprints
- Engine v1: `backend/app/engine_v1` contains analytics and risk modules

### Governance pipeline
- API: `backend/app/api/routes/v1_pipeline.py` defines sandbox and lifecycle
- Service: `backend/app/services/pipeline_service.py` manages transitions
- Data: proposals, staging, and ledger entries persisted in Postgres

### Frontend
- App router: `frontend/src/app` provides page-level routes and layouts
- API clients: `frontend/src/api` handles base URL, auth headers, exports
- State: Redux + React Query, shared context in `frontend/src/lib`
## Phase 3: Documentation and recommendations

### Documentation gaps
- A single root README is missing; add a project overview and setup guide
- API contracts: publish OpenAPI examples for key endpoints
- Frontend-backend contract: document base URL and API key handling

### Recommendations
- Add a top-level `README.md` with run commands and env variable checklist
- Add API examples for /v1/calculate and /v1/pipeline lifecycle
- Create a short "runbook" for sandbox vs staging vs ledger usage
- Expand component docs with environment variables and service dependencies

### Known risks
- Middleware order regressions could weaken audit/rate limits
- Contract drift between frontend API clients and backend routes
