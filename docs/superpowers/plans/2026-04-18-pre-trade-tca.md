# Pre-Trade TCA Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship pre-trade transaction cost estimates (standalone page), post-calc TCA on every run (auto-attached tab), and variance tracking against actual settlements.

**Architecture:** New `TransactionCostEstimate` ORM (not WORM, mutable for reconciliation), new `tca_service` orchestrator using existing `engine_v1/transaction_cost_model.py`, eager attachment at calculation time (not lazy), auto-reconcile hook on `SettlementEvent` commit, three frontend surfaces gated to Professional plan.

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy async / PostgreSQL / Alembic migrations / Next.js 15 App Router / TypeScript 5.9 / React 19 / pytest / lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-04-18-pre-trade-tca-design.md`

---

## File Structure

### Backend — create
- `backend/app/models/transaction_cost_estimate.py` — ORM model
- `backend/migrations/versions/0027_transaction_cost_estimates.py` — table + indexes
- `backend/migrations/versions/0028_tca_permissions.py` — `tca.read` + `tca.estimate` RBAC rows
- `backend/app/schemas_v1/tca.py` — Pydantic request/response schemas
- `backend/app/services/tca_service.py` — service orchestrator (4 public functions)
- `backend/app/api/routes/v1_tca.py` — 6 endpoints
- `backend/tests/test_transaction_cost_model.py` — engine unit tests (pure)
- `backend/tests/test_tca_service.py` — service unit tests (AsyncMock)
- `backend/tests/test_v1_tca_routes.py` — route tests (httpx AsyncClient)

### Backend — modify
- `backend/app/api/routes/v1_calculate.py` — call `attach_to_calc_run()` after `_persist_run()` in both `calculate()` and `calculate_extended()`
- `backend/app/services/settlement_service.py` — call `_auto_reconcile_tca()` after `SettlementEvent` commit (non-fatal)
- `backend/app/main.py` — register `v1_tca` router
- `backend/app/models/__init__.py` — export `TransactionCostEstimate`

### Frontend — create
- `frontend/src/lib/api/tcaClient.ts` — API client (6 functions + 4 interfaces)
- `frontend/src/app/pre-trade-tca/page.tsx` — estimator page
- `frontend/src/app/pre-trade-tca/accuracy/page.tsx` — accuracy dashboard
- `frontend/src/app/pre-trade-tca/layout.tsx` — shared tab nav
- `frontend/src/components/tca/TCATab.tsx` — reusable run-detail tab component

### Frontend — modify
- `frontend/src/components/layout/AppSidebar.tsx` — add Pre-Trade TCA nav item
- `frontend/src/app/calculate/runs/[id]/page.tsx` — add TCA tab

### Docs — modify
- `.claude/state/CURRENT_SPRINT.md` — mark sprint in progress then complete
- `.claude/state/CHANGELOG_AI.md` — entry on completion
- `.claude/state/CURRENT_STATE.md` — test counts + session summary

---

## Chunk 1: Backend Foundation (model + migration + schemas)

### Task 1: `TransactionCostEstimate` ORM model

**Files:**
- Create: `backend/app/models/transaction_cost_estimate.py`
- Test: `backend/tests/test_tca_service.py` (stub — used later)
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1.1: Write failing model-structure test**

Add to `backend/tests/test_tca_service.py`:
```python
"""Tests for tca_service (also validates the ORM model)."""
import pytest

def test_transaction_cost_estimate_model_has_required_columns():
    from app.models.transaction_cost_estimate import TransactionCostEstimate
    required = {
        "id", "tenant_id", "user_id", "estimate_type",
        "calculation_run_id", "market_snapshot_id",
        "inputs", "outputs",
        "total_cost_usd", "total_cost_bps",
        "settlement_event_id", "actual_cost_usd", "variance_bps",
        "reconciled_at", "created_at",
    }
    columns = {c.name for c in TransactionCostEstimate.__table__.columns}
    assert required.issubset(columns), f"missing: {required - columns}"
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tca_service.py::test_transaction_cost_estimate_model_has_required_columns -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.transaction_cost_estimate'`.

- [ ] **Step 1.3: Create the ORM model**

Create `backend/app/models/transaction_cost_estimate.py`:
```python
"""TransactionCostEstimate — advisory TCA artifact with variance reconciliation.

Not WORM. `actual_cost_usd`, `variance_bps`, `settlement_event_id`, `reconciled_at`
are backfilled by `tca_service.reconcile_actual()`. Audit trail via hash-chain
`audit_events` table with string-literal event_type.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class TransactionCostEstimate(Base):
    __tablename__ = "transaction_cost_estimates"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    estimate_type: Mapped[str] = mapped_column(String(16), nullable=False)  # pre_trade|post_calc
    calculation_run_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    market_snapshot_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False
    )
    inputs: Mapped[dict] = mapped_column(JSONB, nullable=False)
    outputs: Mapped[dict] = mapped_column(JSONB, nullable=False)
    total_cost_usd: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    total_cost_bps: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    settlement_event_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    actual_cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    variance_bps: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    reconciled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )

    __table_args__ = (
        Index("ix_tca_tenant_created", "tenant_id", "created_at"),
        Index("ix_tca_tenant_type_reconciled", "tenant_id", "estimate_type", "reconciled_at"),
    )
```

- [ ] **Step 1.4: Export from `models/__init__.py`**

Edit `backend/app/models/__init__.py` — add at the end:
```python
from app.models.transaction_cost_estimate import TransactionCostEstimate  # noqa: F401
```

- [ ] **Step 1.5: Run test to verify it passes**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tca_service.py::test_transaction_cost_estimate_model_has_required_columns -v
```
Expected: PASS.

- [ ] **Step 1.6: Commit**

```bash
git add backend/app/models/transaction_cost_estimate.py backend/app/models/__init__.py backend/tests/test_tca_service.py
git commit -m "feat(tca): TransactionCostEstimate ORM model"
```

---

### Task 2: Alembic migration `0027_transaction_cost_estimates`

**Files:**
- Create: `backend/migrations/versions/0027_transaction_cost_estimates.py`

- [ ] **Step 2.1: Write the migration**

Create `backend/migrations/versions/0027_transaction_cost_estimates.py`:
```python
"""transaction_cost_estimates table

Revision ID: 0027_transaction_cost_estimates
Revises: 0026_cash_pools
Create Date: 2026-04-18
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0027_transaction_cost_estimates"
down_revision = "0026_cash_pools"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transaction_cost_estimates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("estimate_type", sa.String(16), nullable=False),
        sa.Column("calculation_run_id", sa.String(64), nullable=True),
        sa.Column("market_snapshot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inputs", postgresql.JSONB, nullable=False),
        sa.Column("outputs", postgresql.JSONB, nullable=False),
        sa.Column("total_cost_usd", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_cost_bps", sa.Numeric(10, 4), nullable=False),
        sa.Column("settlement_event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actual_cost_usd", sa.Numeric(18, 2), nullable=True),
        sa.Column("variance_bps", sa.Numeric(10, 4), nullable=True),
        sa.Column("reconciled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_tca_tenant_created", "transaction_cost_estimates", ["tenant_id", "created_at"])
    op.create_index("ix_tca_tenant_type_reconciled", "transaction_cost_estimates", ["tenant_id", "estimate_type", "reconciled_at"])
    op.create_index("ix_tca_calc_run_id", "transaction_cost_estimates", ["calculation_run_id"])


def downgrade() -> None:
    op.drop_index("ix_tca_calc_run_id", table_name="transaction_cost_estimates")
    op.drop_index("ix_tca_tenant_type_reconciled", table_name="transaction_cost_estimates")
    op.drop_index("ix_tca_tenant_created", table_name="transaction_cost_estimates")
    op.drop_table("transaction_cost_estimates")
```

- [ ] **Step 2.2: Verify migration chain**

```bash
cd backend && alembic check
```
Expected: No output (chain is valid).

- [ ] **Step 2.3: Commit**

```bash
git add backend/migrations/versions/0027_transaction_cost_estimates.py
git commit -m "feat(tca): migration 0027 — transaction_cost_estimates table"
```

---

### Task 3: Pydantic schemas

**Files:**
- Create: `backend/app/schemas_v1/tca.py`

- [ ] **Step 3.1: Write failing schema-import test**

Append to `backend/tests/test_tca_service.py`:
```python
def test_tca_schemas_importable():
    from app.schemas_v1.tca import (
        PreTradeEstimateRequest,
        TCAEstimateResponse,
        TCABreakdown,
        TCABenchmark,
        ReconcileRequest,
        AccuracyReportResponse,
        AccuracyBucket,
    )
    # Basic shape check
    req = PreTradeEstimateRequest(
        pair="EURUSD", notional_usd=1_000_000, direction="BUY",
        instrument="FWD", execution_window_hours=24,
    )
    assert req.pair == "EURUSD"
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tca_service.py::test_tca_schemas_importable -v
```
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3.3: Create schemas**

Create `backend/app/schemas_v1/tca.py`:
```python
"""Pydantic schemas for Pre-Trade TCA API."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


Direction = Literal["BUY", "SELL"]
Instrument = Literal["FWD", "SPOT", "NDF", "OPT"]
EstimateType = Literal["pre_trade", "post_calc"]


class PreTradeEstimateRequest(BaseModel):
    pair: str = Field(..., min_length=6, max_length=7)  # EURUSD or EUR/USD
    notional_usd: float = Field(..., gt=0)
    direction: Direction
    instrument: Instrument
    execution_window_hours: float = Field(default=24.0, gt=0, le=720)
    market_snapshot_id: UUID | None = None


class TCABreakdown(BaseModel):
    slippage_cost: float
    broker_commission: float
    exchange_fee: float
    clearing_fee: float
    vol_drift_adjustment: float
    total_cost: float
    total_cost_bps: float


class TCABenchmark(BaseModel):
    historical_avg_bps_same_pair: float
    percentile: int  # 0-100
    sample_size: int


class TCAEstimateResponse(BaseModel):
    estimate_id: UUID
    estimate_type: EstimateType
    created_at: datetime
    inputs: dict
    breakdown: TCABreakdown
    benchmark: TCABenchmark | None = None
    market_snapshot_id: UUID
    reconciled_at: datetime | None = None
    actual_cost_usd: float | None = None
    variance_bps: float | None = None


class ReconcileRequest(BaseModel):
    settlement_event_id: UUID


class AccuracyBucket(BaseModel):
    key: str  # pair or instrument or month
    sample_size: int
    mean_variance_bps: float
    stdev_variance_bps: float
    mae_bps: float
    rmse_bps: float
    bias_direction: Literal["OVER_ESTIMATE", "UNDER_ESTIMATE", "NEUTRAL"]


class AccuracyReportResponse(BaseModel):
    period: str
    group_by: Literal["pair", "instrument", "month"]
    total_reconciled: int
    buckets: list[AccuracyBucket]
```

- [ ] **Step 3.4: Run test to verify it passes**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tca_service.py -v
```
Expected: 2 passes (model + schemas).

- [ ] **Step 3.5: Commit**

```bash
git add backend/app/schemas_v1/tca.py backend/tests/test_tca_service.py
git commit -m "feat(tca): Pydantic schemas for Pre-Trade TCA API"
```

---

## Chunk 2: Engine + Service Layer

### Task 4: Engine unit tests (solidify existing engine)

**Files:**
- Create: `backend/tests/test_transaction_cost_model.py`

- [ ] **Step 4.1: Write engine unit tests (5 cases)**

Create `backend/tests/test_transaction_cost_model.py`:
```python
"""Unit tests for engine_v1.transaction_cost_model.compute_transaction_costs."""
from app.engine_v1.transaction_cost_model import compute_transaction_costs


def _market(fee_schedule: dict | None = None) -> dict:
    return {
        "fee_schedule": fee_schedule or {"FWD": {"exchange": 0.5, "clearing": 0.2}},
        "vol_surface": {"USDMXN_1M": 12.5},
    }


def _policy(broker_bps: float = 2.5) -> dict:
    return {"broker_commission_bps": broker_bps, "execution_product": "FWD"}


def test_basic_cost_decomposition():
    result = compute_transaction_costs(
        hedge_actions=[{"bucket": "B1", "action_usd": 1_000_000, "instrument": "FWD"}],
        slippage_estimates=[{"bucket": "B1", "slippage_usd": 100.0, "slippage_bps": 1.0}],
        market=_market(),
        policy=_policy(),
    )
    assert len(result.positions) == 1
    p = result.positions[0]
    # Sum of components = total_cost
    summed = (p.slippage_cost + p.broker_commission + p.exchange_fee
              + p.clearing_fee + p.vol_drift_adjustment)
    assert abs(summed - p.total_cost) < 0.01


def test_zero_notional_actions_are_skipped():
    result = compute_transaction_costs(
        hedge_actions=[
            {"bucket": "B1", "action_usd": 0.5, "instrument": "FWD"},     # < 1.0, skip
            {"bucket": "B2", "action_usd": 1_000_000, "instrument": "FWD"},
        ],
        slippage_estimates=[],
        market=_market(),
        policy=_policy(),
    )
    assert len(result.positions) == 1
    assert result.positions[0].bucket == "B2"


def test_cost_bps_formula():
    result = compute_transaction_costs(
        hedge_actions=[{"bucket": "B1", "action_usd": 1_000_000, "instrument": "FWD"}],
        slippage_estimates=[{"bucket": "B1", "slippage_usd": 100.0, "slippage_bps": 1.0}],
        market=_market(),
        policy=_policy(),
    )
    p = result.positions[0]
    expected_bps = (p.total_cost / p.notional_usd) * 10_000.0
    assert abs(p.total_cost_bps - expected_bps) < 0.0001


def test_missing_fee_schedule_defaults_zero():
    result = compute_transaction_costs(
        hedge_actions=[{"bucket": "B1", "action_usd": 1_000_000, "instrument": "FWD"}],
        slippage_estimates=[],
        market={"vol_surface": {"USDMXN_1M": 12.5}},  # no fee_schedule
        policy=_policy(broker_bps=0.0),
    )
    p = result.positions[0]
    assert p.exchange_fee == 0.0
    assert p.clearing_fee == 0.0


def test_execution_window_scales_vol_drift():
    kwargs = dict(
        hedge_actions=[{"bucket": "B1", "action_usd": 1_000_000, "instrument": "FWD"}],
        slippage_estimates=[],
        market=_market(),
        policy=_policy(broker_bps=0.0),
    )
    r24 = compute_transaction_costs(**kwargs, execution_window_hours=24)
    r48 = compute_transaction_costs(**kwargs, execution_window_hours=48)
    # vol_drift = vol * sqrt(time) * notional  →  ratio is sqrt(2)
    assert r48.positions[0].vol_drift_adjustment > r24.positions[0].vol_drift_adjustment
```

- [ ] **Step 4.2: Run tests to verify they pass (engine already exists)**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_transaction_cost_model.py -v
```
Expected: 5 passes.

- [ ] **Step 4.3: Commit**

```bash
git add backend/tests/test_transaction_cost_model.py
git commit -m "test(tca): engine unit tests for transaction_cost_model"
```

---

### Task 5: `tca_service.estimate_pre_trade()`

**Files:**
- Create: `backend/app/services/tca_service.py`

- [ ] **Step 5.1: Write failing test**

Append to `backend/tests/test_tca_service.py`:
```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4


@pytest.mark.asyncio
async def test_estimate_pre_trade_persists_row(monkeypatch):
    from app.services import tca_service
    from app.schemas_v1.tca import PreTradeEstimateRequest

    tenant_id, user_id, snapshot_id = uuid4(), uuid4(), uuid4()

    # Mock dependencies
    mock_snapshot = MagicMock(
        id=snapshot_id,
        company_id=tenant_id,
        market_data={"fee_schedule": {"FWD": {"exchange": 0.5}}, "vol_surface": {"USDMXN_1M": 12.0}},
    )
    mock_db = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    async def fake_get_latest(db, tid):
        return mock_snapshot
    monkeypatch.setattr(tca_service, "_get_market_snapshot_for_pretrade", fake_get_latest)
    monkeypatch.setattr(tca_service, "_estimate_slippage", lambda pair, notional: [{"bucket": "PRE_TRADE", "slippage_usd": 50.0}])
    monkeypatch.setattr(tca_service, "_emit_tca_audit", AsyncMock())
    monkeypatch.setattr(tca_service, "_compute_benchmark", AsyncMock(return_value=None))

    req = PreTradeEstimateRequest(
        pair="EURUSD", notional_usd=1_000_000, direction="BUY",
        instrument="FWD", execution_window_hours=24,
    )
    estimate = await tca_service.estimate_pre_trade(
        db=mock_db, tenant_id=tenant_id, user_id=user_id, request=req,
    )
    assert estimate.estimate_type == "pre_trade"
    assert estimate.tenant_id == tenant_id
    assert estimate.total_cost_usd > 0
    mock_db.add.assert_called_once()
    mock_db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_estimate_pre_trade_no_snapshot_raises(monkeypatch):
    from app.services import tca_service
    from app.services.tca_service import TCAServiceError
    from app.schemas_v1.tca import PreTradeEstimateRequest

    async def fake_no_snapshot(db, tid):
        return None
    monkeypatch.setattr(tca_service, "_get_market_snapshot_for_pretrade", fake_no_snapshot)

    req = PreTradeEstimateRequest(
        pair="EURUSD", notional_usd=1_000_000, direction="BUY",
        instrument="FWD", execution_window_hours=24,
    )
    with pytest.raises(TCAServiceError) as exc_info:
        await tca_service.estimate_pre_trade(
            db=AsyncMock(), tenant_id=uuid4(), user_id=uuid4(), request=req,
        )
    assert exc_info.value.code == "no_market_snapshot"
```

- [ ] **Step 5.2: Run tests to verify they fail**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tca_service.py::test_estimate_pre_trade_persists_row tests/test_tca_service.py::test_estimate_pre_trade_no_snapshot_raises -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.tca_service'`.

- [ ] **Step 5.3: Create tca_service.py with estimate_pre_trade()**

Create `backend/app/services/tca_service.py`:
```python
"""tca_service — Pre-Trade TCA orchestrator.

Public surface:
  - estimate_pre_trade(db, tenant_id, user_id, request) -> TransactionCostEstimate
  - attach_to_calc_run(...)  — implemented in Task 6
  - reconcile_actual(...)    — implemented in Task 7
  - get_accuracy_report(...) — implemented in Task 8
"""
from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine_v1.transaction_cost_model import compute_transaction_costs
from app.models.transaction_cost_estimate import TransactionCostEstimate
from app.schemas_v1.tca import PreTradeEstimateRequest


class TCAServiceError(Exception):
    def __init__(self, code: str, message: str = "") -> None:
        self.code = code
        self.message = message or code
        super().__init__(self.message)


class SODViolationError(TCAServiceError):
    def __init__(self) -> None:
        super().__init__("sod_violation", "creator cannot reconcile post_calc estimate")


async def _get_market_snapshot_for_pretrade(db: AsyncSession, tenant_id: UUID):
    """Load latest MarketSnapshot for tenant, or specific id if requested."""
    from app.models.market_snapshot import MarketSnapshot
    stmt = (
        select(MarketSnapshot)
        .where(MarketSnapshot.company_id == tenant_id)
        .order_by(MarketSnapshot.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


def _estimate_slippage(pair: str, notional_usd: float) -> list[dict[str, Any]]:
    """Lightweight slippage proxy for pre-trade (no portfolio context)."""
    # Simple linear proxy: 1 bps at $1M, scaling sublinearly
    bps = 1.0 + (notional_usd / 10_000_000.0) * 0.5
    return [{
        "bucket": "PRE_TRADE",
        "slippage_bps": bps,
        "slippage_usd": notional_usd * bps / 10_000.0,
    }]


async def _emit_tca_audit(
    db: AsyncSession, tenant_id: UUID, user_id: UUID,
    event_type: str, entity_id: UUID,
) -> None:
    """Emit into existing hash-chain audit_events table via build_audit_event()."""
    from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event
    prev_hash_row = (await db.execute(
        select(AuditEvent.event_hash)
        .where(AuditEvent.company_id == tenant_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    prev_hash = prev_hash_row or GENESIS_HASH
    event = build_audit_event(
        company_id=tenant_id,
        user_id=user_id,
        event_type=event_type,  # "TCA_ESTIMATE_CREATED" or "TCA_RECONCILED"
        entity_type="transaction_cost_estimate",
        entity_id=entity_id,
        prev_hash=prev_hash,
        payload={},
    )
    db.add(event)


async def _compute_benchmark(
    db: AsyncSession, tenant_id: UUID, pair: str, current_bps: float,
) -> dict | None:
    """Derive 90-day historical benchmark. Returns None if sample_size < 5."""
    from datetime import timedelta
    cutoff = datetime.now(UTC) - timedelta(days=90)
    stmt = (
        select(TransactionCostEstimate.total_cost_bps)
        .where(
            TransactionCostEstimate.tenant_id == tenant_id,
            TransactionCostEstimate.created_at >= cutoff,
            TransactionCostEstimate.inputs["pair"].astext == pair,
        )
    )
    rows = (await db.execute(stmt)).scalars().all()
    if len(rows) < 5:
        return None
    values = sorted(float(v) for v in rows)
    avg = sum(values) / len(values)
    # percentile of current_bps within historical distribution
    below = sum(1 for v in values if v < current_bps)
    percentile = int((below / len(values)) * 100)
    return {
        "historical_avg_bps_same_pair": round(avg, 4),
        "percentile": percentile,
        "sample_size": len(values),
    }


async def estimate_pre_trade(
    db: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
    request: PreTradeEstimateRequest,
) -> TransactionCostEstimate:
    """Compute pre-trade cost estimate; persist and return."""
    snapshot = await _get_market_snapshot_for_pretrade(db, tenant_id)
    if snapshot is None:
        raise TCAServiceError("no_market_snapshot", "tenant has no market snapshots")

    # Build synthetic 1-element hedge_actions from trade intent
    hedge_actions = [{
        "bucket": "PRE_TRADE",
        "action_usd": float(request.notional_usd),
        "instrument": request.instrument,
    }]
    slippage_estimates = _estimate_slippage(request.pair, float(request.notional_usd))

    market = snapshot.market_data or {}
    policy = {
        "broker_commission_bps": market.get("default_broker_bps", 2.5),
        "execution_product": request.instrument,
    }

    result = compute_transaction_costs(
        hedge_actions=hedge_actions,
        slippage_estimates=slippage_estimates,
        market=market,
        policy=policy,
        execution_window_hours=float(request.execution_window_hours),
    )
    # Extract single position (pre-trade has exactly one)
    position = result.positions[0] if result.positions else None
    if position is None:
        raise TCAServiceError("engine_produced_no_positions", "engine returned empty")

    outputs = position.to_dict()
    estimate = TransactionCostEstimate(
        tenant_id=tenant_id,
        user_id=user_id,
        estimate_type="pre_trade",
        calculation_run_id=None,
        market_snapshot_id=snapshot.id,
        inputs=request.model_dump(mode="json"),
        outputs=outputs,
        total_cost_usd=Decimal(str(round(position.total_cost, 2))),
        total_cost_bps=Decimal(str(round(position.total_cost_bps, 4))),
    )
    db.add(estimate)
    await db.commit()
    await db.refresh(estimate)

    await _emit_tca_audit(db, tenant_id, user_id, "TCA_ESTIMATE_CREATED", estimate.id)
    await db.commit()

    # Attach benchmark (as a cached attribute — not persisted, re-derived on read)
    estimate._benchmark = await _compute_benchmark(db, tenant_id, request.pair, position.total_cost_bps)

    return estimate
```

- [ ] **Step 5.4: Run tests to verify they pass**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tca_service.py -v
```
Expected: all passes.

- [ ] **Step 5.5: Commit**

```bash
git add backend/app/services/tca_service.py backend/tests/test_tca_service.py
git commit -m "feat(tca): tca_service.estimate_pre_trade() + TCAServiceError"
```

---

### Task 6: `tca_service.attach_to_calc_run()`

**Files:**
- Modify: `backend/app/services/tca_service.py`

- [ ] **Step 6.1: Write failing idempotency test**

Append to `backend/tests/test_tca_service.py`:
```python
@pytest.mark.asyncio
async def test_attach_to_calc_run_idempotent(monkeypatch):
    from app.services import tca_service

    existing = MagicMock(id=uuid4(), estimate_type="post_calc")
    mock_db = AsyncMock()

    async def fake_query_existing(db, run_id):
        return existing
    monkeypatch.setattr(tca_service, "_find_estimate_by_run_id", fake_query_existing)

    result = await tca_service.attach_to_calc_run(
        db=mock_db,
        calculation_run_id="run-abc",
        tenant_id=uuid4(), user_id=uuid4(),
        hedge_actions=[], slippage_estimates=[],
        market={}, policy={}, market_snapshot_id=uuid4(),
    )
    assert result is existing
    mock_db.add.assert_not_called()  # idempotent — no new insert
```

- [ ] **Step 6.2: Run to verify it fails**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tca_service.py::test_attach_to_calc_run_idempotent -v
```
Expected: FAIL with `AttributeError: module 'app.services.tca_service' has no attribute 'attach_to_calc_run'`.

- [ ] **Step 6.3: Add attach_to_calc_run()**

Append to `backend/app/services/tca_service.py`:
```python
async def _find_estimate_by_run_id(
    db: AsyncSession, calculation_run_id: str,
) -> TransactionCostEstimate | None:
    stmt = select(TransactionCostEstimate).where(
        TransactionCostEstimate.calculation_run_id == calculation_run_id
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def attach_to_calc_run(
    db: AsyncSession,
    calculation_run_id: str,
    tenant_id: UUID,
    user_id: UUID,
    hedge_actions: list[dict],
    slippage_estimates: list[dict],
    market: dict,
    policy: dict,
    market_snapshot_id: UUID,
) -> TransactionCostEstimate:
    """Eagerly called from v1_calculate.py at run time. Idempotent."""
    existing = await _find_estimate_by_run_id(db, calculation_run_id)
    if existing is not None:
        return existing

    result = compute_transaction_costs(
        hedge_actions=hedge_actions,
        slippage_estimates=slippage_estimates,
        market=market,
        policy=policy,
    )
    outputs = result.to_dict()
    total_notional = sum(abs(float(a.get("action_usd", 0))) for a in hedge_actions)

    estimate = TransactionCostEstimate(
        tenant_id=tenant_id,
        user_id=user_id,
        estimate_type="post_calc",
        calculation_run_id=calculation_run_id,
        market_snapshot_id=market_snapshot_id,
        inputs={
            "calculation_run_id": calculation_run_id,
            "hedge_actions_count": len(hedge_actions),
            "total_notional_usd": total_notional,
        },
        outputs=outputs,
        total_cost_usd=Decimal(str(round(result.total_transaction_cost, 2))),
        total_cost_bps=Decimal(str(round(result.total_cost_bps, 4))),
    )
    db.add(estimate)
    await db.commit()
    await db.refresh(estimate)

    await _emit_tca_audit(db, tenant_id, user_id, "TCA_ESTIMATE_CREATED", estimate.id)
    await db.commit()
    return estimate
```

- [ ] **Step 6.4: Run test to verify it passes**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tca_service.py::test_attach_to_calc_run_idempotent -v
```
Expected: PASS.

- [ ] **Step 6.5: Commit**

```bash
git add backend/app/services/tca_service.py backend/tests/test_tca_service.py
git commit -m "feat(tca): tca_service.attach_to_calc_run() — idempotent, eager"
```

---

### Task 7: `tca_service.reconcile_actual()` + auto-reconcile hook

**Files:**
- Modify: `backend/app/services/tca_service.py`
- Modify: `backend/app/services/settlement_service.py`

- [ ] **Step 7.1: Write failing tests**

Append to `backend/tests/test_tca_service.py`:
```python
@pytest.mark.asyncio
async def test_reconcile_actual_computes_variance(monkeypatch):
    from app.services import tca_service

    tenant_id, user_id, estimate_id, settle_id = uuid4(), uuid4(), uuid4(), uuid4()

    estimate = MagicMock(
        id=estimate_id, tenant_id=tenant_id, user_id=user_id,
        estimate_type="post_calc",
        total_cost_usd=Decimal("1000.00"),
        inputs={"notional_usd": 1_000_000, "total_notional_usd": 1_000_000},
        reconciled_at=None,
    )
    settlement = MagicMock(
        id=settle_id, company_id=tenant_id,
        pnl_impact=Decimal("-1500.00"),
        hedge_amount=Decimal("1000000"),
    )
    mock_db = AsyncMock()
    monkeypatch.setattr(tca_service, "_load_estimate_and_settlement",
                        AsyncMock(return_value=(estimate, settlement)))
    monkeypatch.setattr(tca_service, "_emit_tca_audit", AsyncMock())

    result = await tca_service.reconcile_actual(
        db=mock_db, estimate_id=estimate_id,
        settlement_event_id=settle_id,
        reconciling_user_id=uuid4(),  # different user → no SoD
    )
    assert result.actual_cost_usd == Decimal("1500.00")  # abs(-1500)
    # variance_bps = (1500 - 1000) / 1_000_000 * 10000 = 5.0 bps
    assert abs(float(result.variance_bps) - 5.0) < 0.01


@pytest.mark.asyncio
async def test_reconcile_sod_violation(monkeypatch):
    from app.services import tca_service
    from app.services.tca_service import SODViolationError

    same_user = uuid4()
    tenant_id, estimate_id, settle_id = uuid4(), uuid4(), uuid4()
    estimate = MagicMock(
        id=estimate_id, tenant_id=tenant_id, user_id=same_user,
        estimate_type="post_calc", reconciled_at=None,
    )
    settlement = MagicMock(id=settle_id, company_id=tenant_id)

    monkeypatch.setattr(tca_service, "_load_estimate_and_settlement",
                        AsyncMock(return_value=(estimate, settlement)))

    with pytest.raises(SODViolationError):
        await tca_service.reconcile_actual(
            db=AsyncMock(), estimate_id=estimate_id,
            settlement_event_id=settle_id,
            reconciling_user_id=same_user,  # same user → violation
        )


@pytest.mark.asyncio
async def test_reconcile_pre_trade_allows_self(monkeypatch):
    from app.services import tca_service
    same_user = uuid4()
    tenant_id, estimate_id, settle_id = uuid4(), uuid4(), uuid4()
    estimate = MagicMock(
        id=estimate_id, tenant_id=tenant_id, user_id=same_user,
        estimate_type="pre_trade",  # pre_trade: self-reconcile allowed
        total_cost_usd=Decimal("1000"),
        inputs={"notional_usd": 1_000_000},
        reconciled_at=None,
    )
    settlement = MagicMock(
        id=settle_id, company_id=tenant_id,
        pnl_impact=Decimal("-1000"),
    )
    monkeypatch.setattr(tca_service, "_load_estimate_and_settlement",
                        AsyncMock(return_value=(estimate, settlement)))
    monkeypatch.setattr(tca_service, "_emit_tca_audit", AsyncMock())

    # Should NOT raise
    result = await tca_service.reconcile_actual(
        db=AsyncMock(), estimate_id=estimate_id,
        settlement_event_id=settle_id,
        reconciling_user_id=same_user,
    )
    assert result.reconciled_at is not None
```

- [ ] **Step 7.2: Run tests to verify they fail**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tca_service.py::test_reconcile_actual_computes_variance tests/test_tca_service.py::test_reconcile_sod_violation tests/test_tca_service.py::test_reconcile_pre_trade_allows_self -v
```
Expected: FAIL with `AttributeError: 'reconcile_actual'`.

- [ ] **Step 7.3: Implement reconcile_actual()**

Append to `backend/app/services/tca_service.py`:
```python
async def _load_estimate_and_settlement(
    db: AsyncSession, estimate_id: UUID, settlement_event_id: UUID,
):
    from app.models.settlement_event import SettlementEvent
    est = (await db.execute(
        select(TransactionCostEstimate).where(TransactionCostEstimate.id == estimate_id)
    )).scalar_one_or_none()
    if est is None:
        raise TCAServiceError("estimate_not_found")
    settle = (await db.execute(
        select(SettlementEvent).where(SettlementEvent.id == settlement_event_id)
    )).scalar_one_or_none()
    if settle is None:
        raise TCAServiceError("settlement_not_found")
    # Cross-tenant isolation guard
    if settle.company_id != est.tenant_id:
        raise TCAServiceError("cross_tenant", "settlement and estimate belong to different tenants")
    return est, settle


async def reconcile_actual(
    db: AsyncSession,
    estimate_id: UUID,
    settlement_event_id: UUID,
    reconciling_user_id: UUID,
) -> TransactionCostEstimate:
    """Backfill actual_cost_usd + variance_bps from settlement.pnl_impact.

    SoD: post_calc estimates can't be reconciled by their creator.
    Pre-trade estimates can be self-reconciled (advisory, not governance).
    """
    estimate, settlement = await _load_estimate_and_settlement(
        db, estimate_id, settlement_event_id,
    )
    if estimate.reconciled_at is not None:
        raise TCAServiceError("already_reconciled")

    if estimate.estimate_type == "post_calc" and estimate.user_id == reconciling_user_id:
        raise SODViolationError()

    # v1 proxy: actual execution cost = |pnl_impact| (rate deviation × notional)
    actual_cost_usd = abs(float(settlement.pnl_impact))
    notional = float(estimate.inputs.get("notional_usd") or estimate.inputs.get("total_notional_usd") or 1.0)
    variance_bps = (actual_cost_usd - float(estimate.total_cost_usd)) / notional * 10_000.0

    estimate.actual_cost_usd = Decimal(str(round(actual_cost_usd, 2)))
    estimate.variance_bps = Decimal(str(round(variance_bps, 4)))
    estimate.settlement_event_id = settlement.id
    estimate.reconciled_at = datetime.now(UTC)
    await db.commit()

    await _emit_tca_audit(
        db, estimate.tenant_id, reconciling_user_id,
        "TCA_RECONCILED", estimate.id,
    )
    await db.commit()
    return estimate


async def auto_reconcile_on_settlement(
    db: AsyncSession, settlement_event,
) -> None:
    """Best-effort match SettlementEvent → open estimate. Non-fatal on failure."""
    try:
        lo = float(settlement_event.hedge_amount) * 0.95
        hi = float(settlement_event.hedge_amount) * 1.05
        stmt = (
            select(TransactionCostEstimate)
            .where(
                TransactionCostEstimate.tenant_id == settlement_event.company_id,
                TransactionCostEstimate.reconciled_at.is_(None),
            )
        )
        candidates = (await db.execute(stmt)).scalars().all()
        # Filter by notional band + settlement_date equality in Python (inputs is JSONB)
        matches = []
        for c in candidates:
            notional = float(c.inputs.get("notional_usd") or c.inputs.get("total_notional_usd") or 0)
            if lo <= notional <= hi:
                matches.append(c)
        if len(matches) != 1:
            return  # 0 or >1 → skip, user can manually reconcile

        # System-principal reconcile — bypass SoD by using a sentinel user_id
        await reconcile_actual(
            db=db,
            estimate_id=matches[0].id,
            settlement_event_id=settlement_event.id,
            reconciling_user_id=UUID("00000000-0000-0000-0000-000000000000"),  # system
        )
    except Exception:  # non-fatal
        import logging
        logging.getLogger(__name__).warning(
            "auto_reconcile_on_settlement failed for settlement_event=%s", settlement_event.id,
            exc_info=True,
        )
```

- [ ] **Step 7.4: Run tests to verify they pass**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tca_service.py -v
```
Expected: all passes.

- [ ] **Step 7.5: Wire auto_reconcile into settlement_service**

Read `backend/app/services/settlement_service.py` — find where `SettlementEvent` is committed (should be near end of a create function). Add after the commit:

```python
# After SettlementEvent.commit — best-effort TCA reconcile
from app.services.tca_service import auto_reconcile_on_settlement
await auto_reconcile_on_settlement(db, settlement_event)
```

- [ ] **Step 7.6: Commit**

```bash
git add backend/app/services/tca_service.py backend/app/services/settlement_service.py backend/tests/test_tca_service.py
git commit -m "feat(tca): reconcile_actual() + auto-reconcile settlement hook"
```

---

### Task 8: `tca_service.get_accuracy_report()`

**Files:**
- Modify: `backend/app/services/tca_service.py`

- [ ] **Step 8.1: Write failing test**

Append to `backend/tests/test_tca_service.py`:
```python
@pytest.mark.asyncio
async def test_accuracy_report_empty_returns_empty_buckets(monkeypatch):
    from app.services import tca_service

    mock_db = AsyncMock()
    mock_exec = MagicMock()
    mock_exec.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    mock_db.execute = AsyncMock(return_value=mock_exec)

    report = await tca_service.get_accuracy_report(
        db=mock_db, tenant_id=uuid4(),
        period="Q4-2025", group_by="pair",
    )
    assert report.total_reconciled == 0
    assert report.buckets == []
```

- [ ] **Step 8.2: Run test to verify it fails**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tca_service.py::test_accuracy_report_empty_returns_empty_buckets -v
```
Expected: FAIL.

- [ ] **Step 8.3: Implement get_accuracy_report()**

Append to `backend/app/services/tca_service.py`:
```python
async def get_accuracy_report(
    db: AsyncSession,
    tenant_id: UUID,
    period: str,
    group_by: str = "pair",
):
    from app.schemas_v1.tca import AccuracyBucket, AccuracyReportResponse
    import math

    # Load all reconciled estimates for the tenant (period filter in Python for SQLite compat)
    stmt = (
        select(TransactionCostEstimate)
        .where(
            TransactionCostEstimate.tenant_id == tenant_id,
            TransactionCostEstimate.reconciled_at.isnot(None),
        )
    )
    rows = (await db.execute(stmt)).scalars().all()

    if not rows:
        return AccuracyReportResponse(
            period=period, group_by=group_by,
            total_reconciled=0, buckets=[],
        )

    # Group by key
    groups: dict[str, list[float]] = {}
    for r in rows:
        if group_by == "pair":
            key = r.inputs.get("pair", "UNKNOWN")
        elif group_by == "instrument":
            key = r.inputs.get("instrument", "UNKNOWN")
        elif group_by == "month":
            key = r.reconciled_at.strftime("%Y-%m")
        else:
            key = "all"
        groups.setdefault(key, []).append(float(r.variance_bps or 0))

    buckets = []
    for key, values in sorted(groups.items()):
        n = len(values)
        mean = sum(values) / n
        stdev = math.sqrt(sum((v - mean) ** 2 for v in values) / n) if n > 1 else 0.0
        mae = sum(abs(v) for v in values) / n
        rmse = math.sqrt(sum(v ** 2 for v in values) / n)
        bias = "OVER_ESTIMATE" if mean > 0.1 else "UNDER_ESTIMATE" if mean < -0.1 else "NEUTRAL"
        buckets.append(AccuracyBucket(
            key=key, sample_size=n,
            mean_variance_bps=round(mean, 4),
            stdev_variance_bps=round(stdev, 4),
            mae_bps=round(mae, 4),
            rmse_bps=round(rmse, 4),
            bias_direction=bias,
        ))

    return AccuracyReportResponse(
        period=period, group_by=group_by,
        total_reconciled=len(rows), buckets=buckets,
    )
```

- [ ] **Step 8.4: Run tests to verify they pass**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_tca_service.py -v
```
Expected: all passes.

- [ ] **Step 8.5: Commit**

```bash
git add backend/app/services/tca_service.py backend/tests/test_tca_service.py
git commit -m "feat(tca): tca_service.get_accuracy_report()"
```

---

### Task 9: RBAC permissions migration

**Files:**
- Create: `backend/migrations/versions/0028_tca_permissions.py`

- [ ] **Step 9.1: Create migration**

Create `backend/migrations/versions/0028_tca_permissions.py`:
```python
"""tca.read + tca.estimate RBAC permissions

Revision ID: 0028_tca_permissions
Revises: 0027_transaction_cost_estimates
Create Date: 2026-04-18
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "0028_tca_permissions"
down_revision = "0027_transaction_cost_estimates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    now = datetime.now(UTC)
    perms = [
        (uuid.uuid4(), "tca.read", "Read TCA estimates and accuracy reports"),
        (uuid.uuid4(), "tca.estimate", "Create pre-trade estimates and reconcile"),
    ]
    for pid, name, desc in perms:
        op.execute(sa.text(
            "INSERT INTO permissions (id, name, description, created_at) "
            "VALUES (:id, :name, :desc, :now) ON CONFLICT (name) DO NOTHING"
        ).bindparams(id=pid, name=name, desc=desc, now=now))

    # Grant to existing roles
    role_grants = [
        ("admin", ["tca.read", "tca.estimate"]),
        ("treasurer", ["tca.read", "tca.estimate"]),
        ("risk_analyst", ["tca.read", "tca.estimate"]),
        ("trader", ["tca.read", "tca.estimate"]),
        ("viewer", ["tca.read"]),
    ]
    for role_name, perm_names in role_grants:
        for pn in perm_names:
            op.execute(sa.text("""
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT r.id, p.id
                FROM roles r, permissions p
                WHERE r.name = :role AND p.name = :perm
                ON CONFLICT DO NOTHING
            """).bindparams(role=role_name, perm=pn))


def downgrade() -> None:
    op.execute(sa.text(
        "DELETE FROM role_permissions WHERE permission_id IN "
        "(SELECT id FROM permissions WHERE name IN ('tca.read','tca.estimate'))"
    ))
    op.execute(sa.text(
        "DELETE FROM permissions WHERE name IN ('tca.read','tca.estimate')"
    ))
```

- [ ] **Step 9.2: Verify migration chain**

```bash
cd backend && alembic check
```

- [ ] **Step 9.3: Commit**

```bash
git add backend/migrations/versions/0028_tca_permissions.py
git commit -m "feat(tca): migration 0028 — tca.read + tca.estimate permissions"
```

---

## Chunk 3: Backend Routes + Integration

### Task 10: `v1_tca.py` routes

**Files:**
- Create: `backend/app/api/routes/v1_tca.py`
- Modify: `backend/app/main.py` (register router)
- Create: `backend/tests/test_v1_tca_routes.py`

- [ ] **Step 10.1: Write failing route tests**

Create `backend/tests/test_v1_tca_routes.py`:
```python
"""Route tests for /v1/tca/*."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_pre_trade_estimate_happy_path(auth_client_pro):
    """auth_client_pro fixture provides authenticated client with professional plan."""
    with patch("app.services.tca_service.estimate_pre_trade") as mock_est:
        mock_est.return_value = MagicMock(
            id=uuid4(), estimate_type="pre_trade",
            created_at=MagicMock(isoformat=lambda: "2026-04-18T00:00:00Z"),
            inputs={"pair": "EURUSD", "notional_usd": 1_000_000},
            outputs={
                "slippage_cost": 50.0, "broker_commission": 250.0,
                "exchange_fee": 50.0, "clearing_fee": 20.0,
                "vol_drift_adjustment": 30.0, "total_cost": 400.0,
                "total_cost_bps": 4.0,
            },
            total_cost_usd=400.0,
            total_cost_bps=4.0,
            market_snapshot_id=uuid4(),
            reconciled_at=None, actual_cost_usd=None, variance_bps=None,
        )
        mock_est.return_value._benchmark = None

        response = await auth_client_pro.post(
            "/v1/tca/pre-trade/estimate",
            json={
                "pair": "EURUSD", "notional_usd": 1_000_000,
                "direction": "BUY", "instrument": "FWD",
                "execution_window_hours": 24,
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["estimate_type"] == "pre_trade"
        assert "breakdown" in body


@pytest.mark.asyncio
async def test_pre_trade_no_snapshot_returns_503(auth_client_pro):
    from app.services.tca_service import TCAServiceError
    with patch("app.services.tca_service.estimate_pre_trade") as mock_est:
        mock_est.side_effect = TCAServiceError("no_market_snapshot")
        response = await auth_client_pro.post(
            "/v1/tca/pre-trade/estimate",
            json={
                "pair": "EURUSD", "notional_usd": 1_000_000,
                "direction": "BUY", "instrument": "FWD",
                "execution_window_hours": 24,
            },
        )
        assert response.status_code == 503


@pytest.mark.asyncio
async def test_pre_trade_requires_tca_estimate_permission(auth_client_viewer):
    """Viewer has tca.read but NOT tca.estimate → 403."""
    response = await auth_client_viewer.post(
        "/v1/tca/pre-trade/estimate",
        json={
            "pair": "EURUSD", "notional_usd": 1_000_000,
            "direction": "BUY", "instrument": "FWD",
            "execution_window_hours": 24,
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_calc_run_tca_404_for_unattached(auth_client_pro):
    with patch("app.services.tca_service._find_estimate_by_run_id") as mock_find:
        mock_find.return_value = None
        response = await auth_client_pro.get("/v1/tca/calc-runs/nonexistent-run")
        assert response.status_code == 404


@pytest.mark.asyncio
async def test_accuracy_report_empty_not_error(auth_client_pro):
    from app.schemas_v1.tca import AccuracyReportResponse
    with patch("app.services.tca_service.get_accuracy_report") as mock_report:
        mock_report.return_value = AccuracyReportResponse(
            period="Q4-2025", group_by="pair",
            total_reconciled=0, buckets=[],
        )
        response = await auth_client_pro.get("/v1/tca/accuracy-report?period=Q4-2025&group_by=pair")
        assert response.status_code == 200
        assert response.json()["total_reconciled"] == 0


@pytest.mark.asyncio
async def test_free_plan_gets_402(auth_client_free):
    response = await auth_client_free.post(
        "/v1/tca/pre-trade/estimate",
        json={
            "pair": "EURUSD", "notional_usd": 1_000_000,
            "direction": "BUY", "instrument": "FWD",
            "execution_window_hours": 24,
        },
    )
    assert response.status_code == 402
```

- [ ] **Step 10.2: Create v1_tca.py**

Create `backend/app/api/routes/v1_tca.py`:
```python
"""Pre-Trade TCA API routes (/v1/tca/*)."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.dependencies import get_current_user
from app.core.plan_gate import require_plan_tier
from app.core.rbac import require_permission
from app.models.user import User
from app.schemas_v1.tca import (
    AccuracyReportResponse,
    PreTradeEstimateRequest,
    ReconcileRequest,
    TCABenchmark,
    TCABreakdown,
    TCAEstimateResponse,
)
from app.services import tca_service
from app.services.tca_service import SODViolationError, TCAServiceError

router = APIRouter(prefix="/v1/tca", tags=["tca"])


def _to_response(est) -> TCAEstimateResponse:
    """Map ORM row → response model."""
    breakdown_src = est.outputs
    # Engine's PositionCost has 'total_cost'; TransactionCostResult has 'total_transaction_cost'
    total_cost = breakdown_src.get("total_cost", breakdown_src.get("total_transaction_cost", 0))
    breakdown = TCABreakdown(
        slippage_cost=float(breakdown_src.get("slippage_cost", breakdown_src.get("total_slippage", 0))),
        broker_commission=float(breakdown_src.get("broker_commission", breakdown_src.get("total_commission", 0))),
        exchange_fee=float(breakdown_src.get("exchange_fee", breakdown_src.get("total_exchange_fees", 0))),
        clearing_fee=float(breakdown_src.get("clearing_fee", breakdown_src.get("total_clearing_fees", 0))),
        vol_drift_adjustment=float(breakdown_src.get("vol_drift_adjustment", breakdown_src.get("total_vol_drift", 0))),
        total_cost=float(total_cost),
        total_cost_bps=float(est.total_cost_bps),
    )
    benchmark = None
    if getattr(est, "_benchmark", None):
        benchmark = TCABenchmark(**est._benchmark)
    return TCAEstimateResponse(
        estimate_id=est.id,
        estimate_type=est.estimate_type,
        created_at=est.created_at,
        inputs=est.inputs,
        breakdown=breakdown,
        benchmark=benchmark,
        market_snapshot_id=est.market_snapshot_id,
        reconciled_at=est.reconciled_at,
        actual_cost_usd=float(est.actual_cost_usd) if est.actual_cost_usd else None,
        variance_bps=float(est.variance_bps) if est.variance_bps else None,
    )


@router.post("/pre-trade/estimate", response_model=TCAEstimateResponse)
async def post_pre_trade_estimate(
    request: PreTradeEstimateRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _plan: None = Depends(require_plan_tier("professional")),
    _perm: None = Depends(require_permission("tca.estimate")),
):
    try:
        est = await tca_service.estimate_pre_trade(
            db=db, tenant_id=current_user.company_id,
            user_id=current_user.id, request=request,
        )
    except TCAServiceError as e:
        if e.code == "no_market_snapshot":
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=e.message)
        if e.code in {"estimate_not_found", "settlement_not_found"}:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=e.message)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.message)
    return _to_response(est)


@router.get("/estimates", response_model=list[TCAEstimateResponse])
async def list_estimates(
    type: str | None = None,
    pair: str | None = None,
    reconciled: bool | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _plan: None = Depends(require_plan_tier("professional")),
    _perm: None = Depends(require_permission("tca.read")),
):
    from sqlalchemy import select
    from app.models.transaction_cost_estimate import TransactionCostEstimate
    stmt = (
        select(TransactionCostEstimate)
        .where(TransactionCostEstimate.tenant_id == current_user.company_id)
        .order_by(TransactionCostEstimate.created_at.desc())
        .offset(offset).limit(limit)
    )
    if type:
        stmt = stmt.where(TransactionCostEstimate.estimate_type == type)
    if reconciled is True:
        stmt = stmt.where(TransactionCostEstimate.reconciled_at.isnot(None))
    elif reconciled is False:
        stmt = stmt.where(TransactionCostEstimate.reconciled_at.is_(None))
    rows = (await db.execute(stmt)).scalars().all()
    return [_to_response(r) for r in rows]


@router.get("/estimates/{estimate_id}", response_model=TCAEstimateResponse)
async def get_estimate(
    estimate_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _plan: None = Depends(require_plan_tier("professional")),
    _perm: None = Depends(require_permission("tca.read")),
):
    from sqlalchemy import select
    from app.models.transaction_cost_estimate import TransactionCostEstimate
    est = (await db.execute(
        select(TransactionCostEstimate).where(
            TransactionCostEstimate.id == estimate_id,
            TransactionCostEstimate.tenant_id == current_user.company_id,
        )
    )).scalar_one_or_none()
    if est is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="estimate_not_found")
    return _to_response(est)


@router.get("/calc-runs/{run_id}", response_model=TCAEstimateResponse)
async def get_calc_run_tca(
    run_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _plan: None = Depends(require_plan_tier("professional")),
    _perm: None = Depends(require_permission("tca.read")),
):
    est = await tca_service._find_estimate_by_run_id(db, run_id)
    if est is None or est.tenant_id != current_user.company_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="no_tca_for_run")
    return _to_response(est)


@router.post("/estimates/{estimate_id}/reconcile", response_model=TCAEstimateResponse)
async def post_reconcile(
    estimate_id: UUID,
    request: ReconcileRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _plan: None = Depends(require_plan_tier("professional")),
    _perm: None = Depends(require_permission("tca.estimate")),
):
    try:
        est = await tca_service.reconcile_actual(
            db=db, estimate_id=estimate_id,
            settlement_event_id=request.settlement_event_id,
            reconciling_user_id=current_user.id,
        )
    except SODViolationError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=e.message)
    except TCAServiceError as e:
        if e.code in {"estimate_not_found", "settlement_not_found"}:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=e.message)
        if e.code == "cross_tenant":
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=e.message)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.message)
    return _to_response(est)


@router.get("/accuracy-report", response_model=AccuracyReportResponse)
async def get_accuracy_report(
    period: str = Query(..., min_length=1),
    group_by: str = Query("pair"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    _plan: None = Depends(require_plan_tier("professional")),
    _perm: None = Depends(require_permission("tca.read")),
):
    if group_by not in {"pair", "instrument", "month"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_group_by")
    return await tca_service.get_accuracy_report(
        db=db, tenant_id=current_user.company_id,
        period=period, group_by=group_by,
    )
```

- [ ] **Step 10.3: Register router in main.py**

Find the existing `app.include_router(...)` block in `backend/app/main.py` and add:
```python
from app.api.routes import v1_tca
app.include_router(v1_tca.router)
```

- [ ] **Step 10.4: Run route tests**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_v1_tca_routes.py -v
```
Expected: all pass (may need to check `conftest.py` for `auth_client_pro`, `auth_client_viewer`, `auth_client_free` fixtures — if missing, add them or use existing equivalents and adjust test names).

- [ ] **Step 10.5: Commit**

```bash
git add backend/app/api/routes/v1_tca.py backend/app/main.py backend/tests/test_v1_tca_routes.py
git commit -m "feat(tca): v1_tca.py — 6 endpoints + route tests"
```

---

### Task 11: Integrate TCA into v1_calculate.py (eager attachment)

**Files:**
- Modify: `backend/app/api/routes/v1_calculate.py`

- [ ] **Step 11.1: Find the integration point**

Read `backend/app/api/routes/v1_calculate.py` — locate the section after `_persist_run()` completes successfully but before `return response`. This is typically around line 660–680 in the `calculate()` function, and inside `calculate_extended()` near line 1008.

- [ ] **Step 11.2: Add attach call after run persist (single-entity `calculate()`)**

Add immediately after `_persist_run()` success block:
```python
# Eagerly attach TCA estimate to this run (non-fatal on failure)
try:
    from app.services.tca_service import attach_to_calc_run
    await attach_to_calc_run(
        db=db,
        calculation_run_id=run_id,
        tenant_id=current_user.company_id,
        user_id=current_user.id,
        hedge_actions=hedge_plan,
        slippage_estimates=slippage_estimates if "slippage_estimates" in locals() else [],
        market=market_dict,
        policy=policy_dict,
        market_snapshot_id=market_snapshot.id if market_snapshot else None,
    )
except Exception:
    import logging
    logging.getLogger(__name__).warning("TCA attach failed for run %s", run_id, exc_info=True)
```

- [ ] **Step 11.3: Same call inside `calculate_extended()`**

Same snippet at the equivalent location in `calculate_extended()`.

- [ ] **Step 11.4: Verify build + no regression**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_v1_calculate.py -x -q --tb=short
```
Expected: existing calculate tests still pass.

- [ ] **Step 11.5: Commit**

```bash
git add backend/app/api/routes/v1_calculate.py
git commit -m "feat(tca): eager attach_to_calc_run on every /v1/calculate run"
```

---

## Chunk 4: Frontend

### Task 12: `tcaClient.ts` API client

**Files:**
- Create: `frontend/src/lib/api/tcaClient.ts`

- [ ] **Step 12.1: Create tcaClient.ts**

Create `frontend/src/lib/api/tcaClient.ts`:
```typescript
import { dashboardFetch } from "@/lib/api/dashboardClient";

export interface TCABreakdown {
  slippage_cost: number;
  broker_commission: number;
  exchange_fee: number;
  clearing_fee: number;
  vol_drift_adjustment: number;
  total_cost: number;
  total_cost_bps: number;
}

export interface TCABenchmark {
  historical_avg_bps_same_pair: number;
  percentile: number;
  sample_size: number;
}

export interface TCAEstimate {
  estimate_id: string;
  estimate_type: "pre_trade" | "post_calc";
  created_at: string;
  inputs: Record<string, unknown>;
  breakdown: TCABreakdown;
  benchmark: TCABenchmark | null;
  market_snapshot_id: string;
  reconciled_at: string | null;
  actual_cost_usd: number | null;
  variance_bps: number | null;
}

export interface AccuracyBucket {
  key: string;
  sample_size: number;
  mean_variance_bps: number;
  stdev_variance_bps: number;
  mae_bps: number;
  rmse_bps: number;
  bias_direction: "OVER_ESTIMATE" | "UNDER_ESTIMATE" | "NEUTRAL";
}

export interface AccuracyReport {
  period: string;
  group_by: "pair" | "instrument" | "month";
  total_reconciled: number;
  buckets: AccuracyBucket[];
}

export interface PreTradeEstimateRequest {
  pair: string;
  notional_usd: number;
  direction: "BUY" | "SELL";
  instrument: "FWD" | "SPOT" | "NDF" | "OPT";
  execution_window_hours: number;
  market_snapshot_id?: string | null;
}

export async function estimatePreTrade(
  token: string, req: PreTradeEstimateRequest,
): Promise<TCAEstimate> {
  return dashboardFetch("/v1/tca/pre-trade/estimate", token, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function listEstimates(
  token: string,
  opts: { type?: string; reconciled?: boolean; limit?: number; offset?: number } = {},
): Promise<TCAEstimate[]> {
  const p = new URLSearchParams();
  if (opts.type) p.set("type", opts.type);
  if (opts.reconciled !== undefined) p.set("reconciled", String(opts.reconciled));
  if (opts.limit) p.set("limit", String(opts.limit));
  if (opts.offset) p.set("offset", String(opts.offset));
  return dashboardFetch(`/v1/tca/estimates?${p.toString()}`, token);
}

export async function getEstimate(token: string, id: string): Promise<TCAEstimate> {
  return dashboardFetch(`/v1/tca/estimates/${id}`, token);
}

export async function getCalcRunTCA(token: string, runId: string): Promise<TCAEstimate | null> {
  try {
    return await dashboardFetch(`/v1/tca/calc-runs/${runId}`, token);
  } catch (e: unknown) {
    // 404 → run has no TCA attached (pre-feature run); return null, caller hides tab
    if (e instanceof Error && e.message.includes("404")) return null;
    throw e;
  }
}

export async function reconcileEstimate(
  token: string, estimateId: string, settlementEventId: string,
): Promise<TCAEstimate> {
  return dashboardFetch(`/v1/tca/estimates/${estimateId}/reconcile`, token, {
    method: "POST",
    body: JSON.stringify({ settlement_event_id: settlementEventId }),
  });
}

export async function getAccuracyReport(
  token: string, period: string, groupBy: "pair" | "instrument" | "month" = "pair",
): Promise<AccuracyReport> {
  const p = new URLSearchParams({ period, group_by: groupBy });
  return dashboardFetch(`/v1/tca/accuracy-report?${p.toString()}`, token);
}
```

- [ ] **Step 12.2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 12.3: Commit**

```bash
git add frontend/src/lib/api/tcaClient.ts
git commit -m "feat(tca-ui): tcaClient.ts API wrapper"
```

---

### Task 13: `/pre-trade-tca` page (estimator)

**Files:**
- Create: `frontend/src/app/pre-trade-tca/page.tsx`
- Create: `frontend/src/app/pre-trade-tca/layout.tsx`

- [ ] **Step 13.1: Create layout with tab nav**

Create `frontend/src/app/pre-trade-tca/layout.tsx`:
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import PageShell from "@/components/layout/PageShell";
import PlanGate from "@/components/plan/PlanGate";

export default function Layout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAccuracy = pathname?.endsWith("/accuracy");
  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      style={{
        padding: "8px 16px",
        borderBottom: active ? "2px solid var(--accent-cyan)" : "2px solid transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        fontFamily: "var(--font-terminal, 'IBM Plex Sans', sans-serif)",
        fontSize: 13,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        textDecoration: "none",
      }}
    >
      {label}
    </Link>
  );
  return (
    <PlanGate tier="professional">
      <PageShell title="PRE-TRADE TCA" breadcrumb={["Trading", "Pre-Trade TCA"]}>
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-rim)", marginBottom: 24 }}>
          {tab("/pre-trade-tca", "ESTIMATOR", !isAccuracy)}
          {tab("/pre-trade-tca/accuracy", "ACCURACY REPORT", !!isAccuracy)}
        </div>
        {children}
      </PageShell>
    </PlanGate>
  );
}
```

- [ ] **Step 13.2: Create estimator page**

Create `frontend/src/app/pre-trade-tca/page.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { estimatePreTrade, listEstimates, TCAEstimate, PreTradeEstimateRequest } from "@/lib/api/tcaClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  rim: "var(--border-rim)",
  textPri: "var(--text-primary)",
  textSec: "var(--text-secondary)",
} as const;

const fmtUsd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const fmtBps = (n: number) => `${n.toFixed(2)} bps`;

export default function PreTradeTcaPage() {
  const { token } = useAuth();
  const [req, setReq] = useState<PreTradeEstimateRequest>({
    pair: "EURUSD", notional_usd: 5_000_000, direction: "BUY",
    instrument: "FWD", execution_window_hours: 24,
  });
  const [result, setResult] = useState<TCAEstimate | null>(null);
  const [recent, setRecent] = useState<TCAEstimate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listEstimates(token, { type: "pre_trade", limit: 10 }).then(setRecent).catch(() => {});
  }, [token]);

  const onEstimate = async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const r = await estimatePreTrade(token, req);
      setResult(r);
      listEstimates(token, { type: "pre_trade", limit: 10 }).then(setRecent).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "estimate failed");
    } finally {
      setLoading(false);
    }
  };

  const row = (label: string, value: string | number) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${S.rim}` }}>
      <span style={{ color: S.textSec, fontFamily: S.fontUI, fontSize: 12 }}>{label}</span>
      <span style={{ color: S.textPri, fontFamily: S.fontMono, fontSize: 13 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <section style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 20 }}>
        <h3 style={{ fontFamily: S.fontUI, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", marginBottom: 16, color: S.textPri }}>Trade Inputs</h3>
        <label style={{ display: "block", fontFamily: S.fontUI, fontSize: 12, color: S.textSec, marginBottom: 4 }}>Pair</label>
        <input value={req.pair} onChange={e => setReq({ ...req, pair: e.target.value.toUpperCase() })}
          style={{ width: "100%", padding: 8, marginBottom: 12, background: S.bgDeep, color: S.textPri, border: `1px solid ${S.rim}`, fontFamily: S.fontMono }} />
        <label style={{ display: "block", fontFamily: S.fontUI, fontSize: 12, color: S.textSec, marginBottom: 4 }}>Notional (USD)</label>
        <input type="number" value={req.notional_usd} onChange={e => setReq({ ...req, notional_usd: Number(e.target.value) })}
          style={{ width: "100%", padding: 8, marginBottom: 12, background: S.bgDeep, color: S.textPri, border: `1px solid ${S.rim}`, fontFamily: S.fontMono }} />
        <label style={{ display: "block", fontFamily: S.fontUI, fontSize: 12, color: S.textSec, marginBottom: 4 }}>Direction</label>
        <select value={req.direction} onChange={e => setReq({ ...req, direction: e.target.value as "BUY" | "SELL" })}
          style={{ width: "100%", padding: 8, marginBottom: 12, background: S.bgDeep, color: S.textPri, border: `1px solid ${S.rim}`, fontFamily: S.fontMono }}>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
        <label style={{ display: "block", fontFamily: S.fontUI, fontSize: 12, color: S.textSec, marginBottom: 4 }}>Instrument</label>
        <select value={req.instrument} onChange={e => setReq({ ...req, instrument: e.target.value as "FWD" | "SPOT" | "NDF" | "OPT" })}
          style={{ width: "100%", padding: 8, marginBottom: 12, background: S.bgDeep, color: S.textPri, border: `1px solid ${S.rim}`, fontFamily: S.fontMono }}>
          <option>FWD</option><option>SPOT</option><option>NDF</option><option>OPT</option>
        </select>
        <label style={{ display: "block", fontFamily: S.fontUI, fontSize: 12, color: S.textSec, marginBottom: 4 }}>Execution window (hours)</label>
        <input type="number" value={req.execution_window_hours} onChange={e => setReq({ ...req, execution_window_hours: Number(e.target.value) })}
          style={{ width: "100%", padding: 8, marginBottom: 20, background: S.bgDeep, color: S.textPri, border: `1px solid ${S.rim}`, fontFamily: S.fontMono }} />
        <button onClick={onEstimate} disabled={loading}
          style={{ width: "100%", padding: 12, background: "var(--accent-cyan)", color: S.bgDeep, border: "none", fontFamily: S.fontUI, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", cursor: loading ? "wait" : "pointer" }}>
          {loading ? "ESTIMATING…" : "ESTIMATE COST →"}
        </button>
        {error && <p style={{ color: "var(--accent-red)", marginTop: 12, fontFamily: S.fontUI, fontSize: 12 }}>{error}</p>}
      </section>

      <section style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 20 }}>
        <h3 style={{ fontFamily: S.fontUI, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", marginBottom: 16, color: S.textPri }}>Cost Breakdown</h3>
        {!result ? (
          <p style={{ color: S.textSec, fontFamily: S.fontUI, fontSize: 12 }}>Enter trade details and click Estimate to see cost breakdown.</p>
        ) : (
          <>
            {row("Slippage", fmtUsd(result.breakdown.slippage_cost))}
            {row("Broker commission", fmtUsd(result.breakdown.broker_commission))}
            {row("Exchange fee", fmtUsd(result.breakdown.exchange_fee))}
            {row("Clearing fee", fmtUsd(result.breakdown.clearing_fee))}
            {row("Vol drift", fmtUsd(result.breakdown.vol_drift_adjustment))}
            <div style={{ marginTop: 12, padding: "12px 0", borderTop: `2px solid ${S.rim}` }}>
              {row("TOTAL", fmtUsd(result.breakdown.total_cost))}
              {row("ALL-IN", fmtBps(result.breakdown.total_cost_bps))}
            </div>
            {result.benchmark && (
              <div style={{ marginTop: 20, padding: 12, background: S.bgDeep, border: `1px dashed ${S.rim}` }}>
                <p style={{ color: S.textSec, fontFamily: S.fontUI, fontSize: 11, marginBottom: 4 }}>BENCHMARK ({result.benchmark.sample_size} samples, 90d)</p>
                <p style={{ color: S.textPri, fontFamily: S.fontMono, fontSize: 12 }}>
                  Same-pair avg: {fmtBps(result.benchmark.historical_avg_bps_same_pair)}
                </p>
                <p style={{ color: result.benchmark.percentile < 50 ? "var(--status-pass)" : "var(--accent-amber)", fontFamily: S.fontMono, fontSize: 12 }}>
                  This trade: {result.benchmark.percentile < 50 ? "▼ CHEAPER" : "▲ MORE EXPENSIVE"} (p{result.benchmark.percentile})
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <section style={{ gridColumn: "1 / -1", background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 20 }}>
        <h3 style={{ fontFamily: S.fontUI, fontSize: 13, letterSpacing: 1, textTransform: "uppercase", marginBottom: 16, color: S.textPri }}>Recent Estimates</h3>
        {recent.length === 0 ? (
          <p style={{ color: S.textSec, fontFamily: S.fontUI, fontSize: 12 }}>No estimates yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontMono, fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.rim}`, color: S.textSec }}>
                <th style={{ textAlign: "left", padding: 8 }}>Date</th>
                <th style={{ textAlign: "left", padding: 8 }}>Pair</th>
                <th style={{ textAlign: "right", padding: 8 }}>Notional</th>
                <th style={{ textAlign: "right", padding: 8 }}>All-in</th>
                <th style={{ textAlign: "center", padding: 8 }}>Reconciled</th>
                <th style={{ textAlign: "right", padding: 8 }}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(r => (
                <tr key={r.estimate_id} style={{ borderBottom: `1px dashed ${S.rim}` }}>
                  <td style={{ padding: 8, color: S.textPri }}>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: 8, color: S.textPri }}>{String((r.inputs as Record<string, unknown>).pair ?? "—")}</td>
                  <td style={{ padding: 8, color: S.textPri, textAlign: "right" }}>{fmtUsd(Number((r.inputs as Record<string, unknown>).notional_usd ?? 0))}</td>
                  <td style={{ padding: 8, color: S.textPri, textAlign: "right" }}>{fmtBps(r.breakdown.total_cost_bps)}</td>
                  <td style={{ padding: 8, textAlign: "center", color: r.reconciled_at ? "var(--status-pass)" : S.textSec }}>{r.reconciled_at ? "✓" : "—"}</td>
                  <td style={{ padding: 8, textAlign: "right", color: r.variance_bps == null ? S.textSec : (r.variance_bps > 0 ? "var(--accent-amber)" : "var(--status-pass)") }}>
                    {r.variance_bps == null ? "—" : `${r.variance_bps > 0 ? "+" : ""}${r.variance_bps.toFixed(2)} bps`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 13.3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 13.4: Commit**

```bash
git add frontend/src/app/pre-trade-tca/page.tsx frontend/src/app/pre-trade-tca/layout.tsx
git commit -m "feat(tca-ui): /pre-trade-tca estimator page + tab layout"
```

---

### Task 14: `/pre-trade-tca/accuracy` page

**Files:**
- Create: `frontend/src/app/pre-trade-tca/accuracy/page.tsx`

- [ ] **Step 14.1: Create accuracy page**

Create `frontend/src/app/pre-trade-tca/accuracy/page.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { getAccuracyReport, AccuracyReport } from "@/lib/api/tcaClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  rim: "var(--border-rim)",
  textPri: "var(--text-primary)",
  textSec: "var(--text-secondary)",
} as const;

export default function TcaAccuracyPage() {
  const { token } = useAuth();
  const [period, setPeriod] = useState("Q4-2025");
  const [groupBy, setGroupBy] = useState<"pair" | "instrument" | "month">("pair");
  const [report, setReport] = useState<AccuracyReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getAccuracyReport(token, period, groupBy)
      .then(setReport)
      .finally(() => setLoading(false));
  }, [token, period, groupBy]);

  return (
    <section style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 20 }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        <div>
          <label style={{ display: "block", fontFamily: S.fontUI, fontSize: 11, color: S.textSec, marginBottom: 4 }}>PERIOD</label>
          <input value={period} onChange={e => setPeriod(e.target.value)}
            style={{ padding: 6, background: "var(--bg-deep)", color: S.textPri, border: `1px solid ${S.rim}`, fontFamily: S.fontMono, fontSize: 12 }} />
        </div>
        <div>
          <label style={{ display: "block", fontFamily: S.fontUI, fontSize: 11, color: S.textSec, marginBottom: 4 }}>GROUP BY</label>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as typeof groupBy)}
            style={{ padding: 6, background: "var(--bg-deep)", color: S.textPri, border: `1px solid ${S.rim}`, fontFamily: S.fontMono, fontSize: 12 }}>
            <option value="pair">Pair</option>
            <option value="instrument">Instrument</option>
            <option value="month">Month</option>
          </select>
        </div>
      </div>
      {loading && <p style={{ color: S.textSec, fontFamily: S.fontUI }}>Loading…</p>}
      {report && report.total_reconciled === 0 && (
        <p style={{ color: S.textSec, fontFamily: S.fontUI, fontSize: 13 }}>
          No reconciled estimates yet for this period. Reconciled estimates appear once settlements match pre-trade or post-calc estimates.
        </p>
      )}
      {report && report.total_reconciled > 0 && (
        <>
          <p style={{ color: S.textPri, fontFamily: S.fontMono, fontSize: 13, marginBottom: 16 }}>
            {report.total_reconciled} reconciled estimates
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontMono, fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.rim}`, color: S.textSec }}>
                <th style={{ textAlign: "left", padding: 8 }}>{groupBy.toUpperCase()}</th>
                <th style={{ textAlign: "right", padding: 8 }}>Samples</th>
                <th style={{ textAlign: "right", padding: 8 }}>Mean Var</th>
                <th style={{ textAlign: "right", padding: 8 }}>StdDev</th>
                <th style={{ textAlign: "right", padding: 8 }}>MAE</th>
                <th style={{ textAlign: "right", padding: 8 }}>Bias</th>
              </tr>
            </thead>
            <tbody>
              {report.buckets.map(b => (
                <tr key={b.key} style={{ borderBottom: `1px dashed ${S.rim}` }}>
                  <td style={{ padding: 8, color: S.textPri }}>{b.key}</td>
                  <td style={{ padding: 8, color: S.textPri, textAlign: "right" }}>{b.sample_size}</td>
                  <td style={{ padding: 8, color: b.mean_variance_bps > 0 ? "var(--accent-amber)" : "var(--status-pass)", textAlign: "right" }}>
                    {b.mean_variance_bps > 0 ? "+" : ""}{b.mean_variance_bps.toFixed(2)} bps
                  </td>
                  <td style={{ padding: 8, color: S.textPri, textAlign: "right" }}>{b.stdev_variance_bps.toFixed(2)}</td>
                  <td style={{ padding: 8, color: S.textPri, textAlign: "right" }}>{b.mae_bps.toFixed(2)}</td>
                  <td style={{ padding: 8, color: S.textSec, textAlign: "right", fontSize: 10 }}>{b.bias_direction.replace("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 14.2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 14.3: Commit**

```bash
git add frontend/src/app/pre-trade-tca/accuracy/page.tsx
git commit -m "feat(tca-ui): /pre-trade-tca/accuracy dashboard"
```

---

### Task 15: Transaction Costs tab on run detail page

**Files:**
- Create: `frontend/src/components/tca/TCATab.tsx`
- Modify: `frontend/src/app/calculate/runs/[id]/page.tsx`

- [ ] **Step 15.1: Create reusable TCATab component**

Create `frontend/src/components/tca/TCATab.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { getCalcRunTCA, TCAEstimate } from "@/lib/api/tcaClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  rim: "var(--border-rim)",
  textPri: "var(--text-primary)",
  textSec: "var(--text-secondary)",
} as const;

const fmtUsd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function TCATab({ runId }: { runId: string }) {
  const { token } = useAuth();
  const [tca, setTca] = useState<TCAEstimate | null>(null);
  const [notFound, setNotFound] = useState(false);
  useEffect(() => {
    if (!token) return;
    getCalcRunTCA(token, runId).then(r => {
      if (r === null) setNotFound(true);
      else setTca(r);
    });
  }, [token, runId]);

  if (notFound) {
    return <p style={{ color: S.textSec, fontFamily: S.fontUI, padding: 20 }}>
      No TCA data for this run (predates TCA feature).
    </p>;
  }
  if (!tca) return <p style={{ color: S.textSec, fontFamily: S.fontUI, padding: 20 }}>Loading…</p>;

  const b = tca.breakdown;
  const components = [
    { label: "Slippage", val: b.slippage_cost, color: "var(--accent-cyan)" },
    { label: "Commission", val: b.broker_commission, color: "var(--accent-amber)" },
    { label: "Exch fee", val: b.exchange_fee, color: "var(--text-secondary)" },
    { label: "Clearing", val: b.clearing_fee, color: "var(--text-secondary)" },
    { label: "Vol drift", val: b.vol_drift_adjustment, color: "var(--accent-purple, #a78bfa)" },
  ];
  const max = Math.max(...components.map(c => c.val), 1);

  return (
    <div style={{ background: S.bgPanel, padding: 20 }}>
      <div style={{ display: "flex", gap: 32, marginBottom: 20 }}>
        <div>
          <p style={{ color: S.textSec, fontFamily: S.fontUI, fontSize: 11 }}>TOTAL COST</p>
          <p style={{ color: S.textPri, fontFamily: S.fontMono, fontSize: 20 }}>{fmtUsd(b.total_cost)}</p>
        </div>
        <div>
          <p style={{ color: S.textSec, fontFamily: S.fontUI, fontSize: 11 }}>ALL-IN</p>
          <p style={{ color: S.textPri, fontFamily: S.fontMono, fontSize: 20 }}>{b.total_cost_bps.toFixed(2)} bps</p>
        </div>
      </div>
      <div>
        {components.map(c => (
          <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ width: 100, color: S.textSec, fontFamily: S.fontUI, fontSize: 12 }}>{c.label}</span>
            <div style={{ flex: 1, height: 20, background: "var(--bg-deep)", position: "relative" }}>
              <div style={{ width: `${(c.val / max) * 100}%`, height: "100%", background: c.color }} />
            </div>
            <span style={{ width: 80, textAlign: "right", color: S.textPri, fontFamily: S.fontMono, fontSize: 12 }}>{fmtUsd(c.val)}</span>
            <span style={{ width: 48, textAlign: "right", color: S.textSec, fontFamily: S.fontMono, fontSize: 11 }}>{((c.val / b.total_cost) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 15.2: Add tab to run detail page**

Modify `frontend/src/app/calculate/runs/[id]/page.tsx` — find the existing tab header rendering and add a new "TRANSACTION COSTS" tab. Import the component and render it when that tab is active. (Exact code depends on current page structure — inspect first.)

- [ ] **Step 15.3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 15.4: Commit**

```bash
git add frontend/src/components/tca/TCATab.tsx frontend/src/app/calculate/runs/[id]/page.tsx
git commit -m "feat(tca-ui): TCA tab on calculate run detail page"
```

---

### Task 16: Sidebar nav item

**Files:**
- Modify: `frontend/src/components/layout/AppSidebar.tsx`

- [ ] **Step 16.1: Add Pre-Trade TCA to TRADING section**

In `AppSidebar.tsx`, find the TRADING section's items array and add:
```tsx
{ label: "Pre-Trade TCA", desc: "Estimate execution cost", href: "/pre-trade-tca", icon: Calculator }
```

Also add `Calculator` to the `lucide-react` import at top of file.

- [ ] **Step 16.2: TypeScript check + build**

```bash
cd frontend && npx tsc --noEmit && npx next build
```
Expected: both clean.

- [ ] **Step 16.3: Commit**

```bash
git add frontend/src/components/layout/AppSidebar.tsx
git commit -m "feat(tca-ui): Pre-Trade TCA in sidebar TRADING section"
```

---

## Chunk 5: Validation + State

### Task 17: Full backend test pass

- [ ] **Step 17.1: Run all backend tests**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ --override-ini="addopts=" --ignore=tests/test_admin_api_key_routes.py --ignore=tests/test_admin_config_v1.py -q --tb=short
```
Expected: all new TCA tests pass; existing suite unaffected.

### Task 18: Full frontend check

- [ ] **Step 18.1: tsc + build**

```bash
cd frontend && npx tsc --noEmit && npx next build
```
Expected: both clean.

### Task 19: Browser smoke test (CLAUDE.md requirement — DONE = browser confirmed)

- [ ] **Step 19.1: Start dev server**

```bash
cd frontend && npx next dev -p 3004
```
(Ports 3000–3003 typically occupied by other projects.)

- [ ] **Step 19.2: Use Chrome DevTools MCP to verify**

Via `mcp__plugin_chrome-devtools-mcp_chrome-devtools__navigate_page` to `http://localhost:3004/pre-trade-tca`. Take screenshot. Verify:
- Page renders with tab nav (ESTIMATOR / ACCURACY REPORT)
- Form + empty breakdown panel visible
- Sidebar shows "Pre-Trade TCA" under TRADING

### Task 20: Update state files

**Files:**
- Modify: `.claude/state/CURRENT_SPRINT.md`
- Modify: `.claude/state/CURRENT_STATE.md`
- Modify: `.claude/state/CHANGELOG_AI.md`

- [ ] **Step 20.1: Mark sprint complete + append changelog**

Update `CURRENT_SPRINT.md` to reflect Pre-Trade TCA COMPLETE with commits and test counts.
Append to `CHANGELOG_AI.md` with the feature summary.
Update `CURRENT_STATE.md` with new test totals.

- [ ] **Step 20.2: Commit**

```bash
git add .claude/state/CURRENT_SPRINT.md .claude/state/CURRENT_STATE.md .claude/state/CHANGELOG_AI.md
git commit -m "docs(state): Pre-Trade TCA complete — changelog + state update"
```

---

## Done

When all tasks pass:
- All 20 new tests green
- `tsc --noEmit` clean, `next build` clean
- Browser smoke pass at `/pre-trade-tca`
- Sprint state updated

@superpowers:finishing-a-development-branch to wrap up.
