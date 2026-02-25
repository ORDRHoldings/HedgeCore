"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Radar, X } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { UserContext } from "@/lib/authContext";
import { getActivePolicy } from "@/api/policyClient";
import type { PolicyInstance } from "@/api/policyClient";

const S = {
  fontMono:   "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:     "'IBM Plex Sans', sans-serif",
  bgPanel:    "var(--bg-panel)",
  bgDeep:     "var(--bg-deep)",
  bgSub:      "var(--bg-sub)",
  rim:        "var(--border-rim)",
  borderSoft: "var(--border-soft)",
  primary:    "var(--text-primary)",
  secondary:  "var(--text-secondary)",
  tertiary:   "var(--text-tertiary)",
  cyan:       "var(--accent-cyan)",
  amber:      "var(--accent-amber)",
  green:      "var(--status-pass)",
  red:        "var(--accent-red)",
} as const;

const RISK_COLOR: Record<string, string> = {
  CONSERVATIVE: "var(--status-pass)",
  MODERATE:     "var(--accent-cyan)",
  AGGRESSIVE:   "var(--accent-amber)",
};

const RISK_DOT: Record<string, string> = {
  CONSERVATIVE: "●",
  MODERATE:     "◆",
  AGGRESSIVE:   "▲",
};

interface Props {
  token:     string;
  user:      UserContext;
  onRemove?: () => void;
}

export default function PolisophicMiniWidget({ token, onRemove }: Props) {
  const router = useRouter();

  // undefined = loading, null = no active policy, PolicyInstance = active
  const [instance, setInstance]   = useState<PolicyInstance | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getActivePolicy(token)
      .then(p  => { if (!cancelled) setInstance(p); })
      .catch(e => { if (!cancelled) { setLoadError(String(e)); setInstance(null); } });
    return () => { cancelled = true; };
  }, [token]);

  const loading = instance === undefined;
  const tmpl    = instance?.template ?? null;

  return (
    <div
      style={{
        background:    S.bgPanel,
        border:        `1px solid ${S.rim}`,
        borderRadius:  6,
        display:       "flex",
        flexDirection: "column",
        overflow:      "hidden",
        minHeight:     160,
      }}
    >
      {/* Header */}
      <div
        className="widget-drag-handle"
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          8,
          padding:      "8px 12px",
          borderBottom: `1px solid ${S.rim}`,
          background:   S.bgDeep,
          flexShrink:   0,
          cursor:       "grab",
        }}
      >
        <Radar size={13} color={S.cyan} style={{ flexShrink: 0 }} />
        <span
          style={{
            fontFamily:    S.fontMono,
            fontSize:      10,
            color:         S.primary,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            flex:          1,
          }}
        >
          Active Hedge Policy
        </span>
        {loading && (
          <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>
            LOADING…
          </span>
        )}
        {onRemove && (
          <button
            onClick={onRemove}
            aria-label="Remove widget"
            style={{
              background: "none",
              border:     "none",
              cursor:     "pointer",
              color:      S.tertiary,
              padding:    "0 0 0 4px",
              lineHeight: 1,
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1 }}>
        {loadError ? (
          <div style={{ padding: "10px 12px" }}>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.red }}>
              {loadError}
            </span>
          </div>
        ) : !instance || !tmpl ? (
          <div style={{ padding: "10px 12px" }}>
            <EmptyState
              type="empty"
              title="No active policy"
              message="Select a hedge policy template to activate it for your branch."
              action={{
                label: "Select Policy",
                onClick: () => router.push("/input"),
              }}
            />
          </div>
        ) : (
          <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>

            {/* Name + risk posture */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.1em",
                color: S.cyan,
                background: `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
                padding: "2px 6px",
              }}>
                {tmpl.short_name}
              </span>
              <span style={{ fontFamily: S.fontUI, fontSize: "0.6875rem", fontWeight: 600, color: S.primary }}>
                {tmpl.name}
              </span>
              <span style={{
                marginLeft: "auto",
                fontFamily: S.fontMono, fontSize: "0.6875rem",
                color: RISK_COLOR[tmpl.risk_posture] ?? S.tertiary,
                letterSpacing: "0.06em",
              }}>
                {RISK_DOT[tmpl.risk_posture] ?? "●"} {tmpl.risk_posture}
              </span>
            </div>

            {/* Key ratio grid */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
              border: `1px solid ${S.borderSoft}`,
            }}>
              {[
                { label: "CONF RATIO", value: `${((tmpl.config.hedge_ratios?.confirmed ?? 0) * 100).toFixed(0)}%` },
                { label: "FCST RATIO", value: `${((tmpl.config.hedge_ratios?.forecast  ?? 0) * 100).toFixed(0)}%` },
                { label: "BPS",        value: `${tmpl.config.cost_assumptions?.spread_bps ?? "—"}`                },
              ].map(({ label, value }, i) => (
                <div key={label} style={{
                  padding: "6px 8px", textAlign: "center",
                  borderRight: i < 2 ? `1px solid ${S.borderSoft}` : "none",
                }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: "0.4rem", color: S.tertiary, letterSpacing: "0.08em", marginBottom: 2 }}>
                    {label}
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: "0.625rem", fontWeight: 600, color: S.cyan }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Product chip + description */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em",
                color: tmpl.config.execution_product === "NDF" ? S.amber : S.green,
                background: `color-mix(in srgb, ${tmpl.config.execution_product === "NDF" ? S.amber : S.green} 8%, transparent)`,
                padding: "1px 5px",
              }}>
                {tmpl.config.execution_product ?? "NDF"}
              </span>
              {tmpl.description && (
                <span style={{
                  fontFamily: S.fontUI, fontSize: "0.75rem", color: S.tertiary,
                  flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {tmpl.description}
                </span>
              )}
            </div>

            {/* Activated at */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={10} color={S.green} />
              <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>
                ACTIVE SINCE {new Date(instance.activated_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
