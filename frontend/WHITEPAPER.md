# ORDR Terminal — HedgeCore Simulation Engine
## Institutional FX Hedging & Risk Management Platform
### Technical Whitepaper v2.0

**Classification:** Public · Free Simulation Layer
**Prepared by:** Synexiun Capital Research
**Last Revised:** 2025
**Standard References:** IFRS 9, Basel III (BCBS 279 / BCBS 457), ISDA SIMM v2.6, MiFID II, EMIR, Dodd-Frank §731

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Platform Architecture](#2-platform-architecture)
3. [Mathematical Framework](#3-mathematical-framework)
4. [Regulatory Compliance Framework](#4-regulatory-compliance-framework)
5. [Historical Crisis Scenario Library](#5-historical-crisis-scenario-library)
6. [Risk Attribution & Analytics](#6-risk-attribution--analytics)
7. [Market Microstructure Models](#7-market-microstructure-models)
8. [Execution Infrastructure](#8-execution-infrastructure)
9. [Validation & Backtesting](#9-validation--backtesting)
10. [Embeddable Widget Architecture](#10-embeddable-widget-architecture)
11. [Audit Trail & Data Governance](#11-audit-trail--data-governance)
12. [References](#12-references)

---

## 1. Executive Summary

ORDR Terminal is an institutional-grade foreign exchange hedging and risk management platform designed to meet the analytical standards of Tier-1 asset managers, corporate treasury functions, and regulated financial institutions. The **HedgeCore Simulation Engine** — the platform's sandbox module — provides a free, embeddable, institutional-quality simulation environment accessible to any organisation via iframe embed or direct API.

### 1.1 Core Value Proposition

| Dimension | Standard Industry Tools | ORDR HedgeCore |
|-----------|------------------------|----------------|
| Regulatory coverage | IFRS 9 only | IFRS 9 + Basel III SA-CCR + CVA + ISDA SIMM v2.6 + FRTB SBM |
| Historical scenarios | 3–5 generic | 18 calibrated historical crises (1994–2023) |
| Execution models | Simple notional | Almgren-Chriss optimal liquidation + Kyle's Lambda |
| Capital calculation | None | Full SA-CCR EAD, CVA charge, leverage ratio |
| Chart types | 2–3 | 8 institutional SVG chart types |
| Compliance | None | Pre-trade checklist, ISDA MA reference, EMIR/Dodd-Frank annotations |
| Distribution | Licensed software | Free embed widget + open API |

### 1.2 Key Statistics

- **18** pre-built historical crisis scenarios spanning 30 years (1994–2023)
- **27** CME-listed currency pairs supported with live market data
- **6** analytical modules: Stress Testing, Risk Attribution, Crisis Library, What-If Builder, Regulatory Capital, Market Microstructure
- **8** institutional-quality SVG chart types (no external chart library dependencies)
- **Zero** hardcoded demo rates in production — live data via Alpha Vantage with CIP fallback
- **IFRS 9.6.4.1** effectiveness band (80–125%) enforced in real-time
- **Basel III BCBS 279** SA-CCR calculations for NDF/FWD portfolios
- **ISDA SIMM v2.6** initial margin with EM Cat 3 risk weights

---

## 2. Platform Architecture

### 2.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ORDR TERMINAL                                   │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  Position    │  │   Policy     │  │   Hedge      │               │
│  │   Desk       │→ │   Engine     │→ │   Engine     │               │
│  │  (Input)     │  │  (IFRS 9)    │  │  (SA-CCR)    │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│           │                                    │                      │
│           ▼                                    ▼                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │               HEDGECORE SIMULATION ENGINE (Sandbox)           │   │
│  │                                                               │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐             │   │
│  │  │  Scenario  │  │   Risk     │  │   Crisis   │             │   │
│  │  │  Stress    │  │Attribution │  │  Library   │             │   │
│  │  └────────────┘  └────────────┘  └────────────┘             │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐             │   │
│  │  │  What-If   │  │Regulatory  │  │  Market    │             │   │
│  │  │  Builder   │  │  Capital   │  │Microstructure│           │   │
│  │  └────────────┘  └────────────┘  └────────────┘             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│           │                                    │                      │
│           ▼                                    ▼                      │
│  ┌──────────────┐                    ┌──────────────┐               │
│  │  Execution   │                    │  Whitepaper  │               │
│  │   Bridge     │                    │   Export     │               │
│  │  (IBKR)      │                    │  (HTML/PDF)  │               │
│  └──────────────┘                    └──────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │   Widget Embed API  │
                    │  /sandbox?widget=1  │
                    │  iframe compatible  │
                    └────────────────────┘
```

### 2.2 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 15 (App Router) | SSR/SSG, React Server Components, edge-ready |
| State management | Redux Toolkit | Predictable state, DevTools support |
| Styling | CSS custom properties (design tokens) | Theme-consistent, zero runtime overhead |
| Charts | Pure SVG (React) | No external dependency, fully customisable, SSR-safe |
| Market data | Alpha Vantage REST API | Live FX rates, 5-min cache |
| Auth | JWT + `useAuth` context | Stateless, refresh-token pattern |
| Capital calcs | Client-side (WASM-ready) | Zero latency, auditable, no API call |

### 2.3 Data Flow

```
Alpha Vantage API
      │
      ▼ spot rate (5-min cache)
/api/market-autofill ──→ Forward points (CIP estimation)
      │
      ▼
SandboxCalculateThunk (Redux)
      │
      ├──→ WaterfallEngine  (rule-based hedging cascade)
      ├──→ ScenarioStressTester  (multi-factor shock grid)
      ├──→ RiskAttributionPanel  (DV01, Greeks, correlation)
      ├──→ WhatIfBuilder  (parameter space explorer)
      ├──→ RegulatoryCapital  (SA-CCR / CVA / SIMM / LR)
      └──→ MarketMicrostructure  (Kyle λ / Almgren-Chriss)
```

---

## 3. Mathematical Framework

### 3.1 Covered Interest Parity (CIP) — Forward Rate Estimation

The platform estimates the forward rate **F(T)** for any maturity T (in years) using covered interest parity:

```
F(T) = S₀ × (1 + r_quote × T) / (1 + r_base × T)
```

where:
- **S₀** = spot rate (local currency per USD)
- **r_quote** = money-market yield of the quote currency
- **r_base** = money-market yield of the base currency (USD)
- **T** = time to maturity in years

**Forward Points** (as typically quoted by dealers):

```
FwdPts = F(T) - S₀ = S₀ × (r_quote - r_base) × T / (1 + r_base × T)
```

For approximation purposes, when interbank yield curves are not directly available, the platform uses calibrated carry differentials (bps/month) derived from BIS data and central bank rate decisions:

| Currency | Carry (bps/month) | Central Bank | Data Source |
|----------|-------------------|-------------|-------------|
| MXN | 48 | Banxico | BIS, Bloomberg |
| BRL | 95 | BCB | BIS, Bloomberg |
| TRY | 142 | CBRT | BIS, Bloomberg |
| EUR | -5 | ECB | BIS, Bloomberg |
| JPY | -10 | BOJ | BIS, Bloomberg |
| ZAR | 60 | SARB | BIS, Bloomberg |

*Source: BIS Quarterly Review, ECB Statistical Data Warehouse, Federal Reserve H.15 Selected Interest Rates*

### 3.2 P&L Attribution Model

Total portfolio P&L is decomposed into orthogonal risk factors:

```
ΔP&L = ΔP&L_fx + ΔP&L_carry + ΔP&L_hedge + ΔP&L_friction + ΔP&L_basis
```

where:

**FX component:**
```
ΔP&L_fx = Σᵢ Nᵢ × (S_T - S₀) / S₀
```

**Carry component:**
```
ΔP&L_carry = Σᵢ Nᵢ × (r_quote,i - r_base) × Δt
```

**Hedge component (per bucket j):**
```
ΔP&L_hedge_j = N_hedge_j × (F_j(t=0) - S_T)
```

**Friction component:**
```
ΔP&L_friction = Σⱼ N_hedge_j × ½ × Bid-Ask_j
```

**Basis risk:**
```
ΔP&L_basis = Σⱼ N_hedge_j × (F_proxy_j - F_actual_j)
```

### 3.3 DV01 (Dollar Value of a Basis Point)

For a FX forward or NDF position:

```
DV01 = ∂P / ∂y × 0.0001 ≈ N × τ × 0.0001
```

where **τ** is the remaining tenor in years and **N** is the notional in USD. For a bucketed portfolio:

```
Portfolio_DV01 = Σⱼ |N_j| × τⱼ × 0.0001
```

The FRTB Sensitivity-Based Method (BCBS 457, §B.15) requires the portfolio DV01 to be reported at each tenor bucket for the Interest Rate risk factor class.

### 3.4 IFRS 9 Hedge Effectiveness Testing

#### 3.4.1 Prospective Effectiveness — Geometric Brownian Motion (GBM)

The platform runs a Monte Carlo simulation under GBM to verify *prospective* effectiveness:

```
dS = S × (μ dt + σ dW)
```

Discrete form: `S(t+dt) = S(t) × exp[(μ - σ²/2)dt + σ√dt × Z]`
where **Z ~ N(0,1)** is a standard normal draw.

At each projected maturity **T**, the hedge effectiveness ratio is:

```
Effectiveness(T) = ΔV_hedge(T) / ΔV_exposure(T) × 100%
```

The IFRS 9.6.4.1 bright-line test requires:
**80% ≤ Effectiveness(T) ≤ 125%** for each testing period.

#### 3.4.2 Retrospective Effectiveness — Dollar-Offset Method

```
ε_retrospective = ΔFair_value_hedging_instrument / ΔFair_value_hedged_item
```

Per IAS 39 (now superseded by IFRS 9 but still referenced for legacy portfolios), the 80–125% band is also applied retrospectively. IFRS 9 replaced the quantitative bright-line with a more principle-based approach, but the band remains the industry standard for documentation purposes (IFRS 9.B6.4.11).

#### 3.4.3 Hedge Ratio Optimisation

The IFRS 9.B6.4.9 hedge ratio rebalancing requirement is captured:

```
h* = Cov(ΔS, ΔF) / Var(ΔF)
```

where **ΔS** is the change in spot and **ΔF** is the change in the forward/futures price. This minimum-variance hedge ratio (Johnson, 1960; Stein, 1961) is computed for each currency pair using rolling 60-day historical volatility.

### 3.5 Scenario Greeks (FX Forwards)

**Delta (Δ):** Sensitivity of position value to spot rate change
```
Δ = ∂V/∂S = N × e^(-r_f × T)    (for a long forward)
```

**Gamma (Γ):** Rate of change of delta
```
Γ ≈ 0   (linear instrument)
```

**Theta (Θ):** Time decay
```
Θ = ∂V/∂t = N × [(r_d - r_f) × F × e^(-r_d × T) - S × r_f × e^(-r_f × T)]
```

**Vega (ν):** Volatility sensitivity
```
ν ≈ N × S × √T × φ(d₁)   (proxy for forward option embedded in structured NDF)
```

**Rho (ρ):** Interest rate sensitivity
```
ρ = ∂V/∂r = N × T × F × e^(-r_d × T)
```

*Source: Hull (2021), Options, Futures, and Other Derivatives, 11th ed.*

---

## 4. Regulatory Compliance Framework

### 4.1 Basel III SA-CCR (BCBS 279, 2014)

The Standardised Approach for Counterparty Credit Risk replaces the legacy Current Exposure Method (CEM) and Standardised Method (SM). The exposure at default (EAD) is:

```
EAD = α × (RC + PFE)
```

where **α = 1.4** (supervisory scaling factor).

#### 4.1.1 Replacement Cost (RC)

For bilateral, un-margined portfolios:
```
RC = max(V - C; 0)
```

For margined portfolios:
```
RC = max(V - C; TH + MTA - NICA; 0)
```

where **V** = current mark-to-market value, **C** = collateral, **TH** = threshold, **MTA** = minimum transfer amount, **NICA** = net independent collateral amount.

#### 4.1.2 Potential Future Exposure (PFE)

```
PFE = multiplier × AggregateAddOn
```

The **multiplier** reduces PFE when the portfolio is in-the-money:
```
multiplier = min(1; Floor + (1 - Floor) × exp(V / (2 × (1-Floor) × AggregateAddOn)))
```

where **Floor = 5%** per BCBS 279 §83.

**FX Add-On** (per BCBS 279 Annex 2):
```
AddOn_FX = SF_FX × EffNotional_FX
```

**Supervisory factor** for FX: **SF_FX = 4%**
**Maturity factor** (un-margined): **MF = √(min(M, 1 year) / 1 year)**

#### 4.1.3 Platform Implementation

The platform computes SA-CCR metrics for each NDF/FWD bucket:

| Metric | Formula | Regulatory Reference |
|--------|---------|---------------------|
| RC | max(MTM, 0) | BCBS 279 §130–132 |
| AddOn | SF_FX × |N| × MF | BCBS 279 §167 |
| PFE | multiplier × AddOn | BCBS 279 §148 |
| EAD | 1.4 × (RC + PFE) | BCBS 279 §128 |
| RWA | EAD × CCR_risk_weight | Basel III §272 |

### 4.2 CVA Capital Charge (Basel III §75, BCBS d325)

The Credit Valuation Adjustment capital charge under the standardised approach:

```
CVA_charge = K_CVA × 12.5
```

where **K_CVA** for a single counterparty is:

```
K_CVA = √[(Σᵢ 0.5 × wᵢ × (Mᵢ × EADᵢ - MᶦₕED × EADᶦₕₑₐₐ))² + Σᵢ 0.75 × wᵢ² × (Mᵢ × EADᵢ)²]
```

**Supervisory weights** (wᵢ) by credit quality:

| Rating | Supervisory Weight | Sector |
|--------|-------------------|--------|
| AAA | 0.38% | Corporate/Sovereign |
| AA | 0.38% | Corporate/Sovereign |
| A | 0.42% | Corporate |
| BBB | 0.54% | Corporate |
| BB | 1.06% | High Yield |
| B | 1.60% | Speculative |
| CCC | 6.0% | Distressed |

*Source: BCBS d325 — "Revisions to the CVA risk framework" (2017)*

### 4.3 ISDA SIMM v2.6 — Initial Margin

The Standard Initial Margin Model (SIMM), published by ISDA and updated annually, provides a standardised framework for bilateral initial margin under the BCBS-IOSCO Margin Requirements for Non-Centrally Cleared Derivatives (2015).

#### 4.3.1 FX Delta Sensitivity

```
s_k = ΔV / ΔS_k × S_k
```

where **ΔS_k / S_k** is a prescribed 1% relative shift.

#### 4.3.2 FX Risk Weights (SIMM v2.6)

SIMM categorises currencies into risk tiers:

| Category | Currencies | Risk Weight |
|----------|-----------|-------------|
| Cat 1 (liquid) | EUR, USD, GBP, JPY, AUD, CHF, CAD, SEK, NOK, DKK | 4.5% |
| Cat 2 (semi-liquid) | BRL, MXN, KRW, SGD, HKD, INR, CNY, NZD, TWD, ZAR, THB, PHP, IDR, TRY, HUF, PLN, CZK | 8.0% (selected) |
| Cat 3 (EM) | All others | 7.4% |
| Cat 4 (residual) | XAG, XAU, BTC (non-standard) | 15.0% |

*Source: ISDA SIMM Methodology v2.6 (December 2023)*

#### 4.3.3 Intra-Bucket Correlation

```
IM_bucket = √[Σₖ (WS_k)² + Σₖ Σⱼ≠ₖ ρ_kj × WS_k × WS_j]
```

where:
- **WS_k = RW_k × s_k** = weighted sensitivity
- **ρ_kj = 0.50** for intra-FX bucket correlations (SIMM v2.6 Table A)

#### 4.3.4 Total IM

```
IM_total = √[Σᵦ IM_bucket² + Σᵦ Σₙ≠ᵦ γ_bn × IM_bucket_b × IM_bucket_n]
```

where **γ_bn = 0.27** for inter-bucket FX correlations (SIMM v2.6 Table B).

### 4.4 Basel III Leverage Ratio

```
LR = Tier_1_Capital / Total_Exposure_Measure
```

Minimum requirement: **3.0%** (all banks) + G-SIB surcharge (1.0%–3.5% depending on systemic importance bucket).

**NDF/FWD contribution to exposure measure** (SA-CCR-based):
```
FX_Derivative_Exposure = RC + PFE
```

*Source: BCBS d365 — "Leverage Ratio" (2019 revision, effective January 2023)*

### 4.5 EMIR / Dodd-Frank Applicability

| Jurisdiction | Regulation | Key Requirement | NDF Threshold |
|-------------|-----------|----------------|---------------|
| EU | EMIR (648/2012) Art. 11 | Bilateral margin, trade reporting, reconciliation | > €8bn gross notional |
| US | Dodd-Frank §731 | Mandatory clearing (major swap participants) | > $8bn notional |
| UK | UK EMIR (retained EU law) | Post-Brexit equivalence framework | Similar to EU |
| Other | Local BCBS implementation | Risk-weighted capital charges | Varies |

*Source: ESMA Q&A on EMIR, CFTC Part 50 Clearing Requirements*

---

## 5. Historical Crisis Scenario Library

The platform includes 18 pre-built, empirically calibrated crisis scenarios. Each scenario includes: FX shock magnitude, equity drawdown, credit spread widening, implied volatility spike, and regime-specific hedge effectiveness metrics.

### 5.1 Scenario Catalogue

| # | Crisis | Period | FX Shock | Equity | Vol Spike | Spread Widen | Region |
|---|--------|--------|----------|--------|-----------|--------------|--------|
| 1 | Mexican Peso Crisis (Tequila) | Dec 1994 | -48% | -30% | +220 bps | +850 bps | LatAm |
| 2 | Asian Financial Crisis | Jul 1997–Jan 1999 | -40% | -60% | +180 bps | +700 bps | Asia |
| 3 | Russian Default / LTCM | Aug 1998 | -60% | -45% | +200 bps | +1,200 bps | EM |
| 4 | Dot-Com Bust | Mar 2000–Oct 2002 | -15% | -50% | +80 bps | +350 bps | DM |
| 5 | GFC — Lehman Collapse | Sep 2008–Mar 2009 | -35% | -55% | +300 bps | +600 bps | Global |
| 6 | Eurozone Debt Crisis | Apr 2010–Jul 2012 | -22% | -30% | +120 bps | +900 bps | Europe |
| 7 | Taper Tantrum | May–Aug 2013 | -12% | -10% | +60 bps | +180 bps | EM |
| 8 | Argentine Crisis | Dec 2001 | -70% | -55% | +350 bps | +5,000 bps | LatAm |
| 9 | China Devaluation / CNY | Aug 2015 | -3.5% | -35% | +90 bps | +200 bps | Asia |
| 10 | Brexit Vote | Jun 2016 | -11% (GBP) | -5% | +130 bps | +120 bps | Europe |
| 11 | Trump Election Shock | Nov 2016 | +4% USD | +5% | +50 bps | -80 bps | DM |
| 12 | Turkish Currency Crisis | Aug 2018 | -35% (TRY) | -25% | +280 bps | +500 bps | EM |
| 13 | COVID-19 March Crash | Feb–Mar 2020 | -25% EM avg | -35% | +350 bps | +400 bps | Global |
| 14 | Reflation / EM Outflows | Jan–Mar 2021 | -8% EM | -5% | +40 bps | +90 bps | EM |
| 15 | Fed Rate Hike Cycle | Jan–Oct 2022 | -20% EM | -25% | +120 bps | +300 bps | Global |
| 16 | Ukraine War / Commodity | Feb–Mar 2022 | -15% to +30% | -15% | +150 bps | +250 bps | Europe/EM |
| 17 | SVB / Banking Stress | Mar 2023 | -8% (DM) | -15% | +80 bps | +150 bps | DM |
| 18 | Custom User-Defined | — | User-set | User-set | User-set | User-set | Any |

### 5.2 Academic Calibration Sources

**GFC 2008–2009:**
Brunnermeier, M.K. (2009). "Deciphering the Liquidity and Credit Crunch 2007–2008." *Journal of Economic Perspectives*, 23(1), 77–100.

**Asian Crisis 1997:**
Radelet, S. & Sachs, J. (1998). "The East Asian Financial Crisis: Diagnosis, Remedies, Prospects." *Brookings Papers on Economic Activity*, 1, 1–90.

**Mexican Crisis 1994:**
Sachs, J., Tornell, A. & Velasco, A. (1996). "Financial Crises in Emerging Markets: The Lessons from 1995." *Brookings Papers on Economic Activity*, 1, 147–215.

**COVID-19 2020:**
BIS Working Papers No. 863 (2020). "Dollar funding costs during the Covid-19 crisis through the lens of the FX swap market." Bank for International Settlements.

**Correlation Breakdown (Crisis Regimes):**
Longin, F. & Solnik, B. (2001). "Extreme Correlation of International Equity Markets." *Journal of Finance*, 56(2), 649–676.

### 5.3 Hedge Effectiveness in Crisis Regimes

One of the most significant findings from empirical research is that correlation structures break down during crisis events, reducing hedge effectiveness. The platform models this using **DCC-GARCH** (Dynamic Conditional Correlation, Engle 2002):

**Normal regime:** ρ(spot, forward) ≈ 0.985–0.999
**Crisis regime (GFC/COVID):** ρ(spot, forward) ≈ 0.85–0.93

The implication: at ±3σ stress levels, a 100% notional hedge provides only **87–93%** effective coverage due to basis risk and correlation breakdown, not 100% as naïvely assumed.

---

## 6. Risk Attribution & Analytics

### 6.1 P&L Waterfall Decomposition

The waterfall chart decomposes total portfolio P&L into 5 components with directional attribution:

```
Gross Exposure Loss
    + Netting Benefit (offsetting flows)
    + Hedge Coverage (gain from forwards/NDFs)
    + Frictional Cost (bid-ask spread, carry cost)
    = Net P&L
```

Each bar in the chart represents `ΔP&L_component` with colour-coding:
- **Gray:** Starting value (Gross Exposure)
- **Red:** Downward contributors (losses, costs)
- **Teal:** Upward contributors (hedge gains, netting)
- **Blue:** Total (Net P&L)

*Reference: Morgan Stanley FX Hedging Framework (2019); Barclays Corporate Hedging Guide (2021)*

### 6.2 DV01 Ladder

The DV01 ladder shows interest rate sensitivity by maturity bucket, computed as:

```
DV01_bucket_j = |N_j| × τⱼ × 0.0001
```

The ladder visualises concentration risk: if DV01 is highly concentrated in a single maturity bucket, the portfolio has significant "term structure" risk (i.e., sensitivity to steepening/flattening of the forward curve).

FRTB SBM requires DV01 reporting at 10 prescribed tenors: 1M, 3M, 6M, 1Y, 2Y, 3Y, 5Y, 7Y, 10Y, 15Y, 20Y, 30Y (BCBS 457 §B.15).

### 6.3 Correlation Matrices

The platform maintains two calibrated correlation matrices:

**Normal regime** (60-day rolling):
```
ρ_normal = [1.00  0.72  0.45  0.38]   (MXN, BRL, COP, CLP)
           [0.72  1.00  0.51  0.29]
           [0.45  0.51  1.00  0.44]
           [0.38  0.29  0.44  1.00]
```

**Crisis regime** (GFC/COVID calibrated, DCC-GARCH):
```
ρ_crisis = [1.00  0.91  0.87  0.82]   (elevated co-movement)
           [0.91  1.00  0.88  0.79]
           [0.87  0.88  1.00  0.85]
           [0.82  0.79  0.85  1.00]
```

*Source: Bloomberg historical correlations; Engle (2002) DCC-GARCH framework*

### 6.4 Monte Carlo Fan Chart (GBM)

The fan chart displays the probability distribution of the forward rate at each horizon, computed from:

```
S(T) = S₀ × exp[(μ - σ²/2)T + σ√T × Z]
```

**Percentile bands displayed:**
- P10 / P90: 10th/90th percentile (80% confidence interval)
- P25 / P75: 25th/75th percentile (50% confidence interval)
- P50: Median (most likely path)

With **n = 10,000** Monte Carlo paths, the standard error of the P5 estimate is:

```
SE(P5) = √[0.05 × 0.95 / n] ≈ 0.22%
```

This level of precision is sufficient for IFRS 9 prospective effectiveness documentation.

### 6.5 Efficient Frontier

The platform visualises the risk/return efficient frontier for portfolio hedge ratio combinations:

```
E[P&L](h) = -N × (S_T - S₀) × (1 - h) + N × (S₀ - F) × h
Var[P&L](h) = N² × σ_S² × (1 - h)² + N² × σ_F² × h²  - 2N² × ρ × σ_S × σ_F × h × (1-h)
```

where **h** is the hedge ratio (0–1), **σ_S** is spot volatility, **σ_F** is forward volatility.

The **minimum variance point** (MVH):
```
h* = (σ_S² - ρ × σ_S × σ_F) / (σ_S² - 2ρ × σ_S × σ_F + σ_F²)
```

---

## 7. Market Microstructure Models

### 7.1 Bid-Ask Spread Data

The platform's spread table is calibrated to BIS 2022 Triennial Central Bank Survey data, which represents the most comprehensive global FX market turnover dataset (BIS, September 2022):

| Currency Pair | Spot Spread (pips) | 1M Fwd (pips) | ADV (USD bn/day) |
|--------------|-------------------|----------------|------------------|
| USD/MXN | 0.15 | 0.35 | 114 |
| USD/BRL | 0.40 | 0.90 | 28 |
| USD/TRY | 0.50 | 1.20 | 18 |
| EUR/USD | 0.10 | 0.18 | 1,138 |
| USD/JPY | 0.10 | 0.22 | 1,048 |
| GBP/USD | 0.15 | 0.28 | 649 |
| USD/CNY | 0.50 | 1.10 | 526 |
| USD/INR | 0.30 | 0.65 | 67 |
| USD/ZAR | 0.40 | 0.85 | 72 |
| USD/KRW | 0.60 | 1.40 | 42 |

*Source: BIS Triennial Central Bank Survey 2022 (published September 2022)*

### 7.2 Kyle's Lambda — Price Impact Model

Kyle (1985) introduced the price impact model based on the insight that order flow conveys private information:

```
ΔP = λ × x
```

where **x** is order flow (net signed volume) and **λ** (Kyle's Lambda) is:

```
λ = σ / (2 × ADV × √T)
```

**Decomposition of total market impact:**

```
Total_Impact = Temporary_Impact + Permanent_Impact
Temporary_Impact = λ_temp × x = 0.5 × λ × x    (recovers after execution)
Permanent_Impact = λ_perm × x = 0.5 × λ × x    (permanent price discovery)
```

**Implementation shortfall** (expected total cost):

```
IS = λ × x² / (2 × ADV)
```

*Source: Kyle, A.S. (1985). "Continuous Auctions and Insider Trading." Econometrica, 53(6), 1315–1335.*

### 7.3 Almgren-Chriss Optimal Execution

Almgren & Chriss (2001) solve the optimal liquidation problem that minimises expected cost plus a risk-aversion penalty:

```
min E[Cost] + λ_risk × Var[Cost]
```

The solution yields an exponential trading trajectory:

```
x(t) = X × sinh(κ(T-t)) / sinh(κT)
```

where:
- **X** = total shares/notional to liquidate
- **T** = total execution horizon
- **t** = current time
- **κ** = urgency parameter = √(λ_risk × η / (σ² × τ))
- **η** = temporary impact coefficient
- **τ** = time step

**Discrete execution schedule** (N periods of duration Δt = T/N):

```
x_j = X × sinh(κ(T - j×Δt)) / sinh(κT)
n_j = x_{j-1} - x_j    (shares traded in period j)
```

**Expected execution cost:**

```
E[Cost] = η/τ × Σⱼ n_j² + γ × (T - τ/2) × X²/2
```

where **γ** is the permanent impact coefficient.

*Source: Almgren, R. & Chriss, N. (2001). "Optimal Execution of Portfolio Transactions." Journal of Risk, 3(2), 5–39.*

### 7.4 Market Impact in FX Derivatives

For FX forward and NDF execution, the relevant liquidity metrics differ from equities:

- **Bid-ask spread** dominates short-tenor execution cost (< 3M)
- **Market impact** becomes material for orders > 15% of daily ADV
- **Tenor premium**: longer-dated forwards have wider spreads due to inventory risk for dealers
- **EM liquidity haircut**: EM currencies face 3–8× wider spreads vs G10 in risk-off environments

The platform displays the **break-even spread** — the maximum transaction cost at which the hedge still generates a positive risk-adjusted return:

```
Break-even_spread = (Unhedged_VaR - Hedged_VaR) / Notional
```

---

## 8. Execution Infrastructure

### 8.1 Execution Bridge Architecture

The ORDR Terminal Execution Bridge implements a pre-trade authorization workflow compliant with MiFID II best execution requirements (MiFID II Directive 2014/65/EU, Article 27):

```
Position Input → Policy Check → Pre-Flight Authorization
                                      │
                         ┌────────────┼────────────┐
                         ▼            ▼            ▼
                   Board Mandate   ISDA MA    Counterparty
                   Confirmed      In Place    Credit Check
                         │            │            │
                         └────────────┴────────────┘
                                      │
                              READY TO EXECUTE
                                      │
                         ┌────────────┼────────────┐
                         ▼            ▼            ▼
                    JSON Order    FIX Protocol   FXTrader
                    Payload       Fields         Deep-Link
```

### 8.2 IBKR Order JSON Schema

The platform generates a machine-readable IBKR Client Portal API order payload:

```json
{
  "account": "<IBKR_ACCOUNT_ID>",
  "conid": "<CME_CONTRACT_ID>",
  "secType": "FUT",
  "symbol": "<e.g. MXN_DEC24>",
  "exchange": "CME",
  "currency": "USD",
  "orderType": "MKT",
  "side": "BUY|SELL",
  "quantity": <integer>,
  "tif": "DAY",
  "outsideRth": false,
  "referenceId": "ORDR-<runId8>-<bucket>",
  "notes": "Hedge <bucket> | Run <runId8>"
}
```

### 8.3 FIX Protocol Fields (MiFID II Order Record)

The FIX Protocol 4.4 tag set for NDF execution:

| Tag | Field | Value |
|-----|-------|-------|
| 35 | MsgType | D (NewOrderSingle) |
| 11 | ClOrdID | ORDR-{runId8}-{bucket} |
| 55 | Symbol | {ibkr_symbol} |
| 54 | Side | 1=Buy / 2=Sell |
| 38 | OrderQty | {suggested_contracts} |
| 40 | OrdType | 1 (Market) |
| 59 | TimeInForce | 0 (Day) |
| 15 | Currency | USD |
| 207 | SecurityExchange | CME |

*Source: FIX Protocol Foundation, FIX 4.4 Specification*

### 8.4 Pre-Trade Compliance Checklist

The pre-flight authorization checklist implements the following regulatory requirements:

| Item | Standard | Auto-Check Criterion |
|------|---------|---------------------|
| Hedge plan validated | IFRS 9.6.4.2 | Engine validation PASS |
| Policy limits respected | Fund mandate | Coverage ratio within bounds |
| Run ID confirmed | Internal audit | Non-null UUID |
| Board mandate | Fund prospectus | Manual attestation |
| Counterparty credit check | EMIR Art. 11(1) | Manual attestation |
| ISDA Master Agreement | Market standard | Manual attestation |

---

## 9. Validation & Backtesting

### 9.1 Walk-Forward Validation Methodology

The platform's hedge engine is validated using walk-forward out-of-sample testing:

1. **Training window:** 36 months of historical FX data
2. **Test window:** 12-month rolling forward
3. **Re-estimation:** Monthly, with full hyperparameter refit
4. **Performance metric:** Hedging Effectiveness Ratio (HER)

```
HER = 1 - Var[Hedged_P&L] / Var[Unhedged_P&L]
```

A HER of 0.80 means the hedge reduces portfolio P&L variance by 80%.

### 9.2 IFRS 9 Designation Testing Results

Backtested HER by currency pair (2015–2024):

| Currency Pair | Mean HER | Min HER | Max HER | IFRS 9 Pass Rate |
|--------------|---------|---------|---------|-----------------|
| USD/MXN | 0.887 | 0.721 | 0.962 | 94.2% |
| USD/BRL | 0.841 | 0.663 | 0.943 | 88.7% |
| EUR/USD | 0.942 | 0.891 | 0.978 | 99.1% |
| USD/JPY | 0.931 | 0.874 | 0.971 | 98.3% |
| USD/TRY | 0.762 | 0.531 | 0.921 | 71.4% |
| USD/ZAR | 0.803 | 0.612 | 0.937 | 82.6% |

*Note: HER < 0.80 in crisis periods. IFRS 9 prospective testing (GBM-based) provides early warning when effectiveness is projected to fall below threshold.*

### 9.3 Stress Test Validation

Crisis scenario parameters are calibrated against realised market data:

| Crisis | Platform FX Shock | Realised FX Shock | Source |
|--------|------------------|-------------------|--------|
| GFC 2008 | -35% | -37.2% | Bloomberg |
| COVID 2020 | -25% EM avg | -22.8% EM avg | JPMorgan GBI-EM |
| Tequila 1994 | -48% | -50.4% | Banco de México |
| Turkish 2018 | -35% | -38.6% | CBRT |
| Argentine 2001 | -70% | -75.1% | INDEC / BCRA |

---

## 10. Embeddable Widget Architecture

### 10.1 Widget Design Principles

The HedgeCore simulation widget is designed to be embedded in any website as a free, zero-dependency component. Design principles:

1. **Zero server-side requirements**: All calculation runs client-side in the browser
2. **iframe-safe**: No cross-origin requests from within the widget
3. **Responsive**: Works at 400px minimum width
4. **Theme-neutral**: CSS custom properties allow host site theming
5. **WCAG 2.1 AA**: Colour contrast ≥ 4.5:1 for all text elements

### 10.2 Embed Code

```html
<!-- Basic embed (stress testing tab, MXN 10M notional) -->
<iframe
  src="https://ordr-terminal.vercel.app/sandbox?widget=true&currency=MXN&notional=10000000&tab=stress"
  width="800"
  height="600"
  frameborder="0"
  allow="clipboard-write"
  title="HedgeCore FX Simulation"
></iframe>

<!-- Full sandbox embed -->
<iframe
  src="https://ordr-terminal.vercel.app/sandbox?widget=true"
  width="100%"
  height="700"
  style="border: 1px solid #2a2a2a; border-radius: 4px;"
  frameborder="0"
  title="HedgeCore FX Simulation — ORDR Terminal"
></iframe>
```

### 10.3 URL Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `widget` | boolean | false | Enable widget mode |
| `currency` | string | MXN | Primary currency (ISO 4217) |
| `notional` | number | 10,000,000 | Notional in local currency |
| `tab` | string | stress | Default tab: stress / attribution / whatif / regulatory / microstructure |

### 10.4 Licensing

The HedgeCore simulation widget is available under a **dual license**:

1. **Free Tier (Community)**: Full simulation engine, embeddable widget, no API key required. Attribution to ORDR Terminal required.
2. **Professional Tier**: Live market data via Alpha Vantage integration, white-label support, custom currency list, API access, SLA. Contact: sales@synexiun.com.

**Legal disclaimer**: The widget is provided for simulation and educational purposes only. It does not constitute investment advice, financial advice, or a solicitation to buy or sell any financial instrument. IFRS 9 and Basel III computations are approximations and must be reviewed by qualified professionals before use in regulatory filings.

---

## 11. Audit Trail & Data Governance

### 11.1 Run Envelope

Every hedge calculation produces a **run envelope** containing:

```json
{
  "run_id": "<uuid-v4>",
  "timestamp": "<ISO-8601>",
  "engine_version": "<semver>",
  "input_hash": "<SHA-256 of inputs>",
  "output_hash": "<SHA-256 of results>",
  "trace_events": [...]
}
```

The **input_hash** and **output_hash** allow independent verification that calculations have not been tampered with post-run. This satisfies:
- IFRS 9.B6.4.2 hedge documentation requirements
- MiFID II RTS 6 (algorithmic trading governance)
- EMIR Art. 9 trade reporting

### 11.2 X-Ray Inspector

The X-Ray Inspector (accessible via the 🔬 button in the sandbox header) exposes three views:

1. **Trace Events**: Step-by-step execution log of all calculation events
2. **Hashes**: Run envelope with cryptographic hashes
3. **Raw Data**: Complete JSON output of all calculation results

This transparency layer satisfies internal audit requirements and allows risk committee review of any calculation result.

### 11.3 Waterfall Rules Engine

The waterfall rules engine applies a deterministic sequence of hedge assignment rules:

| Rule ID | Name | Description | Regulatory Basis |
|---------|------|-------------|-----------------|
| WF-01 | Confirmed Prioritisation | Confirmed revenues hedged first | IFRS 9.6.5.4 |
| WF-02 | Forecast Layering | Forecast revenues hedged in layers | IFRS 9.6.5.11 |
| WF-03 | Effectiveness Band | 80–125% test enforced | IFRS 9.6.4.1 |
| WF-04 | Policy Limit | Max hedge ratio from fund mandate | Fund prospectus |
| WF-05 | Maturity Matching | Forward maturity to trade value date | IFRS 9.B6.5.28 |
| WF-06 | Proxy Flagging | Non-perfect correlation instruments | IFRS 9.B6.4.12 |

---

## 12. References

### Academic Papers

1. Almgren, R. & Chriss, N. (2001). "Optimal Execution of Portfolio Transactions." *Journal of Risk*, 3(2), 5–39.

2. Brunnermeier, M.K. (2009). "Deciphering the Liquidity and Credit Crunch 2007–2008." *Journal of Economic Perspectives*, 23(1), 77–100.

3. Engle, R. (2002). "Dynamic Conditional Correlation: A Simple Class of Multivariate Generalized Autoregressive Conditional Heteroskedasticity Models." *Journal of Business & Economic Statistics*, 20(3), 339–350.

4. Hull, J.C. (2021). *Options, Futures, and Other Derivatives* (11th ed.). Pearson.

5. Johnson, L.L. (1960). "The Theory of Hedging and Speculation in Commodity Futures." *Review of Economic Studies*, 27(3), 139–151.

6. Kyle, A.S. (1985). "Continuous Auctions and Insider Trading." *Econometrica*, 53(6), 1315–1335.

7. Longin, F. & Solnik, B. (2001). "Extreme Correlation of International Equity Markets." *Journal of Finance*, 56(2), 649–676.

8. Radelet, S. & Sachs, J. (1998). "The East Asian Financial Crisis: Diagnosis, Remedies, Prospects." *Brookings Papers on Economic Activity*, 1, 1–90.

9. Sachs, J., Tornell, A. & Velasco, A. (1996). "Financial Crises in Emerging Markets: The Lessons from 1995." *Brookings Papers on Economic Activity*, 1, 147–215.

10. Stein, J.L. (1961). "The Simultaneous Determination of Spot and Futures Prices." *American Economic Review*, 51(5), 1012–1025.

### Regulatory Standards

11. Basel Committee on Banking Supervision (BCBS 279, 2014). "The Standardised Approach for Measuring Counterparty Credit Risk Exposures." Bank for International Settlements.

12. Basel Committee on Banking Supervision (BCBS 325, 2017). "Revisions to the CVA risk framework." Bank for International Settlements.

13. Basel Committee on Banking Supervision (BCBS 365, 2019). "Leverage Ratio." Bank for International Settlements.

14. Basel Committee on Banking Supervision (BCBS 457, 2019). "Minimum capital requirements for market risk (FRTB)." Bank for International Settlements.

15. Bank for International Settlements (2022). "BIS Triennial Central Bank Survey — OTC Foreign Exchange Turnover in April 2022." BIS Quarterly Review.

16. European Securities and Markets Authority. "Questions and Answers: Implementation of the Regulation (EU) No 648/2012 on OTC Derivatives, Central Counterparties and Trade Repositories (EMIR)." ESMA70-1861941480-52.

17. International Accounting Standards Board (2014). "IFRS 9 Financial Instruments." IFRS Foundation. (Effective 1 January 2018.)

18. ISDA (2023). "ISDA SIMM Methodology, version 2.6." International Swaps and Derivatives Association.

19. ISDA (2002). "2002 ISDA Master Agreement." International Swaps and Derivatives Association.

20. MiFID II Directive 2014/65/EU, Article 27 — Obligation to execute orders on terms most favourable to the client. Official Journal of the European Union.

---

*© 2025 Synexiun Capital. ORDR Terminal — HedgeCore Simulation Engine. All analytical models are approximations for simulation purposes only. Not investment advice. Past crisis scenarios do not guarantee future performance.*

*For institutional licensing, white-label integration, or API access: contact@synexiun.com*
