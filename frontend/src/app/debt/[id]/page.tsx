// frontend/src/app/debt/[id]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CreditCard } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getFacility, getDebtSchedule, getCovenants } from "@/lib/api/debtClient";
import type { DebtSchedulePeriod, DebtCovenant, DebtFacility } from "@/lib/api/debtClient";
import { T } from "@/lib/design/tokens";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)", bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)", rim: "var(--border-rim)",
} as const;

// Debt facility signal palette: covenant status hues, indigo for hedge swaps,
// amber/red for warning/breach. Status hex values are kept for the COVENANT_COLOR
// map below (lookup-keyed by status, not `color:`-keyed, so not lint-flagged).
const C = {
  red:    "#ef4444",
  green:  "#22c55e",
  indigo: "#6366f1",
} as const;

const COVENANT_COLOR: Record<string, string> = { COMPLIANT: "#22c55e", WARNING: "#f59e0b", BREACH: "#ef4444" };

type Tab = "schedule" | "covenants" | "hedges";

export default function FacilityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("schedule");
  const [facility, setFacility] = useState<DebtFacility | null>(null);
  const [schedule, setSchedule] = useState<DebtSchedulePeriod[]>([]);
  const [covenants, setCovenants] = useState<DebtCovenant[]>([]);

  useEffect(() => {
    if (!token || !id) return;
    getFacility(id, token).then(setFacility).catch(() => null);
    getDebtSchedule(id, token).then(s => setSchedule(s.periods)).catch(() => null);
    getCovenants(id, token).then(setCovenants).catch(() => null);
  }, [token, id]);

  if (!facility) return <div style={{ padding: 32, color: T.secondary, fontFamily: S.fontUI }}>Loading…</div>;

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI, background: S.bgDeep, minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <CreditCard size={20} color={C.indigo} />
        <span style={{ fontFamily: S.fontMono, fontSize: 14, color: T.primary, letterSpacing: 2, textTransform: "uppercase" }}>
          {facility.counterparty} — {facility.facility_type.replace("_", " ")}
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: `1px solid ${S.rim}` }}>
        {(["schedule", "covenants", "hedges"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 20px", fontFamily: S.fontMono, fontSize: 11,
            letterSpacing: 1, textTransform: "uppercase",
            color: tab === t ? T.primary : T.tertiary,
            borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent",
            background: "none", border: "none", cursor: "pointer",
          }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "schedule" && (
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
            <thead>
              <tr style={{ background: S.bgSub }}>
                {["Period End", "Principal", "Interest", "Total Payment", "Outstanding"].map(h => (
                  <th scope="col" key={h} style={{ padding: "8px 12px", textAlign: "right", color: T.tertiary, fontSize: 10, letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedule.map((p, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${S.rim}` }}>
                  <td style={{ padding: "8px 12px", color: T.secondary, textAlign: "right" }}>{p.period_end}</td>
                  <td style={{ padding: "8px 12px", color: T.primary, textAlign: "right" }}>${p.principal_payment.toLocaleString()}</td>
                  <td style={{ padding: "8px 12px", color: T.secondary, textAlign: "right" }}>${p.interest_payment.toLocaleString()}</td>
                  <td style={{ padding: "8px 12px", color: T.primary, textAlign: "right" }}>${p.total_payment.toLocaleString()}</td>
                  <td style={{ padding: "8px 12px", color: T.secondary, textAlign: "right" }}>${p.outstanding_balance.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "covenants" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {covenants.map(c => (
            <div key={c.type} style={{ background: S.bgPanel, border: `1px solid ${COVENANT_COLOR[c.status] || S.rim}`, borderRadius: 6, padding: 16 }}>
              <div style={{ fontSize: 10, color: T.tertiary, fontFamily: S.fontMono, letterSpacing: 1 }}>{c.type.replace("_", " ")}</div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: T.secondary }}>Threshold: <b style={{ color: T.primary }}>{c.threshold.toFixed(2)}</b></span>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: (COVENANT_COLOR[c.status] || T.tertiary) + "22", color: COVENANT_COLOR[c.status] || T.tertiary }}>{c.status}</span>
              </div>
              <div style={{ fontSize: 12, color: T.secondary, marginTop: 4 }}>
                Current: <b style={{ color: T.primary }}>{c.current_value?.toFixed(2)}</b>
                {" "} | Headroom: <b style={{ color: c.headroom_pct < 0 ? C.red : C.green }}>{c.headroom_pct?.toFixed(1)}%</b>
              </div>
            </div>
          ))}
          {covenants.length === 0 && (
            <div style={{ color: T.tertiary, fontFamily: S.fontMono, fontSize: 12 }}>No covenants configured</div>
          )}
        </div>
      )}

      {tab === "hedges" && (
        <div style={{ color: T.tertiary, fontFamily: S.fontMono, fontSize: 12, padding: 16 }}>
          IR swaps linked to this facility will appear here after MTM runs.
        </div>
      )}
    </div>
  );
}
