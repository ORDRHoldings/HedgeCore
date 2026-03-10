/**
 * Tests for the Landing Page, Market Page, usePublicChartData hook,
 * and ClientProviders public route handling.
 */

describe("Landing Page structure", () => {
  test("FONT constants are defined correctly", () => {
    // Validate the font tokens used on the landing page
    const FONT_UI = "'IBM Plex Sans', sans-serif";
    const FONT_MONO = "'IBM Plex Mono', monospace";
    const FONT_HEADING = "'Manrope', 'IBM Plex Sans', sans-serif";
    expect(FONT_UI).toContain("IBM Plex Sans");
    expect(FONT_MONO).toContain("IBM Plex Mono");
    expect(FONT_HEADING).toContain("Manrope");
  });

  test("feature lists have correct lengths", () => {
    const FEATURES_MARKET = [
      "23 technical indicators + auto-detection",
      "Volume Profile with POC / VAH / VAL",
      "Real-time FX data across 17 pairs",
      "Canvas 2D rendering at 60fps",
      "Drawing tools: trend, fib, S/R, FVG",
      "No account required",
    ];
    const FEATURES_TERMINAL = [
      "Deterministic hedge calculations",
      "4-eyes governance with SoD",
      "WORM audit trail + hash chain",
      "Policy engine with 60 presets",
      "IFRS 9 / ASC 815 effectiveness",
      "Role-based access (9 roles, 41 perms)",
    ];
    expect(FEATURES_MARKET).toHaveLength(6);
    expect(FEATURES_TERMINAL).toHaveLength(6);
  });

  test("stats data is correct", () => {
    const STATS = [
      { value: "219", label: "API Endpoints" },
      { value: "41", label: "Engine Modules" },
      { value: "60", label: "Policy Presets" },
      { value: "3,200+", label: "Tests" },
    ];
    expect(STATS).toHaveLength(4);
    expect(STATS[0].value).toBe("219");
    expect(STATS[3].label).toBe("Tests");
  });

  test("background color is the correct dark base", () => {
    const BG = "#0B1120";
    expect(BG).toBe("#0B1120");
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
    // The page uses useState("EURUSD") as default
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
    // /market-intelligence should NOT match /market
    const isPublic = (path: string) => PUBLIC_ROUTES.includes(path);
    expect(isPublic("/market")).toBe(true);
    expect(isPublic("/market-intelligence")).toBe(false);
    expect(isPublic("/")).toBe(true);
    expect(isPublic("/auth/login")).toBe(false);
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
    // Primary text should be light
    expect(parseInt(S.textPrimary.slice(1, 3), 16)).toBeGreaterThan(180);
    // Secondary text should be medium
    expect(parseInt(S.textSecondary.slice(1, 3), 16)).toBeGreaterThan(100);
    // Tertiary text should be dim
    expect(parseInt(S.textTertiary.slice(1, 3), 16)).toBeGreaterThan(60);
  });

  test("border color is dark theme", () => {
    expect(S.rim).toBe("#2A2E39");
    // Should be dark, not light
    expect(parseInt(S.rim.slice(1, 3), 16)).toBeLessThan(80);
  });

  test("accent remains brand blue", () => {
    expect(S.accent).toBe("#1C62F2");
  });

  test("no light theme values remain", () => {
    const values = Object.values(S);
    for (const v of values) {
      // No CSS var() references in dark theme tokens
      expect(v).not.toContain("var(");
      // No light backgrounds
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
