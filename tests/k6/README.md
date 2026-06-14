# ORDR Treasury API — k6 Load Tests

This directory contains [k6](https://k6.io/) load, smoke, and stress test scripts for the ORDR Treasury FastAPI backend.

## Directory Structure

| File | Description |
|------|-------------|
| `smoke-test.js` | Quick validation run (1 VU, 30 s) |
| `load-test.js` | Standard load test (50 VUs, 5 min ramp + steady + ramp-down) |
| `stress-test.js` | Stress test (ramps up to 200 VUs over ~18 min) |

## Configuration

All scripts read two environment variables:

- `BASE_URL` — The backend URL. Default: `http://localhost:8000`
- `API_KEY` — A valid `X-API-Key` for authenticated endpoints. If omitted, only `/health` is tested.

```bash
export BASE_URL=http://localhost:8000
export API_KEY=your-test-api-key
```

> **Note:** The API routes are prefixed with `/api`. The scripts automatically prepend this (e.g. `/api/health`).

## Thresholds

Every script enforces the following pass/fail criteria:

- **p(95) response time** < 500 ms
- **Error rate** < 1 %
- **HTTP 200 rate** > 99 %

## Usage

### Prerequisites

Install k6: https://k6.io/docs/get-started/installation/

### Run Smoke Test (health only)

```bash
k6 run tests/k6/smoke-test.js
```

### Run Smoke Test with authenticated endpoints

```bash
API_KEY=your-test-key k6 run tests/k6/smoke-test.js
```

### Run Load Test

```bash
API_KEY=your-test-key k6 run tests/k6/load-test.js
```

### Run Stress Test

```bash
API_KEY=your-test-key k6 run tests/k6/stress-test.js
```

### Run Against a Custom URL

```bash
BASE_URL=http://staging.example.com API_KEY=your-key k6 run tests/k6/load-test.js
```

## Endpoints Tested

- `GET /api/health` (no API key required)
- `POST /api/v1/auth/login` (requires `X-API-Key` header)
- `GET /api/v1/calculate` (requires `X-API-Key` header)
- `GET /api/v1/portfolio` (requires `X-API-Key` header)
- `GET /api/v1/market/fx/rates` (requires `X-API-Key` header)
- `GET /api/v1/hedge-effectiveness/datasets` (requires `X-API-Key` header)

## Baseline Results

> To be filled after running against staging/production.

| Test | VUs | Duration | p(95) Latency | Error Rate | Date |
|------|-----|----------|---------------|------------|------|
| Smoke | 1 | 30 s | — | — | — |
| Load | 50 | 5 min | — | — | — |
| Stress | 200 | 18 min | — | — | — |
