"use client";

import { useState } from "react";
import type { PositionRow } from "@/api/positionClient";
import {
  CheckCircleIcon, RefreshCwIcon, FileSpreadsheetIcon, FileTextIcon,
  ChevronDownIcon, ChevronUpIcon, BarChart2Icon, DownloadIcon,
  ArrowRightIcon, ClipboardIcon,
} from "lucide-react";
import Link from "next/link";
import { API_BASE } from "@/lib/api/apiBase";
import { T } from "./tokens";

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
  const [auditOpen, setAuditOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);

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

  const completedAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%", overflow: "hidden" }}>

      {/* ── Completion header ─────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 24px",
        background: T.bgSub,
        borderBottom: `1px solid ${T.rim}`,
        flexShrink: 0,
      }}>
        <CheckCircleIcon size={14} color={T.green} />
        <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: T.green }}>COMPLETE</span>
        <span style={{ width: 1, height: 14, background: T.soft, display: "inline-block" }} />
        <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: T.primary }}>HEDGE RUN CONFIRMED</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, padding: "20px 24px" }}>

        {/* Toast */}
        {toastVisible && (
          <div style={{
            position: "fixed", top: 20, right: 20, zIndex: 9999,
            padding: "10px 20px",
            background: T.bgPanel,
            border: `1px solid ${T.green}`,
            borderRadius: 4,
            fontFamily: T.fontMono, fontSize: 12, color: T.green, letterSpacing: "0.06em",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          }}>
            {toastMsg}
          </div>
        )}

        {/* ── Confirmation banner ──────────────────────────────────────── */}
        <div style={{
          background: T.bgSub,
          border: `1px solid color-mix(in srgb, ${T.green} 25%, transparent)`,
          borderLeft: `3px solid ${T.green}`,
          borderRadius: 4,
          padding: "14px 18px",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 8,
          }}>
            <CheckCircleIcon size={16} color={T.green} />
            <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: T.green }}>
              HEDGE RUN CONFIRMED
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.tertiary, letterSpacing: "0.06em" }}>RUN ID</span>
              <code style={{ fontFamily: T.fontMono, fontSize: 12, color: T.primary }}>{runId.slice(0, 12)}...</code>
            </div>
            <span style={{ width: 1, height: 12, background: T.soft, display: "inline-block" }} />
            <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary }}>{completedAt}</span>
            <span style={{ width: 1, height: 12, background: T.soft, display: "inline-block" }} />
            <span style={{
              fontFamily: T.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              color: T.cyan,
              background: "color-mix(in srgb, var(--accent-cyan) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--accent-cyan) 25%, transparent)",
              padding: "2px 8px", borderRadius: 2,
            }}>
              {governanceMode === "team" ? "TEAM GOVERNANCE" : "SOLO GOVERNANCE"}
            </span>
            <span style={{ width: 1, height: 12, background: T.soft, display: "inline-block" }} />
            <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.primary }}>
              {positions.length} position{positions.length !== 1 ? "s" : ""} hedged
            </span>
            <span style={{ width: 1, height: 12, background: T.soft, display: "inline-block" }} />
            <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.primary }}>
              {fillData?.proposalIds.length ?? 0} proposal{(fillData?.proposalIds.length ?? 0) !== 1 ? "s" : ""} filed
            </span>
          </div>
        </div>

        {/* ── Summary KPI cards ────────────────────────────────────────── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 12,
        }}>
          {[
            { label: "POSITIONS HEDGED", value: String(positions.length) },
            { label: "PROPOSALS FILED",  value: String(fillData?.proposalIds.length ?? 0) },
            { label: "FILL PRICE",        value: fillData?.fillPrice ? fillData.fillPrice.toFixed(6) : "—" },
          ].map(card => (
            <div key={card.label} style={{
              background: T.bgSub,
              border: `1px solid ${T.soft}`,
              borderRadius: 4,
              padding: "12px 14px",
              textAlign: "center",
            }}>
              <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.tertiary, letterSpacing: "0.1em", marginBottom: 4 }}>
                {card.label}
              </div>
              <div style={{ fontFamily: T.fontMono, fontSize: 16, fontWeight: 700, color: T.primary }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Currency breakdown ───────────────────────────────────────── */}
        <div style={{ background: T.bgSub, border: `1px solid ${T.soft}`, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ padding: "8px 14px", background: T.bgDeep, borderBottom: `1px solid ${T.soft}` }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: T.tertiary }}>
              NOTIONAL BY CURRENCY
            </span>
          </div>
          {Object.entries(currencyBreakdown).map(([ccy, total], i, arr) => (
            <div key={ccy} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "7px 14px",
              borderBottom: i < arr.length - 1 ? `1px solid ${T.soft}` : "none",
            }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.cyan }}>{ccy}</span>
              <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: T.primary }}>{fmt(total)}</span>
            </div>
          ))}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "7px 14px",
            borderTop: `1px solid ${T.rim}`,
            background: T.bgDeep,
          }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.secondary }}>TOTAL NOTIONAL</span>
            <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.primary }}>{fmt(totalNotional)}</span>
          </div>
        </div>

        {/* ── Audit trail references (default open) ───────────────────── */}
        <div style={{ background: T.bgSub, border: `1px solid ${T.soft}`, borderRadius: 4, overflow: "hidden" }}>
          <button
            onClick={() => setAuditOpen(!auditOpen)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 14px", background: T.bgDeep, border: "none", cursor: "pointer",
              borderBottom: auditOpen ? `1px solid ${T.soft}` : "none",
            }}
          >
            <span style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: T.tertiary }}>
              AUDIT TRAIL REFERENCES
            </span>
            {auditOpen ? <ChevronUpIcon size={12} color={T.tertiary} /> : <ChevronDownIcon size={12} color={T.tertiary} />}
          </button>
          {auditOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.tertiary }}>CALCULATION RUN ID</span>
                <code style={{ fontFamily: T.fontMono, fontSize: 10, color: T.secondary }}>{runId}</code>
              </div>
              {fillData?.proposalIds.map((id, i) => (
                <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.tertiary }}>PROPOSAL {i + 1}</span>
                  <code style={{ fontFamily: T.fontMono, fontSize: 10, color: T.secondary }}>{id}</code>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Next Actions — 3-path layout ────────────────────────────── */}
        <div>
          <div style={{
            fontFamily: T.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
            color: T.tertiary, marginBottom: 10,
          }}>
            NEXT ACTIONS
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>

            {/* Monitor card */}
            <div style={{
              background: T.bgSub, border: `1px solid ${T.soft}`, borderRadius: 4,
              padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <BarChart2Icon size={14} color={T.cyan} />
                <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: T.primary }}>MONITOR</span>
              </div>
              <p style={{ fontFamily: T.fontUI, fontSize: 12, color: T.secondary, lineHeight: "1.5", margin: 0, flex: 1 }}>
                Track this hedge in the monitor. View P&L, mark-to-market, and expiry dates.
              </p>
              <Link
                href="/hedge-monitor"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                  color: T.cyan,
                  background: "color-mix(in srgb, var(--accent-cyan) 8%, transparent)",
                  border: `1px solid color-mix(in srgb, var(--accent-cyan) 25%, transparent)`,
                  padding: "8px 14px", borderRadius: 3, textDecoration: "none",
                  cursor: "pointer", justifyContent: "center",
                }}
              >
                OPEN <ArrowRightIcon size={12} color={T.cyan} />
              </Link>
            </div>

            {/* Export card */}
            <div style={{
              background: T.bgSub, border: `1px solid ${T.soft}`, borderRadius: 4,
              padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DownloadIcon size={14} color={T.secondary} />
                <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: T.primary }}>EXPORT</span>
              </div>
              <p style={{ fontFamily: T.fontUI, fontSize: 12, color: T.secondary, lineHeight: "1.5", margin: 0, flex: 1 }}>
                Download reports and execution confirmations in multiple formats.
              </p>
              <button
                onClick={() => setExportOpen(!exportOpen)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                  color: T.secondary,
                  background: T.bgPanel,
                  border: `1px solid ${T.soft}`,
                  padding: "8px 14px", borderRadius: 3, cursor: "pointer",
                  justifyContent: "center",
                }}
              >
                EXPORT {exportOpen ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
              </button>
              {exportOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
                  <button
                    onClick={handleDownloadExcel}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
                      color: T.cyan, background: "transparent",
                      border: `1px solid color-mix(in srgb, var(--accent-cyan) 20%, transparent)`,
                      padding: "6px 10px", borderRadius: 2, cursor: "pointer",
                    }}
                  >
                    <FileSpreadsheetIcon size={12} color={T.cyan} /> Excel Report
                  </button>
                  <button
                    onClick={handleDownloadBankPdf}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
                      color: T.secondary, background: "transparent",
                      border: `1px solid ${T.soft}`,
                      padding: "6px 10px", borderRadius: 2, cursor: "pointer",
                    }}
                  >
                    <FileTextIcon size={12} color={T.secondary} /> Bank Report
                  </button>
                  <button
                    onClick={handleDownload}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
                      color: T.tertiary, background: "transparent",
                      border: `1px solid ${T.soft}`,
                      padding: "6px 10px", borderRadius: 2, cursor: "pointer",
                    }}
                  >
                    <ClipboardIcon size={12} color={T.tertiary} /> JSON Confirmation
                  </button>
                </div>
              )}
            </div>

            {/* New Run card */}
            <div style={{
              background: T.bgSub, border: `1px solid ${T.soft}`, borderRadius: 4,
              padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <RefreshCwIcon size={14} color={T.green} />
                <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: T.primary }}>NEW RUN</span>
              </div>
              <p style={{ fontFamily: T.fontUI, fontSize: 12, color: T.secondary, lineHeight: "1.5", margin: 0, flex: 1 }}>
                Start another hedge run with a new set of positions.
              </p>
              <button
                onClick={onNewRun}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                  color: "#000",
                  background: T.green,
                  border: "none",
                  padding: "8px 14px", borderRadius: 3, cursor: "pointer",
                  justifyContent: "center",
                }}
              >
                START <ArrowRightIcon size={12} color="#000" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Footer note ─────────────────────────────────────────────── */}
        <div style={{
          fontFamily: T.fontUI, fontSize: 12, color: T.tertiary,
          textAlign: "center", padding: "8px 0 4px",
          borderTop: `1px solid ${T.soft}`,
        }}>
          This execution is recorded in the ORDR audit trail and can be retrieved from Audit Trail or Trade History.
        </div>

      </div>
    </div>
  );
}
