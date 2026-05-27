/**
 * dashboardFetch path guard tests.
 *
 * Locks in the structural defense added after the cross-origin SPA arc:
 * `API_BASE` already ends in "/api" in production, so callers must pass
 * paths starting at "/v1/...", not "/api/v1/...". The guard rejects the
 * doubled-prefix shape so the bug class cannot recur silently.
 */

describe("dashboardFetch path guard", () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  afterEach(() => {
    // Cast: jest sometimes treats NODE_ENV as readonly under the @types build.
    (process.env as Record<string, string | undefined>).NODE_ENV = ORIGINAL_ENV;
    jest.resetModules();
  });

  it("throws in development when path starts with /api/", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    jest.resetModules();
    // Mock the API_BASE to avoid touching real env.
    jest.doMock("@/lib/api/apiBase", () => ({ API_BASE: "http://localhost:8000/api" }));
    const { dashboardFetch } = await import("@/lib/api/dashboardClient");

    await expect(
      dashboardFetch("/api/v1/intelligence/settings", "tok"),
    ).rejects.toThrow(/must not start with "\/api\/"/);
  });

  it("accepts paths starting with /v1/", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    jest.resetModules();
    jest.doMock("@/lib/api/apiBase", () => ({ API_BASE: "http://localhost:8000/api" }));

    // Stub global fetch so the request doesn't actually leave the process.
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const { dashboardFetch } = await import("@/lib/api/dashboardClient");
    const res = await dashboardFetch("/v1/intelligence/settings", "tok");
    expect(res.status).toBe(200);

    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toBe("http://localhost:8000/api/v1/intelligence/settings");
  });

  it("logs but does not throw in production", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    jest.resetModules();
    jest.doMock("@/lib/api/apiBase", () => ({ API_BASE: "https://hedgecore.onrender.com/api" }));

    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response("{}", { status: 404 }));
    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { dashboardFetch } = await import("@/lib/api/dashboardClient");

    // Should NOT throw in production — the request still goes out, but the
    // misuse is logged so it shows up in browser consoles / monitoring.
    const res = await dashboardFetch("/api/v1/intelligence/settings", "tok");
    expect(res.status).toBe(404);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringMatching(/must not start with "\/api\/"/),
    );

    errSpy.mockRestore();
  });
});
