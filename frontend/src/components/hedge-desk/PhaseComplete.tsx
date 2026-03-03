"use client";

import { useState } from "react";
import type { PositionRow } from "@/api/positionClient";
import DisclosurePanel from "./DisclosurePanel";
import { CheckCircleIcon, RefreshCwIcon, ClipboardIcon, BarChart2Icon, HistoryIcon, FileSpreadsheetIcon, FileTextIcon } from "lucide-react";
import Link from "next/link";
import { API_BASE } from "@/lib/api/apiBase";

const HD = {
  navy:    "#0A1F44",
  royal:   "#1C62F2",
  emerald: "#2ECC71",
  crimson: "#E74C3C",
  slate:   "#8A9AB5",
  bgPanel: "var(--bg-panel)",
  bgSub:   "var(--bg-sub)",
  bgDeep:  "var(--bg-deep)",
  rim:     "var(--border-rim)",
  soft:    "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:    "var(--accent-cyan)",
  amber:   "var(--accent-amber)",
  fontUI:  "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:"var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;

interface PhaseCompleteProps {
  positions: PositionRow[];
  fillData: { fillPrice: number; proposalIds: string[] } | null;
  runId: string;
  governanceMode: "solo" | "team";
  onNewRun: () => void;
  token: string;
}

function fmt(n: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals }).format(n);
}

export default function PhaseComplete({
  positions,
  fillData,
  runId,
  governanceMode,
  onNewRun,
  token,
}: PhaseCompleteProps) {
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("CONFIRMATION DOWNLOADED");

  function showToast(msg: string) {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2500);
  }

  const totalNotional = positions.reduce((sum, p) => sum + (p.amount ?? 0), 0);

  // Per-currency breakdown
  const currencyBreakdown = positions.reduce<Record<string, number>>((acc, p) => {
    acc[p.currency] = (acc[p.currency] ?? 0) + (p.amount ?? 0);
    return acc;
  }, {});

  async function downloadFromServer(endpoint: "excel" | "pdf" | "bank-pdf", filename: string, toastLabel: string) {
    try {
      const resp = await fetch(`${API_BASE}/v1/reports/${encodeURIComponent(runId)}/${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(toastLabel);
        return true;
      }
    } catch {
      // fall through to client-side fallback
    }
    return false;
  }

  const handleDownloadExcel = async () => {
    const serverOk = await downloadFromServer(
      "excel",
      `hedge-report-${runId.slice(0, 8)}.csv`,
      "EXCEL REPORT DOWNLOADED",
    );
    if (serverOk) return;

    // Client-side fallback
    const rows: string[][] = [
      ["HEDGE EXECUTION REPORT", "", "", "", "", ""],
      ["Run ID", runId, "", "Generated", new Date().toISOString(), ""],
      ["Governance Mode", governanceMode, "", "Fill Price", fillData?.fillPrice?.toFixed(6) ?? "—", ""],
      ["Positions Hedged", String(positions.length), "", "Proposals Filed", String(fillData?.proposalIds.length ?? 0), ""],
      ["", "", "", "", "", ""],
      ["POSITION ID", "ENTITY", "CURRENCY", "AMOUNT", "VALUE DATE", "STATUS"],
      ...positions.map(p => [
        p.id, p.entity ?? "—", p.currency,
        String(p.amount ?? 0), p.value_date ?? "—", p.execution_status ?? p.status ?? "—",
      ]),
      ["", "", "", "", "", ""],
      ["PROPOSAL IDS", "", "", "", "", ""],
      ...(fillData?.proposalIds ?? []).map((id, i) => [`Proposal ${i + 1}`, id, "", "", "", ""]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hedge-report-${runId.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("EXCEL REPORT DOWNLOADED");
  };

  const handleDownloadBankPdf = async () => {
    const serverOk = await downloadFromServer(
      "bank-pdf",
      `bank-compliance-${runId.slice(0, 8)}.txt`,
      "BANK REPORT DOWNLOADED",
    );
    if (serverOk) return;

    // Client-side fallback
    const lines = [
      "ORDR TERMINAL — HEDGE EXECUTION BANK REPORT",
      "=".repeat(60),
      "",
      `Run ID:           ${runId}`,
      `Generated:        ${new Date().toISOString()}`,
      `Governance Mode:  ${governanceMode.toUpperCase()}`,
      `Positions Hedged: ${positions.length}`,
      `Proposals Filed:  ${fillData?.proposalIds.length ?? 0}`,
      `Fill Price:       ${fillData?.fillPrice?.toFixed(6) ?? "Not recorded"}`,
      "",
      "POSITIONS IN SCOPE",
      "-".repeat(60),
      ["ID", "ENTITY", "CCY", "AMOUNT", "VALUE DATE", "STATUS"].join("  |  "),
      "-".repeat(60),
      ...positions.map(p =>
        [p.id.slice(0, 8), (p.entity ?? "—").padEnd(20), p.currency, String(p.amount ?? 0).padStart(12), p.value_date ?? "—", p.execution_status ?? "—"].join("  |  ")
      ),
      "",
      "PROPOSAL IDS",
      "-".repeat(60),
      ...(fillData?.proposalIds ?? []).map((id, i) => `Proposal ${i + 1}: ${id}`),
      "",
      "CURRENCY BREAKDOWN",
      "-".repeat(60),
      ...Object.entries(currencyBreakdown).map(([ccy, total]) => `${ccy}: ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(total)}`),
      "",
      `TOTAL NOTIONAL: ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(totalNotional)}`,
      "",
      "=".repeat(60),
      "END OF REPORT",
    ];
    const text = lines.join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hedge-bank-report-${runId.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("BANK REPORT DOWNLOADED");
  };

  const handleDownload = () => {
    const confirmation = {
      confirmation_type: "HEDGE_EXECUTION",
      generated_at: new Date().toISOString(),
      run_id: runId,
      governance_mode: governanceMode,
      fill_price: fillData?.fillPrice ?? null,
      proposal_ids: fillData?.proposalIds ?? [],
      positions_hedged: positions.length,
      total_notional: totalNotional,
      currency_breakdown: currencyBreakdown,
      positions: positions.map(p => ({
        id: p.id,
        entity: p.entity ?? null,
        currency: p.currency,
        amount: p.amount,
        value_date: p.value_date ?? null,
        status: p.status,
        execution_status: p.execution_status,
      })),
    };
    const blob = new Blob([JSON.stringify(confirmation, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hedge-confirmation-${runId.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("CONFIRMATION DOWNLOADED");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "32px 24px", height: "100%", overflowY: "auto", alignItems: "center" }}>

      {/* Toast */}
      {toastVisible && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "10px 20px",
          background: HD.bgPanel,
          border: `1px solid ${HD.emerald}`,
          borderRadius: 4,
          fontFamily: HD.fontMono, fontSize: 11, color: HD.emerald, letterSpacing: "0.06em",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}>
          {toastMsg}
        </div>
      )}

      {/* Success icon */}
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        background: `color-mix(in srgb,${HD.emerald} 15%,transparent)`,
        border: `2px solid ${HD.emerald}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 8,
      }}>
        <CheckCircleIcon size={44} color={HD.emerald} />
      </div>

      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontFamily: HD.fontMono, fontSize: 18, fontWeight: 700,
          letterSpacing: "0.12em", color: HD.emerald, marginBottom: 6,
        }}>
          POSITIONS HEDGED SUCCESSFULLY
        </div>
        <div style={{ fontFamily: HD.fontUI, fontSize: 13, color: HD.secondary }}>
          {governanceMode === "solo" ? "Solo governance run complete." : "Team governance run complete."}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3,1fr)",
        gap: 12,
        width: "100%",
        maxWidth: 640,
      }}>
        {[
          { label: "POSITIONS HEDGED", value: String(positions.length) },
          { label: "PROPOSALS FILED",  value: String(fillData?.proposalIds.length ?? 0) },
          { label: "FILL PRICE",        value: fillData?.fillPrice ? fillData.fillPrice.toFixed(6) : "—" },
        ].map(card => (
          <div key={card.label} style={{
            background: HD.bgPanel,
            border: `1px solid ${HD.soft}`,
            borderRadius: 4,
            padding: "14px 16px",
            textAlign: "center",
          }}>
            <div style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.tertiary, letterSpacing: "0.1em", marginBottom: 6 }}>
              {card.label}
            </div>
            <div style={{ fontFamily: HD.fontMono, fontSize: 20, fontWeight: 700, color: HD.primary }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Currency breakdown */}
      <div style={{ width: "100%", maxWidth: 640, background: HD.bgPanel, border: `1px solid ${HD.soft}`, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ padding: "8px 14px", background: HD.bgSub, borderBottom: `1px solid ${HD.soft}` }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: HD.tertiary }}>
            NOTIONAL BY CURRENCY
          </span>
        </div>
        {Object.entries(currencyBreakdown).map(([ccy, total], i, arr) => (
          <div key={ccy} style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 14px",
            borderBottom: i < arr.length - 1 ? `1px solid ${HD.soft}` : "none",
          }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.cyan }}>{ccy}</span>
            <span style={{ fontFamily: HD.fontMono, fontSize: 13, fontWeight: 600, color: HD.primary }}>{fmt(total)}</span>
          </div>
        ))}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 14px",
          borderTop: `1px solid ${HD.rim}`,
          background: HD.bgSub,
        }}>
          <span style={{ fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, color: HD.secondary }}>TOTAL NOTIONAL</span>
          <span style={{ fontFamily: HD.fontMono, fontSize: 14, fontWeight: 700, color: HD.primary }}>{fmt(totalNotional)}</span>
        </div>
      </div>

      {/* L3 audit panel */}
      <div style={{ width: "100%", maxWidth: 640 }}>
        <DisclosurePanel title="Audit Trail References" level="L3">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.tertiary }}>CALCULATION RUN ID</span>
              <code style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.slate }}>{runId}</code>
            </div>
            {fillData?.proposalIds.map((id, i) => (
              <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.tertiary }}>PROPOSAL {i + 1}</span>
                <code style={{ fontFamily: HD.fontMono, fontSize: 10, color: HD.slate }}>{id}</code>
              </div>
            ))}
          </div>
        </DisclosurePanel>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", maxWidth: 640, width: "100%" }}>
        <button
          onClick={onNewRun}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: HD.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            color: "#ffffff", background: HD.royal,
            border: "none", padding: "10px 20px", cursor: "pointer", borderRadius: 3,
          }}
        >
          <RefreshCwIcon size={14} color="#ffffff" />
          RUN ANOTHER HEDGE →
        </button>

        <Link
          href="/audit-trail"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: HD.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            color: HD.cyan,
            background: `color-mix(in srgb,${HD.cyan} 8%,transparent)`,
            border: `1px solid color-mix(in srgb,${HD.cyan} 30%,transparent)`,
            padding: "10px 20px", borderRadius: 3, textDecoration: "none",
          }}
        >
          VIEW AUDIT TRAIL →
        </Link>

        <Link
          href="/position-desk"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: HD.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            color: HD.secondary,
            background: HD.bgSub,
            border: `1px solid ${HD.soft}`,
            padding: "10px 20px", borderRadius: 3, textDecoration: "none",
          }}
        >
          VIEW POSITIONS →
        </Link>

        <Link
          href="/trade-history"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: HD.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            color: HD.secondary,
            background: HD.bgSub,
            border: `1px solid ${HD.soft}`,
            padding: "10px 20px", borderRadius: 3, textDecoration: "none",
          }}
        >
          <HistoryIcon size={14} color={HD.secondary} />
          TRADE HISTORY →
        </Link>

        <Link
          href="/hedge-monitor"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: HD.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            color: HD.secondary,
            background: HD.bgSub,
            border: `1px solid ${HD.soft}`,
            padding: "10px 20px", borderRadius: 3, textDecoration: "none",
          }}
        >
          <BarChart2Icon size={14} color={HD.secondary} />
          HEDGE MONITOR →
        </Link>

        <button
          onClick={handleDownloadExcel}
          title="Download positions and summary as Excel-compatible CSV"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: HD.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            color: HD.cyan,
            background: `color-mix(in srgb,${HD.cyan} 8%,transparent)`,
            border: `1px solid color-mix(in srgb,${HD.cyan} 30%,transparent)`,
            padding: "10px 20px", cursor: "pointer", borderRadius: 3,
          }}
        >
          <FileSpreadsheetIcon size={14} color={HD.cyan} />
          DOWNLOAD EXCEL
        </button>

        <button
          onClick={handleDownloadBankPdf}
          title="Download structured bank compliance report"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: HD.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            color: HD.secondary,
            background: HD.bgSub,
            border: `1px solid ${HD.soft}`,
            padding: "10px 20px", cursor: "pointer", borderRadius: 3,
          }}
        >
          <FileTextIcon size={14} color={HD.secondary} />
          BANK REPORT
        </button>

        <button
          onClick={handleDownload}
          title="Download raw JSON confirmation artifact"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: HD.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            color: HD.tertiary,
            background: "none",
            border: `1px solid ${HD.soft}`,
            padding: "10px 20px", cursor: "pointer", borderRadius: 3,
          }}
        >
          <ClipboardIcon size={14} color={HD.tertiary} />
          DOWNLOAD JSON
        </button>
      </div>
    </div>
  );
}
