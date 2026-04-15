# Treasury Suite Phase 2e — Auto-Reconciliation Engine

## Goal

Automatically match imported bank transactions against settlement events and journal entries using exact-match rules. Surface unmatched/ambiguous transactions as exceptions for manual review.

## Architecture

One pure-function matching engine (`reconciliation_engine.py`) that takes bank transactions and candidate records, returns exact matches. One service layer (`reconciliation_service.py`) that orchestrates: load unmatched transactions, load candidates from settlement_events and journal_entries, run engine, persist matches, audit-log. One route file for triggering reconciliation runs and querying results. Two new columns on `bank_transactions` (matched FKs). One migration. Follows Phase 2a–2d patterns: AsyncMock unit tests, tenant-scoped JOINs, `dashboardFetch`-based frontend, WORM audit trail via existing `cash_audit_events`.

No new tables. No new frontend page — reconciliation results surface via the existing `/v1/cash/statements/transactions` endpoint which already returns `reconciliation_status`.

## Tech Stack

Python 3.12, FastAPI, SQLAlchemy 2.x async, Alembic raw SQL migration.

---

## 1. Data Model Changes

### 1.1 BankTransaction modifications (ALTER TABLE)

Add two nullable FK columns to `bank_transactions`:

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| matched_settlement_id | UUID | FK→settlement_events, nullable | Set when matched against a settlement event |
| matched_journal_id | UUID | FK→journal_entries, nullable | Set when matched against a journal entry |

**Constraint:** CHECK that at most one of `matched_settlement_id` and `matched_journal_id` is non-null. A bank transaction matches at most one source.

**Status transitions:**
- `UNMATCHED` → `MATCHED`: when engine or manual match applies a match (one of the FK columns set)
- `UNMATCHED` → `EXCEPTION`: when manually flagged for review
- `MATCHED` → `UNMATCHED`: when unmatched (FK cleared, status reset)

### 1.2 ORM Model Update

Add two columns to `BankTransaction` in `backend/app/models/bank_statement.py`:

```python
matched_settlement_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
matched_journal_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
```

### 1.3 Audit Event Type

Add to `CashAuditEventType` enum:

```
RECONCILIATION_RUN
```

### 1.4 Pydantic Schema Update

Add `matched_settlement_id` and `matched_journal_id` to `BankTransactionResponse` in `backend/app/schemas_v1/cash.py`.

---

## 2. Reconciliation Engine (Pure Function)

File: `backend/app/services/reconciliation_engine.py`

Same isolation pattern as `netting_engine.py` and `forecast_engine.py` — zero DB access, zero side effects, fully deterministic.

### Input

```python
def find_matches(
    transactions: list[dict],   # unmatched bank transactions
    settlements: list[dict],    # candidate settlement events
    journals: list[dict],       # candidate journal entries
) -> list[dict]:                # matched pairs
```

Each transaction dict has: `id`, `amount` (absolute), `currency`, `tx_date`, `value_date`, `direction`, `reference`.

Each settlement dict has: `id`, `settlement_amount`, `currency`, `settlement_date`, `value_date`, `settlement_ref`.

Each journal dict has: `id`, `amount`, `currency`, `period_date`, `description`.

### Matching Rules (All-or-Nothing Exact)

1. **Settlement match**: `abs(tx.amount) == settlement.settlement_amount` AND `tx.currency == settlement.currency` AND (`tx.tx_date == settlement.settlement_date` OR `tx.tx_date == settlement.value_date`) AND exactly one candidate meets all criteria.
2. **Journal match**: `abs(tx.amount) == journal.amount` AND `tx.currency == journal.currency` AND `tx.tx_date == journal.period_date` AND exactly one candidate meets all criteria.

**Priority:** Settlement matches are checked first. If a transaction matches a settlement, journal matching is skipped for that transaction.

**Ambiguity handling:** If multiple candidates match a single transaction on all fields, the transaction is omitted from output (stays UNMATCHED — no false positives).

### Output

```python
[
    {
        "transaction_id": UUID,
        "match_type": "SETTLEMENT" | "JOURNAL",
        "matched_id": UUID,
        "match_fields": {"amount": Decimal, "currency": str, "date": date},
    },
]
```

---

## 3. Service Layer

File: `backend/app/services/reconciliation_service.py`

### Functions

| Function | Purpose |
|----------|---------|
| `run_reconciliation(session, company_id, account_id?, performed_by)` | Load UNMATCHED transactions, load candidate settlements + journals, run engine, apply matches, audit-log. Returns summary stats. |
| `get_reconciliation_summary(session, company_id)` | Aggregate stats: total transactions, matched, unmatched, exception counts. |
| `manual_match(session, transaction_id, company_id, match_type, matched_id, performed_by)` | Manually match a single transaction to a settlement or journal entry. |
| `mark_exception(session, transaction_id, company_id, performed_by)` | Flag a transaction as EXCEPTION for manual review. |
| `unmatch(session, transaction_id, company_id, performed_by)` | Revert a MATCHED transaction back to UNMATCHED (clears FK, resets status). |

### Candidate Loading

Settlements and journals are scoped by `company_id` and filtered to those not already referenced by another bank transaction's `matched_settlement_id` / `matched_journal_id`. Date range narrowed to `min(tx_date) - 7 days` to `max(tx_date) + 7 days` of the unmatched transactions to avoid loading full history.

### Flush Pattern

Service calls `session.flush()`, routes call `await db.commit()`.

---

## 4. API Routes

File: `backend/app/api/routes/v1_cash_reconciliation.py`
Prefix: `/v1/cash/reconciliation`

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/run` | Trigger reconciliation run (optional `account_id` query param) | write role |
| GET | `/summary` | Reconciliation summary stats | professional |
| POST | `/match` | Manual match (body: `transaction_id`, `match_type`, `matched_id`) | write role |
| POST | `/exception/{transaction_id}` | Flag transaction as exception | write role |
| POST | `/unmatch/{transaction_id}` | Revert match back to unmatched | write role |

### Pydantic Schemas

Append to `backend/app/schemas_v1/cash.py`:

- `ReconciliationRunResponse` — matched_count, exception_count, unmatched_remaining
- `ReconciliationSummary` — total_transactions, matched, unmatched, exceptions, match_rate_pct
- `ManualMatchRequest` — transaction_id, match_type ("SETTLEMENT" | "JOURNAL"), matched_id

---

## 5. Migration

File: `backend/migrations/versions/0025_reconciliation_fks.py`

- ALTER TABLE bank_transactions ADD COLUMN matched_settlement_id UUID
- ALTER TABLE bank_transactions ADD COLUMN matched_journal_id UUID
- ADD CHECK constraint: at most one non-null
- No new tables

---

## 6. Testing

| File | Tests | Type |
|------|-------|------|
| `test_reconciliation_engine.py` | Exact settlement match, exact journal match, no-match skip, multi-candidate ambiguity skip, settlement priority over journal, empty inputs | Pure function (no DB, no async) |
| `test_reconciliation_service.py` | run_reconciliation applies matches, manual_match, mark_exception, unmatch | AsyncMock |
| `test_v1_reconciliation_routes.py` | POST /run, GET /summary, POST /match | httpx AsyncClient |
