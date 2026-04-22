"use client";
// frontend/src/app/intelligence/page.tsx
// Intelligence Tier settings + usage dashboard.

import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import {
  getIntelligenceSettings,
  patchIntelligenceSettings,
  type IntelligenceSettingsResponse,
} from "@/lib/api/intelligenceClient";
import { Brain } from "lucide-react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

const S = {
  mono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  ui:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  deep: "var(--bg-deep)",
  panel: "var(--bg-panel)",
  sub:  "var(--bg-sub)",
  rim:  "var(--border-rim)",
  cyan: "var(--accent-cyan)",
  text1: "var(--text-primary)",
  text2: "var(--text-secondary)",
  green: "var(--status-pass,#059669)",
  red:   "var(--accent-red,#DC2626)",
} as const;

export default function IntelligencePage() {
  const isMobile = useIsMobile();
  const { user, token } = useAuth();
  const [settings, setSettings] = useState<IntelligenceSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getIntelligenceSettings(token);
      setSettings(data);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    if (!token || !settings) return;
    setToggling(true);
    try {
      const updated = await patchIntelligenceSettings(!settings.enabled, token);
      setSettings(updated);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "Failed to update settings.");
    } finally {
      setToggling(false);
    }
  };

  const canToggle = user?.roles?.includes("admin") || user?.roles?.includes("cfo") || user?.is_superuser;

  return (
    <div style={{ minHeight: "100vh", background: S.deep, padding: isMobile ? 12 : 32, fontFamily: S.ui }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 6,
          background: "rgba(0,200,200,0.1)", border: `1px solid ${S.cyan}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Brain size={18} color={S.cyan} />
        </div>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: 14, color: S.text1, letterSpacing: 1 }}>
            INTELLIGENCE
          </div>
          <div style={{ fontSize: 11, color: S.text2 }}>AI Add-On Tier — Advisory Only</div>
        </div>
        <div style={{
          marginLeft: 12, padding: "2px 8px", borderRadius: 3,
          background: "rgba(0,200,200,0.1)", border: `1px solid ${S.cyan}`,
          fontFamily: S.mono, fontSize: 9, color: S.cyan, letterSpacing: 1,
        }}>PHASE 3</div>
      </div>

      {loading && (
        <div style={{ color: S.text2, fontFamily: S.mono, fontSize: 12 }}>Loading...</div>
      )}

      {error && (
        <div style={{ color: S.red, fontFamily: S.mono, fontSize: 12, marginBottom: 16 }}>{error}</div>
      )}

      {settings && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16, maxWidth: 800 }}>
          {/* Enable/Disable card */}
          <div style={{ gridColumn: "span 3", background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: S.mono, fontSize: 12, color: S.text1, marginBottom: 4 }}>
                  INTELLIGENCE ENABLED
                </div>
                <div style={{ fontSize: 12, color: S.text2 }}>
                  {settings.enabled
                    ? "Active — CMD+K and report commentary available."
                    : "Disabled — enable to activate AI features."}
                </div>
              </div>
              {canToggle && (
                <button
                  onClick={toggle}
                  disabled={toggling}
                  style={{
                    padding: "8px 16px", borderRadius: 4, cursor: toggling ? "not-allowed" : "pointer",
                    fontFamily: S.mono, fontSize: 11, letterSpacing: 1, border: "none",
                    background: settings.enabled ? S.red : S.green, color: "#fff",
                    opacity: toggling ? 0.6 : 1,
                  }}
                >
                  {toggling ? "..." : settings.enabled ? "DISABLE" : "ENABLE"}
                </button>
              )}
              {!canToggle && (
                <div style={{ fontSize: 11, color: S.text2, fontFamily: S.mono }}>
                  Admin required to change
                </div>
              )}
            </div>
          </div>

          {/* KPI: Queries this month */}
          <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 10, fontFamily: S.mono, color: S.text2, marginBottom: 8, letterSpacing: 1 }}>
              QUERIES THIS MONTH
            </div>
            <div style={{ fontSize: 28, fontFamily: S.mono, color: S.cyan }}>
              {settings.queries_this_month.toLocaleString()}
            </div>
          </div>

          {/* KPI: Tokens */}
          <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 10, fontFamily: S.mono, color: S.text2, marginBottom: 8, letterSpacing: 1 }}>
              TOKENS THIS MONTH
            </div>
            <div style={{ fontSize: 28, fontFamily: S.mono, color: S.text1 }}>
              {settings.tokens_this_month.toLocaleString()}
            </div>
          </div>

          {/* Model info */}
          <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 10, fontFamily: S.mono, color: S.text2, marginBottom: 8, letterSpacing: 1 }}>
              MODEL
            </div>
            <div style={{ fontSize: 12, fontFamily: S.mono, color: S.text1 }}>
              {settings.model}
            </div>
            <div style={{ fontSize: 10, color: S.text2, marginTop: 4 }}>Anthropic API · Advisory only</div>
          </div>

          {/* Usage guide */}
          <div style={{ gridColumn: "span 3", background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16 }}>
            <div style={{ fontFamily: S.mono, fontSize: 11, color: S.text2, marginBottom: 8 }}>HOW TO USE</div>
            <div style={{ display: "flex", gap: 24, fontSize: 12, color: S.text2 }}>
              <div>
                <span style={{ fontFamily: S.mono, color: S.cyan }}>⌘K / Ctrl+K</span>
                {" "}— Open natural language query on any page
              </div>
              <div>
                <span style={{ fontFamily: S.mono, color: S.cyan }}>Report Commentary</span>
                {" "}— Draft AI commentary from hedge effectiveness reports
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
