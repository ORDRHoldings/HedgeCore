/**
 * settings/types/settings.ts
 * Central types, interfaces, constants, and design tokens for the Settings module.
 */

// ── SettingsTab union ──────────────────────────────────────────────────────────
export type SettingsTab =
  | "GENERAL"
  | "POLICY_LIMITS"
  | "EXECUTION"
  | "API_CONFIG"
  | "NOTIFICATIONS"
  | "SECURITY"
  | "USERS_ROLES"
  | "API_KEY_MGMT"
  | "ORGANISATION"
  | "AUDIT_TRAIL";

// ── Data interfaces ────────────────────────────────────────────────────────────
export interface OrgSettings {
  org_name:          string;
  base_currency:     string;
  timezone:          string;
  report_footer:     string;
  fiscal_year_start: string;
  branch_label:      string;
}

export interface PolicyLimitSettings {
  confirmed_hedge_ratio:  number;
  forecast_hedge_ratio:   number;
  min_trade_size_usd:     number;
  max_single_trade_usd:   number;
  cooling_off_hours:      number;
  spread_bps:             number;
  required_approvals:     number;
  integrity_threshold:    number;
}

export interface ExecutionSettings {
  default_product:        "NDF" | "FWD" | "FUTURES";
  stress_sigma:           0.08 | 0.15 | 0.22;
  max_friction_bps:       number;
  auto_submit_below_usd:  number;
  counterparty_limit_usd: number;
  ibkr_account_id:        string;
  fx_desk_email:          string;
  fx_desk_phone:          string;
}

export interface ApiKeySettings {
  alpha_vantage_key:  string;
  backend_api_url:    string;
  ibkr_tws_host:      string;
  ibkr_tws_port:      string;
  bloomberg_api_key:  string;
  refinitiv_api_key:  string;
}

export interface NotificationSettings {
  alert_on_breach:      boolean;
  alert_on_engine_run:  boolean;
  alert_on_staging:     boolean;
  breach_threshold_pct: number;
  email_recipients:     string;
  webhook_url:          string;
  slack_webhook_url:    string;
}

export interface AllSettings {
  org:           OrgSettings;
  policy:        PolicyLimitSettings;
  execution:     ExecutionSettings;
  api_keys:      ApiKeySettings;
  notifications: NotificationSettings;
  last_saved:    string;
}

// ── Defaults ───────────────────────────────────────────────────────────────────
export const DEFAULT_SETTINGS: AllSettings = {
  org: {
    org_name:          "",
    base_currency:     "USD",
    timezone:          "America/New_York",
    report_footer:     "CONFIDENTIAL — For internal use only",
    fiscal_year_start: "01",
    branch_label:      "HQ",
  },
  policy: {
    confirmed_hedge_ratio:  0.80,
    forecast_hedge_ratio:   0.50,
    min_trade_size_usd:     500_000,
    max_single_trade_usd:   50_000_000,
    cooling_off_hours:      24,
    spread_bps:             15,
    required_approvals:     2,
    integrity_threshold:    75,
  },
  execution: {
    default_product:        "NDF",
    stress_sigma:           0.15,
    max_friction_bps:       25,
    auto_submit_below_usd:  0,
    counterparty_limit_usd: 10_000_000,
    ibkr_account_id:        "",
    fx_desk_email:          "",
    fx_desk_phone:          "",
  },
  api_keys: {
    alpha_vantage_key: "",
    backend_api_url:   "http://localhost:8000/api",
    ibkr_tws_host:     "127.0.0.1",
    ibkr_tws_port:     "7497",
    bloomberg_api_key: "",
    refinitiv_api_key: "",
  },
  notifications: {
    alert_on_breach:      true,
    alert_on_engine_run:  false,
    alert_on_staging:     true,
    breach_threshold_pct: 5,
    email_recipients:     "",
    webhook_url:          "",
    slack_webhook_url:    "",
  },
  last_saved: "",
};

export const STORAGE_KEY = "ordr_settings";

// ── UI state types ─────────────────────────────────────────────────────────────
export interface Toast {
  id:   string;
  kind: "success" | "error";
  msg:  string;
}

export interface ChangeEntry {
  ts:  string;
  tab: string;
  msg: string;
}

export interface DiffField {
  label:  string;
  before: string;
  after:  string;
}

export interface ServerMeta {
  last_modified_at?: string | null;
  last_modified_by?: string | null;
}

// ── Design tokens (shared across all settings components) ─────────────────────
export const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep,#0D0F11)",
  bgPanel:  "var(--bg-panel,#141618)",
  bgSub:    "var(--bg-sub,#1A1D21)",
  rim:      "var(--border-rim,#2A2D34)",
  soft:     "var(--border-soft,#1F2228)",
  primary:  "var(--text-primary,#E8EAF0)",
  secondary:"var(--text-secondary,#9CA3AF)",
  tertiary: "var(--text-tertiary,#6B7280)",
  cyan:     "var(--accent-cyan,#06B6D4)",
  amber:    "var(--accent-amber,#F59E0B)",
  pass:     "var(--status-pass,#10B981)",
  fail:     "var(--accent-red,#EF4444)",
  violet:   "#3B82F6",
} as const;

// ── Shared input styles ────────────────────────────────────────────────────────
export const inputStyle = {
  fontFamily: S.fontUI, fontSize: 12, color: S.primary,
  background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
  padding: "6px 10px", outline: "none", width: "100%", boxSizing: "border-box" as const,
};

export const monoInputStyle = {
  ...inputStyle,
  fontFamily: S.fontMono, fontSize: 11,
};

// ── Tab definition ─────────────────────────────────────────────────────────────
export interface TabDef {
  key:    SettingsTab;
  label:  string;
  badge?: string;
  group:  "CONFIG" | "ACCESS" | "ORG";
}

export const TABS: TabDef[] = [
  // Group: CONFIGURATION
  { key: "GENERAL",       label: "General",         group: "CONFIG" },
  { key: "POLICY_LIMITS", label: "Policy Limits",   badge: "⊛ GOVERNED", group: "CONFIG" },
  { key: "EXECUTION",     label: "Execution",        badge: "⊛ GOVERNED", group: "CONFIG" },
  { key: "API_CONFIG",    label: "API & Config",     badge: "KEYS",        group: "CONFIG" },
  { key: "NOTIFICATIONS", label: "Notifications",    group: "CONFIG" },
  // Group: ACCESS & SECURITY
  { key: "SECURITY",      label: "Security",         badge: "MFA",         group: "ACCESS" },
  { key: "USERS_ROLES",   label: "Users & Roles",    badge: "RBAC",        group: "ACCESS" },
  { key: "API_KEY_MGMT",  label: "API Keys",         badge: "MGMT",        group: "ACCESS" },
  // Group: ORGANISATION
  { key: "ORGANISATION",  label: "Organisation",     group: "ORG" },
  { key: "AUDIT_TRAIL",   label: "Audit Trail",      badge: "WORM",        group: "ORG" },
];

// URL hash → tab mapping (backward-compat + new tabs)
export const HASH_MAP: Record<string, SettingsTab> = {
  policy_limits: "POLICY_LIMITS",
  execution:     "EXECUTION",
  api_keys:      "API_CONFIG",
  api_config:    "API_CONFIG",
  notifications: "NOTIFICATIONS",
  security:      "SECURITY",
  users_roles:   "USERS_ROLES",
  api_key_mgmt:  "API_KEY_MGMT",
  organisation:  "ORGANISATION",
  audit_trail:   "AUDIT_TRAIL",
};
