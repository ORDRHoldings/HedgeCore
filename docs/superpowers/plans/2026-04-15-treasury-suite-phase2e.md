# Treasury Suite Phase 2e — Auto-Reconciliation Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically match imported bank transactions against settlement events and journal entries using exact-match rules, with manual match/exception/unmatch workflows.

**Architecture:** One pure-function matching engine (zero DB, zero side effects), one service layer (load candidates, run engine, persist matches, audit-log), one route file (5 endpoints), two new columns on `bank_transactions`, one migration. Follows Phase 2a–2d patterns: AsyncMock unit tests, tenant-scoped queries, WORM audit trail.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x async, Alembic raw SQL migration.

---

## Pre-Flight Checks

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
BANK_ACCOUNT_ENC_KEY="test-bank-enc-key-at-least-32-bytes-long!!" \
python -m pytest tests/ --override-ini="addopts=" -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
# Expected: ~4946 passed, 0 failed

cd frontend && npx tsc --noEmit
# Expected: no output (clean)
```

---

## File Map

**New backend files:**
| File | Responsibility |
|------|----------------|
| `backend/app/services/reconciliation_engine.py` | Pure-function matching engine — takes transaction/settlement/journal dicts, returns exact matches |
| `backend/app/services/reconciliation_service.py` | Orchestration: load candidates, run engine, persist matches, manual match/exception/unmatch |
| `backend/app/api/routes/v1_cash_reconciliation.py` | 5 endpoints under `/v1/cash/reconciliation/*` |
| `backend/migrations/versions/0025_reconciliation_fks.py` | ALTER TABLE: two nullable FK columns + CHECK constraint |
| `backend/tests/test_reconciliation_engine.py` | Pure-function engine tests |
| `backend/tests/test_reconciliation_service.py` | AsyncMock service tests |
| `backend/tests/test_v1_reconciliation_routes.py` | httpx AsyncClient route tests |

**Modified backend files:**
| File | Change |
|------|--------|
| `backend/app/models/bank_statement.py` | Add `matched_settlement_id`, `matched_journal_id` columns to `BankTransaction` |
| `backend/app/models/cash.py` | Add `RECONCILIATION_RUN` to `CashAuditEventType` enum |
| `backend/app/schemas_v1/cash.py` | Add 2 fields to `BankTransactionResponse`, add 3 new schemas |
| `backend/app/api/router.py` | Register `v1_cash_reconciliation_router` |
| `backend/tests/test_cash_netting_models.py` | Update enum count assertion (20 → 21) |

---

## Chunk 1: Data Layer

### Task 1: BankTransaction Model Updates + Audit Enum + Migration

**Context:** Add two nullable UUID columns to `BankTransaction` for FK references to matched records. Add `RECONCILIATION_RUN` audit enum. Create migration 0025.

**Files:**
- Modify: `backend/app/models/bank_statement.py` (add 2 columns after `reconciliation_status`)
- Modify: `backend/app/models/cash.py` (add 1 enum value)
- Modify: `backend/tests/test_cash_netting_models.py` (update enum count)
- Create: `backend/migrations/versions/0025_reconciliation_fks.py`

- [ ] **Step 1: Add columns to BankTransaction model**

In `backend/app/models/bank_statement.py`, add after `reconciliation_status` (line 56) and before `created_at`:

```python
    matched_settlement_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    matched_journal_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
```

- [ ] **Step 2: Add audit event type**

In `backend/app/models/cash.py`, add after `STATEMENT_IMPORTED`:

```python
    RECONCILIATION_RUN = "RECONCILIATION_RUN"
```

- [ ] **Step 3: Update enum count test**

In `backend/tests/test_cash_netting_models.py`, change:

```python
        # Original 16 + 3 netting + 1 statement_imported = 20
        assert len(CashAuditEventType) == 20
```

to:

```python
        # Original 16 + 3 netting + 1 statement_imported + 1 reconciliation_run = 21
        assert len(CashAuditEventType) == 21
```

- [ ] **Step 4: Create migration 0025**

```python
# backend/migrations/versions/0025_reconciliation_fks.py
"""Add reconciliation FK columns to bank_transactions

Revision ID: 0025
Revises: 0024
"""
from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE bank_transactions
        ADD COLUMN IF NOT EXISTS matched_settlement_id UUID,
        ADD COLUMN IF NOT EXISTS matched_journal_id UUID;
    """)
    op.execute("""
    ALTER TABLE bank_transactions
        ADD CONSTRAINT ck_bank_tx_single_match
        CHECK (
            NOT (matched_settlement_id IS NOT NULL AND matched_journal_id IS NOT NULL)
        );
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS ck_bank_tx_single_match;")
    op.execute("ALTER TABLE bank_transactions DROP COLUMN IF EXISTS matched_journal_id;")
    op.execute("ALTER TABLE bank_transactions DROP COLUMN IF EXISTS matched_settlement_id;")
```

- [ ] **Step 5: Verify imports**

```bash
cd backend
DATABASE_URL="sqlite+aiosqlite://" python -c "from app.models.bank_statement import BankTransaction; print(BankTransaction.__table__.columns.keys())"
DATABASE_URL="sqlite+aiosqlite://" python -c "from app.models.cash import CashAuditEventType; print(CashAuditEventType.RECONCILIATION_RUN.value)"
```

- [ ] **Step 6: Run affected tests**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_cash_netting_models.py -v --tb=short
```

Expected: all pass (including updated enum count)

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/bank_statement.py backend/app/models/cash.py \
  backend/tests/test_cash_netting_models.py backend/migrations/versions/0025_reconciliation_fks.py
git commit -m "feat(phase2e): reconciliation FK columns on BankTransaction, migration 0025, RECONCILIATION_RUN enum"
```

---

### Task 2: Pydantic Schema Updates

**Context:** Add the two new FK fields to `BankTransactionResponse` so the existing transactions endpoint surfaces match info. Add 3 new schemas for reconciliation-specific responses.

**Files:**
- Modify: `backend/app/schemas_v1/cash.py`

- [ ] **Step 1: Add FK fields to BankTransactionResponse**

In `backend/app/schemas_v1/cash.py`, in `BankTransactionResponse`, add after `reconciliation_status: str`:

```python
    matched_settlement_id: uuid.UUID | None = None
    matched_journal_id: uuid.UUID | None = None
```

- [ ] **Step 2: Append reconciliation schemas**

After `StatementUploadResponse` at the bottom of the file, add:

```python


# ── Reconciliation ──────────────────────────────────────────────────

class ReconciliationRunResponse(BaseModel):
    matched_count: int
    exception_count: int
    unmatched_remaining: int


class ReconciliationSummary(BaseModel):
    total_transactions: int
    matched: int
    unmatched: int
    exceptions: int
    match_rate_pct: Decimal


class ManualMatchRequest(BaseModel):
    transaction_id: uuid.UUID
    match_type: str  # "SETTLEMENT" or "JOURNAL"
    matched_id: uuid.UUID
```

- [ ] **Step 3: Verify imports**

```bash
cd backend
DATABASE_URL="sqlite+aiosqlite://" python -c "from app.schemas_v1.cash import ReconciliationRunResponse, ReconciliationSummary, ManualMatchRequest; print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas_v1/cash.py
git commit -m "feat(phase2e): reconciliation schemas + BankTransactionResponse FK fields"
```

---

## Chunk 2: Engine + Tests

### Task 3: Reconciliation Engine + Tests

**Context:** Pure-function matching engine. Zero DB, zero side effects. Takes dicts, returns dicts. Settlement matches checked first (higher priority). Multi-candidate ambiguity → skip (no false positives).

**Files:**
- Create: `backend/app/services/reconciliation_engine.py`
- Create: `backend/tests/test_reconciliation_engine.py`

- [ ] **Step 1: Write the engine tests**

```python
# backend/tests/test_reconciliation_engine.py
"""Pure-function tests for the reconciliation matching engine.

No DB, no mocks, no async — just input → output verification.
"""
import uuid
from datetime import date
from decimal import Decimal
import pytest


def _tx(amount, currency="EUR", tx_date=date(2026, 4, 1), direction="CREDIT", tx_id=None):
    return {
        "id": tx_id or uuid.uuid4(),
        "amount": Decimal(str(amount)),
        "currency": currency,
        "tx_date": tx_date,
        "value_date": None,
        "direction": direction,
        "reference": "",
    }


def _settlement(amount, currency="EUR", settlement_date=date(2026, 4, 1), se_id=None, value_date=None):
    return {
        "id": se_id or uuid.uuid4(),
        "settlement_amount": Decimal(str(amount)),
        "currency": currency,
        "settlement_date": settlement_date,
        "value_date": value_date,
        "settlement_ref": "REF001",
    }


def _journal(amount, currency="EUR", period_date=date(2026, 4, 1), je_id=None):
    return {
        "id": je_id or uuid.uuid4(),
        "amount": Decimal(str(amount)),
        "currency": currency,
        "period_date": period_date,
        "description": "Journal entry",
    }


def test_exact_settlement_match():
    """Transaction matches settlement on amount + currency + date."""
    from app.services.reconciliation_engine import find_matches

    tx_id = uuid.uuid4()
    se_id = uuid.uuid4()
    tx = _tx(50000, tx_id=tx_id)
    se = _settlement(50000, se_id=se_id)

    matches = find_matches([tx], [se], [])
    assert len(matches) == 1
    assert matches[0]["transaction_id"] == tx_id
    assert matches[0]["match_type"] == "SETTLEMENT"
    assert matches[0]["matched_id"] == se_id


def test_exact_journal_match():
    """Transaction matches journal on amount + currency + date."""
    from app.services.reconciliation_engine import find_matches

    tx_id = uuid.uuid4()
    je_id = uuid.uuid4()
    tx = _tx(15000, tx_id=tx_id)
    je = _journal(15000, je_id=je_id)

    matches = find_matches([tx], [], [je])
    assert len(matches) == 1
    assert matches[0]["match_type"] == "JOURNAL"
    assert matches[0]["matched_id"] == je_id


def test_no_match_different_amount():
    """No match when amounts differ."""
    from app.services.reconciliation_engine import find_matches

    tx = _tx(50000)
    se = _settlement(49999)

    matches = find_matches([tx], [se], [])
    assert len(matches) == 0


def test_no_match_different_currency():
    """No match when currencies differ."""
    from app.services.reconciliation_engine import find_matches

    tx = _tx(50000, currency="EUR")
    se = _settlement(50000, currency="USD")

    matches = find_matches([tx], [se], [])
    assert len(matches) == 0


def test_multi_candidate_ambiguity_skipped():
    """Multiple candidates with same amount+currency+date → no match (ambiguity)."""
    from app.services.reconciliation_engine import find_matches

    tx = _tx(50000)
    se1 = _settlement(50000)
    se2 = _settlement(50000)

    matches = find_matches([tx], [se1, se2], [])
    assert len(matches) == 0


def test_settlement_priority_over_journal():
    """When both settlement and journal match, settlement wins."""
    from app.services.reconciliation_engine import find_matches

    tx_id = uuid.uuid4()
    se_id = uuid.uuid4()
    je_id = uuid.uuid4()
    tx = _tx(25000, tx_id=tx_id)
    se = _settlement(25000, se_id=se_id)
    je = _journal(25000, je_id=je_id)

    matches = find_matches([tx], [se], [je])
    assert len(matches) == 1
    assert matches[0]["match_type"] == "SETTLEMENT"
    assert matches[0]["matched_id"] == se_id


def test_settlement_match_on_value_date():
    """Settlement matches when tx_date matches settlement value_date."""
    from app.services.reconciliation_engine import find_matches

    tx_id = uuid.uuid4()
    se_id = uuid.uuid4()
    tx = _tx(30000, tx_date=date(2026, 4, 3), tx_id=tx_id)
    se = _settlement(30000, settlement_date=date(2026, 4, 1), value_date=date(2026, 4, 3), se_id=se_id)

    matches = find_matches([tx], [se], [])
    assert len(matches) == 1
    assert matches[0]["matched_id"] == se_id


def test_empty_inputs():
    """Empty inputs return empty matches."""
    from app.services.reconciliation_engine import find_matches

    assert find_matches([], [], []) == []
    assert find_matches([_tx(100)], [], []) == []
    assert find_matches([], [_settlement(100)], [_journal(100)]) == []


def test_already_matched_settlement_not_reused():
    """A settlement already matched to one tx is not available for another."""
    from app.services.reconciliation_engine import find_matches

    se_id = uuid.uuid4()
    tx1 = _tx(50000, tx_date=date(2026, 4, 1))
    tx2 = _tx(50000, tx_date=date(2026, 4, 1))
    se = _settlement(50000, se_id=se_id)

    # Two txs with same amount/currency/date, one settlement →
    # both would match, but settlement can only be used once.
    # First match consumes the settlement; second gets no match.
    matches = find_matches([tx1, tx2], [se], [])
    assert len(matches) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_reconciliation_engine.py -v --tb=short
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write the reconciliation engine**

```python
# backend/app/services/reconciliation_engine.py
"""
Pure-function reconciliation matching engine.

Deterministic. No DB access. No side effects.
Takes bank transactions + candidate settlements/journals as dicts,
returns exact matches. All-or-nothing: ambiguous matches are skipped.
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal


def find_matches(
    transactions: list[dict],
    settlements: list[dict],
    journals: list[dict],
) -> list[dict]:
    """Find exact matches between bank transactions and candidates.

    Priority: settlement matches checked first. If a tx matches a settlement,
    journal matching is skipped for that tx.

    Ambiguity: if multiple candidates match on all fields, the tx is skipped
    (no false positives).

    Each settlement/journal can only be matched to one transaction.
    """
    if not transactions:
        return []

    results: list[dict] = []
    used_settlement_ids: set[uuid.UUID] = set()
    used_journal_ids: set[uuid.UUID] = set()

    for tx in transactions:
        tx_amount = tx["amount"]
        tx_currency = tx["currency"]
        tx_date_val = tx["tx_date"]

        # 1. Try settlement match first
        settlement_match = _find_settlement_match(
            tx_amount, tx_currency, tx_date_val,
            settlements, used_settlement_ids,
        )
        if settlement_match:
            results.append({
                "transaction_id": tx["id"],
                "match_type": "SETTLEMENT",
                "matched_id": settlement_match["id"],
                "match_fields": {
                    "amount": tx_amount,
                    "currency": tx_currency,
                    "date": tx_date_val,
                },
            })
            used_settlement_ids.add(settlement_match["id"])
            continue

        # 2. Try journal match
        journal_match = _find_journal_match(
            tx_amount, tx_currency, tx_date_val,
            journals, used_journal_ids,
        )
        if journal_match:
            results.append({
                "transaction_id": tx["id"],
                "match_type": "JOURNAL",
                "matched_id": journal_match["id"],
                "match_fields": {
                    "amount": tx_amount,
                    "currency": tx_currency,
                    "date": tx_date_val,
                },
            })
            used_journal_ids.add(journal_match["id"])

    return results


def _find_settlement_match(
    amount: Decimal,
    currency: str,
    tx_date: date,
    settlements: list[dict],
    used_ids: set[uuid.UUID],
) -> dict | None:
    """Find exactly one settlement matching amount + currency + date."""
    candidates = []
    for se in settlements:
        if se["id"] in used_ids:
            continue
        if se["settlement_amount"] != amount:
            continue
        if se["currency"] != currency:
            continue
        # Match on settlement_date OR value_date
        if tx_date != se["settlement_date"] and tx_date != se.get("value_date"):
            continue
        candidates.append(se)

    # Exact single match only — ambiguity → skip
    if len(candidates) == 1:
        return candidates[0]
    return None


def _find_journal_match(
    amount: Decimal,
    currency: str,
    tx_date: date,
    journals: list[dict],
    used_ids: set[uuid.UUID],
) -> dict | None:
    """Find exactly one journal entry matching amount + currency + date."""
    candidates = []
    for je in journals:
        if je["id"] in used_ids:
            continue
        if je["amount"] != amount:
            continue
        if je["currency"] != currency:
            continue
        if tx_date != je["period_date"]:
            continue
        candidates.append(je)

    if len(candidates) == 1:
        return candidates[0]
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_reconciliation_engine.py -v --tb=short
```

Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/reconciliation_engine.py backend/tests/test_reconciliation_engine.py
git commit -m "feat(phase2e): reconciliation engine (exact-match, settlement-priority) + 9 tests"
```

---

## Chunk 3: Service Layer

### Task 4: Reconciliation Service + Tests

**Context:** Orchestrates the reconciliation pipeline. Loads UNMATCHED bank transactions, loads candidate settlements (with currency resolved via JournalEntry) and journal entries, runs the pure-function engine, persists matches by updating `BankTransaction` rows, and audit-logs.

**Important:** `SettlementEvent` has no `currency` column. The service resolves settlement currency by joining through `JournalEntry.settlement_event_id` to get `JournalEntry.currency`. If no journal entry exists for a settlement, that settlement is excluded from candidates.

**Files:**
- Create: `backend/app/services/reconciliation_service.py`
- Create: `backend/tests/test_reconciliation_service.py`

- [ ] **Step 1: Write the service tests**

```python
# backend/tests/test_reconciliation_service.py
"""Service-layer tests for reconciliation_service — AsyncMock DB session."""
import uuid
from datetime import date, datetime, UTC, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


def _mock_bank_tx(amount=Decimal("50000"), currency="EUR", tx_date=date(2026, 4, 1)):
    tx = MagicMock()
    tx.id = uuid.uuid4()
    tx.amount = amount
    tx.currency = currency
    tx.tx_date = tx_date
    tx.value_date = None
    tx.direction = "CREDIT"
    tx.reference = ""
    tx.reconciliation_status = "UNMATCHED"
    tx.matched_settlement_id = None
    tx.matched_journal_id = None
    tx.company_id = uuid.uuid4()
    return tx


@pytest.mark.asyncio
async def test_run_reconciliation_applies_matches():
    """run_reconciliation calls engine and updates matched transactions."""
    from app.services.reconciliation_service import run_reconciliation

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    tx = _mock_bank_tx()
    se_id = uuid.uuid4()
    je_currency = "EUR"

    # Mock: unmatched transactions query
    tx_result = MagicMock()
    tx_result.scalars.return_value.all.return_value = [tx]

    # Mock: settlement+journal candidates query (returns a row with settlement + journal currency)
    se_row = MagicMock()
    se_row.id = se_id
    se_row.settlement_amount = Decimal("50000")
    se_row.settlement_date = date(2026, 4, 1)
    se_row.value_date = None
    se_row.settlement_ref = "REF001"
    se_row.currency = "EUR"  # resolved from journal

    se_result = MagicMock()
    se_result.all.return_value = [se_row]

    je_result = MagicMock()
    je_result.scalars.return_value.all.return_value = []

    mock_session.execute = AsyncMock(side_effect=[tx_result, se_result, je_result])

    with patch("app.services.reconciliation_service.append_event", new_callable=AsyncMock):
        result = await run_reconciliation(
            mock_session, company_id=company_id, performed_by=actor_id,
        )

    assert result["matched_count"] == 1
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_manual_match_sets_fk():
    """manual_match updates the transaction with the matched FK."""
    from app.services.reconciliation_service import manual_match

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    tx_id = uuid.uuid4()
    se_id = uuid.uuid4()

    tx = _mock_bank_tx()
    tx.id = tx_id

    tx_result = MagicMock()
    tx_result.scalar_one_or_none.return_value = tx
    mock_session.execute = AsyncMock(return_value=tx_result)

    await manual_match(
        mock_session, transaction_id=tx_id, company_id=company_id,
        match_type="SETTLEMENT", matched_id=se_id, performed_by=actor_id,
    )

    assert tx.matched_settlement_id == se_id
    assert tx.reconciliation_status == "MATCHED"
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_mark_exception():
    """mark_exception sets status to EXCEPTION."""
    from app.services.reconciliation_service import mark_exception

    mock_session = AsyncMock()
    tx = _mock_bank_tx()

    tx_result = MagicMock()
    tx_result.scalar_one_or_none.return_value = tx
    mock_session.execute = AsyncMock(return_value=tx_result)

    await mark_exception(
        mock_session, transaction_id=tx.id,
        company_id=tx.company_id, performed_by=uuid.uuid4(),
    )

    assert tx.reconciliation_status == "EXCEPTION"
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_unmatch_clears_fk():
    """unmatch resets status and clears FK columns."""
    from app.services.reconciliation_service import unmatch

    mock_session = AsyncMock()
    tx = _mock_bank_tx()
    tx.reconciliation_status = "MATCHED"
    tx.matched_settlement_id = uuid.uuid4()

    tx_result = MagicMock()
    tx_result.scalar_one_or_none.return_value = tx
    mock_session.execute = AsyncMock(return_value=tx_result)

    await unmatch(
        mock_session, transaction_id=tx.id,
        company_id=tx.company_id, performed_by=uuid.uuid4(),
    )

    assert tx.reconciliation_status == "UNMATCHED"
    assert tx.matched_settlement_id is None
    assert tx.matched_journal_id is None
    mock_session.flush.assert_awaited()
```

- [ ] **Step 2: Write the reconciliation service**

```python
# backend/app/services/reconciliation_service.py
"""
Reconciliation service — orchestrates matching of bank transactions
against settlement events and journal entries.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, func, text, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bank_statement import BankTransaction
from app.models.settlement_event import SettlementEvent
from app.models.journal_entry import JournalEntry
from app.models.cash import CashAuditEventType
from app.services.cash_audit_service import append_event
from app.services.reconciliation_engine import find_matches


async def run_reconciliation(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    account_id: uuid.UUID | None = None,
    performed_by: uuid.UUID,
) -> dict[str, Any]:
    """Load unmatched txs, load candidates, run engine, persist matches, audit."""
    # 1. Load UNMATCHED bank transactions
    tx_query = select(BankTransaction).where(
        BankTransaction.company_id == company_id,
        BankTransaction.reconciliation_status == "UNMATCHED",
    )
    if account_id:
        tx_query = tx_query.where(BankTransaction.account_id == account_id)

    tx_result = await session.execute(tx_query)
    unmatched_txs = list(tx_result.scalars().all())

    if not unmatched_txs:
        return {"matched_count": 0, "exception_count": 0, "unmatched_remaining": 0}

    # Date range for candidate loading
    tx_dates = [tx.tx_date for tx in unmatched_txs]
    date_min = min(tx_dates) - timedelta(days=7)
    date_max = max(tx_dates) + timedelta(days=7)

    # 2. Load settlement candidates (with currency resolved via JournalEntry)
    # Join SettlementEvent with JournalEntry to get currency
    se_query = (
        select(
            SettlementEvent.id,
            SettlementEvent.settlement_amount,
            SettlementEvent.settlement_date,
            SettlementEvent.value_date,
            SettlementEvent.settlement_ref,
            JournalEntry.currency,
        )
        .join(JournalEntry, JournalEntry.settlement_event_id == SettlementEvent.id)
        .where(
            SettlementEvent.company_id == company_id,
            SettlementEvent.settlement_date >= date_min,
            SettlementEvent.settlement_date <= date_max,
        )
    )
    se_result = await session.execute(se_query)
    settlement_rows = se_result.all()

    settlements = [
        {
            "id": row.id,
            "settlement_amount": row.settlement_amount,
            "currency": row.currency,
            "settlement_date": row.settlement_date,
            "value_date": row.value_date,
            "settlement_ref": row.settlement_ref,
        }
        for row in settlement_rows
    ]

    # 3. Load journal entry candidates (not already matched)
    je_query = (
        select(JournalEntry)
        .where(
            JournalEntry.company_id == company_id,
            JournalEntry.period_date >= date_min,
            JournalEntry.period_date <= date_max,
            JournalEntry.settlement_event_id.is_(None),  # exclude settlement journals (avoid double-match)
        )
    )
    je_result = await session.execute(je_query)
    journal_entries = list(je_result.scalars().all())

    journals = [
        {
            "id": je.id,
            "amount": je.amount,
            "currency": je.currency,
            "period_date": je.period_date,
            "description": je.description,
        }
        for je in journal_entries
    ]

    # 4. Build transaction dicts
    tx_dicts = [
        {
            "id": tx.id,
            "amount": Decimal(str(tx.amount)),
            "currency": tx.currency,
            "tx_date": tx.tx_date,
            "value_date": tx.value_date,
            "direction": tx.direction,
            "reference": tx.reference or "",
        }
        for tx in unmatched_txs
    ]

    # 5. Run engine
    matches = find_matches(tx_dicts, settlements, journals)

    # 6. Apply matches
    tx_by_id = {tx.id: tx for tx in unmatched_txs}
    matched_count = 0
    for match in matches:
        tx = tx_by_id.get(match["transaction_id"])
        if not tx:
            continue
        if match["match_type"] == "SETTLEMENT":
            tx.matched_settlement_id = match["matched_id"]
        else:
            tx.matched_journal_id = match["matched_id"]
        tx.reconciliation_status = "MATCHED"
        matched_count += 1

    await session.flush()

    # 7. Audit log
    unmatched_remaining = len(unmatched_txs) - matched_count
    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.RECONCILIATION_RUN,
        payload={
            "matched_count": matched_count,
            "unmatched_remaining": unmatched_remaining,
            "settlement_candidates": len(settlements),
            "journal_candidates": len(journals),
        },
        performed_by=performed_by,
    )

    return {
        "matched_count": matched_count,
        "exception_count": 0,
        "unmatched_remaining": unmatched_remaining,
    }


async def get_reconciliation_summary(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
) -> dict[str, Any]:
    """Aggregate reconciliation stats for a company."""
    result = await session.execute(
        select(
            func.count().label("total"),
            func.count().filter(BankTransaction.reconciliation_status == "MATCHED").label("matched"),
            func.count().filter(BankTransaction.reconciliation_status == "UNMATCHED").label("unmatched"),
            func.count().filter(BankTransaction.reconciliation_status == "EXCEPTION").label("exceptions"),
        ).where(BankTransaction.company_id == company_id)
    )
    row = result.one()
    total = row.total or 0
    matched = row.matched or 0
    unmatched = row.unmatched or 0
    exceptions = row.exceptions or 0
    rate = Decimal(str(matched * 100 / total)) if total > 0 else Decimal("0")

    return {
        "total_transactions": total,
        "matched": matched,
        "unmatched": unmatched,
        "exceptions": exceptions,
        "match_rate_pct": round(rate, 2),
    }


async def manual_match(
    session: AsyncSession,
    *,
    transaction_id: uuid.UUID,
    company_id: uuid.UUID,
    match_type: str,
    matched_id: uuid.UUID,
    performed_by: uuid.UUID,
) -> None:
    """Manually match a single bank transaction."""
    tx = await _get_transaction(session, transaction_id, company_id)

    if match_type == "SETTLEMENT":
        tx.matched_settlement_id = matched_id
    elif match_type == "JOURNAL":
        tx.matched_journal_id = matched_id
    else:
        raise HTTPException(status_code=400, detail="match_type must be SETTLEMENT or JOURNAL")

    tx.reconciliation_status = "MATCHED"
    await session.flush()


async def mark_exception(
    session: AsyncSession,
    *,
    transaction_id: uuid.UUID,
    company_id: uuid.UUID,
    performed_by: uuid.UUID,
) -> None:
    """Flag a transaction as EXCEPTION for manual review."""
    tx = await _get_transaction(session, transaction_id, company_id)
    tx.reconciliation_status = "EXCEPTION"
    await session.flush()


async def unmatch(
    session: AsyncSession,
    *,
    transaction_id: uuid.UUID,
    company_id: uuid.UUID,
    performed_by: uuid.UUID,
) -> None:
    """Revert a matched transaction back to UNMATCHED."""
    tx = await _get_transaction(session, transaction_id, company_id)
    tx.reconciliation_status = "UNMATCHED"
    tx.matched_settlement_id = None
    tx.matched_journal_id = None
    await session.flush()


async def _get_transaction(
    session: AsyncSession,
    transaction_id: uuid.UUID,
    company_id: uuid.UUID,
) -> BankTransaction:
    """Load a single transaction or raise 404."""
    result = await session.execute(
        select(BankTransaction).where(
            BankTransaction.id == transaction_id,
            BankTransaction.company_id == company_id,
        )
    )
    tx = result.scalar_one_or_none()
    if tx is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return tx
```

- [ ] **Step 3: Run tests**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_reconciliation_service.py -v --tb=short
```

Expected: 4 passed

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/reconciliation_service.py backend/tests/test_reconciliation_service.py
git commit -m "feat(phase2e): reconciliation service (run/manual-match/exception/unmatch) + 4 tests"
```

---

## Chunk 4: Routes + Router Registration

### Task 5: API Routes + Router Registration + Route Tests

**Context:** 5 endpoints under `/v1/cash/reconciliation`. Module-level patchable helpers for testability. Register in `router.py` after the statements router.

**Files:**
- Create: `backend/app/api/routes/v1_cash_reconciliation.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_v1_reconciliation_routes.py`

- [ ] **Step 1: Write route tests**

```python
# backend/tests/test_v1_reconciliation_routes.py
"""Route tests for /v1/cash/reconciliation/* via httpx AsyncClient."""
import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.core.db import get_session
from app.core.dependencies import get_current_user


_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _mock_user(role="cfo"):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = uuid.uuid4()
    user.role = role
    user.plan_tier = "professional"
    return user


def _make_mock_session():
    mock = AsyncMock()
    mock.commit = AsyncMock()
    mock.rollback = AsyncMock()
    mock.close = AsyncMock()
    return mock


async def _noop_session():
    yield _make_mock_session()


@pytest.mark.asyncio
async def test_run_reconciliation():
    """POST /v1/cash/reconciliation/run returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_reconciliation.run_reconciliation_helper",
                   new_callable=AsyncMock,
                   return_value={"matched_count": 3, "exception_count": 0, "unmatched_remaining": 2}):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/cash/reconciliation/run", headers=_BEARER)
        assert resp.status_code == 200
        assert resp.json()["matched_count"] == 3
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_summary():
    """GET /v1/cash/reconciliation/summary returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_reconciliation.get_summary_helper",
                   new_callable=AsyncMock,
                   return_value={"total_transactions": 10, "matched": 5,
                                 "unmatched": 4, "exceptions": 1, "match_rate_pct": "50.00"}):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/cash/reconciliation/summary", headers=_BEARER)
        assert resp.status_code == 200
        assert resp.json()["total_transactions"] == 10
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_manual_match():
    """POST /v1/cash/reconciliation/match returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_reconciliation.manual_match_helper",
                   new_callable=AsyncMock, return_value=None):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/cash/reconciliation/match", headers=_BEARER,
                                     json={"transaction_id": str(uuid.uuid4()),
                                           "match_type": "SETTLEMENT",
                                           "matched_id": str(uuid.uuid4())})
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Write the route file**

```python
# backend/app/api/routes/v1_cash_reconciliation.py
"""v1 reconciliation — run engine, summary, manual match, exception, unmatch."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.user import User
from app.schemas_v1.cash import (
    ReconciliationRunResponse, ReconciliationSummary, ManualMatchRequest,
)
from app.services.reconciliation_service import (
    run_reconciliation, get_reconciliation_summary,
    manual_match, mark_exception, unmatch,
)

router = APIRouter(prefix="/v1/cash/reconciliation", tags=["cash-reconciliation"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


# ── Module-level helpers for testability ──

async def run_reconciliation_helper(db, *, company_id, account_id, performed_by):
    return await run_reconciliation(db, company_id=company_id, account_id=account_id, performed_by=performed_by)


async def get_summary_helper(db, *, company_id):
    return await get_reconciliation_summary(db, company_id=company_id)


async def manual_match_helper(db, *, transaction_id, company_id, match_type, matched_id, performed_by):
    return await manual_match(db, transaction_id=transaction_id, company_id=company_id,
                               match_type=match_type, matched_id=matched_id, performed_by=performed_by)


async def mark_exception_helper(db, *, transaction_id, company_id, performed_by):
    return await mark_exception(db, transaction_id=transaction_id, company_id=company_id, performed_by=performed_by)


async def unmatch_helper(db, *, transaction_id, company_id, performed_by):
    return await unmatch(db, transaction_id=transaction_id, company_id=company_id, performed_by=performed_by)


# ── Routes ──

@router.post("/run", response_model=ReconciliationRunResponse)
async def run_reconciliation_route(
    account_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    return await run_reconciliation_helper(
        db, company_id=current_user.company_id, account_id=account_id,
        performed_by=current_user.id,
    )


@router.get("/summary", response_model=ReconciliationSummary)
async def get_summary_route(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await get_summary_helper(db, company_id=current_user.company_id)


@router.post("/match")
async def manual_match_route(
    body: ManualMatchRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    await manual_match_helper(
        db, transaction_id=body.transaction_id, company_id=current_user.company_id,
        match_type=body.match_type, matched_id=body.matched_id,
        performed_by=current_user.id,
    )
    await db.commit()
    return {"status": "matched"}


@router.post("/exception/{transaction_id}")
async def mark_exception_route(
    transaction_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    await mark_exception_helper(
        db, transaction_id=transaction_id, company_id=current_user.company_id,
        performed_by=current_user.id,
    )
    await db.commit()
    return {"status": "exception"}


@router.post("/unmatch/{transaction_id}")
async def unmatch_route(
    transaction_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    await unmatch_helper(
        db, transaction_id=transaction_id, company_id=current_user.company_id,
        performed_by=current_user.id,
    )
    await db.commit()
    return {"status": "unmatched"}
```

- [ ] **Step 3: Register the router**

Append to `backend/app/api/router.py` after the statements router:

```python
# Treasury Suite Phase 2e — Auto-Reconciliation (owns /v1/cash/reconciliation/*)
from app.api.routes.v1_cash_reconciliation import router as v1_cash_reconciliation_router
router.include_router(v1_cash_reconciliation_router)
```

- [ ] **Step 4: Run route tests**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_v1_reconciliation_routes.py -v --tb=short
```

Expected: 3 passed

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
BANK_ACCOUNT_ENC_KEY="test-bank-enc-key-at-least-32-bytes-long!!" \
python -m pytest tests/ --override-ini="addopts=" -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
```

Expected: ~4962+ passed, 0 failed

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/v1_cash_reconciliation.py backend/app/api/router.py \
  backend/tests/test_v1_reconciliation_routes.py
git commit -m "feat(phase2e): reconciliation API routes (5 endpoints) + router registration + 3 route tests"
```

---

## Post-Flight Checks

```bash
# Full backend test suite
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
BANK_ACCOUNT_ENC_KEY="test-bank-enc-key-at-least-32-bytes-long!!" \
python -m pytest tests/ --override-ini="addopts=" -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
# Expected: ~4962+ passed, 0 failed

# Frontend type check (no changes expected, but verify no regressions)
cd frontend && npx tsc --noEmit
# Expected: clean
```
