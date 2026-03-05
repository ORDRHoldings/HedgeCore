# Backend API

## Purpose
Serve the HedgeCalc HTTP API, apply security and audit middleware, and
coordinate calls into the engine and services layers.

## Responsibilities
- Route registration and OpenAPI docs
- AuthN/AuthZ enforcement and API-key validation
- Request validation and response shaping
- Audit trail headers and event logging

## Key files
- `backend/app/main.py`
- `backend/app/api/router.py`
- `backend/app/middleware`
- `backend/app/routes`

## Interfaces
- HTTP endpoints under `/api` and `/v1/*`
- OpenAPI docs at `/api/docs` and `/api/redoc`

## Failure modes
- Misordered middleware can bypass audit or rate limits
- Missing auth config blocks all routes or allows unsafe access
