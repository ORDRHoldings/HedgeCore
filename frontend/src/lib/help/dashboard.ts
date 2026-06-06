import type { ModuleHelp } from "@/lib/help/types";

export const DASHBOARD_HELP: ModuleHelp = {
  moduleId: "dashboard",
  pageTitle: "ORDR Dashboard",
  pageSubtitle: "COMMAND CENTER · INSTITUTIONAL ANALYTICS",
  sections: [
    {
      id: "dashboard-overview",
      anchor: "dashboard-overview",
      title: "What the Dashboard Shows",
      icon: "LayoutDashboard",
      level: 1,
      type: "text",
      verified: true,
      codeRefs: [{ file: "frontend/src/lib/widgets/widgetRegistry.ts" }],
      content:
        "The ORDR Dashboard is the primary command surface for treasury and risk officers. It aggregates real-time FX market data, position exposure, policy coverage, and audit signals into a single, configurable workspace.\n\nThe system supports 19 registered widget types arranged across 11 role-based default layouts. Each layout is tuned to the information priorities of a specific organisational role — from junior analyst read-only views to CEO executive summaries.\n\nMarket data is sourced from two upstream providers: Finnhub (FX rates, news sentiment, economic calendar events) and Yahoo Finance (macro indicators, sector performance). All provider calls are executed server-side via Next.js API routes; no API keys are exposed to the browser. Data is held in an in-memory SimpleCache with per-endpoint TTLs to balance freshness against upstream rate limits.\n\nThe dashboard layout is persisted per user in browser localStorage under the key `dashboard_layout_${userId}`. On first login, the user receives the default layout for their highest-priority role. Subsequent sessions restore the saved layout. Widgets can be added, removed, repositioned, and resized without reloading the page.",
    },
    {
      id: "dashboard-widgets",
      anchor: "dashboard-widgets",
      title: "Dashboard Widgets",
      icon: "Layers",
      level: 1,
      type: "variables",
      verified: true,
      codeRefs: [
        { file: "frontend/src/lib/widgets/widgetRegistry.ts" },
        { file: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx" },
      ],
      variables: [
        {
          name: "risk_pulse",
          type: "RiskPulseWidget",
          description:
            "Composite risk score derived from FX news volume and economic event impact ratings over the prior 24 hours. Renders a colour-coded badge (LOW / MEDIUM / HIGH) and a breakdown of contributing factors. Updates on each dashboard refresh cycle.",
          source: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx",
        },
        {
          name: "geopolitical",
          type: "GeoPoliticalWidget",
          description:
            "Surfaces geopolitical risk signals relevant to the portfolio's currency exposure. Displays country-level heat scores sourced from the FX news feed, filtered for geopolitical keywords. Intended for head-of-risk and above.",
          source: "frontend/src/components/dashboard/widgets/GeoPoliticalWidget.tsx",
        },
        {
          name: "market_pulse",
          type: "MarketPulseWidget",
          description:
            "Snapshot of live FX spot rates for the top currency pairs held in the position book, overlaid with intraday percentage change. Rates are sourced from Finnhub with a 60-second cache TTL.",
          source: "frontend/src/components/dashboard/widgets/MarketPulseWidget.tsx",
        },
        {
          name: "usd_exposure_radar",
          type: "UsdExposureRadarWidget",
          description:
            "Radar chart visualising net USD-equivalent exposure across all open positions, segmented by currency. Highlights concentrations that exceed policy-defined thresholds. Pulls from the /v1/positions/exposure endpoint.",
          source: "frontend/src/components/dashboard/widgets/UsdExposureRadarWidget.tsx",
        },
        {
          name: "econ_calendar",
          type: "EconCalendarWidget",
          description:
            "Forward-looking economic event calendar for the current and next trading week. Events are tagged with impact level (HIGH / MEDIUM / LOW) and currency relevance. Sourced from Finnhub /calendar/economic with a 900-second cache TTL.",
          source: "frontend/src/components/dashboard/widgets/EconCalendarWidget.tsx",
        },
        {
          name: "fx_news",
          type: "FxNewsWidget",
          description:
            "Live FX news feed from Finnhub, filtered to forex category. Stories are ranked by relevance and recency. Each item includes headline, source, sentiment classification, and a direct link. Cache TTL: 300 seconds.",
          source: "frontend/src/components/dashboard/widgets/FxNewsWidget.tsx",
        },
      ],
    },
    {
      id: "dashboard-layout-customisation",
      anchor: "dashboard-layout-customisation",
      title: "Customising Your Layout",
      icon: "SlidersHorizontal",
      level: 2,
      type: "workflow",
      verified: false,
      callout: {
        type: "caution",
        text: "Layout persistence relies on localStorage. Clearing browser storage will reset the layout to the role default on next login.",
      },
      steps: [
        {
          step: 1,
          label: "Open Widget Catalog",
          description:
            "Click the grid icon in the dashboard toolbar to open the Widget Catalog panel. All 19 available widgets are listed with a short description and their current visibility state.",
        },
        {
          step: 2,
          label: "Add Widgets",
          description:
            "Toggle any widget from OFF to ON in the catalog. The widget is injected into the grid at a default position in the next available row. Widgets already on the canvas cannot be added a second time.",
        },
        {
          step: 3,
          label: "Drag to Reposition",
          description:
            "Grab any widget by its header bar (the drag handle region, marked with a grip icon) and drag it to the desired grid position. The grid snaps to a 12-column layout. Other widgets rearrange to avoid overlap.",
        },
        {
          step: 4,
          label: "Resize Widgets",
          description:
            "Drag the resize handle at the bottom-right corner of any widget to change its column span and row height. Minimum sizes are enforced per widget type to preserve readability.",
        },
        {
          step: 5,
          label: "Changes Auto-Saved",
          description:
            "Every layout mutation (add, remove, move, resize) is automatically serialised to localStorage under the key `dashboard_layout_${userId}`. No explicit save action is required. The saved state is restored on the next page load.",
        },
      ],
    },
    {
      id: "dashboard-risk-pulse-formula",
      anchor: "dashboard-risk-pulse-formula",
      title: "Risk Pulse Score Formula",
      icon: "Activity",
      level: 3,
      type: "formula",
      verified: true,
      codeRefs: [
        { file: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx" },
      ],
      formulas: [
        {
          label: "Risk Pulse Composite Score",
          latex:
            "\\text{score} = (N_{24h} \\times 1.0) + (E_{high} \\times 3.0) + (E_{med} \\times 1.5)",
          explanation:
            "N₂₄h is the count of FX news articles published in the prior 24 hours. E_high is the count of HIGH-impact economic calendar events in the same window. E_med is the count of MEDIUM-impact events. Weights reflect the empirical signal strength of each category for short-term FX volatility.",
          source: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx",
          codeRef: { file: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx" },
        },
        {
          label: "Risk Level Classification",
          latex:
            "\\text{level} = \\begin{cases} \\text{LOW} & \\text{score} < 3 \\\\ \\text{MEDIUM} & 3 \\leq \\text{score} < 8 \\\\ \\text{HIGH} & \\text{score} \\geq 8 \\end{cases}",
          explanation:
            "The three-tier classification maps the continuous score to an actionable risk label. LOW indicates routine market conditions. MEDIUM signals elevated attention warranted. HIGH indicates material event risk that may require position review or escalation to head-of-risk.",
          source: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx",
          codeRef: { file: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx" },
        },
      ],
    },
    {
      id: "dashboard-role-layouts",
      anchor: "dashboard-role-layouts",
      title: "Role-Based Default Layouts",
      icon: "Users",
      level: 4,
      type: "text",
      verified: true,
      codeRefs: [{ file: "frontend/src/lib/widgets/widgetRegistry.ts" }],
      content:
        "Each of the 11 system roles receives a curated default widget layout on first login. Layouts are defined in the widget registry and reflect the operational focus of each role in the treasury governance hierarchy.\n\n**admin** — Full-spectrum command view: risk_pulse, command_hub, geopolitical, usd_exposure_radar. Designed for platform administrators monitoring system health alongside market risk.\n\n**ceo** — Executive summary: exposure_summary, coverage_gauge, fx_news, econ_calendar. High-level KPIs without operational detail.\n\n**cfo** — Financial oversight: exposure_summary, coverage_gauge, hedge_health, cost_analysis. Emphasis on P&L impact and cost efficiency.\n\n**head_of_risk** — Risk command: risk_pulse, geopolitical, usd_exposure_radar, hedge_health, market_pulse. Full risk signal aggregation.\n\n**branch_manager** — Branch exposure: branch_exposure, coverage_gauge, team_activity. Scoped to the manager's branch hierarchy.\n\n**supervisor** — Workflow management: pending_approvals, team_activity, exposure_summary. Queue-oriented view.\n\n**senior_analyst** — Analytical depth: usd_exposure_radar, market_pulse, currency_intel, econ_calendar, fx_news.\n\n**risk_analyst** — Risk detail: risk_pulse, hedge_health, currency_intel, geopolitical.\n\n**junior_analyst** — Read-only orientation: exposure_summary, fx_news, econ_calendar.\n\n**auditor** — Audit trail focus: team_activity, calculation_history, policy_coverage.\n\nUsers with multiple roles receive the layout of their highest hierarchy-level role (hierarchy_level 0-15 scale, 15 = highest authority). All layouts are modifiable post-login and persisted per-user.",
    },
    {
      id: "dashboard-data-sources",
      anchor: "dashboard-data-sources",
      title: "Data Sources & Cache TTLs",
      icon: "Database",
      level: 4,
      type: "variables",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/api/market/fx/rates/route.ts" },
        { file: "frontend/src/app/api/market/news/fx/route.ts" },
        { file: "frontend/src/app/api/market/calendar/econ/route.ts" },
      ],
      variables: [
        {
          name: "Finnhub — FX Rates",
          type: "SimpleCache",
          description:
            "Live FX spot rates for all currency pairs tracked in the position book. Fetched from the Finnhub /forex/rates endpoint. Cache TTL: 60 seconds. On cache miss, a fresh HTTP request is issued server-side with the FINNHUB_API_KEY environment variable. Browser never receives the key.",
          example: "TTL: 60s | Fallback: static reference rates",
          source: "frontend/src/app/api/market/fx/rates/route.ts",
        },
        {
          name: "Finnhub — FX News",
          type: "SimpleCache",
          description:
            "FX category news articles. Fetched from Finnhub /news?category=forex. Cache TTL: 300 seconds. Response is filtered server-side before forwarding to the client; raw API responses containing the key are never proxied.",
          example: "TTL: 300s | Fallback: empty array with warning log",
          source: "frontend/src/app/api/market/news/fx/route.ts",
        },
        {
          name: "Finnhub — Economic Calendar",
          type: "SimpleCache",
          description:
            "Scheduled economic events with impact ratings (HIGH/MEDIUM/LOW) and affected currencies. Fetched from Finnhub /calendar/economic. Cache TTL: 900 seconds. Longer TTL justified by low event mutation frequency within a session.",
          example: "TTL: 900s | Fallback: empty events array",
          source: "frontend/src/app/api/market/calendar/econ/route.ts",
        },
        {
          name: "Yahoo Finance — Macro Indicators",
          type: "SimpleCache",
          description:
            "Macro-economic data series (DXY, 10Y yield, VIX proxy). Fetched via Yahoo Finance API wrapper. Cache TTL: 300 seconds. Used by MarketPulseWidget and HedgeHealthWidget for macro context overlays.",
          example: "TTL: 300s | Fallback: null values with stale indicator",
        },
        {
          name: "Yahoo Finance — Sector Performance",
          type: "SimpleCache",
          description:
            "Broad sector ETF performance data used for cross-asset context in the GeoPolitical widget. Cache TTL: 300 seconds.",
          example: "TTL: 300s | Fallback: null values",
        },
        {
          name: "SimpleCache",
          type: "In-Memory Store",
          description:
            "Server-side in-memory cache implemented as a Map<string, {data, expiresAt}>. Scoped to the Next.js server process. Cache is not shared across serverless function invocations on Vercel — each cold start begins with an empty cache. TTL is enforced on read; stale entries are evicted lazily.",
          example: "No persistence across cold starts",
        },
      ],
    },
    {
      id: "dashboard-market-data-governance",
      anchor: "dashboard-market-data-governance",
      title: "Market Data Governance",
      icon: "ShieldCheck",
      level: 5,
      type: "text",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/api/market/fx/rates/route.ts" },
        { file: "frontend/src/app/api/market/news/fx/route.ts" },
        { file: "frontend/src/app/api/market/calendar/econ/route.ts" },
      ],
      callout: {
        type: "regulatory",
        text: "Market data sourced from Finnhub and Yahoo Finance is indicative only. ORDR Treasury does not provide executable quotes. All rates used in hedge calculations must be confirmed with the executing counterparty before submission.",
      },
      content:
        "**API Key Security**\n\nThe Finnhub API key is stored exclusively as the server-side environment variable `FINNHUB_API_KEY`. It carries no `NEXT_PUBLIC_` prefix and is therefore never bundled into client-side JavaScript. All market data requests are proxied through Next.js API routes (`/api/market/*`) which execute in the Node.js server context. The browser receives only the processed data payload.\n\n**Fallback Reference Data**\n\nEach market data route implements a defensive fallback. If the upstream provider returns a non-2xx response, times out (default 8-second threshold), or returns malformed JSON, the route returns a structured fallback payload with an `isStale: true` flag. Widget components inspect this flag and render a visual stale indicator to alert users that displayed rates may not reflect current market conditions.\n\n**Structured Logging**\n\nEvery market data API route emits a structured JSON log entry on each request, capturing: timestamp, endpoint called, cache hit/miss status, upstream response time (ms), and fallback invocation flag. These logs are available in the Vercel function log stream and can be forwarded to a SIEM for audit purposes.\n\n**Data Lineage for Committees**\n\nFor treasury committee reporting, the source, timestamp, and cache status of all market data used in a calculation run are recorded in the `calculation_runs` WORM table at the time of calculation. This provides a point-in-time audit trail of what market data the engine consumed, enabling reconstruction of any past calculation result.",
    },
  ],
};
