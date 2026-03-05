# API authentication and access

## Actors
- UI client
- Integration partner
- Admin operator

## Steps
1. Client authenticates via `/auth/*` endpoints.
2. API key or JWT is attached to requests.
3. Middleware enforces API key validation, rate limits, and audit headers.
4. Routes enforce RBAC permissions where required.

## Key endpoints
- `/auth/*`
- `/admin/api-keys`
- `/v1/admin/roles`

## Notes
- Middleware order is critical for audit and rate limiting.
