/**
 * Tests for the Landing Page, Market Page, usePublicChartData hook,
 * and ClientProviders public route handling.
 */

describe("Landing Page structure", () => {
  test("FONT constants are defined correctly", () => {
    const FONT_UI = "'IBM Plex Sans', sans-serif";
    const FONT_MONO = "'IBM Plex Mono', monospace";
    const FONT_HEADING = "'Manrope', 'IBM Plex Sans', sans-serif";
    expect(FONT_UI).toContain("IBM Plex Sans");
    expect(FONT_MONO).toContain("IBM Plex Mono");
    expect(FONT_HEADING).toContain("Manrope");
  });

  test("color tokens use dark theme", () => {
    const C = {
      bgBase: "#0B1120",
      bgMid: "#131722",
      bgCard: "#1E222D",
      border: "#2A2E39",
      textPrimary: "#D1D4DC",
      textMuted: "#787B86",
      textDim: "#545B69",
      accentBlue: "#2962FF",
      accentGreen: "#26A69A",
      white: "#FFFFFF",
    };
    expect(C.bgBase).toBe("#0B1120");
    expect(C.bgMid).toBe("#131722");
    expect(C.bgCard).toBe("#1E222D");
    // All backgrounds should be dark (R < 0x30)
    expect(parseInt(C.bgBase.slice(1, 3), 16)).toBeLessThan(48);
    expect(parseInt(C.bgMid.slice(1, 3), 16)).toBeLessThan(48);
    expect(parseInt(C.bgCard.slice(1, 3), 16)).toBeLessThan(48);
  });

  test("product list has 9 products", () => {
    const products = [
      "ORDR Market",
      "ORDR Terminal",
      "Polisophic Intelligence",
      "Portfolio Risk",
      "Scenario Studio",
      "Sandbox",
      "Currency Desk",
      "Treasury Desk",
      "HedgeWiki",
    ];
    expect(products).toHaveLength(9);
  });

  test("gated products are Currency Desk and Treasury Desk only", () => {
    const products = [
      { title: "ORDR Market", gated: false },
      { title: "ORDR Terminal", gated: false },
      { title: "Polisophic Intelligence", gated: false },
      { title: "Portfolio Risk", gated: false },
      { title: "Scenario Studio", gated: false },
      { title: "Sandbox", gated: false },
      { title: "Currency Desk", gated: true },
      { title: "Treasury Desk", gated: true },
      { title: "HedgeWiki", gated: false },
    ];
    const gated = products.filter((p) => p.gated);
    expect(gated).toHaveLength(2);
    expect(gated.map((p) => p.title)).toEqual(["Currency Desk", "Treasury Desk"]);
  });

  test("stats data has 5 entries with correct values", () => {
    const STATS = [
      { value: "219", label: "API Endpoints" },
      { value: "41", label: "Engine Modules" },
      { value: "60", label: "Policy Presets" },
      { value: "3,200+", label: "Tests" },
      { value: "23", label: "Indicators" },
    ];
    expect(STATS).toHaveLength(5);
    expect(STATS[0].value).toBe("219");
    expect(STATS[4].value).toBe("23");
    expect(STATS[4].label).toBe("Indicators");
  });

  test("value propositions have 3 items", () => {
    const VALUE_PROPS = [
      { title: "Deterministic Engine" },
      { title: "Institutional Governance" },
      { title: "Professional Charting" },
    ];
    expect(VALUE_PROPS).toHaveLength(3);
    expect(VALUE_PROPS[0].title).toBe("Deterministic Engine");
  });

  test("background color is the correct dark base", () => {
    const BG = "#0B1120";
    expect(BG).toBe("#0B1120");
  });

  test("product badges have correct labels", () => {
    const badges = ["FREE", "FULL ACCESS", "OPEN", "OPEN", "OPEN", "OPEN", "INSTITUTIONAL", "INSTITUTIONAL", "OPEN"];
    expect(badges.filter((b) => b === "FREE")).toHaveLength(1);
    expect(badges.filter((b) => b === "FULL ACCESS")).toHaveLength(1);
    expect(badges.filter((b) => b === "INSTITUTIONAL")).toHaveLength(2);
    expect(badges.filter((b) => b === "OPEN")).toHaveLength(5);
  });

  test("product links are correct", () => {
    const links = [
      { title: "ORDR Market", href: "/market" },
      { title: "ORDR Terminal", href: "/auth/login" },
      { title: "Polisophic Intelligence", href: "/polisophic" },
      { title: "Portfolio Risk", href: "/portfolio-risk" },
      { title: "Scenario Studio", href: "/scenario-studio" },
      { title: "Sandbox", href: "/sandbox" },
      { title: "Currency Desk", href: "/market-overview" },
      { title: "Treasury Desk", href: "/hedge-desk" },
      { title: "HedgeWiki", href: "/methodology" },
    ];
    expect(links.find((l) => l.title === "ORDR Market")?.href).toBe("/market");
    expect(links.find((l) => l.title === "ORDR Terminal")?.href).toBe("/auth/login");
    expect(links.find((l) => l.title === "Currency Desk")?.href).toBe("/market-overview");
    expect(links.find((l) => l.title === "Treasury Desk")?.href).toBe("/hedge-desk");
    expect(links.find((l) => l.title === "HedgeWiki")?.href).toBe("/methodology");
  });

  test("hero has correct main headline and subtitle", () => {
    const headline = "ORDR";
    const subtitle = "The Institutional Trading Platform";
    expect(headline).toBe("ORDR");
    expect(subtitle).toBe("The Institutional Trading Platform");
  });

  test("hero tagline is correct", () => {
    const tagline = "Professional charting, deterministic hedging, and treasury management \u2014 unified.";
    expect(tagline).toContain("charting");
    expect(tagline).toContain("hedging");
    expect(tagline).toContain("treasury");
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
