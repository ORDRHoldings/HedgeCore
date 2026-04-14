// frontend/src/app/settings/bank-connections/page.tsx
"use client";
import React, { useEffect, useState, useCallback } from "react";
import { Link2, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { listConnections, revokeConnection } from "@/lib/api/cashClient";
import type { BankConnection } from "@/lib/api/cashClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)", rim: "var(--border-rim)",
} as const;

const STATUS_ICON: Record<string, React.ReactElement> = {
  ACTIVE:  <CheckCircle2 size={14} color="#22c55e" />,
  EXPIRED: <AlertCircle  size={14} color="#fbbf24" />,
  ERROR:   <XCircle      size={14} color="#ef4444" />,
  REVOKED: <XCircle      size={14} color="var(--text-muted)" />,
};

export default function BankConnectionsPage() {
  const { token } = useAuth();
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    listConnections(token)
      .then(setConnections)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = async (id: string) => {
    if (!token) return;
    setConfirmId(null);
    setRevoking(id);
    try {
      await revokeConnection(token, id);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link2 size={18} color="var(--accent-primary)" />
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
              Bank Connections
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Settings → Bank Connections
            </div>
          </div>
        </div>
      </div>

      <div style={{
        background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
        borderRadius: 4, padding: "10px 14px", marginBottom: 20, fontSize: 12,
        color: "var(--text-secondary)",
      }}>
        Connect your bank via TrueLayer (Europe/UK) or Plaid (US/CA) to enable automatic balance pulls.
        OAuth credentials are AES-256 encrypted at rest and never exposed via the API.
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 4, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#ef4444" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
      ) : connections.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
          No bank connections. Use the TrueLayer or Plaid OAuth flow to connect your first bank.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {connections.map((c) => (
            <div key={c.id} style={{
              background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: "14px 16px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {STATUS_ICON[c.status] ?? STATUS_ICON.REVOKED}
                <div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 600 }}>
                    {c.institution_name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {c.provider} · {c.status}
                    {c.last_successful_pull_at
                      ? ` · Last pull: ${new Date(c.last_successful_pull_at).toLocaleDateString()}`
                      : ""}
                    {c.consecutive_failure_count > 0 ? ` · ${c.consecutive_failure_count} failure(s)` : ""}
                  </div>
                  {c.last_error_message && c.status === "ERROR" && (
                    <div style={{ fontSize: 10, color: "#ef4444", marginTop: 3 }}>{c.last_error_message}</div>
                  )}
                </div>
              </div>

              {c.status !== "REVOKED" && (
                confirmId === c.id ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: S.fontMono }}>
                      Revoke connection?
                    </span>
                    <button
                      onClick={() => handleRevoke(c.id)}
                      disabled={revoking === c.id}
                      style={{
                        padding: "4px 10px", fontSize: 11, borderRadius: 3, cursor: "pointer",
                        background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)",
                        color: "#ef4444", fontFamily: S.fontMono, opacity: revoking === c.id ? 0.5 : 1,
                      }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      style={{
                        padding: "4px 10px", fontSize: 11, borderRadius: 3, cursor: "pointer",
                        background: "transparent", border: "1px solid var(--border-rim)",
                        color: "var(--text-muted)", fontFamily: S.fontMono,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(c.id)}
                    disabled={revoking === c.id}
                    style={{
                      padding: "5px 12px", fontSize: 11, borderRadius: 3, cursor: "pointer",
                      background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                      color: "#ef4444", fontFamily: S.fontMono, opacity: revoking === c.id ? 0.5 : 1,
                    }}
                  >
                    Revoke
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
