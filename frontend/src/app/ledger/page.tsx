"use client";

import { useEffect, useState } from "react";
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
import { Globe, Link2 } from "lucide-react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  bgDeep:   "var(--bg-deep)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  pass:     "var(--status-pass,#22c55e)",
  fail:     "var(--accent-red,#ef4444)",
  amber:    "var(--accent-amber)",
  black:    "#000",
} as const;

// ── Hash Chain Block Visualization ────────────────────────────────────────────
function HashChainView({ entries, onSelect }: { entries: LedgerEntry[]; onSelect: (id: string) => void }) {
  const isMobile = useIsMobile();
  // Show chain newest-first (top → genesis at bottom)
  const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

  return (
    <div style={{ padding: isMobile ? "12px" : "20px 24px" }}>
      <div style={{
        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
        color: S.tertiary, marginBottom: 20, textTransform: "uppercase",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Link2 size={13} />
        SHA-256 Hash Chain · {entries.length} Blocks · WORM Append-Only
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0, position: "relative" }}>
        {entries.map((entry, i) => {
          const blockNum = entries.length - i;
          const isLatest = i === 0;
          const isGenesis = i === entries.length - 1;
          const hash16 = entry.root_hash.slice(0, 16);
          // Prev hash: this block's root_hash links to previous block's root_hash
          const prevEntry = entries[i + 1];
          const prevHash16 = prevEntry
            ? prevEntry.root_hash.slice(0, 16)
            : GENESIS_HASH.slice(0, 16);

          return (
            <div key={entry.ledger_id} style={{ display: "flex", alignItems: "stretch" }}>
              {/* Chain line + connector */}
              <div style={{
                width: 40, flexShrink: 0,
                display: "flex", flexDirection: "column", alignItems: "center",
              }}>
                {/* Top connector line (hidden for first block) */}
                <div style={{
                  width: 2, flex: isLatest ? "0 0 16px" : "0 0 0",
                  background: "transparent",
                }} />
                {/* Circle node */}
                <div style={{
                  width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                  background: isLatest ? S.cyan : isGenesis ? S.pass : S.rim,
                  border: `2px solid ${isLatest ? S.cyan : isGenesis ? S.pass : S.tertiary}`,
                  boxShadow: isLatest ? `0 0 8px ${S.cyan}55` : "none",
                }} />
                {/* Bottom connector line */}
                {!isGenesis && (
                  <div style={{
                    width: 2, flex: 1, minHeight: 20,
                    background: `linear-gradient(to bottom, ${S.tertiary}, ${S.rim})`,
                  }} />
                )}
              </div>

              {/* Block card */}
              <div
                onClick={() => onSelect(entry.ledger_id)}
                style={{
                  flex: 1, marginLeft: 12,
                  padding: "14px 18px",
                  background: isLatest ? `color-mix(in srgb, ${S.cyan} 6%, ${S.bgPanel})` : S.bgPanel,
                  border: `1px solid ${isLatest ? S.cyan : S.rim}`,
                  borderRadius: 4,
                  cursor: "pointer",
                  marginTop: isLatest ? 8 : 4,
                  marginBottom: 4,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { if (!isLatest) (e.currentTarget as HTMLDivElement).style.background = `color-mix(in srgb, ${S.cyan} 4%, ${S.bgPanel})`; }}
                onMouseLeave={e => { if (!isLatest) (e.currentTarget as HTMLDivElement).style.background = S.bgPanel; }}
              >
                {/* Block header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                    color: S.tertiary, letterSpacing: "0.1em",
                  }}>
                    BLOCK #{blockNum}
                  </span>
                  {isLatest && (
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                      color: S.cyan, padding: "1px 5px",
                      border: `1px solid ${S.cyan}`, borderRadius: 2,
                      letterSpacing: "0.08em",
                    }}>LATEST</span>
                  )}
                  {isGenesis && (
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                      color: S.pass, padding: "1px 5px",
                      border: `1px solid ${S.pass}`, borderRadius: 2,
                      letterSpacing: "0.08em",
                    }}>GENESIS</span>
                  )}
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                    color: entry.replay_verified ? S.pass : S.amber,
                    padding: "1px 5px",
                    border: `1px solid ${entry.replay_verified ? S.pass : S.amber}`,
                    borderRadius: 2,
                  }}>
                    {entry.replay_verified ? "REPLAY ✓" : "REPLAY ?"}
                  </span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                    {new Date(entry.authorized_at).toISOString().replace("T", " ").slice(0, 16)} UTC
                  </span>
                </div>

                {/* Hash fields grid */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "8px 24px" }}>
                  {/* Current hash */}
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 3 }}>
                      ROOT HASH
                    </div>
                    <div style={{
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                      color: isLatest ? S.cyan : S.primary,
                      letterSpacing: "0.05em",
                    }}>
                      {hash16}…
                    </div>
                  </div>

                  {/* Prev hash */}
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 3 }}>
                      ← PREV HASH {isGenesis ? "(GENESIS)" : ""}
                    </div>
                    <div style={{
                      fontFamily: S.fontMono, fontSize: 12,
                      color: isGenesis ? S.pass : S.secondary,
                      letterSpacing: "0.05em",
                    }}>
                      {prevHash16}…
                    </div>
                  </div>

                  {/* Order ID */}
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 3 }}>
                      ORDER ID
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                      {entry.order_id.slice(0, 18)}…
                    </div>
                  </div>

                  {/* Authorized by */}
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 3 }}>
                      AUTHORIZED BY
                    </div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary }}>
                      {entry.authorized_by}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Genesis anchor */}
        <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
          <div style={{ width: 40, display: "flex", justifyContent: "center" }}>
            <div style={{
              width: 16, height: 16, borderRadius: "50%",
              background: S.pass, border: `2px solid ${S.pass}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, color: S.black, fontWeight: 900,
            }}>G</div>
          </div>
          <div style={{
            marginLeft: 12, padding: "8px 14px",
            background: `color-mix(in srgb, ${S.pass} 8%, ${S.bgPanel})`,
            border: `1px dashed ${S.pass}`,
            borderRadius: 3, flex: 1,
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.pass, letterSpacing: "0.1em" }}>
              GENESIS BLOCK · HASH = {GENESIS_HASH.slice(0, 32)}…
            </span>
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 20, padding: "10px 14px", background: S.bgSub,
        border: `1px solid ${S.soft}`, borderRadius: 3,
        fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, lineHeight: 1.7,
      }}>
        <strong style={{ color: S.secondary }}>Hash Chain Protocol:</strong>{" "}
        Each block's PREV HASH must equal the previous block's ROOT HASH. The genesis block has PREV HASH = 0000…0000.
        Any mismatch breaks the chain. REPLAY = ✓ means the hedge calculation can be deterministically re-run from stored inputs.
        Click any block to inspect its full provenance.
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function LedgerListPage() {
  const isMobile = useIsMobile();
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const { token } = useAuth();
  const { ledgerEntries, ledgerLoading, error } = useSelector(
    (s: RootState) => s.pipeline
  );
  const [view, setView] = useState<"TABLE" | "CHAIN">("TABLE");

  useEffect(() => {
    if (token) dispatch(listLedgerThunk({ token }));
  }, [dispatch, token]);

  return (
    <PageShell icon={Globe} title="Immutable Ledger" breadcrumb={["Governance", "Ledger"]} noPadding>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* View mode selector */}
          {ledgerEntries.length > 0 && (
            <div style={{
              display: "flex", borderBottom: `1px solid ${S.rim}`,
              background: S.bgSub, flexShrink: 0,
              flexWrap: isMobile ? "wrap" : "nowrap",
            }}>
              {(["TABLE", "CHAIN"] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                  padding: "0 18px", height: 36, border: "none",
                  borderBottom: view === v ? `2px solid ${S.cyan}` : "2px solid transparent",
                  background: "transparent",
                  color: view === v ? S.cyan : S.tertiary,
                  cursor: "pointer", letterSpacing: "0.06em",
                }}>
                  {v === "TABLE" ? "TABLE VIEW" : "CHAIN VIEW"}
                </button>
              ))}
            </div>
          )}

          <div style={{ padding: view === "CHAIN" ? 0 : (isMobile ? "12px" : "20px 24px") }}>
            {error && <ErrorBanner code={error.code} message={error.message} />}
            {ledgerLoading ? (
              <div style={{ padding: 20 }}>
                <EmptyState type="loading" message="Loading ledger…" />
              </div>
            ) : ledgerEntries.length === 0 ? (
              <div style={{ padding: 20 }}>
                <EmptyState
                  type="empty"
                  title="No ledger entries"
                  message="Authorize a staged artifact to create an immutable ledger entry."
                />
              </div>
            ) : view === "CHAIN" ? (
              <HashChainView entries={ledgerEntries} onSelect={id => router.push(`/ledger/${id}`)} />
            ) : (
              <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>
                    IMMUTABLE LEDGER
                  </span>
                  <span style={{ color: S.rim }}>·</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{ledgerEntries.length} ENTRIES</span>
                </div>
                <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: S.bgSub }}>
                      {["LEDGER ID", "ORDER", "REPLAY", "ROOT HASH", "AUTHORIZED BY", "AUTHORIZED AT"].map(h => (
                        <th scope="col" key={h} style={{ padding: "7px 12px", fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.07em", color: S.tertiary, textAlign: "left", borderBottom: `1px solid ${S.rim}` }}>{h}</th>
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
                </table></div>
              </div>
            )}
          </div>
        </div>
        <HelpPanel config={LEDGER_HELP} storageKey="ledger" />
      </div>
      {/* ── Footer ── */}
      <footer style={{
        height: 32, display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "0 12px" : "0 24px",
        borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
        fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary,
        letterSpacing: "0.04em", flexShrink: 0,
        flexWrap: isMobile ? "wrap" : "nowrap",
      }}>
        <span>ORDR Terminal · Immutable Ledger</span>
        <span style={{ color: S.rim }}>·</span>
        <span>WORM Append-Only · SHA-256 Hash Chain</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => router.push("/staging")} style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.secondary, background: "transparent", border: `1px solid ${S.soft}`, padding: "1px 8px", cursor: "pointer", letterSpacing: "0.04em" }}>
          STAGING QUEUE →
        </button>
        <span style={{ color: S.rim }}>·</span>
        <button onClick={() => router.push("/hedgewiki")} style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.secondary, background: "transparent", border: `1px solid ${S.soft}`, padding: "1px 8px", cursor: "pointer", letterSpacing: "0.04em" }}>
          HEDGE WIKI →
        </button>
      </footer>
    </PageShell>
  );
}
