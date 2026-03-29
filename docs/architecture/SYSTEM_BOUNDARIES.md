# System Boundaries

## Component Map
```
[Browser] <--HTTPS--> [Vercel CDN / Next.js SSR]
                            |
                        [HTTPS API]
                            |
                      [Render / FastAPI]
                            |
                     [PostgreSQL (Render)]
```

## Trust Boundaries

### External (untrusted)
- Browser requests (validate all input, enforce CSRF)
- Finnhub API responses (indicative only, not trade-grade)
- CSV/Excel uploads (validate schema, sanitize data)

### Internal (trusted after auth)
- JWT-authenticated API calls (30min expiry)
- API-key-authenticated integrations (HK_live_ prefix)
- Inter-service calls within FastAPI app (same process)

### Immutable (frozen)
- engine_v1/ kernel computations (deterministic, no side effects)
- WORM table writes (append-only, hash-chained)
- Audit event chain (tamper-evident, per-tenant)

## Data Flow Boundaries

### Inbound
- Positions: manual entry, CSV import, API
- Market data: Finnhub (server-side proxy), manual override
- Policies: template selection, parameter override

### Processing
- Calculation: engine_v1/kernel.py (pure function, no DB access)
- Governance: pipeline_service.py (SANDBOX -> STAGING -> LEDGER)
- Approval: execution_proposal_service.py (4-eyes, SoD enforced)

### Outbound
- Reports: PDF, Excel, ZIP, Committee Pack
- Audit: hash-chained event log (queryable, verifiable)
- Dashboard: aggregated KPIs (read-only views)

## Network Boundaries
- Frontend: Vercel edge network (hedgecore.vercel.app)
- Backend: Render Oregon region (hedgecore.onrender.com)
- Database: Render managed PostgreSQL (same region, internal network)
- No VPN, no private networking in v1.

## Rate Limits
- API: 60 req/min per user/IP
- Finnhub: subject to Finnhub plan limits (proxied server-side)
- Database: connection pool (async, bounded by SQLAlchemy config)

## Multi-Instance Topology (Sprint 5 — Horizontal Scaling Prep)

```
[Browser] <--HTTPS--> [Vercel CDN / Next.js SSR]
                            |
                        [HTTPS API]
                            |
            ┌───────────────┴───────────────┐
            │          Render Load Balancer  │
            └──────┬──────────────┬──────────┘
                   │              │
            [FastAPI inst-1] [FastAPI inst-2]   (N instances, stateless)
                   │              │
            └──────┴──────────────┴──────┘
                            │
                  ┌──────────┴──────────┐
                  │                     │
         [PostgreSQL (Render)]    [Redis (Render)]
```

### Stateless Contract

The FastAPI backend is fully stateless. All shared state lives in:
- **PostgreSQL**: positions, calculations, audit events, sessions, webhooks
- **Redis**: rate-limit token buckets (per-key), market data cache (60s TTL)

The following are NOT stored in process memory between requests:
- JWT validation state (stateless by design — signature check only)
- Rate limit counters (Redis-backed via `RateLimitMiddleware`)
- Market data cache (Redis-backed via `redis_client.py`)
- Session data (JWT tokens; no server-side session store required)

### Sticky Sessions

Sticky sessions are NOT required. Any instance can serve any request.

### Instance Scaling Steps (Render)

1. Render dashboard -> hedgecore service -> Settings -> Instances -> increase count.
2. No code changes required.
3. Verify: make two requests to `/system/health`; both should return `status: ok`.
4. Verify rate limiting: send 61 requests/minute; the 61st should return HTTP 429.

### Connection Pool Ceiling

With N instances, total PostgreSQL connections = N x (pool_size + max_overflow) = N x 30.
Render PostgreSQL Starter ceiling = 97 connections.
Maximum safe instance count = floor(97 / 30) = **3 instances** on Starter plan.
Upgrade to Render PostgreSQL Standard (500 connections) before scaling beyond 3 instances.

### Redis Failure Modes

- Rate limiting: fail-closed (in-process fallback bucket — acceptable for brief Redis outage)
- Market data cache: fail-open (hits provider directly on Redis miss)
- Session tokens: unaffected (JWT signature check, no Redis dependency)
