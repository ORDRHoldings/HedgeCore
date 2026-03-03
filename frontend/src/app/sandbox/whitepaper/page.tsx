"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

// ─── Fonts + design tokens ────────────────────────────────────────────────────
const fontMono = "'IBM Plex Mono', 'Courier New', monospace";
const fontUI   = "'IBM Plex Sans', system-ui, sans-serif";

const TOKEN = {
  bg:      "var(--bg-deep,#0a0c10)",
  bgPanel: "var(--bg-panel,#0f1117)",
  bgSub:   "var(--bg-sub,#141720)",
  rim:     "var(--border-rim,#1e2330)",
  soft:    "var(--border-soft,#2a3147)",
  primary: "var(--text-primary,#e2e8f0)",
  sec:     "var(--text-secondary,#94a3b8)",
  tert:    "var(--text-tertiary,#475569)",
  cyan:    "var(--accent-cyan,#22d3ee)",
  green:   "var(--status-pass,#34d399)",
  amber:   "var(--accent-amber,#fbbf24)",
  red:     "var(--accent-red,#f87171)",
  violet:  "#93C5FD",
} as const;

// ─── Whitepaper content ────────────────────────────────────────────────────────

const TOC_SECTIONS = [
  { id: "s1",  num: "1",  title: "Executive Summary" },
  { id: "s2",  num: "2",  title: "Institutional Framework" },
  { id: "s3",  num: "3",  title: "Advanced Mathematical Models" },
  { id: "s4",  num: "4",  title: "Volatility Modeling (GARCH)" },
  { id: "s5",  num: "5",  title: "Scenario Stress Testing" },
  { id: "s6",  num: "6",  title: "Risk Attribution Analytics" },
  { id: "s7",  num: "7",  title: "Market Microstructure" },
  { id: "s8",  num: "8",  title: "Execution Infrastructure" },
  { id: "s9",  num: "9",  title: "Audit & Governance Engine" },
  { id: "s10", num: "10", title: "Validation & Backtesting" },
  { id: "s11", num: "11", title: "Widget Architecture" },
  { id: "s12", num: "12", title: "References" },
];

// ─── Page component ────────────────────────────────────────────────────────────

function WhitepaperPageInner() {
  const params = useSearchParams();
  const runId = params.get("runId") ?? "DEMO";
  const notional = Number(params.get("notional") ?? "10000000");
  const currency = params.get("currency") ?? "MXN";
  const [tocOpen, setTocOpen] = useState(true);

  const notionalUSD = notional > 1000 ? notional : 10_000_000;
  const notionalFmt = notionalUSD.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const runLabel = runId.slice(0, 8).toUpperCase();
  const genDate = new Date().toISOString().slice(0, 10);

  // HTML download
  function handleDownloadHTML() {
    const html = document.querySelector(".wp-main")?.innerHTML ?? "";
    const blob = new Blob([`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>HedgeCore Whitepaper — ${runLabel}</title><style>
      body{font-family:'IBM Plex Sans',system-ui,sans-serif;background:#fff;color:#1e293b;max-width:900px;margin:auto;padding:40px 24px;line-height:1.7;font-size:14px;}
      h1{font-size:28px;font-weight:800;margin:0 0 8px;color:#0f172a;}
      h2{font-size:20px;font-weight:700;margin:36px 0 8px;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:6px;}
      h3{font-size:15px;font-weight:700;margin:20px 0 6px;color:#334155;}
      p{margin:0 0 12px;color:#334155;}
      pre{background:#f8fafc;border:1px solid #e2e8f0;padding:12px 16px;border-radius:4px;font-family:'IBM Plex Mono',monospace;font-size:12px;overflow-x:auto;white-space:pre-wrap;}
      table{width:100%;border-collapse:collapse;margin:16px 0;font-size:12px;}
      th{background:#f1f5f9;font-weight:700;padding:8px 12px;text-align:left;border:1px solid #e2e8f0;}
      td{padding:7px 12px;border:1px solid #e2e8f0;vertical-align:top;}
      .callout{padding:12px 16px;border-radius:4px;margin:12px 0;background:#f0fdf4;border-left:4px solid #22c55e;}
      .badge{display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700;}
      .badge-crit{background:#fee2e2;color:#991b1b;}
      .badge-warn{background:#fef3c7;color:#92400e;}
      .badge-info{background:#e0f2fe;color:#0369a1;}
    </style></head><body>${html}</body></html>`], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HedgeCore-Whitepaper-${runLabel}-${genDate}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const styles = {
    page: {
      background: TOKEN.bg,
      minHeight: "100vh",
      fontFamily: fontUI,
      color: TOKEN.primary,
    } as React.CSSProperties,

    header: {
      background: TOKEN.bgPanel,
      borderBottom: `1px solid ${TOKEN.rim}`,
      padding: "14px 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      position: "sticky" as const,
      top: 0,
      zIndex: 10,
    } as React.CSSProperties,

    body: {
      display: "flex",
      gap: 0,
      maxWidth: 1400,
      margin: "0 auto",
    } as React.CSSProperties,

    toc: {
      width: tocOpen ? 240 : 0,
      minWidth: tocOpen ? 240 : 0,
      flexShrink: 0,
      background: TOKEN.bgPanel,
      borderRight: `1px solid ${TOKEN.rim}`,
      overflow: "hidden",
      transition: "width 0.25s, min-width 0.25s",
      position: "sticky" as const,
      top: 53,
      height: "calc(100vh - 53px)",
      overflowY: "auto" as const,
    } as React.CSSProperties,

    main: {
      flex: 1,
      padding: "32px 40px 60px",
      maxWidth: 900,
      minWidth: 0,
    } as React.CSSProperties,
  };

  function Formula({ children }: { children: string }) {
    return (
      <pre style={{
        fontFamily: fontMono,
        fontSize: 12,
        background: TOKEN.bgSub,
        border: `1px solid ${TOKEN.soft}`,
        borderLeft: `3px solid ${TOKEN.cyan}`,
        padding: "12px 16px",
        borderRadius: "2px 4px 4px 2px",
        overflow: "auto",
        lineHeight: 1.6,
        color: TOKEN.sec,
        margin: "12px 0",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}>
        {children}
      </pre>
    );
  }

  function H2({ id, children }: { id: string; children: React.ReactNode }) {
    return (
      <h2 id={id} style={{
        fontFamily: fontMono,
        fontSize: 18,
        fontWeight: 700,
        color: TOKEN.primary,
        margin: "40px 0 12px",
        paddingBottom: 8,
        borderBottom: `1px solid ${TOKEN.rim}`,
        letterSpacing: "0.02em",
      }}>
        {children}
      </h2>
    );
  }

  function H3({ children }: { children: React.ReactNode }) {
    return (
      <h3 style={{
        fontFamily: fontMono,
        fontSize: 14,
        fontWeight: 700,
        color: TOKEN.cyan,
        margin: "20px 0 6px",
        letterSpacing: "0.04em",
      }}>
        {children}
      </h3>
    );
  }

  function P({ children }: { children: React.ReactNode }) {
    return (
      <p style={{
        fontFamily: fontUI,
        fontSize: 14,
        color: TOKEN.sec,
        lineHeight: 1.75,
        margin: "0 0 14px",
      }}>
        {children}
      </p>
    );
  }

  function Callout({ color, children }: { color?: string; children: React.ReactNode }) {
    const c = color ?? TOKEN.green;
    return (
      <div style={{
        padding: "10px 14px",
        background: `color-mix(in srgb, ${c} 8%, transparent)`,
        borderLeft: `3px solid ${c}`,
        borderRadius: "0 3px 3px 0",
        margin: "14px 0",
        fontFamily: fontUI,
        fontSize: 13,
        color: TOKEN.sec,
        lineHeight: 1.65,
      }}>
        {children}
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => setTocOpen(!tocOpen)}
            style={{
              fontFamily: fontMono, fontSize: 11,
              color: TOKEN.cyan, background: "transparent",
              border: `1px solid ${TOKEN.soft}`, borderRadius: 2,
              padding: "3px 10px", cursor: "pointer",
            }}
          >
            {tocOpen ? "◀ HIDE TOC" : "▶ TOC"}
          </button>
          <span style={{ fontFamily: fontMono, fontSize: 12, fontWeight: 700, color: TOKEN.primary, letterSpacing: "0.06em" }}>
            HEDGECORE — INSTITUTIONAL FX RISK MANAGEMENT
          </span>
          <span style={{
            fontFamily: fontMono, fontSize: 10,
            color: TOKEN.tert, letterSpacing: "0.04em",
          }}>
            TECHNICAL WHITEPAPER · RUN {runLabel} · {genDate}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleDownloadHTML}
            style={{
              fontFamily: fontMono, fontSize: 11,
              color: TOKEN.primary, background: TOKEN.bgSub,
              border: `1px solid ${TOKEN.soft}`, borderRadius: 2,
              padding: "5px 14px", cursor: "pointer",
            }}
          >
            ⬇ HTML
          </button>
          <a
            href={`/sandbox?runId=${runId}`}
            style={{
              fontFamily: fontMono, fontSize: 11,
              color: TOKEN.cyan, background: "transparent",
              border: `1px solid ${TOKEN.soft}`, borderRadius: 2,
              padding: "5px 14px", textDecoration: "none",
            }}
          >
            ← BACK TO SANDBOX
          </a>
        </div>
      </div>

      <div style={styles.body}>
        {/* TOC sidebar */}
        <nav style={styles.toc} aria-label="Table of contents">
          <div style={{ padding: "16px 12px 8px" }}>
            <div style={{ fontFamily: fontMono, fontSize: 9, fontWeight: 700, color: TOKEN.tert, letterSpacing: "0.1em", marginBottom: 10 }}>
              TABLE OF CONTENTS
            </div>
            {TOC_SECTIONS.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                style={{
                  display: "block",
                  fontFamily: fontMono,
                  fontSize: 12,
                  color: TOKEN.sec,
                  textDecoration: "none",
                  padding: "5px 8px",
                  borderRadius: 2,
                  marginBottom: 2,
                  borderLeft: `2px solid transparent`,
                  transition: "color 0.15s, border-color 0.15s",
                }}
                onMouseOver={e => {
                  (e.currentTarget as HTMLElement).style.color = TOKEN.cyan;
                  (e.currentTarget as HTMLElement).style.borderLeftColor = TOKEN.cyan;
                }}
                onMouseOut={e => {
                  (e.currentTarget as HTMLElement).style.color = TOKEN.sec;
                  (e.currentTarget as HTMLElement).style.borderLeftColor = "transparent";
                }}
              >
                <span style={{ color: TOKEN.tert, marginRight: 6 }}>{s.num}.</span>
                {s.title}
              </a>
            ))}
          </div>
        </nav>

        {/* Main content */}
        <main style={styles.main} className="wp-main">
          {/* Cover */}
          <div style={{ marginBottom: 40 }}>
            <div style={{
              fontFamily: fontMono, fontSize: 10,
              color: TOKEN.cyan, letterSpacing: "0.12em",
              marginBottom: 8, textTransform: "uppercase",
            }}>
              SYNEXIUN CAPITAL — ORDR TERMINAL
            </div>
            <h1 style={{
              fontFamily: fontMono, fontSize: 28,
              fontWeight: 800, color: TOKEN.primary,
              margin: "0 0 8px", letterSpacing: "-0.01em",
            }}>
              HedgeCore: Institutional FX Risk<br />Management Platform
            </h1>
            <p style={{
              fontFamily: fontUI, fontSize: 14,
              color: TOKEN.sec, margin: "0 0 16px",
            }}>
              Technical Whitepaper — Advanced Quantitative Methods, Regulatory Compliance &amp;<br />
              Institutional-Grade Hedge Accounting Under IFRS 9 / IAS 39
            </p>
            <div style={{
              display: "flex", gap: 12, flexWrap: "wrap",
              fontFamily: fontMono, fontSize: 11, color: TOKEN.tert,
            }}>
              <span>VERSION 2.0</span>
              <span>·</span>
              <span>GENERATED: {genDate}</span>
              <span>·</span>
              <span>RUN ID: {runLabel}</span>
              <span>·</span>
              <span>CURRENCY: USD/{currency}</span>
              <span>·</span>
              <span>NOTIONAL: {notionalFmt}</span>
            </div>
            <div style={{
              marginTop: 16, padding: "10px 14px",
              background: `color-mix(in srgb, ${TOKEN.amber} 6%, transparent)`,
              border: `1px solid color-mix(in srgb, ${TOKEN.amber} 30%, transparent)`,
              borderRadius: 3,
              fontFamily: fontMono, fontSize: 11,
              color: TOKEN.tert,
            }}>
              CONFIDENTIAL — For qualified institutional investors and risk professionals only.
              This document does not constitute investment advice.
            </div>
          </div>

          <hr style={{ border: "none", borderTop: `1px solid ${TOKEN.rim}`, margin: "0 0 32px" }} />

          {/* Section 1: Executive Summary */}
          <H2 id="s1">1. Executive Summary</H2>
          <P>
            HedgeCore is a Bloomberg Terminal / BlackRock Aladdin-grade FX risk management platform
            built for institutional treasuries managing multi-currency commercial exposures. The engine
            implements the full hedge lifecycle — from exposure aggregation through instrument mapping,
            policy governance, regulatory capital calculation, execution handoff, and IFRS 9 audit documentation.
          </P>
          <P>
            This whitepaper documents the quantitative methods, regulatory frameworks, and system
            architecture underpinning the platform. All mathematical models are implemented to publication
            standard, with academic citations provided for each formula.
          </P>
          <Callout color={TOKEN.cyan}>
            <strong>Key Capabilities:</strong> GARCH(1,1) volatility, Cornish-Fisher VaR, Garman-Kohlhagen
            option pricing, t-Copula tail dependence, Nelson-Siegel-Svensson term structure, SA-CCR (BCBS 279),
            ISDA SIMM v2.6, FRTB SBM (BCBS 457), Vasicek short-rate simulation, and full IFRS 9.6.4.1
            effectiveness testing.
          </Callout>

          {/* Section 2: Institutional Framework */}
          <H2 id="s2">2. Institutional Framework</H2>
          <H3>2.1 Regulatory Standards Compliance</H3>
          <P>
            The platform is designed to be defensible to a risk committee under the following regulatory
            frameworks: IFRS 9 / IAS 39 (hedge accounting), EMIR (bilateral margining, UTI reporting),
            MiFID II Article 27 (best execution), Basel III FRTB (BCBS 457), SA-CCR (BCBS 279), and
            BCBS-IOSCO UMR Phase 6 (initial margin).
          </P>
          <H3>2.2 Governance Chain</H3>
          <Formula>{`Governance Waterfall (IFRS 9 B6.4.1 — Documentation at Inception):
  STAGE 1: Exposure Submission
    proposer_id ≠ approver_id (SOX segregation of duties)
    inputs_hash = SHA-256(trades ∥ policy ∥ market_snapshot)

  STAGE 2: Policy Validation
    coverage_ratio ∈ [0.80, 1.25]            [IFRS 9.6.4.1]
    hedge_cost_bps ≤ policy.max_cost_bps     [Internal limit]
    confirmed_ratio ∈ [0.50, 1.25]           [IAS 39 §AG107]

  STAGE 3: Calculation Engine
    run_id = inputs_hash[:16]                [Deterministic]
    engine_version in frozen_inputs          [Replay integrity]

  STAGE 4: Audit Engine
    14 rules across PRE/CALC/POST/GOVERNANCE
    integrity_score ≥ 90 → INSTITUTIONAL certification

  STAGE 5: Execution Mandate
    EAD = 1.4 × (RC + PFE)                  [BCBS 279 §74]
    SIMM IM ≥ required collateral            [BCBS-IOSCO UMR]`}</Formula>

          {/* Section 3: Advanced Math */}
          <H2 id="s3">3. Advanced Mathematical Models</H2>
          <H3>3.1 Normal Distribution Approximations</H3>
          <Formula>{`Normal CDF — Abramowitz & Stegun (1964) 26.2.17:
  N(x) = 1 - φ(x)·(a₁t + a₂t² + a₃t³ + a₄t⁴ + a₅t⁵) + ε(x)
  t = 1/(1 + 0.2316419·x),   |ε| < 7.5×10⁻⁸
  a₁=0.319381530, a₂=−0.356563782, a₃=1.781477937
  a₄=−1.821255978, a₅=1.330274429

Normal Inverse — Beasley-Springer-Moro (1977):
  For p ∈ (0.5, 0.92): rational approximation
  For p ∈ (0.92, 1.0): tail expansion
  Max absolute error: 3.0×10⁻⁹`}</Formula>

          <H3>3.2 Cornish-Fisher VaR Expansion</H3>
          <P>
            The Cornish-Fisher expansion adjusts normal quantiles for empirical skewness and excess kurtosis,
            producing a more accurate VaR estimate for leptokurtic FX return distributions (Johnson, 1949;
            Fisher &amp; Cornish, 1960).
          </P>
          <Formula>{`Cornish-Fisher Quantile Expansion:
  z_CF = z + (z²-1)·γ₁/6 + (z³-3z)·γ₂/24 - (2z³-5z)·γ₁²/36

  where:
    z    = standard normal quantile (z₉₅=1.6449, z₉₉=2.3263)
    γ₁   = sample skewness = μ₃/σ³
    γ₂   = excess kurtosis = μ₄/σ⁴ - 3

  VaR_CF(α) = -(μ + z_CF(α) × σ) × N
  CVaR_CF(α) = E[L | L > VaR_CF(α)]

Scaling via √T rule (Basel III, BCBS 457 §3.6):
  VaR_T = VaR_1 × √T    (assuming i.i.d. returns)

Academic reference: Johnson, N.L. (1949). Systems of Frequency Curves.
  Biometrika, 36, 149-176. Fisher & Cornish (1960). Technometrics, 2, 209-225.`}</Formula>

          <H3>3.3 Garman-Kohlhagen FX Option Pricing</H3>
          <Formula>{`Garman-Kohlhagen (1983) European FX Option:
  C = S·e^{-r_f·T}·N(d₁) - K·e^{-r_d·T}·N(d₂)
  P = K·e^{-r_d·T}·N(-d₂) - S·e^{-r_f·T}·N(-d₁)

  d₁ = [ln(S/K) + (r_d - r_f + σ²/2)·T] / (σ·√T)
  d₂ = d₁ - σ·√T

Greeks:
  Δ = e^{-r_f·T}·N(d₁)                           (call delta)
  Γ = e^{-r_f·T}·φ(d₁) / (S·σ·√T)               (gamma)
  ν = S·e^{-r_f·T}·φ(d₁)·√T·0.01                (vega per 1% vol)
  Θ = -(S·σ·e^{-r_f·T}·φ(d₁))/(2√T) ± carry     (theta p.a.)
  ρ = K·T·e^{-r_d·T}·N(d₂)                       (rho call, wrt r_d)

Reference: Garman, M.B. & Kohlhagen, S.W. (1983). Foreign Currency Option Values.
  Journal of International Money and Finance, 2(3), 231-237.`}</Formula>

          <H3>3.4 t-Copula Tail Dependence</H3>
          <Formula>{`Bivariate t-Copula Tail Dependence (Longin & Solnik, 2001):
  λ_U = λ_L = 2 · T_{ν+1}(-√((ν+1)(1-ρ)/(1+ρ)))

  where T_{ν+1} = Student's t CDF with ν+1 degrees of freedom
  Computed via regularised incomplete beta function (Lentz algorithm)

Interpretation:
  λ = 0:   asymptotically independent tails (Gaussian copula)
  λ = 1:   perfect tail dependence (comonotonic)
  Typical EM FX crisis: λ ∈ [0.35, 0.65] at ν=5

Reference: Longin, F. & Solnik, B. (2001). Extreme Correlation of International
  Equity Markets. Journal of Finance, 56(2), 649-676.`}</Formula>

          {/* Section 4: GARCH */}
          <H2 id="s4">4. Volatility Modeling (GARCH)</H2>
          <H3>4.1 GARCH(1,1) Implementation</H3>
          <Formula>{`GARCH(1,1) — Bollerslev (1986) [extension of Engle 1982]:
  σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}

  where ε_t = r_t - μ  (return innovation)

Stationarity condition: α + β < 1

Long-run variance:    σ²_∞ = ω / (1 - α - β)
Long-run volatility:  σ_∞ = √(σ²_∞)  [annualised: × √252]

Persistence:          α + β  (close to 1 → slow vol mean reversion)
Half-life of shock:   h = ln(0.5) / ln(α + β)  [trading days]

Typical EM FX calibration:
  α = 0.09 (innovation weight)
  β = 0.90 (persistence)
  ω = σ²_∞ × (1 - α - β)  [calibrated to target long-run vol]

Estimation: Maximum likelihood with Gaussian innovations.
  Quasi-MLE robust to non-normality (Bollerslev & Wooldridge, 1992).

Reference: Bollerslev, T. (1986). Generalised Autoregressive Conditional
  Heteroskedasticity. Journal of Econometrics, 31(3), 307-327.`}</Formula>

          {/* Section 5: Stress Testing */}
          <H2 id="s5">5. Scenario Stress Testing</H2>
          <H3>5.1 Historical Crisis Scenarios</H3>
          <P>
            The platform includes 18 calibrated historical crisis scenarios spanning 1994–2024.
            Each scenario specifies a spot shock (σ), carry shock, and volatility regime consistent
            with the historical episode. The P&amp;L impact is computed analytically without Monte Carlo
            simulation for real-time responsiveness.
          </P>
          <Formula>{`Stress P&L Calculation:
  Unhedged P&L = N × (S_shocked - S_spot) / S_spot
               = N × σ_scenario

  Hedged P&L   = N × σ × (1 - h) - N × h × spread / S_spot

  Hedge Benefit = |Unhedged P&L| - |Hedged P&L|
                = N × σ × h × (1 - spread/S_spot)

  where:
    N = notional (USD equivalent)
    σ = spot shock (signed fraction, e.g. -0.25)
    h = hedge coverage ratio ∈ [0, 1]
    spread = bid/ask spread in local currency (e.g. 0.02 MXN)

Regime-conditional VaR (GARCH-filtered):
  VaR_σ(α) = -z_CF(α) × σ_GARCH × √T × N`}</Formula>

          <H3>5.2 Nelson-Siegel-Svensson Term Structure</H3>
          <Formula>{`Nelson-Siegel-Svensson Forward Rate Curve:
  f(τ) = β₀ + β₁·e^{-τ/λ₁}
       + β₂·(τ/λ₁)·e^{-τ/λ₁}
       + β₃·(τ/λ₂)·e^{-τ/λ₂}

  Parameters:
    β₀ = long-run level (e.g. 0.10 for EM long rate)
    β₁ = short-term component (negative → normal curve)
    β₂ = hump/trough shape factor
    β₃ = second hump (Svensson extension)
    λ₁ = decay factor 1 (e.g. 1.0)
    λ₂ = decay factor 2 (e.g. 4.0)

Spot rate: R(τ) = (1/τ) ∫₀ᵀ f(s) ds  [computed by Gaussian quadrature]

Reference: Nelson, C.R. & Siegel, A.F. (1987). Parsimonious Modelling of Yield
  Curves. Journal of Business, 60(4), 473-489.
  Svensson, L. (1994). Estimating and Interpreting Forward Interest Rates.
  NBER Working Paper 4871.`}</Formula>

          {/* Section 6: Risk Attribution */}
          <H2 id="s6">6. Risk Attribution Analytics</H2>
          <Formula>{`P&L Attribution Decomposition (Euler decomposition):
  ΔV_total = ΔV_FX + ΔV_rates + ΔV_vol + ΔV_carry + ΔV_residual

  FX Component:    ΔV_FX = Σ_i Δ_i × ΔS_i
  Rates Component: ΔV_rates = Σ_i ρ_d,i·Δr_d + ρ_f,i·Δr_f
  Vega Component:  ΔV_vol = Σ_i ν_i × Δσ_i

Component VaR (Euler decomposition):
  Component VaR_i = w_i × (ρ_{i,P} × VaR_P)
  Σ_i Component VaR_i = Portfolio VaR  [additive decomposition]

DV01 (Dollar Value of 1 Basis Point):
  DV01 = ∂V/∂r × 0.0001
  For FX forward: DV01 ≈ N × T × e^{-r·T} × 0.0001

Concentration index:
  HHI = Σ_i w_i²    [Herfindahl-Hirschman Index, 0→1]`}</Formula>

          {/* Section 7: Microstructure */}
          <H2 id="s7">7. Market Microstructure</H2>
          <H3>7.1 Kyle Lambda (Market Impact)</H3>
          <Formula>{`Kyle's Lambda (Kyle, 1985):
  λ = σ / (2 × ADV × √T)

  Price impact of order Q:
    ΔP = λ × Q  [in basis points]

Almgren-Chriss Optimal Execution (2001):
  Temporary impact: g(v) = η × v    (η ≈ 0.142)
  Permanent impact: h(v) = γ × v    (γ ≈ 0.071)

  Optimal trajectory:
    x*(t) = X × sinh(κ(T-t)) / sinh(κT)
    κ = √(λ_risk × σ² × γ / η)

  Limits:
    λ_risk → 0: x*(t) = X × (T-t)/T  [TWAP]
    λ_risk → ∞: x*(t) = X × δ(t=0)  [immediate]

USD/MXN Microstructure (BIS 2022):
  ADV: ~$114B/day  |  Normal spread: 4-8 bps (spot), 6-12 bps (1Y NDF)
  Crisis spread: 50-200 bps (10-30× normal)  |  Kyle λ: ~0.004-0.012 bps/$1M`}</Formula>

          {/* Section 8: Execution */}
          <H2 id="s8">8. Execution Infrastructure</H2>
          <Formula>{`Execution Lifecycle (MiFID II Art. 27 Compliant):
  1. MANDATE GENERATION
     Input: Approved ledger entry → hedge_plan.buckets[]
     Output: Execution manifest (symbol, contracts, tenor, max_spread_bps)

  2. PRE-TRADE ANALYTICS
     SA-CCR EAD = 1.4 × (RC + PFE)
     Spread tolerance: reject if spread > policy.max_spread_bps
     Almgren-Chriss impact estimate

  3. INSTRUMENT MAPPING
     NDF → CME FX futures (proxy) or OTC NDF
     ibkr_symbol, suggested_contracts, margin_estimate_usd

  4. IBKR HANDOFF
     JSON order payload: account, conid, secType, symbol,
       exchange, currency, orderType=MKT, side, quantity
     FIX protocol: 35=D, 11=ClOrdID, 55=Symbol, 54=Side, 38=Qty
     referenceId: "ORDR-{runId[:8]}-{bucket}"

  5. POST-TRADE
     UTI generation (EMIR Art. 9)  |  DTCC/SDR reporting (T+1)
     VM call computation  |  IFRS 9 designation at trade date`}</Formula>

          {/* Section 9: Audit */}
          <H2 id="s9">9. Audit &amp; Governance Engine</H2>
          <P>
            The audit engine runs 14 structured compliance rules. Each rule produces PASS / WARN / FAIL,
            with weighted contribution to the Waterfall Integrity Score (0–100).
          </P>

          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            fontFamily: fontMono,
            margin: "16px 0",
          }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${TOKEN.rim}` }}>
                {["Rule ID", "Name", "Severity", "Regulatory Reference", "Pass Criterion"].map(h => (
                  <th key={h} style={{
                    textAlign: "left", padding: "8px 10px",
                    color: TOKEN.tert, fontWeight: 700, fontSize: 10,
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    background: TOKEN.bgSub,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["PRE-001","Input Completeness","CRITICAL","IFRS 9.6.4.1(c)","trades>0, spot>0, policy valid"],
                ["PRE-002","Market Data Source","HIGH","BCBS 457 §11(b)","Live API > calibrated"],
                ["PRE-003","Policy Validity","HIGH","IFRS 9.6.4.1","ratios within permissible ranges"],
                ["PRE-004","Trade Sanity","MEDIUM","Internal","No stale dates; concentration<50%"],
                ["CALC-001","IFRS 9 Effectiveness","CRITICAL","IFRS 9.6.4.1","coverage 80-125%"],
                ["CALC-002","DV01 Concentration","MEDIUM","BCBS 457 §31","Max bucket DV01 <40%"],
                ["CALC-003","Cornish-Fisher VaR","HIGH","Basel III","VaR99 <50% notional"],
                ["CALC-004","Carry Cost","LOW","MiFID II Art 27","Annual carry <3% notional"],
                ["POST-001","SA-CCR EAD","HIGH","BCBS 279 §74","EAD <25% notional"],
                ["POST-002","ISDA SIMM IM","HIGH","BCBS-IOSCO UMR","IM est. <2% notional"],
                ["POST-003","Leverage Ratio","MEDIUM","BCBS d365","Contribution within limit"],
                ["POST-004","CVA Budget","MEDIUM","BCBS d325","CVA <15bps of notional"],
                ["GOV-001","Run Hash Integrity","HIGH","IFRS 7 para 21","inputs_hash ≠ DEMO"],
                ["GOV-002","Trace Completeness","MEDIUM","SOX §302","trace_events.length > 0"],
              ].map(([id, name, sev, ref, pass]) => (
                <tr key={id} style={{ borderBottom: `1px solid ${TOKEN.soft}` }}>
                  <td style={{ padding: "6px 10px", color: TOKEN.cyan, fontWeight: 700, fontSize: 11 }}>{id}</td>
                  <td style={{ padding: "6px 10px", color: TOKEN.sec, fontSize: 12 }}>{name}</td>
                  <td style={{ padding: "6px 10px" }}>
                    <span style={{
                      fontFamily: fontMono, fontSize: 10,
                      padding: "2px 6px", borderRadius: 2, fontWeight: 700,
                      color: sev === "CRITICAL" ? TOKEN.red : sev === "HIGH" ? TOKEN.amber : TOKEN.tert,
                      background: sev === "CRITICAL"
                        ? `color-mix(in srgb, ${TOKEN.red} 12%, transparent)`
                        : sev === "HIGH"
                          ? `color-mix(in srgb, ${TOKEN.amber} 12%, transparent)`
                          : `color-mix(in srgb, ${TOKEN.tert} 12%, transparent)`,
                    }}>
                      {sev}
                    </span>
                  </td>
                  <td style={{ padding: "6px 10px", color: TOKEN.tert, fontSize: 11 }}>{ref}</td>
                  <td style={{ padding: "6px 10px", color: TOKEN.sec, fontSize: 12 }}>{pass}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Formula>{`Integrity Score Formula:
  score = 100 × Σ(passed_rule_weight) / Σ(all_rule_weights)

  Weights: CRITICAL=20, HIGH=10, MEDIUM=5, LOW=2, INFO=0
  WARN rule: earns 50% of its weight

Certification Levels:
  INSTITUTIONAL: score ≥ 90 AND liveSpotFetched=true
  PROFESSIONAL:  score ≥ 75
  BASIC:         score ≥ 50
  INCOMPLETE:    score < 50`}</Formula>

          {/* Section 10: Backtesting */}
          <H2 id="s10">10. Validation &amp; Backtesting</H2>
          <Formula>{`VaR Backtesting Framework (BCBS 457 §3.8):

Kupiec POF Test:
  H₀: E[exceptions] = (1-α) × T
  LR_POF = -2·ln[(1-α)^{T-N}·αN / ((1-N/T)^{T-N}·(N/T)^N)]
  Reject at 5% critical value χ²(1)=3.84

Traffic light system (99% VaR, T=250 days):
  Green:  0-4 exceptions → model acceptable
  Yellow: 5-9 exceptions → increased scrutiny
  Red:    10+ exceptions → mandatory review

Christoffersen Independence Test:
  H₀: No clustering of VaR exceedances
  Violation → GARCH effects not adequately captured`}</Formula>

          {/* Section 11: Widget */}
          <H2 id="s11">11. Widget Architecture</H2>
          <Formula>{`Widget Embed URL:
  /sandbox?widget=true&currency={CCY}&notional={N}&tab={module}

Available modules: stress | attribution | whatif | regulatory | microstructure

React iframe integration:
  <iframe
    src="/sandbox?widget=true&currency=MXN&notional=50000000&tab=regulatory"
    width="800" height="500" frameBorder="0"
    title="HedgeCore Regulatory Capital Widget"
  />`}</Formula>

          {/* Section 12: References */}
          <H2 id="s12">12. References</H2>
          {[
            "Almgren, R. & Chriss, N. (2001). Optimal Execution of Portfolio Transactions. Journal of Risk, 3(2), 5-39.",
            "Basel Committee on Banking Supervision (2014). BCBS 279 — SA-CCR for Counterparty Credit Risk. BIS.",
            "Basel Committee on Banking Supervision (2019). BCBS 457 — FRTB Final Capital Requirements for Market Risk. BIS.",
            "Bollerslev, T. (1986). Generalised Autoregressive Conditional Heteroskedasticity. Journal of Econometrics, 31(3), 307-327.",
            "Du, W., Tepper, A. & Verdelhan, A. (2018). Deviations from Covered Interest Rate Parity. Journal of Finance, 73(3), 915-957.",
            "Engle, R.F. (1982). ARCH with Estimates of the Variance of UK Inflation. Econometrica, 50(4), 987-1007.",
            "Garman, M.B. & Kohlhagen, S.W. (1983). Foreign Currency Option Values. Journal of International Money and Finance, 2(3), 231-237.",
            "IASB (2014). IFRS 9 Financial Instruments. Effective 1 January 2018.",
            "ISDA (2023). ISDA SIMM Methodology, version 2.6. International Swaps and Derivatives Association.",
            "Johnson, N.L. (1949). Systems of Frequency Curves. Biometrika, 36, 149-176.",
            "Kyle, A.S. (1985). Continuous Auctions and Insider Trading. Econometrica, 53(6), 1315-1335.",
            "Longin, F. & Solnik, B. (2001). Extreme Correlation of International Equity Markets. Journal of Finance, 56(2), 649-676.",
            "Nelson, C.R. & Siegel, A.F. (1987). Parsimonious Modelling of Yield Curves. Journal of Business, 60(4), 473-489.",
            "Vasicek, O.A. (1977). An Equilibrium Characterization of the Term Structure. Journal of Financial Economics, 5(2), 177-188.",
            "Bank for International Settlements (2022). Triennial Central Bank Survey — FX and OTC Derivatives Markets.",
          ].map((ref, i) => (
            <p key={i} style={{
              fontFamily: fontMono, fontSize: 11,
              color: TOKEN.tert, lineHeight: 1.6,
              margin: "0 0 6px",
              paddingLeft: 28,
              textIndent: -28,
            }}>
              [{String(i + 1).padStart(2, "0")}] {ref}
            </p>
          ))}

          <hr style={{ border: "none", borderTop: `1px solid ${TOKEN.rim}`, margin: "32px 0 16px" }} />

          {/* Footer download */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", padding: "8px 0" }}>
            <button
              onClick={handleDownloadHTML}
              style={{
                fontFamily: fontMono, fontSize: 12,
                color: TOKEN.primary, background: TOKEN.bgSub,
                border: `1px solid ${TOKEN.soft}`, borderRadius: 3,
                padding: "8px 20px", cursor: "pointer",
              }}
            >
              ⬇ Download HTML
            </button>
          </div>

          <p style={{
            fontFamily: fontMono, fontSize: 10,
            color: TOKEN.tert, textAlign: "center",
            margin: "16px 0 0",
          }}>
            HedgeCore ORDR Terminal · © 2025 Synexiun Capital ·
            Not investment advice · Regulatory thresholds are indicative ·
            Run {runLabel}
          </p>
        </main>
      </div>
    </div>
  );
}

export default function WhitepaperPage() {
  return (
    <Suspense
      fallback={
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          color: "#94a3b8",
          background: "#0a0f1a",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
        }}>
          Loading whitepaper…
        </div>
      }
    >
      <WhitepaperPageInner />
    </Suspense>
  );
}
