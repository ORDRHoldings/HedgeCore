# Infra and deployment

## Purpose
Package and run the system locally and in hosted environments.

## Responsibilities
- Docker images and compose configs
- Nginx config for routing and static assets
- Runtime configuration and environment management

## Key files
- `docker-compose.yml`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `infra/`
- `render.yaml`, `vercel.json`, `railway.json`

## Interfaces
- Containerized services (API, frontend, database)
- Reverse proxy entry points

## Failure modes
- Env var drift between environments
- Misconfigured proxy headers breaking auth
