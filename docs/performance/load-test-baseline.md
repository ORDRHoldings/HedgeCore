# Load Test Baseline — Sprint 5

**Date:** 2026-03-29
**Tool:** k6 v0.52+
**Script:** `docs/performance/k6-load-test.js`
**Target:** `/v1/calculate` endpoint

> **NOTE:** This baseline document was committed during Sprint 5 development. The k6 full-load test
> (100 VUs, 5 minutes) must be run against the Render staging environment before this sprint is
> closed as fully complete. Update the Results table below with actual values from that run.
> The k6 script at `docs/performance/k6-load-test.js` is committed, tested locally (--vus 5 --duration 10s),
> and ready to execute.

## Spec Targets

| Metric   | Target   | Result                                        | Pass/Fail |
|----------|----------|-----------------------------------------------|-----------|
| p50      | < 200ms  | Pending full-load run against staging         | —         |
| p95      | < 500ms  | Pending full-load run against staging         | —         |
| p99      | < 1000ms | Pending full-load run against staging         | —         |
| Error %  | < 1%     | Pending full-load run against staging         | —         |

## Architecture Analysis

The hedge engine (`engine_v1/kernel.py`) is a deterministic pure-function kernel with no I/O.
Expected p50 latency components:
- Network (Render to client): ~20–40ms
- FastAPI routing + auth: ~5–10ms
- Engine compute (1 position): ~1–5ms
- DB write (audit event): ~10–20ms
- Total estimated p50: **40–80ms** — well within 200ms target

At 100 concurrent users:
- Connection pool: pool_size=20, max_overflow=10 -> 30 max connections
- Render Starter: 1 vCPU — engine compute is CPU-bound; may queue under 100 VUs
- Redis cache: reduces market data fetches by ~90% under load

## Test Configuration

- Virtual Users: 100
- Ramp-up: 30s to 100 VUs
- Sustained: 5 minutes at 100 VUs
- Ramp-down: 30s

## Environment

- Backend: Render Starter (1 vCPU, 512 MB RAM)
- Database: Render PostgreSQL Starter (97 connection limit)
- Pool: pool_size=20, max_overflow=10
- Redis: Render Redis (market data cache, 60s TTL)

## Command (Run Against Staging)

```bash
k6 run docs/performance/k6-load-test.js \
  -e BASE_URL=https://hedgecore-preview.onrender.com \
  -e TEST_USER_EMAIL=$LOAD_TEST_USER \
  -e TEST_USER_PASSWORD=$LOAD_TEST_PASS \
  --out json=docs/performance/results/$(date +%Y%m%d)-baseline.json
```

## Raw Results

[Paste k6 summary output here after staging run]

## Bottlenecks Found

[Document any bottlenecks identified and remediation applied]

## Sign-off

Sprint 5 load test sign-off: [ ] All p95 targets met against Render staging environment.
