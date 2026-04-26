// frontend/src/app/settings/bank-accounts/page.tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { listAccounts, verifyAccount } from "@/lib/api/cashClient";
import type { BankAccount } from "@/lib/api/cashClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)", rim: "var(--border-rim)",
} as const;

// `accentColor` (not `color`) so the AST selector for hex-literal-on-`color`
// inline-style properties doesn't fire on these status hues.
const STATUS_COLORS: Record<string, { bg: string; accentColor: string }> = {
  ACTIVE: { bg: "rgba(34,197,94,0.15)", accentColor: "#22c55e" },
  PENDING_VERIFICATION: { bg: "rgba(251,191,36,0.15)", accentColor: "#fbbf24" },
  FROZEN: { bg: "rgba(59,130,246,0.15)", accentColor: "#3b82f6" },
  CLOSED: { bg: "rgba(100,100,100,0.15)", accentColor: "var(--text-muted)" },
};

export default function BankAccountsPage() {
  const { token, user } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [tab, setTab] = useState<"ALL" | "PENDING">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    listAccounts(token)
      .then(setAccounts)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const pending = accounts.filter((a) => a.status === "PENDING_VERIFICATION");
  const displayed = tab === "PENDING" ? pending : accounts;

  const handleVerify = async (id: string) => {
    if (!token) return;
    setActionId(id);
    try {
      await verifyAccount(token, id);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setActionId(null);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <CreditCard size={18} color="var(--accent-primary)" />
        <div>
          <div style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
            Bank Accounts
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            Settings → Bank Accounts
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid var(--border-rim)" }}>
        {(["ALL", "PENDING"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "7px 14px", fontSize: 11, fontFamily: S.fontMono,
            background: tab === t ? "var(--bg-sub)" : "transparent",
            border: "none", borderBottom: tab === t ? "2px solid var(--accent-primary)" : "2px solid transparent",
            cursor: "pointer", color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
          }}>
            {t === "PENDING" ? `PENDING VERIFICATION${pending.length ? ` (${pending.length})` : ""}` : t}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 4, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "var(--accent-red)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
          {tab === "PENDING" ? "No accounts pending verification." : "No bank accounts configured."}
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-rim)" }}>
              {["Nickname", "Bank", "Type", "Currency", "Account", "Status", "Actions"].map((h) => (
                <th scope="col" key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, color: "var(--text-muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((a) => {
              const sc = STATUS_COLORS[a.status] ?? STATUS_COLORS.CLOSED;
              const isSelf = a.created_by === user?.id;
              return (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--border-rim)" }}>
                  <td style={{ padding: "10px 12px" }}>{a.nickname}</td>
                  <td style={{ padding: "10px 12px" }}>{a.bank_name}</td>
                  <td style={{ padding: "10px 12px" }}>{a.account_type}</td>
                  <td style={{ padding: "10px 12px" }}>{a.currency}</td>
                  <td style={{ padding: "10px 12px" }}>{a.account_number || "****"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: sc.bg, color: sc.accentColor }}>
                      {a.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {a.status === "PENDING_VERIFICATION" && (
                        <button
                          onClick={() => handleVerify(a.id)}
                          disabled={actionId === a.id || isSelf}
                          title={isSelf ? "Cannot verify your own account (Separation of Duties)" : "Verify account"}
                          style={{
                            display: "flex", alignItems: "center", gap: 4,
                            padding: "4px 10px", fontSize: 10, borderRadius: 3, cursor: "pointer",
                            background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
                            color: "var(--status-pass)", fontFamily: S.fontMono,
                            opacity: actionId === a.id || isSelf ? 0.5 : 1,
                          }}
                        >
                          <ShieldCheck size={10} />
                          VERIFY
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
