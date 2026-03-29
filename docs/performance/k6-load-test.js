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
const TEST_USER_EMAIL = __ENV.TEST_USER_EMAIL || "admin@ordr.io";
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
  const payload = JSON.stringify({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, {
    headers: { "Content-Type": "application/json" },
  });
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

function calcPayload(companyId) {
  return JSON.stringify({
    positions: [
      {
        record_id: `LOAD-${__VU}-${__ITER}`,
        currency_pair: "EURUSD",
        notional: 1000000,
        direction: "sell",
        horizon_months: 3,
        company_id: companyId,
      },
    ],
    policy: {
      min_hedge_ratio: 0.7,
      max_hedge_ratio: 1.0,
      instrument: "forward",
      margin_budget: 0,
      risk_weights: { R1: 1.0 },
    },
  });
}

export function setup() {
  const health = http.get(`${BASE_URL}/system/health`);
  check(health, { "health ok": (r) => r.status === 200 });
  return {};
}

export default function () {
  const token = login();
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
    calcPayload(""),
    authHeaders
  );
  const calcMs = Date.now() - calcStart;

  calculateLatency.add(calcMs);
  calculateRequests.add(1);
  const calcOk = check(calcRes, {
    "calculate 200": (r) => r.status === 200,
    "calculate has results": (r) => {
      try { return !!JSON.parse(r.body).results; }
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
