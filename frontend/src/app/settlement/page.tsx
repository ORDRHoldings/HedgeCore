"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckSquare, DollarSign, AlertCircle } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/authContext";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { listPendingSettlements, confirmSettlement } from "@/lib/api/glClient";
import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

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

interface ConfirmState {
  ledgerEntryId: string;
  actualRate: string;
  settlementRef: string;
  hedgeRate: string;
  hedgeNotional: string;
}

export default function SettlementPage() {
  const { token } = useAuth();
  const [pending, setPending] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await listPendingSettlements(token);
      setPending(data);
    } catch {
      setError("Failed to load pending settlements");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!token) return null;

  const handleConfirm = async () => {
    if (!confirmModal) return;
    setError(null);
    try {
      await confirmSettlement(token, confirmModal.ledgerEntryId, {
        actual_rate: parseFloat(confirmModal.actualRate),
        settlement_ref: confirmModal.settlementRef,
        hedge_rate: parseFloat(confirmModal.hedgeRate),
        hedge_notional: parseFloat(confirmModal.hedgeNotional),
      });
      setConfirmModal(null);
      setSuccess("Settlement confirmed. DRAFT journal entry created — requires 4-eyes approval in GL Postings.");
      await load();
      setTimeout(() => setSuccess(null), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirm failed");
    }
  };

  return (
    <PageShell icon={DollarSign} title="Settlement Tracking" breadcrumb={["Hedge Desk", "Settlement"]} noPadding>
      <div style={{ padding: isMobile ? "12px 16px" : "24px 32px", fontFamily: S.fontUI }}>

        {success && (
          <div style={{ background: "rgba(126,211,33,0.1)", border: "1px solid rgba(126,211,33,0.3)", borderRadius: 4, padding: "10px 16px", color: "#7ed321", fontSize: 13, marginBottom: 16 }}>
            {success}
          </div>
        )}
        {error && (
          <div style={{ background: "rgba(208,2,27,0.1)", border: "1px solid rgba(208,2,27,0.3)", borderRadius: 4, padding: "10px 16px", color: "#d0021b", fontSize: 13, marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 24 }}>
            <Skeleton width={160} height={16} style={{ marginBottom: 12 }} />
            <SkeletonTable columns={5} rows={4} />
          </div>
        ) : pending.length === 0 ? (
          <div style={{ color: S.textSub, fontSize: 13, padding: 40, textAlign: "center", border: `1px solid ${S.rim}`, borderRadius: 4 }}>
            No pending settlements — all hedges are settled up to date.
          </div>
        ) : (
          <div style={{ border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: S.bgDeep }}>
                  {["Ledger ID", "Order ID", "Authorized At", "Action"].map((h) => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontFamily: S.fontMono, color: S.textSub, fontSize: 11, letterSpacing: "0.06em", borderBottom: `1px solid ${S.rim}` }}>
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(pending as Array<Record<string, unknown>>).map((entry) => (
                  <tr key={String(entry.id)} style={{ borderBottom: `1px solid ${S.rim}` }}>
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, color: S.accent, fontSize: 11 }}>
                      {String(entry.ledger_id || entry.id || "").slice(0, 8)}...
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, color: S.textSub, fontSize: 11 }}>
                      {String(entry.order_id || "")}
                    </td>
                    <td style={{ padding: "10px 14px", color: S.textSub, fontSize: 11 }}>
                      {entry.authorized_at ? new Date(String(entry.authorized_at)).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <button
                        onClick={() => {
                          if (!entry.id) return;
                          setConfirmModal({ ledgerEntryId: String(entry.id), actualRate: "", settlementRef: "", hedgeRate: "", hedgeNotional: "" });
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "rgba(0,212,255,0.1)", border: `1px solid rgba(0,212,255,0.3)`, color: S.accent, fontSize: 11, borderRadius: 3, cursor: "pointer", fontFamily: S.fontMono }}
                      >
                        <CheckSquare size={11} /> Confirm
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {confirmModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 24, width: 440 }}>
              <h2 style={{ fontFamily: S.fontMono, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: S.text, marginBottom: 16 }}>
                Confirm Settlement
              </h2>
              <p style={{ fontSize: 12, color: S.textSub, marginBottom: 16, lineHeight: 1.5 }}>
                After confirmation, a DRAFT journal entry will be created for the P&L variance.
                You will need to approve it in GL Postings (4-eyes SoD required).
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 4 }}>ACTUAL SETTLEMENT RATE</label>
                  <input type="number" step="0.00001" value={confirmModal.actualRate}
                    onChange={(e) => setConfirmModal((p) => p ? { ...p, actualRate: e.target.value } : p)}
                    placeholder="e.g. 1.1523"
                    style={{ width: "100%", background: S.bgDeep, border: `1px solid ${S.rim}`, color: S.text, padding: "6px 10px", fontSize: 13, fontFamily: S.fontMono, borderRadius: 3, boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 4 }}>BANK SETTLEMENT REFERENCE</label>
                  <input value={confirmModal.settlementRef}
                    onChange={(e) => setConfirmModal((p) => p ? { ...p, settlementRef: e.target.value } : p)}
                    placeholder="e.g. CONF-20260401-001"
                    style={{ width: "100%", background: S.bgDeep, border: `1px solid ${S.rim}`, color: S.text, padding: "6px 10px", fontSize: 13, fontFamily: S.fontMono, borderRadius: 3, boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 4 }}>HEDGE RATE (ORIGINAL CONTRACT RATE)</label>
                  <input type="number" step="0.00001" value={confirmModal.hedgeRate}
                    onChange={(e) => setConfirmModal((p) => p ? { ...p, hedgeRate: e.target.value } : p)}
                    placeholder="e.g. 1.1200"
                    style={{ width: "100%", background: S.bgDeep, border: `1px solid ${S.rim}`, color: S.text, padding: "6px 10px", fontSize: 13, fontFamily: S.fontMono, borderRadius: 3, boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 4 }}>HEDGE NOTIONAL</label>
                  <input type="number" step="1" value={confirmModal.hedgeNotional}
                    onChange={(e) => setConfirmModal((p) => p ? { ...p, hedgeNotional: e.target.value } : p)}
                    placeholder="e.g. 100000"
                    style={{ width: "100%", background: S.bgDeep, border: `1px solid ${S.rim}`, color: S.text, padding: "6px 10px", fontSize: 13, fontFamily: S.fontMono, borderRadius: 3, boxSizing: "border-box" }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                <button onClick={() => setConfirmModal(null)} style={{ padding: "6px 16px", background: "transparent", border: `1px solid ${S.rim}`, color: S.textSub, fontSize: 12, borderRadius: 3, cursor: "pointer" }}>
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!confirmModal.actualRate || !confirmModal.settlementRef || !confirmModal.hedgeRate || !confirmModal.hedgeNotional}
                  style={{ padding: "6px 16px", background: "rgba(0,212,255,0.15)", border: `1px solid rgba(0,212,255,0.4)`, color: S.accent, fontSize: 12, fontFamily: S.fontMono, borderRadius: 3, cursor: (confirmModal.actualRate && confirmModal.settlementRef && confirmModal.hedgeRate && confirmModal.hedgeNotional) ? "pointer" : "not-allowed" }}
                >
                  Confirm Settlement
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
