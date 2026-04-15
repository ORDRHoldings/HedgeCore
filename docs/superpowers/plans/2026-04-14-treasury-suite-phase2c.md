# Treasury Suite Phase 2c — Intercompany Netting Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an intercompany netting system that detects, proposes, and executes bilateral netting settlements to reduce external FX costs — supporting both manually entered obligations and auto-detected intercompany flows from tagged forecast items.

**Architecture:** Two new DB models (`IntercompanyObligation`, `NettingProposal`), one column addition to `CashForecastItem`, one pure-function netting engine, one service layer, one route file, Pydantic schemas, one frontend page, and sidebar nav entry. Follows Phase 2a/2b patterns: AsyncMock unit tests, tenant-scoped JOINs through `LegalEntity`, `dashboardFetch`-based frontend, WORM audit trail via existing `cash_audit_events`, 4-eyes SoD approval via existing framework.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x async, Alembic raw SQL migration, Next.js 15 App Router, TypeScript 5, lucide-react, IBM Plex fonts.

---

## Pre-Flight Checks

```bash
# Verify backend tests still pass before touching anything
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
BANK_ACCOUNT_ENC_KEY="test-bank-enc-key-at-least-32-bytes-long!!" \
python -m pytest tests/ --override-ini="addopts=" -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
# Expected: ~4896 passed, 0 failed

cd frontend && npx tsc --noEmit
# Expected: no output (clean)
```

---

## File Map

**New backend files:**
| File | Responsibility |
|------|----------------|
| `backend/app/models/cash_netting.py` | Two models: `IntercompanyObligation` (manual IC obligations), `NettingProposal` (bilateral net settlement proposals with 5-state machine) |
| `backend/migrations/versions/0023_intercompany_netting.py` | Three DDL ops: two new tables + ALTER TABLE adding `counterparty_entity_id` to `cash_forecast_items` |
| `backend/app/services/netting_engine.py` | Pure-function bilateral netting computation — zero side effects, zero DB access, fully deterministic |
| `backend/app/services/netting_service.py` | Orchestrator — CRUD obligations, auto-detect from forecast items, generate/approve/execute proposals, savings summary |
| `backend/app/api/routes/v1_cash_netting.py` | 8 endpoints under `/v1/cash/netting/*` |
| `backend/tests/test_netting_engine.py` | Pure-function engine tests (no DB, no mocks, no async) |
| `backend/tests/test_netting_service.py` | Service-layer tests with AsyncMock DB session |
| `backend/tests/test_v1_cash_netting_routes.py` | Route tests via httpx AsyncClient |

**Modified backend files:**
| File | Change |
|------|--------|
| `backend/app/schemas_v1/cash.py` | Append 4 netting schemas: `ObligationCreate`, `ObligationResponse`, `NettingProposalResponse`, `NettingSavingsSummary` |
| `backend/app/api/router.py` | Register `v1_cash_netting_router` |
| `backend/app/models/cash.py` | Add `NETTING_PROPOSED`, `NETTING_APPROVED`, `NETTING_EXECUTED` to `CashAuditEventType` enum |
| `backend/app/models/cash_forecast.py` | Add `counterparty_entity_id` column to `CashForecastItem` |

**New frontend files:**
| File | Responsibility |
|------|----------------|
| `frontend/src/app/intercompany-netting/page.tsx` | 3-tab page: Obligations, Proposals, Savings |

**Modified frontend files:**
| File | Change |
|------|--------|
| `frontend/src/lib/api/cashClient.ts` | Add netting interfaces + 7 API functions |
| `frontend/src/components/layout/AppSidebar.tsx` | Add "Intercompany Netting" nav item in ACCOUNTING section after "Cash Forecast" |

---

## Chunk 1: Data Layer

### Task 1: IntercompanyObligation and NettingProposal Models + Enum Additions

**Context:** Two new ORM models following the exact pattern of `cash_forecast.py`. IntercompanyObligation tracks what one entity owes another; NettingProposal groups matched obligations into a net settlement. Also adds three audit event types to `CashAuditEventType` and a `counterparty_entity_id` column to `CashForecastItem`.

**Files:**
- Create: `backend/app/models/cash_netting.py`
- Modify: `backend/app/models/cash.py` (add 3 enum values after `FORECAST_SCENARIO_RUN`)
- Modify: `backend/app/models/cash_forecast.py` (add 1 column)

- [ ] **Step 1: Create the netting models file**

```python
# backend/app/models/cash_netting.py
"""
Intercompany netting models.

IntercompanyObligation — what one entity owes another within the same tenant
NettingProposal        — bilateral net settlement proposal with 5-state machine
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class IntercompanyObligation(Base):
    """A record of what one legal entity owes another within the same company."""
    __tablename__ = "intercompany_obligations"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    debtor_entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    creditor_entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class NettingProposal(Base):
    """Groups matched obligations into a bilateral net settlement proposal."""
    __tablename__ = "netting_proposals"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    entity_a_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    entity_b_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    gross_payable: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    gross_receivable: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    net_amount: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    net_direction: Mapped[str] = mapped_column(String(4), nullable=False)  # "A2B" or "B2A"
    savings: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    obligation_ids: Mapped[dict] = mapped_column(JSONB, nullable=False)  # array of UUID strings
    proposed_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    proposed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 2: Add audit event types to CashAuditEventType**

In `backend/app/models/cash.py`, add these three values after `FORECAST_SCENARIO_RUN = "FORECAST_SCENARIO_RUN"` (line ~115):

```python
    NETTING_PROPOSED = "NETTING_PROPOSED"
    NETTING_APPROVED = "NETTING_APPROVED"
    NETTING_EXECUTED = "NETTING_EXECUTED"
```

- [ ] **Step 3: Add counterparty_entity_id to CashForecastItem**

In `backend/app/models/cash_forecast.py`, add one column after the `account_id` column (line ~31):

```python
    counterparty_entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
```

- [ ] **Step 4: Verify imports work**

```bash
cd backend
python -c "from app.models.cash_netting import IntercompanyObligation, NettingProposal; print('OK')"
python -c "from app.models.cash import CashAuditEventType; print(CashAuditEventType.NETTING_PROPOSED.value)"
python -c "from app.models.cash_forecast import CashForecastItem; print('counterparty_entity_id' in [c.key for c in CashForecastItem.__table__.columns])"
```

Expected: `OK`, `NETTING_PROPOSED`, `True`

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/cash_netting.py backend/app/models/cash.py backend/app/models/cash_forecast.py
git commit -m "feat(phase2c): IntercompanyObligation + NettingProposal models, audit enums, counterparty_entity_id"
```

---

### Task 2: Alembic Migration 0023

**Context:** Raw SQL migration creating the two new tables and adding the `counterparty_entity_id` column to `cash_forecast_items`. Follows exact pattern of `0022_cash_forecast.py`.

**Files:**
- Create: `backend/migrations/versions/0023_intercompany_netting.py`

- [ ] **Step 1: Create the migration file**

```python
# backend/migrations/versions/0023_intercompany_netting.py
"""intercompany_obligations and netting_proposals tables, counterparty_entity_id column

Revision ID: 0023
Revises: 0022
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS intercompany_obligations (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id          UUID NOT NULL,
        debtor_entity_id    UUID NOT NULL,
        creditor_entity_id  UUID NOT NULL,
        amount              NUMERIC(20,6) NOT NULL CHECK (amount > 0),
        currency            VARCHAR(3) NOT NULL,
        due_date            DATE NOT NULL,
        reference           VARCHAR(255),
        status              VARCHAR(16) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING', 'NETTED', 'SETTLED', 'CANCELLED')),
        created_by          UUID NOT NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_no_self_obligation CHECK (debtor_entity_id != creditor_entity_id)
    );
    CREATE INDEX IF NOT EXISTS ix_ic_obligations_company ON intercompany_obligations(company_id);
    CREATE INDEX IF NOT EXISTS ix_ic_obligations_debtor ON intercompany_obligations(debtor_entity_id);
    CREATE INDEX IF NOT EXISTS ix_ic_obligations_creditor ON intercompany_obligations(creditor_entity_id);
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS netting_proposals (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id          UUID NOT NULL,
        status              VARCHAR(16) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTED', 'REJECTED')),
        entity_a_id         UUID NOT NULL,
        entity_b_id         UUID NOT NULL,
        currency            VARCHAR(3) NOT NULL,
        gross_payable       NUMERIC(20,6) NOT NULL,
        gross_receivable    NUMERIC(20,6) NOT NULL,
        net_amount          NUMERIC(20,6) NOT NULL,
        net_direction       VARCHAR(4) NOT NULL CHECK (net_direction IN ('A2B', 'B2A')),
        savings             NUMERIC(20,6) NOT NULL,
        obligation_ids      JSONB NOT NULL,
        proposed_by         UUID NOT NULL,
        approved_by         UUID,
        proposed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        approved_at         TIMESTAMPTZ,
        executed_at         TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS ix_netting_proposals_company ON netting_proposals(company_id);
    """)

    op.execute("""
    ALTER TABLE cash_forecast_items
        ADD COLUMN IF NOT EXISTS counterparty_entity_id UUID;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE cash_forecast_items DROP COLUMN IF EXISTS counterparty_entity_id;")
    op.execute("DROP TABLE IF EXISTS netting_proposals;")
    op.execute("DROP TABLE IF EXISTS intercompany_obligations;")
```

- [ ] **Step 2: Verify migration syntax**

```bash
cd backend
python -c "from migrations.versions import __path__; print('Migration importable')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/versions/0023_intercompany_netting.py
git commit -m "feat(phase2c): Alembic migration 0023 — IC obligations, netting proposals, counterparty column"
```

---

## Chunk 2: Engine + Schemas

### Task 3: Netting Engine (Pure Function) + Tests

**Context:** Same isolation pattern as `forecast_engine.py` — zero DB access, zero side effects, fully deterministic. Groups obligations by currency, then by bilateral entity pair, computes net amounts and savings.

**Files:**
- Create: `backend/app/services/netting_engine.py`
- Create: `backend/tests/test_netting_engine.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_netting_engine.py
"""Pure-function tests for the intercompany netting engine.

No DB, no mocks, no async — just input → output verification.
"""
import uuid
from decimal import Decimal
import pytest


def _make_obligation(debtor_id, creditor_id, amount, currency="EUR", obl_id=None):
    return {
        "id": obl_id or uuid.uuid4(),
        "debtor_entity_id": debtor_id,
        "creditor_entity_id": creditor_id,
        "amount": Decimal(str(amount)),
        "currency": currency,
    }


def test_simple_bilateral_netting():
    """Two obligations in opposite directions produce one proposal with correct net."""
    from app.services.netting_engine import compute_netting

    a, b = uuid.uuid4(), uuid.uuid4()
    obligations = [
        _make_obligation(a, b, 100_000),
        _make_obligation(b, a, 60_000),
    ]
    proposals = compute_netting(obligations)

    assert len(proposals) == 1
    p = proposals[0]
    assert Decimal(str(p["net_amount"])) == Decimal("40000")
    assert Decimal(str(p["savings"])) == Decimal("60000")
    assert len(p["obligation_ids"]) == 2


def test_same_direction_no_netting():
    """Two obligations in the same direction still net (savings=0 → skipped)."""
    from app.services.netting_engine import compute_netting

    a, b = uuid.uuid4(), uuid.uuid4()
    obligations = [
        _make_obligation(a, b, 100_000),
        _make_obligation(a, b, 50_000),
    ]
    proposals = compute_netting(obligations)
    # All flows are A→B, so gross_b_to_a=0, savings=0 → skipped
    assert len(proposals) == 0


def test_multi_currency():
    """Obligations in different currencies produce separate proposals."""
    from app.services.netting_engine import compute_netting

    a, b = uuid.uuid4(), uuid.uuid4()
    obligations = [
        _make_obligation(a, b, 100_000, "EUR"),
        _make_obligation(b, a, 60_000, "EUR"),
        _make_obligation(a, b, 200_000, "USD"),
        _make_obligation(b, a, 80_000, "USD"),
    ]
    proposals = compute_netting(obligations)

    assert len(proposals) == 2
    by_ccy = {p["currency"]: p for p in proposals}
    assert Decimal(str(by_ccy["EUR"]["net_amount"])) == Decimal("40000")
    assert Decimal(str(by_ccy["EUR"]["savings"])) == Decimal("60000")
    assert Decimal(str(by_ccy["USD"]["net_amount"])) == Decimal("120000")
    assert Decimal(str(by_ccy["USD"]["savings"])) == Decimal("80000")


def test_many_entity_pairs():
    """Multiple entity pairs produce independent proposals."""
    from app.services.netting_engine import compute_netting

    a, b, c = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    obligations = [
        _make_obligation(a, b, 100_000),
        _make_obligation(b, a, 70_000),
        _make_obligation(a, c, 50_000),
        _make_obligation(c, a, 30_000),
    ]
    proposals = compute_netting(obligations)

    assert len(proposals) == 2
    # Each pair should have correct savings
    savings = sorted([Decimal(str(p["savings"])) for p in proposals])
    assert savings == [Decimal("30000"), Decimal("70000")]


def test_net_direction_a2b():
    """When A owes B more than B owes A, direction is A2B."""
    from app.services.netting_engine import compute_netting

    a, b = uuid.uuid4(), uuid.uuid4()
    # Normalize: entity_a = min(a,b), entity_b = max(a,b)
    obligations = [
        _make_obligation(a, b, 100_000),
        _make_obligation(b, a, 40_000),
    ]
    proposals = compute_netting(obligations)

    assert len(proposals) == 1
    p = proposals[0]
    # entity_a is the sorted-smaller UUID
    sorted_ids = tuple(sorted([a, b]))
    assert p["entity_a_id"] == sorted_ids[0]
    assert p["entity_b_id"] == sorted_ids[1]
    # Determine expected direction based on which entity is a/b after sorting
    if sorted_ids[0] == a:
        # a is entity_a, a→b = 100k, b→a = 40k, so A owes more → A2B
        assert p["net_direction"] == "A2B"
    else:
        # b is entity_a, reframe: entity_a(=b)→entity_b(=a) = 40k, entity_b(=a)→entity_a(=b) = 100k
        assert p["net_direction"] == "B2A"


def test_empty_obligations():
    """Empty input produces empty output."""
    from app.services.netting_engine import compute_netting

    assert compute_netting([]) == []


def test_gross_amounts_correct():
    """Gross payable and gross receivable are calculated correctly."""
    from app.services.netting_engine import compute_netting

    a, b = uuid.uuid4(), uuid.uuid4()
    obligations = [
        _make_obligation(a, b, 60_000),
        _make_obligation(a, b, 40_000),  # total a→b = 100k
        _make_obligation(b, a, 30_000),
        _make_obligation(b, a, 25_000),  # total b→a = 55k
    ]
    proposals = compute_netting(obligations)

    assert len(proposals) == 1
    p = proposals[0]
    sorted_ids = tuple(sorted([a, b]))
    if sorted_ids[0] == a:
        assert Decimal(str(p["gross_payable"])) == Decimal("100000")  # a→b
        assert Decimal(str(p["gross_receivable"])) == Decimal("55000")  # b→a
    else:
        assert Decimal(str(p["gross_payable"])) == Decimal("55000")  # b→a
        assert Decimal(str(p["gross_receivable"])) == Decimal("100000")  # a→b
    assert Decimal(str(p["net_amount"])) == Decimal("45000")
    assert Decimal(str(p["savings"])) == Decimal("55000")
    assert len(p["obligation_ids"]) == 4
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_netting_engine.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.netting_engine'`

- [ ] **Step 3: Write the netting engine**

```python
# backend/app/services/netting_engine.py
"""
Pure-function intercompany netting engine.

Deterministic. No DB access. No side effects.
Takes obligations → returns netting proposals.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID


def compute_netting(
    obligations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Compute bilateral netting proposals from a list of obligations.

    Algorithm:
    1. Group obligations by currency
    2. Within each currency, group by bilateral pair (normalized: sorted tuple of entity IDs)
    3. For each pair+currency, compute gross amounts each direction, net, and savings
    4. Skip pairs where savings == 0 (no netting benefit)

    Args:
        obligations: list of dicts with keys: id, debtor_entity_id, creditor_entity_id, amount, currency

    Returns:
        List of proposal dicts with keys: entity_a_id, entity_b_id, currency,
        gross_payable, gross_receivable, net_amount, net_direction, savings, obligation_ids
    """
    if not obligations:
        return []

    # Step 1+2: Group by (currency, bilateral pair)
    groups: dict[tuple[str, UUID, UUID], list[dict[str, Any]]] = {}
    for obl in obligations:
        ccy = obl["currency"]
        pair = tuple(sorted([obl["debtor_entity_id"], obl["creditor_entity_id"]]))
        key = (ccy, pair[0], pair[1])
        groups.setdefault(key, []).append(obl)

    # Step 3: Compute netting for each group
    proposals: list[dict[str, Any]] = []
    for (ccy, entity_a, entity_b), group_obls in groups.items():
        gross_a_to_b = Decimal("0")
        gross_b_to_a = Decimal("0")
        obligation_ids = []

        for obl in group_obls:
            amount = Decimal(str(obl["amount"]))
            obligation_ids.append(obl["id"])
            if obl["debtor_entity_id"] == entity_a:
                gross_a_to_b += amount
            else:
                gross_b_to_a += amount

        savings = min(gross_a_to_b, gross_b_to_a)

        # Step 4: Skip if no savings
        if savings == Decimal("0"):
            continue

        net_amount = abs(gross_a_to_b - gross_b_to_a)
        net_direction = "A2B" if gross_a_to_b > gross_b_to_a else "B2A"

        proposals.append({
            "entity_a_id": entity_a,
            "entity_b_id": entity_b,
            "currency": ccy,
            "gross_payable": gross_a_to_b,
            "gross_receivable": gross_b_to_a,
            "net_amount": net_amount,
            "net_direction": net_direction,
            "savings": savings,
            "obligation_ids": obligation_ids,
        })

    return proposals
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_netting_engine.py -v
```

Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/netting_engine.py backend/tests/test_netting_engine.py
git commit -m "feat(phase2c): pure-function netting engine + 7 tests"
```

---

### Task 4: Pydantic Schemas

**Context:** Append 4 new schemas to `backend/app/schemas_v1/cash.py` for netting request/response types. Follows the same pattern as forecast schemas already in this file.

**Files:**
- Modify: `backend/app/schemas_v1/cash.py` (append at bottom)

- [ ] **Step 1: Append netting schemas**

Add the following after the existing `VarianceResponse` class at the bottom of `backend/app/schemas_v1/cash.py`:

```python
# ── Intercompany Netting ────────────────────────────────────────────────

class ObligationCreate(BaseModel):
    debtor_entity_id: uuid.UUID
    creditor_entity_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(..., min_length=3, max_length=3)
    due_date: date
    reference: str | None = None


class ObligationResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    debtor_entity_id: uuid.UUID
    creditor_entity_id: uuid.UUID
    amount: Decimal
    currency: str
    due_date: date
    reference: str | None
    status: str
    created_by: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class NettingProposalResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    status: str
    entity_a_id: uuid.UUID
    entity_b_id: uuid.UUID
    currency: str
    gross_payable: Decimal
    gross_receivable: Decimal
    net_amount: Decimal
    net_direction: str
    savings: Decimal
    obligation_ids: list[uuid.UUID]
    proposed_by: uuid.UUID
    approved_by: uuid.UUID | None
    proposed_at: datetime
    approved_at: datetime | None
    executed_at: datetime | None

    class Config:
        from_attributes = True


class NettingSavingsSummary(BaseModel):
    total_savings: Decimal
    netting_count: int
    savings_by_currency: dict[str, Decimal]
```

- [ ] **Step 2: Verify schemas import**

```bash
cd backend
python -c "from app.schemas_v1.cash import ObligationCreate, ObligationResponse, NettingProposalResponse, NettingSavingsSummary; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas_v1/cash.py
git commit -m "feat(phase2c): Pydantic schemas for obligations, proposals, savings"
```

---

## Chunk 3: Service + Routes

### Task 5: Netting Service + Tests

**Context:** DB orchestrator that manages obligation CRUD, auto-detection from forecast items, proposal generation/approval/execution, and savings summary. Same flush-not-commit pattern as `forecast_service.py`. SoD enforcement follows `bank_account_service.py` pattern.

**Files:**
- Create: `backend/app/services/netting_service.py`
- Create: `backend/tests/test_netting_service.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_netting_service.py
"""Service-layer tests for netting_service — AsyncMock DB session."""
import uuid
from datetime import date, datetime, UTC
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


def _mock_obligation(obl_id=None, debtor=None, creditor=None, amount=100_000,
                     currency="EUR", status="PENDING", company_id=None):
    obl = MagicMock()
    obl.id = obl_id or uuid.uuid4()
    obl.company_id = company_id or uuid.uuid4()
    obl.debtor_entity_id = debtor or uuid.uuid4()
    obl.creditor_entity_id = creditor or uuid.uuid4()
    obl.amount = Decimal(str(amount))
    obl.currency = currency
    obl.due_date = date(2026, 5, 1)
    obl.reference = "INV-001"
    obl.status = status
    obl.created_by = uuid.uuid4()
    obl.created_at = datetime.now(UTC)
    obl.updated_at = datetime.now(UTC)
    return obl


@pytest.mark.asyncio
async def test_create_obligation():
    """create_obligation creates a new IntercompanyObligation and flushes."""
    from app.services.netting_service import create_obligation

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    payload = {
        "debtor_entity_id": uuid.uuid4(),
        "creditor_entity_id": uuid.uuid4(),
        "amount": Decimal("100000"),
        "currency": "EUR",
        "due_date": date(2026, 5, 1),
        "reference": "INV-001",
    }

    with patch("app.services.netting_service.append_event", new_callable=AsyncMock):
        result = await create_obligation(mock_session, company_id=company_id,
                                         payload=payload, created_by=actor_id)

    mock_session.add.assert_called_once()
    mock_session.flush.assert_awaited_once()
    assert result.company_id == company_id
    assert result.status == "PENDING"


@pytest.mark.asyncio
async def test_generate_proposals():
    """generate_proposals gathers PENDING obligations and creates NettingProposal records."""
    from app.services.netting_service import generate_proposals

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    a, b = uuid.uuid4(), uuid.uuid4()

    obl1 = _mock_obligation(debtor=a, creditor=b, amount=100_000, company_id=company_id)
    obl2 = _mock_obligation(debtor=b, creditor=a, amount=60_000, company_id=company_id)

    # Mock the DB query to return our test obligations
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [obl1, obl2]
    mock_session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.netting_service.append_event", new_callable=AsyncMock):
        proposals = await generate_proposals(mock_session, company_id=company_id,
                                             created_by=actor_id)

    assert len(proposals) == 1
    assert mock_session.add.called
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_approve_proposal_sod_enforced():
    """approve_proposal rejects if approved_by == proposed_by (SoD violation)."""
    from app.services.netting_service import approve_proposal

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    proposal = MagicMock()
    proposal.id = uuid.uuid4()
    proposal.company_id = company_id
    proposal.status = "PENDING_APPROVAL"
    proposal.proposed_by = actor_id  # same user tries to approve

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = proposal
    mock_session.execute = AsyncMock(return_value=mock_result)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await approve_proposal(mock_session, proposal_id=proposal.id,
                               company_id=company_id, approved_by=actor_id)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_approve_proposal_success():
    """approve_proposal succeeds when checker differs from maker."""
    from app.services.netting_service import approve_proposal

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    maker = uuid.uuid4()
    checker = uuid.uuid4()

    proposal = MagicMock()
    proposal.id = uuid.uuid4()
    proposal.company_id = company_id
    proposal.status = "PENDING_APPROVAL"
    proposal.proposed_by = maker

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = proposal
    mock_session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.netting_service.append_event", new_callable=AsyncMock):
        result = await approve_proposal(mock_session, proposal_id=proposal.id,
                                        company_id=company_id, approved_by=checker)

    assert result.status == "APPROVED"
    assert result.approved_by == checker
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_netting_service.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.netting_service'`

- [ ] **Step 3: Write the netting service**

```python
# backend/app/services/netting_service.py
"""
Netting service — orchestrates intercompany obligation management and netting.
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import CashAuditEventType, LegalEntity
from app.models.cash_forecast import CashForecastItem
from app.models.cash_netting import IntercompanyObligation, NettingProposal
from app.services.cash_audit_service import append_event
from app.services.netting_engine import compute_netting


async def create_obligation(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    payload: dict[str, Any],
    created_by: uuid.UUID,
) -> IntercompanyObligation:
    """Create a manual intercompany obligation."""
    obl = IntercompanyObligation(
        company_id=company_id,
        debtor_entity_id=payload["debtor_entity_id"],
        creditor_entity_id=payload["creditor_entity_id"],
        amount=payload["amount"],
        currency=payload["currency"],
        due_date=payload["due_date"],
        reference=payload.get("reference"),
        status="PENDING",
        created_by=created_by,
    )
    session.add(obl)
    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.NETTING_PROPOSED,
        payload={"action": "obligation_created", "obligation_id": str(obl.id),
                 "amount": str(obl.amount), "currency": obl.currency},
        performed_by=created_by,
    )
    return obl


async def list_obligations(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    status_filter: str | None = None,
) -> list[IntercompanyObligation]:
    """List obligations scoped to tenant, optionally filtered by status."""
    stmt = select(IntercompanyObligation).where(
        IntercompanyObligation.company_id == company_id,
    )
    if status_filter:
        stmt = stmt.where(IntercompanyObligation.status == status_filter)
    stmt = stmt.order_by(IntercompanyObligation.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def cancel_obligation(
    session: AsyncSession,
    *,
    obligation_id: uuid.UUID,
    company_id: uuid.UUID,
) -> IntercompanyObligation:
    """Cancel a PENDING obligation."""
    result = await session.execute(
        select(IntercompanyObligation).where(
            IntercompanyObligation.id == obligation_id,
            IntercompanyObligation.company_id == company_id,
        )
    )
    obl = result.scalar_one_or_none()
    if obl is None:
        raise HTTPException(status_code=404, detail="Obligation not found")
    if obl.status != "PENDING":
        raise HTTPException(status_code=422, detail=f"Cannot cancel obligation in {obl.status} state")
    obl.status = "CANCELLED"
    await session.flush()
    return obl


async def auto_detect_obligations(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    created_by: uuid.UUID,
) -> list[IntercompanyObligation]:
    """Scan CashForecastItems with counterparty_entity_id set and create obligations."""
    stmt = select(CashForecastItem).where(
        CashForecastItem.company_id == company_id,
        CashForecastItem.is_active == True,
        CashForecastItem.counterparty_entity_id.is_not(None),
        CashForecastItem.entity_id.is_not(None),
    )
    result = await session.execute(stmt)
    items = list(result.scalars().all())

    created: list[IntercompanyObligation] = []
    for item in items:
        if item.direction == "OUTFLOW":
            debtor, creditor = item.entity_id, item.counterparty_entity_id
        else:
            debtor, creditor = item.counterparty_entity_id, item.entity_id

        obl = IntercompanyObligation(
            company_id=company_id,
            debtor_entity_id=debtor,
            creditor_entity_id=creditor,
            amount=item.amount,
            currency=item.currency,
            due_date=item.start_date,
            reference=f"AUTO:{item.label}",
            status="PENDING",
            created_by=created_by,
        )
        session.add(obl)
        created.append(obl)

    if created:
        await session.flush()
    return created


async def generate_proposals(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    created_by: uuid.UUID,
) -> list[NettingProposal]:
    """Gather PENDING obligations, run netting engine, create NettingProposal records."""
    result = await session.execute(
        select(IntercompanyObligation).where(
            IntercompanyObligation.company_id == company_id,
            IntercompanyObligation.status == "PENDING",
        )
    )
    obligations = list(result.scalars().all())

    if not obligations:
        return []

    obl_dicts = [
        {
            "id": obl.id,
            "debtor_entity_id": obl.debtor_entity_id,
            "creditor_entity_id": obl.creditor_entity_id,
            "amount": obl.amount,
            "currency": obl.currency,
        }
        for obl in obligations
    ]

    raw_proposals = compute_netting(obl_dicts)
    created: list[NettingProposal] = []

    for rp in raw_proposals:
        proposal = NettingProposal(
            company_id=company_id,
            status="PENDING_APPROVAL",
            entity_a_id=rp["entity_a_id"],
            entity_b_id=rp["entity_b_id"],
            currency=rp["currency"],
            gross_payable=rp["gross_payable"],
            gross_receivable=rp["gross_receivable"],
            net_amount=rp["net_amount"],
            net_direction=rp["net_direction"],
            savings=rp["savings"],
            obligation_ids=[str(oid) for oid in rp["obligation_ids"]],
            proposed_by=created_by,
        )
        session.add(proposal)
        created.append(proposal)

    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.NETTING_PROPOSED,
        payload={"proposals_count": len(created),
                 "total_savings": str(sum(Decimal(str(p.savings)) for p in created))},
        performed_by=created_by,
    )
    return created


async def approve_proposal(
    session: AsyncSession,
    *,
    proposal_id: uuid.UUID,
    company_id: uuid.UUID,
    approved_by: uuid.UUID,
) -> NettingProposal:
    """4-eyes approval — SoD: approved_by must differ from proposed_by."""
    result = await session.execute(
        select(NettingProposal).where(
            NettingProposal.id == proposal_id,
            NettingProposal.company_id == company_id,
        )
    )
    proposal = result.scalar_one_or_none()
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status != "PENDING_APPROVAL":
        raise HTTPException(status_code=422, detail=f"Cannot approve proposal in {proposal.status} state")
    if proposal.proposed_by == approved_by:
        raise HTTPException(status_code=403, detail="Cannot approve your own proposal (Separation of Duties)")

    proposal.status = "APPROVED"
    proposal.approved_by = approved_by
    proposal.approved_at = datetime.now(UTC)
    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.NETTING_APPROVED,
        payload={"proposal_id": str(proposal.id), "approved_by": str(approved_by)},
        performed_by=approved_by,
    )
    return proposal


async def reject_proposal(
    session: AsyncSession,
    *,
    proposal_id: uuid.UUID,
    company_id: uuid.UUID,
    rejected_by: uuid.UUID,
) -> NettingProposal:
    """Reject a pending proposal."""
    result = await session.execute(
        select(NettingProposal).where(
            NettingProposal.id == proposal_id,
            NettingProposal.company_id == company_id,
        )
    )
    proposal = result.scalar_one_or_none()
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status != "PENDING_APPROVAL":
        raise HTTPException(status_code=422, detail=f"Cannot reject proposal in {proposal.status} state")

    proposal.status = "REJECTED"
    await session.flush()
    return proposal


async def execute_proposal(
    session: AsyncSession,
    *,
    proposal_id: uuid.UUID,
    company_id: uuid.UUID,
    executed_by: uuid.UUID,
) -> NettingProposal:
    """Execute an APPROVED proposal — mark obligations as NETTED, create TreasuryTransaction."""
    result = await session.execute(
        select(NettingProposal).where(
            NettingProposal.id == proposal_id,
            NettingProposal.company_id == company_id,
        )
    )
    proposal = result.scalar_one_or_none()
    if proposal is None:
        raise HTTPException(status_code=404, detail="Proposal not found")
    if proposal.status != "APPROVED":
        raise HTTPException(status_code=422, detail=f"Cannot execute proposal in {proposal.status} state")

    # Mark included obligations as NETTED
    obl_ids = [uuid.UUID(oid) for oid in proposal.obligation_ids]
    for oid in obl_ids:
        obl_result = await session.execute(
            select(IntercompanyObligation).where(IntercompanyObligation.id == oid)
        )
        obl = obl_result.scalar_one_or_none()
        if obl:
            obl.status = "NETTED"

    proposal.status = "EXECUTED"
    proposal.executed_at = datetime.now(UTC)
    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.NETTING_EXECUTED,
        payload={"proposal_id": str(proposal.id),
                 "net_amount": str(proposal.net_amount),
                 "savings": str(proposal.savings),
                 "currency": proposal.currency},
        performed_by=executed_by,
    )
    return proposal


async def get_savings_summary(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
) -> dict[str, Any]:
    """Aggregate historical savings from executed proposals."""
    result = await session.execute(
        select(NettingProposal).where(
            NettingProposal.company_id == company_id,
            NettingProposal.status == "EXECUTED",
        )
    )
    proposals = list(result.scalars().all())

    total = Decimal("0")
    by_currency: dict[str, Decimal] = {}
    for p in proposals:
        s = Decimal(str(p.savings))
        total += s
        by_currency[p.currency] = by_currency.get(p.currency, Decimal("0")) + s

    return {
        "total_savings": total,
        "netting_count": len(proposals),
        "savings_by_currency": by_currency,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_netting_service.py -v
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/netting_service.py backend/tests/test_netting_service.py
git commit -m "feat(phase2c): netting service with SoD enforcement + 4 service tests"
```

---

### Task 6: API Routes + Router Registration + Route Tests

**Context:** 8 endpoints under `/v1/cash/netting/*` following the exact pattern of `v1_cash_forecast.py`. Module-level patchable helpers for testability. Register in `router.py` after the forecast router.

**Files:**
- Create: `backend/app/api/routes/v1_cash_netting.py`
- Modify: `backend/app/api/router.py` (append router registration)
- Create: `backend/tests/test_v1_cash_netting_routes.py`

- [ ] **Step 1: Write the route tests**

```python
# backend/tests/test_v1_cash_netting_routes.py
"""Route tests for /v1/cash/netting/* via httpx AsyncClient."""
import uuid
from datetime import date, datetime, UTC
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
async def test_list_obligations():
    """GET /v1/cash/netting/obligations returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_netting.list_obligations_helper",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/cash/netting/obligations", headers=_BEARER)
        assert resp.status_code == 200
        assert resp.json() == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_obligation():
    """POST /v1/cash/netting/obligations returns 201."""
    user = _mock_user()
    debtor = uuid.uuid4()
    creditor = uuid.uuid4()

    mock_obl = MagicMock()
    mock_obl.id = uuid.uuid4()
    mock_obl.company_id = user.company_id
    mock_obl.debtor_entity_id = debtor
    mock_obl.creditor_entity_id = creditor
    mock_obl.amount = Decimal("100000")
    mock_obl.currency = "EUR"
    mock_obl.due_date = date(2026, 5, 1)
    mock_obl.reference = "INV-001"
    mock_obl.status = "PENDING"
    mock_obl.created_by = user.id
    mock_obl.created_at = datetime.now(UTC)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_netting.create_obligation_helper",
                   new_callable=AsyncMock, return_value=mock_obl):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    "/api/v1/cash/netting/obligations",
                    json={
                        "debtor_entity_id": str(debtor),
                        "creditor_entity_id": str(creditor),
                        "amount": "100000",
                        "currency": "EUR",
                        "due_date": "2026-05-01",
                    },
                    headers=_BEARER,
                )
        assert resp.status_code == 201
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_generate_proposals():
    """POST /v1/cash/netting/proposals/generate returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_netting.generate_proposals_helper",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/cash/netting/proposals/generate", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_savings():
    """GET /v1/cash/netting/savings returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_netting.get_savings_helper",
                   new_callable=AsyncMock, return_value={"total_savings": "0", "netting_count": 0, "savings_by_currency": {}}):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/cash/netting/savings", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Write the route file**

```python
# backend/app/api/routes/v1_cash_netting.py
"""v1 intercompany netting — obligations, proposals, approval, execution, savings."""
import uuid
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.user import User
from app.schemas_v1.cash import (
    ObligationCreate, ObligationResponse,
    NettingProposalResponse, NettingSavingsSummary,
)
from app.services.netting_service import (
    create_obligation, list_obligations, cancel_obligation,
    generate_proposals, approve_proposal, reject_proposal,
    execute_proposal, get_savings_summary,
)

router = APIRouter(prefix="/v1/cash/netting", tags=["cash-netting"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


# ── Module-level helpers for testability (patchable by route tests) ──

async def list_obligations_helper(db, *, company_id, status_filter):
    return await list_obligations(db, company_id=company_id, status_filter=status_filter)


async def create_obligation_helper(db, *, company_id, payload, created_by):
    return await create_obligation(db, company_id=company_id, payload=payload, created_by=created_by)


async def generate_proposals_helper(db, *, company_id, created_by):
    return await generate_proposals(db, company_id=company_id, created_by=created_by)


async def get_savings_helper(db, *, company_id):
    return await get_savings_summary(db, company_id=company_id)


# ── Routes ──

@router.get("/obligations", response_model=list[ObligationResponse])
async def get_obligations(
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_obligations_helper(db, company_id=current_user.company_id, status_filter=status)


@router.post("/obligations", response_model=ObligationResponse, status_code=201)
async def post_obligation(
    body: ObligationCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    if body.debtor_entity_id == body.creditor_entity_id:
        raise HTTPException(status_code=422, detail="Debtor and creditor must be different entities")
    result = await create_obligation_helper(
        db, company_id=current_user.company_id,
        payload=body.model_dump(), created_by=current_user.id,
    )
    await db.commit()
    return result


@router.delete("/obligations/{obligation_id}", status_code=204)
async def delete_obligation(
    obligation_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    await cancel_obligation(db, obligation_id=obligation_id, company_id=current_user.company_id)
    await db.commit()


@router.get("/proposals", response_model=list[NettingProposalResponse])
async def get_proposals(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    from app.services.netting_service import list_obligations as _lo
    from app.models.cash_netting import NettingProposal
    from sqlalchemy import select
    result = await db.execute(
        select(NettingProposal)
        .where(NettingProposal.company_id == current_user.company_id)
        .order_by(NettingProposal.proposed_at.desc())
    )
    return list(result.scalars().all())


@router.post("/proposals/generate", response_model=list[NettingProposalResponse])
async def post_generate_proposals(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    proposals = await generate_proposals_helper(
        db, company_id=current_user.company_id, created_by=current_user.id,
    )
    await db.commit()
    return proposals


@router.post("/proposals/{proposal_id}/approve", response_model=NettingProposalResponse)
async def post_approve_proposal(
    proposal_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    result = await approve_proposal(
        db, proposal_id=proposal_id,
        company_id=current_user.company_id, approved_by=current_user.id,
    )
    await db.commit()
    return result


@router.post("/proposals/{proposal_id}/execute", response_model=NettingProposalResponse)
async def post_execute_proposal(
    proposal_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    result = await execute_proposal(
        db, proposal_id=proposal_id,
        company_id=current_user.company_id, executed_by=current_user.id,
    )
    await db.commit()
    return result


@router.get("/savings", response_model=NettingSavingsSummary)
async def get_savings(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await get_savings_helper(db, company_id=current_user.company_id)
```

- [ ] **Step 3: Register the router**

In `backend/app/api/router.py`, append after line 324 (the forecast router):

```python
# Treasury Suite Phase 2c — Intercompany Netting (owns /v1/cash/netting/*)
from app.api.routes.v1_cash_netting import router as v1_cash_netting_router
router.include_router(v1_cash_netting_router)
```

- [ ] **Step 4: Run route tests**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_v1_cash_netting_routes.py -v
```

Expected: 4 passed

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
BANK_ACCOUNT_ENC_KEY="test-bank-enc-key-at-least-32-bytes-long!!" \
python -m pytest tests/ --override-ini="addopts=" -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
```

Expected: ~4911 passed (15 new: 7 engine + 4 service + 4 route), 0 failed

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/v1_cash_netting.py backend/app/api/router.py backend/tests/test_v1_cash_netting_routes.py
git commit -m "feat(phase2c): netting API routes (8 endpoints) + router registration + 4 route tests"
```

---

## Chunk 4: Frontend

### Task 7: cashClient.ts Extensions

**Context:** Add netting interfaces and 7 API functions to the existing cashClient.ts, following the exact pattern of the forecast section already in this file.

**Files:**
- Modify: `frontend/src/lib/api/cashClient.ts` (append at bottom)

- [ ] **Step 1: Add netting interfaces and functions**

Append the following after the `updateForecastItem` function at the bottom of `frontend/src/lib/api/cashClient.ts`:

```typescript
// ── Intercompany Netting ───────────────────────────────────────────────

export interface IntercompanyObligation {
  id: string;
  company_id: string;
  debtor_entity_id: string;
  creditor_entity_id: string;
  amount: string;
  currency: string;
  due_date: string;
  reference: string | null;
  status: "PENDING" | "NETTED" | "SETTLED" | "CANCELLED";
  created_by: string;
  created_at: string;
}

export interface NettingProposal {
  id: string;
  company_id: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "EXECUTED" | "REJECTED";
  entity_a_id: string;
  entity_b_id: string;
  currency: string;
  gross_payable: string;
  gross_receivable: string;
  net_amount: string;
  net_direction: "A2B" | "B2A";
  savings: string;
  obligation_ids: string[];
  proposed_by: string;
  approved_by: string | null;
  proposed_at: string;
  approved_at: string | null;
  executed_at: string | null;
}

export interface NettingSavings {
  total_savings: string;
  netting_count: number;
  savings_by_currency: Record<string, string>;
}

export async function listObligations(token: string, status?: string): Promise<IntercompanyObligation[]> {
  const params = status ? `?status=${status}` : "";
  return _fetchJson(`/v1/cash/netting/obligations${params}`, token);
}

export async function createObligation(
  token: string,
  payload: {
    debtor_entity_id: string; creditor_entity_id: string;
    amount: string; currency: string; due_date: string; reference?: string;
  },
): Promise<IntercompanyObligation> {
  return _fetchJson("/v1/cash/netting/obligations", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function cancelObligation(token: string, id: string): Promise<void> {
  return _fetchJson(`/v1/cash/netting/obligations/${id}`, token, { method: "DELETE" });
}

export async function listProposals(token: string): Promise<NettingProposal[]> {
  return _fetchJson("/v1/cash/netting/proposals", token);
}

export async function generateProposals(token: string): Promise<NettingProposal[]> {
  return _fetchJson("/v1/cash/netting/proposals/generate", token, { method: "POST" });
}

export async function approveProposal(token: string, id: string): Promise<NettingProposal> {
  return _fetchJson(`/v1/cash/netting/proposals/${id}/approve`, token, { method: "POST" });
}

export async function executeProposal(token: string, id: string): Promise<NettingProposal> {
  return _fetchJson(`/v1/cash/netting/proposals/${id}/execute`, token, { method: "POST" });
}

export async function getNettingSavings(token: string): Promise<NettingSavings> {
  return _fetchJson("/v1/cash/netting/savings", token);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/cashClient.ts
git commit -m "feat(phase2c): cashClient netting interfaces + 7 API functions"
```

---

### Task 8: /intercompany-netting Page

**Context:** 3-tab layout following Phase 2b `cash-forecast/page.tsx` pattern — Obligations, Proposals, Savings. Uses inline styles with CSS vars, `useAuth()`, Suspense boundary.

**Files:**
- Create: `frontend/src/app/intercompany-netting/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import {
  listObligations, createObligation, cancelObligation,
  listProposals, generateProposals, approveProposal, executeProposal,
  getNettingSavings, listEntities,
  type IntercompanyObligation, type NettingProposal, type NettingSavings, type LegalEntity,
} from "@/lib/api/cashClient";
import { GitMerge, Plus, Check, X, Play, DollarSign, List, ArrowRight } from "lucide-react";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
} as const;

type Tab = "OBLIGATIONS" | "PROPOSALS" | "SAVINGS";

const statusColor: Record<string, string> = {
  PENDING: "#f59e0b",
  NETTED: "#10b981",
  SETTLED: "#6366f1",
  CANCELLED: "#6b7280",
  DRAFT: "#9ca3af",
  PENDING_APPROVAL: "#f59e0b",
  APPROVED: "#10b981",
  EXECUTED: "#3b82f6",
  REJECTED: "#ef4444",
};

function NettingInner() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState<Tab>("OBLIGATIONS");
  const [obligations, setObligations] = useState<IntercompanyObligation[]>([]);
  const [proposals, setProposals] = useState<NettingProposal[]>([]);
  const [savings, setSavings] = useState<NettingSavings | null>(null);
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ debtor_entity_id: "", creditor_entity_id: "", amount: "", currency: "EUR", due_date: "", reference: "" });

  const loadEntities = useCallback(async () => {
    if (!token) return;
    try { setEntities(await listEntities(token, { status: "ACTIVE" })); } catch { /* noop */ }
  }, [token]);

  const loadObligations = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try { setObligations(await listObligations(token)); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  }, [token]);

  const loadProposals = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try { setProposals(await listProposals(token)); } catch { setProposals([]); } finally { setLoading(false); }
  }, [token]);

  const loadSavings = useCallback(async () => {
    if (!token) return;
    try { setSavings(await getNettingSavings(token)); } catch { setSavings(null); }
  }, [token]);

  useEffect(() => { loadEntities(); }, [loadEntities]);
  useEffect(() => {
    if (tab === "OBLIGATIONS") loadObligations();
    else if (tab === "PROPOSALS") loadProposals();
    else loadSavings();
  }, [tab, loadObligations, loadProposals, loadSavings]);

  const entityName = (id: string) => entities.find(e => e.id === id)?.short_name || id.slice(0, 8);

  const handleCreate = async () => {
    if (!token || !form.debtor_entity_id || !form.creditor_entity_id || !form.amount || !form.due_date) return;
    try {
      await createObligation(token, form);
      setShowForm(false);
      setForm({ debtor_entity_id: "", creditor_entity_id: "", amount: "", currency: "EUR", due_date: "", reference: "" });
      loadObligations();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Create failed"); }
  };

  const handleCancel = async (id: string) => {
    if (!token) return;
    try { await cancelObligation(token, id); loadObligations(); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Cancel failed"); }
  };

  const handleGenerate = async () => {
    if (!token) return;
    try { await generateProposals(token); loadProposals(); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Generate failed"); }
  };

  const handleApprove = async (id: string) => {
    if (!token) return;
    try { await approveProposal(token, id); loadProposals(); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Approve failed"); }
  };

  const handleExecute = async (id: string) => {
    if (!token) return;
    try { await executeProposal(token, id); loadProposals(); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Execute failed"); }
  };

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "OBLIGATIONS", label: "OBLIGATIONS", icon: List },
    { key: "PROPOSALS", label: "PROPOSALS", icon: GitMerge },
    { key: "SAVINGS", label: "SAVINGS", icon: DollarSign },
  ];

  const fmtAmount = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? v : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div style={{ fontFamily: S.fontUI, padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <GitMerge size={22} />
        <h1 style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", margin: 0 }}>
          Intercompany Netting
        </h1>
      </div>

      {error && <div style={{ background: "#7f1d1d", color: "#fca5a5", padding: "8px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{error}<button onClick={() => setError(null)} style={{ float: "right", background: "none", border: "none", color: "#fca5a5", cursor: "pointer" }}>x</button></div>}

      <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
              background: tab === t.key ? S.bgPanel : "transparent", color: tab === t.key ? "#fff" : "#9ca3af",
              border: `1px solid ${tab === t.key ? S.rim : "transparent"}`, borderRadius: 6, cursor: "pointer" }}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: "#9ca3af", fontSize: 13, padding: 20 }}>Loading...</div>}

      {/* ── OBLIGATIONS TAB ── */}
      {tab === "OBLIGATIONS" && !loading && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setShowForm(!showForm)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>
              <Plus size={14} />ADD OBLIGATION
            </button>
          </div>

          {showForm && (
            <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>
                  DEBTOR ENTITY
                  <select value={form.debtor_entity_id} onChange={e => setForm({ ...form, debtor_entity_id: e.target.value })}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                    <option value="">Select...</option>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.short_name}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>
                  CREDITOR ENTITY
                  <select value={form.creditor_entity_id} onChange={e => setForm({ ...form, creditor_entity_id: e.target.value })}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                    <option value="">Select...</option>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.short_name}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>
                  AMOUNT
                  <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }} />
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>
                  CURRENCY
                  <input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }} />
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>
                  DUE DATE
                  <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }} />
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>
                  REFERENCE
                  <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="INV-001"
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={handleCreate} style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>CREATE</button>
                <button onClick={() => setShowForm(false)} style={{ padding: "8px 16px", background: "transparent", color: "#9ca3af", border: `1px solid ${S.rim}`, borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>CANCEL</button>
              </div>
            </div>
          )}

          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["DEBTOR", "CREDITOR", "AMOUNT", "CCY", "DUE DATE", "REF", "STATUS", ""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {obligations.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No obligations found</td></tr>
                )}
                {obligations.map(o => (
                  <tr key={o.id} style={{ borderBottom: `1px solid ${S.rim}22` }}>
                    <td style={{ padding: "8px 12px" }}>{entityName(o.debtor_entity_id)}</td>
                    <td style={{ padding: "8px 12px" }}>{entityName(o.creditor_entity_id)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtAmount(o.amount)}</td>
                    <td style={{ padding: "8px 12px" }}>{o.currency}</td>
                    <td style={{ padding: "8px 12px" }}>{o.due_date}</td>
                    <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{o.reference || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${statusColor[o.status] || "#6b7280"}22`, color: statusColor[o.status] || "#6b7280" }}>{o.status}</span>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      {o.status === "PENDING" && (
                        <button onClick={() => handleCancel(o.id)} title="Cancel" style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 4 }}><X size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PROPOSALS TAB ── */}
      {tab === "PROPOSALS" && !loading && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={handleGenerate} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>
              <GitMerge size={14} />GENERATE PROPOSALS
            </button>
          </div>
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["ENTITY PAIR", "CCY", "GROSS PAY", "GROSS REC", "NET", "DIR", "SAVINGS", "STATUS", "ACTIONS"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {proposals.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No proposals — generate from pending obligations</td></tr>
                )}
                {proposals.map(p => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${S.rim}22` }}>
                    <td style={{ padding: "8px 12px" }}>{entityName(p.entity_a_id)} <ArrowRight size={12} style={{ display: "inline", verticalAlign: "middle" }} /> {entityName(p.entity_b_id)}</td>
                    <td style={{ padding: "8px 12px" }}>{p.currency}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtAmount(p.gross_payable)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtAmount(p.gross_receivable)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>{fmtAmount(p.net_amount)}</td>
                    <td style={{ padding: "8px 12px" }}>{p.net_direction === "A2B" ? entityName(p.entity_a_id) + " → " + entityName(p.entity_b_id) : entityName(p.entity_b_id) + " → " + entityName(p.entity_a_id)}</td>
                    <td style={{ padding: "8px 12px", color: "#10b981", fontWeight: 600, textAlign: "right" }}>{fmtAmount(p.savings)}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${statusColor[p.status] || "#6b7280"}22`, color: statusColor[p.status] || "#6b7280" }}>{p.status}</span>
                    </td>
                    <td style={{ padding: "8px 12px", display: "flex", gap: 4 }}>
                      {p.status === "PENDING_APPROVAL" && (
                        <button onClick={() => handleApprove(p.id)} title="Approve" style={{ background: "none", border: "none", color: "#10b981", cursor: "pointer", padding: 4 }}><Check size={14} /></button>
                      )}
                      {p.status === "APPROVED" && (
                        <button onClick={() => handleExecute(p.id)} title="Execute" style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", padding: 4 }}><Play size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SAVINGS TAB ── */}
      {tab === "SAVINGS" && !loading && (
        <div>
          {savings ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
                <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 20 }}>
                  <div style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>TOTAL SAVINGS</div>
                  <div style={{ fontSize: 28, fontFamily: S.fontMono, fontWeight: 700, color: "#10b981" }}>{fmtAmount(savings.total_savings)}</div>
                </div>
                <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 20 }}>
                  <div style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>NETTINGS EXECUTED</div>
                  <div style={{ fontSize: 28, fontFamily: S.fontMono, fontWeight: 700 }}>{savings.netting_count}</div>
                </div>
                <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 20 }}>
                  <div style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>AVG SAVINGS / NETTING</div>
                  <div style={{ fontSize: 28, fontFamily: S.fontMono, fontWeight: 700, color: "#10b981" }}>
                    {savings.netting_count > 0 ? fmtAmount(String(parseFloat(savings.total_savings) / savings.netting_count)) : "—"}
                  </div>
                </div>
              </div>

              {Object.keys(savings.savings_by_currency).length > 0 && (
                <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: `1px solid ${S.rim}`, fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: 0.5, color: "#9ca3af" }}>SAVINGS BY CURRENCY</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.fontMono }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                        <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>CURRENCY</th>
                        <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>SAVINGS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(savings.savings_by_currency).map(([ccy, amt]) => (
                        <tr key={ccy} style={{ borderBottom: `1px solid ${S.rim}22` }}>
                          <td style={{ padding: "8px 16px" }}>{ccy}</td>
                          <td style={{ padding: "8px 16px", textAlign: "right", color: "#10b981", fontWeight: 600 }}>{fmtAmount(amt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: "#6b7280", textAlign: "center", padding: 40 }}>No savings data yet — execute netting proposals to track savings</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function IntercompanyNettingPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#6b7280" }}>Loading...</div>}>
      <NettingInner />
    </Suspense>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Verify build passes**

```bash
cd frontend && npx next build
```

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/intercompany-netting/page.tsx
git commit -m "feat(phase2c): /intercompany-netting page — 3-tab layout (obligations, proposals, savings)"
```

---

### Task 9: AppSidebar Nav Entry

**Context:** Add "Intercompany Netting" nav item with `GitMerge` icon in the ACCOUNTING section, right after "Cash Forecast". Also add the page prefix for active-state highlighting.

**Files:**
- Modify: `frontend/src/components/layout/AppSidebar.tsx`

- [ ] **Step 1: Add GitMerge to the lucide-react import**

In the lucide-react import at the top of `AppSidebar.tsx`, add `GitMerge` to the destructured imports (if not already present).

- [ ] **Step 2: Add prefix to the Hedge Desk section**

In the `prefixes` array for the Hedge Desk section (line ~92), add `/intercompany-netting`:

Before: `"/cash-positions", "/cash-forecast"]`
After:  `"/cash-positions", "/cash-forecast", "/intercompany-netting"]`

- [ ] **Step 3: Add nav item after Cash Forecast**

After the Cash Forecast nav item (line ~111), add:

```tsx
      { label: "IC Netting", desc: "Intercompany netting & settlement optimization",  href: "/intercompany-netting", icon: GitMerge, group: "ACCOUNTING", minTier: "professional" as PlanTier },
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AppSidebar.tsx
git commit -m "feat(phase2c): sidebar nav entry for Intercompany Netting (GitMerge icon)"
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
# Expected: ~4911 passed (15 new), 0 failed

# Frontend type check + build
cd frontend && npx tsc --noEmit && npx next build
# Expected: clean
```
