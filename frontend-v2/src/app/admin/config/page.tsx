"use client";

import { useState } from "react";
import { useAuthStore } from "@/lib/auth/store";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgDeep: "var(--bg-deep,#F8FAFC)",
  bgPanel: "var(--bg-panel,#FFFFFF)",
  bgSub: "var(--bg-sub,#F1F5F9)",
  rim: "var(--border-rim,#E2E8F0)",
  accentRed: "var(--accent-red,#DC2626)",
  accentCyan: "var(--accent-cyan,#1C62F2)",
  accentAmber: "var(--accent-amber,#D97706)",
  statusPass: "var(--status-pass,#059669)",
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
} as const;

function NotFound() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-deep)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 48, fontWeight: 700, color: "var(--border-soft)" }}>404</div>
        <div style={{ fontFamily: "var(--font-terminal)", fontSize: 14, color: "var(--text-tertiary)", marginTop: 8 }}>Page not found</div>
      </div>
    </div>
  );
}

interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

const DEFAULT_FLAGS: FeatureFlag[] = [
  { key: "audit_lab", label: "Audit Lab", description: "FX markup audit workflow and dataset uploads", enabled: true },
  { key: "execution_proposals", label: "Execution Proposals", description: "4-eyes approval workflow for trade proposals", enabled: true },
  { key: "policy_governance", label: "Policy Governance", description: "Policy templates and compliance rules", enabled: true },
  { key: "api_key_auth", label: "API Key Authentication", description: "HK_live_ programmatic access", enabled: true },
  { key: "mfa_totp", label: "MFA (TOTP)", description: "Time-based one-time password 2FA", enabled: false },
  { key: "sso_saml", label: "SSO / SAML", description: "Enterprise single sign-on integration", enabled: false },
  { key: "webhook_events", label: "Webhook Events", description: "Push audit events to external endpoints", enabled: false },
  { key: "advanced_analytics", label: "Advanced Analytics", description: "DAU, cohort, and retention dashboards", enabled: false },
];

const RATE_LIMITS = [
  { label: "Default (unauthenticated)", value: "20 req/min" },
  { label: "Authenticated users", value: "100 req/min" },
  { label: "API key (standard)", value: "200 req/min" },
  { label: "API key (enterprise)", value: "1000 req/min" },
  { label: "Burst allowance", value: "2× for 10s" },
];

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      style={{
        position: "relative",
        width: 44,
        height: 24,
        borderRadius: 12,
        background: enabled ? S.statusPass : S.textTertiary,
        border: "none",
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 0.2s",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: enabled ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden", marginBottom: 20 }}>
      <div style={{ padding: "12px 20px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.textPrimary }}>
          {title}
        </span>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function ConfigPage() {
  const { user } = useAuthStore();
  const [flags, setFlags] = useState<FeatureFlag[]>(DEFAULT_FLAGS);
  const [defaultTier, setDefaultTier] = useState("lite");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  if (!user?.is_superuser) return <NotFound />;

  const toggleFlag = (key: string, val: boolean) => {
    setFlags((prev) => prev.map((f) => f.key === key ? { ...f, enabled: val } : f));
  };

  const handleSave = () => {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  return (
    <div style={{ padding: "28px 32px", minHeight: "calc(100vh - 92px)", background: S.bgDeep }}>
      {/* DEMO DATA Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          background: "#FFFBEB",
          border: `1px solid ${S.accentAmber}`,
          borderRadius: 5,
          marginBottom: 20,
        }}
      >
        <span style={{ color: S.accentAmber, fontSize: 14 }}>⚠</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentAmber, fontWeight: 600, letterSpacing: "0.04em" }}>
          DEMO DATA — Configuration API not yet wired. Changes are UI-only and will not persist.
        </span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentRed, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>
            COMMAND CENTER / CONFIG
          </div>
          <h1 style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: S.textPrimary, margin: 0 }}>
            SYSTEM CONFIGURATION
          </h1>
        </div>
        <button
          onClick={handleSave}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: S.bgPanel,
            background: S.accentCyan,
            border: "none",
            borderRadius: 5,
            padding: "8px 20px",
            cursor: "pointer",
          }}
        >
          SAVE CHANGES
        </button>
      </div>

      {/* Toast */}
      {toastVisible && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            right: 32,
            zIndex: 9999,
            padding: "12px 20px",
            background: "#D1FAE5",
            border: `1px solid ${S.statusPass}`,
            borderRadius: 6,
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            color: S.statusPass,
            boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          }}
        >
          ✓ Changes saved (stub — not persisted)
        </div>
      )}

      {/* Feature Flags */}
      <SectionCard title="FEATURE FLAGS">
        {flags.map((flag, i) => (
          <div
            key={flag.key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 20px",
              borderBottom: i < flags.length - 1 ? `1px solid ${S.rim}` : "none",
            }}
          >
            <div>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.textPrimary, marginBottom: 2 }}>
                {flag.label}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                {flag.description}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  color: flag.enabled ? S.statusPass : S.textTertiary,
                }}
              >
                {flag.enabled ? "ON" : "OFF"}
              </span>
              <Toggle enabled={flag.enabled} onChange={(v) => toggleFlag(flag.key, v)} />
            </div>
          </div>
        ))}
      </SectionCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Default Tier */}
        <SectionCard title="DEFAULT SIGNUP TIER">
          <div style={{ padding: 20 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginBottom: 10 }}>
              New signups will be assigned this tier automatically.
            </div>
            <select
              value={defaultTier}
              onChange={(e) => setDefaultTier(e.target.value)}
              style={{
                width: "100%",
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.textPrimary,
                background: S.bgDeep,
                border: `1px solid ${S.rim}`,
                borderRadius: 5,
                padding: "8px 12px",
                outline: "none",
              }}
            >
              <option value="lite">LITE (free tier)</option>
              <option value="smb">SMB (standard paid)</option>
              <option value="enterprise">ENTERPRISE</option>
            </select>
            <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, marginTop: 8 }}>
              Current: <strong>{defaultTier.toUpperCase()}</strong>
            </div>
          </div>
        </SectionCard>

        {/* Maintenance Mode */}
        <SectionCard title="MAINTENANCE MODE">
          <div style={{ padding: 20 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginBottom: 14 }}>
              When enabled, all non-superuser requests receive a 503 maintenance response.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Toggle enabled={maintenanceMode} onChange={setMaintenanceMode} />
              <span
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  color: maintenanceMode ? S.accentRed : S.textTertiary,
                }}
              >
                {maintenanceMode ? "MAINTENANCE ACTIVE" : "MAINTENANCE OFF"}
              </span>
            </div>
            {maintenanceMode && (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  background: "#FEF2F2",
                  border: `1px solid ${S.accentRed}`,
                  borderRadius: 5,
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  color: S.accentRed,
                  fontWeight: 600,
                }}
              >
                ⚠ All users will be locked out
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Rate Limits (read-only display) */}
      <SectionCard title="RATE LIMIT CONFIGURATION">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
              {["TIER / CONTEXT", "LIMIT"].map((h) => (
                <th key={h} style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: S.textTertiary, padding: "8px 20px", textAlign: "left" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RATE_LIMITS.map((rl, i) => (
              <tr key={rl.label} style={{ borderBottom: i < RATE_LIMITS.length - 1 ? `1px solid ${S.rim}` : "none" }}>
                <td style={{ padding: "10px 20px", fontFamily: S.fontMono, fontSize: 12, color: S.textSecondary }}>{rl.label}</td>
                <td style={{ padding: "10px 20px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.textPrimary }}>{rl.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: "10px 20px 14px", fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary }}>
          Rate limits are configured in backend/app/core/config.py — not editable from UI.
        </div>
      </SectionCard>
    </div>
  );
}
