"use client";
/**
 * /hedge-plan/runs/[run_id] — Decision Desk run detail
 */

import { useState, Suspense } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import type { DecisionRun, DecisionProposal } from "@/types/api";

const ACTION_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  HEDGE_IMMEDIATE: { bg: "#FEF2F2", text: "#DC2626", label: "HEDGE NOW" },
  HEDGE_STAGED:    { bg: "#FFFBEB", text: "#D97706", label: "STAGE" },
  REDUCE_RATIO:    { bg: "#EFF6FF", text: "#1C62F2", label: "REDUCE" },
  NO_ACTION:       { bg: "#F8FAFC", text: "#94A3B8", label: "NO ACTION" },
};

type Tab = "proposals" | "packets" | "trace" | "hashes";

function RunDetailInner() {
  const { run_id } = useParams<{ run_id: string }>();
  const { token } = useAuthStore();
  const [tab, setTab] = useState<Tab>("proposals");
  const [copied, setCopied] = useState<string | null>(null);

  const { data: run, isLoading, error } = useQuery<DecisionRun>({
    queryKey: ["decision-run", run_id],
    queryFn: () => api.get<DecisionRun>(`/v1/decisions/runs/${run_id}`),
    enabled: !!token,
  });

  const copyJson = (key: string, payload: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (isLoading) return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)", fontFamily: "var(--font-terminal-mono)" }}>
      LOADING DECISION RUN...
    </div>
  );

  if (error || !run) return (
    <div style={{ padding: 40, color: "var(--accent-red)", fontFamily: "var(--font-terminal-mono)" }}>
      Run not found or error loading.
    </div>
  );

  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const actionableProposals = run.proposals.filter(p => p.action !== "NO_ACTION");
  const totalHedgeNotional = actionableProposals.reduce((s, p) => s + p.notional_usd, 0);

  const TABS: { key: Tab; label: string }[] = [
    { key: "proposals", label: "Proposals" },
    { key: "packets",   label: "Packets" },
    { key: "trace",     label: "Trace" },
    { key: "hashes",    label: "Hashes" },
  ];

  return (
    <div>
      <PageHeader
        label="HEDGE PLAN / DECISION RUN"
        title={`Run ${run_id.slice(0, 8).toUpperCase()}`}
        subtitle={`${run.proposals.length} proposals · ${run.packets.length} packets · ${new Date(run.created_at).toLocaleString()}`}
      />

      {/* Summary pills */}
      <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
        {[
          { label: "Total Hedge Notional", value: fmt(totalHedgeNotional), color: "var(--accent-cyan)" },
          { label: "Actionable Proposals", value: `${actionableProposals.length} / ${run.proposals.length}`, color: "var(--status-pass)" },
          { label: "Packets", value: String(run.packets.length), color: "var(--text-secondary)" },
          { label: "Verdict", value: run.verdict, color: run.verdict === "ACTIONABLE" ? "var(--status-pass)" : "var(--status-warn)" },
        ].map(pill => (
          <div key={pill.label} style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border-rim)",
            borderRadius: 4,
            padding: "10px 16px",
          }}>
            <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.08em", marginBottom: 3 }}>{pill.label.toUpperCase()}</div>
            <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 16, fontWeight: 700, color: pill.color }}>{pill.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border-rim)", marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: "none",
            border: "none",
            borderBottom: tab === t.key ? "2px solid var(--accent-cyan)" : "2px solid transparent",
            padding: "10px 20px",
            fontFamily: "var(--font-terminal-mono)",
            fontSize: 11,
            fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? "var(--accent-cyan)" : "var(--text-secondary)",
            cursor: "pointer",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Proposals tab */}
      {tab === "proposals" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {run.proposals.map((p: DecisionProposal) => {
            const ac = ACTION_COLORS[p.action] ?? ACTION_COLORS.NO_ACTION;
            return (
              <div key={p.proposal_id} style={{
                background: "var(--bg-panel)",
                border: "1px solid var(--border-rim)",
                borderRadius: 4,
                padding: "16px 20px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                  <span style={{ background: ac.bg, color: ac.text, fontFamily: "var(--font-terminal-mono)", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 2, letterSpacing: "0.08em" }}>
                    {ac.label}
                  </span>
                  <span style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{p.currency_pair}</span>
                  <span style={{ fontFamily: "var(--font-terminal)", fontSize: 12, color: "var(--text-secondary)" }}>{p.instrument} · {p.side}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-terminal-mono)", fontSize: 13, fontWeight: 700, color: "var(--accent-cyan)" }}>{fmt(p.notional_usd)}</span>
                </div>

                <div style={{ display: "flex", gap: 24, marginBottom: 10 }}>
                  {[
                    { label: "Net Exposure", value: fmt(Math.abs(p.net_usd)) },
                    { label: "Hedge Ratio",  value: `${(p.hedge_ratio * 100).toFixed(0)}%` },
                    { label: "Est. Cost",    value: `${(p.cost_pct * 100).toFixed(2)}%` },
                  ].map(stat => (
                    <div key={stat.label}>
                      <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 9, color: "var(--text-tertiary)", letterSpacing: "0.08em" }}>{stat.label.toUpperCase()}</div>
                      <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{stat.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ fontFamily: "var(--font-terminal)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: p.staged_schedule ? 12 : 0 }}>
                  {p.rationale}
                </div>

                {p.staged_schedule && p.staged_schedule.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 9, color: "var(--text-tertiary)", letterSpacing: "0.08em", marginBottom: 6 }}>STAGED SCHEDULE</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {p.staged_schedule.map((s, i) => (
                        <div key={i} style={{ background: "var(--bg-sub)", border: "1px solid var(--border-rim)", borderRadius: 3, padding: "5px 10px" }}>
                          <span style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>{s.tenor_days}D: </span>
                          <span style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 10, fontWeight: 600, color: "var(--text-primary)" }}>{fmt(s.notional_usd)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Packets tab */}
      {tab === "packets" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {run.packets.map((pkt) => (
            <div key={pkt.packet_id} style={{ background: "var(--bg-panel)", border: "1px solid var(--border-rim)", borderRadius: 4, padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>Packet {pkt.packet_id.slice(0, 8)}</div>
                  <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>Proposal: {pkt.proposal_id.slice(0, 8)}</div>
                </div>
                <button
                  onClick={() => copyJson(pkt.packet_id, pkt.ibkr_payload)}
                  style={{
                    fontFamily: "var(--font-terminal-mono)", fontSize: 11, fontWeight: 700,
                    color: copied === pkt.packet_id ? "var(--status-pass)" : "var(--accent-cyan)",
                    background: "none",
                    border: `1px solid ${copied === pkt.packet_id ? "var(--status-pass)" : "var(--accent-cyan)"}`,
                    borderRadius: 3, padding: "6px 14px", cursor: "pointer", letterSpacing: "0.06em",
                  }}
                >
                  {copied === pkt.packet_id ? "✓ COPIED" : "COPY IBKR PAYLOAD"}
                </button>
              </div>
              <pre style={{
                fontFamily: "var(--font-terminal-mono)", fontSize: 11, color: "var(--text-secondary)",
                background: "var(--bg-sub)", padding: 12, borderRadius: 3, overflow: "auto",
                maxHeight: 200, margin: 0,
              }}>
                {JSON.stringify(pkt.ibkr_payload, null, 2)}
              </pre>
              <div style={{ marginTop: 8, fontFamily: "var(--font-terminal-mono)", fontSize: 9, color: "var(--text-tertiary)" }}>
                HASH: {pkt.packet_hash}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trace tab */}
      {tab === "trace" && (
        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border-rim)", borderRadius: 4, padding: 20 }}>
          <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 10, color: "var(--text-tertiary)", letterSpacing: "0.08em", marginBottom: 12 }}>EXECUTION TRACE</div>
          <pre style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 11, color: "var(--text-secondary)", overflow: "auto", margin: 0 }}>
            {JSON.stringify({ run_id, verdict: run.verdict, proposal_count: run.proposals.length }, null, 2)}
          </pre>
        </div>
      )}

      {/* Hashes tab */}
      {tab === "hashes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { label: "Run Hash",     value: run.run_hash,     desc: "Fingerprint of inputs + outputs combined" },
            { label: "Inputs Hash",  value: run.inputs_hash,  desc: "SHA-256 of position inputs and config" },
            { label: "Outputs Hash", value: run.outputs_hash, desc: "SHA-256 of proposals and packets" },
          ].map(h => (
            <div key={h.label} style={{ background: "var(--bg-panel)", border: "1px solid var(--border-rim)", borderRadius: 4, padding: "16px 20px" }}>
              <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 9, color: "var(--text-tertiary)", letterSpacing: "0.1em", marginBottom: 6 }}>{h.label.toUpperCase()}</div>
              <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 12, color: "var(--text-primary)", wordBreak: "break-all", marginBottom: 4 }}>{h.value}</div>
              <div style={{ fontFamily: "var(--font-terminal)", fontSize: 11, color: "var(--text-tertiary)" }}>{h.desc}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HedgePlanRunPage() {
  return (
    <Suspense>
      <RunDetailInner />
    </Suspense>
  );
}
