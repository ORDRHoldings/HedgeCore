import type { GuideDoc } from "@/lib/help/guides/types";

export const DASHBOARD_WIDGETS: GuideDoc = {
  id: "dashboard-widgets",
  title: "Dashboard & Widgets",
  summary:
    "Complete reference for the 19 registered dashboard widgets, 11 role-based default layouts, layout customisation, live market data sources, and the Risk Pulse scoring formula.",
  path: "/dashboard",
  icon: "LayoutDashboard",
  lastReviewed: "2026-02-28",
  relatedIds: ["getting-started", "position-desk", "sandbox-simulation"],
  sections: [
    // ─── L1: Dashboard Overview ────────────────────────────────────────────────
    {
      id: "dashboard-widgets-overview",
      heading: "Dashboard Overview",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "frontend/src/lib/widgets/widgetRegistry.ts", symbol: "WIDGET_REGISTRY" },
      ],
      blocks: [
        {
          type: "text",
          body: "The ORDR Treasury dashboard is a fully customisable grid of 19 registered widgets. Each widget is an independent data panel that can be added, removed, dragged, and resized within a 12-column responsive grid layout. Layout state is persisted per-user in localStorage under the key dashboard_layout_{userId}.",
        },
        {
          type: "table",
          table: {
            headers: ["Property", "Value"],
            rows: [
              ["Total registered widgets", "19"],
              ["Role-based default layouts", "11 (one per named role + default fallback)"],
              ["Grid columns", "12"],
              ["Layout persistence", "localStorage — survives page reload, cleared on logout or explicit reset"],
              ["Drag handle", "Widget header bar (className='widget-drag-handle')"],
              ["Resize handle", "Bottom-right corner of each widget"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "If no layout is saved for your user, the system applies the default layout for your primary role. If your role is not in the registry, the fallback layout (Risk Pulse, Command Hub, Geopolitical, USD Exposure Radar) is used.",
          },
        },
      ],
    },

    // ─── L1: Widget Catalog ────────────────────────────────────────────────────
    {
      id: "dashboard-widgets-catalog",
      heading: "Widget Catalog",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "frontend/src/lib/widgets/widgetRegistry.ts", symbol: "WIDGET_REGISTRY" },
      ],
      blocks: [
        {
          type: "text",
          body: "All 19 widgets registered in WIDGET_REGISTRY. Default size is given as columns × rows on the 12-column grid. Min size is the smallest the widget can be resized to.",
        },
        {
          type: "table",
          table: {
            headers: ["Widget ID", "Title", "Description", "Default W×H", "Min W×H", "Permission"],
            rows: [
              ["kpi_summary", "Portfolio KPIs", "Key metrics: exposure, coverage, proposals, alerts. Scoped to authority.", "12×3", "6×2", "none"],
              ["recent_runs", "My Recent Runs", "Last 10 sandbox and ledger calculation runs initiated by you.", "6×5", "4×3", "none"],
              ["pending_approvals", "Pending Approvals", "Staging artifacts awaiting review and approval decision.", "6×5", "4×3", "pipeline.approve"],
              ["team_activity", "Team Activity", "Live activity feed for your branch or company-wide.", "6×6", "4×4", "audit.view_branch"],
              ["branch_comparison", "Branch Risk Comparison", "Side-by-side risk and exposure metrics across all branches.", "8×5", "6×4", "reports.view_all_branches"],
              ["polisophic_mini", "Geopolitical Risk", "Top risk events and currency-exposure alerts for your portfolio.", "6×5", "4×3", "none"],
              ["quick_actions", "Quick Actions", "Permission-gated shortcuts to most common actions.", "4×4", "3×3", "none"],
              ["exposure_summary", "FX Exposure Summary", "Currency exposure breakdown: notional amounts and hedge coverage by pair.", "6×5", "4×3", "trades.view"],
              ["pipeline_status", "Pipeline Status", "Tri-state pipeline funnel: Sandbox → Staging → Ledger counts.", "6×4", "4×3", "pipeline.create_proposal"],
              ["fx_rates", "FX Rates", "Live and BIS-calibrated exchange rates for 8 major and EM currency pairs.", "6×5", "4×4", "none"],
              ["currency_intel", "Currency Intelligence", "Macro data, central bank policy, risk scores, and news feed for exposure currencies.", "6×8", "5×6", "none"],
              ["hedge_health", "Hedge Health", "Composite health score across coverage, policy, approvals, positions, and pipeline.", "4×6", "3×5", "none"],
              ["market_pulse", "Market Pulse", "Real-time market context: key indices, FX pairs, commodities, bond yields.", "8×4", "6×3", "none"],
              ["command_hub", "Command Hub", "Visual navigation grid to every module. Role-filtered, color-coded.", "6×6", "4×4", "none"],
              ["geopolitical", "Geopolitical & Macro", "Political risk events, macro tape, and central bank tracker. Tabbed 3-panel view.", "6×7", "5×5", "none"],
              ["usd_exposure_radar", "USD Exposure Radar", "USD dynamics: DXY, real yields, Fed positioning, FX matrix with vol/carry.", "6×7", "5×5", "none"],
              ["risk_pulse", "Risk Pulse", "Live FX risk score derived from news volume and economic calendar impact.", "4×6", "3×5", "none"],
              ["fx_news", "FX News", "Latest forex headlines from Finnhub. Scrollable feed with source, relative time, links.", "4×8", "3×5", "none"],
              ["econ_calendar", "Econ Calendar", "7-day economic calendar with impact scoring. Actual vs estimate vs prior.", "6×8", "4×5", "none"],
            ],
          },
        },
      ],
    },

    // ─── L2: Customising Your Layout ──────────────────────────────────────────
    {
      id: "dashboard-widgets-customise-layout",
      heading: "Customising Your Layout",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Open the Widget Catalog",
              detail: "Click the '+ Add Widget' button in the dashboard toolbar. The catalog panel slides in from the right, showing all 19 widgets with descriptions.",
            },
            {
              n: 2,
              label: "Add a widget",
              detail: "Click the add button next to any widget in the catalog. The widget appears in the next available grid position. Widgets requiring permissions you lack are greyed out.",
            },
            {
              n: 3,
              label: "Drag to position",
              detail: "Click and hold the widget header bar (the drag handle) and drag the widget to the desired grid position. Other widgets reflow automatically.",
            },
            {
              n: 4,
              label: "Resize from the corner",
              detail: "Drag the resize handle at the bottom-right corner of any widget to adjust its width and height. Widgets respect their minimum size constraints.",
            },
            {
              n: 5,
              label: "Remove a widget",
              detail: "Click the × close button in the widget header. The widget is removed from your layout. It can be re-added at any time via the catalog.",
            },
            {
              n: 6,
              label: "Layout auto-saved",
              detail: "Every drag, resize, add, and remove is persisted immediately to localStorage under dashboard_layout_{userId}. No explicit save action is required.",
            },
          ],
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "To reset your layout to the role default, clear your browser localStorage key dashboard_layout_{userId} and refresh the page.",
          },
        },
      ],
    },

    // ─── L2: Live Market Data Widgets ─────────────────────────────────────────
    {
      id: "dashboard-widgets-market-data",
      heading: "Live Market Data Widgets",
      level: "L2",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/api/market/" },
        { file: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx" },
      ],
      blocks: [
        {
          type: "text",
          body: "Six widgets consume live market data. Data is fetched server-side via Next.js API routes to keep API keys out of the browser. Each endpoint uses an in-memory SimpleCache with a per-source TTL.",
        },
        {
          type: "table",
          table: {
            headers: ["Widget", "Data Source", "TTL", "Content"],
            rows: [
              ["Risk Pulse (risk_pulse)", "Finnhub news + Econ calendar", "60s / 300s", "Risk score from news volume and event impact"],
              ["Geopolitical & Macro (geopolitical)", "Finnhub news", "300s", "Political risk events, macro tape, central bank tracker"],
              ["Market Pulse (market_pulse)", "Yahoo Finance", "300s", "Equity indices, FX, commodities, bond yields"],
              ["USD Exposure Radar (usd_exposure_radar)", "Yahoo Finance + Finnhub", "300s / 60s", "DXY, real yields, FX matrix, vol/carry"],
              ["FX News (fx_news)", "Finnhub", "300s", "Forex headlines with source and timestamp"],
              ["Econ Calendar (econ_calendar)", "Finnhub", "900s", "7-day event calendar with impact and estimates"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "All market data endpoints include a reference data fallback. If a live fetch fails, the widget displays the last cached value or a structured fallback payload — it does not show a blank panel.",
          },
        },
      ],
    },

    // ─── L3: Risk Pulse Score Formula ─────────────────────────────────────────
    {
      id: "dashboard-widgets-risk-pulse-formula",
      heading: "Risk Pulse Score Formula",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx" },
      ],
      blocks: [
        {
          type: "text",
          body: "The Risk Pulse widget computes a live FX risk score from news volume and economic calendar event impact. The score is a weighted sum of three inputs, updated every 60 seconds.",
        },
        {
          type: "formula",
          formula: {
            label: "Risk Pulse Score",
            expression: "Score = (N_24h × 1.0) + (E_high × 3.0) + (E_med × 1.5)",
            explanation:
              "N_24h = total FX news articles in the last 24 hours; E_high = count of high-impact economic calendar events in the next 7 days; E_med = count of medium-impact events in the next 7 days.",
            source: "RiskPulseWidget.tsx",
            codeRef: { file: "frontend/src/components/dashboard/widgets/RiskPulseWidget.tsx" },
          },
        },
        {
          type: "table",
          table: {
            headers: ["Score Range", "Label", "Visual Indicator"],
            rows: [
              ["< 3.0", "LOW", "Green"],
              ["3.0 – 7.99", "MEDIUM", "Amber"],
              ["≥ 8.0", "HIGH", "Red"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "The Risk Pulse score is an indicative heuristic. It does not constitute a trading signal or risk management recommendation. Use it to monitor whether macro conditions warrant closer review of open positions.",
          },
        },
      ],
    },

    // ─── L3: Market Data Architecture ────────────────────────────────────────
    {
      id: "dashboard-widgets-market-architecture",
      heading: "Market Data Architecture",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/api/market/" },
      ],
      blocks: [
        {
          type: "text",
          body: "Market data is fetched server-side only. API keys (FINNHUB_API_KEY) are environment variables on the Next.js server — they are never exposed to the browser via NEXT_PUBLIC_ prefixes. Client components call internal API routes (/api/market/...) which proxy and cache the external responses.",
        },
        {
          type: "table",
          table: {
            headers: ["Provider", "Endpoints Used", "Cache TTL", "Content"],
            rows: [
              ["Finnhub", "/api/market/fx-rates", "60 seconds", "Live FX spot rates for major and EM pairs"],
              ["Finnhub", "/api/market/fx-news", "300 seconds", "Latest forex headlines"],
              ["Finnhub", "/api/market/econ-calendar", "900 seconds", "Economic calendar with impact ratings"],
              ["Yahoo Finance", "/api/market/macro", "300 seconds", "Equity indices, sector performance"],
              ["Yahoo Finance", "/api/market/sectors", "300 seconds", "Sector ETF performance breakdown"],
            ],
          },
        },
        {
          type: "text",
          body: "Caching is handled by an in-memory SimpleCache keyed by endpoint and parameters. Each cache entry stores the response payload and an expiry timestamp. On cache miss, the server makes the external API call, stores the result, and returns it. On provider failure, the last cached value is returned if available; otherwise, a structured fallback payload is returned.",
        },
        {
          type: "callout",
          callout: {
            type: "control",
            text: "Each server-side API route emits a structured JSON log per request, including cache hit/miss status, provider response time, and any error codes. These logs are available in the Vercel function logs for operational monitoring.",
          },
        },
      ],
    },

    // ─── L4: Role-Based Default Layouts ───────────────────────────────────────
    {
      id: "dashboard-widgets-role-layouts",
      heading: "Role-Based Default Layouts",
      level: "L4",
      verified: true,
      codeRefs: [
        { file: "frontend/src/lib/widgets/widgetRegistry.ts", symbol: "ROLE_LAYOUTS" },
      ],
      blocks: [
        {
          type: "text",
          body: "When a user first accesses the dashboard (or resets their layout), the system applies the default layout registered for their primary role. The following table shows which widgets each role receives by default.",
        },
        {
          type: "table",
          table: {
            headers: ["Role", "Default Widget IDs"],
            rows: [
              ["admin", "risk_pulse, command_hub, geopolitical, usd_exposure_radar, market_pulse, currency_intel"],
              ["ceo", "kpi_summary, branch_comparison, pending_approvals, polisophic_mini, team_activity"],
              ["cfo", "kpi_summary, exposure_summary, fx_rates, branch_comparison, polisophic_mini, recent_runs"],
              ["head_of_risk", "kpi_summary, pending_approvals, polisophic_mini, branch_comparison, team_activity"],
              ["branch_manager", "kpi_summary, pending_approvals, team_activity, polisophic_mini, recent_runs"],
              ["supervisor", "kpi_summary, pending_approvals, recent_runs, team_activity, quick_actions"],
              ["senior_analyst", "recent_runs, exposure_summary, fx_rates, polisophic_mini, pipeline_status, quick_actions"],
              ["risk_analyst", "recent_runs, polisophic_mini, quick_actions, exposure_summary"],
              ["junior_analyst", "recent_runs, quick_actions, polisophic_mini"],
              ["auditor", "team_activity, pipeline_status, recent_runs, kpi_summary"],
              ["default (fallback)", "risk_pulse, command_hub, geopolitical, usd_exposure_radar"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "Role-based defaults are starting points only. Each user can customise their layout freely. Customisations are per-user and do not affect other users with the same role.",
          },
        },
      ],
    },

    // ─── L5: Market Data Governance ───────────────────────────────────────────
    {
      id: "dashboard-widgets-market-governance",
      heading: "Market Data Governance",
      level: "L5",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/api/market/" },
      ],
      blocks: [
        {
          type: "text",
          body: "Market data displayed on the dashboard is reference data only. It is used for situational awareness and indicative scoring. No market data from Finnhub or Yahoo Finance is written to the hedge calculation engine's deterministic inputs — the engine requires explicitly provided, auditor-reviewed market inputs.",
        },
        {
          type: "table",
          table: {
            headers: ["Control", "Implementation"],
            rows: [
              ["API key isolation", "FINNHUB_API_KEY is a server-side environment variable only. No NEXT_PUBLIC_ prefix."],
              ["Provider fallback", "All endpoints return structured JSON on provider failure; widgets never render blank."],
              ["Structured logging", "Each route logs: endpoint, cache_hit, provider_latency_ms, status_code, error_code."],
              ["No engine feed", "Dashboard market data does not flow into calculation_runs. Engine inputs are separately provided."],
              ["TTL enforcement", "SimpleCache enforces TTLs deterministically; stale data is not served beyond TTL window."],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "Market data on the dashboard is informational. For hedge calculation purposes, market inputs must be explicitly provided by the analyst at calculation time and are recorded in the immutable calculation_run decision trace. Dashboard market data rates are not used as engine inputs.",
          },
        },
      ],
    },
  ],
};
