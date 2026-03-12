"use client";

/**
 * /scenario-studio — ORDR Labs: Monte Carlo Risk Simulation Studio
 *
 * Bloomberg-tier risk analytics:
 *   SIMULATION — Monte Carlo VaR/CVaR with interactive ECharts
 *   STRESS     — 5 institutional stress scenarios
 *   VaR        — Percentile distribution + confidence level analysis
 *   RISK       — Factor covariance decomposition + risk contributions
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import dynamic from "next/dynamic";
import {
  Zap, Activity, BarChart3, Shield, Layers,
  Play, FlaskConical, TrendingDown, PieChart,
  ArrowRight, AlertTriangle, CheckCircle2, Target,
} from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ── Design Tokens (white + navy gradient system) ─────────────────────
const C = {
  mono: "'IBM Plex Mono', monospace",
  ui: "'IBM Plex Sans', sans-serif",
  heading: "'Manrope', sans-serif",
  pageBg: "#f0f2f7",
  white: "#FFFFFF",
  navy1: "#0c1929",
  navy2: "#162d50",
  navy3: "#1a3a5f",
  headerGrad: "linear-gradient(135deg, #0c1929 0%, #162d50 50%, #1a3a5f 100%)",
  cardBorder: "#e2e8f0",
  cardShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  cardHover: "0 4px 16px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
  text1: "#0f172a",
  text2: "#334155",
  text3: "#64748b",
  text4: "#94a3b8",
  cyan: "#1C62F2",
  cyanLight: "#3B82F6",
  cyanBg: "rgba(28,98,242,0.06)",
  green: "#059669",
  greenLight: "#10B981",
  greenBg: "#ecfdf5",
  red: "#DC2626",
  redLight: "#F87171",
  redBg: "#fef2f2",
  amber: "#D97706",
  amberBg: "#fffbeb",
  indigo: "#6366F1",
  border: "#E2E8F0",
  bgSub: "#F8FAFC",
} as const;

// ── Types ────────────────────────────────────────────────────────────
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

// ── Reusable Components ──────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="o-card-hover" style={{
      background: C.white, borderRadius: 10, border: `1px solid ${C.cardBorder}`,
      boxShadow: C.cardShadow, ...style,
    }}>
      {children}
    </div>
  );
}

function GradientBadge({ children, color = C.cyan }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontFamily: C.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
      padding: "4px 14px", borderRadius: 20,
      background: `linear-gradient(135deg, ${color}15, ${color}08)`,
      color, border: `1px solid ${color}30`,
    }}>
      {children}
    </span>
  );
}

function SectionHeader({ icon: Icon, title, badge }: { icon: typeof Activity; title: string; badge?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: C.cyanBg, border: `1px solid ${C.cyan}20`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={16} color={C.cyan} strokeWidth={1.8} />
      </div>
      <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.text1, letterSpacing: "0.08em" }}>
        {title}
      </span>
      {badge && <GradientBadge>{badge}</GradientBadge>}
    </div>
  );
}

function GaugeArc({ value, max = 100, label, color, size = 100 }: { value: number; max?: number; label: string; color: string; size?: number }) {
  const pctVal = Math.min(value / max, 1);
  const r = (size - 12) / 2;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - pctVal);
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`}>
        <path
          d={`M 6 ${size / 2 + 6} A ${r} ${r} 0 0 1 ${size - 6} ${size / 2 + 6}`}
          fill="none" stroke="#e2e8f0" strokeWidth={8} strokeLinecap="round"
        />
        <path
          d={`M 6 ${size / 2 + 6} A ${r} ${r} 0 0 1 ${size - 6} ${size / 2 + 6}`}
          fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 4px ${color}40)` }}
        />
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 800, fill: color }}>
          {typeof value === "number" && value % 1 === 0 ? value : value.toFixed(1)}
        </text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 600, fill: C.text4, letterSpacing: "0.12em" }}>
          {label}
        </text>
      </svg>
    </div>
  );
}

function ProgressRing({ value, size = 48, color }: { value: number; size?: number; color: string }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.min(value / 100, 1));
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ filter: `drop-shadow(0 0 3px ${color}40)` }}
      />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, fill: color }}>
        {value.toFixed(0)}
      </text>
    </svg>
  );
}

// ── Main Page ────────────────────────────────────────────────────────
export default function ScenarioStudioPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState(0);

  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [loadingRuns, setLoadingRuns] = useState(true);

  const [numSims, setNumSims] = useState(10000);
  const [seed, setSeed] = useState<string>("42");
  const [horizon, setHorizon] = useState(1);
  const [confidenceLevels] = useState([0.90, 0.95, 0.99, 0.995]);

  const [result, setResult] = useState<CompositeResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const runAnalysis = async () => {
    if (!token || !selectedRunId) return;
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const runRes = await dashboardFetch(`/v1/risk/summary/${selectedRunId}`, token);
      if (!runRes.ok) throw new Error(`Failed to load run: HTTP ${runRes.status}`);
      const summary = await runRes.json();

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

  const TABS = [
    { label: "MONTE CARLO", icon: Activity },
    { label: "STRESS SCENARIOS", icon: AlertTriangle },
    { label: "VaR / CVaR", icon: BarChart3 },
    { label: "RISK DECOMPOSITION", icon: PieChart },
  ];

  const mc = result?.monte_carlo;

  return (
    <PageShell icon={FlaskConical} title="ORDR Labs" breadcrumb={["Dashboard", "ORDR Labs"]} noPadding>
      <style>{`
        .o-card-hover { transition: box-shadow 0.2s, transform 0.2s; }
        .o-card-hover:hover { box-shadow: ${C.cardHover}; transform: translateY(-1px); }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseGlow { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        .lab-fade { animation: fadeIn 0.4s ease-out; }
      `}</style>

      <div style={{ minHeight: "100vh", background: C.pageBg }}>

        {/* ── Hero Header ─────────────────────────────────────────── */}
        <div style={{
          background: C.headerGrad, padding: "36px 40px 28px",
          position: "relative", overflow: "hidden",
        }}>
          {/* Decorative grid */}
          <div style={{
            position: "absolute", inset: 0, opacity: 0.04,
            backgroundImage: `linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }} />
          {/* Decorative circles */}
          <div style={{
            position: "absolute", top: -60, right: -40, width: 260, height: 260, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(28,98,242,0.12), transparent 70%)",
          }} />
          <div style={{
            position: "absolute", bottom: -80, left: "30%", width: 200, height: 200, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(99,102,241,0.08), transparent 70%)",
          }} />

          <div style={{ position: "relative", zIndex: 1 }}>
            {/* Title row */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: "rgba(28,98,242,0.15)", border: "1px solid rgba(28,98,242,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 20px rgba(28,98,242,0.2)",
              }}>
                <FlaskConical size={24} color="#60a5fa" strokeWidth={1.5} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <h1 style={{ fontFamily: C.heading, fontSize: 22, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>
                    ORDR Labs
                  </h1>
                  <span style={{
                    fontFamily: C.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
                    padding: "3px 12px", borderRadius: 20,
                    background: "rgba(16,185,129,0.15)", color: "#6ee7b7",
                    border: "1px solid rgba(16,185,129,0.3)",
                  }}>
                    SIMULATION ENGINE
                  </span>
                  <span style={{
                    fontFamily: C.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
                    padding: "3px 12px", borderRadius: 20,
                    background: "rgba(99,102,241,0.15)", color: "#a5b4fc",
                    border: "1px solid rgba(99,102,241,0.3)",
                  }}>
                    CHOLESKY + REGION-AWARE VOL
                  </span>
                </div>
                <p style={{ fontFamily: C.ui, fontSize: 14, color: "rgba(255,255,255,0.65)", margin: "6px 0 0", lineHeight: 1.6, maxWidth: 700 }}>
                  Institutional-grade risk simulation studio. Quantify tail risk, validate hedge effectiveness
                  under extreme scenarios, and decompose portfolio risk factors &mdash; powered by Monte Carlo
                  simulation with Cholesky-correlated FX shocks.
                </p>
              </div>
            </div>

            {/* Workflow steps */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
            }}>
              {[
                { step: "01", icon: Target, title: "Select Run", desc: "Choose a completed hedge calculation to analyze" },
                { step: "02", icon: Zap, title: "Configure", desc: "Set simulation count, horizon, seed, and confidence levels" },
                { step: "03", icon: Play, title: "Run Analysis", desc: "Execute Monte Carlo, stress tests, VaR, and factor decomposition" },
                { step: "04", icon: Shield, title: "Review Results", desc: "Analyze distribution, tail risk, scenario impacts, and risk factors" },
              ].map((s) => (
                <div key={s.step} style={{
                  padding: "14px 16px", borderRadius: 10,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(8px)",
                  display: "flex", gap: 12, alignItems: "flex-start",
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: "rgba(28,98,242,0.12)", border: "1px solid rgba(28,98,242,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <s.icon size={15} color="#60a5fa" strokeWidth={1.8} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: "rgba(96,165,250,0.7)", letterSpacing: "0.1em" }}>
                        {s.step}
                      </span>
                      <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.06em" }}>
                        {s.title}
                      </span>
                    </div>
                    <span style={{ fontFamily: C.ui, fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
                      {s.desc}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Config Strip ────────────────────────────────────────── */}
        <div style={{ padding: "16px 40px 0" }}>
          <Card style={{ padding: "14px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              {/* Run selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.text4, letterSpacing: "0.12em" }}>
                  RUN
                </label>
                <select
                  value={selectedRunId}
                  onChange={(e) => setSelectedRunId(e.target.value)}
                  disabled={loadingRuns}
                  style={{
                    fontFamily: C.mono, fontSize: 12, padding: "6px 10px",
                    border: `1px solid ${C.border}`, borderRadius: 6,
                    background: C.white, color: C.text1, outline: "none",
                    minWidth: 220, cursor: "pointer",
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

              <div style={{ width: 1, height: 24, background: C.border }} />

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.text4, letterSpacing: "0.12em" }}>
                  SIMULATIONS
                </label>
                <select
                  value={numSims}
                  onChange={(e) => setNumSims(parseInt(e.target.value))}
                  style={{
                    fontFamily: C.mono, fontSize: 12, padding: "6px 10px",
                    border: `1px solid ${C.border}`, borderRadius: 6,
                    background: C.white, color: C.text1, outline: "none", cursor: "pointer",
                  }}
                >
                  {[1000, 5000, 10000, 25000, 50000, 100000].map((n) => (
                    <option key={n} value={n}>{n.toLocaleString()}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.text4, letterSpacing: "0.12em" }}>
                  HORIZON
                </label>
                <select
                  value={horizon}
                  onChange={(e) => setHorizon(parseInt(e.target.value))}
                  style={{
                    fontFamily: C.mono, fontSize: 12, padding: "6px 10px",
                    border: `1px solid ${C.border}`, borderRadius: 6,
                    background: C.white, color: C.text1, outline: "none", cursor: "pointer",
                  }}
                >
                  {[1, 5, 10, 20].map((d) => (
                    <option key={d} value={d}>{d}d</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.text4, letterSpacing: "0.12em" }}>
                  SEED
                </label>
                <input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  placeholder="random"
                  style={{
                    fontFamily: C.mono, fontSize: 12, padding: "6px 10px",
                    border: `1px solid ${C.border}`, borderRadius: 6,
                    background: C.white, color: C.text1, outline: "none",
                    width: 70,
                  }}
                />
              </div>

              <div style={{ flex: 1 }} />

              <button
                onClick={runAnalysis}
                disabled={running || !selectedRunId || loadingRuns}
                style={{
                  fontFamily: C.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                  padding: "8px 28px", borderRadius: 8,
                  background: running ? C.bgSub : C.headerGrad,
                  color: running ? C.text4 : "#fff",
                  border: "none", cursor: running || !selectedRunId ? "not-allowed" : "pointer",
                  boxShadow: running ? "none" : "0 2px 12px rgba(12,25,41,0.25)",
                  display: "flex", alignItems: "center", gap: 8,
                  transition: "all 0.2s",
                }}
              >
                {running ? (
                  <>
                    <div style={{
                      width: 14, height: 14, border: `2px solid ${C.text4}`, borderTopColor: C.cyan,
                      borderRadius: "50%", animation: "spin 0.8s linear infinite",
                    }} />
                    RUNNING...
                  </>
                ) : (
                  <>
                    <Play size={13} strokeWidth={2.5} />
                    RUN ANALYSIS
                  </>
                )}
              </button>
            </div>
          </Card>
        </div>

        {/* ── KPI Strip (when results) ────────────────────────────── */}
        {mc && (
          <div style={{ padding: "12px 40px 0" }} className="lab-fade">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
              {[
                { label: "VaR 99%", value: fmtUsd(mc.var_results.find(v => v.confidence === 0.99)?.hedged_var ?? 0), color: C.red, icon: TrendingDown },
                { label: "CVaR 99%", value: fmtUsd(mc.var_results.find(v => v.confidence === 0.99)?.hedged_cvar ?? 0), color: C.red, icon: AlertTriangle },
                { label: "MEAN P&L", value: fmtUsd(mc.mean_hedged_pnl), color: mc.mean_hedged_pnl >= 0 ? C.green : C.red, icon: Activity },
                { label: "HEDGE BENEFIT", value: `${mc.hedge_benefit_pct.toFixed(1)}%`, color: C.green, icon: Shield },
                { label: "SIMULATIONS", value: mc.simulation_count.toLocaleString(), color: C.cyan, icon: Layers },
              ].map((kpi) => (
                <Card key={kpi.label} style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <kpi.icon size={13} color={kpi.color} strokeWidth={1.8} />
                    <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.text4, letterSpacing: "0.12em" }}>
                      {kpi.label}
                    </span>
                  </div>
                  <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 800, color: kpi.color }}>
                    {kpi.value}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab Bar ─────────────────────────────────────────────── */}
        <div style={{ padding: "16px 40px 0" }}>
          <div style={{ display: "flex", gap: 4, background: C.white, borderRadius: 10, padding: 4, border: `1px solid ${C.border}`, boxShadow: C.cardShadow }}>
            {TABS.map((t, i) => (
              <button
                key={t.label}
                onClick={() => setTab(i)}
                style={{
                  flex: 1, fontFamily: C.mono, fontSize: 12, fontWeight: tab === i ? 700 : 500,
                  letterSpacing: "0.08em", color: tab === i ? "#fff" : C.text3,
                  padding: "10px 16px",
                  background: tab === i ? C.headerGrad : "transparent",
                  border: "none", borderRadius: 8,
                  cursor: "pointer", transition: "all 0.2s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: tab === i ? "0 2px 8px rgba(12,25,41,0.2)" : "none",
                }}
              >
                <t.icon size={13} strokeWidth={tab === i ? 2 : 1.5} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────── */}
        <div style={{ padding: "16px 40px 40px" }} className="lab-fade">
          {error && (
            <Card style={{
              padding: "12px 18px", marginBottom: 16,
              borderLeft: `3px solid ${C.red}`, background: C.redBg,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: C.ui, fontSize: 13, color: C.red }}>
                <AlertTriangle size={15} strokeWidth={2} />
                {error}
              </div>
            </Card>
          )}

          {!result ? (
            <LabEmptyState />
          ) : tab === 0 ? (
            <SimulationTab mc={result.monte_carlo} />
          ) : tab === 1 ? (
            <StressTab stress={result.stress_scenarios} />
          ) : tab === 2 ? (
            <VaRTab mc={result.monte_carlo} />
          ) : (
            <RiskTab fcov={result.factor_covariance} mc={result.monte_carlo} />
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div style={{
          background: C.headerGrad, padding: "16px 40px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <FlaskConical size={14} color="rgba(255,255,255,0.4)" strokeWidth={1.5} />
            <span style={{ fontFamily: C.mono, fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em" }}>
              ORDR LABS v1.0
            </span>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            {["MONTE CARLO", "CHOLESKY DECOMPOSITION", "FACTOR COVARIANCE", "INSTITUTIONAL STRESS"].map((t) => (
              <span key={t} style={{ fontFamily: C.mono, fontSize: 12, color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em" }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

// ── Lab Empty State ───────────────────────────────────────────────────
function LabEmptyState() {
  return (
    <Card style={{ padding: "60px 40px", textAlign: "center" }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20, margin: "0 auto 20px",
        background: `linear-gradient(135deg, ${C.cyanBg}, rgba(99,102,241,0.06))`,
        border: `1px solid ${C.cyan}15`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <FlaskConical size={32} color={C.cyan} strokeWidth={1.2} />
      </div>
      <h3 style={{ fontFamily: C.heading, fontSize: 18, fontWeight: 700, color: C.text1, margin: "0 0 8px" }}>
        Ready to Simulate
      </h3>
      <p style={{ fontFamily: C.ui, fontSize: 14, color: C.text3, maxWidth: 500, margin: "0 auto 24px", lineHeight: 1.7 }}>
        Select a completed hedge calculation run and click <strong>RUN ANALYSIS</strong> to execute
        Monte Carlo simulation with Cholesky-correlated FX shocks, institutional stress scenarios,
        and factor covariance risk decomposition.
      </p>
      <div style={{ display: "flex", justifyContent: "center", gap: 24 }}>
        {[
          { icon: Activity, label: "Monte Carlo VaR", desc: "10K+ path simulation" },
          { icon: AlertTriangle, label: "Stress Scenarios", desc: "5 institutional shocks" },
          { icon: BarChart3, label: "VaR / CVaR", desc: "Multi-confidence analysis" },
          { icon: PieChart, label: "Risk Decomposition", desc: "Factor covariance" },
        ].map((f) => (
          <div key={f.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 140 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: C.cyanBg, border: `1px solid ${C.cyan}15`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <f.icon size={18} color={C.cyan} strokeWidth={1.5} />
            </div>
            <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.text1, letterSpacing: "0.06em" }}>
              {f.label}
            </span>
            <span style={{ fontFamily: C.ui, fontSize: 12, color: C.text4 }}>{f.desc}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SIMULATION TAB — Monte Carlo Results
// ═══════════════════════════════════════════════════════════════════════

function SimulationTab({ mc }: { mc: MonteCarloResult | null }) {
  if (!mc) return <NoData label="Monte Carlo simulation not available" />;

  const pctKeys = [1, 5, 10, 25, 50, 75, 90, 95, 99];
  const hedgedPcts = pctKeys.map((p) => mc.percentiles[`hedged_p${String(p).padStart(2, "0")}`] ?? 0);
  const unhedgedPcts = pctKeys.map((p) => mc.percentiles[`unhedged_p${String(p).padStart(2, "0")}`] ?? 0);

  return (
    <div style={{ maxWidth: 1300 }}>
      {/* Distribution chart */}
      <Card style={{ padding: "24px 28px", marginBottom: 16 }}>
        <SectionHeader icon={Activity} title="P&L PERCENTILE DISTRIBUTION" badge="HEDGED vs UNHEDGED" />
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 4 }}>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: `linear-gradient(135deg, ${C.cyan}, ${C.cyanLight})` }} />
              <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text3 }}>Hedged</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: `${C.text4}50` }} />
              <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text3 }}>Unhedged</span>
            </div>
          </div>
        </div>
        <PercentileChart hedged={hedgedPcts} unhedged={unhedgedPcts} labels={pctKeys.map(p => `P${p}`)} />
      </Card>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {/* Hedged */}
        <Card style={{ padding: 24 }}>
          <SectionHeader icon={Shield} title="HEDGED PORTFOLIO" />
          {[
            { label: "Mean P&L", value: fmtUsd(mc.mean_hedged_pnl), color: mc.mean_hedged_pnl >= 0 ? C.green : C.red },
            { label: "Std Dev", value: fmtUsd(mc.std_hedged_pnl), color: C.text2 },
            { label: "Worst Case", value: fmtUsd(mc.worst_hedged_pnl), color: C.red },
            { label: "Best Case", value: fmtUsd(mc.best_hedged_pnl), color: C.green },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text3 }}>{s.label}</span>
              <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</span>
            </div>
          ))}
        </Card>

        {/* Unhedged */}
        <Card style={{ padding: 24 }}>
          <SectionHeader icon={TrendingDown} title="UNHEDGED PORTFOLIO" />
          {[
            { label: "Mean P&L", value: fmtUsd(mc.mean_unhedged_pnl), color: mc.mean_unhedged_pnl >= 0 ? C.green : C.red },
            { label: "Std Dev", value: fmtUsd(mc.std_unhedged_pnl), color: C.text2 },
            { label: "Worst Case", value: fmtUsd(mc.worst_unhedged_pnl), color: C.red },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text3 }}>{s.label}</span>
              <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</span>
            </div>
          ))}
        </Card>

        {/* Hedge benefit with gauge */}
        <Card style={{ padding: 24, textAlign: "center" }}>
          <SectionHeader icon={CheckCircle2} title="HEDGE BENEFIT" />
          <div style={{ margin: "12px 0" }}>
            <GaugeArc value={mc.hedge_benefit_pct} label="LOSS REDUCTION" color={C.green} size={160} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text3 }}>Mean Benefit</span>
            <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.green }}>{fmtUsd(mc.hedge_benefit_mean)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text3 }}>Simulations</span>
            <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.text2 }}>{mc.simulation_count.toLocaleString()}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Percentile Chart ─────────────────────────────────────────────────
function PercentileChart({ hedged, unhedged, labels }: { hedged: number[]; unhedged: number[]; labels: string[] }) {
  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "#FFFFFFEE",
      borderColor: C.border,
      borderWidth: 1,
      textStyle: { color: C.text1, fontSize: 12, fontFamily: C.mono },
    },
    grid: { left: 60, right: 24, top: 20, bottom: 36, containLabel: false },
    xAxis: {
      type: "category" as const,
      data: labels,
      axisLabel: { color: C.text3, fontSize: 12, fontFamily: C.mono },
      axisLine: { lineStyle: { color: C.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: {
        color: C.text3, fontSize: 12, fontFamily: C.mono,
        formatter: (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0),
      },
      splitLine: { lineStyle: { color: C.border, type: "dashed" as const, opacity: 0.5 } },
    },
    series: [
      {
        name: "Hedged P&L",
        type: "bar" as const,
        data: hedged,
        barMaxWidth: 28,
        itemStyle: {
          color: {
            type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: C.cyan }, { offset: 1, color: C.cyan + "55" }],
          },
          borderRadius: [4, 4, 0, 0],
          shadowBlur: 6, shadowColor: "rgba(28,98,242,0.15)",
        },
      },
      {
        name: "Unhedged P&L",
        type: "bar" as const,
        data: unhedged,
        barMaxWidth: 28,
        itemStyle: {
          color: C.text4 + "35",
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 300, width: "100%" }} opts={{ renderer: "canvas" }} />;
}

// ═══════════════════════════════════════════════════════════════════════
// STRESS SCENARIOS TAB
// ═══════════════════════════════════════════════════════════════════════

function StressTab({ stress }: { stress: StressResult | null }) {
  if (!stress || stress.scenarios.length === 0) return <NoData label="Stress scenario results not available" />;

  const scenarios = stress.scenarios;

  return (
    <div style={{ maxWidth: 1300 }}>
      {/* Worst case banner */}
      <Card style={{
        padding: "14px 20px", marginBottom: 16,
        borderLeft: `4px solid ${C.red}`, background: C.redBg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AlertTriangle size={17} color={C.red} strokeWidth={2} />
          <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.red, letterSpacing: "0.08em" }}>
            WORST CASE: {stress.worst_case_scenario.toUpperCase()}
          </span>
          <ArrowRight size={14} color={C.red} />
          <span style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 800, color: C.red }}>
            {fmtUsd(stress.worst_case_loss_usd)}
          </span>
          <div style={{ flex: 1 }} />
          <GradientBadge color={C.red}>{stress.scenario_count} SCENARIOS</GradientBadge>
          {stress.compound_scenarios_included && <GradientBadge color={C.amber}>COMPOUND</GradientBadge>}
        </div>
      </Card>

      {/* Waterfall chart */}
      <Card style={{ padding: "24px 28px", marginBottom: 16 }}>
        <SectionHeader icon={BarChart3} title="STRESS SCENARIO IMPACT" badge="POST-HEDGE LOSS" />
        <StressWaterfallChart scenarios={scenarios} />
      </Card>

      {/* Scenario cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {scenarios.map((sc) => {
          const isWorst = sc.scenario_name === stress.worst_case_scenario;
          const isCompound = sc.details.family === "compound";
          return (
            <Card key={sc.scenario_name} style={{
              padding: 20,
              borderLeft: `4px solid ${isWorst ? C.red : isCompound ? C.amber : C.cyan}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.text1 }}>
                  {sc.scenario_name}
                </span>
                {isCompound && <GradientBadge color={C.amber}>COMPOUND</GradientBadge>}
                {isWorst && <GradientBadge color={C.red}>WORST CASE</GradientBadge>}
              </div>

              {/* Shock pills */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {sc.details.fx_shock ? <ShockPill label="FX" value={`${(sc.details.fx_shock * 100).toFixed(0)}%`} /> : null}
                {sc.details.rate_shock_bps ? <ShockPill label="RATES" value={`+${sc.details.rate_shock_bps}bps`} /> : null}
                {sc.details.vol_shock ? <ShockPill label="VOL" value={`${sc.details.vol_shock > 0 ? "+" : ""}${(sc.details.vol_shock * 100).toFixed(0)}%`} /> : null}
                {sc.details.margin_shock ? <ShockPill label="MARGIN" value={`+${(sc.details.margin_shock * 100).toFixed(0)}%`} /> : null}
                {sc.details.adv_shock ? <ShockPill label="ADV" value={`${(sc.details.adv_shock * 100).toFixed(0)}%`} /> : null}
              </div>

              {/* Impact grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "PRE-HEDGE LOSS", value: fmtUsd(sc.pre_hedge_loss_usd), color: C.red },
                  { label: "POST-HEDGE LOSS", value: fmtUsd(sc.post_hedge_loss_usd), color: C.red },
                  { label: "EFFECTIVENESS", value: pct(sc.hedge_effectiveness), color: C.green },
                  { label: "MARGIN IMPACT", value: fmtUsd(sc.margin_impact_usd), color: C.text2 },
                ].map((m) => (
                  <div key={m.label} style={{ padding: "8px 10px", borderRadius: 6, background: C.bgSub }}>
                    <div style={{ fontFamily: C.mono, fontSize: 12, color: C.text4, letterSpacing: "0.1em", marginBottom: 3 }}>
                      {m.label}
                    </div>
                    <div style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, color: m.color }}>
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Effectiveness bar */}
              <div style={{ marginTop: 12, height: 6, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}>
                <div style={{
                  width: `${Math.min(sc.hedge_effectiveness * 100, 100)}%`,
                  height: "100%", borderRadius: 3,
                  background: `linear-gradient(90deg, ${C.green}, ${C.greenLight})`,
                  boxShadow: `0 0 6px ${C.green}40`,
                }} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ShockPill({ label, value }: { label: string; value: string }) {
  return (
    <span style={{
      fontFamily: C.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
      padding: "3px 10px", borderRadius: 6, background: C.bgSub, color: C.text2,
      border: `1px solid ${C.border}`,
    }}>
      {label}: {value}
    </span>
  );
}

// ── Stress Waterfall Chart ───────────────────────────────────────────
function StressWaterfallChart({ scenarios }: { scenarios: StressScenarioImpact[] }) {
  const labels = scenarios.map((s) => s.scenario_name);
  const preLosses = scenarios.map((s) => Math.abs(s.pre_hedge_loss_usd));
  const postLosses = scenarios.map((s) => Math.abs(s.post_hedge_loss_usd));

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "#FFFFFFEE",
      borderColor: C.border,
      borderWidth: 1,
      textStyle: { color: C.text1, fontSize: 12, fontFamily: C.mono },
      formatter: (params: Array<{ seriesName: string; value: number }>) => {
        return params.map(p => `<b>${p.seriesName}</b>: ${fmtUsd(p.value)}`).join("<br/>");
      },
    },
    grid: { left: 60, right: 24, top: 20, bottom: 52, containLabel: false },
    xAxis: {
      type: "category" as const,
      data: labels,
      axisLabel: { color: C.text3, fontSize: 12, fontFamily: C.mono, rotate: 15 },
      axisLine: { lineStyle: { color: C.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: {
        color: C.text3, fontSize: 12, fontFamily: C.mono,
        formatter: (v: number) => Math.abs(v) >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`,
      },
      splitLine: { lineStyle: { color: C.border, type: "dashed" as const, opacity: 0.5 } },
    },
    series: [
      {
        name: "Pre-Hedge Loss",
        type: "bar" as const,
        data: preLosses,
        barMaxWidth: 32,
        itemStyle: { color: C.text4 + "35", borderRadius: [4, 4, 0, 0] },
      },
      {
        name: "Post-Hedge Loss",
        type: "bar" as const,
        data: postLosses,
        barMaxWidth: 32,
        itemStyle: {
          color: {
            type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: C.red }, { offset: 1, color: C.red + "55" }],
          },
          borderRadius: [4, 4, 0, 0],
          shadowBlur: 6, shadowColor: "rgba(220,38,38,0.15)",
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 280, width: "100%" }} opts={{ renderer: "canvas" }} />;
}

// ═══════════════════════════════════════════════════════════════════════
// VaR / CVaR TAB
// ═══════════════════════════════════════════════════════════════════════

function VaRTab({ mc }: { mc: MonteCarloResult | null }) {
  if (!mc) return <NoData label="VaR/CVaR data not available" />;

  const pctKeys = [1, 5, 10, 25, 50, 75, 90, 95, 99];

  return (
    <div style={{ maxWidth: 1300 }}>
      {/* VaR/CVaR chart */}
      <Card style={{ padding: "24px 28px", marginBottom: 16 }}>
        <SectionHeader icon={BarChart3} title="VALUE AT RISK BY CONFIDENCE LEVEL" badge="VaR + CVaR" />
        <VaRConfidenceChart varResults={mc.var_results} />
      </Card>

      {/* VaR table */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <SectionHeader icon={Target} title="CONFIDENCE LEVEL DETAIL" />
        <div style={{
          display: "grid", gridTemplateColumns: "100px 1fr 1fr 1fr 1fr",
          gap: 8, padding: "10px 16px", background: C.headerGrad, borderRadius: 8, marginBottom: 4,
        }}>
          {["CONFIDENCE", "HEDGED VaR", "UNHEDGED VaR", "HEDGED CVaR", "UNHEDGED CVaR"].map((h) => (
            <span key={h} style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)", letterSpacing: "0.1em" }}>
              {h}
            </span>
          ))}
        </div>
        {mc.var_results.map((v, i) => (
          <div key={v.confidence} style={{
            display: "grid", gridTemplateColumns: "100px 1fr 1fr 1fr 1fr",
            gap: 8, padding: "10px 16px",
            background: i % 2 === 0 ? C.bgSub : C.white,
            borderRadius: 4,
          }}>
            <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.text1 }}>
              {(v.confidence * 100).toFixed(1)}%
            </span>
            <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.cyan }}>
              {fmtUsd(v.hedged_var)}
            </span>
            <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text3 }}>
              {fmtUsd(v.unhedged_var)}
            </span>
            <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.red }}>
              {fmtUsd(v.hedged_cvar)}
            </span>
            <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text3 }}>
              {fmtUsd(v.unhedged_cvar)}
            </span>
          </div>
        ))}
      </Card>

      {/* Percentile table */}
      <Card style={{ padding: 24 }}>
        <SectionHeader icon={Activity} title="P&L PERCENTILE DISTRIBUTION" />
        <div style={{
          display: "grid", gridTemplateColumns: "80px 1fr 1fr",
          gap: 8, padding: "10px 16px", background: C.headerGrad, borderRadius: 8, marginBottom: 4,
        }}>
          {["PERCENTILE", "HEDGED P&L", "UNHEDGED P&L"].map((h) => (
            <span key={h} style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)", letterSpacing: "0.1em" }}>
              {h}
            </span>
          ))}
        </div>
        {pctKeys.map((p, i) => {
          const hKey = `hedged_p${String(p).padStart(2, "0")}`;
          const uKey = `unhedged_p${String(p).padStart(2, "0")}`;
          const hVal = mc.percentiles[hKey] ?? 0;
          const uVal = mc.percentiles[uKey] ?? 0;
          return (
            <div key={p} style={{
              display: "grid", gridTemplateColumns: "80px 1fr 1fr",
              gap: 8, padding: "8px 16px",
              background: i % 2 === 0 ? C.bgSub : C.white,
              borderRadius: 4,
            }}>
              <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: p <= 5 ? C.red : p >= 95 ? C.green : C.text2 }}>
                P{p}
              </span>
              <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: hVal < 0 ? C.red : C.green }}>
                {fmtUsd(hVal)}
              </span>
              <span style={{ fontFamily: C.mono, fontSize: 13, color: uVal < 0 ? C.red : C.green }}>
                {fmtUsd(uVal)}
              </span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ── VaR Confidence Chart ─────────────────────────────────────────────
function VaRConfidenceChart({ varResults }: { varResults: VaRResult[] }) {
  const sorted = [...varResults].sort((a, b) => a.confidence - b.confidence);
  const labels = sorted.map(v => `${(v.confidence * 100).toFixed(1)}%`);

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "#FFFFFFEE",
      borderColor: C.border,
      borderWidth: 1,
      textStyle: { color: C.text1, fontSize: 12, fontFamily: C.mono },
      formatter: (params: Array<{ seriesName: string; value: number }>) => {
        return params.map(p => `<b>${p.seriesName}</b>: ${fmtUsd(p.value)}`).join("<br/>");
      },
    },
    grid: { left: 60, right: 24, top: 24, bottom: 36, containLabel: false },
    xAxis: {
      type: "category" as const,
      data: labels,
      axisLabel: { color: C.text3, fontSize: 12, fontFamily: C.mono },
      axisLine: { lineStyle: { color: C.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: {
        color: C.text3, fontSize: 12, fontFamily: C.mono,
        formatter: (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0),
      },
      splitLine: { lineStyle: { color: C.border, type: "dashed" as const, opacity: 0.5 } },
    },
    series: [
      {
        name: "Hedged VaR",
        type: "bar" as const,
        data: sorted.map(v => Math.abs(v.hedged_var)),
        barMaxWidth: 32,
        itemStyle: {
          color: { type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: C.cyan }, { offset: 1, color: C.cyan + "55" }] },
          borderRadius: [4, 4, 0, 0],
          shadowBlur: 4, shadowColor: "rgba(28,98,242,0.12)",
        },
      },
      {
        name: "Hedged CVaR",
        type: "bar" as const,
        data: sorted.map(v => Math.abs(v.hedged_cvar)),
        barMaxWidth: 32,
        itemStyle: {
          color: { type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: C.red }, { offset: 1, color: C.red + "55" }] },
          borderRadius: [4, 4, 0, 0],
          shadowBlur: 4, shadowColor: "rgba(220,38,38,0.12)",
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 280, width: "100%" }} opts={{ renderer: "canvas" }} />;
}

// ═══════════════════════════════════════════════════════════════════════
// RISK DECOMPOSITION TAB
// ═══════════════════════════════════════════════════════════════════════

function RiskTab({ fcov, mc }: { fcov: FactorCovResult | null; mc: MonteCarloResult | null }) {
  return (
    <div style={{ maxWidth: 1300 }}>
      {fcov ? (
        <>
          {/* Summary KPIs with gauges */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
            {[
              { label: "PRE-HEDGE VOL", value: `${(Math.sqrt(fcov.pre_hedge_variance) * 100).toFixed(2)}%`, numVal: Math.sqrt(fcov.pre_hedge_variance) * 100, color: C.red },
              { label: "POST-HEDGE VOL", value: `${(Math.sqrt(fcov.post_hedge_variance) * 100).toFixed(2)}%`, numVal: Math.sqrt(fcov.post_hedge_variance) * 100, color: C.green },
              { label: "HEDGE EFFECTIVENESS", value: pct(fcov.hedge_effectiveness_ratio), numVal: fcov.hedge_effectiveness_ratio * 100, color: C.green },
              { label: "DIVERSIFICATION", value: fcov.diversification_ratio.toFixed(2), numVal: fcov.diversification_ratio * 50, color: C.cyan },
            ].map((kpi) => (
              <Card key={kpi.label} style={{ padding: "20px 16px", textAlign: "center" }}>
                <div style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: C.text4, letterSpacing: "0.12em", marginBottom: 8 }}>
                  {kpi.label}
                </div>
                <ProgressRing value={Math.min(kpi.numVal, 100)} size={64} color={kpi.color} />
                <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 800, color: kpi.color, marginTop: 8 }}>
                  {kpi.value}
                </div>
              </Card>
            ))}
          </div>

          {/* Risk contribution chart */}
          {fcov.risk_contributions.length > 0 && (
            <Card style={{ padding: "24px 28px", marginBottom: 16 }}>
              <SectionHeader icon={PieChart} title="MARGINAL CONTRIBUTION TO RISK (MCTR)" badge="FACTOR WEIGHTS" />
              <RiskContributionChart contributions={fcov.risk_contributions} />
            </Card>
          )}

          {/* Contributions table */}
          <Card style={{ padding: 24 }}>
            <SectionHeader icon={Layers} title="FACTOR RISK DECOMPOSITION" />
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 8, padding: "10px 16px", background: C.headerGrad, borderRadius: 8, marginBottom: 4,
            }}>
              {["FACTOR", "WEIGHT", "MCTR", "% VARIANCE"].map((h) => (
                <span key={h} style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)", letterSpacing: "0.1em" }}>
                  {h}
                </span>
              ))}
            </div>
            {fcov.risk_contributions.map((rc, i) => (
              <div key={rc.factor} style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
                gap: 8, padding: "10px 16px",
                background: i % 2 === 0 ? C.bgSub : C.white,
                borderRadius: 4,
              }}>
                <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.cyan }}>
                  {rc.factor}
                </span>
                <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text2 }}>
                  {pct(rc.weight)}
                </span>
                <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text2 }}>
                  {rc.mctr.toFixed(6)}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: "#e2e8f0", overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.min(rc.pct_of_variance * 100, 100)}%`,
                      height: "100%", borderRadius: 4,
                      background: `linear-gradient(90deg, ${C.cyan}, ${C.indigo})`,
                      boxShadow: `0 0 4px ${C.cyan}30`,
                    }} />
                  </div>
                  <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: C.text2, minWidth: 40 }}>
                    {pct(rc.pct_of_variance)}
                  </span>
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : (
        <NoData label="Factor covariance data not available" />
      )}

      {/* MC stats bar */}
      {mc && (
        <Card style={{
          marginTop: 16, padding: "14px 20px",
          borderLeft: `4px solid ${C.cyan}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <GradientBadge>MC STATS</GradientBadge>
            <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text2 }}>
              {"\u03BC"}(hedged) = {fmtUsd(mc.mean_hedged_pnl)}
            </span>
            <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text2 }}>
              {"\u03C3"}(hedged) = {fmtUsd(mc.std_hedged_pnl)}
            </span>
            <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text2 }}>
              {"\u03BC"}(unhedged) = {fmtUsd(mc.mean_unhedged_pnl)}
            </span>
            <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text2 }}>
              {"\u03C3"}(unhedged) = {fmtUsd(mc.std_unhedged_pnl)}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Risk Contribution Chart ──────────────────────────────────────────
function RiskContributionChart({ contributions }: { contributions: RiskContribution[] }) {
  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "#FFFFFFEE",
      borderColor: C.border,
      borderWidth: 1,
      textStyle: { color: C.text1, fontSize: 12, fontFamily: C.mono },
    },
    grid: { left: 80, right: 24, top: 20, bottom: 36, containLabel: false },
    xAxis: {
      type: "value" as const,
      axisLabel: {
        color: C.text3, fontSize: 12, fontFamily: C.mono,
        formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
      },
      max: 1,
      splitLine: { lineStyle: { color: C.border, type: "dashed" as const, opacity: 0.5 } },
    },
    yAxis: {
      type: "category" as const,
      data: contributions.map(c => c.factor),
      axisLabel: { color: C.text2, fontSize: 12, fontFamily: C.mono },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: "bar" as const,
      data: contributions.map(c => c.pct_of_variance),
      barMaxWidth: 22,
      itemStyle: {
        color: {
          type: "linear" as const, x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [{ offset: 0, color: C.cyan }, { offset: 1, color: C.indigo }],
        },
        borderRadius: [0, 4, 4, 0],
        shadowBlur: 6, shadowColor: "rgba(28,98,242,0.15)",
      },
      label: {
        show: true, position: "right" as const,
        fontSize: 12, fontFamily: C.mono,
        color: C.text3,
        formatter: (p: { value: number }) => `${(p.value * 100).toFixed(1)}%`,
      },
    }],
  };

  return <ReactECharts option={option} style={{ height: Math.max(160, contributions.length * 44), width: "100%" }} opts={{ renderer: "canvas" }} />;
}

// ── No Data State ────────────────────────────────────────────────────
function NoData({ label }: { label: string }) {
  return (
    <Card style={{ padding: "48px 32px", textAlign: "center" }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, margin: "0 auto 14px",
        background: C.bgSub, border: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <AlertTriangle size={24} color={C.text4} strokeWidth={1.3} />
      </div>
      <span style={{ fontFamily: C.mono, fontSize: 13, color: C.text3, letterSpacing: "0.06em" }}>
        {label}
      </span>
    </Card>
  );
}
