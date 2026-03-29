# Horizontal Scaling Contract — ORDR Terminal v1

**Date:** 2026-03-29
**Status:** Active
**Scope:** FastAPI backend on Render.com

## Statelessness Guarantees

| Concern              | Storage Location     | Cross-Instance Safe? |
|----------------------|----------------------|----------------------|
| JWT auth             | Stateless signature  | Yes                  |
| Rate limiting        | Redis (Lua atomic)   | Yes (requires Redis) |
| Market data cache    | Redis (60s TTL)      | Yes (requires Redis) |
| DB connections       | SQLAlchemy pool      | Yes (per-instance)   |
| Audit event chain    | PostgreSQL           | Yes (append-only)    |
| Webhook delivery     | Background task      | Yes (idempotent)     |
| WORM tables          | PostgreSQL           | Yes (append-only)    |
| In-memory rate limit | Process memory       | No — fallback only   |

## Instance Ceiling (Render Starter)

```
pool_size=20, max_overflow=10 -> 30 connections per instance
Render PostgreSQL Starter -> 97 connections
Max safe instances = floor(97 / 30) = 3
```

Upgrade path: Render PostgreSQL Standard (500 connections) -> 16 instances max.

## Prerequisites for Safe Horizontal Scale

1. `REDIS_URL` env var set and Redis reachable.
2. `DATABASE_URL` points to Render PostgreSQL (not localhost).
3. `JWT_SECRET` is identical across all instances (shared env group in render.yaml).
4. Pool tuning applied: `pool_size=20, max_overflow=10, pool_timeout=30`.

## Verification Checklist

- [ ] `/system/health` returns `status: ok` from all instances.
- [ ] Rate limit test: 61 requests/min from single client triggers HTTP 429.
- [ ] JWT token issued by instance A is accepted by instance B.
- [ ] Market data cache: two instances show cache hits after first request.
- [ ] Audit event chain: hash chain valid across all instances writing to same PG.

## Anti-Patterns (Do Not Do)

- Do NOT store authentication state in process memory.
- Do NOT use sticky sessions.
- Do NOT store webhook secret in process memory (read from DB per-request).
- Do NOT rely on in-process `_buckets` dict for rate limiting in multi-instance (Redis fallback only).

## Known v1 Limitations

- **Long-running background coroutines:** `dispatch_webhook_event` uses `asyncio.sleep()` for
  retry delays (1m, 5m, 15m, 60m). For the 60min and 240min delays, this holds an async task
  open for extended periods. Under horizontal scaling, if an instance is recycled or restarted
  during a long sleep, that retry attempt is lost silently (no persistence of in-flight retry state).
  Mitigation for v2: migrate long-delay retries to APScheduler with a persistent job store.
  Until then, operators must monitor `webhook_delivery_logs` for `status=failed` rows.
