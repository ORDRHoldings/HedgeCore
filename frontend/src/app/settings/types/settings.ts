/**
 * settings/types/settings.ts
 * Central types, interfaces, constants, and design tokens for the Settings module.
 */

// ── SettingsTab union ──────────────────────────────────────────────────────────
export type SettingsTab =
  | "GENERAL"
  | "APPEARANCE"
  | "POLICY_LIMITS"
  | "EXECUTION"
  | "API_CONFIG"
  | "NOTIFICATIONS"
  | "SECURITY"
  | "USERS_ROLES"
  | "API_KEY_MGMT"
  | "ORGANISATION"
  | "AUDIT_TRAIL"
  | "REGULATORY";

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
  bgDeep:   "var(--bg-deep,#09090E)",
  bgPanel:  "var(--bg-panel,#0D1017)",
  bgSub:    "var(--bg-sub,#111520)",
  rim:      "var(--border-rim,#1A1F30)",
  soft:     "var(--border-soft,#222A3F)",
  primary:  "var(--text-primary,#C8D4EA)",
  secondary:"var(--text-secondary,#6A7A98)",
  tertiary: "var(--text-tertiary,#3A4460)",
  cyan:     "var(--accent-cyan,#3B8EEA)",
  amber:    "var(--accent-amber,#F0A830)",
  pass:     "var(--status-pass,#00C896)",
  fail:     "var(--accent-red,#FF4B6A)",
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
  fontFamily: S.fontMono, fontSize: 12,
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
  { key: "APPEARANCE",    label: "Appearance",      badge: "UX",          group: "CONFIG" },
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
  { key: "REGULATORY",    label: "Regulatory",       badge: "LEI",         group: "ORG" },
];

// URL hash → tab mapping (backward-compat + new tabs)
export const HASH_MAP: Record<string, SettingsTab> = {
  appearance:    "APPEARANCE",
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
  regulatory:    "REGULATORY",
};
