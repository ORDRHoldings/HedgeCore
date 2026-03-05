"use client";
/**
 * /decision-desk/runs/[run_id]
 * Decision Desk — full run detail with proposals, packets, and trace.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";

const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
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

const ACTION_COLORS: Record<string, string> = {
  HEDGE_IMMEDIATE: S.red,
  HEDGE_STAGED:    S.amber,
  REDUCE_RATIO:    "#a78bfa",
  NO_ACTION:       S.tertiary,
};

function fmt(n: number | undefined | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

interface Proposal {
  id: string;
  rank: number;
  action: string;
  currency_pair: string;
  instrument: string;
  side: string;
  notional_amount: number;
  notional_currency: string;
  hedge_ratio_pct: number;
  residual_exposure: number;
  cost_estimate_usd: number;
  margin_proxy_usd: number;
  rationale: string;
  schedule: Array<{ tranche: number; date: string; amount: number; pct: number }> | null;
  proposal_hash: string;
  created_at: string;
}

interface Packet {
  id: string;
  proposal_id: string;
  packet_json: Record<string, unknown>;
  ibkr_payload: Record<string, unknown>;
  ticket_text: string;
  packet_hash: string;
  created_at: string;
}

interface RunDetail {
  run_id: string;
  position_ids: string[];
  policy_revision_id: string | null;
  market_snapshot_id: string | null;
  run_hash: string;
  inputs_hash: string;
  outputs_hash: string;
  methodology_version: string;
  status: string;
  created_at: string;
  proposals: Proposal[];
  trace_bundle: Record<string, unknown>;
}

export default function DecisionRunDetailPage() {
  const { run_id } = useParams<{ run_id: string }>();
  const { token } = useAuth();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"proposals" | "packets" | "trace" | "hashes">("proposals");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !run_id) return;
    setLoading(true);
    try {
      const [runRes, pktsRes] = await Promise.all([
        dashboardFetch(`/v1/decisions/runs/${run_id}`, token),
        dashboardFetch(`/v1/decisions/runs/${run_id}/packets`, token),
      ]);
      if (!runRes.ok) { setError("Run not found."); return; }
      setRun(await runRes.json());
      if (pktsRes.ok) {
        const p = await pktsRes.json();
        setPackets(p.packets ?? []);
      }
    } catch { setError("Failed to load run."); }
    finally { setLoading(false); }
  }, [token, run_id]);

  useEffect(() => { load(); }, [load]);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  if (loading) return <div style={{ padding: 40, fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>Loading…</div>;
  if (error || !run) return <div style={{ padding: 40, fontFamily: S.fontMono, fontSize: 12, color: S.red }}>{error ?? "Run not found."}</div>;

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, padding: "28px 40px", fontFamily: S.fontUI }}>

      {/* Breadcrumb */}
      <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 16 }}>
        <Link href="/decision-desk" style={{ color: S.cyan, textDecoration: "none" }}>DECISION DESK</Link>
        {" / "}
        <span>RUN {run_id.slice(0, 12)}…</span>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: S.primary, margin: 0 }}>
            Decision Run Detail
          </h1>
          <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 4 }}>
            v{run.methodology_version} · {new Date(run.created_at).toLocaleString()} · {run.status}
          </div>
        </div>
        <Link
          href="/decision-desk"
          style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, textDecoration: "none", border: `1px solid ${S.soft}`, padding: "7px 16px", borderRadius: 2 }}
        >
          ← BACK
        </Link>
      </div>

      {/* Summary pills */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Positions", value: run.position_ids.length },
          { label: "Proposals", value: run.proposals.length },
          { label: "Actionable", value: run.proposals.filter(p => p.action !== "NO_ACTION").length },
          { label: "Packets", value: packets.length },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "10px 18px" }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: S.primary }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${S.rim}`, marginBottom: 0 }}>
        {(["proposals", "packets", "trace", "hashes"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              fontFamily: S.fontMono, fontSize: 11, fontWeight: activeTab === tab ? 700 : 400,
              color: activeTab === tab ? S.cyan : S.secondary,
              background: "transparent", border: "none",
              borderBottom: `2px solid ${activeTab === tab ? S.cyan : "transparent"}`,
              padding: "10px 20px", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >
            {tab === "proposals" ? `Proposals (${run.proposals.length})` :
             tab === "packets" ? `Packets (${packets.length})` :
             tab === "trace" ? "Trace" : "Hashes"}
          </button>
        ))}
      </div>

      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderTop: "none" }}>

        {/* Proposals tab */}
        {activeTab === "proposals" && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: S.bgSub }}>
                {["Rank", "Action", "Pair", "Instrument", "Side", "Notional (USD)", "Hedge Ratio", "Cost ~"].map(h => (
                  <th key={h} style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, textAlign: "left", padding: "10px 14px", borderBottom: `1px solid ${S.soft}`, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {run.proposals.map(p => {
                const color = ACTION_COLORS[p.action] ?? S.tertiary;
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${S.soft}` }}>
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, fontWeight: 700 }}>#{p.rank}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color, background: `color-mix(in srgb, ${color} 10%, transparent)`, padding: "2px 7px", borderRadius: 2 }}>{p.action}</span>
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 11, fontWeight: 600, color: S.primary }}>{p.currency_pair}</td>
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>{p.instrument}</td>
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: p.side === "BUY" ? S.green : S.amber }}>{p.side}</td>
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.primary }}>{fmt(p.notional_amount)}</td>
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>{p.hedge_ratio_pct.toFixed(0)}%</td>
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 10, color: S.amber }}>{fmt(p.cost_estimate_usd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Packets tab */}
        {activeTab === "packets" && (
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {packets.length === 0 ? (
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary, textAlign: "center", padding: "24px 0" }}>No execution packets (all proposals were NO_ACTION).</div>
            ) : packets.map(pk => (
              <div key={pk.id} style={{ background: S.bgSub, border: `1px solid ${S.soft}`, padding: "14px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.primary }}>
                    {pk.ticket_text}
                  </div>
                  <button
                    onClick={() => copyText(JSON.stringify(pk.ibkr_payload, null, 2), pk.id)}
                    style={{
                      fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                      color: copiedId === pk.id ? S.green : S.cyan,
                      background: "transparent", border: `1px solid ${copiedId === pk.id ? S.green : `color-mix(in srgb, ${S.cyan} 30%, transparent)`}`,
                      padding: "4px 12px", cursor: "pointer", borderRadius: 2, whiteSpace: "nowrap",
                    }}
                  >
                    {copiedId === pk.id ? "✓ COPIED" : "COPY IBKR"}
                  </button>
                </div>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
                  hash: {pk.packet_hash.slice(0, 16)}…
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Trace tab */}
        {activeTab === "trace" && (
          <div style={{ padding: "16px 20px" }}>
            {((run.trace_bundle as Record<string, unknown>)?.events as Array<Record<string, unknown>> ?? []).map((evt, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: `1px solid ${S.soft}` }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.cyan, minWidth: 140, flexShrink: 0, letterSpacing: "0.06em" }}>
                  {String(evt.step)}
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, flex: 1 }}>{String(evt.detail)}</div>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {String(evt.timestamp).slice(11, 19)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Hashes tab */}
        {activeTab === "hashes" && (
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { label: "RUN HASH", value: run.run_hash, color: S.cyan },
              { label: "INPUTS HASH", value: run.inputs_hash, color: S.amber },
              { label: "OUTPUTS HASH", value: run.outputs_hash, color: S.green },
              { label: "MARKET SNAPSHOT", value: run.market_snapshot_id ?? "—", color: S.tertiary },
              { label: "POLICY REVISION", value: run.policy_revision_id ?? "(defaults)", color: S.tertiary },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: S.bgSub, padding: "10px 14px", border: `1px solid ${S.soft}` }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color, marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary, wordBreak: "break-all" }}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
