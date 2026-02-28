import type { GuideDoc } from "@/lib/help/guides/types";

export const TROUBLESHOOTING: GuideDoc = {
  id: "troubleshooting",
  title: "Troubleshooting",
  summary:
    "Quick reference for diagnosing and recovering from common ORDR Terminal issues: backend connectivity, SIM DATA fallback, authentication failures, engine errors, and audit chain integrity alerts.",
  path: "/troubleshooting",
  icon: "⚠",
  lastReviewed: "2026-02-28",
  relatedIds: ["getting-started", "governance", "api-reference", "faq"],
  sections: [
    // ─── L1: Quick Reference ─────────────────────────────────────────────────
    {
      id: "ts-quick-ref",
      heading: "Troubleshooting Quick Reference",
      level: "L1",
      verified: false,
      blocks: [
        {
          type: "table",
          table: {
            headers: ["Symptom", "Most Likely Cause", "First Action"],
            rows: [
              ["\"BACKEND OFFLINE\" banner at top of page", "Backend service is unreachable or returning 5xx", "Check /api-health page; check Render.com service status"],
              ["\"SIM DATA\" badge on FX rates widget", "FINNHUB_API_KEY not configured or Finnhub rate limit hit", "Check FINNHUB_API_KEY env var; wait 60 seconds and refresh"],
              ["Widget shows stale data with no error", "In-memory cache serving old data within TTL window", "Wait for TTL to expire (60s–900s depending on widget); hard refresh clears browser cache only"],
              ["Login fails with 401 Unauthorized", "Incorrect credentials or account deactivated", "Verify email/password; check if account is active with admin"],
              ["Login fails with 422 Unprocessable", "Malformed request body (missing email or password field)", "Verify frontend is sending correct JSON body to POST /v1/auth/token"],
              ["Positions page shows empty state with no error", "User has trades.view permission but no positions in DB", "Normal blank-slate state — import positions via CSV or manual entry"],
              ["Positions not loading (spinner)", "Backend offline or JWT expired mid-session", "Check /api-health; try logging out and back in"],
              ["Engine run returns REJECTED", "Decision gate hard rejection condition triggered", "Expand run result to see rejection code and threshold values"],
              ["Audit trail event shows hash FAIL", "Database record may have been modified post-insert", "Escalate immediately to incident response procedure; do not continue operations"],
              ["Dashboard layout resets on every login", "localStorage quota exceeded or browser storage blocked", "Clear site data in browser; check localStorage.dashboard_layout_{userId}"],
            ],
          },
        },
      ],
    },

    // ─── L2: Common Error Recovery ────────────────────────────────────────────
    {
      id: "ts-error-recovery",
      heading: "Common Error Recovery",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "Backend offline errors affect calculation runs, position loading, and audit trail access. No new hedge calculations can be submitted while the backend is offline. Polisophic macro data (Yahoo Finance) will continue to function as it is served by Next.js API routes.",
          },
        },
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Backend Offline Recovery",
              detail: "Navigate to /api-health to see per-service status. If the ORDR backend is unreachable, check Render.com dashboard for the hedgecore service. Typical recovery: service auto-restarts within 60–90 seconds after a cold start. Do not attempt to force calculations during outage.",
            },
            {
              n: 2,
              label: "SIM DATA / Finnhub Rate Limit Recovery",
              detail: "If SIM DATA badge appears, first check that FINNHUB_API_KEY is set in Vercel environment variables (Settings → Environment Variables). Finnhub free tier allows 60 requests/minute. If the key is set and rate limits are being hit, stagger widget refresh intervals or upgrade Finnhub tier.",
            },
            {
              n: 3,
              label: "JWT Expired Mid-Session Recovery",
              detail: "If a user's access token expires (30-minute TTL), the client automatically attempts a refresh using the 7-day refresh token. If both are expired, the user is redirected to /auth/login. This is expected behavior — log back in. If refresh fails unexpectedly, clear browser storage and re-authenticate.",
            },
            {
              n: 4,
              label: "Engine Run REJECTED Recovery",
              detail: "Open the calculation run detail from the Sandbox page. Expand the decision gate section to see the specific rejection code (e.g., cost_too_high, worst_case_too_low). Adjust the hedge parameters: reduce hedge ratio, change instrument, or update policy thresholds. Re-run the engine.",
            },
            {
              n: 5,
              label: "SoD Violation (409 Conflict) Recovery",
              detail: "If you receive a 409 on an approval attempt, you are trying to approve a proposal you created. This is enforced by a DB CHECK constraint — it cannot be overridden. A different user with pipeline.approve permission must be the checker. If no second approver is available, contact your supervisor.",
            },
          ],
        },
      ],
    },

    // ─── L3: API Diagnostic Checklist ─────────────────────────────────────────
    {
      id: "ts-api-checklist",
      heading: "API Diagnostic Checklist",
      level: "L3",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "Use this ordered checklist when diagnosing API connectivity issues. Work through steps sequentially — each step rules out a class of failure before moving to the next.",
        },
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Check /api-health page",
              detail: "Navigate to /api-health in the frontend. This page calls the backend GET /health endpoint and shows per-service status (backend, database, FX rates, macro data). If backend shows DOWN, all subsequent checks are moot until service recovers.",
            },
            {
              n: 2,
              label: "Check FINNHUB_API_KEY environment variable",
              detail: "In Vercel: Settings → Environment Variables → verify FINNHUB_API_KEY is set and not empty. In local dev: check .env.local. Missing key causes SIM DATA fallback for FX rates, FX news, and economic calendar. Does not affect backend connectivity.",
            },
            {
              n: 3,
              label: "Check NEXT_PUBLIC_API_URL environment variable",
              detail: "In Vercel: Settings → Environment Variables → verify NEXT_PUBLIC_API_URL points to the correct backend URL (e.g., https://hedgecore.onrender.com). This is the base URL for all backend API calls from the frontend. An incorrect value will cause all backend calls to fail with network errors.",
            },
            {
              n: 4,
              label: "Check JWT token expiry",
              detail: "Access tokens expire after 30 minutes. If a user is receiving 401 errors on authenticated endpoints mid-session, the token may have expired and auto-refresh failed. Inspect the Authorization header in browser DevTools Network tab — ensure the Bearer token is present and not truncated.",
            },
            {
              n: 5,
              label: "Check CORS headers",
              detail: "If the backend is returning CORS errors (visible in browser console as 'blocked by CORS policy'), verify the backend ALLOWED_ORIGINS configuration includes the frontend domain. CORS errors appear as network failures, not HTTP error codes, in the browser.",
            },
          ],
        },
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "Specific HTTP status codes and error messages are logged to the browser console and to the backend application logs on Render.com. Always check both sources before escalating. [Specific error code details in this section are unverified — consult actual error responses for precise codes.]",
          },
        },
      ],
    },

    // ─── L4: Error Classification ─────────────────────────────────────────────
    {
      id: "ts-error-codes",
      heading: "Error Classification",
      level: "L4",
      verified: false,
      blocks: [
        {
          type: "table",
          table: {
            headers: ["HTTP Status", "Module", "Typical Cause", "Recovery"],
            rows: [
              ["401 Unauthorized", "Auth", "Missing or expired JWT Bearer token; invalid credentials on /auth/token", "Re-authenticate; check token presence in Authorization header"],
              ["403 Forbidden", "RBAC", "User lacks required permission for the operation", "Contact admin to verify role assignment; check required permission in API docs"],
              ["409 Conflict", "Pipeline — SoD", "Attempted to approve own execution_proposal (DB CHECK constraint violation)", "A different user must act as checker; SoD cannot be bypassed"],
              ["422 Unprocessable Entity", "Request validation", "Pydantic validation failure: missing required fields, wrong types, value out of range", "Check request body schema against API reference; inspect error detail field"],
              ["500 Internal Server Error", "Engine / Application", "Unhandled exception in calculation engine, database error, or ORM error", "Check Render.com backend logs; retry once; escalate if persistent"],
              ["503 Service Unavailable", "Backend / Infrastructure", "Backend service cold-starting, overloaded, or deploy in progress", "Wait 60–90 seconds; check Render.com service status; do not retry rapidly"],
            ],
          },
        },
      ],
    },

    // ─── L4: Decision Gate Rejection Codes ───────────────────────────────────
    {
      id: "ts-rejection-codes",
      heading: "Decision Gate Rejection Codes",
      level: "L4",
      verified: true,
      codeRefs: [
        { file: "backend/app/engine/decision_gate.py", symbol: "decision_gate" },
      ],
      blocks: [
        {
          type: "text",
          body: "When the hedge engine returns REJECTED, the decision gate provides one or more reason codes. All rejection reasons have severity HARD — there is no override path. The following table documents all possible hard rejection codes and their remediation.",
        },
        {
          type: "table",
          table: {
            headers: ["Rejection Code", "Threshold", "Cause", "Remediation"],
            rows: [
              ["cost_too_high (bps)", "max_total_cost_bps = 75.0 bps", "Total hedge cost as fraction of notional exceeds 0.75%", "Reduce hedge notional, shorten tenor, or select lower-cost instrument"],
              ["cost_too_high (absolute USD)", "max_total_cost_usd = $25,000", "Total cost exceeds $25k when portfolio notional is not provided", "Provide portfolio_notional_usd in request or reduce hedge size"],
              ["worst_case_too_low", "min_worst_case_net_pnl_usd = -$50,000", "Worst-case scenario net PnL across all scenarios is below -$50k", "Increase hedge ratio, change instrument, or review scenario assumptions"],
              ["effectiveness_too_low", "min_effectiveness = 0.25", "Minimum hedge effectiveness across scenarios is below 25%", "Review instrument selection and hedge ratio; check for basis risk"],
              ["empty_hedge_plan", "require_nonzero_hedges = true", "Hedge plan contains zero contracts — no hedge was sized", "Check position notional and policy parameters; ensure currency pair is supported"],
              ["too_many_rejections", "max_rejected_legs = 0", "One or more hedge legs were rejected by upstream engines (instrument_mapper, hedge_sizer, cost_engine, scenario_engine)", "Review rejection details in run result; check instrument configuration"],
              ["missing_required_input", "N/A", "Required field missing from plan: plan.costs.total or plan.summary.worst_case.net_pnl_usd", "Indicates an upstream engine stage failed to produce required output — check full engine trace"],
              ["unhedged_material_risk", "material_risk_score_threshold = 0.50", "Risk classifier output contains material risks explicitly marked as uncovered", "Review risk classifier output; adjust strategy to address unhedged material risk buckets"],
            ],
          },
        },
      ],
    },

    // ─── L5: Incident Response Procedure ─────────────────────────────────────
    {
      id: "ts-incident-response",
      heading: "Incident Response Procedure",
      level: "L5",
      verified: false,
      callout: {
        type: "failure",
        text: "Any audit chain integrity failure (hash FAIL on any event) is a potential security incident. Do not dismiss it as a data quality issue. Immediately halt all new transaction processing and follow this procedure.",
      },
      blocks: [
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Log the incident",
              detail: "Record the incident in your institution's incident management system. Note: timestamp of discovery, affected event IDs, user who discovered the issue, and system state. Do not modify any database records.",
            },
            {
              n: 2,
              label: "Identify affected positions",
              detail: "Using the audit trail filter, identify all positions whose calculation runs, policy assignments, or execution events fall within the affected hash chain range. These positions may require verification.",
            },
            {
              n: 3,
              label: "Check audit trail for last known good state",
              detail: "Identify the last event in the chain where event_hash is verified correct. All events prior to the first FAIL are cryptographically intact. Events from the FAIL point forward require investigation.",
            },
            {
              n: 4,
              label: "Preserve evidence",
              detail: "Export the full audit trail (JSON) for the affected tenant and date range before any system changes. Store in an immutable external system. This export is your primary evidence record.",
            },
            {
              n: 5,
              label: "Contact support",
              detail: "Contact ORDR Terminal support with: (1) the affected event IDs, (2) the exported audit trail JSON, (3) the incident log. Do not attempt to repair the hash chain — this would constitute further tampering.",
            },
            {
              n: 6,
              label: "Remediation and recovery",
              detail: "Remediation requires a system-level review by authorized personnel. Correction events are appended (new WORM rows) documenting the investigation findings. The original events are never modified.",
            },
          ],
        },
      ],
    },
  ],
};
