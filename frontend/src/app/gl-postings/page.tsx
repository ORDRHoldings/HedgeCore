"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, Send, FileText, AlertCircle, RefreshCw as RefreshCwIcon } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/authContext";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";
import {
  listJournalEntries,
  approveJournalEntry,
  rejectJournalEntry,
  postJournalEntry,
  type JournalEntry,
} from "@/lib/api/glClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  accent: "var(--accent-cyan)",
  text: "var(--text-primary)",
  textSub: "var(--text-secondary)",
} as const;

// GL postings status palette: Bloomberg-style saturated hues for journal-entry
// state at-a-glance. Outside the T scale because we need 4 distinct status
// colors at higher saturation than `T.warn`/`T.pass`/`T.fail` provide.
const C = {
  gray:  "#888",
  amber: "#f5a623",
  green: "#7ed321",
  red:   "#d0021b",
} as const;

const STATUS_CONFIG: Record<JournalEntry["status"], { label: string; color: string; bg: string }> = {
  DRAFT: { label: "Draft", color: C.gray, bg: "rgba(136,136,136,0.1)" },
  PENDING_APPROVAL: { label: "Pending Approval", color: C.amber, bg: "rgba(245,166,35,0.1)" },
  APPROVED: { label: "Approved", color: C.green, bg: "rgba(126,211,33,0.1)" },
  POSTED: { label: "Posted", color: "var(--accent-cyan)", bg: "rgba(0,212,255,0.1)" },
  REJECTED: { label: "Rejected", color: C.red, bg: "rgba(208,2,27,0.1)" },
};

const STATUS_FILTERS = ["ALL", "DRAFT", "PENDING_APPROVAL", "APPROVED", "POSTED", "REJECTED"];

export default function GLPostingsPage() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await listJournalEntries(token, filter !== "ALL" ? { status: filter } : undefined);
      setEntries(data);
    } catch {
      setActionError("Failed to load journal entries");
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => { load(); }, [load]);

  if (!token) return null;

  const handleApprove = async (id: string) => {
    setActionError(null);
    try { await approveJournalEntry(token, id); await load(); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Approve failed"); }
  };

  const handleRejectSubmit = async () => {
    if (!rejectModal) return;
    try {
      await rejectJournalEntry(token, rejectModal, rejectReason);
      setRejectModal(null); setRejectReason(""); await load();
    } catch (e) { setActionError(e instanceof Error ? e.message : "Reject failed"); }
  };

  const handlePost = async (id: string) => {
    setActionError(null);
    try { await postJournalEntry(token, id); await load(); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Post failed"); }
  };

  return (
    <PageShell icon={FileText} title="GL Postings" breadcrumb={["Hedge Desk", "GL Postings"]} noPadding
      actions={
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: S.bgPanel, border: `1px solid ${S.rim}`, color: S.textSub, fontSize: 12, borderRadius: 3, cursor: "pointer" }}>
          <RefreshCwIcon size={13} /> Refresh
        </button>
      }
    >
      <div style={{ padding: isMobile ? "12px 16px" : "24px 32px", fontFamily: S.fontUI }}>

        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${S.rim}`, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              style={{
                padding: "6px 14px", fontSize: 11, fontFamily: S.fontMono, letterSpacing: "0.06em",
                background: filter === s ? S.bgPanel : "transparent",
                border: `1px solid ${filter === s ? S.rim : "transparent"}`,
                borderBottom: filter === s ? `2px solid ${S.accent}` : "2px solid transparent",
                color: filter === s ? S.text : S.textSub, cursor: "pointer", borderRadius: "3px 3px 0 0",
              }}
            >{s.replace("_", " ")}</button>
          ))}
        </div>

        {actionError && (
          <div style={{ background: "rgba(208,2,27,0.1)", border: "1px solid rgba(208,2,27,0.3)", borderRadius: 4, padding: "10px 16px", color: C.red, fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={14} />{actionError}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24 }}>
            <Skeleton width={140} height={16} style={{ marginBottom: 12 }} />
            <SkeletonTable columns={6} rows={4} />
          </div>
        ) : entries.length === 0 ? (
          <div style={{ color: S.textSub, fontSize: 13, padding: 40, textAlign: "center" }}>No journal entries found</div>
        ) : (
          <div style={{ border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: S.bgDeep }}>
                  {["Type", "Standard", "Debit / Credit", "Amount", "Period", "Status", "Actions"].map((h) => (
                    <th scope="col" key={h} style={{ padding: "8px 14px", textAlign: "left", fontFamily: S.fontMono, color: S.textSub, fontSize: 11, letterSpacing: "0.06em", borderBottom: `1px solid ${S.rim}` }}>
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const sc = STATUS_CONFIG[e.status];
                  return (
                    <tr key={e.id} style={{ borderBottom: `1px solid ${S.rim}` }}>
                      <td style={{ padding: "10px 14px", fontFamily: S.fontMono, color: S.text, fontSize: 11 }}>{e.entry_type}</td>
                      <td style={{ padding: "10px 14px", color: S.textSub }}>{e.standard}</td>
                      <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 11 }}>
                        <span style={{ color: S.accent }}>{e.debit_account}</span>
                        <span style={{ color: S.textSub }}> / </span>
                        <span style={{ color: S.accent }}>{e.credit_account}</span>
                      </td>
                      <td style={{ padding: "10px 14px", fontFamily: S.fontMono, color: S.text }}>
                        {parseFloat(String(e.amount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {e.currency}
                      </td>
                      <td style={{ padding: "10px 14px", color: S.textSub, fontSize: 11 }}>{e.period_date}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 3, fontSize: 11, fontFamily: S.fontMono, letterSpacing: "0.04em", color: sc.color, background: sc.bg }}>
                          {sc.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                          {e.status === "PENDING_APPROVAL" && (
                            <>
                              <button onClick={() => handleApprove(e.id)} title="Approve (4-eyes: checker != creator)"
                                style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "rgba(126,211,33,0.15)", border: "1px solid rgba(126,211,33,0.3)", color: C.green, fontSize: 11, borderRadius: 3, cursor: "pointer", fontFamily: S.fontMono }}>
                                <CheckCircle size={11} /> Approve
                              </button>
                              <button onClick={() => { setRejectModal(e.id); setRejectReason(""); }}
                                style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "rgba(208,2,27,0.1)", border: "1px solid rgba(208,2,27,0.3)", color: C.red, fontSize: 11, borderRadius: 3, cursor: "pointer", fontFamily: S.fontMono }}>
                                <XCircle size={11} /> Reject
                              </button>
                            </>
                          )}
                          {e.status === "APPROVED" && (
                            <button onClick={() => handlePost(e.id)} title="Post to ERP"
                              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "rgba(0,212,255,0.1)", border: `1px solid rgba(0,212,255,0.3)`, color: S.accent, fontSize: 11, borderRadius: 3, cursor: "pointer", fontFamily: S.fontMono }}>
                              <Send size={11} /> Post to ERP
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rejectModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 24, width: isMobile ? "90%" : 420, maxWidth: 420 }}>
              <h2 style={{ fontFamily: S.fontMono, fontSize: 13, letterSpacing: "0.06em", color: S.text, marginBottom: 16, textTransform: "uppercase" }}>
                Reject Journal Entry
              </h2>
              <p style={{ fontSize: 12, color: S.textSub, marginBottom: 12 }}>Provide a reason for rejection (required).</p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Rejection reason..."
                rows={3}
                style={{ width: "100%", background: S.bgDeep, border: `1px solid ${S.rim}`, color: S.text, padding: "8px 10px", fontSize: 13, borderRadius: 3, resize: "vertical", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
                <button onClick={() => setRejectModal(null)} style={{ padding: "6px 16px", background: "transparent", border: `1px solid ${S.rim}`, color: S.textSub, fontSize: 12, borderRadius: 3, cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={handleRejectSubmit} disabled={!rejectReason.trim()}
                  style={{ padding: "6px 16px", background: "rgba(208,2,27,0.15)", border: "1px solid rgba(208,2,27,0.4)", color: C.red, fontSize: 12, fontFamily: S.fontMono, borderRadius: 3, cursor: rejectReason.trim() ? "pointer" : "not-allowed" }}>
                  Reject Entry
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
