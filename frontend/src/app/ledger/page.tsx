"use client";

import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/authContext";
import type { RootState, AppDispatch } from "../../lib/store";
import { listLedgerThunk } from "../../lib/store/slices/pipelineSlice";
import EmptyState from "../../components/ui/EmptyState";
import ErrorBanner from "../../components/ui/ErrorBanner";
import type { LedgerEntry } from "../../api/pipelineTypes";
import HelpPanel from "@/components/layout/HelpPanel";
import { LEDGER_HELP } from "@/lib/helpContent";
import { PageShell } from "@/components/layout/PageShell";
import { Globe } from "lucide-react";

const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  pass:     "var(--status-pass,#22c55e)",
  fail:     "var(--accent-red,#ef4444)",
  amber:    "var(--accent-amber)",
} as const;

export default function LedgerListPage() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { token } = useAuth();
  const { ledgerEntries, ledgerLoading, error } = useSelector(
    (s: RootState) => s.pipeline
  );

  useEffect(() => {
    if (token) dispatch(listLedgerThunk({ token }));
  }, [dispatch, token]);

  return (
    <PageShell icon={Globe} title="Immutable Ledger" breadcrumb={["Governance", "Ledger"]} noPadding>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {error && <ErrorBanner code={error.code} message={error.message} />}
          {ledgerLoading ? (
            <EmptyState type="loading" message="Loading ledger…" />
          ) : ledgerEntries.length === 0 ? (
            <EmptyState
              type="empty"
              title="No ledger entries"
              message="Authorize a staged artifact to create an immutable ledger entry."
            />
          ) : (
            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}` }}>
              {/* Table header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>
                  IMMUTABLE LEDGER
                </span>
                <span style={{ color: S.rim }}>·</span>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{ledgerEntries.length} ENTRIES</span>
              </div>
              {/* Table */}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: S.bgSub }}>
                    {["LEDGER ID", "ORDER", "REPLAY", "ROOT HASH", "AUTHORIZED BY", "AUTHORIZED AT"].map(h => (
                      <th key={h} style={{ padding: "7px 12px", fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.07em", color: S.tertiary, textAlign: "left", borderBottom: `1px solid ${S.rim}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledgerEntries.map((r: LedgerEntry, i: number) => (
                    <tr
                      key={r.ledger_id}
                      onClick={() => router.push(`/ledger/${r.ledger_id}`)}
                      style={{ borderBottom: i < ledgerEntries.length - 1 ? `1px solid ${S.soft}` : "none", cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.background = `color-mix(in srgb, ${S.cyan} 5%, transparent)`)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: 12, color: S.cyan }}>{r.ledger_id.slice(0, 12)}…</td>
                      <td style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: 12 }}>{r.order_id.slice(0, 12)}…</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{
                          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                          color: r.replay_verified ? S.pass : S.amber,
                          background: r.replay_verified ? `color-mix(in srgb, ${S.pass} 10%, transparent)` : `color-mix(in srgb, ${S.amber} 10%, transparent)`,
                          border: `1px solid ${r.replay_verified ? S.pass : S.amber}`,
                          padding: "1px 6px",
                        }}>
                          {r.replay_verified ? "PASS" : "WARN"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{r.root_hash.slice(0, 16)}…</td>
                      <td style={{ padding: "8px 12px", fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{r.authorized_by}</td>
                      <td style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                        {new Date(r.authorized_at).toISOString().replace("T", " ").slice(0, 19) + " UTC"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <HelpPanel config={LEDGER_HELP} storageKey="ledger" />
      </div>
      {/* ── Footer ── */}
      <footer style={{
        height: 32, display: "flex", alignItems: "center", gap: 8, padding: "0 24px",
        borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
        fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
        letterSpacing: "0.04em", flexShrink: 0,
      }}>
        <span>ORDR Terminal · Immutable Ledger</span>
        <span style={{ color: S.rim }}>·</span>
        <span>WORM Append-Only · SHA-256 Hash Chain</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => router.push("/staging")} style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary, background: "transparent", border: `1px solid ${S.soft}`, padding: "1px 8px", cursor: "pointer", letterSpacing: "0.04em" }}>
          STAGING QUEUE →
        </button>
        <span style={{ color: S.rim }}>·</span>
        <button onClick={() => router.push("/hedgewiki")} style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary, background: "transparent", border: `1px solid ${S.soft}`, padding: "1px 8px", cursor: "pointer", letterSpacing: "0.04em" }}>
          HEDGE WIKI →
        </button>
      </footer>
    </PageShell>
  );
}
