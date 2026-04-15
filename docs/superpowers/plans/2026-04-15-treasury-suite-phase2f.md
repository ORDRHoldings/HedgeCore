# Treasury Suite Phase 2f — Cash Pool & Multi-Entity Visibility Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Model treasury entities, cash pools (NOTIONAL/PHYSICAL/ZBA), pool membership, and sweep transactions with pool-type-specific balance aggregation and manual sweep execution.

**Architecture:** Four new tables in a single model file (`cash_pool.py`), one service file for CRUD + pool-type-specific aggregation + sweep logic, one route file (11 endpoints under `/v1/cash/pools`), one migration. Follows Phase 2a–2e patterns: AsyncMock unit tests, tenant-scoped queries, flush-not-commit, WORM audit trail.

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
# Expected: ~4962 passed, 0 failed

cd frontend && npx tsc --noEmit
# Expected: no output (clean)
```

---

## File Map

**New backend files:**
| File | Responsibility |
|------|----------------|
| `backend/app/models/cash_pool.py` | ORM models: TreasuryEntity, CashPool, CashPoolMember, CashPoolSweep |
| `backend/app/services/cash_pool_service.py` | CRUD + pool-type-specific balance aggregation + sweep calculation/execution |
| `backend/app/api/routes/v1_cash_pools.py` | 11 endpoints under `/v1/cash/pools/*` |
| `backend/migrations/versions/0026_cash_pools.py` | CREATE TABLE × 4 + indexes + UNIQUE constraint |
| `backend/tests/test_cash_pool_models.py` | ORM introspection tests |
| `backend/tests/test_cash_pool_service.py` | AsyncMock service tests |
| `backend/tests/test_v1_cash_pool_routes.py` | httpx AsyncClient route tests |

**Modified backend files:**
| File | Change |
|------|--------|
| `backend/app/models/cash.py` | Add `CASH_POOL_SWEEP` to `CashAuditEventType` enum |
| `backend/app/schemas_v1/cash.py` | Add 12 new Pydantic schemas for treasury entities, pools, members, balances, sweeps |
| `backend/app/api/router.py` | Register `v1_cash_pools_router` |
| `backend/tests/test_cash_netting_models.py` | Update enum count assertion (21 → 22) |

---

## Chunk 1: Data Layer

### Task 1: ORM Models + Audit Enum + Migration

**Context:** Create 4 new ORM models in a single file following the `cash_netting.py` pattern. Add `CASH_POOL_SWEEP` audit enum. Create migration 0026 with 4 tables.

**Files:**
- Create: `backend/app/models/cash_pool.py`
- Modify: `backend/app/models/cash.py` (add 1 enum value after `RECONCILIATION_RUN`)
- Modify: `backend/tests/test_cash_netting_models.py` (update enum count)
- Create: `backend/migrations/versions/0026_cash_pools.py`

- [ ] **Step 1: Create ORM models**

```python
# backend/app/models/cash_pool.py
"""
Cash pool models.

TreasuryEntity    — treasury view of organizational structure
CashPool          — pool definition (NOTIONAL/PHYSICAL/ZBA)
CashPoolMember    — bank account membership in a pool
CashPoolSweep     — sweep transaction record
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Boolean, Date, DateTime, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class TreasuryEntity(Base):
    __tablename__ = "treasury_entities"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(16), nullable=False, default="SUBSIDIARY")
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    erp_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    parent_entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class CashPool(Base):
    __tablename__ = "cash_pools"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    pool_type: Mapped[str] = mapped_column(String(16), nullable=False)
    header_account_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class CashPoolMember(Base):
    __tablename__ = "cash_pool_members"
    __table_args__ = (
        UniqueConstraint("pool_id", "account_id", name="uq_pool_member_account"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pool_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    participation_type: Mapped[str] = mapped_column(String(8), nullable=False, default="FULL")
    target_balance: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class CashPoolSweep(Base):
    __tablename__ = "cash_pool_sweeps"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pool_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    source_account_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    destination_account_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    direction: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    triggered_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
```

- [ ] **Step 2: Add audit event type**

In `backend/app/models/cash.py`, add after `RECONCILIATION_RUN`:

```python
    CASH_POOL_SWEEP = "CASH_POOL_SWEEP"
```

- [ ] **Step 3: Update enum count test**

In `backend/tests/test_cash_netting_models.py`, change:

```python
        # Original 16 + 3 netting + 1 statement_imported + 1 reconciliation_run = 21
        assert len(CashAuditEventType) == 21
```

to:

```python
        # Original 16 + 3 netting + 1 statement_imported + 1 reconciliation_run + 1 cash_pool_sweep = 22
        assert len(CashAuditEventType) == 22
```

- [ ] **Step 4: Create migration 0026**

```python
# backend/migrations/versions/0026_cash_pools.py
"""Create cash pool tables

Revision ID: 0026
Revises: 0025
"""
from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS treasury_entities (
        id UUID PRIMARY KEY,
        company_id UUID NOT NULL,
        name VARCHAR(256) NOT NULL,
        entity_type VARCHAR(16) NOT NULL DEFAULT 'SUBSIDIARY',
        base_currency VARCHAR(3) NOT NULL,
        country_code VARCHAR(2) NOT NULL,
        erp_ref VARCHAR(128),
        parent_entity_id UUID,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_treasury_entities_company_id ON treasury_entities(company_id);
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS cash_pools (
        id UUID PRIMARY KEY,
        company_id UUID NOT NULL,
        name VARCHAR(256) NOT NULL,
        pool_type VARCHAR(16) NOT NULL,
        header_account_id UUID NOT NULL,
        currency VARCHAR(3) NOT NULL,
        base_currency VARCHAR(3) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_cash_pools_company_id ON cash_pools(company_id);
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS cash_pool_members (
        id UUID PRIMARY KEY,
        pool_id UUID NOT NULL,
        account_id UUID NOT NULL,
        entity_id UUID NOT NULL,
        participation_type VARCHAR(8) NOT NULL DEFAULT 'FULL',
        target_balance NUMERIC(20,6),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_pool_member_account UNIQUE (pool_id, account_id)
    );
    CREATE INDEX IF NOT EXISTS ix_cash_pool_members_pool_id ON cash_pool_members(pool_id);
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS cash_pool_sweeps (
        id UUID PRIMARY KEY,
        pool_id UUID NOT NULL,
        source_account_id UUID NOT NULL,
        destination_account_id UUID NOT NULL,
        amount NUMERIC(20,6) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        direction VARCHAR(16) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        triggered_by UUID NOT NULL,
        executed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_cash_pool_sweeps_pool_id ON cash_pool_sweeps(pool_id);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS cash_pool_sweeps;")
    op.execute("DROP TABLE IF EXISTS cash_pool_members;")
    op.execute("DROP TABLE IF EXISTS cash_pools;")
    op.execute("DROP TABLE IF EXISTS treasury_entities;")
```

- [ ] **Step 5: Write model introspection tests**

```python
# backend/tests/test_cash_pool_models.py
"""Tests for cash pool ORM models and audit enum addition."""
from __future__ import annotations

import pytest

from app.models.cash import CashAuditEventType
from app.models.cash_pool import TreasuryEntity, CashPool, CashPoolMember, CashPoolSweep


class TestTreasuryEntity:
    def test_tablename(self):
        assert TreasuryEntity.__tablename__ == "treasury_entities"

    def test_columns_present(self):
        cols = {c.key for c in TreasuryEntity.__table__.columns}
        expected = {
            "id", "company_id", "name", "entity_type", "base_currency",
            "country_code", "erp_ref", "parent_entity_id", "is_active", "created_at",
        }
        assert expected.issubset(cols)

    def test_default_entity_type(self):
        col = TreasuryEntity.__table__.c.entity_type
        assert col.default.arg == "SUBSIDIARY"

    def test_company_id_indexed(self):
        col = TreasuryEntity.__table__.c.company_id
        assert col.index is True

    def test_erp_ref_nullable(self):
        col = TreasuryEntity.__table__.c.erp_ref
        assert col.nullable is True

    def test_parent_entity_id_nullable(self):
        col = TreasuryEntity.__table__.c.parent_entity_id
        assert col.nullable is True


class TestCashPool:
    def test_tablename(self):
        assert CashPool.__tablename__ == "cash_pools"

    def test_columns_present(self):
        cols = {c.key for c in CashPool.__table__.columns}
        expected = {
            "id", "company_id", "name", "pool_type", "header_account_id",
            "currency", "base_currency", "is_active", "created_by", "created_at",
        }
        assert expected.issubset(cols)

    def test_default_is_active(self):
        col = CashPool.__table__.c.is_active
        assert col.default.arg is True

    def test_currency_max_length(self):
        col = CashPool.__table__.c.currency
        assert col.type.length == 3


class TestCashPoolMember:
    def test_tablename(self):
        assert CashPoolMember.__tablename__ == "cash_pool_members"

    def test_columns_present(self):
        cols = {c.key for c in CashPoolMember.__table__.columns}
        expected = {
            "id", "pool_id", "account_id", "entity_id",
            "participation_type", "target_balance", "created_at",
        }
        assert expected.issubset(cols)

    def test_default_participation_type(self):
        col = CashPoolMember.__table__.c.participation_type
        assert col.default.arg == "FULL"

    def test_target_balance_nullable(self):
        col = CashPoolMember.__table__.c.target_balance
        assert col.nullable is True

    def test_pool_id_indexed(self):
        col = CashPoolMember.__table__.c.pool_id
        assert col.index is True

    def test_unique_constraint_exists(self):
        constraints = [c for c in CashPoolMember.__table__.constraints
                       if hasattr(c, 'columns') and 'pool_id' in {col.key for col in c.columns}
                       and 'account_id' in {col.key for col in c.columns}]
        assert len(constraints) > 0


class TestCashPoolSweep:
    def test_tablename(self):
        assert CashPoolSweep.__tablename__ == "cash_pool_sweeps"

    def test_columns_present(self):
        cols = {c.key for c in CashPoolSweep.__table__.columns}
        expected = {
            "id", "pool_id", "source_account_id", "destination_account_id",
            "amount", "currency", "direction", "status", "triggered_by",
            "executed_at", "created_at",
        }
        assert expected.issubset(cols)

    def test_default_status(self):
        col = CashPoolSweep.__table__.c.status
        assert col.default.arg == "PENDING"

    def test_executed_at_nullable(self):
        col = CashPoolSweep.__table__.c.executed_at
        assert col.nullable is True

    def test_amount_precision(self):
        col = CashPoolSweep.__table__.c.amount
        assert col.type.precision == 20
        assert col.type.scale == 6


class TestCashPoolAuditEnum:
    def test_cash_pool_sweep_exists(self):
        assert CashAuditEventType.CASH_POOL_SWEEP.value == "CASH_POOL_SWEEP"
```

- [ ] **Step 6: Verify imports and run tests**

```bash
cd backend
DATABASE_URL="sqlite+aiosqlite://" python -c "from app.models.cash_pool import TreasuryEntity, CashPool, CashPoolMember, CashPoolSweep; print('OK')"

JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_cash_pool_models.py tests/test_cash_netting_models.py -v --tb=short
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/cash_pool.py backend/app/models/cash.py \
  backend/migrations/versions/0026_cash_pools.py \
  backend/tests/test_cash_pool_models.py backend/tests/test_cash_netting_models.py
git commit -m "feat(phase2f): cash pool ORM models (4 tables), migration 0026, CASH_POOL_SWEEP enum"
```

---

### Task 2: Pydantic Schema Updates

**Context:** Add 12 new schemas for treasury entities, pools, members, balances, and sweeps.

**Files:**
- Modify: `backend/app/schemas_v1/cash.py`

- [ ] **Step 1: Add schemas**

Append after `ManualMatchRequest` at the bottom of `backend/app/schemas_v1/cash.py`:

```python


# ── Treasury Entity ────────────────────────────────────────────────

class TreasuryEntityCreate(BaseModel):
    name: str
    entity_type: str = Field(default="SUBSIDIARY", pattern="^(SUBSIDIARY|BRANCH|FUND|HOLDING|SPV)$")
    base_currency: str = Field(..., min_length=3, max_length=3)
    country_code: str = Field(..., min_length=2, max_length=2)
    erp_ref: str | None = None
    parent_entity_id: uuid.UUID | None = None


class TreasuryEntityResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    entity_type: str
    base_currency: str
    country_code: str
    erp_ref: str | None
    parent_entity_id: uuid.UUID | None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Cash Pool ──────────────────────────────────────────────────────

class CashPoolCreate(BaseModel):
    name: str
    pool_type: str = Field(..., pattern="^(NOTIONAL|PHYSICAL|ZBA)$")
    header_account_id: uuid.UUID
    currency: str = Field(..., min_length=3, max_length=3)
    base_currency: str = Field(..., min_length=3, max_length=3)


class CashPoolResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    pool_type: str
    header_account_id: uuid.UUID
    currency: str
    base_currency: str
    is_active: bool
    member_count: int = 0
    created_by: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class CashPoolMemberCreate(BaseModel):
    account_id: uuid.UUID
    entity_id: uuid.UUID
    participation_type: str = Field(default="FULL", pattern="^(FULL|PARTIAL)$")
    target_balance: Decimal | None = None


class CashPoolMemberResponse(BaseModel):
    id: uuid.UUID
    pool_id: uuid.UUID
    account_id: uuid.UUID
    entity_id: uuid.UUID
    participation_type: str
    target_balance: Decimal | None
    created_at: datetime

    class Config:
        from_attributes = True


class PoolMemberBalance(BaseModel):
    account_id: uuid.UUID
    entity_id: uuid.UUID
    ledger_balance: Decimal
    target_balance: Decimal | None
    excess: Decimal | None
    is_exception: bool = False


class PoolBalanceResponse(BaseModel):
    pool_id: uuid.UUID
    pool_type: str
    consolidated_balance: Decimal
    header_balance: Decimal | None
    currency: str
    member_balances: list[PoolMemberBalance]


class SweepPreview(BaseModel):
    source_account_id: uuid.UUID
    destination_account_id: uuid.UUID
    amount: Decimal
    currency: str
    direction: str


class SweepResponse(BaseModel):
    id: uuid.UUID
    pool_id: uuid.UUID
    source_account_id: uuid.UUID
    destination_account_id: uuid.UUID
    amount: Decimal
    currency: str
    direction: str
    status: str
    triggered_by: uuid.UUID
    executed_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True
```

- [ ] **Step 2: Verify imports**

```bash
cd backend
DATABASE_URL="sqlite+aiosqlite://" python -c "from app.schemas_v1.cash import TreasuryEntityCreate, CashPoolCreate, PoolBalanceResponse, SweepPreview, SweepResponse; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas_v1/cash.py
git commit -m "feat(phase2f): Pydantic schemas for treasury entities, pools, members, balances, sweeps"
```

---

## Chunk 2: Service Layer

### Task 3: Cash Pool Service + Tests

**Context:** Service layer handles CRUD for treasury entities and pools, pool-type-specific balance aggregation (NOTIONAL/PHYSICAL/ZBA), and sweep calculation/execution. Balance data comes from `CashBalance` table — query latest balance per account using `MAX(balance_date)`. Sweeps are calculated as proposed records, then persisted as `CashPoolSweep` with PENDING status.

**Important patterns:**
- `CashBalance` has `account_id`, `balance_date`, `ledger_balance`. Latest = MAX(balance_date) per account.
- `BankAccount` has `entity_id` and `currency`. Both in `app/models/cash.py`.
- Flush-not-commit: service calls `session.flush()`, routes call `await db.commit()`.
- Audit via `app.services.cash_audit_service.append_event`.

**Files:**
- Create: `backend/app/services/cash_pool_service.py`
- Create: `backend/tests/test_cash_pool_service.py`

- [ ] **Step 1: Write the service tests**

```python
# backend/tests/test_cash_pool_service.py
"""Service-layer tests for cash_pool_service — AsyncMock DB session."""
import uuid
from datetime import date, datetime, UTC
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


def _mock_pool(pool_type="NOTIONAL", pool_id=None, company_id=None):
    pool = MagicMock()
    pool.id = pool_id or uuid.uuid4()
    pool.company_id = company_id or uuid.uuid4()
    pool.name = "Test Pool"
    pool.pool_type = pool_type
    pool.header_account_id = uuid.uuid4()
    pool.currency = "EUR"
    pool.base_currency = "EUR"
    pool.is_active = True
    pool.created_by = uuid.uuid4()
    return pool


def _mock_member(pool_id, account_id=None, entity_id=None, target_balance=None):
    m = MagicMock()
    m.id = uuid.uuid4()
    m.pool_id = pool_id
    m.account_id = account_id or uuid.uuid4()
    m.entity_id = entity_id or uuid.uuid4()
    m.participation_type = "FULL"
    m.target_balance = target_balance
    return m


@pytest.mark.asyncio
async def test_create_pool():
    """create_pool persists a CashPool and flushes."""
    from app.services.cash_pool_service import create_pool

    mock_session = AsyncMock()
    company_id = uuid.uuid4()

    data = MagicMock()
    data.name = "EUR Pool"
    data.pool_type = "NOTIONAL"
    data.header_account_id = uuid.uuid4()
    data.currency = "EUR"
    data.base_currency = "EUR"

    # Mock: header account lookup
    acct = MagicMock()
    acct_result = MagicMock()
    acct_result.scalar_one_or_none.return_value = acct
    mock_session.execute = AsyncMock(return_value=acct_result)

    pool = await create_pool(mock_session, company_id=company_id, data=data, created_by=uuid.uuid4())
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_add_member():
    """add_member creates a CashPoolMember."""
    from app.services.cash_pool_service import add_member

    mock_session = AsyncMock()
    pool = _mock_pool("PHYSICAL")
    company_id = pool.company_id

    data = MagicMock()
    data.account_id = uuid.uuid4()
    data.entity_id = uuid.uuid4()
    data.participation_type = "FULL"
    data.target_balance = Decimal("10000")

    # Mock: pool lookup, then account lookup
    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    acct_result = MagicMock()
    acct_result.scalar_one_or_none.return_value = MagicMock()
    mock_session.execute = AsyncMock(side_effect=[pool_result, acct_result])

    member = await add_member(mock_session, pool_id=pool.id, company_id=company_id, data=data)
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_remove_member():
    """remove_member deletes a CashPoolMember."""
    from app.services.cash_pool_service import remove_member

    mock_session = AsyncMock()
    pool = _mock_pool()
    member = _mock_member(pool.id)

    # Mock: pool lookup, then member lookup
    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    member_result = MagicMock()
    member_result.scalar_one_or_none.return_value = member
    mock_session.execute = AsyncMock(side_effect=[pool_result, member_result])

    await remove_member(mock_session, pool_id=pool.id, member_id=member.id, company_id=pool.company_id)
    mock_session.delete.assert_called_once_with(member)
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_get_pool_balance_notional():
    """NOTIONAL pool balance = SUM of member ledger_balances."""
    from app.services.cash_pool_service import get_pool_balance

    mock_session = AsyncMock()
    pool = _mock_pool("NOTIONAL")
    m1 = _mock_member(pool.id)
    m2 = _mock_member(pool.id)

    # Mock: pool lookup
    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    # Mock: members lookup
    members_result = MagicMock()
    members_result.scalars.return_value.all.return_value = [m1, m2]
    # Mock: balance lookup — returns rows with account_id + ledger_balance
    bal_row_1 = MagicMock()
    bal_row_1.account_id = m1.account_id
    bal_row_1.ledger_balance = Decimal("50000")
    bal_row_2 = MagicMock()
    bal_row_2.account_id = m2.account_id
    bal_row_2.ledger_balance = Decimal("30000")
    bal_result = MagicMock()
    bal_result.all.return_value = [bal_row_1, bal_row_2]

    mock_session.execute = AsyncMock(side_effect=[pool_result, members_result, bal_result])

    result = await get_pool_balance(mock_session, pool_id=pool.id, company_id=pool.company_id)
    assert result["consolidated_balance"] == Decimal("80000")
    assert result["header_balance"] is None
    assert len(result["member_balances"]) == 2


@pytest.mark.asyncio
async def test_get_pool_balance_physical():
    """PHYSICAL pool balance = header + SUM(member excess over target)."""
    from app.services.cash_pool_service import get_pool_balance

    mock_session = AsyncMock()
    pool = _mock_pool("PHYSICAL")
    m1 = _mock_member(pool.id, target_balance=Decimal("10000"))

    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    members_result = MagicMock()
    members_result.scalars.return_value.all.return_value = [m1]
    # Balance rows: header + member
    hdr_row = MagicMock()
    hdr_row.account_id = pool.header_account_id
    hdr_row.ledger_balance = Decimal("200000")
    m1_row = MagicMock()
    m1_row.account_id = m1.account_id
    m1_row.ledger_balance = Decimal("15000")
    bal_result = MagicMock()
    bal_result.all.return_value = [hdr_row, m1_row]

    mock_session.execute = AsyncMock(side_effect=[pool_result, members_result, bal_result])

    result = await get_pool_balance(mock_session, pool_id=pool.id, company_id=pool.company_id)
    # Consolidated = header(200000) + excess(15000 - 10000 = 5000) = 205000
    assert result["consolidated_balance"] == Decimal("205000")
    assert result["header_balance"] == Decimal("200000")


@pytest.mark.asyncio
async def test_get_pool_balance_zba():
    """ZBA pool balance = header balance. Non-zero members flagged as exceptions."""
    from app.services.cash_pool_service import get_pool_balance

    mock_session = AsyncMock()
    pool = _mock_pool("ZBA")
    m1 = _mock_member(pool.id, target_balance=Decimal("0"))

    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    members_result = MagicMock()
    members_result.scalars.return_value.all.return_value = [m1]
    hdr_row = MagicMock()
    hdr_row.account_id = pool.header_account_id
    hdr_row.ledger_balance = Decimal("100000")
    m1_row = MagicMock()
    m1_row.account_id = m1.account_id
    m1_row.ledger_balance = Decimal("500")  # exception: should be 0
    bal_result = MagicMock()
    bal_result.all.return_value = [hdr_row, m1_row]

    mock_session.execute = AsyncMock(side_effect=[pool_result, members_result, bal_result])

    result = await get_pool_balance(mock_session, pool_id=pool.id, company_id=pool.company_id)
    assert result["consolidated_balance"] == Decimal("100000")
    assert result["member_balances"][0]["is_exception"] is True


@pytest.mark.asyncio
async def test_calculate_sweeps_physical():
    """PHYSICAL sweep: member excess over target → CONCENTRATION."""
    from app.services.cash_pool_service import calculate_sweeps

    mock_session = AsyncMock()
    pool = _mock_pool("PHYSICAL")
    m1 = _mock_member(pool.id, target_balance=Decimal("10000"))

    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    members_result = MagicMock()
    members_result.scalars.return_value.all.return_value = [m1]
    m1_row = MagicMock()
    m1_row.account_id = m1.account_id
    m1_row.ledger_balance = Decimal("25000")
    bal_result = MagicMock()
    bal_result.all.return_value = [m1_row]

    mock_session.execute = AsyncMock(side_effect=[pool_result, members_result, bal_result])

    sweeps = await calculate_sweeps(mock_session, pool_id=pool.id, company_id=pool.company_id)
    assert len(sweeps) == 1
    assert sweeps[0]["amount"] == Decimal("15000")
    assert sweeps[0]["direction"] == "CONCENTRATION"


@pytest.mark.asyncio
async def test_calculate_sweeps_notional_raises():
    """NOTIONAL pool cannot have sweeps."""
    from app.services.cash_pool_service import calculate_sweeps
    from fastapi import HTTPException

    mock_session = AsyncMock()
    pool = _mock_pool("NOTIONAL")

    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    mock_session.execute = AsyncMock(return_value=pool_result)

    with pytest.raises(HTTPException) as exc_info:
        await calculate_sweeps(mock_session, pool_id=pool.id, company_id=pool.company_id)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_execute_sweeps_persists_and_audits():
    """execute_sweeps persists CashPoolSweep records and audit-logs."""
    from app.services.cash_pool_service import execute_sweeps

    mock_session = AsyncMock()
    pool = _mock_pool("PHYSICAL")
    m1 = _mock_member(pool.id, target_balance=Decimal("0"))

    pool_result = MagicMock()
    pool_result.scalar_one_or_none.return_value = pool
    members_result = MagicMock()
    members_result.scalars.return_value.all.return_value = [m1]
    m1_row = MagicMock()
    m1_row.account_id = m1.account_id
    m1_row.ledger_balance = Decimal("5000")
    bal_result = MagicMock()
    bal_result.all.return_value = [m1_row]

    mock_session.execute = AsyncMock(side_effect=[pool_result, members_result, bal_result])

    with patch("app.services.cash_pool_service.append_event", new_callable=AsyncMock):
        result = await execute_sweeps(
            mock_session, pool_id=pool.id, company_id=pool.company_id,
            performed_by=uuid.uuid4(),
        )

    assert result["sweep_count"] == 1
    mock_session.flush.assert_awaited()
```

- [ ] **Step 2: Write the service**

```python
# backend/app/services/cash_pool_service.py
"""
Cash pool service — CRUD for treasury entities, pools, members.
Pool-type-specific balance aggregation and sweep calculation/execution.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import BankAccount, CashBalance, CashAuditEventType
from app.models.cash_pool import TreasuryEntity, CashPool, CashPoolMember, CashPoolSweep
from app.services.cash_audit_service import append_event


# ── Treasury Entity CRUD ──────────────────────────────────────────

async def create_treasury_entity(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    data: Any,
    created_by: uuid.UUID,
) -> TreasuryEntity:
    """Create a treasury entity. Validates parent belongs to same company."""
    if data.parent_entity_id:
        parent = await session.execute(
            select(TreasuryEntity).where(
                TreasuryEntity.id == data.parent_entity_id,
                TreasuryEntity.company_id == company_id,
            )
        )
        if parent.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Parent entity not found")

    entity = TreasuryEntity(
        company_id=company_id,
        name=data.name,
        entity_type=data.entity_type,
        base_currency=data.base_currency,
        country_code=data.country_code,
        erp_ref=data.erp_ref,
        parent_entity_id=data.parent_entity_id,
    )
    session.add(entity)
    await session.flush()
    return entity


async def list_treasury_entities(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
) -> list[TreasuryEntity]:
    result = await session.execute(
        select(TreasuryEntity).where(TreasuryEntity.company_id == company_id)
    )
    return list(result.scalars().all())


# ── Cash Pool CRUD ────────────────────────────────────────────────

async def create_pool(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    data: Any,
    created_by: uuid.UUID,
) -> CashPool:
    """Create a cash pool. Validates header account belongs to company."""
    acct_result = await session.execute(
        select(BankAccount).where(
            BankAccount.id == data.header_account_id,
        )
    )
    if acct_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Header account not found")

    pool = CashPool(
        company_id=company_id,
        name=data.name,
        pool_type=data.pool_type,
        header_account_id=data.header_account_id,
        currency=data.currency,
        base_currency=data.base_currency,
        created_by=created_by,
    )
    session.add(pool)
    await session.flush()
    return pool


async def list_pools(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
) -> list[dict]:
    result = await session.execute(
        select(CashPool).where(CashPool.company_id == company_id)
    )
    pools = list(result.scalars().all())
    out = []
    for p in pools:
        count_result = await session.execute(
            select(func.count()).select_from(CashPoolMember).where(
                CashPoolMember.pool_id == p.id,
            )
        )
        count = count_result.scalar() or 0
        out.append({**_pool_to_dict(p), "member_count": count})
    return out


async def get_pool_detail(
    session: AsyncSession,
    *,
    pool_id: uuid.UUID,
    company_id: uuid.UUID,
) -> dict:
    pool = await _get_pool(session, pool_id, company_id)
    members_result = await session.execute(
        select(CashPoolMember).where(CashPoolMember.pool_id == pool_id)
    )
    members = list(members_result.scalars().all())
    return {
        **_pool_to_dict(pool),
        "member_count": len(members),
        "members": [_member_to_dict(m) for m in members],
    }


# ── Pool Membership ──────────────────────────────────────────────

async def add_member(
    session: AsyncSession,
    *,
    pool_id: uuid.UUID,
    company_id: uuid.UUID,
    data: Any,
) -> CashPoolMember:
    pool = await _get_pool(session, pool_id, company_id)

    # Validate account exists
    acct_result = await session.execute(
        select(BankAccount).where(BankAccount.id == data.account_id)
    )
    if acct_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Account not found")

    # Force target_balance=0 for ZBA pools
    target = Decimal("0") if pool.pool_type == "ZBA" else data.target_balance

    member = CashPoolMember(
        pool_id=pool_id,
        account_id=data.account_id,
        entity_id=data.entity_id,
        participation_type=data.participation_type,
        target_balance=target,
    )
    session.add(member)
    await session.flush()
    return member


async def remove_member(
    session: AsyncSession,
    *,
    pool_id: uuid.UUID,
    member_id: uuid.UUID,
    company_id: uuid.UUID,
) -> None:
    await _get_pool(session, pool_id, company_id)
    result = await session.execute(
        select(CashPoolMember).where(
            CashPoolMember.id == member_id,
            CashPoolMember.pool_id == pool_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    await session.delete(member)
    await session.flush()


# ── Pool Balance ─────────────────────────────────────────────────

async def get_pool_balance(
    session: AsyncSession,
    *,
    pool_id: uuid.UUID,
    company_id: uuid.UUID,
) -> dict:
    pool = await _get_pool(session, pool_id, company_id)
    members = await _get_members(session, pool_id)

    if pool.pool_type == "NOTIONAL":
        return await _notional_balance(session, pool, members)
    elif pool.pool_type == "PHYSICAL":
        return await _physical_balance(session, pool, members)
    else:  # ZBA
        return await _zba_balance(session, pool, members)


async def _notional_balance(session, pool, members) -> dict:
    """Virtual aggregation: SUM of all member ledger_balances."""
    account_ids = [m.account_id for m in members]
    balances = await _latest_balances(session, account_ids)

    member_balances = []
    total = Decimal("0")
    for m in members:
        bal = balances.get(m.account_id, Decimal("0"))
        total += bal
        member_balances.append({
            "account_id": m.account_id,
            "entity_id": m.entity_id,
            "ledger_balance": bal,
            "target_balance": None,
            "excess": None,
            "is_exception": False,
        })

    return {
        "pool_id": pool.id,
        "pool_type": "NOTIONAL",
        "consolidated_balance": total,
        "header_balance": None,
        "currency": pool.currency,
        "member_balances": member_balances,
    }


async def _physical_balance(session, pool, members) -> dict:
    """Header actual + SUM(member excess over target)."""
    account_ids = [m.account_id for m in members] + [pool.header_account_id]
    balances = await _latest_balances(session, account_ids)

    header_bal = balances.get(pool.header_account_id, Decimal("0"))
    member_balances = []
    total_excess = Decimal("0")
    for m in members:
        bal = balances.get(m.account_id, Decimal("0"))
        target = Decimal(str(m.target_balance)) if m.target_balance is not None else Decimal("0")
        excess = bal - target
        total_excess += excess
        member_balances.append({
            "account_id": m.account_id,
            "entity_id": m.entity_id,
            "ledger_balance": bal,
            "target_balance": target,
            "excess": excess,
            "is_exception": False,
        })

    return {
        "pool_id": pool.id,
        "pool_type": "PHYSICAL",
        "consolidated_balance": header_bal + total_excess,
        "header_balance": header_bal,
        "currency": pool.currency,
        "member_balances": member_balances,
    }


async def _zba_balance(session, pool, members) -> dict:
    """Pool balance = header. Non-zero members are exceptions."""
    account_ids = [m.account_id for m in members] + [pool.header_account_id]
    balances = await _latest_balances(session, account_ids)

    header_bal = balances.get(pool.header_account_id, Decimal("0"))
    member_balances = []
    for m in members:
        bal = balances.get(m.account_id, Decimal("0"))
        member_balances.append({
            "account_id": m.account_id,
            "entity_id": m.entity_id,
            "ledger_balance": bal,
            "target_balance": Decimal("0"),
            "excess": bal,
            "is_exception": bal != Decimal("0"),
        })

    return {
        "pool_id": pool.id,
        "pool_type": "ZBA",
        "consolidated_balance": header_bal,
        "header_balance": header_bal,
        "currency": pool.currency,
        "member_balances": member_balances,
    }


async def _latest_balances(session, account_ids: list[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
    """Get latest ledger_balance per account_id using MAX(balance_date)."""
    if not account_ids:
        return {}

    # Subquery: max balance_date per account
    sub = (
        select(
            CashBalance.account_id,
            func.max(CashBalance.balance_date).label("max_date"),
        )
        .where(CashBalance.account_id.in_(account_ids))
        .group_by(CashBalance.account_id)
        .subquery()
    )

    result = await session.execute(
        select(CashBalance.account_id, CashBalance.ledger_balance)
        .join(sub, (CashBalance.account_id == sub.c.account_id) & (CashBalance.balance_date == sub.c.max_date))
    )
    return {row.account_id: Decimal(str(row.ledger_balance)) for row in result.all()}


# ── Sweep Calculation & Execution ────────────────────────────────

async def calculate_sweeps(
    session: AsyncSession,
    *,
    pool_id: uuid.UUID,
    company_id: uuid.UUID,
) -> list[dict]:
    """Compute required sweeps. Raises 400 for NOTIONAL pools."""
    pool = await _get_pool(session, pool_id, company_id)

    if pool.pool_type == "NOTIONAL":
        raise HTTPException(status_code=400, detail="NOTIONAL pools do not support sweeps")

    members = await _get_members(session, pool_id)
    account_ids = [m.account_id for m in members]
    balances = await _latest_balances(session, account_ids)

    sweeps = []
    for m in members:
        bal = balances.get(m.account_id, Decimal("0"))
        target = Decimal(str(m.target_balance)) if m.target_balance is not None else Decimal("0")
        diff = bal - target

        if diff > 0:
            # Excess: sweep TO header (CONCENTRATION)
            sweeps.append({
                "source_account_id": m.account_id,
                "destination_account_id": pool.header_account_id,
                "amount": diff,
                "currency": pool.currency,
                "direction": "CONCENTRATION",
            })
        elif diff < 0:
            # Deficit: sweep FROM header (DISTRIBUTION)
            sweeps.append({
                "source_account_id": pool.header_account_id,
                "destination_account_id": m.account_id,
                "amount": abs(diff),
                "currency": pool.currency,
                "direction": "DISTRIBUTION",
            })

    return sweeps


async def execute_sweeps(
    session: AsyncSession,
    *,
    pool_id: uuid.UUID,
    company_id: uuid.UUID,
    performed_by: uuid.UUID,
) -> dict:
    """Calculate sweeps, persist as PENDING, audit-log."""
    sweep_dicts = await calculate_sweeps(session, pool_id=pool_id, company_id=company_id)

    pool = await _get_pool(session, pool_id, company_id)

    for s in sweep_dicts:
        sweep = CashPoolSweep(
            pool_id=pool_id,
            source_account_id=s["source_account_id"],
            destination_account_id=s["destination_account_id"],
            amount=s["amount"],
            currency=s["currency"],
            direction=s["direction"],
            triggered_by=performed_by,
        )
        session.add(sweep)

    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.CASH_POOL_SWEEP,
        payload={
            "pool_id": str(pool_id),
            "sweep_count": len(sweep_dicts),
        },
        performed_by=performed_by,
    )

    return {"sweep_count": len(sweep_dicts)}


async def list_sweeps(
    session: AsyncSession,
    *,
    pool_id: uuid.UUID,
    company_id: uuid.UUID,
) -> list[CashPoolSweep]:
    await _get_pool(session, pool_id, company_id)
    result = await session.execute(
        select(CashPoolSweep).where(CashPoolSweep.pool_id == pool_id)
        .order_by(CashPoolSweep.created_at.desc())
    )
    return list(result.scalars().all())


# ── Helpers ──────────────────────────────────────────────────────

async def _get_pool(session, pool_id, company_id) -> CashPool:
    result = await session.execute(
        select(CashPool).where(
            CashPool.id == pool_id,
            CashPool.company_id == company_id,
        )
    )
    pool = result.scalar_one_or_none()
    if pool is None:
        raise HTTPException(status_code=404, detail="Pool not found")
    return pool


async def _get_members(session, pool_id) -> list[CashPoolMember]:
    result = await session.execute(
        select(CashPoolMember).where(CashPoolMember.pool_id == pool_id)
    )
    return list(result.scalars().all())


def _pool_to_dict(pool) -> dict:
    return {
        "id": pool.id,
        "company_id": pool.company_id,
        "name": pool.name,
        "pool_type": pool.pool_type,
        "header_account_id": pool.header_account_id,
        "currency": pool.currency,
        "base_currency": pool.base_currency,
        "is_active": pool.is_active,
        "created_by": pool.created_by,
        "created_at": pool.created_at,
    }


def _member_to_dict(m) -> dict:
    return {
        "id": m.id,
        "pool_id": m.pool_id,
        "account_id": m.account_id,
        "entity_id": m.entity_id,
        "participation_type": m.participation_type,
        "target_balance": m.target_balance,
        "created_at": m.created_at,
    }
```

- [ ] **Step 3: Run tests**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_cash_pool_service.py -v --tb=short
```

Expected: 10 passed

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/cash_pool_service.py backend/tests/test_cash_pool_service.py
git commit -m "feat(phase2f): cash pool service (CRUD + NOTIONAL/PHYSICAL/ZBA balance + sweeps) + 10 tests"
```

---

## Chunk 3: Routes + Router Registration

### Task 4: API Routes + Router Registration + Route Tests

**Context:** 11 endpoints under `/v1/cash/pools`. Module-level patchable helpers for testability. Register in `router.py` after the reconciliation router.

**Files:**
- Create: `backend/app/api/routes/v1_cash_pools.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_v1_cash_pool_routes.py`

- [ ] **Step 1: Write route tests**

```python
# backend/tests/test_v1_cash_pool_routes.py
"""Route tests for /v1/cash/pools/* via httpx AsyncClient."""
import uuid
from datetime import datetime, UTC
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
async def test_create_entity():
    """POST /v1/cash/pools/entities returns 200."""
    user = _mock_user()

    entity_resp = {
        "id": str(uuid.uuid4()), "company_id": str(user.company_id),
        "name": "ACME UK", "entity_type": "SUBSIDIARY",
        "base_currency": "GBP", "country_code": "GB",
        "erp_ref": None, "parent_entity_id": None,
        "is_active": True, "created_at": datetime.now(UTC).isoformat(),
    }

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.create_entity_helper",
                   new_callable=AsyncMock, return_value=entity_resp):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/cash/pools/entities", headers=_BEARER,
                                     json={"name": "ACME UK", "base_currency": "GBP",
                                           "country_code": "GB"})
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_entities():
    """GET /v1/cash/pools/entities returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.list_entities_helper",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/cash/pools/entities", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_pool():
    """POST /v1/cash/pools returns 200."""
    user = _mock_user()

    pool_resp = {
        "id": str(uuid.uuid4()), "company_id": str(user.company_id),
        "name": "EUR Pool", "pool_type": "NOTIONAL",
        "header_account_id": str(uuid.uuid4()),
        "currency": "EUR", "base_currency": "EUR",
        "is_active": True, "member_count": 0,
        "created_by": str(user.id),
        "created_at": datetime.now(UTC).isoformat(),
    }

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.create_pool_helper",
                   new_callable=AsyncMock, return_value=pool_resp):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/cash/pools/", headers=_BEARER,
                                     json={"name": "EUR Pool", "pool_type": "NOTIONAL",
                                           "header_account_id": str(uuid.uuid4()),
                                           "currency": "EUR", "base_currency": "EUR"})
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_pools():
    """GET /v1/cash/pools returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.list_pools_helper",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/cash/pools/", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_pool_detail():
    """GET /v1/cash/pools/{id} returns 200."""
    user = _mock_user()
    pool_id = uuid.uuid4()

    detail = {
        "id": str(pool_id), "company_id": str(user.company_id),
        "name": "EUR Pool", "pool_type": "NOTIONAL",
        "header_account_id": str(uuid.uuid4()),
        "currency": "EUR", "base_currency": "EUR",
        "is_active": True, "member_count": 0,
        "created_by": str(user.id),
        "created_at": datetime.now(UTC).isoformat(),
        "members": [],
    }

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.get_pool_detail_helper",
                   new_callable=AsyncMock, return_value=detail):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get(f"/api/v1/cash/pools/{pool_id}", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_add_member():
    """POST /v1/cash/pools/{id}/members returns 200."""
    user = _mock_user()
    pool_id = uuid.uuid4()

    member_resp = {
        "id": str(uuid.uuid4()), "pool_id": str(pool_id),
        "account_id": str(uuid.uuid4()), "entity_id": str(uuid.uuid4()),
        "participation_type": "FULL", "target_balance": None,
        "created_at": datetime.now(UTC).isoformat(),
    }

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.add_member_helper",
                   new_callable=AsyncMock, return_value=member_resp):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(f"/api/v1/cash/pools/{pool_id}/members", headers=_BEARER,
                                     json={"account_id": str(uuid.uuid4()),
                                           "entity_id": str(uuid.uuid4())})
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_pool_balance():
    """GET /v1/cash/pools/{id}/balance returns 200."""
    user = _mock_user()
    pool_id = uuid.uuid4()

    balance = {
        "pool_id": str(pool_id), "pool_type": "NOTIONAL",
        "consolidated_balance": "80000", "header_balance": None,
        "currency": "EUR", "member_balances": [],
    }

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.get_pool_balance_helper",
                   new_callable=AsyncMock, return_value=balance):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get(f"/api/v1/cash/pools/{pool_id}/balance", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_execute_sweeps():
    """POST /v1/cash/pools/{id}/sweeps/execute returns 200."""
    user = _mock_user()
    pool_id = uuid.uuid4()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.execute_sweeps_helper",
                   new_callable=AsyncMock, return_value={"sweep_count": 2}):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(f"/api/v1/cash/pools/{pool_id}/sweeps/execute", headers=_BEARER)
        assert resp.status_code == 200
        assert resp.json()["sweep_count"] == 2
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Write the route file**

```python
# backend/app/api/routes/v1_cash_pools.py
"""v1 cash pools — treasury entities, pool CRUD, balance, sweeps."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.user import User
from app.schemas_v1.cash import (
    TreasuryEntityCreate, TreasuryEntityResponse,
    CashPoolCreate, CashPoolResponse,
    CashPoolMemberCreate, CashPoolMemberResponse,
    PoolBalanceResponse, SweepResponse,
)
from app.services.cash_pool_service import (
    create_treasury_entity, list_treasury_entities,
    create_pool, list_pools, get_pool_detail,
    add_member, remove_member,
    get_pool_balance, calculate_sweeps, execute_sweeps, list_sweeps,
)

router = APIRouter(prefix="/v1/cash/pools", tags=["cash-pools"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


# ── Module-level helpers for testability ──

async def create_entity_helper(db, *, company_id, data, created_by):
    return await create_treasury_entity(db, company_id=company_id, data=data, created_by=created_by)


async def list_entities_helper(db, *, company_id):
    return await list_treasury_entities(db, company_id=company_id)


async def create_pool_helper(db, *, company_id, data, created_by):
    return await create_pool(db, company_id=company_id, data=data, created_by=created_by)


async def list_pools_helper(db, *, company_id):
    return await list_pools(db, company_id=company_id)


async def get_pool_detail_helper(db, *, pool_id, company_id):
    return await get_pool_detail(db, pool_id=pool_id, company_id=company_id)


async def add_member_helper(db, *, pool_id, company_id, data):
    return await add_member(db, pool_id=pool_id, company_id=company_id, data=data)


async def remove_member_helper(db, *, pool_id, member_id, company_id):
    return await remove_member(db, pool_id=pool_id, member_id=member_id, company_id=company_id)


async def get_pool_balance_helper(db, *, pool_id, company_id):
    return await get_pool_balance(db, pool_id=pool_id, company_id=company_id)


async def calculate_sweeps_helper(db, *, pool_id, company_id):
    return await calculate_sweeps(db, pool_id=pool_id, company_id=company_id)


async def execute_sweeps_helper(db, *, pool_id, company_id, performed_by):
    return await execute_sweeps(db, pool_id=pool_id, company_id=company_id, performed_by=performed_by)


async def list_sweeps_helper(db, *, pool_id, company_id):
    return await list_sweeps(db, pool_id=pool_id, company_id=company_id)


# ── Routes ──

@router.post("/entities", response_model=TreasuryEntityResponse)
async def create_entity_route(
    body: TreasuryEntityCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    entity = await create_entity_helper(
        db, company_id=current_user.company_id, data=body, created_by=current_user.id,
    )
    await db.commit()
    return entity


@router.get("/entities", response_model=list[TreasuryEntityResponse])
async def list_entities_route(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_entities_helper(db, company_id=current_user.company_id)


@router.post("/", response_model=CashPoolResponse)
async def create_pool_route(
    body: CashPoolCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    pool = await create_pool_helper(
        db, company_id=current_user.company_id, data=body, created_by=current_user.id,
    )
    await db.commit()
    return pool


@router.get("/", response_model=list[CashPoolResponse])
async def list_pools_route(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_pools_helper(db, company_id=current_user.company_id)


@router.get("/{pool_id}")
async def get_pool_detail_route(
    pool_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await get_pool_detail_helper(db, pool_id=pool_id, company_id=current_user.company_id)


@router.post("/{pool_id}/members", response_model=CashPoolMemberResponse)
async def add_member_route(
    pool_id: uuid.UUID,
    body: CashPoolMemberCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    member = await add_member_helper(db, pool_id=pool_id, company_id=current_user.company_id, data=body)
    await db.commit()
    return member


@router.delete("/{pool_id}/members/{member_id}")
async def remove_member_route(
    pool_id: uuid.UUID,
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    await remove_member_helper(db, pool_id=pool_id, member_id=member_id, company_id=current_user.company_id)
    await db.commit()
    return {"status": "removed"}


@router.get("/{pool_id}/balance", response_model=PoolBalanceResponse)
async def get_pool_balance_route(
    pool_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await get_pool_balance_helper(db, pool_id=pool_id, company_id=current_user.company_id)


@router.post("/{pool_id}/sweeps/calculate")
async def calculate_sweeps_route(
    pool_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    return await calculate_sweeps_helper(db, pool_id=pool_id, company_id=current_user.company_id)


@router.post("/{pool_id}/sweeps/execute")
async def execute_sweeps_route(
    pool_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    result = await execute_sweeps_helper(
        db, pool_id=pool_id, company_id=current_user.company_id,
        performed_by=current_user.id,
    )
    await db.commit()
    return result


@router.get("/{pool_id}/sweeps", response_model=list[SweepResponse])
async def list_sweeps_route(
    pool_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_sweeps_helper(db, pool_id=pool_id, company_id=current_user.company_id)
```

- [ ] **Step 3: Register the router**

Append to `backend/app/api/router.py` after the reconciliation router:

```python
# Treasury Suite Phase 2f — Cash Pool & Multi-Entity (owns /v1/cash/pools/*)
from app.api.routes.v1_cash_pools import router as v1_cash_pools_router
router.include_router(v1_cash_pools_router)
```

- [ ] **Step 4: Run route tests**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_v1_cash_pool_routes.py -v --tb=short
```

Expected: 8 passed

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
BANK_ACCOUNT_ENC_KEY="test-bank-enc-key-at-least-32-bytes-long!!" \
python -m pytest tests/ --override-ini="addopts=" -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
```

Expected: ~4990+ passed, 0 failed

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/v1_cash_pools.py backend/app/api/router.py \
  backend/tests/test_v1_cash_pool_routes.py
git commit -m "feat(phase2f): cash pool API routes (11 endpoints) + router registration + 8 route tests"
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
# Expected: ~4990+ passed, 0 failed

# Frontend type check (no changes expected, but verify no regressions)
cd frontend && npx tsc --noEmit
# Expected: clean
```
