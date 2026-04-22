// frontend/src/app/debt/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { CreditCard } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getMaturityCalendar, getExposure } from "@/lib/api/debtClient";
import type { DebtFacility } from "@/lib/api/debtClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
} as const;

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#22c55e",
  COMMITTED_UNDRAWN: "#3b82f6",
  EXPIRED: "#6b7280",
  CANCELLED: "#6b7280",
};

export default function DebtPage() {
  const isMobile = useIsMobile();
  const { token } = useAuth();
  const [facilities, setFacilities] = useState<DebtFacility[]>([]);
  const [exposure, setExposure] = useState<{ currency: string; committed: number; drawn: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([getMaturityCalendar(token), getExposure(token)])
      .then(([f, e]) => { setFacilities(f); setExposure(e); })
      .catch(() => { setFacilities([]); setExposure([]); })
      .finally(() => setLoading(false));
  }, [token]);

  const totalDrawn = facilities.reduce((s, f) => s + (f.drawn_amount || 0), 0);
  const totalCommitted = facilities.reduce((s, f) => s + (f.committed_amount || 0), 0);
  const headroom = totalCommitted - totalDrawn;

  if (loading) return <div style={{ padding: 32, fontFamily: S.fontUI, color: "#9ca3af" }}>Loading…</div>;

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI, background: S.bgDeep, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <CreditCard size={20} color="#6366f1" />
        <span style={{ fontFamily: S.fontMono, fontSize: 14, letterSpacing: 2, color: "#e5e7eb", textTransform: "uppercase" }}>
          Debt Portfolio
        </span>
      </div>

      {/* Summary Bar */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "TOTAL COMMITTED", value: `$${(totalCommitted / 1e6).toFixed(1)}M` },
          { label: "TOTAL DRAWN", value: `$${(totalDrawn / 1e6).toFixed(1)}M` },
          { label: "AVAILABLE", value: `$${(headroom / 1e6).toFixed(1)}M` },
          { label: "FACILITIES", value: String(facilities.length) },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 10, color: "#6b7280", fontFamily: S.fontMono, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontFamily: S.fontMono, color: "#e5e7eb", fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Maturity Ladder */}
      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", letterSpacing: 1, marginBottom: 12 }}>MATURITY LADDER</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {facilities.map(f => {
            const pct = totalCommitted > 0 ? (f.committed_amount / totalCommitted) * 100 : 0;
            return (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 120, fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", flexShrink: 0 }}>
                  {f.counterparty.slice(0, 14)}
                </div>
                <div style={{ flex: 1, background: S.bgSub, borderRadius: 3, height: 14, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: STATUS_COLOR[f.status] || "#6366f1", borderRadius: 3 }} />
                </div>
                <div style={{ width: 70, fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", textAlign: "right" }}>
                  {f.maturity_date?.slice(0, 7)}
                </div>
                <div style={{ width: 60, fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", textAlign: "right" }}>
                  {f.days_to_maturity != null ? `${f.days_to_maturity}d` : "—"}
                </div>
              </div>
            );
          })}
          {facilities.length === 0 && (
            <div style={{ color: "#6b7280", fontSize: 12, fontFamily: S.fontMono }}>No active facilities</div>
          )}
        </div>
      </div>

      {/* Facility Table */}
      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
          <thead>
            <tr style={{ background: S.bgSub }}>
              {["Counterparty", "Type", "Currency", "Committed", "Drawn", "Available", "Maturity", "Status"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#6b7280", fontSize: 10, letterSpacing: 1, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {facilities.map((f, i) => (
              <tr key={f.id} style={{ borderTop: `1px solid ${S.rim}`, background: i % 2 === 0 ? "transparent" : S.bgSub }}>
                <td style={{ padding: "8px 12px", color: "#e5e7eb" }}>{f.counterparty}</td>
                <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{f.facility_type.replace("_", " ")}</td>
                <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{f.currency}</td>
                <td style={{ padding: "8px 12px", color: "#e5e7eb" }}>${(f.committed_amount / 1e6).toFixed(2)}M</td>
                <td style={{ padding: "8px 12px", color: "#e5e7eb" }}>${((f.drawn_amount || 0) / 1e6).toFixed(2)}M</td>
                <td style={{ padding: "8px 12px", color: "#22c55e" }}>${((f.committed_amount - (f.drawn_amount || 0)) / 1e6).toFixed(2)}M</td>
                <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{f.maturity_date?.slice(0, 10)}</td>
                <td style={{ padding: "8px 12px" }}>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: (STATUS_COLOR[f.status] || "#6366f1") + "22", color: STATUS_COLOR[f.status] || "#6366f1" }}>
                    {f.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
