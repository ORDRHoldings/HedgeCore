"use client";

import { useState } from "react";
import { RefreshCw, Zap, AlertCircle, CheckCircle2 } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/authContext";
import { triggerERPPull } from "@/lib/api/glClient";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  rim: "var(--border-rim)",
  accent: "var(--accent-cyan)",
  text: "var(--text-primary)",
  textSub: "var(--text-secondary)",
} as const;

interface PullResult {
  source_system: string;
  invoices_fetched: number;
  positions_created: number;
  duplicates_skipped: number;
  timestamp: string;
}

export default function ERPSyncPage() {
  const isMobile = useIsMobile();
  const { token } = useAuth();
  const [pulling, setPulling] = useState(false);
  const [results, setResults] = useState<PullResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectorId, setConnectorId] = useState("");

  if (!token) return null;

  const handlePull = async () => {
    if (!connectorId.trim()) { setError("Enter a connector ID"); return; }
    setError(null);
    setPulling(true);
    try {
      const result = await triggerERPPull(token, connectorId.trim());
      setResults((p) => [{ ...result, timestamp: new Date().toISOString() }, ...p.slice(0, 9)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pull failed");
    } finally {
      setPulling(false);
    }
  };

  return (
    <PageShell icon={RefreshCw} title="ERP Sync" breadcrumb={["Hedge Desk", "ERP Sync"]} noPadding>
      <div style={{ padding: isMobile ? "12px 16px" : "24px 32px", fontFamily: S.fontUI }}>

        <p style={{ fontSize: 13, color: S.textSub, marginBottom: 24, lineHeight: 1.6 }}>
          Pull open foreign-currency invoices from connected ERP systems.
          New invoices are automatically created as{" "}
          <span style={{ fontFamily: S.fontMono, color: S.accent, fontSize: 11 }}>PENDING_REVIEW</span>{" "}
          positions — review them in Position Desk before hedging.
        </p>

        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 4, padding: 20, marginBottom: 24 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textSub, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 }}>
            Manual Pull
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: isMobile ? "wrap" : "nowrap" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 6 }}>CONNECTOR ID</label>
              <input value={connectorId} onChange={(e) => setConnectorId(e.target.value)}
                placeholder="UUID of your ERP connector"
                style={{ width: "100%", background: S.bgDeep, border: `1px solid ${S.rim}`, color: S.text, padding: "7px 10px", fontSize: 13, fontFamily: S.fontMono, borderRadius: 3, boxSizing: "border-box" }}
              />
            </div>
            <button onClick={handlePull} disabled={pulling}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", background: pulling ? S.bgDeep : S.accent, color: pulling ? S.textSub : "#000", border: "none", borderRadius: 3, fontSize: 13, fontFamily: S.fontMono, cursor: pulling ? "not-allowed" : "pointer", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
              <Zap size={14} />{pulling ? "PULLING..." : "PULL NOW"}
            </button>
          </div>
          {error && (
            <div style={{ marginTop: 12, color: "#d0021b", fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
              <AlertCircle size={13} /> {error}
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textSub, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
              Recent Pulls
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {results.map((r, i) => (
                <div key={i} style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 4, padding: "12px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                  <CheckCircle2 size={16} color="#7ed321" />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.accent }}>{r.source_system}</span>
                    <span style={{ marginLeft: 16, fontSize: 12, color: S.text }}>{r.invoices_fetched} invoices fetched</span>
                    <span style={{ marginLeft: 12, fontSize: 12, color: "#7ed321" }}>+{r.positions_created} positions created</span>
                    {r.duplicates_skipped > 0 && (
                      <span style={{ marginLeft: 12, fontSize: 12, color: S.textSub }}>{r.duplicates_skipped} duplicates skipped</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: S.textSub, fontFamily: S.fontMono }}>{new Date(r.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
