# Frontend app

## Purpose
Provide the user interface for policy management, positions, and
hedge analysis.

## Responsibilities
- Auth flows and session handling
- Policy and position dashboards
- Visualization of hedge outputs and audit context

## Key files
- `frontend/src`
- `frontend/public`
- `frontend/vite.config.ts`

## Interfaces
- Calls backend HTTP APIs under `/v1/*`
- Uses OpenAPI docs for development reference

## Failure modes
- Contract drift with backend API breaks UI views
- Missing env config blocks API connectivity
