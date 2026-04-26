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
import { PageShell } from "@/components/layout/PageShell";
import { T } from "@/lib/design/tokens";

const S = {
  mono:  T.fontMono,
  ui:    T.fontUI,
  deep:  T.bgDeep,
  panel: T.bgPanel,
  sub:   T.bgSub,
  rim:   T.rim,
  cyan:  T.signalCyan,
  text1: T.primary,
  text2: T.secondary,
  green: T.pass,
  red:   T.signalRed,
  white: "#fff",
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
    <PageShell
      icon={Brain}
      title="Intelligence"
      actions={
        <span style={{
          padding: "2px 8px", borderRadius: 3,
          background: "rgba(0,200,200,0.1)", border: `1px solid ${S.cyan}`,
          fontFamily: S.mono, fontSize: 12, color: S.cyan, letterSpacing: 1,
        }}>PHASE 3</span>
      }
    >
      <div style={{ fontFamily: S.ui, fontSize: 12, color: S.text2, marginBottom: 16 }}>
        AI Add-On Tier — Advisory Only
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
                    background: settings.enabled ? S.red : S.green, color: S.white,
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
    </PageShell>
  );
}
