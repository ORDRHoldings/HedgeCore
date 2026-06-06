import type { GuideDoc } from "@/lib/help/guides/types";

export const API_REFERENCE: GuideDoc = {
  id: "api-reference",
  title: "API Reference",
  summary:
    "REST API reference for ORDR Treasury: authentication, key backend endpoints, Next.js market data routes, request/response format, rate limits, and API governance.",
  path: "/api-reference",
  icon: "〈〉",
  lastReviewed: "2026-02-28",
  relatedIds: ["getting-started", "governance", "troubleshooting", "faq"],
  sections: [
    // ─── L1: API Overview ─────────────────────────────────────────────────────
    {
      id: "api-overview",
      heading: "API Overview",
      level: "L1",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "ORDR Treasury exposes two API layers: (1) the Python FastAPI backend, accessed via the NEXT_PUBLIC_API_URL environment variable, and (2) the Next.js API routes hosted alongside the frontend on Vercel. All APIs are REST/JSON. Authentication for backend endpoints uses JWT Bearer tokens or HK_live_ API keys.",
        },
        {
          type: "table",
          table: {
            headers: ["API Layer", "Base URL", "Auth Method", "Purpose"],
            rows: [
              ["Backend (FastAPI)", "NEXT_PUBLIC_API_URL (e.g. https://hedgecore.onrender.com)", "JWT Bearer / HK_live_ API key", "Business logic: positions, policies, engine, audit, users"],
              ["Frontend Next.js routes", "/api/* (same origin as frontend)", "None — server-to-server proxy; inherits frontend session", "Market data: FX rates, news, macro, sectors, geo-news"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "The exact count of backend API routes is not verified here. The frontend Next.js API routes number approximately 6 market data routes plus additional internal routes. [Route count: Unverified — consult backend/app/api/routes/ for the authoritative list.]",
          },
        },
      ],
    },

    // ─── L2: Authentication ───────────────────────────────────────────────────
    {
      id: "api-auth",
      heading: "Authentication",
      level: "L2",
      verified: true,
      codeRefs: [
        { file: "backend/app/core/security.py" },
      ],
      blocks: [
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Request a token",
              detail: "POST /v1/auth/token with JSON body {\"email\": \"user@domain.com\", \"password\": \"yourpassword\"}. The endpoint returns {\"access_token\": \"...\", \"refresh_token\": \"...\", \"token_type\": \"bearer\"}.",
            },
            {
              n: 2,
              label: "Use the access token",
              detail: "Include the access token in every subsequent request as an Authorization header: Authorization: Bearer <access_token>. The token is a JWT HS256 with a 30-minute expiry.",
            },
            {
              n: 3,
              label: "Refresh the access token",
              detail: "When the access token expires, POST /v1/auth/refresh with {\"refresh_token\": \"...\"} to obtain a new access token. The refresh token is valid for 7 days. After 7 days, the user must re-authenticate.",
            },
            {
              n: 4,
              label: "API key authentication (service accounts)",
              detail: "For programmatic access and integrations, use an HK_live_ prefixed API key in the Authorization header: Authorization: Bearer HK_live_<key>. API keys are bcrypt-hashed in the api_keys table. Keys carry the same RBAC checks as user session tokens.",
            },
          ],
        },
        {
          type: "code",
          lang: "bash",
          code: `# Obtain access token
curl -X POST "${"{"}NEXT_PUBLIC_API_URL{"}"}/v1/auth/token" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"demo@example.com","password":"demo"}'

# Use token in subsequent request
curl "${"{"}NEXT_PUBLIC_API_URL{"}"}/v1/dashboard/summary" \\
  -H "Authorization: Bearer <access_token>"`,
        },
      ],
    },

    // ─── L2: Key Endpoints ────────────────────────────────────────────────────
    {
      id: "api-endpoints",
      heading: "Key Endpoints",
      level: "L2",
      verified: false,
      callout: {
        type: "warning",
        text: "Endpoint paths below are based on codebase conventions and CLAUDE.md documentation. Verify exact paths against backend/app/api/routes/ source files for production use. [Unverified for all specific paths.]",
      },
      blocks: [
        {
          type: "table",
          table: {
            headers: ["Endpoint", "Method", "Auth Required", "Description"],
            rows: [
              ["POST /v1/auth/token", "POST", "No", "Exchange email+password for JWT access token and refresh token"],
              ["POST /v1/auth/refresh", "POST", "Refresh token", "Exchange refresh token for new access token"],
              ["GET /v1/positions", "GET", "trades.view", "List all FX exposure positions for the tenant"],
              ["POST /v1/positions", "POST", "trades.create", "Create a new FX exposure position"],
              ["GET /v1/positions/{id}", "GET", "trades.view", "Get details of a specific position"],
              ["GET /v1/policies", "GET", "policy.view", "List active policy templates"],
              ["GET /v1/policies/active", "GET", "policy.view", "Get current active policy instance"],
              ["POST /v1/sandbox/calculate", "POST", "calculate.run_sandbox", "Run sandbox hedge calculation for a position"],
              ["GET /v1/runs", "GET", "calculate.run_sandbox", "List calculation run history"],
              ["GET /v1/runs/{id}", "GET", "calculate.run_sandbox", "Get full calculation run result including decision trace"],
              ["GET /v1/dashboard/summary", "GET", "trades.view", "KPI summary: total exposure, coverage ratio, pending proposals, alerts"],
              ["GET /v1/dashboard/recent-runs", "GET", "calculate.run_sandbox", "Last 10 calculation runs with verdicts"],
              ["GET /v1/dashboard/pending-approvals", "GET", "pipeline.approve", "Proposals awaiting checker approval"],
              ["GET /v1/audit-events", "GET", "audit.view_own (min)", "List audit events with filtering"],
              ["GET /health", "GET", "No", "Backend health check — returns service status"],
            ],
          },
        },
      ],
    },

    // ─── L3: Request / Response Format ───────────────────────────────────────
    {
      id: "api-format",
      heading: "Request / Response Format",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "backend/app/main.py" },
      ],
      blocks: [
        {
          type: "text",
          body: "All ORDR Treasury API requests and responses use JSON. Field naming follows snake_case throughout. The FastAPI framework enforces request validation via Pydantic v2 schemas — invalid requests return 422 with a structured error body.",
        },
        {
          type: "field-dict",
          fields: [
            {
              name: "Content-Type",
              type: "header",
              constraints: "Required for POST/PATCH requests",
              meaning: "All request bodies must be JSON",
              example: "Content-Type: application/json",
            },
            {
              name: "Pagination",
              type: "query parameters",
              constraints: "limit (int, default 20, max varies), offset (int, default 0)",
              meaning: "All list endpoints support limit/offset pagination",
              example: "GET /v1/audit-events?limit=50&offset=100",
            },
            {
              name: "Error Response",
              type: "JSON object",
              constraints: "Always {\"detail\": string | object}",
              meaning: "FastAPI standard error format. 422 errors include a list of validation failures.",
              example: "{\"detail\": \"Position not found\"}",
            },
            {
              name: "Field Names",
              type: "string",
              constraints: "snake_case throughout",
              meaning: "All request and response fields use snake_case (e.g., hedge_notional, not hedgeNotional)",
              example: "hedge_notional, currency_pair, created_at",
            },
          ],
        },
        {
          type: "code",
          lang: "json",
          code: `// Successful response example (GET /v1/dashboard/summary)
{
  "total_exposure_usd": 4250000.00,
  "coverage_ratio": 0.72,
  "pending_proposals": 3,
  "active_alerts": 1,
  "last_run_at": "2026-02-28T09:42:11.000Z"
}

// Error response example (422 Unprocessable Entity)
{
  "detail": [
    {
      "loc": ["body", "currency_pair"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}`,
        },
      ],
    },

    // ─── L3: Market Data API Routes ───────────────────────────────────────────
    {
      id: "api-market-routes",
      heading: "Market Data API Routes",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/api/market/fx/rates/route.ts", endpoint: "GET /api/market/fx/rates" },
        { file: "frontend/src/app/api/market/news/fx/route.ts", endpoint: "GET /api/market/news/fx" },
        { file: "frontend/src/app/api/market/calendar/econ/route.ts", endpoint: "GET /api/market/calendar/econ" },
        { file: "frontend/src/app/api/market/macro/route.ts", endpoint: "GET /api/market/macro" },
        { file: "frontend/src/app/api/market-sectors/route.ts", endpoint: "GET /api/market-sectors" },
        { file: "frontend/src/app/api/geo-news/route.ts", endpoint: "GET /api/geo-news" },
      ],
      blocks: [
        {
          type: "table",
          table: {
            headers: ["Next.js Route", "Method", "Data Source", "Cache TTL", "Description"],
            rows: [
              ["GET /api/market/fx/rates", "GET", "Finnhub /forex/rates?base=USD", "60s", "8 FX pair spot rates; fallback to BIS reference rates"],
              ["GET /api/market/news/fx", "GET", "Finnhub /news?category=forex", "300s", "FX news articles from Finnhub forex category"],
              ["GET /api/market/calendar/econ", "GET", "Finnhub /calendar/economic", "900s", "7-day forward economic event calendar with impact levels"],
              ["GET /api/market/macro", "GET", "Yahoo Finance v8/finance/chart", "300s", "DXY, VIX, US 10Y, Brent, Gold; static Fed Funds rate"],
              ["GET /api/market-sectors", "GET", "Finnhub /quote (15 symbols)", "300s", "4 market ETFs (SPY/QQQ/DIA/IWM) + 11 SPDR sector ETFs"],
              ["GET /api/geo-news", "GET", "Yahoo Finance v1/finance/search (5 queries)", "600s", "Top 15 geo-political news articles, deduplicated by UUID"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "All market data routes are Next.js API routes hosted on Vercel. They do not require JWT authentication — they are server-to-server proxies that hide Finnhub API keys from the browser. Responses are cached server-side at the TTL shown; CDN s-maxage headers are also set where applicable.",
          },
        },
      ],
    },

    // ─── L4: Rate Limits & Quotas ─────────────────────────────────────────────
    {
      id: "api-rate-limits",
      heading: "Rate Limits & Quotas",
      level: "L4",
      verified: true,
      codeRefs: [
        { file: "backend/app/core/security.py" },
        { file: "frontend/src/app/api/market-sectors/route.ts" },
      ],
      blocks: [
        {
          type: "table",
          table: {
            headers: ["Component", "Limit", "Enforcement", "Notes"],
            rows: [
              ["Finnhub free tier", "60 requests/minute", "Finnhub API (external)", "All 5 market data routes share the same API key quota. 15 sector symbols fetched in parallel = 15 req per /api/market-sectors call."],
              ["JWT access token", "30-minute lifetime", "Backend JWT decode", "Auto-refreshed by frontend using refresh token"],
              ["JWT refresh token", "7-day lifetime", "Backend JWT decode", "After expiry, user must re-authenticate via /v1/auth/token"],
              ["Backend rate limiting", "Not configured in v1", "None", "No explicit rate limit middleware on backend endpoints [Unverified — check middleware order in backend/app/main.py]"],
              ["Next.js API routes (Vercel)", "Vercel function invocation limits apply", "Vercel platform", "Subject to Vercel plan limits; cache TTLs reduce invocation frequency significantly"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "On the Finnhub free tier, the /api/market-sectors route fetches 15 symbols in parallel — consuming 15 of the 60 available requests per minute per call. If multiple users request market-sectors simultaneously before the cache warms, the quota may be exceeded. Consider upgrading to a paid Finnhub tier for production deployments with multiple concurrent users.",
          },
        },
      ],
    },

    // ─── L5: API Governance ───────────────────────────────────────────────────
    {
      id: "api-governance",
      heading: "API Governance",
      level: "L5",
      verified: true,
      codeRefs: [
        { file: "backend/app/core/security.py" },
        { file: "backend/app/models/audit_event.py", symbol: "build_audit_event" },
      ],
      blocks: [
        {
          type: "text",
          body: "All backend API calls are subject to ORDR Treasury's governance controls: RBAC permission checks, WORM audit logging, and (for execution paths) 4-eyes segregation of duties enforcement.",
        },
        {
          type: "table",
          table: {
            headers: ["Governance Control", "Applied At", "Scope"],
            rows: [
              ["RBAC permission check", "Every authenticated backend endpoint", "Permission validated against user's assigned roles before any business logic executes"],
              ["Audit event written", "All state-changing operations", "INGEST, POLICY, CALCULATE, LIFECYCLE, EXECUTION, REJECTION events written to WORM audit_events table"],
              ["4-Eyes SoD enforcement", "POST /v1/execution-proposals/{id}/approve", "DB CHECK constraint prevents same actor from proposing and approving"],
              ["API key hashing", "Key creation and validation", "HK_live_ keys are bcrypt-hashed in api_keys table; plaintext key is shown only at creation time and never again"],
              ["API versioning", "/v1/ prefix on all backend routes", "Version prefix allows future non-breaking evolution [Versioning policy: Unverified]"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "API key rotation is the responsibility of the organization's security administrator. When an API key is rotated, the old key should be revoked immediately via the admin API. All API key usage is logged in audit_events. For compliance purposes, API keys should be rotated according to your institution's credential management policy.",
          },
        },
      ],
    },
  ],
};
