# Treasury Suite Phase 2d — Bank Statement Import Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import bank statement files (MT940, CAMT.053, BAI2), parse them into a common structure, deduplicate by content hash, and persist as BankStatement + BankTransaction records.

**Architecture:** Three pure-function parsers producing a common `ParsedStatement` dataclass, one import service with deduplication, one route file, two new DB models, one migration. Follows Phase 2a/2b/2c patterns: AsyncMock unit tests, tenant-scoped queries, `dashboardFetch`-based frontend, WORM audit trail via existing `cash_audit_events`.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x async, Alembic raw SQL migration, Next.js 15 App Router, TypeScript 5, lucide-react, IBM Plex fonts.

---

## Pre-Flight Checks

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
BANK_ACCOUNT_ENC_KEY="test-bank-enc-key-at-least-32-bytes-long!!" \
python -m pytest tests/ --override-ini="addopts=" -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
# Expected: ~4929 passed, 0 failed

cd frontend && npx tsc --noEmit
# Expected: no output (clean)
```

---

## File Map

**New backend files:**
| File | Responsibility |
|------|----------------|
| `backend/app/models/bank_statement.py` | Two models: `BankStatement` (imported file record), `BankTransaction` (individual transaction lines) |
| `backend/migrations/versions/0024_bank_statements.py` | Both tables + indexes + unique constraint on source_hash |
| `backend/app/services/parsers/__init__.py` | Package init |
| `backend/app/services/parsers/statement_types.py` | `ParsedTransaction` and `ParsedStatement` dataclasses — common interface |
| `backend/app/services/parsers/mt940_parser.py` | Pure-function MT940 parser |
| `backend/app/services/parsers/camt053_parser.py` | Pure-function CAMT.053 (ISO 20022 XML) parser |
| `backend/app/services/parsers/bai2_parser.py` | Pure-function BAI2 parser |
| `backend/app/services/statement_service.py` | Import pipeline: detect format, parse, dedup, persist, audit |
| `backend/app/api/routes/v1_cash_statements.py` | 5 endpoints under `/v1/cash/statements/*` |
| `backend/tests/test_mt940_parser.py` | MT940 parser tests |
| `backend/tests/test_camt053_parser.py` | CAMT.053 parser tests |
| `backend/tests/test_bai2_parser.py` | BAI2 parser tests |
| `backend/tests/test_statement_service.py` | Service-layer tests with AsyncMock |
| `backend/tests/test_v1_statements_routes.py` | Route tests via httpx AsyncClient |

**Modified backend files:**
| File | Change |
|------|--------|
| `backend/app/schemas_v1/cash.py` | Add 3 statement schemas |
| `backend/app/api/router.py` | Register `v1_cash_statements_router` |
| `backend/app/models/cash.py` | Add `STATEMENT_IMPORTED` to `CashAuditEventType` enum |

**Modified frontend files:**
| File | Change |
|------|--------|
| `frontend/src/lib/api/cashClient.ts` | Add statement interfaces + 4 API functions |

---

## Chunk 1: Data Layer

### Task 1: BankStatement and BankTransaction Models + Audit Enum

**Context:** Two new ORM models following the pattern of `cash_forecast.py`. BankStatement holds imported file metadata with a source_hash for deduplication. BankTransaction holds individual transaction lines.

**Files:**
- Create: `backend/app/models/bank_statement.py`
- Modify: `backend/app/models/cash.py` (add 1 enum value)

- [ ] **Step 1: Create the models file**

```python
# backend/app/models/bank_statement.py
"""
Bank statement import models.

BankStatement   — one row per imported statement file (dedup by source_hash)
BankTransaction — one row per transaction line in the statement
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class BankStatement(Base):
    """An imported bank statement file."""
    __tablename__ = "bank_statements"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    statement_date: Mapped[date] = mapped_column(Date, nullable=False)
    opening_balance: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    closing_balance: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    format: Mapped[str] = mapped_column(String(16), nullable=False)  # MT940, CAMT053, BAI2
    source_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    transaction_count: Mapped[int] = mapped_column(Integer, nullable=False)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class BankTransaction(Base):
    """A single transaction line from an imported bank statement."""
    __tablename__ = "bank_transactions"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    statement_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    tx_date: Mapped[date] = mapped_column(Date, nullable=False)
    value_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    direction: Mapped[str] = mapped_column(String(6), nullable=False)  # DEBIT or CREDIT
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    counterparty: Mapped[str | None] = mapped_column(String(256), nullable=True)
    tx_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    reconciliation_status: Mapped[str] = mapped_column(String(16), nullable=False, default="UNMATCHED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
```

- [ ] **Step 2: Add audit event type**

In `backend/app/models/cash.py`, add after `NETTING_EXECUTED`:

```python
    STATEMENT_IMPORTED = "STATEMENT_IMPORTED"
```

- [ ] **Step 3: Verify imports work**

```bash
cd backend
python -c "from app.models.bank_statement import BankStatement, BankTransaction; print('OK')"
python -c "from app.models.cash import CashAuditEventType; print(CashAuditEventType.STATEMENT_IMPORTED.value)"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/bank_statement.py backend/app/models/cash.py
git commit -m "feat(phase2d): BankStatement + BankTransaction models, STATEMENT_IMPORTED audit enum"
```

---

### Task 2: Alembic Migration 0024

**Files:**
- Create: `backend/migrations/versions/0024_bank_statements.py`

- [ ] **Step 1: Create the migration file**

```python
# backend/migrations/versions/0024_bank_statements.py
"""bank_statements and bank_transactions tables

Revision ID: 0024
Revises: 0023
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS bank_statements (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id          UUID NOT NULL,
        account_id          UUID NOT NULL,
        statement_date      DATE NOT NULL,
        opening_balance     NUMERIC(20,6) NOT NULL,
        closing_balance     NUMERIC(20,6) NOT NULL,
        currency            VARCHAR(3) NOT NULL,
        format              VARCHAR(16) NOT NULL
                            CHECK (format IN ('MT940', 'CAMT053', 'BAI2')),
        source_hash         VARCHAR(128) NOT NULL UNIQUE,
        transaction_count   INTEGER NOT NULL,
        filename            VARCHAR(255),
        created_by          UUID NOT NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_bank_statements_company ON bank_statements(company_id);
    CREATE INDEX IF NOT EXISTS ix_bank_statements_account ON bank_statements(account_id);
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS bank_transactions (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        statement_id            UUID NOT NULL REFERENCES bank_statements(id),
        account_id              UUID NOT NULL,
        company_id              UUID NOT NULL,
        tx_date                 DATE NOT NULL,
        value_date              DATE,
        amount                  NUMERIC(20,6) NOT NULL,
        currency                VARCHAR(3) NOT NULL,
        direction               VARCHAR(6) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
        description             VARCHAR(512),
        reference               VARCHAR(128),
        counterparty            VARCHAR(256),
        tx_code                 VARCHAR(16),
        reconciliation_status   VARCHAR(16) NOT NULL DEFAULT 'UNMATCHED'
                                CHECK (reconciliation_status IN ('UNMATCHED', 'MATCHED', 'EXCEPTION')),
        created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_bank_transactions_statement ON bank_transactions(statement_id);
    CREATE INDEX IF NOT EXISTS ix_bank_transactions_account ON bank_transactions(account_id);
    CREATE INDEX IF NOT EXISTS ix_bank_transactions_company ON bank_transactions(company_id);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS bank_transactions;")
    op.execute("DROP TABLE IF EXISTS bank_statements;")
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/versions/0024_bank_statements.py
git commit -m "feat(phase2d): Alembic migration 0024 — bank_statements + bank_transactions"
```

---

## Chunk 2: Parsers

### Task 3: Common Types + MT940 Parser + Tests

**Context:** `ParsedStatement` and `ParsedTransaction` dataclasses define the common interface. MT940 is a line-based SWIFT format. The parser is a pure function — zero DB, zero side effects.

**Files:**
- Create: `backend/app/services/parsers/__init__.py`
- Create: `backend/app/services/parsers/statement_types.py`
- Create: `backend/app/services/parsers/mt940_parser.py`
- Create: `backend/tests/test_mt940_parser.py`

- [ ] **Step 1: Create the parsers package and common types**

```python
# backend/app/services/parsers/__init__.py
```

```python
# backend/app/services/parsers/statement_types.py
"""Common dataclasses for parsed bank statement data."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal


@dataclass
class ParsedTransaction:
    tx_date: date
    value_date: date | None
    amount: Decimal
    direction: str  # "DEBIT" or "CREDIT"
    description: str = ""
    reference: str = ""
    counterparty: str = ""
    tx_code: str = ""


@dataclass
class ParsedStatement:
    account_identifier: str  # IBAN or account number
    statement_date: date
    opening_balance: Decimal
    closing_balance: Decimal
    currency: str
    transactions: list[ParsedTransaction] = field(default_factory=list)
```

- [ ] **Step 2: Write the MT940 parser tests**

```python
# backend/tests/test_mt940_parser.py
"""Pure-function tests for the MT940 bank statement parser.

No DB, no mocks, no async — just input → output verification.
"""
from datetime import date
from decimal import Decimal
import pytest


SAMPLE_MT940 = """\
{1:F01BANKBEBB0000000000}{2:O9400000000000BANKBEBB0000000000000000000000N}{4:
:20:STMT202604
:25:BE68539007547034
:28C:1/1
:60F:C260401EUR1000000,00
:61:2604010401C50000,00N051NONREF
:86:Payment from Client ABC
:61:2604020402D12000,00N020NONREF
:86:Supplier payment XYZ Corp
:62F:C260402EUR1038000,00
-}
"""

SAMPLE_MT940_MULTI = """\
{1:F01BANKBEBB0000000000}{2:O9400000000000BANKBEBB0000000000000000000000N}{4:
:20:STMT1
:25:DE89370400440532013000
:28C:1/1
:60F:C260401EUR500000,00
:61:2604010401C10000,00N051NONREF
:86:Deposit
:62F:C260401EUR510000,00
-}{1:F01BANKBEBB0000000000}{2:O9400000000000BANKBEBB0000000000000000000000N}{4:
:20:STMT2
:25:DE89370400440532013000
:28C:2/1
:60F:C260401EUR510000,00
:62F:C260401EUR510000,00
-}
"""


def test_parse_single_statement():
    """Parse a simple MT940 with 2 transactions."""
    from app.services.parsers.mt940_parser import parse_mt940

    results = parse_mt940(SAMPLE_MT940)
    assert len(results) == 1
    stmt = results[0]
    assert stmt.account_identifier == "BE68539007547034"
    assert stmt.currency == "EUR"
    assert stmt.opening_balance == Decimal("1000000.00")
    assert stmt.closing_balance == Decimal("1038000.00")
    assert len(stmt.transactions) == 2

    # First transaction: credit
    tx0 = stmt.transactions[0]
    assert tx0.direction == "CREDIT"
    assert tx0.amount == Decimal("50000.00")
    assert tx0.tx_date == date(2026, 4, 1)
    assert "Client ABC" in tx0.description

    # Second transaction: debit
    tx1 = stmt.transactions[1]
    assert tx1.direction == "DEBIT"
    assert tx1.amount == Decimal("12000.00")
    assert tx1.tx_date == date(2026, 4, 2)


def test_parse_multi_statement():
    """One MT940 file can contain multiple statements."""
    from app.services.parsers.mt940_parser import parse_mt940

    results = parse_mt940(SAMPLE_MT940_MULTI)
    assert len(results) == 2
    assert results[0].opening_balance == Decimal("500000.00")
    assert results[1].opening_balance == Decimal("510000.00")
    assert len(results[0].transactions) == 1
    assert len(results[1].transactions) == 0


def test_parse_reversal_entries():
    """RC (reversal credit) should be treated as DEBIT."""
    from app.services.parsers.mt940_parser import parse_mt940

    mt940 = """\
{4:
:20:REV
:25:NL91ABNA0417164300
:28C:1/1
:60F:C260401EUR100000,00
:61:2604010401RC5000,00N051NONREF
:86:Reversal
:62F:C260401EUR95000,00
-}
"""
    results = parse_mt940(mt940)
    assert len(results) == 1
    tx = results[0].transactions[0]
    assert tx.direction == "DEBIT"
    assert tx.amount == Decimal("5000.00")


def test_parse_empty_content():
    """Empty or whitespace content returns empty list."""
    from app.services.parsers.mt940_parser import parse_mt940

    assert parse_mt940("") == []
    assert parse_mt940("   \n  ") == []
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_mt940_parser.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 4: Write the MT940 parser**

```python
# backend/app/services/parsers/mt940_parser.py
"""
Pure-function MT940 (SWIFT) bank statement parser.

Deterministic. No DB access. No side effects.
Takes raw MT940 content → returns list of ParsedStatement.
"""
from __future__ import annotations

import re
from datetime import date
from decimal import Decimal

from app.services.parsers.statement_types import ParsedStatement, ParsedTransaction


def parse_mt940(content: str) -> list[ParsedStatement]:
    """Parse MT940 content into a list of ParsedStatement objects.

    One MT940 file may contain multiple statements separated by '-}'.
    """
    content = content.strip()
    if not content:
        return []

    # Split into statement blocks — each ends with '-}'
    # Remove SWIFT envelope headers {1:...}{2:...}{3:...}{4:\n...-}
    blocks = re.split(r"-\}", content)
    statements: list[ParsedStatement] = []

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        # Extract the message body after {4:\n
        match = re.search(r"\{4:\s*\n?(.*)", block, re.DOTALL)
        body = match.group(1) if match else block

        stmt = _parse_block(body)
        if stmt:
            statements.append(stmt)

    return statements


def _parse_block(body: str) -> ParsedStatement | None:
    """Parse a single MT940 statement block."""
    lines = body.split("\n")
    account = ""
    currency = "EUR"
    opening = Decimal("0")
    closing = Decimal("0")
    stmt_date = date.today()
    transactions: list[ParsedTransaction] = []
    current_tx: dict | None = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if line.startswith(":25:"):
            account = line[4:].strip()

        elif line.startswith(":60F:") or line.startswith(":60M:"):
            raw = line[5:]
            currency = raw[1:4] if len(raw) > 4 else "EUR"
            opening = _parse_amount(raw[4:]) if len(raw) > 4 else Decimal("0")

        elif line.startswith(":62F:") or line.startswith(":62M:"):
            raw = line[5:]
            currency = raw[1:4] if len(raw) > 4 else currency
            closing = _parse_amount(raw[4:]) if len(raw) > 4 else Decimal("0")
            # Extract statement date from closing balance
            date_str = raw[4:10] if len(raw) >= 10 else ""
            if date_str and date_str.isdigit():
                stmt_date = _parse_date(date_str)

        elif line.startswith(":61:"):
            # Flush previous transaction
            if current_tx:
                transactions.append(_build_tx(current_tx))
            current_tx = _parse_tx_line(line[4:])

        elif line.startswith(":86:"):
            if current_tx:
                current_tx["description"] = line[4:].strip()

    # Flush last transaction
    if current_tx:
        transactions.append(_build_tx(current_tx))

    if not account:
        return None

    return ParsedStatement(
        account_identifier=account,
        statement_date=stmt_date,
        opening_balance=opening,
        closing_balance=closing,
        currency=currency,
        transactions=transactions,
    )


def _parse_tx_line(raw: str) -> dict:
    """Parse a :61: transaction line.

    Format: YYMMDDYYMMDD[C|D|RC|RD]Amount[N]TypeRef
    Example: 2604010401C50000,00N051NONREF
    """
    # Date: first 6 chars (YYMMDD)
    tx_date = _parse_date(raw[:6]) if len(raw) >= 6 else date.today()

    # Value date: next 4 chars (MMDD) — optional
    offset = 6
    value_date = None
    if len(raw) > 10 and raw[6:10].isdigit():
        value_date = _parse_date(raw[:2] + raw[6:10])
        offset = 10

    # Direction: C, D, RC, RD
    direction = "CREDIT"
    if raw[offset:offset + 2] == "RC":
        direction = "DEBIT"  # reversal credit = debit
        offset += 2
    elif raw[offset:offset + 2] == "RD":
        direction = "CREDIT"  # reversal debit = credit
        offset += 2
    elif raw[offset] == "D":
        direction = "DEBIT"
        offset += 1
    elif raw[offset] == "C":
        direction = "CREDIT"
        offset += 1

    # Amount: up to next N or end
    amount_match = re.match(r"([\d,]+)", raw[offset:])
    amount = Decimal("0")
    ref = ""
    if amount_match:
        amount = _parse_amount(amount_match.group(1))
        offset += amount_match.end()

    # Transaction type + reference (after N)
    rest = raw[offset:]
    type_match = re.match(r"N(\w{3})(.*)", rest)
    tx_code = ""
    if type_match:
        tx_code = type_match.group(1)
        ref = type_match.group(2).strip()

    return {
        "tx_date": tx_date,
        "value_date": value_date,
        "amount": amount,
        "direction": direction,
        "reference": ref,
        "tx_code": tx_code,
        "description": "",
    }


def _build_tx(data: dict) -> ParsedTransaction:
    return ParsedTransaction(
        tx_date=data["tx_date"],
        value_date=data.get("value_date"),
        amount=data["amount"],
        direction=data["direction"],
        description=data.get("description", ""),
        reference=data.get("reference", ""),
        counterparty="",
        tx_code=data.get("tx_code", ""),
    )


def _parse_date(s: str) -> date:
    """Parse YYMMDD date string."""
    if len(s) == 6:
        yy, mm, dd = int(s[:2]), int(s[2:4]), int(s[4:6])
        year = 2000 + yy
        return date(year, mm, dd)
    return date.today()


def _parse_amount(s: str) -> Decimal:
    """Parse MT940 amount: uses comma as decimal separator."""
    s = s.strip().replace(",", ".")
    try:
        return Decimal(s)
    except Exception:
        return Decimal("0")
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_mt940_parser.py -v
```

Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/parsers/ backend/tests/test_mt940_parser.py
git commit -m "feat(phase2d): ParsedStatement types + MT940 parser + 4 tests"
```

---

### Task 4: CAMT.053 Parser + Tests

**Context:** ISO 20022 XML format. Parse with `xml.etree.ElementTree` (stdlib). Strip namespace for compatibility across CAMT versions.

**Files:**
- Create: `backend/app/services/parsers/camt053_parser.py`
- Create: `backend/tests/test_camt053_parser.py`

- [ ] **Step 1: Write the CAMT.053 parser tests**

```python
# backend/tests/test_camt053_parser.py
"""Pure-function tests for the CAMT.053 bank statement parser."""
from datetime import date
from decimal import Decimal
import pytest


SAMPLE_CAMT053 = """\
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Acct>
        <Id><IBAN>DE89370400440532013000</IBAN></Id>
        <Ccy>EUR</Ccy>
      </Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">500000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="EUR">535000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-01</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="EUR">50000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-04-01</Dt></BookgDt>
        <ValDt><Dt>2026-04-01</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>INV-2026-001</EndToEndId></Refs>
            <RmtInf><Ustrd>Payment from Client ABC</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">15000.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-04-01</Dt></BookgDt>
        <ValDt><Dt>2026-04-02</Dt></ValDt>
        <NtryDtls>
          <TxDtls>
            <Refs><EndToEndId>SUP-2026-042</EndToEndId></Refs>
            <RmtInf><Ustrd>Supplier payment</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>
"""


def test_parse_camt053_basic():
    """Parse a CAMT.053 XML with 2 entries."""
    from app.services.parsers.camt053_parser import parse_camt053

    results = parse_camt053(SAMPLE_CAMT053)
    assert len(results) == 1
    stmt = results[0]
    assert stmt.account_identifier == "DE89370400440532013000"
    assert stmt.currency == "EUR"
    assert stmt.opening_balance == Decimal("500000.00")
    assert stmt.closing_balance == Decimal("535000.00")
    assert len(stmt.transactions) == 2

    tx0 = stmt.transactions[0]
    assert tx0.direction == "CREDIT"
    assert tx0.amount == Decimal("50000.00")
    assert tx0.reference == "INV-2026-001"
    assert "Client ABC" in tx0.description

    tx1 = stmt.transactions[1]
    assert tx1.direction == "DEBIT"
    assert tx1.amount == Decimal("15000.00")
    assert tx1.value_date == date(2026, 4, 2)


def test_parse_camt053_account_number_fallback():
    """When IBAN is missing, fall back to Othr/Id."""
    from app.services.parsers.camt053_parser import parse_camt053

    xml = """\
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <Stmt>
      <Acct><Id><Othr><Id>123456789</Id></Othr></Id><Ccy>USD</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="USD">100000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="USD">100000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-04-01</Dt></Dt>
      </Bal>
    </Stmt>
  </BkToCstmrStmt>
</Document>
"""
    results = parse_camt053(xml)
    assert len(results) == 1
    assert results[0].account_identifier == "123456789"
    assert results[0].currency == "USD"


def test_parse_camt053_empty():
    """Empty content returns empty list."""
    from app.services.parsers.camt053_parser import parse_camt053

    assert parse_camt053("") == []
```

- [ ] **Step 2: Write the CAMT.053 parser**

```python
# backend/app/services/parsers/camt053_parser.py
"""
Pure-function CAMT.053 (ISO 20022) bank statement parser.

Deterministic. No DB access. No side effects.
Uses xml.etree.ElementTree (stdlib). Strips namespace for cross-version compat.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import date
from decimal import Decimal

from app.services.parsers.statement_types import ParsedStatement, ParsedTransaction


def parse_camt053(content: str) -> list[ParsedStatement]:
    """Parse CAMT.053 XML content into a list of ParsedStatement objects."""
    content = content.strip()
    if not content:
        return []

    # Strip namespace prefixes for compatibility
    cleaned = re.sub(r'\sxmlns="[^"]*"', "", content, count=1)

    try:
        root = ET.fromstring(cleaned)
    except ET.ParseError:
        return []

    statements: list[ParsedStatement] = []

    for stmt_el in root.iter("Stmt"):
        stmt = _parse_stmt(stmt_el)
        if stmt:
            statements.append(stmt)

    return statements


def _parse_stmt(stmt_el: ET.Element) -> ParsedStatement | None:
    """Parse a single <Stmt> element."""
    # Account identification
    account_id = ""
    acct = stmt_el.find(".//Acct/Id")
    if acct is not None:
        iban = acct.find("IBAN")
        if iban is not None and iban.text:
            account_id = iban.text.strip()
        else:
            othr = acct.find("Othr/Id")
            if othr is not None and othr.text:
                account_id = othr.text.strip()

    # Currency
    ccy_el = stmt_el.find(".//Acct/Ccy")
    currency = ccy_el.text.strip() if ccy_el is not None and ccy_el.text else "EUR"

    # Balances
    opening = Decimal("0")
    closing = Decimal("0")
    stmt_date = date.today()

    for bal in stmt_el.findall("Bal"):
        bal_type = ""
        cd = bal.find("Tp/CdOrPrtry/Cd")
        if cd is not None and cd.text:
            bal_type = cd.text.strip()

        amt_el = bal.find("Amt")
        if amt_el is not None and amt_el.text:
            amt = Decimal(amt_el.text.strip())
            cdt_dbt = bal.find("CdtDbtInd")
            if cdt_dbt is not None and cdt_dbt.text and cdt_dbt.text.strip() == "DBIT":
                amt = -amt

            if bal_type == "OPBD":
                opening = amt
            elif bal_type == "CLBD":
                closing = amt
                dt_el = bal.find("Dt/Dt")
                if dt_el is not None and dt_el.text:
                    stmt_date = date.fromisoformat(dt_el.text.strip())

    # Transactions
    transactions: list[ParsedTransaction] = []
    for ntry in stmt_el.findall("Ntry"):
        tx = _parse_entry(ntry)
        if tx:
            transactions.append(tx)

    if not account_id:
        return None

    return ParsedStatement(
        account_identifier=account_id,
        statement_date=stmt_date,
        opening_balance=opening,
        closing_balance=closing,
        currency=currency,
        transactions=transactions,
    )


def _parse_entry(ntry: ET.Element) -> ParsedTransaction | None:
    """Parse a single <Ntry> element into a ParsedTransaction."""
    # Amount
    amt_el = ntry.find("Amt")
    if amt_el is None or not amt_el.text:
        return None
    amount = Decimal(amt_el.text.strip())

    # Direction
    cdi = ntry.find("CdtDbtInd")
    direction = "CREDIT"
    if cdi is not None and cdi.text and cdi.text.strip() == "DBIT":
        direction = "DEBIT"

    # Dates
    tx_date = date.today()
    bookg = ntry.find("BookgDt/Dt")
    if bookg is not None and bookg.text:
        tx_date = date.fromisoformat(bookg.text.strip())

    value_date = None
    val = ntry.find("ValDt/Dt")
    if val is not None and val.text:
        value_date = date.fromisoformat(val.text.strip())

    # Details
    description = ""
    reference = ""
    ustrd = ntry.find(".//RmtInf/Ustrd")
    if ustrd is not None and ustrd.text:
        description = ustrd.text.strip()

    e2e = ntry.find(".//Refs/EndToEndId")
    if e2e is not None and e2e.text:
        reference = e2e.text.strip()

    return ParsedTransaction(
        tx_date=tx_date,
        value_date=value_date,
        amount=amount,
        direction=direction,
        description=description,
        reference=reference,
        counterparty="",
        tx_code="",
    )
```

- [ ] **Step 3: Run tests**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_camt053_parser.py -v
```

Expected: 3 passed

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/parsers/camt053_parser.py backend/tests/test_camt053_parser.py
git commit -m "feat(phase2d): CAMT.053 (ISO 20022) parser + 3 tests"
```

---

### Task 5: BAI2 Parser + Tests

**Context:** US banking format. Line-based with record type codes. Continuation records (88) must be concatenated before parsing.

**Files:**
- Create: `backend/app/services/parsers/bai2_parser.py`
- Create: `backend/tests/test_bai2_parser.py`

- [ ] **Step 1: Write the BAI2 parser tests**

```python
# backend/tests/test_bai2_parser.py
"""Pure-function tests for the BAI2 bank statement parser."""
from datetime import date
from decimal import Decimal
import pytest


SAMPLE_BAI2 = """\
01,BANKID,COMPID,260401,0800,1,80,1,2/
02,BANKID,COMPID,1,260401,0800,EUR,2/
03,123456789,,010,500000,,015,500000,/
16,195,50000,,260401,,REF001,Payment from Client/
16,495,12000,,260402,,REF002,Supplier payment/
49,538000,3/
98,538000,1,3/
99,538000,1,3/
"""


def test_parse_bai2_basic():
    """Parse a simple BAI2 file with 2 transactions."""
    from app.services.parsers.bai2_parser import parse_bai2

    results = parse_bai2(SAMPLE_BAI2)
    assert len(results) == 1
    stmt = results[0]
    assert stmt.account_identifier == "123456789"
    assert stmt.opening_balance == Decimal("5000.00")
    assert len(stmt.transactions) == 2

    tx0 = stmt.transactions[0]
    assert tx0.direction == "CREDIT"
    assert tx0.amount == Decimal("500.00")
    assert "Client" in tx0.description

    tx1 = stmt.transactions[1]
    assert tx1.direction == "DEBIT"
    assert tx1.amount == Decimal("120.00")


def test_parse_bai2_continuation():
    """88 continuation records should be concatenated."""
    from app.services.parsers.bai2_parser import parse_bai2

    bai2 = """\
01,BANKID,COMPID,260401,0800,1,80,1,2/
02,BANKID,COMPID,1,260401,0800,USD,2/
03,9876543210,,010,100000,,/
16,195,25000,,260401,,REF001,First part of/
88,a very long description that continues here/
49,125000,2/
98,125000,1,2/
99,125000,1,2/
"""
    results = parse_bai2(bai2)
    assert len(results) == 1
    assert len(results[0].transactions) == 1
    assert "continues here" in results[0].transactions[0].description


def test_parse_bai2_empty():
    """Empty content returns empty list."""
    from app.services.parsers.bai2_parser import parse_bai2

    assert parse_bai2("") == []
```

- [ ] **Step 2: Write the BAI2 parser**

```python
# backend/app/services/parsers/bai2_parser.py
"""
Pure-function BAI2 bank statement parser.

Deterministic. No DB access. No side effects.

BAI2 record types:
  01 = File header, 02 = Group header, 03 = Account header,
  16 = Transaction detail, 49 = Account trailer, 88 = Continuation,
  98 = Group trailer, 99 = File trailer.

BAI2 amounts are in cents (integer). Divide by 100 for actual amount.
Transaction type codes: 100-399 = credits, 400-699 = debits.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.services.parsers.statement_types import ParsedStatement, ParsedTransaction


def parse_bai2(content: str) -> list[ParsedStatement]:
    """Parse BAI2 content into a list of ParsedStatement objects."""
    content = content.strip()
    if not content:
        return []

    # Pre-process: join continuation records (88) to previous lines
    lines = _join_continuations(content.split("\n"))

    statements: list[ParsedStatement] = []
    currency = "USD"
    current_account = ""
    current_opening = Decimal("0")
    transactions: list[ParsedTransaction] = []
    group_date = date.today()

    for line in lines:
        line = line.strip().rstrip("/")
        if not line:
            continue

        fields = line.split(",")
        record_type = fields[0] if fields else ""

        if record_type == "02":
            # Group header — extract date and currency
            if len(fields) >= 7:
                date_str = fields[4] if len(fields) > 4 else ""
                if date_str and len(date_str) == 6:
                    group_date = _parse_date(date_str)
                currency = fields[6] if len(fields) > 6 and fields[6] else "USD"

        elif record_type == "03":
            # Account header — flush previous if exists
            if current_account and transactions:
                statements.append(ParsedStatement(
                    account_identifier=current_account,
                    statement_date=group_date,
                    opening_balance=current_opening,
                    closing_balance=current_opening,  # updated from trailer
                    currency=currency,
                    transactions=list(transactions),
                ))

            current_account = fields[1] if len(fields) > 1 else ""
            transactions = []
            current_opening = Decimal("0")

            # Parse summary balances from field 3 onwards (type_code, amount pairs)
            i = 2
            while i + 1 < len(fields):
                bal_type = fields[i].strip()
                bal_amt = fields[i + 1].strip()
                if bal_type in ("010", "015") and bal_amt:
                    try:
                        current_opening = Decimal(bal_amt) / 100
                    except Exception:
                        pass
                    break
                i += 2

        elif record_type == "16":
            # Transaction detail
            tx = _parse_tx(fields, group_date)
            if tx:
                transactions.append(tx)

        elif record_type == "49":
            # Account trailer — flush current account
            closing = current_opening
            if len(fields) > 1 and fields[1].strip():
                try:
                    closing = Decimal(fields[1].strip()) / 100
                except Exception:
                    pass

            if current_account:
                statements.append(ParsedStatement(
                    account_identifier=current_account,
                    statement_date=group_date,
                    opening_balance=current_opening,
                    closing_balance=closing,
                    currency=currency,
                    transactions=list(transactions),
                ))
            current_account = ""
            transactions = []

    return statements


def _join_continuations(lines: list[str]) -> list[str]:
    """Concatenate 88-continuation records to the previous record."""
    result: list[str] = []
    for line in lines:
        stripped = line.strip().rstrip("/")
        if stripped.startswith("88,"):
            if result:
                # Append continuation text (after "88,") to previous line
                result[-1] = result[-1].rstrip("/") + stripped[3:]
            continue
        result.append(line)
    return result


def _parse_tx(fields: list[str], default_date: date) -> ParsedTransaction | None:
    """Parse a type-16 transaction record.

    Fields: 16, type_code, amount, fund_type, date, time, ref, description
    """
    if len(fields) < 3:
        return None

    type_code = fields[1].strip() if len(fields) > 1 else ""
    amount_str = fields[2].strip() if len(fields) > 2 else "0"

    try:
        amount = Decimal(amount_str) / 100  # BAI2 amounts in cents
    except Exception:
        amount = Decimal("0")

    # Direction from type code: 100-399 = credit, 400-699 = debit
    direction = "CREDIT"
    try:
        code_int = int(type_code)
        if 400 <= code_int <= 699:
            direction = "DEBIT"
    except ValueError:
        pass

    # Date (field 4)
    tx_date = default_date
    if len(fields) > 4 and fields[4].strip():
        date_str = fields[4].strip()
        if len(date_str) == 6:
            tx_date = _parse_date(date_str)

    # Reference (field 6) and description (field 7+)
    reference = fields[6].strip() if len(fields) > 6 else ""
    description = ",".join(fields[7:]).strip() if len(fields) > 7 else ""

    return ParsedTransaction(
        tx_date=tx_date,
        value_date=None,
        amount=amount,
        direction=direction,
        description=description,
        reference=reference,
        counterparty="",
        tx_code=type_code,
    )


def _parse_date(s: str) -> date:
    """Parse YYMMDD date string."""
    try:
        yy, mm, dd = int(s[:2]), int(s[2:4]), int(s[4:6])
        return date(2000 + yy, mm, dd)
    except (ValueError, IndexError):
        return date.today()
```

- [ ] **Step 3: Run tests**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_bai2_parser.py -v
```

Expected: 3 passed

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/parsers/bai2_parser.py backend/tests/test_bai2_parser.py
git commit -m "feat(phase2d): BAI2 parser + 3 tests"
```

---

## Chunk 3: Service + Schemas + Routes

### Task 6: Pydantic Schemas

**Files:**
- Modify: `backend/app/schemas_v1/cash.py` (append at bottom)

- [ ] **Step 1: Append statement schemas**

Add after `NettingSavingsSummary`:

```python


# ── Bank Statements ─────────────────────────────────────────────────

class BankStatementResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    account_id: uuid.UUID
    statement_date: date
    opening_balance: Decimal
    closing_balance: Decimal
    currency: str
    format: str
    transaction_count: int
    filename: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class BankTransactionResponse(BaseModel):
    id: uuid.UUID
    statement_id: uuid.UUID
    account_id: uuid.UUID
    tx_date: date
    value_date: date | None
    amount: Decimal
    currency: str
    direction: str
    description: str | None
    reference: str | None
    counterparty: str | None
    tx_code: str | None
    reconciliation_status: str
    created_at: datetime

    class Config:
        from_attributes = True


class StatementUploadResponse(BaseModel):
    statement: BankStatementResponse
    transaction_count: int
    duplicate: bool = False
```

- [ ] **Step 2: Verify**

```bash
cd backend
python -c "from app.schemas_v1.cash import BankStatementResponse, BankTransactionResponse, StatementUploadResponse; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas_v1/cash.py
git commit -m "feat(phase2d): Pydantic schemas for bank statements + transactions"
```

---

### Task 7: Statement Import Service + Tests

**Files:**
- Create: `backend/app/services/statement_service.py`
- Create: `backend/tests/test_statement_service.py`

- [ ] **Step 1: Write the service tests**

```python
# backend/tests/test_statement_service.py
"""Service-layer tests for statement_service — AsyncMock DB session."""
import uuid
import hashlib
from datetime import date, datetime, UTC
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_detect_format_mt940():
    """detect_format identifies MT940 content."""
    from app.services.statement_service import detect_format
    assert detect_format("{1:F01BANK...") == "MT940"
    assert detect_format(":20:STMT\n:25:ACC") == "MT940"


@pytest.mark.asyncio
async def test_detect_format_camt053():
    """detect_format identifies CAMT.053 XML."""
    from app.services.statement_service import detect_format
    assert detect_format('<?xml version="1.0"?><Document>') == "CAMT053"
    assert detect_format("<Document xmlns=") == "CAMT053"


@pytest.mark.asyncio
async def test_detect_format_bai2():
    """detect_format identifies BAI2 content."""
    from app.services.statement_service import detect_format
    assert detect_format("01,BANKID,COMPID,260401") == "BAI2"


@pytest.mark.asyncio
async def test_import_statement_creates_records():
    """import_statement creates BankStatement + BankTransaction rows."""
    from app.services.statement_service import import_statement

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    account_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    mt940_content = """\
{4:
:20:STMT
:25:BE68539007547034
:28C:1/1
:60F:C260401EUR100000,00
:61:2604010401C5000,00N051REF
:86:Test payment
:62F:C260401EUR105000,00
-}
"""
    # Mock: no existing statement with this hash
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.statement_service.append_event", new_callable=AsyncMock):
        result = await import_statement(
            mock_session, company_id=company_id, account_id=account_id,
            content=mt940_content, filename="test.mt940", created_by=actor_id,
        )

    assert result["duplicate"] is False
    assert result["transaction_count"] == 1
    assert mock_session.add.called
    mock_session.flush.assert_awaited()


@pytest.mark.asyncio
async def test_import_statement_rejects_duplicate():
    """import_statement returns duplicate=True for matching source_hash."""
    from app.services.statement_service import import_statement

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    account_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    content = "some content"

    # Mock: existing statement with this hash
    existing = MagicMock()
    existing.id = uuid.uuid4()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = existing
    mock_session.execute = AsyncMock(return_value=mock_result)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await import_statement(
            mock_session, company_id=company_id, account_id=account_id,
            content=content, filename="dup.mt940", created_by=actor_id,
        )
    assert exc_info.value.status_code == 409
```

- [ ] **Step 2: Write the statement service**

```python
# backend/app/services/statement_service.py
"""
Statement import service — detect format, parse, dedup, persist, audit.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bank_statement import BankStatement, BankTransaction
from app.models.cash import CashAuditEventType
from app.services.cash_audit_service import append_event
from app.services.parsers.mt940_parser import parse_mt940
from app.services.parsers.camt053_parser import parse_camt053
from app.services.parsers.bai2_parser import parse_bai2
from app.services.parsers.statement_types import ParsedStatement


def detect_format(content: str) -> str:
    """Auto-detect statement file format from content."""
    stripped = content.strip()
    if stripped.startswith("<?xml") or stripped.startswith("<Document"):
        return "CAMT053"
    if stripped.startswith("01,"):
        return "BAI2"
    return "MT940"


async def import_statement(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    account_id: uuid.UUID,
    content: str,
    filename: str | None,
    created_by: uuid.UUID,
    format_override: str | None = None,
) -> dict[str, Any]:
    """Full import pipeline: detect → parse → dedup → persist → audit."""
    # 1. Compute source hash for deduplication
    source_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()

    # 2. Check for duplicate
    result = await session.execute(
        select(BankStatement).where(
            BankStatement.source_hash == source_hash,
            BankStatement.company_id == company_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Duplicate statement — file already imported")

    # 3. Detect format and parse
    fmt = format_override or detect_format(content)
    if fmt == "CAMT053":
        parsed_list = parse_camt053(content)
    elif fmt == "BAI2":
        parsed_list = parse_bai2(content)
    else:
        parsed_list = parse_mt940(content)

    if not parsed_list:
        raise HTTPException(status_code=422, detail="No valid statements found in file")

    # 4. Persist — use first parsed statement (most common case: 1 statement per file)
    parsed = parsed_list[0]
    total_tx = sum(len(ps.transactions) for ps in parsed_list)

    stmt = BankStatement(
        company_id=company_id,
        account_id=account_id,
        statement_date=parsed.statement_date,
        opening_balance=float(parsed.opening_balance),
        closing_balance=float(parsed.closing_balance),
        currency=parsed.currency,
        format=fmt,
        source_hash=source_hash,
        transaction_count=total_tx,
        filename=filename,
        created_by=created_by,
    )
    session.add(stmt)
    await session.flush()

    # 5. Persist transactions from all parsed statements
    for ps in parsed_list:
        for tx in ps.transactions:
            bank_tx = BankTransaction(
                statement_id=stmt.id,
                account_id=account_id,
                company_id=company_id,
                tx_date=tx.tx_date,
                value_date=tx.value_date,
                amount=float(tx.amount),
                currency=parsed.currency,
                direction=tx.direction,
                description=tx.description or None,
                reference=tx.reference or None,
                counterparty=tx.counterparty or None,
                tx_code=tx.tx_code or None,
                reconciliation_status="UNMATCHED",
            )
            session.add(bank_tx)

    await session.flush()

    # 6. Audit log
    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.STATEMENT_IMPORTED,
        payload={
            "statement_id": str(stmt.id),
            "format": fmt,
            "transaction_count": total_tx,
            "filename": filename or "",
            "source_hash": source_hash,
        },
        performed_by=created_by,
    )

    return {
        "statement": stmt,
        "transaction_count": total_tx,
        "duplicate": False,
    }


async def list_statements(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    account_id: uuid.UUID | None = None,
) -> list[BankStatement]:
    """List imported statements, optionally filtered by account."""
    stmt = select(BankStatement).where(BankStatement.company_id == company_id)
    if account_id:
        stmt = stmt.where(BankStatement.account_id == account_id)
    stmt = stmt.order_by(BankStatement.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_statement(
    session: AsyncSession,
    *,
    statement_id: uuid.UUID,
    company_id: uuid.UUID,
) -> BankStatement | None:
    """Get a single statement by ID."""
    result = await session.execute(
        select(BankStatement).where(
            BankStatement.id == statement_id,
            BankStatement.company_id == company_id,
        )
    )
    return result.scalar_one_or_none()


async def list_transactions(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    statement_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
) -> list[BankTransaction]:
    """List transactions with optional filters."""
    stmt = select(BankTransaction).where(BankTransaction.company_id == company_id)
    if statement_id:
        stmt = stmt.where(BankTransaction.statement_id == statement_id)
    if account_id:
        stmt = stmt.where(BankTransaction.account_id == account_id)
    if date_from:
        stmt = stmt.where(BankTransaction.tx_date >= date_from)
    if date_to:
        stmt = stmt.where(BankTransaction.tx_date <= date_to)
    if status:
        stmt = stmt.where(BankTransaction.reconciliation_status == status)
    stmt = stmt.order_by(BankTransaction.tx_date.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())
```

- [ ] **Step 3: Run tests**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_statement_service.py -v
```

Expected: 5 passed

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/statement_service.py backend/tests/test_statement_service.py
git commit -m "feat(phase2d): statement import service (detect/parse/dedup/persist) + 5 tests"
```

---

### Task 8: API Routes + Router Registration + Route Tests

**Files:**
- Create: `backend/app/api/routes/v1_cash_statements.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_v1_statements_routes.py`

- [ ] **Step 1: Write route tests**

```python
# backend/tests/test_v1_statements_routes.py
"""Route tests for /v1/cash/statements/* via httpx AsyncClient."""
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
async def test_list_statements():
    """GET /v1/cash/statements returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_statements.list_statements_helper",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/cash/statements/", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_transactions():
    """GET /v1/cash/statements/transactions returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_statements.list_transactions_helper",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/cash/statements/transactions", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Write the route file**

```python
# backend/app/api/routes/v1_cash_statements.py
"""v1 bank statement import — upload, list, transactions."""
import uuid
from datetime import date
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.user import User
from app.schemas_v1.cash import (
    BankStatementResponse, BankTransactionResponse, StatementUploadResponse,
)
from app.services.statement_service import (
    import_statement, list_statements, get_statement, list_transactions,
)

router = APIRouter(prefix="/v1/cash/statements", tags=["cash-statements"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


# ── Module-level helpers for testability ──

async def list_statements_helper(db, *, company_id, account_id):
    return await list_statements(db, company_id=company_id, account_id=account_id)


async def list_transactions_helper(db, *, company_id, account_id, date_from, date_to, status):
    return await list_transactions(db, company_id=company_id, account_id=account_id,
                                   date_from=date_from, date_to=date_to, status=status)


async def import_statement_helper(db, *, company_id, account_id, content, filename, created_by, format_override):
    return await import_statement(db, company_id=company_id, account_id=account_id,
                                  content=content, filename=filename, created_by=created_by,
                                  format_override=format_override)


# ── Routes ──

@router.post("/upload", response_model=StatementUploadResponse, status_code=201)
async def upload_statement(
    file: UploadFile = File(...),
    account_id: uuid.UUID = Form(...),
    format: str | None = Form(default=None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    content = (await file.read()).decode("utf-8", errors="replace")
    result = await import_statement_helper(
        db, company_id=current_user.company_id, account_id=account_id,
        content=content, filename=file.filename, created_by=current_user.id,
        format_override=format,
    )
    await db.commit()
    return result


@router.get("/", response_model=list[BankStatementResponse])
async def get_statements(
    account_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_statements_helper(db, company_id=current_user.company_id, account_id=account_id)


@router.get("/transactions", response_model=list[BankTransactionResponse])
async def get_transactions(
    account_id: uuid.UUID | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_transactions_helper(
        db, company_id=current_user.company_id, account_id=account_id,
        date_from=date_from, date_to=date_to, status=status,
    )


@router.get("/{statement_id}", response_model=BankStatementResponse)
async def get_statement_detail(
    statement_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    stmt = await get_statement(db, statement_id=statement_id, company_id=current_user.company_id)
    if stmt is None:
        raise HTTPException(status_code=404, detail="Statement not found")
    return stmt


@router.get("/{statement_id}/transactions", response_model=list[BankTransactionResponse])
async def get_statement_transactions(
    statement_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_transactions(db, company_id=current_user.company_id, statement_id=statement_id)
```

- [ ] **Step 3: Register the router**

Append to `backend/app/api/router.py` after the netting router:

```python
# Treasury Suite Phase 2d — Bank Statement Import (owns /v1/cash/statements/*)
from app.api.routes.v1_cash_statements import router as v1_cash_statements_router
router.include_router(v1_cash_statements_router)
```

- [ ] **Step 4: Run route tests**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_v1_statements_routes.py -v
```

Expected: 2 passed

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
BANK_ACCOUNT_ENC_KEY="test-bank-enc-key-at-least-32-bytes-long!!" \
python -m pytest tests/ --override-ini="addopts=" -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
```

Expected: ~4946+ passed, 0 failed

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/v1_cash_statements.py backend/app/api/router.py backend/tests/test_v1_statements_routes.py
git commit -m "feat(phase2d): statement API routes (5 endpoints) + router registration + 2 route tests"
```

---

## Chunk 4: Frontend

### Task 9: cashClient.ts Statement Extensions

**Files:**
- Modify: `frontend/src/lib/api/cashClient.ts` (append at bottom)

- [ ] **Step 1: Add statement interfaces and functions**

Append after `getNettingSavings`:

```typescript
// ── Bank Statements ────────────────────────────────────────────────

export interface BankStatementRecord {
  id: string;
  company_id: string;
  account_id: string;
  statement_date: string;
  opening_balance: string;
  closing_balance: string;
  currency: string;
  format: "MT940" | "CAMT053" | "BAI2";
  transaction_count: number;
  filename: string | null;
  created_at: string;
}

export interface BankTransactionRecord {
  id: string;
  statement_id: string;
  account_id: string;
  tx_date: string;
  value_date: string | null;
  amount: string;
  currency: string;
  direction: "DEBIT" | "CREDIT";
  description: string | null;
  reference: string | null;
  counterparty: string | null;
  tx_code: string | null;
  reconciliation_status: "UNMATCHED" | "MATCHED" | "EXCEPTION";
  created_at: string;
}

export async function listStatements(token: string, accountId?: string): Promise<BankStatementRecord[]> {
  const params = accountId ? `?account_id=${accountId}` : "";
  return _fetchJson(`/v1/cash/statements/${params}`, token);
}

export async function getStatementDetail(token: string, id: string): Promise<BankStatementRecord> {
  return _fetchJson(`/v1/cash/statements/${id}`, token);
}

export async function getStatementTransactions(token: string, id: string): Promise<BankTransactionRecord[]> {
  return _fetchJson(`/v1/cash/statements/${id}/transactions`, token);
}

export async function listBankTransactions(
  token: string,
  params?: { account_id?: string; date_from?: string; date_to?: string; status?: string },
): Promise<BankTransactionRecord[]> {
  const q = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    )
  ).toString();
  return _fetchJson(`/v1/cash/statements/transactions${q ? `?${q}` : ""}`, token);
}

export async function uploadStatement(
  token: string,
  file: File,
  accountId: string,
  format?: string,
): Promise<{ statement: BankStatementRecord; transaction_count: number; duplicate: boolean }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("account_id", accountId);
  if (format) formData.append("format", format);

  const res = await dashboardFetch("/v1/cash/statements/upload", token, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json(); if (b?.detail) detail = b.detail; } catch { /* noop */ }
    throw new Error(detail);
  }
  return res.json();
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
git commit -m "feat(phase2d): cashClient statement interfaces + 5 API functions"
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
# Expected: ~4946+ passed, 0 failed

# Frontend type check
cd frontend && npx tsc --noEmit
# Expected: clean
```
