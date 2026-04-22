// frontend/src/app/cash-positions/page.tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { BarChart2, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import {
  getConsolidatedPosition, getEntityPosition, getAccountPosition,
} from "@/lib/api/cashClient";
import type {
  ConsolidatedPosition, EntityPositionResponse, AccountPositionRow,
} from "@/lib/api/cashClient";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
} as const;

type Tab = "CONSOLIDATED" | "BY_ENTITY" | "BY_ACCOUNT";

export default function CashPositionsPage() {
  const isMobile = useIsMobile();
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("CONSOLIDATED");
  const [consolidated, setConsolidated] = useState<ConsolidatedPosition | null>(null);
  const [entityPos, setEntityPos] = useState<EntityPositionResponse | null>(null);
  const [accountPos, setAccountPos] = useState<AccountPositionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setConsolidated(null);
    setEntityPos(null);
    setAccountPos([]);
    try {
      if (tab === "CONSOLIDATED") {
        const data = await getConsolidatedPosition(token);
        setConsolidated(data);
      } else if (tab === "BY_ENTITY") {
        const data = await getEntityPosition(token);
        setEntityPos(data);
      } else {
        const data = await getAccountPosition(token);
        setAccountPos(data);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load positions");
    } finally {
      setLoading(false);
    }
  }, [tab, token]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: isMobile ? 12 : 24, fontFamily: S.fontUI }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BarChart2 size={18} color="var(--accent-primary)" />
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
              Cash Positions
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Hedge Desk → Cash Positions
            </div>
          </div>
        </div>
        <button
          onClick={load}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
            background: "var(--bg-sub)", border: "1px solid var(--border-rim)",
            borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: S.fontMono,
            color: "var(--text-primary)",
          }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid var(--border-rim)", flexWrap: isMobile ? "wrap" : "nowrap" }}>
        {(["CONSOLIDATED", "BY_ENTITY", "BY_ACCOUNT"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px", fontSize: 11, fontFamily: S.fontMono, letterSpacing: 1,
              background: tab === t ? "var(--bg-sub)" : "transparent",
              border: "none", borderBottom: tab === t ? "2px solid var(--accent-primary)" : "2px solid transparent",
              cursor: "pointer", color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 4, padding: "10px 14px", marginBottom: 16, fontSize: 12,
          color: "#ef4444",
        }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
          Loading...
        </div>
      )}

      {/* CONSOLIDATED tab */}
      {!loading && tab === "CONSOLIDATED" && consolidated && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {consolidated.positions.map((p) => (
            <div
              key={p.currency}
              style={{
                background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16,
              }}
            >
              <div style={{ fontSize: 11, fontFamily: S.fontMono, color: "var(--text-muted)", marginBottom: 8 }}>
                {p.currency}
              </div>
              <div style={{ fontSize: 18, fontFamily: S.fontMono, fontWeight: 700, marginBottom: 4 }}>
                {Number(p.ledger_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Available: {Number(p.available_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                {p.account_count} account{p.account_count !== 1 ? "s" : ""}
              </div>
            </div>
          ))}
          {consolidated.positions.length === 0 && (
            <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
              No cash positions for today. Enter balances or pull from connected banks.
            </div>
          )}
        </div>
      )}

      {/* BY ENTITY tab */}
      {!loading && tab === "BY_ENTITY" && entityPos && (
        <div>
          {entityPos.positions.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
              No entity positions for today.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono, minWidth: 480 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["Entity", "Currency", "Ledger Balance", "Available"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: 10 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entityPos.positions.map((p) => (
                  <tr key={`${p.entity_id}-${p.currency}`} style={{ borderBottom: `1px solid ${S.rim}` }}>
                    <td style={{ padding: "10px 12px" }}>{p.entity_name}</td>
                    <td style={{ padding: "10px 12px" }}>{p.currency}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {Number(p.ledger_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {Number(p.available_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {/* BY ACCOUNT tab */}
      {!loading && tab === "BY_ACCOUNT" && (
        <div>
          {accountPos.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
              No accounts found. Add accounts in Settings → Bank Accounts.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono, minWidth: 640 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["Nickname", "Currency", "Ledger Balance", "Available", "Date", "Status"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: 10 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accountPos.map((row) => (
                  <tr key={row.account_id} style={{ borderBottom: `1px solid ${S.rim}` }}>
                    <td style={{ padding: "10px 12px" }}>{row.nickname}</td>
                    <td style={{ padding: "10px 12px" }}>{row.currency}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {row.ledger_balance
                        ? Number(row.ledger_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })
                        : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {row.available_balance
                        ? Number(row.available_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })
                        : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>{row.balance_date || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 3,
                        background: row.status === "ACTIVE" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.1)",
                        color: row.status === "ACTIVE" ? "#22c55e" : "#ef4444",
                      }}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
