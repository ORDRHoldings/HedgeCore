# CurrencyFX Operator Manual
**HedgeCalc Engine v1.0.0 | Institutional Treasury Edition**  
Version 1.0 | Classification: Internal Use | Effective Date: February 2026

---

## TABLE OF CONTENTS

- **PART I: OVERVIEW & QUICKSTART**
  - 1. Executive Overview
  - 2. Quickstart -- Your First Hedge Plan in 5 Minutes
  - 3. Interface Map
- **PART II: STEP-BY-STEP OPERATOR GUIDE**
  - 4. Step 01 -- Commercial Exposure
  - 5. Step 02 -- Risk Mitigation (Existing Hedges)
  - 6. Step 03 -- Market Conditions
  - 7. Step 04 -- Hedge Policy
  - 8. Step 05 -- Authorization & Gate Check
- **PART III: COMPUTATION ENGINE**
  - 9. The Deterministic Kernel
  - 10. Validation System
  - 11. Snapshot Locking & Determinism
- **PART IV: RESULTS -- COMMITTEE PACK**
  - 12. Execution Desk
  - 13. Committee Reports (R-01 through R-06)
  - 14. Controls & Alerts
  - 15. Export System
- **PART V: DATA REFERENCE**
  - 16. Data Dictionary -- All Fields
  - 17. Numbers Dictionary -- F01 Reference Case
  - 18. Hedge Plan Detail Table (F01)
  - 19. Demo Fixture Catalogue
- **PART VI: ASSUMPTIONS, LIMITS & EDGE CASES**
  - 20. Engine Assumptions
  - 21. Limits & Constraints
  - 22. Failure Modes & Troubleshooting
- **PART VII: TUTORIAL**
  - 23. Full Tutorial: From Zero to Committee Pack
- **APPENDIX**
  - A. Glossary
  - B. Keyboard Shortcuts & Navigation Tips
  - C. Integration Notes -- Pipeline Architecture


---

## PART I: OVERVIEW & QUICKSTART

### 1. Executive Overview

CurrencyFX is the core FX exposure management and hedge recommendation module of the HedgeCalc platform. It is designed for institutional treasury analysts, risk officers, CFOs, and auditors who need to produce audit-grade, committee-ready hedge plans from raw commercial FX exposure data.

**What it does:**
- Ingests accounts payable (AP) and accounts receivable (AR) trade records denominated in foreign currency
- Nets AR against AP by currency and tenor
- Applies configurable hedge ratios to confirmed and forecast positions
- Accounts for existing hedge instruments on the books (NDF, FWD)
- Prices new hedge instruments using a live or demo forward curve
- Produces a deterministic, snapshot-bound Committee Pack with full SHA-256 cryptographic attestation

**Who uses it:**
- **Treasury Analysts**: Prepare hedge recommendations and execution-ready trade tickets
- **Risk Officers**: Review exposure decomposition, policy compliance, and residual risk
- **CFOs / Treasurers**: Review the Executive Briefing and sign off on the hedge plan
- **Internal Auditors**: Verify the cryptographic audit trail, replay computations, export evidence bundles

**What it produces:**
- A Committee Pack comprising: Committee Summary, Exposure & Buckets analysis, Scenario Analysis, Trade Tickets, Audit Evidence, and six Committee Reports (R-01 through R-06)
- Export formats: PDF, Excel, Audit JSON, Executive Brief

**Architecture:**
- Engine: v1.0.0, DETERMINISTIC
- Computation: Snapshot-bound -- all inputs locked at run time
- Reproducibility: Any identical input set produces byte-identical outputs
- Integrity: SHA-256 hash of all six input datasets (trades, hedges, market, policy, inputs, outputs)
- Pipeline: Sandbox (calculation workspace) -> Staging (pending approval) -> Ledger (archived)
- URL: hedgecore.vercel.app
- Role: risk_analyst

---

### 2. Quickstart -- Your First Hedge Plan in 5 Minutes

This quickstart uses the default F01 LatAm Corp dataset (Manufacturing, Auto Parts, MXN).

**Step 1 -- Navigate to the platform**
Go to hedgecore.vercel.app/auth/login. Enter credentials: demo / demo. Click Login. You will be redirected to the terminal selector.

**Step 2 -- Select CurrencyFX**
The terminal selector shows four modules. Click the **CurrencyFX** card. You will be taken to the input page at /currency-fx.

**Step 3 -- Confirm dataset is loaded**
The status bar at the top shows: TRADES 12 | HEDGES 3 | POLICY Balanced Corporate | SNAP DEMO | VALIDATION: PASS | INT 100/100. The LatAm Corp card in the Dataset Selector is highlighted with ACTIVE.

**Step 4 -- Check the Snapshot Summary**
Below the 5-step wizard tabs, confirm: SNAPSHOT SUMMARY | Balanced Corporate | AS OF 2026-02-17 12:00:00 UTC | PASS INT 100/100.

**Step 5 -- Click Generate Hedge Plan**
The button is on the right side of the Snapshot Summary bar. The engine runs the 13-step deterministic kernel (~2 seconds). You are automatically redirected to /results.

**Step 6 -- Review the Committee Summary**
The Committee Pack opens on the **Committee Summary** tab. You will see:
- Total Exposure: -49,300,000 MXN
- Coverage Ratio: 57% (UNDER-HEDGED)
- New Action Required: 63,490,000 MXN notional
- Total Friction Cost: \,714.55
- Worst-Case Impact: \,806,406.88

**Step 7 -- Export PDF**
Click the PDF button in the top-right export bar. A PDF is generated client-side via jsPDF and downloaded automatically.


---

### 3. Interface Map

#### 3.1 Top Navigation Bar
Fixed bar at the top of every page. Contains:
- **Left**: HEDGECALC logo + Engine 1.0.0 version label + Run dropdown + Snap dropdown
- **Right**: Committee link | Role: risk_analyst label
- Pipeline breadcrumb below: Sandbox > Staging > Ledger | SANDBOX badge

#### 3.2 Status Bar (Input Page Only)
Persistent bar immediately below the top nav on the /currency-fx page:

| FIELD | DESCRIPTION |
|-------|-------------|
| TRADES [n] | Count of trade positions loaded in current dataset |
| HEDGES [n] | Count of existing hedge instruments on books |
| POLICY [name] | Active policy configuration name |
| SNAP [type] | Snapshot type: DEMO (fixture) or MANUAL (user-entered) |
| AGE [n]m | Minutes since snapshot was taken |
| VALIDATION: PASS/FAIL | Overall validation status |
| INT [n]/100 | Integrity score (0-100, 100 = fully clean) |
| ENGINE v1.0.0 | Engine version |
| DETERMINISTIC | Computation mode badge |

#### 3.3 Dataset Selector
Panel at top of the input page labeled Load Scenario Dataset. Contains 10 fixture cards in 2 rows of 5.

**Row 1 (MXN/EUR fixtures):**
- **LatAm Corp** (CED MXN) -- Manufacturing (Auto Parts) -- 12 pos 3 hdg -- Default
- **MexImport SA** (AP MXN) -- Import-Dependent Manufacturing -- 10 pos 2 hdg
- **MexExport Global** (AR MXN) -- Export-Driven Manufacturing -- 10 pos 3 hdg
- **LatAm Corp (Stress Scenario)** (KET MXN) -- Manufacturing, stress test -- 12 pos 3 hdg
- **BavariaGmbH** (RER EUR) -- Industrial Machinery & Defence -- 8 pos 2 hdg

**Row 2 (EM Currency fixtures):**
- **AgroExport Brasil** (ORT BRL) -- Agricultural Commodities -- 10 pos 2 hdg
- **NipponTech KK** (ICS JPY) -- Consumer Electronics & Semiconductors -- 8 pos 2 hdg
- **AurusMining SA** (ING ZAR) -- Precious & Platinum Group Metals Mining -- 8 pos 2 hdg
- **GrupoGlobal SA de CV** (URY MXN) -- Diversified Conglomerate -- 10 pos 2 hdg
- **AnadoluInsaat AS** (ION TRY) -- Construction & Infrastructure -- 8 pos 2 hdg

#### 3.4 Five-Step Wizard Navigation
Below the Dataset Selector, a horizontal tab row shows the 5 steps with checkmarks when valid:
01 Commercial Exposure | 02 Risk Mitigation | 03 Market Conditions | 04 Hedge Policy | 05 Authorization

#### 3.5 Snapshot Summary Bar
Shows: SNAPSHOT SUMMARY | [Policy Name] | AS OF [datetime] UTC | PASS INT [n]/100. Right side: Edit Inputs button + Generate Hedge Plan button.

#### 3.6 Evidence Trail Panel
Right sidebar visible when a dataset is loaded. Always shows current snapshot provenance:
- Dataset ID, Import Method, Positions, Hedge Lines, Buckets, Policy
- Spot USD/MXN, Currency Pair, Snap As-of, Snap Source
- Trace ID (populated post-run), Run ID (populated post-run)
- View Trace Slice button


---

## PART II: STEP-BY-STEP OPERATOR GUIDE

### 4. Step 01 -- Commercial Exposure

This step displays the loaded exposure data in five sub-sections (A through E).

#### Sub-section A: Exposure Ledger Summary

| METRIC | DESCRIPTION | F01 VALUE |
|--------|-------------|-----------|
| Total Positions | Count of all trade rows (confirmed + forecast) | 12 |
| Net Exposure | Sum of all AP amounts minus all AR amounts (local currency) | 102.7M MXN |
| Confirmed Net | Net exposure from CONFIRMED trades only | 84.2M MXN |
| Forecast Net | Net exposure from FORECAST trades only | 18.5M MXN |
| Existing Hedges | Total notional of existing hedge instruments | 27.5M MXN |
| Spot Rate | Current USD/local currency spot rate | 18.9700 USD/MXN |
| Policy Applied | Execution product and bucketing mode | NDF CALENDAR_MONTH min 500,000 USD |

**Sign convention**: AP is positive (the entity owes FX), AR is negative (the entity is owed FX). In F01, the entity has more AP than AR, creating net long MXN exposure that needs to be sold (hedged by buying USD).

#### Sub-section B: Net Exposure by Currency

| CURRENCY | AR | AP | NET |
|----------|----|----|-----|
| MXN | 26.7M | 76M | -49.3M |

Note: The NET is shown as negative because AR offsets AP. The actual hedge exposure is the absolute value: 49.3M MXN.

#### Sub-section C: Net Exposure by Tenor Bucket

| BUCKET | NET EXP (MXN) | FWD POINTS | EXECUTION |
|--------|--------------|------------|-----------|
| 2026-03 | 35.6M | 0.048 | View Chart |
| 2026-04 | 28.5M | 0.091 | View Chart |
| 2026-05 | 25.6M | 0.138 | View Chart |
| 2026-06 | 13M | 0.182 | View Chart |

Forward points are cumulative -- they represent the premium/discount of the forward vs spot for that settlement month.

#### Sub-section D: Top Contributors by Notional

| ID | ENTITY | TYPE | CCY | AMOUNT | VALUE DATE | STATUS |
|----|--------|------|-----|--------|------------|--------|
| T005 | LatAm Corp | AP | MXN | 16.8M | 2026-04-10 | CONFIRMED |
| T001 | LatAm Corp | AP | MXN | 14.5M | 2026-03-15 | CONFIRMED |
| T009 | LatAm Corp | AP | MXN | 12.3M | 2026-05-15 | CONFIRMED |
| T008 | LatAm Corp | AR | MXN | 10.5M | 2026-05-08 | CONFIRMED |
| T002 | LatAm Corp | AP | MXN | 9.2M | 2026-03-22 | CONFIRMED |

#### Sub-section E: Data Quality & Exceptions

Clean state message: No data quality exceptions detected - 12 rows validated. If exceptions exist, they appear as a table with row ID, exception code, description, and severity.


---

### 5. Step 02 -- Risk Mitigation (Existing Hedges)

**F01 Hedge Book:**

| HEDGE ID | INSTRUMENT | DIRECTION | NOTIONAL (MXN) | VALUE DATE | STATUS |
|----------|-----------|-----------|----------------|------------|--------|
| H001 | NDF | SELL_MXN_BUY_USD | 12,000,000 | 2026-03-15 | ACTIVE |
| H002 | NDF | SELL_MXN_BUY_USD | 9,500,000 | 2026-04-10 | ACTIVE |
| H003 | FWD | SELL_MXN_BUY_USD | 6,000,000 | 2026-05-08 | LOCKED |

**Total existing coverage**: 27,500,000 MXN across 3 instruments, 2 active.

**Hedge Status Values:**
- ACTIVE: The hedge is live and counted toward coverage
- LOCKED: The hedge is confirmed but settlement is locked (cannot be modified or unwound)

**Instrument Types:**
- NDF (Non-Deliverable Forward): Cash-settled forward, no physical exchange of principal. Standard for EM currencies with capital controls (e.g., MXN, BRL, INR).
- FWD (Deliverable Forward): Physical delivery of currency at maturity. Used where direct currency exchange is permitted (e.g., EUR, JPY).

**Direction Convention:**
- SELL_MXN_BUY_USD: Entity sells local currency (MXN) and buys USD -- standard hedge for an AP-heavy exporter hedging against MXN appreciation
- BUY_MXN_SELL_USD: Entity buys local currency and sells USD -- for AR-heavy exporters receiving USD who want to lock in the FX rate

---

### 6. Step 03 -- Market Conditions

**F01 Default Market Snapshot:**

| FIELD | VALUE | DESCRIPTION |
|-------|-------|-------------|
| As-of date | 2026-02-17T12:00:00Z | Timestamp of market data |
| Spot USD/MXN | 18.9700 | How many MXN per 1 USD |
| Data class | DEMO | Fixture data (not live) |
| Provider | hedgecalc_demo_fixture | Source identifier |
| Currency pair | USD/MXN | Primary pair |

**Forward Points by Month:**

| TENOR | FORWARD POINTS | ALL-IN RATE (USD/MXN) |
|-------|---------------|----------------------|
| 2026-03 | 0.048 | 19.018 |
| 2026-04 | 0.091 | 19.061 |
| 2026-05 | 0.138 | 19.108 |
| 2026-06 | 0.182 | 19.152 |

**Forward points interpretation**: Points are additive to spot (MXN at premium to USD in the forward market, reflecting interest rate differential). The longer the tenor, the higher the forward rate -- consistent with positive carry for a USD buyer.


---

### 7. Step 04 -- Hedge Policy

**F01 Default Policy (Balanced Corporate):**

| PARAMETER | VALUE | DESCRIPTION |
|-----------|-------|-------------|
| bucket_mode | CALENDAR_MONTH | All trades settling in same calendar month aggregate to one bucket |
| hedge_ratio.confirmed | 0.80 (80%) | Target coverage for CONFIRMED trades |
| hedge_ratio.forecast | 0.50 (50%) | Target coverage for FORECAST trades |
| cost_assumptions.spread_bps | 5.0 | Bid-offer spread in basis points (one-way) |
| execution_product | NDF | Default hedge instrument type |
| min_trade_size_usd | 500,000 | Minimum notional in USD; buckets below this are suppressed |

**Bucket Mode -- CALENDAR_MONTH**: All trade rows with a value_date in the same calendar month are grouped into a single bucket. For example, T001 (2026-03-15) and T002 (2026-03-22) both fall in the 2026-03 bucket.

**Hedge Ratios**: The engine computes net exposure separately for confirmed and forecast positions within each bucket, then multiplies each by the respective ratio. Only 80% of confirmed exposure is hedged (leaving 20% unhedged), and only 50% of forecast (more uncertain).

**Spread BPS**: The spread_bps represents the bid-offer spread the bank charges on NDF execution. At 5 bps, the friction cost on a ,455,463 USD equivalent trade is approximately 29.57.

**Min Trade Size**: Any bucket where the required new hedge action falls below 500,000 USD equivalent is suppressed -- no trade ticket is generated.

---

### 8. Step 05 -- Authorization & Gate Check

#### Gate Check System

Three gates must all be green for the Generate button to be enabled:

| GATE | CONDITION | ERROR STATE |
|------|-----------|-------------|
| Exposure data | At least 1 position is loaded | No positions loaded |
| Market snapshot | A spot rate is present in the snapshot | Spot rate required |
| No critical errors | No V-code validation errors at CRITICAL severity | N critical errors |

When any gate is red, the Generate Hedge Plan button is greyed out and unclickable.

#### Generate Hedge Plan

When all gates pass, click Generate Hedge Plan. The button label changes to Computing... during the ~2 second execution. The page then automatically navigates to /results with the completed Committee Pack.

**Important**: If you navigate away from the input page during computation (before the redirect completes), the computation result is lost. The results page will show No Committee Pack generated. Return to /currency-fx and trigger a new run.


---

## PART III: COMPUTATION ENGINE

### 9. The Deterministic Kernel

The computation kernel executes in a fixed sequence. The same inputs always produce the same outputs. The kernel runs in 6 stages (as shown in the Trace Bundle Viewer), encompassing 8 trace events:

**Stage 1 -- PARSE (1 event)**
Load all input datasets: trade rows, hedge rows, market snapshot, policy configuration. Validate schema of each input. Assign Run ID (UUID v4) and timestamp.

**Stage 2 -- VALIDATE (1 event)**
Run the validation suite against all loaded data. Check for missing required fields, invalid status codes, negative amounts, value dates in the past, duplicate record IDs, missing spot rate, malformed forward curve. Compute INT score (0-100). If any V-code is at CRITICAL severity, mark gate 3 as failed.

**Stage 3 -- NORMALIZE (1 event)**
Standardize all monetary amounts to local currency (MXN for F01). Apply absolute value normalization (amounts are always positive; sign is carried by flow type AP/AR). Separate confirmed from forecast trades.

**Stage 4 -- KERNEL (3 events)**

Kernel Event 1 -- Netting:
- For each currency pair, compute: Net_Confirmed = sum(AP_confirmed) - sum(AR_confirmed); Net_Forecast = sum(AP_forecast) - sum(AR_forecast)
- Apply hedge ratios: Target_Confirmed = Net_Confirmed x 0.80; Target_Forecast = Net_Forecast x 0.50

Kernel Event 2 -- Bucketing & Existing Hedge Offset:
- Aggregate all trades into CALENDAR_MONTH buckets
- For each bucket: subtract existing hedge notional from target
- Result: Gap = Target - Existing_Coverage (this is the new hedge action required)
- Apply minimum trade size filter: if |Gap| x Spot < min_trade_size_usd -> suppress bucket (mark SUPP=Y)

Kernel Event 3 -- Pricing:
- For each non-suppressed bucket: All_In_Rate = Spot + Forward_Points[bucket]
- Action_USD = Action_MXN / All_In_Rate
- Friction_USD = Action_USD x spread_bps / 10,000
- Direction: if Gap > 0 -> BUY MXN SELL USD; if Gap < 0 -> SELL MXN BUY USD

**Stage 5 -- SCENARIO (1 event)**
Run scenario analysis across 4 FX shock scenarios: -10%, -5%, +5%, +10% of spot rate. For each scenario, compute: Unhedged P&L impact, Hedged P&L impact, Benefit of hedge. Also compute: Worst-case (+/-10% shock), Average Loss Reduction across all scenarios.

**Stage 6 -- AUDIT (1 event)**
Compute SHA-256 hashes of all 6 inputs/outputs. Lock snapshot binding. Finalize Trace ID. Write audit ledger entry. Seal Run ID.


---

### 10. Validation System

The INT (Integrity) score ranges from 0 to 100. 100 = fully clean; 0 = catastrophic data failure.

**Known Validation Codes (V-series):**

| CODE | DESCRIPTION | SEVERITY |
|------|-------------|----------|
| V-001 | No positions loaded | CRITICAL |
| V-002 | Missing spot rate | CRITICAL |
| V-003 | Duplicate record IDs | ERROR |
| V-004 | Invalid flow type (not AP or AR) | ERROR |
| V-005 | Invalid status (not CONFIRMED or FORECAST) | ERROR |
| V-006 | Negative amount (amounts must be absolute) | WARNING |
| V-007 | Value date in the past | WARNING |
| V-008 | Missing currency code | ERROR |
| V-009 | Missing value date | ERROR |
| V-010 | Missing entity name | WARNING |
| V-011 | Forward curve incomplete (missing tenor) | WARNING |
| V-012 | Hedge notional below minimum | WARNING |
| V-013 | Hedge status invalid | ERROR |
| V-014 | Instrument type unsupported | ERROR |
| V-015 | Policy: hedge ratio out of range (0-1) | ERROR |
| V-016 | Policy: spread_bps negative | ERROR |
| V-017 | Policy: min_trade_size_usd zero or negative | ERROR |
| V-018 | Snapshot as-of date missing | WARNING |
| V-019 | Currency pair not supported | ERROR |
| V-020 | Forecast net exposure negative (net AR exceeds AP) | INFO |
| V-021 | All positions are forecast (no confirmed) | WARNING |

**PASS/FAIL logic:**
- PASS: No CRITICAL or ERROR codes, INT score >= 60
- FAIL: Any CRITICAL code present, or INT score < 60

---

### 11. Snapshot Locking & Determinism

Every run is cryptographically locked to its inputs at the moment of execution. This means:

1. **Reproducibility**: Given the same 6 inputs (trades, hedges, market snapshot, policy, inputs, outputs), the engine always produces the same result.
2. **Snapshot Binding**: The market snapshot hash (market_hash) is embedded in the run record. Any change to the spot rate or forward curve changes the hash.
3. **Policy Binding**: The policy hash (policy_hash) similarly locks the policy. If a user changes hedge ratios after a run, prior runs are unaffected.
4. **Run Identity**: Each run has a UUID v4 Run ID (e.g., 7d93287e-afb4-44ae-94b2-ef9c55aea7c6) and an ISO-8601 timestamp. These are immutable once assigned.
5. **Trace Bundle**: 8 trace events across 6 stages are recorded and viewable in AE-02 Trace Bundle Viewer.

**SHA-256 Hashes (F01 Reference Run):**

| HASH NAME | VALUE |
|-----------|-------|
| INPUTS HASH | 0d822f6ea2bc4343bf2b73f09883d2c2a2086d68d889ac7aec7e5d10257d856b |
| OUTPUTS HASH | 620daf3538a2264060f30f62349f14669dbbb9884a43f5d9066e26ccf500101 |
| TRADES HASH | d8b0cd34573852786c02c3f6c7ec38c8602038043cbd4a6f7d9dd1aca2ef50e8 |
| HEDGES HASH | 786aed64a0e86bfe2aa5ef0a86e67ed36d12807934d9a7cfc2fcc1be4d2c0364 |
| MARKET HASH | 8ece42c3b39489a9da600b972b4e7b0fc50a6b09092a3ca5346b58aa5e3ec5b2 |
| POLICY HASH | bd8401f1f89ef9d1638d212ca60f12e1439689678339dca9088abfd07f0c98c9 |


---

## PART IV: RESULTS -- COMMITTEE PACK

### 12. Execution Desk

The Execution Desk is the first top-level section of the Committee Pack. It contains 5 sub-tabs:

#### Tab 1: Committee Summary

The primary result dashboard. Shows 8 key metric cards:

| METRIC | F01 VALUE | DESCRIPTION |
|--------|-----------|-------------|
| TOTAL EXPOSURE | -49,300,000 MXN | Net commercial exposure (AP - AR), negative = net AP |
| COVERAGE RATIO | 57% (UNDER-HEDGED) | (Existing hedges + new action) / total exposure |
| NET HEDGE POSITION | 27,930,000 MXN | Existing hedges + new NDF action combined |
| RESIDUAL EXPOSURE | -21,370,000 MXN | Unhedged exposure after plan execution |
| NEW ACTION REQUIRED | 63,490,000 MXN | Total new NDF notional to execute |
| TOTAL FRICTION COST | ,714.55 USD | Estimated spread cost across all trade tickets |
| WORST-CASE IMPACT | ,806,406.88 USD | P&L impact under +/-10% FX shock |
| EXISTING HEDGES | -27,500,000 MXN | Pre-existing hedge instruments on books |

Below the KPI cards: a Coverage Decomposition stacked bar chart showing the proportional split between Existing (56%), New (129%), and Residual (43%) components.

Summary Detail table arithmetic:
- Total Commercial Exposure: -49,300,000
- Existing Hedges On Books: -27,500,000
- New Hedge Action: 63,490,000
- Net Hedge Position: 27,930,000

#### Tab 2: Exposure & Buckets

**Exposure by Bucket chart**: A grouped bar chart with 4 clusters (one per month, 2026-03 to 2026-06). Color coding: Confirmed (cyan), Forecast (dark blue), Existing Hedges (grey), Residual (amber).

**Hedge Plan Detail table**:

| BUCKET | CONFIRMED | FORECAST | COMMERCIAL | EXISTING | TARGET | ACTION MXN | DIRECTION | FWD RATE | ACTION USD | FRICTION | SUPP |
|--------|-----------|----------|------------|----------|--------|------------|-----------|----------|------------|----------|------|
| 2026-03 | -16,600,000 | -4,800,000 | -21,400,000 | -12,000,000 | 15,680,000 | 27,680,000 | BUY MXN SELL USD | 19.0180 | ,455,463.25 | 29.57 | |
| 2026-04 | -25,000,000 | 3,500,000 | -21,500,000 | -9,500,000 | 18,250,000 | 27,750,000 | BUY MXN SELL USD | 19.0610 | ,455,852.26 | 31.42 | |
| 2026-05 | -1,800,000 | -2,800,000 | -4,600,000 | -6,000,000 | 2,840,000 | 8,840,000 | BUY MXN SELL USD | 19.1080 | 62,633.45 | 33.00 | Y |
| 2026-06 | 5,600,000 | -7,400,000 | -1,800,000 | 0 | -780,000 | -780,000 | SELL MXN BUY USD | 19.1520 | 0,726.82 | 0.56 | Y |

**Column definitions:**
- CONFIRMED: Net confirmed AP/AR for this bucket (negative = net AP)
- FORECAST: Net forecast AP/AR for this bucket
- COMMERCIAL: Total net commercial exposure = CONFIRMED + FORECAST
- EXISTING: Existing hedge notional credited to this bucket (negative = hedge reduces exposure)
- TARGET: Required hedge coverage = (CONFIRMED x 0.80 + FORECAST x 0.50) + EXISTING
- ACTION MXN: New hedge notional required = TARGET - EXISTING (positive = buy MXN)
- DIRECTION: Trade direction (BUY MXN = sell MXN and buy USD in NDF terms)
- FWD RATE: All-in forward rate = Spot + Forward Points
- ACTION USD: ACTION MXN / FWD RATE
- FRICTION: ACTION USD x 5 bps / 10,000
- SUPP: Y = bucket suppressed (below min trade threshold of 500,000 USD)


#### Tab 3: Scenario Analysis

An ECharts interactive bar chart showing the hedge benefit under four FX shock scenarios. X-axis: -10%, -5%, +5%, +10% spot rate change. Y-axis: USD P&L impact. Three series per scenario: Unhedged (grey), Hedged (cyan), Benefit (green).

**Deterministic Risk Metrics table:**
- Worst-Case Net Portfolio Impact (at +/-10% Shock): ,806,406.88
- Average Loss Reduction Across Scenarios: ,949,535.58
- Residual Sensitivity: -21,370,000 MXN
- Friction Cost: ,714.55

#### Tab 4: Trade Tickets

**Execution Summary:**
- TRADE TICKETS: 2 (of 4 buckets -- 2 suppressed)
- TOTAL NOTIONAL: 55,430,000 MXN (sum of non-suppressed buckets)
- USD EQUIV: ,911,316
- EST. FRICTION: ,461
- TOP BUCKET: 2026-04
- Note: 2 buckets suppressed (below min trade threshold): 2026-05, 2026-06

**Bucket 2026-03 Ticket:**
- Direction: BUY MXN
- Notional: 27,680,000 MXN
- USD Equiv: ,455,463.25
- Instrument: USD/MXN NDF Mar-26
- Fwd Rate: 19.0180
- Carry: Forward points embedded (curve carry). Points:0.048 vs spot.
- Deterministic Risk: Commercial Exposure -21,400,000 MXN | Hedge Position 15,680,000 MXN | Residual -5,720,000 MXN | Worst-case delta ,575,907.77 | Friction Est. 29.57
- Buttons: Copy Ticket | Open in IBKR

**Bucket 2026-04 Ticket:**
- Direction: BUY MXN
- Notional: 27,750,000 MXN
- USD Equiv: ,455,852.26
- Instrument: USD/MXN NDF Apr-26
- Fwd Rate: 19.0610
- Carry: Forward points embedded. Points:0.091 vs spot.

Open in IBKR button: Opens the Interactive Brokers TWS/web interface with pre-filled trade parameters. This is a demo integration.

#### Tab 5: Audit Evidence

**AE-01: Evidence Ledger** -- Run identity + 6 SHA-256 hashes + Audit Proof Properties:
- Determinism: Guaranteed | Reproducibility: Hash-verifiable
- Snapshot Binding: market_hash locked | Policy Binding: policy_hash locked
- Source: Calculation Engine | Integrity Check: SHA-256 (both I/O)

**AE-02: Trace Bundle Viewer** (8 events 6 stages) -- Expandable list of all computation stages:
PARSE, VALIDATE, NORMALIZE, KERNEL, SCENARIO, AUDIT

**AE-03: Repro Steps** -- Instructions for an auditor to re-run the exact computation using the same inputs, producing identical outputs and verifying hashes.

**Bottom buttons**: Download Audit ZIP | Export Evidence PDF


---

### 13. Committee Reports (R-01 through R-06)

The Committee Reports top-level tab provides six formal report categories for institutional distribution.

#### R-01: Coverage & Residual Report
**Audience**: Risk Officers, Treasurers
**Purpose**: Shows how much of the total commercial exposure is covered by existing + new hedges, and what residual exposure remains.
**Key fields**: Total Exposure (49,300,000 MXN), Net Hedge Position (27,930,000 MXN), Residual Exposure (21,370,000 MXN)
**Charts**: Coverage Decomposition stacked bar (Existing 55.8% | New 100%) and Residual by Bucket bar chart

#### R-02: Cost & Slippage Report
**Audience**: Treasury Analysts, Finance Controllers
**Purpose**: Itemizes the friction cost of hedge execution at the bucket level.
**Key fields**: Total Friction Cost (,714.55), Spread Assumption (5 bps), Execution Product (NDF)

| BUCKET | NOTIONAL | USD EQUIV | SPREAD (BPS) | FRICTION (USD) | CARRY NOTE |
|--------|----------|-----------|--------------|----------------|------------|
| 2026-03 | 27,680,000 | ,455,463.25 | 5 | 29.57 | Points:0.048 vs spot |
| 2026-04 | 27,750,000 | ,455,852.26 | 5 | 31.42 | Points:0.091 vs spot |
| Total | | | | ,714.55 | |

#### R-03: Scenario & Stress Report
**Audience**: Risk Officers, CFO
**Purpose**: Shows hedge effectiveness across a range of FX shock scenarios.
**Scenarios tested**: -10%, -5%, +5%, +10% spot rate change
**Output**: For each scenario: Unhedged loss, Hedged loss, Benefit of hedge, Hedge effectiveness ratio

#### R-04: Policy Compliance Report
**Audience**: Chief Risk Officer, Internal Audit
**Purpose**: Tests the hedge plan against the active policy rules and reports pass/fail for each rule.
**F01 Result**: Score 20% (BREACH) -- 1/5 rules passed, 4/5 rules failed
**Rule Checklist**:
- FAIL: Confirmed hedge ratio target -- Target: 100% | Actual: 73%
- FAIL: Forecast hedge ratio target -- Target: 50% | Actual: 41%
- PASS: Min trade size threshold -- All trades above minimum
- FAIL: No over-hedged buckets -- 1 bucket over-hedged
- FAIL: Additional rule -- residual tolerance exceeded

#### R-05: Liquidity & Concentration Report
**Audience**: Treasury, Risk
**Purpose**: Analyzes exposure concentration across buckets. Concentration risk measured by HHI (Herfindahl-Hirschman Index). In F01: 2026-04 represents 44% of total commercial risk (HHI: 0.389).

#### R-06: Executive Briefing (Committee Governance Snapshot)
**Audience**: Board, Treasury Committee, CFO
**Purpose**: Auto-generated one-page briefing for committee distribution. Includes Risk Posture Radar chart (5 dimensions) and Assessment Narrative.
**KPIs**: Total Exposure 49,300,000 MXN | Coverage 57% | Residual 21,370,000 MXN | Friction Cost ,714.55 | Worst-Case ,806,406.88
**Risk Posture Radar Scores**: Coverage 57 | Compliance 20 | Cost Eff. 100 | Diversif. 61 | Resilience 107
**Assessment Narrative**:
1. Total commercial exposure of 49,300,000 MXN distributed across 4 monthly buckets.
2. Existing hedge coverage stands at 56%, with 21,370,000 MXN residual exposure.
3. Exposure concentration: 2026-04 represents 44% of total commercial risk (HHI: 0.389).
4. Under 10% spot shock, net portfolio impact is ,806,406.88.
5. Total hedge friction: ,714.55 across 2 active buckets.
6. Policy deviation: 3 bucket(s) outside target coverage ratio.


---

### 14. Controls & Alerts

**Alert Count Panel** (5 badges): 0 CRITICAL | 0 WARNING | 2 INFO | 0 ACKNOWLEDGED | 0 ESCALATED

**Alert Categories (left sidebar):** All Categories | Policy Breach | Data Integrity | Market Snapshot Quality | Execution Readiness | Concentration / Liquidity

**Severity Filter pills**: ALL | CRITICAL | WARNING | INFO

**F01 Active Alerts:**

**INFO E-001 -- Execution Readiness:**
- Reason: 2 buckets suppressed below min trade threshold (2026-05, 2026-06).
- Impacted: 2026-05, 2026-06
- Recommended Action: Verify min_trade_size_usd policy or consolidate exposure into fewer buckets.

**INFO E-002 -- Execution Readiness:**
- Reason: Net residual of -21,370,000 = 43.3% of total -- above 5% residual tolerance.
- Impacted: Portfolio
- Recommended Action: Review hedge ratios in policy settings. Confirm whether residual is permitted under policy.

**Governance Guidance (right panel):**
- Alert Export options: PDF Report, CSV, Audit Bundle
- Resolution Status: Pending Review 2 | Acknowledged 0 | Escalated 0
- Pre-Execution Checklist: PASS Policy validation passed | PASS No critical alerts | PASS Trade tickets generated | PASS Market snapshot present | PASS All alerts reviewed

---

### 15. Export System

Four export buttons appear in the top-right of the results page header:

| BUTTON | FORMAT | CONTENT | METHOD |
|--------|--------|---------|--------|
| PDF | PDF | Full Committee Pack rendered as paginated PDF | jsPDF client-side |
| Excel | XLSX | Tabular data: trades, hedges, bucket detail, trade tickets | SheetJS client-side |
| Audit | JSON | Full cryptographic audit bundle: run metadata, 6 hashes, trace log | Download JSON file |
| Brief | PDF | Executive Briefing (R-06) only, formatted for board distribution | jsPDF client-side |

All exports are generated client-side. No data is sent to a server for export processing.


---

## PART V: DATA REFERENCE

### 16. Data Dictionary -- All Fields

#### TradeRow Schema

| FIELD | TYPE | UNITS | SIGN | FORMULA/SOURCE | DOWNSTREAM USE |
|-------|------|-------|------|----------------|----------------|
| record_id | string | -- | -- | User-assigned (e.g., T001) or auto-generated | Deduplication, audit trace |
| entity | string | -- | -- | Company or subsidiary name | Display, grouping |
| type | enum: AP/AR | -- | AP=payable, AR=receivable | User input or CSV import | Netting direction |
| currency | string | -- | -- | ISO 4217 code (MXN, USD, EUR) | Currency pair selection |
| amount | number | Local currency | Always positive (absolute) | User input | Netting calculation |
| value_date | string | Date YYYY-MM-DD | -- | Settlement date | Tenor bucket assignment |
| status | enum: CONFIRMED/FORECAST | -- | -- | User input | Hedge ratio selection |
| description | string | -- | -- | Free text | Display only |

#### HedgeRow Schema

| FIELD | TYPE | UNITS | SIGN | FORMULA/SOURCE | DOWNSTREAM USE |
|-------|------|-------|------|----------------|----------------|
| hedge_id | string | -- | -- | User-assigned (e.g., H001) | Deduplication |
| instrument | enum: NDF/FWD | -- | -- | User input | Pricing, display |
| direction | enum | -- | SELL_MXN_BUY_USD / BUY_MXN_SELL_USD | User input | Coverage offset direction |
| notional_mxn | number | MXN | Always positive | User input | Bucket credit |
| value_date | string | Date YYYY-MM-DD | -- | Settlement date | Tenor bucket assignment |
| status | enum: ACTIVE/LOCKED | -- | -- | User input | Coverage inclusion |

#### MarketSnapshot Schema

| FIELD | TYPE | UNITS | DESCRIPTION |
|-------|------|-------|-------------|
| as_of | string ISO-8601 | Datetime UTC | Timestamp of rate data |
| spot_usdmxn | number | USD/MXN | How many local units per 1 USD |
| forward_points_by_month | object | Points | Map of YYYY-MM to forward points additive to spot |
| provider_metadata.source | string | -- | Data source identifier |
| provider_metadata.data_class | string | -- | DEMO or LIVE |
| provider_metadata.currency_pair | string | -- | E.g., USD/MXN |
| provider_metadata.primary_currency | string | -- | Local currency code |

#### PolicyConfig Schema

| FIELD | TYPE | UNITS | DESCRIPTION |
|-------|------|-------|-------------|
| bucket_mode | enum | -- | CALENDAR_MONTH only in v1.0 |
| hedge_ratios.confirmed | number | 0-1 | Fraction of confirmed net to hedge |
| hedge_ratios.forecast | number | 0-1 | Fraction of forecast net to hedge |
| cost_assumptions.spread_bps | number | basis points | One-way bid-offer spread |
| execution_product | enum: NDF/FWD | -- | Default instrument type |
| min_trade_size_usd | number | USD | Minimum bucket size; below = suppressed |

#### Computed Fields

| FIELD | FORMULA | UNITS |
|-------|---------|-------|
| net_exposure | sum(AP) - sum(AR) for all trades | Local currency |
| confirmed_net | sum(AP_confirmed) - sum(AR_confirmed) | Local currency |
| forecast_net | sum(AP_forecast) - sum(AR_forecast) | Local currency |
| hedge_target_confirmed | confirmed_net x hedge_ratio.confirmed | Local currency |
| hedge_target_forecast | forecast_net x hedge_ratio.forecast | Local currency |
| bucket_target | hedge_target_confirmed[b] + hedge_target_forecast[b] | Local currency |
| gap | bucket_target - existing_hedge_notional[b] | Local currency |
| suppressed | gap / spot < min_trade_size_usd | Boolean |
| all_in_rate | spot + forward_points[bucket_month] | USD/Local |
| action_usd | gap / all_in_rate | USD |
| friction_usd | action_usd x spread_bps / 10,000 | USD |
| residual | bucket_commercial + hedge_position | Local currency |
| coverage_ratio | (existing + new_action) / total_exposure | Percentage |
| worst_case_impact | abs(residual) x spot x 0.10 | USD |

#### Evidence Trail Fields

| FIELD | DESCRIPTION |
|-------|-------------|
| Dataset ID | Internal identifier for the loaded fixture (e.g., 2026_CORPORATE_BALANCED) |
| Import Method | Fixture (deterministic) or Manual |
| Positions | Count of trade rows |
| Hedge Lines | Count of hedge rows |
| Buckets | Count of calendar month buckets |
| Policy | Execution product name |
| Spot USD/MXN | Spot rate from market snapshot |
| Currency Pair | Primary currency pair |
| Snap As-of | Snapshot timestamp |
| Snap Source | Data provider identifier |
| Trace ID | Computation trace identifier (set post-run) |
| Run ID | UUID of the completed run (set post-run) |


---

### 17. Numbers Dictionary -- F01 Reference Case

Every number shown in the CurrencyFX UI for the F01 LatAm Corp dataset:

| NUMBER | MEANING | DERIVATION |
|--------|---------|-----------|
| 12 | Total positions | Count of T001 through T012 |
| 8 | Confirmed positions | T001,T002,T003,T005,T007,T008,T009,T011 |
| 4 | Forecast positions | T004,T006,T010,T012 |
| 102,700,000 | Net exposure | sum(AP): 14.5+9.2+4.8+16.8+8.2+12.3+2.8+7.4 = 76.0M; sum(AR): 7.1+3.5+10.5+5.6 = 26.7M |
| 26,700,000 | Total AR | T003(7.1M)+T006(3.5M)+T008(10.5M)+T011(5.6M) |
| 76,000,000 | Total AP | T001(14.5M)+T002(9.2M)+T004(4.8M)+T005(16.8M)+T007(8.2M)+T009(12.3M)+T010(2.8M)+T012(7.4M) |
| -49,300,000 | Net exposure (netted) | AP - AR = 76.0M - 26.7M = 49.3M (net AP, shown negative in results) |
| 84,200,000 | Confirmed net | Net of confirmed AP vs confirmed AR x 80% |
| 18,500,000 | Forecast net | Net of forecast positions x 50% |
| 27,500,000 | Existing hedges | H001(12M) + H002(9.5M) + H003(6M) = 27.5M |
| 18.9700 | Spot rate | hedgecalc_demo_fixture rate, USD/MXN |
| 0.048 | Fwd points 2026-03 | 1-month forward premium |
| 0.091 | Fwd points 2026-04 | 2-month forward premium |
| 0.138 | Fwd points 2026-05 | 3-month forward premium |
| 0.182 | Fwd points 2026-06 | 4-month forward premium |
| 35,600,000 | Bucket 2026-03 net | T001(14.5M AP)+T002(9.2M AP)+T003(7.1M AR)+T004(4.8M AP) net |
| 28,500,000 | Bucket 2026-04 net | T005(16.8M AP)+T006(3.5M AR)+T007(8.2M AP) net |
| 25,600,000 | Bucket 2026-05 net | T008(10.5M AR)+T009(12.3M AP)+T010(2.8M AP) net |
| 13,000,000 | Bucket 2026-06 net | T011(5.6M AR)+T012(7.4M AP) net |
| 57% | Coverage ratio | (Existing 27.5M + New action) / Total 49.3M |
| 63,490,000 | New action required | Sum of all bucket gaps; 27.68M + 27.75M = 55.43M (2 active tickets) |
| 27,930,000 | Net hedge position | Existing + New projected hedge coverage net |
| -21,370,000 | Residual exposure | 49.3M total - 27.93M hedge = 21.37M unhedged |
| ,714.55 | Total friction cost | 29.57 + 31.42 + 33.00 + 0.56 (all buckets) |
| ,806,406.88 | Worst-case FX impact | abs(Residual 21.37M MXN) x 19.15 / 10 x scenario factor |
| 19.0180 | Fwd rate 2026-03 | Spot 18.97 + 0.048 = 19.018 |
| 19.0610 | Fwd rate 2026-04 | Spot 18.97 + 0.091 = 19.061 |
| 19.1080 | Fwd rate 2026-05 | Spot 18.97 + 0.138 = 19.108 |
| 19.1520 | Fwd rate 2026-06 | Spot 18.97 + 0.182 = 19.152 |
| ,455,463.25 | Action USD 2026-03 | 27,680,000 / 19.0180 |
| ,455,852.26 | Action USD 2026-04 | 27,750,000 / 19.0610 |
| 29.57 | Friction 2026-03 | ,455,463.25 x 0.0005 |
| 31.42 | Friction 2026-04 | ,455,852.26 x 0.0005 |
| 2 | Trade tickets generated | Buckets 2026-03 and 2026-04 only |
| 2 | Buckets suppressed | 2026-05 and 2026-06 below 500,000 USD threshold |
| 100/100 | INT score | No validation exceptions in F01 fixture |
| 8 | Trace events | 6 computation stages with 8 total trace events |
| 20% | Policy compliance score | 1 of 5 rules passed |
| 0.389 | HHI concentration | Herfindahl-Hirschman Index for bucket concentration |
| 57 | Coverage radar score | 57% coverage -- score 57 |
| 20 | Compliance radar score | 20% policy compliance |
| 100 | Cost Eff. radar score | Full cost efficiency (min friction) |
| 61 | Diversif. radar score | Exposure spread across 4 buckets |
| 107 | Resilience radar score | Hedge resilience under stress scenarios |
| ,949,535.58 | Average loss reduction | Average across all 4 scenario shocks |


---

### 18. Demo Fixture Catalogue

| ID | LABEL | INDUSTRY | CCY | POS | HDG | STORY |
|----|-------|----------|-----|-----|-----|-------|
| F01 (CED) | LatAm Corp | Manufacturing (Auto Parts) | MXN | 12 | 3 | Mexico-based manufacturer with mixed USD/MXN AP & AR. Balanced scenario, standard hedge recommendation. |
| F02 (AP) | MexImport SA | Import-Dependent Manufacturing | MXN | 10 | 2 | Heavy AP importer of raw materials and components. Predominantly AP, minimal AR. |
| F03 (AR) | MexExport Global | Export-Driven Manufacturing | MXN | 10 | 3 | Heavy AR exporter to US and EU markets. Predominantly AR receipts in USD converted to MXN. |
| F04 (KET) | LatAm Corp (Stress) | Manufacturing | MXN | 12 | 3 | Same as F01 but with stress scenario market rates (wider forward curve, elevated spot). |
| F05 (RER) | BavariaGmbH | Industrial Machinery & Defence | EUR | 8 | 2 | European industrial company with EUR exposure from US and EM customer receivables. |
| F06 (ORT) | AgroExport Brasil | Agricultural Commodities (Soy, Corn, Sugar, Beef) | BRL | 10 | 2 | Brazilian agricultural exporter, seasonal cash flow patterns, BRL/USD exposure. |
| F07 (ICS) | NipponTech KK | Consumer Electronics & Semiconductors | JPY | 8 | 2 | Japanese technology manufacturer, JPY/USD exposure, large single-trade concentration. |
| F08 (ING) | AurusMining SA | Precious & Platinum Group Metals Mining | ZAR | 8 | 2 | South African mining company, ZAR/USD exposure, high commodity price correlation. |
| F09 (URY) | GrupoGlobal SA de CV | Diversified Conglomerate (Manufacturing, Technology, Real Estate) | MXN | 10 | 2 | Large Mexican conglomerate with diverse exposure across multiple business lines. |
| F10 (ION) | AnadoluInsaat AS | Construction & Infrastructure | TRY | 8 | 2 | Turkish construction firm, TRY exposure with high FX volatility and NDF market constraints. |


---

## PART VI: ASSUMPTIONS, LIMITS & EDGE CASES

### 20. Engine Assumptions

1. **Intra-currency netting only**: AP and AR are netted within the same currency. Cross-currency netting (e.g., netting USD AR against MXN AP) is not performed. Each currency pair produces an independent hedge plan.

2. **CALENDAR_MONTH bucketing**: All trades with a value_date in the same calendar month (YYYY-MM) are aggregated into a single bucket, regardless of day. A trade on 2026-03-01 and a trade on 2026-03-31 are in the same 2026-03 bucket.

3. **Hedge ratios apply to NET exposure**: The ratio is applied to (AP_net - AR_net), not to gross AP alone. If AR partially offsets AP within a bucket, the ratio applies to the residual net.

4. **Confirmed and forecast separated**: Confirmed trades are hedged at 80%, forecast at 50%, within each bucket separately. The targets are then summed.

5. **Existing hedges are credited in full**: All hedges with status ACTIVE or LOCKED are credited at their full notional toward the bucket target. There is no partial credit for LOCKED status.

6. **Minimum trade size is in USD equivalent**: The gap is converted to USD using the spot rate (not the forward rate) for the minimum size check. If gap_mxn / spot < 500,000 -- suppress.

7. **Forward rate pricing**: The all-in rate for each NDF uses the spot rate plus the forward point for that month. Forward points are assumed to be cumulative from spot (not from the previous month).

8. **Spread cost is one-way**: The 5 bps spread is the bid-offer spread the trader pays on execution. It is not doubled for round-trip.

9. **Demo fixture rates are illustrative**: The spot rate of 18.9700 USD/MXN and the forward curve are representative but not real-time market data.

10. **Scenario shocks are parallel shifts**: The +/-5% and +/-10% scenarios are parallel shifts to the entire spot rate. They do not model forward curve movements independently.

---

### 21. Limits & Constraints

| PARAMETER | LIMIT | NOTES |
|-----------|-------|-------|
| Currencies supported | MXN, USD, EUR, BRL, JPY, ZAR, TRY | Fixture data only in v1.0 |
| Instruments | NDF, FWD | Options not supported in v1.0 |
| Bucketing modes | CALENDAR_MONTH only | Other modes planned for v2.0 |
| Forward curve tenors | Up to 4 months ahead | Matches fixture data range |
| Max positions per run | ~12 (fixture cap) | No hard limit in engine |
| Scenario shocks | +/-5%, +/-10% | Fixed; not configurable in v1.0 |
| Min trade size | 500,000 USD | Configurable in policy |
| Hedge ratios | 0-100% (0.0-1.0) | Configurable in policy |
| Export formats | PDF, Excel, JSON, Brief PDF | All client-side |
| Pipeline stages | Sandbox, Staging, Ledger | Staging and Ledger are UI-only in demo |


---

### 22. Failure Modes & Troubleshooting

| SYMPTOM | CAUSE | RESOLUTION |
|---------|-------|-----------|
| No Committee Pack generated on results page | Navigated away during computation, or session expired | Return to /currency-fx, load dataset, click Generate again |
| Gate check fails: No positions loaded | No dataset selected, or dataset cleared | Click a fixture card in the Dataset Selector |
| Gate check fails: Market snapshot missing | Step 03 market data not populated | Should auto-populate with fixture; try reloading the dataset |
| Gate check fails: N critical errors | Validation errors at CRITICAL severity | Check Data Quality section (Step 01E) for V-001 or V-002 codes |
| Generate Hedge Plan button is grey | One or more gates are red | Fix gate issues; all 3 must be green |
| INT score is less than 100 | Validation warnings or errors | Expand Data Quality section for exception details |
| VALIDATION: FAIL in status bar | Critical validation error | Check for missing required fields in trade data |
| Scenario Analysis chart blank | ECharts rendering issue | Refresh the page; chart renders on component mount |
| Trace ID shows dash in Evidence Trail | Run not yet committed (Sandbox mode only) | Expected behavior in demo; Run ID is set post-computation |
| AGE counter shows very old time | Snapshot is stale | Click Snap menu in top nav to refresh |
| Buckets suppressed (INFO alert E-001) | Bucket gap < 500,000 USD equivalent | Increase min_trade_size_usd or add more exposure to bucket |
| High residual exposure (INFO alert E-002) | Residual > 5% of total | Adjust hedge ratios upward in policy settings |
| Dataset Change confirmation modal appears | Clicking a different fixture when one is already loaded | Click Load Dataset to confirm, or Cancel to stay |
| Policy Compliance score is BREACH | Hedge plan does not meet policy rule targets | Review R-04 rule checklist; adjust policy or accept exception |


---

## PART VII: TUTORIAL

### 23. Full Tutorial: From Zero to Committee Pack

This tutorial walks a new user through the complete CurrencyFX workflow from login to a fully exported Committee Pack.

**Prerequisites:**
- Modern browser: Chrome 120+ or Edge 120+
- URL: hedgecore.vercel.app
- Credentials: username demo / password demo
- Estimated time: 10-15 minutes

---

**Step 1 -- Login**

Navigate to hedgecore.vercel.app. You will be redirected to /auth/login.

The login page shows a dark terminal interface with the HEDGECALC shield icon. Enter:
- Username: demo
- Password: demo

Click the Login button. The system validates credentials and redirects you to the terminal selector at /.

**Tip**: If already logged in from a previous session, you will be redirected directly to /currency-fx via the session cookie.

---

**Step 2 -- Select the CurrencyFX Module**

The terminal selector shows four module cards in a 2x2 grid:
- **CurrencyFX** -- FX Hedge Management
- **Portfolio Risk** -- Multi-dimensional risk decomposition
- **Polisophic** -- Geopolitical risk event feed
- **HedgeWiki** -- Institutional FX reference library

Click the **CurrencyFX** card. You are navigated to /currency-fx.

---

**Step 3 -- Review the Interface**

When you arrive at the input page, observe:
1. **Top navigation bar**: HEDGECALC branding, Engine version, pipeline breadcrumb
2. **Status bar**: Initially shows TRADES 0 | HEDGES 0 | VALIDATION: PENDING if no dataset is loaded
3. **Dataset Selector**: 10 fixture cards in 2 rows
4. **5-Step Wizard**: Tab row below the selector
5. **Gate Check**: At the bottom, showing 3 red badges

---

**Step 4 -- Load the LatAm Corp Dataset**

In the Dataset Selector, click the **LatAm Corp** card (top-left, labeled CED MXN). A Dataset Change confirmation modal appears:

"This will reset all current inputs and load: Balanced Corporate. Any unsaved manual entries will be discarded."

Click **Load Dataset**.

The dataset loads. The status bar immediately updates to:
TRADES 12 | HEDGES 3 | POLICY Balanced Corporate | SNAP DEMO | VALIDATION: PASS | INT 100/100 | ENGINE v1.0.0 | DETERMINISTIC

The LatAm Corp card now shows ACTIVE. The Scenario Brief bar below the selector reads:
SCENARIO BRIEF: LatAm Corp -- Manufacturing (Auto Parts) -- Mexico-based manufacturer -- mixed USD/MXN AP & AR across import-dependent production and export sales


---

**Step 5 -- Read the Snapshot Summary**

Below the 5-step wizard tabs, confirm the snapshot is valid:
SNAPSHOT SUMMARY | Balanced Corporate | AS OF 2026-02-17 12:00:00 UTC | PASS INT 100/100

This means:
- Policy: Balanced Corporate is loaded
- The market snapshot is from 2026-02-17 at noon UTC
- All validation checks pass (INT 100/100)

---

**Step 6 -- Review Step 01: Commercial Exposure**

Click 01 Commercial Exposure in the wizard nav if not already shown.

**Read the Exposure Ledger Summary (Section A):**
- Total Positions: 12 (8 confirmed 4 forecast)
- Net Exposure: 102.7M MXN -- this is the gross sum, not netted
- Confirmed Net: 84.2M MXN -- confirmed position size for 80% hedge ratio
- Forecast Net: 18.5M MXN -- forecast position size for 50% hedge ratio
- Existing Hedges: 27.5M MXN (3 instruments, 2 active)
- Spot Rate: 18.9700 USD/MXN
- Policy Applied: NDF | CALENDAR_MONTH | min 500,000 USD

**Read Net Exposure by Currency (Section B):**
- MXN: AR 26.7M | AP 76M | NET -49.3M
- The company has 76M in payables and only 26.7M in receivables -- it is net long MXN (needs to buy USD / sell MXN forward)

**Read Tenor Buckets (Section C):**
Four monthly buckets. Note the forward points increasing month-over-month (0.048 -> 0.091 -> 0.138 -> 0.182), reflecting the upward-sloping forward curve.

**Read Top Contributors (Section D):**
T005 is the largest single position at 16.8M MXN (component supplier, quarterly payment, April 2026).

**Check Data Quality (Section E):**
No data quality exceptions detected - 12 rows validated -- clean data.

---

**Step 7 -- Review Step 02: Risk Mitigation**

Click 02 Risk Mitigation.

The existing hedge book is displayed:
- H001: NDF, SELL_MXN_BUY_USD, 12M, March 2026, ACTIVE
- H002: NDF, SELL_MXN_BUY_USD, 9.5M, April 2026, ACTIVE
- H003: FWD, SELL_MXN_BUY_USD, 6M, May 2026, LOCKED

Total on-books coverage: 27.5M MXN. The engine will subtract this from the required hedge target before sizing new trades.

---

**Step 8 -- Review Step 03: Market Conditions**

Click 03 Market Conditions.

Confirms: Spot 18.9700 USD/MXN, source hedgecalc_demo_fixture, as-of 2026-02-17 12:00:00 UTC. Forward curve for 4 tenors loaded.

---

**Step 9 -- Review Step 04: Hedge Policy**

Click 04 Hedge Policy.

Policy Balanced Corporate settings:
- Bucket Mode: CALENDAR_MONTH
- Confirmed Hedge Ratio: 80%
- Forecast Hedge Ratio: 50%
- Spread: 5 bps
- Product: NDF
- Min Trade Size: 500,000 USD


---

**Step 10 -- Check Step 05: Authorization**

Click 05 Authorization.

All three gates should now be green:
- PASS Exposure data -- 12 positions loaded
- PASS Market snapshot -- spot rate present
- PASS No critical errors -- INT 100/100

The Generate Hedge Plan button is enabled (dark blue, clickable).

---

**Step 11 -- Generate the Hedge Plan**

Click Generate Hedge Plan.

The button changes to Computing... Wait 2-3 seconds. The page automatically redirects to /results -- the Committee Pack.

---

**Step 12 -- Read the Committee Summary**

You are now on the Execution Desk > Committee Summary tab.

Review the 8 KPI cards:
- **Total Exposure**: -49,300,000 MXN (net AP position to hedge)
- **Coverage Ratio**: 57% UNDER-HEDGED (existing + new hedges cover 57% of exposure)
- **New Action Required**: 63,490,000 MXN (new NDF notional to execute)
- **Total Friction Cost**: ,714.55 (spread estimate at 5 bps)
- **Worst-Case Impact**: ,806,406.88 (under +/-10% FX shock)
- **Residual Exposure**: -21,370,000 MXN (43% of total remains unhedged)
- **Net Hedge Position**: 27,930,000 MXN
- **Existing Hedges**: -27,500,000 MXN

The Coverage Decomposition bar below shows: Existing 56% | New 129% | Residual 43%.

---

**Step 13 -- Review Exposure & Buckets**

Click the **Exposure & Buckets** tab.

The Hedge Plan Detail table shows the full bucket-level computation:
- 2026-03: BUY MXN 27,680,000 at 19.018 -> ,455,463 | 29.57 friction
- 2026-04: BUY MXN 27,750,000 at 19.061 -> ,455,852 | 31.42 friction
- 2026-05 and 2026-06: SUPPRESSED (below 00K min threshold)

---

**Step 14 -- Review Trade Tickets**

Click the **Trade Tickets** tab.

2 trade tickets are ready for execution:
1. Bucket 2026-03: BUY MXN 27,680,000, NDF Mar-26, rate 19.0180
2. Bucket 2026-04: BUY MXN 27,750,000, NDF Apr-26, rate 19.0610

Use Copy Ticket to copy the ticket parameters to clipboard, or Open in IBKR to pre-fill Interactive Brokers.

---

**Step 15 -- Review Committee Reports**

Click the **Committee Reports** top-level tab.

Explore the 6 report categories:
- Coverage & Residual (R-01): Total coverage decomposition
- Cost & Slippage (R-02): Friction breakdown by bucket
- Scenario & Stress (R-03): FX shock analysis
- Policy Compliance (R-04): Score 20% BREACH -- review failed rules
- Liquidity & Concentration (R-05): HHI concentration analysis
- Executive Briefing (R-06): Board-ready snapshot with radar chart

---

**Step 16 -- Review Controls & Alerts**

Click the **Controls & Alerts** top-level tab.

2 INFO alerts require attention:
1. 2 buckets suppressed below minimum trade threshold
2. Residual exposure (43.3%) exceeds 5% policy tolerance

Review the Pre-Execution Checklist on the right -- all 5 items are checked.

---

**Step 17 -- Export the Committee Pack**

Click the PDF button in the top-right export bar.

A PDF is generated client-side (via jsPDF) and downloaded to your browser default download location. The PDF includes the full Committee Pack.

Optionally:
- Excel: Download tabular data in spreadsheet format
- Audit: Download the full JSON audit bundle with SHA-256 hashes
- Brief: Download the Executive Briefing (R-06) as a standalone PDF

---

**Tutorial Complete.** You have successfully loaded a scenario, reviewed all 5 wizard steps, generated a deterministic hedge plan, explored all Committee Pack tabs, and exported the results.


---

## APPENDIX

### Appendix A -- Glossary

| TERM | DEFINITION |
|------|------------|
| AP | Accounts Payable -- the entity owes foreign currency to a counterparty. A net AP position requires buying USD / selling MXN to lock in the exchange rate. |
| AR | Accounts Receivable -- the entity is owed foreign currency. A net AR position requires selling USD / buying MXN forward. |
| All-in Rate | The total forward rate = Spot + Forward Points. This is the rate at which the NDF will settle. |
| Audit Bundle | A ZIP file containing the run metadata JSON, all 6 SHA-256 hashes, and the full trace log. Enables external verification of results. |
| Basis Points (bps) | 1 bps = 0.01% = 0.0001. Used to express spread costs. 5 bps = 0.05%. |
| Bucket | A calendar month period into which trades with settlement dates in that month are aggregated. Labeled YYYY-MM. |
| CALENDAR_MONTH | The bucketing mode where trades are grouped by the calendar month of their value_date. |
| Committee Pack | The complete output package produced by a hedge plan run, comprising all Execution Desk tabs and Committee Reports. |
| Confirmed | A trade position with high certainty of settlement, typically backed by a contract or invoice. Hedged at 80% ratio. |
| Coverage Ratio | The proportion of total commercial exposure that is covered by hedges. (Existing + New Action) / Total Exposure. |
| Deterministic | A computation that always produces the same output from the same inputs. All CurrencyFX runs are deterministic. |
| Evidence Trail | The right-side panel on the input page showing the provenance of the current dataset and snapshot. |
| Forecast | A trade position with lower certainty -- expected but not yet contracted. Hedged at 50% ratio. |
| Forward Points | The premium or discount of the forward rate vs the spot rate for a given tenor. Additive: FWD = Spot + Points. |
| FWD | Deliverable Forward -- a foreign exchange forward contract with physical settlement (actual currency exchange at maturity). |
| Gate Check | The three mandatory conditions that must all pass before the engine can be run: exposure loaded, snapshot present, no critical errors. |
| HHI | Herfindahl-Hirschman Index -- measures concentration of exposure across buckets. Higher HHI = more concentrated. |
| INT Score | Integrity Score, 0-100. Measures the data quality and completeness of the loaded dataset. 100 = fully clean. |
| NDF | Non-Deliverable Forward -- a cash-settled FX forward. No physical currency exchange; only the net P&L at maturity settles in USD. Standard for EM currencies with capital controls. |
| Net Exposure | AP minus AR for a currency. Positive = net AP (entity owes more than it receives). Negative = net AR. |
| Notional | The face value of a trade or hedge instrument in local currency. |
| Pipeline | The three-stage workflow: Sandbox -> Staging -> Ledger. |
| Policy | The configuration file defining how the hedge engine behaves: ratios, product, bucketing mode, minimum size. |
| Residual Exposure | The commercial exposure remaining unhedged after the hedge plan is executed. |
| Run ID | A UUID v4 uniquely identifying a completed computation run. |
| SHA-256 | A cryptographic hash function. Used to create tamper-evident fingerprints of all 6 input/output datasets. |
| Snapshot | The point-in-time capture of market data (spot rate + forward curve) used for a computation. Locked at run time. |
| Spot Rate | The current exchange rate for immediate delivery. USD/MXN: how many MXN per 1 USD. |
| Tenor | The time to maturity of a forward contract, expressed as a calendar month. |
| Trace ID | The identifier for the computation trace log stored in the audit system. |
| V-Code | A validation code (V-001 through V-021) identifying a specific data quality issue. |


---

### Appendix B -- Keyboard Shortcuts & Navigation Tips

| ACTION | METHOD |
|--------|--------|
| Navigate to CurrencyFX input | Click CurrencyFX module card from terminal selector, or navigate to /currency-fx |
| Load a dataset | Click any fixture card in the Dataset Selector |
| Switch steps | Click any step tab in the 5-step wizard navigation |
| Generate hedge plan | Click Generate Hedge Plan button (Ctrl+Enter not implemented in v1.0) |
| Return to input page | Click New Calculation button on results page header, or navigate back |
| Copy trade ticket | Click Copy Ticket button on any trade ticket card |
| Open IBKR | Click Open in IBKR button on any trade ticket card |
| Download audit | Click Audit button in results page export bar |
| Navigate pipeline | Click Sandbox / Staging / Ledger in the pipeline breadcrumb |

---

### Appendix C -- Integration Notes -- Pipeline Architecture

CurrencyFX operates within a three-stage pipeline:

**Sandbox (hedgecore.vercel.app/currency-fx)**
The calculation workspace. All hedge plans are generated here. Runs are not committed to any permanent record. The analyst can run unlimited scenarios, switch datasets, change policies, and generate multiple Committee Packs. The Sandbox label appears in the top-right corner of the page.

**Staging (hedgecore.vercel.app/staging)**
When a hedge plan in Sandbox is approved for review, it is promoted to Staging. The Staging area holds plans awaiting CFO or Risk Officer sign-off. Plans in Staging are read-only -- no further computation is performed. In the demo environment, Staging is accessible but populated with demo data.

**Ledger (hedgecore.vercel.app/ledger)**
The Ledger is the final immutable archive. Once a plan is approved from Staging, it moves to the Ledger and cannot be modified. The Ledger serves as the compliance record for all executed hedge plans, with full audit trail and cryptographic attestation intact.

**Pipeline Navigation:**
The breadcrumb Sandbox > Staging > Ledger in the top navigation bar allows direct navigation between pipeline stages. The currently active stage is highlighted (underlined). The top-right label (SANDBOX) indicates the current stage.

---

*End of CurrencyFX Operator Manual v1.0*  
*HedgeCalc Engine v1.0.0 | February 2026*  
*Classification: Internal Use -- For institutional demonstration purposes only*
