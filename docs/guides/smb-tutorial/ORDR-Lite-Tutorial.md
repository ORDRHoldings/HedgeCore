# ORDR Terminal Lite -- SMB User Tutorial

**Product**: ORDR Terminal (Lite Edition)
**Client**: Pollo Import Co -- Mexican Chicken Import/Export
**Currency Pair**: USD/MXN
**Plan**: SMB Lite | Solo Mode
**Version**: 1.0.0 | March 2026

---

## Table of Contents

1. [Login](#1-login)
2. [Dashboard Overview](#2-dashboard-overview)
3. [Position Desk -- View Your Exposures](#3-position-desk)
4. [Ingestion -- Add a New Position](#4-ingestion)
5. [Hedge Execution -- Run the Pipeline](#5-hedge-execution)
6. [FX Markets -- Monitor Rates](#6-fx-markets)
7. [Settings -- Configure Your Account](#7-settings)
8. [Complete Workflow -- End-to-End Example](#8-complete-workflow)

---

## 1. Login

**URL**: `https://ordr-terminal.vercel.app`

When you navigate to the ORDR Terminal, you are greeted by the institutional login screen.

![Login Page](screenshots/01-login-blank.jpg)

### Fields

| Field | Description |
|-------|-------------|
| **Terminal ID** | Your assigned username (e.g., `MXN001`) |
| **Access Key** | Your password (minimum 12 characters) |

### Steps

1. Enter your **Terminal ID**: `MXN001`
2. Enter your **Access Key**: your assigned password
3. Click **ESTABLISH LINK**

![Login Filled](screenshots/02-login-filled.jpg)

After successful authentication, you are redirected to the **Dashboard**.

### Security Badges

At the bottom of the login screen you will see four security badges:
- **AES-256** -- Military-grade encryption
- **Hash-Chained Audit** -- Tamper-evident audit trail
- **RBAC** -- Role-based access control
- **4-Eyes Approval** -- Dual-approval governance

---

## 2. Dashboard Overview

After login, you land on the **ORDR Lite Dashboard** -- a streamlined view designed for single-currency operations.

![SMB Dashboard](screenshots/03-dashboard.jpg)

### Header Bar

- **ORDR LITE** badge -- Confirms you are on the SMB Lite plan
- **Pollo Import Co** -- Your company name
- **Navigation tabs**: Dashboard, Position Desk, Policy Engine, Hedge Execution, Markets, Settings
- **User info**: Your name, role badge (SENIOR_ANALYST), branch code (MXC)
- **ORDR TERMINAL / LIVE** -- System status indicator

### KPI Cards (Top Row)

| Card | Description |
|------|-------------|
| **MXN Exposure** | Total notional exposure in USD equivalent. Shows `$0` when no positions are loaded. |
| **Hedge Coverage** | Percentage of exposure that is hedged. Target is set in your policy. Shows `0%` initially. |
| **Open Positions** | Count of active FX exposure positions. |
| **Pending** | Number of items requiring your action (approvals, reviews). |

### USD/MXN Rate Card (Middle Left)

Displays the live USD/MXN exchange rate with:
- **Current rate** (mid)
- **BID** -- Price at which you can sell USD
- **ASK** -- Price at which you can buy USD
- **SPREAD** -- Difference between bid and ask

### Quick Actions (Middle Right)

Four shortcut buttons for common tasks:

| Button | Action |
|--------|--------|
| **Add Position** | Jump to the Ingestion page to enter a new MXN exposure |
| **Run Hedge Calc** | Navigate to the Hedge Execution pipeline |
| **View Positions** | Open the Position Desk to see all exposures |
| **Approve Pending** | Review and execute pending items |

### Recent Activity (Bottom)

Shows your last 5 actions (position entries, calculations, approvals). Initially displays "No recent activity yet."

### Footer

`ORDR Lite - Solo Mode - USD/MXN` -- Confirms your plan tier, governance mode, and currency pair.

---

## 3. Position Desk

**Navigation**: Position Desk > Position Desk (from dropdown)

The Position Desk is your **central control tower** for all FX exposure positions.

![Position Desk](screenshots/04-position-desk.jpg)

### Pipeline Breadcrumb

At the top you see the 3-stage pipeline:
```
POSITION DESK > POLICY DESK > EXECUTION DESK
```

### Status Filter Tabs

| Tab | Description |
|-----|-------------|
| **ALL** | Every position regardless of status |
| **NEEDS ACTION** | Positions requiring your attention (no policy, pending approval) |
| **NEW** | Freshly ingested positions |
| **POLICY ASGND** | Positions with a hedge policy assigned |
| **READY** | Positions ready for hedge execution |
| **HEDGED** | Fully hedged positions |
| **REJECTED** | Positions you have rejected |

### Table Columns

| Column | Description |
|--------|-------------|
| **Record ID** | Your reference number (e.g., POLLO-001) |
| **Entity** | Company or counterparty name |
| **CCY** | Currency code (MXN for your positions) |
| **Amount** | Notional amount in the position currency |
| **Status** | Current lifecycle status (NEW, POLICY_ASSIGNED, READY, HEDGED, REJECTED) |
| **Policy ID** | Assigned hedge policy (if any) |
| **Run ID** | Calculation run reference |
| **Value Date** | Settlement/maturity date |
| **Flow** | Cash flow direction (AP = Accounts Payable, AR = Accounts Receivable) |
| **Actions** | Available actions (ASSIGN POLICY, REJECT, etc.) |

### Actions Available

- **ASSIGN POLICY** -- Attach a hedge policy template to this position
- **REJECT** -- Remove this position from the pipeline

---

## 4. Ingestion -- Add a New Position

**Navigation**: Position Desk > Ingestion (tab at top-left) OR Dashboard > Quick Actions > Add Position

The Ingestion page is where you **manually enter FX exposure positions** or import them via CSV.

![Ingestion Page](screenshots/05-ingestion-form.jpg)

### Entry Form Fields

| Field | Description | Example |
|-------|-------------|---------|
| **Record ID** | Your internal reference number | `POLLO-001` |
| **Entity** | Company or counterparty | `Pollo Import Co` |
| **Flow Type** | AP (Accounts Payable) or AR (Accounts Receivable) | `AP - Accounts Payable` |
| **Currency** | The foreign currency of the exposure | `MXN - Mexican Peso` |
| **Amount (MXN)** | The notional amount | `500,000` |
| **Value Date** | When the payment is due (maturity) | `2026-06-30` |
| **Status** | Position confirmation status | `CONFIRMED` |
| **Description** | Optional note | `Q2 chicken feed purchase` |

### How to Add a Position

1. Fill in the **Record ID** (your internal reference)
2. Enter the **Entity** name
3. Select the **Flow Type** (AP for payments you owe, AR for payments you receive)
4. Verify the **Currency** is MXN
5. Enter the **Amount** in MXN
6. Click the **Value Date** field to open the date picker

![Date Picker](screenshots/06-date-picker.jpg)

7. Navigate to the desired month using the arrow buttons and click the date
8. The summary line at the bottom shows: `AP - MXN - 500,000 - 2026-06`

![Form Complete](screenshots/07-form-complete.jpg)

9. Click **+ ADD POSITION**

### After Adding

The position appears in the table below the form:

![Position Added](screenshots/08-position-added.jpg)

You will see:
- The position row with all details
- **VALIDATION: PASS** in the header (data integrity check passed)
- **GATE CHECK: ALL GATES PASSED** at the bottom
- A link to **PROCEED TO EXECUTION DESK**

### Status Bar

The header bar updates to show:
- **TRADES: 1** -- Number of positions loaded
- **HEDGES: 0** -- No hedges calculated yet
- **VALIDATION: PASS** -- Data integrity verified
- **INT 100/100** -- Integrity score

---

## 5. Hedge Execution

**Navigation**: Hedge Execution > Hedge Desk (from dropdown)

The Hedge Desk is where you **run the hedge calculation pipeline** to determine optimal hedging for your positions.

![Hedge Desk](screenshots/09-hedge-desk.jpg)

### Execution Pipeline Steps

The pipeline follows 6 sequential stages:

```
01 SELECT > 02 CALCULATE > 03 RISK > 04 REVIEW > 05 EXECUTE > 06 COMPLETE
```

| Step | Description |
|------|-------------|
| **SELECT** | Choose which positions to include in this hedge run |
| **CALCULATE** | Engine computes optimal hedge instruments and ratios |
| **RISK** | Risk metrics are evaluated (VaR, Greeks, stress tests) |
| **REVIEW** | Review the proposed hedge before execution |
| **EXECUTE** | Confirm and execute the hedge |
| **COMPLETE** | Hedge is recorded in the ledger |

### Pipeline Breadcrumb

```
POSITION DESK > POLICY DESK > EXECUTION DESK
```

### Solo Mode Badge

In the top-right corner you will see **SOLO MODE** -- this means you operate without 4-eyes approval (no maker/checker workflow). You can approve your own hedges.

### Eligible Positions

The selection table shows positions with status **POLICY_ASSIGNED** or **READY_TO_EXECUTE**. If no positions have policies assigned, you will see:

> **NO ELIGIBLE POSITIONS**
> No positions with POLICY_ASSIGNED or READY_TO_EXECUTE status found.
> Go to the Position Desk to import positions and assign policies.

### Hedge Monitor

**Navigation**: Hedge Execution > Hedge Monitor (from dropdown)

The Hedge Monitor provides live monitoring of:
- Mark-to-Market P&L
- Hedge effectiveness
- Roll schedule
- Regulatory capital

---

## 6. FX Markets

**Navigation**: Markets > FX Rates (from dropdown)

The FX Markets page provides **live exchange rate data** powered by Finnhub and TradingView.

![FX Markets](screenshots/10-fx-markets.jpg)

### Left Panel -- Major Pairs

A watchlist of major currency pairs:
- EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD, NZD/USD
- **USD/MXN** -- Your primary pair (highlighted when selected)
- USD/BRL, EUR/GBP, EUR/JPY

### Center Panel -- TradingView Chart

When you click **USD/MXN** in the left panel, the main area shows:
- **Interactive candlestick chart** with full TradingView functionality
- Timeframe selectors: 1m, 30m, 1h, D (daily)
- Chart type options (candlestick, line, area)
- Technical indicators
- OHLC data: Open, High, Low, Close, Change

### Bottom Panel -- Rate Details

| Field | Description |
|-------|-------------|
| **CURRENT** | Latest mid-rate |
| **OPEN** | Session opening rate |
| **PREV CLOSE** | Previous session close |
| **HIGH** | Session high |
| **LOW** | Session low |
| **CHANGE** | Absolute and percentage change |

### Tags

- **LIVE** -- Real-time data feed active
- **FINNHUB** -- Data source identifier

---

## 7. Settings

**Navigation**: Settings (from top nav)

The Settings page allows you to configure your account and organizational preferences.

![Settings Page](screenshots/11-settings.jpg)

### Available Tabs

| Tab | Description |
|-----|-------------|
| **General** | Organisation name, branch label, base currency, timezone, fiscal year |
| **Policy Limits** | Hedge ratio limits, tenor constraints, notional caps |
| **Execution** | Execution parameters, slippage tolerance |
| **API & Config** | API configuration keys |
| **Notifications** | Alert preferences and channels |
| **Security** | Password policy, session timeout, MFA settings |
| **Users & Roles** | User management and role assignments |
| **API Keys** | Generate and manage API access keys |
| **Organisation** | Company structure (branches, departments) |
| **Audit Trail** | View tamper-evident audit log |

### General Tab (Default)

**Organisation Identity:**
- Organisation Name
- Branch / Entity Label (shown on reports)
- Reporting Base Currency (USD)
- Timezone (America/New_York)
- Fiscal Year Start (January)

**Report Branding:**
- Report Footer Text (appears on all generated reports)
- Logo Upload (PNG/SVG for report covers and PDF headers)

---

## 8. Complete Workflow -- End-to-End Example

Here is the complete workflow for hedging a chicken feed purchase from Mexico:

### Scenario

> Pollo Import Co needs to pay a Mexican supplier **500,000 MXN** for chicken feed,
> due on **June 30, 2026**. They want to hedge the USD/MXN exchange rate risk.

### Step 1: Login

1. Go to `https://ordr-terminal.vercel.app`
2. Enter Terminal ID: `MXN001`
3. Enter Access Key: your password
4. Click **ESTABLISH LINK**

### Step 2: Add the Position

1. From the Dashboard, click **Add Position** in Quick Actions
2. Fill in the form:
   - Record ID: `POLLO-001`
   - Entity: `Pollo Import Co`
   - Flow Type: `AP - Accounts Payable` (you are paying MXN)
   - Currency: `MXN - Mexican Peso`
   - Amount: `500,000`
   - Value Date: `2026-06-30`
   - Status: `CONFIRMED`
3. Click **+ ADD POSITION**
4. Verify the position appears in the table with status **NEW**

### Step 3: Check FX Rate

1. Navigate to **Markets > FX Rates**
2. Click **USD/MXN** in the left panel
3. Review the current exchange rate and recent trend
4. Note the current rate for reference (e.g., ~17.30 MXN per USD)

### Step 4: View Position in Position Desk

1. Navigate to **Position Desk > Position Desk**
2. Your position POLLO-001 appears with status **NEW**
3. The **NEEDS ACTION** tab shows 1 item

### Step 5: Assign Policy (Next Step)

1. Click **ASSIGN POLICY** on the position row
2. Select a hedge policy template (defines hedge ratio, instruments, tenor)
3. The position status changes to **POLICY_ASSIGNED**

### Step 6: Run Hedge Calculation

1. Navigate to **Hedge Execution > Hedge Desk**
2. Select the position in the SELECT step
3. Click **Calculate** to run the hedge engine
4. Review the proposed hedge in the REVIEW step
5. Click **Execute** to confirm

### Step 7: Monitor

1. Return to the **Dashboard** to see updated KPIs
2. MXN Exposure and Hedge Coverage will reflect the new hedge
3. Check **Recent Activity** for the audit trail

---

## Navigation Map (SMB Lite)

```
Dashboard
  |
  +-- Position Desk
  |     +-- Position Desk (lifecycle control tower)
  |     +-- Ingestion (manual entry + CSV import)
  |
  +-- Policy Engine
  |     +-- Policy Desk (assign policies to positions)
  |
  +-- Hedge Execution
  |     +-- Hedge Desk (6-step execution pipeline)
  |     +-- Hedge Monitor (live P&L, effectiveness)
  |
  +-- Markets
  |     +-- FX Rates (live spot, TradingView charts)
  |
  +-- Settings
        +-- General, Policy Limits, Execution, API & Config,
            Notifications, Security, Users & Roles, API Keys,
            Organisation, Audit Trail
```

---

## Glossary

| Term | Definition |
|------|------------|
| **AP** | Accounts Payable -- money you owe (outgoing payment) |
| **AR** | Accounts Receivable -- money owed to you (incoming payment) |
| **Hedge** | A financial instrument that offsets exchange rate risk |
| **Notional** | The face value amount of a position or hedge |
| **Value Date** | The date when a payment is due or a contract settles |
| **Policy** | A set of rules defining how positions should be hedged |
| **Tenor** | The time period until a position or hedge matures |
| **Solo Mode** | Governance mode where one user can approve their own actions |
| **WORM** | Write Once Read Many -- audit records cannot be modified |
| **Gate Check** | Validation that all prerequisites are met before proceeding |

---

## Support

- **System Status**: Check the ORDR TERMINAL indicator (top-right) -- green dot means LIVE
- **Help Panel**: Click the **? HELP** button on the right side of any page
- **Version**: Engine v1.0.0 | Deterministic calculations

---

*ORDR Terminal Lite -- Institutional FX Hedge Governance*
*2026 Synexiun. All rights reserved.*
