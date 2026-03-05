---

# Hedge Terminal — Institutional FX Risk Infrastructure
## Product Guide v1.0

**Classification:** INTERNAL — Institutional Use Only
**Document ID:** HT-PG-2026-001
**Effective Date:** February 2026
**Review Cycle:** Quarterly
**Owner:** Risk Technology — Hedge Terminal Division

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-02-18 | Risk Technology Team | Initial release — stable demo |

---

## Table of Contents

1. [Executive Overview](#1-executive-overview)
2. [Getting Started](#2-getting-started)
3. [CurrencyFX Module — Core Workflow](#3-currencyfx-module--core-workflow)
4. [Committee Pack — Results Dashboard](#4-committee-pack--results-dashboard)
5. [Portfolio Risk Module](#5-portfolio-risk-module)
6. [Polisophic Module — Geopolitical Intelligence](#6-polisophic-module--geopolitical-intelligence)
7. [HedgeWiki — Governance Knowledge Base](#7-hedgewiki--governance-knowledge-base)
8. [Pipeline Architecture (Tri-State Governance)](#8-pipeline-architecture-tri-state-governance)
9. [API Reference](#9-api-reference)
10. [Security & Compliance](#10-security--compliance)
11. [Design System](#11-design-system)
12. [Glossary](#12-glossary)
13. [Support & Contact](#13-support--contact)

---

## 1. Executive Overview

### 1.1 Platform Purpose
Hedge Terminal is an institutional-grade FX risk management infrastructure platform designed for treasury operations, risk committees, and portfolio managers. It provides deterministic hedge construction, multi-scenario stress analysis, and audit-ready committee documentation within a single integrated workflow.

### 1.2 Design Philosophy
- Deterministic computation (no ML black boxes — every output is traceable)
- Committee-grade documentation at every step
- IFRS 9, ASC 815, and IAS 39 compliance awareness
- Zero-touch export for external audit systems

### 1.3 Platform Architecture
- Frontend: Next.js 15 (React 19) — institutional dark terminal UI
- Backend: Python FastAPI on Render — deterministic hedge computation engine
- Deployment: Vercel (frontend) + Render (backend API)
- Authentication: Cookie-backed session with demo credentials
- URL: https://hedgecore.vercel.app

---

## 2. Getting Started

### 2.1 Authentication
- Navigate to https://hedgecore.vercel.app
- The system redirects to the Auth Gateway
- Enter credentials: username `demo` / password `demo`
- Click "Initialize Session"
- On success, redirects to the Terminal Selector

### 2.2 Terminal Selector
After login, users land on the Module Selection screen. Four modules are available:

1. **CurrencyFX** — Treasury cash-flow ingestion and policy-constrained hedge sizing. Status: LIVE
2. **Portfolio Risk** — Multi-asset exposure decomposition and deterministic hedge construction. Status: LIVE
3. **Polisophic** — Macro-policy and geopolitical intelligence console. Status: LIVE
4. **HedgeWiki** — Canonical governance layer and institutional audit playbooks. Status: LIVE

System Posture panel shows: Engine v1.0.0, PRODUCTION environment, DEMO auth mode, Backend CONNECTED.

### 2.3 Navigation
- Top bar shows: Sandbox (active) | Staging (coming soon) | Ledger (coming soon)
- Pipeline stages represent the tri-state governance model: Sandbox → Staging → Ledger
- Sign Out available from terminal selector identity bar

---

## 3. CurrencyFX Module — Core Workflow

This is the primary module. The workflow is: Input → Calculate → Committee Pack.

### 3.1 Input Page — Data Entry (5-Step Wizard)

The input page follows a structured 5-step wizard pattern with a progress bar at the top.

**Step 1: Exposure Entry (Trade Book)**
- Enter trade exposures (AP = accounts payable, AR = accounts receivable)
- Fields: Record ID, Entity, Type (AP/AR), Currency, Amount, Value Date, Status (CONFIRMED/FORECAST), Description
- Supports manual entry via modal or CSV upload
- CSV format: record_id, entity, type, currency, amount, value_date, status, description

**Step 2: Existing Hedges**
- Enter existing hedge positions
- Fields: Hedge ID, Instrument (NDF/FWD), Direction (SELL_MXN_BUY_USD / BUY_MXN_SELL_USD), Notional, Value Date, Status (ACTIVE/LOCKED/MATURED)
- Supports manual entry or CSV upload

**Step 3: Market Data**
- Market snapshot fields: As-Of timestamp, Spot rate, Forward points by month
- Provider metadata: source, data class, currency pair, primary currency

**Step 4: Policy Configuration**
- Bucket Mode: CALENDAR_MONTH
- Hedge Ratios: Confirmed (default 80%), Forecast (default 50%)
- Cost Assumptions: Spread in basis points (default 5.0 bps)
- Execution Product: NDF (Non-Deliverable Forward) or FWD (Deliverable Forward)
- Minimum Trade Size: USD amount (default 500,000)
- Policy presets available for quick configuration

**Step 5: Authorization & Generate**
- Governance strip shows validation status
- "Generate Hedge Plan" button sends data to backend engine
- On success, navigates to Results page (Committee Pack)

### 3.2 Dataset Selector (Demo Fixtures)

10 pre-built scenario datasets are available, organized in two groups:

**MXN / Latin America:**
- F01: Balanced Corporate (Mixed AP/AR, MXN, Manufacturing) — LatAm Corp
- F02: Importer Heavy AP (Mexico manufacturing, USD/MXN) — MexImport SA
- F03: Exporter Heavy AR (USD/MXN) — MexExport Global
- F04: Volatile Market Stress (USD/MXN, elevated curve, 21.40 spot)
- F09: Emerging Market Multi-Tenor (MXN, 4-month ladder)

**Global Currencies:**
- F05: European Subsidiary (EUR/USD, German manufacturer, BavariaGmbH)
- F06: Brazilian Real (BRL/USD, commodities, AgroExport Brasil)
- F07: British Pound (GBP/USD, fintech, LondonFin Plc)
- F08: Japanese Yen (JPY/USD, electronics, TechNippon KK)
- F10: Multi-currency exposure (Swiss Franc CHF, risk-off)

Each dataset includes a complete Demo Story with: Company name, Industry, Geographic exposure, Problem statement, Risk description, Financial impact without hedge, Objective, and Resolution.

### 3.3 Backend Computation Engine (13-Step Kernel)

When "Generate Hedge Plan" is clicked, the backend runs a 13-step deterministic computation:

1. Input deserialization and normalization
2. Currency pair detection and base currency determination
3. Temporal bucketing (calendar month aggregation)
4. Net exposure calculation per bucket (AP minus AR)
5. Existing hedge overlay and netting
6. Gap analysis (uncovered exposure per bucket)
7. Policy application (confirmed/forecast ratio enforcement)
8. Forward rate interpolation from curve
9. New hedge ticket generation (notional, rate, dates)
10. Cost estimation (spread × notional)
11. Scenario stress testing (4 scenarios: base, adverse, severe, extreme)
12. Validation (21 codes: V-001 through V-021)
13. Run envelope generation (SHA-256 hash, timestamp, engine version)

### 3.4 Validation System

21 validation codes (V-001 to V-021) covering:
- Input completeness (missing fields, invalid dates)
- Policy compliance (ratio breaches, minimum trade violations)
- Market data quality (stale data, missing forward points)
- Hedge integrity (expired hedges, direction mismatches)

Statuses: PASS (all checks clear), WARNING (non-blocking), FAIL (blocking issues)

---

## 4. Committee Pack — Results Dashboard

The results page produces a committee-grade hedge plan with three top-level modules:

### 4.1 Execution Desk

Contains 5 sub-tabs:

**Tab 1: Committee Summary (Overview)**
- Run identity: Run ID, timestamp, engine version
- Total gross exposure, net exposure, hedge coverage ratio
- Bucket-by-bucket coverage table
- Scenario impact summary (base/adverse/severe/extreme)
- Validation status badge (PASS/WARNING/FAIL)
- Waterfall integrity score (0–100, computed from 8 rule blocks)

**Tab 2: Exposure & Buckets**
- Temporal bucket breakdown (calendar month)
- Gross AP vs AR per bucket
- Net exposure per bucket
- Existing hedge coverage overlay
- Residual (uncovered) exposure per bucket
- ECharts bar chart visualization

**Tab 3: Scenario Analysis (Risk)**
- 4-scenario stress test results:
  - Base: current market rates
  - Adverse: moderate depreciation
  - Severe: significant depreciation
  - Extreme: tail-risk event
- P&L impact per scenario
- VaR and CVaR metrics
- Hedge effectiveness under stress
- ECharts scenario comparison charts

**Tab 4: Trade Tickets (Execution)**
- Deterministic execution tickets generated by the engine
- Each ticket includes: Ticket ID, currency pair, direction, notional, forward rate, value date, counterparty bucket
- Ready for straight-through processing (STP)
- Tickets are policy-constrained (respect minimum trade size, hedge ratios)

**Tab 5: Audit Evidence**
- Run envelope with cryptographic integrity
- SHA-256 hash of inputs + outputs
- Engine version, timestamp
- Full input snapshot (trades, hedges, market, policy)
- Validation report with all 21 codes
- Designed for external auditor consumption

### 4.2 Committee Reports

6 report categories with ECharts visualizations:

1. **R-01 Coverage & Residual** — Hedge coverage ratios vs policy targets per bucket. Stacked bar charts showing covered vs uncovered exposure.

2. **R-02 Cost & Slippage** — Total hedge cost breakdown. Spread cost per bucket. Cost as percentage of notional. Basis point analysis.

3. **R-03 Scenario & Stress** — Multi-scenario P&L waterfall. ECharts waterfall chart showing incremental impact from base through extreme scenarios.

4. **R-04 Policy Compliance** — Compliance check matrix against configured policy. Green/amber/red traffic-light indicators per bucket per rule.

5. **R-05 Liquidity & Concentration** — Bucket concentration analysis. Single-bucket exposure limits. Tenor distribution. Radar chart visualization.

6. **R-06 Executive Briefing** — AI-generated narrative summary. Board-ready language. Key risk metrics in plain English. Recommended actions. Auto-generated from computation results.

Each report section includes:
- Collapsible header with report number and title
- "What this means" explanation text
- "Guidance" bullet points
- Export buttons (PDF, CSV)
- ECharts interactive charts (donut, radar, bar, waterfall, stacked)

### 4.3 Controls & Alerts (Notifications)

- Validation alerts from the 21-code system
- Errors (blocking), Warnings (advisory)
- Alert count badge on tab
- Each alert shows: code, severity, message, affected field/bucket

### 4.4 Export System

Four client-side export formats:

1. **Committee Pack PDF** — Full multi-page PDF with all tabs rendered. Uses jsPDF + html2canvas. Includes header, footer, timestamp, run ID.

2. **Executive Brief PDF** — One-page executive summary. Key metrics, recommendation, risk posture. Board-presentation ready.

3. **Audit JSON** — Machine-readable audit package. Run envelope, inputs, outputs, validation report, hash chain. For integration with audit management systems.

4. **Data Export (Excel/CSV)** — Tabular data export of all buckets, tickets, scenarios. For further analysis in Excel or BI tools.

Export bar appears in results header with dropdown for format selection.

### 4.5 Back Navigation
- "← New Calculation" link returns to input page for fresh data entry
- Committee Pack preserves in context for the session

---

## 5. Portfolio Risk Module

Multi-asset exposure decomposition and risk factor analysis across 8 institutional risk dimensions.

### 5.1 Risk Decomposition (R1–R8)

The Portfolio Risk module decomposes total portfolio risk into 8 orthogonal dimensions:

| Code | Dimension | Description |
|------|-----------|-------------|
| R1 | Delta Risk | First-order FX rate sensitivity. Net delta per currency pair. |
| R2 | Vega Risk | Implied volatility surface sensitivity. Material for option books. |
| R3 | Gamma Risk | Second-order delta. Convexity profile. Material in option-heavy books. |
| R4 | Theta / Carry | Time decay and forward-point carry cost. |
| R5 | Correlation Risk | Cross-currency correlation breakdown. Oil-MXN correlation driver. |
| R6 | Credit / Counterparty | CVA on outstanding positions. SA-CCR across bank counterparties. |
| R7 | Liquidity Risk | Unwind cost under stress. MXN NDF liquid to 12M. 5-day horizon. |
| R8 | Tail / Event Risk | Fat-tail risk via historical simulation and expected shortfall. |

### 5.2 Position Book
Position inventory showing:
- Physical positions (export receivables, payables)
- Derivative positions (NDF hedges by tenor)
- Delta exposure per position
- Status: CONFIRMED, ACTIVE, FORECAST

### 5.3 Four-Tab Layout
1. **Risk Matrix** — Full R1–R8 decomposition table with VaR 99%, CVaR 99%, exposure, hedge ratio, residual, regime indicator
2. **Positions** — Position book with mark-to-market
3. **Stress Testing** — Scenario grid with portfolio-level P&L
4. **Governance** — Risk limits, breach alerts, committee thresholds

---

## 6. Polisophic Module — Geopolitical Intelligence

Macro-policy and geopolitical intelligence console for regime monitoring, constraint setting, and strategic risk oversight.

### 6.1 Risk Event Feed
Live feed of geopolitical and macroeconomic risk events:
- Each event has: Event ID, timestamp, source, region, category, headline, raw signal, impact assessment, severity score (0–100), confidence score, alert trigger status
- Categories: CENTRAL BANK, SANCTIONS, FISCAL, TRADE, POLITICAL
- Regions: MEX, USA, EUR, ASIA, GLOBAL

Example events in the system:
- "Banxico holds rate at 10.25%; signals two cuts in H1 2026" — Severity 72, Confidence 91
- "New secondary sanctions designations targeting energy sector" — Severity 85, Confidence 97
- "Mexico revises 2026 deficit target to 4.1% of GDP" — Severity 61, Confidence 88
- "FOMC minutes show persistent hawkish dissent" — Severity 78, Confidence 95
- "US-Mexico auto tariff negotiation breakdown" — Trade category
- "Nearshoring FDI acceleration" — Positive signal

### 6.2 Policy Regime Engine
Constraint framework mapping geopolitical events to portfolio risk parameters:
- Rate regime monitoring (dovish/hawkish signals)
- Sanctions screening (counterparty risk)
- Fiscal stability indicators
- Trade policy alerts
- FDI flow analysis

### 6.3 Four-Tab Layout
1. **Event Feed** — Chronological risk event timeline with severity-colored badges
2. **Regime Map** — Geographic risk map with regime indicators
3. **Constraints** — Active policy constraints derived from events
4. **Impact Analysis** — How events map to portfolio risk dimensions (R1–R8)

---

## 7. HedgeWiki — Governance Knowledge Base

Canonical governance layer defining taxonomy, control logic, lifecycle mapping, and institutional audit playbooks.

### 7.1 Three-Pane Layout
- Left: Category sidebar with domain filters
- Center: Article list (filterable, searchable)
- Right: Article detail with full content

### 7.2 Knowledge Domains (6 categories)

**FX Instruments** (4 articles)
- Non-Deliverable Forward (NDF) — v2.3
- FX Swap — v1.8
- Vanilla FX Option (European) — v1.5
- Cross-Currency Swap (CCS) — v1.2

**Legal & ISDA** (3 articles)
- ISDA Netting — v2.1
- CSA (Credit Support Annex) — v1.6
- Master Confirmation Agreement — v1.3

**Accounting — IFRS** (4 articles)
- IFRS 9 Effectiveness Testing — v2.0
- IFRS 9 Cash Flow Hedge (CFH) Designation — v1.8
- Fair Value Hedge (FVH) Accounting — v1.4
- IAS 39 Legacy Provisions — v1.1

**Accounting — US GAAP** (2 articles)
- ASC 815-20 — v1.5
- ASC 815-30 — v1.3

**HedgeCalc Policy** (3 articles)
- Hedge Ratio Policy — v1.7
- Bucket Mode Configuration — v1.4
- Minimum Trade Size — v1.2

**HedgeCalc Engine** (4 articles)
- Exposure Model — v2.0
- Netting Engine — v1.9
- Bucketing Algorithm — v1.6
- Tenor Ladder Construction — v1.3

### 7.3 Article Structure
Each article contains:
- Title, version, last updated date
- Category and status (STABLE / DRAFT / DEPRECATED / REVIEW)
- Abstract (detailed technical description)
- Citations (ISDA, IFRS, ASC, BIS references)
- Linked articles (cross-references)
- HedgeCore field mapping (which API field relates)
- Audit note (compliance considerations)

### 7.4 Total Coverage
20 articles across 6 domains, all version-controlled with citation chains to authoritative sources (ISDA 2006 Definitions, IFRS 9, ASC 815, BIS Triennial Survey, FX Global Code 2021).

---

## 8. Pipeline Architecture (Tri-State Governance)

The platform implements a tri-state governance pipeline for institutional hedge workflow:

### 8.1 Sandbox (Active)
- Exploratory analysis and "what-if" modeling
- No audit trail commitment
- Full read-write access to all parameters
- Snapshots are ephemeral

### 8.2 Staging (Coming Soon)
- Pre-commit review state
- Committee review and approval workflow
- Immutable snapshot with change tracking
- Dual-authorization requirement

### 8.3 Ledger (Coming Soon)
- Final committed state
- Cryptographic audit envelope
- Immutable record
- External audit system integration
- Full SHA-256 hash chain

---

## 9. API Reference

### 9.1 Base URL
- Production: https://hedgecore.onrender.com/api
- API Version: v1

### 9.2 Authentication
- API Key: Header `X-API-Key`
- Demo key: `HC_DEV_KEY_001`

### 9.3 Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/calculate | Run hedge computation engine |
| POST | /v1/upload/trades/csv | Upload trade book via CSV |
| POST | /v1/upload/hedges/csv | Upload hedge book via CSV |
| GET | /v1/export/pdf/{run_id} | Export Committee Pack PDF |
| GET | /v1/export/excel/{run_id} | Export data as Excel |
| GET | /v1/export/zip/{run_id} | Export full audit package |
| GET | /v1/health | Health check |
| GET | /api/docs | OpenAPI documentation |

### 9.4 Calculate Request Schema
```json
{
  "trades": [TradeRow],
  "hedges": [HedgeRow],
  "market": MarketSnapshot,
  "policy": PolicyConfig
}
```

### 9.5 Calculate Response Schema
The response includes:
- `run_id`: Unique identifier (UUID)
- `run_envelope`: Timestamp, engine version, SHA-256 hash
- `buckets`: Array of BucketResult (per-month breakdown)
- `new_hedges`: Array of generated execution tickets
- `scenario_analysis`: 4-scenario stress test results
- `validation_report`: Status + array of validation items
- `waterfall_score`: Integrity score (0–100)
- `summary`: Aggregate metrics

---

## 10. Security & Compliance

### 10.1 Transport Security
- TLS 1.3 encryption on all connections
- HTTPS enforced on both Vercel and Render

### 10.2 CORS Policy
- Allowed origins: hedgecore.vercel.app, localhost:3000
- Credentials supported
- Pre-flight OPTIONS handling

### 10.3 API Key Authentication
- All API calls require valid X-API-Key header
- Rate limiting: 60 requests per minute

### 10.4 Audit Trail
- Every calculation produces a SHA-256 hash envelope
- Run ID, timestamp, engine version recorded
- Full input/output snapshot preserved
- Designed for SOX, IFRS 9, and Basel III audit requirements

### 10.5 Session Management
- Cookie-backed authentication
- Session key: `access_token`
- Auto-redirect on session expiry

---

## 11. Design System

### 11.1 Visual Identity
- Dark institutional terminal aesthetic (Bloomberg/Aladdin inspired)
- Background: #0A0E12 (deep), #111722 (panel), #141821 (sub)
- Accent: Cyan (#06B6D4), Amber (#F59E0B), Blue (#3B82F6)
- Typography: IBM Plex Sans (UI), IBM Plex Mono (data/labels)
- Uppercase monospace labels for institutional feel
- Zero border-radius (sharp edges throughout)

### 11.2 Component Library
- Status badges: LIVE (green dot + border), UNDER CONSTRUCTION (amber)
- Identity bars with session metadata
- Collapsible report sections with numbered headers
- ECharts interactive charts (waterfall, donut, radar, stacked bar)
- Modal dialogs for data entry
- Toast notifications for system feedback
- Sticky action bars for primary CTAs

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| AP | Accounts Payable — outgoing payment obligation |
| AR | Accounts Receivable — incoming payment right |
| NDF | Non-Deliverable Forward — cash-settled FX forward |
| FWD | Deliverable Forward — physical delivery FX forward |
| Bucket | Temporal aggregation period (calendar month) |
| Committee Pack | Comprehensive hedge analysis documentation |
| Run Envelope | Cryptographic container with hash, timestamp, version |
| Hedge Ratio | Target coverage percentage (confirmed vs forecast) |
| Waterfall Score | Integrity metric (0–100) from 8 rule blocks |
| CVaR | Conditional Value at Risk (Expected Shortfall) |
| VaR | Value at Risk at 99% confidence |
| SA-CCR | Standardized Approach for Counterparty Credit Risk |
| CSA | Credit Support Annex (ISDA collateral agreement) |
| IFRS 9 | International Financial Reporting Standard for Financial Instruments |
| ASC 815 | US GAAP Accounting Standard for Derivatives and Hedging |

---

## 13. Support & Contact

- Platform URL: https://hedgecore.vercel.app
- API Documentation: https://hedgecore.onrender.com/api/docs
- Status: All systems operational
- Demo Access: username `demo` / password `demo`

---

**END OF DOCUMENT**

*This document is intended for use as a NotebookLM source. It provides comprehensive coverage of all platform features, workflows, and technical specifications for the Hedge Terminal institutional FX risk management platform.*
