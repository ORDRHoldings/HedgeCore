# Load Testing Baseline & SLO Targets

**Owner:** Platform / SRE
**Last reviewed:** 2026-04-23

This document defines the production performance SLOs the ORDR Terminal API
must meet and the k6 scripts used to measure compliance. It complements
`tests/k6/README.md` (script mechanics) and `docs/ops/sla-slo.md` (public
availability SLAs).

## 1. Production SLO Targets

All targets apply to authenticated API traffic hitting the Render backend
(`/api/v1/*`) under steady-state load.

| SLI | Target | Page threshold | Rationale |
|-----|--------|----------------|-----------|
| HTTP success rate | > 99.5 % 30d | < 99.0 % 1h | User-visible correctness |
| Latency — p(50) | < 150 ms | > 250 ms 5m | Median feel, dashboard snappy |
| Latency — p(95) | < 500 ms | > 1000 ms 5m | Tail users still OK |
| Latency — p(99) | < 1500 ms | > 3000 ms 5m | Worst-case acceptable |
| Error rate (5xx) | < 0.5 % | > 1 % 5m | Backend health |
| Rate-limit rejects (429) | < 2 % | > 5 % 10m | Client saturation signal |

The k6 scripts enforce the p(95) < 500 ms and error rate < 1 % thresholds
at CI-run time.

## 2. Capacity Planning Assumptions

- **Single backend instance (Render Standard-2x):** sustains ~50 RPS steady
  with p(95) < 500 ms for the tested endpoint mix.
- **Scale horizontally** past 75 RPS sustained or when p(95) > 400 ms for
  10 consecutive minutes. Render auto-scaling trigger: 70 % CPU or 80 %
  memory for 5 minutes.
- **Database (Render PostgreSQL Standard-4GB):** tuned pool_size=20,
  max_overflow=10 (see `backend/app/core/db.py`). Connection exhaustion is
  the first bottleneck to appear; monitor `pg_stat_activity`.
- **Redis (market data cache, fail-open):** cache miss storms on cold start
  add ~200 ms to p(95). Pre-warm with a smoke run after deploy.

## 3. Running the Baseline

### Pre-deploy (against staging)

```bash
BASE_URL=https://hedgecore-preview.onrender.com API_KEY=<staging-key> \
  k6 run tests/k6/load-test.js
```

Accept thresholds must pass before promoting a preview build to master.

### Post-deploy smoke (against production)

```bash
BASE_URL=https://api.ordr.fx API_KEY=<prod-synthetic-key> \
  k6 run tests/k6/smoke-test.js
```

Runs in < 1 minute, touches only `/api/health` plus 4 read endpoints. Safe
to run hourly from a monitoring cron.

### Stress — manual only, staging

```bash
BASE_URL=https://hedgecore-preview.onrender.com API_KEY=<staging-key> \
  k6 run tests/k6/stress-test.js
```

Ramps to 200 VUs over 18 minutes. Never run against production — will
trip rate limits for real customer traffic.

## 4. Baseline Numbers (to be filled from first staging run)

| Test | VUs | Duration | p(50) | p(95) | p(99) | Error rate | Date | Build SHA |
|------|-----|----------|-------|-------|-------|------------|------|-----------|
| Smoke | 1 | 30 s | — | — | — | — | — | — |
| Load  | 50 | 5 min | — | — | — | — | — | — |
| Stress | 200 | 18 min | — | — | — | — | — | — |

Record each run in this table — never overwrite; append dated rows so we
see regression trends over time.

## 5. What To Do When Thresholds Fail

1. **Before rollback:** check Sentry for spike in exceptions, then check
   Render dashboard for DB connection saturation or CPU pegged.
2. **Confirm the regression is our code** — re-run against the previous
   known-good commit on preview. If baseline drifts without a deploy,
   investigate infra (Render, PG, Redis) not code.
3. **If code is the cause:** roll back via Render dashboard → Deploy →
   previous commit. Open incident per `docs/ops/incident-postmortem-template.md`.
4. **If infra is the cause:** page infra oncall, leave deploy in place
   (rollback won't help).

## 6. CI Integration

The k6 smoke script runs on every push to `master` in GitHub Actions once
CI-synthetic credentials are provisioned (tracked as follow-up task, see
`.claude/state/CURRENT_STATE.md` Open Risks). Until then, load testing is
manual pre-release.
