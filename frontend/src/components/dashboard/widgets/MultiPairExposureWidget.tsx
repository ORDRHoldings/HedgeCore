"use client";

import { useState, useEffect, useCallback } from "react";
import { Globe } from "lucide-react";
import type { WidgetProps } from "@/lib/widgets/widgetRegistry";
import { PAIR_REGISTRY } from "@/constants/pairRegistry";
import GuidedEmptyState from "@/components/ui/GuidedEmptyState";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  panel:    "var(--bg-panel)",
  sub:      "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  green:    "var(--status-pass,#22c55e)",
  red:      "var(--accent-red,#f87171)",
} as const;

// Silence unused import warning — PAIR_REGISTRY is used for demo data length reference
void PAIR_REGISTRY;

interface PairExposure {
  pair: string;
  label: string;
  exposure_usd: number;
  hedge_pct: number;
  is_ndf: boolean;
  group: string;
}

export default function MultiPairExposureWidget({ token, user: _user, onRemove }: WidgetProps) {
  const [exposures, setExposures] = useState<PairExposure[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Try to load real position data from the positions endpoint
      // Fall back to demo data derived from pairRegistry
      const res = await fetch("/api/v1/positions/exposure", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        const data = await res.json() as { exposures?: PairExposure[] };
        if (data.exposures && data.exposures.length > 0) {
          setExposures(data.exposures);
          setLastUpdated(new Date());
          return;
        }
      }
    } catch {
      // Fall through to demo data
    }

    // No real data available
    setExposures([]);
    setLastUpdated(new Date());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalExposure = exposures.reduce((s, e) => s + e.exposure_usd, 0);
  const maxExposure = Math.max(...exposures.map(e => e.exposure_usd), 1);

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      fontFamily: S.fontUI, background: S.panel,
    }}>
      {/* Widget header */}
      <div className="widget-drag-handle" style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "0 12px", height: 38, flexShrink: 0,
        borderBottom: `1px solid ${S.rim}`, background: S.sub,
        cursor: "grab",
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.12em", color: S.tertiary }}>⬡</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase" }}>
          Multi-Pair Exposure
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, padding: "1px 5px", border: `1px solid ${S.soft}`, borderRadius: 2 }}>
          DEMO
        </span>
        <div style={{ flex: 1 }} />
        {lastUpdated && (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
            {lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <button onClick={loadData} title="Refresh" style={{
          background: "transparent", border: "none", cursor: "pointer",
          fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, padding: "0 4px",
        }}>↻</button>
        {onRemove && (
          <button onClick={onRemove} style={{
            background: "transparent", border: "none", cursor: "pointer",
            fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, padding: "0 4px",
          }}>✕</button>
        )}
      </div>

      {/* Total KPI */}
      {!loading && (
        <div style={{
          padding: "8px 12px", borderBottom: `1px solid ${S.soft}`,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.08em" }}>TOTAL EXPOSURE</div>
            <div style={{ fontFamily: S.fontMono, fontSize: 16, fontWeight: 700, color: S.primary }}>
              ${(totalExposure / 1_000_000).toFixed(1)}M
            </div>
          </div>
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.08em" }}>PAIRS</div>
            <div style={{ fontFamily: S.fontMono, fontSize: 16, fontWeight: 700, color: S.cyan }}>{exposures.length}</div>
          </div>
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.08em" }}>NDF PAIRS</div>
            <div style={{ fontFamily: S.fontMono, fontSize: 16, fontWeight: 700, color: S.amber }}>{exposures.filter(e => e.is_ndf).length}</div>
          </div>
        </div>
      )}

      {/* Pair list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 16, fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>Loading…</div>
        ) : exposures.length === 0 ? (
          <GuidedEmptyState
            icon={Globe}
            title="No Multi-Pair Exposures"
            description="Register positions across currency pairs to see your portfolio exposure breakdown."
            cta={{ label: "OPEN POSITION DESK", onClick: () => {} }}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {exposures.map(e => {
              const barPct = (e.exposure_usd / maxExposure) * 100;
              const hedgeColor = e.hedge_pct >= 80 ? S.green : e.hedge_pct >= 60 ? S.amber : S.red;
              return (
                <div key={e.pair} style={{
                  padding: "8px 12px", borderBottom: `1px solid ${S.soft}`,
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan, width: 64 }}>{e.label}</span>
                    {e.is_ndf && (
                      <span style={{
                        fontFamily: S.fontMono, fontSize: 12, color: S.amber,
                        padding: "1px 4px", border: `1px solid ${S.amber}`, borderRadius: 2,
                      }}>NDF</span>
                    )}
                    <div style={{ flex: 1, height: 6, background: S.sub, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${barPct}%`, height: "100%", background: S.cyan, opacity: 0.6, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, width: 60, textAlign: "right" }}>
                      ${(e.exposure_usd / 1_000_000).toFixed(1)}M
                    </span>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: hedgeColor,
                      width: 40, textAlign: "right",
                    }}>
                      {e.hedge_pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${S.soft}`,
        fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
        display: "flex", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span>Hedge %: <span style={{ color: S.green }}>≥80% ✓</span></span>
        <a href="/portfolio-multi" style={{ color: S.cyan, textDecoration: "none" }}>All pairs ↗</a>
      </div>
    </div>
  );
}
