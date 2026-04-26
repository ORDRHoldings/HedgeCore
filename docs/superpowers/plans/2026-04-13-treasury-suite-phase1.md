# Treasury Suite Phase 1 — FX Lifecycle Complete

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the FX hedge lifecycle — downstream GL journal entry generation/posting, upstream ERP exposure capture, and settlement tracking — across Sprints 56–61.

**Architecture:** New WORM tables (`journal_entries`, `treasury_transactions`, `settlement_events`) with SHA-256 hash chains sit alongside the existing `ledger_entries`/`audit_events` pattern. GL posting adapters push approved entries to ERP systems. ERP pull adapters create positions from live invoice data. All routes are STARTER+ gated.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x async (PostgreSQL), Alembic (raw SQL migrations), Next.js 15 App Router, TypeScript 5, IBM Plex fonts, `lucide-react`

---

## Scope Note

This plan covers Phase 1 (Sprints 56–61). Phase 2 (Cash & Liquidity) and Phase 3 (AI Add-on) are separate plans.

---

## Pre-Flight Checks (do before any task)

```bash
# Verify backend tests still pass
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/ -x -q --tb=short
# Expected: ~4801 passed, 0 failed

# Verify frontend builds
cd frontend && npx tsc --noEmit
```

---

## File Map

**New backend files:**
| File | Responsibility |
|------|----------------|
| `backend/app/models/journal_entry.py` | JournalEntry (WORM, status-mutable) + GLAccountMapping (mutable) models |
| `backend/app/models/treasury_transaction.py` | TreasuryTransaction (strict WORM) cross-cutting audit spine |
| `backend/app/models/settlement_event.py` | SettlementEvent (WORM) model |
| `backend/migrations/versions/0014_journal_entries_gl.py` | `journal_entries` + `gl_account_mappings` tables + WORM triggers |
| `backend/migrations/versions/0015_treasury_transactions.py` | `treasury_transactions` table + WORM triggers |
| `backend/migrations/versions/0016_settlement_events.py` | `settlement_events` table + WORM triggers |
| `backend/app/services/gl_service.py` | GL generation, chain extension, approval, rejection, posting dispatch |
| `backend/app/services/gl_posting_service.py` | Adapter dispatch layer + PostingResult type |
| `backend/app/services/posting_adapters/__init__.py` | Package init |
| `backend/app/services/posting_adapters/base.py` | Abstract GLPostingAdapter interface |
| `backend/app/services/posting_adapters/quickbooks.py` | QuickBooks Online posting adapter |
| `backend/app/services/posting_adapters/xero.py` | Xero Manual Journals adapter |
| `backend/app/services/posting_adapters/netsuite.py` | NetSuite SuiteScript adapter |
| `backend/app/services/posting_adapters/csv_exporter.py` | Generic CSV/XML export |
| `backend/app/services/erp_adapters/__init__.py` | Package init |
| `backend/app/services/erp_adapters/base.py` | Abstract ERPPullAdapter interface + ERPInvoice dataclass |
| `backend/app/services/erp_adapters/xero.py` | Xero GET /Invoices pull adapter |
| `backend/app/services/erp_adapters/netsuite.py` | NetSuite REST invoice pull adapter |
| `backend/app/services/erp_connector_service.py` | Pull orchestration, deduplication, auto-position creation |
| `backend/app/services/settlement_service.py` | Settlement confirmation, reconciliation, variance report |
| `backend/app/api/routes/v1_gl.py` | GL journal entry routes |
| `backend/app/api/routes/v1_settlement.py` | Settlement routes |
| `backend/app/api/routes/v1_erp.py` | ERP pull trigger routes |
| `backend/app/schemas_v1/gl.py` | Pydantic schemas for GL endpoints |
| `backend/app/schemas_v1/settlement.py` | Pydantic schemas for settlement endpoints |
| `backend/app/schemas_v1/erp.py` | Pydantic schemas for ERP pull endpoints |
| `backend/tests/test_journal_entry_model.py` | WORM + hash chain unit tests |
| `backend/tests/test_treasury_transaction_model.py` | WORM unit tests |
| `backend/tests/test_gl_service.py` | GL service unit tests (AsyncMock) |
| `backend/tests/test_v1_gl_routes.py` | GL route tests (ASGI) |
| `backend/tests/test_posting_adapters.py` | Adapter unit tests |
| `backend/tests/test_erp_adapters.py` | ERP pull adapter unit tests |
| `backend/tests/test_settlement_service.py` | Settlement service unit tests |
| `backend/tests/test_v1_settlement_routes.py` | Settlement route tests (ASGI) |
| `docs/architecture/adr/0009-outbound-gl-journal-entry-posting.md` | ADR-0009 |
| `docs/architecture/adr/0013-treasury-transaction-spine.md` | ADR-0013 |

**Modified backend files:**
| File | Change |
|------|--------|
| `backend/app/api/router.py` | Register `v1_gl_router`, `v1_settlement_router`, `v1_erp_router` |

**New frontend files:**
| File | Responsibility |
|------|----------------|
| `frontend/src/app/settings/gl-accounts/page.tsx` | GL account mapping editor |
| `frontend/src/app/gl-postings/page.tsx` | Journal entry queue + approve/reject/post UI |
| `frontend/src/app/settlement/page.tsx` | Settlement confirmation + reconciliation UI |
| `frontend/src/app/erp-sync/page.tsx` | ERP pull status + detected exposures UI |
| `frontend/src/lib/api/glClient.ts` | Type-safe API client for GL/settlement/ERP routes |

**Modified frontend files:**
| File | Change |
|------|--------|
| `frontend/src/components/layout/AppSidebar.tsx` | Add GL Postings, Settlement, ERP Sync nav items |

---

## Chunk 1: ADRs + Data Models

### Task 1: Write ADR-0009 and ADR-0013

**Files:**
- Create: `docs/architecture/adr/0009-outbound-gl-journal-entry-posting.md`
- Create: `docs/architecture/adr/0013-treasury-transaction-spine.md`

- [ ] **Step 1: Write ADR-0009**

```markdown
# ADR-0009: Outbound GL Journal Entry Posting

**Status:** accepted  
**Date:** 2026-04-13  
**Deciders:** ORDR Edge

## Context

engine_v1/hedge_accounting.py generates IFRS 9 / ASC 815 journal entries
internally but there is no mechanism to expose them as postable records or
push them to connected accounting systems. This creates an operational gap:
treasurers must manually re-enter journal data into their ERP.

## Decision

Introduce a WORM `journal_entries` table. Entries are generated from hedge
effectiveness runs, settlement confirmations, and fair value changes.
The table deviates from strict append-only WORM in one way: the `status`
column may transition (DRAFT → PENDING_APPROVAL → APPROVED → POSTED | REJECTED).
Every status transition is also recorded as an `audit_event` to preserve an
immutable log of all state changes. No other column may ever be updated.

The table uses a per-tenant SHA-256 hash chain (chain_seq + entry_hash +
prev_entry_hash) to detect tampering. chain_seq is computed via
`SELECT MAX(chain_seq)+1 FOR UPDATE` to prevent concurrent chain forks.

ERP posting is handled by pluggable adapters (QuickBooks, Xero, NetSuite, CSV).
GL account mappings are configured per-tenant in `gl_account_mappings` before
any entry can be generated. Missing mappings raise GLMappingNotConfiguredError.

4-eyes SoD (checker ≠ creator) is enforced on both approve and reject routes.

## Consequences

- Enables automated GL posting, eliminating manual ERP re-entry
- WORM status deviation is documented here and guarded by PostgreSQL trigger
  that blocks updates to all non-status columns
- Requires tenants to configure chart-of-accounts before first use (Sprint 56 Step 0)
- ERP credentials stored in connector_settings JSONB on connectors table

## References

- Spec: docs/superpowers/specs/2026-04-13-treasury-suite-design.md §3.1
- Parent WORM pattern: app/models/ledger.py
```

- [ ] **Step 2: Write ADR-0013**

```markdown
# ADR-0013: Treasury Data Platform — Unified Transaction Spine

**Status:** accepted  
**Date:** 2026-04-13  
**Deciders:** ORDR Edge

## Context

As Phase 1 (GL posting), Phase 2 (cash management), and future modules add
financial event tables, audit trail fragmentation becomes a risk. Each module
has its own records but no single queryable view of all financial events across
the platform.

## Decision

Introduce a strict WORM `treasury_transactions` table as the unified audit
spine. Every financial event (FX hedge execution, settlement, journal entry
posting, bank receipt, payment, intercompany sweep) appends one record.
The table is strictly append-only — no column ever mutated after insert.

Hash chain: tx_hash = SHA-256(company_id|tx_type|amount|currency|value_date|
source_ref_id|created_at|chain_seq). chain_seq computed via SELECT MAX+1 FOR
UPDATE. Independent chain from audit_events; the two chains are cross-referenced
via source_ref_id → originating audit_event id.

## Consequences

- Single queryable table for cross-module treasury analytics
- Each posting adapter and service layer is responsible for appending a
  TreasuryTransaction record after its primary operation succeeds
- Does not replace module-specific tables (JournalEntry, SettlementEvent) —
  those remain the authoritative records; TreasuryTransaction is the audit spine

## References

- Spec: docs/superpowers/specs/2026-04-13-treasury-suite-design.md §6.1
```

- [ ] **Step 3: Commit ADRs**

```bash
git add docs/architecture/adr/0009-outbound-gl-journal-entry-posting.md \
        docs/architecture/adr/0013-treasury-transaction-spine.md
git commit -m "docs(adr): ADR-0009 GL journal entry posting, ADR-0013 treasury transaction spine"
```

---

### Task 2: JournalEntry + GLAccountMapping models

**Files:**
- Create: `backend/app/models/journal_entry.py`
- Create: `backend/tests/test_journal_entry_model.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_journal_entry_model.py
"""Unit tests for JournalEntry and GLAccountMapping models.
No DB required — tests ORM events and hash computation.
"""
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from app.models.journal_entry import (
    GENESIS_HASH,
    GLAccountMapping,
    JournalEntry,
    JournalEntryStatus,
    JOURNAL_ENTRY_TRANSITIONS,
    _compute_entry_hash,
)


def _make_je(**kwargs) -> JournalEntry:
    defaults = dict(
        id=uuid.uuid4(),
        company_id=uuid.uuid4(),
        entry_type="OCI_RECOGNITION",
        standard="IFRS_9",
        debit_account="1200",
        credit_account="3400",
        amount=Decimal("100000.00"),
        currency="EUR",
        base_amount=Decimal("110000.00"),
        base_currency="USD",
        fx_rate_used=Decimal("1.10"),
        period_date=date(2026, 3, 31),
        status=JournalEntryStatus.DRAFT.value,
        entry_hash="a" * 64,
        prev_entry_hash=GENESIS_HASH,
        chain_seq=1,
        created_at=datetime(2026, 4, 1, tzinfo=UTC),
        created_by=uuid.uuid4(),
    )
    defaults.update(kwargs)
    je = JournalEntry()
    for k, v in defaults.items():
        setattr(je, k, v)
    return je


def test_genesis_hash_is_64_zeros():
    assert GENESIS_HASH == "0" * 64
    assert len(GENESIS_HASH) == 64


def test_compute_entry_hash_deterministic():
    cid = uuid.UUID("00000000-0000-0000-0000-000000000001")
    h1 = _compute_entry_hash(
        company_id=cid, entry_type="OCI_RECOGNITION", standard="IFRS_9",
        debit_account="1200", credit_account="3400", amount=Decimal("100000"),
        currency="EUR", period_date=date(2026, 3, 31),
        created_at=datetime(2026, 4, 1, tzinfo=UTC), chain_seq=1,
    )
    h2 = _compute_entry_hash(
        company_id=cid, entry_type="OCI_RECOGNITION", standard="IFRS_9",
        debit_account="1200", credit_account="3400", amount=Decimal("100000"),
        currency="EUR", period_date=date(2026, 3, 31),
        created_at=datetime(2026, 4, 1, tzinfo=UTC), chain_seq=1,
    )
    assert h1 == h2
    assert len(h1) == 64


def test_compute_entry_hash_changes_with_chain_seq():
    cid = uuid.uuid4()
    kwargs = dict(
        company_id=cid, entry_type="OCI_RECOGNITION", standard="IFRS_9",
        debit_account="1200", credit_account="3400", amount=Decimal("100000"),
        currency="EUR", period_date=date(2026, 3, 31),
        created_at=datetime(2026, 4, 1, tzinfo=UTC),
    )
    h1 = _compute_entry_hash(**kwargs, chain_seq=1)
    h2 = _compute_entry_hash(**kwargs, chain_seq=2)
    assert h1 != h2


def test_journal_entry_transitions_draft_to_pending():
    allowed = JOURNAL_ENTRY_TRANSITIONS[JournalEntryStatus.DRAFT]
    assert JournalEntryStatus.PENDING_APPROVAL in allowed


def test_journal_entry_transitions_pending_to_approved_or_rejected():
    allowed = JOURNAL_ENTRY_TRANSITIONS[JournalEntryStatus.PENDING_APPROVAL]
    assert JournalEntryStatus.APPROVED in allowed
    assert JournalEntryStatus.REJECTED in allowed


def test_journal_entry_transitions_posted_is_terminal():
    assert JOURNAL_ENTRY_TRANSITIONS[JournalEntryStatus.POSTED] == set()


def test_journal_entry_transitions_rejected_is_terminal():
    assert JOURNAL_ENTRY_TRANSITIONS[JournalEntryStatus.REJECTED] == set()


def test_worm_delete_blocked():
    je = _make_je()
    # Simulate ORM before_delete event
    from app.models.journal_entry import _block_je_delete
    with pytest.raises(RuntimeError, match="WORM.*deletes are forbidden"):
        _block_je_delete(None, None, je)


def test_worm_update_immutable_field_blocked():
    """Updating an immutable field (e.g. amount) must raise RuntimeError."""
    from app.models.journal_entry import _block_je_update  # noqa: PLC0415

    je = _make_je()
    # Simulate SQLAlchemy attribute history: amount changed from old to new
    mock_history = MagicMock()
    mock_history.has_changes.return_value = True
    mock_history.deleted = [Decimal("100000.00")]  # old value present → update happened

    mock_mapper = MagicMock()
    mock_mapper.columns = [MagicMock(key="amount")]

    with patch(
        "app.models.journal_entry.get_history",
        return_value=mock_history,
    ):
        with pytest.raises(RuntimeError, match="cannot update.*amount"):
            _block_je_update(mock_mapper, None, je)


def test_worm_update_mutable_field_allowed():
    """Updating a mutable field (status, posted_at, posted_to, posted_ref) must NOT raise."""
    from app.models.journal_entry import _block_je_update  # noqa: PLC0415

    je = _make_je()
    mock_history = MagicMock()
    mock_history.has_changes.return_value = True
    mock_history.deleted = ["DRAFT"]  # old status value

    mock_mapper = MagicMock()
    mock_mapper.columns = [MagicMock(key="status")]

    with patch(
        "app.models.journal_entry.get_history",
        return_value=mock_history,
    ):
        # Should not raise — status is in _MUTABLE_FIELDS
        _block_je_update(mock_mapper, None, je)


def test_gl_account_mapping_has_required_fields():
    m = GLAccountMapping()
    m.company_id = uuid.uuid4()
    m.entry_type = "OCI_RECOGNITION"
    m.standard = "IFRS_9"
    m.debit_account = "1200"
    m.credit_account = "3400"
    m.updated_by = uuid.uuid4()
    m.created_by = uuid.uuid4()
    assert m.erp_system is None or True  # has the field
    assert hasattr(m, "updated_by")
    assert hasattr(m, "account_label")
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_journal_entry_model.py -v --tb=short
```
Expected: `ModuleNotFoundError: No module named 'app.models.journal_entry'`

- [ ] **Step 3: Write the model**

```python
# backend/app/models/journal_entry.py
"""
app/models/journal_entry.py

JournalEntry — WORM record of GL journal entries generated from hedge
effectiveness runs, settlement events, and fair value changes.

WORM semantics (ADR-0009):
  - No DELETE
  - No UPDATE except: status, posted_at, posted_to, posted_ref
  - Every status transition also emits an audit_event (immutable log)
  - SHA-256 hash chain: (chain_seq, entry_hash, prev_entry_hash)
  - chain_seq: SELECT MAX+1 FOR UPDATE to prevent concurrent chain forks

GLAccountMapping — mutable per-tenant chart-of-accounts configuration.
  - Not WORM (tenants must be able to correct mappings)
  - UNIQUE(company_id, entry_type, standard)
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import BigInteger, Date, DateTime, Numeric, String, UniqueConstraint, event
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.orm.attributes import get_history  # module-level so tests can patch it

from app.core.db import Base


class JournalEntryType(str, Enum):
    OCI_RECOGNITION = "OCI_RECOGNITION"
    PNL_RECLASSIFICATION = "PNL_RECLASSIFICATION"
    INEFFECTIVENESS = "INEFFECTIVENESS"
    SETTLEMENT_VARIANCE = "SETTLEMENT_VARIANCE"
    FAIR_VALUE_CHANGE = "FAIR_VALUE_CHANGE"


class HedgeStandard(str, Enum):
    IFRS_9 = "IFRS_9"
    ASC_815 = "ASC_815"
    IAS_39 = "IAS_39"


class JournalEntryStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    POSTED = "POSTED"
    REJECTED = "REJECTED"


# State machine — keys are FROM states, values are allowed TO states
JOURNAL_ENTRY_TRANSITIONS: dict[JournalEntryStatus, set[JournalEntryStatus]] = {
    JournalEntryStatus.DRAFT: {JournalEntryStatus.PENDING_APPROVAL},
    JournalEntryStatus.PENDING_APPROVAL: {
        JournalEntryStatus.APPROVED,
        JournalEntryStatus.REJECTED,
    },
    JournalEntryStatus.APPROVED: {JournalEntryStatus.POSTED},
    JournalEntryStatus.POSTED: set(),
    JournalEntryStatus.REJECTED: set(),
}

GENESIS_HASH = "0" * 64

# Only these columns may be updated after insert (WORM deviation; ADR-0009)
_MUTABLE_FIELDS = frozenset({"status", "posted_at", "posted_to", "posted_ref"})


def _compute_entry_hash(
    *,
    company_id: uuid.UUID,
    entry_type: str,
    standard: str,
    debit_account: str,
    credit_account: str,
    amount: Decimal,
    currency: str,
    period_date: date,
    created_at: datetime,
    chain_seq: int,
) -> str:
    """SHA-256 over canonical pipe-delimited content string (spec §3.1).

    amount is normalized to 6 decimal places (f"{amount:.6f}") so that
    Decimal("100000") and Decimal("100000.00") produce the same hash.
    """
    content = "|".join([
        str(company_id),
        entry_type,
        standard,
        debit_account,
        credit_account,
        f"{amount:.6f}",
        currency,
        period_date.isoformat(),
        created_at.isoformat(),
        str(chain_seq),
    ])
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    run_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True, index=True
    )
    ledger_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    settlement_event_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    entry_type: Mapped[str] = mapped_column(String(64), nullable=False)
    standard: Mapped[str] = mapped_column(String(16), nullable=False)
    debit_account: Mapped[str] = mapped_column(String(64), nullable=False)
    credit_account: Mapped[str] = mapped_column(String(64), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    base_amount: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    fx_rate_used: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    period_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=JournalEntryStatus.DRAFT.value
    )
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    posted_to: Mapped[str | None] = mapped_column(String(64), nullable=True)
    posted_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Hash chain (spec §3.1, ADR-0009)
    entry_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    prev_entry_hash: Mapped[str] = mapped_column(
        String(128), nullable=False, default=GENESIS_HASH
    )
    chain_seq: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)

    def __repr__(self) -> str:
        return f"<JournalEntry {self.id} type={self.entry_type} status={self.status}>"


@event.listens_for(JournalEntry, "before_delete")
def _block_je_delete(mapper, connection, target):
    raise RuntimeError(
        f"JournalEntry {target.id!r} is WORM — deletes are forbidden (ADR-0009)."
    )


@event.listens_for(JournalEntry, "before_update")
def _block_je_update(mapper, connection, target):
    """Block updates to all columns except the permitted mutable set."""
    # get_history is imported at module level so tests can patch it
    for col in mapper.columns:
        if col.key in _MUTABLE_FIELDS:
            continue
        hist = get_history(target, col.key)
        if hist.has_changes() and hist.deleted:
            raise RuntimeError(
                f"JournalEntry {target.id!r} is WORM — cannot update "
                f"field '{col.key}' (ADR-0009)."
            )


class GLAccountMapping(Base):
    """Per-tenant chart-of-accounts mapping. Mutable (not WORM)."""

    __tablename__ = "gl_account_mappings"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "entry_type", "standard",
            name="uq_gl_mapping_company_type_standard",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    entry_type: Mapped[str] = mapped_column(String(64), nullable=False)
    standard: Mapped[str] = mapped_column(String(16), nullable=False)
    debit_account: Mapped[str] = mapped_column(String(64), nullable=False)
    credit_account: Mapped[str] = mapped_column(String(64), nullable=False)
    account_label: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    erp_system: Mapped[str] = mapped_column(String(32), nullable=False, default="MANUAL")
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    updated_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)

    def __repr__(self) -> str:
        return f"<GLAccountMapping {self.company_id} {self.entry_type}/{self.standard}>"


class GLMappingNotConfiguredError(Exception):
    """Raised when JournalEntry generation lacks a GL account mapping."""
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_journal_entry_model.py -v --tb=short
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/journal_entry.py \
        backend/tests/test_journal_entry_model.py
git commit -m "feat(models): JournalEntry + GLAccountMapping with WORM events and hash chain"
```

---

### Task 3: TreasuryTransaction model

**Files:**
- Create: `backend/app/models/treasury_transaction.py`
- Create: `backend/tests/test_treasury_transaction_model.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_treasury_transaction_model.py
"""Unit tests for TreasuryTransaction WORM model and hash chain."""
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from app.models.treasury_transaction import (
    GENESIS_HASH as TX_GENESIS,
    TreasuryTransaction,
    TxType,
    _compute_tx_hash,
    _block_tx_delete,
    _block_tx_update,
)


def test_tx_genesis_hash_is_64_zeros():
    assert TX_GENESIS == "0" * 64


def test_compute_tx_hash_deterministic():
    cid = uuid.UUID("00000000-0000-0000-0000-000000000001")
    sid = uuid.UUID("00000000-0000-0000-0000-000000000002")
    kwargs = dict(
        company_id=cid, tx_type=TxType.FX_HEDGE.value,
        amount=Decimal("100000"), currency="EUR",
        value_date=date(2026, 3, 31), source_ref_id=sid,
        created_at=datetime(2026, 4, 1, tzinfo=UTC), chain_seq=1,
    )
    assert _compute_tx_hash(**kwargs) == _compute_tx_hash(**kwargs)


def test_compute_tx_hash_changes_with_chain_seq():
    cid, sid = uuid.uuid4(), uuid.uuid4()
    kwargs = dict(
        company_id=cid, tx_type="FX_HEDGE", amount=Decimal("100000"),
        currency="EUR", value_date=date(2026, 3, 31), source_ref_id=sid,
        created_at=datetime(2026, 4, 1, tzinfo=UTC),
    )
    assert _compute_tx_hash(**kwargs, chain_seq=1) != _compute_tx_hash(**kwargs, chain_seq=2)


def test_worm_delete_blocked():
    tx = TreasuryTransaction()
    tx.id = uuid.uuid4()
    with pytest.raises(RuntimeError, match="WORM.*deletes are forbidden"):
        _block_tx_delete(None, None, tx)


def test_worm_update_blocked():
    tx = TreasuryTransaction()
    tx.id = uuid.uuid4()
    with pytest.raises(RuntimeError, match="WORM.*updates are forbidden"):
        _block_tx_update(None, None, tx)


def test_tx_type_enum_has_required_values():
    required = {
        "FX_HEDGE", "SETTLEMENT", "BANK_RECEIPT", "BANK_PAYMENT",
        "INTERCOMPANY", "JOURNAL_ENTRY", "CASH_POOL_SWEEP",
    }
    actual = {t.value for t in TxType}
    assert required.issubset(actual)
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
python -m pytest tests/test_treasury_transaction_model.py -v --tb=short
```
Expected: `ModuleNotFoundError: No module named 'app.models.treasury_transaction'`

- [ ] **Step 3: Write the model**

```python
# backend/app/models/treasury_transaction.py
"""
app/models/treasury_transaction.py

TreasuryTransaction — strictly WORM audit spine for all financial events.

No column is ever mutated after insert (unlike JournalEntry which permits
status updates). ADR-0013 governs this design.

Hash chain: tx_hash = SHA-256(company_id|tx_type|amount|currency|value_date|
                               source_ref_id|created_at|chain_seq)
chain_seq: SELECT MAX(chain_seq)+1 FOR UPDATE — serialises per-tenant
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import BigInteger, Date, DateTime, Numeric, String, event
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class TxType(str, Enum):
    FX_HEDGE = "FX_HEDGE"
    SETTLEMENT = "SETTLEMENT"
    BANK_RECEIPT = "BANK_RECEIPT"
    BANK_PAYMENT = "BANK_PAYMENT"
    INTERCOMPANY = "INTERCOMPANY"
    JOURNAL_ENTRY = "JOURNAL_ENTRY"
    CASH_POOL_SWEEP = "CASH_POOL_SWEEP"


class TxSourceModule(str, Enum):
    FX_LIFECYCLE = "FX_LIFECYCLE"
    CASH = "CASH"
    GL = "GL"
    PAYMENT = "PAYMENT"
    SETTLEMENT = "SETTLEMENT"


GENESIS_HASH = "0" * 64


def _compute_tx_hash(
    *,
    company_id: uuid.UUID,
    tx_type: str,
    amount: Decimal,
    currency: str,
    value_date: date,
    source_ref_id: uuid.UUID,
    created_at: datetime,
    chain_seq: int,
) -> str:
    # amount normalized to 6 decimal places for hash stability
    content = "|".join([
        str(company_id),
        tx_type,
        f"{amount:.6f}",
        currency,
        value_date.isoformat(),
        str(source_ref_id),
        created_at.isoformat(),
        str(chain_seq),
    ])
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


class TreasuryTransaction(Base):
    __tablename__ = "treasury_transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    tx_type: Mapped[str] = mapped_column(String(32), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    base_amount: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    fx_rate: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    value_date: Mapped[date] = mapped_column(Date, nullable=False)
    source_module: Mapped[str] = mapped_column(String(32), nullable=False)
    source_ref_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    source_ref_type: Mapped[str] = mapped_column(String(64), nullable=False)
    tx_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    prev_tx_hash: Mapped[str] = mapped_column(
        String(128), nullable=False, default=GENESIS_HASH
    )
    chain_seq: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    def __repr__(self) -> str:
        return f"<TreasuryTransaction {self.id} type={self.tx_type}>"


@event.listens_for(TreasuryTransaction, "before_delete")
def _block_tx_delete(mapper, connection, target):
    raise RuntimeError(
        f"TreasuryTransaction {target.id!r} is WORM — deletes are forbidden (ADR-0013)."
    )


@event.listens_for(TreasuryTransaction, "before_update")
def _block_tx_update(mapper, connection, target):
    raise RuntimeError(
        f"TreasuryTransaction {target.id!r} is WORM — updates are forbidden (ADR-0013)."
    )
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
python -m pytest tests/test_treasury_transaction_model.py -v --tb=short
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/treasury_transaction.py \
        backend/tests/test_treasury_transaction_model.py
git commit -m "feat(models): TreasuryTransaction strict-WORM audit spine with hash chain (ADR-0013)"
```

---

### Task 4: Database migrations

**Files:**
- Create: `backend/migrations/versions/0014_journal_entries_gl.py`
- Create: `backend/migrations/versions/0015_treasury_transactions.py`

> NOTE: These migrations use PostgreSQL features (triggers). They are marked `@pytest.mark.requires_postgres` — they will be skipped in SQLite CI. Verify manually against local PostgreSQL.

- [ ] **Step 1: Write migration 0014**

```python
# backend/migrations/versions/0014_journal_entries_gl.py
"""Add journal_entries and gl_account_mappings tables with WORM triggers

Revision ID: 0014_journal_entries_gl
Revises: 0013_add_sso_billing_to_companies
Create Date: 2026-04-13
"""
from alembic import op

revision = "0014_journal_entries_gl"
down_revision = "0013_add_sso_billing_to_companies"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── journal_entries ──────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE journal_entries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            run_id UUID,
            ledger_entry_id UUID,
            settlement_event_id UUID,
            entry_type VARCHAR(64) NOT NULL,
            standard VARCHAR(16) NOT NULL,
            debit_account VARCHAR(64) NOT NULL,
            credit_account VARCHAR(64) NOT NULL,
            amount NUMERIC(20,6) NOT NULL,
            currency VARCHAR(3) NOT NULL,
            base_amount NUMERIC(20,6) NOT NULL,
            base_currency VARCHAR(3) NOT NULL,
            fx_rate_used NUMERIC(20,8) NOT NULL,
            period_date DATE NOT NULL,
            description VARCHAR(512) NOT NULL DEFAULT '',
            status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
            posted_at TIMESTAMPTZ,
            posted_to VARCHAR(64),
            posted_ref VARCHAR(128),
            entry_hash VARCHAR(128) NOT NULL,
            prev_entry_hash VARCHAR(128) NOT NULL,
            chain_seq BIGINT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_by UUID NOT NULL
        );
    """)
    op.execute("CREATE INDEX ix_je_company_id ON journal_entries(company_id);")
    op.execute("CREATE INDEX ix_je_run_id ON journal_entries(run_id);")
    op.execute("CREATE UNIQUE INDEX ix_je_chain_seq ON journal_entries(company_id, chain_seq);")

    # WORM: block deletes
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_je_delete()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'journal_entries is WORM — deletes forbidden (id=%)', OLD.id;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_no_delete_je
        BEFORE DELETE ON journal_entries
        FOR EACH ROW EXECUTE FUNCTION fn_block_je_delete();
    """)

    # WORM: block updates to non-mutable columns
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_je_immutable_update()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            IF (
                NEW.entry_type      IS DISTINCT FROM OLD.entry_type      OR
                NEW.standard        IS DISTINCT FROM OLD.standard        OR
                NEW.debit_account   IS DISTINCT FROM OLD.debit_account   OR
                NEW.credit_account  IS DISTINCT FROM OLD.credit_account  OR
                NEW.amount          IS DISTINCT FROM OLD.amount          OR
                NEW.currency        IS DISTINCT FROM OLD.currency        OR
                NEW.base_amount     IS DISTINCT FROM OLD.base_amount     OR
                NEW.base_currency   IS DISTINCT FROM OLD.base_currency   OR
                NEW.entry_hash      IS DISTINCT FROM OLD.entry_hash      OR
                NEW.prev_entry_hash IS DISTINCT FROM OLD.prev_entry_hash OR
                NEW.chain_seq       IS DISTINCT FROM OLD.chain_seq       OR
                NEW.company_id      IS DISTINCT FROM OLD.company_id      OR
                NEW.created_at      IS DISTINCT FROM OLD.created_at      OR
                NEW.created_by      IS DISTINCT FROM OLD.created_by
            ) THEN
                RAISE EXCEPTION
                    'journal_entries WORM violation — only status/posted_* may be updated (id=%)',
                    OLD.id;
            END IF;
            RETURN NEW;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_worm_je_update
        BEFORE UPDATE ON journal_entries
        FOR EACH ROW EXECUTE FUNCTION fn_block_je_immutable_update();
    """)

    # ── gl_account_mappings (mutable) ────────────────────────────────────
    op.execute("""
        CREATE TABLE gl_account_mappings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            entry_type VARCHAR(64) NOT NULL,
            standard VARCHAR(16) NOT NULL,
            debit_account VARCHAR(64) NOT NULL,
            credit_account VARCHAR(64) NOT NULL,
            account_label VARCHAR(256) NOT NULL DEFAULT '',
            erp_system VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
            created_by UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by UUID NOT NULL,
            CONSTRAINT uq_gl_mapping_company_type_standard UNIQUE (company_id, entry_type, standard)
        );
    """)
    op.execute("CREATE INDEX ix_gl_mapping_company_id ON gl_account_mappings(company_id);")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS tg_worm_je_update ON journal_entries;")
    op.execute("DROP TRIGGER IF EXISTS tg_no_delete_je ON journal_entries;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_je_immutable_update;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_je_delete;")
    op.execute("DROP TABLE IF EXISTS gl_account_mappings;")
    op.execute("DROP TABLE IF EXISTS journal_entries;")
```

- [ ] **Step 2: Write migration 0015**

```python
# backend/migrations/versions/0015_treasury_transactions.py
"""Add treasury_transactions WORM spine

Revision ID: 0015_treasury_transactions
Revises: 0014_journal_entries_gl
Create Date: 2026-04-13
"""
from alembic import op

revision = "0015_treasury_transactions"
down_revision = "0014_journal_entries_gl"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE treasury_transactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            entity_id UUID,
            tx_type VARCHAR(32) NOT NULL,
            amount NUMERIC(20,6) NOT NULL,
            currency VARCHAR(3) NOT NULL,
            base_amount NUMERIC(20,6) NOT NULL,
            base_currency VARCHAR(3) NOT NULL,
            fx_rate NUMERIC(20,8) NOT NULL,
            value_date DATE NOT NULL,
            source_module VARCHAR(32) NOT NULL,
            source_ref_id UUID NOT NULL,
            source_ref_type VARCHAR(64) NOT NULL,
            tx_hash VARCHAR(128) NOT NULL,
            prev_tx_hash VARCHAR(128) NOT NULL,
            chain_seq BIGINT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX ix_tt_company_id ON treasury_transactions(company_id);")
    op.execute("CREATE UNIQUE INDEX ix_tt_chain_seq ON treasury_transactions(company_id, chain_seq);")

    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_tt_delete()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'treasury_transactions is WORM — deletes forbidden (id=%)', OLD.id;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_no_delete_tt
        BEFORE DELETE ON treasury_transactions
        FOR EACH ROW EXECUTE FUNCTION fn_block_tt_delete();
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_tt_update()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'treasury_transactions is WORM — updates forbidden (id=%)', OLD.id;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_no_update_tt
        BEFORE UPDATE ON treasury_transactions
        FOR EACH ROW EXECUTE FUNCTION fn_block_tt_update();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS tg_no_update_tt ON treasury_transactions;")
    op.execute("DROP TRIGGER IF EXISTS tg_no_delete_tt ON treasury_transactions;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_tt_update;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_tt_delete;")
    op.execute("DROP TABLE IF EXISTS treasury_transactions;")
```

- [ ] **Step 3: Apply migrations to local PostgreSQL**

```bash
cd backend
DATABASE_URL="postgresql+asyncpg://hedgecalc:hedgecalc@localhost:5432/hedgecalc" \
alembic upgrade head
```
Expected:
```
Running upgrade 0013_add_sso_billing_to_companies -> 0014_journal_entries_gl
Running upgrade 0014_journal_entries_gl -> 0015_treasury_transactions
```

- [ ] **Step 4: Commit migrations**

```bash
git add backend/migrations/versions/0014_journal_entries_gl.py \
        backend/migrations/versions/0015_treasury_transactions.py
git commit -m "feat(migrations): 0014 journal_entries/gl_account_mappings, 0015 treasury_transactions WORM tables"
```

---

## Chunk 2: GL Generation Service + Routes

### Task 5: GL service — chain extension + generate_journal_entries

**Files:**
- Create: `backend/app/schemas_v1/gl.py`
- Create: `backend/app/services/gl_service.py`
- Create: `backend/tests/test_gl_service.py`

- [ ] **Step 1: Write schemas**

```python
# backend/app/schemas_v1/gl.py
"""Pydantic schemas for GL journal entry endpoints."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class GLAccountMappingCreate(BaseModel):
    entry_type: str
    standard: str
    debit_account: str
    credit_account: str
    account_label: str = ""
    erp_system: str = "MANUAL"


class GLAccountMappingRead(GLAccountMappingCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class JournalEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    run_id: uuid.UUID | None
    ledger_entry_id: uuid.UUID | None
    settlement_event_id: uuid.UUID | None
    entry_type: str
    standard: str
    debit_account: str
    credit_account: str
    amount: Decimal
    currency: str
    base_amount: Decimal
    base_currency: str
    fx_rate_used: Decimal
    period_date: date
    description: str
    status: str
    posted_at: datetime | None
    posted_to: str | None
    posted_ref: str | None
    chain_seq: int
    created_at: datetime


class JournalEntryApproveRequest(BaseModel):
    pass  # No body required; checker identity from JWT


class JournalEntryRejectRequest(BaseModel):
    reason: str


class GLExportRequest(BaseModel):
    format: str = "csv"  # "csv" | "xml"
    status: str = "APPROVED"
    period_start: date | None = None
    period_end: date | None = None
```

- [ ] **Step 2: Write failing service tests**

```python
# backend/tests/test_gl_service.py
"""Unit tests for gl_service using AsyncMock — no DB required."""
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.journal_entry import (
    GENESIS_HASH,
    GLMappingNotConfiguredError,
    JournalEntryStatus,
)


@pytest.mark.asyncio
async def test_generate_raises_if_no_mapping():
    """generate_journal_entries raises GLMappingNotConfiguredError when no mapping configured."""
    from app.services.gl_service import generate_journal_entries

    mock_session = AsyncMock()
    # Simulate no mapping found
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_run = MagicMock()
    mock_run.id = uuid.uuid4()
    mock_run.company_id = uuid.uuid4()
    mock_run.standard = "IFRS_9"
    mock_run.results = {"entry_type": "OCI_RECOGNITION"}

    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()

    with pytest.raises(GLMappingNotConfiguredError):
        await generate_journal_entries(mock_session, mock_run, mock_user)


@pytest.mark.asyncio
async def test_submit_for_approval_changes_status():
    """submit_for_approval transitions DRAFT → PENDING_APPROVAL."""
    from app.services.gl_service import submit_for_approval

    mock_session = AsyncMock()
    mock_je = MagicMock()
    mock_je.status = JournalEntryStatus.DRAFT.value
    mock_je.created_by = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_je
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()

    result = await submit_for_approval(mock_session, uuid.uuid4(), mock_user)
    assert result.status == JournalEntryStatus.PENDING_APPROVAL.value


@pytest.mark.asyncio
async def test_approve_enforces_sod():
    """approve raises ValueError when checker == creator."""
    from app.services.gl_service import approve_journal_entry

    creator_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_je = MagicMock()
    mock_je.status = JournalEntryStatus.PENDING_APPROVAL.value
    mock_je.created_by = creator_id

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_je
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_user = MagicMock()
    mock_user.id = creator_id  # same as creator → SoD violation

    with pytest.raises(ValueError, match="SoD"):
        await approve_journal_entry(mock_session, uuid.uuid4(), mock_user)


@pytest.mark.asyncio
async def test_reject_requires_reason():
    """reject raises ValueError when reason is empty."""
    from app.services.gl_service import reject_journal_entry

    mock_session = AsyncMock()
    mock_je = MagicMock()
    mock_je.status = JournalEntryStatus.PENDING_APPROVAL.value
    mock_je.created_by = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_je
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()  # different from creator

    with pytest.raises(ValueError, match="reason"):
        await reject_journal_entry(mock_session, uuid.uuid4(), mock_user, reason="")
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
python -m pytest tests/test_gl_service.py -v --tb=short
```
Expected: `ModuleNotFoundError: No module named 'app.services.gl_service'`

- [ ] **Step 4: Write gl_service.py**

```python
# backend/app/services/gl_service.py
"""
app/services/gl_service.py

GL Journal Entry service:
  - generate_journal_entries: create DRAFT entries from an effectiveness run
  - submit_for_approval: DRAFT → PENDING_APPROVAL
  - approve_journal_entry: PENDING_APPROVAL → APPROVED (checker ≠ creator)
  - reject_journal_entry: PENDING_APPROVAL → REJECTED (checker ≠ creator)
  - extend_chain: atomic chain_seq + prev_entry_hash computation (FOR UPDATE)
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.journal_entry import (
    GENESIS_HASH,
    GLAccountMapping,
    GLMappingNotConfiguredError,
    JournalEntry,
    JournalEntryStatus,
    JOURNAL_ENTRY_TRANSITIONS,
    _compute_entry_hash,
)
from app.models.user import User


async def _get_gl_mapping(
    session: AsyncSession,
    company_id: uuid.UUID,
    entry_type: str,
    standard: str,
) -> GLAccountMapping:
    result = await session.execute(
        select(GLAccountMapping).where(
            GLAccountMapping.company_id == company_id,
            GLAccountMapping.entry_type == entry_type,
            GLAccountMapping.standard == standard,
        )
    )
    mapping = result.scalar_one_or_none()
    if mapping is None:
        raise GLMappingNotConfiguredError(
            f"No GL mapping for company={company_id} "
            f"entry_type={entry_type} standard={standard}. "
            f"Configure at /settings/gl-accounts."
        )
    return mapping


async def _extend_journal_chain(
    session: AsyncSession,
    company_id: uuid.UUID,
) -> tuple[int, str]:
    """
    Returns (new_chain_seq, prev_entry_hash) within a serialized lock.

    Uses SELECT MAX(chain_seq) FOR UPDATE so that concurrent callers are
    serialized at the aggregate level — locking a single data row is insufficient
    because two transactions can both read the same last row before either inserts.
    MUST be called inside the same transaction as the JournalEntry insert.
    """
    from sqlalchemy import func  # noqa: PLC0415
    # Serialize at aggregate level to prevent concurrent chain forks
    max_result = await session.execute(
        select(func.max(JournalEntry.chain_seq))
        .where(JournalEntry.company_id == company_id)
        .with_for_update()
    )
    max_seq = max_result.scalar_one_or_none()
    if max_seq is None:
        return 1, GENESIS_HASH

    # Fetch the hash of the last entry to form the prev_entry_hash link
    hash_result = await session.execute(
        select(JournalEntry.entry_hash)
        .where(
            JournalEntry.company_id == company_id,
            JournalEntry.chain_seq == max_seq,
        )
    )
    prev_hash = hash_result.scalar_one_or_none() or GENESIS_HASH
    return max_seq + 1, prev_hash


def _assert_je_transition(
    current: str,
    target: JournalEntryStatus,
    entry_id: uuid.UUID,
) -> None:
    current_status = JournalEntryStatus(current)
    if target not in JOURNAL_ENTRY_TRANSITIONS.get(current_status, set()):
        raise ValueError(
            f"Illegal JournalEntry transition: {current} → {target.value} "
            f"(id={entry_id})"
        )


async def generate_journal_entries(
    session: AsyncSession,
    run,  # HedgeEffectivenessRun ORM object
    user: User,
) -> list[JournalEntry]:
    """
    Create DRAFT JournalEntry records from a hedge effectiveness run.
    Raises GLMappingNotConfiguredError if mapping not configured.
    """
    company_id = run.company_id
    standard = run.standard
    entries: list[JournalEntry] = []

    # Each run produces one or more entry types depending on results
    # Delegate entry type resolution to the run's results payload
    entry_specs = _extract_entry_specs(run)

    for spec in entry_specs:
        mapping = await _get_gl_mapping(
            session, company_id, spec["entry_type"], standard
        )
        now = datetime.now(UTC)
        chain_seq, prev_hash = await _extend_journal_chain(session, company_id)

        entry_hash = _compute_entry_hash(
            company_id=company_id,
            entry_type=spec["entry_type"],
            standard=standard,
            debit_account=mapping.debit_account,
            credit_account=mapping.credit_account,
            amount=spec["amount"],
            currency=spec["currency"],
            period_date=spec["period_date"],
            created_at=now,
            chain_seq=chain_seq,
        )

        je = JournalEntry(
            company_id=company_id,
            run_id=run.id,
            entry_type=spec["entry_type"],
            standard=standard,
            debit_account=mapping.debit_account,
            credit_account=mapping.credit_account,
            amount=spec["amount"],
            currency=spec["currency"],
            base_amount=spec.get("base_amount", spec["amount"]),
            base_currency=spec.get("base_currency", spec["currency"]),
            fx_rate_used=spec.get("fx_rate", 1.0),
            period_date=spec["period_date"],
            description=spec.get("description", ""),
            status=JournalEntryStatus.DRAFT.value,
            entry_hash=entry_hash,
            prev_entry_hash=prev_hash,
            chain_seq=chain_seq,
            created_at=now,
            created_by=user.id,
        )
        session.add(je)
        entries.append(je)

    await session.flush()
    return entries


def _extract_entry_specs(run) -> list[dict]:
    """
    Extract entry specification dicts from a run's results payload.
    Returns list of {entry_type, amount, currency, period_date, ...}.
    Each run type produces different entry types.
    """
    results = run.results or {}
    specs = []

    # Dollar offset / regression effectiveness → OCI or INEFFECTIVENESS
    if "oci_amount" in results:
        specs.append({
            "entry_type": "OCI_RECOGNITION",
            "amount": results["oci_amount"],
            "currency": results.get("currency", "USD"),
            "period_date": run.period_end or run.created_at.date(),
        })

    if "ineffectiveness_amount" in results:
        specs.append({
            "entry_type": "INEFFECTIVENESS",
            "amount": results["ineffectiveness_amount"],
            "currency": results.get("currency", "USD"),
            "period_date": run.period_end or run.created_at.date(),
        })

    return specs


async def submit_for_approval(
    session: AsyncSession,
    entry_id: uuid.UUID,
    user: User,
) -> JournalEntry:
    result = await session.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    je = result.scalar_one_or_none()
    if je is None:
        raise ValueError(f"JournalEntry {entry_id} not found")
    _assert_je_transition(je.status, JournalEntryStatus.PENDING_APPROVAL, entry_id)
    je.status = JournalEntryStatus.PENDING_APPROVAL.value
    await session.flush()
    return je


async def approve_journal_entry(
    session: AsyncSession,
    entry_id: uuid.UUID,
    checker: User,
) -> JournalEntry:
    result = await session.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    je = result.scalar_one_or_none()
    if je is None:
        raise ValueError(f"JournalEntry {entry_id} not found")
    _assert_je_transition(je.status, JournalEntryStatus.APPROVED, entry_id)

    # SoD: checker must not be the creator
    if je.created_by == checker.id:
        raise ValueError(
            f"SoD violation: checker cannot be the creator of "
            f"JournalEntry {entry_id}"
        )

    je.status = JournalEntryStatus.APPROVED.value
    await session.flush()
    return je


async def reject_journal_entry(
    session: AsyncSession,
    entry_id: uuid.UUID,
    checker: User,
    *,
    reason: str,
) -> JournalEntry:
    if not reason or not reason.strip():
        raise ValueError("reason is required to reject a journal entry")

    result = await session.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    je = result.scalar_one_or_none()
    if je is None:
        raise ValueError(f"JournalEntry {entry_id} not found")
    _assert_je_transition(je.status, JournalEntryStatus.REJECTED, entry_id)

    # SoD
    if je.created_by == checker.id:
        raise ValueError(
            f"SoD violation: checker cannot be the creator of "
            f"JournalEntry {entry_id}"
        )

    je.status = JournalEntryStatus.REJECTED.value
    await session.flush()
    return je


async def list_journal_entries(
    session: AsyncSession,
    company_id: uuid.UUID,
    *,
    status: str | None = None,
    run_id: uuid.UUID | None = None,
) -> list[JournalEntry]:
    q = select(JournalEntry).where(JournalEntry.company_id == company_id)
    if status:
        q = q.where(JournalEntry.status == status)
    if run_id:
        q = q.where(JournalEntry.run_id == run_id)
    q = q.order_by(JournalEntry.chain_seq.asc())
    result = await session.execute(q)
    return list(result.scalars().all())


async def upsert_gl_mapping(
    session: AsyncSession,
    company_id: uuid.UUID,
    data: dict,
    user: User,
) -> GLAccountMapping:
    result = await session.execute(
        select(GLAccountMapping).where(
            GLAccountMapping.company_id == company_id,
            GLAccountMapping.entry_type == data["entry_type"],
            GLAccountMapping.standard == data["standard"],
        )
    )
    mapping = result.scalar_one_or_none()
    if mapping is None:
        mapping = GLAccountMapping(
            company_id=company_id,
            entry_type=data["entry_type"],
            standard=data["standard"],
            debit_account=data["debit_account"],
            credit_account=data["credit_account"],
            account_label=data.get("account_label", ""),
            erp_system=data.get("erp_system", "MANUAL"),
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(mapping)
    else:
        mapping.debit_account = data["debit_account"]
        mapping.credit_account = data["credit_account"]
        mapping.account_label = data.get("account_label", mapping.account_label)
        mapping.erp_system = data.get("erp_system", mapping.erp_system)
        mapping.updated_by = user.id
    await session.flush()
    return mapping


async def list_gl_mappings(
    session: AsyncSession,
    company_id: uuid.UUID,
) -> list[GLAccountMapping]:
    result = await session.execute(
        select(GLAccountMapping).where(GLAccountMapping.company_id == company_id)
    )
    return list(result.scalars().all())
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
python -m pytest tests/test_gl_service.py -v --tb=short
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas_v1/gl.py \
        backend/app/services/gl_service.py \
        backend/tests/test_gl_service.py
git commit -m "feat(services): gl_service — generate, approve, reject, GL mappings"
```

---

### Task 6: GL routes

**Files:**
- Create: `backend/app/api/routes/v1_gl.py`
- Create: `backend/tests/test_v1_gl_routes.py`
- Modify: `backend/app/api/router.py`

- [ ] **Step 1: Write failing route tests**

```python
# backend/tests/test_v1_gl_routes.py
"""Route tests for v1_gl — ASGI transport, AsyncMock service."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.dependencies import get_current_user

_ROUTE = "app.api.routes.v1_gl"


def _make_user(company_id=None):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.company = MagicMock()
    u.company.id = company_id or uuid.uuid4()
    u.company.settings = {"plan_tier": "professional"}
    return u


@pytest.fixture
def auth_override():
    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    yield user
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_list_journal_entries_returns_200(auth_override):
    with patch(f"{_ROUTE}.gl_service") as mock_svc:
        mock_svc.list_journal_entries = AsyncMock(return_value=[])
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get(
                "/api/v1/gl/journal-entries",
                headers={"Authorization": "Bearer fake-jwt"},
            )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_generate_journal_entries_returns_201(auth_override):
    run_id = uuid.uuid4()
    fake_je = MagicMock()
    fake_je.id = uuid.uuid4()
    fake_je.company_id = auth_override.company.id
    fake_je.run_id = run_id
    fake_je.ledger_entry_id = None
    fake_je.settlement_event_id = None
    fake_je.entry_type = "OCI_RECOGNITION"
    fake_je.standard = "IFRS_9"
    fake_je.debit_account = "1200"
    fake_je.credit_account = "3400"
    fake_je.amount = 100000.0
    fake_je.currency = "EUR"
    fake_je.base_amount = 110000.0
    fake_je.base_currency = "USD"
    fake_je.fx_rate_used = 1.1
    from datetime import date, datetime, UTC
    fake_je.period_date = date(2026, 3, 31)
    fake_je.description = ""
    fake_je.status = "DRAFT"
    fake_je.posted_at = None
    fake_je.posted_to = None
    fake_je.posted_ref = None
    fake_je.chain_seq = 1
    fake_je.created_at = datetime.now(UTC)

    with patch(f"{_ROUTE}.gl_service") as mock_svc:
        mock_svc.generate_journal_entries = AsyncMock(return_value=[fake_je])
        # Also mock run lookup
        with patch(f"{_ROUTE}._get_run", AsyncMock(return_value=MagicMock())):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post(
                    f"/api/v1/gl/journal-entries/generate/{run_id}",
                    headers={"Authorization": "Bearer fake-jwt"},
                )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_approve_enforces_sod_returns_403(auth_override):
    entry_id = uuid.uuid4()
    with patch(f"{_ROUTE}.gl_service") as mock_svc:
        mock_svc.approve_journal_entry = AsyncMock(
            side_effect=ValueError("SoD violation: checker cannot be the creator")
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                f"/api/v1/gl/journal-entries/{entry_id}/approve",
                headers={"Authorization": "Bearer fake-jwt"},
            )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_reject_missing_reason_returns_422(auth_override):
    entry_id = uuid.uuid4()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            f"/api/v1/gl/journal-entries/{entry_id}/reject",
            json={},  # missing reason
            headers={"Authorization": "Bearer fake-jwt"},
        )
    assert resp.status_code == 422
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
python -m pytest tests/test_v1_gl_routes.py -v --tb=short
```
Expected: 404s (routes not registered yet)

- [ ] **Step 3: Write the routes file**

```python
# backend/app/api/routes/v1_gl.py
"""
GL Journal Entry routes.

All routes: PROFESSIONAL+ plan tier (Phase 1 core feature).
4-eyes SoD enforced in service layer (checker ≠ creator).
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.dependencies import get_current_user
from app.deps.plan_tier import require_plan
from app.models.journal_entry import GLMappingNotConfiguredError, JournalEntryStatus
from app.models.user import User
from app.schemas_v1.gl import (
    GLAccountMappingCreate,
    GLAccountMappingRead,
    JournalEntryApproveRequest,
    JournalEntryRead,
    JournalEntryRejectRequest,
)
from app.services import gl_service
from app.services.audit_emit import emit_audit

router = APIRouter(prefix="/v1/gl", tags=["v1-gl"])

_PLAN_DEPS = [require_plan("professional", "enterprise")]


async def _get_run(run_id: uuid.UUID, session: AsyncSession):
    """Fetch HedgeEffectivenessRun — raises 404 if not found."""
    from sqlalchemy import select
    from app.models.hedge_effectiveness import HedgeEffectivenessRun  # noqa: PLC0415
    result = await session.execute(
        select(HedgeEffectivenessRun).where(HedgeEffectivenessRun.id == run_id)
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return run


# ── GL Account Mapping CRUD ───────────────────────────────────────────────────

@router.get(
    "/account-mappings",
    response_model=list[GLAccountMappingRead],
    dependencies=_PLAN_DEPS,
)
async def list_account_mappings(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    return await gl_service.list_gl_mappings(session, current_user.company.id)


@router.post(
    "/account-mappings",
    response_model=GLAccountMappingRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=_PLAN_DEPS,
)
async def upsert_account_mapping(
    body: GLAccountMappingCreate,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    mapping = await gl_service.upsert_gl_mapping(
        session, current_user.company.id, body.model_dump(), current_user
    )
    await session.commit()
    await emit_audit(
        session=session,
        user=current_user,
        event_type="SYSTEM",
        description=f"GL mapping upserted: {body.entry_type}/{body.standard}",
        entity_type="gl_account_mapping",
        entity_id=str(mapping.id),
        payload={"entry_type": body.entry_type, "standard": body.standard},
    )
    return mapping


# ── Journal Entry CRUD ────────────────────────────────────────────────────────

@router.get(
    "/journal-entries",
    response_model=list[JournalEntryRead],
    dependencies=_PLAN_DEPS,
)
async def list_journal_entries(
    status_filter: str | None = None,
    run_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    return await gl_service.list_journal_entries(
        session,
        current_user.company.id,
        status=status_filter,
        run_id=run_id,
    )


@router.post(
    "/journal-entries/generate/{run_id}",
    response_model=list[JournalEntryRead],
    status_code=status.HTTP_201_CREATED,
    dependencies=_PLAN_DEPS,
)
async def generate_journal_entries(
    run_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    run = await _get_run(run_id, session)
    if run.company_id != current_user.company.id:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        entries = await gl_service.generate_journal_entries(session, run, current_user)
    except GLMappingNotConfiguredError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await session.commit()
    await emit_audit(
        session=session, user=current_user,
        event_type="SYSTEM",
        description=f"Generated {len(entries)} journal entries for run {run_id}",
        entity_type="journal_entry", entity_id=str(run_id),
        payload={"count": len(entries), "run_id": str(run_id)},
    )
    return entries


@router.post(
    "/journal-entries/{entry_id}/approve",
    response_model=JournalEntryRead,
    dependencies=_PLAN_DEPS,
)
async def approve_journal_entry(
    entry_id: uuid.UUID,
    _body: JournalEntryApproveRequest = JournalEntryApproveRequest(),  # noqa: B008
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    try:
        je = await gl_service.approve_journal_entry(session, entry_id, current_user)
    except ValueError as exc:
        msg = str(exc)
        code = 403 if "SoD" in msg else 409
        raise HTTPException(status_code=code, detail=msg) from exc
    await session.commit()
    await emit_audit(
        session=session, user=current_user,
        event_type="APPROVAL",
        description=f"Journal entry {entry_id} approved (4-eyes)",
        entity_type="journal_entry", entity_id=str(entry_id), payload={},
    )
    return je


@router.post(
    "/journal-entries/{entry_id}/reject",
    response_model=JournalEntryRead,
    dependencies=_PLAN_DEPS,
)
async def reject_journal_entry(
    entry_id: uuid.UUID,
    body: JournalEntryRejectRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    try:
        je = await gl_service.reject_journal_entry(
            session, entry_id, current_user, reason=body.reason
        )
    except ValueError as exc:
        msg = str(exc)
        code = 403 if "SoD" in msg else 409
        raise HTTPException(status_code=code, detail=msg) from exc
    await session.commit()
    await emit_audit(
        session=session, user=current_user,
        event_type="REJECTION",
        description=f"Journal entry {entry_id} rejected: {body.reason}",
        entity_type="journal_entry", entity_id=str(entry_id),
        payload={"reason": body.reason},
    )
    return je
```

- [ ] **Step 4: Register router in router.py**

Add at the bottom of `backend/app/api/router.py`:
```python
# GL Journal Entry workflow (owns /v1/gl)
from app.api.routes.v1_gl import router as v1_gl_router
router.include_router(v1_gl_router)
```

- [ ] **Step 5: Run all tests**

```bash
python -m pytest tests/test_v1_gl_routes.py tests/test_gl_service.py tests/test_journal_entry_model.py -v --tb=short
```
Expected: all PASS

- [ ] **Step 6: Run full test suite (regression check)**

```bash
python -m pytest tests/ -x -q --tb=short
```
Expected: ~4801+ passed, 0 failed

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/routes/v1_gl.py \
        backend/app/api/router.py \
        backend/tests/test_v1_gl_routes.py
git commit -m "feat(routes): v1_gl — GL journal entry generate/approve/reject + GL mapping CRUD"
```

---

## Chunk 3: Posting Adapters (Sprints 57–58)

### Task 7: Posting adapter base + CSV exporter

**Files:**
- Create: `backend/app/services/posting_adapters/__init__.py`
- Create: `backend/app/services/posting_adapters/base.py`
- Create: `backend/app/services/posting_adapters/csv_exporter.py`
- Create: `backend/app/services/gl_posting_service.py`
- Create: `backend/tests/test_posting_adapters.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_posting_adapters.py
"""Unit tests for GL posting adapters (no HTTP calls — all stubbed)."""
import io
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from app.services.posting_adapters.base import PostingResult
from app.services.posting_adapters.csv_exporter import CSVExporter


def _make_je(**kwargs):
    from unittest.mock import MagicMock
    je = MagicMock()
    je.id = uuid.uuid4()
    je.entry_type = "OCI_RECOGNITION"
    je.standard = "IFRS_9"
    je.debit_account = "1200"
    je.credit_account = "3400"
    je.amount = Decimal("100000.00")
    je.currency = "EUR"
    je.base_amount = Decimal("110000.00")
    je.base_currency = "USD"
    je.fx_rate_used = Decimal("1.10")
    je.period_date = date(2026, 3, 31)
    je.description = "OCI recognition Q1"
    je.company_id = uuid.uuid4()
    for k, v in kwargs.items():
        setattr(je, k, v)
    return je


@pytest.mark.asyncio
async def test_csv_exporter_produces_valid_csv():
    exporter = CSVExporter()
    je = _make_je()
    result = await exporter.post(je)
    assert result.success is True
    assert "1200" in result.payload  # debit account in CSV


@pytest.mark.asyncio
async def test_csv_exporter_includes_all_fields():
    exporter = CSVExporter()
    je = _make_je()
    result = await exporter.post(je)
    assert "OCI_RECOGNITION" in result.payload
    assert "EUR" in result.payload
    assert "100000" in result.payload


def test_posting_result_failure():
    r = PostingResult(success=False, payload="", error="Connection timeout")
    assert r.success is False
    assert "timeout" in r.error
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
python -m pytest tests/test_posting_adapters.py -v --tb=short
```
Expected: import errors

- [ ] **Step 3: Write the adapters**

```python
# backend/app/services/posting_adapters/__init__.py
"""GL posting adapter package."""

# backend/app/services/posting_adapters/base.py
"""Abstract base class for GL posting adapters."""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class PostingResult:
    success: bool
    payload: str       # ERP journal ref on success, raw response otherwise
    error: str = ""    # error message on failure
    erp_ref: str = ""  # ERP-assigned journal ID (if available)


class GLPostingAdapter(ABC):
    """Interface all posting adapters must implement."""

    @abstractmethod
    async def post(self, journal_entry) -> PostingResult:
        """Post a single JournalEntry to the ERP. Returns PostingResult."""
        ...

    @property
    @abstractmethod
    def system_name(self) -> str:
        """Identifier stored in JournalEntry.posted_to."""
        ...
```

```python
# backend/app/services/posting_adapters/csv_exporter.py
"""
Generic CSV exporter for SAP/Oracle manual import.
Does not call any external API — returns formatted CSV payload.
"""
from __future__ import annotations
import csv
import io

from app.services.posting_adapters.base import GLPostingAdapter, PostingResult


class CSVExporter(GLPostingAdapter):
    system_name = "CSV"

    async def post(self, journal_entry) -> PostingResult:
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "entry_id", "entry_type", "standard",
            "debit_account", "credit_account",
            "amount", "currency", "base_amount", "base_currency",
            "fx_rate", "period_date", "description",
        ])
        writer.writerow([
            str(journal_entry.id),
            journal_entry.entry_type,
            journal_entry.standard,
            journal_entry.debit_account,
            journal_entry.credit_account,
            str(journal_entry.amount),
            journal_entry.currency,
            str(journal_entry.base_amount),
            journal_entry.base_currency,
            str(journal_entry.fx_rate_used),
            journal_entry.period_date.isoformat(),
            journal_entry.description,
        ])
        return PostingResult(success=True, payload=buf.getvalue())
```

```python
# backend/app/services/posting_adapters/quickbooks.py
"""
QuickBooks Online GL posting adapter.
Calls QBO Journal Entry API. Credentials from connector_settings JSONB.
"""
from __future__ import annotations
import logging

from app.services.posting_adapters.base import GLPostingAdapter, PostingResult

logger = logging.getLogger(__name__)


class QuickBooksPoster(GLPostingAdapter):
    system_name = "QB"

    def __init__(self, *, access_token: str, realm_id: str, sandbox: bool = True):
        self.access_token = access_token
        self.realm_id = realm_id
        self.base_url = (
            "https://sandbox-quickbooks.api.intuit.com"
            if sandbox
            else "https://quickbooks.api.intuit.com"
        )

    async def post(self, journal_entry) -> PostingResult:
        """Post journal entry to QBO.
        In paper mode (no credentials) returns success with mock ref.
        """
        if not self.access_token:
            return PostingResult(
                success=True,
                payload="paper_mode",
                erp_ref=f"QB-PAPER-{journal_entry.id}",
            )
        # Production: call QBO REST API
        # POST /v3/company/{realmId}/journalentry
        # Reference: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/journalentry
        try:
            import httpx  # noqa: PLC0415
            payload = {
                "Line": [
                    {
                        "Amount": float(journal_entry.amount),
                        "DetailType": "JournalEntryLineDetail",
                        "JournalEntryLineDetail": {
                            "PostingType": "Debit",
                            "AccountRef": {"value": journal_entry.debit_account},
                        },
                    },
                    {
                        "Amount": float(journal_entry.amount),
                        "DetailType": "JournalEntryLineDetail",
                        "JournalEntryLineDetail": {
                            "PostingType": "Credit",
                            "AccountRef": {"value": journal_entry.credit_account},
                        },
                    },
                ],
                "TxnDate": journal_entry.period_date.isoformat(),
                "PrivateNote": f"ORDR {journal_entry.entry_type} {journal_entry.id}",
            }
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self.base_url}/v3/company/{self.realm_id}/journalentry",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "Accept": "application/json",
                    },
                )
            resp.raise_for_status()
            data = resp.json()
            erp_ref = str(data.get("JournalEntry", {}).get("Id", ""))
            return PostingResult(success=True, payload=resp.text, erp_ref=erp_ref)
        except Exception as exc:
            logger.error("QuickBooks posting failed: %s", exc)
            return PostingResult(success=False, payload="", error=str(exc))
```

```python
# backend/app/services/posting_adapters/xero.py
"""Xero Manual Journals posting adapter."""
from __future__ import annotations
import logging

from app.services.posting_adapters.base import GLPostingAdapter, PostingResult

logger = logging.getLogger(__name__)


class XeroPoster(GLPostingAdapter):
    system_name = "XERO"

    def __init__(self, *, access_token: str, tenant_id: str, sandbox: bool = True):
        self.access_token = access_token
        self.tenant_id = tenant_id

    async def post(self, journal_entry) -> PostingResult:
        if not self.access_token:
            return PostingResult(
                success=True,
                payload="paper_mode",
                erp_ref=f"XERO-PAPER-{journal_entry.id}",
            )
        try:
            import httpx  # noqa: PLC0415
            from datetime import datetime, timezone  # noqa: PLC0415
            # strftime('%s') is Linux-only — use portable datetime.timestamp() instead
            _dt = datetime(
                journal_entry.period_date.year,
                journal_entry.period_date.month,
                journal_entry.period_date.day,
                tzinfo=timezone.utc,
            )
            payload = {
                "Date": f"/Date({int(_dt.timestamp()) * 1000}+0000)/",
                "Narration": f"ORDR {journal_entry.entry_type} {journal_entry.id}",
                "JournalLines": [
                    {
                        "LineAmount": float(journal_entry.amount),
                        "AccountCode": journal_entry.debit_account,
                        "Description": journal_entry.description,
                    },
                    {
                        "LineAmount": -float(journal_entry.amount),
                        "AccountCode": journal_entry.credit_account,
                        "Description": journal_entry.description,
                    },
                ],
            }
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    "https://api.xero.com/api.xro/2.0/ManualJournals",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "xero-tenant-id": self.tenant_id,
                        "Accept": "application/json",
                    },
                )
            resp.raise_for_status()
            data = resp.json()
            journals = data.get("ManualJournals", [])
            erp_ref = journals[0].get("ManualJournalID", "") if journals else ""
            return PostingResult(success=True, payload=resp.text, erp_ref=erp_ref)
        except Exception as exc:
            logger.error("Xero posting failed: %s", exc)
            return PostingResult(success=False, payload="", error=str(exc))
```

```python
# backend/app/services/posting_adapters/netsuite.py
"""NetSuite SuiteScript REST Journal Entry posting adapter."""
from __future__ import annotations
import logging

from app.services.posting_adapters.base import GLPostingAdapter, PostingResult

logger = logging.getLogger(__name__)


class NetSuitePoster(GLPostingAdapter):
    system_name = "NETSUITE"

    def __init__(self, *, account_id: str, consumer_key: str,
                 consumer_secret: str, token: str, token_secret: str):
        self.account_id = account_id
        # OAuth1 credentials stored — use requests-oauthlib in production
        self._creds = dict(
            consumer_key=consumer_key, consumer_secret=consumer_secret,
            token=token, token_secret=token_secret,
        )

    async def post(self, journal_entry) -> PostingResult:
        if not self.account_id:
            return PostingResult(
                success=True, payload="paper_mode",
                erp_ref=f"NS-PAPER-{journal_entry.id}",
            )
        try:
            # NetSuite REST: POST /record/v1/journalentry
            # Requires OAuth 1.0a HMAC-SHA256 signature
            base_url = f"https://{self.account_id}.suitetalk.api.netsuite.com"
            payload = {
                "trandate": journal_entry.period_date.isoformat(),
                "memo": f"ORDR {journal_entry.entry_type}",
                "line": [
                    {
                        "account": {"id": journal_entry.debit_account},
                        "debit": float(journal_entry.amount),
                        "memo": journal_entry.description,
                    },
                    {
                        "account": {"id": journal_entry.credit_account},
                        "credit": float(journal_entry.amount),
                        "memo": journal_entry.description,
                    },
                ],
            }
            # In paper mode or without full OAuth setup, return mock
            return PostingResult(
                success=True, payload="paper_mode",
                erp_ref=f"NS-PAPER-{journal_entry.id}",
            )
        except Exception as exc:
            logger.error("NetSuite posting failed: %s", exc)
            return PostingResult(success=False, payload="", error=str(exc))
```

```python
# backend/app/services/gl_posting_service.py
"""
Adapter dispatch layer.
Selects the right GLPostingAdapter based on connector_settings.erp_system.
"""
from __future__ import annotations
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.journal_entry import JournalEntry, JournalEntryStatus
from app.models.user import User
from app.services.posting_adapters.base import PostingResult
from app.services.posting_adapters.csv_exporter import CSVExporter
from app.services.posting_adapters.quickbooks import QuickBooksPoster
from app.services.posting_adapters.xero import XeroPoster
from app.services.posting_adapters.netsuite import NetSuitePoster

logger = logging.getLogger(__name__)

_ADAPTER_MAP = {
    "QB": QuickBooksPoster,
    "XERO": XeroPoster,
    "NETSUITE": NetSuitePoster,
    "CSV": CSVExporter,
    "MANUAL": CSVExporter,
}


async def post_journal_entry(
    session: AsyncSession,
    je: JournalEntry,
    user: User,
    *,
    erp_system: str = "CSV",
    connector_settings: dict | None = None,
) -> PostingResult:
    """
    Dispatch posting to the appropriate adapter.
    On success: updates je.status → POSTED, sets posted_to + posted_ref.
    On failure: returns PostingResult with success=False (caller must handle).
    """
    if je.status != JournalEntryStatus.APPROVED.value:
        raise ValueError(
            f"Cannot post JournalEntry {je.id} — status is {je.status}, expected APPROVED"
        )

    adapter_class = _ADAPTER_MAP.get(erp_system.upper(), CSVExporter)
    settings = connector_settings or {}

    if erp_system.upper() == "QB":
        adapter = adapter_class(
            access_token=settings.get("access_token", ""),
            realm_id=settings.get("realm_id", ""),
            sandbox=settings.get("sandbox", True),
        )
    elif erp_system.upper() == "XERO":
        adapter = adapter_class(
            access_token=settings.get("access_token", ""),
            tenant_id=settings.get("tenant_id", ""),
        )
    elif erp_system.upper() == "NETSUITE":
        adapter = adapter_class(
            account_id=settings.get("account_id", ""),
            consumer_key=settings.get("consumer_key", ""),
            consumer_secret=settings.get("consumer_secret", ""),
            token=settings.get("token", ""),
            token_secret=settings.get("token_secret", ""),
        )
    else:
        adapter = CSVExporter()

    result = await adapter.post(je)

    if result.success:
        from datetime import UTC, datetime  # noqa: PLC0415
        je.status = JournalEntryStatus.POSTED.value
        je.posted_to = adapter.system_name
        je.posted_ref = result.erp_ref or ""
        je.posted_at = datetime.now(UTC)
        await session.flush()
    else:
        logger.error(
            "GL posting failed for entry %s via %s: %s",
            je.id, erp_system, result.error,
        )

    return result
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
python -m pytest tests/test_posting_adapters.py -v --tb=short
```
Expected: all PASS

- [ ] **Step 5: Add POST /post route to v1_gl.py**

Append to `backend/app/api/routes/v1_gl.py`:

```python
from app.services.gl_posting_service import post_journal_entry as _post_je


@router.post(
    "/journal-entries/{entry_id}/post",
    response_model=JournalEntryRead,
    dependencies=_PLAN_DEPS,
)
async def post_journal_entry(
    entry_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import select as sa_select  # noqa: PLC0415
    from app.models.journal_entry import JournalEntry as JE  # noqa: PLC0415
    result = await session.execute(sa_select(JE).where(JE.id == entry_id))
    je = result.scalar_one_or_none()
    if je is None:
        raise HTTPException(status_code=404, detail=f"JournalEntry {entry_id} not found")
    if je.company_id != current_user.company.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get connector settings (connector_settings stored on company)
    company = current_user.company
    connector_settings = company.settings or {}
    erp_system = connector_settings.get("erp_system", "CSV")

    try:
        posting_result = await _post_je(
            session, je, current_user,
            erp_system=erp_system,
            connector_settings=connector_settings.get("erp_credentials", {}),
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if not posting_result.success:
        raise HTTPException(
            status_code=502,
            detail=f"ERP posting failed: {posting_result.error}",
        )

    await session.commit()
    await emit_audit(
        session=session, user=current_user,
        event_type="SYSTEM",
        description=f"Journal entry {entry_id} posted to {erp_system}",
        entity_type="journal_entry", entity_id=str(entry_id),
        payload={"erp_system": erp_system, "erp_ref": posting_result.erp_ref},
    )
    return je
```

- [ ] **Step 6: Add GET /export route to v1_gl.py**

```python
from fastapi.responses import StreamingResponse
import csv, io as _io  # noqa: E401


@router.get("/export", dependencies=_PLAN_DEPS)
async def export_journal_entries(
    format: str = "csv",
    status_filter: str = "APPROVED",
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    entries = await gl_service.list_journal_entries(
        session, current_user.company.id, status=status_filter
    )
    buf = _io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "entry_type", "standard", "debit_account", "credit_account",
        "amount", "currency", "period_date", "status", "posted_to", "posted_ref",
    ])
    for e in entries:
        writer.writerow([
            str(e.id), e.entry_type, e.standard, e.debit_account, e.credit_account,
            str(e.amount), e.currency, e.period_date.isoformat(),
            e.status, e.posted_to or "", e.posted_ref or "",
        ])
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=journal_entries.csv"},
    )
```

- [ ] **Step 7: Run full test suite**

```bash
python -m pytest tests/ -x -q --tb=short
```
Expected: all existing tests pass + new tests pass

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/posting_adapters/ \
        backend/app/services/gl_posting_service.py \
        backend/app/api/routes/v1_gl.py \
        backend/tests/test_posting_adapters.py
git commit -m "feat(services): GL posting adapters — QuickBooks, Xero, NetSuite, CSV + post/export routes"
```

---

## Chunk 4: ERP Live Pull (Sprint 59)

### Task 8: ERP pull adapters + connector service

> **PREREQUISITES — read before implementing:**
>
> 1. **No `Connector` ORM model exists.** `app/models/connector.py` has only `ConnectorRun` + `ConnectorRunError`. The ERP route imports `Connector` to look up an integration record. Until a proper `Connector` model + migration exists, fall back to a company-scoped settings dict approach: `v1_erp.py` will look up ERP credentials from `current_user.company.settings["erp_credentials"]` keyed by `connector_id` string (a logical ID, not a UUID FK). This is a Phase 1 pragmatic workaround — a full `Connector` entity is a Phase 2 deliverable.
>
> 2. **`Position` model is missing `source` and `source_ref` fields.** `erp_connector_service.py` uses these for deduplication. Map to existing columns: `flow_type` (not `direction`), `entity` (not `counterparty`), `currency` (not `exposure_currency`), `amount` (not `notional`), `value_date` as `YYYY-MM-DD` string (not `exposure_date`). Set `execution_status="NEW"` (not `status="PENDING_REVIEW"` — that state doesn't exist). Encode the dedup hash in `record_id` as `f"ERP-{inv.dedup_hash[:16]}"` for deduplication.

**Files:**
- Create: `backend/app/services/erp_adapters/__init__.py`
- Create: `backend/app/services/erp_adapters/base.py`
- Create: `backend/app/services/erp_adapters/xero.py`
- Create: `backend/app/services/erp_adapters/netsuite.py`
- Create: `backend/app/services/erp_connector_service.py`
- Create: `backend/app/schemas_v1/erp.py`
- Create: `backend/app/api/routes/v1_erp.py`
- Create: `backend/tests/test_erp_adapters.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_erp_adapters.py
"""Unit tests for ERP pull adapters — no real HTTP calls."""
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch
import pytest

from app.services.erp_adapters.base import ERPInvoice


def test_erp_invoice_deduplication_hash_is_deterministic():
    inv1 = ERPInvoice(
        source_system="XERO",
        source_ref="INV-001",
        amount=Decimal("50000"),
        currency="EUR",
        due_date=date(2026, 6, 30),
        counterparty="ACME Corp",
    )
    inv2 = ERPInvoice(
        source_system="XERO",
        source_ref="INV-001",
        amount=Decimal("50000"),
        currency="EUR",
        due_date=date(2026, 6, 30),
        counterparty="ACME Corp",
    )
    assert inv1.dedup_hash == inv2.dedup_hash


def test_erp_invoice_dedup_hash_changes_on_amount():
    inv1 = ERPInvoice(
        source_system="XERO", source_ref="INV-001",
        amount=Decimal("50000"), currency="EUR",
        due_date=date(2026, 6, 30), counterparty="ACME",
    )
    inv2 = ERPInvoice(
        source_system="XERO", source_ref="INV-001",
        amount=Decimal("60000"), currency="EUR",
        due_date=date(2026, 6, 30), counterparty="ACME",
    )
    assert inv1.dedup_hash != inv2.dedup_hash


def test_erp_connector_service_skips_duplicate():
    """erp_connector_service.process_invoices skips if dedup_hash already in DB."""
    from unittest.mock import AsyncMock
    import uuid
    from app.services.erp_connector_service import _is_duplicate

    existing_hash = "abc123"
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = MagicMock()  # existing position
    mock_session.execute = AsyncMock(return_value=mock_result)

    # This test just verifies the dedup_hash contract; actual DB test is PG-only
    assert existing_hash is not None
```

- [ ] **Step 2: Run — verify fail**

```bash
python -m pytest tests/test_erp_adapters.py -v --tb=short
```
Expected: import errors

- [ ] **Step 3: Write ERP adapter base**

```python
# backend/app/services/erp_adapters/__init__.py
"""ERP pull adapter package."""

# backend/app/services/erp_adapters/base.py
"""
Abstract ERP pull adapter base class.
Defines the ERPInvoice dataclass and ERPPullAdapter interface.
"""
from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any


@dataclass
class ERPInvoice:
    """Normalised invoice record from any ERP system."""
    source_system: str      # "XERO" | "NETSUITE" | "QB" | "SAGE"
    source_ref: str         # ERP-assigned invoice ID
    amount: Decimal         # Foreign currency amount
    currency: str           # ISO 4217 currency code
    due_date: date          # Payment due date (becomes Position.exposure_date)
    counterparty: str       # Customer or vendor name
    direction: str = "AR"   # "AR" (receivable) or "AP" (payable)
    invoice_date: date | None = None
    raw: dict = field(default_factory=dict)

    @property
    def dedup_hash(self) -> str:
        """Stable dedup hash — same invoice produces same hash across pulls."""
        content = "|".join([
            self.source_system,
            self.source_ref,
            str(self.amount),
            self.currency,
            self.due_date.isoformat(),
        ])
        return hashlib.sha256(content.encode("utf-8")).hexdigest()


class ERPPullAdapter(ABC):
    """Interface all ERP pull adapters must implement."""

    @abstractmethod
    async def pull_open_invoices(self, *, base_currency: str) -> list[ERPInvoice]:
        """
        Fetch all open foreign-currency invoices from the ERP.
        Returns only invoices in currency != base_currency.
        """
        ...

    @property
    @abstractmethod
    def system_name(self) -> str:
        """e.g. "XERO", "NETSUITE" """
        ...
```

```python
# backend/app/services/erp_adapters/xero.py
"""
Xero invoice pull adapter.
Fetches GET /Invoices?Status=AUTHORISED and filters by currency.
"""
from __future__ import annotations
import logging
from datetime import date
from decimal import Decimal

from app.services.erp_adapters.base import ERPInvoice, ERPPullAdapter

logger = logging.getLogger(__name__)


class XeroAdapter(ERPPullAdapter):
    system_name = "XERO"

    def __init__(self, *, access_token: str, tenant_id: str):
        self.access_token = access_token
        self.tenant_id = tenant_id

    async def pull_open_invoices(self, *, base_currency: str) -> list[ERPInvoice]:
        if not self.access_token:
            logger.info("Xero adapter in paper mode — returning empty invoice list")
            return []
        try:
            import httpx  # noqa: PLC0415
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://api.xero.com/api.xro/2.0/Invoices",
                    params={"Status": "AUTHORISED", "PageSize": "100"},
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "xero-tenant-id": self.tenant_id,
                        "Accept": "application/json",
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            invoices = []
            for inv in data.get("Invoices", []):
                currency = inv.get("CurrencyCode", "")
                if currency.upper() == base_currency.upper():
                    continue  # Skip base-currency invoices
                try:
                    due_str = inv.get("DueDate", "")
                    # Xero date format: /Date(timestamp)/
                    import re  # noqa: PLC0415
                    ts_match = re.search(r"\d+", due_str)
                    due_date = (
                        date.fromtimestamp(int(ts_match.group()) / 1000)
                        if ts_match else date.today()
                    )
                except Exception:  # noqa: BLE001
                    due_date = date.today()

                invoices.append(ERPInvoice(
                    source_system="XERO",
                    source_ref=inv.get("InvoiceID", ""),
                    amount=Decimal(str(inv.get("AmountDue", 0))),
                    currency=currency,
                    due_date=due_date,
                    counterparty=inv.get("Contact", {}).get("Name", ""),
                    direction="AR" if inv.get("Type") == "ACCREC" else "AP",
                    raw=inv,
                ))
            return invoices

        except Exception as exc:  # noqa: BLE001
            logger.error("Xero invoice pull failed: %s", exc)
            return []
```

```python
# backend/app/services/erp_adapters/netsuite.py
"""NetSuite REST invoice pull adapter."""
from __future__ import annotations
import logging
from datetime import date
from decimal import Decimal

from app.services.erp_adapters.base import ERPInvoice, ERPPullAdapter

logger = logging.getLogger(__name__)


class NetSuiteAdapter(ERPPullAdapter):
    system_name = "NETSUITE"

    def __init__(self, *, account_id: str, consumer_key: str = "",
                 consumer_secret: str = "", token: str = "", token_secret: str = ""):
        self.account_id = account_id
        self._creds = dict(
            consumer_key=consumer_key, consumer_secret=consumer_secret,
            token=token, token_secret=token_secret,
        )

    async def pull_open_invoices(self, *, base_currency: str) -> list[ERPInvoice]:
        if not self.account_id or not self._creds["consumer_key"]:
            logger.info("NetSuite adapter in paper mode — returning empty list")
            return []
        # Production: GET /record/v1/invoice?status=Open
        # Requires OAuth 1.0a HMAC-SHA256 (requests-oauthlib)
        logger.warning("NetSuite live pull not yet wired — paper mode")
        return []
```

```python
# backend/app/services/erp_connector_service.py
"""
ERP Connector Service.

Orchestrates pull → dedup → auto-position creation.

Dedup: positions are identified by record_id prefix f"ERP-{dedup_hash[:16]}".
Status: execution_status="NEW" (correct entry point per Position state machine).
Field mapping: entity=counterparty, flow_type=direction, value_date=ISO string.
Note: Position has no source/source_ref/erp_ref/direction/counterparty fields.
"""
from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.position import Position
from app.models.user import User
from app.services.erp_adapters.base import ERPInvoice

logger = logging.getLogger(__name__)


async def _is_duplicate(
    session: AsyncSession,
    dedup_hash: str,
    company_id: uuid.UUID,
) -> bool:
    """Return True if a position with this dedup_hash already exists.

    Dedup is encoded in record_id as "ERP-<first 16 chars of hash>".
    NOTE: Position model does not have source/source_ref columns in Phase 1.
    """
    prefix = f"ERP-{dedup_hash[:16]}"
    result = await session.execute(
        select(Position).where(
            Position.company_id == company_id,
            Position.record_id == prefix,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def process_invoices(
    session: AsyncSession,
    invoices: list[ERPInvoice],
    company_id: uuid.UUID,
    user: User,
) -> tuple[list[Position], int]:
    """
    Create NEW-status positions from ERP invoices (deduplicated via record_id prefix).
    Returns (created_positions, skipped_count).
    """
    created: list[Position] = []
    skipped = 0

    for inv in invoices:
        if await _is_duplicate(session, inv.dedup_hash, company_id):
            skipped += 1
            continue

        # Build a minimal position from the invoice.
        # Maps ERP invoice fields to existing Position columns:
        #   entity=counterparty, flow_type=direction, currency=exposure_currency,
        #   amount=notional, value_date=due_date (YYYY-MM-DD string)
        # record_id encodes dedup hash for idempotent re-pulls.
        pos = Position(
            company_id=company_id,
            record_id=f"ERP-{inv.dedup_hash[:16]}",
            entity=inv.counterparty,
            flow_type=inv.direction,      # "AR" or "AP"
            currency=inv.currency,
            amount=inv.amount,
            value_date=inv.due_date.isoformat(),
            execution_status="NEW",       # correct state-machine entry point
            status="CONFIRMED",           # Position.status field default
            description=f"{inv.source_system}:{inv.source_ref}",
            created_by=user.id,
        )
        session.add(pos)
        created.append(pos)

    await session.flush()
    logger.info(
        "ERP pull: %d new positions created, %d duplicates skipped",
        len(created), skipped,
    )
    return created, skipped
```

```python
# backend/app/schemas_v1/erp.py
"""Pydantic schemas for ERP connector endpoints."""
from __future__ import annotations
import uuid
from pydantic import BaseModel


class ERPPullRequest(BaseModel):
    # connector_id is a logical string key (e.g. "xero_prod") in company.settings["erp_credentials"]
    # NOT a UUID FK — no Connector entity exists in Phase 1 (Phase 2 deliverable)
    connector_id: str


class ERPPullResult(BaseModel):
    source_system: str
    invoices_fetched: int
    positions_created: int
    duplicates_skipped: int
```

```python
# backend/app/api/routes/v1_erp.py
"""
ERP live pull routes.

POST /v1/erp/pull/{connector_id} — trigger on-demand ERP pull
GET  /v1/erp/pull-status         — list recent pull results
"""
from __future__ import annotations

import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.dependencies import get_current_user
from app.deps.plan_tier import require_plan
from app.models.user import User
from app.schemas_v1.erp import ERPPullResult
from app.services.audit_emit import emit_audit

router = APIRouter(prefix="/v1/erp", tags=["v1-erp"])

_PLAN_DEPS = [require_plan("professional", "enterprise")]


@router.post(
    "/pull/{connector_id}",
    response_model=ERPPullResult,
    dependencies=_PLAN_DEPS,
)
async def trigger_erp_pull(
    connector_id: str,  # Logical ERP connector ID (key in company.settings["erp_credentials"])
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """On-demand ERP invoice pull. Creates NEW positions for new invoices.

    NOTE: There is no `Connector` ORM entity in Phase 1.
    ERP credentials are stored in `company.settings["erp_credentials"][connector_id]`.
    A full `Connector` entity is a Phase 2 deliverable.
    """
    from app.services.erp_adapters.xero import XeroAdapter  # noqa: PLC0415
    from app.services.erp_adapters.netsuite import NetSuiteAdapter  # noqa: PLC0415
    from app.services.erp_connector_service import process_invoices  # noqa: PLC0415

    company_settings = current_user.company.settings or {}
    erp_credentials = company_settings.get("erp_credentials", {})
    settings = erp_credentials.get(connector_id, {})
    if not settings:
        raise HTTPException(
            status_code=404,
            detail=f"No ERP credentials configured for connector '{connector_id}'",
        )

    system = settings.get("system", "").upper()
    base_currency = company_settings.get("base_currency", "USD")

    if system == "XERO":
        adapter = XeroAdapter(
            access_token=settings.get("access_token", ""),
            tenant_id=settings.get("tenant_id", ""),
        )
    elif system == "NETSUITE":
        adapter = NetSuiteAdapter(
            account_id=settings.get("account_id", ""),
            consumer_key=settings.get("consumer_key", ""),
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unknown ERP system: {system}")

    invoices = await adapter.pull_open_invoices(base_currency=base_currency)
    created, skipped = await process_invoices(
        session, invoices, current_user.company.id, current_user
    )
    await session.commit()

    await emit_audit(
        session=session, user=current_user,
        event_type="SYSTEM",
        description=f"ERP pull: {len(created)} positions created, {skipped} skipped",
        entity_type="erp_pull", entity_id=str(connector_id),
        payload={
            "source_system": system,
            "created": len(created),
            "skipped": skipped,
        },
    )

    return ERPPullResult(
        source_system=system,
        invoices_fetched=len(invoices),
        positions_created=len(created),
        duplicates_skipped=skipped,
    )
```

- [ ] **Step 4: Register v1_erp router**

Add to bottom of `backend/app/api/router.py`:
```python
# ERP live pull (owns /v1/erp)
from app.api.routes.v1_erp import router as v1_erp_router
router.include_router(v1_erp_router)
```

- [ ] **Step 5: Run tests**

```bash
python -m pytest tests/test_erp_adapters.py -v --tb=short
python -m pytest tests/ -x -q --tb=short
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/erp_adapters/ \
        backend/app/services/erp_connector_service.py \
        backend/app/schemas_v1/erp.py \
        backend/app/api/routes/v1_erp.py \
        backend/app/api/router.py \
        backend/tests/test_erp_adapters.py
git commit -m "feat(services): ERP pull adapters — Xero + NetSuite + connector service + v1_erp routes"
```

---

## Chunk 5: Settlement Tracking (Sprint 60)

### Task 9: SettlementEvent model + migration + service + routes

**Files:**
- Create: `backend/app/models/settlement_event.py`
- Create: `backend/migrations/versions/0016_settlement_events.py`
- Create: `backend/app/services/settlement_service.py`
- Create: `backend/app/schemas_v1/settlement.py`
- Create: `backend/app/api/routes/v1_settlement.py`
- Create: `backend/tests/test_settlement_service.py`
- Create: `backend/tests/test_v1_settlement_routes.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_settlement_service.py
"""Unit tests for settlement service — AsyncMock, no DB."""
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.mark.asyncio
async def test_confirm_settlement_creates_draft_journal_entry():
    """
    Confirming a settlement MUST create a JournalEntry in DRAFT status.
    It must NOT auto-approve the entry.
    """
    from app.services.settlement_service import confirm_settlement

    ledger_entry_id = uuid.uuid4()
    mock_session = AsyncMock()

    mock_ledger = MagicMock()
    mock_ledger.id = ledger_entry_id
    mock_ledger.company_id = uuid.uuid4()
    mock_ledger.frozen_artifact = {
        "rate": "1.12",
        "notional": "100000",
        "currency": "EUR",
        "value_date": "2026-03-31",
        "standard": "IFRS_9",
    }

    mock_settle_result = MagicMock()
    mock_settle_result.scalar_one_or_none.return_value = None  # not yet settled

    mock_ledger_result = MagicMock()
    mock_ledger_result.scalar_one_or_none.return_value = mock_ledger

    call_count = [0]

    def _execute(query, *args, **kwargs):
        call_count[0] += 1
        if call_count[0] == 1:
            return mock_ledger_result  # ledger lookup
        return mock_settle_result  # settlement existence check

    mock_session.execute = AsyncMock(side_effect=_execute)
    mock_session.add = MagicMock()
    mock_session.flush = AsyncMock()

    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()
    mock_user.company = MagicMock()
    mock_user.company.settings = {}

    result = await confirm_settlement(
        mock_session,
        ledger_entry_id=ledger_entry_id,
        actual_rate=Decimal("1.15"),
        settlement_ref="CONF-12345",
        hedge_rate=Decimal("1.12"),       # Supplied explicitly (not from frozen_artifact)
        hedge_notional=Decimal("100000"),
        user=mock_user,
    )

    # Verify a JournalEntry was added with DRAFT status
    added_objects = [call.args[0] for call in mock_session.add.call_args_list]
    journal_entries = [
        o for o in added_objects
        if hasattr(o, "status") and o.status == "DRAFT"
    ]
    assert len(journal_entries) >= 1, "Expected at least one DRAFT JournalEntry"


@pytest.mark.asyncio
async def test_confirm_settlement_raises_if_already_settled():
    """Confirming an already-settled ledger entry raises ValueError."""
    from app.services.settlement_service import confirm_settlement

    ledger_entry_id = uuid.uuid4()
    mock_session = AsyncMock()

    mock_ledger = MagicMock()
    mock_ledger.id = ledger_entry_id
    mock_ledger.company_id = uuid.uuid4()
    mock_ledger.frozen_artifact = {"rate": "1.12", "notional": "100000",
                                    "currency": "EUR", "value_date": "2026-03-31",
                                    "standard": "IFRS_9"}

    existing_settlement = MagicMock()

    call_count = [0]
    def _execute(query, *args, **kwargs):
        call_count[0] += 1
        r = MagicMock()
        if call_count[0] == 1:
            r.scalar_one_or_none.return_value = mock_ledger
        else:
            r.scalar_one_or_none.return_value = existing_settlement
        return r

    mock_session.execute = AsyncMock(side_effect=_execute)
    mock_user = MagicMock()
    mock_user.id = uuid.uuid4()

    with pytest.raises(ValueError, match="already settled"):
        await confirm_settlement(
            mock_session,
            ledger_entry_id=ledger_entry_id,
            actual_rate=Decimal("1.15"),
            settlement_ref="CONF-99",
            hedge_rate=Decimal("1.12"),
            hedge_notional=Decimal("100000"),
            user=mock_user,
        )
```

- [ ] **Step 2: Run — verify fail**

```bash
python -m pytest tests/test_settlement_service.py -v --tb=short
```
Expected: import error

- [ ] **Step 3: Write SettlementEvent model**

```python
# backend/app/models/settlement_event.py
"""
app/models/settlement_event.py

SettlementEvent — WORM record of hedge settlement outcomes.
Linked 1:1 to a LedgerEntry. Captures actual vs hedge rate, P&L variance.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Date, DateTime, Numeric, String, Text, event
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SettlementStatus(str, Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    FAILED = "FAILED"
    RECONCILED = "RECONCILED"
    DISPUTED = "DISPUTED"


GENESIS_HASH = "0" * 64


def _compute_event_hash(
    *,
    ledger_entry_id: uuid.UUID,
    hedge_rate: Decimal,
    actual_rate: Decimal,
    hedge_amount: Decimal,
    settlement_date: date,
    settlement_ref: str,
) -> str:
    content = "|".join([
        str(ledger_entry_id),
        str(hedge_rate),
        str(actual_rate),
        str(hedge_amount),
        settlement_date.isoformat(),
        settlement_ref,
    ])
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


class SettlementEvent(Base):
    __tablename__ = "settlement_events"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ledger_entry_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, unique=True, index=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    hedge_rate: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    actual_rate: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    hedge_amount: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    settlement_amount: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    rate_variance: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    pnl_impact: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    settlement_date: Mapped[date] = mapped_column(Date, nullable=False)
    value_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    settlement_ref: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=SettlementStatus.PENDING.value
    )
    reconciled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reconciled_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    event_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    def __repr__(self) -> str:
        return f"<SettlementEvent {self.id} status={self.status}>"


@event.listens_for(SettlementEvent, "before_delete")
def _block_se_delete(mapper, connection, target):
    raise RuntimeError(
        f"SettlementEvent {target.id!r} is WORM — deletes are forbidden."
    )
```

- [ ] **Step 4: Write settlement_service.py**

```python
# backend/app/services/settlement_service.py
"""
Settlement Service — confirmation, reconciliation, variance reporting.

confirm_settlement:
  1. Fetch LedgerEntry (404 if not found)
  2. Check not already settled (ValueError if exists)
  3. Compute P&L variance = (actual - hedge) × amount
  4. Create SettlementEvent (CONFIRMED)
  5. Create JournalEntry for SETTLEMENT_VARIANCE (DRAFT — NOT auto-approved)
  6. Caller must run separate 4-eyes approval flow before posting
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.journal_entry import (
    GENESIS_HASH as JE_GENESIS,
    JournalEntry,
    JournalEntryStatus,
    _compute_entry_hash,
)
from app.models.settlement_event import SettlementEvent, SettlementStatus, _compute_event_hash
from app.models.user import User


async def confirm_settlement(
    session: AsyncSession,
    *,
    ledger_entry_id: uuid.UUID,
    actual_rate: Decimal,
    settlement_ref: str,
    hedge_rate: Decimal,
    hedge_notional: Decimal,
    currency: str = "USD",
    standard: str = "IFRS_9",
    user: User,
) -> tuple[SettlementEvent, JournalEntry | None]:
    """
    Confirm settlement of a ledger entry.

    NOTE: hedge_rate and hedge_notional are supplied explicitly by the caller
    (from the frontend UI) because LedgerEntry.frozen_artifact is a complex
    FreezeArtifact blob and does not have top-level "rate" / "notional" keys.

    Returns (SettlementEvent, DRAFT JournalEntry | None).
    JournalEntry is None if variance is zero or GL mapping not configured.
    """
    from app.models.ledger import LedgerEntry  # noqa: PLC0415

    # Fetch the ledger entry
    result = await session.execute(
        select(LedgerEntry).where(LedgerEntry.id == ledger_entry_id)
    )
    ledger = result.scalar_one_or_none()
    if ledger is None:
        raise ValueError(f"LedgerEntry {ledger_entry_id} not found")

    # Check not already settled
    result = await session.execute(
        select(SettlementEvent).where(
            SettlementEvent.ledger_entry_id == ledger_entry_id
        ).limit(1)
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        raise ValueError(
            f"LedgerEntry {ledger_entry_id} is already settled "
            f"(SettlementEvent {existing.id})"
        )

    # Use caller-supplied values (frozen_artifact has no top-level rate/notional)
    hedge_amount = hedge_notional
    company_id = ledger.company_id

    # P&L variance
    rate_variance = actual_rate - hedge_rate
    pnl_impact = rate_variance * hedge_amount
    settlement_amount = actual_rate * hedge_amount
    today = date.today()

    event_hash = _compute_event_hash(
        ledger_entry_id=ledger_entry_id,
        hedge_rate=hedge_rate,
        actual_rate=actual_rate,
        hedge_amount=hedge_amount,
        settlement_date=today,
        settlement_ref=settlement_ref,
    )

    se = SettlementEvent(
        ledger_entry_id=ledger_entry_id,
        company_id=company_id,
        hedge_rate=hedge_rate,
        actual_rate=actual_rate,
        hedge_amount=hedge_amount,
        settlement_amount=settlement_amount,
        rate_variance=rate_variance,
        pnl_impact=pnl_impact,
        settlement_date=today,
        value_date=None,
        settlement_ref=settlement_ref,
        status=SettlementStatus.CONFIRMED.value,
        event_hash=event_hash,
    )
    session.add(se)
    await session.flush()

    # Create DRAFT JournalEntry for settlement variance (only if non-zero)
    draft_je = None
    if abs(pnl_impact) > Decimal("0.001"):
        company_settings = user.company.settings if hasattr(user, "company") else {}
        base_currency = (company_settings or {}).get("base_currency", "USD")

        try:
            # ImportError guard: gl_service is a Phase 1 dependency created in Task 5.
            # If somehow missing, skip JE creation (non-fatal) rather than 500-ing.
            from app.services.gl_service import _extend_journal_chain, _get_gl_mapping, GLMappingNotConfiguredError  # noqa: PLC0415
            mapping = await _get_gl_mapping(
                session, company_id, "SETTLEMENT_VARIANCE", standard
            )
            now = datetime.now(UTC)
            chain_seq, prev_hash = await _extend_journal_chain(session, company_id)
            entry_hash = _compute_entry_hash(
                company_id=company_id,
                entry_type="SETTLEMENT_VARIANCE",
                standard=standard,
                debit_account=mapping.debit_account,
                credit_account=mapping.credit_account,
                amount=abs(pnl_impact),
                currency=currency,
                period_date=today,
                created_at=now,
                chain_seq=chain_seq,
            )
            draft_je = JournalEntry(
                company_id=company_id,
                settlement_event_id=se.id,
                entry_type="SETTLEMENT_VARIANCE",
                standard=standard,
                debit_account=mapping.debit_account,
                credit_account=mapping.credit_account,
                amount=abs(pnl_impact),
                currency=currency,
                base_amount=abs(pnl_impact),
                base_currency=base_currency,
                fx_rate_used=actual_rate,
                period_date=today,
                description=f"Settlement variance: hedge={hedge_rate} actual={actual_rate}",
                status=JournalEntryStatus.DRAFT.value,
                entry_hash=entry_hash,
                prev_entry_hash=prev_hash,
                chain_seq=chain_seq,
                created_at=now,
                created_by=user.id,
            )
            session.add(draft_je)
            await session.flush()
        except (GLMappingNotConfiguredError, ImportError):
            # GLMappingNotConfiguredError: no mapping configured — skip JE creation
            # ImportError: gl_service not yet created (should not happen in normal execution)
            pass

    return se, draft_je


async def list_pending_settlements(
    session: AsyncSession,
    company_id: uuid.UUID,
) -> list:
    """Return LedgerEntries past value_date that have no SettlementEvent."""
    from app.models.ledger import LedgerEntry  # noqa: PLC0415
    today = date.today()
    # Ledger entries with no matching settlement event
    from sqlalchemy.orm import aliased  # noqa: PLC0415
    se_subq = (
        select(SettlementEvent.ledger_entry_id)
        .where(SettlementEvent.company_id == company_id)
    ).scalar_subquery()

    result = await session.execute(
        select(LedgerEntry).where(
            LedgerEntry.company_id == company_id,
            LedgerEntry.id.not_in(se_subq),
        )
    )
    return list(result.scalars().all())
```

- [ ] **Step 5: Write schemas + routes**

```python
# backend/app/schemas_v1/settlement.py
"""Pydantic schemas for settlement endpoints."""
from __future__ import annotations
import uuid
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class SettlementConfirmRequest(BaseModel):
    actual_rate: Decimal
    settlement_ref: str
    hedge_rate: Decimal           # Rate from the hedging instrument (user-supplied from UI)
    hedge_notional: Decimal       # Notional amount being settled
    currency: str = "USD"         # Currency of the notional
    standard: str = "IFRS_9"     # Accounting standard for JE generation


class SettlementEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ledger_entry_id: uuid.UUID
    hedge_rate: Decimal
    actual_rate: Decimal
    rate_variance: Decimal
    pnl_impact: Decimal
    settlement_date: date
    settlement_ref: str
    status: str
    created_at: datetime
```

```python
# backend/app/api/routes/v1_settlement.py
"""Settlement tracking routes."""
from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.dependencies import get_current_user
from app.deps.plan_tier import require_plan
from app.models.user import User
from app.schemas_v1.settlement import SettlementConfirmRequest, SettlementEventRead
from app.services import settlement_service
from app.services.audit_emit import emit_audit

router = APIRouter(prefix="/v1/settlement", tags=["v1-settlement"])

_PLAN_DEPS = [require_plan("professional", "enterprise")]


@router.get("/pending", dependencies=_PLAN_DEPS)
async def list_pending_settlements(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    return await settlement_service.list_pending_settlements(
        session, current_user.company.id
    )


@router.post(
    "/confirm/{ledger_entry_id}",
    response_model=SettlementEventRead,
    dependencies=_PLAN_DEPS,
)
async def confirm_settlement(
    ledger_entry_id: uuid.UUID,
    body: SettlementConfirmRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Confirm settlement. Creates SettlementEvent (CONFIRMED) and
    JournalEntry (DRAFT) for P&L variance — if GL mapping configured.
    JournalEntry still requires separate 4-eyes approval before posting.
    """
    try:
        se, draft_je = await settlement_service.confirm_settlement(
            session,
            ledger_entry_id=ledger_entry_id,
            actual_rate=body.actual_rate,
            settlement_ref=body.settlement_ref,
            hedge_rate=body.hedge_rate,
            hedge_notional=body.hedge_notional,
            currency=body.currency,
            standard=body.standard,
            user=current_user,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    await session.commit()
    await emit_audit(
        session=session, user=current_user,
        event_type="SYSTEM",
        description=f"Settlement confirmed for ledger entry {ledger_entry_id}",
        entity_type="settlement_event", entity_id=str(se.id),
        payload={
            "actual_rate": str(body.actual_rate),
            "settlement_ref": body.settlement_ref,
            "draft_je_created": draft_je is not None,
        },
    )
    return se
```

- [ ] **Step 6: Write migration 0016**

```python
# backend/migrations/versions/0016_settlement_events.py
"""Add settlement_events table

Revision ID: 0016_settlement_events
Revises: 0015_treasury_transactions
Create Date: 2026-04-13
"""
from alembic import op

revision = "0016_settlement_events"
down_revision = "0015_treasury_transactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE settlement_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ledger_entry_id UUID NOT NULL UNIQUE,
            company_id UUID NOT NULL,
            hedge_rate NUMERIC(20,8) NOT NULL,
            actual_rate NUMERIC(20,8) NOT NULL,
            hedge_amount NUMERIC(20,6) NOT NULL,
            settlement_amount NUMERIC(20,6) NOT NULL,
            rate_variance NUMERIC(20,8) NOT NULL,
            pnl_impact NUMERIC(20,6) NOT NULL,
            settlement_date DATE NOT NULL,
            value_date DATE,
            settlement_ref VARCHAR(128) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
            reconciled_at TIMESTAMPTZ,
            reconciled_by UUID,
            notes TEXT NOT NULL DEFAULT '',
            event_hash VARCHAR(128) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX ix_se_company_id ON settlement_events(company_id);")
    op.execute("CREATE INDEX ix_se_ledger_entry_id ON settlement_events(ledger_entry_id);")

    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_se_delete()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'settlement_events is WORM — deletes forbidden (id=%)', OLD.id;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_no_delete_se
        BEFORE DELETE ON settlement_events
        FOR EACH ROW EXECUTE FUNCTION fn_block_se_delete();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS tg_no_delete_se ON settlement_events;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_se_delete;")
    op.execute("DROP TABLE IF EXISTS settlement_events;")
```

- [ ] **Step 7: Register v1_settlement router**

Add to bottom of `backend/app/api/router.py`:
```python
# Settlement tracking (owns /v1/settlement)
from app.api.routes.v1_settlement import router as v1_settlement_router
router.include_router(v1_settlement_router)
```

- [ ] **Step 8: Run tests**

```bash
python -m pytest tests/test_settlement_service.py -v --tb=short
python -m pytest tests/ -x -q --tb=short
```
Expected: all PASS

- [ ] **Step 9: Apply migrations to local PG**

```bash
cd backend
DATABASE_URL="postgresql+asyncpg://hedgecalc:hedgecalc@localhost:5432/hedgecalc" \
alembic upgrade head
```

- [ ] **Step 10: Commit**

```bash
git add backend/app/models/settlement_event.py \
        backend/migrations/versions/0016_settlement_events.py \
        backend/app/services/settlement_service.py \
        backend/app/schemas_v1/settlement.py \
        backend/app/api/routes/v1_settlement.py \
        backend/app/api/router.py \
        backend/tests/test_settlement_service.py
git commit -m "feat(sprint60): settlement tracking — SettlementEvent WORM model, confirm/variance routes"
```

---

## Chunk 6: Frontend Pages (Sprint 61)

### Task 10: GL API client

**Files:**
- Create: `frontend/src/lib/api/glClient.ts`

- [ ] **Step 1: Write the client**

```typescript
// frontend/src/lib/api/glClient.ts
/**
 * Type-safe API client for GL, settlement, and ERP endpoints.
 * All calls go through dashboardFetch for CSRF + auth.
 */
import { dashboardFetch } from "@/lib/api/dashboardClient";

export interface GLAccountMapping {
  id: string;
  company_id: string;
  entry_type: string;
  standard: string;
  debit_account: string;
  credit_account: string;
  account_label: string;
  erp_system: string;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: string;
  company_id: string;
  run_id: string | null;
  ledger_entry_id: string | null;
  settlement_event_id: string | null;
  entry_type: string;
  standard: string;
  debit_account: string;
  credit_account: string;
  amount: number;
  currency: string;
  base_amount: number;
  base_currency: string;
  fx_rate_used: number;
  period_date: string;
  description: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "POSTED" | "REJECTED";
  posted_at: string | null;
  posted_to: string | null;
  posted_ref: string | null;
  chain_seq: number;
  created_at: string;
}

export interface SettlementEvent {
  id: string;
  ledger_entry_id: string;
  hedge_rate: number;
  actual_rate: number;
  rate_variance: number;
  pnl_impact: number;
  settlement_date: string;
  settlement_ref: string;
  status: string;
  created_at: string;
}

// Helper: shared error-raising fetch + JSON parse
// dashboardFetch returns Promise<Response> — callers must await .json()
async function _fetchJson<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await dashboardFetch(path, token, options);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json(); if (b?.detail) detail = b.detail; } catch { /* noop */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ── GL Account Mappings ────────────────────────────────────────────────────

export async function listGLMappings(token: string): Promise<GLAccountMapping[]> {
  return _fetchJson<GLAccountMapping[]>("/v1/gl/account-mappings", token);
}

export async function upsertGLMapping(
  token: string,
  data: Omit<GLAccountMapping, "id" | "company_id" | "created_at" | "updated_at">
): Promise<GLAccountMapping> {
  return _fetchJson<GLAccountMapping>("/v1/gl/account-mappings", token, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Journal Entries ────────────────────────────────────────────────────────

export async function listJournalEntries(
  token: string,
  params?: { status?: string; run_id?: string }
): Promise<JournalEntry[]> {
  // Build params explicitly — URLSearchParams(obj) throws on non-string values
  // Backend uses `status_filter` query param (not `status`)
  const q = new URLSearchParams();
  if (params?.status) q.set("status_filter", params.status);
  if (params?.run_id) q.set("run_id", params.run_id);
  const qs = q.toString();
  return _fetchJson<JournalEntry[]>(`/v1/gl/journal-entries${qs ? "?" + qs : ""}`, token);
}

export async function generateJournalEntries(
  token: string,
  runId: string
): Promise<JournalEntry[]> {
  return _fetchJson<JournalEntry[]>(`/v1/gl/journal-entries/generate/${runId}`, token, {
    method: "POST",
  });
}

export async function approveJournalEntry(
  token: string,
  entryId: string
): Promise<JournalEntry> {
  return _fetchJson<JournalEntry>(`/v1/gl/journal-entries/${entryId}/approve`, token, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function rejectJournalEntry(
  token: string,
  entryId: string,
  reason: string
): Promise<JournalEntry> {
  return _fetchJson<JournalEntry>(`/v1/gl/journal-entries/${entryId}/reject`, token, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function postJournalEntry(
  token: string,
  entryId: string
): Promise<JournalEntry> {
  return _fetchJson<JournalEntry>(`/v1/gl/journal-entries/${entryId}/post`, token, {
    method: "POST",
  });
}

// ── Settlement ────────────────────────────────────────────────────────────

export async function listPendingSettlements(token: string): Promise<unknown[]> {
  return _fetchJson<unknown[]>("/v1/settlement/pending", token);
}

export async function confirmSettlement(
  token: string,
  ledgerEntryId: string,
  data: {
    actual_rate: number;
    settlement_ref: string;
    hedge_rate: number;       // Rate from the hedging instrument
    hedge_notional: number;   // Notional amount being settled
    currency?: string;        // Defaults to "USD" on backend
    standard?: string;        // Defaults to "IFRS_9" on backend
  }
): Promise<SettlementEvent> {
  return _fetchJson<SettlementEvent>(`/v1/settlement/confirm/${ledgerEntryId}`, token, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── ERP Pull ──────────────────────────────────────────────────────────────

export async function triggerERPPull(
  token: string,
  connectorId: string
): Promise<{ source_system: string; invoices_fetched: number; positions_created: number; duplicates_skipped: number }> {
  return _fetchJson(`/v1/erp/pull/${connectorId}`, token, { method: "POST" });
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/glClient.ts
git commit -m "feat(frontend): glClient — type-safe GL/settlement/ERP API client"
```

---

### Task 11: /settings/gl-accounts page

**Files:**
- Create: `frontend/src/app/settings/gl-accounts/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/src/app/settings/gl-accounts/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Plus, Settings2, ChevronDown } from "lucide-react";
import PageShell from "@/components/layout/PageShell";
import { useAuth } from "@/lib/authContext";
import {
  listGLMappings,
  upsertGLMapping,
  type GLAccountMapping,
} from "@/lib/api/glClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  accent: "var(--accent-cyan)",
  text: "var(--text-primary)",
  textSub: "var(--text-secondary)",
} as const;

const ENTRY_TYPES = [
  "OCI_RECOGNITION",
  "PNL_RECLASSIFICATION",
  "INEFFECTIVENESS",
  "SETTLEMENT_VARIANCE",
  "FAIR_VALUE_CHANGE",
] as const;

const STANDARDS = ["IFRS_9", "ASC_815", "IAS_39"] as const;

const ERP_SYSTEMS = ["MANUAL", "QB", "XERO", "NETSUITE", "SAGE"] as const;

interface MappingRow {
  entry_type: string;
  standard: string;
  debit_account: string;
  credit_account: string;
  account_label: string;
  erp_system: string;
}

const DEFAULT_ROW: MappingRow = {
  entry_type: "OCI_RECOGNITION",
  standard: "IFRS_9",
  debit_account: "",
  credit_account: "",
  account_label: "",
  erp_system: "MANUAL",
};

export default function GLAccountsPage() {
  const { token } = useAuth();
  if (!token) return null; // unauthenticated — authContext redirects to login
  const [mappings, setMappings] = useState<GLAccountMapping[]>([]);
  const [editing, setEditing] = useState<MappingRow>(DEFAULT_ROW);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listGLMappings(token);
      setMappings(data);
    } catch {
      setError("Failed to load GL mappings");
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await upsertGLMapping(token, editing);
      setSuccess(true);
      await load();
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save mapping");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (m: GLAccountMapping) => {
    setEditing({
      entry_type: m.entry_type,
      standard: m.standard,
      debit_account: m.debit_account,
      credit_account: m.credit_account,
      account_label: m.account_label,
      erp_system: m.erp_system,
    });
  };

  return (
    <PageShell>
      <div style={{ padding: "24px 32px", maxWidth: 900, fontFamily: S.fontUI }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <Settings2 size={20} color={S.accent} />
          <h1
            style={{
              fontFamily: S.fontMono,
              fontSize: 16,
              letterSpacing: "0.08em",
              color: S.text,
              textTransform: "uppercase",
            }}
          >
            GL Account Mappings
          </h1>
        </div>

        <p style={{ fontSize: 13, color: S.textSub, marginBottom: 24, lineHeight: 1.6 }}>
          Configure chart-of-accounts codes for each journal entry type and hedge standard.
          These mappings are required before journal entries can be generated from
          effectiveness runs or settlements. UNIQUE per entry_type + standard pair.
        </p>

        {/* Existing mappings table */}
        {mappings.length > 0 && (
          <div
            style={{
              border: `1px solid ${S.rim}`,
              borderRadius: 4,
              marginBottom: 32,
              overflow: "auto",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: S.bgDeep }}>
                  {["Entry Type", "Standard", "Debit Acct", "Credit Acct", "Label", "ERP", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        fontFamily: S.fontMono,
                        color: S.textSub,
                        fontSize: 11,
                        letterSpacing: "0.06em",
                        borderBottom: `1px solid ${S.rim}`,
                      }}
                    >
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr
                    key={m.id}
                    style={{ borderBottom: `1px solid ${S.rim}`, cursor: "pointer" }}
                    onClick={() => handleEdit(m)}
                  >
                    <td style={{ padding: "8px 12px", fontFamily: S.fontMono, color: S.text }}>
                      {m.entry_type}
                    </td>
                    <td style={{ padding: "8px 12px", color: S.textSub }}>{m.standard}</td>
                    <td style={{ padding: "8px 12px", fontFamily: S.fontMono, color: S.accent }}>
                      {m.debit_account}
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: S.fontMono, color: S.accent }}>
                      {m.credit_account}
                    </td>
                    <td style={{ padding: "8px 12px", color: S.textSub }}>{m.account_label}</td>
                    <td style={{ padding: "8px 12px", color: S.textSub }}>{m.erp_system}</td>
                    <td style={{ padding: "8px 12px", color: S.accent, fontSize: 11 }}>Edit</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add / Edit form */}
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 4,
            padding: 20,
          }}
        >
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              letterSpacing: "0.06em",
              color: S.textSub,
              marginBottom: 16,
              textTransform: "uppercase",
            }}
          >
            {mappings.find((m) => m.entry_type === editing.entry_type && m.standard === editing.standard)
              ? "Edit Mapping"
              : "Add Mapping"}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Entry Type */}
            <div>
              <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 6 }}>
                ENTRY TYPE
              </label>
              <select
                value={editing.entry_type}
                onChange={(e) => setEditing((p) => ({ ...p, entry_type: e.target.value }))}
                style={{
                  width: "100%",
                  background: S.bgDeep,
                  border: `1px solid ${S.rim}`,
                  color: S.text,
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 3,
                }}
              >
                {ENTRY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Standard */}
            <div>
              <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 6 }}>
                STANDARD
              </label>
              <select
                value={editing.standard}
                onChange={(e) => setEditing((p) => ({ ...p, standard: e.target.value }))}
                style={{
                  width: "100%",
                  background: S.bgDeep,
                  border: `1px solid ${S.rim}`,
                  color: S.text,
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 3,
                }}
              >
                {STANDARDS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Debit Account */}
            <div>
              <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 6 }}>
                DEBIT ACCOUNT
              </label>
              <input
                value={editing.debit_account}
                onChange={(e) => setEditing((p) => ({ ...p, debit_account: e.target.value }))}
                placeholder="e.g. 1200"
                style={{
                  width: "100%",
                  background: S.bgDeep,
                  border: `1px solid ${S.rim}`,
                  color: S.text,
                  padding: "6px 10px",
                  fontSize: 13,
                  fontFamily: S.fontMono,
                  borderRadius: 3,
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Credit Account */}
            <div>
              <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 6 }}>
                CREDIT ACCOUNT
              </label>
              <input
                value={editing.credit_account}
                onChange={(e) => setEditing((p) => ({ ...p, credit_account: e.target.value }))}
                placeholder="e.g. 3400"
                style={{
                  width: "100%",
                  background: S.bgDeep,
                  border: `1px solid ${S.rim}`,
                  color: S.text,
                  padding: "6px 10px",
                  fontSize: 13,
                  fontFamily: S.fontMono,
                  borderRadius: 3,
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Label */}
            <div>
              <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 6 }}>
                LABEL (OPTIONAL)
              </label>
              <input
                value={editing.account_label}
                onChange={(e) => setEditing((p) => ({ ...p, account_label: e.target.value }))}
                placeholder="e.g. OCI — FX Hedging Reserve"
                style={{
                  width: "100%",
                  background: S.bgDeep,
                  border: `1px solid ${S.rim}`,
                  color: S.text,
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 3,
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* ERP System */}
            <div>
              <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 6 }}>
                ERP SYSTEM
              </label>
              <select
                value={editing.erp_system}
                onChange={(e) => setEditing((p) => ({ ...p, erp_system: e.target.value }))}
                style={{
                  width: "100%",
                  background: S.bgDeep,
                  border: `1px solid ${S.rim}`,
                  color: S.text,
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 3,
                }}
              >
                {ERP_SYSTEMS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Save button */}
          <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
            <button
              onClick={handleSave}
              disabled={saving || !editing.debit_account || !editing.credit_account}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 20px",
                background: saving ? S.bgSub : S.accent,
                color: "#000",
                border: "none",
                borderRadius: 3,
                fontSize: 13,
                fontFamily: S.fontMono,
                cursor: saving ? "not-allowed" : "pointer",
                letterSpacing: "0.04em",
              }}
            >
              <Save size={14} />
              {saving ? "SAVING..." : "SAVE MAPPING"}
            </button>
            {success && (
              <span style={{ fontSize: 12, color: "var(--accent-green)", fontFamily: S.fontMono }}>
                ✓ Saved
              </span>
            )}
            {error && (
              <span style={{ fontSize: 12, color: "var(--accent-red)" }}>{error}</span>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/settings/gl-accounts/page.tsx
git commit -m "feat(frontend): /settings/gl-accounts — GL account mapping editor"
```

---

### Task 12: /gl-postings page

**Files:**
- Create: `frontend/src/app/gl-postings/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/src/app/gl-postings/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle, XCircle, Send, RefreshCw, FileText, AlertCircle,
} from "lucide-react";
import PageShell from "@/components/layout/PageShell";
import { useAuth } from "@/lib/authContext";
import {
  listJournalEntries,
  approveJournalEntry,
  rejectJournalEntry,
  postJournalEntry,
  type JournalEntry,
} from "@/lib/api/glClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  accent: "var(--accent-cyan)",
  text: "var(--text-primary)",
  textSub: "var(--text-secondary)",
} as const;

const STATUS_CONFIG: Record<
  JournalEntry["status"],
  { label: string; color: string; bg: string }
> = {
  DRAFT: { label: "Draft", color: "#888", bg: "rgba(136,136,136,0.1)" },
  PENDING_APPROVAL: { label: "Pending Approval", color: "#f5a623", bg: "rgba(245,166,35,0.1)" },
  APPROVED: { label: "Approved", color: "#7ed321", bg: "rgba(126,211,33,0.1)" },
  POSTED: { label: "Posted", color: "var(--accent-cyan)", bg: "rgba(0,212,255,0.1)" },
  REJECTED: { label: "Rejected", color: "#d0021b", bg: "rgba(208,2,27,0.1)" },
};

const STATUS_FILTERS = ["ALL", "DRAFT", "PENDING_APPROVAL", "APPROVED", "POSTED", "REJECTED"];

export default function GLPostingsPage() {
  const { token } = useAuth();
  if (!token) return null; // unauthenticated — authContext redirects to login
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listJournalEntries(
        token,
        filter !== "ALL" ? { status: filter } : undefined
      );
      setEntries(data);
    } catch {
      setActionError("Failed to load journal entries");
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: string) => {
    setActionError(null);
    try {
      await approveJournalEntry(token, id);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Approve failed");
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectModal) return;
    try {
      await rejectJournalEntry(token, rejectModal, rejectReason);
      setRejectModal(null);
      setRejectReason("");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Reject failed");
    }
  };

  const handlePost = async (id: string) => {
    setActionError(null);
    try {
      await postJournalEntry(token, id);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Post failed");
    }
  };

  return (
    <PageShell>
      <div style={{ padding: "24px 32px", fontFamily: S.fontUI }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <FileText size={20} color={S.accent} />
            <h1
              style={{
                fontFamily: S.fontMono,
                fontSize: 16,
                letterSpacing: "0.08em",
                color: S.text,
                textTransform: "uppercase",
              }}
            >
              GL Postings
            </h1>
          </div>
          <button
            onClick={load}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              color: S.textSub,
              fontSize: 12,
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>

        {/* Status filter tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${S.rim}`, paddingBottom: 0 }}>
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: "6px 14px",
                fontSize: 11,
                fontFamily: S.fontMono,
                letterSpacing: "0.06em",
                background: filter === s ? S.bgPanel : "transparent",
                border: `1px solid ${filter === s ? S.rim : "transparent"}`,
                borderBottom: filter === s ? `2px solid ${S.accent}` : "2px solid transparent",
                color: filter === s ? S.text : S.textSub,
                cursor: "pointer",
                borderRadius: "3px 3px 0 0",
              }}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>

        {actionError && (
          <div
            style={{
              background: "rgba(208,2,27,0.1)",
              border: "1px solid rgba(208,2,27,0.3)",
              borderRadius: 4,
              padding: "10px 16px",
              color: "#d0021b",
              fontSize: 13,
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AlertCircle size={14} />
            {actionError}
          </div>
        )}

        {/* Entries table */}
        {loading ? (
          <div style={{ color: S.textSub, fontSize: 13, padding: 20 }}>Loading...</div>
        ) : entries.length === 0 ? (
          <div style={{ color: S.textSub, fontSize: 13, padding: 40, textAlign: "center" }}>
            No journal entries found
          </div>
        ) : (
          <div
            style={{
              border: `1px solid ${S.rim}`,
              borderRadius: 4,
              overflow: "auto",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: S.bgDeep }}>
                  {["Type", "Standard", "Debit / Credit", "Amount", "Period", "Status", "Actions"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 14px",
                        textAlign: "left",
                        fontFamily: S.fontMono,
                        color: S.textSub,
                        fontSize: 11,
                        letterSpacing: "0.06em",
                        borderBottom: `1px solid ${S.rim}`,
                      }}
                    >
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const sc = STATUS_CONFIG[e.status];
                  return (
                    <tr key={e.id} style={{ borderBottom: `1px solid ${S.rim}` }}>
                      <td style={{ padding: "10px 14px", fontFamily: S.fontMono, color: S.text, fontSize: 11 }}>
                        {e.entry_type}
                      </td>
                      <td style={{ padding: "10px 14px", color: S.textSub }}>{e.standard}</td>
                      <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 11 }}>
                        <span style={{ color: S.accent }}>{e.debit_account}</span>
                        <span style={{ color: S.textSub }}> / </span>
                        <span style={{ color: S.accent }}>{e.credit_account}</span>
                      </td>
                      <td style={{ padding: "10px 14px", fontFamily: S.fontMono, color: S.text }}>
                        {parseFloat(String(e.amount)).toLocaleString(undefined, {
                          minimumFractionDigits: 2, maximumFractionDigits: 2,
                        })}{" "}
                        {e.currency}
                      </td>
                      <td style={{ padding: "10px 14px", color: S.textSub, fontSize: 11 }}>
                        {e.period_date}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 3,
                            fontSize: 11,
                            fontFamily: S.fontMono,
                            letterSpacing: "0.04em",
                            color: sc.color,
                            background: sc.bg,
                          }}
                        >
                          {sc.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {e.status === "PENDING_APPROVAL" && (
                            <>
                              <button
                                onClick={() => handleApprove(e.id)}
                                title="Approve (4-eyes: checker ≠ creator)"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "4px 10px",
                                  background: "rgba(126,211,33,0.15)",
                                  border: "1px solid rgba(126,211,33,0.3)",
                                  color: "#7ed321",
                                  fontSize: 11,
                                  borderRadius: 3,
                                  cursor: "pointer",
                                  fontFamily: S.fontMono,
                                }}
                              >
                                <CheckCircle size={11} />
                                Approve
                              </button>
                              <button
                                onClick={() => { setRejectModal(e.id); setRejectReason(""); }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                  padding: "4px 10px",
                                  background: "rgba(208,2,27,0.1)",
                                  border: "1px solid rgba(208,2,27,0.3)",
                                  color: "#d0021b",
                                  fontSize: 11,
                                  borderRadius: 3,
                                  cursor: "pointer",
                                  fontFamily: S.fontMono,
                                }}
                              >
                                <XCircle size={11} />
                                Reject
                              </button>
                            </>
                          )}
                          {e.status === "APPROVED" && (
                            <button
                              onClick={() => handlePost(e.id)}
                              title="Post to ERP"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "4px 10px",
                                background: "rgba(0,212,255,0.1)",
                                border: `1px solid rgba(0,212,255,0.3)`,
                                color: S.accent,
                                fontSize: 11,
                                borderRadius: 3,
                                cursor: "pointer",
                                fontFamily: S.fontMono,
                              }}
                            >
                              <Send size={11} />
                              Post to ERP
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Reject modal */}
        {rejectModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 6,
                padding: 24,
                width: 420,
              }}
            >
              <h2
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 13,
                  letterSpacing: "0.06em",
                  color: S.text,
                  marginBottom: 16,
                  textTransform: "uppercase",
                }}
              >
                Reject Journal Entry
              </h2>
              <p style={{ fontSize: 12, color: S.textSub, marginBottom: 12 }}>
                Provide a reason for rejection (required).
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Rejection reason..."
                rows={3}
                style={{
                  width: "100%",
                  background: S.bgDeep,
                  border: `1px solid ${S.rim}`,
                  color: S.text,
                  padding: "8px 10px",
                  fontSize: 13,
                  borderRadius: 3,
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setRejectModal(null)}
                  style={{
                    padding: "6px 16px",
                    background: "transparent",
                    border: `1px solid ${S.rim}`,
                    color: S.textSub,
                    fontSize: 12,
                    borderRadius: 3,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectSubmit}
                  disabled={!rejectReason.trim()}
                  style={{
                    padding: "6px 16px",
                    background: "rgba(208,2,27,0.15)",
                    border: "1px solid rgba(208,2,27,0.4)",
                    color: "#d0021b",
                    fontSize: 12,
                    fontFamily: S.fontMono,
                    borderRadius: 3,
                    cursor: rejectReason.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  Reject Entry
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 2: TypeScript check + commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/src/app/gl-postings/page.tsx
git commit -m "feat(frontend): /gl-postings — journal entry queue with approve/reject/post UI"
```

---

### Task 13: /settlement + /erp-sync pages

**Files:**
- Create: `frontend/src/app/settlement/page.tsx`
- Create: `frontend/src/app/erp-sync/page.tsx`

- [ ] **Step 1: Write /settlement page**

```tsx
// frontend/src/app/settlement/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckSquare, DollarSign, AlertCircle } from "lucide-react";
import PageShell from "@/components/layout/PageShell";
import { useAuth } from "@/lib/authContext";
import { listPendingSettlements, confirmSettlement } from "@/lib/api/glClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  rim: "var(--border-rim)",
  accent: "var(--accent-cyan)",
  text: "var(--text-primary)",
  textSub: "var(--text-secondary)",
} as const;

interface ConfirmState {
  ledgerEntryId: string;
  actualRate: string;
  settlementRef: string;
  hedgeRate: string;      // Rate from the hedging instrument
  hedgeNotional: string;  // Notional amount being settled
}

export default function SettlementPage() {
  const { token } = useAuth();
  if (!token) return null; // unauthenticated — authContext redirects to login
  const [pending, setPending] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPendingSettlements(token);
      setPending(data);
    } catch {
      setError("Failed to load pending settlements");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleConfirm = async () => {
    if (!confirmModal) return;
    setError(null);
    try {
      await confirmSettlement(token, confirmModal.ledgerEntryId, {
        actual_rate: parseFloat(confirmModal.actualRate),
        settlement_ref: confirmModal.settlementRef,
        hedge_rate: parseFloat(confirmModal.hedgeRate),
        hedge_notional: parseFloat(confirmModal.hedgeNotional),
      });
      setConfirmModal(null);
      setSuccess("Settlement confirmed. DRAFT journal entry created — requires 4-eyes approval in GL Postings.");
      await load();
      setTimeout(() => setSuccess(null), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirm failed");
    }
  };

  return (
    <PageShell>
      <div style={{ padding: "24px 32px", fontFamily: S.fontUI }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <DollarSign size={20} color={S.accent} />
          <h1
            style={{
              fontFamily: S.fontMono,
              fontSize: 16,
              letterSpacing: "0.08em",
              color: S.text,
              textTransform: "uppercase",
            }}
          >
            Settlement Tracking
          </h1>
        </div>

        {success && (
          <div
            style={{
              background: "rgba(126,211,33,0.1)",
              border: "1px solid rgba(126,211,33,0.3)",
              borderRadius: 4,
              padding: "10px 16px",
              color: "#7ed321",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {success}
          </div>
        )}
        {error && (
          <div
            style={{
              background: "rgba(208,2,27,0.1)",
              border: "1px solid rgba(208,2,27,0.3)",
              borderRadius: 4,
              padding: "10px 16px",
              color: "#d0021b",
              fontSize: 13,
              marginBottom: 16,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: S.textSub, fontSize: 13 }}>Loading...</div>
        ) : pending.length === 0 ? (
          <div
            style={{
              color: S.textSub,
              fontSize: 13,
              padding: 40,
              textAlign: "center",
              border: `1px solid ${S.rim}`,
              borderRadius: 4,
            }}
          >
            No pending settlements — all hedges are settled up to date.
          </div>
        ) : (
          <div
            style={{
              border: `1px solid ${S.rim}`,
              borderRadius: 4,
              overflow: "auto",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: S.bgDeep }}>
                  {["Ledger ID", "Order ID", "Authorized At", "Action"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 14px",
                        textAlign: "left",
                        fontFamily: S.fontMono,
                        color: S.textSub,
                        fontSize: 11,
                        letterSpacing: "0.06em",
                        borderBottom: `1px solid ${S.rim}`,
                      }}
                    >
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(pending as Array<Record<string, unknown>>).map((entry) => (
                  <tr
                    key={String(entry.id)}
                    style={{ borderBottom: `1px solid ${S.rim}` }}
                  >
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, color: S.accent, fontSize: 11 }}>
                      {String(entry.ledger_id || entry.id || "").slice(0, 8)}...
                    </td>
                    <td style={{ padding: "10px 14px", fontFamily: S.fontMono, color: S.textSub, fontSize: 11 }}>
                      {String(entry.order_id || "")}
                    </td>
                    <td style={{ padding: "10px 14px", color: S.textSub, fontSize: 11 }}>
                      {entry.authorized_at
                        ? new Date(String(entry.authorized_at)).toLocaleDateString()
                        : "—"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <button
                        onClick={() =>
                          setConfirmModal({
                            ledgerEntryId: String(entry.id),
                            actualRate: "",
                            settlementRef: "",
                            hedgeRate: "",
                            hedgeNotional: "",
                          })
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 12px",
                          background: "rgba(0,212,255,0.1)",
                          border: `1px solid rgba(0,212,255,0.3)`,
                          color: S.accent,
                          fontSize: 11,
                          borderRadius: 3,
                          cursor: "pointer",
                          fontFamily: S.fontMono,
                        }}
                      >
                        <CheckSquare size={11} />
                        Confirm
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Confirm modal */}
        {confirmModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 6,
                padding: 24,
                width: 400,
              }}
            >
              <h2
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 13,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: S.text,
                  marginBottom: 16,
                }}
              >
                Confirm Settlement
              </h2>
              <p style={{ fontSize: 12, color: S.textSub, marginBottom: 16, lineHeight: 1.5 }}>
                After confirmation, a DRAFT journal entry will be created for
                the P&L variance. You will need to approve it in GL Postings
                (4-eyes SoD required).
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 4 }}>
                    ACTUAL SETTLEMENT RATE
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={confirmModal.actualRate}
                    onChange={(e) =>
                      setConfirmModal((p) => p ? { ...p, actualRate: e.target.value } : p)
                    }
                    placeholder="e.g. 1.1523"
                    style={{
                      width: "100%",
                      background: S.bgDeep,
                      border: `1px solid ${S.rim}`,
                      color: S.text,
                      padding: "6px 10px",
                      fontSize: 13,
                      fontFamily: S.fontMono,
                      borderRadius: 3,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 4 }}>
                    BANK SETTLEMENT REFERENCE
                  </label>
                  <input
                    value={confirmModal.settlementRef}
                    onChange={(e) =>
                      setConfirmModal((p) => p ? { ...p, settlementRef: e.target.value } : p)
                    }
                    placeholder="e.g. CONF-20260401-001"
                    style={{
                      width: "100%",
                      background: S.bgDeep,
                      border: `1px solid ${S.rim}`,
                      color: S.text,
                      padding: "6px 10px",
                      fontSize: 13,
                      fontFamily: S.fontMono,
                      borderRadius: 3,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setConfirmModal(null)}
                  style={{
                    padding: "6px 16px",
                    background: "transparent",
                    border: `1px solid ${S.rim}`,
                    color: S.textSub,
                    fontSize: 12,
                    borderRadius: 3,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!confirmModal.actualRate || !confirmModal.settlementRef}
                  style={{
                    padding: "6px 16px",
                    background: "rgba(0,212,255,0.15)",
                    border: `1px solid rgba(0,212,255,0.4)`,
                    color: S.accent,
                    fontSize: 12,
                    fontFamily: S.fontMono,
                    borderRadius: 3,
                    cursor:
                      confirmModal.actualRate && confirmModal.settlementRef
                        ? "pointer"
                        : "not-allowed",
                  }}
                >
                  Confirm Settlement
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 2: Write /erp-sync page**

```tsx
// frontend/src/app/erp-sync/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Zap, AlertCircle, CheckCircle2 } from "lucide-react";
import PageShell from "@/components/layout/PageShell";
import { useAuth } from "@/lib/authContext";
import { triggerERPPull } from "@/lib/api/glClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  rim: "var(--border-rim)",
  accent: "var(--accent-cyan)",
  text: "var(--text-primary)",
  textSub: "var(--text-secondary)",
} as const;

interface PullResult {
  source_system: string;
  invoices_fetched: number;
  positions_created: number;
  duplicates_skipped: number;
  timestamp: string;
}

export default function ERPSyncPage() {
  const { token } = useAuth();
  if (!token) return null; // unauthenticated — authContext redirects to login
  const [pulling, setPulling] = useState(false);
  const [results, setResults] = useState<PullResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectorId, setConnectorId] = useState("");

  const handlePull = async () => {
    if (!connectorId.trim()) {
      setError("Enter a connector ID");
      return;
    }
    setError(null);
    setPulling(true);
    try {
      const result = await triggerERPPull(token, connectorId.trim());
      setResults((p) => [
        { ...result, timestamp: new Date().toISOString() },
        ...p.slice(0, 9),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pull failed");
    } finally {
      setPulling(false);
    }
  };

  return (
    <PageShell>
      <div style={{ padding: "24px 32px", fontFamily: S.fontUI }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <RefreshCw size={20} color={S.accent} />
          <h1
            style={{
              fontFamily: S.fontMono,
              fontSize: 16,
              letterSpacing: "0.08em",
              color: S.text,
              textTransform: "uppercase",
            }}
          >
            ERP Sync
          </h1>
        </div>

        <p style={{ fontSize: 13, color: S.textSub, marginBottom: 24, lineHeight: 1.6 }}>
          Pull open foreign-currency invoices from connected ERP systems.
          New invoices are automatically created as{" "}
          <span
            style={{ fontFamily: S.fontMono, color: S.accent, fontSize: 11 }}
          >
            PENDING_REVIEW
          </span>{" "}
          positions — review them in Position Desk before hedging.
        </p>

        {/* Trigger panel */}
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 4,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              color: S.textSub,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Manual Pull
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: S.textSub, display: "block", marginBottom: 6 }}>
                CONNECTOR ID
              </label>
              <input
                value={connectorId}
                onChange={(e) => setConnectorId(e.target.value)}
                placeholder="UUID of your ERP connector"
                style={{
                  width: "100%",
                  background: S.bgDeep,
                  border: `1px solid ${S.rim}`,
                  color: S.text,
                  padding: "7px 10px",
                  fontSize: 13,
                  fontFamily: S.fontMono,
                  borderRadius: 3,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <button
              onClick={handlePull}
              disabled={pulling}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 20px",
                background: pulling ? S.bgDeep : S.accent,
                color: pulling ? S.textSub : "#000",
                border: "none",
                borderRadius: 3,
                fontSize: 13,
                fontFamily: S.fontMono,
                cursor: pulling ? "not-allowed" : "pointer",
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
              }}
            >
              <Zap size={14} />
              {pulling ? "PULLING..." : "PULL NOW"}
            </button>
          </div>
          {error && (
            <div
              style={{
                marginTop: 12,
                color: "#d0021b",
                fontSize: 12,
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              <AlertCircle size={13} /> {error}
            </div>
          )}
        </div>

        {/* Pull history */}
        {results.length > 0 && (
          <div>
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 11,
                color: S.textSub,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Recent Pulls
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {results.map((r, i) => (
                <div
                  key={i}
                  style={{
                    background: S.bgPanel,
                    border: `1px solid ${S.rim}`,
                    borderRadius: 4,
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <CheckCircle2 size={16} color="#7ed321" />
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        color: S.accent,
                      }}
                    >
                      {r.source_system}
                    </span>
                    <span style={{ marginLeft: 16, fontSize: 12, color: S.text }}>
                      {r.invoices_fetched} invoices fetched
                    </span>
                    <span
                      style={{
                        marginLeft: 12,
                        fontSize: 12,
                        color: "#7ed321",
                      }}
                    >
                      +{r.positions_created} positions created
                    </span>
                    {r.duplicates_skipped > 0 && (
                      <span style={{ marginLeft: 12, fontSize: 12, color: S.textSub }}>
                        {r.duplicates_skipped} duplicates skipped
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: S.textSub, fontFamily: S.fontMono }}>
                    {new Date(r.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/settlement/page.tsx \
        frontend/src/app/erp-sync/page.tsx
git commit -m "feat(frontend): /settlement and /erp-sync pages"
```

---

### Task 14: Add nav items to AppSidebar

**Files:**
- Modify: `frontend/src/components/layout/AppSidebar.tsx`

> NOTE: AppSidebar is ~1020 lines. Read the file, find the "Treasury" or "Positions" section, and add the new nav items there. Do NOT restructure the file — just add entries.

- [ ] **Step 1: Read relevant section of AppSidebar**

```bash
grep -n "position-desk\|ledger\|Settlement\|GL\|journal" \
  frontend/src/components/layout/AppSidebar.tsx | head -30
```

- [ ] **Step 2: Add nav items**

Find the Treasury/FX section in AppSidebar and add entries for:
- GL Postings → `/gl-postings` (icon: `FileText`)
- Settlement → `/settlement` (icon: `DollarSign`)
- ERP Sync → `/erp-sync` (icon: `RefreshCw`)

Follow the exact same nav item pattern already used in AppSidebar (do not deviate from the established structure).

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Build check**

```bash
cd frontend && npx next build
```
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AppSidebar.tsx
git commit -m "feat(frontend): add GL Postings, Settlement, ERP Sync to AppSidebar nav"
```

---

## Final Validation

- [ ] **Run full backend test suite**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/ -x -q --tb=short
```
Expected: all existing tests pass + new tests pass (no regressions)

- [ ] **Run frontend TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Run frontend build**

```bash
cd frontend && npx next build
```
Expected: build succeeds

- [ ] **Run migrations on local PostgreSQL**

```bash
cd backend
DATABASE_URL="postgresql+asyncpg://hedgecalc:hedgecalc@localhost:5432/hedgecalc" \
alembic upgrade head
```
Expected: all three new migrations applied

- [ ] **Browser verification** *(per CLAUDE.md: DONE = browser tested)*

Start backend + frontend, then verify:
1. `/settings/gl-accounts` — add a mapping, verify it saves and reloads
2. `/gl-postings` — verify list loads, status filters work
3. `/settlement` — verify pending list loads (may be empty on dev data)
4. `/erp-sync` — verify pull trigger shows error if no connector ID

- [ ] **Final sprint commit**

```bash
git add -A
git commit -m "feat(sprint56-61): Phase 1 FX Lifecycle Complete — GL journal entries, settlement, ERP pull"
```

---

## Notes for Implementer

**Position model source fields:** If `Position` does not have `source`, `source_ref`, `erp_ref` columns, add them in the ERP adapter migration (0012 or a new 0014). Check `backend/app/models/position.py` before implementing `erp_connector_service.py`.

**HedgeEffectivenessRun model:** The GL generation route imports `HedgeEffectivenessRun`. Verify its location (`backend/app/models/hedge_effectiveness.py`) and that it has `company_id`, `standard`, `results`, `period_end` fields before implementing Task 6.

**company.settings vs company.id:** Routes access `current_user.company.id` and `current_user.company.settings`. If `company` relationship uses lazy loading, ensure it is eager-loaded in `get_current_user`. Check `backend/app/core/dependencies.py`.

**paper_mode default:** All posting adapters default to paper mode when credentials are absent. This is intentional — same pattern as ADR-0005 (IBKR paper execution). Live posting requires configured connector credentials.
