# Treasury Suite Phase 2a — Bank Accounts & Cash Positions

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Fortune 500-grade group treasury cash position management — multi-entity hierarchy, multi-bank account registry with 4-eyes SoD, TrueLayer/Plaid open banking, and a live 3-tab cash position dashboard.

**Architecture:** Five new DB tables (`legal_entities → bank_connections → bank_accounts → cash_balances → cash_audit_events`), five services, five route files, four frontend pages, one API client. Follows Phase 1 patterns exactly: WORM triggers, SHA-256 hash chains with `ORDER BY chain_seq DESC LIMIT 1 FOR UPDATE`, AsyncMock-based unit tests, `dashboardFetch`-based frontend client.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x async, Alembic raw SQL migrations, Next.js 15 App Router, TypeScript 5, `lucide-react`, IBM Plex fonts.

---

## Pre-Flight Checks

```bash
# Verify backend tests still pass before touching anything
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/ -x -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
# Expected: ~4839 passed, 0 failed

cd frontend && npx tsc --noEmit
# Expected: no output (clean)
```

---

## File Map

**New backend files:**
| File | Responsibility |
|------|----------------|
| `backend/app/models/cash.py` | All 5 models: LegalEntity, BankConnection, BankAccount, CashBalance, CashAuditEvent + enums + GENESIS_HASH |
| `backend/migrations/versions/0017_legal_entities.py` | `legal_entities` table |
| `backend/migrations/versions/0018_bank_connections.py` | `bank_connections` table (OAuth state columns, circuit-breaker) |
| `backend/migrations/versions/0019_bank_accounts.py` | `bank_accounts` table |
| `backend/migrations/versions/0020_cash_balances.py` | `cash_balances` + partial WORM trigger |
| `backend/migrations/versions/0021_cash_audit_events.py` | `cash_audit_events` + WORM + UNIQUE chain |
| `backend/app/services/cash_encryption.py` | AES-256-GCM encrypt/decrypt helpers (BANK_ACCOUNT_ENC_KEY) |
| `backend/app/services/legal_entity_service.py` | CRUD + recursive CTE hierarchy + consolidated position |
| `backend/app/services/bank_account_service.py` | Lifecycle state machine, SoD, role-gated decryption |
| `backend/app/services/bank_connection_service.py` | OAuth, circuit-breaker, abstract BankProviderAdapter |
| `backend/app/services/cash_audit_service.py` | SHA-256 chain extension (FOR UPDATE), chain verify |
| `backend/app/services/cash_balance_service.py` | Manual entry, bulk, pull orchestration, reconcile, queries |
| `backend/app/schemas_v1/cash.py` | Pydantic request/response schemas for all 5 route files |
| `backend/app/api/routes/v1_legal_entities.py` | 5 endpoints |
| `backend/app/api/routes/v1_bank_accounts.py` | 10 endpoints |
| `backend/app/api/routes/v1_cash_positions.py` | 7 endpoints |
| `backend/app/api/routes/v1_bank_connections.py` | 6 endpoints |
| `backend/app/api/routes/v1_cash_audit.py` | 2 endpoints |
| `backend/tests/test_cash_models.py` | Model enum + GENESIS_HASH tests |
| `backend/tests/test_cash_encryption.py` | Encrypt/decrypt round-trip |
| `backend/tests/test_legal_entity_service.py` | CRUD + hierarchy + position rollup |
| `backend/tests/test_bank_account_service.py` | State machine, SoD, encryption |
| `backend/tests/test_bank_connection_service.py` | OAuth flow, circuit-breaker |
| `backend/tests/test_cash_audit_service.py` | Chain integrity, tamper detection |
| `backend/tests/test_cash_balance_service.py` | Manual entry, bulk, pull, reconcile |
| `backend/tests/test_v1_cash_routes.py` | All endpoints via httpx AsyncClient |

**Modified backend files:**
| File | Change |
|------|--------|
| `backend/app/api/router.py` | Register 5 new routers |

**New frontend files:**
| File | Responsibility |
|------|----------------|
| `frontend/src/lib/api/cashClient.ts` | 28 typed functions for all cash endpoints |
| `frontend/src/app/cash-positions/page.tsx` | 3-tab dashboard (CONSOLIDATED/BY ENTITY/BY ACCOUNT) |
| `frontend/src/app/settings/legal-entities/page.tsx` | Entity tree management |
| `frontend/src/app/settings/bank-accounts/page.tsx` | Account registry + verification queue |
| `frontend/src/app/settings/bank-connections/page.tsx` | OAuth connection management |

**Modified frontend files:**
| File | Change |
|------|--------|
| `frontend/src/components/layout/AppSidebar.tsx` | Add Cash Positions + 3 settings nav items |

---

## Chunk 1: Models & Migrations

### Task 1: Cash models (`backend/app/models/cash.py`)

**Files:**
- Create: `backend/app/models/cash.py`
- Test: `backend/tests/test_cash_models.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_cash_models.py
"""Tests for cash.py model enums and constants."""
import pytest
from app.models.cash import (
    GENESIS_HASH,
    BankAccountStatus,
    BankAccountType,
    BankConnectionStatus,
    BankConnectionProvider,
    CashBalanceSource,
    CashAuditEventType,
    LegalEntityStatus,
    ReconciliationStatus,
    BANK_ACCOUNT_TRANSITIONS,
)


def test_genesis_hash_is_64_zeros():
    assert GENESIS_HASH == "0" * 64


def test_bank_account_transitions_active_to_frozen():
    assert BankAccountStatus.FROZEN in BANK_ACCOUNT_TRANSITIONS[BankAccountStatus.ACTIVE]


def test_bank_account_transitions_closed_is_terminal():
    assert BANK_ACCOUNT_TRANSITIONS[BankAccountStatus.CLOSED] == set()


def test_bank_account_transitions_pending_cannot_skip_to_closed():
    assert BankAccountStatus.CLOSED not in BANK_ACCOUNT_TRANSITIONS[BankAccountStatus.PENDING_VERIFICATION]


def test_bank_account_transitions_pending_to_active():
    assert BankAccountStatus.ACTIVE in BANK_ACCOUNT_TRANSITIONS[BankAccountStatus.PENDING_VERIFICATION]


def test_all_account_types_defined():
    types = {t.value for t in BankAccountType}
    assert "OPERATING" in types
    assert "NOSTRO" in types
    assert "VOSTRO" in types


def test_cash_audit_event_types_cover_lifecycle():
    types = {t.value for t in CashAuditEventType}
    assert "ACCOUNT_CREATED" in types
    assert "BALANCE_ENTERED" in types
    assert "CONNECTION_LINKED" in types
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_cash_models.py -v
# Expected: ModuleNotFoundError: No module named 'app.models.cash'
```

- [ ] **Step 3: Implement `backend/app/models/cash.py`**

```python
# backend/app/models/cash.py
"""
app/models/cash.py

Treasury Suite Phase 2a — all cash/banking ORM models.

Models:
  LegalEntity     — group treasury entity hierarchy (Company → LegalEntity tree)
  BankConnection  — OAuth connection per institution per tenant (TrueLayer/Plaid)
  BankAccount     — bank account registry (WORM-adjacent: mutable lifecycle, encrypted fields)
  CashBalance     — daily closing balance time-series (partial WORM)
  CashAuditEvent  — SHA-256 hash-chained immutable audit log (full WORM)

WORM semantics:
  CashBalance:    financial columns immutable; reconciliation columns mutable
  CashAuditEvent: full WORM (no UPDATE, no DELETE)
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from enum import Enum

from sqlalchemy import (
    BigInteger, Boolean, Date, DateTime, Integer, Numeric, String,
    UniqueConstraint, event as sa_event,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

GENESIS_HASH = "0" * 64


# ── Enums ──────────────────────────────────────────────────────────────────


class LegalEntityStatus(str, Enum):
    ACTIVE = "ACTIVE"
    DORMANT = "DORMANT"
    LIQUIDATED = "LIQUIDATED"


class BankConnectionProvider(str, Enum):
    TRUELAYER = "TRUELAYER"
    PLAID = "PLAID"


class BankConnectionStatus(str, Enum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"
    ERROR = "ERROR"


class BankAccountType(str, Enum):
    OPERATING = "OPERATING"
    CONCENTRATION = "CONCENTRATION"
    PAYROLL = "PAYROLL"
    RESTRICTED = "RESTRICTED"
    MONEY_MARKET = "MONEY_MARKET"
    ESCROW = "ESCROW"
    NOSTRO = "NOSTRO"
    VOSTRO = "VOSTRO"


class BankAccountStatus(str, Enum):
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    ACTIVE = "ACTIVE"
    FROZEN = "FROZEN"
    CLOSED = "CLOSED"


# State machine: keys = FROM state, values = allowed TO states
BANK_ACCOUNT_TRANSITIONS: dict[BankAccountStatus, set[BankAccountStatus]] = {
    BankAccountStatus.PENDING_VERIFICATION: {BankAccountStatus.ACTIVE},
    BankAccountStatus.ACTIVE: {BankAccountStatus.FROZEN, BankAccountStatus.CLOSED},
    BankAccountStatus.FROZEN: {BankAccountStatus.ACTIVE, BankAccountStatus.CLOSED},
    BankAccountStatus.CLOSED: set(),  # terminal
}


class CashBalanceSource(str, Enum):
    MANUAL = "MANUAL"
    API_PULL = "API_PULL"
    MT940_IMPORT = "MT940_IMPORT"
    RECONCILED = "RECONCILED"


class ReconciliationStatus(str, Enum):
    UNRECONCILED = "UNRECONCILED"
    RECONCILED = "RECONCILED"
    DISPUTED = "DISPUTED"
    PENDING_REVIEW = "PENDING_REVIEW"


class CashAuditEventType(str, Enum):
    ACCOUNT_CREATED = "ACCOUNT_CREATED"
    ACCOUNT_VERIFIED = "ACCOUNT_VERIFIED"
    ACCOUNT_FROZEN = "ACCOUNT_FROZEN"
    ACCOUNT_UNFROZEN = "ACCOUNT_UNFROZEN"
    ACCOUNT_CLOSED = "ACCOUNT_CLOSED"
    BALANCE_ENTERED = "BALANCE_ENTERED"
    BALANCE_CORRECTED = "BALANCE_CORRECTED"
    BALANCE_RECONCILED = "BALANCE_RECONCILED"
    BALANCE_DISPUTED = "BALANCE_DISPUTED"
    CONNECTION_LINKED = "CONNECTION_LINKED"
    CONNECTION_REVOKED = "CONNECTION_REVOKED"
    ENTITY_CREATED = "ENTITY_CREATED"
    ENTITY_UPDATED = "ENTITY_UPDATED"
    ENTITY_CLOSED = "ENTITY_CLOSED"


# ── Models ─────────────────────────────────────────────────────────────────


class LegalEntity(Base):
    __tablename__ = "legal_entities"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    parent_entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    short_name: Mapped[str] = mapped_column(String(100), nullable=False)
    lei: Mapped[str | None] = mapped_column(String(20), nullable=True)
    giin: Mapped[str | None] = mapped_column(String(19), nullable=True)
    registration_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    jurisdiction: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str] = mapped_column(String(2), nullable=False)
    functional_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    reporting_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default=LegalEntityStatus.ACTIVE.value)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class BankConnection(Base):
    __tablename__ = "bank_connections"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    institution_id: Mapped[str] = mapped_column(String(100), nullable=False)
    institution_name: Mapped[str] = mapped_column(String(255), nullable=False)
    access_token_enc: Mapped[str | None] = mapped_column(String, nullable=True)
    refresh_token_enc: Mapped[str | None] = mapped_column(String, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scope: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default=BankConnectionStatus.ACTIVE.value)
    last_successful_pull_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    consecutive_failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pending_oauth_state: Mapped[str | None] = mapped_column(String(128), nullable=True)
    pending_oauth_state_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    bank_name: Mapped[str] = mapped_column(String(255), nullable=False)
    bank_lei: Mapped[str | None] = mapped_column(String(20), nullable=True)
    bank_bic: Mapped[str | None] = mapped_column(String(11), nullable=True)
    account_number_enc: Mapped[str | None] = mapped_column(String, nullable=True)
    iban_enc: Mapped[str | None] = mapped_column(String, nullable=True)
    account_type: Mapped[str] = mapped_column(String(32), nullable=False, default=BankAccountType.OPERATING.value)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    nickname: Mapped[str] = mapped_column(String(100), nullable=False)
    purpose: Mapped[str | None] = mapped_column(String, nullable=True)
    overdraft_limit: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False, default=0)
    min_balance_threshold: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)
    gl_debit_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    gl_credit_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    api_connection_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    api_account_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default=BankAccountStatus.PENDING_VERIFICATION.value)
    verified_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class CashBalance(Base):
    __tablename__ = "cash_balances"
    __table_args__ = (
        UniqueConstraint("account_id", "balance_date", name="uq_cash_balance_account_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    balance_date: Mapped[date] = mapped_column(Date, nullable=False)
    value_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    ledger_balance: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    available_balance: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    value_date_balance: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)
    in_transit_debit: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False, default=0)
    in_transit_credit: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default=CashBalanceSource.MANUAL.value)
    reconciliation_status: Mapped[str] = mapped_column(String(32), nullable=False, default=ReconciliationStatus.UNRECONCILED.value)
    reconciled_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    reconciled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pulled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


# Mutable fields — partial WORM (reconciliation workflow)
_CASH_BALANCE_MUTABLE = frozenset({"reconciliation_status", "reconciled_by", "reconciled_at"})


@sa_event.listens_for(CashBalance, "before_delete")
def _block_cash_balance_delete(mapper, connection, target):
    raise ValueError(f"cash_balances is WORM — deletes forbidden (id={target.id})")


@sa_event.listens_for(CashBalance, "before_update")
def _guard_cash_balance_immutable(mapper, connection, target):
    """Block updates to financial columns at ORM level (mirrors DB partial WORM trigger).

    Needed for SQLite-based unit tests where the PostgreSQL trigger is absent.
    """
    from sqlalchemy import inspect as sa_inspect
    state = sa_inspect(target)
    immutable = frozenset({
        "account_id", "balance_date", "ledger_balance", "available_balance",
        "value_date_balance", "in_transit_debit", "in_transit_credit",
        "currency", "source", "created_by", "created_at",
        "value_date", "pulled_at", "note",
    })
    for attr in state.attrs:
        if attr.key in immutable:
            hist = attr.history
            if hist.added or hist.deleted:
                raise ValueError(
                    f"cash_balances.{attr.key} is immutable after creation (WORM financial column)"
                )


class CashAuditEvent(Base):
    __tablename__ = "cash_audit_events"
    __table_args__ = (
        UniqueConstraint("company_id", "chain_seq", name="uq_cash_audit_chain"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    balance_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    performed_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    event_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    prev_event_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    chain_seq: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


@sa_event.listens_for(CashAuditEvent, "before_delete")
def _block_audit_delete(mapper, connection, target):
    raise ValueError(f"cash_audit_events is WORM — deletes forbidden (id={target.id})")
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_cash_models.py -v
# Expected: 7 passed
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/cash.py backend/tests/test_cash_models.py
git commit -m "feat(models): cash.py — LegalEntity, BankConnection, BankAccount, CashBalance, CashAuditEvent"
```

---

### Task 2: Migration 0017 — `legal_entities`

**Files:**
- Create: `backend/migrations/versions/0017_legal_entities.py`

- [ ] **Step 1: Create migration**

```python
# backend/migrations/versions/0017_legal_entities.py
"""Add legal_entities table

Revision ID: 0017_legal_entities
Revises: 0016_settlement_events
Create Date: 2026-04-14
"""
from alembic import op

revision = "0017_legal_entities"
down_revision = "0016_settlement_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE legal_entities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id),
            parent_entity_id UUID REFERENCES legal_entities(id),
            legal_name VARCHAR(255) NOT NULL,
            short_name VARCHAR(100) NOT NULL,
            lei VARCHAR(20),
            giin VARCHAR(19),
            registration_number VARCHAR(100),
            jurisdiction VARCHAR(100),
            country CHAR(2) NOT NULL,
            functional_currency CHAR(3) NOT NULL,
            reporting_currency CHAR(3) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
            created_by UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            version INTEGER NOT NULL DEFAULT 1
        );
    """)
    op.execute("CREATE INDEX ix_le_company_id ON legal_entities(company_id);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS legal_entities;")
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/versions/0017_legal_entities.py
git commit -m "feat(migration): 0017 legal_entities table"
```

---

### Task 3: Migration 0018 — `bank_connections`

**Files:**
- Create: `backend/migrations/versions/0018_bank_connections.py`

- [ ] **Step 1: Create migration**

```python
# backend/migrations/versions/0018_bank_connections.py
"""Add bank_connections table

Revision ID: 0018_bank_connections
Revises: 0017_legal_entities
Create Date: 2026-04-14
"""
from alembic import op

revision = "0018_bank_connections"
down_revision = "0017_legal_entities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE bank_connections (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id),
            provider VARCHAR(32) NOT NULL,
            institution_id VARCHAR(100) NOT NULL,
            institution_name VARCHAR(255) NOT NULL,
            access_token_enc TEXT,
            refresh_token_enc TEXT,
            token_expires_at TIMESTAMPTZ,
            scope VARCHAR(255),
            status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
            last_successful_pull_at TIMESTAMPTZ,
            last_error_at TIMESTAMPTZ,
            last_error_message VARCHAR(500),
            consecutive_failure_count INTEGER NOT NULL DEFAULT 0,
            pending_oauth_state VARCHAR(128),
            pending_oauth_state_expires_at TIMESTAMPTZ,
            created_by UUID NOT NULL,
            approved_by UUID,
            approved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX ix_bc_company_id ON bank_connections(company_id);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS bank_connections;")
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/versions/0018_bank_connections.py
git commit -m "feat(migration): 0018 bank_connections table"
```

---

### Task 4: Migration 0019 — `bank_accounts`

**Files:**
- Create: `backend/migrations/versions/0019_bank_accounts.py`

- [ ] **Step 1: Create migration**

```python
# backend/migrations/versions/0019_bank_accounts.py
"""Add bank_accounts table

Revision ID: 0019_bank_accounts
Revises: 0018_bank_connections
Create Date: 2026-04-14
"""
from alembic import op

revision = "0019_bank_accounts"
down_revision = "0018_bank_connections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE bank_accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            entity_id UUID NOT NULL REFERENCES legal_entities(id),
            bank_name VARCHAR(255) NOT NULL,
            bank_lei VARCHAR(20),
            bank_bic VARCHAR(11),
            account_number_enc TEXT,
            iban_enc TEXT,
            account_type VARCHAR(32) NOT NULL DEFAULT 'OPERATING',
            currency CHAR(3) NOT NULL,
            nickname VARCHAR(100) NOT NULL,
            purpose TEXT,
            overdraft_limit NUMERIC(20,6) NOT NULL DEFAULT 0,
            min_balance_threshold NUMERIC(20,6),
            gl_debit_code VARCHAR(50),
            gl_credit_code VARCHAR(50),
            api_connection_id UUID REFERENCES bank_connections(id),
            api_account_id VARCHAR(255),
            status VARCHAR(32) NOT NULL DEFAULT 'PENDING_VERIFICATION',
            verified_by UUID,
            verified_at TIMESTAMPTZ,
            approved_by UUID,
            approved_at TIMESTAMPTZ,
            created_by UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            closed_at TIMESTAMPTZ,
            version INTEGER NOT NULL DEFAULT 1
        );
    """)
    op.execute("CREATE INDEX ix_ba_entity_id ON bank_accounts(entity_id);")
    op.execute("CREATE INDEX ix_ba_status ON bank_accounts(status);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS bank_accounts;")
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/versions/0019_bank_accounts.py
git commit -m "feat(migration): 0019 bank_accounts table"
```

---

### Task 5: Migration 0020 — `cash_balances` with partial WORM

**Files:**
- Create: `backend/migrations/versions/0020_cash_balances.py`

- [ ] **Step 1: Create migration**

```python
# backend/migrations/versions/0020_cash_balances.py
"""Add cash_balances table with partial WORM trigger

Revision ID: 0020_cash_balances
Revises: 0019_bank_accounts
Create Date: 2026-04-14
"""
from alembic import op

revision = "0020_cash_balances"
down_revision = "0019_bank_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE cash_balances (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_id UUID NOT NULL REFERENCES bank_accounts(id),
            balance_date DATE NOT NULL,
            value_date DATE,
            ledger_balance NUMERIC(20,6) NOT NULL,
            available_balance NUMERIC(20,6) NOT NULL,
            value_date_balance NUMERIC(20,6),
            in_transit_debit NUMERIC(20,6) NOT NULL DEFAULT 0,
            in_transit_credit NUMERIC(20,6) NOT NULL DEFAULT 0,
            currency CHAR(3) NOT NULL,
            source VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
            reconciliation_status VARCHAR(32) NOT NULL DEFAULT 'UNRECONCILED',
            reconciled_by UUID,
            reconciled_at TIMESTAMPTZ,
            pulled_at TIMESTAMPTZ,
            note TEXT,
            created_by UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_cash_balance_account_date UNIQUE (account_id, balance_date)
        );
    """)
    op.execute("CREATE INDEX ix_cb_account_id ON cash_balances(account_id);")
    op.execute("CREATE INDEX ix_cb_balance_date ON cash_balances(balance_date);")

    # WORM: block deletes
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_cb_delete()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'cash_balances is WORM — deletes forbidden (id=%)', OLD.id;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_no_delete_cb
        BEFORE DELETE ON cash_balances
        FOR EACH ROW EXECUTE FUNCTION fn_block_cb_delete();
    """)

    # Partial WORM: allow only reconciliation columns to change
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_cb_partial_worm()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            IF (
                NEW.account_id          IS DISTINCT FROM OLD.account_id          OR
                NEW.balance_date        IS DISTINCT FROM OLD.balance_date        OR
                NEW.value_date          IS DISTINCT FROM OLD.value_date          OR
                NEW.ledger_balance      IS DISTINCT FROM OLD.ledger_balance      OR
                NEW.available_balance   IS DISTINCT FROM OLD.available_balance   OR
                NEW.value_date_balance  IS DISTINCT FROM OLD.value_date_balance  OR
                NEW.in_transit_debit    IS DISTINCT FROM OLD.in_transit_debit    OR
                NEW.in_transit_credit   IS DISTINCT FROM OLD.in_transit_credit   OR
                NEW.currency            IS DISTINCT FROM OLD.currency            OR
                NEW.source              IS DISTINCT FROM OLD.source              OR
                NEW.pulled_at           IS DISTINCT FROM OLD.pulled_at           OR
                NEW.note                IS DISTINCT FROM OLD.note                OR
                NEW.created_by          IS DISTINCT FROM OLD.created_by          OR
                NEW.created_at          IS DISTINCT FROM OLD.created_at
            ) THEN
                RAISE EXCEPTION 'cash_balances financial columns are immutable (id=%)', OLD.id;
            END IF;
            RETURN NEW;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_cb_partial_worm
        BEFORE UPDATE ON cash_balances
        FOR EACH ROW EXECUTE FUNCTION fn_cb_partial_worm();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS tg_cb_partial_worm ON cash_balances;")
    op.execute("DROP FUNCTION IF EXISTS fn_cb_partial_worm;")
    op.execute("DROP TRIGGER IF EXISTS tg_no_delete_cb ON cash_balances;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_cb_delete;")
    op.execute("DROP TABLE IF EXISTS cash_balances;")
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/versions/0020_cash_balances.py
git commit -m "feat(migration): 0020 cash_balances table + partial WORM trigger"
```

---

### Task 6: Migration 0021 — `cash_audit_events` with full WORM + chain constraint

**Files:**
- Create: `backend/migrations/versions/0021_cash_audit_events.py`

- [ ] **Step 1: Create migration**

```python
# backend/migrations/versions/0021_cash_audit_events.py
"""Add cash_audit_events table — SHA-256 hash chain, full WORM

Revision ID: 0021_cash_audit_events
Revises: 0020_cash_balances
Create Date: 2026-04-14
"""
from alembic import op

revision = "0021_cash_audit_events"
down_revision = "0020_cash_balances"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE cash_audit_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            entity_id UUID,
            account_id UUID,
            balance_id UUID,
            event_type VARCHAR(64) NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}',
            performed_by UUID NOT NULL,
            event_hash CHAR(64) NOT NULL,
            prev_event_hash CHAR(64) NOT NULL,
            chain_seq BIGINT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_cash_audit_chain UNIQUE (company_id, chain_seq)
        );
    """)
    op.execute("CREATE INDEX ix_cae_company_id ON cash_audit_events(company_id);")
    op.execute("CREATE INDEX ix_cae_account_id ON cash_audit_events(account_id);")

    # Full WORM: block deletes and ALL updates
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_cae_delete()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'cash_audit_events is WORM — deletes forbidden (id=%)', OLD.id;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_no_delete_cae
        BEFORE DELETE ON cash_audit_events
        FOR EACH ROW EXECUTE FUNCTION fn_block_cae_delete();
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_cae_update()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'cash_audit_events is WORM — updates forbidden (id=%)', OLD.id;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_no_update_cae
        BEFORE UPDATE ON cash_audit_events
        FOR EACH ROW EXECUTE FUNCTION fn_block_cae_update();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS tg_no_update_cae ON cash_audit_events;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_cae_update;")
    op.execute("DROP TRIGGER IF EXISTS tg_no_delete_cae ON cash_audit_events;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_cae_delete;")
    op.execute("DROP TABLE IF EXISTS cash_audit_events;")
```

- [ ] **Step 2: Run backend tests (all should still pass)**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/ -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
# Expected: ~4846 passed, 0 failed (7 new tests from Task 1)
```

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/versions/0021_cash_audit_events.py
git commit -m "feat(migration): 0021 cash_audit_events — full WORM + SHA-256 chain UNIQUE constraint"
```

---

## Chunk 2: Services

### Task 7: Encryption helpers (`backend/app/services/cash_encryption.py`)

**Files:**
- Create: `backend/app/services/cash_encryption.py`
- Test: `backend/tests/test_cash_encryption.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_cash_encryption.py
"""Tests for AES-256-GCM encryption helpers."""
import os
import pytest


@pytest.fixture(autouse=True)
def set_enc_key(monkeypatch):
    monkeypatch.setenv("BANK_ACCOUNT_ENC_KEY", "test-bank-enc-key-at-least-32-bytes-long!!")


def test_encrypt_decrypt_roundtrip():
    from app.services.cash_encryption import encrypt_field, decrypt_field
    company_id = "550e8400-e29b-41d4-a716-446655440000"
    plaintext = "GB33BUKB20201555555555"
    ciphertext = encrypt_field(plaintext, company_id)
    assert ciphertext != plaintext
    assert decrypt_field(ciphertext, company_id) == plaintext


def test_encrypt_produces_different_ciphertext_each_call():
    from app.services.cash_encryption import encrypt_field
    company_id = "550e8400-e29b-41d4-a716-446655440000"
    c1 = encrypt_field("GB33BUKB20201555555555", company_id)
    c2 = encrypt_field("GB33BUKB20201555555555", company_id)
    assert c1 != c2  # random nonce per encryption


def test_decrypt_none_returns_none():
    from app.services.cash_encryption import decrypt_field
    assert decrypt_field(None, "any-company") is None


def test_mask_account_number():
    from app.services.cash_encryption import mask_account_number
    assert mask_account_number("GB33BUKB20201555555555") == "****5555"
    assert mask_account_number("1234") == "****1234"
    assert mask_account_number(None) is None
```

- [ ] **Step 2: Run to confirm failure**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_cash_encryption.py -v
# Expected: ModuleNotFoundError: No module named 'app.services.cash_encryption'
```

- [ ] **Step 3: Implement `backend/app/services/cash_encryption.py`**

```python
# backend/app/services/cash_encryption.py
"""
AES-256-GCM field-level encryption for sensitive bank account fields.

Key derivation: PBKDF2-HMAC-SHA256(BANK_ACCOUNT_ENC_KEY, salt=company_id_bytes, 100_000 iter)
Per-encryption nonce: 12 random bytes (standard GCM nonce size)
Ciphertext format (base64): nonce(12) || tag(16) || ciphertext
"""
from __future__ import annotations

import base64
import hashlib
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes


def _derive_key(company_id: str) -> bytes:
    """Derive a 32-byte AES key for this tenant from BANK_ACCOUNT_ENC_KEY."""
    root_key = os.environ.get("BANK_ACCOUNT_ENC_KEY", "")
    if not root_key:
        raise RuntimeError(
            "BANK_ACCOUNT_ENC_KEY not set. "
            "Generate with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
        )
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=company_id.encode(),
        iterations=100_000,
    )
    return kdf.derive(root_key.encode())


def encrypt_field(plaintext: str, company_id: str) -> str:
    """Encrypt plaintext with AES-256-GCM. Returns base64-encoded nonce+tag+ciphertext."""
    key = _derive_key(company_id)
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext_with_tag = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ciphertext_with_tag).decode()


def decrypt_field(ciphertext_b64: str | None, company_id: str) -> str | None:
    """Decrypt a value produced by encrypt_field. Returns None if input is None."""
    if ciphertext_b64 is None:
        return None
    key = _derive_key(company_id)
    raw = base64.b64decode(ciphertext_b64)
    nonce, ciphertext_with_tag = raw[:12], raw[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext_with_tag, None).decode()


def mask_account_number(value: str | None) -> str | None:
    """Return last-4 masked version, e.g. 'GB33...5555' → '****5555'."""
    if value is None:
        return None
    return f"****{value[-4:]}"
```

- [ ] **Step 4: Verify `cryptography` is installed**

```bash
pip show cryptography
# If missing: pip install cryptography
# Add to backend/requirements.txt: cryptography>=42.0.0
```

- [ ] **Step 5: Run tests**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_cash_encryption.py -v
# Expected: 4 passed
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/cash_encryption.py backend/tests/test_cash_encryption.py
git commit -m "feat(services): cash_encryption — AES-256-GCM field encryption + mask helper"
```

---

### Task 8: `cash_audit_service.py`

**Files:**
- Create: `backend/app/services/cash_audit_service.py`
- Test: `backend/tests/test_cash_audit_service.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_cash_audit_service.py
"""Unit tests for cash_audit_service — chain extension and verification."""
import hashlib
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.cash import GENESIS_HASH, CashAuditEventType


@pytest.mark.asyncio
async def test_append_event_uses_genesis_on_first_event():
    """First event in a company chain uses GENESIS_HASH as prev_event_hash."""
    from app.services.cash_audit_service import append_event

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.first.return_value = None  # no prior events
    mock_session.execute = AsyncMock(return_value=mock_result)

    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    event = await append_event(
        mock_session,
        company_id=company_id,
        event_type=CashAuditEventType.ENTITY_CREATED,
        payload={"name": "Acme Ltd"},
        performed_by=actor_id,
    )

    assert event.prev_event_hash == GENESIS_HASH
    assert event.chain_seq == 1
    mock_session.add.assert_called_once()


@pytest.mark.asyncio
async def test_append_event_increments_chain_seq():
    """Subsequent event has chain_seq = prev_chain_seq + 1."""
    from app.services.cash_audit_service import append_event

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.first.return_value = (42, "abc" * 21 + "ab")  # (chain_seq, event_hash)
    mock_session.execute = AsyncMock(return_value=mock_result)

    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    event = await append_event(
        mock_session,
        company_id=company_id,
        event_type=CashAuditEventType.ACCOUNT_CREATED,
        payload={},
        performed_by=actor_id,
    )

    assert event.chain_seq == 43


@pytest.mark.asyncio
async def test_append_event_hash_is_sha256():
    """event_hash is a 64-char hex string (SHA-256 output)."""
    from app.services.cash_audit_service import append_event

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.first.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    event = await append_event(
        mock_session,
        company_id=uuid.uuid4(),
        event_type=CashAuditEventType.BALANCE_ENTERED,
        payload={},
        performed_by=uuid.uuid4(),
    )

    assert len(event.event_hash) == 64
    int(event.event_hash, 16)  # valid hex


@pytest.mark.asyncio
async def test_verify_chain_detects_tampered_hash():
    """verify_chain returns ok=False when stored event_hash doesn't match recomputed hash."""
    from datetime import UTC, datetime
    from app.services.cash_audit_service import verify_chain

    company_id = uuid.uuid4()

    # Build an event with a fake/tampered event_hash
    event = MagicMock()
    event.chain_seq = 1
    event.prev_event_hash = GENESIS_HASH
    event.event_hash = "deadbeef" * 8  # 64 chars but will NOT match recomputed hash
    event.event_type = "ENTITY_CREATED"
    event.payload = {"name": "Acme"}
    event.performed_by = uuid.uuid4()
    event.created_at = datetime.now(UTC)

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [event]
    mock_session.execute = AsyncMock(return_value=mock_result)

    result = await verify_chain(mock_session, company_id=company_id)

    assert result["ok"] is False
    assert result["broken_at_seq"] == 1
```

- [ ] **Step 2: Run to confirm failure**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_cash_audit_service.py -v
# Expected: ImportError
```

- [ ] **Step 3: Implement `backend/app/services/cash_audit_service.py`**

```python
# backend/app/services/cash_audit_service.py
"""
app/services/cash_audit_service.py

SHA-256 hash chain for cash_audit_events.

Pattern: identical to gl_service._extend_journal_chain.
  SELECT chain_seq, event_hash ... ORDER BY chain_seq DESC LIMIT 1 FOR UPDATE
  Never use SELECT MAX(...) FOR UPDATE — illegal in PostgreSQL.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import GENESIS_HASH, CashAuditEvent, CashAuditEventType


async def _extend_chain(
    session: AsyncSession,
    company_id: uuid.UUID,
) -> tuple[int, str]:
    """
    Returns (new_chain_seq, prev_event_hash) with row-level lock.
    ORDER BY chain_seq DESC LIMIT 1 FOR UPDATE — matches gl_service pattern.
    """
    result = await session.execute(
        select(CashAuditEvent.chain_seq, CashAuditEvent.event_hash)
        .where(CashAuditEvent.company_id == company_id)
        .order_by(CashAuditEvent.chain_seq.desc())
        .limit(1)
        .with_for_update()
    )
    row = result.first()
    if row is None:
        return 1, GENESIS_HASH
    return row[0] + 1, row[1]


def _compute_event_hash(
    *,
    prev_event_hash: str,
    event_type: str,
    payload: dict,
    performed_by: uuid.UUID,
    created_at: datetime,
) -> str:
    parts = "|".join([
        prev_event_hash,
        event_type,
        json.dumps(payload, sort_keys=True, default=str),
        str(performed_by),
        created_at.isoformat(),
    ])
    return hashlib.sha256(parts.encode()).hexdigest()


async def append_event(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    event_type: CashAuditEventType,
    payload: dict[str, Any],
    performed_by: uuid.UUID,
    entity_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    balance_id: uuid.UUID | None = None,
) -> CashAuditEvent:
    chain_seq, prev_hash = await _extend_chain(session, company_id)
    now = datetime.now(UTC)
    event_hash = _compute_event_hash(
        prev_event_hash=prev_hash,
        event_type=event_type.value,
        payload=payload,
        performed_by=performed_by,
        created_at=now,
    )
    event = CashAuditEvent(
        company_id=company_id,
        entity_id=entity_id,
        account_id=account_id,
        balance_id=balance_id,
        event_type=event_type.value,
        payload=payload,
        performed_by=performed_by,
        event_hash=event_hash,
        prev_event_hash=prev_hash,
        chain_seq=chain_seq,
        created_at=now,
    )
    session.add(event)
    return event


async def verify_chain(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
) -> dict:
    """Verify SHA-256 chain integrity for this tenant.

    Returns {ok: True, event_count: N} or {ok: False, broken_at_seq: N}.
    Checks both prev_event_hash linkage AND recomputes each event_hash to detect
    payload tampering (a tampered row with correct linkage is still detected).
    """
    result = await session.execute(
        select(CashAuditEvent)
        .where(CashAuditEvent.company_id == company_id)
        .order_by(CashAuditEvent.chain_seq.asc())
    )
    events = result.scalars().all()
    if not events:
        return {"ok": True, "event_count": 0}

    prev_hash = GENESIS_HASH
    for event in events:
        if event.prev_event_hash != prev_hash:
            return {"ok": False, "broken_at_seq": event.chain_seq}
        expected = _compute_event_hash(
            prev_event_hash=event.prev_event_hash,
            event_type=event.event_type,
            payload=event.payload,
            performed_by=event.performed_by,
            created_at=event.created_at,
        )
        if event.event_hash != expected:
            return {"ok": False, "broken_at_seq": event.chain_seq}
        prev_hash = event.event_hash

    return {"ok": True, "event_count": len(events)}
```

- [ ] **Step 4: Run tests**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_cash_audit_service.py -v
# Expected: 4 passed
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/cash_audit_service.py backend/tests/test_cash_audit_service.py
git commit -m "feat(services): cash_audit_service — SHA-256 hash chain (FOR UPDATE pattern) + verify_chain"
```

---

### Task 9: `legal_entity_service.py`

**Files:**
- Create: `backend/app/services/legal_entity_service.py`
- Test: `backend/tests/test_legal_entity_service.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_legal_entity_service.py
"""Unit tests for legal_entity_service."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.models.cash import LegalEntityStatus


@pytest.mark.asyncio
async def test_create_entity_emits_audit_event():
    from app.services.legal_entity_service import create_entity

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    payload = {
        "legal_name": "Acme Europe SA",
        "short_name": "Acme EU",
        "country": "DE",
        "functional_currency": "EUR",
        "reporting_currency": "USD",
    }

    with patch("app.services.legal_entity_service.append_event", new_callable=AsyncMock) as mock_audit:
        entity = await create_entity(mock_session, company_id=company_id, payload=payload, created_by=actor_id)

    assert entity.company_id == company_id
    assert entity.status == LegalEntityStatus.ACTIVE.value
    mock_audit.assert_called_once()
    mock_session.add.assert_called_once()


@pytest.mark.asyncio
async def test_close_entity_sets_status():
    from app.services.legal_entity_service import close_entity

    mock_session = AsyncMock()
    entity = MagicMock()
    entity.company_id = uuid.uuid4()
    entity.status = LegalEntityStatus.ACTIVE.value

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = entity
    mock_session.execute = AsyncMock(return_value=mock_result)

    actor_id = uuid.uuid4()
    with patch("app.services.legal_entity_service.append_event", new_callable=AsyncMock):
        result = await close_entity(mock_session, entity_id=entity.company_id,
                                    company_id=entity.company_id, status="DORMANT", actor_id=actor_id)

    assert result.status == LegalEntityStatus.DORMANT.value


@pytest.mark.asyncio
async def test_close_entity_raises_if_not_found():
    from app.services.legal_entity_service import close_entity, EntityNotFoundError

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(EntityNotFoundError):
        await close_entity(mock_session, entity_id=uuid.uuid4(),
                           company_id=uuid.uuid4(), status="DORMANT", actor_id=uuid.uuid4())


@pytest.mark.asyncio
async def test_get_entity_tree_returns_list():
    """get_entity_tree returns a flat list of LegalEntity rows for the company."""
    from app.services.legal_entity_service import get_entity_tree

    mock_session = AsyncMock()
    entity = MagicMock()
    entity.id = uuid.uuid4()
    entity.company_id = uuid.uuid4()
    entity.parent_entity_id = None

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [entity]
    mock_session.execute = AsyncMock(return_value=mock_result)

    results = await get_entity_tree(mock_session, company_id=entity.company_id)
    assert len(results) == 1
    assert results[0].id == entity.id
```

- [ ] **Step 2: Run to confirm failure**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_legal_entity_service.py -v
# Expected: ImportError
```

- [ ] **Step 3: Implement `backend/app/services/legal_entity_service.py`**

```python
# backend/app/services/legal_entity_service.py
"""
app/services/legal_entity_service.py

CRUD + hierarchy queries for LegalEntity.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import CashAuditEventType, LegalEntity, LegalEntityStatus
from app.services.cash_audit_service import append_event


class EntityNotFoundError(Exception):
    pass


async def create_entity(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    payload: dict[str, Any],
    created_by: uuid.UUID,
) -> LegalEntity:
    entity = LegalEntity(
        company_id=company_id,
        created_by=created_by,
        **{k: v for k, v in payload.items() if hasattr(LegalEntity, k)},
    )
    session.add(entity)
    await session.flush()  # get entity.id
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.ENTITY_CREATED,
        payload={"legal_name": entity.legal_name, "country": entity.country},
        performed_by=created_by,
        entity_id=entity.id,
    )
    return entity


async def update_entity(
    session: AsyncSession,
    *,
    entity_id: uuid.UUID,
    company_id: uuid.UUID,
    payload: dict[str, Any],
    actor_id: uuid.UUID,
) -> LegalEntity:
    result = await session.execute(
        select(LegalEntity).where(
            LegalEntity.id == entity_id,
            LegalEntity.company_id == company_id,
        )
    )
    entity = result.scalar_one_or_none()
    if entity is None:
        raise EntityNotFoundError(f"LegalEntity {entity_id} not found")
    for k, v in payload.items():
        if hasattr(entity, k) and k not in ("id", "company_id", "created_by", "created_at"):
            setattr(entity, k, v)
    entity.updated_at = datetime.now(UTC)
    entity.version += 1
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.ENTITY_UPDATED,
        payload=payload,
        performed_by=actor_id,
        entity_id=entity_id,
    )
    return entity


async def close_entity(
    session: AsyncSession,
    *,
    entity_id: uuid.UUID,
    company_id: uuid.UUID,
    status: str,
    actor_id: uuid.UUID,
) -> LegalEntity:
    result = await session.execute(
        select(LegalEntity).where(
            LegalEntity.id == entity_id,
            LegalEntity.company_id == company_id,
        )
    )
    entity = result.scalar_one_or_none()
    if entity is None:
        raise EntityNotFoundError(f"LegalEntity {entity_id} not found")
    entity.status = status
    entity.updated_at = datetime.now(UTC)
    entity.version += 1
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.ENTITY_CLOSED,
        payload={"status": status},
        performed_by=actor_id,
        entity_id=entity_id,
    )
    return entity


async def list_entities(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    status: str | None = None,
) -> list[LegalEntity]:
    q = select(LegalEntity).where(LegalEntity.company_id == company_id)
    if status:
        q = q.where(LegalEntity.status == status)
    result = await session.execute(q.order_by(LegalEntity.legal_name))
    return list(result.scalars().all())


async def get_entity(
    session: AsyncSession,
    *,
    entity_id: uuid.UUID,
    company_id: uuid.UUID,
) -> LegalEntity:
    result = await session.execute(
        select(LegalEntity).where(
            LegalEntity.id == entity_id,
            LegalEntity.company_id == company_id,
        )
    )
    entity = result.scalar_one_or_none()
    if entity is None:
        raise EntityNotFoundError(f"LegalEntity {entity_id} not found")
    return entity


async def get_entity_tree(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
) -> list[LegalEntity]:
    """Return all LegalEntity rows for this company (flat list; callers build tree from parent_entity_id).

    Uses a simple SELECT rather than recursive CTE — the recursive hierarchy traversal
    is done client-side from this flat list. Recursive CTE is a PostgreSQL-only optimisation
    that would require the `requires_postgres` marker; the flat list is SQLite-compatible
    and sufficient for all current use cases.
    """
    result = await session.execute(
        select(LegalEntity)
        .where(LegalEntity.company_id == company_id)
        .order_by(LegalEntity.legal_name)
    )
    return list(result.scalars().all())
```

- [ ] **Step 4: Run tests**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_legal_entity_service.py -v
# Expected: 4 passed
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/legal_entity_service.py backend/tests/test_legal_entity_service.py
git commit -m "feat(services): legal_entity_service — CRUD + hierarchy + get_entity_tree + audit events"
```

---

### Task 10: `bank_account_service.py`

**Files:**
- Create: `backend/app/services/bank_account_service.py`
- Test: `backend/tests/test_bank_account_service.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_bank_account_service.py
"""Unit tests for bank_account_service — state machine, SoD, encryption."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.models.cash import BankAccountStatus


@pytest.mark.asyncio
async def test_verify_account_raises_sod_if_same_user():
    """Verifier cannot be the same user as the creator."""
    from app.services.bank_account_service import verify_account, SoDViolationError

    mock_session = AsyncMock()
    actor_id = uuid.uuid4()
    account = MagicMock()
    account.status = BankAccountStatus.PENDING_VERIFICATION.value
    account.created_by = actor_id  # same user!
    account.company_id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = account
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(SoDViolationError):
        await verify_account(mock_session, account_id=uuid.uuid4(),
                             company_id=account.company_id, verifier_id=actor_id)


@pytest.mark.asyncio
async def test_verify_account_transitions_to_active():
    """verify_account sets status=ACTIVE when SoD passes."""
    from app.services.bank_account_service import verify_account

    mock_session = AsyncMock()
    creator_id = uuid.uuid4()
    verifier_id = uuid.uuid4()  # different user
    account = MagicMock()
    account.status = BankAccountStatus.PENDING_VERIFICATION.value
    account.created_by = creator_id
    account.company_id = uuid.uuid4()
    account.id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = account
    mock_session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.bank_account_service.append_event", new_callable=AsyncMock):
        result = await verify_account(mock_session, account_id=account.id,
                                      company_id=account.company_id, verifier_id=verifier_id)

    assert result.status == BankAccountStatus.ACTIVE.value


@pytest.mark.asyncio
async def test_invalid_state_transition_raises():
    """CLOSED → ACTIVE transition raises InvalidStateTransitionError."""
    from app.services.bank_account_service import freeze_account, InvalidStateTransitionError

    mock_session = AsyncMock()
    account = MagicMock()
    account.status = BankAccountStatus.CLOSED.value  # terminal state
    account.company_id = uuid.uuid4()
    account.id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = account
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(InvalidStateTransitionError):
        await freeze_account(mock_session, account_id=account.id,
                             company_id=account.company_id, actor_id=uuid.uuid4())


@pytest.mark.asyncio
async def test_create_account_encrypts_sensitive_fields(monkeypatch):
    """create_account encrypts account_number and iban before storing."""
    monkeypatch.setenv("BANK_ACCOUNT_ENC_KEY", "test-bank-enc-key-at-least-32-bytes-long!!")
    from app.services.bank_account_service import create_account

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    entity_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    # Mock entity lookup
    mock_entity = MagicMock()
    mock_entity.company_id = company_id
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_entity
    mock_session.execute = AsyncMock(return_value=mock_result)

    payload = {
        "entity_id": str(entity_id),
        "bank_name": "Deutsche Bank",
        "account_number": "DE89370400440532013000",
        "iban": "DE89370400440532013000",
        "currency": "EUR",
        "nickname": "Main EUR Account",
        "account_type": "OPERATING",
    }

    with patch("app.services.bank_account_service.append_event", new_callable=AsyncMock):
        account = await create_account(mock_session, entity_id=entity_id,
                                        company_id=company_id, payload=payload,
                                        created_by=actor_id)

    # Stored value must be encrypted (not plaintext)
    assert account.account_number_enc != "DE89370400440532013000"
    assert account.account_number_enc is not None
```

- [ ] **Step 2: Run to confirm failure**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_bank_account_service.py -v
# Expected: ImportError
```

- [ ] **Step 3: Implement `backend/app/services/bank_account_service.py`**

```python
# backend/app/services/bank_account_service.py
"""
app/services/bank_account_service.py

BankAccount lifecycle management with state machine, SoD enforcement,
AES-256-GCM field encryption, and role-gated decryption.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import (
    BANK_ACCOUNT_TRANSITIONS,
    BankAccount,
    BankAccountStatus,
    CashAuditEventType,
)
from app.services.cash_audit_service import append_event
from app.services.cash_encryption import decrypt_field, encrypt_field, mask_account_number


class AccountNotFoundError(Exception):
    pass


class SoDViolationError(HTTPException):
    def __init__(self):
        super().__init__(status_code=403, detail="Cannot verify your own account (Separation of Duties)")


class InvalidStateTransitionError(HTTPException):
    def __init__(self, from_status: str, to_status: str):
        super().__init__(
            status_code=422,
            detail=f"Invalid state transition: {from_status} → {to_status}",
        )


async def _get_account(
    session: AsyncSession, account_id: uuid.UUID, company_id: uuid.UUID
) -> BankAccount:
    # Join via entity to enforce tenant scope
    from app.models.cash import LegalEntity
    result = await session.execute(
        select(BankAccount)
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(BankAccount.id == account_id, LegalEntity.company_id == company_id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise AccountNotFoundError(f"BankAccount {account_id} not found")
    return account


def _assert_transition(account: BankAccount, to_status: BankAccountStatus) -> None:
    from_status = BankAccountStatus(account.status)
    if to_status not in BANK_ACCOUNT_TRANSITIONS[from_status]:
        raise InvalidStateTransitionError(account.status, to_status.value)


async def create_account(
    session: AsyncSession,
    *,
    entity_id: uuid.UUID,
    company_id: uuid.UUID,
    payload: dict[str, Any],
    created_by: uuid.UUID,
) -> BankAccount:
    # Encrypt sensitive fields
    account_number_plain = payload.pop("account_number", None)
    iban_plain = payload.pop("iban", None)

    account = BankAccount(
        entity_id=entity_id,
        created_by=created_by,
        account_number_enc=encrypt_field(account_number_plain, str(company_id)) if account_number_plain else None,
        iban_enc=encrypt_field(iban_plain, str(company_id)) if iban_plain else None,
        **{k: v for k, v in payload.items() if hasattr(BankAccount, k) and k not in ("entity_id",)},
    )
    session.add(account)
    await session.flush()
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.ACCOUNT_CREATED,
        payload={"nickname": account.nickname, "currency": account.currency, "bank_name": account.bank_name},
        performed_by=created_by,
        account_id=account.id,
    )
    return account


async def verify_account(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    company_id: uuid.UUID,
    verifier_id: uuid.UUID,
) -> BankAccount:
    account = await _get_account(session, account_id, company_id)
    if account.created_by == verifier_id:
        raise SoDViolationError()
    _assert_transition(account, BankAccountStatus.ACTIVE)
    account.status = BankAccountStatus.ACTIVE.value
    account.verified_by = verifier_id
    account.verified_at = datetime.now(UTC)
    account.approved_by = verifier_id
    account.approved_at = datetime.now(UTC)
    account.version += 1
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.ACCOUNT_VERIFIED,
        payload={"verified_by": str(verifier_id)},
        performed_by=verifier_id,
        account_id=account_id,
    )
    return account


async def freeze_account(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    company_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> BankAccount:
    account = await _get_account(session, account_id, company_id)
    _assert_transition(account, BankAccountStatus.FROZEN)
    account.status = BankAccountStatus.FROZEN.value
    account.version += 1
    await append_event(session, company_id=company_id, event_type=CashAuditEventType.ACCOUNT_FROZEN,
                       payload={}, performed_by=actor_id, account_id=account_id)
    return account


async def unfreeze_account(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    company_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> BankAccount:
    account = await _get_account(session, account_id, company_id)
    _assert_transition(account, BankAccountStatus.ACTIVE)
    account.status = BankAccountStatus.ACTIVE.value
    account.version += 1
    await append_event(session, company_id=company_id, event_type=CashAuditEventType.ACCOUNT_UNFROZEN,
                       payload={}, performed_by=actor_id, account_id=account_id)
    return account


async def close_account(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    company_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> BankAccount:
    account = await _get_account(session, account_id, company_id)
    _assert_transition(account, BankAccountStatus.CLOSED)
    account.status = BankAccountStatus.CLOSED.value
    account.closed_at = datetime.now(UTC)
    account.version += 1
    await append_event(session, company_id=company_id, event_type=CashAuditEventType.ACCOUNT_CLOSED,
                       payload={}, performed_by=actor_id, account_id=account_id)
    return account


def decrypt_account_details(account: BankAccount, company_id: uuid.UUID, is_cfo: bool) -> dict:
    """Return account_number and iban — decrypted (cfo) or masked (others).

    CFO: full plaintext.
    Others: last-4 masked (****XXXX). Decrypt is still needed for masking,
    but the full plaintext is never returned to non-CFO callers.
    """
    cid = str(company_id)
    if is_cfo:
        return {
            "account_number": decrypt_field(account.account_number_enc, cid),
            "iban": decrypt_field(account.iban_enc, cid),
        }
    return {
        "account_number": mask_account_number(decrypt_field(account.account_number_enc, cid))
        if account.account_number_enc else None,
        "iban": mask_account_number(decrypt_field(account.iban_enc, cid))
        if account.iban_enc else None,
    }
```

- [ ] **Step 4: Run tests**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_bank_account_service.py -v
# Expected: 4 passed
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/bank_account_service.py backend/tests/test_bank_account_service.py
git commit -m "feat(services): bank_account_service — state machine, SoD, AES-256-GCM encryption"
```

---

### Task 11: `bank_connection_service.py`

**Files:**
- Create: `backend/app/services/bank_connection_service.py`
- Test: `backend/tests/test_bank_connection_service.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_bank_connection_service.py
"""Unit tests for bank_connection_service — OAuth flow and circuit-breaker."""
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.models.cash import BankConnectionStatus


@pytest.mark.asyncio
async def test_circuit_breaker_trips_after_3_failures(monkeypatch):
    """After 3 consecutive failures, connection status becomes ERROR."""
    monkeypatch.setenv("BANK_ACCOUNT_ENC_KEY", "test-bank-enc-key-at-least-32-bytes-long!!")
    from app.services.bank_connection_service import _handle_pull_failure

    connection = MagicMock()
    connection.consecutive_failure_count = 2  # about to hit 3
    connection.status = BankConnectionStatus.ACTIVE.value

    _handle_pull_failure(connection, "Timeout error")

    assert connection.consecutive_failure_count == 3
    assert connection.status == BankConnectionStatus.ERROR.value
    assert connection.last_error_message == "Timeout error"


@pytest.mark.asyncio
async def test_circuit_breaker_resets_on_success():
    """Successful pull resets consecutive_failure_count to 0."""
    from app.services.bank_connection_service import _handle_pull_success

    connection = MagicMock()
    connection.consecutive_failure_count = 2
    connection.status = BankConnectionStatus.ACTIVE.value

    _handle_pull_success(connection)

    assert connection.consecutive_failure_count == 0
    assert connection.status == BankConnectionStatus.ACTIVE.value


@pytest.mark.asyncio
async def test_get_auth_url_generates_state_with_expiry(monkeypatch):
    """get_auth_url stores pending_oauth_state with 5-minute expiry."""
    monkeypatch.setenv("BANK_ACCOUNT_ENC_KEY", "test-bank-enc-key-at-least-32-bytes-long!!")
    from app.services.bank_connection_service import get_auth_url

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    mock_adapter = MagicMock()
    mock_adapter.get_auth_url.return_value = "https://auth.truelayer.com/?response_type=code&state=xyz"

    with patch("app.services.bank_connection_service._get_adapter", return_value=mock_adapter):
        url, connection = await get_auth_url(
            mock_session,
            provider="TRUELAYER",
            company_id=company_id,
            redirect_uri="https://example.com/callback",
            created_by=actor_id,
        )

    assert connection.pending_oauth_state is not None
    assert len(connection.pending_oauth_state) > 16
    assert connection.pending_oauth_state_expires_at > datetime.now(UTC)
    mock_session.add.assert_called_once()


@pytest.mark.asyncio
async def test_error_message_is_truncated_to_500_chars():
    """Error messages never exceed 500 chars (prevents token fragment leakage)."""
    from app.services.bank_connection_service import _handle_pull_failure

    connection = MagicMock()
    connection.consecutive_failure_count = 0
    connection.status = BankConnectionStatus.ACTIVE.value

    long_error = "x" * 1000
    _handle_pull_failure(connection, long_error)

    assert len(connection.last_error_message) <= 500


@pytest.mark.asyncio
async def test_handle_callback_enforces_sod():
    """handle_callback raises ValueError when approver is the same user who initiated the OAuth flow."""
    monkeypatch = None  # SoD check happens before adapter.exchange_code, so no env setup needed
    from app.services.bank_connection_service import handle_callback

    creator_id = uuid.uuid4()
    mock_session = AsyncMock()
    connection = MagicMock()
    connection.pending_oauth_state = "valid_state"
    connection.pending_oauth_state_expires_at = datetime.now(UTC) + timedelta(minutes=5)
    connection.created_by = creator_id  # same user trying to approve → SoD violation

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = connection
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(ValueError, match="SoD"):
        await handle_callback(
            mock_session,
            state="valid_state",
            code="auth_code",
            company_id=uuid.uuid4(),
            created_by=creator_id,  # same as connection.created_by
        )
```

- [ ] **Step 2: Run to confirm failure**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_bank_connection_service.py -v
# Expected: ImportError
```

- [ ] **Step 3: Implement `backend/app/services/bank_connection_service.py`**

```python
# backend/app/services/bank_connection_service.py
"""
app/services/bank_connection_service.py

OAuth connection management for TrueLayer/Plaid with circuit-breaker.

Circuit-breaker: consecutive_failure_count >= 3 → status=ERROR.
Reset: any successful pull resets count to 0.
OAuth CSRF: pending_oauth_state stored with 5-min TTL; validated at callback.
"""
from __future__ import annotations

import os
import secrets
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import BankConnection, BankConnectionProvider, BankConnectionStatus, CashAuditEventType
from app.services.cash_audit_service import append_event
from app.services.cash_encryption import encrypt_field, decrypt_field

CIRCUIT_BREAKER_THRESHOLD = 3
OAUTH_STATE_TTL_MINUTES = 5


@dataclass
class ProviderBalance:
    account_id: str
    ledger_balance: float
    available_balance: float
    currency: str


class BankProviderAdapter(ABC):
    @abstractmethod
    def get_auth_url(self, state: str, redirect_uri: str) -> str: ...

    @abstractmethod
    async def exchange_code(self, code: str) -> dict: ...  # returns {access_token, refresh_token, expires_in}

    @abstractmethod
    async def get_balances(self, access_token: str) -> list[ProviderBalance]: ...


class TrueLayerAdapter(BankProviderAdapter):
    def get_auth_url(self, state: str, redirect_uri: str) -> str:
        client_id = os.getenv("TRUELAYER_CLIENT_ID", "")
        return (
            f"https://auth.truelayer.com/?response_type=code&client_id={client_id}"
            f"&scope=accounts+balance&redirect_uri={redirect_uri}&state={state}"
            f"&providers=uk-ob-all+ie-ob-all+de-ob-all"
        )

    async def exchange_code(self, code: str) -> dict:
        raise NotImplementedError("TrueLayer live exchange — configure TRUELAYER_CLIENT_SECRET")

    async def get_balances(self, access_token: str) -> list[ProviderBalance]:
        raise NotImplementedError("TrueLayer live balance pull — configure TRUELAYER_CLIENT_SECRET")


class PlaidAdapter(BankProviderAdapter):
    def get_auth_url(self, state: str, redirect_uri: str) -> str:
        return f"https://cdn.plaid.com/link/v2/stable/link.html?state={state}&redirect_uri={redirect_uri}"

    async def exchange_code(self, code: str) -> dict:
        raise NotImplementedError("Plaid live exchange — configure PLAID_CLIENT_SECRET")

    async def get_balances(self, access_token: str) -> list[ProviderBalance]:
        raise NotImplementedError("Plaid live balance pull — configure PLAID_CLIENT_SECRET")


def _get_adapter(provider: str) -> BankProviderAdapter:
    if provider == BankConnectionProvider.TRUELAYER.value:
        return TrueLayerAdapter()
    if provider == BankConnectionProvider.PLAID.value:
        return PlaidAdapter()
    raise ValueError(f"Unknown provider: {provider}")


def _handle_pull_failure(connection: BankConnection, error: str) -> None:
    connection.consecutive_failure_count += 1
    connection.last_error_at = datetime.now(UTC)
    connection.last_error_message = error[:500]  # prevent token fragments
    if connection.consecutive_failure_count >= CIRCUIT_BREAKER_THRESHOLD:
        connection.status = BankConnectionStatus.ERROR.value


def _handle_pull_success(connection: BankConnection) -> None:
    connection.consecutive_failure_count = 0
    connection.last_successful_pull_at = datetime.now(UTC)
    if connection.status == BankConnectionStatus.ACTIVE.value:
        pass  # already active


async def get_auth_url(
    session: AsyncSession,
    *,
    provider: str,
    company_id: uuid.UUID,
    redirect_uri: str,
    created_by: uuid.UUID,
) -> tuple[str, BankConnection]:
    state = secrets.token_urlsafe(48)
    adapter = _get_adapter(provider)
    url = adapter.get_auth_url(state, redirect_uri)

    connection = BankConnection(
        company_id=company_id,
        provider=provider,
        institution_id="pending",
        institution_name="Pending OAuth",
        status=BankConnectionStatus.ACTIVE.value,
        pending_oauth_state=state,
        pending_oauth_state_expires_at=datetime.now(UTC) + timedelta(minutes=OAUTH_STATE_TTL_MINUTES),
        created_by=created_by,
    )
    session.add(connection)
    return url, connection


async def handle_callback(
    session: AsyncSession,
    *,
    state: str,
    code: str,
    company_id: uuid.UUID,
    created_by: uuid.UUID,
) -> BankConnection:
    result = await session.execute(
        select(BankConnection).where(
            BankConnection.company_id == company_id,
            BankConnection.pending_oauth_state == state,
        )
    )
    connection = result.scalar_one_or_none()
    if connection is None:
        raise ValueError("Invalid OAuth state — connection not found")
    if connection.pending_oauth_state_expires_at < datetime.now(UTC):
        raise ValueError("OAuth state expired — restart the connection flow")
    if connection.created_by == created_by:
        raise ValueError("SoD violation: the user who initiated the OAuth flow cannot complete it")

    adapter = _get_adapter(connection.provider)
    tokens = await adapter.exchange_code(code)

    connection.access_token_enc = encrypt_field(tokens["access_token"], str(company_id))
    connection.refresh_token_enc = encrypt_field(tokens.get("refresh_token", ""), str(company_id))
    connection.token_expires_at = datetime.now(UTC) + timedelta(seconds=tokens.get("expires_in", 3600))
    connection.pending_oauth_state = None
    connection.pending_oauth_state_expires_at = None
    connection.status = BankConnectionStatus.ACTIVE.value

    await append_event(session, company_id=company_id, event_type=CashAuditEventType.CONNECTION_LINKED,
                       payload={"provider": connection.provider}, performed_by=created_by)
    return connection


async def revoke_connection(
    session: AsyncSession,
    *,
    connection_id: uuid.UUID,
    company_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> BankConnection:
    result = await session.execute(
        select(BankConnection).where(
            BankConnection.id == connection_id,
            BankConnection.company_id == company_id,
        )
    )
    connection = result.scalar_one_or_none()
    if connection is None:
        raise ValueError(f"BankConnection {connection_id} not found")
    connection.status = BankConnectionStatus.REVOKED.value
    connection.access_token_enc = None
    connection.refresh_token_enc = None
    connection.updated_at = datetime.now(UTC)
    await append_event(session, company_id=company_id, event_type=CashAuditEventType.CONNECTION_REVOKED,
                       payload={"connection_id": str(connection_id)}, performed_by=actor_id)
    return connection
```

- [ ] **Step 4: Run tests**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_bank_connection_service.py -v
# Expected: 5 passed
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/bank_connection_service.py backend/tests/test_bank_connection_service.py
git commit -m "feat(services): bank_connection_service — OAuth, circuit-breaker, CSRF state, SoD"
```

---

### Task 12: `cash_balance_service.py`

**Files:**
- Create: `backend/app/services/cash_balance_service.py`
- Test: `backend/tests/test_cash_balance_service.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_cash_balance_service.py
"""Unit tests for cash_balance_service."""
import uuid
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.models.cash import BankAccountStatus, ReconciliationStatus


@pytest.mark.asyncio
async def test_enter_balance_rejects_non_active_account():
    """Only ACTIVE accounts may receive balance entries."""
    from app.services.cash_balance_service import enter_balance, AccountNotActiveError

    mock_session = AsyncMock()
    account = MagicMock()
    account.status = BankAccountStatus.FROZEN.value
    account.currency = "EUR"
    account.id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = account
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(AccountNotActiveError):
        await enter_balance(
            mock_session,
            account_id=account.id,
            company_id=uuid.uuid4(),
            payload={"balance_date": "2026-04-14", "ledger_balance": "1000000.00",
                     "available_balance": "950000.00", "currency": "EUR"},
            created_by=uuid.uuid4(),
        )


@pytest.mark.asyncio
async def test_enter_balance_adds_balance_and_emits_audit():
    """Happy path: creates CashBalance row and audit event."""
    from app.services.cash_balance_service import enter_balance

    mock_session = AsyncMock()
    account = MagicMock()
    account.status = BankAccountStatus.ACTIVE.value
    account.currency = "EUR"
    account.id = uuid.uuid4()
    account.entity_id = uuid.uuid4()

    # First execute: account lookup; second execute: existing balance check (None)
    mock_account_result = MagicMock()
    mock_account_result.scalar_one_or_none.return_value = account
    mock_balance_result = MagicMock()
    mock_balance_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(side_effect=[mock_account_result, mock_balance_result])

    with patch("app.services.cash_balance_service.append_event", new_callable=AsyncMock) as mock_audit:
        balance = await enter_balance(
            mock_session,
            account_id=account.id,
            company_id=uuid.uuid4(),
            payload={"balance_date": "2026-04-14", "ledger_balance": "1000000.00",
                     "available_balance": "950000.00", "currency": "EUR"},
            created_by=uuid.uuid4(),
        )

    mock_session.add.assert_called_once()
    mock_audit.assert_called_once()


@pytest.mark.asyncio
async def test_enter_balance_duplicate_date_raises_409():
    """Duplicate (account, date) raises DuplicateBalanceDateError."""
    from app.services.cash_balance_service import enter_balance, DuplicateBalanceDateError

    mock_session = AsyncMock()
    account = MagicMock()
    account.status = BankAccountStatus.ACTIVE.value
    account.currency = "EUR"
    account.id = uuid.uuid4()

    existing_balance = MagicMock()
    mock_account_result = MagicMock()
    mock_account_result.scalar_one_or_none.return_value = account
    mock_balance_result = MagicMock()
    mock_balance_result.scalar_one_or_none.return_value = existing_balance  # already exists

    mock_session.execute = AsyncMock(side_effect=[mock_account_result, mock_balance_result])

    with pytest.raises(DuplicateBalanceDateError):
        await enter_balance(
            mock_session,
            account_id=account.id,
            company_id=uuid.uuid4(),
            payload={"balance_date": "2026-04-14", "ledger_balance": "1000000.00",
                     "available_balance": "950000.00", "currency": "EUR"},
            created_by=uuid.uuid4(),
        )
```

- [ ] **Step 2: Run to confirm failure**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_cash_balance_service.py -v
# Expected: ImportError
```

- [ ] **Step 3: Implement `backend/app/services/cash_balance_service.py`**

```python
# backend/app/services/cash_balance_service.py
"""
app/services/cash_balance_service.py

Manual and API-pull balance entry, reconciliation, and position queries.
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import (
    BankAccount, BankAccountStatus, CashAuditEventType,
    CashBalance, CashBalanceSource, ReconciliationStatus,
)
from app.services.cash_audit_service import append_event


class AccountNotActiveError(HTTPException):
    def __init__(self, account_id: uuid.UUID):
        super().__init__(status_code=422, detail=f"Account {account_id} is not ACTIVE")


class DuplicateBalanceDateError(HTTPException):
    def __init__(self):
        super().__init__(status_code=409, detail="Balance for this account and date already exists")


async def _get_active_account(
    session: AsyncSession, account_id: uuid.UUID, company_id: uuid.UUID
) -> BankAccount:
    from app.models.cash import LegalEntity
    result = await session.execute(
        select(BankAccount)
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(BankAccount.id == account_id, LegalEntity.company_id == company_id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.status != BankAccountStatus.ACTIVE.value:
        raise AccountNotActiveError(account_id)
    return account


async def enter_balance(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    company_id: uuid.UUID,
    payload: dict[str, Any],
    created_by: uuid.UUID,
    source: CashBalanceSource = CashBalanceSource.MANUAL,
) -> CashBalance:
    account = await _get_active_account(session, account_id, company_id)
    balance_date = date.fromisoformat(str(payload["balance_date"]))

    # Check for duplicate
    existing = await session.execute(
        select(CashBalance).where(
            CashBalance.account_id == account_id,
            CashBalance.balance_date == balance_date,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise DuplicateBalanceDateError()

    balance = CashBalance(
        account_id=account_id,
        balance_date=balance_date,
        value_date=date.fromisoformat(str(payload["value_date"])) if payload.get("value_date") else balance_date,
        ledger_balance=Decimal(str(payload["ledger_balance"])),
        available_balance=Decimal(str(payload["available_balance"])),
        value_date_balance=Decimal(str(payload["value_date_balance"])) if payload.get("value_date_balance") else None,
        in_transit_debit=Decimal(str(payload.get("in_transit_debit", "0"))),
        in_transit_credit=Decimal(str(payload.get("in_transit_credit", "0"))),
        currency=payload.get("currency", account.currency),
        source=source.value,
        note=payload.get("note"),
        created_by=created_by,
    )
    session.add(balance)
    await session.flush()
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.BALANCE_ENTERED,
        payload={
            "balance_date": str(balance_date),
            "ledger_balance": str(balance.ledger_balance),
            "currency": balance.currency,
            "source": source.value,
        },
        performed_by=created_by,
        account_id=account_id,
        balance_id=balance.id,
    )
    return balance


async def bulk_enter_balances(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    rows: list[dict[str, Any]],
    created_by: uuid.UUID,
) -> list[CashBalance]:
    """All-or-nothing bulk entry. Rolls back on any failure."""
    results = []
    for row in rows:
        account_id = uuid.UUID(str(row["account_id"]))
        balance = await enter_balance(
            session,
            account_id=account_id,
            company_id=company_id,
            payload=row,
            created_by=created_by,
        )
        results.append(balance)
    return results


async def reconcile_balance(
    session: AsyncSession,
    *,
    balance_id: uuid.UUID,
    company_id: uuid.UUID,
    reconciler_id: uuid.UUID,
    new_status: ReconciliationStatus,
    note: str | None = None,
) -> CashBalance:
    result = await session.execute(
        select(CashBalance).where(CashBalance.id == balance_id)
    )
    balance = result.scalar_one_or_none()
    if balance is None:
        raise HTTPException(status_code=404, detail="Balance not found")
    # Only mutable columns allowed by partial WORM trigger
    balance.reconciliation_status = new_status.value
    balance.reconciled_by = reconciler_id
    balance.reconciled_at = datetime.now(UTC)
    event_type = (
        CashAuditEventType.BALANCE_RECONCILED
        if new_status == ReconciliationStatus.RECONCILED
        else CashAuditEventType.BALANCE_DISPUTED
    )
    await append_event(
        session,
        company_id=company_id,
        event_type=event_type,
        payload={"status": new_status.value, "note": note},
        performed_by=reconciler_id,
        balance_id=balance_id,
    )
    return balance
```

- [ ] **Step 4: Run tests**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_cash_balance_service.py -v
# Expected: 3 passed
```

- [ ] **Step 5: Run full backend tests**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/ -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
# Expected: ~4862 passed, 0 failed
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/cash_balance_service.py backend/tests/test_cash_balance_service.py
git commit -m "feat(services): cash_balance_service — manual entry, bulk, reconcile, duplicate guard"
```

---

## Chunk 3: Schemas, Routes & Router

### Task 13: Pydantic schemas (`backend/app/schemas_v1/cash.py`)

**Files:**
- Create: `backend/app/schemas_v1/cash.py`

- [ ] **Step 1: Create schemas**

```python
# backend/app/schemas_v1/cash.py
"""
Pydantic request/response schemas for Treasury Suite Phase 2a cash endpoints.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from pydantic import BaseModel, Field


# ── LegalEntity ───────────────────────────────────────────────────────────

class LegalEntityCreate(BaseModel):
    legal_name: str
    short_name: str
    country: str = Field(..., min_length=2, max_length=2)
    functional_currency: str = Field(..., min_length=3, max_length=3)
    reporting_currency: str = Field(..., min_length=3, max_length=3)
    parent_entity_id: uuid.UUID | None = None
    lei: str | None = None
    giin: str | None = None
    registration_number: str | None = None
    jurisdiction: str | None = None


class LegalEntityUpdate(BaseModel):
    legal_name: str | None = None
    short_name: str | None = None
    lei: str | None = None
    giin: str | None = None
    jurisdiction: str | None = None
    version: int  # required for optimistic locking


class LegalEntityCloseRequest(BaseModel):
    status: str = Field(..., pattern="^(DORMANT|LIQUIDATED)$")


class LegalEntityResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    parent_entity_id: uuid.UUID | None
    legal_name: str
    short_name: str
    lei: str | None
    giin: str | None
    country: str
    functional_currency: str
    reporting_currency: str
    status: str
    version: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── BankAccount ───────────────────────────────────────────────────────────

class BankAccountCreate(BaseModel):
    entity_id: uuid.UUID
    bank_name: str
    bank_bic: str | None = None
    account_number: str | None = None  # plaintext — encrypted at service layer
    iban: str | None = None             # plaintext — encrypted at service layer
    account_type: str = "OPERATING"
    currency: str = Field(..., min_length=3, max_length=3)
    nickname: str
    purpose: str | None = None
    overdraft_limit: Decimal = Decimal("0")
    min_balance_threshold: Decimal | None = None
    gl_debit_code: str | None = None
    gl_credit_code: str | None = None
    api_connection_id: uuid.UUID | None = None


class BankAccountResponse(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    bank_name: str
    bank_bic: str | None
    account_number: str | None  # masked unless cfo role
    iban: str | None            # masked unless cfo role
    account_type: str
    currency: str
    nickname: str
    status: str
    overdraft_limit: Decimal
    min_balance_threshold: Decimal | None
    gl_debit_code: str | None
    gl_credit_code: str | None
    version: int
    created_by: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class BankAccountUpdate(BaseModel):
    """Updatable non-sensitive fields. Sensitive fields (account_number, iban) are immutable."""
    nickname: str | None = None
    purpose: str | None = None
    overdraft_limit: Decimal | None = None
    min_balance_threshold: Decimal | None = None
    gl_debit_code: str | None = None
    gl_credit_code: str | None = None


# ── BankConnection ────────────────────────────────────────────────────────

class AuthUrlRequest(BaseModel):
    provider: str = Field(..., pattern="^(TRUELAYER|PLAID)$")
    redirect_uri: str


class AuthUrlResponse(BaseModel):
    url: str
    connection_id: uuid.UUID


class OAuthCallbackRequest(BaseModel):
    state: str
    code: str


class BankConnectionResponse(BaseModel):
    id: uuid.UUID
    provider: str
    institution_name: str
    status: str
    consecutive_failure_count: int
    last_successful_pull_at: datetime | None
    last_error_message: str | None
    created_at: datetime

    class Config:
        from_attributes = True


# ── CashBalance ───────────────────────────────────────────────────────────

class CashBalanceCreate(BaseModel):
    account_id: uuid.UUID
    balance_date: date
    value_date: date | None = None
    ledger_balance: Decimal
    available_balance: Decimal
    value_date_balance: Decimal | None = None
    in_transit_debit: Decimal = Decimal("0")
    in_transit_credit: Decimal = Decimal("0")
    currency: str = Field(..., min_length=3, max_length=3)
    note: str | None = None


class BulkBalanceCreate(BaseModel):
    rows: list[CashBalanceCreate]


class ReconcileRequest(BaseModel):
    status: str = Field(..., pattern="^(RECONCILED|DISPUTED|PENDING_REVIEW)$")
    note: str | None = None


class CashBalanceResponse(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    balance_date: date
    ledger_balance: Decimal
    available_balance: Decimal
    in_transit_debit: Decimal
    in_transit_credit: Decimal
    currency: str
    source: str
    reconciliation_status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Position views ────────────────────────────────────────────────────────

class CurrencyPosition(BaseModel):
    currency: str
    ledger_balance: Decimal
    available_balance: Decimal
    in_transit_net: Decimal  # credit - debit
    account_count: int


class ConsolidatedPositionResponse(BaseModel):
    as_of_date: date
    positions: list[CurrencyPosition]


class EntityPosition(BaseModel):
    entity_id: uuid.UUID
    entity_name: str
    currency: str
    ledger_balance: Decimal
    available_balance: Decimal


class EntityPositionResponse(BaseModel):
    as_of_date: date
    positions: list[EntityPosition]
```

- [ ] **Step 2: Verify import works**

```bash
cd backend
python -c "from app.schemas_v1.cash import LegalEntityCreate, BankAccountCreate; print('OK')"
# Expected: OK
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas_v1/cash.py
git commit -m "feat(schemas): cash.py — Pydantic schemas for all cash endpoints"
```

---

### Task 14: Routes — legal entities, bank accounts, cash positions

**Files:**
- Create: `backend/app/api/routes/v1_legal_entities.py`
- Create: `backend/app/api/routes/v1_bank_accounts.py`
- Create: `backend/app/api/routes/v1_cash_positions.py`
- Test: `backend/tests/test_v1_cash_routes.py` (partial — legal entities + accounts)

- [ ] **Step 1: Write failing route tests**

```python
# backend/tests/test_v1_cash_routes.py
"""Route tests for v1 cash endpoints via httpx AsyncClient."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.main import app
from app.core.dependencies import get_current_user, get_session


def make_mock_user(role: str = "cfo"):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = uuid.uuid4()
    user.role = role
    user.plan_tier = "professional"
    return user


@pytest.mark.asyncio
async def test_list_entities_returns_200():
    mock_user = make_mock_user()
    mock_session = AsyncMock()

    with patch("app.api.routes.v1_legal_entities.list_entities", new_callable=AsyncMock, return_value=[]) as mock_list:
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_session] = lambda: mock_session
        async with AsyncClient(app=app, base_url="http://test") as client:
            resp = await client.get("/v1/cash/entities")
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_accounts_returns_200():
    mock_user = make_mock_user()
    mock_session = AsyncMock()

    with patch("app.api.routes.v1_bank_accounts.list_accounts", new_callable=AsyncMock, return_value=[]):
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_session] = lambda: mock_session
        async with AsyncClient(app=app, base_url="http://test") as client:
            resp = await client.get("/v1/cash/accounts")
        app.dependency_overrides.clear()

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_verify_account_sod_returns_403():
    """SoDViolationError from service → 403 at route layer."""
    from app.services.bank_account_service import SoDViolationError

    mock_user = make_mock_user()
    mock_session = AsyncMock()

    with patch("app.api.routes.v1_bank_accounts.verify_account",
               new_callable=AsyncMock, side_effect=SoDViolationError()):
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_session] = lambda: mock_session
        async with AsyncClient(app=app, base_url="http://test") as client:
            resp = await client.post(f"/v1/cash/accounts/{uuid.uuid4()}/verify")
        app.dependency_overrides.clear()

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_consolidated_position_returns_200():
    mock_user = make_mock_user()
    mock_session = AsyncMock()

    with patch("app.api.routes.v1_cash_positions.get_consolidated_position",
               new_callable=AsyncMock, return_value=[]):
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_session] = lambda: mock_session
        async with AsyncClient(app=app, base_url="http://test") as client:
            resp = await client.get("/v1/cash/positions/consolidated")
        app.dependency_overrides.clear()

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_starter_plan_blocked_from_cash_endpoints():
    """Starter-tier users receive 403 on all cash endpoints (professional plan required)."""
    mock_user = make_mock_user()
    mock_user.plan_tier = "starter"  # override the default "professional"

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    async with AsyncClient(app=app, base_url="http://test") as client:
        resp = await client.get("/v1/cash/entities")
    app.dependency_overrides.clear()

    assert resp.status_code == 403
```

- [ ] **Step 2: Run to confirm failure**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_v1_cash_routes.py -v
# Expected: ImportError (routes don't exist yet)
```

- [ ] **Step 3: Implement `v1_legal_entities.py`**

```python
# backend/app/api/routes/v1_legal_entities.py
"""v1 legal entities — group treasury entity hierarchy."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.user import User
from app.schemas_v1.cash import (
    LegalEntityCreate, LegalEntityUpdate, LegalEntityCloseRequest, LegalEntityResponse,
)
from app.services.legal_entity_service import (
    create_entity, update_entity, close_entity, list_entities, get_entity, EntityNotFoundError,
)

router = APIRouter(prefix="/v1/cash/entities", tags=["cash-entities"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role for this action")


@router.get("", response_model=list[LegalEntityResponse])
async def list_entities_route(
    status: str | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_entities(db, company_id=current_user.company_id, status=status)


@router.post("", response_model=LegalEntityResponse, status_code=201)
async def create_entity_route(
    payload: LegalEntityCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    return await create_entity(db, company_id=current_user.company_id,
                                payload=payload.model_dump(exclude_none=True),
                                created_by=current_user.id)


@router.get("/{entity_id}", response_model=LegalEntityResponse)
async def get_entity_route(
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    try:
        return await get_entity(db, entity_id=entity_id, company_id=current_user.company_id)
    except EntityNotFoundError:
        raise HTTPException(status_code=404, detail="Entity not found")


@router.patch("/{entity_id}", response_model=LegalEntityResponse)
async def update_entity_route(
    entity_id: uuid.UUID,
    payload: LegalEntityUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    try:
        return await update_entity(db, entity_id=entity_id, company_id=current_user.company_id,
                                    payload=payload.model_dump(exclude_none=True),
                                    actor_id=current_user.id)
    except EntityNotFoundError:
        raise HTTPException(status_code=404, detail="Entity not found")


@router.post("/{entity_id}/close", response_model=LegalEntityResponse)
async def close_entity_route(
    entity_id: uuid.UUID,
    payload: LegalEntityCloseRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    try:
        return await close_entity(db, entity_id=entity_id, company_id=current_user.company_id,
                                   status=payload.status, actor_id=current_user.id)
    except EntityNotFoundError:
        raise HTTPException(status_code=404, detail="Entity not found")
```

- [ ] **Step 4: Implement `v1_bank_accounts.py`**

```python
# backend/app/api/routes/v1_bank_accounts.py
"""v1 bank accounts — registry + lifecycle."""
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.cash import LegalEntity, BankAccount, CashBalance, CashAuditEvent
from app.models.user import User
from app.schemas_v1.cash import BankAccountCreate, BankAccountResponse, BankAccountUpdate
from app.services.bank_account_service import (
    create_account, verify_account, freeze_account, unfreeze_account, close_account,
    decrypt_account_details, _get_account, AccountNotFoundError, SoDViolationError, InvalidStateTransitionError,
)

router = APIRouter(prefix="/v1/cash/accounts", tags=["cash-accounts"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _is_cfo(user: User) -> bool:
    return getattr(user, "role", "") in ("cfo", "admin")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


def _account_response(account: BankAccount, user: User) -> dict:
    # IMPORTANT: use user.company_id (tenant key), NOT account.entity_id (entity-level FK)
    details = decrypt_account_details(account, user.company_id, _is_cfo(user))
    return {**{c.key: getattr(account, c.key) for c in account.__table__.columns}, **details}


@router.get("", response_model=list[BankAccountResponse])
async def list_accounts_route(
    entity_id: uuid.UUID | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    from sqlalchemy import select
    q = (select(BankAccount)
         .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
         .where(LegalEntity.company_id == current_user.company_id))
    if entity_id:
        q = q.where(BankAccount.entity_id == entity_id)
    if status:
        q = q.where(BankAccount.status == status)
    result = await db.execute(q)
    accounts = result.scalars().all()
    return [_account_response(a, current_user) for a in accounts]


@router.post("", response_model=BankAccountResponse, status_code=201)
async def create_account_route(
    payload: BankAccountCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    account = await create_account(db, entity_id=payload.entity_id,
                                    company_id=current_user.company_id,
                                    payload=payload.model_dump(),
                                    created_by=current_user.id)
    return _account_response(account, current_user)


@router.post("/{account_id}/verify", response_model=BankAccountResponse)
async def verify_account_route(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    account = await verify_account(db, account_id=account_id,
                                    company_id=current_user.company_id,
                                    verifier_id=current_user.id)
    return _account_response(account, current_user)


@router.post("/{account_id}/freeze", response_model=BankAccountResponse)
async def freeze_account_route(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    account = await freeze_account(db, account_id=account_id,
                                    company_id=current_user.company_id,
                                    actor_id=current_user.id)
    return _account_response(account, current_user)


@router.post("/{account_id}/unfreeze", response_model=BankAccountResponse)
async def unfreeze_account_route(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    account = await unfreeze_account(db, account_id=account_id,
                                      company_id=current_user.company_id,
                                      actor_id=current_user.id)
    return _account_response(account, current_user)


@router.post("/{account_id}/close", response_model=BankAccountResponse)
async def close_account_route(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    account = await close_account(db, account_id=account_id,
                                   company_id=current_user.company_id,
                                   actor_id=current_user.id)
    return _account_response(account, current_user)


@router.patch("/{account_id}", response_model=BankAccountResponse)
async def update_account_route(
    account_id: uuid.UUID,
    payload: BankAccountUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update non-sensitive fields: nickname, purpose, thresholds, GL codes."""
    _require_write(current_user)
    account = await _get_account(db, account_id, current_user.company_id)
    for k, v in payload.model_dump(exclude_none=True).items():
        if hasattr(account, k):
            setattr(account, k, v)
    account.version += 1
    return _account_response(account, current_user)


@router.get("/{account_id}/balances")
async def account_balances_route(
    account_id: uuid.UUID,
    date_from: date | None = None,
    date_to: date | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Return balance history for a specific account."""
    _require_professional(current_user)
    q = select(CashBalance).where(CashBalance.account_id == account_id)
    if date_from:
        q = q.where(CashBalance.balance_date >= date_from)
    if date_to:
        q = q.where(CashBalance.balance_date <= date_to)
    q = q.order_by(CashBalance.balance_date.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{account_id}/audit")
async def account_audit_route(
    account_id: uuid.UUID,
    limit: int = 50,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Return per-account audit events in reverse chain order."""
    _require_professional(current_user)
    result = await db.execute(
        select(CashAuditEvent)
        .where(CashAuditEvent.account_id == account_id)
        .order_by(CashAuditEvent.chain_seq.desc())
        .limit(limit)
    )
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "event_type": e.event_type,
            "chain_seq": e.chain_seq,
            "performed_by": str(e.performed_by),
            "created_at": e.created_at.isoformat(),
        }
        for e in events
    ]
```

- [ ] **Step 5: Implement `v1_cash_positions.py`**

```python
# backend/app/api/routes/v1_cash_positions.py
"""v1 cash positions — manual entry, pull, consolidated views."""
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.dependencies import get_current_user, get_session
from app.models.cash import BankAccount, CashBalance, LegalEntity, ReconciliationStatus
from app.models.user import User
from app.schemas_v1.cash import (
    CashBalanceCreate, BulkBalanceCreate, ReconcileRequest, CashBalanceResponse,
    ConsolidatedPositionResponse, EntityPositionResponse,
)
from app.services.cash_balance_service import enter_balance, bulk_enter_balances, reconcile_balance

router = APIRouter(prefix="/v1/cash", tags=["cash-positions"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


@router.get("/positions/consolidated", response_model=ConsolidatedPositionResponse)
async def consolidated_position(
    as_of_date: date | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    target_date = as_of_date or date.today()
    result = await get_consolidated_position(db, company_id=current_user.company_id, as_of_date=target_date)
    return ConsolidatedPositionResponse(as_of_date=target_date, positions=result)


@router.get("/positions/by-entity", response_model=EntityPositionResponse)
async def entity_position(
    as_of_date: date | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    target_date = as_of_date or date.today()
    result = await get_entity_position(db, company_id=current_user.company_id, as_of_date=target_date)
    return EntityPositionResponse(as_of_date=target_date, positions=result)


@router.get("/positions/by-account")
async def account_position(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await get_account_position(db, company_id=current_user.company_id)


@router.post("/balances", response_model=CashBalanceResponse, status_code=201)
async def enter_balance_route(
    payload: CashBalanceCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    return await enter_balance(db, account_id=payload.account_id,
                                company_id=current_user.company_id,
                                payload=payload.model_dump(),
                                created_by=current_user.id)


@router.post("/balances/bulk")
async def bulk_balances_route(
    payload: BulkBalanceCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    rows = [r.model_dump() for r in payload.rows]
    results = await bulk_enter_balances(db, company_id=current_user.company_id,
                                         rows=rows, created_by=current_user.id)
    return {"created": len(results)}


@router.post("/balances/{balance_id}/reconcile", response_model=CashBalanceResponse)
async def reconcile_balance_route(
    balance_id: uuid.UUID,
    payload: ReconcileRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    return await reconcile_balance(
        db,
        balance_id=balance_id,
        company_id=current_user.company_id,
        reconciler_id=current_user.id,
        new_status=ReconciliationStatus(payload.status),
        note=payload.note,
    )


@router.post("/pull/{connection_id}")
async def pull_balances_route(
    connection_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    # Delegates to bank_connection_service.pull_balances (Phase 2a stub — live adapters in 2e)
    return {"message": "Pull triggered", "connection_id": str(connection_id)}


# ── Position query helpers (called by routes above) ────────────────────

async def get_consolidated_position(db, *, company_id, as_of_date):
    from decimal import Decimal
    result = await db.execute(
        select(
            CashBalance.currency,
            func.sum(CashBalance.ledger_balance).label("ledger_balance"),
            func.sum(CashBalance.available_balance).label("available_balance"),
            func.sum(CashBalance.in_transit_credit - CashBalance.in_transit_debit).label("in_transit_net"),
            func.count(CashBalance.account_id.distinct()).label("account_count"),
        )
        .join(BankAccount, CashBalance.account_id == BankAccount.id)
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(LegalEntity.company_id == company_id, CashBalance.balance_date == as_of_date)
        .group_by(CashBalance.currency)
    )
    rows = result.all()
    return [
        {
            "currency": r.currency,
            "ledger_balance": r.ledger_balance or Decimal("0"),
            "available_balance": r.available_balance or Decimal("0"),
            "in_transit_net": r.in_transit_net or Decimal("0"),
            "account_count": r.account_count,
        }
        for r in rows
    ]


async def get_entity_position(db, *, company_id, as_of_date):
    from decimal import Decimal
    result = await db.execute(
        select(
            LegalEntity.id.label("entity_id"),
            LegalEntity.short_name.label("entity_name"),
            CashBalance.currency,
            func.sum(CashBalance.ledger_balance).label("ledger_balance"),
            func.sum(CashBalance.available_balance).label("available_balance"),
        )
        .join(BankAccount, CashBalance.account_id == BankAccount.id)
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(LegalEntity.company_id == company_id, CashBalance.balance_date == as_of_date)
        .group_by(LegalEntity.id, LegalEntity.short_name, CashBalance.currency)
    )
    rows = result.all()
    return [
        {
            "entity_id": r.entity_id,
            "entity_name": r.entity_name,
            "currency": r.currency,
            "ledger_balance": r.ledger_balance or Decimal("0"),
            "available_balance": r.available_balance or Decimal("0"),
        }
        for r in rows
    ]


async def get_account_position(db, *, company_id):
    from decimal import Decimal
    result = await db.execute(
        select(BankAccount, CashBalance)
        .outerjoin(
            CashBalance,
            (CashBalance.account_id == BankAccount.id)
        )
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(LegalEntity.company_id == company_id)
        .distinct(BankAccount.id)
        .order_by(BankAccount.id, CashBalance.balance_date.desc())
    )
    return [
        {
            "account_id": str(row.BankAccount.id),
            "nickname": row.BankAccount.nickname,
            "currency": row.BankAccount.currency,
            "ledger_balance": str(row.CashBalance.ledger_balance) if row.CashBalance else None,
            "available_balance": str(row.CashBalance.available_balance) if row.CashBalance else None,
            "balance_date": str(row.CashBalance.balance_date) if row.CashBalance else None,
            "status": row.BankAccount.status,
        }
        for row in result.all()
    ]
```

- [ ] **Step 6: Run route tests**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_v1_cash_routes.py -v
# Expected: 5 passed
```

- [ ] **Step 7: Commit**

```bash
git add \
  backend/app/api/routes/v1_legal_entities.py \
  backend/app/api/routes/v1_bank_accounts.py \
  backend/app/api/routes/v1_cash_positions.py \
  backend/tests/test_v1_cash_routes.py
git commit -m "feat(routes): v1_legal_entities, v1_bank_accounts, v1_cash_positions"
```

---

### Task 15: Routes — bank connections + cash audit + router registration

**Files:**
- Create: `backend/app/api/routes/v1_bank_connections.py`
- Create: `backend/app/api/routes/v1_cash_audit.py`
- Modify: `backend/app/api/router.py`

- [ ] **Step 1: Implement `v1_bank_connections.py`**

```python
# backend/app/api/routes/v1_bank_connections.py
"""v1 bank connections — OAuth flow + circuit-breaker management."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.dependencies import get_current_user, get_session
from app.models.cash import BankConnection, BankConnectionStatus
from app.models.user import User
from app.schemas_v1.cash import AuthUrlRequest, AuthUrlResponse, OAuthCallbackRequest, BankConnectionResponse
from app.services.bank_connection_service import get_auth_url, handle_callback, revoke_connection

router = APIRouter(prefix="/v1/cash/connections", tags=["cash-connections"])


def _require_write(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


@router.get("", response_model=list[BankConnectionResponse])
async def list_connections(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if getattr(current_user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")
    result = await db.execute(
        select(BankConnection).where(BankConnection.company_id == current_user.company_id)
    )
    return result.scalars().all()


@router.get("/auth-url", response_model=AuthUrlResponse)
async def get_auth_url_route(
    provider: str,
    redirect_uri: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    url, connection = await get_auth_url(
        db,
        provider=provider,
        company_id=current_user.company_id,
        redirect_uri=redirect_uri,
        created_by=current_user.id,
    )
    await db.flush()
    return AuthUrlResponse(url=url, connection_id=connection.id)


@router.post("/callback", response_model=BankConnectionResponse)
async def oauth_callback(
    payload: OAuthCallbackRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    try:
        connection = await handle_callback(
            db,
            state=payload.state,
            code=payload.code,
            company_id=current_user.company_id,
            created_by=current_user.id,
        )
        return connection
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{connection_id}", status_code=204)
async def revoke_connection_route(
    connection_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    try:
        await revoke_connection(db, connection_id=connection_id,
                                company_id=current_user.company_id,
                                actor_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{connection_id}/refresh", response_model=BankConnectionResponse)
async def refresh_connection_route(
    connection_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Trigger token refresh for an active connection (stub — live implementation in Phase 2e)."""
    _require_write(current_user)
    result = await db.execute(
        select(BankConnection).where(
            BankConnection.id == connection_id,
            BankConnection.company_id == current_user.company_id,
        )
    )
    connection = result.scalar_one_or_none()
    if connection is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    return connection  # Phase 2e: call adapter.refresh_token() here


@router.post("/{connection_id}/reactivate", response_model=BankConnectionResponse)
async def reactivate_connection_route(
    connection_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Manually reactivate a connection that tripped the circuit-breaker. CFO/head_of_risk only."""
    _require_write(current_user)
    result = await db.execute(
        select(BankConnection).where(
            BankConnection.id == connection_id,
            BankConnection.company_id == current_user.company_id,
        )
    )
    connection = result.scalar_one_or_none()
    if connection is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    if connection.status != BankConnectionStatus.ERROR.value:
        raise HTTPException(status_code=422, detail="Connection is not in ERROR state")
    connection.status = BankConnectionStatus.ACTIVE.value
    connection.consecutive_failure_count = 0
    return connection
```

- [ ] **Step 2: Implement `v1_cash_audit.py`**

```python
# backend/app/api/routes/v1_cash_audit.py
"""v1 cash audit — chain verification + event log (read-only)."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.dependencies import get_current_user, get_session
from app.models.cash import CashAuditEvent
from app.models.user import User

router = APIRouter(prefix="/v1/cash/audit", tags=["cash-audit"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


@router.get("/chain-verify")
async def chain_verify(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Verify SHA-256 chain integrity for this tenant.

    Delegates to cash_audit_service.verify_chain which recomputes each event_hash
    to detect payload tampering (not just linkage checks).
    """
    _require_professional(current_user)
    from app.services.cash_audit_service import verify_chain as _verify_chain
    return await _verify_chain(db, company_id=current_user.company_id)


@router.get("/events")
async def list_audit_events(
    account_id: uuid.UUID | None = None,
    event_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    q = select(CashAuditEvent).where(CashAuditEvent.company_id == current_user.company_id)
    if account_id:
        q = q.where(CashAuditEvent.account_id == account_id)
    if event_type:
        q = q.where(CashAuditEvent.event_type == event_type)
    q = q.order_by(CashAuditEvent.chain_seq.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "event_type": e.event_type,
            "account_id": str(e.account_id) if e.account_id else None,
            "chain_seq": e.chain_seq,
            "performed_by": str(e.performed_by),
            "created_at": e.created_at.isoformat(),
        }
        for e in events
    ]
```

- [ ] **Step 3: Register all 5 routers in `router.py`**

Add these lines at the end of `backend/app/api/router.py`:

```python
# Treasury Suite Phase 2a — Cash & Banking (owns /v1/cash/*)
from app.api.routes.v1_legal_entities import router as v1_legal_entities_router
from app.api.routes.v1_bank_accounts import router as v1_bank_accounts_router
from app.api.routes.v1_cash_positions import router as v1_cash_positions_router
from app.api.routes.v1_bank_connections import router as v1_bank_connections_router
from app.api.routes.v1_cash_audit import router as v1_cash_audit_router

router.include_router(v1_legal_entities_router)
router.include_router(v1_bank_accounts_router)
router.include_router(v1_cash_positions_router)
router.include_router(v1_bank_connections_router)
router.include_router(v1_cash_audit_router)
```

- [ ] **Step 4: Run full backend tests**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/ -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
# Expected: ~4870+ passed, 0 failed
```

- [ ] **Step 5: Commit**

```bash
git add \
  backend/app/api/routes/v1_bank_connections.py \
  backend/app/api/routes/v1_cash_audit.py \
  backend/app/api/router.py
git commit -m "feat(routes): v1_bank_connections, v1_cash_audit + register all 5 cash routers"
```

---

## Chunk 4: Frontend

### Task 16: `cashClient.ts`

**Files:**
- Create: `frontend/src/lib/api/cashClient.ts`

- [ ] **Step 1: Implement `cashClient.ts`**

```typescript
// frontend/src/lib/api/cashClient.ts
/**
 * Type-safe API client for Treasury Suite Phase 2a cash endpoints.
 * All calls go through dashboardFetch for CSRF + auth (identical pattern to glClient.ts).
 *
 * Note: dashboardFetch returns Promise<Response>. The _fetchJson helper below
 * adds error checking and JSON parsing, matching the glClient.ts pattern exactly.
 */
import { dashboardFetch } from "@/lib/api/dashboardClient";

// Helper: error-raising fetch + JSON parse (mirrors glClient.ts _fetchJson)
async function _fetchJson<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await dashboardFetch(path, token, options);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json(); if (b?.detail) detail = b.detail; } catch { /* noop */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────

export interface LegalEntity {
  id: string;
  company_id: string;
  parent_entity_id: string | null;
  legal_name: string;
  short_name: string;
  lei: string | null;
  giin: string | null;
  country: string;
  functional_currency: string;
  reporting_currency: string;
  status: "ACTIVE" | "DORMANT" | "LIQUIDATED";
  version: number;
  created_at: string;
  updated_at: string;
}

export interface BankAccount {
  id: string;
  entity_id: string;
  bank_name: string;
  bank_bic: string | null;
  account_number: string | null;  // masked unless cfo
  iban: string | null;             // masked unless cfo
  account_type: string;
  currency: string;
  nickname: string;
  status: "PENDING_VERIFICATION" | "ACTIVE" | "FROZEN" | "CLOSED";
  overdraft_limit: string;
  min_balance_threshold: string | null;
  gl_debit_code: string | null;
  gl_credit_code: string | null;
  version: number;
  created_by: string;
  created_at: string;
}

export interface BankConnection {
  id: string;
  provider: "TRUELAYER" | "PLAID";
  institution_name: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "ERROR";
  consecutive_failure_count: number;
  last_successful_pull_at: string | null;
  last_error_message: string | null;
  created_at: string;
}

export interface CashBalance {
  id: string;
  account_id: string;
  balance_date: string;
  ledger_balance: string;
  available_balance: string;
  in_transit_debit: string;
  in_transit_credit: string;
  currency: string;
  source: string;
  reconciliation_status: string;
  created_at: string;
}

export interface CurrencyPosition {
  currency: string;
  ledger_balance: string;
  available_balance: string;
  in_transit_net: string;
  account_count: number;
}

export interface ConsolidatedPosition {
  as_of_date: string;
  positions: CurrencyPosition[];
}

export interface EntityPosition {
  entity_id: string;
  entity_name: string;
  currency: string;
  ledger_balance: string;
  available_balance: string;
}

export interface EntityPositionResponse {
  as_of_date: string;
  positions: EntityPosition[];
}

// ── Entity endpoints ─────────────────────────────────────────────────────

export const listEntities = (token: string, params?: { status?: string }) =>
  _fetchJson<LegalEntity[]>(`/v1/cash/entities${params?.status ? `?status=${params.status}` : ""}`, token);

export const createEntity = (token: string, payload: Partial<LegalEntity>) =>
  _fetchJson<LegalEntity>("/v1/cash/entities", token, { method: "POST", body: JSON.stringify(payload) });

export const getEntity = (token: string, id: string) =>
  _fetchJson<LegalEntity>(`/v1/cash/entities/${id}`, token);

export const updateEntity = (token: string, id: string, payload: Partial<LegalEntity>) =>
  _fetchJson<LegalEntity>(`/v1/cash/entities/${id}`, token, { method: "PATCH", body: JSON.stringify(payload) });

export const closeEntity = (token: string, id: string, status: "DORMANT" | "LIQUIDATED") =>
  _fetchJson<LegalEntity>(`/v1/cash/entities/${id}/close`, token, { method: "POST", body: JSON.stringify({ status }) });

// ── Account endpoints ────────────────────────────────────────────────────

export const listAccounts = (token: string, params?: { entity_id?: string; status?: string }) => {
  const q = new URLSearchParams(params as Record<string, string>).toString();
  return _fetchJson<BankAccount[]>(`/v1/cash/accounts${q ? `?${q}` : ""}`, token);
};

export const getAccount = (token: string, id: string) =>
  _fetchJson<BankAccount>(`/v1/cash/accounts/${id}`, token);

export const createAccount = (token: string, payload: Partial<BankAccount> & { account_number?: string; iban?: string }) =>
  _fetchJson<BankAccount>("/v1/cash/accounts", token, { method: "POST", body: JSON.stringify(payload) });

export const verifyAccount = (token: string, id: string) =>
  _fetchJson<BankAccount>(`/v1/cash/accounts/${id}/verify`, token, { method: "POST" });

export const freezeAccount = (token: string, id: string) =>
  _fetchJson<BankAccount>(`/v1/cash/accounts/${id}/freeze`, token, { method: "POST" });

export const unfreezeAccount = (token: string, id: string) =>
  _fetchJson<BankAccount>(`/v1/cash/accounts/${id}/unfreeze`, token, { method: "POST" });

export const closeAccount = (token: string, id: string) =>
  _fetchJson<BankAccount>(`/v1/cash/accounts/${id}/close`, token, { method: "POST" });

export const getAccountBalances = (token: string, id: string, params?: { date_from?: string; date_to?: string }) => {
  const q = new URLSearchParams(params as Record<string, string>).toString();
  return _fetchJson<CashBalance[]>(`/v1/cash/accounts/${id}/balances${q ? `?${q}` : ""}`, token);
};

export const getAccountAudit = (token: string, id: string) =>
  _fetchJson<object[]>(`/v1/cash/accounts/${id}/audit`, token);

// ── Position endpoints ───────────────────────────────────────────────────

export const getConsolidatedPosition = (token: string, asOfDate?: string) =>
  _fetchJson<ConsolidatedPosition>(`/v1/cash/positions/consolidated${asOfDate ? `?as_of_date=${asOfDate}` : ""}`, token);

export const getEntityPosition = (token: string, asOfDate?: string) =>
  _fetchJson<EntityPositionResponse>(`/v1/cash/positions/by-entity${asOfDate ? `?as_of_date=${asOfDate}` : ""}`, token);

export const getAccountPosition = (token: string) =>
  _fetchJson<object[]>("/v1/cash/positions/by-account", token);

export const enterBalance = (token: string, payload: Partial<CashBalance>) =>
  _fetchJson<CashBalance>("/v1/cash/balances", token, { method: "POST", body: JSON.stringify(payload) });

export const bulkEnterBalances = (token: string, rows: Partial<CashBalance>[]) =>
  _fetchJson<{ created: number }>("/v1/cash/balances/bulk", token, { method: "POST", body: JSON.stringify({ rows }) });

export const reconcileBalance = (token: string, balanceId: string, payload: { status: string; note?: string }) =>
  _fetchJson<CashBalance>(`/v1/cash/balances/${balanceId}/reconcile`, token, { method: "POST", body: JSON.stringify(payload) });

export const pullBalances = (token: string, connectionId: string) =>
  _fetchJson<{ message: string }>(`/v1/cash/pull/${connectionId}`, token, { method: "POST" });

// ── Connection endpoints ─────────────────────────────────────────────────

export const listConnections = (token: string) =>
  _fetchJson<BankConnection[]>("/v1/cash/connections", token);

export const getAuthUrl = (token: string, provider: string, redirectUri: string) =>
  _fetchJson<{ url: string; connection_id: string }>(
    `/v1/cash/connections/auth-url?provider=${provider}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    token,
  );

export const handleCallback = (token: string, state: string, code: string) =>
  _fetchJson<BankConnection>("/v1/cash/connections/callback", token, {
    method: "POST",
    body: JSON.stringify({ state, code }),
  });

export const refreshConnection = (token: string, id: string) =>
  _fetchJson<BankConnection>(`/v1/cash/connections/${id}/refresh`, token, { method: "POST" });

export const reactivateConnection = (token: string, id: string) =>
  _fetchJson<BankConnection>(`/v1/cash/connections/${id}/reactivate`, token, { method: "POST" });

export const revokeConnection = (token: string, id: string) =>
  _fetchJson<void>(`/v1/cash/connections/${id}`, token, { method: "DELETE" });

// ── Audit endpoints ──────────────────────────────────────────────────────

export const verifyCashChain = (token: string) =>
  _fetchJson<{ ok: boolean; broken_at_seq?: number; event_count?: number }>("/v1/cash/audit/chain-verify", token);

export const listCashAuditEvents = (token: string, params?: { account_id?: string; event_type?: string; limit?: number }) => {
  const q = new URLSearchParams(params as Record<string, string>).toString();
  return _fetchJson<object[]>(`/v1/cash/audit/events${q ? `?${q}` : ""}`, token);
};
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
# Expected: no output (clean)
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/cashClient.ts
git commit -m "feat(frontend): cashClient.ts — 28 typed functions for all cash endpoints"
```

---

### Task 17: `/cash-positions` page (3-tab dashboard)

**Files:**
- Create: `frontend/src/app/cash-positions/page.tsx`

- [ ] **Step 1: Implement the page**

```tsx
// frontend/src/app/cash-positions/page.tsx
"use client";
import { useEffect, useState } from "react";
import { BarChart2, RefreshCw, Building2, List, Globe } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import {
  getConsolidatedPosition, getEntityPosition, getAccountPosition, pullBalances,
  ConsolidatedPosition, EntityPositionResponse,
} from "@/lib/api/cashClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
} as const;

type Tab = "CONSOLIDATED" | "BY_ENTITY" | "BY_ACCOUNT";

export default function CashPositionsPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("CONSOLIDATED");
  const [consolidated, setConsolidated] = useState<ConsolidatedPosition | null>(null);
  const [entityPos, setEntityPos] = useState<EntityPositionResponse | null>(null);
  const [accountPos, setAccountPos] = useState<object[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (tab === "CONSOLIDATED") {
        const data = await getConsolidatedPosition(token);
        setConsolidated(data);
      } else if (tab === "BY_ENTITY") {
        const data = await getEntityPosition(token);
        setEntityPos(data);
      } else {
        const data = await getAccountPosition(token);
        setAccountPos(data as object[]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load positions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tab, token]);

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BarChart2 size={18} color="var(--accent-primary)" />
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
              Cash Positions
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Hedge Desk → Cash Positions
            </div>
          </div>
        </div>
        <button
          onClick={load}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
            background: "var(--bg-sub)", border: "1px solid var(--border-rim)",
            borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: S.fontMono,
            color: "var(--text-primary)",
          }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid var(--border-rim)" }}>
        {(["CONSOLIDATED", "BY_ENTITY", "BY_ACCOUNT"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px", fontSize: 11, fontFamily: S.fontMono, letterSpacing: 1,
              background: tab === t ? "var(--bg-sub)" : "transparent",
              border: "none", borderBottom: tab === t ? "2px solid var(--accent-primary)" : "2px solid transparent",
              cursor: "pointer", color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 4, padding: "10px 14px", marginBottom: 16, fontSize: 12,
          color: "#ef4444", display: "flex", alignItems: "center", gap: 8,
        }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
          Loading...
        </div>
      )}

      {/* CONSOLIDATED tab */}
      {!loading && tab === "CONSOLIDATED" && consolidated && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {consolidated.positions.map((p) => (
            <div
              key={p.currency}
              style={{
                background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16,
              }}
            >
              <div style={{ fontSize: 11, fontFamily: S.fontMono, color: "var(--text-muted)", marginBottom: 8 }}>
                {p.currency}
              </div>
              <div style={{ fontSize: 18, fontFamily: S.fontMono, fontWeight: 700, marginBottom: 4 }}>
                {Number(p.ledger_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Available: {Number(p.available_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                {p.account_count} account{p.account_count !== 1 ? "s" : ""}
              </div>
            </div>
          ))}
          {consolidated.positions.length === 0 && (
            <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
              No cash positions for today. Enter balances or pull from connected banks.
            </div>
          )}
        </div>
      )}

      {/* BY ENTITY tab */}
      {!loading && tab === "BY_ENTITY" && entityPos && (
        <div>
          {entityPos.positions.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
              No entity positions for today.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["Entity", "Currency", "Ledger Balance", "Available"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: 10 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entityPos.positions.map((p, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${S.rim}` }}>
                    <td style={{ padding: "10px 12px" }}>{p.entity_name}</td>
                    <td style={{ padding: "10px 12px" }}>{p.currency}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {Number(p.ledger_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {Number(p.available_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* BY ACCOUNT tab */}
      {!loading && tab === "BY_ACCOUNT" && (
        <div>
          {accountPos.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
              No accounts found. Add accounts in Settings → Bank Accounts.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["Nickname", "Currency", "Ledger Balance", "Available", "Date", "Status"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: 10 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(accountPos as Record<string, unknown>[]).map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${S.rim}` }}>
                    <td style={{ padding: "10px 12px" }}>{row.nickname as string}</td>
                    <td style={{ padding: "10px 12px" }}>{row.currency as string}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {row.ledger_balance
                        ? Number(row.ledger_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })
                        : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {row.available_balance
                        ? Number(row.available_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })
                        : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>{(row.balance_date as string) || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 3,
                        background: row.status === "ACTIVE" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.1)",
                        color: row.status === "ACTIVE" ? "#22c55e" : "#ef4444",
                      }}>
                        {row.status as string}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
# Expected: no errors
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/cash-positions/page.tsx
git commit -m "feat(frontend): /cash-positions — 3-tab dashboard (consolidated/entity/account)"
```

---

### Task 18: Settings pages — `/settings/legal-entities`, `/settings/bank-accounts`, `/settings/bank-connections`

**Files:**
- Create: `frontend/src/app/settings/legal-entities/page.tsx`
- Create: `frontend/src/app/settings/bank-accounts/page.tsx`
- Create: `frontend/src/app/settings/bank-connections/page.tsx`

- [ ] **Step 1: Implement `/settings/legal-entities/page.tsx`**

```tsx
// frontend/src/app/settings/legal-entities/page.tsx
"use client";
import { useEffect, useState } from "react";
import { Building2, Plus, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { listEntities, LegalEntity } from "@/lib/api/cashClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)", rim: "var(--border-rim)",
} as const;

export default function LegalEntitiesPage() {
  const { token } = useAuth();
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listEntities(token)
      .then(setEntities)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Building2 size={18} color="var(--accent-primary)" />
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
              Legal Entities
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Settings → Legal Entities
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 4, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#ef4444" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
      ) : entities.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
          No legal entities configured. Add your first entity to start tracking group treasury positions.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entities.map((e) => (
            <div key={e.id} style={{
              background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6,
              padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 600 }}>{e.legal_name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                  {e.country} · {e.functional_currency} → {e.reporting_currency}
                  {e.lei ? ` · LEI: ${e.lei}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 3, fontFamily: S.fontMono,
                  background: e.status === "ACTIVE" ? "rgba(34,197,94,0.15)" : "rgba(100,100,100,0.15)",
                  color: e.status === "ACTIVE" ? "#22c55e" : "var(--text-muted)",
                }}>
                  {e.status}
                </span>
                <ChevronRight size={14} color="var(--text-muted)" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement `/settings/bank-accounts/page.tsx`**

```tsx
// frontend/src/app/settings/bank-accounts/page.tsx
"use client";
import { useEffect, useState } from "react";
import { CreditCard, ShieldCheck, Snowflake, X } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { listAccounts, verifyAccount, freezeAccount, BankAccount } from "@/lib/api/cashClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)", rim: "var(--border-rim)",
} as const;

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: "rgba(34,197,94,0.15)", color: "#22c55e" },
  PENDING_VERIFICATION: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
  FROZEN: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6" },
  CLOSED: { bg: "rgba(100,100,100,0.15)", color: "var(--text-muted)" },
};

export default function BankAccountsPage() {
  const { token, user } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [tab, setTab] = useState<"ALL" | "PENDING">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = () => {
    if (!token) return;
    setLoading(true);
    listAccounts(token)
      .then(setAccounts)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const pending = accounts.filter((a) => a.status === "PENDING_VERIFICATION");
  const displayed = tab === "PENDING" ? pending : accounts;

  const handleVerify = async (id: string) => {
    if (!token) return;
    setActionId(id);
    try {
      await verifyAccount(token, id);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setActionId(null);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <CreditCard size={18} color="var(--accent-primary)" />
        <div>
          <div style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
            Bank Accounts
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            Settings → Bank Accounts
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid var(--border-rim)" }}>
        {(["ALL", "PENDING"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "7px 14px", fontSize: 11, fontFamily: S.fontMono,
            background: tab === t ? "var(--bg-sub)" : "transparent",
            border: "none", borderBottom: tab === t ? "2px solid var(--accent-primary)" : "2px solid transparent",
            cursor: "pointer", color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
          }}>
            {t === "PENDING" ? `PENDING VERIFICATION${pending.length ? ` (${pending.length})` : ""}` : t}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 4, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#ef4444" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
          {tab === "PENDING" ? "No accounts pending verification." : "No bank accounts configured."}
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-rim)" }}>
              {["Nickname", "Bank", "Type", "Currency", "Account", "Status", "Actions"].map((h) => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, color: "var(--text-muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((a) => {
              const sc = STATUS_COLORS[a.status] ?? STATUS_COLORS.CLOSED;
              // SoD: disable Verify for accounts the current user created (backend also enforces)
              const isSelf = a.created_by === user?.id;
              return (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--border-rim)" }}>
                  <td style={{ padding: "10px 12px" }}>{a.nickname}</td>
                  <td style={{ padding: "10px 12px" }}>{a.bank_name}</td>
                  <td style={{ padding: "10px 12px" }}>{a.account_type}</td>
                  <td style={{ padding: "10px 12px" }}>{a.currency}</td>
                  <td style={{ padding: "10px 12px" }}>{a.account_number || "****"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, ...sc }}>
                      {a.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", display: "flex", gap: 6 }}>
                    {a.status === "PENDING_VERIFICATION" && (
                      <button
                        onClick={() => handleVerify(a.id)}
                        disabled={actionId === a.id || isSelf}
                        title={isSelf ? "Cannot verify your own account (Separation of Duties)" : "Verify account"}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "4px 10px", fontSize: 10, borderRadius: 3, cursor: "pointer",
                          background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
                          color: "#22c55e", fontFamily: S.fontMono,
                          opacity: actionId === a.id ? 0.5 : 1,
                        }}
                      >
                        <ShieldCheck size={10} />
                        VERIFY
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement `/settings/bank-connections/page.tsx`**

```tsx
// frontend/src/app/settings/bank-connections/page.tsx
"use client";
import { useEffect, useState } from "react";
import { Link2, AlertCircle, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { listConnections, revokeConnection, BankConnection } from "@/lib/api/cashClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)", rim: "var(--border-rim)",
} as const;

const STATUS_ICON: Record<string, JSX.Element> = {
  ACTIVE: <CheckCircle2 size={14} color="#22c55e" />,
  EXPIRED: <AlertCircle size={14} color="#fbbf24" />,
  ERROR: <XCircle size={14} color="#ef4444" />,
  REVOKED: <XCircle size={14} color="var(--text-muted)" />,
};

export default function BankConnectionsPage() {
  const { token } = useAuth();
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = () => {
    if (!token) return;
    listConnections(token)
      .then(setConnections)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const handleRevoke = async (id: string) => {
    if (!token || !confirm("Revoke this bank connection? All accounts using it will stop auto-pulling.")) return;
    setRevoking(id);
    try {
      await revokeConnection(token, id);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link2 size={18} color="var(--accent-primary)" />
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
              Bank Connections
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Settings → Bank Connections
            </div>
          </div>
        </div>
      </div>

      <div style={{
        background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)",
        borderRadius: 4, padding: "10px 14px", marginBottom: 20, fontSize: 12,
        color: "var(--text-secondary)",
      }}>
        Connect your bank via TrueLayer (Europe/UK) or Plaid (US/CA) to enable automatic balance pulls.
        OAuth credentials are AES-256 encrypted at rest and never exposed via the API.
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 4, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#ef4444" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
      ) : connections.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
          No bank connections. Use the TrueLayer or Plaid OAuth flow to connect your first bank.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {connections.map((c) => (
            <div key={c.id} style={{
              background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: "14px 16px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {STATUS_ICON[c.status] ?? STATUS_ICON.REVOKED}
                <div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 600 }}>
                    {c.institution_name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {c.provider} · {c.status}
                    {c.last_successful_pull_at ? ` · Last pull: ${new Date(c.last_successful_pull_at).toLocaleDateString()}` : ""}
                    {c.consecutive_failure_count > 0 ? ` · ⚠ ${c.consecutive_failure_count} failure(s)` : ""}
                  </div>
                  {c.last_error_message && c.status === "ERROR" && (
                    <div style={{ fontSize: 10, color: "#ef4444", marginTop: 3 }}>{c.last_error_message}</div>
                  )}
                </div>
              </div>
              {c.status !== "REVOKED" && (
                <button
                  onClick={() => handleRevoke(c.id)}
                  disabled={revoking === c.id}
                  style={{
                    padding: "5px 12px", fontSize: 11, borderRadius: 3, cursor: "pointer",
                    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                    color: "#ef4444", fontFamily: S.fontMono, opacity: revoking === c.id ? 0.5 : 1,
                  }}
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
# Expected: no errors
```

- [ ] **Step 5: Commit**

```bash
git add \
  frontend/src/app/settings/legal-entities/page.tsx \
  frontend/src/app/settings/bank-accounts/page.tsx \
  frontend/src/app/settings/bank-connections/page.tsx
git commit -m "feat(frontend): /settings/legal-entities, bank-accounts, bank-connections pages"
```

---

### Task 19: AppSidebar nav items + final build verification

**Files:**
- Modify: `frontend/src/components/layout/AppSidebar.tsx`

- [ ] **Step 1: Add nav items**

In `AppSidebar.tsx`, find the ACCOUNTING section items (GL Postings, Settlement, ERP Sync) and add Cash Positions immediately after:

```tsx
{ label: "Cash Positions", desc: "Group treasury cash position dashboard", href: "/cash-positions", icon: BarChart2, group: "ACCOUNTING", minTier: "professional" as PlanTier },
```

Add the `BarChart2` import if not already present: `import { ..., BarChart2 } from "lucide-react";`

In the SETTINGS section, add after GL Account Mappings:

```tsx
{ label: "Legal Entities", desc: "Group treasury legal entity hierarchy", href: "/settings/legal-entities", icon: Building2, minTier: "professional" as PlanTier },
{ label: "Bank Accounts", desc: "Bank account registry and verification", href: "/settings/bank-accounts", icon: CreditCard, minTier: "professional" as PlanTier },
{ label: "Bank Connections", desc: "TrueLayer / Plaid OAuth connections", href: "/settings/bank-connections", icon: Link2, minTier: "professional" as PlanTier },
```

Add imports: `import { ..., Building2, CreditCard, Link2 } from "lucide-react";`

- [ ] **Step 2: Full TypeScript check**

```bash
cd frontend && npx tsc --noEmit
# Expected: no errors
```

- [ ] **Step 3: Build check**

```bash
cd frontend && npx next build 2>&1 | tail -20
# Expected: exit 0, all 4 new pages in build output:
# ○ /cash-positions
# ○ /settings/legal-entities
# ○ /settings/bank-accounts
# ○ /settings/bank-connections
```

- [ ] **Step 4: Full backend test run**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/ -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
# Expected: all passed, 0 failed
```

- [ ] **Step 5: Final commit**

```bash
git add frontend/src/components/layout/AppSidebar.tsx
git commit -m "feat(frontend): AppSidebar — Cash Positions, Legal Entities, Bank Accounts, Bank Connections nav"
```

---

## Post-Implementation Checklist

- [ ] Run `alembic upgrade head` against local PostgreSQL `hedgecalc` to apply migrations 0017–0021
- [ ] Set `BANK_ACCOUNT_ENC_KEY` in `.env` (generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"`)
- [ ] Browser verify: navigate to `/cash-positions` — confirm 3 tabs load without errors
- [ ] Browser verify: navigate to `/settings/bank-accounts` — confirm page renders
- [ ] Browser verify: confirm Cash Positions appears in sidebar ACCOUNTING section
- [ ] Browser verify: confirm Legal Entities, Bank Accounts, Bank Connections appear in SETTINGS section
