"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";

const S = {
  fontUI:   "Inter, 'IBM Plex Sans', sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  blue:     "#1C62F2",
  green:    "#2ECC71",
  red:      "#E74C3C",
  amber:    "var(--accent-amber)",
} as const;

interface Proposal {
  id: string;
  position_id: string;
  status: "PROPOSED" | "APPROVED" | "EXECUTED" | "WITHDRAWN" | "REJECTED";
  proposed_by_email: string | null;
  proposed_at: string;
  approved_by_email: string | null;
  approved_at: string | null;
  executed_at: string | null;
  execution_ref: string | null;
  proposal_hash: string;
  approval_hash: string | null;
  fill_hash: string | null;
  actual_fill_rate: number | null;
  slippage_bps: number | null;
  risk_verdict: string | null;
}

function statusColor(s: string): string {
  switch (s) {
    case "EXECUTED": return "#2ECC71";
    case "APPROVED": return "#1C62F2";
    case "PROPOSED": return "var(--accent-amber)";
    case "REJECTED": return "#E74C3C";
    case "WITHDRAWN": return "var(--text-tertiary)";
    default: return "var(--text-secondary)";
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function hashLabel(h: string | null): string {
  if (!h) return "—";
  return `${h.slice(0, 8)}…${h.slice(-4)}`;
}

export default function TradeHistoryPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      console.info("[TradeHistory] GET /v1/proposals");
      const res = await dashboardFetch("/v1/proposals", token);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Proposal[];
      setProposals(data);
    } catch (e) {
      console.error("[TradeHistory] fetch failed", e);
      setError(e instanceof Error ? e.message : "Failed to load proposals");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) router.push("/auth/login");
  }, [user, router]);

  if (!user) return null;

  const STATUSES = ["ALL", "PROPOSED", "APPROVED", "EXECUTED", "REJECTED", "WITHDRAWN"];
  const filtered = statusFilter === "ALL" ? proposals : proposals.filter((p) => p.status === statusFilter);

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, color: S.primary, fontFamily: S.fontUI }}>
      {/* Header */}
      <div style={{ height: 44, background: "var(--bg-panel)", borderBottom: `1px solid ${S.rim}`, display: "flex", alignItems: "center", padding: "0 20px", gap: 12, flexShrink: 0 }}>
        <button onClick={() => router.push("/dashboard")} style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, background: "none", border: "none", cursor: "pointer" }}>← Dashboard</button>
        <span style={{ color: S.rim }}>|</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.primary }}>TRADE HISTORY</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.blue, border: `1px solid ${S.blue}40`, background: `${S.blue}10`, padding: "1px 6px" }}>PROPOSALS</span>
        <div style={{ flex: 1 }} />
        <button onClick={load} style={{ fontFamily: S.fontMono, fontSize: 10, color: S.primary, background: "transparent", border: `1px solid ${S.rim}`, padding: "2px 8px", cursor: "pointer" }}>↻ Refresh</button>
      </div>

      {/* Status filters */}
      <div style={{ padding: "12px 20px", display: "flex", gap: 8, flexWrap: "wrap", background: "var(--bg-sub)", borderBottom: `1px solid ${S.rim}` }}>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            fontFamily: S.fontMono, fontSize: 10, padding: "4px 10px",
            background: statusFilter === s ? S.blue : "transparent",
            color: statusFilter === s ? "#fff" : S.tertiary,
            border: `1px solid ${statusFilter === s ? S.blue : S.soft}`,
            borderRadius: 2, cursor: "pointer",
          }}>{s}</button>
        ))}
        <span style={{ marginLeft: "auto", fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, alignSelf: "center" }}>
          {filtered.length} record{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Content */}
      <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
        {loading && (
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, textAlign: "center", padding: 60 }}>Loading proposals…</div>
        )}
        {error && (
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.red, padding: "12px 16px", background: `${S.red}10`, border: `1px solid ${S.red}`, borderRadius: 4, marginBottom: 16 }}>
            ERROR: {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginBottom: 12 }}>NO PROPOSALS FOUND</div>
            <p style={{ fontSize: 13, color: S.secondary, marginBottom: 20 }}>Run the Execution Desk pipeline to generate proposals for approval.</p>
            <button onClick={() => router.push("/execution-desk")} style={{ fontFamily: S.fontMono, fontSize: 11, padding: "8px 20px", background: S.blue, color: "#fff", border: "none", borderRadius: 3, cursor: "pointer" }}>
              OPEN EXECUTION DESK →
            </button>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div style={{ border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 120px 140px 140px 100px 110px", gap: 0, padding: "8px 14px", background: "var(--bg-sub)", borderBottom: `1px solid ${S.rim}`, fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <span>Proposal ID</span>
              <span>Position</span>
              <span>Status</span>
              <span>Risk Gate</span>
              <span>Maker</span>
              <span>Checker</span>
              <span>Fill Rate</span>
              <span>Slippage</span>
            </div>
            {/* Table rows */}
            {filtered.map((p) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 120px 140px 140px 100px 110px", gap: 0, padding: "10px 14px", borderBottom: `1px solid ${S.soft}`, alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary }}>{p.id.slice(0, 8).toUpperCase()}</div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{hashLabel(p.proposal_hash)}</div>
                </div>
                <div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>{p.position_id.slice(0, 8).toUpperCase()}</div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{p.execution_ref ?? "—"}</div>
                </div>
                <div>
                  <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: statusColor(p.status), padding: "2px 6px", border: `1px solid ${statusColor(p.status)}40`, borderRadius: 2, background: `${statusColor(p.status)}10` }}>
                    {p.status}
                  </span>
                </div>
                <div>
                  {p.risk_verdict ? (
                    <span style={{ fontFamily: S.fontMono, fontSize: 9, color: p.risk_verdict === "APPROVE" ? "#2ECC71" : p.risk_verdict === "REJECT" ? "#E74C3C" : "var(--accent-amber)" }}>
                      {p.risk_verdict === "APPROVE" ? "✓ APPROVED" : p.risk_verdict === "REJECT" ? "✗ REJECTED" : "⚠ WITH CONDITIONS"}
                    </span>
                  ) : <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>—</span>}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: S.secondary }}>{p.proposed_by_email ?? "—"}</div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{fmtDate(p.proposed_at)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: S.secondary }}>{p.approved_by_email ?? "—"}</div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{fmtDate(p.approved_at)}</div>
                </div>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, color: p.actual_fill_rate ? S.primary : S.tertiary }}>
                  {p.actual_fill_rate ? p.actual_fill_rate.toFixed(4) : "—"}
                </div>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, color: p.slippage_bps && p.slippage_bps > 5 ? S.red : p.slippage_bps ? S.green : S.tertiary }}>
                  {p.slippage_bps ? `${p.slippage_bps.toFixed(1)} bps` : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
