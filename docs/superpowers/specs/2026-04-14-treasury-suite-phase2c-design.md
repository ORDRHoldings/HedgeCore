# Treasury Suite Phase 2c — Intercompany Netting

## Goal

Detect, propose, and execute intercompany netting settlements to reduce external FX costs. Supports both manually entered obligations and auto-detected intercompany flows from tagged forecast items.

## Architecture

Two new DB models (`IntercompanyObligation`, `NettingProposal`), one column addition to `CashForecastItem`, one pure-function netting engine, one service layer, one route file, Pydantic schemas, one frontend page, and sidebar nav entry. Follows Phase 2a/2b patterns: AsyncMock unit tests, tenant-scoped JOINs through `LegalEntity`, `dashboardFetch`-based frontend, WORM audit trail via existing `cash_audit_events`, 4-eyes SoD approval via existing framework.

## Tech Stack

Python 3.12, FastAPI, SQLAlchemy 2.x async, Alembic raw SQL migration, Next.js 15 App Router, TypeScript 5, lucide-react, IBM Plex fonts.

---

## 1. Data Model

### 1.1 IntercompanyObligation (new table: `intercompany_obligations`)

Manually entered record of what one entity owes another within the same company.

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | UUID PK | DEFAULT gen_random_uuid() | |
| company_id | UUID NOT NULL | INDEX | Tenant scope |
| debtor_entity_id | UUID NOT NULL | FK→legal_entities | Entity that owes |
| creditor_entity_id | UUID NOT NULL | FK→legal_entities | Entity that is owed |
| amount | NUMERIC(20,6) NOT NULL | CHECK > 0 | Obligation amount |
| currency | VARCHAR(3) NOT NULL | | ISO 4217 |
| due_date | DATE NOT NULL | | When payment is due |
| reference | VARCHAR(255) | | Invoice/PO/contract reference |
| status | VARCHAR(16) NOT NULL | DEFAULT 'PENDING', CHECK IN ('PENDING','NETTED','SETTLED','CANCELLED') | Lifecycle state |
| created_by | UUID NOT NULL | | |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() | |
| updated_at | TIMESTAMPTZ NOT NULL | DEFAULT now() | |

**Constraint:** `debtor_entity_id != creditor_entity_id` (cannot owe yourself).

### 1.2 NettingProposal (new table: `netting_proposals`)

Groups matched obligations into a net settlement proposal requiring 4-eyes approval.

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | UUID PK | DEFAULT gen_random_uuid() | |
| company_id | UUID NOT NULL | INDEX | Tenant scope |
| status | VARCHAR(16) NOT NULL | DEFAULT 'DRAFT', CHECK IN ('DRAFT','PENDING_APPROVAL','APPROVED','EXECUTED','REJECTED') | 5-state machine |
| entity_a_id | UUID NOT NULL | | First entity in the bilateral pair |
| entity_b_id | UUID NOT NULL | | Second entity in the bilateral pair |
| currency | VARCHAR(3) NOT NULL | | Netting currency |
| gross_payable | NUMERIC(20,6) NOT NULL | | Total A→B before netting |
| gross_receivable | NUMERIC(20,6) NOT NULL | | Total B→A before netting |
| net_amount | NUMERIC(20,6) NOT NULL | | abs(gross_payable - gross_receivable) |
| net_direction | VARCHAR(4) NOT NULL | CHECK IN ('A2B','B2A') | Who pays whom after netting |
| savings | NUMERIC(20,6) NOT NULL | | min(gross_payable, gross_receivable) — amount avoided |
| obligation_ids | JSONB NOT NULL | | Array of obligation UUIDs included |
| proposed_by | UUID NOT NULL | | Maker |
| approved_by | UUID | | Checker (SoD: must differ from proposed_by) |
| proposed_at | TIMESTAMPTZ NOT NULL | DEFAULT now() | |
| approved_at | TIMESTAMPTZ | | |
| executed_at | TIMESTAMPTZ | | |

### 1.3 CashForecastItem modification

Add one nullable column:

| Column | Type | Purpose |
|--------|------|---------|
| counterparty_entity_id | UUID | When set, marks this forecast item as an intercompany flow. The netting engine auto-detects items where entity_id and counterparty_entity_id are both populated. |

### 1.4 Audit Event Types

Add to `CashAuditEventType` enum:

```
NETTING_PROPOSED
NETTING_APPROVED
NETTING_EXECUTED
```

---

## 2. Netting Engine (Pure Function)

File: `backend/app/services/netting_engine.py`

Same isolation pattern as `forecast_engine.py` — zero DB access, zero side effects, fully deterministic.

### Input

```python
def compute_netting(
    obligations: list[dict],  # {debtor_entity_id, creditor_entity_id, amount, currency, id}
) -> list[dict]:  # netting proposals
```

### Algorithm

1. Group obligations by `currency`
2. Within each currency, group by bilateral pair (normalize: sorted tuple of entity IDs)
3. For each pair+currency:
   - Sum amounts where entity_a is debtor → `gross_a_to_b`
   - Sum amounts where entity_b is debtor → `gross_b_to_a`
   - `net_amount = abs(gross_a_to_b - gross_b_to_a)`
   - `net_direction = "A2B" if gross_a_to_b > gross_b_to_a else "B2A"`
   - `savings = min(gross_a_to_b, gross_b_to_a)`
   - Collect all obligation IDs involved
4. Return proposals (skip pairs where savings == 0)

### Output

```python
[
    {
        "entity_a_id": UUID,
        "entity_b_id": UUID,
        "currency": "EUR",
        "gross_payable": Decimal,    # a→b total
        "gross_receivable": Decimal, # b→a total
        "net_amount": Decimal,
        "net_direction": "A2B" | "B2A",
        "savings": Decimal,
        "obligation_ids": [UUID, ...],
    },
]
```

---

## 3. Service Layer

File: `backend/app/services/netting_service.py`

### Functions

| Function | Purpose |
|----------|---------|
| `create_obligation(session, company_id, payload, created_by)` | Create manual intercompany obligation |
| `list_obligations(session, company_id, status_filter)` | List obligations (filterable by status) |
| `cancel_obligation(session, obligation_id, company_id)` | Cancel a pending obligation |
| `auto_detect_obligations(session, company_id)` | Scan CashForecastItems with counterparty_entity_id set; create obligations for any not already tracked |
| `generate_proposals(session, company_id, created_by)` | Gather PENDING obligations, run netting engine, create NettingProposal records, audit-log |
| `approve_proposal(session, proposal_id, company_id, approved_by)` | 4-eyes approval (SoD: approved_by != proposed_by) |
| `execute_proposal(session, proposal_id, company_id, executed_by)` | Mark obligations as NETTED, create TreasuryTransaction (type=INTERCOMPANY), audit-log |
| `get_savings_summary(session, company_id)` | Aggregate historical savings from executed proposals |

### SoD Enforcement

Same pattern as `bank_account_service.py` verify flow:
- `approved_by` must differ from `proposed_by`
- Check enforced in `approve_proposal()` before status transition

### TreasuryTransaction Integration

On execution, create a `TreasuryTransaction` record:
- `transaction_type = "INTERCOMPANY"`
- `amount = net_amount`
- `currency = currency`
- `metadata = {proposal_id, entity_a_id, entity_b_id, gross_payable, gross_receivable, savings}`

---

## 4. API Routes

File: `backend/app/api/routes/v1_cash_netting.py`
Prefix: `/v1/cash/netting`

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| GET | `/obligations` | List obligations | professional |
| POST | `/obligations` | Create obligation | write role |
| DELETE | `/obligations/{id}` | Cancel obligation | write role |
| GET | `/proposals` | List proposals | professional |
| POST | `/proposals/generate` | Run netting engine | write role |
| POST | `/proposals/{id}/approve` | 4-eyes approval | write role, SoD |
| POST | `/proposals/{id}/execute` | Execute netting | write role |
| GET | `/savings` | Historical savings summary | professional |

---

## 5. Pydantic Schemas

Append to `backend/app/schemas_v1/cash.py`:

- `ObligationCreate` — label, debtor_entity_id, creditor_entity_id, amount, currency, due_date, reference
- `ObligationResponse` — full obligation with status, entity names
- `NettingProposalResponse` — full proposal with gross/net/savings, entity names, status
- `NettingSavingsSummary` — total_savings, netting_count, savings_by_currency

---

## 6. Frontend

### 6.1 cashClient.ts extensions

Add interfaces and functions:
- `IntercompanyObligation`, `NettingProposal`, `NettingSavings` interfaces
- `listObligations`, `createObligation`, `cancelObligation`
- `listProposals`, `generateProposals`, `approveProposal`, `executeProposal`
- `getNettingSavings`

### 6.2 /intercompany-netting page

3-tab layout following Phase 2b pattern:

**OBLIGATIONS tab:**
- Table: debtor entity, creditor entity, amount, currency, due date, reference, status badge
- Add Obligation form (expandable)
- Cancel button on PENDING items

**PROPOSALS tab:**
- Table: entity pair, currency, gross payable, gross receivable, net amount, net direction arrow, savings (green), status
- "Generate Proposals" button (runs netting engine on all PENDING obligations)
- Approve/Reject buttons (SoD-aware: disabled if current user == proposed_by)
- Execute button (on APPROVED proposals)

**SAVINGS tab:**
- Summary cards: total savings, netting count, avg savings per netting
- Savings by currency breakdown table

### 6.3 AppSidebar

Add "Intercompany Netting" nav item in ACCOUNTING section after "Cash Forecast":
- Icon: `GitMerge` from lucide-react
- minTier: "professional"

---

## 7. Migration

File: `backend/migrations/versions/0023_intercompany_netting.py`

- CREATE TABLE intercompany_obligations (with CHECK constraints, indexes)
- CREATE TABLE netting_proposals (with CHECK constraints, indexes)
- ALTER TABLE cash_forecast_items ADD COLUMN counterparty_entity_id UUID

---

## 8. Testing

| File | Tests | Type |
|------|-------|------|
| `test_netting_engine.py` | Bilateral netting, multi-currency, no-savings skip, many-entity pairs | Pure function (no DB, no async) |
| `test_netting_service.py` | create_obligation, generate_proposals, SoD enforcement, execute creates TreasuryTransaction | AsyncMock |
| `test_v1_cash_netting_routes.py` | GET/POST obligations, generate proposals, approve, execute | httpx AsyncClient |
