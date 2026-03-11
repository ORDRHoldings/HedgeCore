"use client";

/**
 * /scenario-studio — Monte Carlo Risk Simulation Studio
 *
 * Production-grade risk analytics page:
 *   SIMULATION — Monte Carlo VaR/CVaR with interactive ECharts
 *   STRESS     — 5 institutional stress scenarios (Vol Crush, Regime Shift, etc.)
 *   VaR        — Percentile distribution table + confidence level analysis
 *   RISK       — Factor covariance decomposition + risk contributions
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import dynamic from "next/dynamic";

import { PageShell } from "@/components/layout/PageShell";
import { Zap } from "lucide-react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ── Design Tokens ─────────────────────────────────────────────────────────
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
  cyanLight: "#3B82F6",
  green: "#059669",
  greenLight: "#10B981",
  greenBg: "#ECFDF5",
  red: "#DC2626",
  redLight: "#F87171",
  redBg: "#FEF2F2",
  amber: "#D97706",
  amberLight: "#F59E0B",
  indigo: "#6366F1",
  text1: "#0F172A",
  text2: "#334155",
  text3: "#94A3B8",
  border: "#E2E8F0",
  bgSub: "#F1F5F9",
} as const;

type Tab = "simulation" | "stress" | "var" | "risk";

interface RunSummary {
  run_id?: string;
  id?: string;
  pair?: string;
  currency_pair?: string;
  created_at?: string;
  run_envelope?: {
    hedge_plan?: { buckets?: unknown[] };
    market?: Record<string, unknown>;
    policy?: Record<string, unknown>;
  };
}

interface VaRResult {
  confidence: number;
  hedged_var: number;
  unhedged_var: number;
  hedged_cvar: number;
  unhedged_cvar: number;
}

interface MonteCarloResult {
  simulation_count: number;
  seed: number | null;
  var_results: VaRResult[];
  percentiles: Record<string, number>;
  mean_hedged_pnl: number;
  std_hedged_pnl: number;
  mean_unhedged_pnl: number;
  std_unhedged_pnl: number;
  worst_hedged_pnl: number;
  worst_unhedged_pnl: number;
  best_hedged_pnl: number;
  hedge_benefit_mean: number;
  hedge_benefit_pct: number;
}

interface StressScenarioImpact {
  scenario_name: string;
  pre_hedge_loss_usd: number;
  post_hedge_loss_usd: number;
  hedge_effectiveness: number;
  margin_impact_usd: number;
  liquidity_impact_pct: number;
  details: {
    fx_shock?: number;
    rate_shock_bps?: number;
    vol_shock?: number;
    margin_shock?: number;
    adv_shock?: number;
    family?: string;
  };
}

interface StressResult {
  scenarios: StressScenarioImpact[];
  worst_case_scenario: string;
  worst_case_loss_usd: number;
  scenario_count: number;
  compound_scenarios_included: boolean;
}

interface RiskContribution {
  factor: string;
  mctr: number;
  weight: number;
  pct_of_variance: number;
}

interface FactorCovResult {
  pre_hedge_variance: number;
  post_hedge_variance: number;
  hedge_effectiveness_ratio: number;
  risk_contributions: RiskContribution[];
  portfolio_volatility: number;
  diversification_ratio: number;
}

interface CompositeResult {
  monte_carlo: MonteCarloResult | null;
  stress_scenarios: StressResult | null;
  factor_covariance: FactorCovResult | null;
}

function fmtUsd(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

// ── Main Page ─────────────────────────────────────────────────────────
export default function ScenarioStudioPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("simulation");

  // Run selection
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [loadingRuns, setLoadingRuns] = useState(true);

  // Simulation config
  const [numSims, setNumSims] = useState(10000);
  const [seed, setSeed] = useState<string>("42");
  const [horizon, setHorizon] = useState(1);
  const [confidenceLevels] = useState([0.90, 0.95, 0.99, 0.995]);

  // Results
  const [result, setResult] = useState<CompositeResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load recent calculation runs
  const loadRuns = useCallback(async () => {
    if (!token) return;
    setLoadingRuns(true);
    try {
      const res = await dashboardFetch("/v1/runs?limit=20", token);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data.items || [];
        setRuns(items);
        if (items.length > 0) {
          setSelectedRunId(items[0].run_id || items[0].id || "");
        }
      }
    } catch {
      // silent
    } finally {
      setLoadingRuns(false);
    }
  }, [token]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  // Run composite analysis
  const runAnalysis = async () => {
    if (!token || !selectedRunId) return;
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      // Load run data first
      const runRes = await dashboardFetch(`/v1/risk/summary/${selectedRunId}`, token);
      if (!runRes.ok) throw new Error(`Failed to load run: HTTP ${runRes.status}`);
      const summary = await runRes.json();

      // Use the Monte Carlo result from summary (already computed with seed=42)
      // But run composite for custom parameters
      const runDetailRes = await dashboardFetch(`/v1/runs/${selectedRunId}`, token);
      if (!runDetailRes.ok) throw new Error(`Failed to load run detail`);
      const runDetail = await runDetailRes.json();

      const envelope = runDetail.run_envelope || {};
      const buckets = envelope.hedge_plan?.buckets || [];
      const market = envelope.market || {};
      const policy = envelope.policy || {};

      if (buckets.length === 0) {
        throw new Error("Selected run has no hedge plan buckets. Run a calculation first.");
      }

      // Run composite analysis with custom parameters
      const compositeRes = await dashboardFetch("/v1/risk/composite", token, {
        method: "POST",
        body: JSON.stringify({
          hedge_actions: buckets,
          market,
          policy,
          num_simulations: numSims,
          seed: seed ? parseInt(seed) : null,
          confidence_levels: confidenceLevels,
          horizon_days: horizon,
        }),
      });

      if (!compositeRes.ok) {
        const err = await compositeRes.json().catch(() => ({}));
        throw new Error(err.detail || `Composite analysis failed: HTTP ${compositeRes.status}`);
      }

      const composite = await compositeRes.json();

      // Merge summary data if composite missing pieces
      setResult({
        monte_carlo: composite.monte_carlo || summary.monte_carlo || null,
        stress_scenarios: composite.stress_scenarios || summary.stress_scenarios || null,
        factor_covariance: composite.factor_covariance || null,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setRunning(false);
    }
  };

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "simulation", label: "MONTE CARLO", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
    { key: "stress", label: "STRESS SCENARIOS", icon: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" },
    { key: "var", label: "VaR / CVaR", icon: "M18 20V10M12 20V4M6 20v-6" },
    { key: "risk", label: "RISK DECOMPOSITION", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
  ];

  const mc = result?.monte_carlo;

  return (

    
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: S.deep }}>
      {/* Header */}
      <div style={{ flexShrink: 0, background: S.panel, borderBottom: `1px solid ${S.rim}` }}>
        <div style={{ padding: "20px 28px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 6,
              background: "rgba(28,98,242,0.06)", border: "1px solid rgba(28,98,242,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={HEX.cyan} strokeWidth="1.5">
                <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <div>
              <h1 style={{ fontFamily: S.mono, fontSize: 15, fontWeight: 700, color: S.text1, letterSpacing: "0.08em", margin: 0 }}>
                SCENARIO STUDIO
              </h1>
              <span style={{ fontFamily: S.ui, fontSize: 12, color: S.text3 }}>
                Monte Carlo simulation, VaR/CVaR, stress testing, risk decomposition
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <span style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
              padding: "4px 12px", borderRadius: 3,
              background: "rgba(28,98,242,0.06)", color: HEX.cyan,
              border: "1px solid rgba(28,98,242,0.12)",
            }}>
              CHOLESKY + REGION-AWARE VOL
            </span>
          </div>
        </div>

        {/* Config strip */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          margin: "14px 28px 0", padding: "12px 16px",
          background: S.sub, borderRadius: 6, border: `1px solid ${S.rim}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>
              RUN
            </label>
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              disabled={loadingRuns}
              style={{
                fontFamily: S.mono, fontSize: 12, padding: "4px 8px",
                border: `1px solid ${S.rim}`, borderRadius: 3,
                background: S.panel, color: S.text1, outline: "none",
                minWidth: 200,
              }}
            >
              {loadingRuns ? (
                <option>Loading...</option>
              ) : runs.length === 0 ? (
                <option>No runs available</option>
              ) : (
                runs.map((r) => {
                  const id = r.run_id || r.id || "";
                  return (
                    <option key={id} value={id}>
                      {id.slice(0, 8)}... | {r.pair || r.currency_pair || "USDMXN"} | {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                    </option>
                  );
                })
              )}
            </select>
          </div>

          <div style={{ width: 1, height: 20, background: S.rim }} />

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>
              SIMULATIONS
            </label>
            <select
              value={numSims}
              onChange={(e) => setNumSims(parseInt(e.target.value))}
              style={{
                fontFamily: S.mono, fontSize: 12, padding: "4px 8px",
                border: `1px solid ${S.rim}`, borderRadius: 3,
                background: S.panel, color: S.text1, outline: "none",
              }}
            >
              {[1000, 5000, 10000, 25000, 50000, 100000].map((n) => (
                <option key={n} value={n}>{n.toLocaleString()}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>
              HORIZON
            </label>
            <select
              value={horizon}
              onChange={(e) => setHorizon(parseInt(e.target.value))}
              style={{
                fontFamily: S.mono, fontSize: 12, padding: "4px 8px",
                border: `1px solid ${S.rim}`, borderRadius: 3,
                background: S.panel, color: S.text1, outline: "none",
              }}
            >
              {[1, 5, 10, 20].map((d) => (
                <option key={d} value={d}>{d}d</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>
              SEED
            </label>
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="random"
              style={{
                fontFamily: S.mono, fontSize: 12, padding: "4px 8px",
                border: `1px solid ${S.rim}`, borderRadius: 3,
                background: S.panel, color: S.text1, outline: "none",
                width: 60,
              }}
            />
          </div>

          <div style={{ flex: 1 }} />

          <button
            onClick={runAnalysis}
            disabled={running || !selectedRunId || loadingRuns}
            style={{
              fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
              padding: "8px 24px", borderRadius: 4,
              background: running ? S.sub : HEX.cyan, color: running ? S.text3 : "#fff",
              border: "none", cursor: running || !selectedRunId ? "not-allowed" : "pointer",
              boxShadow: running ? "none" : "0 2px 8px rgba(28,98,242,0.2)",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {running ? (
              <>
                <div style={{
                  width: 12, height: 12, border: `2px solid ${S.text3}`, borderTopColor: S.cyan,
                  borderRadius: "50%", animation: "spin 0.8s linear infinite",
                }} />
                RUNNING...
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                RUN ANALYSIS
              </>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </button>
        </div>

        {/* KPI strip (shown when results available) */}
        {mc && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
            margin: "12px 28px 0", borderRadius: 6,
            border: `1px solid ${S.rim}`, overflow: "hidden",
          }}>
            {[
              { label: "VaR 99%", value: fmtUsd(mc.var_results.find(v => v.confidence === 0.99)?.hedged_var ?? 0), color: HEX.red },
              { label: "CVaR 99%", value: fmtUsd(mc.var_results.find(v => v.confidence === 0.99)?.hedged_cvar ?? 0), color: HEX.red },
              { label: "MEAN P&L", value: fmtUsd(mc.mean_hedged_pnl), color: mc.mean_hedged_pnl >= 0 ? HEX.green : HEX.red },
              { label: "HEDGE BENEFIT", value: `${mc.hedge_benefit_pct.toFixed(1)}%`, color: HEX.green },
              { label: "SIMULATIONS", value: mc.simulation_count.toLocaleString(), color: undefined },
            ].map((kpi, i) => (
              <div key={kpi.label} style={{
                padding: "10px 14px", background: S.panel,
                borderRight: i < 4 ? `1px solid ${S.rim}` : "none",
              }}>
                <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 3 }}>
                  {kpi.label}
                </div>
                <div style={{ fontFamily: S.mono, fontSize: 18, fontWeight: 700, color: kpi.color || S.text1 }}>
                  {kpi.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, padding: "12px 28px 0" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
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

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {error && (
          <div style={{
            padding: "10px 16px", marginBottom: 16, borderRadius: 4,
            background: HEX.redBg, border: "1px solid rgba(220,38,38,0.2)",
            fontFamily: S.ui, fontSize: 13, color: HEX.red,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>
            </svg>
            {error}
          </div>
        )}

        {!result ? (
          <EmptyState />
        ) : tab === "simulation" ? (
          <SimulationTab mc={result.monte_carlo} />
        ) : tab === "stress" ? (
          <StressTab stress={result.stress_scenarios} />
        ) : tab === "var" ? (
          <VaRTab mc={result.monte_carlo} />
        ) : (
          <RiskTab fcov={result.factor_covariance} mc={result.monte_carlo} />
        )}
      </div>
    </div>
  
    
    );
}

// ── Empty State ───────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 16, padding: 80,
    }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={HEX.text3} strokeWidth="1" opacity="0.3">
        <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
      </svg>
      <div style={{ fontFamily: S.mono, fontSize: 13, fontWeight: 600, color: S.text3, letterSpacing: "0.08em" }}>
        SELECT A CALCULATION RUN AND CLICK RUN ANALYSIS
      </div>
      <p style={{ fontFamily: S.ui, fontSize: 12, color: S.text3, maxWidth: 400, textAlign: "center", lineHeight: 1.6 }}>
        The engine will run Monte Carlo simulation with Cholesky-correlated FX shocks,
        5 institutional stress scenarios, and factor covariance risk decomposition.
      </p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SIMULATION TAB — Monte Carlo Results
// ═════════════════════════════════════════════════════════════════════════════

function SimulationTab({ mc }: { mc: MonteCarloResult | null }) {
  if (!mc) return <NoData label="Monte Carlo simulation not available" />;

  // Build percentile distribution for histogram
  const pctKeys = [1, 5, 10, 25, 50, 75, 90, 95, 99];
  const hedgedPcts = pctKeys.map((p) => mc.percentiles[`hedged_p${String(p).padStart(2, "0")}`] ?? 0);
  const unhedgedPcts = pctKeys.map((p) => mc.percentiles[`unhedged_p${String(p).padStart(2, "0")}`] ?? 0);

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Distribution comparison chart */}
      <div style={{
        padding: "20px 24px", borderRadius: 6, marginBottom: 20,
        background: S.panel, border: `1px solid ${S.rim}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
            P&L PERCENTILE DISTRIBUTION — HEDGED vs UNHEDGED
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, background: HEX.cyan, borderRadius: 2 }} />
              <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>Hedged</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, background: HEX.text3, borderRadius: 2, opacity: 0.5 }} />
              <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>Unhedged</span>
            </div>
          </div>
        </div>
        <PercentileChart hedged={hedgedPcts} unhedged={unhedgedPcts} labels={pctKeys.map(p => `P${p}`)} />
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        {/* Hedged stats */}
        <div style={{ padding: 20, borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}` }}>
          <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: HEX.cyan, letterSpacing: "0.14em", marginBottom: 12 }}>
            HEDGED PORTFOLIO
          </div>
          {[
            { label: "Mean P&L", value: fmtUsd(mc.mean_hedged_pnl), color: mc.mean_hedged_pnl >= 0 ? HEX.green : HEX.red },
            { label: "Std Dev", value: fmtUsd(mc.std_hedged_pnl) },
            { label: "Worst Case", value: fmtUsd(mc.worst_hedged_pnl), color: HEX.red },
            { label: "Best Case", value: fmtUsd(mc.best_hedged_pnl), color: HEX.green },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>{s.label}</span>
              <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: s.color || S.text2 }}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Unhedged stats */}
        <div style={{ padding: 20, borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}` }}>
          <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 12 }}>
            UNHEDGED PORTFOLIO
          </div>
          {[
            { label: "Mean P&L", value: fmtUsd(mc.mean_unhedged_pnl), color: mc.mean_unhedged_pnl >= 0 ? HEX.green : HEX.red },
            { label: "Std Dev", value: fmtUsd(mc.std_unhedged_pnl) },
            { label: "Worst Case", value: fmtUsd(mc.worst_unhedged_pnl), color: HEX.red },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>{s.label}</span>
              <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: s.color || S.text2 }}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Hedge benefit */}
        <div style={{ padding: 20, borderRadius: 6, background: S.panel, border: `1px solid ${S.rim}` }}>
          <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: HEX.green, letterSpacing: "0.14em", marginBottom: 12 }}>
            HEDGE BENEFIT
          </div>
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: S.mono, fontSize: 36, fontWeight: 800, color: HEX.green }}>
              {mc.hedge_benefit_pct.toFixed(1)}%
            </div>
            <div style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, marginTop: 4 }}>
              LOSS REDUCTION
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>Mean Benefit</span>
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: HEX.green }}>{fmtUsd(mc.hedge_benefit_mean)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3 }}>Simulations</span>
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: S.text2 }}>{mc.simulation_count.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Percentile Chart ──────────────────────────────────────────────────
function PercentileChart({ hedged, unhedged, labels }: { hedged: number[]; unhedged: number[]; labels: string[] }) {
  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "#FFFFFFEE",
      borderColor: HEX.border,
      borderWidth: 1,
      textStyle: { color: HEX.text1, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" },
    },
    grid: { left: 56, right: 20, top: 20, bottom: 32, containLabel: false },
    xAxis: {
      type: "category" as const,
      data: labels,
      axisLabel: { color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" },
      axisLine: { lineStyle: { color: HEX.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: {
        color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
        formatter: (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0),
      },
      splitLine: { lineStyle: { color: HEX.border, type: "dashed" as const, opacity: 0.5 } },
    },
    series: [
      {
        name: "Hedged P&L",
        type: "bar" as const,
        data: hedged,
        barMaxWidth: 24,
        itemStyle: {
          color: {
            type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: HEX.cyan },
              { offset: 1, color: HEX.cyan + "66" },
            ],
          },
          borderRadius: [3, 3, 0, 0],
          shadowBlur: 4, shadowColor: "rgba(28,98,242,0.15)",
        },
      },
      {
        name: "Unhedged P&L",
        type: "bar" as const,
        data: unhedged,
        barMaxWidth: 24,
        itemStyle: {
          color: HEX.text3 + "40",
          borderRadius: [3, 3, 0, 0],
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 280, width: "100%" }} opts={{ renderer: "canvas" }} />;
}

// ═════════════════════════════════════════════════════════════════════════════
// STRESS SCENARIOS TAB
// ═════════════════════════════════════════════════════════════════════════════

function StressTab({ stress }: { stress: StressResult | null }) {
  if (!stress || stress.scenarios.length === 0) return <NoData label="Stress scenario results not available" />;

  const scenarios = stress.scenarios;

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Worst case banner */}
      <div style={{
        padding: "14px 20px", marginBottom: 20, borderRadius: 6,
        background: HEX.redBg, border: "1px solid rgba(220,38,38,0.12)",
        borderLeft: `3px solid ${HEX.red}`,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={HEX.red} strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div>
          <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: HEX.red, letterSpacing: "0.12em" }}>
            WORST CASE: {stress.worst_case_scenario.toUpperCase()}
          </span>
          <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: HEX.red, marginLeft: 12 }}>
            {fmtUsd(stress.worst_case_loss_usd)}
          </span>
        </div>
      </div>

      {/* Waterfall chart */}
      <div style={{
        padding: "20px 24px", borderRadius: 6, marginBottom: 20,
        background: S.panel, border: `1px solid ${S.rim}`,
      }}>
        <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
          STRESS SCENARIO IMPACT (POST-HEDGE LOSS)
        </span>
        <StressWaterfallChart scenarios={scenarios} />
      </div>

      {/* Scenario detail cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {scenarios.map((sc) => {
          const isWorst = sc.scenario_name === stress.worst_case_scenario;
          const isCompound = sc.details.family === "compound";
          return (
            <div key={sc.scenario_name} style={{
              padding: 20, borderRadius: 6,
              background: S.panel, border: `1px solid ${isWorst ? HEX.red + "40" : S.rim}`,
              borderLeft: `3px solid ${isWorst ? HEX.red : isCompound ? HEX.amber : HEX.cyan}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text1 }}>
                  {sc.scenario_name}
                </span>
                {isCompound && (
                  <span style={{
                    fontFamily: S.mono, fontSize: 7, fontWeight: 700, letterSpacing: "0.14em",
                    padding: "2px 6px", borderRadius: 2, background: "rgba(217,119,6,0.08)", color: HEX.amber,
                  }}>
                    COMPOUND
                  </span>
                )}
                {isWorst && (
                  <span style={{
                    fontFamily: S.mono, fontSize: 7, fontWeight: 700, letterSpacing: "0.14em",
                    padding: "2px 6px", borderRadius: 2, background: HEX.redBg, color: HEX.red,
                  }}>
                    WORST CASE
                  </span>
                )}
              </div>

              {/* Shocks */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {sc.details.fx_shock ? (
                  <ShockPill label="FX" value={`${(sc.details.fx_shock * 100).toFixed(0)}%`} />
                ) : null}
                {sc.details.rate_shock_bps ? (
                  <ShockPill label="RATES" value={`+${sc.details.rate_shock_bps}bps`} />
                ) : null}
                {sc.details.vol_shock ? (
                  <ShockPill label="VOL" value={`${sc.details.vol_shock > 0 ? "+" : ""}${(sc.details.vol_shock * 100).toFixed(0)}%`} />
                ) : null}
                {sc.details.margin_shock ? (
                  <ShockPill label="MARGIN" value={`+${(sc.details.margin_shock * 100).toFixed(0)}%`} />
                ) : null}
                {sc.details.adv_shock ? (
                  <ShockPill label="ADV" value={`${(sc.details.adv_shock * 100).toFixed(0)}%`} />
                ) : null}
              </div>

              {/* Impact metrics */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { label: "Pre-hedge loss", value: fmtUsd(sc.pre_hedge_loss_usd), color: HEX.red },
                  { label: "Post-hedge loss", value: fmtUsd(sc.post_hedge_loss_usd), color: HEX.red },
                  { label: "Effectiveness", value: pct(sc.hedge_effectiveness), color: HEX.green },
                  { label: "Margin impact", value: fmtUsd(sc.margin_impact_usd) },
                ].map((m) => (
                  <div key={m.label}>
                    <div style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, letterSpacing: "0.1em", marginBottom: 2 }}>
                      {m.label.toUpperCase()}
                    </div>
                    <div style={{ fontFamily: S.mono, fontSize: 13, fontWeight: 700, color: m.color || S.text2 }}>
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShockPill({ label, value }: { label: string; value: string }) {
  return (
    <span style={{
      fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
      padding: "2px 8px", borderRadius: 2, background: S.sub, color: S.text2,
      border: `1px solid ${S.rim}`,
    }}>
      {label}: {value}
    </span>
  );
}

// ── Stress Waterfall Chart ────────────────────────────────────────────
function StressWaterfallChart({ scenarios }: { scenarios: StressScenarioImpact[] }) {
  const labels = scenarios.map((s) => s.scenario_name);
  const preLosses = scenarios.map((s) => Math.abs(s.pre_hedge_loss_usd));
  const postLosses = scenarios.map((s) => Math.abs(s.post_hedge_loss_usd));

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "#FFFFFFEE",
      borderColor: HEX.border,
      borderWidth: 1,
      textStyle: { color: HEX.text1, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" },
      formatter: (params: Array<{ seriesName: string; value: number }>) => {
        return params.map(p => `<b>${p.seriesName}</b>: ${fmtUsd(p.value)}`).join("<br/>");
      },
    },
    grid: { left: 56, right: 20, top: 20, bottom: 50, containLabel: false },
    xAxis: {
      type: "category" as const,
      data: labels,
      axisLabel: { color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", rotate: 20 },
      axisLine: { lineStyle: { color: HEX.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: {
        color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
        formatter: (v: number) => Math.abs(v) >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`,
      },
      splitLine: { lineStyle: { color: HEX.border, type: "dashed" as const, opacity: 0.5 } },
    },
    series: [
      {
        name: "Pre-Hedge Loss",
        type: "bar" as const,
        data: preLosses,
        barMaxWidth: 32,
        itemStyle: {
          color: HEX.text3 + "40",
          borderRadius: [3, 3, 0, 0],
        },
      },
      {
        name: "Post-Hedge Loss",
        type: "bar" as const,
        data: postLosses,
        barMaxWidth: 32,
        itemStyle: {
          color: {
            type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: HEX.red },
              { offset: 1, color: HEX.red + "66" },
            ],
          },
          borderRadius: [3, 3, 0, 0],
          shadowBlur: 4, shadowColor: "rgba(220,38,38,0.15)",
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 260, width: "100%" }} opts={{ renderer: "canvas" }} />;
}

// ═════════════════════════════════════════════════════════════════════════════
// VaR / CVaR TAB
// ═════════════════════════════════════════════════════════════════════════════

function VaRTab({ mc }: { mc: MonteCarloResult | null }) {
  if (!mc) return <NoData label="VaR/CVaR data not available" />;

  const pctKeys = [1, 5, 10, 25, 50, 75, 90, 95, 99];

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* VaR/CVaR by confidence level */}
      <div style={{
        padding: 24, borderRadius: 6, marginBottom: 20,
        background: S.panel, border: `1px solid ${S.rim}`,
      }}>
        <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
          VALUE AT RISK BY CONFIDENCE LEVEL
        </span>
        <VaRConfidenceChart varResults={mc.var_results} />
      </div>

      {/* VaR table */}
      <div style={{
        padding: 24, borderRadius: 6, marginBottom: 20,
        background: S.panel, border: `1px solid ${S.rim}`,
      }}>
        <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", display: "block", marginBottom: 14 }}>
          CONFIDENCE LEVEL DETAIL
        </span>
        <div style={{
          display: "grid", gridTemplateColumns: "100px 1fr 1fr 1fr 1fr",
          gap: 8, padding: "8px 16px", background: S.sub, borderRadius: 4, marginBottom: 8,
        }}>
          {["CONFIDENCE", "HEDGED VaR", "UNHEDGED VaR", "HEDGED CVaR", "UNHEDGED CVaR"].map((h) => (
            <span key={h} style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
              {h}
            </span>
          ))}
        </div>
        {mc.var_results.map((v) => (
          <div key={v.confidence} style={{
            display: "grid", gridTemplateColumns: "100px 1fr 1fr 1fr 1fr",
            gap: 8, padding: "8px 16px", borderBottom: `1px solid ${S.soft}`,
          }}>
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text1 }}>
              {(v.confidence * 100).toFixed(1)}%
            </span>
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: HEX.cyan }}>
              {fmtUsd(v.hedged_var)}
            </span>
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2 }}>
              {fmtUsd(v.unhedged_var)}
            </span>
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: HEX.red }}>
              {fmtUsd(v.hedged_cvar)}
            </span>
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2 }}>
              {fmtUsd(v.unhedged_cvar)}
            </span>
          </div>
        ))}
      </div>

      {/* Percentile table */}
      <div style={{
        padding: 24, borderRadius: 6,
        background: S.panel, border: `1px solid ${S.rim}`,
      }}>
        <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", display: "block", marginBottom: 14 }}>
          P&L PERCENTILE DISTRIBUTION
        </span>
        <div style={{
          display: "grid", gridTemplateColumns: "80px 1fr 1fr",
          gap: 8, padding: "8px 16px", background: S.sub, borderRadius: 4, marginBottom: 8,
        }}>
          {["PERCENTILE", "HEDGED P&L", "UNHEDGED P&L"].map((h) => (
            <span key={h} style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
              {h}
            </span>
          ))}
        </div>
        {pctKeys.map((p) => {
          const hKey = `hedged_p${String(p).padStart(2, "0")}`;
          const uKey = `unhedged_p${String(p).padStart(2, "0")}`;
          const hVal = mc.percentiles[hKey] ?? 0;
          const uVal = mc.percentiles[uKey] ?? 0;
          return (
            <div key={p} style={{
              display: "grid", gridTemplateColumns: "80px 1fr 1fr",
              gap: 8, padding: "6px 16px",
              borderBottom: `1px solid ${S.soft}`,
              background: p === 1 || p === 5 ? "rgba(220,38,38,0.02)" : p === 50 ? "rgba(28,98,242,0.02)" : "transparent",
            }}>
              <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: p <= 5 ? HEX.red : p >= 95 ? HEX.green : S.text2 }}>
                P{p}
              </span>
              <span style={{ fontFamily: S.mono, fontSize: 12, color: hVal < 0 ? HEX.red : HEX.green }}>
                {fmtUsd(hVal)}
              </span>
              <span style={{ fontFamily: S.mono, fontSize: 12, color: uVal < 0 ? HEX.red : HEX.green }}>
                {fmtUsd(uVal)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── VaR Confidence Chart ──────────────────────────────────────────────
function VaRConfidenceChart({ varResults }: { varResults: VaRResult[] }) {
  const sorted = [...varResults].sort((a, b) => a.confidence - b.confidence);
  const labels = sorted.map(v => `${(v.confidence * 100).toFixed(1)}%`);

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "#FFFFFFEE",
      borderColor: HEX.border,
      borderWidth: 1,
      textStyle: { color: HEX.text1, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" },
      formatter: (params: Array<{ seriesName: string; value: number }>) => {
        return params.map(p => `<b>${p.seriesName}</b>: ${fmtUsd(p.value)}`).join("<br/>");
      },
    },
    grid: { left: 56, right: 20, top: 24, bottom: 32, containLabel: false },
    xAxis: {
      type: "category" as const,
      data: labels,
      axisLabel: { color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" },
      axisLine: { lineStyle: { color: HEX.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: {
        color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
        formatter: (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0),
      },
      splitLine: { lineStyle: { color: HEX.border, type: "dashed" as const, opacity: 0.5 } },
    },
    series: [
      {
        name: "Hedged VaR",
        type: "bar" as const,
        data: sorted.map(v => Math.abs(v.hedged_var)),
        barMaxWidth: 28,
        itemStyle: {
          color: { type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: HEX.cyan }, { offset: 1, color: HEX.cyan + "66" }] },
          borderRadius: [3, 3, 0, 0],
        },
      },
      {
        name: "Hedged CVaR",
        type: "bar" as const,
        data: sorted.map(v => Math.abs(v.hedged_cvar)),
        barMaxWidth: 28,
        itemStyle: {
          color: { type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: HEX.red }, { offset: 1, color: HEX.red + "66" }] },
          borderRadius: [3, 3, 0, 0],
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 260, width: "100%" }} opts={{ renderer: "canvas" }} />;
}

// ═════════════════════════════════════════════════════════════════════════════
// RISK DECOMPOSITION TAB
// ═════════════════════════════════════════════════════════════════════════════

function RiskTab({ fcov, mc }: { fcov: FactorCovResult | null; mc: MonteCarloResult | null }) {
  return (
    <div style={{ maxWidth: 1100 }}>
      {fcov ? (
        <>
          {/* Summary KPIs */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20,
          }}>
            {[
              { label: "PRE-HEDGE VOL", value: `${(Math.sqrt(fcov.pre_hedge_variance) * 100).toFixed(2)}%`, color: HEX.red },
              { label: "POST-HEDGE VOL", value: `${(Math.sqrt(fcov.post_hedge_variance) * 100).toFixed(2)}%`, color: HEX.green },
              { label: "HEDGE EFFECTIVENESS", value: pct(fcov.hedge_effectiveness_ratio), color: HEX.green },
              { label: "DIVERSIFICATION", value: fcov.diversification_ratio.toFixed(2), color: HEX.cyan },
            ].map((kpi) => (
              <div key={kpi.label} style={{
                padding: "16px 20px", borderRadius: 6,
                background: S.panel, border: `1px solid ${S.rim}`,
              }}>
                <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 6 }}>
                  {kpi.label}
                </div>
                <div style={{ fontFamily: S.mono, fontSize: 24, fontWeight: 800, color: kpi.color }}>
                  {kpi.value}
                </div>
              </div>
            ))}
          </div>

          {/* Risk contribution chart */}
          {fcov.risk_contributions.length > 0 && (
            <div style={{
              padding: "20px 24px", borderRadius: 6, marginBottom: 20,
              background: S.panel, border: `1px solid ${S.rim}`,
            }}>
              <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
                MARGINAL CONTRIBUTION TO RISK (MCTR)
              </span>
              <RiskContributionChart contributions={fcov.risk_contributions} />
            </div>
          )}

          {/* Contributions table */}
          <div style={{
            padding: 24, borderRadius: 6,
            background: S.panel, border: `1px solid ${S.rim}`,
          }}>
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", display: "block", marginBottom: 14 }}>
              FACTOR RISK DECOMPOSITION
            </span>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 8, padding: "8px 16px", background: S.sub, borderRadius: 4, marginBottom: 8,
            }}>
              {["FACTOR", "WEIGHT", "MCTR", "% VARIANCE"].map((h) => (
                <span key={h} style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>
                  {h}
                </span>
              ))}
            </div>
            {fcov.risk_contributions.map((rc) => (
              <div key={rc.factor} style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
                gap: 8, padding: "8px 16px", borderBottom: `1px solid ${S.soft}`,
              }}>
                <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 600, color: HEX.cyan }}>
                  {rc.factor}
                </span>
                <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2 }}>
                  {pct(rc.weight)}
                </span>
                <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2 }}>
                  {rc.mctr.toFixed(6)}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    flex: 1, height: 6, borderRadius: 3, background: S.sub,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${Math.min(rc.pct_of_variance * 100, 100)}%`,
                      height: "100%", borderRadius: 3,
                      background: HEX.cyan,
                    }} />
                  </div>
                  <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2, minWidth: 36 }}>
                    {pct(rc.pct_of_variance)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <NoData label="Factor covariance data not available" />
      )}

      {/* Monte Carlo summary at bottom */}
      {mc && (
        <div style={{
          marginTop: 20, padding: "16px 20px", borderRadius: 6,
          background: S.sub, border: `1px solid ${S.rim}`,
          display: "flex", alignItems: "center", gap: 20,
        }}>
          <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>
            MC STATS
          </span>
          <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2 }}>
            \u03BC(hedged) = {fmtUsd(mc.mean_hedged_pnl)}
          </span>
          <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2 }}>
            \u03C3(hedged) = {fmtUsd(mc.std_hedged_pnl)}
          </span>
          <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2 }}>
            \u03BC(unhedged) = {fmtUsd(mc.mean_unhedged_pnl)}
          </span>
          <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2 }}>
            \u03C3(unhedged) = {fmtUsd(mc.std_unhedged_pnl)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Risk Contribution Chart ───────────────────────────────────────────
function RiskContributionChart({ contributions }: { contributions: RiskContribution[] }) {
  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "#FFFFFFEE",
      borderColor: HEX.border,
      borderWidth: 1,
      textStyle: { color: HEX.text1, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" },
    },
    grid: { left: 80, right: 20, top: 20, bottom: 32, containLabel: false },
    xAxis: {
      type: "value" as const,
      axisLabel: {
        color: HEX.text3, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
        formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
      },
      max: 1,
      splitLine: { lineStyle: { color: HEX.border, type: "dashed" as const, opacity: 0.5 } },
    },
    yAxis: {
      type: "category" as const,
      data: contributions.map(c => c.factor),
      axisLabel: { color: HEX.text2, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: "bar" as const,
      data: contributions.map(c => c.pct_of_variance),
      barMaxWidth: 20,
      itemStyle: {
        color: {
          type: "linear" as const, x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [
            { offset: 0, color: HEX.cyan },
            { offset: 1, color: HEX.indigo },
          ],
        },
        borderRadius: [0, 3, 3, 0],
        shadowBlur: 4, shadowColor: "rgba(28,98,242,0.15)",
      },
      label: {
        show: true, position: "right" as const,
        fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
        color: HEX.text3,
        formatter: (p: { value: number }) => `${(p.value * 100).toFixed(1)}%`,
      },
    }],
  };

  return <ReactECharts option={option} style={{ height: Math.max(150, contributions.length * 40), width: "100%" }} opts={{ renderer: "canvas" }} />;
}

// ── No Data State ─────────────────────────────────────────────────────
function NoData({ label }: { label: string }) {
  return (
    <PageShell icon={Zap} title="Scenario Studio" breadcrumb={["Dashboard", "Scenario Studio"]} noPadding>

    <div style={{
      padding: 60, textAlign: "center",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
    }}>
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={HEX.text3} strokeWidth="1.5" opacity="0.3">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
      </svg>
      <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, letterSpacing: "0.08em" }}>
        {label}
      </span>
    </div>
  
    </PageShell>
  );
}
