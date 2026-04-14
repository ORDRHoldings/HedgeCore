# ORDR Treasury Suite — Complete Design Specification

**Date:** 2026-04-13  
**Status:** APPROVED (rev 3 — spec review fixes applied)  
**Author:** ORDR Edge  
**Supersedes:** n/a  
**Related ADRs:** 0009, 0010, 0011, 0012, 0013, 0014 (to be written)

---

## 1. Executive Summary

ORDR Terminal evolves from a specialist FX hedge calculation tool into a **full institutional treasury operating system**. The platform closes the two existing gaps (upstream ERP exposure capture, downstream GL journal posting) and expands into cash & liquidity management, multi-entity consolidation, and a plan-gated AI add-on tier — all without disrupting the existing architecture freeze on `engine_v1/`.

**Delivery model:** Three independent phases, each shippable standalone.  
**Target users:** Mid-market corporates ($50M–$1B revenue) through large enterprises ($1B+), served by tiered feature gating.  
**AI policy:** Core platform is fully rule-based and deterministic. AI is an optional premium add-on (`INTELLIGENCE` plan tier). No AI can approve, execute, or write to WORM tables.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORDR TREASURY SUITE                          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  FX LIFECYCLE│  │ CASH & LIQD  │  │   AI ADD-ON TIER     │  │
│  │  (Phase 1)   │  │  (Phase 2)   │  │   (Phase 3, opt-in)  │  │
│  │              │  │              │  │                       │  │
│  │ • GL posting │  │ • Bank stmts │  │ • ML forecasting      │  │
│  │ • ERP pull   │  │ • Cash pool  │  │ • NLP treasury query  │  │
│  │ • Settlement │  │ • ST forecast│  │ • AI report draft     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬────────────┘  │
│         │                 │                      │               │
│  ┌──────▼─────────────────▼──────────────────────▼────────────┐  │
│  │              TREASURY DATA PLATFORM                         │  │
│  │  Unified entity model · Multi-company · Hash-chained audit  │  │
│  └────────────────────────┬────────────────────────────────────┘  │
│                           │                                     │
│  ┌───────────────┬─────────▼──────────┬───────────────────────┐  │
│  │  ERP / GL     │   BANK CONNECTIVITY │   COMPLIANCE ENGINE   │  │
│  │  Connectors   │   File + API        │   Regulatory bundles  │  │
│  └───────────────┴────────────────────┴───────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Immutable Constraints

- `engine_v1/` remains frozen. New modules sit alongside, never inside it.
- WORM tables (`audit_events`, `calculation_runs`, `policy_revisions`, `ledger_entries`) remain append-only.
- Hash chain integrity (SHA-256, per-tenant, GENESIS_HASH) applies to all new WORM tables.
- Middleware order: Audit → Rate Limit → Auth. Unchanged.
- AI outputs are advisory only. No AI writes to any persistent record without human approval.

---

## 3. Phase 1 — FX Lifecycle Complete (~6 sprints)

### 3.1 Outbound GL Journal Entry Generation

**Problem:** `engine_v1/hedge_accounting.py` generates journal entries internally but nothing exposes them as postable records.

**Solution:** Wire the engine output to a new WORM `journal_entries` table and push to connected accounting systems via the existing connector framework.

#### Data Model

```python
class JournalEntry(Base):
    __tablename__ = "journal_entries"
    id: UUID (PK)
    company_id: UUID (FK → companies, indexed)
    run_id: UUID (FK → hedge_effectiveness_runs, nullable)
    ledger_entry_id: UUID (FK → ledger_entries, nullable)
    settlement_event_id: UUID (FK → settlement_events, nullable)
    entry_type: Enum[OCI_RECOGNITION, PNL_RECLASSIFICATION,
                     INEFFECTIVENESS, SETTLEMENT_VARIANCE,
                     FAIR_VALUE_CHANGE]
    standard: Enum[IFRS_9, ASC_815, IAS_39]
    debit_account: String(64)   # chart-of-accounts ref
    credit_account: String(64)
    amount: Numeric(20,6)
    currency: String(3)
    base_amount: Numeric(20,6)  # converted to company base currency
    base_currency: String(3)
    fx_rate_used: Numeric(20,8)
    period_date: Date
    description: String(512)
    status: Enum[DRAFT, PENDING_APPROVAL, APPROVED, POSTED, REJECTED]
    posted_at: DateTime
    posted_to: String(64)        # ERP system identifier
    posted_ref: String(128)      # ERP-assigned journal ID
    entry_hash: String(128)      # SHA-256(company_id + entry_type + standard +
                                 #   debit_account + credit_account + amount +
                                 #   currency + period_date + created_at)
    prev_entry_hash: String(128) # hash of previous JournalEntry for this
                                 # company_id (GENESIS = 64 zeros per tenant)
    created_at: DateTime
    created_by: UUID
```

WORM semantics: no UPDATE, no DELETE. Status transitions only.

**Hash chain mechanics:** `prev_entry_hash` is the `entry_hash` of the most recent `JournalEntry` for the same `company_id`. On first record per tenant, `prev_entry_hash = GENESIS_HASH` (64 zeros). This is a separate chain from `TreasuryTransaction` — every posted journal entry also appends a `TreasuryTransaction` record (type `JOURNAL_ENTRY`) creating a cross-reference, but the two chains are independent. ADR-0009 governs this design.

#### GL Account Mapping (prerequisite — Sprint 56, Step 0)

Before any journal entry can be generated, tenants must configure their chart-of-accounts mapping. This is a hard prerequisite for Sprint 56 and must ship first.

```python
class GLAccountMapping(Base):
    __tablename__ = "gl_account_mappings"
    id: UUID (PK)
    company_id: UUID (indexed)
    entry_type: Enum[OCI_RECOGNITION, PNL_RECLASSIFICATION,
                     INEFFECTIVENESS, SETTLEMENT_VARIANCE, FAIR_VALUE_CHANGE]
    standard: Enum[IFRS_9, ASC_815, IAS_39]
    debit_account: String(64)    # chart-of-accounts code
    credit_account: String(64)
    account_label: String(256)   # human-readable description
    erp_system: String(32)       # QB | XERO | NETSUITE | SAGE | MANUAL
    created_by: UUID
    created_at: DateTime
    updated_at: DateTime
    updated_by: UUID             # FK → users — required for full audit trail
```

`GET/POST /v1/gl/account-mappings` — tenant manages their mapping.
`JournalEntry.generate()` raises `GLMappingNotConfiguredError` if mapping missing — never creates a record with blank accounts.
Frontend: `/settings/gl-accounts` — account mapping editor, launched in Sprint 56 Step 0.

#### API Routes

```
POST /v1/gl/journal-entries/generate/{run_id}
     → calls hedge_accounting.py, creates JournalEntry records (DRAFT)
     → raises GLMappingNotConfiguredError if account mapping absent

GET  /v1/gl/journal-entries
     → list with filters: status, period, standard, entity

POST /v1/gl/journal-entries/{entry_id}/approve
     → 4-eyes: requires approver ≠ creator (SoD enforced)
     → status: PENDING_APPROVAL → APPROVED

POST /v1/gl/journal-entries/{entry_id}/reject
     → 4-eyes: requires reviewer ≠ creator (SoD enforced)
     → status: PENDING_APPROVAL → REJECTED
     → body: { "reason": String } (required)
     → entry remains in table (WORM — rejection recorded, not deleted)

POST /v1/gl/journal-entries/{entry_id}/post
     → pushes to connected accounting system, updates status → POSTED

GET  /v1/gl/journal-entries/{entry_id}/preview
     → returns formatted entry before posting

GET  /v1/gl/export
     → bulk CSV/XML export for manual SAP import
```

#### ERP Posting Adapters

```
GLPostingService
  ├── QuickBooksPoster   → QBO Journal Entry API
  ├── XeroPoster         → Xero Manual Journals API
  ├── NetSuitePoster     → SuiteScript REST Journal Entry
  └── CSVExporter        → Generic CSV/XML for SAP, Oracle manual import
```

Each adapter implements `post(entry: JournalEntry) → PostingResult`. Failures are logged but never silently swallowed — posting errors surface in the `/gl-postings` dashboard.

**New ADR:** 0009 — Outbound GL Journal Entry Posting

---

### 3.2 Live ERP Exposure Capture

**Problem:** FX exposures (AR/AP invoices in foreign currency) must be manually uploaded via CSV. This is the single biggest operational friction.

**Solution:** Activate scheduled pulls from connected ERP/accounting systems using the existing connector framework.

#### ERP Pull Pipeline

```
Scheduler (per-tenant, configurable: hourly / daily / on-demand)
        │
        ▼
GET /v1/connectors/erp/pull/{connector_id}
        │
ERP Adapter
  ├── NetSuiteAdapter  → REST: /record/v1/invoice (foreign currency filter)
  ├── XeroAdapter      → GET /Invoices (CurrencyCode ≠ base)
  ├── QuickBooksAdapter→ GET /query?entity=Invoice (foreign currency)
  └── SageAdapter      → GET /arinvoices (multicurrency)
        │
        ▼
Deduplication: hash(source_system + source_ref + amount + date)
        │
Auto-create Position records (status: PENDING_REVIEW)
        │
Notification: "14 new FX exposures detected — review required"
```

Positions created from ERP pulls are tagged `source: ERP_PULL` and `source_ref` with the ERP invoice ID. Users review and promote to `ACTIVE` before hedging — no automatic hedging without human review.

#### Auto-Detection Notification

New notification type: `EXPOSURE_DETECTED`
- In-app alert on `/position-desk`
- Webhook event: `exposure.detected` (existing webhook framework)
- Email digest (configurable: immediate / daily summary)

---

### 3.3 Settlement Tracking

**Problem:** Once a hedge executes and reaches maturity, there is no mechanism to track actual settlement, compare against the hedged rate, or record the P&L variance.

**Solution:** New WORM `settlement_events` table extending `ledger_entries`.

#### Data Model

```python
class SettlementEvent(Base):
    __tablename__ = "settlement_events"
    id: UUID (PK)
    ledger_entry_id: UUID (FK → ledger_entries, indexed, unique)
    company_id: UUID (FK → companies, indexed)
    hedge_rate: Numeric(20,8)       # rate at execution
    actual_rate: Numeric(20,8)      # rate at settlement
    hedge_amount: Numeric(20,6)
    settlement_amount: Numeric(20,6)
    rate_variance: Numeric(20,8)    # actual - hedge
    pnl_impact: Numeric(20,6)       # (actual - hedge) × amount
    settlement_date: Date
    value_date: Date
    settlement_ref: String(128)     # bank/broker confirmation ref
    status: Enum[PENDING, CONFIRMED, FAILED, RECONCILED, DISPUTED]
    reconciled_at: DateTime
    reconciled_by: UUID
    notes: Text
    event_hash: String(128)
    created_at: DateTime
```

#### API Routes

```
GET  /v1/settlement/pending          → hedges past value_date, not yet settled
POST /v1/settlement/confirm/{ledger_entry_id}
     → status: PENDING → CONFIRMED (single user action)
     → creates JournalEntry (DRAFT, status=DRAFT) — NOT auto-approved
     → journal entry still requires separate 4-eyes approval via
       POST /v1/gl/journal-entries/{entry_id}/approve before posting
GET  /v1/settlement/reconciliation-report?period=...
GET  /v1/settlement/variance-report  → P&L impact by period
```

Settlement confirmation creates a journal entry in **DRAFT** status only. The 4-eyes SoD gate (approver ≠ creator) on `POST /v1/gl/journal-entries/{entry_id}/approve` is always required before any journal entry can be posted to the ERP — regardless of how the draft was generated. This applies uniformly to all entry types: effectiveness runs, settlement variances, and fair value changes.

---

### 3.4 Phase 1 Frontend Pages

| Page | Purpose |
|------|---------|
| `/gl-postings` | Journal entry queue, approve/post actions, ERP sync log |
| `/settlement` | Pending settlements, confirmation workflow, reconciliation |
| `/erp-sync` | Live ERP pull status, detected exposures pending review |

---

## 4. Phase 2 — Cash & Liquidity Management (~10 sprints)

### 4.1 Bank Statement Import & Reconciliation

#### Supported Formats

| Format | Standard | Coverage |
|--------|----------|----------|
| MT940 | SWIFT legacy | European banks, universal |
| CAMT.053 | ISO 20022 | Modern banks, replacing MT940 |
| BAI2 | US banking | BoA, JPMorgan, Wells Fargo |
| Open Banking / PSD2 | EU/UK API | Premium tier — real-time |
| Plaid | US API | Premium tier — mid-market US |

#### Data Models

```python
class BankAccount(Base):
    __tablename__ = "bank_accounts"
    id: UUID (PK)
    company_id: UUID
    entity_id: UUID (FK → treasury_entities)
    bank_name: String(128)
    account_number: String(64)   # masked
    iban: String(34)
    swift_bic: String(11)
    currency: String(3)
    account_type: Enum[CURRENT, SAVINGS, MONEY_MARKET, INVESTMENT]
    connectivity_type: Enum[FILE_UPLOAD, OPEN_BANKING, PLAID, SWIFT_GPI]
    is_active: Boolean
    created_at: DateTime

class BankStatement(Base):
    __tablename__ = "bank_statements"
    id: UUID (PK)
    account_id: UUID (FK → bank_accounts)
    company_id: UUID
    statement_date: Date
    opening_balance: Numeric(20,6)
    closing_balance: Numeric(20,6)
    currency: String(3)
    format: Enum[MT940, CAMT053, BAI2, API]
    source_hash: String(128)    # deduplication
    import_run_id: UUID (FK → connector_runs)
    created_at: DateTime

class BankTransaction(Base):
    __tablename__ = "bank_transactions"
    id: UUID (PK)
    statement_id: UUID (FK → bank_statements)
    account_id: UUID
    company_id: UUID
    tx_date: Date
    value_date: Date
    amount: Numeric(20,6)
    currency: String(3)
    direction: Enum[DEBIT, CREDIT]
    description: String(512)
    reference: String(128)
    counterparty: String(256)
    tx_code: String(16)         # SWIFT/BAI2 transaction code
    reconciliation_status: Enum[UNMATCHED, MATCHED, EXCEPTION]
    # Explicit nullable FKs per source type — no polymorphic bare UUID
    matched_settlement_id: UUID (FK → settlement_events, nullable)
    matched_journal_id: UUID (FK → journal_entries, nullable)
    matched_position_id: UUID (FK → positions, nullable)
    # Only one of the above should be non-null per matched transaction
    created_at: DateTime
```

#### Reconciliation Engine

Auto-matches bank transactions against:
1. Settlement events (exact amount + date + currency + ref)
2. Journal entries (amount + period + account)
3. Position records (ERP-sourced, by invoice ref)

Unmatched transactions surface in `/bank-accounts` as exceptions requiring manual review.

---

### 4.2 Cash Pool & Multi-Entity Visibility

```python
class TreasuryEntity(Base):
    __tablename__ = "treasury_entities"
    id: UUID (PK)
    company_id: UUID
    name: String(256)
    entity_type: Enum[SUBSIDIARY, BRANCH, FUND, HOLDING, SPV]
    base_currency: String(3)
    country_code: String(2)
    erp_ref: String(128)        # NetSuite/Xero entity ID
    parent_entity_id: UUID      # nullable — for entity hierarchy
    created_at: DateTime

class CashPool(Base):
    __tablename__ = "cash_pools"
    id: UUID (PK)
    company_id: UUID
    name: String(256)
    pool_type: Enum[NOTIONAL, PHYSICAL, ZBA]
    header_account_id: UUID (FK → bank_accounts)
    currency: String(3)
    base_currency: String(3)
    is_active: Boolean
    created_at: DateTime

class CashPoolMember(Base):
    __tablename__ = "cash_pool_members"
    id: UUID (PK)
    pool_id: UUID (FK → cash_pools)
    account_id: UUID (FK → bank_accounts)
    entity_id: UUID (FK → treasury_entities)
    participation_type: Enum[FULL, PARTIAL]
```

**Consolidated cash dashboard** (`/cash-management`):
- Total liquidity by currency (FX-converted to base)
- Cash pool waterfall per entity
- Days cash on hand (rolling 30d average)
- Intercompany netting opportunities (auto-detected)
- Concentration risk (% of cash in single bank / single currency)

---

### 4.3 Short-Term Cash Flow Forecasting (Rule-Based)

Fully deterministic. No ML. Uses only committed / known future events.

#### Forecast Sources (automatic)

| Source | Data | Horizon |
|--------|------|---------|
| Hedge maturities | `LedgerEntry.value_date` | Exact dates |
| Open FX positions | `Position.exposure_date` | Exact dates |
| ERP AR/AP | Connector pull + payment terms | Rolling |
| Recurring items | User-defined rules | Indefinite |
| Settlement events | Confirmed value dates | Exact dates |

#### Forecast Engine

```
Rolling 13-week (weekly buckets):
  Week 0: Opening balance (from latest bank statement)
  Week N: Opening(N) + Inflows(N) - Outflows(N) = Closing(N)

Rolling 12-month (monthly buckets):
  Same logic, monthly granularity

For each bucket:
  ├── Base currency consolidated total
  ├── Per-currency breakdown
  ├── Confidence flag: COMMITTED | PROBABLE | POSSIBLE
  └── Liquidity gap flag: closing < threshold → RED alert

Variance tracking:
  Forecast(T-1) vs. Actual(T) from bank statements
  Stores forecast_vs_actual records for accuracy trending
```

#### API Routes

```
GET  /v1/cash/forecast/{entity_id}?horizon=13w|12m
GET  /v1/cash/forecast/consolidated
GET  /v1/cash/liquidity-gaps
POST /v1/cash/forecast/scenarios    { "receivables_shift": -0.20 }
GET  /v1/cash/forecast/variance     → forecast accuracy report
```

---

### 4.4 Payment Initiation (Enterprise + Premium Tier)

Paper payments first — same pattern as IBKR paper execution (ADR-0005).

```
POST /v1/payments/initiate
  ├── 4-eyes approval (SoD — maker ≠ checker, existing framework)
  ├── Beneficiary whitelist enforcement
  ├── Cut-off time check (per bank, per currency, per payment type)
  ├── Payment types: SEPA, SWIFT, ACH, CHAPS, FPS
  └── Paper mode: creates PaymentInstruction record, does NOT send

POST /v1/payments/{id}/approve      → promotes to APPROVED
POST /v1/payments/{id}/transmit     → live only on enterprise + direct API tier
```

**New ADR required:** 0010 (bank connectivity), 0011 (cash forecasting)

---

### 4.5 Phase 2 Frontend Pages

| Page | Purpose |
|------|---------|
| `/cash-management` | Multi-entity cash dashboard, pool waterfall |
| `/cash-forecast` | 13-week / 12-month waterfall, liquidity gap alerts |
| `/bank-accounts` | Account management, statement import, reconciliation |
| `/intercompany-netting` | Netting opportunity detection and approval |

---

## 5. Phase 3 — AI Add-On Tier (Optional, Plan-Gated)

### 5.1 Isolation Architecture

```
Module name: ordr-intelligence
Plan gate:   INTELLIGENCE tier
Per-tenant:  opt-in only (enable/disable per company)
RBAC:        intelligence.read, intelligence.configure

Core guarantee:
  All AI outputs are ADVISORY.
  No AI writes to WORM tables.
  No AI approves, executes, or modifies records.
  Human approval required on 100% of AI-suggested actions.
  AI suggestions logged to intelligence_query_log (non-WORM).
```

### 5.2 Capability A — ML Cash Flow Forecasting

Augments Phase 2 rule-based forecast with confidence bands.

- **Model:** Lightweight time-series (Prophet or equivalent), runs per-tenant
- **Training data:** Tenant's own historical bank transactions — never shared cross-tenant
- **Output:** Upper and lower confidence bands overlaid on rule-based base case
- **UI:** Toggle overlay on `/cash-forecast` — base case always visible regardless
- **Retraining:** Weekly, triggered by new bank statement import

### 5.3 Capability B — Natural Language Treasury Query

```
POST /v1/intelligence/query  { "q": "What is our EUR net exposure this quarter?" }

Implementation:
  1. Parse query intent (Claude API, Sonnet)
  2. Inject structured treasury context (tenant-scoped data only)
  3. Execute deterministic data query
  4. Return data + plain-English explanation

Security:
  Context injection uses only authenticated tenant's data.
  No cross-tenant data leakage by construction.
  All queries logged to intelligence_query_log with tenant_id.

Frontend: floating query bar (CMD+K / Ctrl+K)
  Appears on every page when INTELLIGENCE tier active.
  Results link to source records.
```

### 5.4 Capability C — AI Report Commentary Draft

```
Trigger: committee pack export, board report, effectiveness report
Output:  2–3 paragraph natural language commentary

Workflow:
  1. User generates report (existing flow, unchanged)
  2. "Draft AI commentary" button appears (INTELLIGENCE tier only)
  3. Draft inserted as editable text field in report
  4. Analyst reviews, edits, approves
  5. Export marks commentary: "AI-assisted, human-reviewed: [date] [user]"

Never auto-publishes.
Draft status visible in audit trail.
Regulatory citations (IFRS 9.6.4.1, ASC 815-20-25) auto-included.
```

**New ADR required:** 0012 — AI Add-on Tier Isolation & Advisory-Only Contract

---

## 6. Treasury Data Platform (Cross-Cutting)

### 6.1 Unified Treasury Transaction Spine

```python
class TreasuryTransaction(Base):
    __tablename__ = "treasury_transactions"
    id: UUID (PK)
    company_id: UUID (indexed)
    entity_id: UUID (FK → treasury_entities, nullable)
    tx_type: Enum[FX_HEDGE, SETTLEMENT, BANK_RECEIPT, BANK_PAYMENT,
                  INTERCOMPANY, JOURNAL_ENTRY, CASH_POOL_SWEEP]
    amount: Numeric(20,6)
    currency: String(3)
    base_amount: Numeric(20,6)
    base_currency: String(3)
    fx_rate: Numeric(20,8)
    value_date: Date
    source_module: Enum[FX_LIFECYCLE, CASH, GL, PAYMENT, SETTLEMENT]
    source_ref_id: UUID         # points to originating record
    source_ref_type: String(64) # e.g. "ledger_entries", "settlement_events"
    # Per-table SHA-256 hash chain (same pattern as audit_events)
    tx_hash: String(128)        # SHA-256(company_id + tx_type + amount +
                                #          currency + value_date + source_ref_id
                                #          + created_at) — created_at included
                                #          to prevent duplicate-entry collision
    prev_tx_hash: String(128)   # hash of previous TreasuryTransaction for
                                # this company_id (GENESIS = 64 zeros)
    created_at: DateTime
```

Every financial event in the platform appends to this table — it is the single queryable audit spine across all modules. Append-only (WORM semantics: no UPDATE, no DELETE triggers, same as `ledger_entries`).

**Hash chain mechanics:** `prev_tx_hash` is the `tx_hash` of the most recent `TreasuryTransaction` for the same `company_id`. On first record per tenant, `prev_tx_hash = GENESIS_HASH` (64 zeros). This is an independent chain from `audit_events` — the two chains are cross-referenced via `source_ref_id` pointing to the originating audit event, but they are not the same chain. ADR-0013 governs this design decision.

### 6.2 Multi-Entity Consolidation

```
GET /v1/treasury/consolidated
  → aggregates all entities for a company
  → FX-converts to base currency (latest market snapshot)
  → returns:
      net_fx_exposure_by_pair
      cash_position_by_entity
      hedge_coverage_ratio_by_entity
      intercompany_netting_opportunities[]

Intercompany netting engine:
  Detects: entity A owes entity B in same currency
  Suggests: net settlement (reduces external FX cost)
  Requires: 4-eyes approval (same SoD framework)
  Records: as TreasuryTransaction (INTERCOMPANY type)
```

Frontend: `/treasury/consolidated` — entity tree, cash heatmap, FX exposure map

**New ADR required:** 0013, 0014

### 6.3 Compliance Engine

```python
class ComplianceBundle(Base):
    __tablename__ = "compliance_bundles"
    id: UUID (PK)
    company_id: UUID
    bundle_type: Enum[IFRS7, DODD_FRANK, EMIR, MAS, SOX_TREASURY,
                      INTERNAL_POLICY]
    period_start: Date
    period_end: Date
    status: Enum[DRAFT, UNDER_REVIEW, APPROVED, FILED]
    payload: JSONB              # structured regulatory data
    generated_by: UUID
    generated_at: DateTime
    approval_chain: JSONB       # array of {approver_id, approved_at, notes}
    filed_at: DateTime
    filing_ref: String(128)
    bundle_hash: String(128)    # integrity verification
    created_at: DateTime
```

IFRS 7 bundle auto-populates from:
- Hedge effectiveness runs (existing)
- Journal entries (Phase 1)
- Settlement events (Phase 1)
- FX exposure by maturity bucket (existing engine)

Frontend: `/compliance-centre` — bundle builder, regulatory calendar, export

**Plan tier:** PROFESSIONAL and above. `ComplianceBundle` is purely rule-based — no AI dependency. It is delivered in Phase 2 (Sprint 71), not Phase 3. It is available without the INTELLIGENCE add-on.

---

## 7. Plan Tier Structure

| Tier | Modules | Target |
|------|---------|--------|
| STARTER | Core FX lifecycle (Phase 1 complete) | Small treasury teams |
| PROFESSIONAL | + Cash & Liquidity (Phase 2) | Mid-market corporates |
| ENTERPRISE | + Multi-entity, bank API, payments | Large corporates |
| INTELLIGENCE | + AI add-on (Phase 3) | Premium, opt-in |

Implementation: `require_plan_tier()` FastAPI dependency — existing pattern.

---

## 8. ADR Schedule

| ADR | Title | Phase | Priority |
|-----|-------|-------|----------|
| 0009 | Outbound GL Journal Entry Posting | 1 | Critical |
| 0010 | Bank Statement Import & Reconciliation | 2 | High |
| 0011 | Cash Flow Forecasting — Rule-Based Architecture | 2 | High |
| 0012 | AI Add-on Tier — Isolation & Advisory-Only Contract | 3 | Medium |
| 0013 | Treasury Data Platform — Unified Transaction Spine | Cross | Critical |
| 0014 | Multi-Entity Consolidation & Intercompany Netting | Cross | High |

---

## 9. Delivery Roadmap

### Phase 1 — FX Lifecycle Complete (~6 sprints / ~3 weeks)

| Sprint | Deliverable |
|--------|-------------|
| 56 | ADR-0009 + ADR-0013 · JournalEntry model + migration · GL generation route |
| 57 | GL approval workflow (4-eyes) · QuickBooks + Xero posting adapters |
| 58 | NetSuite posting adapter · CSV/XML export for SAP |
| 59 | ERP live pull adapters (NetSuite, Xero) · deduplication · auto-position creation |
| 60 | Settlement tracking model · confirm/reconcile routes · variance report |
| 61 | `/gl-postings` page · `/settlement` page · `/erp-sync` page · integration tests |

### Phase 2 — Cash & Liquidity (~10 sprints / ~5 weeks)

| Sprint | Deliverable |
|--------|-------------|
| 62 | **ADR-0010** (Bank Connectivity) · **ADR-0014** (Multi-Entity) · TreasuryEntity + BankAccount models |
| 63 | MT940 / CAMT.053 parser · BankStatement + BankTransaction models |
| 64 | BAI2 parser · statement import route · deduplication |
| 65 | Auto-reconciliation engine (settlement + journal entry matching) |
| 66 | CashPool model · multi-entity consolidation route |
| 67 | `/cash-management` dashboard · entity tree · pool waterfall |
| 68 | **ADR-0011** (Cash Flow Forecasting) · Cash flow forecast engine (13-week, rule-based) |
| 69 | 12-month forecast · liquidity gap detection · variance tracking |
| 70 | `/cash-forecast` page · waterfall chart · gap alerts |
| 71 | Payment initiation (paper mode) · `/bank-accounts` · `/intercompany-netting` |

### Phase 3 — AI Add-on (~parallel, ~8 sprints)

> **Note:** Sprint P3-2 (ML forecasting) has a hidden infrastructure dependency: a per-tenant model training pipeline, model artifact storage, and retraining triggers. This adds ~2 sprints of infrastructure work before the model can run. P3-2 is therefore split into P3-2a (infrastructure) and P3-2b (model + UI).

| Sprint | Deliverable |
|--------|-------------|
| P3-1 | ADR-0012 · INTELLIGENCE plan tier gate · opt-in per tenant |
| P3-2a | ML infrastructure: training pipeline, model artifact storage (S3/local), retraining trigger on new bank statement import |
| P3-2b | Prophet model integration · per-tenant training · confidence band overlay on `/cash-forecast` |
| P3-3 | NLP query endpoint · Claude API integration · tenant-scoped context injection |
| P3-4 | `/intelligence` query bar (frontend, CMD+K) · query log |
| P3-5 | AI commentary draft endpoint · report integration · "AI-assisted, human-reviewed" audit flag |
| P3-6 | Multi-provider integration: Open Banking (EU PSD2) + Plaid (US) direct API connectivity |
| P3-7 | SWIFT GPI tracking · real-time payment status · correspondent bank visibility |

> **Note:** ComplianceBundle and `/compliance-centre` are delivered in Phase 2, Sprint 71 — they are PROFESSIONAL+ tier, fully rule-based, and have no dependency on the INTELLIGENCE tier. P3-6/P3-7 above deliver the premium bank API connectivity originally scoped as "Enterprise+ tier" in Section 4.1.

---

## 10. What Is NOT In Scope (v1 of this Suite)

- Live broker execution (paper trading only — ADR-0005)
- Commodity hedging (FX only)
- Interest rate / debt management (future phase)
- Real-time FX trading / market making
- Direct SWIFT connectivity (file-based only in Phase 2 baseline)
- XBRL regulatory filing (compliance bundle export is PDF/JSON only)
- Cross-tenant AI model training (each tenant's AI uses only their own data)

---

## 11. Open Questions (for implementation)

1. Chart of accounts mapping: how does the user define which GL accounts map to `debit_account` / `credit_account` in `JournalEntry`? Suggest a per-tenant account mapping editor in `/settings/gl-accounts`.
2. Intercompany netting approval: does it require both entity treasury teams to approve, or only the parent entity?
3. Bank API connectivity (premium tier): which banks are prioritised for direct API integration first?
4. INTELLIGENCE tier pricing: separate line item or bundled with ENTERPRISE+?
