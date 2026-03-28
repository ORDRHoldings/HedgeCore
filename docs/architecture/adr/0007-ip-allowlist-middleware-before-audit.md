# ADR-0007: IPAllowlistMiddleware Inserted Before Audit in Middleware Chain

## Status
ACCEPTED

## Date
2026-03-28

## Context
The v1 architecture freeze establishes a canonical middleware order: `Audit -> Rate Limit -> Auth`.
Enterprise clients require the ability to restrict API access to known CIDR ranges without code changes.
Blocked IPs must be rejected BEFORE the audit middleware runs so connection attempts from
unauthorized networks do not pollute the immutable audit log.
Inserting IPAllowlistMiddleware before AuditHeadersMiddleware changes the effective middleware
execution order, requiring this ADR.

## Decision
Add `IPAllowlistMiddleware` registered between CORS and Audit in `app/main.py`.
CORS remains outermost (OPTIONS preflight must pass before any app middleware).
IPAllowlist is second-outermost.

CORS preflight (OPTIONS) responses bypass the IP allowlist by design — required for
browser clients to negotiate CORS without being blocked.

Updated canonical order (outermost → innermost):
`CORS -> IPAllowlist -> CSRF -> APIKeyAuth -> RateLimit -> Audit -> Governance -> GZip`

Configuration: `ALLOWED_IPS` env var (comma-separated CIDRs). Empty = open mode.

## Consequences
- Default behaviour unchanged (empty list = open mode).
- When set, ALL non-preflight endpoints protected — include monitoring IPs in allowlist.
- CORS OPTIONS preflight bypasses IP check by design.
- X-Forwarded-For header trusted (required for Render.com proxy).
- Does not affect the frozen `Audit -> Rate Limit -> Auth` relative order.

## References
- `backend/app/middleware/ip_allowlist_middleware.py`
- `backend/app/core/ip_allowlist.py` (reused helpers)
- `docs/architecture/architecture-freeze.md`
- Sprint 1 spec: `docs/superpowers/specs/2026-03-28-enterprise-readiness-design.md` §1.5
