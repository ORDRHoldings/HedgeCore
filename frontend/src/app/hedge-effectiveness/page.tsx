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

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import dynamic from "next/dynamic";

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
  const { token } = useAuth();
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
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
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
          <RunsTab runs={runs} onNavigateRun={(id) => router.push(`/hedge-effectiveness/runs/${id}`)} />
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
  const lastRun = runs[0];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 1100 }}>
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
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DATASETS TAB
// ═════════════════════════════════════════════════════════════════════════════

function DatasetsTab({
  datasets, runs, standard, onRunAssessment, onNavigateRun, submitting,
}: {
  datasets: Dataset[]; runs: Run[]; standard: string;
  onRunAssessment: (id: string) => void;
  onNavigateRun: (id: string) => void;
  submitting: boolean;
}) {
  const [dsSearch, setDsSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const filteredDs = dsSearch.trim()
    ? datasets.filter((ds) =>
        ds.name.toLowerCase().includes(dsSearch.toLowerCase()) ||
        (ds.currency_pair ?? "").toLowerCase().includes(dsSearch.toLowerCase())
      )
    : datasets;

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
        <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>
          {filteredDs.length} OF {datasets.length}
        </span>
      </div>

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

      {filteredDs.length === 0 && dsSearch.trim() ? (
        <div style={{ padding: "24px 20px", fontFamily: S.mono, fontSize: 12, color: S.text3 }}>
          No datasets match &ldquo;{dsSearch}&rdquo;.
        </div>
      ) : filteredDs.map((ds) => {
        const stats = dsStats[ds.id];
        return (
        <div key={ds.id} style={{ borderRadius: 4, border: `1px solid ${expandedId === ds.id ? HEX.cyan + "40" : S.rim}`, overflow: "hidden", transition: "border-color 0.15s" }}>
          {/* Main row */}
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 80px 100px 80px 100px 140px",
            gap: 8, padding: "14px 20px", alignItems: "center",
            background: S.panel, cursor: "pointer",
          }}
            onClick={() => setExpandedId(expandedId === ds.id ? null : ds.id)}
            onMouseEnter={(e) => (e.currentTarget.style.background = HEX.bgSub)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-panel)")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg
                  width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={HEX.text3} strokeWidth="2"
                  style={{ transform: expandedId === ds.id ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}
                >
                  <path d="M9 18l6-6-6-6"/>
                </svg>
                <div style={{ fontFamily: S.ui, fontSize: 13, fontWeight: 600, color: S.text1 }}>
                  {ds.name}
                </div>
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
              </div>
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
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>
              {ds.created_at ? new Date(ds.created_at).toLocaleDateString() : "\u2014"}
            </span>
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

          {/* Accordion expand — last 3 runs */}
          {expandedId === ds.id && (() => {
            const dsRuns = [...runs]
              .filter((r) => r.dataset_id === ds.id)
              .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
              .slice(0, 3);
            return (
              <div style={{
                borderTop: `1px solid ${S.rim}`,
                background: S.sub, padding: "12px 20px",
                display: "flex", flexDirection: "column", gap: 6,
              }}>
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
          <p style={{ fontFamily: S.ui, fontSize: 12, color: S.text3, margin: "0 0 16px", lineHeight: 1.6 }}>
            CSV must contain columns: <code style={{ fontFamily: S.mono, fontSize: 12, color: S.text2, background: S.sub, padding: "1px 4px", borderRadius: 2 }}>hedged_item_fv_change</code>,{" "}
            <code style={{ fontFamily: S.mono, fontSize: 12, color: S.text2, background: S.sub, padding: "1px 4px", borderRadius: 2 }}>instrument_fv_change</code>.
            Optional: <code style={{ fontFamily: S.mono, fontSize: 12, color: S.text2, background: S.sub, padding: "1px 4px", borderRadius: 2 }}>period_date</code>.
          </p>

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
          {formPeriods.map((p, i) => (
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
                style={{ ...inputStyle, fontSize: 12, padding: "6px 10px" }}
                onFocus={(e) => e.currentTarget.style.borderColor = HEX.cyan}
                onBlur={(e) => e.currentTarget.style.borderColor = HEX.border}
              />
              <input
                value={p.instrument_fv_change}
                onChange={(e) => updatePeriod(i, "instrument_fv_change", e.target.value)}
                placeholder="e.g. 14200"
                style={{ ...inputStyle, fontSize: 12, padding: "6px 10px" }}
                onFocus={(e) => e.currentTarget.style.borderColor = HEX.cyan}
                onBlur={(e) => e.currentTarget.style.borderColor = HEX.border}
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
          ))}

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

function RunsTab({ runs, onNavigateRun }: { runs: Run[]; onNavigateRun: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [stdFilter, setStdFilter] = useState("ALL");
  const [verdictFilter, setVerdictFilter] = useState<"ALL" | "EFFECTIVE" | "INEFFECTIVE">("ALL");

  const filteredRuns = runs
    .filter((r) => stdFilter === "ALL" || r.standard === stdFilter)
    .filter((r) => verdictFilter === "ALL" || (verdictFilter === "EFFECTIVE" ? r.overall_effective : !r.overall_effective))
    .filter((r) => {
      const q = search.toLowerCase();
      return !q || r.dataset_name.toLowerCase().includes(q) || (r.currency_pair?.toLowerCase().includes(q) ?? false);
    });

  const handleExportCsv = () => {
    const header = "run_id,dataset_name,currency_pair,standard,dollar_offset_ratio,regression_r_squared,overall_effective,run_hash,created_at";
    const rows = filteredRuns.map((r) =>
      [
        r.run_id, `"${r.dataset_name}"`, r.currency_pair ?? "",
        r.standard, r.dollar_offset_ratio ?? "", r.regression_r_squared ?? "",
        r.overall_effective, r.run_hash, r.created_at ?? "",
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `hedge-effectiveness-runs-${new Date().toISOString().slice(0, 10)}.csv`;
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
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.mono, fontSize: 11, color: S.text3 }}>
          {filteredRuns.length} OF {runs.length} RUNS
        </span>
        <button
          onClick={handleExportCsv}
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
          EXPORT CSV
        </button>
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid", gridTemplateColumns: "2fr 90px 100px 80px 100px 120px 90px",
        gap: 8, padding: "0 20px",
      }}>
        {["DATASET", "STANDARD", "D.O. RATIO", "R\u00B2", "VERDICT", "HASH", "DATE"].map((h) => (
          <span key={h} style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
            {h}
          </span>
        ))}
      </div>

      {filteredRuns.length === 0 ? (
        <div style={{ padding: "32px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>No runs match the current filters.</div>
          <button
            onClick={() => { setSearch(""); setStdFilter("ALL"); setVerdictFilter("ALL"); }}
            style={{
              fontFamily: S.mono, fontSize: 11, padding: "5px 14px", borderRadius: 3, cursor: "pointer",
              background: "transparent", color: HEX.cyan, border: `1px solid rgba(28,98,242,0.25)`,
            }}
          >
            Clear Filters
          </button>
        </div>
      ) : filteredRuns.map((r) => (
        <div
          key={r.run_id}
          onClick={() => onNavigateRun(r.run_id)}
          style={{
            display: "grid", gridTemplateColumns: "2fr 90px 100px 80px 100px 120px 90px",
            gap: 8, padding: "12px 20px", borderRadius: 4,
            background: S.panel, border: `1px solid ${S.rim}`,
            cursor: "pointer", transition: "all 0.15s",
            position: "relative",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = HEX.cyan + "30"; e.currentTarget.style.boxShadow = "0 1px 6px rgba(28,98,242,0.04)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = HEX.border; e.currentTarget.style.boxShadow = "none"; }}
        >
          {/* Left verdict indicator */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
            borderRadius: "4px 0 0 4px",
            background: r.overall_effective ? HEX.green : HEX.red,
          }} />

          <div>
            <div style={{ fontFamily: S.ui, fontSize: 12, fontWeight: 600, color: S.text1 }}>
              {r.dataset_name}
            </div>
            {r.currency_pair && (
              <span style={{ fontFamily: S.mono, fontSize: 12, color: HEX.cyan }}>{r.currency_pair}</span>
            )}
          </div>
          <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2, display: "flex", alignItems: "center" }}>
            {r.standard}
          </span>
          <span style={{
            fontFamily: S.mono, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center",
            color: r.dollar_offset_ratio != null && r.dollar_offset_ratio >= 0.80 && r.dollar_offset_ratio <= 1.25 ? HEX.green : S.text2,
          }}>
            {r.dollar_offset_ratio != null ? r.dollar_offset_ratio.toFixed(4) : "\u2014"}
          </span>
          <span style={{
            fontFamily: S.mono, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center",
            color: r.regression_r_squared != null && r.regression_r_squared >= 0.80 ? HEX.green : S.text2,
          }}>
            {r.regression_r_squared != null ? r.regression_r_squared.toFixed(4) : "\u2014"}
          </span>
          <span style={{
            fontFamily: S.mono, fontSize: 12, fontWeight: 800, letterSpacing: "0.1em",
            display: "flex", alignItems: "center",
          }}>
            <span style={{
              padding: "3px 8px", borderRadius: 3,
              background: r.overall_effective ? HEX.greenBg : HEX.redBg,
              color: r.overall_effective ? HEX.green : HEX.red,
              border: `1px solid ${r.overall_effective ? HEX.greenBorder : HEX.redBorder}`,
            }}>
              {r.overall_effective ? "EFFECTIVE" : "INEFFECTIVE"}
            </span>
          </span>
          <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, display: "flex", alignItems: "center" }}>
            {r.run_hash?.slice(0, 10)}...
          </span>
          <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, display: "flex", alignItems: "center" }}>
            {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
