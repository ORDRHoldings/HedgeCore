# Phase 3 Intelligence Tier Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the INTELLIGENCE plan tier with two AI capabilities — a CMD+K natural-language treasury query overlay and an AI report commentary draft button — using the Anthropic API with advisory-only guarantees.

**Architecture:** New `intelligence` tier (level 3 in `PLAN_HIERARCHY`) gates all features. A single `IntelligenceQueryLog` table stores prompt hashes (never raw prompts). Two FastAPI endpoints (`POST /v1/intelligence/query` and `POST /v1/intelligence/commentary`) call `anthropic.AsyncAnthropic` with tenant-scoped context injection and return advisory-only responses. Frontend adds a global CMD+K overlay and a commentary button on the hedge-effectiveness page.

**Tech Stack:** Python `anthropic` SDK, FastAPI, SQLAlchemy async, Next.js 15.5 App Router, TypeScript, lucide-react

---

## Chunk 1: Data Layer + Config

### Task 1: Config + Plan Tier Additions

**Files:**
- Modify: `backend/app/core/config.py` (after OPENAI_API_KEY block)
- Modify: `backend/app/core/plan_enforcement.py` (PLAN_HIERARCHY dict)

- [ ] **Step 1: Add config fields**

Open `backend/app/core/config.py`. After the `OPENAI_API_KEY: str = ""` line (around line 389), add:

```python
    # ------------------------------------------------------------------
    # Intelligence Tier (Anthropic API)
    # ------------------------------------------------------------------
    # Leave empty to disable gracefully (endpoints return 503).
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-6"
```

- [ ] **Step 2: Update PLAN_HIERARCHY**

Open `backend/app/core/plan_enforcement.py`. Change the dict (lines 32-36) to:

```python
PLAN_HIERARCHY: dict[str, int] = {
    "starter": 0,
    "professional": 1,
    "enterprise": 2,
    "intelligence": 3,
}
```

Also update the docstring on `require_plan_tier` to include `"intelligence"` in the valid tiers list:

```python
    """
    Return a FastAPI dependency that enforces a minimum plan tier.

    Args:
        min_tier: Minimum required tier ("starter" | "professional" | "enterprise" | "intelligence").
    ...
    """
```

- [ ] **Step 3: Verify no import errors**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -c "from app.core.config import settings; from app.core.plan_enforcement import PLAN_HIERARCHY; assert PLAN_HIERARCHY['intelligence'] == 3; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/config.py backend/app/core/plan_enforcement.py
git commit -m "feat(intelligence): add ANTHROPIC_API_KEY config + intelligence:3 plan tier"
```

---

### Task 2: Company Model + Schema Drift Fix

**Files:**
- Modify: `backend/app/models/organization.py` (add `intelligence_enabled` column)
- Modify: `backend/app/main.py` (add ALTER TABLE in `_ensure_tables`)

- [ ] **Step 1: Add column to ORM model**

Open `backend/app/models/organization.py`. Find the `plan_tier` mapped column (around line 99). After `plan_tier` and before `created_at`, add:

```python
    intelligence_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
        doc="Opt-in flag for Intelligence tier features.",
    )
```

Add `Boolean` to the SQLAlchemy imports at the top of the file if not already present:
```python
from sqlalchemy import Boolean, DateTime, String, UniqueConstraint
```

- [ ] **Step 2: Add ALTER TABLE in _ensure_tables**

Open `backend/app/main.py`. Find the block of `ALTER TABLE companies ADD COLUMN IF NOT EXISTS` statements (around line 596-604). After the `plan_tier` line, add:

```python
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS intelligence_enabled BOOLEAN NOT NULL DEFAULT FALSE",
```

- [ ] **Step 3: Verify import**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -c "from app.models.organization import Company; print([c.key for c in Company.__table__.columns if 'intelligence' in c.key])"
```

Expected: `['intelligence_enabled']`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/organization.py backend/app/main.py
git commit -m "feat(intelligence): add intelligence_enabled to Company model + _ensure_tables"
```

---

### Task 3: IntelligenceQueryLog ORM Model + Migration

**Files:**
- Create: `backend/app/models/intelligence.py`
- Create: `backend/migrations/versions/q1a2b3c4d5e6_intelligence.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_intelligence_models.py
"""Tests for IntelligenceQueryLog ORM model."""
from __future__ import annotations


class TestIntelligenceQueryLog:
    def test_tablename(self):
        from app.models.intelligence import IntelligenceQueryLog
        assert IntelligenceQueryLog.__tablename__ == "intelligence_query_log"

    def test_columns_present(self):
        from app.models.intelligence import IntelligenceQueryLog
        cols = {c.key for c in IntelligenceQueryLog.__table__.columns}
        expected = {
            "id", "company_id", "user_id", "capability",
            "prompt_hash", "tokens_in", "tokens_out", "latency_ms", "created_at",
        }
        assert expected.issubset(cols)

    def test_capability_max_length(self):
        from app.models.intelligence import IntelligenceQueryLog
        col = IntelligenceQueryLog.__table__.c.capability
        assert col.type.length == 20

    def test_prompt_hash_max_length(self):
        from app.models.intelligence import IntelligenceQueryLog
        col = IntelligenceQueryLog.__table__.c.prompt_hash
        assert col.type.length == 64

    def test_company_id_indexed(self):
        from app.models.intelligence import IntelligenceQueryLog
        col = IntelligenceQueryLog.__table__.c.company_id
        assert col.index is True
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_intelligence_models.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.intelligence'`

- [ ] **Step 3: Create the model**

Create `backend/app/models/intelligence.py`:

```python
# backend/app/models/intelligence.py
"""
IntelligenceQueryLog — non-WORM audit log for AI queries.

Stores prompt HASH only — never raw prompts (financial data in prompts
is an audit/compliance risk). id is reused as query_id / commentary_id
in API responses.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class IntelligenceQueryLog(Base):
    __tablename__ = "intelligence_query_log"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False
    )
    capability: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # "NL_QUERY" | "REPORT_COMMENTARY"
    prompt_hash: Mapped[str] = mapped_column(
        String(64), nullable=False
    )  # SHA-256 hex — not the prompt itself
    tokens_in: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        Index("ix_intelligence_query_log_company_capability", "company_id", "capability"),
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_intelligence_models.py -v
```

Expected: 5 passed

- [ ] **Step 5: Verify current Alembic head before writing migration**

```bash
cd backend
alembic heads
```

Expected: `p1a2b3c4d5e6 (head)` — if the current head differs, update `down_revision` in the migration file below to match it.

- [ ] **Step 7: Create migration**

Create `backend/migrations/versions/q1a2b3c4d5e6_intelligence.py`:

```python
"""intelligence_query_log table

Revision ID: q1a2b3c4d5e6
Revises: p1a2b3c4d5e6
Create Date: 2026-04-16
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "q1a2b3c4d5e6"
down_revision = "p1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "intelligence_query_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("capability", sa.String(20), nullable=False),
        sa.Column("prompt_hash", sa.String(64), nullable=False),
        sa.Column("tokens_in", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.Integer, nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_intelligence_query_log_company_capability",
        "intelligence_query_log",
        ["company_id", "capability"],
    )


def downgrade() -> None:
    op.drop_index("ix_intelligence_query_log_company_capability")
    op.drop_table("intelligence_query_log")
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/intelligence.py \
        backend/migrations/versions/q1a2b3c4d5e6_intelligence.py \
        backend/tests/test_intelligence_models.py
git commit -m "feat(intelligence): IntelligenceQueryLog model + migration q1a2b3c4d5e6"
```

---

### Task 4: Audit Enum Addition

**Files:**
- Modify: `backend/app/models/cash.py` (add INTELLIGENCE_QUERY after BENEFICIARY_CREATED)
- Modify: `backend/tests/test_cash_netting_models.py` (update enum count 28 → 29)

- [ ] **Step 1: Add enum value**

Open `backend/app/models/cash.py`. After line 127 (`BENEFICIARY_CREATED = "BENEFICIARY_CREATED"`), add:

```python
    # Intelligence Tier — Phase 3
    INTELLIGENCE_QUERY = "INTELLIGENCE_QUERY"
```

- [ ] **Step 2: Update the enum count test**

Open `backend/tests/test_cash_netting_models.py`. Find `test_enum_count_includes_netting`. Update:

```python
    def test_enum_count_includes_netting(self):
        # Original 16 + 3 netting + 1 statement_imported + 1 reconciliation_run
        # + 1 cash_pool_sweep + 6 payment + 1 intelligence = 29
        assert len(CashAuditEventType) == 29
```

- [ ] **Step 3: Run the enum test**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_cash_netting_models.py::TestNettingAuditEnums -v
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/cash.py backend/tests/test_cash_netting_models.py
git commit -m "feat(intelligence): add INTELLIGENCE_QUERY audit enum (total: 29)"
```

---

## Chunk 2: Service Layer + Routes

### Task 5: Intelligence Service

**Files:**
- Create: `backend/app/services/intelligence_service.py`
- Create: `backend/tests/test_intelligence_service.py`

- [ ] **Step 1: Install anthropic SDK (if not already present)**

```bash
cd backend
pip show anthropic 2>/dev/null || pip install anthropic
grep -q "anthropic" requirements.txt || echo "anthropic>=0.25.0" >> requirements.txt
```

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/test_intelligence_service.py`:

```python
# backend/tests/test_intelligence_service.py
"""Service-layer tests for intelligence_service — AsyncMock DB session."""
from __future__ import annotations

import hashlib
import uuid
from unittest.mock import AsyncMock, MagicMock, patch, AsyncMock

import pytest


def _mock_company(intelligence_enabled=True, plan_tier="intelligence"):
    c = MagicMock()
    c.id = uuid.uuid4()
    c.plan_tier = plan_tier
    c.intelligence_enabled = intelligence_enabled
    return c


def _mock_user(company=None):
    u = MagicMock()
    u.id = uuid.uuid4()
    u.company = company or _mock_company()
    u.company_id = u.company.id
    return u


# ── build_treasury_context ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_build_treasury_context_returns_string():
    """build_treasury_context returns a non-empty string."""
    from app.services.intelligence_service import build_treasury_context
    session = AsyncMock()
    # Mock all DB queries to return empty results
    session.execute = AsyncMock(return_value=MagicMock(fetchall=MagicMock(return_value=[])))
    company_id = uuid.uuid4()
    result = await build_treasury_context(session, company_id)
    assert isinstance(result, str)
    assert len(result) > 0


# ── prompt hash ────────────────────────────────────────────────────────────

def test_prompt_hash_deterministic():
    """Same prompt always produces same 64-char hex hash."""
    from app.services.intelligence_service import _hash_prompt
    h1 = _hash_prompt("hello world")
    h2 = _hash_prompt("hello world")
    assert h1 == h2
    assert len(h1) == 64
    assert all(c in "0123456789abcdef" for c in h1)


def test_prompt_hash_sensitive():
    """Different prompts produce different hashes."""
    from app.services.intelligence_service import _hash_prompt
    assert _hash_prompt("prompt A") != _hash_prompt("prompt B")


# ── query_intelligence ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_query_intelligence_success():
    """query_intelligence returns QueryResponse with answer and stores hash."""
    from app.services.intelligence_service import query_intelligence

    company_id = uuid.uuid4()
    user_id = uuid.uuid4()

    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="EUR net short $2.4M.")]
    mock_message.usage.input_tokens = 100
    mock_message.usage.output_tokens = 50

    mock_log_row = MagicMock()
    mock_log_row.id = uuid.uuid4()

    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(fetchall=MagicMock(return_value=[])))

    with patch("app.services.intelligence_service.settings") as mock_settings, \
         patch("app.services.intelligence_service._log_query", new_callable=AsyncMock, return_value=mock_log_row) as mock_log, \
         patch("app.services.intelligence_service.anthropic") as mock_anthropic:

        mock_settings.ANTHROPIC_API_KEY = "test-key"
        mock_settings.ANTHROPIC_MODEL = "claude-sonnet-4-6"

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_message)
        mock_anthropic.AsyncAnthropic.return_value = mock_client

        result = await query_intelligence(session, company_id, user_id, "What is our EUR exposure?")

    assert result.answer == "EUR net short $2.4M."
    assert result.tokens_used == 150
    # Verify _log_query received a 64-char hex hash, not raw prompt
    call_args = mock_log.call_args
    prompt_hash_arg = call_args.args[4] if len(call_args.args) > 4 else call_args.kwargs.get("prompt_hash")
    assert len(prompt_hash_arg) == 64
    assert all(c in "0123456789abcdef" for c in prompt_hash_arg)


@pytest.mark.asyncio
async def test_query_intelligence_missing_api_key_raises_503():
    """query_intelligence raises HTTP 503 when ANTHROPIC_API_KEY is empty."""
    from app.services.intelligence_service import query_intelligence
    from fastapi import HTTPException

    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(fetchall=MagicMock(return_value=[])))

    with patch("app.services.intelligence_service.settings") as mock_settings:
        mock_settings.ANTHROPIC_API_KEY = ""
        with pytest.raises(HTTPException) as exc_info:
            await query_intelligence(session, uuid.uuid4(), uuid.uuid4(), "test")
    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_query_intelligence_api_error_raises_502():
    """query_intelligence raises HTTP 502 when Anthropic API returns an error."""
    from app.services.intelligence_service import query_intelligence
    from fastapi import HTTPException
    import anthropic

    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(fetchall=MagicMock(return_value=[])))

    with patch("app.services.intelligence_service.settings") as mock_settings, \
         patch("app.services.intelligence_service.anthropic") as mock_anthropic_mod:

        mock_settings.ANTHROPIC_API_KEY = "test-key"
        mock_settings.ANTHROPIC_MODEL = "claude-sonnet-4-6"

        mock_client = AsyncMock()
        mock_error = MagicMock()
        mock_error.status_code = 429
        mock_client.messages.create = AsyncMock(
            side_effect=mock_anthropic_mod.APIError("rate limit", request=MagicMock(), body={})
        )
        mock_anthropic_mod.AsyncAnthropic.return_value = mock_client
        mock_anthropic_mod.APIError = type("APIError", (Exception,), {"status_code": 429})

        with pytest.raises(HTTPException) as exc_info:
            await query_intelligence(session, uuid.uuid4(), uuid.uuid4(), "test")
    assert exc_info.value.status_code == 502


# ── draft_commentary ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_draft_commentary_unknown_report_raises_404():
    """draft_commentary raises 404 when report_id not found."""
    from app.services.intelligence_service import draft_commentary
    from fastapi import HTTPException

    session = AsyncMock()
    # Simulate no run found
    mock_result = MagicMock()
    mock_result.scalar_one_or_none = MagicMock(return_value=None)
    session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.intelligence_service.settings") as mock_settings:
        mock_settings.ANTHROPIC_API_KEY = "test-key"
        with pytest.raises(HTTPException) as exc_info:
            await draft_commentary(
                session, uuid.uuid4(), uuid.uuid4(),
                "hedge_effectiveness", str(uuid.uuid4())
            )
    assert exc_info.value.status_code == 404
```

- [ ] **Step 3: Run to verify tests fail**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_intelligence_service.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 4: Create the service**

Create `backend/app/services/intelligence_service.py`:

```python
# backend/app/services/intelligence_service.py
"""
Intelligence Service — Phase 3 AI Add-On Tier

Advisory-only: never writes to WORM tables, never approves/executes records.
Only DB write: INSERT into intelligence_query_log (non-WORM).

Bedrock-compatible: swap _get_client() to use boto3 Bedrock client when
AWS migration occurs — all service/route code above it is unchanged.
"""
from __future__ import annotations

import hashlib
import time
import uuid
from datetime import UTC, datetime

import anthropic
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.intelligence import IntelligenceQueryLog


# ── Internal helpers ───────────────────────────────────────────────────────


def _hash_prompt(prompt: str) -> str:
    """Return SHA-256 hex digest of prompt. Never store raw prompt."""
    return hashlib.sha256(prompt.encode()).hexdigest()


def _get_client() -> anthropic.AsyncAnthropic:
    """Return Anthropic async client. Raises 503 if key not configured."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Intelligence service not configured (ANTHROPIC_API_KEY missing).",
        )
    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


async def _log_query(
    session: AsyncSession,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    capability: str,
    prompt_hash: str,
    tokens_in: int,
    tokens_out: int,
    latency_ms: int,
) -> IntelligenceQueryLog:
    """Insert a row into intelligence_query_log and commit."""
    row = IntelligenceQueryLog(
        company_id=company_id,
        user_id=user_id,
        capability=capability,
        prompt_hash=prompt_hash,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        latency_ms=latency_ms,
    )
    session.add(row)
    await session.flush()
    await session.commit()
    return row


# ── Context builder ────────────────────────────────────────────────────────


async def build_treasury_context(session: AsyncSession, company_id: uuid.UUID) -> str:
    """
    Build a plain-text treasury context string for prompt injection.
    Contains financial aggregates only — no PII, no raw transactions.
    All queries are tenant-scoped via company_id.
    """
    lines: list[str] = [f"Treasury context for company {company_id}:"]

    # Cash balances summary (latest per account)
    try:
        from app.models.cash import CashBalance, BankAccount
        result = await session.execute(
            select(
                BankAccount.currency,
                func.sum(CashBalance.closing_balance).label("total"),
            )
            .join(CashBalance, CashBalance.bank_account_id == BankAccount.id)
            .where(BankAccount.company_id == company_id)
            .group_by(BankAccount.currency)
        )
        rows = result.fetchall()
        if rows:
            lines.append("\nCash balances by currency:")
            for row in rows:
                lines.append(f"  {row.currency}: {row.total:,.2f}")
        else:
            lines.append("\nCash balances: no data available.")
    except Exception:
        lines.append("\nCash balances: unavailable.")

    # Pending payments summary
    try:
        from app.models.payment import PaymentInstruction
        result = await session.execute(
            select(
                PaymentInstruction.currency,
                func.count().label("count"),
                func.sum(PaymentInstruction.amount).label("total"),
            )
            .where(
                PaymentInstruction.company_id == company_id,
                PaymentInstruction.status == "PENDING_APPROVAL",
            )
            .group_by(PaymentInstruction.currency)
        )
        rows = result.fetchall()
        if rows:
            lines.append("\nPending payments (PENDING_APPROVAL):")
            for row in rows:
                lines.append(f"  {row.currency}: {row.count} payments totalling {row.total:,.2f}")
        else:
            lines.append("\nPending payments: none.")
    except Exception:
        lines.append("\nPending payments: unavailable.")

    return "\n".join(lines)


# ── NL Query ───────────────────────────────────────────────────────────────


class QueryResponse:
    def __init__(self, query_id: str, answer: str, data_refs: list[str],
                 tokens_used: int, latency_ms: int):
        self.query_id = query_id
        self.answer = answer
        self.data_refs = data_refs
        self.tokens_used = tokens_used
        self.latency_ms = latency_ms


async def query_intelligence(
    session: AsyncSession,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    q: str,
) -> QueryResponse:
    """
    Ask a natural-language question about tenant's treasury data.
    Returns advisory answer — never modifies any record.
    """
    client = _get_client()
    context = await build_treasury_context(session, company_id)
    prompt = (
        "You are a treasury data assistant. Answer questions about the treasury data "
        "provided below. Be concise and factual. Always state this is advisory only.\n\n"
        f"{context}\n\nQuestion: {q}"
    )
    prompt_hash = _hash_prompt(prompt)  # hash BEFORE calling API

    t0 = time.monotonic()
    try:
        response = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIError as exc:
        raise HTTPException(status_code=502, detail=f"Anthropic API error: {exc}") from exc
    latency_ms = int((time.monotonic() - t0) * 1000)

    log_row = await _log_query(
        session, company_id, user_id, "NL_QUERY",
        prompt_hash,
        response.usage.input_tokens,
        response.usage.output_tokens,
        latency_ms,
    )
    return QueryResponse(
        query_id=str(log_row.id),
        answer=response.content[0].text,
        data_refs=[],
        tokens_used=response.usage.input_tokens + response.usage.output_tokens,
        latency_ms=latency_ms,
    )


# ── Report Commentary ──────────────────────────────────────────────────────


class CommentaryResponse:
    def __init__(self, commentary_id: str, draft: str, report_type: str, tokens_used: int):
        self.commentary_id = commentary_id
        self.draft = draft
        self.report_type = report_type
        self.tokens_used = tokens_used


async def draft_commentary(
    session: AsyncSession,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    report_type: str,
    report_id: str,
) -> CommentaryResponse:
    """
    Draft a 2-3 paragraph AI commentary for a report.
    Returns advisory draft — never writes to report records.
    Raises 404 if report_id not found / not owned by company.
    """
    client = _get_client()

    # Fetch report data (tenant-scoped)
    report_context = ""
    if report_type == "hedge_effectiveness":
        from app.models.calculation_run import CalculationRun
        result = await session.execute(
            select(CalculationRun)
            .where(
                CalculationRun.id == uuid.UUID(report_id),
                CalculationRun.company_id == company_id,
            )
        )
        run = result.scalar_one_or_none()
        if run is None:
            raise HTTPException(status_code=404, detail="Report not found.")
        report_context = (
            f"Hedge effectiveness report (run {report_id}):\n"
            f"  Status: {getattr(run, 'status', 'unknown')}\n"
            f"  Positions: {getattr(run, 'position_count', 'N/A')}\n"
        )
    else:
        raise HTTPException(status_code=404, detail="Report not found.")

    prompt = (
        "You are a treasury reporting assistant. Write a 2-3 paragraph professional "
        "commentary for the following report. Include relevant IFRS 9 or ASC 815 "
        "regulatory context where applicable. Note this is an AI-assisted draft "
        "requiring human review.\n\n"
        f"{report_context}"
    )
    prompt_hash = _hash_prompt(prompt)

    t0 = time.monotonic()
    try:
        response = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIError as exc:
        raise HTTPException(status_code=502, detail=f"Anthropic API error: {exc}") from exc
    latency_ms = int((time.monotonic() - t0) * 1000)

    log_row = await _log_query(
        session, company_id, user_id, "REPORT_COMMENTARY",
        prompt_hash,
        response.usage.input_tokens,
        response.usage.output_tokens,
        latency_ms,
    )
    return CommentaryResponse(
        commentary_id=str(log_row.id),
        draft=response.content[0].text,
        report_type=report_type,
        tokens_used=response.usage.input_tokens + response.usage.output_tokens,
    )


# ── Usage stats ────────────────────────────────────────────────────────────


async def get_usage_stats(session: AsyncSession, company_id: uuid.UUID) -> dict:
    """Return query count and token totals for the current calendar month."""
    from sqlalchemy import extract
    now = datetime.now(UTC)
    result = await session.execute(
        select(
            func.count().label("queries"),
            func.coalesce(func.sum(IntelligenceQueryLog.tokens_in + IntelligenceQueryLog.tokens_out), 0).label("tokens"),
        )
        .where(
            IntelligenceQueryLog.company_id == company_id,
            extract("year", IntelligenceQueryLog.created_at) == now.year,
            extract("month", IntelligenceQueryLog.created_at) == now.month,
        )
    )
    row = result.one()
    return {"queries_this_month": row.queries, "tokens_this_month": int(row.tokens)}
```

- [ ] **Step 5: Run service tests**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_intelligence_service.py -v
```

Expected: all pass (7 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/intelligence_service.py backend/tests/test_intelligence_service.py
git commit -m "feat(intelligence): intelligence_service — NL query, commentary, usage stats"
```

---

### Task 6: API Routes + Router Registration

**Files:**
- Create: `backend/app/api/routes/v1_intelligence.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_v1_intelligence_routes.py`

- [ ] **Step 1: Write the failing route tests**

Create `backend/tests/test_v1_intelligence_routes.py`:

```python
# backend/tests/test_v1_intelligence_routes.py
"""Route tests for /v1/intelligence/* via httpx AsyncClient."""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.db import get_session
from app.core.dependencies import get_current_user

_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _mock_user(plan_tier="intelligence", intelligence_enabled=True):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = uuid.uuid4()
    user.role = "cfo"
    user.plan_tier = plan_tier
    company = MagicMock()
    company.id = user.company_id
    company.plan_tier = plan_tier
    company.intelligence_enabled = intelligence_enabled
    user.company = company
    return user


def _make_mock_session():
    mock = AsyncMock()
    mock.commit = AsyncMock()
    mock.rollback = AsyncMock()
    mock.close = AsyncMock()
    return mock


async def _noop_session():
    yield _make_mock_session()


# ── POST /v1/intelligence/query ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_query_returns_200():
    """POST /v1/intelligence/query returns 200 with answer."""
    user = _mock_user()
    mock_response = MagicMock()
    mock_response.query_id = str(uuid.uuid4())
    mock_response.answer = "EUR net short $2.4M."
    mock_response.data_refs = []
    mock_response.tokens_used = 150
    mock_response.latency_ms = 320

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch(
            "app.api.routes.v1_intelligence.query_intelligence_helper",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    "/api/v1/intelligence/query",
                    json={"q": "What is our EUR exposure?"},
                    headers=_BEARER,
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["answer"] == "EUR net short $2.4M."
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_query_returns_402_wrong_tier():
    """POST /v1/intelligence/query returns 402 for non-intelligence tier."""
    user = _mock_user(plan_tier="enterprise")

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/intelligence/query",
                json={"q": "test"},
                headers=_BEARER,
            )
        assert resp.status_code == 402
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_query_returns_402_not_enabled():
    """POST /v1/intelligence/query returns 402 when intelligence not enabled."""
    user = _mock_user(plan_tier="intelligence", intelligence_enabled=False)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/intelligence/query",
                json={"q": "test"},
                headers=_BEARER,
            )
        assert resp.status_code == 402
    finally:
        app.dependency_overrides.clear()


# ── POST /v1/intelligence/commentary ──────────────────────────────────────


@pytest.mark.asyncio
async def test_commentary_returns_200():
    """POST /v1/intelligence/commentary returns 200 with draft."""
    user = _mock_user()
    mock_response = MagicMock()
    mock_response.commentary_id = str(uuid.uuid4())
    mock_response.draft = "Q1 2026 hedge effectiveness remained within IFRS 9 bounds..."
    mock_response.report_type = "hedge_effectiveness"
    mock_response.tokens_used = 280

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch(
            "app.api.routes.v1_intelligence.draft_commentary_helper",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    "/api/v1/intelligence/commentary",
                    json={"report_type": "hedge_effectiveness", "report_id": str(uuid.uuid4())},
                    headers=_BEARER,
                )
        assert resp.status_code == 200
        data = resp.json()
        assert "draft" in data
    finally:
        app.dependency_overrides.clear()


# ── GET /v1/intelligence/settings ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_settings_returns_200():
    """GET /v1/intelligence/settings returns enabled status and usage."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch(
            "app.api.routes.v1_intelligence.get_usage_stats",
            new_callable=AsyncMock,
            return_value={"queries_this_month": 5, "tokens_this_month": 1200},
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/intelligence/settings", headers=_BEARER)
        assert resp.status_code == 200
        data = resp.json()
        assert "enabled" in data
        assert "queries_this_month" in data
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_v1_intelligence_routes.py -v
```

Expected: FAIL — `404 Not Found` (routes don't exist yet)

- [ ] **Step 3: Create the route file**

Create `backend/app/api/routes/v1_intelligence.py`:

```python
# backend/app/api/routes/v1_intelligence.py
"""v1 Intelligence Tier — NL query, report commentary, settings."""
from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.core.plan_enforcement import require_plan_tier
from app.models.user import User
from app.services.intelligence_service import (
    query_intelligence,
    draft_commentary,
    get_usage_stats,
)

router = APIRouter(prefix="/v1/intelligence", tags=["intelligence"])


# ── Schemas ────────────────────────────────────────────────────────────────


class IntelligenceQuery(BaseModel):
    q: str = Field(..., max_length=500)


class QueryResponse(BaseModel):
    query_id: str
    answer: str
    data_refs: list[str]
    tokens_used: int
    latency_ms: int


class CommentaryRequest(BaseModel):
    report_type: Literal["hedge_effectiveness", "committee_pack"]
    report_id: str


class CommentaryResponse(BaseModel):
    commentary_id: str
    draft: str
    report_type: str
    tokens_used: int


class IntelligenceSettingsResponse(BaseModel):
    enabled: bool
    queries_this_month: int
    tokens_this_month: int
    model: str


class IntelligenceSettingsPatch(BaseModel):
    enabled: bool


# ── Guards ─────────────────────────────────────────────────────────────────


def _require_intelligence_tier(
    current_user: User = Depends(require_plan_tier("intelligence")),
) -> User:
    """Raises HTTP 402 if intelligence plan tier not met."""
    return current_user


def _require_intelligence_enabled(
    current_user: User = Depends(_require_intelligence_tier),
) -> User:
    """Raises HTTP 402 if tenant has not opted in to intelligence."""
    if not getattr(current_user.company, "intelligence_enabled", False):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Intelligence is not enabled for your company. Enable it at /intelligence.",
        )
    return current_user


# ── Module-level helpers for testability ──────────────────────────────────


async def query_intelligence_helper(db, *, company_id, user_id, q):
    return await query_intelligence(db, company_id=company_id, user_id=user_id, q=q)


async def draft_commentary_helper(db, *, company_id, user_id, report_type, report_id):
    return await draft_commentary(
        db, company_id=company_id, user_id=user_id,
        report_type=report_type, report_id=report_id,
    )


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.post("/query", response_model=QueryResponse)
async def post_query(
    body: IntelligenceQuery,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(_require_intelligence_enabled),
):
    result = await query_intelligence_helper(
        db,
        company_id=current_user.company_id,
        user_id=current_user.id,
        q=body.q,
    )
    return QueryResponse(
        query_id=result.query_id,
        answer=result.answer,
        data_refs=result.data_refs,
        tokens_used=result.tokens_used,
        latency_ms=result.latency_ms,
    )


@router.post("/commentary", response_model=CommentaryResponse)
async def post_commentary(
    body: CommentaryRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(_require_intelligence_enabled),
):
    result = await draft_commentary_helper(
        db,
        company_id=current_user.company_id,
        user_id=current_user.id,
        report_type=body.report_type,
        report_id=body.report_id,
    )
    return CommentaryResponse(
        commentary_id=result.commentary_id,
        draft=result.draft,
        report_type=result.report_type,
        tokens_used=result.tokens_used,
    )


@router.get("/settings", response_model=IntelligenceSettingsResponse)
async def get_settings(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(_require_intelligence_tier),
):
    from app.core.config import settings as app_settings
    usage = await get_usage_stats(db, current_user.company_id)
    return IntelligenceSettingsResponse(
        enabled=getattr(current_user.company, "intelligence_enabled", False),
        queries_this_month=usage["queries_this_month"],
        tokens_this_month=usage["tokens_this_month"],
        model=app_settings.ANTHROPIC_MODEL,
    )


@router.patch("/settings", response_model=IntelligenceSettingsResponse)
async def patch_settings(
    body: IntelligenceSettingsPatch,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(_require_intelligence_tier),
):
    # Role check: only superuser or admin can toggle intelligence
    role = getattr(current_user, "role", "")
    is_superuser = getattr(current_user, "is_superuser", False)
    if not is_superuser and role not in ("admin", "cfo"):
        raise HTTPException(status_code=403, detail="Admin or superuser required to change intelligence settings.")

    from sqlalchemy import update
    from app.models.organization import Company
    await db.execute(
        update(Company)
        .where(Company.id == current_user.company_id)
        .values(intelligence_enabled=body.enabled)
    )
    await db.commit()
    # Refresh company on user object
    current_user.company.intelligence_enabled = body.enabled

    from app.core.config import settings as app_settings
    usage = await get_usage_stats(db, current_user.company_id)
    return IntelligenceSettingsResponse(
        enabled=body.enabled,
        queries_this_month=usage["queries_this_month"],
        tokens_this_month=usage["tokens_this_month"],
        model=app_settings.ANTHROPIC_MODEL,
    )
```

- [ ] **Step 4: Register router in router.py**

Open `backend/app/api/router.py`. At the end of the file, after the payment router block, add:

```python
# Treasury Suite Phase 3 — Intelligence Tier (owns /v1/intelligence/*)
from app.api.routes.v1_intelligence import router as v1_intelligence_router
router.include_router(v1_intelligence_router)
```

- [ ] **Step 5: Run route tests**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_v1_intelligence_routes.py -v
```

Expected: all pass (5 tests)

- [ ] **Step 6: Run full backend suite**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short 2>&1 | tail -5
```

Expected: 4830+ passed, 0 failed

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/routes/v1_intelligence.py \
        backend/app/api/router.py \
        backend/tests/test_v1_intelligence_routes.py
git commit -m "feat(intelligence): 4 REST endpoints + router registration (§3)"
```

---

## Chunk 3: Frontend + ADR

### Task 7: intelligenceClient.ts + PlanTier + Sidebar

**Files:**
- Create: `frontend/src/lib/api/intelligenceClient.ts`
- Modify: `frontend/src/lib/authContext.tsx` (add "intelligence" to PlanTier)
- Modify: `frontend/src/components/layout/AppSidebar.tsx` (nav entry + route prefix)

- [ ] **Step 1: Add "intelligence" to PlanTier**

Open `frontend/src/lib/authContext.tsx`. Find line 30:
```typescript
export type PlanTier = "lite" | "smb" | "professional" | "enterprise";
```
Change to:
```typescript
export type PlanTier = "lite" | "smb" | "professional" | "enterprise" | "intelligence";
```

- [ ] **Step 2: Create intelligenceClient.ts**

Create `frontend/src/lib/api/intelligenceClient.ts`:

```typescript
// frontend/src/lib/api/intelligenceClient.ts
import { dashboardFetch } from "@/lib/api/dashboardClient";

export interface QueryResponse {
  query_id: string;
  answer: string;
  data_refs: string[];
  tokens_used: number;
  latency_ms: number;
}

export interface CommentaryResponse {
  commentary_id: string;
  draft: string;
  report_type: string;
  tokens_used: number;
}

export interface IntelligenceSettingsResponse {
  enabled: boolean;
  queries_this_month: number;
  tokens_this_month: number;
  model: string;
}

export async function queryIntelligence(q: string, token: string): Promise<QueryResponse> {
  return dashboardFetch("/api/v1/intelligence/query", token, {
    method: "POST",
    body: JSON.stringify({ q }),
  });
}

export async function draftCommentary(
  report_type: "hedge_effectiveness" | "committee_pack",
  report_id: string,
  token: string,
): Promise<CommentaryResponse> {
  return dashboardFetch("/api/v1/intelligence/commentary", token, {
    method: "POST",
    body: JSON.stringify({ report_type, report_id }),
  });
}

export async function getIntelligenceSettings(token: string): Promise<IntelligenceSettingsResponse> {
  return dashboardFetch("/api/v1/intelligence/settings", token);
}

export async function patchIntelligenceSettings(
  enabled: boolean,
  token: string,
): Promise<IntelligenceSettingsResponse> {
  return dashboardFetch("/api/v1/intelligence/settings", token, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}
```

- [ ] **Step 3: Add Intelligence nav entry to AppSidebar**

Open `frontend/src/components/layout/AppSidebar.tsx`.

First, add `Brain` to the lucide-react import (find the existing lucide import line and add `Brain`).

Then find the active route prefixes array (where `"/payments"` was added recently) and add `"/intelligence"`.

Then find the ACCOUNTING group section and after the Payments entry, add a new INTELLIGENCE group. Look for where Payments was added (search for `label: "Payments"`) and after the closing of the ACCOUNTING nav section, add:

```typescript
      // ── INTELLIGENCE ──────────────────────────────────────────────
      {
        group: "INTELLIGENCE",
        items: [
          {
            label: "Intelligence",
            desc: "Natural language treasury query + AI report commentary",
            href: "/intelligence",
            icon: Brain,
            minTier: "intelligence" as PlanTier,
          },
        ],
      },
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api/intelligenceClient.ts \
        frontend/src/lib/authContext.tsx \
        frontend/src/components/layout/AppSidebar.tsx
git commit -m "feat(intelligence): intelligenceClient.ts, PlanTier extension, sidebar nav"
```

---

### Task 8: CmdKOverlay Component

**Files:**
- Create: `frontend/src/components/intelligence/CmdKOverlay.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/intelligence/CmdKOverlay.tsx`:

```tsx
"use client";
// frontend/src/components/intelligence/CmdKOverlay.tsx
// Global CMD+K overlay for Intelligence tier users.
// Mount once in root layout; renders nothing for non-intelligence tiers.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { queryIntelligence, type QueryResponse } from "@/lib/api/intelligenceClient";
import { Brain, ExternalLink, X } from "lucide-react";

const S = {
  mono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  ui:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  deep: "var(--bg-deep)",
  panel: "var(--bg-panel)",
  rim:  "var(--border-rim)",
  cyan: "var(--accent-cyan)",
  text1: "var(--text-primary)",
  text2: "var(--text-secondary)",
  amber: "var(--accent-amber,#D97706)",
} as const;

export default function CmdKOverlay() {
  const { user, token } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only render for intelligence tier
  if (user?.plan_tier !== "intelligence") return null;

  // Keyboard listener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResult(null);
      setError(null);
    }
  }, [open]);

  const submit = useCallback(async () => {
    if (!query.trim() || busy || !token) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await queryIntelligence(query, token);
      setResult(res);
    } catch (e: any) {
      setError(e?.message ?? "Request failed.");
    } finally {
      setBusy(false);
    }
  }, [query, busy, token]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.6)", display: "flex",
        alignItems: "flex-start", justifyContent: "center",
        paddingTop: 120,
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          width: 580, maxWidth: "90vw",
          background: S.panel, border: `1px solid ${S.cyan}`,
          borderRadius: 6, overflow: "hidden",
          boxShadow: `0 0 40px rgba(0,0,0,0.8)`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${S.rim}` }}>
          <Brain size={14} color={S.cyan} />
          <span style={{ fontFamily: S.mono, fontSize: 11, color: S.cyan, letterSpacing: 1 }}>INTELLIGENCE QUERY</span>
          <div style={{ flex: 1 }} />
          <X size={14} color={S.text2} style={{ cursor: "pointer" }} onClick={() => setOpen(false)} />
        </div>

        {/* Input */}
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${S.rim}` }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="Ask your treasury data... (Enter to submit)"
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              fontFamily: S.mono, fontSize: 13, color: S.text1,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Result */}
        {(busy || result || error) && (
          <div style={{ padding: "12px 14px", maxHeight: 320, overflowY: "auto" }}>
            {busy && (
              <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text2 }}>Querying...</span>
            )}
            {result && (
              <>
                <p style={{ fontFamily: S.ui, fontSize: 13, color: S.text1, margin: "0 0 8px", lineHeight: 1.6 }}>
                  {result.answer}
                </p>
                <div style={{ fontSize: 10, fontFamily: S.mono, color: S.text2 }}>
                  {result.tokens_used} tokens · {result.latency_ms}ms
                </div>
              </>
            )}
            {error && (
              <span style={{ fontFamily: S.mono, fontSize: 12, color: "#ef4444" }}>{error}</span>
            )}
          </div>
        )}

        {/* Advisory disclaimer */}
        <div style={{
          padding: "8px 14px", borderTop: `1px solid ${S.rim}`,
          background: S.deep,
          fontFamily: S.mono, fontSize: 10, color: S.amber,
          letterSpacing: 0.5,
        }}>
          ADVISORY — AI output. Verify before acting. Not financial advice.
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount in root layout**

Open `frontend/src/app/layout.tsx`. Import and add the overlay just before the closing `</body>` tag:

```tsx
import CmdKOverlay from "@/components/intelligence/CmdKOverlay";

// Inside the JSX, just before </body>:
<CmdKOverlay />
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/intelligence/CmdKOverlay.tsx \
        frontend/src/app/layout.tsx
git commit -m "feat(intelligence): CmdKOverlay — global CMD+K query overlay"
```

---

### Task 9: Intelligence Settings Page

**Files:**
- Create: `frontend/src/app/intelligence/page.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/app/intelligence/page.tsx`:

```tsx
"use client";
// frontend/src/app/intelligence/page.tsx
// Intelligence Tier settings + usage dashboard.

import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import {
  getIntelligenceSettings,
  patchIntelligenceSettings,
  type IntelligenceSettingsResponse,
} from "@/lib/api/intelligenceClient";
import { Brain, Zap, MessageSquare } from "lucide-react";

const S = {
  mono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  ui:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  deep: "var(--bg-deep)",
  panel: "var(--bg-panel)",
  sub:  "var(--bg-sub)",
  rim:  "var(--border-rim)",
  cyan: "var(--accent-cyan)",
  text1: "var(--text-primary)",
  text2: "var(--text-secondary)",
  green: "var(--status-pass,#059669)",
  red:   "var(--accent-red,#DC2626)",
} as const;

export default function IntelligencePage() {
  const { user, token } = useAuth();
  const [settings, setSettings] = useState<IntelligenceSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await getIntelligenceSettings(token);
      setSettings(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    if (!token || !settings) return;
    setToggling(true);
    try {
      const updated = await patchIntelligenceSettings(!settings.enabled, token);
      setSettings(updated);
    } catch (e: any) {
      setError(e?.message ?? "Failed to update settings.");
    } finally {
      setToggling(false);
    }
  };

  const canToggle = user?.role === "admin" || (user as any)?.is_superuser;

  return (
    <div style={{ minHeight: "100vh", background: S.deep, padding: 32, fontFamily: S.ui }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 6,
          background: "rgba(0,200,200,0.1)", border: `1px solid ${S.cyan}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Brain size={18} color={S.cyan} />
        </div>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: 14, color: S.text1, letterSpacing: 1 }}>
            INTELLIGENCE
          </div>
          <div style={{ fontSize: 11, color: S.text2 }}>AI Add-On Tier — Advisory Only</div>
        </div>
        <div style={{
          marginLeft: 12, padding: "2px 8px", borderRadius: 3,
          background: "rgba(0,200,200,0.1)", border: `1px solid ${S.cyan}`,
          fontFamily: S.mono, fontSize: 9, color: S.cyan, letterSpacing: 1,
        }}>PHASE 3</div>
      </div>

      {loading && (
        <div style={{ color: S.text2, fontFamily: S.mono, fontSize: 12 }}>Loading...</div>
      )}

      {error && (
        <div style={{ color: S.red, fontFamily: S.mono, fontSize: 12, marginBottom: 16 }}>{error}</div>
      )}

      {settings && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, maxWidth: 800 }}>
          {/* Enable/Disable card */}
          <div style={{ gridColumn: "span 3", background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontFamily: S.mono, fontSize: 12, color: S.text1, marginBottom: 4 }}>
                  INTELLIGENCE ENABLED
                </div>
                <div style={{ fontSize: 12, color: S.text2 }}>
                  {settings.enabled
                    ? "Active — CMD+K and report commentary available."
                    : "Disabled — enable to activate AI features."}
                </div>
              </div>
              {canToggle && (
                <button
                  onClick={toggle}
                  disabled={toggling}
                  style={{
                    padding: "8px 16px", borderRadius: 4, cursor: toggling ? "not-allowed" : "pointer",
                    fontFamily: S.mono, fontSize: 11, letterSpacing: 1, border: "none",
                    background: settings.enabled ? S.red : S.green, color: "#fff",
                    opacity: toggling ? 0.6 : 1,
                  }}
                >
                  {toggling ? "..." : settings.enabled ? "DISABLE" : "ENABLE"}
                </button>
              )}
              {!canToggle && (
                <div style={{ fontSize: 11, color: S.text2, fontFamily: S.mono }}>
                  Admin required to change
                </div>
              )}
            </div>
          </div>

          {/* KPI: Queries this month */}
          <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 10, fontFamily: S.mono, color: S.text2, marginBottom: 8, letterSpacing: 1 }}>
              QUERIES THIS MONTH
            </div>
            <div style={{ fontSize: 28, fontFamily: S.mono, color: S.cyan }}>
              {settings.queries_this_month.toLocaleString()}
            </div>
          </div>

          {/* KPI: Tokens */}
          <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 10, fontFamily: S.mono, color: S.text2, marginBottom: 8, letterSpacing: 1 }}>
              TOKENS THIS MONTH
            </div>
            <div style={{ fontSize: 28, fontFamily: S.mono, color: S.text1 }}>
              {settings.tokens_this_month.toLocaleString()}
            </div>
          </div>

          {/* Model info */}
          <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 10, fontFamily: S.mono, color: S.text2, marginBottom: 8, letterSpacing: 1 }}>
              MODEL
            </div>
            <div style={{ fontSize: 12, fontFamily: S.mono, color: S.text1 }}>
              {settings.model}
            </div>
            <div style={{ fontSize: 10, color: S.text2, marginTop: 4 }}>Anthropic API · Advisory only</div>
          </div>

          {/* Usage guide */}
          <div style={{ gridColumn: "span 3", background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16 }}>
            <div style={{ fontFamily: S.mono, fontSize: 11, color: S.text2, marginBottom: 8 }}>HOW TO USE</div>
            <div style={{ display: "flex", gap: 24, fontSize: 12, color: S.text2 }}>
              <div>
                <span style={{ fontFamily: S.mono, color: S.cyan }}>⌘K / Ctrl+K</span>
                {" "}— Open natural language query on any page
              </div>
              <div>
                <span style={{ fontFamily: S.mono, color: S.cyan }}>Report Commentary</span>
                {" "}— Draft AI commentary from hedge effectiveness reports
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/intelligence/page.tsx
git commit -m "feat(intelligence): /intelligence settings + usage page"
```

---

### Task 10: Commentary Button on Hedge Effectiveness Page

**Files:**
- Modify: `frontend/src/app/hedge-effectiveness/page.tsx`

- [ ] **Step 1: Add commentary state and handler**

Open `frontend/src/app/hedge-effectiveness/page.tsx`.

After the existing imports (around line 16), add:
```tsx
import { draftCommentary, type CommentaryResponse } from "@/lib/api/intelligenceClient";
```

After the `downloadBinder` function (around line 5071), add:

```tsx
  // ── AI commentary draft ──
  const [commentaryRunId, setCommentaryRunId] = useState<string | null>(null);
  const [commentary, setCommentary] = useState<CommentaryResponse | null>(null);
  const [commentaryDraft, setCommentaryDraft] = useState("");
  const [commentaryBusy, setCommentaryBusy] = useState(false);

  const requestCommentary = async (runId: string) => {
    if (!token || commentaryBusy) return;
    setCommentaryRunId(runId);
    setCommentaryBusy(true);
    setCommentary(null);
    try {
      const res = await draftCommentary("hedge_effectiveness", runId, token);
      setCommentary(res);
      setCommentaryDraft(res.draft);
    } catch {
      setCommentaryDraft("Failed to generate commentary. Please try again.");
    } finally {
      setCommentaryBusy(false);
    }
  };
```

- [ ] **Step 2: Find the evidence binder download button in JSX**

Search for the `downloadBinder` call site in the JSX (around line 5058 logic, but the JSX usage will reference `downloadBinder`). Find a run row that has the download binder button. After that button, add the commentary button and panel. Search for:

```
downloadingId === run
```

or similar reference to `downloadBinder` being called in the JSX.

Run: `grep -n "downloadBinder\|downloadingId\|DOWNLOAD BINDER\|Evidence Binder" frontend/src/app/hedge-effectiveness/page.tsx | head -10`

Then add after the download button (only visible for `plan_tier === "intelligence"`):

```tsx
{user?.plan_tier === "intelligence" && (
  <>
    <button
      onClick={() => requestCommentary(run.run_id)}
      disabled={commentaryBusy && commentaryRunId === run.run_id}
      style={{
        padding: "4px 10px", borderRadius: 3, border: "none",
        background: "rgba(0,200,200,0.15)", color: "var(--accent-cyan)",
        fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
        fontSize: 10, letterSpacing: 1, cursor: "pointer",
      }}
    >
      {commentaryBusy && commentaryRunId === run.run_id ? "..." : "✦ AI COMMENTARY"}
    </button>
    {commentary && commentaryRunId === run.run_id && (
      <div style={{
        marginTop: 8, padding: 12,
        background: "var(--bg-sub)", border: "1px solid var(--accent-cyan)",
        borderRadius: 4,
      }}>
        <div style={{ fontSize: 10, fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", color: "var(--accent-cyan)", marginBottom: 6 }}>
          AI COMMENTARY DRAFT — ✦ AI-assisted · human review required
        </div>
        <textarea
          value={commentaryDraft}
          onChange={e => setCommentaryDraft(e.target.value)}
          rows={6}
          style={{
            width: "100%", background: "transparent", border: "1px solid var(--border-rim)",
            color: "var(--text-primary)", fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
            fontSize: 12, padding: 8, borderRadius: 3, resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>
          {`AI-assisted, human-reviewed: ${new Date().toISOString().slice(0, 10)} ${user?.email ?? ""}`}
        </div>
      </div>
    )}
  </>
)}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors (or pre-existing errors only)

- [ ] **Step 4: Build check**

```bash
cd frontend
npx next build 2>&1 | tail -5
```

Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/hedge-effectiveness/page.tsx
git commit -m "feat(intelligence): AI commentary button on hedge-effectiveness run rows"
```

---

### Task 11: ADR-0014

**Files:**
- Create: `docs/architecture/adr/0014-ai-advisory-only-contract.md`

- [ ] **Step 1: Create the ADR**

Create `docs/architecture/adr/0014-ai-advisory-only-contract.md`:

```markdown
# ADR-0014: AI Add-on Tier — Advisory-Only Contract

**Status:** accepted  
**Date:** 2026-04-16  
**Author:** ORDR Edge

## Context

Phase 3 introduces AI capabilities (natural-language treasury query, report commentary)
powered by the Anthropic API. These features process tenant financial data and return
natural-language outputs. Without explicit constraints, AI outputs could be mistaken for
authoritative decisions or inadvertently modify production records.

## Decision

All AI outputs in ORDR Terminal are ADVISORY.

1. `intelligence_service.py` performs only SELECT queries on business data.
2. The only INSERT it performs is into `intelligence_query_log` (non-WORM append log).
3. The service never calls `session.add()` on any business model.
4. The service never triggers state machine transitions.
5. Every AI-generated output is clearly labelled "AI-assisted, human review required"
   in the UI before any export or action.
6. Prompt hashes (not raw prompts) are stored — financial context injected into prompts
   must not be persisted.

## Consequences

- **Positive:** No AI-driven mutations to treasury records; audit trail clean.
- **Positive:** Prompt privacy preserved — raw prompts with financial data not stored.
- **Positive:** Bedrock-compatible — `_get_client()` is the only change needed for AWS.
- **Constraint:** AI cannot take autonomous actions; all suggestions require human approval.
- **Constraint:** ML cash flow forecasting (Phase 3b) must follow the same contract.

## References

- Treasury Suite Phase 3 design spec: `docs/superpowers/specs/2026-04-16-phase3-intelligence-design.md`
- Prior art: ADR-0005 (paper execution mode — same advisory pattern applied to broker execution)
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/adr/0014-ai-advisory-only-contract.md
git commit -m "docs(adr): ADR-0014 — AI advisory-only contract (Phase 3)"
```

---

### Task 12: Final Validation

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short 2>&1 | tail -8
```

Expected: 4830+ passed, 0 failed

- [ ] **Step 2: TypeScript check**

```bash
cd frontend
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Production build**

```bash
cd frontend
npx next build 2>&1 | tail -5
```

Expected: exit 0
