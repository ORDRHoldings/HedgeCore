"use client";

import { useEffect, useState, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  red:       "var(--accent-red)",
  pass:      "var(--status-pass)",
  fail:      "var(--status-fail)",
} as const;

interface SystemConfig {
  feature_flags: Record<string, boolean>;
  default_signup_tier: string;
  maintenance_mode: boolean;
  maintenance_message: string;
  rate_limits: Record<string, string>;
  cors_origins: string[];
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const FLAG_LABELS: Record<string, string> = {
  audit_lab:            "Audit Lab",
  execution_proposals:  "Execution Proposals",
  policy_governance:    "Policy Governance",
  api_key_auth:         "API Key Auth",
  mfa_totp:             "MFA (TOTP)",
  sso_saml:             "SSO (SAML)",
  webhook_events:       "Webhook Events",
  advanced_analytics:   "Advanced Analytics",
};

const RATE_LIMIT_LABELS: Record<string, string> = {
  unauthenticated:       "Unauthenticated",
  authenticated:         "Authenticated",
  api_key_standard:      "API Key Standard",
  api_key_enterprise:    "API Key Enterprise",
  login_endpoint:        "Login Endpoint",
  calculate_endpoint:    "Calculate Endpoint",
};

const IN_MEMORY_BADGE = (
  <span style={{
    fontFamily: S.fontMono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: S.amber,
    background: `color-mix(in srgb,${S.amber} 10%,transparent)`,
    border: `1px solid color-mix(in srgb,${S.amber} 25%,transparent)`,
    padding: "1px 6px",
  }}>
    ⚠ IN-MEMORY
  </span>
);

function SectionCard({
  title,
  children,
  saveStatus,
  onSave,
}: {
  title: string;
  children: React.ReactNode;
  saveStatus: SaveStatus;
  onSave: () => void;
}) {
  return (
    <div style={{
      background: S.bgPanel,
      border: `1px solid ${S.rim}`,
      marginBottom: 20,
      overflow: "hidden",
    }}>
      <div style={{
        borderBottom: `1px solid ${S.rim}`,
        padding: "10px 16px",
        background: S.bgSub,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <span style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: S.secondary,
          flex: 1,
        }}>
          {title}
        </span>
        {IN_MEMORY_BADGE}
      </div>
      <div style={{ padding: 16 }}>
        {children}
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={onSave}
            disabled={saveStatus === "saving"}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              padding: "5px 18px",
              cursor: saveStatus === "saving" ? "not-allowed" : "pointer",
              background: `color-mix(in srgb,${S.cyan} 10%,transparent)`,
              border: `1px solid ${S.cyan}`,
              color: S.cyan,
            }}
          >
            {saveStatus === "saving" ? "SAVING..." : "SAVE"}
          </button>
          {saveStatus === "saved" && (
            <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.pass }}>
              ✓ SAVED
            </span>
          )}
          {saveStatus === "error" && (
            <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.red }}>
              ✗ SAVE FAILED
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function useSaveStatus(): [SaveStatus, (fn: () => Promise<void>) => void] {
  const [status, setStatus] = useState<SaveStatus>("idle");

  const run = useCallback((fn: () => Promise<void>) => {
    setStatus("saving");
    fn()
      .then(() => {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2500);
      })
      .catch(() => {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 2500);
      });
  }, []);

  return [status, run];
}

export default function ConfigTab({ token }: { token: string }) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Section 1 — Feature Flags
  const [localFlags, setLocalFlags] = useState<Record<string, boolean>>({});
  const [flagStatus, runFlagSave] = useSaveStatus();

  // Section 2 — Maintenance Mode
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [maintStatus, runMaintSave] = useSaveStatus();

  // Section 3 — Rate Limits
  const [localLimits, setLocalLimits] = useState<Record<string, string>>({});
  const [rateStatus, runRateSave] = useSaveStatus();

  // Section 4 — CORS Origins
  const [corsText, setCorsText] = useState("");
  const [corsStatus, runCorsSave] = useSaveStatus();

  useEffect(() => {
    dashboardFetch("/v1/admin/config", token)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const cfg = (await res.json()) as SystemConfig;
        setLocalFlags(cfg.feature_flags ?? {});
        setMaintenanceMode(cfg.maintenance_mode ?? false);
        setMaintenanceMessage(cfg.maintenance_message ?? "");
        setLocalLimits(cfg.rate_limits ?? {});
        setCorsText((cfg.cors_origins ?? []).join("\n"));
        setLoaded(true);
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : "Failed to load config");
        setLoaded(true);
      });
  }, [token]);

  const patchConfig = useCallback(
    async (payload: Partial<SystemConfig>) => {
      const res = await dashboardFetch("/v1/admin/config", token, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    [token]
  );

  if (!loaded) {
    return (
      <div style={{ padding: 24, fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
        LOADING CONFIG...
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: 24, fontFamily: S.fontMono, fontSize: 11, color: S.red }}>
        {loadError}
      </div>
    );
  }

  const flagKeys = Object.keys(localFlags).length > 0 ? Object.keys(localFlags) : Object.keys(FLAG_LABELS);
  const limitKeys = Object.keys(localLimits).length > 0 ? Object.keys(localLimits) : Object.keys(RATE_LIMIT_LABELS);

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI }}>

      {/* Section 1 — Feature Flags */}
      <SectionCard
        title="FEATURE FLAGS"
        saveStatus={flagStatus}
        onSave={() =>
          runFlagSave(() => patchConfig({ feature_flags: localFlags }))
        }
      >
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}>
          {flagKeys.map((key) => (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                background: S.bgSub,
                border: `1px solid ${S.rim}`,
              }}
            >
              <span style={{
                fontFamily: S.fontUI,
                fontSize: 12,
                color: S.secondary,
              }}>
                {FLAG_LABELS[key] ?? key}
              </span>
              <button
                onClick={() => setLocalFlags((f) => ({ ...f, [key]: !f[key] }))}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  padding: "2px 10px",
                  cursor: "pointer",
                  color: localFlags[key] ? S.pass : S.tertiary,
                  background: localFlags[key]
                    ? `color-mix(in srgb,${S.pass} 10%,transparent)`
                    : "transparent",
                  border: `1px solid ${localFlags[key] ? S.pass : S.rim}`,
                }}
              >
                {localFlags[key] ? "ON" : "OFF"}
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Section 2 — Maintenance Mode */}
      <SectionCard
        title="MAINTENANCE MODE"
        saveStatus={maintStatus}
        onSave={() =>
          runMaintSave(() =>
            patchConfig({
              maintenance_mode: maintenanceMode,
              maintenance_message: maintenanceMessage,
            })
          )
        }
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 10,
          }}>
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
              Maintenance Mode
            </span>
            <button
              onClick={() => setMaintenanceMode((v) => !v)}
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                padding: "2px 10px",
                cursor: "pointer",
                color: maintenanceMode ? S.pass : S.tertiary,
                background: maintenanceMode
                  ? `color-mix(in srgb,${S.pass} 10%,transparent)`
                  : "transparent",
                border: `1px solid ${maintenanceMode ? S.pass : S.rim}`,
              }}
            >
              {maintenanceMode ? "ON" : "OFF"}
            </button>
          </div>

          {maintenanceMode && (
            <div style={{
              background: `color-mix(in srgb,${S.amber} 10%,transparent)`,
              border: `1px solid color-mix(in srgb,${S.amber} 35%,transparent)`,
              padding: "8px 12px",
              marginBottom: 12,
              fontFamily: S.fontMono,
              fontSize: 11,
              color: S.amber,
              fontWeight: 700,
              letterSpacing: "0.05em",
            }}>
              ⚠ MAINTENANCE MODE ACTIVE
            </div>
          )}

          <label style={{
            display: "block",
            fontFamily: S.fontMono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: S.tertiary,
            marginBottom: 6,
          }}>
            MAINTENANCE MESSAGE
          </label>
          <textarea
            value={maintenanceMessage}
            onChange={(e) => setMaintenanceMessage(e.target.value)}
            rows={3}
            placeholder="Service is temporarily unavailable..."
            style={{
              width: "100%",
              background: S.bgSub,
              border: `1px solid ${S.rim}`,
              color: S.primary,
              fontFamily: S.fontUI,
              fontSize: 12,
              padding: "8px 10px",
              resize: "vertical" as const,
              boxSizing: "border-box" as const,
            }}
          />
        </div>
      </SectionCard>

      {/* Section 3 — Rate Limits */}
      <SectionCard
        title="RATE LIMITS"
        saveStatus={rateStatus}
        onSave={() =>
          runRateSave(() => patchConfig({ rate_limits: localLimits }))
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {limitKeys.map((key) => (
            <div
              key={key}
              style={{
                display: "grid",
                gridTemplateColumns: "200px 1fr",
                gap: 12,
                alignItems: "center",
              }}
            >
              <label style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.07em",
                color: S.tertiary,
                textTransform: "uppercase" as const,
              }}>
                {RATE_LIMIT_LABELS[key] ?? key}
              </label>
              <input
                type="text"
                value={localLimits[key] ?? ""}
                onChange={(e) =>
                  setLocalLimits((prev) => ({ ...prev, [key]: e.target.value }))
                }
                style={{
                  background: S.bgSub,
                  border: `1px solid ${S.rim}`,
                  color: S.primary,
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  padding: "5px 10px",
                }}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Section 4 — CORS Origins */}
      <SectionCard
        title="CORS ORIGINS"
        saveStatus={corsStatus}
        onSave={() =>
          runCorsSave(() => {
            const origins = corsText
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            return patchConfig({ cors_origins: origins });
          })
        }
      >
        <label style={{
          display: "block",
          fontFamily: S.fontMono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: S.tertiary,
          marginBottom: 6,
        }}>
          ONE ORIGIN PER LINE
        </label>
        <textarea
          value={corsText}
          onChange={(e) => setCorsText(e.target.value)}
          rows={8}
          spellCheck={false}
          style={{
            width: "100%",
            background: S.bgSub,
            border: `1px solid ${S.rim}`,
            color: S.primary,
            fontFamily: S.fontMono,
            fontSize: 11,
            padding: "8px 10px",
            resize: "vertical" as const,
            boxSizing: "border-box" as const,
          }}
        />
      </SectionCard>
    </div>
  );
}
