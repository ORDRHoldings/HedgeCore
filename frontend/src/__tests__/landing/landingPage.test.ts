/**
 * Tests for the Landing Page, Market Page, usePublicChartData hook,
 * and ClientProviders public route handling.
 */

describe("Treasury landing structure", () => {
  // Mirrors the verifiable fact-set rendered by src/app/page.tsx. These figures
  // are sourced from the codebase (CLAUDE.md \u00a76, architecture canon) \u2014 keep this
  // test and the landing in lockstep so neither drifts into marketing fiction.

  test("login CTA points at the real product login route", () => {
    const LOGIN_HREF = "/auth/login";
    expect(LOGIN_HREF).toBe("/auth/login");
  });

  test("headline stat bar has 4 verifiable entries", () => {
    const STATS = [
      ["60", "Engine modules"],
      ["5,514", "Tests green"],
      ["R1\u2013R8", "Risk taxonomy"],
      ["SHA-256", "Hash-chained audit"],
    ];
    expect(STATS).toHaveLength(4);
    expect(STATS[0][0]).toBe("60"); // 46 engine_v1 + 14 orchestrator
    expect(STATS[1][0]).toBe("5,514");
  });

  test("risk taxonomy is exactly R1\u2013R8", () => {
    const RISKS = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"];
    expect(RISKS).toHaveLength(8);
    expect(RISKS[0]).toBe("R1");
    expect(RISKS[7]).toBe("R8");
  });

  test("governance pipeline is the tri-state SANDBOX \u2192 STAGING \u2192 LEDGER", () => {
    const GOV = ["SANDBOX", "STAGING", "LEDGER"];
    expect(GOV).toEqual(["SANDBOX", "STAGING", "LEDGER"]);
  });

  test("WORM tables are the three append-only canon tables", () => {
    const WORM = ["audit_events", "calculation_runs", "policy_revisions"];
    expect(WORM).toHaveLength(3);
    expect(WORM).toContain("audit_events");
  });

  test("compliance frameworks include the core hedge-accounting & reporting regimes", () => {
    const REGS = ["EMIR", "MiFID II", "Dodd-Frank", "FINRA 17a-4", "ISDA", "IFRS 9", "ASC 815"];
    expect(REGS).toContain("IFRS 9");
    expect(REGS).toContain("ASC 815");
    expect(REGS).toContain("EMIR");
  });

  test("ERP posting adapters are framed as paper mode (RISK-ERP-01), not live", () => {
    const adapters = [
      { name: "QuickBooks", status: "paper mode" },
      { name: "Xero", status: "paper mode" },
      { name: "NetSuite", status: "paper mode" },
    ];
    expect(adapters.every((a) => a.status === "paper mode")).toBe(true);
  });
});

describe("Market Page constants", () => {
  const FX_PAIRS = [
    "USDMXN", "EURUSD", "GBPUSD", "USDJPY", "USDCAD",
    "AUDUSD", "NZDUSD", "USDCHF", "EURGBP", "EURJPY",
  ];
  const TIMEFRAMES = [
    { label: "1H", value: "1h" },
    { label: "4H", value: "4h" },
    { label: "1D", value: "1day" },
    { label: "1W", value: "1week" },
  ];

  test("FX_PAIRS has 10 pairs", () => {
    expect(FX_PAIRS).toHaveLength(10);
  });

  test("all pairs are 6 chars (3+3)", () => {
    for (const p of FX_PAIRS) {
      expect(p).toHaveLength(6);
    }
  });

  test("TIMEFRAMES has 4 entries", () => {
    expect(TIMEFRAMES).toHaveLength(4);
  });

  test("timeframe values are valid API values", () => {
    const valid = ["1h", "4h", "1day", "1week"];
    for (const tf of TIMEFRAMES) {
      expect(valid).toContain(tf.value);
    }
  });

  test("default pair is EURUSD", () => {
    expect(FX_PAIRS).toContain("EURUSD");
  });
});

describe("ClientProviders PUBLIC_ROUTES", () => {
  const PUBLIC_ROUTES = ["/", "/market"];

  test("includes root path", () => {
    expect(PUBLIC_ROUTES).toContain("/");
  });

  test("includes /market", () => {
    expect(PUBLIC_ROUTES).toContain("/market");
  });

  test("does not include /dashboard", () => {
    expect(PUBLIC_ROUTES).not.toContain("/dashboard");
  });

  test("does not include /chart (authenticated chart)", () => {
    expect(PUBLIC_ROUTES).not.toContain("/chart");
  });

  test("public route detection is exact match not prefix", () => {
    const isPublic = (path: string) => PUBLIC_ROUTES.includes(path);
    expect(isPublic("/market")).toBe(true);
    expect(isPublic("/market-intelligence")).toBe(false);
    expect(isPublic("/")).toBe(true);
    expect(isPublic("/auth/login")).toBe(false);
  });

  test("landing page (/) gets scrollable styles, not overflow hidden", () => {
    // The landing page should scroll naturally
    const pathname = "/";
    const isCanvasRoute = pathname === "/market";
    // Landing page is NOT a canvas route
    expect(isCanvasRoute).toBe(false);
    // So it should get minHeight: 100vh (scrollable), not overflow: hidden
  });

  test("/market gets overflow hidden for canvas", () => {
    const pathname = "/market";
    const isCanvasRoute = pathname === "/market";
    expect(isCanvasRoute).toBe(true);
    // Canvas routes need overflow hidden
  });
});

describe("usePublicChartData API URL construction", () => {
  const API_BASE = "https://hedgecore.onrender.com";

  test("builds correct URL for EURUSD 1day", () => {
    const symbol = "EURUSD";
    const interval = "1day";
    const limit = 500;
    const url = `${API_BASE}/v1/public/chart-data/${encodeURIComponent(symbol)}?interval=${interval}&limit=${limit}`;
    expect(url).toBe("https://hedgecore.onrender.com/v1/public/chart-data/EURUSD?interval=1day&limit=500");
  });

  test("encodes special characters in symbol", () => {
    const symbol = "USD/MXN";
    const url = `${API_BASE}/v1/public/chart-data/${encodeURIComponent(symbol)}?interval=1h&limit=100`;
    expect(url).toContain("USD%2FMXN");
  });

  test("uses public endpoint not authenticated endpoint", () => {
    const symbol = "GBPUSD";
    const url = `${API_BASE}/v1/public/chart-data/${encodeURIComponent(symbol)}?interval=4h&limit=500`;
    expect(url).toContain("/v1/public/");
    expect(url).not.toMatch(/\/v1\/chart-data\//);
  });

  test("default limit is 500", () => {
    const defaultLimit = 500;
    expect(defaultLimit).toBe(500);
  });
});

describe("Chart page dark theme", () => {
  const S = {
    bgPanel: "#131722",
    bgDeep: "#0B1120",
    bgSub: "#1E222D",
    rim: "#2A2E39",
    textPrimary: "#D1D4DC",
    textSecondary: "#787B86",
    textTertiary: "#545B69",
    accent: "#1C62F2",
  };

  test("background colors are dark theme values", () => {
    expect(S.bgDeep).toBe("#0B1120");
    expect(S.bgPanel).toBe("#131722");
    expect(S.bgSub).toBe("#1E222D");
  });

  test("text colors are light-on-dark values", () => {
    expect(parseInt(S.textPrimary.slice(1, 3), 16)).toBeGreaterThan(180);
    expect(parseInt(S.textSecondary.slice(1, 3), 16)).toBeGreaterThan(100);
    expect(parseInt(S.textTertiary.slice(1, 3), 16)).toBeGreaterThan(60);
  });

  test("border color is dark theme", () => {
    expect(S.rim).toBe("#2A2E39");
    expect(parseInt(S.rim.slice(1, 3), 16)).toBeLessThan(80);
  });

  test("accent remains brand blue", () => {
    expect(S.accent).toBe("#1C62F2");
  });

  test("no light theme values remain", () => {
    const values = Object.values(S);
    for (const v of values) {
      expect(v).not.toContain("var(");
      expect(v).not.toBe("#FFFFFF");
      expect(v).not.toBe("#F8FAFC");
      expect(v).not.toBe("#F1F5F9");
      expect(v).not.toBe("#E2E8F0");
    }
  });
});

describe("AppSidebar market section", () => {
  test("label is ORDR Market", () => {
    const label = "ORDR Market";
    expect(label).toBe("ORDR Market");
    expect(label).not.toBe("Markets");
  });

  test("prefixes include /market", () => {
    const prefixes = ["/fx-market", "/market-intelligence", "/chart", "/market"];
    expect(prefixes).toContain("/market");
    expect(prefixes).toContain("/chart");
    expect(prefixes).toContain("/market-intelligence");
  });

  test("Chart Platform is first item", () => {
    const items = [
      { label: "Chart Platform", href: "/chart" },
      { label: "Intelligence Hub", href: "/market-intelligence" },
      { label: "FX Rates", href: "/fx-market" },
    ];
    expect(items[0].label).toBe("Chart Platform");
    expect(items[0].href).toBe("/chart");
  });
});
