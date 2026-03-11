"use client";

/**
 * /audit-lab/demo — Public demo (no auth required).
 * Uses static fixture data. No API calls. No useAuth().
 */

import { DEMO_DATASET } from "@/lib/fixtures/audit-lab-demo";
import { T } from "@/lib/design/tokens";
import { KpiStrip } from "@/components/ui/KpiStrip";
import { ActionButton } from "@/components/ui/ActionButton";
import Link from "next/link";

export default function AuditLabDemoPage() {
  const d = DEMO_DATASET;

  return (
    <div style={{ minHeight: "100vh", background: T.bgDeep, padding: "28px 40px", fontFamily: T.fontUI }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, color: T.tertiary, letterSpacing: "0.1em", marginBottom: 6 }}>
          AUDIT LAB &mdash; DEMO
        </div>
        <div style={{ fontFamily: T.fontUI, fontSize: 20, fontWeight: 700, color: T.primary }}>
          {d.name}
        </div>
        <div style={{ fontFamily: T.fontUI, fontSize: 13, color: T.secondary, marginTop: 4 }}>
          Try the Audit Lab with sample data. No account required.
        </div>
      </div>

      {/* KPIs */}
      <KpiStrip items={[
        { label: "Total Exposure", value: `$${(d.auditResults.totalExposureUsd / 1e6).toFixed(1)}M` },
        { label: "Hedged", value: `$${(d.auditResults.hedgedExposureUsd / 1e6).toFixed(1)}M` },
        { label: "Coverage", value: `${(d.auditResults.coverageRatio * 100).toFixed(0)}%` },
        { label: "Markup", value: `${d.auditResults.markupBps} bps` },
        { label: "Unhedged Variance", value: `$${(d.auditResults.unhedgedVarianceUsd / 1e3).toFixed(0)}K` },
      ]} />

      {/* Position table */}
      <div style={{ marginTop: 24, background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: T.bgSub }}>
              {["Currency", "Notional", "Hedged", "Spot Rate", "Hedge Rate", "Maturity"].map(h => (
                <th key={h} style={{ fontFamily: T.fontUI, fontSize: 12, fontWeight: 600, color: T.tertiary, textAlign: "left", padding: "10px 14px", borderBottom: `1px solid ${T.rim}`, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.positions.map(p => (
              <tr key={p.currency} style={{ borderBottom: `1px solid ${T.soft}` }}>
                <td style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.primary, padding: "10px 14px" }}>{p.currency}</td>
                <td style={{ fontFamily: T.fontMono, fontSize: 13, color: T.primary, padding: "10px 14px" }}>{p.amount.toLocaleString()}</td>
                <td style={{ fontFamily: T.fontMono, fontSize: 13, color: T.primary, padding: "10px 14px" }}>{p.hedgedAmount.toLocaleString()}</td>
                <td style={{ fontFamily: T.fontMono, fontSize: 13, color: T.secondary, padding: "10px 14px" }}>{p.rate}</td>
                <td style={{ fontFamily: T.fontMono, fontSize: 13, color: T.secondary, padding: "10px 14px" }}>{p.hedgeRate}</td>
                <td style={{ fontFamily: T.fontMono, fontSize: 13, color: T.tertiary, padding: "10px 14px" }}>{p.maturity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CTA */}
      <div style={{ marginTop: 40, padding: "32px 24px", background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4, textAlign: "center" }}>
        <div style={{ fontFamily: T.fontUI, fontSize: 16, fontWeight: 600, color: T.primary, marginBottom: 8 }}>
          See the full picture
        </div>
        <div style={{ fontFamily: T.fontUI, fontSize: 13, color: T.secondary, marginBottom: 20 }}>
          Upload your own data, compare periods, track trends, and verify hedge effectiveness.
        </div>
        <Link href="/auth/login">
          <ActionButton>Create your free account</ActionButton>
        </Link>
      </div>
    </div>
  );
}
