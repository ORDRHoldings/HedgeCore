import type { ModuleHelp } from "@/lib/help/types";

export const SETTINGS_HELP: ModuleHelp = {
  moduleId: "settings",
  pageTitle: "Settings",
  pageSubtitle: "CONFIGURATION · ACCESS & SECURITY · ORGANISATION",
  sections: [
    {
      id: "settings-overview",
      anchor: "settings-overview",
      title: "Settings Overview",
      icon: "Settings",
      level: 1,
      type: "text",
      verified: true,
      codeRefs: [{ file: "frontend/src/app/settings/page.tsx" }],
      content:
        "The Settings module provides configuration management across five tabs, each scoped exclusively to your company tenant. Changes made here do not affect other tenants sharing the platform.\n\n" +
        "**API Keys** — Generate, label, and revoke programmatic access credentials for service integrations. All keys carry the HK_live_ prefix and are shown in full exactly once at creation.\n\n" +
        "**Notifications** — Configure email and in-app alert preferences for approval requests, risk limit breaches, position lifecycle transitions, and system health events.\n\n" +
        "**Risk Limits** — Set company-wide cost thresholds (in basis points) that gate engine-computed hedge recommendations. Changes take effect immediately for all subsequent engine runs.\n\n" +
        "**Team** — Invite team members, assign roles, and remove access. Role assignments are bounded by the acting user's own hierarchy_level in the RBAC system.\n\n" +
        "**Audit Export** — Export the company's full audit trail in XLSX or CSV format for regulatory submissions, external audits, or internal review.",
    },
    {
      id: "settings-api-key-workflow",
      anchor: "settings-api-key-workflow",
      title: "Creating an API Key",
      icon: "Key",
      level: 2,
      type: "workflow",
      verified: true,
      codeRefs: [
        { file: "frontend/src/app/settings/page.tsx" },
        { file: "backend/app/core/security.py" },
      ],
      steps: [
        {
          step: 1,
          label: "Go to API Keys Tab",
          description:
            "Navigate to Settings → API Keys. The tab lists all active keys for your tenant, showing the key label, creation date, last-used timestamp, and permission scope. The actual key value is not shown for existing keys.",
        },
        {
          step: 2,
          label: "Click Generate",
          description:
            "Click the Generate New Key button. A dialog opens prompting you to enter a label (e.g. 'CI Pipeline', 'ERP Integration') and select the permission scopes the key will carry. Assign only the permissions the service account genuinely needs.",
        },
        {
          step: 3,
          label: "Copy Key (Shown Once Only)",
          description:
            "The full key value (HK_live_XXXX...) is displayed in a copy-to-clipboard dialog. This is the only time the plain-text key is shown. The backend stores only the bcrypt hash of the key; recovery is impossible. Copy it to a secrets manager immediately.",
        },
        {
          step: 4,
          label: "Assign to Service",
          description:
            "Inject the copied key as an environment variable or secret in your integration service. Pass it in the Authorization header as a Bearer token: Authorization: Bearer HK_live_XXXX...",
        },
        {
          step: 5,
          label: "Test Endpoint",
          description:
            "Make a test request to GET /v1/health or any permitted endpoint. Confirm a 200 response. A 401 means the key was not copied correctly; a 403 means the permission scope is insufficient for the requested endpoint.",
        },
      ],
    },
    {
      id: "settings-variables",
      anchor: "settings-variables",
      title: "Settings Variables",
      icon: "SlidersHorizontal",
      level: 2,
      type: "variables",
      verified: true,
      codeRefs: [{ file: "frontend/src/app/settings/page.tsx" }],
      variables: [
        {
          name: "api_key_prefix",
          type: "string (constant)",
          description:
            "All API keys begin with the literal prefix HK_live_. This prefix allows at-a-glance identification of platform keys in log files and secret scanners. Keys with a different prefix are rejected at authentication.",
          example: "HK_live_",
          source: "backend/app/core/security.py",
        },
        {
          name: "key_permissions",
          type: "string[] (permission codes)",
          description:
            "The list of permission codes assigned to this API key. The key can only perform operations covered by these permissions. The assigning user cannot grant permissions they do not themselves hold.",
          example: '["positions.view", "runs.view"]',
          source: "API Keys tab — permission selector",
        },
        {
          name: "notification_email",
          type: "string (email)",
          description:
            "The email address to which alert notifications are sent. Defaults to the user's account email. Can be overridden with a team distribution list or an external webhook endpoint.",
          example: "treasury-alerts@example.com",
          source: "Notifications tab",
        },
        {
          name: "risk_limit_bps",
          type: "integer (basis points)",
          description:
            "Company-wide maximum total hedge cost in basis points. Engine runs whose computed cost_bps exceeds this threshold are flagged as outside policy. Default is 75 bps. Changing this value immediately affects all subsequent engine runs.",
          example: "75",
          source: "Risk Limits tab",
        },
        {
          name: "team_member_role",
          type: "string (role code)",
          description:
            "The RBAC role assigned to a team member during invitation or role change. Must have a hierarchy_level strictly lower than the acting user's own hierarchy_level. The 9 available roles span from junior_analyst (level 1) to admin (level 15).",
          example: "senior_analyst",
          source: "Team tab — role selector",
        },
        {
          name: "audit_export_format",
          type: "\"XLSX\" | \"CSV\"",
          description:
            "Output format for the audit trail export from the Audit Export tab. XLSX includes formatted column headers and date formatting. CSV is suitable for import into SIEM or GRC platforms.",
          example: "XLSX",
          source: "Audit Export tab",
        },
      ],
    },
    {
      id: "settings-risk-limit-integration",
      anchor: "settings-risk-limit-integration",
      title: "Risk Limit Engine Integration",
      icon: "Gauge",
      level: 3,
      type: "text",
      verified: true,
      codeRefs: [{ file: "backend/app/engine/decision_gate.py" }],
      content:
        "The risk_limit_bps value configured in the Risk Limits tab is consumed directly by the engine's decision_gate module. This module is Stage 6.5 in the calculation pipeline — it sits after the cost_engine has computed the aggregate cost in basis points and before the scenario_engine.\n\n" +
        "**Flow**: cost_engine outputs cost_bps → decision_gate compares cost_bps to max_total_cost_bps (= risk_limit_bps from settings) → if cost_bps > max_total_cost_bps the recommendation is flagged with status 'OUTSIDE_POLICY' and a human approval gate is required before the proposal can progress to execution.\n\n" +
        "**Immediate effect**: Changes to risk_limit_bps take effect for all engine runs started after the save completes. There is no cache or restart required. In-flight runs (already past the decision_gate) are not retroactively affected.\n\n" +
        "**Change logging**: Every change to risk_limit_bps is written to audit_events as a policy.revised event, including the previous value, the new value, and the user who made the change. This creates a traceable history of risk appetite decisions.",
    },
    {
      id: "settings-api-key-security",
      anchor: "settings-api-key-security",
      title: "API Key Security",
      icon: "ShieldAlert",
      level: 4,
      type: "text",
      verified: true,
      codeRefs: [{ file: "backend/app/core/security.py" }],
      callout: {
        type: "caution",
        text:
          "API keys cannot be recovered after the creation dialog is closed. If a key is lost before being stored in a secrets manager, revoke it immediately and generate a replacement.",
      },
      content:
        "API key security is implemented at multiple layers to ensure that a compromised database or log file does not expose usable credentials.\n\n" +
        "**Storage**: When a key is generated, the backend hashes the full key value using bcrypt (same algorithm used for user passwords). Only the bcrypt hash is stored in the database. The HK_live_ prefix is stored in plaintext as a lookup identifier, but the prefix alone is insufficient to authenticate.\n\n" +
        "**Authentication**: On each request, the bearer token is extracted, the HK_live_ prefix is used to locate the key record, and bcrypt.verify is run against the stored hash. This is computationally expensive by design — bcrypt's work factor makes brute-force enumeration impractical.\n\n" +
        "**Non-recoverability**: Because the database stores only the hash (not the plaintext), even a user with direct database read access cannot recover a key. This is intentional and irreversible.\n\n" +
        "**Rotation**: The recommended rotation procedure is: generate a new key with identical permissions → deploy the new key to the service → verify the service is functioning → revoke the old key. This zero-downtime rotation avoids any service interruption.\n\n" +
        "**Audit visibility**: Every authentication using an API key is recorded in audit_events with the key_id (not the key value), the endpoint accessed, and the response code.",
    },
    {
      id: "settings-permission-boundaries",
      anchor: "settings-permission-boundaries",
      title: "Permission Boundaries",
      icon: "Lock",
      level: 4,
      type: "text",
      verified: true,
      codeRefs: [{ file: "backend/app/models/permission.py" }],
      content:
        "All settings operations are governed by the platform's 41-permission RBAC system with 9 roles spanning hierarchy_level 0 through 15.\n\n" +
        "**settings.manage_api_keys** — Required to generate, label, or revoke API keys. Without this permission, the API Keys tab is read-only and the Generate and Revoke buttons are disabled. Granted to admin, cfo, and head_of_risk.\n\n" +
        "**settings.manage_team** — Required to invite new team members or remove existing ones. Granted to admin and company_admin roles.\n\n" +
        "**Hierarchy constraint**: A user can only assign roles with a hierarchy_level strictly lower than their own. An admin (level 15) can assign any role. A supervisor (level 5) cannot assign branch_manager (level 6) or above. This constraint is enforced server-side; client-side UI filtering is a convenience, not a security boundary.\n\n" +
        "**settings.manage_risk_limits** — Required to change risk_limit_bps and other policy thresholds. Granted to admin, cfo, and head_of_risk. Changes made by users without this permission are rejected with HTTP 403.\n\n" +
        "**Auditor role exception**: The auditor role (read-only, all branches) can access the Audit Export tab and Settings overview but cannot modify any setting. The auditor role has no settings.manage_* permissions by design.",
    },
    {
      id: "settings-institutional-key-mgmt",
      anchor: "settings-institutional-key-mgmt",
      title: "Institutional Key Management",
      icon: "Building",
      level: 5,
      type: "text",
      verified: false,
      callout: {
        type: "regulatory",
        text:
          "The following recommendations represent institutional best practices. They are advisory — enforce them via your internal IT security policy rather than relying solely on platform controls.",
      },
      content:
        "**90-Day Rotation Policy**: Industry standards (NIST SP 800-57, CIS Controls 4.4) recommend rotating long-lived API credentials at least every 90 days. The ORDR Treasury's zero-downtime rotation procedure (generate → deploy → verify → revoke) supports this without service interruption. Set a calendar reminder or automate rotation via CI/CD pipeline.\n\n" +
        "**Minimal Permission Scope**: Service account keys should be granted only the permissions required for their specific function. An ERP integration that only reads positions should carry positions.view — not proposals.submit or approvals.grant. The principle of least privilege limits blast radius in the event of a key compromise.\n\n" +
        "**Secrets Manager Storage**: Never store API keys in source code, configuration files, or environment variable files committed to version control. Use a dedicated secrets manager (e.g. AWS Secrets Manager, HashiCorp Vault, Azure Key Vault) and inject keys at runtime.\n\n" +
        "**Audit Correlation**: All API key usage appears in audit_events with the key_id field. Map key_id to key labels in your SIEM for meaningful alerting. Anomalous usage patterns (unexpected endpoints, off-hours access, high request volumes) should trigger automated alerts.\n\n" +
        "**Incident Response**: If a key is suspected compromised, revoke it immediately via the API Keys tab (or via direct database intervention if the application is unavailable). The revocation is logged in audit_events. Review the audit log for the key_id to assess the scope of any unauthorised access.",
    },
  ],
};
