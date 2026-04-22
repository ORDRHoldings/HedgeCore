"use client";

/**
 * /hedge-effectiveness — IFRS 9 / ASC 815 Hedge Effectiveness Testing
 *
 * Bloomberg-grade landing page with:
 *   OVERVIEW  — Executive summary, standards cards, latest assessment
 *   DATASETS  — Dataset inventory with assessment actions
 *   NEW ASSESSMENT — Manual entry or CSV upload
 *   RUNS      — Assessment history with visual verdict indicators
 */

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import dynamic from "next/dynamic";
import { draftCommentary, type CommentaryResponse } from "@/lib/api/intelligenceClient";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });


// ── Design tokens ──────────────────────────────────────────────────────────
const S = {
  mono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  ui: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  deep: "var(--bg-deep)",
  panel: "var(--bg-panel)",
  sub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  text1: "var(--text-primary)",
  text2: "var(--text-secondary)",
  text3: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  green: "var(--status-pass,#059669)",
  red: "var(--accent-red,#DC2626)",
  amber: "var(--accent-amber,#D97706)",
} as const;

const HEX = {
  cyan: "#1C62F2",
  green: "#059669",
  greenBg: "#ECFDF5",
  greenBorder: "#A7F3D0",
  red: "#DC2626",
  redBg: "#FEF2F2",
  redBorder: "#FECACA",
  amber: "#D97706",
  text1: "#0F172A",
  text2: "#334155",
  text3: "#94A3B8",
  border: "#E2E8F0",
  bgSub: "#F1F5F9",
} as const;

type Tab = "overview" | "datasets" | "upload" | "runs";

interface Dataset {
  id: string;
  name: string;
  description: string | null;
  currency_pair: string | null;
  hedge_type: string;
  period_count: number;
  source: string;
  source_hash: string;
  created_at: string | null;
  designation_date: string | null;
}

interface Run {
  run_id: string;
  dataset_id: string;
  dataset_name: string;
  currency_pair: string | null;
  standard: string;
  dollar_offset_ratio: number | null;
  dollar_offset_effective: boolean | null;
  regression_r_squared: number | null;
  overall_effective: boolean;
  run_hash: string;
  created_at: string | null;
}

interface PeriodRow {
  period_date: string;
  hedged_item_fv_change: string;
  instrument_fv_change: string;
}

export default function HedgeEffectivenessPage() {
  const isMobile = useIsMobile();
  return (
    <Suspense fallback={
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: S.deep }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 28, height: 28, border: `2px solid ${S.rim}`, borderTopColor: S.cyan,
            borderRadius: "50%", animation: "spin 0.8s linear infinite",
          }} />
          <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, letterSpacing: "0.1em" }}>
            LOADING
          </span>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    }>
      <HedgeEffectivenessInner />
    </Suspense>
  );
}

function HedgeEffectivenessInner() {
  const isMobile = useIsMobile();
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(tabParam || "overview");

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dataset form
  const [formName, setFormName] = useState("");
  const [formPair, setFormPair] = useState("");
  const [formHedgeType, setFormHedgeType] = useState("cash_flow");
  const [formStandard, setFormStandard] = useState("ASC_815");
  const [formPeriods, setFormPeriods] = useState<PeriodRow[]>([
    { period_date: "", hedged_item_fv_change: "", instrument_fv_change: "" },
    { period_date: "", hedged_item_fv_change: "", instrument_fv_change: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleDeleteRuns = async (ids: string[]) => {
    if (!token) return;
    const res = await dashboardFetch("/v1/hedge-effectiveness/runs/batch-delete", token, {
      method: "POST",
      body: JSON.stringify({ run_ids: ids }),
    });
    if (res.ok) setRuns((prev) => prev.filter((r) => !ids.includes(r.run_id)));
  };

  const handleUpdateDataset = async (id: string, data: { name?: string; currency_pair?: string | null; designation_date?: string | null }) => {
    if (!token) return;
    await dashboardFetch(`/v1/hedge-effectiveness/datasets/${id}`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    await loadData();
  };

  // 29.2 — Clone dataset
  const handleCloneDataset = async (id: string) => {
    if (!token) return;
    const res = await dashboardFetch(`/v1/hedge-effectiveness/datasets/${id}/clone`, token, { method: "POST" });
    if (res.ok) await loadData();
  };

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [dsRes, runsRes] = await Promise.all([
        dashboardFetch("/v1/hedge-effectiveness/datasets", token),
        dashboardFetch("/v1/hedge-effectiveness/runs", token),
      ]);
      if (dsRes.ok) {
        const d = await dsRes.json();
        setDatasets(d.items || []);
      }
      if (runsRes.ok) {
        const r = await runsRes.json();
        setRuns(Array.isArray(r) ? r : []);
      }
    } catch {
      // silently fail on load
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (tabParam && tabParam !== tab) setTab(tabParam);
  }, [tabParam, tab]);

  const switchTab = (t: Tab) => {
    setTab(t);
    router.replace(`/hedge-effectiveness${t === "overview" ? "" : `?tab=${t}`}`, { scroll: false });
  };

  const addPeriod = () => {
    setFormPeriods([...formPeriods, { period_date: "", hedged_item_fv_change: "", instrument_fv_change: "" }]);
  };

  const removePeriod = (idx: number) => {
    if (formPeriods.length <= 2) return;
    setFormPeriods(formPeriods.filter((_, i) => i !== idx));
  };

  const updatePeriod = (idx: number, field: keyof PeriodRow, val: string) => {
    const updated = [...formPeriods];
    updated[idx] = { ...updated[idx], [field]: val };
    setFormPeriods(updated);
  };

  // Submit dataset + run assessment
  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    if (!token) return;

    const validPeriods = formPeriods.filter(
      (p) => p.hedged_item_fv_change.trim() !== "" && p.instrument_fv_change.trim() !== ""
    );
    if (validPeriods.length < 2) {
      setError("At least 2 periods with numeric values required.");
      return;
    }
    if (!formName.trim()) {
      setError("Dataset name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const dsBody = {
        name: formName.trim(),
        currency_pair: formPair.trim() || undefined,
        hedge_type: formHedgeType,
        periods: validPeriods.map((p) => ({
          period_date: p.period_date || null,
          hedged_item_fv_change: parseFloat(p.hedged_item_fv_change),
          instrument_fv_change: parseFloat(p.instrument_fv_change),
        })),
      };

      const dsRes = await dashboardFetch("/v1/hedge-effectiveness/datasets", token, {
        method: "POST",
        body: JSON.stringify(dsBody),
      });
      if (!dsRes.ok) {
        const err = await dsRes.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${dsRes.status}`);
      }
      const ds = await dsRes.json();

      const assessRes = await dashboardFetch("/v1/hedge-effectiveness/assess", token, {
        method: "POST",
        body: JSON.stringify({
          dataset_id: ds.dataset_id,
          standard: formStandard,
          method: "both",
        }),
      });
      if (!assessRes.ok) {
        const err = await assessRes.json().catch(() => ({}));
        throw new Error(err.detail || `Assessment failed: HTTP ${assessRes.status}`);
      }
      const result = await assessRes.json();

      setSuccess(
        `Assessment complete: ${result.overall_effective ? "EFFECTIVE" : "INEFFECTIVE"} under ${result.standard}`
      );

      setTimeout(() => {
        router.push(`/hedge-effectiveness/runs/${result.run_id}`);
      }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  // CSV upload
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvName, setCsvName] = useState("");
  const [csvPair, setCsvPair] = useState("");

  const handleCsvUpload = async () => {
    if (!token || !csvFile) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      formData.append("name", csvName.trim() || csvFile.name);
      formData.append("currency_pair", csvPair.trim());
      formData.append("hedge_type", formHedgeType);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"}/v1/hedge-effectiveness/datasets/upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const ds = await res.json();
      setSuccess(`Dataset uploaded: ${ds.period_count} periods`);
      await loadData();
      switchTab("datasets");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  const runAssessment = async (datasetId: string) => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await dashboardFetch("/v1/hedge-effectiveness/assess", token, {
        method: "POST",
        body: JSON.stringify({
          dataset_id: datasetId,
          standard: formStandard,
          method: "both",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      router.push(`/hedge-effectiveness/runs/${result.run_id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Assessment failed");
    } finally {
      setSubmitting(false);
    }
  };

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "overview", label: "OVERVIEW", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3" },
    { key: "datasets", label: "DATASETS", icon: "M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7l8-4 8 4M4 7l8 4 8-4" },
    { key: "upload", label: "NEW ASSESSMENT", icon: "M12 4v16m8-8H4" },
    { key: "runs", label: "ASSESSMENT RUNS", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  ];

  const effectiveCount = runs.filter((r) => r.overall_effective).length;
  const ineffectiveCount = runs.filter((r) => !r.overall_effective).length;

  return (

    
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: S.deep }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, background: S.panel,
        borderBottom: `1px solid ${S.rim}`,
      }}>
        <div style={{ padding: "20px 28px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 6,
              background: "rgba(28,98,242,0.06)", border: "1px solid rgba(28,98,242,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={HEX.cyan} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="3" x2="12" y2="21"/><line x1="4" y1="7" x2="20" y2="7"/>
                <path d="M4 7l2 8h0a4 4 0 0 0 4 0h0l2-8"/><path d="M12 7l2 8h0a4 4 0 0 0 4 0h0l2-8"/>
              </svg>
            </div>
            <div>
              <h1 style={{ fontFamily: S.mono, fontSize: 15, fontWeight: 700, color: S.text1, letterSpacing: "0.08em", margin: 0 }}>
                HEDGE EFFECTIVENESS TESTING
              </h1>
              <span style={{ fontFamily: S.ui, fontSize: 12, color: S.text3 }}>
                IFRS 9 / ASC 815 / IAS 39 retrospective quantitative assessment
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <span style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
              padding: "4px 12px", borderRadius: 3,
              background: "rgba(28,98,242,0.06)", color: HEX.cyan,
              border: "1px solid rgba(28,98,242,0.12)",
            }}>
              METHODOLOGY v1.0.0
            </span>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{
          display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "repeat(5, 1fr)",
          margin: "14px 28px 0", borderRadius: 6,
          border: `1px solid ${S.rim}`, overflow: "hidden",
        }}>
          {([
            { label: "DATASETS", value: datasets.length, color: undefined },
            { label: "ASSESSMENTS", value: runs.length, color: undefined },
            { label: "EFFECTIVE", value: effectiveCount, color: effectiveCount > 0 ? HEX.green : undefined },
            { label: "INEFFECTIVE", value: ineffectiveCount, color: ineffectiveCount > 0 ? HEX.red : undefined },
            {
              label: "PASS RATE",
              value: runs.length > 0 ? `${((effectiveCount / runs.length) * 100).toFixed(1)}%` : "\u2014",
              color: runs.length > 0 && effectiveCount / runs.length >= 0.8 ? HEX.green : undefined,
            },
          ] as { label: string; value: string | number; color?: string }[]).map((kpi, i) => (
            <div key={kpi.label} style={{
              padding: "12px 16px",
              borderRight: i < 4 ? `1px solid ${S.rim}` : "none",
              background: S.panel,
            }}>
              <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 4 }}>
                {kpi.label}
              </div>
              <div style={{
                fontFamily: S.mono, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em",
                color: kpi.color || S.text1,
              }}>
                {loading ? "\u2014" : kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, padding: "14px 28px 0" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              style={{
                fontFamily: S.mono, fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
                letterSpacing: "0.1em", color: tab === t.key ? HEX.cyan : S.text3,
                padding: "8px 16px", background: "transparent", border: "none",
                borderBottom: tab === t.key ? `2px solid ${HEX.cyan}` : "2px solid transparent",
                cursor: "pointer", transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {error && (
          <div style={{
            padding: "10px 16px", marginBottom: 16, borderRadius: 4,
            background: HEX.redBg, border: `1px solid ${HEX.redBorder}`,
            fontFamily: S.ui, fontSize: 13, color: HEX.red,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>
            </svg>
            {error}
          </div>
        )}
        {success && (
          <div style={{
            padding: "10px 16px", marginBottom: 16, borderRadius: 4,
            background: HEX.greenBg, border: `1px solid ${HEX.greenBorder}`,
            fontFamily: S.ui, fontSize: 13, color: HEX.green,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>
            </svg>
            {success}
          </div>
        )}

        {loading ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
            padding: 60,
          }}>
            <div style={{
              width: 28, height: 28, border: `2px solid ${S.rim}`, borderTopColor: S.cyan,
              borderRadius: "50%", animation: "spin 0.8s linear infinite",
            }} />
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>LOADING DATA</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : tab === "overview" ? (
          <OverviewTab
            datasets={datasets}
            runs={runs}
            onNavigateRun={(id) => router.push(`/hedge-effectiveness/runs/${id}`)}
            onSwitchTab={switchTab}
          />
        ) : tab === "datasets" ? (
          <DatasetsTab
            datasets={datasets}
            runs={runs}
            standard={formStandard}
            onRunAssessment={runAssessment}
            onNavigateRun={(id) => router.push(`/hedge-effectiveness/runs/${id}`)}
            submitting={submitting}
            onUpdateDataset={handleUpdateDataset}
            onCloneDataset={handleCloneDataset}
            token={token ?? ""}
          />
        ) : tab === "upload" ? (
          <UploadTab
            formName={formName} setFormName={setFormName}
            formPair={formPair} setFormPair={setFormPair}
            formHedgeType={formHedgeType} setFormHedgeType={setFormHedgeType}
            formStandard={formStandard} setFormStandard={setFormStandard}
            formPeriods={formPeriods}
            addPeriod={addPeriod} removePeriod={removePeriod} updatePeriod={updatePeriod}
            handleSubmit={handleSubmit} submitting={submitting}
            csvFile={csvFile} setCsvFile={setCsvFile}
            csvName={csvName} setCsvName={setCsvName}
            csvPair={csvPair} setCsvPair={setCsvPair}
            handleCsvUpload={handleCsvUpload}
          />
        ) : (
          <RunsTab runs={runs} onNavigateRun={(id) => router.push(`/hedge-effectiveness/runs/${id}`)} onDeleteRuns={handleDeleteRuns} token={token ?? ""} />
        )}
      </div>
    </div>
  
    
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═════════════════════════════════════════════════════════════════════════════

function OverviewTab({
  datasets, runs, onNavigateRun, onSwitchTab,
}: {
  datasets: Dataset[]; runs: Run[];
  onNavigateRun: (id: string) => void;
  onSwitchTab: (t: Tab) => void;
}) {
  const isMobile = useIsMobile();
  const lastRun = runs[0];
  // ── 28.3 Rolling pass-rate window selector ──
  const [passWindow, setPassWindow] = useState<5 | 10 | 0>(0);

  // KPI calculations
  const totalRuns = runs.length;
  const totalDatasets = datasets.length;
  const effectiveRuns = runs.filter((r) => r.overall_effective).length;
  const effectiveRate = totalRuns > 0 ? Math.round((effectiveRuns / totalRuns) * 100) : null;
  const doRatios = runs.map((r) => r.dollar_offset_ratio).filter((v): v is number => v != null);
  const avgDo = doRatios.length > 0 ? doRatios.reduce((s, v) => s + v, 0) / doRatios.length : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, maxWidth: 1100 }}>
      {/* KPI tiles */}
      {totalRuns > 0 && (
        <div style={{
          gridColumn: "1 / -1",
          display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12,
        }}>
          {([
            { label: "TOTAL ASSESSMENTS", value: totalRuns.toString(), sub: `${effectiveRuns} effective`, color: HEX.cyan },
            { label: "DATASETS", value: totalDatasets.toString(), sub: totalDatasets === 0 ? "none created" : `${totalDatasets} configured`, color: HEX.text2 },
            { label: "PASS RATE", value: effectiveRate != null ? `${effectiveRate}%` : "—", sub: `${effectiveRuns} of ${totalRuns}`, color: effectiveRate == null ? HEX.text2 : effectiveRate >= 80 ? HEX.green : effectiveRate >= 60 ? HEX.amber : HEX.red },
            { label: "AVG D.O. RATIO", value: avgDo != null ? avgDo.toFixed(3) : "—", sub: avgDo != null && avgDo >= 0.80 && avgDo <= 1.25 ? "within band" : avgDo != null ? "outside band" : "no data", color: avgDo != null && avgDo >= 0.80 && avgDo <= 1.25 ? HEX.green : HEX.text2 },
          ] as const).map((kpi) => (
            <div key={kpi.label} style={{
              padding: "16px 18px", borderRadius: 6,
              background: S.panel, border: `1px solid ${S.rim}`,
              position: "relative", overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 0, left: 0, width: "100%", height: 2,
                background: kpi.color, opacity: 0.6,
              }} />
              <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 6 }}>
                {kpi.label}
              </div>
              <div style={{ fontFamily: S.mono, fontSize: 26, fontWeight: 800, color: kpi.color, lineHeight: 1, marginBottom: 4 }}>
                {kpi.value}
              </div>
              <div style={{ fontFamily: S.ui, fontSize: 11, color: S.text3 }}>{kpi.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── 28.3 Rolling pass-rate KPI ── */}
      {runs.length >= 2 && (() => {
        const sorted = [...runs].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
        const windowSize = passWindow === 0 ? sorted.length : passWindow;
        const windowRuns = sorted.slice(0, Math.min(windowSize, sorted.length));
        const priorRuns = passWindow !== 0 ? sorted.slice(windowSize, windowSize * 2) : [];
        const windowPass = Math.round((windowRuns.filter((r) => r.overall_effective).length / windowRuns.length) * 100);
        const priorPass = priorRuns.length > 0 ? Math.round((priorRuns.filter((r) => r.overall_effective).length / priorRuns.length) * 100) : null;
        const delta = priorPass != null ? windowPass - priorPass : null;
        const accent = windowPass >= 80 ? HEX.green : windowPass >= 60 ? HEX.amber : HEX.red;
        return (
          <div style={{ gridColumn: "1 / -1", padding: "14px 20px", borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, display: "flex", alignItems: "center", gap: 24 }}>
            <div>
              <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 6 }}>ROLLING PASS RATE</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: S.mono, fontSize: 28, fontWeight: 800, color: accent, lineHeight: 1 }}>{windowPass}%</span>
                {delta != null && (
                  <span style={{
                    fontFamily: S.mono, fontSize: 11, fontWeight: 700,
                    color: delta > 0 ? HEX.green : delta < 0 ? HEX.red : S.text3,
                    display: "flex", alignItems: "center", gap: 2,
                  }}>
                    {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"}{Math.abs(delta)}pp vs prior
                  </span>
                )}
              </div>
              <div style={{ fontFamily: S.ui, fontSize: 11, color: S.text3, marginTop: 3 }}>
                {windowRuns.filter((r) => r.overall_effective).length} of {windowRuns.length} runs
              </div>
            </div>
            <div style={{ width: 1, height: 44, background: S.rim }} />
            <div style={{ display: "flex", gap: 6 }}>
              {([5, 10, 0] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setPassWindow(w)}
                  style={{
                    fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                    padding: "4px 10px", borderRadius: 3, cursor: "pointer", border: "none",
                    background: passWindow === w ? HEX.cyan : S.sub,
                    color: passWindow === w ? "#fff" : S.text3,
                    transition: "all 0.12s",
                  }}
                >
                  {w === 0 ? "ALL" : `LAST ${w}`}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── 31.2 Consecutive run streak KPI ── */}
      {runs.length >= 1 && (() => {
        const sorted = [...runs].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
        // Current streak: count from end while effective
        let current = 0;
        for (let i = sorted.length - 1; i >= 0; i--) {
          if (sorted[i].overall_effective) current++;
          else break;
        }
        // Best streak ever
        let best = 0, run = 0;
        for (const r of sorted) {
          if (r.overall_effective) { run++; best = Math.max(best, run); }
          else run = 0;
        }
        const isOnStreak = current > 0;
        const streakColor = current >= 5 ? HEX.green : current >= 2 ? HEX.cyan : current === 1 ? S.text2 : HEX.red;
        const lastRun = sorted[sorted.length - 1];
        const lastEffective = lastRun?.overall_effective;
        return (
          <div style={{
            gridColumn: "1 / -1", padding: "14px 20px", borderRadius: 6,
            background: S.panel, border: `1px solid ${isOnStreak && current >= 3 ? HEX.green + "40" : S.rim}`,
            display: "flex", alignItems: "center", gap: 24,
          }}>
            <div>
              <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 6 }}>
                CURRENT STREAK
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: S.mono, fontSize: 28, fontWeight: 800, color: streakColor, lineHeight: 1 }}>
                  {current >= 5 ? "🔥 " : ""}{current}
                </span>
                <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>
                  {current === 1 ? "run" : "runs"} {lastEffective ? "effective" : "— broken"}
                </span>
              </div>
            </div>
            <div style={{ width: 1, height: 44, background: S.rim }} />
            <div>
              <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 6 }}>
                BEST STREAK
              </div>
              <span style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 800, color: best >= 5 ? HEX.green : S.text2, lineHeight: 1 }}>
                {best}
              </span>
            </div>
            {!lastEffective && runs.length >= 1 && (
              <>
                <div style={{ width: 1, height: 44, background: S.rim }} />
                <div style={{
                  padding: "6px 12px", borderRadius: 3,
                  background: HEX.redBg, border: `1px solid ${HEX.redBorder}`,
                  fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: HEX.red,
                }}>
                  ⚠ STREAK BROKEN — last run ineffective
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── 34.1 Effectiveness regime bar ── */}
      {runs.length >= 2 && (() => {
        const sorted = [...runs].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
        // Collapse into consecutive same-verdict segments
        const segments: { effective: boolean; count: number }[] = [];
        for (const r of sorted) {
          if (segments.length === 0 || segments[segments.length - 1].effective !== r.overall_effective) {
            segments.push({ effective: r.overall_effective, count: 1 });
          } else {
            segments[segments.length - 1].count++;
          }
        }
        const total = sorted.length;
        const currentRegime = segments[segments.length - 1];
        return (
          <div style={{ gridColumn: "1 / -1", padding: "12px 20px", borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
                EFFECTIVENESS REGIME
              </span>
              <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>— {total} run{total !== 1 ? "s" : ""}, {segments.length} segment{segments.length !== 1 ? "s" : ""}</span>
              <div style={{ flex: 1 }} />
              <span style={{
                fontFamily: S.mono, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 2,
                background: currentRegime.effective ? HEX.greenBg : HEX.redBg,
                color: currentRegime.effective ? HEX.green : HEX.red,
                border: `1px solid ${currentRegime.effective ? HEX.greenBorder : HEX.redBorder}`,
              }}>
                CURRENT: {currentRegime.effective ? "EFFECTIVE" : "INEFFECTIVE"} ×{currentRegime.count}
              </span>
            </div>
            <div style={{ display: "flex", gap: 2, height: 22, borderRadius: 3, overflow: "hidden" }}>
              {segments.map((seg, i) => {
                const flex = seg.count;
                const isLast = i === segments.length - 1;
                return (
                  <div
                    key={i}
                    title={`${seg.effective ? "EFFECTIVE" : "INEFFECTIVE"}: ${seg.count} run${seg.count !== 1 ? "s" : ""}`}
                    style={{
                      flex,
                      minWidth: 4,
                      background: seg.effective
                        ? (isLast ? HEX.green : `${HEX.green}99`)
                        : (isLast ? HEX.red : `${HEX.red}99`),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "default",
                      borderRight: i < segments.length - 1 ? "1px solid rgba(0,0,0,0.15)" : "none",
                    }}
                  >
                    {(seg.count / total) > 0.08 && (
                      <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: "#fff", userSelect: "none" }}>
                        {seg.count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
              <span style={{ fontFamily: S.mono, fontSize: 9, color: S.text3 }}>← OLDEST</span>
              <div style={{ display: "flex", gap: 12 }}>
                {([["Effective", HEX.green], ["Ineffective", HEX.red]] as const).map(([lbl, color]) => (
                  <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 1, background: color }} />
                    <span style={{ fontFamily: S.ui, fontSize: 10, color: S.text3 }}>{lbl}</span>
                  </div>
                ))}
              </div>
              <span style={{ fontFamily: S.mono, fontSize: 9, color: S.text3 }}>LATEST →</span>
            </div>
          </div>
        );
      })()}

      {/* ── 23.2 Trend Direction Badge ── */}
      {(() => {
        if (runs.length < 10) return null;
        const sorted = [...runs].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
        const n = Math.min(5, Math.floor(sorted.length / 2));
        const recent = sorted.slice(-n);
        const prior = sorted.slice(-n * 2, -n);
        const recentRate = Math.round((recent.filter((r) => r.overall_effective).length / n) * 100);
        const priorRate = Math.round((prior.filter((r) => r.overall_effective).length / n) * 100);
        const delta = recentRate - priorRate;
        const dir = delta > 5 ? "up" : delta < -5 ? "down" : "flat";
        const color = dir === "up" ? HEX.green : dir === "down" ? HEX.red : HEX.amber;
        const arrow = dir === "up" ? "↑" : dir === "down" ? "↓" : "→";
        const label = dir === "up" ? "IMPROVING" : dir === "down" ? "DETERIORATING" : "STABLE";
        return (
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 4, background: S.panel, border: `1px solid ${S.rim}` }}>
            <span style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 800, color }}>{arrow}</span>
            <div>
              <div style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 800, color, letterSpacing: "0.1em" }}>{label}</div>
              <div style={{ fontFamily: S.ui, fontSize: 11, color: S.text3 }}>
                Pass rate: last {n} runs <strong style={{ color: S.text1 }}>{recentRate}%</strong> vs prior {n} <strong style={{ color: S.text1 }}>{priorRate}%</strong>
                {delta !== 0 && <span style={{ color, marginLeft: 6, fontWeight: 700 }}>{delta > 0 ? "+" : ""}{delta}pp</span>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 26.2 D.O. Distribution Statistics ── */}
      {(() => {
        const vals = runs.map((r) => r.dollar_offset_ratio).filter((v): v is number => v != null);
        if (vals.length < 3) return null;
        const sorted = [...vals].sort((a, b) => a - b);
        const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
        const median = sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];
        const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
        const stdDev = Math.sqrt(variance);
        const min = sorted[0]; const max = sorted[sorted.length - 1];
        const inBandCount = vals.filter((v) => v >= 0.80 && v <= 1.25).length;
        const stats = [
          { label: "MEAN",   value: mean.toFixed(4),   color: mean >= 0.80 && mean <= 1.25 ? HEX.green : HEX.amber },
          { label: "MEDIAN", value: median.toFixed(4),  color: median >= 0.80 && median <= 1.25 ? HEX.green : HEX.amber },
          { label: "STD DEV",value: stdDev.toFixed(4),  color: stdDev < 0.10 ? HEX.green : stdDev < 0.20 ? HEX.amber : HEX.red },
          { label: "MIN",    value: min.toFixed(4),     color: min >= 0.80 ? HEX.green : HEX.red },
          { label: "MAX",    value: max.toFixed(4),     color: max <= 1.25 ? HEX.green : HEX.red },
          { label: "IN BAND",value: `${inBandCount}/${vals.length}`, color: inBandCount === vals.length ? HEX.green : inBandCount / vals.length >= 0.8 ? HEX.amber : HEX.red },
        ];
        return (
          <div style={{ gridColumn: "1 / -1", background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4, padding: "14px 18px" }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: S.text3, textTransform: "uppercase", marginBottom: 12 }}>
              D.O. Ratio Distribution Statistics
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "repeat(6, 1fr)", gap: 8 }}>
              {stats.map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: "center", padding: "8px 4px", borderRadius: 3, background: S.sub, border: `1px solid ${S.rim}` }}>
                  <div style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: S.text3, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: S.mono, fontSize: 15, fontWeight: 800, color }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Risk alerts */}
      {(() => {
        const alerts: { level: "critical" | "warn" | "info"; text: string }[] = [];

        // Consecutive ineffective streak ≥ 3
        const sortedRuns = [...runs].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
        let streak = 0;
        for (const r of sortedRuns) {
          if (!r.overall_effective) streak++;
          else break;
        }
        if (streak >= 5) alerts.push({ level: "critical", text: `${streak} consecutive INEFFECTIVE assessments — immediate review required.` });
        else if (streak >= 3) alerts.push({ level: "warn", text: `${streak} consecutive ineffective assessments. Consider re-evaluating hedge strategy.` });

        // Pass rate < 60%
        if (runs.length >= 5) {
          const rate = Math.round((effectiveRuns / totalRuns) * 100);
          if (rate < 60) alerts.push({ level: "warn", text: `Overall pass rate is ${rate}% — below the 60% advisory threshold.` });
        }

        // Stale datasets (last run > 90 days ago)
        const nowMs = Date.now();
        const stale = datasets.filter((ds) => {
          const dsRuns = runs.filter((r) => r.dataset_id === ds.id);
          if (dsRuns.length === 0) return false;
          const last = dsRuns.reduce((m, r) => (r.created_at ?? "") > m ? (r.created_at ?? "") : m, "");
          if (!last) return false;
          return nowMs - new Date(last).getTime() > 90 * 24 * 60 * 60 * 1000;
        });
        if (stale.length > 0) alerts.push({ level: "info", text: `${stale.length} dataset${stale.length > 1 ? "s" : ""} not re-assessed in over 90 days: ${stale.slice(0, 2).map((d) => d.name).join(", ")}${stale.length > 2 ? ` +${stale.length - 2} more` : ""}.` });

        if (alerts.length === 0) return null;
        const colors = { critical: HEX.red, warn: HEX.amber, info: HEX.cyan } as const;
        return (
          <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6 }}>
            {alerts.map((a, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 16px", borderRadius: 4,
                background: `${colors[a.level]}0A`,
                border: `1px solid ${colors[a.level]}30`,
                borderLeft: `3px solid ${colors[a.level]}`,
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={colors[a.level]} strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                  {a.level === "info"
                    ? <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                    : <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}
                </svg>
                <span style={{ fontFamily: S.ui, fontSize: 12, color: S.text1, lineHeight: 1.5 }}>{a.text}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── 33.2 Worst performers panel ── */}
      {(() => {
        const ineffective = runs
          .filter((r) => !r.overall_effective && r.dollar_offset_ratio != null)
          .map((r) => {
            const ratio = r.dollar_offset_ratio as number;
            const dist = ratio < 0.80 ? 0.80 - ratio : ratio > 1.25 ? ratio - 1.25 : 0;
            return { ...r, distFromBand: dist };
          })
          .sort((a, b) => b.distFromBand - a.distFromBand)
          .slice(0, 3);
        if (ineffective.length === 0) return null;
        const rankColors = [HEX.red, HEX.amber, HEX.text3];
        return (
          <div style={{ gridColumn: "1 / -1", padding: "14px 20px", borderRadius: 6, background: S.panel, border: `1px solid ${HEX.redBorder}` }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: HEX.red, letterSpacing: "0.14em", marginBottom: 12 }}>
              WORST PERFORMERS
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ineffective.map((r, i) => (
                <div key={r.run_id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{
                    fontFamily: S.mono, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: `${rankColors[i]}18`, color: rankColors[i], border: `1px solid ${rankColors[i]}40`,
                  }}>
                    #{i + 1}
                  </span>
                  <span style={{ fontFamily: S.ui, fontSize: 12, color: S.text1, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.dataset_name}
                  </span>
                  <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: HEX.red, flexShrink: 0 }}>
                    {(r.dollar_offset_ratio as number).toFixed(4)}
                  </span>
                  <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3, flexShrink: 0, minWidth: 80 }}>
                    {r.distFromBand.toFixed(4)} from band
                  </span>
                  {r.created_at && (
                    <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3, flexShrink: 0 }}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── 42.1 Audit readiness score card ── */}
      {totalRuns >= 1 && (() => {
        // 40pts: pass rate
        const passScore = 40 * (runs.filter((r) => r.overall_effective).length / runs.length);
        // 20pts: period sufficiency — avg fraction of datasets meeting IAS 39 ≥8
        const suffCount = datasets.filter((ds) => ds.period_count >= 8).length;
        const suffScore = datasets.length > 0 ? 20 * (suffCount / datasets.length) : 0;
        // 20pts: recency — fraction of datasets with a run within 30 days
        const recentDs = datasets.filter((ds) => {
          const last = runs.filter((r) => r.dataset_id === ds.id && r.created_at)
            .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
          if (!last?.created_at) return false;
          return (Date.now() - new Date(last.created_at).getTime()) < 30 * 86400000;
        }).length;
        const recencyScore = datasets.length > 0 ? 20 * (recentDs / datasets.length) : 0;
        // 20pts: regression coverage — fraction of runs with R² data
        const r2Count = runs.filter((r) => r.regression_r_squared != null).length;
        const r2Score = runs.length > 0 ? 20 * (r2Count / runs.length) : 0;
        const total = Math.round(passScore + suffScore + recencyScore + r2Score);
        const grade = total >= 90 ? "A" : total >= 75 ? "B" : total >= 60 ? "C" : total >= 40 ? "D" : "F";
        const gradeColor = total >= 90 ? HEX.green : total >= 75 ? HEX.cyan : total >= 60 ? HEX.amber : HEX.red;
        const gradeBg = total >= 90 ? HEX.greenBg : total >= 75 ? "rgba(6,182,212,0.10)" : total >= 60 ? "rgba(217,119,6,0.10)" : HEX.redBg;
        const gradeBorder = total >= 90 ? HEX.greenBorder : total >= 75 ? "rgba(6,182,212,0.30)" : total >= 60 ? "rgba(217,119,6,0.30)" : HEX.redBorder;
        const breakdown = [
          { label: "Pass Rate",   score: Math.round(passScore),    max: 40 },
          { label: "Sufficiency", score: Math.round(suffScore),    max: 20 },
          { label: "Recency",     score: Math.round(recencyScore), max: 20 },
          { label: "Regression",  score: Math.round(r2Score),      max: 20 },
        ];
        return (
          <div style={{ borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, padding: "14px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                background: gradeBg, border: `2px solid ${gradeBorder}`, flexShrink: 0 }}>
                <span style={{ fontFamily: S.mono, fontSize: 20, fontWeight: 900, color: gradeColor, lineHeight: 1 }}>{grade}</span>
              </div>
              <div>
                <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>AUDIT READINESS</div>
                <div style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 800, color: gradeColor, lineHeight: 1.1 }}>{total}<span style={{ fontSize: 12, color: S.text3, fontWeight: 500 }}>/100</span></div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 8 }}>
              {breakdown.map((b) => (
                <div key={b.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontFamily: S.mono, fontSize: 9, color: S.text3 }}>{b.label.toUpperCase()}</span>
                    <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: b.score === b.max ? HEX.green : S.text2 }}>{b.score}/{b.max}</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: S.sub }}>
                    <div style={{ height: "100%", width: `${(b.score / b.max) * 100}%`, borderRadius: 2,
                      background: b.score === b.max ? HEX.green : b.score >= b.max * 0.5 ? HEX.cyan : HEX.amber, transition: "width 0.3s" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── 38.1 Top performers panel ── */}
      {(() => {
        const dsGroups = datasets.map((ds) => {
          const dsRuns = runs.filter((r) => r.dataset_id === ds.id);
          if (dsRuns.length < 2) return null;
          const effCount = dsRuns.filter((r) => r.overall_effective).length;
          const passRate = Math.round((effCount / dsRuns.length) * 100);
          const doRatios = dsRuns.map((r) => r.dollar_offset_ratio).filter((v): v is number => v != null);
          const avgDo = doRatios.length > 0 ? doRatios.reduce((s, v) => s + v, 0) / doRatios.length : null;
          return { name: ds.name, pair: ds.currency_pair, passRate, total: dsRuns.length, effCount, avgDo };
        }).filter((d): d is NonNullable<typeof d> => d !== null)
          .sort((a, b) => b.passRate - a.passRate || b.total - a.total)
          .slice(0, 3);
        if (dsGroups.length === 0) return null;
        return (
          <div style={{
            gridColumn: "1 / -1", padding: "12px 20px", borderRadius: 6,
            background: S.panel, border: `1px solid ${S.rim}`,
          }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 10 }}>
              TOP PERFORMING DATASETS
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {dsGroups.map((d, i) => {
                const medalColor = i === 0 ? "#F59E0B" : i === 1 ? HEX.text3 : "#92400E";
                const passColor = d.passRate >= 80 ? HEX.green : d.passRate >= 60 ? HEX.amber : HEX.red;
                return (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontFamily: S.mono, fontSize: 11, fontWeight: 800, color: medalColor,
                      width: 20, textAlign: "center", flexShrink: 0,
                    }}>#{i + 1}</span>
                    <span style={{ fontFamily: S.ui, fontSize: 12, fontWeight: 600, color: S.text1, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.name}
                    </span>
                    {d.pair && <span style={{ fontFamily: S.mono, fontSize: 11, color: HEX.cyan, flexShrink: 0 }}>{d.pair}</span>}
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: S.rim, overflow: "hidden", maxWidth: 160 }}>
                      <div style={{ width: `${d.passRate}%`, height: "100%", borderRadius: 2, background: passColor, transition: "width 0.4s" }} />
                    </div>
                    <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 800, color: passColor, minWidth: 38, textAlign: "right" }}>{d.passRate}%</span>
                    <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3, minWidth: 48 }}>
                      {d.effCount}/{d.total} runs
                    </span>
                    {d.avgDo != null && (
                      <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>
                        D.O. {d.avgDo.toFixed(4)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── 43.1 Hedge type distribution card ── */}
      {totalRuns >= 1 && (() => {
        // Map run → dataset hedge_type
        const dsHedgeType: Record<string, string> = {};
        datasets.forEach((ds) => { dsHedgeType[ds.id] = ds.hedge_type; });
        const typeGroups = runs.reduce<Record<string, { total: number; effective: number }>>((acc, r) => {
          const ht = (dsHedgeType[r.dataset_id] ?? "UNKNOWN").replace(/_/g, " ");
          if (!acc[ht]) acc[ht] = { total: 0, effective: 0 };
          acc[ht].total++;
          if (r.overall_effective) acc[ht].effective++;
          return acc;
        }, {});
        const entries = Object.entries(typeGroups).sort((a, b) => b[1].total - a[1].total);
        if (entries.length === 0) return null;
        const typeColors: Record<string, string> = {
          "CASH FLOW": HEX.cyan,
          "FAIR VALUE": HEX.amber,
          "NET INVESTMENT": "#A78BFA",
        };
        return (
          <div style={{ borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, padding: "14px 20px" }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 10 }}>
              BY HEDGE TYPE
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {entries.map(([type, stats]) => {
                const pct = Math.round((stats.effective / stats.total) * 100);
                const color = typeColors[type] ?? S.text2;
                return (
                  <div key={type}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />
                        <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: S.text2 }}>{type}</span>
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>{stats.total} run{stats.total !== 1 ? "s" : ""}</span>
                        <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: pct === 100 ? HEX.green : pct >= 50 ? HEX.amber : HEX.red }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: S.sub, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, opacity: 0.8, borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── 49.1 Top performer highlight card ── */}
      {datasets.length >= 1 && totalRuns >= 1 && (() => {
        type PerfRow = { ds: typeof datasets[0]; passRate: number; avgDo: number | null; runCount: number };
        const rows: PerfRow[] = datasets
          .map((ds) => {
            const dsRuns = runs.filter((r) => r.dataset_id === ds.id);
            if (dsRuns.length === 0) return null;
            const passRate = dsRuns.filter((r) => r.overall_effective).length / dsRuns.length;
            const doVals = dsRuns.map((r) => r.dollar_offset_ratio).filter((v): v is number => v != null);
            const avgDo = doVals.length > 0 ? doVals.reduce((s, v) => s + v, 0) / doVals.length : null;
            return { ds, passRate, avgDo, runCount: dsRuns.length };
          })
          .filter((r): r is PerfRow => r !== null);
        if (rows.length === 0) return null;
        // Score: passRate 70% + D.O. proximity to 1.0 (30%)
        const scored = rows.map((r) => ({
          ...r,
          score: r.passRate * 0.7 + (r.avgDo != null ? Math.max(0, 1 - Math.abs(r.avgDo - 1.0) / 0.25) * 0.3 : 0),
        })).sort((a, b) => b.score - a.score);
        const top = scored[0];
        return (
          <div style={{ borderRadius: 6, background: HEX.greenBg, border: `1px solid ${HEX.greenBorder}`, padding: "14px 20px" }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: HEX.green, letterSpacing: "0.14em", marginBottom: 8 }}>
              TOP PERFORMER
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontFamily: S.ui, fontSize: 13, fontWeight: 700, color: S.text1, flex: 1, minWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {top.ds.name}
              </span>
              {top.ds.currency_pair && (
                <span style={{ fontFamily: S.mono, fontSize: 12, color: HEX.cyan }}>{top.ds.currency_pair}</span>
              )}
              <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: HEX.green }}>
                {Math.round(top.passRate * 100)}% PASS
              </span>
              {top.avgDo != null && (
                <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text2 }}>
                  AVG D.O. {top.avgDo.toFixed(4)}
                </span>
              )}
              <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>{top.runCount} {top.runCount === 1 ? "RUN" : "RUNS"}</span>
            </div>
          </div>
        );
      })()}

      {/* ── 52.1 Worst performer card ── */}
      {datasets.length >= 2 && totalRuns >= 2 && (() => {
        type PerfRow = { ds: typeof datasets[0]; passRate: number; avgDo: number | null; runCount: number; score: number };
        const rows: PerfRow[] = datasets
          .map((ds) => {
            const dsRuns = runs.filter((r) => r.dataset_id === ds.id);
            if (dsRuns.length === 0) return null;
            const passRate = dsRuns.filter((r) => r.overall_effective).length / dsRuns.length;
            const doVals = dsRuns.map((r) => r.dollar_offset_ratio).filter((v): v is number => v != null);
            const avgDo = doVals.length > 0 ? doVals.reduce((s, v) => s + v, 0) / doVals.length : null;
            const score = passRate * 0.7 + (avgDo != null ? Math.max(0, 1 - Math.abs(avgDo - 1.0) / 0.25) * 0.3 : 0);
            return { ds, passRate, avgDo, runCount: dsRuns.length, score };
          })
          .filter((r): r is PerfRow => r !== null);
        if (rows.length < 2) return null;
        const worst = [...rows].sort((a, b) => a.score - b.score)[0];
        const failRate = Math.round((1 - worst.passRate) * 100);
        return (
          <div style={{ borderRadius: 6, background: HEX.redBg, border: `1px solid ${HEX.redBorder}`, padding: "14px 20px" }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: HEX.red, letterSpacing: "0.14em", marginBottom: 8 }}>
              NEEDS IMPROVEMENT
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontFamily: S.ui, fontSize: 13, fontWeight: 700, color: S.text1, flex: 1, minWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {worst.ds.name}
              </span>
              {worst.ds.currency_pair && (
                <span style={{ fontFamily: S.mono, fontSize: 12, color: HEX.cyan }}>{worst.ds.currency_pair}</span>
              )}
              <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: HEX.red }}>
                {failRate}% FAIL
              </span>
              {worst.avgDo != null && (
                <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text2 }}>
                  AVG D.O. {worst.avgDo.toFixed(4)}
                </span>
              )}
              <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>{worst.runCount} {worst.runCount === 1 ? "RUN" : "RUNS"}</span>
            </div>
          </div>
        );
      })()}

      {/* ── 48.1 D.O. ratio distribution histogram ── */}
      {totalRuns >= 1 && (() => {
        const BANDS = [
          { label: "< 0.80", min: -Infinity, max: 0.80, color: HEX.red, bg: HEX.redBg, border: HEX.redBorder },
          { label: "0.80–0.94", min: 0.80, max: 0.95, color: HEX.amber, bg: "rgba(217,119,6,0.10)", border: "rgba(217,119,6,0.30)" },
          { label: "0.95–1.05", min: 0.95, max: 1.05, color: HEX.green, bg: HEX.greenBg, border: HEX.greenBorder },
          { label: "1.05–1.25", min: 1.05, max: 1.25, color: HEX.amber, bg: "rgba(217,119,6,0.10)", border: "rgba(217,119,6,0.30)" },
          { label: "> 1.25", min: 1.25, max: Infinity, color: HEX.red, bg: HEX.redBg, border: HEX.redBorder },
        ] as const;
        const doRuns = runs.filter((r) => r.dollar_offset_ratio != null);
        if (doRuns.length === 0) return null;
        const counts = BANDS.map((b) => doRuns.filter((r) => (r.dollar_offset_ratio as number) >= b.min && (r.dollar_offset_ratio as number) < b.max).length);
        const maxCount = Math.max(...counts, 1);
        return (
          <div style={{ borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, padding: "14px 20px" }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 12 }}>
              D.O. RATIO DISTRIBUTION
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 60 }}>
              {BANDS.map((b, i) => {
                const h = counts[i] === 0 ? 4 : Math.max(8, Math.round((counts[i] / maxCount) * 52));
                return (
                  <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: b.color }}>{counts[i]}</span>
                    <div style={{ width: "100%", height: h, borderRadius: 2, background: counts[i] === 0 ? S.sub : b.bg, border: `1px solid ${counts[i] === 0 ? S.rim : b.border}` }} />
                    <span style={{ fontFamily: S.mono, fontSize: 8, color: S.text3, textAlign: "center", letterSpacing: "0.03em", lineHeight: 1.2 }}>{b.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── 45.1 Standard coverage matrix ── */}
      {datasets.length >= 1 && (() => {
        const STDS = ["IAS_39", "IFRS_9", "ASC_815"] as const;
        // For each dataset × standard: has at least one run?
        const matrix = datasets.map((ds) => {
          const dsRuns = runs.filter((r) => r.dataset_id === ds.id);
          return {
            name: ds.name.length > 20 ? ds.name.slice(0, 18) + "…" : ds.name,
            coverage: STDS.map((std) => ({
              std,
              tested: dsRuns.some((r) => r.standard === std),
              passed: dsRuns.filter((r) => r.standard === std).every((r) => r.overall_effective) && dsRuns.some((r) => r.standard === std),
            })),
          };
        });
        return (
          <div style={{ borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, padding: "14px 20px" }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 10 }}>
              STANDARD COVERAGE MATRIX
            </div>
            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: `1fr repeat(${STDS.length}, 72px)`, gap: 4, marginBottom: 6 }}>
              <span />
              {STDS.map((std) => (
                <span key={std} style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: S.text3, letterSpacing: "0.10em", textAlign: "center" }}>
                  {std.replace("_", " ")}
                </span>
              ))}
            </div>
            {matrix.map((row) => (
              <div key={row.name} style={{ display: "grid", gridTemplateColumns: `1fr repeat(${STDS.length}, 72px)`, gap: 4, marginBottom: 4, alignItems: "center" }}>
                <span style={{ fontFamily: S.ui, fontSize: 11, color: S.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</span>
                {row.coverage.map(({ std, tested, passed }) => (
                  <span key={std} style={{
                    fontFamily: S.mono, fontSize: 9, fontWeight: 700, textAlign: "center",
                    padding: "2px 4px", borderRadius: 2,
                    background: !tested ? S.sub : passed ? HEX.greenBg : HEX.redBg,
                    color: !tested ? S.text3 : passed ? HEX.green : HEX.red,
                    border: `1px solid ${!tested ? S.rim : passed ? HEX.greenBorder : HEX.redBorder}`,
                  }}>
                    {!tested ? "—" : passed ? "PASS" : "FAIL"}
                  </span>
                ))}
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── 46.1 Datasets needing attention panel ── */}
      {datasets.length >= 1 && (() => {
        const NOW = Date.now();
        const STALE_DAYS = 14;
        const atRisk = datasets.filter((ds) => {
          const dsRuns = runs.filter((r) => r.dataset_id === ds.id && r.created_at);
          if (dsRuns.length === 0) return true; // never tested
          const lastRun = [...dsRuns].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
          const daysSince = Math.floor((NOW - new Date(lastRun.created_at as string).getTime()) / 86400000);
          const lastIneffective = !lastRun.overall_effective;
          return daysSince > STALE_DAYS || lastIneffective;
        });
        if (atRisk.length === 0) return (
          <div style={{ borderRadius: 6, background: HEX.greenBg, border: `1px solid ${HEX.greenBorder}`, padding: "12px 20px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14 }}>✓</span>
            <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: HEX.green, letterSpacing: "0.06em" }}>ALL DATASETS CURRENT — no attention needed</span>
          </div>
        );
        return (
          <div style={{ borderRadius: 6, background: S.panel, border: `1px solid ${HEX.redBorder}`, padding: "14px 20px" }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: HEX.red, letterSpacing: "0.14em", marginBottom: 10 }}>
              NEEDS ATTENTION ({atRisk.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {atRisk.map((ds) => {
                const dsRuns = runs.filter((r) => r.dataset_id === ds.id && r.created_at);
                const reason = dsRuns.length === 0
                  ? "No assessments run"
                  : !dsRuns.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0].overall_effective
                  ? "Last assessment ineffective"
                  : `Last assessed ${Math.floor((NOW - new Date((dsRuns.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0].created_at as string)).getTime()) / 86400000)}d ago`;
                return (
                  <div key={ds.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: S.ui, fontSize: 12, color: S.text1, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ds.name}</span>
                    <span style={{ fontFamily: S.mono, fontSize: 10, color: HEX.amber }}>{reason}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── 55.1 Portfolio latency card ── */}
      {datasets.length >= 1 && (() => {
        const NOW = Date.now();
        const daysSinceArr: number[] = datasets
          .map((ds) => {
            const dsRuns = runs.filter((r) => r.dataset_id === ds.id && r.created_at);
            if (dsRuns.length === 0) return null;
            const lastDate = dsRuns.reduce((m, r) => (r.created_at ?? "") > m ? (r.created_at ?? "") : m, "");
            return Math.floor((NOW - new Date(lastDate).getTime()) / 86400000);
          })
          .filter((d): d is number => d !== null);
        if (daysSinceArr.length === 0) return null;
        const avg = Math.round(daysSinceArr.reduce((s, v) => s + v, 0) / daysSinceArr.length);
        const sorted = [...daysSinceArr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
        const unassessed = datasets.length - daysSinceArr.length;
        const avgColor = avg <= 7 ? HEX.green : avg <= 30 ? HEX.amber : HEX.red;
        const medColor = median <= 7 ? HEX.green : median <= 30 ? HEX.amber : HEX.red;
        return (
          <div style={{ borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, padding: "14px 20px" }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 10 }}>
              PORTFOLIO ASSESSMENT LATENCY
            </div>
            <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: S.mono, fontSize: 9, color: S.text3, letterSpacing: "0.10em", marginBottom: 4 }}>AVG DAYS SINCE</div>
                <div style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 800, color: avgColor, lineHeight: 1 }}>{avg}</div>
                <div style={{ fontFamily: S.mono, fontSize: 9, color: S.text3, marginTop: 2 }}>days</div>
              </div>
              <div style={{ width: 1, height: 40, background: S.rim }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: S.mono, fontSize: 9, color: S.text3, letterSpacing: "0.10em", marginBottom: 4 }}>MEDIAN DAYS SINCE</div>
                <div style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 800, color: medColor, lineHeight: 1 }}>{median}</div>
                <div style={{ fontFamily: S.mono, fontSize: 9, color: S.text3, marginTop: 2 }}>days</div>
              </div>
              {unassessed > 0 && (
                <>
                  <div style={{ width: 1, height: 40, background: S.rim }} />
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: S.mono, fontSize: 9, color: S.text3, letterSpacing: "0.10em", marginBottom: 4 }}>UNASSESSED</div>
                    <div style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 800, color: HEX.amber, lineHeight: 1 }}>{unassessed}</div>
                    <div style={{ fontFamily: S.mono, fontSize: 9, color: S.text3, marginTop: 2 }}>datasets</div>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── 47.1 Month-over-month comparison card ── */}
      {totalRuns >= 1 && (() => {
        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
        const thisMonthRuns = runs.filter((r) => {
          if (!r.created_at) return false;
          const d = new Date(r.created_at);
          return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
        });
        const lastMonthRuns = runs.filter((r) => {
          if (!r.created_at) return false;
          const d = new Date(r.created_at);
          return d.getMonth() === lastMonthDate.getMonth() && d.getFullYear() === lastMonthDate.getFullYear();
        });
        const delta = thisMonthRuns.length - lastMonthRuns.length;
        const thisPass = thisMonthRuns.filter((r) => r.overall_effective).length;
        const lastPass = lastMonthRuns.filter((r) => r.overall_effective).length;
        const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
        return (
          <div style={{ borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, padding: "14px 20px" }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 10 }}>
              MONTH-OVER-MONTH
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: S.mono, fontSize: 9, color: S.text3, letterSpacing: "0.10em", marginBottom: 4 }}>{MONTHS[lastMonthDate.getMonth()]}</div>
                <div style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 700, color: S.text2, lineHeight: 1 }}>{lastMonthRuns.length}</div>
                <div style={{ fontFamily: S.mono, fontSize: 10, color: S.text3, marginTop: 2 }}>{lastPass} pass</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <span style={{
                  fontFamily: S.mono, fontSize: 12, fontWeight: 700,
                  color: delta > 0 ? HEX.green : delta < 0 ? HEX.red : S.text3,
                  padding: "4px 8px", borderRadius: 3,
                  background: delta > 0 ? HEX.greenBg : delta < 0 ? HEX.redBg : S.sub,
                  border: `1px solid ${delta > 0 ? HEX.greenBorder : delta < 0 ? HEX.redBorder : S.rim}`,
                }}>
                  {delta > 0 ? `↑ +${delta}` : delta < 0 ? `↓ ${delta}` : "= SAME"}
                </span>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: S.mono, fontSize: 9, color: HEX.cyan, letterSpacing: "0.10em", marginBottom: 4 }}>{MONTHS[thisMonth]} ◂ NOW</div>
                <div style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 700, color: S.text1, lineHeight: 1 }}>{thisMonthRuns.length}</div>
                <div style={{ fontFamily: S.mono, fontSize: 10, color: S.text3, marginTop: 2 }}>{thisPass} pass</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 44.1 Current pass streak card ── */}
      {totalRuns >= 1 && (() => {
        const sorted = [...runs]
          .filter((r) => r.created_at)
          .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
        let streak = 0;
        for (const r of sorted) {
          if (r.overall_effective) streak++;
          else break;
        }
        const pct = Math.round((streak / sorted.length) * 100);
        const color = streak === 0 ? HEX.red : streak >= sorted.length ? HEX.green : HEX.amber;
        const bg = streak === 0 ? HEX.redBg : streak >= sorted.length ? HEX.greenBg : "rgba(217,119,6,0.10)";
        const border = streak === 0 ? HEX.redBorder : streak >= sorted.length ? HEX.greenBorder : "rgba(217,119,6,0.30)";
        return (
          <div style={{ borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, padding: "14px 20px" }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 10 }}>
              CURRENT PASS STREAK
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{
                fontFamily: S.mono, fontSize: 28, fontWeight: 700, color,
                lineHeight: 1,
              }}>{streak}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: S.mono, fontSize: 11, color: S.text2, marginBottom: 6 }}>
                  {streak === 0
                    ? "No consecutive effective assessments"
                    : streak >= sorted.length
                    ? `All ${streak} run${streak !== 1 ? "s" : ""} effective — perfect record`
                    : `${streak} of ${sorted.length} most recent run${sorted.length !== 1 ? "s" : ""} effective`}
                </div>
                <div style={{ height: 4, borderRadius: 2, background: S.sub, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
                </div>
              </div>
              <span style={{
                fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                padding: "3px 8px", borderRadius: 3, background: bg, color, border: `1px solid ${border}`,
              }}>
                {streak === 0 ? "BROKEN" : streak >= sorted.length ? "PERFECT" : `${pct}%`}
              </span>
            </div>
          </div>
        );
      })()}

      {/* ── 53.1 Pass rate trend indicator ── */}
      {totalRuns >= 4 && (() => {
        const dated = runs
          .filter((r) => r.created_at)
          .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
        const half = Math.floor(dated.length / 2);
        const older = dated.slice(0, half);
        const newer = dated.slice(half);
        const olderRate = older.filter((r) => r.overall_effective).length / older.length;
        const newerRate = newer.filter((r) => r.overall_effective).length / newer.length;
        const delta = newerRate - olderRate;
        const THRESHOLD = 0.05; // 5 pp to count as a trend
        const trend = delta > THRESHOLD ? "IMPROVING" : delta < -THRESHOLD ? "DECLINING" : "STABLE";
        const trendColor = trend === "IMPROVING" ? HEX.green : trend === "DECLINING" ? HEX.red : HEX.cyan;
        const trendBg = trend === "IMPROVING" ? HEX.greenBg : trend === "DECLINING" ? HEX.redBg : "rgba(6,182,212,0.07)";
        const trendBorder = trend === "IMPROVING" ? HEX.greenBorder : trend === "DECLINING" ? HEX.redBorder : "rgba(6,182,212,0.25)";
        const trendIcon = trend === "IMPROVING" ? "↗" : trend === "DECLINING" ? "↘" : "→";
        return (
          <div style={{ borderRadius: 6, background: trendBg, border: `1px solid ${trendBorder}`, padding: "12px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 4 }}>
                  PASS RATE TREND
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: S.mono, fontSize: 20, fontWeight: 800, color: trendColor, lineHeight: 1 }}>
                    {trendIcon} {trend}
                  </span>
                  <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>
                    {delta > 0 ? "+" : ""}{Math.round(delta * 100)} pp
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: S.mono, fontSize: 9, color: S.text3, letterSpacing: "0.08em", marginBottom: 3 }}>OLDER HALF</div>
                  <div style={{ fontFamily: S.mono, fontSize: 16, fontWeight: 700, color: S.text2 }}>
                    {Math.round(olderRate * 100)}%
                  </div>
                  <div style={{ fontFamily: S.mono, fontSize: 9, color: S.text3 }}>{older.length} runs</div>
                </div>
                <div style={{ width: 1, height: 36, background: trendBorder }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: S.mono, fontSize: 9, color: trendColor, letterSpacing: "0.08em", marginBottom: 3 }}>NEWER HALF</div>
                  <div style={{ fontFamily: S.mono, fontSize: 16, fontWeight: 700, color: trendColor }}>
                    {Math.round(newerRate * 100)}%
                  </div>
                  <div style={{ fontFamily: S.mono, fontSize: 9, color: S.text3 }}>{newer.length} runs</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 50.1 Assessment calendar heatmap (12-week rolling) ── */}
      {totalRuns >= 1 && (() => {
        const NOW = Date.now();
        const DAY = 86400000;
        const WEEK_COUNT = 12;
        const DAY_COUNT = WEEK_COUNT * 7;
        // Build a map: dateStr (YYYY-MM-DD) -> { total, passed }
        const dayMap = new Map<string, { total: number; passed: number }>();
        for (const r of runs) {
          if (!r.created_at) continue;
          const d = new Date(r.created_at);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const cur = dayMap.get(key) ?? { total: 0, passed: 0 };
          cur.total += 1;
          if (r.overall_effective) cur.passed += 1;
          dayMap.set(key, cur);
        }
        // Build 12×7 grid anchored to today (column = week, row = day-of-week)
        // today = rightmost column's last row
        const todayMs = new Date(new Date().toDateString()).getTime(); // midnight local
        // cols: 0=oldest week, WEEK_COUNT-1=current week
        // rows: 0=Sun … 6=Sat
        const todayDow = new Date(todayMs).getDay(); // 0=Sun
        // last cell index in the grid = WEEK_COUNT*7 - 1 - (6 - todayDow)
        // cell i = todayMs - (lastCellIdx - i) * DAY
        const lastCellIdx = WEEK_COUNT * 7 - 1 - (6 - todayDow);
        const cells: Array<{ date: Date; key: string; total: number; passed: number; isFuture: boolean }> = [];
        for (let i = 0; i < WEEK_COUNT * 7; i++) {
          const offset = i - lastCellIdx;
          const ms = todayMs + offset * DAY;
          const d = new Date(ms);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const entry = dayMap.get(key) ?? { total: 0, passed: 0 };
          cells.push({ date: d, key, total: entry.total, passed: entry.passed, isFuture: ms > todayMs });
        }
        const maxInDay = Math.max(...cells.map((c) => c.total), 1);
        const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
        const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        // Month labels: show month name at first cell of each month
        const monthLabels: Array<{ col: number; label: string }> = [];
        for (let col = 0; col < WEEK_COUNT; col++) {
          const firstRowCell = cells[col * 7];
          if (firstRowCell) {
            const prevColCell = col > 0 ? cells[(col - 1) * 7] : null;
            if (!prevColCell || prevColCell.date.getMonth() !== firstRowCell.date.getMonth()) {
              monthLabels.push({ col, label: MONTHS[firstRowCell.date.getMonth()] });
            }
          }
        }
        const cellColor = (c: typeof cells[0]) => {
          if (c.isFuture) return "transparent";
          if (c.total === 0) return S.sub;
          const passRate = c.passed / c.total;
          const intensity = Math.max(0.25, c.total / maxInDay);
          if (passRate === 1) return `rgba(34,197,94,${(0.25 + intensity * 0.65).toFixed(2)})`;
          if (passRate === 0) return `rgba(239,68,68,${(0.25 + intensity * 0.65).toFixed(2)})`;
          return `rgba(217,119,6,${(0.25 + intensity * 0.65).toFixed(2)})`;
        };
        const cellBorder = (c: typeof cells[0]) => {
          if (c.isFuture || c.total === 0) return S.rim;
          const passRate = c.passed / c.total;
          if (passRate === 1) return HEX.greenBorder;
          if (passRate === 0) return HEX.redBorder;
          return "rgba(217,119,6,0.30)";
        };
        return (
          <div style={{ borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, padding: "14px 20px" }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 10 }}>
              ASSESSMENT CALENDAR — LAST {WEEK_COUNT} WEEKS
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {/* Day-of-week labels */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 16 }}>
                {DOW_LABELS.map((d, i) => (
                  <div key={i} style={{ height: 11, fontFamily: S.mono, fontSize: 8, color: i % 2 === 1 ? S.text3 : "transparent", lineHeight: "11px", textAlign: "right", minWidth: 8 }}>{d}</div>
                ))}
              </div>
              {/* Grid */}
              <div style={{ flex: 1, overflowX: "auto" }}>
                {/* Month labels row */}
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${WEEK_COUNT}, 1fr)`, gap: 2, marginBottom: 2 }}>
                  {Array.from({ length: WEEK_COUNT }, (_, col) => {
                    const lbl = monthLabels.find((m) => m.col === col);
                    return (
                      <div key={col} style={{ fontFamily: S.mono, fontSize: 8, color: S.text3, whiteSpace: "nowrap", overflow: "hidden" }}>
                        {lbl ? lbl.label : ""}
                      </div>
                    );
                  })}
                </div>
                {/* Day cells: 7 rows × WEEK_COUNT cols */}
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${WEEK_COUNT}, 1fr)`, gridTemplateRows: "repeat(7, 11px)", gap: 2 }}>
                  {cells.map((c, i) => {
                    const col = Math.floor(i / 7);
                    const row = i % 7;
                    const title = c.isFuture ? "" : c.total === 0
                      ? `${c.key}: no assessments`
                      : `${c.key}: ${c.total} run${c.total !== 1 ? "s" : ""}, ${c.passed} passed`;
                    return (
                      <div
                        key={c.key + i}
                        title={title}
                        style={{
                          gridColumn: col + 1,
                          gridRow: row + 1,
                          borderRadius: 2,
                          background: cellColor(c),
                          border: `1px solid ${cellBorder(c)}`,
                          cursor: c.total > 0 ? "default" : "default",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
            {/* Legend */}
            <div style={{ display: "flex", gap: 16, marginTop: 8, alignItems: "center" }}>
              <span style={{ fontFamily: S.mono, fontSize: 9, color: S.text3 }}>LEGEND:</span>
              {[
                { bg: S.sub, border: S.rim, label: "No runs" },
                { bg: `rgba(34,197,94,0.60)`, border: HEX.greenBorder, label: "All pass" },
                { bg: `rgba(217,119,6,0.60)`, border: "rgba(217,119,6,0.30)", label: "Mixed" },
                { bg: `rgba(239,68,68,0.60)`, border: HEX.redBorder, label: "All fail" },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: item.bg, border: `1px solid ${item.border}` }} />
                  <span style={{ fontFamily: S.mono, fontSize: 9, color: S.text3 }}>{item.label}</span>
                </div>
              ))}
              <span style={{ fontFamily: S.mono, fontSize: 9, color: S.text3, marginLeft: "auto" }}>
                Darker = more runs
              </span>
            </div>
          </div>
        );
      })()}

      {/* ── 54.1 Standard coverage gap card ── */}
      {datasets.length >= 1 && (() => {
        const STDS = [
          { key: "IAS_39", label: "IAS 39" },
          { key: "IFRS_9", label: "IFRS 9" },
          { key: "ASC_815", label: "ASC 815" },
        ] as const;
        return (
          <div style={{ borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, padding: "14px 20px" }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 10 }}>
              COVERAGE GAP BY STANDARD
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12 }}>
              {STDS.map(({ key, label }) => {
                const tested = datasets.filter((ds) => runs.some((r) => r.dataset_id === ds.id && r.standard === key)).length;
                const untested = datasets.length - tested;
                const pct = datasets.length > 0 ? Math.round((tested / datasets.length) * 100) : 0;
                const color = pct === 100 ? HEX.green : pct >= 50 ? HEX.amber : HEX.red;
                const bg = pct === 100 ? HEX.greenBg : pct >= 50 ? "rgba(217,119,6,0.08)" : HEX.redBg;
                const border = pct === 100 ? HEX.greenBorder : pct >= 50 ? "rgba(217,119,6,0.25)" : HEX.redBorder;
                return (
                  <div key={key} style={{ borderRadius: 4, background: bg, border: `1px solid ${border}`, padding: "10px 14px" }}>
                    <div style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color, letterSpacing: "0.12em", marginBottom: 6 }}>{label}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontFamily: S.mono, fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{tested}</span>
                      <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>/ {datasets.length}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: S.sub, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                    <div style={{ fontFamily: S.mono, fontSize: 9, color: S.text3 }}>
                      {untested > 0 ? `${untested} untested` : "full coverage"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── 51.1 Year-to-date summary card ── */}
      {totalRuns >= 1 && (() => {
        const now = new Date();
        const thisYear = now.getFullYear();
        const priorYear = thisYear - 1;
        const ytdRuns = runs.filter((r) => r.created_at && new Date(r.created_at).getFullYear() === thisYear);
        const priorRuns = runs.filter((r) => r.created_at && new Date(r.created_at).getFullYear() === priorYear);
        if (ytdRuns.length === 0 && priorRuns.length === 0) return null;
        const ytdPass = ytdRuns.filter((r) => r.overall_effective).length;
        const priorPass = priorRuns.filter((r) => r.overall_effective).length;
        const ytdDo = ytdRuns.filter((r) => r.dollar_offset_ratio != null);
        const priorDo = priorRuns.filter((r) => r.dollar_offset_ratio != null);
        const ytdAvgDo = ytdDo.length > 0 ? ytdDo.reduce((s, r) => s + (r.dollar_offset_ratio as number), 0) / ytdDo.length : null;
        const priorAvgDo = priorDo.length > 0 ? priorDo.reduce((s, r) => s + (r.dollar_offset_ratio as number), 0) / priorDo.length : null;
        const ytdRate = ytdRuns.length > 0 ? Math.round((ytdPass / ytdRuns.length) * 100) : null;
        const priorRate = priorRuns.length > 0 ? Math.round((priorPass / priorRuns.length) * 100) : null;
        const KPIS = [
          { label: "RUNS", ytd: ytdRuns.length, prior: priorRuns.length, fmt: (v: number) => String(v) },
          { label: "PASS RATE", ytd: ytdRate, prior: priorRate, fmt: (v: number) => `${v}%` },
          { label: "AVG D.O.", ytd: ytdAvgDo, prior: priorAvgDo, fmt: (v: number) => v.toFixed(4) },
        ] as const;
        return (
          <div style={{ borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, padding: "14px 20px" }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 10 }}>
              YEAR-TO-DATE {thisYear}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : `repeat(${KPIS.length}, 1fr)`, gap: 12 }}>
              {KPIS.map((kpi) => {
                const ytdVal = kpi.ytd;
                const priorVal = kpi.prior;
                const delta = ytdVal != null && priorVal != null ? (ytdVal as number) - (priorVal as number) : null;
                const deltaColor = delta == null ? S.text3 : delta > 0 ? HEX.green : delta < 0 ? HEX.red : S.text3;
                return (
                  <div key={kpi.label} style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: S.mono, fontSize: 9, color: S.text3, letterSpacing: "0.10em", marginBottom: 4 }}>{kpi.label}</div>
                    <div style={{ fontFamily: S.mono, fontSize: 20, fontWeight: 700, color: S.text1, lineHeight: 1 }}>
                      {ytdVal != null ? kpi.fmt(ytdVal as number) : "—"}
                    </div>
                    {priorVal != null && (
                      <div style={{ fontFamily: S.mono, fontSize: 10, color: S.text3, marginTop: 3 }}>
                        {priorYear}: {kpi.fmt(priorVal as number)}
                        {delta != null && delta !== 0 && (
                          <span style={{ color: deltaColor, marginLeft: 4 }}>
                            {delta > 0 ? `↑` : `↓`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── 40.1 Regression test coverage card ── */}
      {totalRuns >= 1 && (() => {
        const STANDARDS = ["IAS_39", "IFRS_9", "ASC_815"] as const;
        const rows = STANDARDS.map((std) => {
          const stdRuns = runs.filter((r) => r.standard === std);
          if (stdRuns.length === 0) return null;
          const withR2 = stdRuns.filter((r) => r.regression_r_squared != null).length;
          const doOnly = stdRuns.length - withR2;
          const r2Pct = Math.round((withR2 / stdRuns.length) * 100);
          return { std, total: stdRuns.length, withR2, doOnly, r2Pct };
        }).filter((r): r is NonNullable<typeof r> => r !== null);
        if (rows.length === 0) return null;
        const stdLabels: Record<string, string> = { IAS_39: "IAS 39", IFRS_9: "IFRS 9", ASC_815: "ASC 815" };
        return (
          <div style={{ borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, padding: "14px 20px" }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 10 }}>
              TEST METHOD COVERAGE
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map((row) => (
                <div key={row.std}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: S.text2 }}>{stdLabels[row.std]}</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ fontFamily: S.mono, fontSize: 10, color: HEX.cyan }}>{row.withR2} w/ R²</span>
                      <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>{row.doOnly} D.O. only</span>
                      <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700,
                        color: row.r2Pct >= 50 ? HEX.green : HEX.amber }}>{row.r2Pct}%</span>
                    </div>
                  </div>
                  <div style={{ height: 5, borderRadius: 2, background: S.sub, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${row.r2Pct}%`, background: HEX.cyan, borderRadius: 2, transition: "width 0.3s" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── 36.1 Assessment velocity card ── */}
      {runs.length >= 2 && (() => {
        const now = Date.now();
        const DAY = 86400000;
        const runsLast7  = runs.filter((r) => r.created_at && now - new Date(r.created_at).getTime() < 7  * DAY).length;
        const runsLast30 = runs.filter((r) => r.created_at && now - new Date(r.created_at).getTime() < 30 * DAY).length;
        const runsW1to4  = runs.filter((r) => r.created_at && now - new Date(r.created_at).getTime() < 28 * DAY).length;
        const runsW5to8  = runs.filter((r) => r.created_at && now - new Date(r.created_at).getTime() >= 28 * DAY && now - new Date(r.created_at).getTime() < 56 * DAY).length;
        const weeklyRate = runsLast30 > 0 ? (runsLast30 / 4).toFixed(1) : "0";
        const cadence = runsW1to4 > runsW5to8 + 1 ? "ACCELERATING" : runsW1to4 < runsW5to8 - 1 ? "DECELERATING" : "STABLE";
        const cadenceColor = cadence === "ACCELERATING" ? HEX.green : cadence === "DECELERATING" ? HEX.amber : HEX.cyan;
        return (
          <div style={{
            gridColumn: "1 / -1", padding: "14px 20px", borderRadius: 6,
            background: S.panel, border: `1px solid ${S.rim}`,
            display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
          }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", width: "100%", marginBottom: 2 }}>
              ASSESSMENT VELOCITY
            </div>
            {([
              { label: "LAST 7 DAYS", value: runsLast7, suffix: "runs" },
              { label: "LAST 30 DAYS", value: runsLast30, suffix: "runs" },
              { label: "AVG / WEEK", value: weeklyRate, suffix: "runs" },
            ] as const).map((kpi, i) => (
              <div key={kpi.label} style={{ display: "flex", alignItems: "center", gap: 20 }}>
                {i > 0 && <div style={{ width: 1, height: 36, background: S.rim }} />}
                <div>
                  <div style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: S.text3, letterSpacing: "0.12em", marginBottom: 4 }}>{kpi.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{ fontFamily: S.mono, fontSize: 24, fontWeight: 800, color: Number(kpi.value) > 0 ? S.text1 : S.text3, lineHeight: 1 }}>{kpi.value}</span>
                    <span style={{ fontFamily: S.ui, fontSize: 11, color: S.text3 }}>{kpi.suffix}</span>
                  </div>
                </div>
              </div>
            ))}
            <div style={{ width: 1, height: 36, background: S.rim }} />
            <div>
              <div style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: S.text3, letterSpacing: "0.12em", marginBottom: 6 }}>CADENCE</div>
              <span style={{
                fontFamily: S.mono, fontSize: 11, fontWeight: 800, letterSpacing: "0.08em",
                padding: "3px 10px", borderRadius: 3,
                background: cadence === "ACCELERATING" ? HEX.greenBg : cadence === "DECELERATING" ? "rgba(217,119,6,0.10)" : "rgba(28,98,242,0.07)",
                color: cadenceColor,
                border: `1px solid ${cadence === "ACCELERATING" ? HEX.greenBorder : cadence === "DECELERATING" ? "rgba(217,119,6,0.25)" : "rgba(28,98,242,0.2)"}`,
              }}>{cadence}</span>
            </div>
          </div>
        );
      })()}

      {/* ── 37.1 Compliance scorecard table ── */}
      {totalRuns >= 1 && (() => {
        const STANDARDS = [
          { key: "IAS_39",  label: "IAS 39",  desc: "Dollar Offset 80–125%" },
          { key: "IFRS_9",  label: "IFRS 9",  desc: "Dollar Offset + Regression" },
          { key: "ASC_815", label: "ASC 815", desc: "Dollar Offset 80–125%" },
        ] as const;
        return (
          <div style={{ gridColumn: "1 / -1", borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, overflow: "hidden" }}>
            <div style={{ padding: "10px 20px", borderBottom: `1px solid ${S.rim}` }}>
              <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>COMPLIANCE SCORECARD</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr" }}>
              {STANDARDS.map((std, i) => {
                const stdRuns = runs.filter((r) => r.standard === std.key);
                const lastRun = [...stdRuns].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? null;
                const passRate = stdRuns.length > 0 ? Math.round((stdRuns.filter((r) => r.overall_effective).length / stdRuns.length) * 100) : null;
                const status = stdRuns.length === 0 ? "NOT TESTED" : lastRun?.overall_effective ? "COMPLIANT" : "NON-COMPLIANT";
                const statusColor = status === "COMPLIANT" ? HEX.green : status === "NON-COMPLIANT" ? HEX.red : S.text3;
                const statusBg = status === "COMPLIANT" ? HEX.greenBg : status === "NON-COMPLIANT" ? HEX.redBg : S.sub;
                const statusBorder = status === "COMPLIANT" ? HEX.greenBorder : status === "NON-COMPLIANT" ? HEX.redBorder : S.rim;
                return (
                  <div key={std.key} style={{
                    padding: "14px 20px",
                    borderRight: i < 2 ? `1px solid ${S.rim}` : "none",
                  }}>
                    <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: HEX.cyan, letterSpacing: "0.12em", marginBottom: 3 }}>
                      {std.label}
                    </div>
                    <div style={{ fontFamily: S.ui, fontSize: 10, color: S.text3, marginBottom: 8 }}>{std.desc}</div>
                    <span style={{
                      fontFamily: S.mono, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
                      padding: "2px 8px", borderRadius: 3,
                      background: statusBg, color: statusColor, border: `1px solid ${statusBorder}`,
                    }}>{status}</span>
                    {passRate != null && (
                      <div style={{ marginTop: 8, fontFamily: S.mono, fontSize: 11, color: statusColor, fontWeight: 700 }}>
                        {passRate}% pass rate
                        <span style={{ fontFamily: S.ui, fontSize: 10, fontWeight: 400, color: S.text3, marginLeft: 5 }}>
                          ({stdRuns.length} run{stdRuns.length !== 1 ? "s" : ""})
                        </span>
                      </div>
                    )}
                    {lastRun?.created_at && (
                      <div style={{ marginTop: 4, fontFamily: S.ui, fontSize: 10, color: S.text3 }}>
                        Last: {new Date(lastRun.created_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── 39.1 D.O. ratio band distribution bar ── */}
      {totalRuns >= 1 && (() => {
        const doRuns = runs.filter((r) => r.dollar_offset_ratio != null);
        if (doRuns.length === 0) return null;
        const below = doRuns.filter((r) => (r.dollar_offset_ratio as number) < 0.80).length;
        const inBand = doRuns.filter((r) => (r.dollar_offset_ratio as number) >= 0.80 && (r.dollar_offset_ratio as number) <= 1.25).length;
        const above = doRuns.filter((r) => (r.dollar_offset_ratio as number) > 1.25).length;
        const total = doRuns.length;
        const belowPct = Math.round((below / total) * 100);
        const inPct = Math.round((inBand / total) * 100);
        const abovePct = 100 - belowPct - inPct;
        const segments = [
          { label: "< 0.80", count: below, pct: belowPct, color: HEX.red, bg: HEX.redBg, border: HEX.redBorder },
          { label: "0.80 – 1.25", count: inBand, pct: inPct, color: HEX.green, bg: HEX.greenBg, border: HEX.greenBorder },
          { label: "> 1.25", count: above, pct: abovePct, color: HEX.amber, bg: "rgba(217,119,6,0.10)", border: "rgba(217,119,6,0.30)" },
        ];
        return (
          <div style={{ gridColumn: "1 / -1", borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, padding: "14px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>D.O. RATIO BAND DISTRIBUTION</span>
              <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>{total} RUN{total !== 1 ? "S" : ""} WITH D.O. DATA</span>
            </div>
            {/* Stacked bar */}
            <div style={{ display: "flex", height: 18, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
              {segments.map((seg) => seg.pct > 0 && (
                <div key={seg.label} title={`${seg.label}: ${seg.count} run${seg.count !== 1 ? "s" : ""} (${seg.pct}%)`}
                  style={{ width: `${seg.pct}%`, background: seg.color, opacity: 0.85, transition: "width 0.3s" }} />
              ))}
            </div>
            {/* Legend */}
            <div style={{ display: "flex", gap: 16 }}>
              {segments.map((seg) => (
                <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0, display: "inline-block" }} />
                  <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>{seg.label}</span>
                  <span style={{
                    fontFamily: S.mono, fontSize: 10, fontWeight: 700,
                    padding: "0px 5px", borderRadius: 2,
                    background: seg.bg, color: seg.color, border: `1px solid ${seg.border}`,
                  }}>{seg.pct}%</span>
                  <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>({seg.count})</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── 41.1 Period sufficiency matrix ── */}
      {datasets.length >= 1 && (() => {
        const STANDARDS = [
          { key: "IAS_39",  label: "IAS 39",  min: 8  },
          { key: "ASC_815", label: "ASC 815", min: 8  },
          { key: "IFRS_9",  label: "IFRS 9",  min: 30 },
        ] as const;
        return (
          <div style={{ gridColumn: "1 / -1", borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, overflow: "hidden" }}>
            <div style={{ padding: "10px 20px", borderBottom: `1px solid ${S.rim}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>PERIOD SUFFICIENCY</span>
              <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>IFRS 9 ≥30 · IAS 39 / ASC 815 ≥8</span>
            </div>
            <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
              {datasets.map((ds) => (
                <div key={ds.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: S.ui, fontSize: 12, color: S.text2, minWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ds.name}</span>
                  <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3, minWidth: 60 }}>{ds.period_count} periods</span>
                  <div style={{ display: "flex", gap: 5 }}>
                    {STANDARDS.map((std) => {
                      const ok = ds.period_count >= std.min;
                      return (
                        <span key={std.key} title={`${std.label}: requires ≥${std.min} periods`} style={{
                          fontFamily: S.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                          padding: "1px 6px", borderRadius: 3, cursor: "default",
                          background: ok ? HEX.greenBg : HEX.redBg,
                          color: ok ? HEX.green : HEX.red,
                          border: `1px solid ${ok ? HEX.greenBorder : HEX.redBorder}`,
                        }}>
                          {std.label} {ok ? "✓" : `NEEDS ${std.min - ds.period_count}+`}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Quick start card */}
      <div style={{
        gridColumn: "1 / -1", padding: 28, borderRadius: 6,
        background: S.panel, border: `1px solid ${S.rim}`,
        position: "relative", overflow: "hidden",
      }}>
        {/* Subtle gradient accent */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${HEX.cyan}, ${HEX.green})`,
        }} />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 8, flexShrink: 0,
            background: "rgba(28,98,242,0.06)", border: "1px solid rgba(28,98,242,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={HEX.cyan} strokeWidth="1.5">
              <line x1="12" y1="3" x2="12" y2="21"/><line x1="4" y1="7" x2="20" y2="7"/>
              <path d="M4 7l2 8h0a4 4 0 0 0 4 0h0l2-8"/><path d="M12 7l2 8h0a4 4 0 0 0 4 0h0l2-8"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text1, letterSpacing: "0.08em", marginBottom: 8 }}>
              HEDGE EFFECTIVENESS TESTING
            </div>
            <p style={{ fontFamily: S.ui, fontSize: 13, color: S.text2, lineHeight: 1.7, margin: "0 0 16px" }}>
              Assess whether your hedge relationships meet the quantitative effectiveness thresholds
              required by <strong>IFRS 9</strong>, <strong>ASC 815</strong>, or <strong>IAS 39</strong>.
              Upload period-by-period fair value changes for the hedged item and hedging instrument,
              then run the dollar-offset ratio test and/or regression analysis.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => onSwitchTab("upload")}
                style={{
                  fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                  padding: "10px 24px", borderRadius: 4, cursor: "pointer",
                  background: HEX.cyan, color: "#fff", border: "none",
                  boxShadow: "0 2px 8px rgba(28,98,242,0.2)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 16px rgba(28,98,242,0.3)"}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = "0 2px 8px rgba(28,98,242,0.2)"}
              >
                NEW ASSESSMENT
              </button>
              <button
                onClick={() => onSwitchTab("datasets")}
                style={{
                  fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                  padding: "10px 24px", borderRadius: 4, cursor: "pointer",
                  background: "transparent", color: HEX.cyan,
                  border: `1px solid rgba(28,98,242,0.25)`,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(28,98,242,0.04)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                VIEW DATASETS
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Unassessed datasets alert */}
      {datasets.length > 0 && (() => {
        const unassessed = datasets.filter((d) => !runs.some((r) => r.dataset_id === d.id));
        if (unassessed.length === 0) return null;
        return (
          <div style={{
            gridColumn: "1 / -1", padding: "12px 20px", borderRadius: 6,
            background: "rgba(28,98,242,0.04)", border: `1px solid rgba(28,98,242,0.2)`,
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={HEX.cyan} strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: HEX.cyan, letterSpacing: "0.1em" }}>
              {unassessed.length} DATASET{unassessed.length > 1 ? "S" : ""} NOT YET ASSESSED
            </span>
            <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}>
              {unassessed.slice(0, 4).map((d) => (
                <span key={d.id} style={{
                  fontFamily: S.mono, fontSize: 11, color: S.text2,
                  padding: "2px 8px", borderRadius: 2, background: S.panel, border: `1px solid ${S.rim}`,
                }}>
                  {d.name}{d.currency_pair ? ` · ${d.currency_pair}` : ""}
                </span>
              ))}
              {unassessed.length > 4 && (
                <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>+{unassessed.length - 4} more</span>
              )}
            </div>
            <button
              onClick={() => onSwitchTab("datasets")}
              style={{
                fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                padding: "5px 14px", borderRadius: 3, cursor: "pointer", flexShrink: 0,
                background: HEX.cyan, color: "#fff", border: "none",
                boxShadow: "0 1px 4px rgba(28,98,242,0.2)",
              }}
            >
              ASSESS NOW
            </button>
          </div>
        );
      })()}

      {/* Standards cards */}
      {[
        {
          std: "ASC 815", tag: "US GAAP", color: HEX.cyan,
          desc: "Dollar-offset ratio must fall within the 0.80 \u2014 1.25 effectiveness band. Primary method for US-listed entities.",
          method: "Dollar-Offset Ratio Test",
        },
        {
          std: "IFRS 9", tag: "INTERNATIONAL", color: HEX.green,
          desc: "Regression analysis: R\u00B2 \u2265 0.80 and slope \u03B2 \u2208 [-1.25, -0.80]. Requires 30+ observation periods.",
          method: "Regression Analysis",
        },
      ].map((s) => (
        <div key={s.std} style={{
          padding: 24, borderRadius: 6, background: S.panel,
          border: `1px solid ${S.rim}`, position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, width: 3, height: "100%",
            background: s.color,
          }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: S.mono, fontSize: 15, fontWeight: 800, color: S.text1, letterSpacing: "0.04em" }}>{s.std}</span>
            <span style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em",
              padding: "2px 8px", borderRadius: 2, background: S.sub, color: S.text3,
            }}>
              {s.tag}
            </span>
          </div>
          <p style={{ fontFamily: S.ui, fontSize: 12, color: S.text2, margin: "0 0 10px", lineHeight: 1.6 }}>
            {s.desc}
          </p>
          <div style={{
            fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: s.color,
            letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>
            </svg>
            {s.method}
          </div>
        </div>
      ))}

      {/* Per-standard breakdown */}
      {runs.length > 0 && (() => {
        const standards = Array.from(new Set(runs.map((r) => r.standard))).sort();
        if (standards.length < 2) return null;
        return (
          <div style={{
            gridColumn: "1 / -1", padding: "16px 20px", borderRadius: 6,
            background: S.panel, border: `1px solid ${S.rim}`,
          }}>
            <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 12 }}>
              BY STANDARD
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {standards.map((std) => {
                const stdRuns = runs.filter((r) => r.standard === std);
                const effective = stdRuns.filter((r) => r.overall_effective).length;
                const pct = Math.round((effective / stdRuns.length) * 100);
                return (
                  <div key={std} style={{
                    flex: "1 1 140px", padding: "12px 16px", borderRadius: 4,
                    background: S.sub, border: `1px solid ${S.rim}`,
                  }}>
                    <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text2, letterSpacing: "0.1em", marginBottom: 6 }}>
                      {std.replace("_", " ")}
                    </div>
                    <div style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 800, color: pct >= 80 ? HEX.green : pct >= 60 ? HEX.amber : HEX.red, lineHeight: 1 }}>
                      {pct}%
                    </div>
                    <div style={{ fontFamily: S.mono, fontSize: 11, color: S.text3, marginTop: 4 }}>
                      {effective}/{stdRuns.length} effective
                    </div>
                    {/* Mini bar */}
                    <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: S.rim, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${pct}%`, borderRadius: 2,
                        background: pct >= 80 ? HEX.green : pct >= 60 ? HEX.amber : HEX.red,
                        transition: "width 0.5s",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* D.O. ratio distribution histogram */}
      {runs.length >= 3 && (() => {
        const BINS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
        const labels = BINS.slice(0, -1).map((b, i) => `${b.toFixed(1)}–${BINS[i + 1].toFixed(1)}`);
        const counts = BINS.slice(0, -1).map((lo, i) => {
          const hi = BINS[i + 1];
          return runs.filter((r) => r.dollar_offset_ratio != null && r.dollar_offset_ratio >= lo && r.dollar_offset_ratio < hi).length;
        });
        // Color bars: green for effective band (0.80–1.25), red otherwise
        const colors = BINS.slice(0, -1).map((lo, i) => {
          const hi = BINS[i + 1];
          return (lo >= 0.80 && hi <= 1.30) ? HEX.green : HEX.red;
        });
        const histOption = {
          backgroundColor: "transparent",
          grid: { top: 20, right: 16, bottom: 36, left: 36 },
          xAxis: {
            type: "category", data: labels,
            axisLabel: { color: HEX.text3, fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", rotate: 30 },
            axisLine: { lineStyle: { color: HEX.border } },
            axisTick: { show: false },
          },
          yAxis: {
            type: "value", minInterval: 1,
            axisLabel: { color: HEX.text3, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" },
            splitLine: { lineStyle: { color: HEX.border, type: "dashed" } },
          },
          series: [{
            type: "bar", data: counts.map((c, i) => ({ value: c, itemStyle: { color: colors[i] } })),
            barMaxWidth: 40, barCategoryGap: "10%",
            itemStyle: { borderRadius: [2, 2, 0, 0] },
            markArea: {
              silent: true,
              data: [[
                { xAxis: "0.8–0.9", itemStyle: { color: "rgba(5,150,105,0.07)" } },
                { xAxis: "1.2–1.3" },
              ]],
            },
          }],
          tooltip: {
            trigger: "axis",
            backgroundColor: HEX.bgSub, borderColor: HEX.border,
            textStyle: { color: HEX.text1, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" },
            formatter: (params: Array<{ name: string; value: number }>) =>
              `${params[0].name}<br/>${params[0].value} run${params[0].value !== 1 ? "s" : ""}`,
          },
        };
        return (
          <div style={{ gridColumn: "1 / -1", padding: "16px 20px", borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}` }}>
            <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 4 }}>
              D.O. RATIO DISTRIBUTION
              <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 400, color: S.text3, marginLeft: 12 }}>
                green band = effectiveness zone (0.80–1.25)
              </span>
            </div>
            <ReactECharts option={histOption} style={{ height: 160 }} opts={{ renderer: "canvas" }} />
          </div>
        );
      })()}

      {/* At-risk hedges monitor */}
      {runs.length > 0 && (() => {
        const atRisk = runs.filter((r) => {
          const ratio = r.dollar_offset_ratio;
          if (ratio == null) return false;
          // Approaching boundary: within 5% of the 0.80 or 1.25 limits
          return (ratio > 0.80 && ratio < 0.85) || (ratio > 1.20 && ratio < 1.25);
        });
        if (atRisk.length === 0) return null;
        return (
          <div style={{
            gridColumn: "1 / -1", padding: "16px 20px", borderRadius: 6,
            background: `color-mix(in srgb, ${HEX.amber} 5%, transparent)`,
            border: `1px solid ${HEX.amber}40`,
            borderLeft: `3px solid ${HEX.amber}`,
          }}>
            <div style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: HEX.amber,
              letterSpacing: "0.14em", marginBottom: 10,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              AT-RISK HEDGES — {atRisk.length} approaching effectiveness boundary
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {atRisk.map((r) => (
                <div
                  key={r.run_id}
                  onClick={() => onNavigateRun(r.run_id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                    borderRadius: 4, background: S.panel, border: `1px solid ${S.rim}`,
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = HEX.amber}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = HEX.border}
                >
                  <span style={{ fontFamily: S.ui, fontSize: 12, fontWeight: 600, color: S.text1, flex: 1 }}>
                    {r.dataset_name}
                    {r.currency_pair && <span style={{ fontFamily: S.mono, fontSize: 12, color: HEX.cyan, marginLeft: 6 }}>{r.currency_pair}</span>}
                  </span>
                  <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>{r.standard}</span>
                  <span style={{
                    fontFamily: S.mono, fontSize: 13, fontWeight: 800,
                    color: r.dollar_offset_ratio! < 0.85 ? HEX.amber : HEX.amber,
                  }}>
                    D.O. {r.dollar_offset_ratio!.toFixed(4)}
                  </span>
                  <span style={{
                    fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                    padding: "2px 8px", borderRadius: 2,
                    background: `color-mix(in srgb, ${HEX.amber} 10%, transparent)`,
                    color: HEX.amber,
                  }}>
                    {r.dollar_offset_ratio! < 0.85 ? "NEAR LOWER BOUND" : "NEAR UPPER BOUND"}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={HEX.text3} strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Effectiveness trend chart */}
      {runs.length >= 2 && (() => {
        const sorted = [...runs]
          .filter((r) => r.created_at)
          .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
          .slice(-20);
        const buckets = sorted.reduce<Record<string, { eff: number; ineff: number }>>((acc, r) => {
          const d = new Date(r.created_at!).toLocaleDateString();
          if (!acc[d]) acc[d] = { eff: 0, ineff: 0 };
          if (r.overall_effective) acc[d].eff++; else acc[d].ineff++;
          return acc;
        }, {});
        const dates = Object.keys(buckets);
        const option = {
          backgroundColor: "transparent",
          grid: { top: 12, right: 16, bottom: 24, left: 40 },
          xAxis: {
            type: "category", data: dates,
            axisLabel: { color: HEX.text3, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" },
            axisLine: { lineStyle: { color: HEX.border } },
            axisTick: { show: false },
          },
          yAxis: {
            type: "value", minInterval: 1,
            axisLabel: { color: HEX.text3, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" },
            splitLine: { lineStyle: { color: HEX.border, type: "dashed" } },
          },
          series: [
            {
              name: "Effective", type: "bar", stack: "verdict", barMaxWidth: 32,
              data: dates.map((d) => buckets[d].eff),
              itemStyle: { color: HEX.green, borderRadius: [2, 2, 0, 0] },
            },
            {
              name: "Ineffective", type: "bar", stack: "verdict", barMaxWidth: 32,
              data: dates.map((d) => buckets[d].ineff),
              itemStyle: { color: HEX.red, borderRadius: [2, 2, 0, 0] },
            },
          ],
          tooltip: {
            trigger: "axis", backgroundColor: HEX.bgSub,
            borderColor: HEX.border, textStyle: { color: HEX.text1, fontSize: 12 },
          },
        };
        return (
          <div style={{ gridColumn: "1 / -1", padding: "16px 20px", borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}` }}>
            <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 8 }}>
              EFFECTIVENESS TREND
            </div>
            <ReactECharts option={option} style={{ height: 160 }} opts={{ renderer: "canvas" }} />
          </div>
        );
      })()}

      {/* Last run card */}
      {lastRun && (
        <div
          style={{
            gridColumn: "1 / -1", padding: 24, borderRadius: 6, cursor: "pointer",
            background: S.panel, border: `1px solid ${S.rim}`,
            transition: "all 0.2s", position: "relative", overflow: "hidden",
          }}
          onClick={() => onNavigateRun(lastRun.run_id)}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = HEX.cyan + "40"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(28,98,242,0.06)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = HEX.border; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 2,
            background: lastRun.overall_effective ? HEX.green : HEX.red,
          }} />
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
              LATEST ASSESSMENT
            </span>
            <span style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 800, letterSpacing: "0.12em",
              padding: "3px 10px", borderRadius: 3,
              background: lastRun.overall_effective ? HEX.greenBg : HEX.redBg,
              color: lastRun.overall_effective ? HEX.green : HEX.red,
              border: `1px solid ${lastRun.overall_effective ? HEX.greenBorder : HEX.redBorder}`,
            }}>
              {lastRun.overall_effective ? "\u2713 EFFECTIVE" : "\u2717 INEFFECTIVE"}
            </span>
            <div style={{ flex: 1 }} />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={HEX.text3} strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </div>
          <div style={{ fontFamily: S.ui, fontSize: 14, fontWeight: 600, color: S.text1 }}>
            {lastRun.dataset_name}
            {lastRun.currency_pair && (
              <span style={{ fontFamily: S.mono, fontSize: 12, color: HEX.cyan, marginLeft: 8 }}>{lastRun.currency_pair}</span>
            )}
          </div>
          <div style={{
            fontFamily: S.mono, fontSize: 12, color: S.text3, marginTop: 6,
            display: "flex", gap: 16, flexWrap: "wrap",
          }}>
            <span>{lastRun.standard}</span>
            <span style={{ color: S.rim }}>\u2502</span>
            <span>D.O. Ratio: <strong style={{ color: S.text2 }}>{lastRun.dollar_offset_ratio?.toFixed(4) ?? "N/A"}</strong></span>
            <span style={{ color: S.rim }}>\u2502</span>
            <span>R\u00B2: <strong style={{ color: S.text2 }}>{lastRun.regression_r_squared?.toFixed(4) ?? "N/A"}</strong></span>
            <span style={{ color: S.rim }}>\u2502</span>
            <span>Hash: {lastRun.run_hash?.slice(0, 12)}...</span>
          </div>
        </div>
      )}

      {/* Portfolio health gauge + recent activity */}
      {runs.length > 0 && (() => {
        const passRate = Math.round((runs.filter((r) => r.overall_effective).length / runs.length) * 100);
        const gaugeColor = passRate >= 80 ? HEX.green : passRate >= 60 ? HEX.amber : HEX.red;
        const gaugeOption = {
          backgroundColor: "transparent",
          series: [{
            type: "gauge",
            startAngle: 200, endAngle: -20,
            min: 0, max: 100,
            radius: "90%",
            pointer: { show: false },
            progress: {
              show: true, width: 12,
              itemStyle: { color: gaugeColor },
            },
            axisLine: { lineStyle: { width: 12, color: [[1, HEX.border]] } },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { show: false },
            detail: {
              valueAnimation: true,
              formatter: "{value}%",
              color: gaugeColor,
              fontSize: 22, fontWeight: 800,
              fontFamily: "'IBM Plex Mono', monospace",
              offsetCenter: [0, "20%"],
            },
            title: {
              show: true,
              offsetCenter: [0, "55%"],
              color: HEX.text3,
              fontSize: 10,
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 700,
            },
            data: [{ value: passRate, name: "PASS RATE" }],
          }],
        };

        const recent = [...runs]
          .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
          .slice(0, 6);

        return (
          <>
            {/* Gauge card */}
            <div style={{ padding: "20px 16px", borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}` }}>
              <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 4 }}>
                PORTFOLIO HEALTH
              </div>
              <ReactECharts option={gaugeOption} style={{ height: 180 }} opts={{ renderer: "canvas" }} />
              <div style={{ textAlign: "center", fontFamily: S.mono, fontSize: 11, color: S.text3 }}>
                {runs.filter((r) => r.overall_effective).length} of {runs.length} effective
              </div>
            </div>

            {/* Recent activity feed */}
            <div style={{ padding: "20px", borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}`, display: "flex", flexDirection: "column" }}>
              <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 12 }}>
                RECENT ASSESSMENTS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                {recent.map((r) => (
                  <div
                    key={r.run_id}
                    onClick={() => onNavigateRun(r.run_id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 10px", borderRadius: 3, cursor: "pointer",
                      background: S.sub, border: `1px solid transparent`,
                      transition: "all 0.12s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = HEX.cyan + "30"; e.currentTarget.style.background = HEX.bgSub; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "var(--bg-sub)"; }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      background: r.overall_effective ? HEX.green : HEX.red,
                    }} />
                    <span style={{ fontFamily: S.ui, fontSize: 12, fontWeight: 600, color: S.text1, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.dataset_name}
                    </span>
                    {r.currency_pair && (
                      <span style={{ fontFamily: S.mono, fontSize: 11, color: HEX.cyan, flexShrink: 0 }}>{r.currency_pair}</span>
                    )}
                    <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3, flexShrink: 0 }}>
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                    </span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={HEX.text3} strokeWidth="2" style={{ flexShrink: 0 }}>
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          </>
        );
      })()}

      {/* Effectiveness streak */}
      {runs.length >= 2 && (() => {
        const recent10 = [...runs]
          .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
          .slice(0, 10);
        // Calculate current streak from newest run
        const streakVerdict = recent10[0]?.overall_effective;
        let streakCount = 0;
        for (const r of recent10) {
          if (r.overall_effective === streakVerdict) streakCount++;
          else break;
        }
        const streakLabel = streakVerdict ? "EFFECTIVE" : "INEFFECTIVE";
        const streakColor = streakVerdict ? HEX.green : HEX.red;
        const streakBg = streakVerdict ? HEX.greenBg : HEX.redBg;
        const streakBorder = streakVerdict ? HEX.greenBorder : HEX.redBorder;
        return (
          <div style={{
            gridColumn: "1 / -1", padding: "14px 20px", borderRadius: 6,
            background: S.panel, border: `1px solid ${S.rim}`,
            display: "flex", alignItems: "center", gap: 20,
          }}>
            <div>
              <div style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 6 }}>
                CURRENT STREAK
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontFamily: S.mono, fontSize: 26, fontWeight: 800,
                  color: streakColor, lineHeight: 1,
                }}>
                  {streakCount}×
                </span>
                <span style={{
                  fontFamily: S.mono, fontSize: 12, fontWeight: 800, letterSpacing: "0.1em",
                  padding: "3px 10px", borderRadius: 3,
                  background: streakBg, color: streakColor, border: `1px solid ${streakBorder}`,
                }}>
                  {streakLabel}
                </span>
              </div>
            </div>
            <div style={{ width: 1, height: 40, background: S.rim }} />
            <div>
              <div style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 8 }}>
                LAST {recent10.length} RUNS
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                {recent10.map((r, i) => (
                  <div key={r.run_id} title={`${r.dataset_name} — ${r.overall_effective ? "EFFECTIVE" : "INEFFECTIVE"} (${r.created_at?.slice(0, 10) ?? ""})`} style={{
                    width: i === 0 ? 14 : 10, height: i === 0 ? 14 : 10,
                    borderRadius: "50%", flexShrink: 0,
                    background: r.overall_effective ? HEX.green : HEX.red,
                    opacity: 1 - i * 0.07,
                    boxShadow: i === 0 ? `0 0 0 2px ${r.overall_effective ? HEX.greenBorder : HEX.redBorder}` : "none",
                    transition: "transform 0.15s", cursor: "default",
                  }} />
                ))}
                {recent10.length < runs.length && (
                  <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3, marginLeft: 4 }}>
                    +{runs.length - recent10.length} more
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* D.O. Ratio Trend sparkline */}
      {runs.length >= 3 && (() => {
        const sorted = [...runs]
          .filter((r) => r.dollar_offset_ratio != null && r.created_at != null)
          .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
          .slice(-20);
        if (sorted.length < 3) return null;
        const dates = sorted.map((r) => new Date(r.created_at!).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
        const values = sorted.map((r) => r.dollar_offset_ratio!);
        const trendOption = {
          backgroundColor: "transparent",
          grid: { top: 16, right: 16, bottom: 32, left: 44 },
          xAxis: {
            type: "category", data: dates,
            axisLine: { lineStyle: { color: HEX.border } },
            axisLabel: { color: HEX.text3, fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", interval: Math.floor(sorted.length / 5) },
            axisTick: { show: false },
          },
          yAxis: {
            type: "value", min: 0.5, max: 1.5,
            axisLine: { show: false },
            splitLine: { lineStyle: { color: HEX.border, type: "dashed" as const } },
            axisLabel: { color: HEX.text3, fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" },
          },
          series: [
            {
              type: "line", data: values, smooth: true, symbol: "circle", symbolSize: 5,
              lineStyle: { color: HEX.cyan, width: 2 },
              itemStyle: { color: HEX.cyan },
              areaStyle: { color: { type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(28,98,242,0.12)" }, { offset: 1, color: "rgba(28,98,242,0.00)" }] } },
              markLine: {
                silent: true,
                lineStyle: { type: "dashed" as const, color: HEX.green, opacity: 0.6 },
                data: [{ yAxis: 0.80, name: "0.80" }, { yAxis: 1.25, name: "1.25" }],
                label: { show: true, position: "end" as const, fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: HEX.green },
              },
            },
          ],
          tooltip: {
            trigger: "axis" as const,
            backgroundColor: "#1e293b", borderColor: HEX.border, textStyle: { color: "#fff", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" },
            formatter: (params: { dataIndex: number }[]) => {
              const idx = params[0].dataIndex;
              const r = sorted[idx];
              return `${dates[idx]}<br/>D.O.: <b>${values[idx].toFixed(4)}</b><br/>${r.overall_effective ? "✓ EFFECTIVE" : "✗ INEFFECTIVE"}`;
            },
          },
        };
        return (
          <div style={{
            gridColumn: "1 / -1", padding: "16px 20px 8px", borderRadius: 6,
            background: S.panel, border: `1px solid ${S.rim}`,
          }}>
            <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 8 }}>
              D.O. RATIO TREND — LAST {sorted.length} RUNS
            </div>
            <ReactECharts option={trendOption} style={{ height: 180 }} />
          </div>
        );
      })()}

      {/* Pass rate over time — monthly stacked bar */}
      {runs.length >= 3 && (() => {
        // Group runs by YYYY-MM, sorted chronologically, last 9 months
        const byMonth: Record<string, { pass: number; fail: number }> = {};
        runs.forEach((r) => {
          if (!r.created_at) return;
          const key = r.created_at.slice(0, 7); // "YYYY-MM"
          if (!byMonth[key]) byMonth[key] = { pass: 0, fail: 0 };
          if (r.overall_effective) byMonth[key].pass++;
          else byMonth[key].fail++;
        });
        const months = Object.keys(byMonth).sort().slice(-9);
        if (months.length < 2) return null;
        const labels = months.map((m) => {
          const [y, mo] = m.split("-");
          return new Date(Number(y), Number(mo) - 1).toLocaleString("default", { month: "short", year: "2-digit" });
        });
        const passData = months.map((m) => byMonth[m].pass);
        const failData = months.map((m) => byMonth[m].fail);
        const passRateOption = {
          backgroundColor: "transparent",
          tooltip: {
            trigger: "axis" as const,
            backgroundColor: "#1e293b", borderColor: HEX.border,
            textStyle: { color: "#fff", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" },
            formatter: (params: { seriesName: string; value: number; name: string }[]) => {
              const mo = params[0]?.name ?? "";
              const pass = params.find((p) => p.seriesName === "Effective")?.value ?? 0;
              const fail = params.find((p) => p.seriesName === "Ineffective")?.value ?? 0;
              const total = pass + fail;
              const pct = total > 0 ? Math.round((pass / total) * 100) : 0;
              return `<b>${mo}</b><br/>Effective: <b style="color:${HEX.green}">${pass}</b><br/>Ineffective: <b style="color:${HEX.red}">${fail}</b><br/>Pass rate: <b>${pct}%</b>`;
            },
          },
          grid: { top: 16, right: 16, bottom: 32, left: 36 },
          xAxis: {
            type: "category" as const, data: labels,
            axisLabel: { color: HEX.text3, fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" },
            axisLine: { lineStyle: { color: HEX.border } }, axisTick: { show: false },
          },
          yAxis: {
            type: "value" as const, minInterval: 1,
            axisLabel: { color: HEX.text3, fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" },
            splitLine: { lineStyle: { color: HEX.border, type: "dashed" as const } },
            axisLine: { show: false },
          },
          series: [
            {
              name: "Effective", type: "bar" as const, stack: "runs", data: passData,
              itemStyle: { color: HEX.green, borderRadius: [0, 0, 0, 0] },
              emphasis: { itemStyle: { color: HEX.green } },
            },
            {
              name: "Ineffective", type: "bar" as const, stack: "runs", data: failData,
              itemStyle: { color: HEX.red, borderRadius: [3, 3, 0, 0] },
              emphasis: { itemStyle: { color: HEX.red } },
            },
          ],
        };
        return (
          <div style={{
            gridColumn: "1 / -1", padding: "16px 20px 8px", borderRadius: 6,
            background: S.panel, border: `1px solid ${S.rim}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
              <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
                ASSESSMENTS BY MONTH
              </span>
              <div style={{ display: "flex", gap: 12 }}>
                {[["Effective", HEX.green], ["Ineffective", HEX.red]].map(([label, color]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                    <span style={{ fontFamily: S.ui, fontSize: 11, color: S.text3 }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <ReactECharts option={passRateOption} style={{ height: 160 }} />
          </div>
        );
      })()}

      {/* Portfolio statistics */}
      {runs.length >= 2 && (() => {
        const ratios = runs.map((r) => r.dollar_offset_ratio).filter((v): v is number => v != null);
        if (ratios.length === 0) return null;
        const mean = ratios.reduce((s, v) => s + v, 0) / ratios.length;
        const variance = ratios.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / ratios.length;
        const stdDev = Math.sqrt(variance);

        // Best/worst dataset by pass rate (among datasets with ≥1 run)
        const dsIds = Array.from(new Set(runs.map((r) => r.dataset_id)));
        const dsByPassRate = dsIds
          .map((id) => {
            const dsRuns = runs.filter((r) => r.dataset_id === id);
            return {
              name: dsRuns[0].dataset_name,
              pair: dsRuns[0].currency_pair,
              pct: dsRuns.filter((r) => r.overall_effective).length / dsRuns.length,
              count: dsRuns.length,
            };
          })
          .filter((d) => d.count >= 1);
        const best = [...dsByPassRate].sort((a, b) => b.pct - a.pct)[0];
        const worst = [...dsByPassRate].sort((a, b) => a.pct - b.pct)[0];

        const statCard = (label: string, value: string, sub: string, color: string) => (
          <div style={{ flex: "1 1 160px", padding: "12px 16px", borderRadius: 4, background: S.sub, border: `1px solid ${S.rim}` }}>
            <div style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: S.text3, letterSpacing: "0.12em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: S.mono, fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontFamily: S.ui, fontSize: 11, color: S.text3, marginTop: 4 }}>{sub}</div>
          </div>
        );

        return (
          <div style={{ gridColumn: "1 / -1", padding: "16px 20px", borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}` }}>
            <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 12 }}>
              PORTFOLIO STATISTICS
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {statCard("MEAN D.O. RATIO", mean.toFixed(4), `${ratios.length} runs with ratio`, mean >= 0.80 && mean <= 1.25 ? HEX.green : HEX.amber)}
              {statCard("STD DEVIATION", stdDev.toFixed(4), "ratio dispersion", HEX.text2)}
              {statCard("RANGE", `${Math.min(...ratios).toFixed(4)} – ${Math.max(...ratios).toFixed(4)}`, "min – max D.O. ratio", HEX.text2)}
              {best && best !== worst && statCard("TOP DATASET", `${best.pct === 1 ? "100" : Math.round(best.pct * 100)}%`, `${best.name}${best.pair ? ` (${best.pair})` : ""}`, HEX.green)}
              {worst && best !== worst && worst.pct < 1 && statCard("NEEDS REVIEW", `${Math.round(worst.pct * 100)}%`, `${worst.name}${worst.pair ? ` (${worst.pair})` : ""}`, HEX.red)}
            </div>
          </div>
        );
      })()}

      {/* Dataset health matrix */}
      {datasets.length >= 2 && runs.length >= 1 && (() => {
        const standards = Array.from(new Set(runs.map((r) => r.standard))).sort();
        if (standards.length === 0) return null;
        // For each dataset × standard: find latest run result or null
        const cellData = (dsId: string, std: string): "pass" | "fail" | "none" => {
          const dsStdRuns = runs
            .filter((r) => r.dataset_id === dsId && r.standard === std)
            .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
          if (dsStdRuns.length === 0) return "none";
          return dsStdRuns[0].overall_effective ? "pass" : "fail";
        };
        return (
          <div style={{
            gridColumn: "1 / -1", padding: "16px 20px", borderRadius: 6,
            background: S.panel, border: `1px solid ${S.rim}`,
          }}>
            <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 12 }}>
              DATASET HEALTH MATRIX
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 400 }}>
                <thead>
                  <tr>
                    <th style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: S.text3, letterSpacing: "0.1em", padding: "4px 12px 8px 0", textAlign: "left" }}>
                      DATASET
                    </th>
                    {standards.map((std) => (
                      <th key={std} style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: S.text3, letterSpacing: "0.1em", padding: "4px 12px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                        {std.replace("_", " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {datasets.map((ds, di) => (
                    <tr key={ds.id} style={{ background: di % 2 === 0 ? "transparent" : S.sub }}>
                      <td style={{ fontFamily: S.ui, fontSize: 12, fontWeight: 600, color: S.text1, padding: "7px 12px 7px 0", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {ds.name}
                        {ds.currency_pair && (
                          <span style={{ fontFamily: S.mono, fontSize: 11, color: HEX.cyan, marginLeft: 6 }}>{ds.currency_pair}</span>
                        )}
                      </td>
                      {standards.map((std) => {
                        const cell = cellData(ds.id, std);
                        return (
                          <td key={std} style={{ padding: "7px 12px", textAlign: "center" }}>
                            {cell === "pass" ? (
                              <span style={{
                                display: "inline-block", padding: "2px 10px", borderRadius: 2,
                                fontFamily: S.mono, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
                                background: HEX.greenBg, color: HEX.green, border: `1px solid ${HEX.greenBorder}`,
                              }}>✓</span>
                            ) : cell === "fail" ? (
                              <span style={{
                                display: "inline-block", padding: "2px 10px", borderRadius: 2,
                                fontFamily: S.mono, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
                                background: HEX.redBg, color: HEX.red, border: `1px solid ${HEX.redBorder}`,
                              }}>✗</span>
                            ) : (
                              <span style={{
                                display: "inline-block", padding: "2px 10px", borderRadius: 2,
                                fontFamily: S.mono, fontSize: 10, color: S.text3,
                                background: S.sub, border: `1px solid ${S.rim}`,
                              }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
              {([["✓", HEX.green, HEX.greenBg, HEX.greenBorder, "Effective (latest)"], ["✗", HEX.red, HEX.redBg, HEX.redBorder, "Ineffective (latest)"], ["—", S.text3, S.sub, S.rim, "No run"]] as const).map(([sym, col, bg, border, label]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 2, background: bg, color: col, border: `1px solid ${border}` }}>{sym}</span>
                  <span style={{ fontFamily: S.ui, fontSize: 11, color: S.text3 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── 22.3 Worst Performers ── */}
      {(() => {
        // Compute pass rate per dataset (min 3 runs)
        const dsMap = new Map<string, { name: string; total: number; pass: number; lastDate: string | null; lastVerdict: boolean }>();
        for (const r of runs) {
          const entry = dsMap.get(r.dataset_id) ?? { name: r.dataset_name, total: 0, pass: 0, lastDate: null, lastVerdict: false };
          entry.total++;
          if (r.overall_effective) entry.pass++;
          if (!entry.lastDate || (r.created_at && r.created_at > entry.lastDate)) {
            entry.lastDate = r.created_at ?? null;
            entry.lastVerdict = r.overall_effective;
          }
          dsMap.set(r.dataset_id, entry);
        }
        const worst = [...dsMap.entries()]
          .filter(([, v]) => v.total >= 3)
          .map(([id, v]) => ({ id, ...v, rate: Math.round((v.pass / v.total) * 100) }))
          .sort((a, b) => a.rate - b.rate)
          .slice(0, 3);
        if (worst.length === 0) return null;
        return (
          <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4, padding: 16, marginTop: 16 }}>
            <div style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.text3, textTransform: "uppercase", marginBottom: 12 }}>
              Worst Performers
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {worst.map((w, i) => (
                <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 3, background: S.sub, border: `1px solid ${S.rim}` }}>
                  <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 800, color: S.text3, minWidth: 18 }}>#{i + 1}</span>
                  <span style={{ fontFamily: S.ui, fontSize: 12, fontWeight: 600, color: S.text1, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
                  <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>{w.total} runs</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 120 }}>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: S.rim, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${w.rate}%`, borderRadius: 2, background: w.rate >= 80 ? HEX.green : w.rate >= 60 ? HEX.amber : HEX.red }} />
                    </div>
                    <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: w.rate >= 80 ? HEX.green : w.rate >= 60 ? HEX.amber : HEX.red, minWidth: 32, textAlign: "right" }}>{w.rate}%</span>
                  </div>
                  <span style={{
                    fontFamily: S.mono, fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 2,
                    background: w.lastVerdict ? HEX.greenBg : HEX.redBg,
                    color: w.lastVerdict ? HEX.green : HEX.red,
                    border: `1px solid ${w.lastVerdict ? HEX.greenBorder : HEX.redBorder}`,
                  }}>{w.lastVerdict ? "EFF" : "INEFF"}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── 21.3 Assessment Cadence Insight ── */}
      {(() => {
        // For each dataset compute avg days between consecutive runs
        const cadenceRows = datasets.map((ds) => {
          const dsRuns = runs
            .filter((r) => r.dataset_id === ds.id && r.created_at)
            .map((r) => r.created_at!)
            .sort();
          const lastDate = dsRuns.length > 0 ? dsRuns[dsRuns.length - 1] : null;
          if (dsRuns.length < 2) return { ds, avgDays: null, lastDate, runCount: dsRuns.length };
          let totalMs = 0;
          for (let i = 1; i < dsRuns.length; i++) {
            totalMs += new Date(dsRuns[i]).getTime() - new Date(dsRuns[i - 1]).getTime();
          }
          const avgDays = Math.round(totalMs / (dsRuns.length - 1) / 86400000);
          return { ds, avgDays, lastDate, runCount: dsRuns.length };
        });
        const withCadence = cadenceRows.filter((r) => r.runCount > 0);
        if (withCadence.length === 0) return null;
        return (
          <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4, padding: 16, marginTop: 16 }}>
            <div style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.text3, textTransform: "uppercase", marginBottom: 12 }}>
              Assessment Cadence
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "0 16px" }}>
              {/* Header */}
              {(["Dataset", "Runs", "Avg Interval", "Last Assessed"] as const).map((h) => (
                <div key={h} style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.text3, textTransform: "uppercase", paddingBottom: 6, borderBottom: `1px solid ${S.rim}`, marginBottom: 4 }}>{h}</div>
              ))}
              {/* Rows */}
              {withCadence.map(({ ds, avgDays, lastDate, runCount }) => {
                const staleDays = lastDate ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000) : null;
                const isStale = staleDays != null && staleDays > 90;
                return (
                  <>
                    <div key={`${ds.id}-name`} style={{ fontFamily: S.ui, fontSize: 12, color: S.text1, padding: "3px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ds.name}</div>
                    <div key={`${ds.id}-count`} style={{ fontFamily: S.mono, fontSize: 12, color: S.text2, padding: "3px 0", textAlign: "right" }}>{runCount}</div>
                    <div key={`${ds.id}-avg`} style={{ fontFamily: S.mono, fontSize: 12, padding: "3px 0", textAlign: "right", color: avgDays == null ? S.text3 : avgDays <= 7 ? HEX.green : avgDays <= 30 ? HEX.amber : HEX.red }}>
                      {avgDays == null ? "—" : `${avgDays}d`}
                    </div>
                    <div key={`${ds.id}-last`} style={{ fontFamily: S.mono, fontSize: 12, padding: "3px 0", textAlign: "right", color: isStale ? HEX.red : S.text2 }}>
                      {lastDate ? lastDate.slice(0, 10) : "—"}{isStale && <span style={{ marginLeft: 4, fontSize: 10, color: HEX.red }}>STALE</span>}
                    </div>
                  </>
                );
              })}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 16 }}>
              {([["≤7d", HEX.green, "Frequent"], ["≤30d", HEX.amber, "Regular"], [">30d", HEX.red, "Infrequent"]] as const).map(([label, color, desc]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color, padding: "1px 6px", borderRadius: 2, background: color + "22", border: `1px solid ${color}55` }}>{label}</span>
                  <span style={{ fontFamily: S.ui, fontSize: 11, color: S.text3 }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── 24.3 Activity Calendar Heatmap ── */}
      {(() => {
        if (runs.length === 0) return null;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const startDay = new Date(today); startDay.setDate(today.getDate() - 89);
        // Count runs per day
        const countByDay = new Map<string, number>();
        for (const r of runs) {
          if (!r.created_at) continue;
          const day = r.created_at.slice(0, 10);
          const d = new Date(day);
          if (d >= startDay && d <= today) countByDay.set(day, (countByDay.get(day) ?? 0) + 1);
        }
        const maxCount = Math.max(1, ...countByDay.values());
        // Build 90-day array
        const days: { date: string; count: number }[] = [];
        for (let i = 0; i < 90; i++) {
          const d = new Date(startDay); d.setDate(startDay.getDate() + i);
          const key = d.toISOString().slice(0, 10);
          days.push({ date: key, count: countByDay.get(key) ?? 0 });
        }
        const totalActivity = [...countByDay.values()].reduce((s, v) => s + v, 0);
        return (
          <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4, padding: 16, marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.text3, textTransform: "uppercase" }}>Assessment Activity</span>
              <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>— last 90 days</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>{totalActivity} runs</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {days.map(({ date, count }) => {
                const intensity = count === 0 ? 0 : Math.max(0.15, count / maxCount);
                const bg = count === 0 ? S.sub : `rgba(28,98,242,${intensity.toFixed(2)})`;
                const d = new Date(date);
                return (
                  <div
                    key={date}
                    title={`${date}: ${count} run${count !== 1 ? "s" : ""}`}
                    style={{
                      width: 12, height: 12, borderRadius: 2, flexShrink: 0,
                      background: bg,
                      border: `1px solid ${count > 0 ? "rgba(28,98,242,0.2)" : S.rim}`,
                      cursor: count > 0 ? "pointer" : "default",
                    }}
                  />
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>Less</span>
              {[0, 0.15, 0.4, 0.7, 1].map((v) => (
                <div key={v} style={{ width: 10, height: 10, borderRadius: 2, background: v === 0 ? S.sub : `rgba(28,98,242,${v})`, border: `1px solid ${v > 0 ? "rgba(28,98,242,0.2)" : S.rim}` }} />
              ))}
              <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>More</span>
            </div>
          </div>
        );
      })()}

      {/* ── 27.3 Best / Worst run tile ── */}
      {runs.length >= 2 && (() => {
        const withRatio = runs.filter((r) => r.dollar_offset_ratio != null);
        const effective = withRatio.filter((r) => r.overall_effective);
        const ineffective = withRatio.filter((r) => !r.overall_effective);
        if (!effective.length && !ineffective.length) return null;
        const best = effective.length
          ? [...effective].sort((a, b) => Math.abs((a.dollar_offset_ratio ?? 0) - 1.0) - Math.abs((b.dollar_offset_ratio ?? 0) - 1.0))[0]
          : null;
        const worst = ineffective.length
          ? [...ineffective].sort((a, b) => Math.abs((b.dollar_offset_ratio ?? 0) - 1.0) - Math.abs((a.dollar_offset_ratio ?? 0) - 1.0))[0]
          : null;
        if (!best && !worst) return null;
        const RunCard = ({ run, label, accent, accentBg, accentBorder }: {
          run: Run; label: string;
          accent: string; accentBg: string; accentBorder: string;
        }) => (
          <div
            onClick={() => onNavigateRun(run.run_id)}
            style={{
              padding: "16px 20px", borderRadius: 6, cursor: "pointer",
              background: S.panel, border: `1px solid ${S.rim}`,
              transition: "all 0.15s", position: "relative", overflow: "hidden",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent + "40"; e.currentTarget.style.boxShadow = `0 2px 10px ${accent}10`; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = HEX.border; e.currentTarget.style.boxShadow = "none"; }}
          >
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: accent }} />
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 10 }}>
              {label}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 800, color: accent, lineHeight: 1 }}>
                {run.dollar_offset_ratio?.toFixed(4)}
              </span>
              <span style={{
                fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                padding: "2px 7px", borderRadius: 2,
                background: accentBg, color: accent, border: `1px solid ${accentBorder}`,
              }}>
                {run.overall_effective ? "EFFECTIVE" : "INEFFECTIVE"}
              </span>
            </div>
            <div style={{ fontFamily: S.ui, fontSize: 12, fontWeight: 600, color: S.text1, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {run.dataset_name}
              {run.currency_pair && <span style={{ fontFamily: S.mono, fontSize: 11, color: HEX.cyan, marginLeft: 6 }}>{run.currency_pair}</span>}
            </div>
            <div style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>
              {run.standard} · {run.created_at ? new Date(run.created_at).toLocaleDateString() : ""}
            </div>
          </div>
        );
        return (
          <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: best && worst ? "1fr 1fr" : "1fr", gap: 12 }}>
            {best && (
              <RunCard
                run={best} label="BEST RUN — D.O. CLOSEST TO 1.0"
                accent={HEX.green} accentBg={HEX.greenBg} accentBorder={HEX.greenBorder}
              />
            )}
            {worst && (
              <RunCard
                run={worst} label="WORST RUN — MOST OUT OF BAND"
                accent={HEX.red} accentBg={HEX.redBg} accentBorder={HEX.redBorder}
              />
            )}
          </div>
        );
      })()}

      {/* ── 32.1 Standard breakdown donut + pass-rate bars ── */}
      {totalRuns >= 1 && (() => {
        const STD_META: Record<string, { label: string; color: string }> = {
          IAS_39:  { label: "IAS 39",  color: HEX.cyan  },
          IFRS_9:  { label: "IFRS 9",  color: HEX.green },
          ASC_815: { label: "ASC 815", color: HEX.amber },
        };
        const stdData = Object.entries(
          runs.reduce<Record<string, number>>((acc, r) => {
            acc[r.standard] = (acc[r.standard] ?? 0) + 1;
            return acc;
          }, {})
        ).map(([std, count]) => ({
          std,
          label: STD_META[std]?.label ?? std,
          count,
          color: STD_META[std]?.color ?? HEX.text3,
          passRate: Math.round(
            (runs.filter((r) => r.standard === std && r.overall_effective).length / count) * 100
          ),
        }));
        if (stdData.length === 0) return null;
        const donutOption = {
          backgroundColor: "transparent",
          tooltip: { trigger: "item" as const, formatter: "{b}: {c} ({d}%)" },
          series: [{
            type: "pie" as const,
            radius: ["52%", "78%"],
            center: ["50%", "50%"],
            data: stdData.map((d) => ({ name: d.label, value: d.count, itemStyle: { color: d.color, borderWidth: 0 } })),
            label: { show: false },
            emphasis: { scale: false },
          }],
        };
        return (
          <div style={{
            gridColumn: "1 / -1", padding: "14px 20px", borderRadius: 6,
            background: S.panel, border: `1px solid ${S.rim}`,
            display: "flex", alignItems: "center", gap: 24,
          }}>
            <div>
              <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 10 }}>
                BY STANDARD
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 90, height: 90, flexShrink: 0 }}>
                  <ReactECharts option={donutOption} style={{ width: 90, height: 90 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {stdData.map((d) => (
                    <div key={d.std} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text2, minWidth: 58 }}>{d.label}</span>
                      <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text1 }}>{d.count}</span>
                      <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>
                        ({Math.round((d.count / totalRuns) * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ width: 1, height: 72, background: S.rim, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 10 }}>
                PASS RATE BY STANDARD
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {stdData.map((d) => (
                  <div key={d.std} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3, minWidth: 58 }}>{d.label}</span>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: S.rim, overflow: "hidden" }}>
                      <div style={{ width: `${d.passRate}%`, height: "100%", borderRadius: 2, background: d.color, transition: "width 0.4s" }} />
                    </div>
                    <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: d.color, minWidth: 34, textAlign: "right" }}>
                      {d.passRate}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 35.1 Currency pair distribution panel ── */}
      {totalRuns >= 1 && (() => {
        const pairMap = runs.reduce<Record<string, { total: number; effective: number }>>((acc, r) => {
          const key = r.currency_pair ?? "MULTI";
          if (!acc[key]) acc[key] = { total: 0, effective: 0 };
          acc[key].total++;
          if (r.overall_effective) acc[key].effective++;
          return acc;
        }, {});
        const pairData = Object.entries(pairMap)
          .map(([pair, stats]) => ({
            pair,
            total: stats.total,
            effective: stats.effective,
            passRate: Math.round((stats.effective / stats.total) * 100),
          }))
          .sort((a, b) => b.total - a.total);
        if (pairData.length === 0) return null;
        return (
          <div style={{
            gridColumn: "1 / -1", padding: "14px 20px", borderRadius: 6,
            background: S.panel, border: `1px solid ${S.rim}`,
          }}>
            <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 10 }}>
              BY CURRENCY PAIR
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pairData.map((d) => {
                const passColor = d.passRate >= 80 ? HEX.green : d.passRate >= 60 ? HEX.amber : HEX.red;
                return (
                  <div key={d.pair} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: HEX.cyan, minWidth: 70 }}>
                      {d.pair}
                    </span>
                    <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3, minWidth: 48 }}>
                      {d.total} run{d.total !== 1 ? "s" : ""}
                    </span>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: S.rim, overflow: "hidden", maxWidth: 200 }}>
                      <div style={{ width: `${d.passRate}%`, height: "100%", borderRadius: 2, background: passColor, transition: "width 0.4s" }} />
                    </div>
                    <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: passColor, minWidth: 34, textAlign: "right" }}>
                      {d.passRate}%
                    </span>
                    <span style={{ fontFamily: S.ui, fontSize: 10, color: S.text3 }}>
                      {d.effective}/{d.total} effective
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── 30.3 Effectiveness timeline scatter ── */}
      {runs.length >= 2 && (() => {
        const sorted = [...runs]
          .filter((r) => r.created_at && r.dollar_offset_ratio != null)
          .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
          .slice(-30);
        if (sorted.length < 2) return null;
        const timelineOption = {
          backgroundColor: "transparent",
          tooltip: {
            trigger: "item" as const,
            backgroundColor: "#1e293b", borderColor: HEX.border,
            textStyle: { color: "#fff", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" },
            formatter: (params: { data: [string, number, boolean, string] }) => {
              const [date, ratio, effective, name] = params.data;
              const d = new Date(date).toLocaleDateString();
              return `<b>${name}</b><br/>${d}<br/>D.O. <b style="color:${effective ? HEX.green : HEX.red}">${ratio.toFixed(4)}</b><br/>${effective ? "✓ EFFECTIVE" : "✗ INEFFECTIVE"}`;
            },
          },
          grid: { top: 24, right: 16, bottom: 32, left: 50 },
          xAxis: {
            type: "time" as const,
            axisLabel: { color: HEX.text3, fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" },
            axisLine: { lineStyle: { color: HEX.border } }, axisTick: { show: false },
          },
          yAxis: {
            type: "value" as const, name: "D.O. Ratio",
            nameTextStyle: { color: HEX.text3, fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" },
            min: Math.max(0, Math.min(0.7, ...sorted.map((r) => r.dollar_offset_ratio as number)) - 0.05),
            max: Math.max(1.35, ...sorted.map((r) => r.dollar_offset_ratio as number)) + 0.05,
            axisLabel: { color: HEX.text3, fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", formatter: (v: number) => v.toFixed(2) },
            splitLine: { lineStyle: { color: HEX.border, type: "dashed" as const } },
            axisLine: { show: false },
          },
          series: [
            // Band lines
            {
              type: "line" as const, silent: true, symbol: "none", lineStyle: { color: HEX.green, type: "dashed" as const, width: 1, opacity: 0.5 },
              markLine: {
                silent: true, symbol: "none", lineStyle: { color: HEX.green, type: "dashed" as const, width: 1, opacity: 0.5 },
                data: [{ yAxis: 0.80, label: { formatter: "0.80", color: HEX.green, fontSize: 9 } }, { yAxis: 1.25, label: { formatter: "1.25", color: HEX.green, fontSize: 9 } }],
              },
              data: [],
            },
            // Scatter points
            {
              type: "scatter" as const,
              symbolSize: 9,
              data: sorted.map((r) => [r.created_at, r.dollar_offset_ratio, r.overall_effective, r.dataset_name]),
              itemStyle: {
                color: (params: { data: [string, number, boolean, string] }) => params.data[2] ? HEX.green : HEX.red,
                borderColor: "#fff", borderWidth: 1.5,
                shadowBlur: 4, shadowColor: (params: { data: [string, number, boolean, string] }) => params.data[2] ? HEX.green + "60" : HEX.red + "60",
              },
            },
          ],
        };
        return (
          <div style={{
            gridColumn: "1 / -1", padding: "16px 20px 8px", borderRadius: 6,
            background: S.panel, border: `1px solid ${S.rim}`, marginTop: 4,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
                EFFECTIVENESS TIMELINE
              </span>
              <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>— last {sorted.length} runs with D.O. data</span>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 12 }}>
                {[["Effective", HEX.green], ["Ineffective", HEX.red]].map(([label, color]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                    <span style={{ fontFamily: S.ui, fontSize: 11, color: S.text3 }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <ReactECharts option={timelineOption} style={{ height: 180 }} />
          </div>
        );
      })()}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DATASETS TAB
// ═════════════════════════════════════════════════════════════════════════════

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "rgba(28,98,242,0.18)", color: "inherit", borderRadius: 2, padding: "0 1px" }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function DatasetsTab({
  datasets, runs, standard, onRunAssessment, onNavigateRun, submitting, onUpdateDataset, onCloneDataset, token,
}: {
  datasets: Dataset[]; runs: Run[]; standard: string;
  onRunAssessment: (id: string) => void;
  onNavigateRun: (id: string) => void;
  submitting: boolean;
  onUpdateDataset: (id: string, data: { name?: string; currency_pair?: string | null; designation_date?: string | null }) => Promise<void>;
  onCloneDataset: (id: string) => Promise<void>;
  token: string;
}) {
  const isMobile = useIsMobile();
  const [dsSearch, setDsSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandAll, setExpandAll] = useState(false);
  const [dsSort, setDsSort] = useState<"name" | "runs" | "created" | "lastAssessed" | "compliance">("created");
  // ── 45.3 Hedge-type filter ──
  const [dsHedgeFilter, setDsHedgeFilter] = useState<string | null>(null);
  const [dsUntestedOnly, setDsUntestedOnly] = useState(false); // ── 53.3
  const [dsLastFailOnly, setDsLastFailOnly] = useState(false); // ── 55.3
  // ── 54.3 Per-dataset risk level tag ──
  const DS_RISK_KEY = "hec_ds_risk";
  const [dsRisk, setDsRisk] = useState<Record<string, "HIGH" | "MEDIUM" | "LOW">>(() => {
    try { return JSON.parse(localStorage.getItem(DS_RISK_KEY) || "{}"); }
    catch { return {}; }
  });
  const cycleRisk = (id: string) => {
    const cur = dsRisk[id] ?? null;
    const next = cur === null ? "HIGH" : cur === "HIGH" ? "MEDIUM" : cur === "MEDIUM" ? "LOW" : null;
    const updated = { ...dsRisk };
    if (next === null) delete updated[id]; else updated[id] = next;
    setDsRisk(updated);
    localStorage.setItem(DS_RISK_KEY, JSON.stringify(updated));
  };
  // ── 29.2 Clone state ──
  const [cloningId, setCloningId] = useState<string | null>(null);
  // ── 28.2 Period data viewer ──
  type PeriodRow28 = { period_index: number; period_date: string | null; hedged_item_fv_change: number; instrument_fv_change: number };
  const [viewDataId, setViewDataId] = useState<string | null>(null);
  const [periodsCache, setPeriodsCache] = useState<Record<string, PeriodRow28[]>>({});
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const toggleViewData = async (dsId: string) => {
    if (viewDataId === dsId) { setViewDataId(null); return; }
    setViewDataId(dsId);
    if (periodsCache[dsId]) return;
    setLoadingPeriods(true);
    try {
      const res = await dashboardFetch(`/v1/hedge-effectiveness/datasets/${dsId}`, token);
      if (res.ok) {
        const data = await res.json();
        setPeriodsCache((prev) => ({ ...prev, [dsId]: data.periods ?? [] }));
      }
    } finally { setLoadingPeriods(false); }
  };
  // ── 27.2 Dataset metadata editor ──
  const [editingDsId, setEditingDsId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPair, setEditPair] = useState("");
  const [editDesig, setEditDesig] = useState("");
  const [saving, setSaving] = useState(false);
  const openEdit = (ds: Dataset, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingDsId(ds.id);
    setEditName(ds.name);
    setEditPair(ds.currency_pair ?? "");
    setEditDesig(ds.designation_date ?? "");
    setExpandedId(ds.id);
  };
  const saveEdit = async (dsId: string) => {
    setSaving(true);
    await onUpdateDataset(dsId, {
      name: editName.trim() || undefined,
      currency_pair: editPair.trim() || null,
      designation_date: editDesig.trim() || null,
    });
    setSaving(false);
    setEditingDsId(null);
  };

  // ── 25.3 Dataset notes ──
  const DS_NOTES_KEY = "hec_dataset_notes";
  const [dsNotes, setDsNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(DS_NOTES_KEY) || "{}"); }
    catch { return {}; }
  });
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const saveNote = (dsId: string) => {
    const next = { ...dsNotes, [dsId]: draftNote };
    if (!draftNote.trim()) delete next[dsId];
    setDsNotes(next);
    localStorage.setItem(DS_NOTES_KEY, JSON.stringify(next));
    setEditingNoteId(null);
  };

  // Per-dataset stats derived from runs
  const dsStats = datasets.reduce<Record<string, { count: number; effective: number; lastVerdict: boolean | null }>>((acc, ds) => {
    const dsRuns = runs.filter((r) => r.dataset_id === ds.id);
    const sorted = [...dsRuns].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    acc[ds.id] = {
      count: dsRuns.length,
      effective: dsRuns.filter((r) => r.overall_effective).length,
      lastVerdict: sorted.length > 0 ? sorted[0].overall_effective : null,
    };
    return acc;
  }, {});

  // ── 32.2 D.O. drift per dataset (latest run - previous run) ──
  const dsDrift = datasets.reduce<Record<string, number | null>>((acc, ds) => {
    const withDO = runs
      .filter((r) => r.dataset_id === ds.id && r.dollar_offset_ratio != null)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    acc[ds.id] = withDO.length >= 2
      ? (withDO[0].dollar_offset_ratio as number) - (withDO[1].dollar_offset_ratio as number)
      : null;
    return acc;
  }, {});

  // ── 38.3 Dataset health score (0–100 composite) ──
  const dsHealth = datasets.reduce<Record<string, number>>((acc, ds) => {
    const dsRuns = runs.filter((r) => r.dataset_id === ds.id);
    if (dsRuns.length === 0) { acc[ds.id] = 0; return acc; }
    const effCount = dsRuns.filter((r) => r.overall_effective).length;
    const passScore = 40 * (effCount / dsRuns.length);
    const lastRunDate = dsRuns
      .filter((r) => r.created_at)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0]?.created_at ?? null;
    const daysSince = lastRunDate ? Math.floor((Date.now() - new Date(lastRunDate).getTime()) / 86400000) : 90;
    const recencyScore = 30 * Math.max(0, 1 - daysSince / 90);
    const countScore = Math.min(20, dsRuns.length * 4);
    const drift = dsDrift[ds.id];
    const driftScore = drift == null || Math.abs(drift) < 0.10 ? 10 : 0;
    acc[ds.id] = Math.round(passScore + recencyScore + countScore + driftScore);
    return acc;
  }, {});

  const filteredDs = datasets.filter((ds) => {
    if (dsSearch.trim()) {
      const q = dsSearch.toLowerCase();
      if (!ds.name.toLowerCase().includes(q) && !(ds.currency_pair ?? "").toLowerCase().includes(q)) return false;
    }
    if (dsHedgeFilter && ds.hedge_type !== dsHedgeFilter) return false;
    if (dsUntestedOnly && runs.some((r) => r.dataset_id === ds.id)) return false; // ── 53.3
    if (dsLastFailOnly) { // ── 55.3
      const dsRuns = runs.filter((r) => r.dataset_id === ds.id && r.created_at);
      if (dsRuns.length === 0) return false;
      const lastRun = dsRuns.reduce((a, b) => (a.created_at ?? "") > (b.created_at ?? "") ? a : b);
      if (lastRun.overall_effective !== false) return false;
    }
    return true;
  });

  const displayDs = [...filteredDs].sort((a, b) => {
    if (dsSort === "name") return a.name.localeCompare(b.name);
    if (dsSort === "runs") return (dsStats[b.id]?.count ?? 0) - (dsStats[a.id]?.count ?? 0);
    if (dsSort === "lastAssessed") {
      const aRuns = runs.filter((r) => r.dataset_id === a.id);
      const bRuns = runs.filter((r) => r.dataset_id === b.id);
      const aLast = aRuns.reduce((m, r) => (r.created_at ?? "") > m ? (r.created_at ?? "") : m, "");
      const bLast = bRuns.reduce((m, r) => (r.created_at ?? "") > m ? (r.created_at ?? "") : m, "");
      return bLast.localeCompare(aLast);
    }
    // ── 50.3 Compliance sort ──
    if (dsSort === "compliance") {
      const compScore = (ds: typeof a) => {
        const dr = runs.filter((r) => r.dataset_id === ds.id);
        if (dr.length === 0) return -1;
        const passRate = dr.filter((r) => r.overall_effective).length / dr.length;
        const lastRun = [...dr].sort((x, y) => (y.created_at ?? "").localeCompare(x.created_at ?? ""))[0];
        const daysSince = lastRun?.created_at ? Math.floor((Date.now() - new Date(lastRun.created_at).getTime()) / 86400000) : 90;
        const recency = Math.max(0, 1 - daysSince / 90);
        const sufficiency = ds.period_count >= 8 ? 1 : ds.period_count / 8;
        return passRate * 0.5 + recency * 0.3 + sufficiency * 0.2;
      };
      return compScore(b) - compScore(a);
    }
    // default: "created" — newest first
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });

  if (datasets.length === 0) {
    return (
      <div style={{
        padding: 60, textAlign: "center",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={HEX.text3} strokeWidth="1.5" opacity="0.4">
          <path d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7l8-4 8 4M4 7l8 4 8-4"/>
        </svg>
        <div style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, letterSpacing: "0.08em" }}>
          No datasets yet
        </div>
        <div style={{ fontFamily: S.ui, fontSize: 12, color: S.text3 }}>
          Create one using the NEW ASSESSMENT tab.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 1000 }}>
      {/* Search toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={HEX.text3} strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={dsSearch}
            onChange={(e) => setDsSearch(e.target.value)}
            placeholder="Search by name or pair..."
            style={{
              width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
              fontFamily: S.mono, fontSize: 12, borderRadius: 3,
              border: `1px solid ${S.soft}`, background: S.panel, color: S.text1, outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <select
          value={dsSort}
          onChange={(e) => setDsSort(e.target.value as typeof dsSort)}
          style={{
            fontFamily: S.mono, fontSize: 11, color: S.text2, background: S.panel,
            border: `1px solid ${S.soft}`, borderRadius: 3, padding: "6px 8px", outline: "none",
          }}
        >
          <option value="created">Newest first</option>
          <option value="name">Name A–Z</option>
          <option value="runs">Most runs</option>
          <option value="lastAssessed">Last assessed</option>
          <option value="compliance">Compliance score</option>
        </select>
        <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>
          {filteredDs.length} OF {datasets.length}
        </span>
        {/* ── 48.3 Total periods aggregate ── */}
        {(() => {
          const totalPeriods = filteredDs.reduce((sum, ds) => sum + ds.period_count, 0);
          if (totalPeriods === 0) return null;
          return (
            <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>
              <span style={{ color: S.text2, fontWeight: 600 }}>{totalPeriods}</span> PERIODS
            </span>
          );
        })()}
        {/* ── 53.3 Untested-only gap filter ── */}
        {datasets.some((ds) => !runs.some((r) => r.dataset_id === ds.id)) && (
          <button
            onClick={() => setDsUntestedOnly((v) => !v)}
            title="Show only datasets that have never been assessed"
            style={{
              fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              padding: "5px 10px", borderRadius: 3, cursor: "pointer",
              background: dsUntestedOnly ? HEX.redBg : S.sub,
              color: dsUntestedOnly ? HEX.red : S.text3,
              border: `1px solid ${dsUntestedOnly ? HEX.redBorder : S.rim}`,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            UNTESTED
          </button>
        )}
        {/* ── 55.3 Last-run fail filter ── */}
        {datasets.some((ds) => {
          const dsRuns = runs.filter((r) => r.dataset_id === ds.id && r.created_at);
          if (dsRuns.length === 0) return false;
          const last = dsRuns.reduce((a, b) => (a.created_at ?? "") > (b.created_at ?? "") ? a : b);
          return last.overall_effective === false;
        }) && (
          <button
            onClick={() => setDsLastFailOnly((v) => !v)}
            title="Show only datasets whose most recent run was ineffective"
            style={{
              fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              padding: "5px 10px", borderRadius: 3, cursor: "pointer",
              background: dsLastFailOnly ? HEX.redBg : S.sub,
              color: dsLastFailOnly ? HEX.red : S.text3,
              border: `1px solid ${dsLastFailOnly ? HEX.redBorder : S.rim}`,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            LAST FAIL
          </button>
        )}
        {/* ── 44.3 Expand-all / collapse-all toggle ── */}
        <button
          onClick={() => { setExpandAll((v) => !v); setExpandedId(null); }}
          title={expandAll ? "Collapse all datasets" : "Expand all datasets"}
          style={{
            fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            padding: "5px 10px", borderRadius: 3, cursor: "pointer",
            background: expandAll ? "rgba(6,182,212,0.10)" : S.sub,
            color: expandAll ? HEX.cyan : S.text3,
            border: `1px solid ${expandAll ? "rgba(6,182,212,0.30)" : S.rim}`,
            transition: "background 0.15s, color 0.15s",
          }}>
          {expandAll ? "⊟ COLLAPSE ALL" : "⊞ EXPAND ALL"}
        </button>
        {/* ── 52.3 Export datasets CSV ── */}
        <button
          onClick={() => {
            const headers = ["name", "currency_pair", "hedge_type", "period_count", "runs", "pass_rate_pct", "last_assessed"];
            const rows = filteredDs.map((ds) => {
              const dsRuns = runs.filter((r) => r.dataset_id === ds.id);
              const passCount = dsRuns.filter((r) => r.overall_effective).length;
              const passRate = dsRuns.length > 0 ? Math.round((passCount / dsRuns.length) * 100) : "";
              const lastRun = [...dsRuns].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
              return [
                `"${(ds.name ?? "").replace(/"/g, '""')}"`,
                ds.currency_pair ?? "",
                ds.hedge_type ?? "",
                ds.period_count ?? 0,
                dsRuns.length,
                passRate,
                lastRun?.created_at?.slice(0, 10) ?? "",
              ].join(",");
            });
            const csv = [headers.join(","), ...rows].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "datasets.csv"; a.click();
            URL.revokeObjectURL(url);
          }}
          style={{
            fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            padding: "5px 10px", borderRadius: 3, cursor: "pointer",
            background: "transparent", color: HEX.cyan,
            border: `1px solid rgba(28,98,242,0.25)`,
            display: "flex", alignItems: "center", gap: 4,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(28,98,242,0.04)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          title="Export filtered datasets as CSV"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          CSV
        </button>
      </div>
      {/* ── 45.3 Hedge-type filter chips ── */}
      {(() => {
        const types = [...new Set(datasets.map((ds) => ds.hedge_type))].sort();
        if (types.length < 2) return null;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3, letterSpacing: "0.08em" }}>TYPE:</span>
            {[null, ...types].map((ht) => {
              const active = dsHedgeFilter === ht;
              const label = ht == null ? "ALL" : ht.replace(/_/g, " ");
              return (
                <button key={ht ?? "all"}
                  onClick={() => setDsHedgeFilter(ht)}
                  style={{
                    fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                    padding: "3px 8px", borderRadius: 3, cursor: "pointer",
                    background: active ? "rgba(6,182,212,0.12)" : S.sub,
                    color: active ? HEX.cyan : S.text3,
                    border: `1px solid ${active ? "rgba(6,182,212,0.35)" : S.rim}`,
                  }}>
                  {label}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Column headers */}
      <div style={{
        display: "grid", gridTemplateColumns: "2fr 80px 100px 80px 100px 140px",
        gap: 8, padding: "0 20px",
      }}>
        {["DATASET", "PERIODS", "HEDGE TYPE", "SOURCE", "CREATED", ""].map((h) => (
          <span key={h} style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
            {h}
          </span>
        ))}
      </div>

      {displayDs.length === 0 && dsSearch.trim() ? (
        <div style={{ padding: "24px 20px", fontFamily: S.mono, fontSize: 12, color: S.text3 }}>
          No datasets match &ldquo;{dsSearch}&rdquo;.
        </div>
      ) : displayDs.map((ds) => {
        const stats = dsStats[ds.id];
        return (
        <div key={ds.id} style={{ borderRadius: 4, border: `1px solid ${(expandAll || expandedId === ds.id) ? HEX.cyan + "40" : S.rim}`, overflow: "hidden", transition: "border-color 0.15s" }}>
          {/* Main row */}
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 80px 100px 80px 100px 140px",
            gap: 8, padding: "14px 20px", alignItems: "center",
            background: S.panel, cursor: "pointer",
          }}
            onClick={() => { setExpandAll(false); setExpandedId(expandedId === ds.id ? null : ds.id); }}
            onMouseEnter={(e) => (e.currentTarget.style.background = HEX.bgSub)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-panel)")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg
                  width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={HEX.text3} strokeWidth="2"
                  style={{ transform: (expandAll || expandedId === ds.id) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}
                >
                  <path d="M9 18l6-6-6-6"/>
                </svg>
                <div style={{ fontFamily: S.ui, fontSize: 13, fontWeight: 600, color: S.text1 }}>
                  <HighlightMatch text={ds.name} query={dsSearch} />
                </div>
                {/* ── 32.2 D.O. drift badge ── */}
                {(() => {
                  const drift = dsDrift[ds.id];
                  if (drift == null || Math.abs(drift) < 0.10) return null;
                  const isPos = drift > 0;
                  const isBig = Math.abs(drift) >= 0.15;
                  return (
                    <span style={{
                      fontFamily: S.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                      padding: "1px 6px", borderRadius: 3, flexShrink: 0,
                      background: isBig ? (isPos ? HEX.greenBg : HEX.redBg) : "rgba(217,119,6,0.12)",
                      color: isBig ? (isPos ? HEX.green : HEX.red) : HEX.amber,
                      border: `1px solid ${isBig ? (isPos ? HEX.greenBorder : HEX.redBorder) : "rgba(217,119,6,0.35)"}`,
                    }}>
                      ⚠ DRIFT {isPos ? "+" : ""}{drift.toFixed(3)}
                    </span>
                  );
                })()}
                {/* ── 49.3 Duplicate pair badge ── */}
                {ds.currency_pair && (() => {
                  const dupeCount = datasets.filter((d) => d.id !== ds.id && d.currency_pair === ds.currency_pair).length;
                  if (dupeCount === 0) return null;
                  return (
                    <span title={`${dupeCount} other dataset${dupeCount > 1 ? "s" : ""} share this currency pair`}
                      style={{
                        fontFamily: S.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                        padding: "1px 6px", borderRadius: 3, flexShrink: 0, cursor: "default",
                        background: "rgba(217,119,6,0.10)", color: HEX.amber,
                        border: "1px solid rgba(217,119,6,0.30)",
                      }}>
                      ⊕ {dupeCount + 1} DATASETS
                    </span>
                  );
                })()}
              {/* ── 54.3 Risk level tag ── */}
              {(() => {
                const lvl = dsRisk[ds.id] ?? null;
                if (lvl === null) return (
                  <span
                    onClick={(e) => { e.stopPropagation(); cycleRisk(ds.id); }}
                    title="Click to assign risk level (HIGH → MEDIUM → LOW → clear)"
                    style={{ fontFamily: S.mono, fontSize: 9, color: S.text3, cursor: "pointer",
                      padding: "1px 5px", borderRadius: 3, border: `1px dashed ${S.rim}`,
                      opacity: 0.5, flexShrink: 0, letterSpacing: "0.06em",
                    }}
                  >RISK</span>
                );
                return null; // handled below when dsRisk[ds.id] set
              })()}
              {dsRisk[ds.id] && (() => {
                const lvl = dsRisk[ds.id];
                const cfg = lvl === "HIGH"
                  ? { bg: HEX.redBg, color: HEX.red, border: HEX.redBorder }
                  : lvl === "MEDIUM"
                  ? { bg: "rgba(217,119,6,0.10)", color: HEX.amber, border: "rgba(217,119,6,0.30)" }
                  : { bg: "rgba(6,182,212,0.08)", color: HEX.cyan, border: "rgba(6,182,212,0.25)" };
                return (
                  <span
                    onClick={(e) => { e.stopPropagation(); cycleRisk(ds.id); }}
                    title="Click to cycle risk level (HIGH → MEDIUM → LOW → clear)"
                    style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                      padding: "1px 6px", borderRadius: 3, cursor: "pointer", flexShrink: 0,
                      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                    }}
                  >
                    {lvl} RISK
                  </span>
                );
              })()}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 16 }}>
                {ds.currency_pair && (
                  <span style={{ fontFamily: S.mono, fontSize: 12, color: HEX.cyan }}>{ds.currency_pair}</span>
                )}
                {stats.count > 0 && (
                  <>
                    {ds.currency_pair && <span style={{ color: S.rim }}>·</span>}
                    <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>
                      {stats.count} {stats.count === 1 ? "RUN" : "RUNS"}
                    </span>
                    <span style={{
                      fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                      padding: "1px 5px", borderRadius: 2,
                      background: stats.lastVerdict ? HEX.greenBg : HEX.redBg,
                      color: stats.lastVerdict ? HEX.green : HEX.red,
                      border: `1px solid ${stats.lastVerdict ? HEX.greenBorder : HEX.redBorder}`,
                    }}>
                      {stats.lastVerdict ? "EFFECTIVE" : "INEFFECTIVE"}
                    </span>
                  </>
                )}
                {/* ── 37.3 Dataset staleness badge ── */}
                {(() => {
                  const lastRunDate = runs
                    .filter((r) => r.dataset_id === ds.id && r.created_at)
                    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0]?.created_at ?? null;
                  if (!lastRunDate) return null;
                  const days = Math.floor((Date.now() - new Date(lastRunDate).getTime()) / 86400000);
                  if (days < 7) return null;
                  const isStale = days >= 30;
                  return (
                    <span style={{
                      fontFamily: S.mono, fontSize: 9, fontWeight: 700,
                      padding: "1px 6px", borderRadius: 3,
                      background: isStale ? HEX.redBg : "rgba(217,119,6,0.10)",
                      color: isStale ? HEX.red : HEX.amber,
                      border: `1px solid ${isStale ? HEX.redBorder : "rgba(217,119,6,0.30)"}`,
                    }}>
                      {isStale ? `${days}D STALE` : `${days}D AGO`}
                    </span>
                  );
                })()}
                {/* ── 38.3 Dataset health score badge ── */}
                {(() => {
                  const dsRuns = runs.filter((r) => r.dataset_id === ds.id);
                  if (dsRuns.length === 0) return null;
                  const score = dsHealth[ds.id] ?? 0;
                  const tier = score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D";
                  const tierColor = score >= 80 ? HEX.green : score >= 60 ? HEX.cyan : score >= 40 ? HEX.amber : HEX.red;
                  const tierBg = score >= 80 ? HEX.greenBg : score >= 60 ? "rgba(6,182,212,0.10)" : score >= 40 ? "rgba(217,119,6,0.10)" : HEX.redBg;
                  const tierBorder = score >= 80 ? HEX.greenBorder : score >= 60 ? "rgba(6,182,212,0.30)" : score >= 40 ? "rgba(217,119,6,0.30)" : HEX.redBorder;
                  return (
                    <span title={`Health score: ${score}/100 (pass rate + recency + volume + stability)`} style={{
                      fontFamily: S.mono, fontSize: 9, fontWeight: 700,
                      padding: "1px 6px", borderRadius: 3,
                      background: tierBg, color: tierColor, border: `1px solid ${tierBorder}`,
                      cursor: "default",
                    }}>
                      {tier} {score}
                    </span>
                  );
                })()}
                {/* ── 47.3 Standards compliance badge ── */}
                {(() => {
                  const dsRuns = runs.filter((r) => r.dataset_id === ds.id);
                  const STDS = ["IAS_39", "IFRS_9", "ASC_815"] as const;
                  const testedCount = STDS.filter((std) => dsRuns.some((r) => r.standard === std)).length;
                  if (testedCount === 0) return null;
                  const label = testedCount === 3 ? "3/3 STD" : `${testedCount}/3 STD`;
                  const isComplete = testedCount === 3;
                  return (
                    <span title={`Tested under ${testedCount} of 3 standards (IAS 39 / IFRS 9 / ASC 815)`}
                      style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, cursor: "default",
                        padding: "1px 6px", borderRadius: 3,
                        background: isComplete ? HEX.greenBg : "rgba(139,92,246,0.10)",
                        color: isComplete ? HEX.green : "#A78BFA",
                        border: `1px solid ${isComplete ? HEX.greenBorder : "rgba(139,92,246,0.25)"}` }}>
                      {label}
                    </span>
                  );
                })()}
                {/* ── 40.3 Assessment frequency badge ── */}
                {(() => {
                  const dsRuns = runs.filter((r) => r.dataset_id === ds.id && r.created_at);
                  if (dsRuns.length < 2) return null;
                  const sorted = [...dsRuns].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
                  const firstDate = new Date(sorted[0].created_at as string);
                  const monthsSpan = Math.max(1, (Date.now() - firstDate.getTime()) / (30 * 86400000));
                  const perMonth = dsRuns.length / monthsSpan;
                  const label = perMonth >= 1 ? `${perMonth.toFixed(1)}/MO` : `${(perMonth * 30).toFixed(0)}D CADENCE`;
                  return (
                    <span title={`${dsRuns.length} runs over ${monthsSpan.toFixed(1)} months`}
                      style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700,
                        padding: "1px 6px", borderRadius: 3, cursor: "default",
                        background: "rgba(6,182,212,0.08)", color: HEX.cyan, border: "1px solid rgba(6,182,212,0.25)" }}>
                      {label}
                    </span>
                  );
                })()}
                {/* ── 39.3 Next assessment due badge ── */}
                {(() => {
                  const dsRuns = runs.filter((r) => r.dataset_id === ds.id && r.created_at);
                  if (dsRuns.length === 0) return (
                    <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                      background: "rgba(100,116,139,0.10)", color: S.text3, border: `1px solid rgba(100,116,139,0.20)` }}>
                      NOT SCHEDULED
                    </span>
                  );
                  const lastRunDate = dsRuns
                    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0].created_at as string;
                  const daysSince = Math.floor((Date.now() - new Date(lastRunDate).getTime()) / 86400000);
                  const CADENCE = 30;
                  const daysUntil = CADENCE - daysSince;
                  const isOverdue = daysUntil < 0;
                  const isDueSoon = !isOverdue && daysUntil <= 7;
                  if (!isOverdue && !isDueSoon) return null; // suppress when plenty of time left
                  return (
                    <span title={`30-day assessment cadence · Last run ${daysSince} day${daysSince !== 1 ? "s" : ""} ago`}
                      style={{
                        fontFamily: S.mono, fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                        cursor: "default",
                        background: isOverdue ? HEX.redBg : "rgba(217,119,6,0.10)",
                        color: isOverdue ? HEX.red : HEX.amber,
                        border: `1px solid ${isOverdue ? HEX.redBorder : "rgba(217,119,6,0.30)"}`,
                      }}>
                      {isOverdue ? `OVERDUE ${Math.abs(daysUntil)}D` : `DUE IN ${daysUntil}D`}
                    </span>
                  );
                })()}
                {/* ── 41.3 Last 5 runs verdict sparkline ── */}
                {(() => {
                  const recent = runs
                    .filter((r) => r.dataset_id === ds.id && r.created_at)
                    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
                    .slice(0, 5);
                  if (recent.length === 0) return null;
                  return (
                    <div title={`Last ${recent.length} run verdicts (newest → oldest)`}
                      style={{ display: "flex", alignItems: "center", gap: 2, cursor: "default" }}>
                      {recent.map((r, i) => (
                        <span key={r.run_id} title={`${r.overall_effective ? "Effective" : "Ineffective"} · ${r.created_at?.slice(0, 10) ?? ""}`}
                          style={{
                            width: 8, height: 8, borderRadius: 2, display: "inline-block",
                            background: r.overall_effective ? HEX.green : HEX.red,
                            opacity: 1 - i * 0.12,
                          }} />
                      ))}
                    </div>
                  );
                })()}
                {/* ── 42.3 Designation date / hedge age badge ── */}
                {(() => {
                  if (!ds.designation_date) return null;
                  const days = Math.floor((Date.now() - new Date(ds.designation_date).getTime()) / 86400000);
                  if (days < 0) return null;
                  const label = days >= 365
                    ? `${(days / 365).toFixed(1)}YR HEDGE`
                    : days >= 30
                    ? `${Math.floor(days / 30)}MO HEDGE`
                    : `${days}D HEDGE`;
                  return (
                    <span title={`Designated: ${ds.designation_date}`}
                      style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                        cursor: "default", background: "rgba(139,92,246,0.10)", color: "#A78BFA",
                        border: "1px solid rgba(139,92,246,0.25)" }}>
                      {label}
                    </span>
                  );
                })()}
              </div>
              {/* ── 43.3 Description preview ── */}
              {ds.description && (
                <div style={{
                  paddingLeft: 16, marginTop: 3,
                  fontFamily: S.ui, fontSize: 11, color: S.text3,
                  maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  fontStyle: "italic",
                }}>
                  {ds.description}
                </div>
              )}
            </div>
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.text2 }}>
              {ds.period_count}
            </span>
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>
              {ds.hedge_type.replace(/_/g, " ").toUpperCase()}
            </span>
            <span style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.08em",
              padding: "2px 6px", borderRadius: 2, background: S.sub, color: S.text3,
            }}>
              {ds.source.toUpperCase()}
            </span>
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, display: "flex", flexDirection: "column", gap: 2 }}>
              {ds.created_at ? new Date(ds.created_at).toLocaleDateString() : "\u2014"}
              {/* ── 46.3 Relative age chip ── */}
              {ds.created_at && (() => {
                const days = Math.floor((Date.now() - new Date(ds.created_at).getTime()) / 86400000);
                const label = days === 0 ? "TODAY" : days === 1 ? "1D AGO" : days < 30 ? `${days}D AGO` : days < 365 ? `${Math.floor(days / 30)}MO AGO` : `${(days / 365).toFixed(1)}YR AGO`;
                return (
                  <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 600, color: days === 0 ? HEX.green : S.text3,
                    letterSpacing: "0.05em" }}>
                    {label}
                  </span>
                );
              })()}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={(e) => openEdit(ds, e)}
                title="Edit metadata"
                style={{
                  width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: `1px solid ${S.soft}`, borderRadius: 3, cursor: "pointer",
                  color: S.text3, flexShrink: 0, transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = HEX.cyan; e.currentTarget.style.color = HEX.cyan; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = S.soft; e.currentTarget.style.color = HEX.text3; }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              {/* 29.2 — Clone dataset */}
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  setCloningId(ds.id);
                  await onCloneDataset(ds.id);
                  setCloningId(null);
                }}
                disabled={cloningId === ds.id}
                title="Clone dataset"
                style={{
                  width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: `1px solid ${S.soft}`, borderRadius: 3,
                  cursor: cloningId === ds.id ? "not-allowed" : "pointer",
                  color: S.text3, flexShrink: 0, transition: "all 0.15s",
                  opacity: cloningId === ds.id ? 0.5 : 1,
                }}
                onMouseEnter={(e) => { if (cloningId !== ds.id) { e.currentTarget.style.borderColor = HEX.amber; e.currentTarget.style.color = HEX.amber; } }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = S.soft; e.currentTarget.style.color = HEX.text3; }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRunAssessment(ds.id); }}
                disabled={submitting}
                style={{
                  fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                  padding: "7px 16px", borderRadius: 3, cursor: submitting ? "not-allowed" : "pointer",
                  background: HEX.cyan, color: "#fff", border: "none",
                  opacity: submitting ? 0.5 : 1,
                  boxShadow: "0 1px 4px rgba(28,98,242,0.15)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.boxShadow = "0 2px 10px rgba(28,98,242,0.25)"; }}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = "0 1px 4px rgba(28,98,242,0.15)"}
              >
                {submitting ? "RUNNING..." : "RUN ASSESSMENT"}
              </button>
            </div>
          </div>

          {/* Accordion expand — edit form or last 3 runs */}
          {(expandAll || expandedId === ds.id) && (() => {
            const allDsRuns = [...runs]
              .filter((r) => r.dataset_id === ds.id)
              .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")); // oldest first
            const dsRuns = [...allDsRuns].reverse().slice(0, 3); // newest first for table
            return (
              <div style={{
                borderTop: `1px solid ${S.rim}`,
                background: S.sub, padding: "12px 20px",
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                {/* ── 51.3 Recent runs mini-timeline ── */}
                {allDsRuns.length > 0 && (() => {
                  const MAX_CELLS = 20;
                  const cells = allDsRuns.slice(-MAX_CELLS); // last N, oldest→newest
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 8, borderBottom: `1px solid ${S.rim}`, marginBottom: 2 }}>
                      <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: S.text3, letterSpacing: "0.10em", flexShrink: 0 }}>
                        RUNS
                      </span>
                      <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                        {cells.map((r, i) => {
                          const label = r.overall_effective ? "PASS" : "FAIL";
                          const bg = r.overall_effective ? `rgba(34,197,94,0.55)` : `rgba(239,68,68,0.55)`;
                          const border = r.overall_effective ? HEX.greenBorder : HEX.redBorder;
                          const tip = [r.created_at ? r.created_at.slice(0, 10) : "", label, r.standard ? r.standard.replace("_", " ") : ""].filter(Boolean).join(" · ");
                          return (
                            <div
                              key={r.run_id + i}
                              title={tip}
                              style={{
                                width: 10, height: 14, borderRadius: 2,
                                background: bg, border: `1px solid ${border}`,
                                cursor: "default", flexShrink: 0,
                              }}
                            />
                          );
                        })}
                      </div>
                      <span style={{ fontFamily: S.mono, fontSize: 9, color: S.text3 }}>
                        ({allDsRuns.length} total{allDsRuns.length > MAX_CELLS ? `, last ${MAX_CELLS} shown` : ""})
                      </span>
                    </div>
                  );
                })()}
                {/* ── 27.2 Edit metadata strip ── */}
                {editingDsId === ds.id && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 0 14px", borderBottom: `1px solid ${S.rim}`, marginBottom: 8 }}>
                    <div style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: HEX.cyan, letterSpacing: "0.14em" }}>
                      EDIT METADATA
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "2 1 200px" }}>
                        <label style={{ fontFamily: S.mono, fontSize: 10, color: S.text3, letterSpacing: "0.1em" }}>NAME</label>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{
                            fontFamily: S.ui, fontSize: 12, padding: "6px 10px", borderRadius: 3,
                            border: `1px solid ${S.soft}`, background: S.panel, color: S.text1, outline: "none",
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = HEX.cyan}
                          onBlur={(e) => e.currentTarget.style.borderColor = S.soft}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 100px" }}>
                        <label style={{ fontFamily: S.mono, fontSize: 10, color: S.text3, letterSpacing: "0.1em" }}>CURRENCY PAIR</label>
                        <input
                          value={editPair}
                          onChange={(e) => setEditPair(e.target.value)}
                          placeholder="EUR/USD"
                          style={{
                            fontFamily: S.mono, fontSize: 12, padding: "6px 10px", borderRadius: 3,
                            border: `1px solid ${S.soft}`, background: S.panel, color: S.text1, outline: "none",
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = HEX.cyan}
                          onBlur={(e) => e.currentTarget.style.borderColor = S.soft}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 110px" }}>
                        <label style={{ fontFamily: S.mono, fontSize: 10, color: S.text3, letterSpacing: "0.1em" }}>DESIGNATION DATE</label>
                        <input
                          value={editDesig}
                          onChange={(e) => setEditDesig(e.target.value)}
                          placeholder="YYYY-MM-DD"
                          style={{
                            fontFamily: S.mono, fontSize: 12, padding: "6px 10px", borderRadius: 3,
                            border: `1px solid ${S.soft}`, background: S.panel, color: S.text1, outline: "none",
                          }}
                          onFocus={(e) => e.currentTarget.style.borderColor = HEX.cyan}
                          onBlur={(e) => e.currentTarget.style.borderColor = S.soft}
                        />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        disabled={saving || !editName.trim()}
                        onClick={() => saveEdit(ds.id)}
                        style={{
                          fontFamily: S.mono, fontSize: 11, fontWeight: 700, padding: "5px 14px", borderRadius: 3,
                          background: HEX.cyan, color: "#fff", border: "none",
                          cursor: saving || !editName.trim() ? "not-allowed" : "pointer",
                          opacity: saving || !editName.trim() ? 0.6 : 1,
                        }}
                      >
                        {saving ? "SAVING…" : "SAVE"}
                      </button>
                      <button
                        onClick={() => setEditingDsId(null)}
                        style={{
                          fontFamily: S.mono, fontSize: 11, padding: "5px 12px", borderRadius: 3,
                          background: "transparent", color: S.text3, border: `1px solid ${S.soft}`, cursor: "pointer",
                        }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                )}
                {/* ── 31.3 Dataset statistics summary ── */}
                {dsRuns.length >= 1 && (() => {
                  const ratios = dsRuns.map((r) => r.dollar_offset_ratio).filter((v): v is number => v != null);
                  if (ratios.length === 0) return null;
                  const mean = ratios.reduce((s, v) => s + v, 0) / ratios.length;
                  const stdDev = Math.sqrt(ratios.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / ratios.length);
                  const min = Math.min(...ratios);
                  const max = Math.max(...ratios);
                  const passCount = dsRuns.filter((r) => r.overall_effective).length;
                  const stats = [
                    { label: "MEAN D.O.", value: mean.toFixed(4), color: mean >= 0.80 && mean <= 1.25 ? HEX.green : HEX.red },
                    { label: "STD DEV", value: stdDev.toFixed(4), color: stdDev < 0.05 ? HEX.green : stdDev < 0.10 ? HEX.amber : HEX.red },
                    { label: "MIN", value: min.toFixed(4), color: min >= 0.80 ? HEX.green : HEX.red },
                    { label: "MAX", value: max.toFixed(4), color: max <= 1.25 ? HEX.green : HEX.red },
                    { label: "PASS RATE", value: `${Math.round((passCount / dsRuns.length) * 100)}%`, color: passCount === dsRuns.length ? HEX.green : passCount > 0 ? HEX.amber : HEX.red },
                  ];
                  return (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      {stats.map(({ label, value, color }) => (
                        <div key={label} style={{
                          padding: "6px 10px", borderRadius: 3,
                          background: S.sub, border: `1px solid ${S.rim}`,
                          display: "flex", flexDirection: "column", gap: 2, minWidth: 70,
                        }}>
                          <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: S.text3, letterSpacing: "0.10em" }}>{label}</span>
                          <span style={{ fontFamily: S.mono, fontSize: 13, fontWeight: 800, color }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* ── 36.2 Multi-standard breakdown table ── */}
                {dsRuns.length >= 2 && (() => {
                  const stdGroups = dsRuns.reduce<Record<string, { total: number; effective: number; ratios: number[] }>>((acc, r) => {
                    if (!acc[r.standard]) acc[r.standard] = { total: 0, effective: 0, ratios: [] };
                    acc[r.standard].total++;
                    if (r.overall_effective) acc[r.standard].effective++;
                    if (r.dollar_offset_ratio != null) acc[r.standard].ratios.push(r.dollar_offset_ratio);
                    return acc;
                  }, {});
                  const stdKeys = Object.keys(stdGroups);
                  if (stdKeys.length < 2) return null;
                  const STD_LABELS: Record<string, string> = { IAS_39: "IAS 39", IFRS_9: "IFRS 9", ASC_815: "ASC 815" };
                  return (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 6 }}>
                        BY STANDARD
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stdKeys.length}, 1fr)`, gap: 8 }}>
                        {stdKeys.map((std) => {
                          const g = stdGroups[std];
                          const passRate = Math.round((g.effective / g.total) * 100);
                          const passColor = passRate >= 80 ? HEX.green : passRate >= 60 ? HEX.amber : HEX.red;
                          const avgDo = g.ratios.length > 0 ? g.ratios.reduce((s, v) => s + v, 0) / g.ratios.length : null;
                          return (
                            <div key={std} style={{ padding: "8px 12px", borderRadius: 4, background: S.sub, border: `1px solid ${S.rim}` }}>
                              <div style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: HEX.cyan, letterSpacing: "0.1em", marginBottom: 4 }}>
                                {STD_LABELS[std] ?? std}
                              </div>
                              <div style={{ fontFamily: S.mono, fontSize: 18, fontWeight: 800, color: passColor, lineHeight: 1, marginBottom: 2 }}>
                                {passRate}%
                              </div>
                              <div style={{ fontFamily: S.ui, fontSize: 10, color: S.text3, marginBottom: 2 }}>
                                {g.effective}/{g.total} effective
                              </div>
                              {avgDo != null && (
                                <div style={{ fontFamily: S.mono, fontSize: 10, color: S.text2 }}>
                                  D.O. {avgDo.toFixed(4)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                <div style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 4 }}>
                  ASSESSMENT HISTORY
                </div>
                {dsRuns.length === 0 ? (
                  <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>No runs yet for this dataset.</span>
                ) : dsRuns.map((r) => (
                  <div key={r.run_id} style={{
                    display: "grid", gridTemplateColumns: "auto 1fr auto auto auto",
                    gap: 10, alignItems: "center",
                    padding: "7px 12px", borderRadius: 3,
                    background: S.panel, border: `1px solid ${S.rim}`,
                    cursor: "pointer", transition: "border-color 0.12s",
                  }}
                    onClick={(e) => { e.stopPropagation(); onNavigateRun(r.run_id); }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = HEX.cyan + "40"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = HEX.border}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: r.overall_effective ? HEX.green : HEX.red,
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                      color: r.overall_effective ? HEX.green : HEX.red,
                    }}>
                      {r.overall_effective ? "EFFECTIVE" : "INEFFECTIVE"}
                    </span>
                    <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>{r.standard}</span>
                    <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>
                      D.O. {r.dollar_offset_ratio?.toFixed(4) ?? "N/A"}
                    </span>
                    <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                    </span>
                  </div>
                ))}

                {/* ── 29.3 D.O. trend sparkline ── */}
                {(() => {
                  const allDsRuns = [...runs]
                    .filter((r) => r.dataset_id === ds.id && r.dollar_offset_ratio != null)
                    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
                  if (allDsRuns.length < 2) return null;
                  const xData = allDsRuns.map((r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : r.run_id.slice(0,6));
                  const yData = allDsRuns.map((r) => +(r.dollar_offset_ratio!.toFixed(4)));
                  return (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${S.rim}` }}>
                      <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 4 }}>
                        D.O. RATIO TREND
                      </div>
                      <ReactECharts
                        opts={{ renderer: "svg", height: 80 }}
                        style={{ height: 80 }}
                        option={{
                          animation: false,
                          grid: { top: 8, bottom: 18, left: 48, right: 12 },
                          xAxis: {
                            type: "category", data: xData,
                            axisLabel: { fontFamily: S.mono, fontSize: 9, color: HEX.text3 },
                            axisLine: { lineStyle: { color: HEX.border } },
                            axisTick: { show: false },
                          },
                          yAxis: {
                            type: "value",
                            min: (v: { min: number }) => +Math.min(v.min * 0.95, 0.75).toFixed(2),
                            max: (v: { max: number }) => +Math.max(v.max * 1.05, 1.30).toFixed(2),
                            axisLabel: { fontFamily: S.mono, fontSize: 9, color: HEX.text3, formatter: (v: number) => v.toFixed(2) },
                            axisLine: { show: false }, axisTick: { show: false },
                            splitLine: { lineStyle: { color: HEX.border, type: "dashed" } },
                          },
                          series: [
                            // Effective band [0.80, 1.25]
                            { type: "line", data: xData.map(() => 0.80), lineStyle: { color: HEX.green, type: "dashed", width: 1 }, symbol: "none", silent: true },
                            { type: "line", data: xData.map(() => 1.25), lineStyle: { color: HEX.green, type: "dashed", width: 1 }, symbol: "none", silent: true },
                            {
                              type: "line",
                              data: yData,
                              smooth: true,
                              lineStyle: { color: HEX.cyan, width: 2 },
                              symbol: "circle", symbolSize: 5,
                              itemStyle: {
                                color: (params: { data: number }) =>
                                  params.data >= 0.80 && params.data <= 1.25 ? HEX.green : HEX.red,
                              },
                              areaStyle: { color: `${HEX.cyan}14` },
                            },
                          ],
                          tooltip: {
                            trigger: "axis",
                            formatter: (params: Array<{ name: string; value: number; seriesIndex: number }>) => {
                              const p = params.find((x) => x.seriesIndex === 2);
                              if (!p) return "";
                              const inBand = p.value >= 0.80 && p.value <= 1.25;
                              return `<span style="font-family:monospace;font-size:11px">${p.name}<br/><b style="color:${inBand ? HEX.green : HEX.red}">D.O. ${p.value.toFixed(4)}</b></span>`;
                            },
                          },
                        }}
                      />
                    </div>
                  );
                })()}

                {/* ── 28.2 Period data viewer ── */}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${S.rim}` }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleViewData(ds.id); }}
                    style={{
                      fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                      padding: "3px 10px", borderRadius: 2, cursor: "pointer",
                      background: viewDataId === ds.id ? "rgba(28,98,242,0.08)" : "transparent",
                      color: viewDataId === ds.id ? HEX.cyan : S.text3,
                      border: `1px solid ${viewDataId === ds.id ? "rgba(28,98,242,0.25)" : S.rim}`,
                      transition: "all 0.12s",
                    }}
                  >
                    {viewDataId === ds.id ? "HIDE DATA" : "VIEW DATA"}
                  </button>
                  {viewDataId === ds.id && (
                    <div style={{ marginTop: 8 }}>
                      {loadingPeriods && !periodsCache[ds.id] ? (
                        <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>Loading…</span>
                      ) : (periodsCache[ds.id] ?? []).length === 0 ? (
                        <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>No period data found.</span>
                      ) : (
                        <div style={{ overflow: "auto", maxHeight: 240, borderRadius: 3, border: `1px solid ${S.rim}` }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.mono, fontSize: 11 }}>
                            <thead>
                              <tr style={{ background: S.sub }}>
                                {["#", "DATE", "HEDGED FV Δ", "INSTRUMENT FV Δ", "CUM D.O."].map((h) => (
                                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: S.text3, letterSpacing: "0.08em", borderBottom: `1px solid ${S.rim}`, whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                let cumHedged = 0; let cumInstr = 0;
                                return (periodsCache[ds.id] ?? []).map((p) => {
                                  cumHedged += p.hedged_item_fv_change;
                                  cumInstr += p.instrument_fv_change;
                                  const cumDO = cumHedged !== 0 ? Math.abs(cumInstr / cumHedged) : null;
                                  const inBand = cumDO != null && cumDO >= 0.80 && cumDO <= 1.25;
                                  return (
                                    <tr key={p.period_index} style={{ borderBottom: `1px solid ${S.rim}` }}
                                      onMouseEnter={(e) => (e.currentTarget.style.background = S.sub)}
                                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                    >
                                      <td style={{ padding: "5px 10px", color: S.text3 }}>{p.period_index + 1}</td>
                                      <td style={{ padding: "5px 10px", color: S.text2 }}>{p.period_date ?? "—"}</td>
                                      <td style={{ padding: "5px 10px", color: p.hedged_item_fv_change >= 0 ? HEX.green : HEX.red, fontWeight: 600 }}>
                                        {p.hedged_item_fv_change >= 0 ? "+" : ""}{p.hedged_item_fv_change.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </td>
                                      <td style={{ padding: "5px 10px", color: p.instrument_fv_change >= 0 ? HEX.green : HEX.red, fontWeight: 600 }}>
                                        {p.instrument_fv_change >= 0 ? "+" : ""}{p.instrument_fv_change.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </td>
                                      <td style={{ padding: "5px 10px", color: cumDO == null ? S.text3 : inBand ? HEX.green : HEX.red, fontWeight: 700 }}>
                                        {cumDO != null ? cumDO.toFixed(4) : "—"}
                                      </td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── 25.3 Dataset sticky note ── */}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${S.rim}` }}>
                  {editingNoteId === ds.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <textarea
                        autoFocus
                        value={draftNote}
                        onChange={(e) => setDraftNote(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditingNoteId(null); } }}
                        rows={3}
                        placeholder="Add an analyst note for this dataset…"
                        style={{
                          fontFamily: S.ui, fontSize: 12, color: S.text1, background: S.panel,
                          border: `1px solid ${HEX.cyan}40`, borderRadius: 3, padding: "8px 10px",
                          resize: "vertical", outline: "none", width: "100%",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); saveNote(ds.id); }}
                          style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 3, background: HEX.cyan, color: "#fff", border: "none", cursor: "pointer" }}
                        >SAVE</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingNoteId(null); }}
                          style={{ fontFamily: S.mono, fontSize: 11, padding: "4px 10px", borderRadius: 3, background: "transparent", color: S.text3, border: `1px solid ${S.rim}`, cursor: "pointer" }}
                        >Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDraftNote(dsNotes[ds.id] ?? ""); setEditingNoteId(ds.id); }}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 8, width: "100%", background: "transparent",
                        border: `1px dashed ${dsNotes[ds.id] ? HEX.amber + "60" : S.rim}`,
                        borderRadius: 3, padding: "7px 10px", cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={dsNotes[ds.id] ? HEX.amber : S.text3} strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      <span style={{ fontFamily: S.ui, fontSize: 11, color: dsNotes[ds.id] ? S.text1 : S.text3, fontStyle: dsNotes[ds.id] ? "normal" : "italic" }}>
                        {dsNotes[ds.id] || "Add analyst note…"}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// UPLOAD / NEW ASSESSMENT TAB
// ═════════════════════════════════════════════════════════════════════════════

function UploadTab({
  formName, setFormName, formPair, setFormPair,
  formHedgeType, setFormHedgeType, formStandard, setFormStandard,
  formPeriods, addPeriod, removePeriod, updatePeriod,
  handleSubmit, submitting,
  csvFile, setCsvFile, csvName, setCsvName, csvPair, setCsvPair,
  handleCsvUpload,
}: {
  formName: string; setFormName: (v: string) => void;
  formPair: string; setFormPair: (v: string) => void;
  formHedgeType: string; setFormHedgeType: (v: string) => void;
  formStandard: string; setFormStandard: (v: string) => void;
  formPeriods: PeriodRow[];
  addPeriod: () => void; removePeriod: (i: number) => void;
  updatePeriod: (i: number, f: keyof PeriodRow, v: string) => void;
  handleSubmit: () => void; submitting: boolean;
  csvFile: File | null; setCsvFile: (f: File | null) => void;
  csvName: string; setCsvName: (v: string) => void;
  csvPair: string; setCsvPair: (v: string) => void;
  handleCsvUpload: () => void;
}) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<"manual" | "csv">("manual");

  const inputStyle: React.CSSProperties = {
    fontFamily: S.mono, fontSize: 12, padding: "8px 12px",
    border: `1px solid ${S.soft}`, borderRadius: 4,
    background: S.deep, color: S.text1, outline: "none",
    width: "100%", transition: "border-color 0.15s",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle, appearance: "none" as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
    paddingRight: 30,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: S.mono, fontSize: 12, fontWeight: 700,
    letterSpacing: "0.14em", color: S.text3, marginBottom: 6, display: "block",
  };

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["manual", "csv"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: mode === m ? 700 : 500,
              letterSpacing: "0.1em", padding: "8px 20px", borderRadius: 4,
              cursor: "pointer",
              background: mode === m ? "rgba(28,98,242,0.06)" : "transparent",
              color: mode === m ? HEX.cyan : S.text3,
              border: `1px solid ${mode === m ? "rgba(28,98,242,0.2)" : S.rim}`,
              transition: "all 0.15s",
            }}
          >
            {m === "manual" ? "MANUAL ENTRY" : "CSV UPLOAD"}
          </button>
        ))}
      </div>

      {/* Config row */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16,
        marginBottom: 20, padding: 20, background: S.panel, borderRadius: 6,
        border: `1px solid ${S.rim}`,
      }}>
        <div>
          <label style={labelStyle}>DATASET NAME</label>
          <input
            value={mode === "manual" ? formName : csvName}
            onChange={(e) => mode === "manual" ? setFormName(e.target.value) : setCsvName(e.target.value)}
            placeholder="Q4 2025 EURUSD"
            style={inputStyle}
            onFocus={(e) => e.currentTarget.style.borderColor = HEX.cyan}
            onBlur={(e) => e.currentTarget.style.borderColor = HEX.border}
          />
        </div>
        <div>
          <label style={labelStyle}>CURRENCY PAIR</label>
          <input
            value={mode === "manual" ? formPair : csvPair}
            onChange={(e) => mode === "manual" ? setFormPair(e.target.value) : setCsvPair(e.target.value)}
            placeholder="EURUSD"
            style={inputStyle}
            onFocus={(e) => e.currentTarget.style.borderColor = HEX.cyan}
            onBlur={(e) => e.currentTarget.style.borderColor = HEX.border}
          />
        </div>
        <div>
          <label style={labelStyle}>HEDGE TYPE</label>
          <select value={formHedgeType} onChange={(e) => setFormHedgeType(e.target.value)} style={selectStyle}>
            <option value="cash_flow">Cash Flow</option>
            <option value="fair_value">Fair Value</option>
            <option value="net_investment">Net Investment</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>STANDARD</label>
          <select value={formStandard} onChange={(e) => setFormStandard(e.target.value)} style={selectStyle}>
            <option value="ASC_815">ASC 815 (US GAAP)</option>
            <option value="IFRS_9">IFRS 9</option>
            <option value="IAS_39">IAS 39</option>
          </select>
        </div>
      </div>

      {mode === "csv" ? (
        <div style={{
          padding: 28, background: S.panel, borderRadius: 6, border: `1px solid ${S.rim}`,
        }}>
          <div style={{
            fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3,
            letterSpacing: "0.14em", marginBottom: 14,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={HEX.cyan} strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
            UPLOAD CSV FILE
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
            <p style={{ fontFamily: S.ui, fontSize: 12, color: S.text3, margin: 0, lineHeight: 1.6 }}>
              CSV must contain columns: <code style={{ fontFamily: S.mono, fontSize: 12, color: S.text2, background: S.sub, padding: "1px 4px", borderRadius: 2 }}>hedged_item_fv_change</code>,{" "}
              <code style={{ fontFamily: S.mono, fontSize: 12, color: S.text2, background: S.sub, padding: "1px 4px", borderRadius: 2 }}>instrument_fv_change</code>.
              Optional: <code style={{ fontFamily: S.mono, fontSize: 12, color: S.text2, background: S.sub, padding: "1px 4px", borderRadius: 2 }}>period_date</code>.
            </p>
            <button
              onClick={() => {
                const template = [
                  "period_date,hedged_item_fv_change,instrument_fv_change",
                  "2025-01-31,-15000,14800",
                  "2025-02-28,-12000,11900",
                  "2025-03-31,-8500,8200",
                  "2025-04-30,-10200,9900",
                  "2025-05-31,-13400,13100",
                ].join("\n");
                const url = URL.createObjectURL(new Blob([template], { type: "text/csv" }));
                const a = document.createElement("a");
                a.href = url; a.download = "hedge-effectiveness-template.csv";
                document.body.appendChild(a); a.click(); a.remove();
                URL.revokeObjectURL(url);
              }}
              style={{
                fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                padding: "5px 12px", borderRadius: 3, cursor: "pointer", flexShrink: 0,
                background: "transparent", color: HEX.cyan,
                border: `1px solid rgba(28,98,242,0.25)`,
                display: "flex", alignItems: "center", gap: 5,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(28,98,242,0.04)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              DOWNLOAD TEMPLATE
            </button>
          </div>

          {/* Drop zone */}
          <div style={{
            border: `2px dashed ${csvFile ? HEX.cyan : S.rim}`,
            borderRadius: 6, padding: "32px 20px", textAlign: "center",
            background: csvFile ? "rgba(28,98,242,0.02)" : "transparent",
            transition: "all 0.15s", marginBottom: 20,
          }}>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
              id="csv-upload"
            />
            <label htmlFor="csv-upload" style={{ cursor: "pointer" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={csvFile ? HEX.cyan : HEX.text3} strokeWidth="1.5" style={{ marginBottom: 8 }}>
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              <div style={{ fontFamily: S.mono, fontSize: 12, color: csvFile ? HEX.cyan : S.text3 }}>
                {csvFile ? csvFile.name : "Click to select CSV file"}
              </div>
            </label>
          </div>

          <button
            onClick={handleCsvUpload}
            disabled={submitting || !csvFile}
            style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
              padding: "10px 28px", borderRadius: 4,
              background: csvFile ? HEX.cyan : S.sub, color: csvFile ? "#fff" : S.text3,
              border: "none", cursor: csvFile && !submitting ? "pointer" : "not-allowed",
              opacity: submitting ? 0.5 : 1,
              boxShadow: csvFile ? "0 2px 8px rgba(28,98,242,0.2)" : "none",
            }}
          >
            {submitting ? "UPLOADING..." : "UPLOAD & CREATE DATASET"}
          </button>
        </div>
      ) : (
        <div style={{
          padding: 24, background: S.panel, borderRadius: 6, border: `1px solid ${S.rim}`,
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14,
          }}>
            <span style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3,
              letterSpacing: "0.14em", display: "flex", alignItems: "center", gap: 8,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={HEX.cyan} strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18"/>
              </svg>
              FAIR VALUE CHANGES ({formPeriods.length} PERIODS)
            </span>
            <button onClick={addPeriod} style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 700, padding: "5px 12px",
              borderRadius: 3, background: S.sub, color: S.text2,
              border: `1px solid ${S.rim}`, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
              transition: "all 0.15s",
            }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = HEX.cyan}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = HEX.border}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              ADD PERIOD
            </button>
          </div>

          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "48px 1fr 1fr 1fr 32px", gap: 8,
            marginBottom: 6, padding: "0 4px",
          }}>
            {["#", "DATE (OPTIONAL)", "HEDGED ITEM \u0394FV", "INSTRUMENT \u0394FV", ""].map((h) => (
              <span key={h} style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
                {h}
              </span>
            ))}
          </div>

          {/* Period rows */}
          {formPeriods.map((p, i) => {
            const hedgedVal = p.hedged_item_fv_change.trim();
            const instrVal = p.instrument_fv_change.trim();
            const hedgedInvalid = hedgedVal !== "" && isNaN(parseFloat(hedgedVal));
            const instrInvalid = instrVal !== "" && isNaN(parseFloat(instrVal));
            return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "48px 1fr 1fr 1fr 32px", gap: 8,
              marginBottom: 6, alignItems: "center",
            }}>
              <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.text3, textAlign: "center" }}>
                {i + 1}
              </span>
              <input
                value={p.period_date}
                onChange={(e) => updatePeriod(i, "period_date", e.target.value)}
                placeholder="2025-01-31"
                style={{ ...inputStyle, fontSize: 12, padding: "6px 10px" }}
                onFocus={(e) => e.currentTarget.style.borderColor = HEX.cyan}
                onBlur={(e) => e.currentTarget.style.borderColor = HEX.border}
              />
              <input
                value={p.hedged_item_fv_change}
                onChange={(e) => updatePeriod(i, "hedged_item_fv_change", e.target.value)}
                placeholder="e.g. -15000"
                style={{
                  ...inputStyle, fontSize: 12, padding: "6px 10px",
                  borderColor: hedgedInvalid ? HEX.red : undefined,
                }}
                onFocus={(e) => { if (!hedgedInvalid) e.currentTarget.style.borderColor = HEX.cyan; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = hedgedInvalid ? HEX.red : HEX.border; }}
              />
              <input
                value={p.instrument_fv_change}
                onChange={(e) => updatePeriod(i, "instrument_fv_change", e.target.value)}
                placeholder="e.g. 14200"
                style={{
                  ...inputStyle, fontSize: 12, padding: "6px 10px",
                  borderColor: instrInvalid ? HEX.red : undefined,
                }}
                onFocus={(e) => { if (!instrInvalid) e.currentTarget.style.borderColor = HEX.cyan; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = instrInvalid ? HEX.red : HEX.border; }}
              />
              <button
                onClick={() => removePeriod(i)}
                disabled={formPeriods.length <= 2}
                style={{
                  fontFamily: S.mono, fontSize: 14, color: formPeriods.length <= 2 ? S.text3 : HEX.red,
                  background: "transparent", border: "none",
                  cursor: formPeriods.length <= 2 ? "not-allowed" : "pointer",
                  opacity: formPeriods.length <= 2 ? 0.3 : 0.7,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => { if (formPeriods.length > 2) e.currentTarget.style.opacity = "1"; }}
                onMouseLeave={(e) => { if (formPeriods.length > 2) e.currentTarget.style.opacity = "0.7"; }}
              >
                \u00D7
              </button>
            </div>
            );
          })}

          {/* Live D.O. ratio preview */}
          {(() => {
            const valid = formPeriods.filter((p) => p.hedged_item_fv_change.trim() !== "" && p.instrument_fv_change.trim() !== "");
            if (valid.length < 2) return null;
            const cumHedged = valid.reduce((s, p) => s + parseFloat(p.hedged_item_fv_change || "0"), 0);
            const cumInstr = valid.reduce((s, p) => s + parseFloat(p.instrument_fv_change || "0"), 0);
            if (cumHedged === 0) return null;
            const ratio = Math.abs(cumInstr) / Math.abs(cumHedged);
            const inBand = ratio >= 0.80 && ratio <= 1.25;
            return (
              <div style={{
                marginTop: 10, padding: "10px 16px", borderRadius: 4,
                background: inBand ? HEX.greenBg : HEX.redBg,
                border: `1px solid ${inBand ? HEX.greenBorder : HEX.redBorder}`,
                display: "flex", alignItems: "center", gap: 14,
              }}>
                <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>
                  LIVE PREVIEW
                </span>
                <span style={{ fontFamily: S.mono, fontSize: 13, fontWeight: 800, color: inBand ? HEX.green : HEX.red }}>
                  D.O. {ratio.toFixed(4)}
                </span>
                <span style={{
                  fontFamily: S.mono, fontSize: 11, fontWeight: 700,
                  padding: "2px 8px", borderRadius: 2,
                  background: inBand ? HEX.green : HEX.red, color: "#fff",
                }}>
                  {inBand ? "IN BAND (0.80–1.25)" : "OUT OF BAND"}
                </span>
                <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>
                  {valid.length} of {formPeriods.length} periods filled
                </span>
              </div>
            );
          })()}

          {/* Submit */}
          <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                padding: "11px 28px", borderRadius: 4,
                background: HEX.cyan, color: "#fff", border: "none",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.5 : 1,
                boxShadow: "0 2px 8px rgba(28,98,242,0.2)",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.boxShadow = "0 4px 16px rgba(28,98,242,0.3)"; }}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = "0 2px 8px rgba(28,98,242,0.2)"}
            >
              {submitting ? "RUNNING..." : "CREATE DATASET & RUN ASSESSMENT"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// RUNS TAB
// ═════════════════════════════════════════════════════════════════════════════

type SortKey = "dataset" | "do_ratio" | "r2" | "verdict" | "date" | null;

const STARRED_KEY = "hec_starred_runs";

function RunsTab({ runs, onNavigateRun, onDeleteRuns, token }: { runs: Run[]; onNavigateRun: (id: string) => void; onDeleteRuns: (ids: string[]) => Promise<void>; token: string }) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [stdFilter, setStdFilter] = useState("ALL");
  const [verdictFilter, setVerdictFilter] = useState<"ALL" | "EFFECTIVE" | "INEFFECTIVE">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [showR2Only, setShowR2Only] = useState(false); // ── 51.2
  const [starredIds, setStarredIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(STARRED_KEY) || "[]")); }
    catch { return new Set(); }
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // ── 28.1 Bulk tag ──
  const [tagBulkOpen, setTagBulkOpen] = useState(false);
  const applyBulkTag = (tag: TagValue, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = { ...tags };
    for (const id of selectedIds) {
      if (tag === null) delete next[id];
      else next[id] = tag;
    }
    setTags(next);
    localStorage.setItem(TAGS_KEY, JSON.stringify(next));
    setTagBulkOpen(false);
  };
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [doMin, setDoMin] = useState("");
  const [doMax, setDoMax] = useState("");
  const [density, setDensity] = useState<"compact" | "normal">("normal");
  const [page, setPage] = useState(1);
  // ── 38.2 Dynamic page size ──
  const [pageSize, setPageSize] = useState<25 | 50 | 0>(25);
  const [groupByDataset, setGroupByDataset] = useState(false);
  const [copyIdsFlash, setCopyIdsFlash] = useState(false); // ── 54.2
  // ── Column visibility ──
  const [colVis, setColVis] = useState({ standard: true, do_ratio: true, r2: true, verdict: true, date: true });
  const [showColMenu, setShowColMenu] = useState(false);
  const toggleCol = (k: keyof typeof colVis) => setColVis((v) => ({ ...v, [k]: !v[k] }));
  // ── Hover popover ──
  const [hoverId, setHoverId] = useState<string | null>(null);
  // ── 26.1 Tag filter ──
  const [tagFilter, setTagFilter] = useState<"ALL" | "REVIEW" | "APPROVED" | "FLAGGED">("ALL");

  // ── 25.1 Keyboard navigation ──
  const [focusIdx, setFocusIdx] = useState<number>(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // ── 25.2 Quick tags ──
  const TAGS_KEY = "hec_run_tags";
  type TagValue = "REVIEW" | "APPROVED" | "FLAGGED" | null;
  const TAG_COLORS: Record<NonNullable<TagValue>, { bg: string; color: string; border: string }> = {
    REVIEW:   { bg: "rgba(217,119,6,0.10)",  color: HEX.amber,  border: "rgba(217,119,6,0.30)"  },
    APPROVED: { bg: HEX.greenBg,              color: HEX.green,  border: HEX.greenBorder          },
    FLAGGED:  { bg: HEX.redBg,               color: HEX.red,    border: HEX.redBorder            },
  };
  const [tags, setTags] = useState<Record<string, TagValue>>(() => {
    try { return JSON.parse(localStorage.getItem(TAGS_KEY) || "{}"); }
    catch { return {}; }
  });
  const [tagMenuId, setTagMenuId] = useState<string | null>(null);
  const cycleTag = (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTagMenuId((v) => v === runId ? null : runId);
  };
  const applyTag = (runId: string, tag: TagValue, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = { ...tags, [runId]: tag };
    if (tag === null) delete next[runId];
    setTags(next);
    localStorage.setItem(TAGS_KEY, JSON.stringify(next));
    setTagMenuId(null);
  };


  // ── 30.1 Per-run analyst notes ──
  const RUN_NOTES_KEY = "hec_run_notes";
  const [runNotes, setRunNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(RUN_NOTES_KEY) || "{}"); }
    catch { return {}; }
  });
  const [editNoteRunId, setEditNoteRunId] = useState<string | null>(null);
  const saveRunNote = (runId: string, text: string) => {
    const next = { ...runNotes };
    if (text.trim()) next[runId] = text.trim();
    else delete next[runId];
    setRunNotes(next);
    localStorage.setItem(RUN_NOTES_KEY, JSON.stringify(next));
    setEditNoteRunId(null);
  };

  // ── 33.1 Pin-to-top runs ──
  const PINNED_KEY = "hec_pinned_runs";
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(PINNED_KEY) || "[]")); }
    catch { return new Set(); }
  });
  useEffect(() => {
    localStorage.setItem(PINNED_KEY, JSON.stringify([...pinnedIds]));
  }, [pinnedIds]);
  const togglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); }
      else if (next.size < 3) { next.add(id); }
      return next;
    });
  };

  // ── 30.2 Evidence binder download ──
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const downloadBinder = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloadingId) return;
    setDownloadingId(runId);
    try {
      const data = await dashboardFetch(`/api/v1/hedge-effectiveness/runs/${runId}/export`, token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `he-binder-${runId.slice(0, 8)}.json`;
      a.click(); URL.revokeObjectURL(url);
    } catch { /* silently ignore */ }
    finally { setDownloadingId(null); }
  };

  // ── AI commentary draft ──
  const [commentaryRunId, setCommentaryRunId] = useState<string | null>(null);
  const [commentary, setCommentary] = useState<CommentaryResponse | null>(null);
  const [commentaryDraft, setCommentaryDraft] = useState("");
  const [commentaryBusy, setCommentaryBusy] = useState(false);

  const requestCommentary = async (runId: string) => {
    if (!token || commentaryBusy) return;
    setCommentaryRunId(runId);
    setCommentaryBusy(true);
    setCommentary(null);
    try {
      const res = await draftCommentary("hedge_effectiveness", runId, token);
      setCommentary(res);
      setCommentaryDraft(res.draft);
    } catch {
      setCommentaryDraft("Failed to generate commentary. Please try again.");
    } finally {
      setCommentaryBusy(false);
    }
  };

  // ── Filter presets ──
  const PRESETS_KEY = "hec_filter_presets";
  type Preset = { name: string; search: string; stdFilter: string; verdictFilter: "ALL" | "EFFECTIVE" | "INEFFECTIVE"; doMin: string; doMax: string };
  const [presets, setPresets] = useState<Preset[]>(() => {
    try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]"); }
    catch { return []; }
  });
  const [presetName, setPresetName] = useState("");
  const [showPresets, setShowPresets] = useState(false);

  // ── 36.3 Keyboard shortcut help overlay ──
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT") return;
      if (e.key === "?") { e.preventDefault(); setShowHelp((v) => !v); }
      if (e.key === "Escape") setShowHelp(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const next = [...presets.filter((p) => p.name !== name), { name, search, stdFilter, verdictFilter, doMin, doMax }];
    setPresets(next);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    setPresetName("");
    setShowPresets(false);
  };
  const applyPreset = (p: Preset) => {
    setSearch(p.search); setStdFilter(p.stdFilter); setVerdictFilter(p.verdictFilter);
    setDoMin(p.doMin); setDoMax(p.doMax); setShowPresets(false);
  };
  const deletePreset = (name: string) => {
    const next = presets.filter((p) => p.name !== name);
    setPresets(next);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  };

  useEffect(() => {
    localStorage.setItem(STARRED_KEY, JSON.stringify([...starredIds]));
  }, [starredIds]);

  // Reset page whenever any filter changes
  useEffect(() => { setPage(1); }, [search, stdFilter, verdictFilter, showStarredOnly, showR2Only, dateFrom, dateTo, doMin, doMax, tagFilter]);

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!compareOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setCompareOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [compareOpen]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filteredRuns = runs
    .filter((r) => stdFilter === "ALL" || r.standard === stdFilter)
    .filter((r) => verdictFilter === "ALL" || (verdictFilter === "EFFECTIVE" ? r.overall_effective : !r.overall_effective))
    .filter((r) => !showStarredOnly || starredIds.has(r.run_id))
    .filter((r) => {
      if (dateFrom && r.created_at && r.created_at.slice(0, 10) < dateFrom) return false;
      if (dateTo && r.created_at && r.created_at.slice(0, 10) > dateTo) return false;
      return true;
    })
    .filter((r) => {
      const q = search.toLowerCase();
      return !q || r.dataset_name.toLowerCase().includes(q) || (r.currency_pair?.toLowerCase().includes(q) ?? false);
    })
    .filter((r) => {
      if (doMin !== "" && (r.dollar_offset_ratio == null || r.dollar_offset_ratio < parseFloat(doMin))) return false;
      if (doMax !== "" && (r.dollar_offset_ratio == null || r.dollar_offset_ratio > parseFloat(doMax))) return false;
      return true;
    })
    .filter((r) => tagFilter === "ALL" || tags[r.run_id] === tagFilter)
    .filter((r) => !showR2Only || r.regression_r_squared != null); // ── 51.2

  const PAGE_SIZE = pageSize === 0 ? filteredRuns.length || 1 : pageSize;
  const totalPages = Math.max(1, Math.ceil(filteredRuns.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const displayRuns = [...filteredRuns].sort((a, b) => {
    if (!sortKey) return 0;
    let cmp = 0;
    if (sortKey === "dataset") cmp = a.dataset_name.localeCompare(b.dataset_name);
    else if (sortKey === "do_ratio") cmp = (a.dollar_offset_ratio ?? -Infinity) - (b.dollar_offset_ratio ?? -Infinity);
    else if (sortKey === "r2") cmp = (a.regression_r_squared ?? -Infinity) - (b.regression_r_squared ?? -Infinity);
    else if (sortKey === "verdict") cmp = Number(a.overall_effective) - Number(b.overall_effective);
    else if (sortKey === "date") cmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
    return sortDir === "asc" ? cmp : -cmp;
  });

  // ── 25.1 Keyboard navigation handler (after displayRuns is defined) ──
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT") return;
      const pageRuns = displayRuns.slice((Math.min(page, totalPages) - 1) * PAGE_SIZE, Math.min(page, totalPages) * PAGE_SIZE);
      if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, pageRuns.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" && focusIdx >= 0 && pageRuns[focusIdx]) {
        e.preventDefault(); onNavigateRun(pageRuns[focusIdx].run_id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIdx, displayRuns, page, totalPages, onNavigateRun]);

  // ── 34.3 Human-readable run age ──
  const [showAge, setShowAge] = useState(false);
  const runAge = (dateStr: string | null): string => {
    if (!dateStr) return "—";
    const ms = Date.now() - new Date(dateStr).getTime();
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d`;
    const week = Math.floor(day / 7);
    if (week < 5) return `${week}w`;
    const month = Math.floor(day / 30);
    if (month < 12) return `${month}mo`;
    return `${Math.floor(day / 365)}y`;
  };

  // ── 34.2 Enhanced CSV export (includes note + tag) ──
  const handleExportCsv = (onlySelected = false) => {
    const source = onlySelected
      ? filteredRuns.filter((r) => selectedIds.has(r.run_id))
      : filteredRuns;
    const header = "run_id,dataset_name,currency_pair,standard,dollar_offset_ratio,regression_r_squared,overall_effective,run_hash,created_at,note,tag";
    const rows = source.map((r) =>
      [
        r.run_id, `"${r.dataset_name}"`, r.currency_pair ?? "",
        r.standard, r.dollar_offset_ratio ?? "", r.regression_r_squared ?? "",
        r.overall_effective, r.run_hash, r.created_at ?? "",
        `"${(runNotes[r.run_id] ?? "").replace(/"/g, '""')}"`,
        tags[r.run_id] ?? "",
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `hedge-effectiveness-runs${onlySelected ? "-selected" : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const inputBase: React.CSSProperties = {
    fontFamily: S.mono, fontSize: 12, color: S.text1,
    background: S.sub, border: `1px solid ${S.rim}`,
    borderRadius: 3, padding: "5px 10px", outline: "none",
  };

  if (runs.length === 0) {
    return (
      <div style={{
        padding: 60, textAlign: "center",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={HEX.text3} strokeWidth="1.5" opacity="0.4">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
          <path d="M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <div style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, letterSpacing: "0.08em" }}>
          No assessment runs yet
        </div>
        <div style={{ fontFamily: S.ui, fontSize: 12, color: S.text3 }}>
          Create a dataset and run an assessment to see results here.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 1100 }}>
      {/* Filter toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <input
          type="text" placeholder="Search dataset or pair…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputBase, width: 220 }}
        />
        <select value={stdFilter} onChange={(e) => setStdFilter(e.target.value)} style={{ ...inputBase, cursor: "pointer" }}>
          <option value="ALL">All Standards</option>
          <option value="IFRS_9">IFRS 9</option>
          <option value="ASC_815">ASC 815</option>
          <option value="IAS_39">IAS 39</option>
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>FROM</span>
          <input
            type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            style={{ ...inputBase, cursor: "pointer", width: 130 }}
          />
          <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>TO</span>
          <input
            type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            style={{ ...inputBase, cursor: "pointer", width: 130 }}
          />
          {/* ── 40.2 Quick date range presets ── */}
          {([7, 30, 90] as const).map((days) => {
            const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
            const active = dateFrom === from && dateTo === "";
            return (
              <button key={days}
                onClick={() => { setDateFrom(from); setDateTo(""); }}
                title={`Last ${days} days`}
                style={{
                  fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  padding: "3px 7px", borderRadius: 3, cursor: "pointer", border: "none",
                  background: active ? HEX.cyan : S.sub,
                  color: active ? "#fff" : S.text3,
                  transition: "all 0.15s",
                }}>
                {days}D
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>D.O.</span>
          <input
            type="number" placeholder="min" value={doMin} onChange={(e) => setDoMin(e.target.value)}
            style={{ ...inputBase, width: 60 }} step="0.01"
          />
          <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>–</span>
          <input
            type="number" placeholder="max" value={doMax} onChange={(e) => setDoMax(e.target.value)}
            style={{ ...inputBase, width: 60 }} step="0.01"
          />
        </div>
        {(["ALL", "EFFECTIVE", "INEFFECTIVE"] as const).map((v) => (
          <button
            key={v} onClick={() => setVerdictFilter(v)}
            style={{
              fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
              padding: "5px 12px", borderRadius: 3, cursor: "pointer", border: "none",
              background: verdictFilter === v ? HEX.cyan : S.sub,
              color: verdictFilter === v ? "#fff" : S.text3,
              transition: "all 0.15s",
            }}
          >
            {v}
          </button>
        ))}
        <button
          onClick={() => setShowStarredOnly((v) => !v)}
          style={{
            fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            padding: "5px 12px", borderRadius: 3, cursor: "pointer",
            background: showStarredOnly ? "#D97706" : S.sub,
            color: showStarredOnly ? "#fff" : S.text3,
            border: "none", display: "flex", alignItems: "center", gap: 4,
            transition: "all 0.15s",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill={showStarredOnly ? "#fff" : "none"} stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          STARRED{starredIds.size > 0 ? ` (${starredIds.size})` : ""}
        </button>
        {/* ── 51.2 R²-only filter toggle ── */}
        <button
          onClick={() => setShowR2Only((v) => !v)}
          style={{
            fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            padding: "5px 12px", borderRadius: 3, cursor: "pointer",
            background: showR2Only ? HEX.cyan : S.sub,
            color: showR2Only ? "#fff" : S.text3,
            border: "none", display: "flex", alignItems: "center", gap: 4,
            transition: "all 0.15s",
          }}
          title="Show only runs that include regression R² data"
        >
          R² DATA
        </button>
        {/* ── 26.1 Tag filter ── */}
        {(["ALL", "REVIEW", "APPROVED", "FLAGGED"] as const).map((t) => (
          <button
            key={t} onClick={() => setTagFilter(t)}
            style={{
              fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              padding: "4px 9px", borderRadius: 3, cursor: "pointer", border: "none",
              background: tagFilter === t
                ? (t === "ALL" ? HEX.cyan : t === "REVIEW" ? "rgba(217,119,6,0.18)" : t === "APPROVED" ? HEX.greenBg : HEX.redBg)
                : S.sub,
              color: tagFilter === t
                ? (t === "ALL" ? "#fff" : t === "REVIEW" ? HEX.amber : t === "APPROVED" ? HEX.green : HEX.red)
                : S.text3,
              transition: "all 0.15s",
            }}
          >{t === "ALL" ? "ALL TAGS" : t}</button>
        ))}
        {/* Preset save */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, position: "relative" }}>
          <button
            onClick={() => setShowPresets((v) => !v)}
            style={{
              fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              padding: "5px 10px", borderRadius: 3, cursor: "pointer",
              background: showPresets ? S.sub : "transparent",
              color: showPresets ? S.text1 : S.text3,
              border: `1px solid ${showPresets ? S.rim : "transparent"}`,
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            PRESETS{presets.length > 0 ? ` (${presets.length})` : ""}
          </button>
          {showPresets && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
              background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)", padding: 12, minWidth: 220,
            }}>
              <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.text3, marginBottom: 8, textTransform: "uppercase" }}>Save Current Filters</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <input
                  value={presetName} onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Preset name…"
                  onKeyDown={(e) => { if (e.key === "Enter") savePreset(); if (e.key === "Escape") setShowPresets(false); }}
                  style={{ fontFamily: S.mono, fontSize: 11, flex: 1, background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 3, padding: "4px 8px", color: S.text1, outline: "none" }}
                />
                <button
                  onClick={savePreset}
                  style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 3, background: HEX.cyan, color: "#fff", border: "none", cursor: "pointer" }}
                >SAVE</button>
              </div>
              {presets.length > 0 && (
                <>
                  <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.text3, marginBottom: 6, textTransform: "uppercase" }}>Saved Presets</div>
                  {presets.map((p) => (
                    <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderTop: `1px solid ${S.rim}` }}>
                      <button
                        onClick={() => applyPreset(p)}
                        style={{ flex: 1, textAlign: "left", fontFamily: S.mono, fontSize: 11, color: S.text1, background: "transparent", border: "none", cursor: "pointer", padding: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >{p.name}</button>
                      <button
                        onClick={() => deletePreset(p.name)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: S.text3, padding: "0 2px", fontSize: 13, lineHeight: 1 }}
                        title="Delete preset"
                      >×</button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowHelp((v) => !v)}
          title="Keyboard shortcuts (?)"
          style={{
            fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
            padding: "5px 10px", borderRadius: 3, cursor: "pointer",
            background: showHelp ? S.sub : "transparent",
            color: showHelp ? S.text1 : S.text3,
            border: `1px solid ${showHelp ? S.rim : "transparent"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >?</button>
        <div style={{ flex: 1 }} />
        {/* Column visibility menu */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowColMenu((v) => !v)}
            style={{
              fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              padding: "5px 10px", borderRadius: 3, cursor: "pointer",
              background: showColMenu ? S.sub : "transparent",
              color: showColMenu ? S.text1 : S.text3,
              border: `1px solid ${showColMenu ? S.rim : "transparent"}`,
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="1"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
            COLS
          </button>
          {showColMenu && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
              background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)", padding: "8px 0", minWidth: 140,
            }}>
              {([ ["standard", "Standard"], ["do_ratio", "D.O. Ratio"], ["r2", "R²"], ["verdict", "Verdict"], ["date", "Date"] ] as [keyof typeof colVis, string][]).map(([k, label]) => (
                <button key={k} onClick={() => toggleCol(k)} style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 14px",
                  fontFamily: S.mono, fontSize: 11, color: S.text1, background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: 2, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    background: colVis[k] ? HEX.cyan : "transparent", border: `1px solid ${colVis[k] ? HEX.cyan : S.rim}`,
                  }}>
                    {colVis[k] && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                  </span>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setDensity((d) => d === "normal" ? "compact" : "normal")}
          title={density === "normal" ? "Switch to compact view" : "Switch to normal view"}
          style={{
            fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
            padding: "5px 10px", borderRadius: 3, cursor: "pointer",
            background: density === "compact" ? S.sub : "transparent",
            color: density === "compact" ? S.text1 : S.text3,
            border: `1px solid ${density === "compact" ? S.rim : "transparent"}`,
            display: "flex", alignItems: "center", gap: 4,
            transition: "all 0.15s",
          }}
        >
          {density === "normal" ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="4" x2="21" y2="4"/><line x1="3" y1="8" x2="21" y2="8"/>
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="16" x2="21" y2="16"/>
              <line x1="3" y1="20" x2="21" y2="20"/>
            </svg>
          )}
          {density === "normal" ? "COMPACT" : "NORMAL"}
        </button>
        <button
          onClick={() => setGroupByDataset((v) => !v)}
          style={{
            fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
            padding: "5px 12px", borderRadius: 3, cursor: "pointer",
            background: groupByDataset ? S.sub : "transparent",
            color: groupByDataset ? S.text1 : S.text3,
            border: `1px solid ${groupByDataset ? S.rim : "transparent"}`,
            display: "flex", alignItems: "center", gap: 5,
            transition: "all 0.15s",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="4" rx="1"/><rect x="3" y="10" width="7" height="4" rx="1"/>
            <rect x="3" y="17" width="7" height="4" rx="1"/><line x1="14" y1="5" x2="21" y2="5"/>
            <line x1="14" y1="12" x2="21" y2="12"/><line x1="14" y1="19" x2="21" y2="19"/>
          </svg>
          GROUP
        </button>
        <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>
          {filteredRuns.length} OF {runs.length} RUNS
        </span>
        <button
          onClick={() => handleExportCsv(selectedIds.size > 0)}
          style={{
            fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            padding: "5px 14px", borderRadius: 3, cursor: "pointer",
            background: "transparent", color: HEX.cyan,
            border: `1px solid rgba(28,98,242,0.25)`,
            display: "flex", alignItems: "center", gap: 5,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(28,98,242,0.04)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          {selectedIds.size > 0 ? `EXPORT SELECTED (${selectedIds.size})` : "EXPORT CSV"}
        </button>
        {/* ── 54.2 Copy filtered run IDs ── */}
        {filteredRuns.length > 0 && (
          <button
            onClick={() => {
              const ids = filteredRuns.map((r) => r.run_id).join("\n");
              navigator.clipboard.writeText(ids).catch(() => {});
              setCopyIdsFlash(true);
              setTimeout(() => setCopyIdsFlash(false), 1500);
            }}
            title={`Copy ${filteredRuns.length} run ID${filteredRuns.length !== 1 ? "s" : ""} to clipboard`}
            style={{
              fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
              padding: "5px 12px", borderRadius: 3, cursor: "pointer",
              background: copyIdsFlash ? HEX.greenBg : "transparent",
              color: copyIdsFlash ? HEX.green : S.text3,
              border: `1px solid ${copyIdsFlash ? HEX.greenBorder : "transparent"}`,
              display: "flex", alignItems: "center", gap: 4,
              transition: "all 0.2s",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            {copyIdsFlash ? "COPIED!" : "COPY IDS"}
          </button>
        )}
        {selectedIds.size >= 2 && (
          <button
            onClick={() => setCompareOpen(true)}
            style={{
              fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
              padding: "5px 14px", borderRadius: 3, cursor: "pointer",
              background: HEX.cyan, color: "#fff", border: "none",
              display: "flex", alignItems: "center", gap: 5,
              boxShadow: "0 1px 6px rgba(28,98,242,0.3)",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>
            </svg>
            COMPARE ({selectedIds.size})
          </button>
        )}
        {selectedIds.size > 0 && !deleteConfirm && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setTagBulkOpen((v) => !v)}
              style={{
                fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                padding: "5px 12px", borderRadius: 3, cursor: "pointer",
                background: "transparent", color: HEX.amber,
                border: `1px solid rgba(217,119,6,0.25)`,
                display: "flex", alignItems: "center", gap: 5,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(217,119,6,0.04)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
              </svg>
              TAG ALL
            </button>
            {tagBulkOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
                background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4,
                boxShadow: "0 4px 12px rgba(0,0,0,0.12)", padding: 4,
                display: "flex", flexDirection: "column", gap: 2, minWidth: 110,
              }}>
                {(["REVIEW", "APPROVED", "FLAGGED", null] as (TagValue)[]).map((t) => (
                  <button
                    key={t ?? "clear"}
                    onClick={(e) => applyBulkTag(t, e)}
                    style={{
                      fontFamily: S.mono, fontSize: 10, fontWeight: 700, padding: "5px 10px",
                      borderRadius: 3, cursor: "pointer", border: "none", textAlign: "left",
                      background: t ? TAG_COLORS[t].bg : "transparent",
                      color: t ? TAG_COLORS[t].color : S.text3,
                    }}
                  >
                    {t ?? "Clear tag"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {selectedIds.size > 0 && !deleteConfirm && (
          <button
            onClick={() => setDeleteConfirm(true)}
            style={{
              fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
              padding: "5px 12px", borderRadius: 3, cursor: "pointer",
              background: "transparent", color: HEX.red,
              border: `1px solid rgba(220,38,38,0.25)`,
              display: "flex", alignItems: "center", gap: 5,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(220,38,38,0.04)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
            DELETE ({selectedIds.size})
          </button>
        )}
        {deleteConfirm && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 12px", borderRadius: 3, background: HEX.redBg, border: `1px solid ${HEX.redBorder}` }}>
            <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: HEX.red }}>
              DELETE {selectedIds.size} RUN{selectedIds.size > 1 ? "S" : ""}?
            </span>
            <button
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                await onDeleteRuns(Array.from(selectedIds));
                setSelectedIds(new Set());
                setDeleteConfirm(false);
                setDeleting(false);
              }}
              style={{
                fontFamily: S.mono, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 2,
                background: HEX.red, color: "#fff", border: "none", cursor: deleting ? "not-allowed" : "pointer",
                opacity: deleting ? 0.6 : 1,
              }}
            >
              {deleting ? "DELETING…" : "CONFIRM"}
            </button>
            <button
              onClick={() => setDeleteConfirm(false)}
              style={{
                fontFamily: S.mono, fontSize: 11, padding: "3px 8px", borderRadius: 2,
                background: "transparent", color: HEX.red, border: `1px solid ${HEX.redBorder}`, cursor: "pointer",
              }}
            >
              CANCEL
            </button>
          </div>
        )}
        {selectedIds.size > 0 && !deleteConfirm && (
          <button
            onClick={() => { setSelectedIds(new Set()); setDeleteConfirm(false); }}
            style={{
              fontFamily: S.mono, fontSize: 11, color: S.text3, background: "transparent",
              border: "none", cursor: "pointer", padding: "5px 4px",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* ── 49.2 Selection summary bar ── */}
      {selectedIds.size >= 1 && (() => {
        const sel = runs.filter((r) => selectedIds.has(r.run_id));
        const selEff = sel.filter((r) => r.overall_effective).length;
        const selDo = sel.map((r) => r.dollar_offset_ratio).filter((v): v is number => v != null);
        const avgSelDo = selDo.length > 0 ? selDo.reduce((s, v) => s + v, 0) / selDo.length : null;
        const passRate = Math.round((selEff / sel.length) * 100);
        const color = passRate === 100 ? HEX.green : passRate >= 50 ? HEX.amber : HEX.red;
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
            padding: "6px 14px", borderRadius: 4,
            background: "rgba(28,98,242,0.05)", border: "1px solid rgba(28,98,242,0.18)",
          }}>
            <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: HEX.cyan, letterSpacing: "0.12em" }}>
              SELECTION ({selectedIds.size})
            </span>
            <div style={{ width: 1, height: 14, background: "rgba(28,98,242,0.2)" }} />
            <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color }}>
              {selEff}/{sel.length} EFFECTIVE
            </span>
            <span style={{ fontFamily: S.mono, fontSize: 10, color, letterSpacing: "0.06em" }}>{passRate}% PASS</span>
            {avgSelDo != null && (
              <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text2 }}>
                AVG D.O. {avgSelDo.toFixed(4)}
              </span>
            )}
          </div>
        );
      })()}

      {/* ── 35.2 Active filter pill bar ── */}
      {(() => {
        const activeFilters: { label: string; onClear: () => void }[] = [];
        if (search.trim()) activeFilters.push({ label: `⌕ "${search.trim()}"`, onClear: () => setSearch("") });
        if (stdFilter !== "ALL") activeFilters.push({ label: `STD: ${stdFilter.replace("_", " ")}`, onClear: () => setStdFilter("ALL") });
        if (verdictFilter !== "ALL") activeFilters.push({ label: `VERDICT: ${verdictFilter}`, onClear: () => setVerdictFilter("ALL") });
        if (tagFilter !== "ALL") activeFilters.push({ label: `TAG: ${tagFilter}`, onClear: () => setTagFilter("ALL") });
        if (showStarredOnly) activeFilters.push({ label: "★ STARRED", onClear: () => setShowStarredOnly(false) });
        if (showR2Only) activeFilters.push({ label: "R² DATA ONLY", onClear: () => setShowR2Only(false) }); // ── 51.2
        if (dateFrom) activeFilters.push({ label: `FROM: ${dateFrom}`, onClear: () => setDateFrom("") });
        if (dateTo) activeFilters.push({ label: `TO: ${dateTo}`, onClear: () => setDateTo("") });
        if (doMin) activeFilters.push({ label: `D.O. \u2265 ${doMin}`, onClear: () => setDoMin("") });
        if (doMax) activeFilters.push({ label: `D.O. \u2264 ${doMax}`, onClear: () => setDoMax("") });
        if (activeFilters.length === 0) return null;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "2px 0" }}>
            <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3, letterSpacing: "0.08em" }}>FILTERS:</span>
            {activeFilters.map((f) => (
              <span
                key={f.label}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  padding: "3px 7px", borderRadius: 3,
                  background: "rgba(28,98,242,0.07)", color: HEX.cyan,
                  border: "1px solid rgba(28,98,242,0.18)",
                }}
              >
                {f.label}
                <button
                  onClick={(e) => { e.stopPropagation(); f.onClear(); }}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: HEX.cyan, padding: "0 0 0 2px", fontSize: 13, lineHeight: 1,
                    opacity: 0.7,
                  }}
                  title={`Clear filter`}
                >×</button>
              </span>
            ))}
            {activeFilters.length >= 2 && (
              <button
                onClick={() => {
                  setSearch(""); setStdFilter("ALL"); setVerdictFilter("ALL");
                  setTagFilter("ALL"); setShowStarredOnly(false);
                  setDateFrom(""); setDateTo(""); setDoMin(""); setDoMax("");
                }}
                style={{
                  fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  padding: "3px 8px", borderRadius: 3, cursor: "pointer",
                  background: "transparent", color: S.text3,
                  border: `1px solid ${S.rim}`,
                }}
              >CLEAR ALL</button>
            )}
          </div>
        );
      })()}

      {/* ── 41.2 Filter statistics summary row ── */}
      {filteredRuns.length > 0 && (() => {
        const STD_LABELS: Record<string, string> = { IAS_39: "IAS 39", IFRS_9: "IFRS 9", ASC_815: "ASC 815" };
        const stdKeys = Array.from(new Set(filteredRuns.map((r) => r.standard))).sort();
        if (stdKeys.length < 2) return null; // only show when ≥2 standards in view
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 2px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>BY STD:</span>
            {stdKeys.map((std) => {
              const stdRuns = filteredRuns.filter((r) => r.standard === std);
              const pass = stdRuns.filter((r) => r.overall_effective).length;
              const pct = Math.round((pass / stdRuns.length) * 100);
              const color = pct === 100 ? HEX.green : pct >= 50 ? HEX.amber : HEX.red;
              return (
                <span key={std} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text2 }}>{STD_LABELS[std] ?? std}</span>
                  <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>{stdRuns.length}×</span>
                  <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color }}>{pct}%</span>
                </span>
              );
            })}
          </div>
        );
      })()}

      {/* ── 53.2 Verdict ratio visual bar ── */}
      {filteredRuns.length >= 1 && (() => {
        const passCount = filteredRuns.filter((r) => r.overall_effective).length;
        const failCount = filteredRuns.length - passCount;
        const passPct = (passCount / filteredRuns.length) * 100;
        const failPct = 100 - passPct;
        const passColor = passPct >= 80 ? HEX.green : passPct >= 50 ? HEX.amber : HEX.red;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ height: 8, borderRadius: 3, overflow: "hidden", display: "flex", background: S.sub }}>
              {passCount > 0 && (
                <div
                  title={`${passCount} effective (${Math.round(passPct)}%)`}
                  style={{ width: `${passPct}%`, background: passColor, opacity: 0.7, transition: "width 0.3s" }}
                />
              )}
              {failCount > 0 && (
                <div
                  title={`${failCount} ineffective (${Math.round(failPct)}%)`}
                  style={{ width: `${failPct}%`, background: HEX.red, opacity: 0.5, transition: "width 0.3s" }}
                />
              )}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {passCount > 0 && (
                <span style={{ fontFamily: S.mono, fontSize: 9, color: passColor, fontWeight: 700 }}>
                  ■ {passCount} PASS
                </span>
              )}
              {failCount > 0 && (
                <span style={{ fontFamily: S.mono, fontSize: 9, color: HEX.red, fontWeight: 700 }}>
                  ■ {failCount} FAIL
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── 32.3 Monthly performance heatmap ── */}
      {runs.length >= 1 && (() => {
        const year = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        const months = Array.from({ length: 12 }, (_, i) => {
          const month = i + 1;
          const mRuns = runs.filter((r) => {
            if (!r.created_at) return false;
            const d = new Date(r.created_at);
            return d.getFullYear() === year && d.getMonth() + 1 === month;
          });
          const passRate = mRuns.length === 0 ? null
            : Math.round((mRuns.filter((r) => r.overall_effective).length / mRuns.length) * 100);
          return {
            month,
            label: ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][i],
            total: mRuns.length,
            passRate,
          };
        });
        if (!months.some((m) => m.total > 0)) return null;
        return (
          <div style={{
            padding: "8px 12px", borderRadius: 4, background: S.panel, border: `1px solid ${S.rim}`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: S.text3, letterSpacing: "0.12em", flexShrink: 0 }}>
              {year}
            </span>
            <div style={{ display: "flex", gap: 2, flex: 1 }}>
              {months.map(({ month, label, total, passRate }) => {
                const isCurrent = month === currentMonth;
                const bg = passRate === null ? "transparent"
                  : passRate >= 80 ? "rgba(5,150,105,0.14)"
                  : passRate >= 60 ? "rgba(217,119,6,0.14)"
                  : "rgba(220,38,38,0.14)";
                const borderColor = passRate === null ? S.rim
                  : passRate >= 80 ? HEX.greenBorder
                  : passRate >= 60 ? "rgba(217,119,6,0.40)"
                  : HEX.redBorder;
                const textColor = passRate === null ? S.text3
                  : passRate >= 80 ? HEX.green
                  : passRate >= 60 ? HEX.amber
                  : HEX.red;
                return (
                  <div
                    key={month}
                    title={total === 0 ? `${label}: no runs` : `${label}: ${passRate}% pass rate (${total} run${total !== 1 ? "s" : ""})`}
                    style={{
                      flex: 1, padding: "4px 2px", borderRadius: 3, textAlign: "center",
                      background: bg,
                      border: `1px solid ${isCurrent ? HEX.cyan + "60" : borderColor}`,
                      boxShadow: isCurrent ? `0 0 0 1px ${HEX.cyan}20` : "none",
                      cursor: "default",
                    }}
                  >
                    <div style={{ fontFamily: S.mono, fontSize: 8, color: isCurrent ? HEX.cyan : S.text3, marginBottom: 1 }}>
                      {label}
                    </div>
                    <div style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: textColor, lineHeight: 1 }}>
                      {passRate !== null ? `${passRate}%` : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── 33.3 Inline delta bar (2 selected, compare modal closed) ── */}
      {selectedIds.size === 2 && !compareOpen && (() => {
        const [idA, idB] = [...selectedIds];
        const rA = runs.find((r) => r.run_id === idA);
        const rB = runs.find((r) => r.run_id === idB);
        if (!rA || !rB) return null;
        const doDelta = rA.dollar_offset_ratio != null && rB.dollar_offset_ratio != null
          ? rA.dollar_offset_ratio - rB.dollar_offset_ratio : null;
        const r2Delta = rA.regression_r_squared != null && rB.regression_r_squared != null
          ? rA.regression_r_squared - rB.regression_r_squared : null;
        const verdictMatch = rA.overall_effective === rB.overall_effective;
        const fmtDelta = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(4)}`;
        return (
          <div style={{
            padding: "7px 20px", borderRadius: 4, background: "rgba(28,98,242,0.05)",
            border: `1px solid rgba(28,98,242,0.20)`, display: "flex", alignItems: "center", gap: 20,
          }}>
            <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: HEX.cyan, letterSpacing: "0.12em" }}>
              QUICK Δ
            </span>
            <div style={{ width: 1, height: 16, background: S.rim }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>D.O.</span>
              {doDelta != null ? (
                <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: Math.abs(doDelta) < 0.01 ? S.text3 : doDelta > 0 ? HEX.green : HEX.red }}>
                  {fmtDelta(doDelta)}
                </span>
              ) : <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>—</span>}
            </div>
            <div style={{ width: 1, height: 16, background: S.rim }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>R²</span>
              {r2Delta != null ? (
                <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: Math.abs(r2Delta) < 0.01 ? S.text3 : r2Delta > 0 ? HEX.green : HEX.red }}>
                  {fmtDelta(r2Delta)}
                </span>
              ) : <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>—</span>}
            </div>
            <div style={{ width: 1, height: 16, background: S.rim }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>VERDICT</span>
              <span style={{
                fontFamily: S.mono, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 2,
                background: verdictMatch ? HEX.greenBg : HEX.redBg,
                color: verdictMatch ? HEX.green : HEX.red,
                border: `1px solid ${verdictMatch ? HEX.greenBorder : HEX.redBorder}`,
              }}>
                {verdictMatch ? "AGREE" : "DISAGREE"}
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>
              {rA.dataset_name.slice(0, 16)}{rA.dataset_name.length > 16 ? "…" : ""} vs {rB.dataset_name.slice(0, 16)}{rB.dataset_name.length > 16 ? "…" : ""}
            </span>
          </div>
        );
      })()}

      {/* Column headers */}
      {(() => {
        const cols = [
          { label: "DATASET",    key: "dataset" as SortKey,  vis: true,                   w: "2fr"  },
          { label: "STANDARD",   key: null,                   vis: colVis.standard,        w: "90px" },
          { label: "D.O. RATIO", key: "do_ratio" as SortKey, vis: colVis.do_ratio,        w: "100px"},
          { label: "R²",         key: "r2" as SortKey,       vis: colVis.r2,              w: "80px" },
          { label: "VERDICT",    key: "verdict" as SortKey,  vis: colVis.verdict,         w: "100px"},
          { label: "HASH",       key: null,                   vis: true,                   w: "120px"},
          { label: showAge ? "AGE" : "DATE", key: "date" as SortKey, vis: colVis.date, w: "90px" },
        ];
        const visibleCols = cols.filter((c) => c.vis);
        const gridCols = ["28px", ...visibleCols.map((c) => c.w)].join(" ");
        return (
          <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 8, padding: "0 20px" }}>
            <div />
            {visibleCols.map(({ label, key }) => key ? (
              <button key={label} onClick={() => handleSort(key)} style={{
                fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em",
                color: sortKey === key ? HEX.cyan : S.text3,
                background: "transparent", border: "none", cursor: "pointer",
                padding: 0, display: "flex", alignItems: "center", gap: 3, textAlign: "left",
              }}>
                {label}
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  style={{ opacity: sortKey === key ? 1 : 0.3, transition: "opacity 0.15s" }}>
                  {sortKey === key && sortDir === "asc" ? <path d="M12 19V5M5 12l7-7 7 7"/> : <path d="M12 5v14M5 12l7 7 7-7"/>}
                </svg>
              </button>
            ) : (
              <span key={label} style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>{label}</span>
            ))}
          </div>
        );
      })()}

      {filteredRuns.length === 0 ? (
        <div style={{ padding: "32px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>No runs match the current filters.</div>
          <button
            onClick={() => { setSearch(""); setStdFilter("ALL"); setVerdictFilter("ALL"); setShowStarredOnly(false); setDateFrom(""); setDateTo(""); setDoMin(""); setDoMax(""); setTagFilter("ALL"); }}
            style={{
              fontFamily: S.mono, fontSize: 11, padding: "5px 14px", borderRadius: 3, cursor: "pointer",
              background: "transparent", color: HEX.cyan, border: `1px solid rgba(28,98,242,0.25)`,
            }}
          >
            Clear Filters
          </button>
        </div>
      ) : groupByDataset ? (() => {
        // Group filtered+sorted runs by dataset
        const groups: { dsId: string; dsName: string; pair: string | null; runs: Run[] }[] = [];
        const seen = new Set<string>();
        for (const r of displayRuns) {
          if (!seen.has(r.dataset_id)) {
            seen.add(r.dataset_id);
            groups.push({ dsId: r.dataset_id, dsName: r.dataset_name, pair: r.currency_pair, runs: [] });
          }
          groups[groups.findIndex((g) => g.dsId === r.dataset_id)].runs.push(r);
        }
        return groups.map((g) => {
          const passCount = g.runs.filter((r) => r.overall_effective).length;
          const pct = Math.round((passCount / g.runs.length) * 100);
          return (
            <div key={g.dsId} style={{ borderRadius: 4, border: `1px solid ${S.rim}`, overflow: "hidden" }}>
              {/* Dataset header */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
                background: S.sub, borderBottom: `1px solid ${S.rim}`,
              }}>
                <span style={{ fontFamily: S.ui, fontSize: 13, fontWeight: 700, color: S.text1 }}>{g.dsName}</span>
                {g.pair && <span style={{ fontFamily: S.mono, fontSize: 12, color: HEX.cyan }}>{g.pair}</span>}
                <div style={{ flex: 1 }} />
                <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>{g.runs.length} {g.runs.length === 1 ? "run" : "runs"}</span>
                <span style={{
                  fontFamily: S.mono, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 2,
                  background: pct >= 80 ? HEX.greenBg : pct >= 60 ? "rgba(217,119,6,0.08)" : HEX.redBg,
                  color: pct >= 80 ? HEX.green : pct >= 60 ? HEX.amber : HEX.red,
                  border: `1px solid ${pct >= 80 ? HEX.greenBorder : pct >= 60 ? "rgba(217,119,6,0.25)" : HEX.redBorder}`,
                }}>{pct}% PASS</span>
              </div>
              {/* Compact run rows */}
              {g.runs.map((r) => (
                <div key={r.run_id} onClick={() => onNavigateRun(r.run_id)} style={{
                  display: "grid", gridTemplateColumns: "28px auto 90px 100px 80px 100px 1fr",
                  gap: 8, padding: "9px 20px", alignItems: "center",
                  background: selectedIds.has(r.run_id) ? "rgba(28,98,242,0.04)" : S.panel,
                  borderBottom: `1px solid ${S.rim}`,
                  cursor: "pointer", transition: "background 0.1s",
                  position: "relative",
                }}
                  onMouseEnter={(e) => { if (!selectedIds.has(r.run_id)) e.currentTarget.style.background = HEX.bgSub; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = selectedIds.has(r.run_id) ? "rgba(28,98,242,0.04)" : "var(--bg-panel)"; }}
                >
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, borderRadius: "0", background: pinnedIds.has(r.run_id) ? HEX.cyan : (r.overall_effective ? HEX.green : HEX.red) }} />
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <input type="checkbox" checked={selectedIds.has(r.run_id)} onChange={() => {}} onClick={(e) => toggleSelect(r.run_id, e)} style={{ cursor: "pointer", accentColor: HEX.cyan, width: 13, height: 13 }} />
                  </div>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>{r.run_id.slice(0, 8)}…</span>
                    {/* ── 45.2 Copy run ID button ── */}
                    <button
                      title={`Copy full run ID: ${r.run_id}`}
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(r.run_id).catch(() => {}); }}
                      style={{
                        background: "none", border: "none", padding: "1px 3px", cursor: "pointer",
                        color: S.text3, borderRadius: 2, lineHeight: 1, fontSize: 10,
                        display: "flex", alignItems: "center",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = HEX.cyan)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = S.text3)}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                    </button>
                  </span>
                  <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2 }}>{r.standard.replace("_", " ")}</span>
                  <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: r.dollar_offset_ratio != null && r.dollar_offset_ratio >= 0.80 && r.dollar_offset_ratio <= 1.25 ? HEX.green : S.text2 }}>
                    {r.dollar_offset_ratio != null ? r.dollar_offset_ratio.toFixed(4) : "—"}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: r.regression_r_squared != null && r.regression_r_squared >= 0.80 ? HEX.green : S.text2 }}>
                      {r.regression_r_squared != null ? r.regression_r_squared.toFixed(4) : "—"}
                    </span>
                    {/* ── 46.2 R² quality badge ── */}
                    {r.regression_r_squared != null && (() => {
                      const v = r.regression_r_squared;
                      const label = v >= 0.80 ? "STRONG" : v >= 0.60 ? "MOD" : "WEAK";
                      const color = v >= 0.80 ? HEX.green : v >= 0.60 ? HEX.amber : HEX.red;
                      const bg = v >= 0.80 ? HEX.greenBg : v >= 0.60 ? "rgba(217,119,6,0.10)" : HEX.redBg;
                      const border = v >= 0.80 ? HEX.greenBorder : v >= 0.60 ? "rgba(217,119,6,0.30)" : HEX.redBorder;
                      return (
                        <span style={{ fontFamily: S.mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.06em",
                          padding: "1px 4px", borderRadius: 2, background: bg, color, border: `1px solid ${border}` }}>
                          {label}
                        </span>
                      );
                    })()}
                  </span>
                  <span style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 2, background: r.overall_effective ? HEX.greenBg : HEX.redBg, color: r.overall_effective ? HEX.green : HEX.red, border: `1px solid ${r.overall_effective ? HEX.greenBorder : HEX.redBorder}` }}>
                      {r.overall_effective ? "EFFECTIVE" : "INEFFECTIVE"}
                    </span>
                  </span>
                  <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3, textAlign: "right" }}>
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
              ))}
            </div>
          );
        });
      })() : (() => {
        // ── 33.1 Separate pinned runs ──
        const pinnedRows = filteredRuns.filter((r) => pinnedIds.has(r.run_id));
        const unpinnedRows = displayRuns.filter((r) => !pinnedIds.has(r.run_id));
        const pageRows = unpinnedRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
        const allRows = [...pinnedRows, ...pageRows];
        const pinnedSeparatorIdx = pinnedRows.length;
        // ── 35.3 Dataset-relative rank map ──
        const dsRunGroups = runs.reduce<Record<string, Run[]>>((acc, r) => {
          if (!acc[r.dataset_id]) acc[r.dataset_id] = [];
          acc[r.dataset_id].push(r);
          return acc;
        }, {});
        const dsRankMap: Record<string, number> = {};
        for (const [, dsRuns] of Object.entries(dsRunGroups)) {
          if (dsRuns.length < 2) continue;
          const ranked = [...dsRuns].sort((a, b) => {
            const da = a.dollar_offset_ratio != null ? Math.abs(a.dollar_offset_ratio - 1.00) : Infinity;
            const db = b.dollar_offset_ratio != null ? Math.abs(b.dollar_offset_ratio - 1.00) : Infinity;
            return da - db;
          });
          ranked.forEach((r, i) => { dsRankMap[r.run_id] = i + 1; });
        }
        // ── 43.2 First run per dataset map ──
        const dsFirstRunMap: Record<string, string> = {};
        for (const [dsId, dsRuns] of Object.entries(dsRunGroups)) {
          const earliest = [...dsRuns]
            .filter((r) => r.created_at)
            .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))[0];
          if (earliest) dsFirstRunMap[dsId] = earliest.run_id;
        }
        // ── 44.2 Run sequence map (chronological position within dataset) ──
        const dsSeqMap: Record<string, { seq: number; total: number }> = {};
        for (const [, dsRuns] of Object.entries(dsRunGroups)) {
          const ordered = [...dsRuns]
            .filter((r) => r.created_at)
            .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
          ordered.forEach((r, i) => {
            dsSeqMap[r.run_id] = { seq: i + 1, total: ordered.length };
          });
        }
        return allRows.map((r, rowIdx) => {
        const visCols = [
          { vis: true,             w: "2fr"   },
          { vis: colVis.standard,  w: "90px"  },
          { vis: colVis.do_ratio,  w: "100px" },
          { vis: colVis.r2,        w: "80px"  },
          { vis: colVis.verdict,   w: "100px" },
          { vis: true,             w: "120px" },
          { vis: colVis.date,      w: "90px"  },
        ];
        const gridCols = ["28px", ...visCols.filter((c) => c.vis).map((c) => c.w)].join(" ");
        const isFocused = focusIdx === rowIdx;
        const runTag = tags[r.run_id] ?? null;
        return (
        <div
          key={r.run_id}
          onClick={() => { setFocusIdx(rowIdx); onNavigateRun(r.run_id); }}
          onMouseEnter={() => { setHoverId(r.run_id); setFocusIdx(rowIdx); }}
          onMouseLeave={() => setHoverId(null)}
          style={{
            display: "grid", gridTemplateColumns: gridCols,
            gap: 8, padding: `${density === "compact" ? 6 : 12}px 20px`, borderRadius: 4,
            background: selectedIds.has(r.run_id) ? "rgba(28,98,242,0.04)" : S.panel,
            border: `1px solid ${isFocused ? HEX.cyan + "60" : selectedIds.has(r.run_id) ? HEX.cyan + "40" : S.rim}`,
            boxShadow: isFocused ? `0 0 0 2px ${HEX.cyan}18` : "none",
            cursor: "pointer", transition: "all 0.12s",
            position: "relative",
          }}
        >
          {/* Left verdict/pin indicator */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
            borderRadius: "4px 0 0 4px",
            background: pinnedIds.has(r.run_id) ? HEX.cyan : (r.overall_effective ? HEX.green : HEX.red),
          }} />

          {/* Checkbox */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={selectedIds.has(r.run_id)}
              onChange={() => {}} // controlled via onClick
              onClick={(e) => toggleSelect(r.run_id, e)}
              style={{ cursor: "pointer", accentColor: HEX.cyan, width: 13, height: 13 }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: S.ui, fontSize: 12, fontWeight: 600, color: S.text1 }}>
                {r.dataset_name}
              </div>
              {r.currency_pair && (
                <span style={{ fontFamily: S.mono, fontSize: 12, color: HEX.cyan }}>{r.currency_pair}</span>
              )}
              {/* ── 35.3 Dataset-relative rank badge ── */}
              {dsRankMap[r.run_id] != null && dsRunGroups[r.dataset_id]?.length >= 2 && (
                <span style={{
                  fontFamily: S.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                  padding: "1px 5px", borderRadius: 2, display: "inline-block", marginTop: 2,
                  background: dsRankMap[r.run_id] === 1 ? HEX.greenBg : dsRankMap[r.run_id] === 2 ? "rgba(28,98,242,0.07)" : "transparent",
                  color: dsRankMap[r.run_id] === 1 ? HEX.green : dsRankMap[r.run_id] === 2 ? HEX.cyan : S.text3,
                  border: `1px solid ${dsRankMap[r.run_id] === 1 ? HEX.greenBorder : dsRankMap[r.run_id] === 2 ? "rgba(28,98,242,0.2)" : S.rim}`,
                }}>
                  #{dsRankMap[r.run_id]}{dsRankMap[r.run_id] === 1 ? " BEST" : ""}
                </span>
              )}
              {/* ── 43.2 First run badge ── */}
              {dsFirstRunMap[r.dataset_id] === r.run_id && (
                <span style={{
                  fontFamily: S.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                  padding: "1px 5px", borderRadius: 2, display: "inline-block", marginTop: 2,
                  background: "rgba(139,92,246,0.10)", color: "#A78BFA",
                  border: "1px solid rgba(139,92,246,0.25)",
                }}>1ST</span>
              )}
              {/* ── 44.2 Run sequence badge ── */}
              {dsSeqMap[r.run_id] != null && (
                <span title={`Run ${dsSeqMap[r.run_id].seq} of ${dsSeqMap[r.run_id].total} for this dataset`}
                  style={{
                    fontFamily: S.mono, fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
                    padding: "1px 5px", borderRadius: 2, display: "inline-block", marginTop: 2,
                    background: S.sub, color: S.text3, border: `1px solid ${S.rim}`,
                  }}>
                  RUN {dsSeqMap[r.run_id].seq}/{dsSeqMap[r.run_id].total}
                </span>
              )}
              {/* ── 30.1 Per-run analyst note ── */}
              {editNoteRunId === r.run_id ? (
                <input
                  autoFocus
                  defaultValue={runNotes[r.run_id] ?? ""}
                  placeholder="Add analyst note…"
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => saveRunNote(r.run_id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRunNote(r.run_id, (e.target as HTMLInputElement).value);
                    if (e.key === "Escape") setEditNoteRunId(null);
                  }}
                  style={{
                    display: "block", marginTop: 3, width: "100%", maxWidth: 260,
                    fontFamily: S.mono, fontSize: 10, color: S.text2,
                    background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 3,
                    padding: "2px 6px", outline: "none",
                  }}
                />
              ) : runNotes[r.run_id] ? (
                <div
                  onClick={(e) => { e.stopPropagation(); setEditNoteRunId(r.run_id); }}
                  title="Click to edit note"
                  style={{
                    marginTop: 2, fontFamily: S.mono, fontSize: 10, fontStyle: "italic",
                    color: S.text3, cursor: "text", maxWidth: 260,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {runNotes[r.run_id]}
                </div>
              ) : hoverId === r.run_id ? (
                <div
                  onClick={(e) => { e.stopPropagation(); setEditNoteRunId(r.run_id); }}
                  style={{
                    marginTop: 2, fontFamily: S.mono, fontSize: 10, color: S.text3,
                    cursor: "text", opacity: 0.5,
                  }}
                >+ note</div>
              ) : null}
            </div>
            {/* ── 30.2 Evidence binder download ── */}
            <button
              onClick={(e) => downloadBinder(r.run_id, e)}
              title="Download evidence binder (JSON)"
              style={{
                background: "transparent", border: "none", cursor: downloadingId === r.run_id ? "wait" : "pointer",
                padding: "2px 4px", borderRadius: 3, flexShrink: 0,
                color: downloadingId === r.run_id ? HEX.cyan : S.text3,
                opacity: downloadingId === r.run_id ? 1 : 0.4,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = HEX.cyan; }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = downloadingId === r.run_id ? "1" : "0.4";
                e.currentTarget.style.color = downloadingId === r.run_id ? HEX.cyan : HEX.text3;
              }}
            >
              {downloadingId === r.run_id ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
              )}
            </button>
            {/* ── AI commentary (intelligence tier only) ── */}
            {user?.plan_tier === "intelligence" && (
              <>
                <button
                  onClick={() => requestCommentary(r.run_id)}
                  disabled={commentaryBusy && commentaryRunId === r.run_id}
                  title="Draft AI commentary"
                  style={{
                    padding: "4px 10px", borderRadius: 3, border: "none",
                    background: "rgba(0,200,200,0.15)", color: "var(--accent-cyan)",
                    fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
                    fontSize: 10, letterSpacing: 1, cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {commentaryBusy && commentaryRunId === r.run_id ? "..." : "✦ AI"}
                </button>
                {commentary && commentaryRunId === r.run_id && (
                  <div
                    style={{
                      position: "absolute", left: 0, right: 0, top: "100%", zIndex: 20,
                      marginTop: 4, padding: 12,
                      background: "var(--bg-sub)", border: "1px solid var(--accent-cyan)",
                      borderRadius: 4,
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div style={{ fontSize: 10, fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", color: "var(--accent-cyan)", marginBottom: 6 }}>
                      AI COMMENTARY DRAFT — AI-assisted · human review required
                    </div>
                    <textarea
                      value={commentaryDraft}
                      onChange={e => setCommentaryDraft(e.target.value)}
                      rows={6}
                      style={{
                        width: "100%", background: "transparent", border: "1px solid var(--border-rim)",
                        color: "var(--text-primary)", fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
                        fontSize: 12, padding: 8, borderRadius: 3, resize: "vertical",
                        boxSizing: "border-box",
                      }}
                    />
                    <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>
                      {`AI-assisted, human-reviewed: ${new Date().toISOString().slice(0, 10)} ${user?.email ?? ""}`}
                    </div>
                  </div>
                )}
              </>
            )}
            <button
              onClick={(e) => toggleStar(r.run_id, e)}
              title={starredIds.has(r.run_id) ? "Unstar" : "Star this run"}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                padding: "2px 4px", borderRadius: 3, flexShrink: 0,
                color: starredIds.has(r.run_id) ? "#D97706" : S.text3,
                opacity: starredIds.has(r.run_id) ? 1 : 0.4,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "#D97706"; }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = starredIds.has(r.run_id) ? "1" : "0.4";
                e.currentTarget.style.color = starredIds.has(r.run_id) ? "#D97706" : HEX.text3;
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24"
                fill={starredIds.has(r.run_id) ? "#D97706" : "none"}
                stroke={starredIds.has(r.run_id) ? "#D97706" : "currentColor"} strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
            {/* ── 33.1 Pin button ── */}
            <button
              onClick={(e) => togglePin(r.run_id, e)}
              title={pinnedIds.has(r.run_id) ? "Unpin" : pinnedIds.size >= 3 ? "Max 3 pinned" : "Pin to top"}
              style={{
                background: "transparent", border: "none", cursor: pinnedIds.size >= 3 && !pinnedIds.has(r.run_id) ? "not-allowed" : "pointer",
                padding: "2px 4px", borderRadius: 3, flexShrink: 0,
                color: pinnedIds.has(r.run_id) ? HEX.cyan : S.text3,
                opacity: pinnedIds.has(r.run_id) ? 1 : 0.35,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { if (pinnedIds.size < 3 || pinnedIds.has(r.run_id)) { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = HEX.cyan; } }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = pinnedIds.has(r.run_id) ? "1" : "0.35"; e.currentTarget.style.color = pinnedIds.has(r.run_id) ? HEX.cyan : HEX.text3; }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill={pinnedIds.has(r.run_id) ? HEX.cyan : "none"} stroke={pinnedIds.has(r.run_id) ? HEX.cyan : "currentColor"} strokeWidth="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </button>
            {/* ── 25.2 Tag button ── */}
            <div style={{ position: "relative" }}>
              <button
                onClick={(e) => cycleTag(r.run_id, e)}
                title="Tag this run"
                style={{
                  background: runTag ? TAG_COLORS[runTag].bg : "transparent",
                  border: runTag ? `1px solid ${TAG_COLORS[runTag].border}` : "1px solid transparent",
                  borderRadius: 3, cursor: "pointer", padding: "1px 5px",
                  fontFamily: S.mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.08em",
                  color: runTag ? TAG_COLORS[runTag].color : S.text3,
                  transition: "all 0.15s",
                }}
              >
                {runTag ?? "TAG"}
              </button>
              {tagMenuId === r.run_id && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
                  background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)", padding: 4, display: "flex", flexDirection: "column", gap: 2, minWidth: 100,
                }}>
                  {(["REVIEW", "APPROVED", "FLAGGED", null] as (TagValue)[]).map((t) => (
                    <button key={t ?? "clear"} onClick={(e) => applyTag(r.run_id, t, e)} style={{
                      fontFamily: S.mono, fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 3, cursor: "pointer", border: "none", textAlign: "left",
                      background: t ? TAG_COLORS[t].bg : "transparent",
                      color: t ? TAG_COLORS[t].color : S.text3,
                    }}>{t ?? "Clear tag"}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {colVis.standard && (
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2, display: "flex", alignItems: "center" }}>
              {r.standard}
            </span>
          )}
          {/* ── 31.1 D.O. band-position bar ── */}
          {colVis.do_ratio && (() => {
            const ratio = r.dollar_offset_ratio;
            if (ratio == null) return (
              <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2, display: "flex", alignItems: "center" }}>—</span>
            );
            const inBand = ratio >= 0.80 && ratio <= 1.25;
            const nearEdge = !inBand ? false : (ratio < 0.84 || ratio > 1.21);
            const barColor = inBand ? (nearEdge ? HEX.amber : HEX.green) : HEX.red;
            // Clamp position within 0.70–1.35 display range
            const pct = Math.max(0, Math.min(100, ((ratio - 0.70) / (1.35 - 0.70)) * 100));
            return (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 }}>
                <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: barColor }}>
                  {ratio.toFixed(4)}
                </span>
                <div style={{ position: "relative", height: 3, borderRadius: 2, background: S.rim }}>
                  {/* Band zone highlight */}
                  <div style={{
                    position: "absolute",
                    left: `${((0.80 - 0.70) / 0.65) * 100}%`,
                    width: `${((1.25 - 0.80) / 0.65) * 100}%`,
                    top: 0, bottom: 0, borderRadius: 2,
                    background: "rgba(5,150,105,0.15)",
                  }} />
                  {/* Position marker */}
                  <div style={{
                    position: "absolute", left: `${pct}%`, transform: "translateX(-50%)",
                    width: 5, height: 5, borderRadius: "50%", top: -1,
                    background: barColor, boxShadow: `0 0 4px ${barColor}80`,
                  }} />
                </div>
                {/* ── 42.2 D.O. delta vs prior run on same dataset ── */}
                {(() => {
                  const sameDs = runs
                    .filter((x) => x.dataset_id === r.dataset_id && x.dollar_offset_ratio != null && x.created_at && x.run_id !== r.run_id)
                    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
                  // find prior run (most recent run before this one)
                  const prior = sameDs.find((x) => (x.created_at ?? "") < (r.created_at ?? "")) ?? null;
                  if (!prior) return null;
                  const delta = ratio - (prior.dollar_offset_ratio as number);
                  if (Math.abs(delta) < 0.0001) return null;
                  const isPos = delta > 0;
                  return (
                    <span title={`vs prior run (${prior.created_at?.slice(0,10)}): ${isPos ? "+" : ""}${delta.toFixed(4)}`}
                      style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700,
                        color: isPos ? HEX.green : HEX.red }}>
                      {isPos ? "▲" : "▼"}{Math.abs(delta).toFixed(4)}
                    </span>
                  );
                })()}
              </div>
            );
          })()}
          {colVis.r2 && (
            <span style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center",
              color: r.regression_r_squared != null && r.regression_r_squared >= 0.80 ? HEX.green : S.text2,
            }}>
              {r.regression_r_squared != null ? r.regression_r_squared.toFixed(4) : "\u2014"}
            </span>
          )}
          {colVis.verdict && (
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{
                padding: "3px 8px", borderRadius: 3,
                background: r.overall_effective ? HEX.greenBg : HEX.redBg,
                color: r.overall_effective ? HEX.green : HEX.red,
                border: `1px solid ${r.overall_effective ? HEX.greenBorder : HEX.redBorder}`,
              }}>
                {r.overall_effective ? "EFFECTIVE" : "INEFFECTIVE"}
              </span>
              {/* ── 50.2 Out-of-band warning badge ── */}
              {r.overall_effective && r.dollar_offset_ratio != null && (() => {
                const do_ = r.dollar_offset_ratio as number;
                const outOfBand = do_ < 0.80 || do_ > 1.25;
                if (!outOfBand) return null;
                return (
                  <span title={`D.O. ratio ${do_.toFixed(4)} is outside the 80–125% effectiveness band — review required`}
                    style={{
                      fontFamily: S.mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.06em",
                      padding: "1px 4px", borderRadius: 2, cursor: "default",
                      background: HEX.redBg, color: HEX.red, border: `1px solid ${HEX.redBorder}`,
                    }}>
                    ⚠ OOB
                  </span>
                );
              })()}
              {/* ── 39.2 Per-run efficiency score badge ── */}
              {(() => {
                if (r.dollar_offset_ratio == null) return null;
                const do_ = r.dollar_offset_ratio as number;
                const inBand = do_ >= 0.80 && do_ <= 1.25;
                const proximity = inBand ? Math.max(0, 1 - Math.abs(do_ - 1.00) / 0.25) : 0;
                const r2Score = r.regression_r_squared != null ? (r.regression_r_squared as number) : 0.5;
                const score = Math.round(proximity * 70 + r2Score * 30);
                const color = score >= 80 ? HEX.green : score >= 55 ? HEX.cyan : score >= 35 ? HEX.amber : HEX.red;
                return (
                  <span title={`Efficiency score: ${score}/100 (D.O. proximity 70% + R² 30%)`}
                    style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color, cursor: "default", letterSpacing: "0.04em" }}>
                    {score}
                  </span>
                );
              })()}
            </span>
          )}
          <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, display: "flex", alignItems: "center" }}>
            {r.run_hash?.slice(0, 10)}...
          </span>
          {colVis.date && (
            <span
              style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, display: "flex", alignItems: "center", cursor: "pointer" }}
              title={showAge ? "Click to show date" : "Click to show age"}
              onClick={(e) => { e.stopPropagation(); setShowAge((v) => !v); }}
            >
              {/* ── 34.3 Age / date toggle ── */}
              {r.created_at
                ? (showAge ? runAge(r.created_at) : new Date(r.created_at).toLocaleDateString())
                : ""}
            </span>
          )}

          {/* ── 24.2 Hover popover ── */}
          {hoverId === r.run_id && (
            <div style={{
              position: "absolute", left: "calc(100% + 8px)", top: 0, zIndex: 50,
              background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4,
              boxShadow: "0 4px 20px rgba(0,0,0,0.14)", padding: "12px 14px", minWidth: 200,
              pointerEvents: "none",
            }}>
              <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: HEX.cyan, letterSpacing: "0.12em", marginBottom: 8 }}>QUICK VIEW</div>
              {([
                ["Standard",  r.standard.replace("_", " ")],
                ["D.O. Ratio", r.dollar_offset_ratio != null ? r.dollar_offset_ratio.toFixed(4) : "—"],
                ["R²",         r.regression_r_squared != null ? r.regression_r_squared.toFixed(4) : "—"],
                ["Verdict",    r.overall_effective ? "EFFECTIVE" : "INEFFECTIVE"],
                ["Date",       r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
                  <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>{k}</span>
                  <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 600,
                    color: k === "Verdict" ? (r.overall_effective ? HEX.green : HEX.red) : S.text1
                  }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        );
      });
      })()}

      {/* ── 36.3 Keyboard shortcut help overlay ── */}
      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 500,
            background: "rgba(0,0,0,0.35)", backdropFilter: "blur(1px)",
            display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6,
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)", padding: "20px 24px",
              minWidth: 280,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", color: S.text1 }}>
                KEYBOARD SHORTCUTS
              </span>
              <button
                onClick={() => setShowHelp(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: S.text3, padding: 2 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            {([
              ["↑ / ↓",  "Navigate rows"],
              ["Enter",  "Open selected run"],
              ["Space",  "Select / deselect row"],
              ["Esc",    "Clear selection"],
              ["?",      "Show / hide shortcuts"],
            ] as const).map(([key, desc]) => (
              <div key={key} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "6px 0", borderTop: `1px solid ${S.rim}`,
              }}>
                <kbd style={{
                  fontFamily: S.mono, fontSize: 11, fontWeight: 700,
                  padding: "2px 8px", borderRadius: 3, minWidth: 54, textAlign: "center",
                  background: S.sub, border: `1px solid ${S.rim}`, color: S.text2,
                }}>{key}</kbd>
                <span style={{ fontFamily: S.ui, fontSize: 12, color: S.text2 }}>{desc}</span>
              </div>
            ))}
            <div style={{ marginTop: 12, fontFamily: S.ui, fontSize: 10, color: S.text3, textAlign: "center" }}>
              Press <strong>?</strong> or <strong>Esc</strong> to close
            </div>
          </div>
        </div>
      )}

      {/* ── 37.2 Filtered-runs summary footer ── */}
      {filteredRuns.length > 0 && (() => {
        const doVals = filteredRuns.map((r) => r.dollar_offset_ratio).filter((v): v is number => v != null);
        const r2Vals = filteredRuns.map((r) => r.regression_r_squared).filter((v): v is number => v != null);
        const avgDo = doVals.length > 0 ? doVals.reduce((s, v) => s + v, 0) / doVals.length : null;
        const avgR2 = r2Vals.length > 0 ? r2Vals.reduce((s, v) => s + v, 0) / r2Vals.length : null;
        const effCount = filteredRuns.filter((r) => r.overall_effective).length;
        const effRate = Math.round((effCount / filteredRuns.length) * 100);
        const effColor = effRate >= 80 ? HEX.green : effRate >= 60 ? HEX.amber : HEX.red;
        const isFiltered = filteredRuns.length < runs.length;
        // ── 48.2 Run age stats ──
        const datedRuns = filteredRuns.filter((r) => r.created_at);
        const ageStats = datedRuns.length >= 1 ? (() => {
          const dates = datedRuns.map((r) => new Date(r.created_at as string).getTime());
          const newest = Math.max(...dates);
          const oldest = Math.min(...dates);
          const newestDays = Math.floor((Date.now() - newest) / 86400000);
          const spanDays = Math.floor((newest - oldest) / 86400000);
          return { newestDays, spanDays };
        })() : null;
        const kpis = [
          { label: "EFFECTIVE", value: `${effCount} / ${filteredRuns.length}`, color: effColor },
          { label: "PASS RATE", value: `${effRate}%`, color: effColor },
          ...(avgDo != null ? [{ label: "AVG D.O.", value: avgDo.toFixed(4), color: avgDo >= 0.80 && avgDo <= 1.25 ? HEX.green : HEX.amber }] : []),
          ...(avgR2 != null ? [{ label: "AVG R\u00B2", value: avgR2.toFixed(4), color: S.text2 as string }] : []),
          ...(ageStats != null ? [
            { label: "NEWEST", value: ageStats.newestDays === 0 ? "TODAY" : `${ageStats.newestDays}D AGO`, color: ageStats.newestDays <= 1 ? HEX.green : S.text2 as string },
            ...(ageStats.spanDays > 0 ? [{ label: "SPAN", value: `${ageStats.spanDays}D`, color: S.text3 as string }] : []),
          ] : []),
        ];
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
            padding: "8px 16px", borderRadius: 4,
            background: S.panel, border: `1px solid ${S.rim}`, marginTop: 4,
          }}>
            <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>
              {isFiltered ? `FILTERED — ${filteredRuns.length} RUNS` : `ALL ${runs.length} RUNS`}
            </span>
            <div style={{ width: 1, height: 18, background: S.rim }} />
            {kpis.map((kpi) => (
              <div key={kpi.label} style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
                <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: S.text3, letterSpacing: "0.1em" }}>{kpi.label}</span>
                <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 800, color: kpi.color }}>{kpi.value}</span>
              </div>
            ))}
            {/* ── 55.2 Dataset coverage count ── */}
            {(() => {
              const uniqueDs = new Set(filteredRuns.map((r) => r.dataset_id)).size;
              if (uniqueDs <= 1) return null;
              return (
                <>
                  <div style={{ width: 1, height: 18, background: S.rim }} />
                  <div style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
                    <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: S.text3, letterSpacing: "0.1em" }}>DATASETS</span>
                    <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 800, color: S.text2 }}>{uniqueDs}</span>
                  </div>
                </>
              );
            })()}
            {/* ── 52.2 Per-standard breakdown pills ── */}
            {(() => {
              const STDS = ["IAS_39", "IFRS_9", "ASC_815"] as const;
              const stdCounts = STDS.map((std) => ({ std, count: filteredRuns.filter((r) => r.standard === std).length })).filter((s) => s.count > 0);
              if (stdCounts.length < 2) return null;
              return (
                <>
                  <div style={{ width: 1, height: 18, background: S.rim }} />
                  {stdCounts.map(({ std, count }) => (
                    <button
                      key={std}
                      onClick={() => setStdFilter(stdFilter === std ? "ALL" : std)}
                      title={`Filter to ${std.replace("_", " ")} runs`}
                      style={{
                        fontFamily: S.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                        padding: "2px 7px", borderRadius: 3, cursor: "pointer", border: "none",
                        background: stdFilter === std ? HEX.cyan : S.sub,
                        color: stdFilter === std ? "#fff" : S.text3,
                        transition: "all 0.12s",
                      }}
                    >
                      {std.replace("_", " ")} {count}
                    </button>
                  ))}
                </>
              );
            })()}
          </div>
        );
      })()}

      {/* ── 38.2 Page size selector ── */}
      {filteredRuns.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0 0", justifyContent: "flex-end" }}>
          <span style={{ fontFamily: S.mono, fontSize: 9, fontWeight: 700, color: S.text3, letterSpacing: "0.1em" }}>PER PAGE</span>
          {([25, 50, 0] as const).map((sz) => (
            <button
              key={sz}
              onClick={() => { setPageSize(sz); setPage(1); }}
              style={{
                fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                padding: "3px 8px", borderRadius: 3, cursor: "pointer", border: "none",
                background: pageSize === sz ? HEX.cyan : S.sub,
                color: pageSize === sz ? "#fff" : S.text3,
                transition: "all 0.12s",
              }}
            >{sz === 0 ? "ALL" : sz}</button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "12px 0 4px",
        }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            style={{
              fontFamily: S.mono, fontSize: 11, fontWeight: 700,
              padding: "5px 12px", borderRadius: 3, cursor: safePage <= 1 ? "not-allowed" : "pointer",
              background: "transparent", color: safePage <= 1 ? S.text3 : S.text2,
              border: `1px solid ${S.rim}`, opacity: safePage <= 1 ? 0.4 : 1,
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            PREV
          </button>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
              .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) => p === "…" ? (
                <span key={`ellipsis-${i}`} style={{ fontFamily: S.mono, fontSize: 11, color: S.text3, padding: "5px 4px" }}>…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  style={{
                    fontFamily: S.mono, fontSize: 11, fontWeight: 700,
                    width: 30, height: 28, borderRadius: 3, cursor: "pointer",
                    background: p === safePage ? HEX.cyan : "transparent",
                    color: p === safePage ? "#fff" : S.text2,
                    border: `1px solid ${p === safePage ? HEX.cyan : S.rim}`,
                    transition: "all 0.12s",
                  }}
                >
                  {p}
                </button>
              ))}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            style={{
              fontFamily: S.mono, fontSize: 11, fontWeight: 700,
              padding: "5px 12px", borderRadius: 3, cursor: safePage >= totalPages ? "not-allowed" : "pointer",
              background: "transparent", color: safePage >= totalPages ? S.text3 : S.text2,
              border: `1px solid ${S.rim}`, opacity: safePage >= totalPages ? 0.4 : 1,
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            NEXT
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3, marginLeft: 4 }}>
            PAGE {safePage} OF {totalPages}
          </span>
          {/* ── 47.2 Page-jump input ── */}
          {totalPages > 5 && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
              <span style={{ fontFamily: S.mono, fontSize: 10, color: S.text3 }}>GO</span>
              <input
                type="number" min={1} max={totalPages}
                defaultValue={safePage}
                key={safePage}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = parseInt((e.target as HTMLInputElement).value, 10);
                    if (!isNaN(v)) setPage(Math.max(1, Math.min(totalPages, v)));
                  }
                }}
                style={{
                  width: 44, fontFamily: S.mono, fontSize: 11, textAlign: "center",
                  background: S.panel, color: S.text1, border: `1px solid ${S.rim}`,
                  borderRadius: 3, padding: "3px 4px", outline: "none",
                }}
              />
            </span>
          )}
        </div>
      )}

      {/* Compare modal */}
      {compareOpen && (() => {
        const compareRuns = runs.filter((r) => selectedIds.has(r.run_id));
        const metrics: { label: string; render: (r: Run) => React.ReactNode }[] = [
          { label: "DATASET", render: (r) => r.dataset_name },
          { label: "STANDARD", render: (r) => r.standard.replace("_", " ") },
          { label: "D.O. RATIO", render: (r) => r.dollar_offset_ratio != null ? (
            <span style={{ color: r.dollar_offset_ratio >= 0.80 && r.dollar_offset_ratio <= 1.25 ? HEX.green : HEX.red, fontWeight: 700 }}>
              {r.dollar_offset_ratio.toFixed(4)}
            </span>
          ) : "—" },
          { label: "R²", render: (r) => r.regression_r_squared != null ? (
            <span style={{ color: r.regression_r_squared >= 0.80 ? HEX.green : HEX.red, fontWeight: 700 }}>
              {r.regression_r_squared.toFixed(4)}
            </span>
          ) : "—" },
          { label: "VERDICT", render: (r) => (
            <span style={{
              fontFamily: S.mono, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em",
              padding: "2px 8px", borderRadius: 2,
              background: r.overall_effective ? HEX.greenBg : HEX.redBg,
              color: r.overall_effective ? HEX.green : HEX.red,
              border: `1px solid ${r.overall_effective ? HEX.greenBorder : HEX.redBorder}`,
            }}>
              {r.overall_effective ? "EFFECTIVE" : "INEFFECTIVE"}
            </span>
          ) },
          { label: "HASH", render: (r) => <span style={{ fontSize: 11, color: S.text3 }}>{r.run_hash?.slice(0, 12)}…</span> },
          { label: "DATE", render: (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : "—" },
        ];
        return (
          <div
            onClick={() => setCompareOpen(false)}
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
              display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 1000, backdropFilter: "blur(2px)",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "var(--bg-panel, #fff)", borderRadius: 8,
                border: `1px solid ${S.rim}`, maxWidth: 900, width: "calc(100vw - 48px)",
                maxHeight: "calc(100vh - 80px)", overflow: "auto",
                boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
              }}
            >
              {/* Modal header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 24px", borderBottom: `1px solid ${S.rim}`,
                position: "sticky", top: 0, background: "var(--bg-panel, #fff)", zIndex: 1,
              }}>
                <span style={{ fontFamily: S.mono, fontSize: 13, fontWeight: 800, color: S.text1, letterSpacing: "0.1em" }}>
                  RUN COMPARISON — {compareRuns.length} RUNS
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* 29.1 — Export comparison as CSV */}
                  <button
                    onClick={() => {
                      const header = ["run_id","dataset","standard","do_ratio","r_squared","verdict","date"];
                      const rows = compareRuns.map((r) => [
                        r.run_id,
                        `"${r.dataset_name.replace(/"/g,'""')}"`,
                        r.standard,
                        r.dollar_offset_ratio?.toFixed(6) ?? "",
                        r.regression_r_squared?.toFixed(6) ?? "",
                        r.overall_effective ? "EFFECTIVE" : "INEFFECTIVE",
                        r.created_at ? new Date(r.created_at).toISOString().slice(0,10) : "",
                      ]);
                      const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
                      const blob = new Blob([csv], { type: "text/csv" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url; a.download = `he_comparison_${Date.now()}.csv`;
                      a.click(); URL.revokeObjectURL(url);
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                      padding: "5px 12px", borderRadius: 3, cursor: "pointer",
                      background: "transparent", color: S.text2,
                      border: `1px solid ${S.rim}`, transition: "all 0.12s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = HEX.cyan; e.currentTarget.style.color = HEX.cyan; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = S.rim; e.currentTarget.style.color = S.text2; }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    EXPORT CSV
                  </button>
                  <button
                    onClick={() => setCompareOpen(false)}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: S.text3, padding: 4 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6 6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </div>
              {/* Comparison grid */}
              <div style={{ padding: "16px 24px" }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: `140px repeat(${compareRuns.length}, 1fr)`,
                  gap: 1, background: S.rim, borderRadius: 4, overflow: "hidden",
                }}>
                  {/* Header row */}
                  <div style={{ background: S.sub, padding: "10px 14px" }} />
                  {compareRuns.map((r, i) => (
                    <div key={r.run_id} style={{
                      background: S.sub, padding: "10px 14px",
                      borderLeft: i === 0 ? "none" : `1px solid ${S.rim}`,
                    }}>
                      <div style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: HEX.cyan, letterSpacing: "0.1em" }}>
                        RUN {i + 1}
                      </div>
                      <div style={{ fontFamily: S.mono, fontSize: 10, color: S.text3, marginTop: 2 }}>
                        {r.run_id.slice(0, 8)}…
                      </div>
                    </div>
                  ))}
                  {/* Metric rows */}
                  {metrics.map((m, mi) => (
                    <>
                      <div key={`label-${mi}`} style={{
                        background: "var(--bg-panel, #fff)", padding: "10px 14px",
                        fontFamily: S.mono, fontSize: 11, fontWeight: 700,
                        color: S.text3, letterSpacing: "0.12em",
                        borderTop: `1px solid ${S.rim}`,
                      }}>
                        {m.label}
                      </div>
                      {compareRuns.map((r, ri) => (
                        <div key={`${mi}-${ri}`} style={{
                          background: "var(--bg-panel, #fff)", padding: "10px 14px",
                          fontFamily: S.mono, fontSize: 12, color: S.text1,
                          borderTop: `1px solid ${S.rim}`,
                          borderLeft: `1px solid ${S.rim}`,
                          display: "flex", alignItems: "center",
                        }}>
                          {m.render(r)}
                        </div>
                      ))}
                    </>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
