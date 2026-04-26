"use client";

import { useState } from "react";
import type { PositionRow } from "@/api/positionClient";
import type { BucketResult } from "@/api/types";
import {
  CheckCircleIcon, RefreshCwIcon, FileSpreadsheetIcon, FileTextIcon,
  ChevronDownIcon, ChevronUpIcon, BarChart2Icon, DownloadIcon,
  ArrowRightIcon, ClipboardIcon, ShieldCheckIcon, LayersIcon,
} from "lucide-react";
import Link from "next/link";
import { API_BASE } from "@/lib/api/apiBase";
import { T } from "./tokens";

interface PhaseCompleteProps {
  positions: PositionRow[];
  fillData: { fillPrice: number; proposalIds: string[] } | null;
  calcResult?: Record<string, unknown>;
  policyInstanceId?: string;
  runId: string;
  governanceMode: "solo" | "team";
  onNewRun: () => void;
  token: string;
}

function fmt(n: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals }).format(n);
}
function fmtRate(n: number): string { return n.toFixed(4); }

export default function PhaseComplete({
  positions,
  fillData,
  calcResult,
  policyInstanceId,
  runId,
  governanceMode,
  onNewRun,
  token,
}: PhaseCompleteProps) {
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("CONFIRMATION DOWNLOADED");
  const [auditOpen, setAuditOpen] = useState(false);

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

  // Extract calc data — calcResult may be the full CalculateResult
  // { calcResponse, marketSnapshot, ... } or the raw engine response.
  const engineResponse = ((calcResult as Record<string, unknown>)?.calcResponse ?? calcResult) as Record<string, unknown> | undefined;
  const hedgePlan = engineResponse?.hedge_plan as { buckets?: BucketResult[]; summary?: Record<string, number> } | undefined;
  const summary = hedgePlan?.summary;
  const buckets: BucketResult[] = (hedgePlan?.buckets ?? []).filter(b => !b.suppressed && Math.abs(b.action_mxn) > 0);
  const runEnvelope = engineResponse?.run_envelope as Record<string, unknown> | undefined;

  // Computed metrics
  const totalExposure = summary?.total_exposure_mxn ?? totalNotional;
  const hedgedAmount = summary?.total_action_mxn ?? 0;
  const residual = summary?.total_residual_mxn ?? (totalExposure - Math.abs(hedgedAmount));
  const hedgeCost = summary?.total_friction_usd ?? 0;
  const coveragePct = totalExposure > 0 ? Math.min(100, (Math.abs(hedgedAmount) / totalExposure) * 100) : 0;

  // Maturity window
  const valueDates = positions
    .map(p => p.value_date)
    .filter((d): d is string => !!d)
    .sort();
  const earliestMaturity = valueDates[0] ?? "—";
  const latestMaturity = valueDates[valueDates.length - 1] ?? "—";
  const maturityWindow = earliestMaturity === latestMaturity
    ? earliestMaturity
    : `${earliestMaturity} to ${latestMaturity}`;

  const proposalCount = fillData?.proposalIds.length ?? 0;
  const completedAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const hasCalcData = !!summary || buckets.length > 0;

  // ── Export functions (unchanged logic) ─────────────────────────────────────

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

    const rows: string[][] = [
      ["HEDGE EXECUTION REPORT", "", "", "", "", ""],
      ["Run ID", runId, "", "Generated", new Date().toISOString(), ""],
      ["Governance Mode", governanceMode, "", "Fill Price", fillData?.fillPrice?.toFixed(6) ?? "—", ""],
      ["Positions Hedged", String(positions.length), "", "Proposals Filed", String(proposalCount), ""],
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

    const lines = [
      "ORDR TERMINAL — HEDGE EXECUTION BANK REPORT",
      "=".repeat(60),
      "",
      `Run ID:           ${runId}`,
      `Generated:        ${new Date().toISOString()}`,
      `Governance Mode:  ${governanceMode.toUpperCase()}`,
      `Positions Hedged: ${positions.length}`,
      `Proposals Filed:  ${proposalCount}`,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%", overflow: "hidden" }}>

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

      {/* ── 1. Hero Confirmation Header ─────────────────────────────────── */}
      <div style={{
        padding: "20px 24px 18px",
        background: `linear-gradient(135deg, color-mix(in srgb, ${T.green} 8%, ${T.bgSub}), ${T.bgSub})`,
        borderBottom: `2px solid color-mix(in srgb, ${T.green} 30%, transparent)`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: `color-mix(in srgb, ${T.green} 15%, transparent)`,
            border: `2px solid color-mix(in srgb, ${T.green} 40%, transparent)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <CheckCircleIcon size={18} color={T.green} />
          </div>
          <div>
            <div style={{ fontFamily: T.fontMono, fontSize: 16, fontWeight: 700, letterSpacing: "0.12em", color: T.green }}>
              HEDGE EXECUTION CONFIRMED
            </div>
            <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary, marginTop: 2 }}>
              {completedAt}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{
            fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
            color: T.green,
            background: `color-mix(in srgb, ${T.green} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${T.green} 30%, transparent)`,
            padding: "4px 12px", borderRadius: 2,
          }}>
            HEDGED
          </span>
          <span style={{
            fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
            color: T.cyan,
            background: `color-mix(in srgb, ${T.cyan} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${T.cyan} 25%, transparent)`,
            padding: "4px 12px", borderRadius: 2,
          }}>
            {governanceMode === "team" ? "TEAM GOVERNANCE" : "SOLO GOVERNANCE"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary, letterSpacing: "0.06em" }}>RUN</span>
            <code style={{ fontFamily: T.fontMono, fontSize: 12, color: T.primary }}>{runId.slice(0, 12)}</code>
          </div>
          <span style={{ width: 1, height: 12, background: T.soft, display: "inline-block" }} />
          <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.primary }}>
            {positions.length} position{positions.length !== 1 ? "s" : ""}
          </span>
          <span style={{ width: 1, height: 12, background: T.soft, display: "inline-block" }} />
          <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.primary }}>
            {proposalCount} proposal{proposalCount !== 1 ? "s" : ""} executed
          </span>
          {fillData?.fillPrice ? (
            <>
              <span style={{ width: 1, height: 12, background: T.soft, display: "inline-block" }} />
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.cyan }}>
                Fill: {fillData.fillPrice.toFixed(4)}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px 20px" }}>

        {/* ── 2. Plain-Language Narrative ─────────────────────────────────── */}
        <div style={{
          background: T.bgSub,
          border: `1px solid ${T.soft}`,
          borderRadius: 4,
          padding: "16px 18px",
        }}>
          <div style={{
            fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em",
            color: T.tertiary, marginBottom: 12,
          }}>
            EXECUTION SUMMARY
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* WHAT */}
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.tertiary, width: 60, flexShrink: 0, paddingTop: 2 }}>WHAT</span>
              <span style={{ fontFamily: T.fontUI, fontSize: 13, color: T.primary, lineHeight: "1.5" }}>
                {positions.length} position{positions.length !== 1 ? "s" : ""} totaling{" "}
                <span style={{ fontFamily: T.fontMono, fontWeight: 700 }}>{fmt(totalExposure)}</span>{" "}
                {Object.keys(currencyBreakdown).join("/")} exposure hedged
                {buckets.length > 0 ? ` across ${buckets.length} maturity bucket${buckets.length !== 1 ? "s" : ""}` : ""}.
              </span>
            </div>
            {/* AT WHAT RATE */}
            {(fillData?.fillPrice || buckets.length > 0) && (
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.tertiary, width: 60, flexShrink: 0, paddingTop: 2 }}>RATE</span>
                <span style={{ fontFamily: T.fontUI, fontSize: 13, color: T.primary, lineHeight: "1.5" }}>
                  {fillData?.fillPrice
                    ? <>Fill price <span style={{ fontFamily: T.fontMono, fontWeight: 700, color: T.cyan }}>{fillData.fillPrice.toFixed(4)}</span></>
                    : buckets.length > 0
                      ? <>Forward rate <span style={{ fontFamily: T.fontMono, fontWeight: 700, color: T.cyan }}>{fmtRate(buckets[0].forward_rate)}</span>{buckets.length > 1 ? " (weighted avg)" : ""}</>
                      : null
                  }
                </span>
              </div>
            )}
            {/* UNTIL WHEN */}
            {earliestMaturity !== "—" && (
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.tertiary, width: 60, flexShrink: 0, paddingTop: 2 }}>TENOR</span>
                <span style={{ fontFamily: T.fontUI, fontSize: 13, color: T.primary, lineHeight: "1.5" }}>
                  Covering maturities {maturityWindow}.
                </span>
              </div>
            )}
            {/* GOVERNANCE */}
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.tertiary, width: 60, flexShrink: 0, paddingTop: 2 }}>GOV</span>
              <span style={{ fontFamily: T.fontUI, fontSize: 13, color: T.primary, lineHeight: "1.5" }}>
                {governanceMode === "team" ? "Team governance (4-eyes)" : "Solo governance mode"}.{" "}
                {proposalCount} proposal{proposalCount !== 1 ? "s" : ""} filed and executed.
              </span>
            </div>
          </div>
        </div>

        {/* ── 3. Enhanced Metrics Grid ───────────────────────────────────── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
          background: T.soft,
          border: `1px solid ${T.rim}`,
          borderRadius: 4,
          overflow: "hidden",
        }}>
          {([
            ["TOTAL EXPOSURE",  fmt(totalExposure),                                 T.primary],
            ["HEDGED AMOUNT",   fmt(Math.abs(hedgedAmount)),                         T.cyan],
            ["COVERAGE",        hasCalcData ? `${coveragePct.toFixed(1)}%` : "—",   coveragePct >= 90 ? T.green : coveragePct >= 70 ? T.amber : T.primary],
            ["RESIDUAL RISK",   fmt(Math.abs(residual)),                             residual > 0 ? T.amber : T.green],
            ["HEDGE COST",      hedgeCost > 0 ? `$${fmt(hedgeCost)}` : "—",         T.secondary],
            ["MATURITY WINDOW", maturityWindow,                                      T.primary],
          ] as const).map(([label, value, color]) => (
            <div key={label} style={{ padding: "14px 16px", background: T.bgSub }}>
              <div style={{ fontFamily: T.fontMono, fontSize: 12, letterSpacing: "0.12em", color: T.tertiary, marginBottom: 6 }}>{label}</div>
              <div style={{ fontFamily: T.fontMono, fontSize: 18, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── 4. Execution Legs Summary ──────────────────────────────────── */}
        {buckets.length > 0 && (
          <div style={{ background: T.bgSub, border: `1px solid ${T.soft}`, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ padding: "8px 14px", background: T.bgDeep, borderBottom: `1px solid ${T.soft}`, display: "flex", alignItems: "center", gap: 8 }}>
              <LayersIcon size={12} color={T.tertiary} />
              <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: T.tertiary }}>
                EXECUTION LEGS
              </span>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, background: T.soft, color: T.tertiary, padding: "1px 7px", borderRadius: 10 }}>
                {buckets.length}
              </span>
            </div>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 90px 80px 90px 110px",
              padding: "0 14px",
              borderBottom: `1px solid ${T.soft}`,
            }}>
              {["BUCKET", "DIRECTION", "CONTRACTS", "FWD RATE", "NOTIONAL"].map(h => (
                <div key={h} style={{
                  padding: "7px 6px",
                  fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: T.tertiary,
                }}>{h}</div>
              ))}
            </div>
            {/* Rows */}
            {buckets.map((b, i) => {
              const primaryCcy = Object.keys(currencyBreakdown)[0] ?? "MXN";
              const contractSize = primaryCcy === "MXN" ? 500000 : primaryCcy === "EUR" ? 125000 : primaryCcy === "GBP" ? 62500 : 100000;
              const contracts = Math.max(1, Math.ceil(Math.abs(b.action_mxn) / contractSize));
              const side = (b.action_direction ?? "").startsWith("SELL") ? "SELL" : "BUY";
              return (
                <div key={b.bucket ?? i} style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 90px 80px 90px 110px",
                  padding: "0 14px",
                  borderBottom: i < buckets.length - 1 ? `1px solid ${T.soft}` : "none",
                  background: i % 2 === 0 ? T.bgSub : T.bgPanel,
                }}>
                  <div style={{ padding: "8px 6px", fontFamily: T.fontMono, fontSize: 12, color: T.primary }}>{b.bucket ?? `Bucket ${i + 1}`}</div>
                  <div style={{ padding: "8px 6px" }}>
                    <span style={{
                      fontFamily: T.fontMono, fontSize: 12, fontWeight: 700,
                      color: side === "SELL" ? T.red : T.cyan,
                      padding: "1px 6px", borderRadius: 2,
                      background: side === "SELL"
                        ? "color-mix(in srgb, var(--accent-red,#DC2626) 10%, transparent)"
                        : `color-mix(in srgb, ${T.cyan} 10%, transparent)`,
                    }}>{side}</span>
                  </div>
                  <div style={{ padding: "8px 6px", fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.primary }}>{fmt(contracts)}</div>
                  <div style={{ padding: "8px 6px", fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.cyan }}>{fmtRate(b.forward_rate)}</div>
                  <div style={{ padding: "8px 6px", fontFamily: T.fontMono, fontSize: 12, color: T.primary }}>{fmt(Math.abs(b.action_mxn))}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── 5. Policy & Audit Section (collapsible) ────────────────────── */}
        <div style={{ background: T.bgSub, border: `1px solid ${T.soft}`, borderRadius: 4, overflow: "hidden" }}>
          <button
            onClick={() => setAuditOpen(!auditOpen)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 14px", background: T.bgDeep, border: "none", cursor: "pointer",
              borderBottom: auditOpen ? `1px solid ${T.soft}` : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheckIcon size={12} color={T.tertiary} />
              <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: T.tertiary }}>
                POLICY & AUDIT TRAIL
              </span>
            </div>
            {auditOpen ? <ChevronUpIcon size={12} color={T.tertiary} /> : <ChevronDownIcon size={12} color={T.tertiary} />}
          </button>
          {auditOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 14px" }}>
              {policyInstanceId && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary }}>POLICY INSTANCE</span>
                  <code style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary }}>{policyInstanceId}</code>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary }}>CALCULATION RUN ID</span>
                <code style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary }}>{runId}</code>
              </div>
              {runEnvelope && (
                <>
                  {typeof runEnvelope.engine_version === "string" && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary }}>ENGINE VERSION</span>
                      <code style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary }}>{runEnvelope.engine_version as string}</code>
                    </div>
                  )}
                  {typeof runEnvelope.input_hash === "string" && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary }}>INPUT HASH</span>
                      <code style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary }}>{(runEnvelope.input_hash as string).slice(0, 16)}...</code>
                    </div>
                  )}
                  {typeof runEnvelope.output_hash === "string" && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary }}>OUTPUT HASH</span>
                      <code style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary }}>{(runEnvelope.output_hash as string).slice(0, 16)}...</code>
                    </div>
                  )}
                </>
              )}
              {fillData?.proposalIds.map((id, i) => (
                <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary }}>PROPOSAL {i + 1}</span>
                  <code style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary }}>{id}</code>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 6. Currency Breakdown ──────────────────────────────────────── */}
        {Object.keys(currencyBreakdown).length > 1 && (
          <div style={{ background: T.bgSub, border: `1px solid ${T.soft}`, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ padding: "8px 14px", background: T.bgDeep, borderBottom: `1px solid ${T.soft}` }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: T.tertiary }}>
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
        )}

        {/* ── 7. Export Buttons (horizontal strip) ───────────────────────── */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleDownloadExcel}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
              color: T.cyan, background: `color-mix(in srgb, ${T.cyan} 6%, transparent)`,
              border: `1px solid color-mix(in srgb, ${T.cyan} 20%, transparent)`,
              padding: "10px 14px", borderRadius: 3, cursor: "pointer",
            }}
          >
            <FileSpreadsheetIcon size={14} color={T.cyan} /> Excel Report
          </button>
          <button
            onClick={handleDownloadBankPdf}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
              color: T.secondary, background: T.bgSub,
              border: `1px solid ${T.soft}`,
              padding: "10px 14px", borderRadius: 3, cursor: "pointer",
            }}
          >
            <FileTextIcon size={14} color={T.secondary} /> Bank Report
          </button>
          <button
            onClick={handleDownload}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
              color: T.tertiary, background: T.bgSub,
              border: `1px solid ${T.soft}`,
              padding: "10px 14px", borderRadius: 3, cursor: "pointer",
            }}
          >
            <ClipboardIcon size={14} color={T.tertiary} /> JSON Confirmation
          </button>
        </div>

        {/* ── 8. Next Actions — 3-column layout ─────────────────────────── */}
        <div>
          <div style={{
            fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em",
            color: T.tertiary, marginBottom: 10,
          }}>
            NEXT ACTIONS
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {/* Monitor */}
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
                  background: `color-mix(in srgb, ${T.cyan} 8%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${T.cyan} 25%, transparent)`,
                  padding: "8px 14px", borderRadius: 3, textDecoration: "none",
                  cursor: "pointer", justifyContent: "center",
                }}
              >
                OPEN <ArrowRightIcon size={12} color={T.cyan} />
              </Link>
            </div>

            {/* Export */}
            <div style={{
              background: T.bgSub, border: `1px solid ${T.soft}`, borderRadius: 4,
              padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DownloadIcon size={14} color={T.secondary} />
                <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: T.primary }}>EXPORT</span>
              </div>
              <p style={{ fontFamily: T.fontUI, fontSize: 12, color: T.secondary, lineHeight: "1.5", margin: 0, flex: 1 }}>
                Compliance reports and audit confirmations available above.
              </p>
              <Link
                href="/audit-trail"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                  color: T.secondary,
                  background: T.bgPanel,
                  border: `1px solid ${T.soft}`,
                  padding: "8px 14px", borderRadius: 3, textDecoration: "none",
                  cursor: "pointer", justifyContent: "center",
                }}
              >
                AUDIT TRAIL <ArrowRightIcon size={12} color={T.secondary} />
              </Link>
            </div>

            {/* New Run */}
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
                  color: T.black,
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

        {/* Footer */}
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
