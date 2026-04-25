/**
 * Unit tests for the voice-agent tool dispatcher (useRealtimeTools.ts).
 *
 * The hook layer (useRealtimeVoice) requires WebRTC and is difficult to
 * exercise in jsdom; these tests cover the pure dispatch + tool logic
 * directly so the gate's contract is regression-protected.
 */

import {
  executeToolCall,
  isMutatingTool,
  MUTATING_TOOLS,
} from "@/hooks/useRealtimeTools";

// ── Mock the dashboardFetch boundary ──────────────────────────────────────────

jest.mock("@/lib/api/dashboardClient", () => ({
  dashboardFetch: jest.fn(),
}));

import { dashboardFetch } from "@/lib/api/dashboardClient";
const mockFetch = dashboardFetch as jest.MockedFunction<typeof dashboardFetch>;

function _resp(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () =>
      typeof body === "string" ? body : JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ── isMutatingTool / MUTATING_TOOLS ───────────────────────────────────────────

describe("MUTATING_TOOLS gate set", () => {
  it("classifies pin_pair and unpin_pair as mutating", () => {
    expect(isMutatingTool("pin_pair")).toBe(true);
    expect(isMutatingTool("unpin_pair")).toBe(true);
    expect(MUTATING_TOOLS.has("pin_pair")).toBe(true);
    expect(MUTATING_TOOLS.has("unpin_pair")).toBe(true);
  });

  it("classifies read-only tools as non-mutating", () => {
    for (const name of [
      "calculate_hedge",
      "get_spot_rate",
      "list_positions",
      "get_portfolio_summary",
      "list_policies",
      "get_pending_approvals",
      "get_recent_runs",
    ]) {
      expect(isMutatingTool(name)).toBe(false);
    }
  });

  it("treats unknown tools as non-mutating (fail-open for the model, fail-closed for action)", () => {
    expect(isMutatingTool("rm_rf")).toBe(false);
  });
});

// ── executeToolCall dispatch ──────────────────────────────────────────────────

describe("executeToolCall dispatch", () => {
  it("returns an error envelope for unknown tools without calling the API", async () => {
    const result = await executeToolCall("nonexistent_tool", {}, "tok");
    expect(JSON.parse(result)).toEqual({
      error: "Unknown function: nonexistent_tool",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("wraps thrown errors into a JSON error envelope", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    const result = await executeToolCall("get_spot_rate", { pair: "EURUSD" }, "tok");
    const parsed = JSON.parse(result);
    expect(parsed.error).toMatch(/network down/);
  });
});

// ── pin_pair (mutating, find-or-create flow) ─────────────────────────────────

describe("pin_pair", () => {
  it("rejects invalid pairs without hitting the API", async () => {
    const result = await executeToolCall("pin_pair", { pair: "EUR" }, "tok");
    expect(JSON.parse(result).error).toMatch(/Invalid pair/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects empty/missing pair without hitting the API", async () => {
    const result = await executeToolCall("pin_pair", {}, "tok");
    expect(JSON.parse(result).error).toMatch(/Invalid pair/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("normalizes lowercase pairs to uppercase and pins them", async () => {
    mockFetch.mockResolvedValueOnce(
      _resp([{ id: "wl-abc", name: "Default", symbols: ["USDMXN"] }]),
    );
    mockFetch.mockResolvedValueOnce(
      _resp({ id: "wl-abc", name: "Default", symbols: ["USDMXN", "EURUSD"] }),
    );

    const result = await executeToolCall("pin_pair", { pair: "eurusd" }, "tok");
    const parsed = JSON.parse(result);
    expect(parsed.pinned).toBe("EURUSD");
    expect(parsed.total_symbols).toBe(2);

    // Second call (PUT) should include EURUSD in the symbols array
    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toBe("/v1/watchlists/wl-abc");
    const putBody = JSON.parse((putCall[2] as RequestInit).body as string);
    expect(putBody.symbols).toEqual(["USDMXN", "EURUSD"]);
  });

  it("creates a new watchlist when the user has none", async () => {
    mockFetch.mockResolvedValueOnce(_resp([]));
    mockFetch.mockResolvedValueOnce(
      _resp({ id: "wl-new-001", name: "Voice Watchlist", symbols: ["GBPUSD"] }),
    );

    const result = await executeToolCall("pin_pair", { pair: "GBPUSD" }, "tok");
    const parsed = JSON.parse(result);
    expect(parsed.created).toBe(true);
    expect(parsed.pinned).toBe("GBPUSD");

    // Verify the create call payload
    const createCall = mockFetch.mock.calls[1];
    expect(createCall[0]).toBe("/v1/watchlists");
    expect((createCall[2] as RequestInit).method).toBe("POST");
    const createBody = JSON.parse((createCall[2] as RequestInit).body as string);
    expect(createBody).toEqual({ name: "Voice Watchlist", symbols: ["GBPUSD"] });
  });

  it("returns already_present and skips PUT when symbol is already pinned", async () => {
    mockFetch.mockResolvedValueOnce(
      _resp([{ id: "wl-abc", name: "Default", symbols: ["USDMXN", "EURUSD"] }]),
    );

    const result = await executeToolCall("pin_pair", { pair: "EURUSD" }, "tok");
    const parsed = JSON.parse(result);
    expect(parsed.already_present).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1); // only the GET, no PUT
  });

  it("propagates HTTP errors from the GET", async () => {
    mockFetch.mockResolvedValueOnce(_resp({}, false, 503));
    const result = await executeToolCall("pin_pair", { pair: "USDMXN" }, "tok");
    expect(JSON.parse(result).error).toBe("HTTP 503");
  });

  it("propagates HTTP errors from the PUT", async () => {
    mockFetch.mockResolvedValueOnce(
      _resp([{ id: "wl-abc", name: "Default", symbols: [] }]),
    );
    mockFetch.mockResolvedValueOnce(_resp({}, false, 422));
    const result = await executeToolCall("pin_pair", { pair: "EURUSD" }, "tok");
    expect(JSON.parse(result).error).toBe("HTTP 422");
  });
});

// ── unpin_pair (mutating, find-and-remove flow) ───────────────────────────────

describe("unpin_pair", () => {
  it("rejects invalid pairs without hitting the API", async () => {
    const result = await executeToolCall("unpin_pair", { pair: "EU" }, "tok");
    expect(JSON.parse(result).error).toMatch(/Invalid pair/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns an error when no watchlists exist", async () => {
    mockFetch.mockResolvedValueOnce(_resp([]));
    const result = await executeToolCall("unpin_pair", { pair: "EURUSD" }, "tok");
    expect(JSON.parse(result).error).toBe("No watchlist exists");
    expect(mockFetch).toHaveBeenCalledTimes(1); // only the GET
  });

  it("returns not_present and skips PUT when symbol isn't pinned", async () => {
    mockFetch.mockResolvedValueOnce(
      _resp([{ id: "wl-abc", name: "Default", symbols: ["USDMXN"] }]),
    );
    const result = await executeToolCall("unpin_pair", { pair: "EURUSD" }, "tok");
    const parsed = JSON.parse(result);
    expect(parsed.not_present).toBe(true);
    expect(parsed.unpinned).toBe("EURUSD");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("removes symbol and PUTs the trimmed list", async () => {
    mockFetch.mockResolvedValueOnce(
      _resp([{ id: "wl-abc", name: "Default", symbols: ["USDMXN", "EURUSD", "GBPUSD"] }]),
    );
    mockFetch.mockResolvedValueOnce(
      _resp({ id: "wl-abc", name: "Default", symbols: ["USDMXN", "GBPUSD"] }),
    );

    const result = await executeToolCall("unpin_pair", { pair: "eurusd" }, "tok");
    const parsed = JSON.parse(result);
    expect(parsed.unpinned).toBe("EURUSD");
    expect(parsed.total_symbols).toBe(2);

    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toBe("/v1/watchlists/wl-abc");
    const putBody = JSON.parse((putCall[2] as RequestInit).body as string);
    expect(putBody.symbols).toEqual(["USDMXN", "GBPUSD"]);
  });

  it("propagates HTTP errors from the PUT", async () => {
    mockFetch.mockResolvedValueOnce(
      _resp([{ id: "wl-abc", name: "Default", symbols: ["EURUSD"] }]),
    );
    mockFetch.mockResolvedValueOnce(_resp({}, false, 500));
    const result = await executeToolCall("unpin_pair", { pair: "EURUSD" }, "tok");
    expect(JSON.parse(result).error).toBe("HTTP 500");
  });
});

// ── get_recent_runs (read-only) ──────────────────────────────────────────────

describe("get_recent_runs", () => {
  it("uses default limit=5 when no arg provided and maps RunSummary fields", async () => {
    mockFetch.mockResolvedValueOnce(
      _resp({
        items: [
          {
            run_id: "11111111-aaaa-bbbb-cccc-000000000001",
            trade_count: 12,
            hedge_count: 4,
            created_at: "2026-04-25T10:00:00Z",
          },
          {
            run_id: "22222222-aaaa-bbbb-cccc-000000000002",
            trade_count: 7,
            hedge_count: 2,
            created_at: "2026-04-25T09:00:00Z",
          },
        ],
        total: 2,
      }),
    );

    const result = await executeToolCall("get_recent_runs", {}, "tok");
    const parsed = JSON.parse(result);
    expect(mockFetch.mock.calls[0][0]).toBe("/v1/runs?limit=5");
    expect(parsed.count).toBe(2);
    expect(parsed.runs[0]).toEqual({
      run_id: "11111111",
      trades: 12,
      hedges: 4,
      at: "2026-04-25T10:00:00Z",
    });
  });

  it("clamps limit into [1, 20]", async () => {
    mockFetch.mockResolvedValueOnce(_resp({ items: [], total: 0 }));
    await executeToolCall("get_recent_runs", { limit: 999 }, "tok");
    expect(mockFetch.mock.calls[0][0]).toBe("/v1/runs?limit=20");

    mockFetch.mockResolvedValueOnce(_resp({ items: [], total: 0 }));
    await executeToolCall("get_recent_runs", { limit: 0 }, "tok");
    expect(mockFetch.mock.calls[1][0]).toBe("/v1/runs?limit=1");
  });

  it("propagates HTTP errors", async () => {
    mockFetch.mockResolvedValueOnce(_resp({}, false, 503));
    const result = await executeToolCall("get_recent_runs", { limit: 3 }, "tok");
    expect(JSON.parse(result).error).toBe("HTTP 503");
  });

  it("handles bare-array responses (in case the endpoint changes)", async () => {
    mockFetch.mockResolvedValueOnce(
      _resp([{ run_id: "abcdef01-...", trade_count: 1, hedge_count: 1, created_at: "2026-04-25" }]),
    );
    const result = await executeToolCall("get_recent_runs", { limit: 1 }, "tok");
    const parsed = JSON.parse(result);
    expect(parsed.count).toBe(1);
    expect(parsed.runs[0].run_id).toBe("abcdef01");
  });
});
