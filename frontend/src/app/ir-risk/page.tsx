// frontend/src/app/ir-risk/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { TrendingDown, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { listSwaps, getDV01Ladder, mtmAll } from "@/lib/api/debtClient";
import type { IRSwap, DV01Ladder } from "@/lib/api/debtClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)", bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)", rim: "var(--border-rim)",
} as const;

const TENOR_BUCKETS = ["1Y", "2Y", "5Y", "10Y", "30Y"] as const;

export default function IRRiskPage() {
  const { token } = useAuth();
  const isMobile = useIsMobile();
  const [swaps, setSwaps] = useState<IRSwap[]>([]);
  const [ladder, setLadder] = useState<DV01Ladder | null>(null);
  const [mtmLoading, setMtmLoading] = useState(false);
  const [effectivenessResult, setEffectivenessResult] = useState<{ passed: boolean; ratio: number } | null>(null);

  useEffect(() => {
    if (!token) return;
    listSwaps(token).then(setSwaps).catch(() => null);
    getDV01Ladder(token).then(setLadder).catch(() => null);
  }, [token]);

  const handleMtmAll = async () => {
    if (!token) return;
    setMtmLoading(true);
    try {
      await mtmAll(token);
      const [s, l] = await Promise.all([listSwaps(token), getDV01Ladder(token)]);
      setSwaps(s); setLadder(l);
    } catch { /* fail-open */ } finally { setMtmLoading(false); }
  };

  const totalNPV = swaps.reduce((s, sw) => s + (sw.last_npv || 0), 0);
  const maxDV01 = ladder ? Math.max(...TENOR_BUCKETS.map(b => Math.abs(ladder[b])), 1) : 1;

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI, background: S.bgDeep, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <TrendingDown size={20} color="#6366f1" />
          <span style={{ fontFamily: S.fontMono, fontSize: 14, letterSpacing: 2, color: "#e5e7eb", textTransform: "uppercase" }}>IR Risk</span>
        </div>
        <button onClick={handleMtmAll} disabled={mtmLoading} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 14px", background: "#6366f122", border: "1px solid #6366f1",
          borderRadius: 4, color: "#6366f1", fontFamily: S.fontMono, fontSize: 11,
          letterSpacing: 1, cursor: "pointer",
        }}>
          <RefreshCw size={12} /> {mtmLoading ? "MARKING…" : "MTM ALL"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* Left — DV01 Ladder */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16 }}>
          <div style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", letterSpacing: 1, marginBottom: 16 }}>DV01 LADDER ($ PER BP)</div>
          {ladder ? TENOR_BUCKETS.map(tenor => {
            const val = ladder[tenor];
            const pct = (Math.abs(val) / maxDV01) * 100;
            return (
              <div key={tenor} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 32, fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af" }}>{tenor}</div>
                <div style={{ flex: 1, background: S.bgSub, borderRadius: 3, height: 16 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: val < 0 ? "#ef4444" : "#22c55e", borderRadius: 3 }} />
                </div>
                <div style={{ width: 80, fontSize: 11, fontFamily: S.fontMono, color: val < 0 ? "#ef4444" : "#22c55e", textAlign: "right" }}>
                  ${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            );
          }) : (
            <div style={{ color: "#6b7280", fontFamily: S.fontMono, fontSize: 12 }}>No swaps to aggregate</div>
          )}
          <div style={{ marginTop: 16, borderTop: `1px solid ${S.rim}`, paddingTop: 12, fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af" }}>
            Portfolio NPV: <span style={{ color: totalNPV >= 0 ? "#22c55e" : "#ef4444" }}>
              ${totalNPV.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* Right — Swap Portfolio */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${S.rim}`, fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", letterSpacing: 1 }}>
            SWAP PORTFOLIO ({swaps.length})
          </div>
          <div style={{ overflow: "auto", maxHeight: 400 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ background: S.bgSub }}>
                  {["Type", "Notional", "NPV", "DV01", "Status"].map(h => (
                    <th key={h} style={{ padding: "6px 12px", textAlign: "right", color: "#6b7280", fontSize: 10, letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {swaps.map((sw, i) => (
                  <tr key={sw.id} style={{ borderTop: `1px solid ${S.rim}`, background: i % 2 === 0 ? "transparent" : S.bgSub }}>
                    <td style={{ padding: "6px 12px", color: "#9ca3af" }}>{sw.instrument_type}</td>
                    <td style={{ padding: "6px 12px", color: "#e5e7eb", textAlign: "right" }}>${(sw.notional / 1e6).toFixed(1)}M</td>
                    <td style={{ padding: "6px 12px", textAlign: "right", color: sw.last_npv >= 0 ? "#22c55e" : "#ef4444" }}>
                      ${sw.last_npv.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: "6px 12px", textAlign: "right", color: sw.last_dv01 < 0 ? "#ef4444" : "#22c55e" }}>
                      ${sw.last_dv01.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: "6px 12px", textAlign: "right" }}>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3,
                        background: sw.status === "ACTIVE" ? "#22c55e22" : "#6b728022",
                        color: sw.status === "ACTIVE" ? "#22c55e" : "#6b7280" }}>
                        {sw.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {swaps.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: "16px 12px", color: "#6b7280", textAlign: "center", fontFamily: S.fontMono, fontSize: 12 }}>
                      No active swaps
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {effectivenessResult && (
            <div style={{ padding: 12, borderTop: `1px solid ${S.rim}`, display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontFamily: S.fontMono }}>
              {effectivenessResult.passed
                ? <><CheckCircle size={14} color="#22c55e" /> <span style={{ color: "#22c55e" }}>EFFECTIVE ({(effectivenessResult.ratio * 100).toFixed(1)}%)</span></>
                : <><XCircle size={14} color="#ef4444" /> <span style={{ color: "#ef4444" }}>NOT EFFECTIVE ({(effectivenessResult.ratio * 100).toFixed(1)}%)</span></>
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
