# ADR 0001: FastAPI ASGI API

Status: accepted
Date: 2026-03-04

## Context
HedgeCalc requires a structured HTTP API with OpenAPI docs, async support,
and predictable middleware ordering for security and audit controls.

## Decision
Use FastAPI (ASGI) as the primary API framework with a single app entry
point in `backend/app/main.py` and feature routers registered through
`backend/app/api/router.py`.

## Consequences
- OpenAPI / Swagger / ReDoc are available for integration partners.
- Async endpoints and background tasks are supported.
- Middleware ordering can be controlled centrally.

## References
- `ARCHITECTURE_FREEZE.md`
- `backend/app/main.py`
- `backend/app/api/router.py`
