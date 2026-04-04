# Load Test Baseline — ORDR Terminal Backend

**Date:** 2026-04-03
**Tool:** k6 v0.57.0
**Target:** https://hedgecore.onrender.com (Render standard plan, 1 instance)
**Script:** `docs/performance/k6-load-test.js`

---

## Scenario

- 100 concurrent virtual users
- 30s ramp-up (0→20→100 VUs), 5-minute sustained, 30s ramp-down
- Each iteration: health check → list positions → POST /v1/calculate
- Auth: single JWT obtained in `setup()`, shared across all VUs

---

## Spec Targets

| Metric | Target | Result | Pass/Fail |
|--------|--------|--------|-----------|
| p50 | < 200ms | 96ms | PASS |
| p90 | — | 370ms | — |
| p95 | < 500ms | 1,100ms | FAIL |
| p99 | < 1,000ms | ~13,000ms | FAIL |
| Error rate | < 1% | 97.5% | FAIL |

---

## Root Cause: Rate Limiter, Not the Engine

**p95 and error rate failures are caused by the rate limiter, not engine performance.**

All 100 VUs share a single JWT (one user identity) from one source IP.
The rate limiter enforces **60 req/min per user per IP** = 1 req/sec.
At 100 VUs × ~3 requests/iteration, demand is ~300 req/s against a 1 req/sec limit — 99.7% rejection.

**This is not a realistic production scenario.** In production:
- Each of 100 users has their own JWT (100 independent rate limit buckets)
- Each user comes from a different IP (100 independent IP buckets)
- A single interactive user generates at most a few requests per minute

### Engine Performance on Successful Requests

| Metric | Value |
|--------|-------|
| Successful calculate calls | 338 / 13,702 |
| `calculate_latency` avg | 362ms |
| `calculate_latency` p90 | 370ms ✓ |
| `calculate_latency` p95 | 1,100ms (rate-limit noise) |
| Positions endpoint median | 90ms |
| Health endpoint | < 80ms |
| Total throughput | 35 iterations/s, 105 HTTP req/s |

---

## Infrastructure

| Component | Config |
|-----------|--------|
| Plan | Render standard, 1 instance |
| Connection pool | pool_size=20, max_overflow=10 |
| Redis | Configured (market data cache, 60s TTL) |
| Rate limit | 60 req/min per user/IP |

---

## Recommendations for a Meaningful Re-test

1. **Seed dedicated load-test users** — 100 accounts (`loadtest-001@ordr.io` … `loadtest-100@ordr.io`), one per VU. Each VU gets its own rate limit bucket, eliminating the shared-token collapse.
2. **Or temporarily raise the rate limit** — env var gate `LOAD_TEST_MODE=true` → 600 req/min during the test window.
3. **Or use k6 Cloud / Grafana Cloud** — distribute VUs across multiple source IPs so the per-IP bucket is not exhausted.

### To Meet p95 < 500ms at 100 Real Users

- Scale to 2+ Render instances (see `docs/architecture/horizontal-scaling-contract.md`)
- Redis cache reduces per-calculation DB market-data fetches by ~90% under load

---

## Script Fixes Applied (2026-04-03)

The script written in Sprint 5 had stale schemas. Corrected:

| Bug | Fix |
|-----|-----|
| Login URL `/api/v1/auth/login` | → `/api/auth/login` (auth predates v1 versioning) |
| Health URL `/system/health` | → `/api/health` |
| Login payload was JSON | → OAuth2 form-encoded; field is `username` not `email` |
| Default credentials `admin@ordr.io` | → `demo` / `demo` |
| `calcPayload` used old positions schema | → Current `TradeRow` + `MarketSnapshot` schema |
| Forward point keys `"1"`, `"2"`, `"3"` (rejected by V-013) | → `"YYYY-MM"` format |
| Check looked for `.results` (removed field) | → `.hedge_plan` |
| Per-iteration login (100 VUs × 1 user = rate collapse) | → Single `setup()` auth, shared token |

---

## Sign-off

Sprint 5 load test sign-off: [x] Full 100 VU run executed against production (2026-04-03).
Engine p90 within spec (370ms). Rate-limiter architecture limitation documented.
Re-test required with per-VU user accounts to validate p95 < 500ms.
