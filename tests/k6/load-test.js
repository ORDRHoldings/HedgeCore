/**
 * tests/k6/load-test.js
 *
 * Load test — ramp to 50 VUs over 5 minutes.
 * SLO targets: p95 < 500ms, error rate < 1%.
 *
 * Run locally (backend must be up):
 *   k6 run tests/k6/load-test.js
 *
 * Run against staging:
 *   BASE_URL=https://hedgecore.onrender.com k6 run tests/k6/load-test.js
 *
 * Token is obtained once in setup() and shared across all VUs to avoid
 * hammering the login endpoint.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const DEMO_USER = __ENV.DEMO_USER || "demo";
const DEMO_PASS = __ENV.DEMO_PASS || "demo";

const errorRate = new Rate("error_rate");
const positionLatency = new Trend("positions_latency");
const marketLatency = new Trend("market_latency");

export const options = {
  stages: [
    { duration: "1m", target: 10 },
    { duration: "3m", target: 50 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    error_rate: ["rate<0.01"],
    http_req_failed: ["rate<0.01"],
    positions_latency: ["p(95)<500"],
    market_latency: ["p(95)<300"],
  },
};

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    `username=${encodeURIComponent(DEMO_USER)}&password=${encodeURIComponent(DEMO_PASS)}`,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  check(loginRes, {
    "setup: login 200": (r) => r.status === 200,
  });

  if (loginRes.status !== 200) {
    console.error("Login failed in setup:", loginRes.status, loginRes.body);
    return { token: null };
  }

  const token = JSON.parse(loginRes.body).access_token;
  return { token };
}

function bearer(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export default function (data) {
  if (!data.token) return;
  const { token } = data;

  // Health (unauthenticated) — always first
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, { "health 200": (r) => r.status === 200 });
  errorRate.add(health.status !== 200);
  sleep(0.1);

  // Auth me
  const me = http.get(`${BASE_URL}/api/auth/me`, bearer(token));
  check(me, { "auth/me 200": (r) => r.status === 200 });
  errorRate.add(me.status !== 200);
  sleep(0.1);

  // Positions list — primary read path
  const pos = http.get(`${BASE_URL}/api/v1/positions`, bearer(token));
  check(pos, { "positions 200": (r) => r.status === 200 });
  errorRate.add(pos.status !== 200);
  positionLatency.add(pos.timings.duration);
  sleep(0.1);

  // Market data — high-frequency read
  const fx = http.get(`${BASE_URL}/api/v1/market/fx/rates`, bearer(token));
  check(fx, { "fx/rates 200": (r) => r.status === 200 });
  errorRate.add(fx.status !== 200);
  marketLatency.add(fx.timings.duration);
  sleep(0.1);

  // Dashboard summary
  const kpis = http.get(`${BASE_URL}/api/v1/dashboard/summary`, bearer(token));
  check(kpis, { "dashboard/summary 200": (r) => r.status === 200 });
  errorRate.add(kpis.status !== 200);
  sleep(0.1);

  // Policies
  const policies = http.get(`${BASE_URL}/api/v1/policies`, bearer(token));
  check(policies, { "policies 200": (r) => r.status === 200 });
  errorRate.add(policies.status !== 200);
  sleep(0.2);
}
