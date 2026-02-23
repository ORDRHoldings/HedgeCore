"use client";

/**
 * settings/page.tsx — ORDR Terminal Settings Hub
 *
 * Institutional configuration centre. Bloomberg/Aladdin benchmark.
 *
 * Tabs:
 *  1. General       — organisation name, base currency, timezone, report branding
 *  2. Policy Limits — hedge ratio sliders, min trade size, cooling-off, spread bps
 *  3. Execution     — execution product defaults, stress sigma, friction threshold
 *  4. API & Keys    — Alpha Vantage key, backend URL, IBKR credentials vault
 *  5. Notifications — alert thresholds, email recipients, webhook endpoints
 *
 * All settings persisted to localStorage under "ordr_settings" for demo mode.
 * In production: POST to /api/v1/settings (hook is wired, stubbed to localStorage).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";

// ── Hydration-safe timestamp hook ─────────────────────────────────────────────
function useRenderTs(): string {
  const [ts, setTs] = useState("");
  useEffect(() => {
    setTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return ts;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
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
  violet:   "#8B5CF6",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────
type SettingsTab =
  | "GENERAL"
  | "POLICY_LIMITS"
  | "EXECUTION"
  | "API_KEYS"
  | "NOTIFICATIONS";

interface OrgSettings {
  org_name:          string;
  base_currency:     string;
  timezone:          string;
  report_footer:     string;
  fiscal_year_start: string; // "01" = January
  branch_label:      string;
}

interface PolicyLimitSettings {
  confirmed_hedge_ratio:  number; // 0–1
  forecast_hedge_ratio:   number; // 0–1
  min_trade_size_usd:     number;
  max_single_trade_usd:   number;
  cooling_off_hours:      number;
  spread_bps:             number;
  required_approvals:     number;
  integrity_threshold:    number; // 0–100
}

interface ExecutionSettings {
  default_product:      "NDF" | "FWD" | "FUTURES";
  stress_sigma:         0.08 | 0.15 | 0.22;
  max_friction_bps:     number;
  auto_submit_below_usd: number; // auto-approve if < this USD notional
  counterparty_limit_usd: number;
  ibkr_account_id:      string;
  fx_desk_email:        string;
  fx_desk_phone:        string;
}

interface ApiKeySettings {
  alpha_vantage_key:    string;
  backend_api_url:      string;
  ibkr_tws_host:        string;
  ibkr_tws_port:        string;
  bloomberg_api_key:    string;
  refinitiv_api_key:    string;
}

interface NotificationSettings {
  alert_on_breach:         boolean;
  alert_on_engine_run:     boolean;
  alert_on_staging:        boolean;
  breach_threshold_pct:    number; // notify if hedge ratio drifts > X%
  email_recipients:        string; // comma-separated
  webhook_url:             string;
  slack_webhook_url:       string;
}

interface AllSettings {
  org:         OrgSettings;
  policy:      PolicyLimitSettings;
  execution:   ExecutionSettings;
  api_keys:    ApiKeySettings;
  notifications: NotificationSettings;
  last_saved:  string;
}

const DEFAULT_SETTINGS: AllSettings = {
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

const STORAGE_KEY = "ordr_settings";

// ── Toast ─────────────────────────────────────────────────────────────────────
interface Toast { id: string; kind: "success" | "error"; msg: string; }

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.kind === "success" ? "#064E3B" : "#450A0A",
          border: `1px solid ${t.kind === "success" ? S.pass : S.fail}`,
          borderLeft: `3px solid ${t.kind === "success" ? S.pass : S.fail}`,
          borderRadius: 3, padding: "8px 14px", minWidth: 260,
          fontFamily: S.fontUI, fontSize: 12, color: S.primary,
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: t.kind === "success" ? S.pass : S.fail, marginRight: 8 }}>
            {t.kind === "success" ? "✓" : "✗"}
          </span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
      letterSpacing: "0.09em", color: S.tertiary,
      borderBottom: `1px solid ${S.soft}`, paddingBottom: 6, marginBottom: 14,
      textTransform: "uppercase",
    }}>
      {label}
    </div>
  );
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <label style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: S.secondary }}>
          {label}
        </label>
        {hint && (
          <span style={{ fontFamily: S.fontUI, fontSize: 10, color: S.tertiary }}>{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  fontFamily: S.fontUI, fontSize: 12, color: S.primary,
  background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
  padding: "6px 10px", outline: "none", width: "100%", boxSizing: "border-box",
};

const monoInputStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: S.fontMono, fontSize: 11,
};

function SliderField({
  label, hint, value, min, max, step, fmt,
  onChange,
}: {
  label: string; hint?: string;
  value: number; min: number; max: number; step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <Field label={label} hint={hint}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            type="range" min={min} max={max} step={step} value={value}
            onChange={e => onChange(Number(e.target.value))}
            style={{
              width: "100%", height: 4, appearance: "none", outline: "none",
              background: `linear-gradient(to right, ${S.cyan} ${pct}%, ${S.rim} ${pct}%)`,
              borderRadius: 2, cursor: "pointer",
            }}
          />
        </div>
        <span style={{
          fontFamily: S.fontMono, fontSize: 13, fontWeight: 700,
          color: S.cyan, minWidth: 70, textAlign: "right",
        }}>
          {fmt(value)}
        </span>
      </div>
    </Field>
  );
}

function SecretField({
  label, hint, value, placeholder, onChange,
}: {
  label: string; hint?: string;
  value: string; placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  const masked = value ? "•".repeat(Math.min(value.length, 24)) : "";
  return (
    <Field label={label} hint={hint}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? "Enter key…"}
          autoComplete="off"
          style={{ ...monoInputStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => setShow(p => !p)}
          style={{
            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
            color: S.secondary, background: S.bgSub,
            border: `1px solid ${S.rim}`, borderRadius: 2,
            padding: "6px 10px", cursor: "pointer", flexShrink: 0,
            letterSpacing: "0.04em",
          }}
        >
          {show ? "HIDE" : "SHOW"}
        </button>
        {value && (
          <div style={{
            fontFamily: S.fontMono, fontSize: 10, color: S.pass,
            background: "rgba(16,185,129,0.08)", border: `1px solid rgba(16,185,129,0.2)`,
            borderRadius: 2, padding: "6px 8px", display: "flex", alignItems: "center",
            gap: 4, flexShrink: 0,
          }}>
            ● SET
          </div>
        )}
      </div>
    </Field>
  );
}

// ── Tab: General ──────────────────────────────────────────────────────────────
function GeneralTab({
  s, set,
}: { s: OrgSettings; set: (v: OrgSettings) => void }) {
  const u = (k: keyof OrgSettings) => (v: string) => set({ ...s, [k]: v });

  const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "MXN", "BRL", "CLP", "COP"];
  const TIMEZONES = [
    "America/New_York", "America/Chicago", "America/Los_Angeles",
    "Europe/London", "Europe/Frankfurt", "Europe/Zurich",
    "Asia/Tokyo", "Asia/Hong_Kong", "Asia/Singapore",
    "America/Sao_Paulo", "America/Mexico_City",
  ];
  const MONTHS = [
    ["01","January"],["02","February"],["03","March"],["04","April"],
    ["05","May"],["06","June"],["07","July"],["08","August"],
    ["09","September"],["10","October"],["11","November"],["12","December"],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SectionHeader label="Organisation Identity" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="ORGANISATION NAME">
          <input value={s.org_name} onChange={e => u("org_name")(e.target.value)}
            placeholder="e.g. ORDR Capital Management" style={inputStyle} />
        </Field>
        <Field label="BRANCH / ENTITY LABEL" hint="shown on reports">
          <input value={s.branch_label} onChange={e => u("branch_label")(e.target.value)}
            placeholder="e.g. HQ, EMEA, LATAM" style={inputStyle} />
        </Field>
        <Field label="REPORTING BASE CURRENCY">
          <select value={s.base_currency} onChange={e => u("base_currency")(e.target.value)}
            style={{ ...inputStyle }}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="TIMEZONE">
          <select value={s.timezone} onChange={e => u("timezone")(e.target.value)}
            style={{ ...inputStyle }}>
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </Field>
        <Field label="FISCAL YEAR START">
          <select value={s.fiscal_year_start} onChange={e => u("fiscal_year_start")(e.target.value)}
            style={{ ...inputStyle }}>
            {MONTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      </div>

      <SectionHeader label="Report Branding" />
      <Field label="REPORT FOOTER TEXT" hint="appears on all generated reports">
        <input value={s.report_footer} onChange={e => u("report_footer")(e.target.value)}
          placeholder="CONFIDENTIAL — For internal use only" style={inputStyle} />
      </Field>

      <div style={{
        background: `color-mix(in srgb, ${S.cyan} 5%, transparent)`,
        border: `1px solid color-mix(in srgb, ${S.cyan} 15%, transparent)`,
        borderLeft: `3px solid ${S.cyan}`,
        borderRadius: 2, padding: "10px 14px",
      }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.cyan, letterSpacing: "0.07em", marginBottom: 3 }}>
          LOGO UPLOAD
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary }}>
          Logo upload (PNG/SVG, 2× for HiDPI) will appear on report covers, PDF headers, and the portal footer.
          File upload requires server-side storage — configure via the backend admin panel.
        </div>
      </div>
    </div>
  );
}

// ── Tab: Policy Limits ────────────────────────────────────────────────────────
function PolicyLimitsTab({
  s, set,
}: { s: PolicyLimitSettings; set: (v: PolicyLimitSettings) => void }) {
  const u = (k: keyof PolicyLimitSettings) => (v: number) => set({ ...s, [k]: v });
  const pctFmt = (v: number) => `${(v * 100).toFixed(0)}%`;
  const usdFmt = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Hedge ratios */}
      <div>
        <SectionHeader label="Hedge Ratios" />
        <div style={{
          background: `color-mix(in srgb, ${S.amber} 5%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.amber} 15%, transparent)`,
          borderLeft: `3px solid ${S.amber}`,
          borderRadius: 2, padding: "8px 12px", marginBottom: 16,
          fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.5,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.amber, marginRight: 6 }}>POLICY ENGINE</span>
          These ratios become the default for new policy templates. Override per-template in Saved Policies.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SliderField
            label="CONFIRMED EXPOSURE HEDGE RATIO"
            hint="proportion of confirmed FX exposure to hedge"
            value={s.confirmed_hedge_ratio} min={0} max={1} step={0.05}
            fmt={pctFmt} onChange={u("confirmed_hedge_ratio")}
          />
          <SliderField
            label="FORECAST EXPOSURE HEDGE RATIO"
            hint="proportion of forecast FX exposure to hedge"
            value={s.forecast_hedge_ratio} min={0} max={1} step={0.05}
            fmt={pctFmt} onChange={u("forecast_hedge_ratio")}
          />
        </div>
      </div>

      {/* Trade size */}
      <div>
        <SectionHeader label="Trade Size Limits" />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SliderField
            label="MINIMUM TRADE SIZE (USD)"
            hint="trades below this threshold are aggregated or skipped"
            value={s.min_trade_size_usd} min={100_000} max={5_000_000} step={100_000}
            fmt={usdFmt} onChange={u("min_trade_size_usd")}
          />
          <SliderField
            label="MAXIMUM SINGLE TRADE SIZE (USD)"
            hint="trades above this trigger additional approval workflow"
            value={s.max_single_trade_usd} min={1_000_000} max={200_000_000} step={1_000_000}
            fmt={usdFmt} onChange={u("max_single_trade_usd")}
          />
        </div>
      </div>

      {/* Governance */}
      <div>
        <SectionHeader label="Governance Controls" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <SliderField
            label="COOLING-OFF PERIOD (HOURS)"
            hint="minimum time between staging and execution"
            value={s.cooling_off_hours} min={0} max={72} step={1}
            fmt={v => `${v}h`} onChange={u("cooling_off_hours")}
          />
          <SliderField
            label="REQUIRED APPROVALS"
            hint="minimum authorizations for staging promotion"
            value={s.required_approvals} min={1} max={5} step={1}
            fmt={v => `${v}`} onChange={u("required_approvals")}
          />
          <SliderField
            label="TRANSACTION SPREAD (BPS)"
            hint="assumed bid-ask cost for hedge execution"
            value={s.spread_bps} min={1} max={100} step={1}
            fmt={v => `${v} bps`} onChange={u("spread_bps")}
          />
          <SliderField
            label="MIN INTEGRITY SCORE"
            hint="staging artifacts below this score are blocked"
            value={s.integrity_threshold} min={0} max={100} step={5}
            fmt={v => `${v}/100`} onChange={u("integrity_threshold")}
          />
        </div>
      </div>
    </div>
  );
}

// ── Tab: Execution ────────────────────────────────────────────────────────────
function ExecutionTab({
  s, set,
}: { s: ExecutionSettings; set: (v: ExecutionSettings) => void }) {
  const u = <K extends keyof ExecutionSettings>(k: K) =>
    (v: ExecutionSettings[K]) => set({ ...s, [k]: v });

  const SIGMA_OPTIONS: { val: 0.08 | 0.15 | 0.22; label: string; desc: string }[] = [
    { val: 0.08, label: "1σ ±8%",  desc: "Conservative — 68% confidence interval" },
    { val: 0.15, label: "2σ ±15%", desc: "Standard — 95% confidence interval" },
    { val: 0.22, label: "3σ ±22%", desc: "Extreme — 99.7% confidence interval" },
  ];

  const usdFmt = (v: number) =>
    v === 0 ? "OFF" : v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Product */}
      <div>
        <SectionHeader label="Default Execution Product" />
        <div style={{ display: "flex", gap: 8 }}>
          {(["NDF", "FWD", "FUTURES"] as const).map(p => (
            <button
              key={p}
              onClick={() => u("default_product")(p)}
              style={{
                fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
                letterSpacing: "0.05em",
                color: s.default_product === p ? "#000" : S.secondary,
                background: s.default_product === p ? S.cyan : "transparent",
                border: `1px solid ${s.default_product === p ? S.cyan : S.rim}`,
                borderRadius: 2, padding: "6px 18px", cursor: "pointer",
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginTop: 6 }}>
          {s.default_product === "NDF" && "Non-Deliverable Forward — cash-settled, used for restricted currencies (MXN, BRL, CLP, COP)."}
          {s.default_product === "FWD" && "Deliverable Forward — physical settlement, used for G10 currencies (EUR, GBP, JPY, CHF)."}
          {s.default_product === "FUTURES" && "CME/COMEX listed futures — exchange-cleared, daily margin settlement, 27-currency coverage."}
        </div>
      </div>

      {/* Stress */}
      <div>
        <SectionHeader label="Default Stress Sigma (Worst-Case Scenario)" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SIGMA_OPTIONS.map(opt => (
            <label
              key={opt.val}
              style={{
                display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                background: s.stress_sigma === opt.val
                  ? `color-mix(in srgb, ${S.cyan} 8%, transparent)`
                  : "transparent",
                border: `1px solid ${s.stress_sigma === opt.val ? S.cyan : S.soft}`,
                borderRadius: 2, padding: "10px 14px",
              }}
            >
              <input
                type="radio"
                name="sigma"
                checked={s.stress_sigma === opt.val}
                onChange={() => u("stress_sigma")(opt.val)}
                style={{ accentColor: S.cyan, flexShrink: 0 }}
              />
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: s.stress_sigma === opt.val ? S.cyan : S.primary }}>
                  {opt.label}
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary }}>{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Thresholds */}
      <div>
        <SectionHeader label="Risk Thresholds" />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <SliderField
            label="MAX ACCEPTABLE FRICTION (BPS)"
            hint="execution cost above this triggers a warning"
            value={s.max_friction_bps} min={1} max={100} step={1}
            fmt={v => `${v} bps`} onChange={v => u("max_friction_bps")(v)}
          />
          <SliderField
            label="COUNTERPARTY EXPOSURE LIMIT (USD)"
            hint="max notional per counterparty before additional sign-off"
            value={s.counterparty_limit_usd} min={1_000_000} max={100_000_000} step={1_000_000}
            fmt={usdFmt} onChange={v => u("counterparty_limit_usd")(v)}
          />
          <SliderField
            label="AUTO-APPROVE THRESHOLD (USD)"
            hint="trades below this amount skip additional approval (0 = always require approval)"
            value={s.auto_submit_below_usd} min={0} max={5_000_000} step={100_000}
            fmt={usdFmt} onChange={v => u("auto_submit_below_usd")(v)}
          />
        </div>
      </div>

      {/* IBKR contact */}
      <div>
        <SectionHeader label="Execution Desk Defaults" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="IBKR ACCOUNT ID" hint="shown on IBKR JSON payloads">
            <input value={s.ibkr_account_id} onChange={e => u("ibkr_account_id")(e.target.value)}
              placeholder="U1234567" style={monoInputStyle} />
          </Field>
          <Field label="FX DESK EMAIL">
            <input value={s.fx_desk_email} onChange={e => u("fx_desk_email")(e.target.value)}
              placeholder="fx@yourbank.com" style={inputStyle} type="email" />
          </Field>
          <Field label="FX DESK PHONE">
            <input value={s.fx_desk_phone} onChange={e => u("fx_desk_phone")(e.target.value)}
              placeholder="+1 212 000 0000" style={inputStyle} />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ── Tab: API Keys ─────────────────────────────────────────────────────────────
function ApiKeysTab({
  s, set,
}: { s: ApiKeySettings; set: (v: ApiKeySettings) => void }) {
  const u = (k: keyof ApiKeySettings) => (v: string) => set({ ...s, [k]: v });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Security notice */}
      <div style={{
        background: `color-mix(in srgb, ${S.fail} 5%, transparent)`,
        border: `1px solid color-mix(in srgb, ${S.fail} 20%, transparent)`,
        borderLeft: `3px solid ${S.fail}`,
        borderRadius: 2, padding: "10px 14px",
        fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.5,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.fail, marginRight: 6, letterSpacing: "0.07em" }}>
          SECURITY
        </span>
        API keys are stored in localStorage for demo mode. In production, keys are stored in the backend secrets vault
        (HashiCorp Vault / AWS Secrets Manager) and never transmitted to the browser. Keys are shown here for
        configuration verification only.
      </div>

      <div>
        <SectionHeader label="Market Data" />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SecretField
            label="ALPHA VANTAGE API KEY"
            hint="used for live FX spot rates and forward curves"
            value={s.alpha_vantage_key}
            placeholder="Enter Alpha Vantage key…"
            onChange={u("alpha_vantage_key")}
          />
          <SecretField
            label="BLOOMBERG TERMINAL API KEY"
            hint="optional — premium market data override"
            value={s.bloomberg_api_key}
            placeholder="BLPAPI key (optional)"
            onChange={u("bloomberg_api_key")}
          />
          <SecretField
            label="REFINITIV / EIKON API KEY"
            hint="optional — Refinitiv Elektron / Workspace override"
            value={s.refinitiv_api_key}
            placeholder="Refinitiv DSS key (optional)"
            onChange={u("refinitiv_api_key")}
          />
        </div>
      </div>

      <div>
        <SectionHeader label="Backend & Broker Connectivity" />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="BACKEND API URL" hint="base URL for ORDR REST API">
            <input value={s.backend_api_url} onChange={e => u("backend_api_url")(e.target.value)}
              placeholder="http://localhost:8000/api" style={monoInputStyle} />
          </Field>
          <Field label="IBKR TWS HOST" hint="localhost for local TWS, or gateway IP">
            <input value={s.ibkr_tws_host} onChange={e => u("ibkr_tws_host")(e.target.value)}
              placeholder="127.0.0.1" style={monoInputStyle} />
          </Field>
          <Field label="IBKR TWS PORT" hint="7497 = paper, 7496 = live TWS; 4002 = paper Gateway, 4001 = live Gateway">
            <input value={s.ibkr_tws_port} onChange={e => u("ibkr_tws_port")(e.target.value)}
              placeholder="7497" style={monoInputStyle} />
          </Field>
        </div>
      </div>

      {/* Connection tester */}
      <div>
        <SectionHeader label="Connectivity Check" />
        <ConnectivityChecker apiUrl={s.backend_api_url} />
      </div>
    </div>
  );
}

function ConnectivityChecker({ apiUrl }: { apiUrl: string }) {
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [latency, setLatency] = useState<number | null>(null);

  const check = async () => {
    setStatus("checking");
    const t0 = performance.now();
    try {
      const res = await fetch(`${apiUrl}/v1/health`, { signal: AbortSignal.timeout(5000) });
      const ms = Math.round(performance.now() - t0);
      setLatency(ms);
      setStatus(res.ok ? "ok" : "fail");
    } catch {
      setStatus("fail");
      setLatency(null);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button
        onClick={check}
        disabled={status === "checking"}
        style={{
          fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          color: "#000", background: status === "checking" ? S.tertiary : S.cyan,
          border: "none", borderRadius: 2, padding: "7px 16px",
          cursor: status === "checking" ? "wait" : "pointer",
        }}
      >
        {status === "checking" ? "CHECKING…" : "TEST CONNECTION"}
      </button>
      {status === "ok" && (
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.pass }}>
          ✓ CONNECTED — {latency}ms
        </span>
      )}
      {status === "fail" && (
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.fail }}>
          ✗ UNREACHABLE — check URL and CORS headers
        </span>
      )}
    </div>
  );
}

// ── Tab: Notifications ────────────────────────────────────────────────────────
function NotificationsTab({
  s, set,
}: { s: NotificationSettings; set: (v: NotificationSettings) => void }) {
  const u = <K extends keyof NotificationSettings>(k: K) =>
    (v: NotificationSettings[K]) => set({ ...s, [k]: v });

  const toggleItems = [
    { key: "alert_on_breach" as const,     label: "Hedge Ratio Breach",       desc: "Alert when actual hedge coverage deviates from policy target" },
    { key: "alert_on_engine_run" as const, label: "Engine Run Complete",       desc: "Alert when a hedge plan calculation finishes" },
    { key: "alert_on_staging" as const,    label: "Staging Requires Approval", desc: "Alert when a staged artifact needs your authorization" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <SectionHeader label="Alert Triggers" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {toggleItems.map(item => (
            <label
              key={item.key}
              style={{
                display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                background: s[item.key]
                  ? `color-mix(in srgb, ${S.cyan} 5%, transparent)` : S.bgSub,
                border: `1px solid ${s[item.key] ? S.cyan : S.soft}`,
                borderRadius: 2, padding: "10px 14px",
              }}
            >
              <input
                type="checkbox"
                checked={s[item.key]}
                onChange={e => u(item.key)(e.target.checked as NotificationSettings[typeof item.key])}
                style={{ accentColor: S.cyan, flexShrink: 0 }}
              />
              <div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, fontWeight: 600, color: s[item.key] ? S.primary : S.secondary }}>
                  {item.label}
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary }}>{item.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <SectionHeader label="Breach Threshold" />
        <SliderField
          label="HEDGE RATIO DRIFT THRESHOLD (%)"
          hint="notify if coverage drifts by more than this % from the policy target"
          value={s.breach_threshold_pct} min={1} max={20} step={1}
          fmt={v => `${v}%`} onChange={v => u("breach_threshold_pct")(v as number)}
        />
      </div>

      <div>
        <SectionHeader label="Delivery Channels" />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="EMAIL RECIPIENTS" hint="comma-separated list">
            <input
              value={s.email_recipients}
              onChange={e => u("email_recipients")(e.target.value)}
              placeholder="cfo@company.com, treasury@company.com"
              style={inputStyle}
            />
          </Field>
          <Field label="WEBHOOK URL" hint="HTTPS endpoint — JSON POST">
            <input
              value={s.webhook_url}
              onChange={e => u("webhook_url")(e.target.value)}
              placeholder="https://hooks.yourapp.com/ordr"
              style={monoInputStyle}
            />
          </Field>
          <Field label="SLACK INCOMING WEBHOOK URL">
            <input
              value={s.slack_webhook_url}
              onChange={e => u("slack_webhook_url")(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              style={monoInputStyle}
            />
          </Field>
        </div>
      </div>

      <div style={{
        background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
        padding: "12px 14px",
      }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, marginBottom: 6 }}>
          WEBHOOK PAYLOAD SCHEMA
        </div>
        <pre style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan, margin: 0, lineHeight: 1.6, overflowX: "auto" }}>
{`{
  "event":     "HEDGE_RATIO_BREACH",
  "severity":  "WARNING",
  "run_id":    "run_xxxx",
  "message":   "Confirmed hedge ratio 72% — below policy target 80%",
  "drift_pct": 8,
  "timestamp": "2026-02-23T14:32:00Z",
  "tenant_id": "ordr_default"
}`}
        </pre>
      </div>
    </div>
  );
}

// ── Change Log ────────────────────────────────────────────────────────────────
interface ChangeEntry {
  ts:  string;
  tab: string;
  msg: string;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const router = useRouter();
  const renderTs = useRenderTs();

  const [activeTab, setActiveTab]     = useState<SettingsTab>("GENERAL");
  const [settings, setSettings]       = useState<AllSettings>(DEFAULT_SETTINGS);
  const [isDirty, setDirty]           = useState(false);
  const [saving, setSaving]           = useState(false);
  const [toasts, setToasts]           = useState<Toast[]>([]);
  const [changeLog, setChangeLog]     = useState<ChangeEntry[]>([]);
  const [showLog, setShowLog]         = useState(false);
  const prevSettings                  = useRef<AllSettings>(DEFAULT_SETTINGS);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/auth/login");
  }, [authLoading, isAuthenticated, router]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AllSettings;
        setSettings(parsed);
        prevSettings.current = parsed;
      }
    } catch { /* ignore */ }
  }, []);

  // Mark dirty on change
  useEffect(() => {
    if (JSON.stringify(settings) !== JSON.stringify(prevSettings.current)) {
      setDirty(true);
    }
  }, [settings]);

  const addToast = useCallback((kind: "success" | "error", msg: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(p => [...p, { id, kind, msg }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    await new Promise(res => setTimeout(res, 300)); // simulate async save
    const saved: AllSettings = { ...settings, last_saved: new Date().toISOString() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      setSettings(saved);
      prevSettings.current = saved;
      setDirty(false);
      const entry: ChangeEntry = {
        ts: new Date().toISOString().replace("T", " ").slice(0, 19),
        tab: activeTab,
        msg: `Settings saved by ${user?.email ?? "unknown"} — tab: ${activeTab}`,
      };
      setChangeLog(p => [entry, ...p].slice(0, 50));
      addToast("success", "Settings saved successfully.");
    } catch {
      addToast("error", "Failed to save settings — localStorage unavailable.");
    } finally {
      setSaving(false);
    }
  }, [settings, activeTab, user, addToast]);

  const handleReset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    setDirty(true);
  }, []);

  const TABS: { key: SettingsTab; label: string; badge?: string }[] = [
    { key: "GENERAL",       label: "General" },
    { key: "POLICY_LIMITS", label: "Policy Limits", badge: "RISK" },
    { key: "EXECUTION",     label: "Execution",     badge: "EXEC" },
    { key: "API_KEYS",      label: "API & Keys",    badge: "KEYS" },
    { key: "NOTIFICATIONS", label: "Notifications" },
  ];

  if (authLoading) {
    return (
      <div style={{ background: S.bgDeep, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, letterSpacing: "0.1em" }}>AUTHENTICATING…</span>
      </div>
    );
  }

  return (
    <div style={{ background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI }}>
      <ToastStack toasts={toasts} />

      {/* ── Top bar ── */}
      <div style={{
        height: 44, padding: "0 24px",
        background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.primary }}>
            SETTINGS
          </span>
          <span style={{ color: S.rim }}>|</span>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.06em", color: S.tertiary }}>
            ORDR TERMINAL · CONFIGURATION
          </span>
          {isDirty && (
            <span style={{
              fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
              color: S.amber,
              background: `color-mix(in srgb, ${S.amber} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${S.amber} 25%, transparent)`,
              padding: "1px 6px", borderRadius: 2,
            }}>
              UNSAVED CHANGES
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {settings.last_saved && (
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
              Last saved: {settings.last_saved.replace("T", " ").slice(0, 16)} UTC
            </span>
          )}
          <button
            onClick={() => setShowLog(p => !p)}
            style={{
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
              color: S.secondary, background: "transparent",
              border: `1px solid ${S.rim}`, borderRadius: 2,
              padding: "5px 12px", cursor: "pointer",
            }}
          >
            CHANGE LOG ({changeLog.length})
          </button>
          <button
            onClick={handleReset}
            style={{
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
              color: S.fail, background: "transparent",
              border: `1px solid ${S.fail}40`, borderRadius: 2,
              padding: "5px 12px", cursor: "pointer",
            }}
          >
            RESET DEFAULTS
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            style={{
              fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
              color: "#000", background: saving || !isDirty ? S.tertiary : S.cyan,
              border: "none", borderRadius: 2, padding: "5px 18px",
              cursor: saving || !isDirty ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "SAVING…" : isDirty ? "SAVE CHANGES" : "SAVED ✓"}
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        height: 36, display: "flex", alignItems: "stretch",
        background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
        padding: "0 24px", gap: 0,
      }}>
        {TABS.map(t => {
          const active = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              fontFamily: S.fontUI, fontSize: 12, fontWeight: active ? 700 : 400,
              color: active ? S.cyan : S.tertiary,
              background: "transparent", border: "none",
              borderBottom: active ? `2px solid ${S.cyan}` : "2px solid transparent",
              padding: "0 16px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              {t.label}
              {t.badge && (
                <span style={{
                  fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                  color: active ? S.cyan : S.tertiary,
                  background: active ? `color-mix(in srgb, ${S.cyan} 10%, transparent)` : S.bgSub,
                  border: `1px solid ${active ? S.cyan : S.rim}`,
                  borderRadius: 10, padding: "0 5px", lineHeight: "14px",
                }}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 24px 60px" }}>

        {/* Change log drawer */}
        {showLog && (
          <div style={{
            background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3,
            marginBottom: 20, overflow: "hidden",
          }}>
            <div style={{
              padding: "8px 14px", borderBottom: `1px solid ${S.rim}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary }}>
                SETTINGS CHANGE LOG
              </span>
              <button onClick={() => setShowLog(false)} style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, background: "none", border: "none", cursor: "pointer" }}>CLOSE</button>
            </div>
            {changeLog.length === 0 ? (
              <div style={{ padding: "20px 14px", fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, textAlign: "center" }}>
                No changes saved this session.
              </div>
            ) : changeLog.map((e, i) => (
              <div key={i} style={{ padding: "7px 14px", borderBottom: `1px solid ${S.soft}`, display: "flex", gap: 14 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, flexShrink: 0 }}>{e.ts}</span>
                <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary }}>{e.msg}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3, padding: "24px 28px" }}>
          {activeTab === "GENERAL"       && (
            <GeneralTab      s={settings.org}           set={org =>         setSettings(p => ({ ...p, org }))} />
          )}
          {activeTab === "POLICY_LIMITS" && (
            <PolicyLimitsTab s={settings.policy}        set={policy =>      setSettings(p => ({ ...p, policy }))} />
          )}
          {activeTab === "EXECUTION"     && (
            <ExecutionTab    s={settings.execution}     set={execution =>   setSettings(p => ({ ...p, execution }))} />
          )}
          {activeTab === "API_KEYS"      && (
            <ApiKeysTab      s={settings.api_keys}      set={api_keys =>    setSettings(p => ({ ...p, api_keys }))} />
          )}
          {activeTab === "NOTIFICATIONS" && (
            <NotificationsTab s={settings.notifications} set={notifications => setSettings(p => ({ ...p, notifications }))} />
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        height: 32, display: "flex", alignItems: "center", justifyContent: "center",
        borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
      }}>
        <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.05em" }}>
          {renderTs} · ORDR Settings · {user?.email ?? ""}
        </span>
      </div>
    </div>
  );
}
