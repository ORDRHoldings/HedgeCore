import type { GuideDoc } from "@/lib/help/guides/types";

export const POLISOPHIC: GuideDoc = {
  id: "polisophic",
  title: "Polisophic Risk Intel",
  summary:
    "Polisophic aggregates geopolitical and macro risk intelligence from Yahoo Finance and Finnhub feeds. It provides a Risk Pulse score, five macro indicators (DXY, VIX, US 10Y, Brent, Gold), geo-political news, and an economic calendar for FX risk context.",
  path: "/polisophic",
  icon: "🌍",
  lastReviewed: "2026-02-28",
  relatedIds: ["fx-rates", "getting-started", "troubleshooting"],
  sections: [
    // ─── L1: What is Polisophic? ──────────────────────────────────────────────
    {
      id: "polisophic-what-is",
      heading: "What is Polisophic?",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/api/market/macro/route.ts", endpoint: "GET /api/market/macro" },
        { file: "frontend/src/app/api/geo-news/route.ts", endpoint: "GET /api/geo-news" },
        { file: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx" },
      ],
      blocks: [
        {
          type: "text",
          body: "Polisophic is ORDR Terminal's geopolitical and macro risk intelligence layer. It aggregates real-time data from Yahoo Finance and Finnhub to surface the contextual risk environment in which FX hedging decisions are made. It is an intelligence context tool — not a trading signal or a price-source for execution.",
        },
        {
          type: "table",
          table: {
            headers: ["Component", "Source", "What It Shows"],
            rows: [
              ["Risk Pulse Score", "Finnhub FX news + Econ calendar", "Composite risk score: LOW / MEDIUM / HIGH"],
              ["Macro Indicators", "Yahoo Finance (DXY, VIX, TNX, Brent, Gold)", "Five key macro benchmarks with trend arrows"],
              ["Fed Funds Rate", "Static FOMC target (updated per meeting)", "Current FOMC target range and policy stance"],
              ["Geo-Political News", "Yahoo Finance v1/finance/search", "Top 15 articles from 5 symbol queries, newest first"],
              ["Economic Calendar", "Finnhub /calendar/economic", "7-day forward window of scheduled economic events"],
            ],
          },
        },
      ],
    },

    // ─── L2: Interpreting the Dashboard ──────────────────────────────────────
    {
      id: "polisophic-dashboard",
      heading: "Interpreting the Dashboard",
      level: "L2",
      verified: true,
      codeRefs: [
        { file: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx" },
        { file: "frontend/src/app/api/market/macro/route.ts" },
      ],
      blocks: [
        {
          type: "text",
          body: "The Polisophic dashboard surfaces risk context in four panels: the Risk Pulse score card, macro indicator tiles, the geo-political news feed, and the economic calendar. Each panel has its own data source and cache TTL.",
        },
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Risk Pulse Score Card",
              detail: "The large score card shows the composite Risk Pulse level (LOW / MEDIUM / HIGH) and a numerical score. The breakdown shows how many FX news articles appeared in the last 24 hours and how many high-impact and medium-impact economic events are scheduled.",
            },
            {
              n: 2,
              label: "Macro Indicator Tiles",
              detail: "Five tiles show DXY INDEX, VIX, US 10Y yield, BRENT crude, and GOLD price. A trend arrow (up/down/flat) indicates direction vs previous close. A static FED FUNDS tile shows the current FOMC target rate. Each tile has a context label.",
            },
            {
              n: 3,
              label: "Geo-Political News Feed",
              detail: "A rolling list of the 15 most recent articles sourced from Yahoo Finance, queried via 5 instrument symbol searches (VIX, EURUSD, Gold, Crude Oil, US 10Y). Articles are deduplicated by UUID and filtered to STORY type only.",
            },
            {
              n: 4,
              label: "Economic Calendar",
              detail: "A 7-day forward window of scheduled economic events from Finnhub's economic calendar. Events are labeled with impact level (high/medium/low) to support the Risk Pulse calculation.",
            },
          ],
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "Polisophic data refreshes on different schedules: macro indicators every 5 minutes, geo-political news every 10 minutes, economic calendar every 15 minutes, and FX news (for Risk Pulse) every 5 minutes. Data shown may be up to one cache TTL old.",
          },
        },
      ],
    },

    // ─── L3: Risk Pulse Formula ───────────────────────────────────────────────
    {
      id: "polisophic-risk-pulse",
      heading: "Risk Pulse Formula",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx" },
      ],
      blocks: [
        {
          type: "text",
          body: "The Risk Pulse score is a simple weighted composite of recent FX news activity and upcoming economic event impact. It is not a predictive model — it is a real-time context indicator derived from publicly available data.",
        },
        {
          type: "formula",
          formula: {
            label: "Risk Pulse Score",
            expression: "score = (newsCount24h × 1.0) + (highImpactEvents × 3.0) + (mediumImpactEvents × 1.5)",
            explanation:
              "newsCount24h = FX news articles published in the last 24 hours (from Finnhub forex news feed). highImpactEvents = economic calendar events with impact='high' in the 7-day window. mediumImpactEvents = events with impact='medium'.",
            source: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx",
            codeRef: { file: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx" },
          },
        },
        {
          type: "table",
          table: {
            headers: ["Score Range", "Risk Level", "Color", "Interpretation"],
            rows: [
              ["< 3", "LOW", "Green", "Quiet macro environment; normal FX hedging operations"],
              ["3 – 7.9", "MEDIUM", "Amber", "Elevated macro activity; monitor positions for event risk"],
              ["≥ 8", "HIGH", "Red", "High event density or breaking news; heightened FX volatility risk"],
            ],
          },
        },
      ],
    },

    // ─── L3: Macro Data Sources ───────────────────────────────────────────────
    {
      id: "polisophic-macro-sources",
      heading: "Macro Data Sources",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/api/market/macro/route.ts", endpoint: "GET /api/market/macro" },
      ],
      blocks: [
        {
          type: "table",
          table: {
            headers: ["Indicator", "Yahoo Finance Symbol", "Label", "Cache TTL", "Unit", "Context"],
            rows: [
              ["DXY Index", "DX-Y.NYB", "DXY INDEX", "300s", "Points", "USD vs basket of 6 major currencies"],
              ["VIX", "%5EVIX", "VIX", "300s", "Points", "Cboe Volatility Index — implied S&P 500 volatility"],
              ["US 10Y Treasury Yield", "%5ETNX", "US 10Y", "300s", "%", "US 10-year Treasury yield"],
              ["Brent Crude", "BZ%3DF", "BRENT", "300s", "USD/bbl", "Brent crude oil futures (ICE)"],
              ["Gold", "GC%3DF", "GOLD", "300s", "USD/oz", "Gold futures (COMEX) — safe-haven demand"],
              ["Fed Funds Rate", "Static (FOMC target)", "FED FUNDS", "N/A (static)", "%", "FOMC target range 4.25–4.50% — data-dependent hold"],
            ],
          },
        },
        {
          type: "text",
          body: "Macro data is fetched in parallel from Yahoo Finance's v8/finance/chart endpoint. Each request has an 8-second timeout. If a symbol fails to return a price, that tile is omitted from the response. The Fed Funds rate is hardcoded to the current FOMC target and updated manually per FOMC meeting.",
        },
      ],
    },

    // ─── L4: News Source & Deduplication ─────────────────────────────────────
    {
      id: "polisophic-news-dedup",
      heading: "News Source & Deduplication",
      level: "L4",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/api/geo-news/route.ts", endpoint: "GET /api/geo-news" },
      ],
      blocks: [
        {
          type: "text",
          body: "Geo-political news is sourced by querying Yahoo Finance's v1/finance/search endpoint for 5 instrument symbols in parallel. Results are merged, deduplicated, filtered to STORY-type articles only, sorted newest-first, and the top 15 are returned.",
        },
        {
          type: "field-dict",
          fields: [
            {
              name: "Symbol Queries",
              type: "string[]",
              meaning: "5 Yahoo Finance symbols queried in parallel to retrieve market-relevant news",
              example: "%5EVIX (^VIX), EURUSD%3DX (EURUSD=X), GC%3DF (GC=F), CL%3DF (CL=F), %5ETNX (^TNX)",
            },
            {
              name: "Deduplication Key",
              type: "string (UUID)",
              meaning: "Articles are deduplicated by Yahoo Finance UUID. Same article appearing in multiple symbol search results is counted once.",
              example: "uuid: '3f8a2c1d-...'",
            },
            {
              name: "Article Filter",
              type: "string enum",
              meaning: "Only articles with type='STORY' are included. Non-article items (VIDEO, PR_STORY) are excluded.",
              example: "item.type === 'STORY'",
            },
            {
              name: "Cache TTL",
              type: "integer (milliseconds)",
              constraints: "600000 ms = 600 seconds",
              meaning: "In-memory cache duration. Geo-news is refreshed at most once every 10 minutes.",
              example: "CACHE_TTL_MS = 600_000",
            },
            {
              name: "Article Limit",
              type: "integer",
              constraints: "max 15",
              meaning: "Top 15 articles by publication time are returned after deduplication.",
              example: "articles.slice(0, 15)",
            },
          ],
        },
      ],
    },

    // ─── L5: Institutional Use ────────────────────────────────────────────────
    {
      id: "polisophic-institutional",
      heading: "Institutional Use",
      level: "L5",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "Polisophic data is designed as intelligence context for treasury risk management — providing the macro and geopolitical backdrop against which FX hedging decisions are assessed. It is explicitly not a trading signal system or an approved market data source for regulatory reporting.",
        },
        {
          type: "table",
          table: {
            headers: ["Polisophic Component", "Appropriate Institutional Use", "Not Suitable For"],
            rows: [
              ["Risk Pulse Score", "Morning briefing context; pre-meeting risk summary; escalation trigger for position review", "Automated trade triggers; regulatory risk metrics"],
              ["Macro Indicators (DXY, VIX, etc.)", "FX rate context; volatility environment awareness; carry trade monitoring", "Execution rate; regulatory reporting; mark-to-market"],
              ["Geo-Political News Feed", "Event calendar awareness; news monitoring for country-specific FX exposure", "Verified news source for investment decisions; official disclosures"],
              ["Economic Calendar", "Identifying event risk windows; scheduling hedge rebalancing around data releases", "Confirmed event schedules for compliance purposes"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "For regulatory risk reporting, market risk disclosures, or IFRS 9 hedge documentation, use data sourced from approved market data vendors with formal data agreements. Yahoo Finance and Finnhub data in Polisophic are public aggregations suitable for internal risk intelligence only. Compliance status with specific regulatory regimes is not verified for this data source.",
          },
        },
      ],
    },
  ],
};
