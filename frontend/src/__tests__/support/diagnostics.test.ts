/**
 * diagnostics.test.ts — DiagnosticsBundle generator unit tests
 *
 * Tests:
 *  - Bundle structure and schema_version
 *  - Redaction: no tokens/passwords in output
 *  - API call ring buffer (max 10, LIFO)
 *  - UI error ring buffer (max 5, LIFO)
 *  - Backend health: ok / error / timeout
 *  - Consent enforcement (TypeScript compile-time only — runtime always true)
 *  - Export as JSON is serialisable
 */

import {
  generateDiagnosticsBundle,
  trackApiCall,
  trackUiError,
  type DiagnosticsBundle,
  type ApiCallMeta,
  type UiErrorMeta,
} from "../../lib/support/diagnostics";

// ── Mock fetch ─────────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeApiMeta(overrides: Partial<ApiCallMeta> = {}): ApiCallMeta {
  return {
    ts: new Date().toISOString(),
    method: "GET",
    path: "/v1/positions",
    status: 200,
    duration_ms: 42,
    ...overrides,
  };
}

function makeUiError(overrides: Partial<UiErrorMeta> = {}): UiErrorMeta {
  return {
    ts: new Date().toISOString(),
    message: "ChunkLoadError: loading chunk 42 failed",
    component: "PositionDesk",
    ...overrides,
  };
}

async function makeBundle(opts: Partial<Parameters<typeof generateDiagnosticsBundle>[0]> = {}): Promise<DiagnosticsBundle> {
  return generateDiagnosticsBundle({
    consent: true,
    tenantId: "tenant-123",
    userId: "user-456",
    roles: ["analyst"],
    branchCode: "NYC",
    platformVersion: "v2.0.0",
    apiBaseUrl: "https://hedgecore.onrender.com/api",
    ...opts,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateDiagnosticsBundle()", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  it("returns schema_version '1.0'", async () => {
    const bundle = await makeBundle();
    expect(bundle.schema_version).toBe("1.0");
  });

  it("sets consent: true", async () => {
    const bundle = await makeBundle();
    expect(bundle.consent).toBe(true);
  });

  it("populates identity fields", async () => {
    const bundle = await makeBundle();
    expect(bundle.tenant_id).toBe("tenant-123");
    expect(bundle.user_id).toBe("user-456");
    expect(bundle.roles).toEqual(["analyst"]);
    expect(bundle.branch_code).toBe("NYC");
  });

  it("records platform_version", async () => {
    const bundle = await makeBundle();
    expect(bundle.platform_version).toBe("v2.0.0");
  });

  it("records backend_url without token", async () => {
    const bundle = await makeBundle({ apiBaseUrl: "https://hedgecore.onrender.com/api" });
    expect(bundle.backend_url).toBe("https://hedgecore.onrender.com/api");
    // Must not contain token-like strings
    expect(bundle.backend_url).not.toContain("Bearer");
    expect(bundle.backend_url).not.toContain("token=");
  });

  it("records generated_at as valid ISO string", async () => {
    const bundle = await makeBundle();
    expect(() => new Date(bundle.generated_at)).not.toThrow();
    expect(new Date(bundle.generated_at).getTime()).toBeGreaterThan(0);
  });

  it("backend_status is 'ok' when fetch resolves with ok:true", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const bundle = await makeBundle();
    expect(bundle.backend_status).toBe("ok");
    expect(bundle.backend_latency_ms).not.toBeNull();
    expect(bundle.backend_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("backend_status is 'error' when fetch resolves with ok:false", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });
    const bundle = await makeBundle();
    expect(bundle.backend_status).toBe("error");
  });

  it("backend_status is 'error' when fetch rejects", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const bundle = await makeBundle();
    expect(bundle.backend_status).toBe("error");
  });

  it("backend_status is 'timeout' on TimeoutError", async () => {
    const timeoutErr = Object.assign(new Error("Timeout"), { name: "TimeoutError" });
    mockFetch.mockRejectedValue(timeoutErr);
    const bundle = await makeBundle();
    expect(bundle.backend_status).toBe("timeout");
    expect(bundle.backend_latency_ms).toBeNull();
  });

  it("handles null tenantId and userId", async () => {
    const bundle = await makeBundle({ tenantId: null, userId: null });
    expect(bundle.tenant_id).toBeNull();
    expect(bundle.user_id).toBeNull();
  });

  it("result is JSON serialisable (no circular refs)", async () => {
    const bundle = await makeBundle();
    expect(() => JSON.stringify(bundle)).not.toThrow();
  });

  it("bundle does not contain any auth token pattern", async () => {
    const bundle = await makeBundle();
    const json = JSON.stringify(bundle);
    expect(json).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{20,}/);
    expect(json).not.toMatch(/HK_live_/);
    expect(json).not.toMatch(/password/i);
    expect(json).not.toMatch(/hashed_password/i);
  });
});

// ── Ring buffer: API calls ─────────────────────────────────────────────────────

describe("trackApiCall() ring buffer", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it("includes tracked API calls in bundle", async () => {
    trackApiCall(makeApiMeta({ path: "/v1/positions", method: "GET" }));
    const bundle = await makeBundle();
    const paths = bundle.recent_api_calls.map((c) => c.path);
    expect(paths).toContain("/v1/positions");
  });

  it("caps ring buffer at 10 entries", async () => {
    for (let i = 0; i < 15; i++) {
      trackApiCall(makeApiMeta({ path: `/v1/route-${i}` }));
    }
    const bundle = await makeBundle();
    expect(bundle.recent_api_calls.length).toBeLessThanOrEqual(10);
  });

  it("API call entries have required fields", async () => {
    trackApiCall(makeApiMeta({ path: "/v1/dashboard/summary", method: "GET", status: 200, duration_ms: 88 }));
    const bundle = await makeBundle();
    const call = bundle.recent_api_calls[0];
    expect(call.path).toBe("/v1/dashboard/summary");
    expect(call.method).toBe("GET");
    expect(call.status).toBe(200);
    expect(call.duration_ms).toBe(88);
  });

  it("most recent API call is at index 0 (LIFO order)", async () => {
    trackApiCall(makeApiMeta({ path: "/v1/first" }));
    trackApiCall(makeApiMeta({ path: "/v1/second" }));
    trackApiCall(makeApiMeta({ path: "/v1/last" }));
    const bundle = await makeBundle();
    expect(bundle.recent_api_calls[0].path).toBe("/v1/last");
  });
});

// ── Ring buffer: UI errors ─────────────────────────────────────────────────────

describe("trackUiError() ring buffer", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it("includes tracked UI errors in bundle", async () => {
    trackUiError(makeUiError({ message: "ResizeObserver loop limit exceeded" }));
    const bundle = await makeBundle();
    const msgs = bundle.recent_errors.map((e) => e.message);
    expect(msgs).toContain("ResizeObserver loop limit exceeded");
  });

  it("caps UI error buffer at 5 entries", async () => {
    for (let i = 0; i < 8; i++) {
      trackUiError(makeUiError({ message: `Error ${i}` }));
    }
    const bundle = await makeBundle();
    expect(bundle.recent_errors.length).toBeLessThanOrEqual(5);
  });

  it("UI error entries have message and ts", async () => {
    trackUiError(makeUiError({ message: "Cannot read properties of null", component: "SandboxWidget" }));
    const bundle = await makeBundle();
    const err = bundle.recent_errors[0];
    expect(err.message).toBe("Cannot read properties of null");
    expect(err.component).toBe("SandboxWidget");
    expect(err.ts).toBeTruthy();
  });

  it("most recent error is at index 0 (LIFO)", async () => {
    trackUiError(makeUiError({ message: "first" }));
    trackUiError(makeUiError({ message: "last" }));
    const bundle = await makeBundle();
    expect(bundle.recent_errors[0].message).toBe("last");
  });
});
