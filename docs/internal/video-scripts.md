# Hedge Terminal — Video Tutorial Scripts
## Professional Narration Series v1.0

**Classification:** INTERNAL — Training Materials
**Document ID:** HT-VS-2026-001
**Series:** 4 Videos
**Target Duration:** 3–5 minutes each
**Narrator Tone:** Authoritative, institutional, precise

---

## Video 1: Platform Overview & Getting Started

**Duration:** ~4 minutes
**Filename:** `01_getting_started.mp4`
**Objective:** Introduce the platform, demonstrate authentication, and navigate the terminal selector.

---

### Scene 1 — Opening (0:00–0:25)
**[Screen: Hedge Terminal login page — dark terminal UI with grid background]**

> Welcome to Hedge Terminal — institutional FX risk infrastructure built for treasury operations, risk committees, and portfolio managers.
>
> In this walkthrough, we will demonstrate the platform's authentication gateway, module architecture, and core navigation patterns. Everything you see operates on a deterministic computation engine — no black boxes, no stochastic approximations. Every output is traceable, auditable, and committee-ready.

---

### Scene 2 — Authentication (0:25–1:00)
**[Screen: Login page with shield icon, "Hedge Terminal" branding]**

> The authentication gateway uses a secure session model. Notice the status bar at the bottom — it confirms TLS 1.3 encryption and displays a live UTC timestamp.
>
> Enter the demo credentials: username `demo`, password `demo`. Click "Initialize Session."

**[Action: Type credentials, click Initialize Session]**

> The system authenticates against the backend API, sets a session cookie, and redirects to the Terminal Selector. This entire flow takes under one second.

---

### Scene 3 — Terminal Selector (1:00–2:15)
**[Screen: Terminal Selector page — 2×2 module grid]**

> This is the Terminal Selector — your operational command surface. Four modules are available, each operating within its own analytical context and data boundary.
>
> **CurrencyFX** — the primary module. Treasury cash-flow ingestion, policy-constrained hedge sizing, deterministic execution tickets, and audit-ready committee documentation. This is where the core hedge workflow lives.
>
> **Portfolio Risk** — multi-asset exposure decomposition across eight institutional risk dimensions: Delta, Vega, Gamma, Theta, Correlation, Counterparty, Liquidity, and Tail Risk.
>
> **Polisophic** — the geopolitical intelligence console. It monitors macro-policy events — central bank decisions, sanctions, fiscal announcements, trade policy shifts — and maps them to portfolio risk parameters.
>
> **HedgeWiki** — the canonical governance layer. Twenty version-controlled articles across six domains: FX instruments, legal and ISDA, IFRS accounting, US GAAP, HedgeCalc policy configuration, and engine internals.

**[Action: Hover over each module card to show tooltips]**

> Each module displays its operational status. The System Posture table confirms: Engine version one-point-zero, production environment, backend connected.

---

### Scene 4 — Navigation Architecture (2:15–3:00)
**[Screen: Show the pipeline navigation bar]**

> Across the top, you'll see the tri-state governance pipeline: Sandbox, Staging, and Ledger. Currently, Sandbox is active — this is the exploratory analysis environment. Staging and Ledger represent the institutional approval and immutable record states. These are under construction and will enable dual-authorization commit workflows.
>
> The identity bar shows your session metadata: timestamp, active module count, and operator role. Sign Out terminates the session and returns to the authentication gateway.

---

### Scene 5 — Closing (3:00–3:30)
**[Screen: Terminal Selector with all modules visible]**

> That completes the platform orientation. You now understand the authentication model, module architecture, and governance pipeline.
>
> In the next video, we'll dive into the CurrencyFX module — the core hedge workflow from data entry through committee pack generation.

---
---

## Video 2: CurrencyFX Module — Core Hedge Workflow

**Duration:** ~5 minutes
**Filename:** `02_currency_fx_workflow.mp4`
**Objective:** Walk through the complete hedge workflow: input → calculate → committee pack.

---

### Scene 1 — Opening (0:00–0:20)
**[Screen: Terminal Selector with CurrencyFX highlighted]**

> In this video, we walk through the CurrencyFX module — the core hedge workflow. We will enter exposure data, configure policy parameters, execute the deterministic hedge engine, and review the resulting Committee Pack.
>
> Click "Open Module" on CurrencyFX to begin.

---

### Scene 2 — Dataset Selector (0:20–1:15)
**[Screen: Input page with Dataset Selector panel at top]**

> The input page opens with the Dataset Selector — ten pre-built scenario datasets covering multiple currencies and corporate profiles. These are organized into two groups: MXN and Latin America on the left, and Global Currencies on the right.
>
> Let's select Fixture one — Balanced Corporate. This represents LatAm Corp, a manufacturing company with mixed accounts payable and receivable exposure in Mexican pesos over a four-month horizon.

**[Action: Click F01 dataset, wait for confirmation dialog]**

> The system asks to confirm dataset loading. Click "Load." Watch how all five wizard steps populate simultaneously — trades, hedges, market data, policy configuration, and authorization status.
>
> Notice the dataset card shows the company story: LatAm Corp faces currency risk from cross-border supplier payments and export receivables. Without hedging, a five-percent MXN depreciation would impact operating margins by seven hundred thousand dollars.

---

### Scene 3 — Five-Step Wizard (1:15–2:30)
**[Screen: Input page showing Step 1 — Exposure entry]**

> **Step one: Exposure Entry.** Twelve trade rows are loaded — a mix of accounts payable and accounts receivable, some confirmed, some forecast. Each row carries a record ID, entity name, type, currency, amount, value date, and status. You can add rows manually through the trade modal or upload via CSV.

**[Screen: Step 2 — Hedges]**

> **Step two: Existing Hedges.** Three existing hedge positions are loaded — two NDFs and one deliverable forward. These represent the company's current hedge book that the engine will net against gross exposure.

**[Screen: Step 3 — Market Data]**

> **Step three: Market Data.** The spot rate is eighteen-point-nine-seven for USD/MXN. The forward curve extends four months with positive forward points, reflecting the MXN interest rate differential.

**[Screen: Step 4 — Policy]**

> **Step four: Policy Configuration.** Hedge ratios are set at eighty percent for confirmed exposures and fifty percent for forecast. The execution product is NDF. Minimum trade size is five hundred thousand US dollars. Spread assumption is five basis points.

**[Screen: Step 5 — Authorization]**

> **Step five: Authorization.** The governance strip shows validation status. The snapshot summary displays aggregate exposure and coverage metrics. When ready, click "Generate Hedge Plan."

---

### Scene 4 — Computation & Results (2:30–3:15)
**[Action: Click "Generate Hedge Plan"]**

> The engine runs a thirteen-step deterministic computation. Input normalization, currency detection, temporal bucketing, net exposure calculation, existing hedge overlay, gap analysis, policy enforcement, forward rate interpolation, ticket generation, cost estimation, scenario stress testing, validation, and cryptographic envelope sealing.

**[Screen: Results page — Committee Pack header]**

> In under two seconds, the Committee Pack is generated. Notice the header: Run ID, timestamp, engine version, base currency badge, and validation status. This run passed all twenty-one validation checks.

---

### Scene 5 — Committee Pack Walkthrough (3:15–4:30)
**[Screen: Execution Desk — Committee Summary tab]**

> The Execution Desk has five sub-tabs. The Committee Summary shows aggregate metrics — total gross exposure, net exposure, hedge coverage ratio, waterfall integrity score, and a bucket-by-bucket coverage table.

**[Screen: Exposure & Buckets tab]**

> Exposure and Buckets breaks down the temporal profile. Each calendar month shows gross payables, gross receivables, net exposure, existing coverage, and the residual gap.

**[Screen: Scenario Analysis tab]**

> Scenario Analysis presents four stress scenarios — base, adverse, severe, and extreme. Each scenario shows the P&L impact on the hedged portfolio versus unhedged.

**[Screen: Trade Tickets tab]**

> Trade Tickets are the deterministic output — specific NDF execution tickets with notional amounts, forward rates, and value dates. These are ready for straight-through processing.

**[Screen: Audit Evidence tab]**

> Audit Evidence provides the cryptographic run envelope. SHA-256 hash, full input snapshot, and the complete validation report. This is designed for external auditor consumption.

---

### Scene 6 — Export & Navigation (4:30–5:00)
**[Screen: Export dropdown in results header]**

> Four export formats are available from the Export bar: Committee Pack PDF, Executive Brief PDF, Audit JSON, and tabular data export. Each is generated client-side and downloads immediately.
>
> To run a new calculation, click "New Calculation" in the header to return to the input page.
>
> In the next video, we'll explore Portfolio Risk and the Polisophic intelligence console.

---
---

## Video 3: Portfolio Risk & Polisophic Modules

**Duration:** ~4 minutes
**Filename:** `03_portfolio_risk_polisophic.mp4`
**Objective:** Demonstrate the risk decomposition and geopolitical intelligence capabilities.

---

### Scene 1 — Opening (0:00–0:15)
**[Screen: Terminal Selector]**

> In this video, we explore two analytical modules: Portfolio Risk for institutional risk decomposition, and Polisophic for geopolitical intelligence and regime monitoring.

---

### Scene 2 — Portfolio Risk Module (0:15–2:00)
**[Screen: Portfolio Risk page — Risk Matrix tab]**

> The Portfolio Risk module decomposes total portfolio exposure across eight institutional risk dimensions, following the standard risk taxonomy used by institutional asset managers.
>
> **R1: Delta Risk** — first-order sensitivity to FX rate changes. This is the primary risk dimension for an NDF-based hedge book. Current VaR at ninety-nine percent confidence is negative eighteen-point-four million.
>
> **R2 and R3: Vega and Gamma** — these are zero in the current portfolio because there are no option positions. In an option-heavy book, these would capture implied volatility sensitivity and convexity.
>
> **R4: Theta and Carry** — the time decay and forward-point carry embedded in the NDF book. Forward points represent the interest rate differential between USD and MXN.
>
> **R5 through R7** cover Correlation Risk, Counterparty Credit Risk measured as CVA under SA-CCR, and Liquidity Risk based on a five-day unwind horizon.
>
> **R8: Tail and Event Risk** — this is the most significant dimension. It captures fat-tail scenarios not represented by normal distributions. The CVaR at ninety-nine percent is negative ninety-seven-point-two million. This dimension connects directly to the Polisophic geopolitical events.

**[Screen: Positions tab]**

> The Positions tab shows the full position book — physical exposures and derivative hedges with their delta values. You can see the netting effect: two-hundred-eighty-four million in physical receivables partially offset by one-hundred-sixty-two million in NDF hedges across four monthly tenors.

---

### Scene 3 — Polisophic Module (2:00–3:30)
**[Screen: Polisophic page — Event Feed tab]**

> Polisophic is the geopolitical intelligence console. It monitors macro-policy events and maps their implications to portfolio risk parameters.
>
> The Event Feed shows a chronological stream of risk-relevant events. Each carries a severity score from zero to one hundred and a confidence rating.
>
> For example: Banxico holding its rate at ten-point-two-five percent with dovish forward guidance has a severity of seventy-two with ninety-one percent confidence. The assessed impact is MXN weakening — this maps directly to Delta Risk in R1.
>
> A sanctions expansion event from OFAC targeting energy sector counterparties scores eighty-five severity with ninety-seven percent confidence. This impacts the Counterparty Risk dimension R6.
>
> Mexico's fiscal deficit revision to four-point-one percent of GDP affects sovereign spread — an indirect driver of MXN volatility captured in R8 Tail Risk.
>
> The FOMC minutes showing hawkish dissent scores seventy-eight severity and signals USD strengthening — a direct FX impact on the entire portfolio.

**[Screen: Regime Map or Constraints tab]**

> The constraint framework translates these events into actionable policy parameters. Central bank signals feed into rate regime assumptions. Sanctions alerts trigger counterparty screening. Fiscal indicators inform sovereign risk weightings.
>
> This creates a closed loop: Polisophic events inform the risk parameters that Portfolio Risk decomposes, which in turn constrain the hedge sizing in CurrencyFX.

---

### Scene 4 — Closing (3:30–4:00)
**[Screen: Terminal Selector]**

> Portfolio Risk and Polisophic provide the analytical foundation beneath the hedge workflow. Delta decomposition ensures you understand your risk exposure. Geopolitical intelligence ensures you understand the macro environment driving that risk.
>
> In the final video, we'll explore HedgeWiki and the Committee Reports system.

---
---

## Video 4: HedgeWiki & Committee Reports

**Duration:** ~4 minutes
**Filename:** `04_hedgewiki_reports.mp4`
**Objective:** Demonstrate the governance knowledge base and the report generation system.

---

### Scene 1 — Opening (0:00–0:15)
**[Screen: Terminal Selector with HedgeWiki highlighted]**

> In this final video, we explore HedgeWiki — the governance knowledge base — and the Committee Reports system that produces board-ready analytical documentation.

---

### Scene 2 — HedgeWiki (0:15–2:00)
**[Screen: HedgeWiki page — three-pane layout]**

> HedgeWiki is the canonical governance layer. It defines the taxonomy, control logic, lifecycle mappings, and audit playbooks that underpin the entire platform.
>
> The interface follows a three-pane layout. On the left, six domain categories. In the center, a filterable article list. On the right, the full article detail.
>
> Twenty articles are organized across six domains:
>
> **FX Instruments** covers NDFs, FX Swaps, Vanilla Options, and Cross-Currency Swaps. Each article includes a technical abstract, citations to authoritative sources — ISDA 2006 Definitions, BIS Triennial Survey, FX Global Code — and cross-references to related articles.
>
> **Legal and ISDA** covers netting agreements, Credit Support Annexes, and Master Confirmation frameworks.
>
> **Accounting — IFRS** covers IFRS 9 effectiveness testing, cash flow hedge designation, fair value hedging, and IAS 39 legacy provisions.
>
> **Accounting — US GAAP** covers ASC 815 Sections 20 and 30 for derivatives and hedging.

**[Screen: Select an article — NDF]**

> Let's look at the NDF article. Version two-point-three, status Stable. The abstract explains that an NDF is a cash-settled forward contract used where exchange controls prevent physical delivery. Settlement equals notional times the difference between contracted forward rate and fixing rate, paid in USD.
>
> Four citations: ISDA 2006 Definitions Section one-thirty-four, BIS Triennial Survey, Banxico Circular, and FX Global Code Principle Nine.
>
> The HedgeCore field mapping shows this maps to `execution_product = NDF_VANILLA` in the API. The audit note states that the NDF settlement rate source must match the Banxico official fix for IFRS 9 effectiveness testing.

---

### Scene 3 — Committee Reports (2:00–3:30)
**[Screen: Results page — Committee Reports tab]**

> Now let's look at Committee Reports. From any generated Committee Pack, navigate to the second top-level tab: Committee Reports.
>
> Six report categories are available:
>
> **R-01: Coverage and Residual** — visualizes hedge coverage ratios against policy targets. Stacked bar charts show covered versus uncovered exposure per monthly bucket.
>
> **R-02: Cost and Slippage** — breaks down total hedge cost. Spread cost per bucket as a percentage of notional. Basis point analysis for cost committee review.
>
> **R-03: Scenario and Stress** — the multi-scenario P&L waterfall. An interactive ECharts waterfall shows incremental impact from base through extreme scenarios.
>
> **R-04: Policy Compliance** — a traffic-light compliance matrix. Each bucket is checked against configured policy rules. Green for compliant, amber for warning, red for breach.
>
> **R-05: Liquidity and Concentration** — radar chart showing bucket concentration and tenor distribution. Ensures no single bucket carries disproportionate exposure.
>
> **R-06: Executive Briefing** — the crown jewel. An auto-generated narrative summary in board-ready language. Key risk metrics, recommended actions, and a concise risk posture assessment. This can be exported as a one-page PDF for C-suite distribution.

**[Action: Click PDF export on Executive Briefing]**

> Every report section includes export controls — PDF for print-ready documents and CSV for downstream analysis. Reports are generated entirely client-side using jsPDF, ensuring no sensitive data leaves the browser during export.

---

### Scene 4 — Closing (3:30–4:00)
**[Screen: Terminal Selector — all four modules visible]**

> That concludes the Hedge Terminal tutorial series. To summarize:
>
> CurrencyFX provides the core hedge workflow — deterministic, policy-constrained, and committee-ready.
>
> Portfolio Risk decomposes exposure across eight institutional risk dimensions.
>
> Polisophic monitors the geopolitical landscape and translates events into risk parameters.
>
> HedgeWiki provides the governance foundation — every concept, instrument, and accounting standard documented and cross-referenced.
>
> Together, these modules form a unified institutional FX risk infrastructure. Visit ordr-treasury.vercel.app to begin.

---

## Production Notes

### Recording Settings
- Resolution: 1920×1080 (16:9)
- Frame rate: 30 fps
- Browser: Chrome (latest)
- Window: Maximized, dark mode
- Mouse: Visible with highlight effect
- Audio: Professional voiceover or NotebookLM audio generation

### Post-Production
- Add lower-third titles for module names
- Subtle zoom on key data points
- Cross-dissolve between scenes
- Background music: Minimal ambient (institutional style)
- End card with platform URL and demo credentials

### NotebookLM Instructions
- Upload the Product Guide (HEDGE_TERMINAL_PRODUCT_GUIDE.md) as the primary source
- Upload these scripts as secondary source for contextual narration
- Generate Audio Overview for each video section
- Audio tone: Professional, authoritative, measured pace

---

**END OF SCRIPTS**
