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
