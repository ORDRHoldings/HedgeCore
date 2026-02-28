import type { GuideDoc } from "@/lib/help/guides/types";

export const GETTING_STARTED: GuideDoc = {
  id: "getting-started",
  title: "Getting Started",
  summary:
    "Introduction to ORDR Terminal: institutional FX hedge governance, the tri-state pipeline, authentication, role-based access, and the audit trail that begins on first login.",
  path: "/dashboard",
  icon: "BookOpen",
  lastReviewed: "2026-02-28",
  relatedIds: ["dashboard-widgets", "position-desk", "policy-engine", "execution-pipeline"],
  sections: [
    // ─── L1: What is ORDR Terminal? ──────────────────────────────────────────
    {
      id: "getting-started-what-is-ordr",
      heading: "What is ORDR Terminal?",
      level: "L1",
      verified: true,
      codeRefs: [
        { file: "backend/app/engine/recommend.py", symbol: "recommend" },
        { file: "backend/app/models/position.py", symbol: "Position" },
      ],
      blocks: [
        {
          type: "text",
          body: "ORDR Terminal is an institutional FX hedge calculation and governance platform. It provides a deterministic, audit-safe workflow for corporate treasury teams managing foreign-exchange exposure: from raw position ingestion through policy assignment, engine-driven hedge recommendation, four-eyes approval, and immutable ledger commit.",
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "v1 scope: ORDR Terminal is deterministic and governance-focused. It does not include ML/auto-learning, broker execution connectivity, or stateful pricing feeds.",
          },
        },
        {
          type: "table",
          table: {
            headers: ["Pipeline State", "Description", "Key Action"],
            rows: [
              ["SANDBOX", "Engine runs in simulation mode. No ledger write.", "Calculate & iterate freely"],
              ["STAGING", "Proposal under four-eyes review. Immutable artifact.", "Maker submits; checker approves"],
              ["LEDGER", "Approved trade committed. WORM append-only.", "Authorized by pipeline.authorize_ledger"],
            ],
          },
        },
        {
          type: "text",
          body: "The tri-state pipeline (SANDBOX → STAGING → LEDGER) ensures every hedge plan passes through a governed review cycle before any permanent record is written. All state transitions are logged in the tamper-evident audit trail.",
        },
      ],
    },

    // ─── L1: Prerequisites ────────────────────────────────────────────────────
    {
      id: "getting-started-prerequisites",
      heading: "Prerequisites",
      level: "L1",
      verified: false,
      blocks: [
        {
          type: "text",
          body: "Before using ORDR Terminal you need: (1) a user account with a role assigned by an administrator, (2) a supported browser (Chromium-based or Firefox, desktop viewport), and (3) network access to the deployed instance.",
        },
        {
          type: "field-dict",
          fields: [
            {
              name: "Login URL",
              type: "string",
              meaning: "Navigate to /auth/login on your deployed instance",
              example: "https://ordr-terminal.vercel.app/auth/login",
            },
            {
              name: "Default demo credentials",
              type: "string",
              meaning: "Demo environment only — admin account with full permissions",
              example: "username: demo / password: demo",
            },
            {
              name: "Role assignment",
              type: "enum",
              constraints: "Assigned by admin before first login",
              meaning: "Determines which dashboard widgets, permissions, and data are visible",
              example: "risk_analyst, supervisor, cfo",
            },
            {
              name: "Browser requirement",
              type: "string",
              meaning: "Modern browser with ES2022 support; minimum 1280px viewport recommended",
              example: "Chrome 120+, Firefox 121+, Edge 120+",
            },
          ],
        },
        {
          type: "callout",
          callout: {
            type: "warning",
            text: "The demo/demo credentials are for the demonstration environment only. Production deployments require strong passwords (12+ characters). The demo password bypasses the minimum-length check at the database seed level only.",
          },
        },
      ],
    },

    // ─── L2: First Login Walkthrough ──────────────────────────────────────────
    {
      id: "getting-started-first-login",
      heading: "First Login Walkthrough",
      level: "L2",
      verified: false,
      blocks: [
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Navigate to the login page",
              detail: "Open /auth/login. You will see the ORDR Terminal login screen with email and password fields.",
            },
            {
              n: 2,
              label: "Enter your credentials",
              detail: "Enter your email address and password. On the demo environment, use demo / demo.",
            },
            {
              n: 3,
              label: "Authentication and token issuance",
              detail: "The server validates credentials, issues a 30-minute JWT access token and a 7-day refresh token (HS256). Both are stored in the browser session.",
            },
            {
              n: 4,
              label: "Dashboard loads with role-based layout",
              detail: "The dashboard detects your primary role and applies the corresponding default widget layout from widgetRegistry.ts. Layout is then persisted to localStorage under dashboard_layout_{userId}.",
            },
            {
              n: 5,
              label: "Audit event written",
              detail: "A USER_LOGIN audit event is appended to the audit_events table with your user_id, timestamp, IP, and the SHA-256 hash chained to the previous event in your tenant's chain.",
            },
          ],
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "If your role has not been assigned yet, the dashboard will load with the default fallback layout (Risk Pulse, Command Hub, Geopolitical, USD Exposure Radar). Contact your administrator to assign a role.",
          },
        },
      ],
    },

    // ─── L2: Core Workflow Overview ───────────────────────────────────────────
    {
      id: "getting-started-core-workflow",
      heading: "Core Workflow Overview",
      level: "L2",
      verified: true,
      codeRefs: [
        { file: "backend/app/engine/recommend.py", symbol: "recommend", endpoint: "ENGINE_VERSION" },
      ],
      blocks: [
        {
          type: "text",
          body: "The end-to-end workflow runs from position ingestion to ledger commit. The hedge engine (ENGINE_VERSION 1.0.3) runs seven deterministic stages internally; the governance workflow runs five external steps that a team works through together.",
        },
        {
          type: "steps",
          steps: [
            {
              n: 1,
              label: "Ingest positions",
              detail: "Import FX exposure positions (CSV, manual entry, or ERP connector). Each position enters the lifecycle at status NEW.",
            },
            {
              n: 2,
              label: "Assign policy",
              detail: "A supervisor or risk analyst assigns a policy template to the position. Status transitions to POLICY_ASSIGNED.",
            },
            {
              n: 3,
              label: "Mark ready to execute",
              detail: "After review, the position is marked READY_TO_EXECUTE. This signals the position is eligible for a hedge proposal.",
            },
            {
              n: 4,
              label: "Run sandbox calculation",
              detail: "An analyst runs the 7-stage engine in SANDBOX mode. No ledger write occurs. The engine produces a plan_id with full decision trace.",
            },
            {
              n: 5,
              label: "Promote to staging",
              detail: "The analyst promotes the sandbox result to a staging artifact (execution proposal). The artifact is immutable at this point.",
            },
            {
              n: 6,
              label: "Four-eyes approval",
              detail: "A separate checker (approved_by ≠ proposed_by) reviews and approves or rejects the proposal. This segregation of duties is enforced at the database level.",
            },
            {
              n: 7,
              label: "Ledger commit",
              detail: "On approval, a ledger_entry is appended (WORM). Position transitions to HEDGED. The daily Merkle root is updated.",
            },
          ],
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "Each step from sandbox calculation to ledger commit is recorded in the SHA-256 hash-chained audit trail. The decision trace attached to each calculation run is immutable and can be replayed deterministically.",
          },
        },
      ],
    },

    // ─── L3: Authentication System ────────────────────────────────────────────
    {
      id: "getting-started-authentication",
      heading: "Authentication System",
      level: "L3",
      verified: true,
      codeRefs: [
        { file: "backend/app/core/security.py" },
      ],
      blocks: [
        {
          type: "text",
          body: "ORDR Terminal uses JWT HS256 for session authentication and bcrypt for password storage. API key authentication is available for programmatic access.",
        },
        {
          type: "table",
          table: {
            headers: ["Credential Type", "Algorithm", "Expiry", "Storage"],
            rows: [
              ["Access token", "JWT HS256", "30 minutes", "Browser memory / Authorization header"],
              ["Refresh token", "JWT HS256", "7 days", "HttpOnly cookie or secure storage"],
              ["Password", "bcrypt", "Never expires", "Hashed in users table (never stored plaintext)"],
              ["API key", "HK_live_ prefix + random bytes", "Until revoked", "Hashed in api_keys table"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "info",
            text: "API keys use the prefix HK_live_ and are intended for server-to-server integration. They carry the same RBAC checks as session tokens.",
          },
        },
        {
          type: "text",
          body: "When an access token expires, the client transparently refreshes it using the refresh token. If the refresh token is also expired or revoked, the user is redirected to the login page. All authentication events — successful login, failed login, token refresh, logout — are appended to the audit trail.",
        },
      ],
    },

    // ─── L4: RBAC & Permission System ─────────────────────────────────────────
    {
      id: "getting-started-rbac",
      heading: "RBAC and Permission System",
      level: "L4",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/permission.py", symbol: "SEED_PERMISSIONS" },
        { file: "backend/app/models/permission.py", symbol: "DEFAULT_ROLE_PERMISSIONS" },
      ],
      blocks: [
        {
          type: "text",
          body: "ORDR Terminal implements role-based access control with 9 roles, 41 permissions across 11 modules, and a hierarchy_level 0-15 that governs override rights. Every API endpoint and UI action is gated by at least one permission check.",
        },
        {
          type: "table",
          table: {
            headers: ["Role", "Hierarchy Level", "Typical Scope"],
            rows: [
              ["admin", "15", "Full access — all 41 permissions"],
              ["ceo", "14", "Company-wide read + approval authority"],
              ["cfo", "13", "Financial data, exposure reports, policy review"],
              ["head_of_risk", "12", "Risk governance, branch comparisons, approvals"],
              ["branch_manager", "10", "Branch-scoped operations and approvals"],
              ["supervisor", "8", "Full trading workflow + team oversight"],
              ["senior_analyst", "6", "Sandbox, production runs, proposals, policy"],
              ["risk_analyst", "4", "Trading workflow, sandbox and production runs"],
              ["junior_analyst", "2", "Sandbox only, view trades, view policies"],
            ],
          },
        },
        {
          type: "table",
          table: {
            headers: ["Module", "Key Permissions"],
            rows: [
              ["trades", "trades.view, trades.create, trades.edit, trades.delete, trades.import_csv, trades.execute"],
              ["hedges", "hedges.view, hedges.create, hedges.edit, hedges.delete"],
              ["calculate", "calculate.run_sandbox, calculate.run_production"],
              ["pipeline", "pipeline.create_proposal, pipeline.submit_staging, pipeline.approve, pipeline.reject, pipeline.authorize_ledger"],
              ["policy", "policy.view, policy.edit, policy.activate, policy.create_preset"],
              ["market", "market.view, market.edit, market.autofill"],
              ["reports", "reports.view_own_branch, reports.view_all_branches, reports.export_pdf, reports.export_excel"],
              ["users", "users.view, users.create, users.edit, users.deactivate, users.assign_roles"],
              ["company", "company.view_settings, company.edit_settings, company.manage_branches"],
              ["audit", "audit.view_own, audit.view_branch, audit.view_all"],
              ["overrides", "overrides.override_subordinate, overrides.impersonate"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "control",
            text: "A user may hold multiple roles simultaneously. Effective permissions are the union of all role permissions. Role assignment is performed by admin-level users via the users.assign_roles permission.",
          },
        },
      ],
    },

    // ─── L4: Audit Trail from Day One ─────────────────────────────────────────
    {
      id: "getting-started-audit-trail",
      heading: "Audit Trail from Day One",
      level: "L4",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/audit_event.py", symbol: "AuditEvent" },
      ],
      blocks: [
        {
          type: "text",
          body: "Every action in ORDR Terminal — login, position creation, policy assignment, calculation run, approval, rejection, ledger commit — is appended to the audit_events table. This table is WORM (Write Once Read Many): rows are never updated or deleted.",
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "The audit chain uses SHA-256 with a per-tenant GENESIS_HASH = 0x0000...0000. Each event's hash is computed over its canonical JSON payload and the previous event's hash, producing a tamper-evident chain. Any modification to a historical event invalidates all subsequent hashes.",
          },
        },
        {
          type: "text",
          body: "The first event written for a new tenant is the GENESIS event. Its previous_hash is the all-zeros sentinel. Subsequent events chain forward deterministically. Canonical JSON is produced with sort_keys=True and no whitespace (separators=(',', ':')) to guarantee hash stability across platforms.",
        },
        {
          type: "table",
          table: {
            headers: ["Audit Event Field", "Description"],
            rows: [
              ["event_type", "Enumerated action (e.g. USER_LOGIN, POSITION_CREATED, LEDGER_COMMIT)"],
              ["actor_id", "UUID of the user who performed the action"],
              ["company_id", "Tenant scope — per-tenant chain isolation"],
              ["payload", "Canonical JSON of event-specific data"],
              ["event_hash", "SHA-256(canonical_json(event) + previous_hash)"],
              ["previous_hash", "Hash of the immediately preceding event in the same tenant chain"],
              ["created_at", "Server-side UTC timestamp (immutable)"],
            ],
          },
        },
      ],
    },

    // ─── L5: Governance Posture ────────────────────────────────────────────────
    {
      id: "getting-started-governance",
      heading: "Governance Posture",
      level: "L5",
      verified: true,
      codeRefs: [
        { file: "backend/app/models/audit_event.py" },
        { file: "backend/app/models/ledger.py" },
        { file: "backend/app/models/execution_proposal.py" },
        { file: "frontend/src/lib/mathEngine.ts" },
      ],
      blocks: [
        {
          type: "text",
          body: "ORDR Terminal is designed to support the governance requirements of EMIR, MiFID II, IFRS 9, and equivalent jurisdictional frameworks. The following controls are enforced at the system level, not as configuration options.",
        },
        {
          type: "table",
          table: {
            headers: ["Control", "Mechanism", "Regulatory Alignment"],
            rows: [
              ["Immutable audit log", "WORM audit_events, SHA-256 hash chain", "EMIR Art. 9, MiFID II RTS 6"],
              ["Four-eyes approval", "DB CHECK approved_by != proposed_by on execution_proposals", "SOX, internal control frameworks"],
              ["IFRS 9 effectiveness testing", "80%–125% bright-line test in mathEngine.ts", "IFRS 9 §6.4.1"],
              ["Calculation immutability", "WORM calculation_runs, plan_id hash", "Audit trail completeness"],
              ["Policy immutability", "WORM policy_revisions, append-only versioning", "IFRS 9 designation documentation"],
              ["Ledger Merkle root", "Daily SHA-256 Merkle root over ledger_entries", "Examiner verification"],
              ["No admin SoD bypass", "approved_by != proposed_by has no override path", "SOX IT general controls"],
            ],
          },
        },
        {
          type: "callout",
          callout: {
            type: "regulatory",
            text: "IFRS 9 requires that a hedging relationship be documented at inception and that effectiveness is tested prospectively and retrospectively. ORDR Terminal's policy revision WORM table provides the inception documentation; the 80%–125% bright-line test provides the quantitative effectiveness gate.",
          },
        },
        {
          type: "text",
          body: "For external examiners and auditors: the audit trail chain integrity can be verified by replaying each event's hash computation independently. The GENESIS event is identifiable by its all-zeros previous_hash. The ledger Merkle root provides a single digest for each trading day's committed entries.",
        },
      ],
    },
  ],
};
