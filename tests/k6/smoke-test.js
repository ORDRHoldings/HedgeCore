/**
 * tests/k6/smoke-test.js
 *
 * Smoke test — 1 VU, 30s, verifies every major API surface area works.
 *
 * Run locally (backend must be up):
 *   k6 run tests/k6/smoke-test.js
 *
 * Run against staging:
 *   BASE_URL=https://hedgecore.onrender.com k6 run tests/k6/smoke-test.js
 *
 * Uses JWT Bearer auth via demo/demo (always-present seed user).
 * Token is obtained once in setup() and shared across all VUs.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const DEMO_USER = __ENV.DEMO_USER || "demo";
const DEMO_PASS = __ENV.DEMO_PASS || "demo";

const errorRate = new Rate("error_rate");

export const options = {
  vus: 1,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p(95)<2000"],
    error_rate: ["rate<0.05"],
    http_req_failed: ["rate<0.05"],
  },
};

/** Obtain a JWT token in setup() — shared across all VUs (not per-VU). */
export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    `username=${encodeURIComponent(DEMO_USER)}&password=${encodeURIComponent(DEMO_PASS)}`,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const ok = check(loginRes, {
    "login 200": (r) => r.status === 200,
    "has access_token": (r) => {
      try {
        return !!JSON.parse(r.body).access_token;
      } catch {
        return false;
      }
    },
  });

  if (!ok) {
    console.error("Login failed — aborting smoke test. Status:", loginRes.status, loginRes.body);
    return { token: null };
  }

  const token = JSON.parse(loginRes.body).access_token;
  console.log("Login successful — token acquired");
  return { token };
}

function get(token, path) {
  const res = http.get(`${BASE_URL}/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ok = check(res, {
    [`GET ${path} → 200`]: (r) => r.status === 200,
  });
  errorRate.add(!ok);
  return res;
}

export default function (data) {
  if (!data.token) return;
  const { token } = data;

  // ── Unauthenticated ───────────────────────────────────────────────────────
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, { "health 200": (r) => r.status === 200 });
  errorRate.add(health.status !== 200);
  sleep(0.2);

  // ── Auth context ─────────────────────────────────────────────────────────
  get(token, "/auth/me");
  sleep(0.2);

  // ── Core treasury endpoints ───────────────────────────────────────────────
  get(token, "/v1/positions");
  sleep(0.2);

  get(token, "/v1/runs");
  sleep(0.2);

  get(token, "/v1/policies");
  sleep(0.2);

  // ── Market data ───────────────────────────────────────────────────────────
  get(token, "/v1/market/fx/rates");
  sleep(0.2);

  // ── Dashboard ─────────────────────────────────────────────────────────────
  get(token, "/v1/dashboard/summary");
  sleep(0.2);

  // ── Audit trail ───────────────────────────────────────────────────────────
  get(token, "/v1/audit");
  sleep(0.2);

  // ── Saved reports ─────────────────────────────────────────────────────────
  get(token, "/v1/reports/saved");
  sleep(0.2);
}
