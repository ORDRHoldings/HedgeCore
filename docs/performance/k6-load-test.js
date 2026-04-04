/**
 * ORDR Terminal — Institutional Load Test Baseline
 * Tool: k6 (https://k6.io)
 * Date: 2026-03-29
 *
 * Scenario:
 *   - 100 concurrent virtual users
 *   - 30-second ramp-up, 5-minute sustained, 30-second ramp-down
 *   - Each VU exercises: auth → list positions → POST /v1/calculate
 *
 * Targets (Sprint 5 spec):
 *   - /v1/calculate  p50 < 200ms
 *   - /v1/calculate  p95 < 500ms
 *   - /v1/calculate  p99 < 1000ms
 *   - Error rate     < 1%
 *
 * Usage:
 *   k6 run docs/performance/k6-load-test.js \
 *     -e BASE_URL=https://hedgecore.onrender.com \
 *     -e TEST_USER_EMAIL=loadtest@ordr.io \
 *     -e TEST_USER_PASSWORD=<password>
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

const calculateLatency = new Trend("calculate_latency", true);
const calculateErrors = new Rate("calculate_error_rate");
const calculateRequests = new Counter("calculate_total_requests");

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const TEST_USER_EMAIL = __ENV.TEST_USER_EMAIL || "demo";
const TEST_USER_PASSWORD = __ENV.TEST_USER_PASSWORD || "demo";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "30s", target: 100 },
    { duration: "5m",  target: 100 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    "calculate_latency{scenario:default}": [
      "p(50)<200",
      "p(95)<500",
      "p(99)<1000",
    ],
    "calculate_error_rate": ["rate<0.01"],
    "http_req_failed": ["rate<0.01"],
  },
};

function login() {
  // OAuth2PasswordRequestForm — form-encoded, field is "username" (maps to email)
  const payload = {
    username: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  };
  const res = http.post(`${BASE_URL}/api/auth/login`, payload);
  check(res, {
    "login 200": (r) => r.status === 200,
    "login has token": (r) => {
      try { return !!JSON.parse(r.body).access_token; }
      catch { return false; }
    },
  });
  if (res.status !== 200) return null;
  return JSON.parse(res.body).access_token;
}

function calcPayload() {
  // Forward point keys must be YYYY-MM (ISO calendar month) per V-013.
  // value_date ~3 months ahead of the fixed test date 2026-04-03.
  return JSON.stringify({
    trades: [
      {
        record_id: `LOAD-${__VU}-${__ITER}`,
        entity: "Synex Capital Partners",
        type: "AR",
        currency: "EUR",
        amount: 1000000,
        value_date: "2026-07-03",
        status: "CONFIRMED",
        description: "k6 load test trade",
      },
    ],
    hedges: [],
    market: {
      as_of: "2026-04-03T00:00:00Z",
      spot_rate: 1.08,
      forward_points_by_month: {
        "2026-05": -0.001,
        "2026-06": -0.002,
        "2026-07": -0.003,
      },
      pairs: {
        EURUSD: {
          spot: 1.085,
          forward_points_by_month: {
            "2026-05": -0.001,
            "2026-06": -0.002,
            "2026-07": -0.003,
          },
          bid_ask_spread_bps: 2.0,
        },
      },
    },
    policy: {
      hedge_ratios: { confirmed: 0.8, forecast: 0.5 },
      cost_assumptions: { spread_bps: 5.0 },
      execution_product: "FWD",
      min_trade_size_usd: 10000,
      allow_indicative_proxy: true,
    },
  });
}

export function setup() {
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, { "health ok": (r) => r.status === 200 });

  // Authenticate once in setup() and share the token to all VUs.
  // Re-login per iteration is unrealistic (JWT is 30min) and collapses
  // the rate limiter when all VUs share the same IP + user identity.
  const token = login();
  if (!token) {
    console.error("Setup login failed — aborting load test");
  }
  return { token };
}

export default function ({ token }) {
  if (!token) {
    calculateErrors.add(1);
    sleep(1);
    return;
  }

  const authHeaders = {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  const listRes = http.get(`${BASE_URL}/api/v1/positions?limit=10`, authHeaders);
  check(listRes, { "list positions 200": (r) => r.status === 200 });

  const calcStart = Date.now();
  const calcRes = http.post(
    `${BASE_URL}/api/v1/calculate`,
    calcPayload(),
    authHeaders
  );
  const calcMs = Date.now() - calcStart;

  calculateLatency.add(calcMs);
  calculateRequests.add(1);
  const calcOk = check(calcRes, {
    "calculate 200": (r) => r.status === 200,
    "calculate has hedge_plan": (r) => {
      try { return !!JSON.parse(r.body).hedge_plan; }
      catch { return false; }
    },
  });
  calculateErrors.add(!calcOk ? 1 : 0);

  http.get(`${BASE_URL}/system/health`, authHeaders);
  sleep(1);
}

export function teardown(data) {
  console.log("Load test complete. Check calculate_latency thresholds.");
}
