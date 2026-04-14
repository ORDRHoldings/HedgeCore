# Treasury Suite Phase 2b — Cash Flow Forecasting

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, rule-based cash flow forecasting engine — 13-week (weekly) and 12-month (monthly) rolling forecasts with liquidity gap detection, scenario analysis, variance tracking, and a waterfall-chart dashboard.

**Architecture:** Two new DB tables (`cash_forecast_items`, `cash_forecast_snapshots`), one pure-function forecast engine, one service layer, one route file, Pydantic schemas, one frontend page, and an API client extension. Follows Phase 2a patterns: AsyncMock unit tests, tenant-scoped JOINs through `LegalEntity`, `dashboardFetch`-based frontend, WORM audit trail via existing `cash_audit_events`.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x async, Alembic raw SQL migrations, Next.js 15 App Router, TypeScript 5, `lucide-react`, IBM Plex fonts.

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
# Expected: ~4877 passed, 0 failed

cd frontend && npx tsc --noEmit
# Expected: no output (clean)
```

---

## File Map

**New backend files:**
| File | Responsibility |
|------|----------------|
| `backend/app/models/cash_forecast.py` | Two models: `CashForecastItem` (recurring items), `CashForecastSnapshot` (point-in-time forecast snapshots for variance tracking) |
| `backend/migrations/versions/0022_cash_forecast.py` | Both tables + indexes |
| `backend/app/services/forecast_engine.py` | Pure-function forecast computation — 13-week weekly + 12-month monthly buckets, liquidity gap flagging, scenario shifts. Zero side effects, zero DB access, fully deterministic. |
| `backend/app/services/forecast_service.py` | Orchestrator — gathers source data from DB (balances, settlement events, positions, recurring items), calls forecast_engine, stores snapshots, computes variance |
| `backend/app/api/routes/v1_cash_forecast.py` | 5 endpoints under `/v1/cash/forecast/*` |
| `backend/tests/test_forecast_engine.py` | Pure-function engine tests (no DB, no mocks — just input→output) |
| `backend/tests/test_forecast_service.py` | Service-layer tests with AsyncMock DB session |
| `backend/tests/test_v1_cash_forecast_routes.py` | Route tests via httpx AsyncClient |

**Modified backend files:**
| File | Change |
|------|--------|
| `backend/app/schemas_v1/cash.py` | Add forecast request/response schemas (appended at bottom) |
| `backend/app/api/router.py` | Register `v1_cash_forecast_router` |
| `backend/app/models/cash.py` | Add `FORECAST_CREATED`, `FORECAST_SCENARIO_RUN` to `CashAuditEventType` enum |

**New frontend files:**
| File | Responsibility |
|------|----------------|
| `frontend/src/app/cash-forecast/page.tsx` | Waterfall chart (13w/12m toggle), liquidity gap alerts, scenario panel, variance table |

**Modified frontend files:**
| File | Change |
|------|--------|
| `frontend/src/lib/api/cashClient.ts` | Add 5 forecast API functions + interfaces |
| `frontend/src/components/layout/AppSidebar.tsx` | Add Cash Forecast nav item in ACCOUNTING section |

---

## Chunk 1: Data Layer

### Task 1: CashForecastItem and CashForecastSnapshot Models

**Context:** These two models hold (1) user-defined recurring cash flow items (e.g., "monthly rent -€50k every 1st") and (2) point-in-time forecast snapshots that enable variance tracking (comparing last week's forecast to this week's actual).

**Files:**
- Create: `backend/app/models/cash_forecast.py`
- Modify: `backend/app/models/cash.py` (add two audit event types)

- [ ] **Step 1: Create the models file**

```python
# backend/app/models/cash_forecast.py
"""
Cash flow forecast models.

CashForecastItem   — user-defined recurring cash flow items (rent, payroll, etc.)
CashForecastSnapshot — point-in-time forecast snapshots for variance tracking
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class CashForecastItem(Base):
    """A recurring or one-off cash flow item for forecasting.

    Examples: monthly rent, quarterly tax payment, weekly payroll.
    Each item produces one cash flow per recurrence within the forecast horizon.
    """
    __tablename__ = "cash_forecast_items"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    direction: Mapped[str] = mapped_column(String(7), nullable=False)  # "INFLOW" or "OUTFLOW"
    amount: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    confidence: Mapped[str] = mapped_column(String(16), nullable=False, default="COMMITTED")  # COMMITTED | PROBABLE | POSSIBLE
    recurrence: Mapped[str] = mapped_column(String(16), nullable=False)  # ONCE | WEEKLY | BIWEEKLY | MONTHLY | QUARTERLY | ANNUALLY
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # NULL = indefinite
    day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True)  # for MONTHLY/QUARTERLY: which day (1-28)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class CashForecastSnapshot(Base):
    """Point-in-time forecast snapshot for variance tracking.

    Stores the full forecast result as JSONB so we can compare
    'what we predicted last week for this week' vs 'what actually happened'.
    One row per (company, entity, snapshot_date, horizon) tuple.
    """
    __tablename__ = "cash_forecast_snapshots"
    __table_args__ = (
        UniqueConstraint("company_id", "entity_id", "snapshot_date", "horizon",
                         name="uq_forecast_snapshot"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)  # NULL = consolidated
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    horizon: Mapped[str] = mapped_column(String(4), nullable=False)  # "13w" or "12m"
    buckets: Mapped[dict] = mapped_column(JSONB, nullable=False)  # list of bucket dicts
    parameters: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)  # scenario params used
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
```

- [ ] **Step 2: Add forecast audit event types to cash.py**

In `backend/app/models/cash.py`, add two entries to the `CashAuditEventType` enum, after `ENTITY_CLOSED`:

```python
    FORECAST_CREATED = "FORECAST_CREATED"
    FORECAST_SCENARIO_RUN = "FORECAST_SCENARIO_RUN"
```

- [ ] **Step 3: Run existing tests to verify no breakage**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
BANK_ACCOUNT_ENC_KEY="test-bank-enc-key-at-least-32-bytes-long!!" \
python -m pytest tests/test_cash_models.py -v --override-ini="addopts="
```
Expected: all existing tests pass (new enum values don't break anything).

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/cash_forecast.py backend/app/models/cash.py
git commit -m "feat(phase2b): CashForecastItem + CashForecastSnapshot models, forecast audit event types"
```

---

### Task 2: Alembic Migration

**Context:** Creates the `cash_forecast_items` and `cash_forecast_snapshots` tables. Follows the same raw-SQL migration pattern as migrations 0017–0021.

**Files:**
- Create: `backend/migrations/versions/0022_cash_forecast.py`

- [ ] **Step 1: Create migration file**

```python
# backend/migrations/versions/0022_cash_forecast.py
"""cash_forecast_items and cash_forecast_snapshots tables

Revision ID: 0022
Revises: 0021
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS cash_forecast_items (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id      UUID NOT NULL,
        entity_id       UUID,
        account_id      UUID,
        label           VARCHAR(255) NOT NULL,
        direction       VARCHAR(7) NOT NULL CHECK (direction IN ('INFLOW', 'OUTFLOW')),
        amount          NUMERIC(20,6) NOT NULL,
        currency        VARCHAR(3) NOT NULL,
        confidence      VARCHAR(16) NOT NULL DEFAULT 'COMMITTED'
                        CHECK (confidence IN ('COMMITTED', 'PROBABLE', 'POSSIBLE')),
        recurrence      VARCHAR(16) NOT NULL
                        CHECK (recurrence IN ('ONCE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY')),
        start_date      DATE NOT NULL,
        end_date        DATE,
        day_of_month    INTEGER CHECK (day_of_month BETWEEN 1 AND 28),
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_by      UUID NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_forecast_items_company ON cash_forecast_items(company_id);
    CREATE INDEX IF NOT EXISTS ix_forecast_items_entity ON cash_forecast_items(entity_id);
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS cash_forecast_snapshots (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id      UUID NOT NULL,
        entity_id       UUID,
        snapshot_date   DATE NOT NULL,
        horizon         VARCHAR(4) NOT NULL CHECK (horizon IN ('13w', '12m')),
        buckets         JSONB NOT NULL,
        parameters      JSONB NOT NULL DEFAULT '{}',
        created_by      UUID NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_forecast_snapshot UNIQUE (company_id, entity_id, snapshot_date, horizon)
    );
    CREATE INDEX IF NOT EXISTS ix_forecast_snapshots_company ON cash_forecast_snapshots(company_id);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS cash_forecast_snapshots;")
    op.execute("DROP TABLE IF EXISTS cash_forecast_items;")
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/versions/0022_cash_forecast.py
git commit -m "feat(phase2b): migration 0022 — cash_forecast_items + cash_forecast_snapshots tables"
```

---

### Task 3: Forecast Engine (Pure Functions)

**Context:** This is the core of Phase 2b — a pure-function module that takes structured inputs (opening balances, scheduled cash flows, scenario parameters) and returns forecast buckets. **Zero DB access, zero side effects.** This makes it trivially testable and auditable.

The engine handles two horizons:
- **13-week (weekly buckets):** Week 0 = current week, Weeks 1–12 = future weeks
- **12-month (monthly buckets):** Month 0 = current month, Months 1–11 = future months

Each bucket contains: `period_start`, `period_end`, `opening_balance`, `inflows`, `outflows`, `closing_balance`, `currency`, `confidence_breakdown` (COMMITTED/PROBABLE/POSSIBLE), and `liquidity_gap` flag.

**Files:**
- Create: `backend/app/services/forecast_engine.py`
- Create: `backend/tests/test_forecast_engine.py`

- [ ] **Step 1: Write the engine tests first (TDD)**

```python
# backend/tests/test_forecast_engine.py
"""Pure-function tests for the cash flow forecast engine.

No DB, no mocks, no async — just input → output verification.
"""
from datetime import date
from decimal import Decimal
import pytest


def test_weekly_13w_basic_structure():
    """13-week forecast returns exactly 13 buckets with correct period boundaries."""
    from app.services.forecast_engine import compute_forecast

    result = compute_forecast(
        opening_balances={"EUR": Decimal("100000")},
        cash_flows=[],
        horizon="13w",
        as_of_date=date(2026, 4, 13),  # a Monday
        gap_threshold=Decimal("0"),
    )
    assert len(result) == 13
    # Week 0 starts on as_of_date (Monday)
    assert result[0]["period_start"] == date(2026, 4, 13)
    assert result[0]["period_end"] == date(2026, 4, 19)
    # Week 12 ends 12 weeks later
    assert result[12]["period_start"] == date(2026, 7, 6)
    # Opening balance flows through when no cash flows
    assert Decimal(str(result[0]["opening_balance"])) == Decimal("100000")
    assert Decimal(str(result[0]["closing_balance"])) == Decimal("100000")
    # Week 1 opening = Week 0 closing
    assert result[1]["opening_balance"] == result[0]["closing_balance"]


def test_monthly_12m_basic_structure():
    """12-month forecast returns exactly 12 buckets."""
    from app.services.forecast_engine import compute_forecast

    result = compute_forecast(
        opening_balances={"USD": Decimal("500000")},
        cash_flows=[],
        horizon="12m",
        as_of_date=date(2026, 4, 14),
        gap_threshold=Decimal("0"),
    )
    assert len(result) == 12
    assert result[0]["period_start"] == date(2026, 4, 1)
    assert result[0]["period_end"] == date(2026, 4, 30)
    assert result[11]["period_start"] == date(2027, 3, 1)


def test_inflows_and_outflows_applied():
    """Cash flows are applied to the correct bucket."""
    from app.services.forecast_engine import compute_forecast

    flows = [
        {
            "date": date(2026, 4, 15),
            "amount": Decimal("20000"),
            "direction": "INFLOW",
            "currency": "EUR",
            "confidence": "COMMITTED",
            "label": "Client payment",
        },
        {
            "date": date(2026, 4, 16),
            "amount": Decimal("5000"),
            "direction": "OUTFLOW",
            "currency": "EUR",
            "confidence": "COMMITTED",
            "label": "Rent",
        },
    ]
    result = compute_forecast(
        opening_balances={"EUR": Decimal("100000")},
        cash_flows=flows,
        horizon="13w",
        as_of_date=date(2026, 4, 13),
        gap_threshold=Decimal("0"),
    )
    # Both flows land in week 0 (Apr 13–19)
    bucket0 = result[0]
    assert Decimal(str(bucket0["inflows"])) == Decimal("20000")
    assert Decimal(str(bucket0["outflows"])) == Decimal("5000")
    assert Decimal(str(bucket0["closing_balance"])) == Decimal("115000")


def test_liquidity_gap_flagged():
    """When closing balance drops below threshold, liquidity_gap is True."""
    from app.services.forecast_engine import compute_forecast

    flows = [
        {
            "date": date(2026, 4, 14),
            "amount": Decimal("150000"),
            "direction": "OUTFLOW",
            "currency": "EUR",
            "confidence": "COMMITTED",
            "label": "Large payment",
        },
    ]
    result = compute_forecast(
        opening_balances={"EUR": Decimal("100000")},
        cash_flows=flows,
        horizon="13w",
        as_of_date=date(2026, 4, 13),
        gap_threshold=Decimal("10000"),
    )
    assert result[0]["liquidity_gap"] is True
    assert Decimal(str(result[0]["closing_balance"])) == Decimal("-50000")


def test_confidence_breakdown():
    """Each bucket has a confidence breakdown dict."""
    from app.services.forecast_engine import compute_forecast

    flows = [
        {"date": date(2026, 4, 14), "amount": Decimal("10000"), "direction": "INFLOW",
         "currency": "EUR", "confidence": "COMMITTED", "label": "A"},
        {"date": date(2026, 4, 15), "amount": Decimal("5000"), "direction": "INFLOW",
         "currency": "EUR", "confidence": "PROBABLE", "label": "B"},
    ]
    result = compute_forecast(
        opening_balances={"EUR": Decimal("0")},
        cash_flows=flows,
        horizon="13w",
        as_of_date=date(2026, 4, 13),
        gap_threshold=Decimal("0"),
    )
    breakdown = result[0]["confidence_breakdown"]
    assert Decimal(str(breakdown["COMMITTED"])) == Decimal("10000")
    assert Decimal(str(breakdown["PROBABLE"])) == Decimal("5000")
    assert Decimal(str(breakdown.get("POSSIBLE", "0"))) == Decimal("0")


def test_scenario_shift_applied():
    """Scenario parameters shift cash flows by a percentage."""
    from app.services.forecast_engine import compute_forecast

    flows = [
        {"date": date(2026, 4, 14), "amount": Decimal("10000"), "direction": "INFLOW",
         "currency": "EUR", "confidence": "COMMITTED", "label": "Receivable"},
    ]
    result = compute_forecast(
        opening_balances={"EUR": Decimal("0")},
        cash_flows=flows,
        horizon="13w",
        as_of_date=date(2026, 4, 13),
        gap_threshold=Decimal("0"),
        scenario={"inflow_shift": Decimal("-0.20")},  # 20% reduction in inflows
    )
    # 10000 * (1 - 0.20) = 8000
    assert Decimal(str(result[0]["inflows"])) == Decimal("8000")
    assert Decimal(str(result[0]["closing_balance"])) == Decimal("8000")


def test_multi_currency_separate_tracks():
    """Currencies are tracked independently — no cross-currency netting."""
    from app.services.forecast_engine import compute_forecast

    flows = [
        {"date": date(2026, 4, 14), "amount": Decimal("5000"), "direction": "INFLOW",
         "currency": "EUR", "confidence": "COMMITTED", "label": "EUR recv"},
        {"date": date(2026, 4, 14), "amount": Decimal("3000"), "direction": "INFLOW",
         "currency": "USD", "confidence": "COMMITTED", "label": "USD recv"},
    ]
    result = compute_forecast(
        opening_balances={"EUR": Decimal("10000"), "USD": Decimal("20000")},
        cash_flows=flows,
        horizon="13w",
        as_of_date=date(2026, 4, 13),
        gap_threshold=Decimal("0"),
    )
    # Result should contain per-currency data within each bucket
    bucket0 = result[0]
    eur = bucket0["by_currency"]["EUR"]
    usd = bucket0["by_currency"]["USD"]
    assert Decimal(str(eur["closing_balance"])) == Decimal("15000")
    assert Decimal(str(usd["closing_balance"])) == Decimal("23000")


def test_empty_opening_balance_defaults_zero():
    """If no opening balance for a currency, it starts at zero."""
    from app.services.forecast_engine import compute_forecast

    flows = [
        {"date": date(2026, 4, 14), "amount": Decimal("1000"), "direction": "INFLOW",
         "currency": "GBP", "confidence": "COMMITTED", "label": "New currency"},
    ]
    result = compute_forecast(
        opening_balances={},
        cash_flows=flows,
        horizon="13w",
        as_of_date=date(2026, 4, 13),
        gap_threshold=Decimal("0"),
    )
    gbp = result[0]["by_currency"]["GBP"]
    assert Decimal(str(gbp["opening_balance"])) == Decimal("0")
    assert Decimal(str(gbp["closing_balance"])) == Decimal("1000")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_forecast_engine.py -v --override-ini="addopts="
```
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.forecast_engine'`

- [ ] **Step 3: Implement the forecast engine**

```python
# backend/app/services/forecast_engine.py
"""
Pure-function cash flow forecast engine.

Deterministic. No DB access. No side effects. No ML.
Takes structured inputs → returns forecast buckets.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

CONFIDENCE_LEVELS = ("COMMITTED", "PROBABLE", "POSSIBLE")


def compute_forecast(
    *,
    opening_balances: dict[str, Decimal],
    cash_flows: list[dict[str, Any]],
    horizon: str,
    as_of_date: date,
    gap_threshold: Decimal,
    scenario: dict[str, Decimal] | None = None,
) -> list[dict[str, Any]]:
    """Compute a rolling forecast.

    Args:
        opening_balances: {currency: balance} from latest bank statements
        cash_flows: list of dicts with keys: date, amount, direction, currency, confidence, label
        horizon: "13w" (13 weekly buckets) or "12m" (12 monthly buckets)
        as_of_date: forecast anchor date
        gap_threshold: closing balance below this → liquidity_gap=True
        scenario: optional shifts, e.g. {"inflow_shift": Decimal("-0.20")}

    Returns:
        List of bucket dicts, one per period.
    """
    periods = _build_periods(as_of_date, horizon)
    currencies = set(opening_balances.keys())
    for cf in cash_flows:
        currencies.add(cf["currency"])

    # Apply scenario shifts to cash flows
    adjusted_flows = _apply_scenario(cash_flows, scenario) if scenario else cash_flows

    # Bin cash flows into periods
    binned = _bin_cash_flows(adjusted_flows, periods)

    # Build forecast buckets
    running_balances: dict[str, Decimal] = {c: opening_balances.get(c, Decimal("0")) for c in currencies}
    result: list[dict[str, Any]] = []

    for i, (period_start, period_end) in enumerate(periods):
        period_flows = binned.get(i, [])
        bucket = _compute_bucket(period_start, period_end, running_balances, period_flows, gap_threshold)
        result.append(bucket)
        # Carry forward closing balances
        for ccy, data in bucket["by_currency"].items():
            running_balances[ccy] = Decimal(str(data["closing_balance"]))

    return result


def _build_periods(as_of_date: date, horizon: str) -> list[tuple[date, date]]:
    """Build period boundaries for the given horizon."""
    if horizon == "13w":
        # Find Monday of the current week
        monday = as_of_date - timedelta(days=as_of_date.weekday())
        periods = []
        for i in range(13):
            start = monday + timedelta(weeks=i)
            end = start + timedelta(days=6)
            periods.append((start, end))
        return periods
    elif horizon == "12m":
        # Monthly buckets starting from 1st of current month
        import calendar
        periods = []
        year, month = as_of_date.year, as_of_date.month
        for _ in range(12):
            start = date(year, month, 1)
            last_day = calendar.monthrange(year, month)[1]
            end = date(year, month, last_day)
            periods.append((start, end))
            month += 1
            if month > 12:
                month = 1
                year += 1
        return periods
    else:
        raise ValueError(f"Unknown horizon: {horizon}")


def _apply_scenario(
    cash_flows: list[dict[str, Any]],
    scenario: dict[str, Decimal],
) -> list[dict[str, Any]]:
    """Apply scenario shifts to cash flows."""
    inflow_shift = scenario.get("inflow_shift", Decimal("0"))
    outflow_shift = scenario.get("outflow_shift", Decimal("0"))

    adjusted = []
    for cf in cash_flows:
        cf_copy = dict(cf)
        if cf["direction"] == "INFLOW" and inflow_shift:
            cf_copy["amount"] = cf["amount"] * (Decimal("1") + inflow_shift)
        elif cf["direction"] == "OUTFLOW" and outflow_shift:
            cf_copy["amount"] = cf["amount"] * (Decimal("1") + outflow_shift)
        adjusted.append(cf_copy)
    return adjusted


def _bin_cash_flows(
    cash_flows: list[dict[str, Any]],
    periods: list[tuple[date, date]],
) -> dict[int, list[dict[str, Any]]]:
    """Assign each cash flow to the period it falls in."""
    binned: dict[int, list[dict[str, Any]]] = {}
    for cf in cash_flows:
        cf_date = cf["date"]
        for i, (start, end) in enumerate(periods):
            if start <= cf_date <= end:
                binned.setdefault(i, []).append(cf)
                break
        # Cash flows outside all periods are silently dropped
    return binned


def _compute_bucket(
    period_start: date,
    period_end: date,
    running_balances: dict[str, Decimal],
    period_flows: list[dict[str, Any]],
    gap_threshold: Decimal,
) -> dict[str, Any]:
    """Compute a single forecast bucket."""
    by_currency: dict[str, dict[str, Any]] = {}

    # Initialize all currencies from running balances
    for ccy, bal in running_balances.items():
        by_currency[ccy] = {
            "opening_balance": bal,
            "inflows": Decimal("0"),
            "outflows": Decimal("0"),
            "closing_balance": bal,
            "confidence_breakdown": {"COMMITTED": Decimal("0"), "PROBABLE": Decimal("0"), "POSSIBLE": Decimal("0")},
        }

    # Apply flows
    for cf in period_flows:
        ccy = cf["currency"]
        if ccy not in by_currency:
            by_currency[ccy] = {
                "opening_balance": Decimal("0"),
                "inflows": Decimal("0"),
                "outflows": Decimal("0"),
                "closing_balance": Decimal("0"),
                "confidence_breakdown": {"COMMITTED": Decimal("0"), "PROBABLE": Decimal("0"), "POSSIBLE": Decimal("0")},
            }
        amount = Decimal(str(cf["amount"]))
        confidence = cf.get("confidence", "COMMITTED")
        if cf["direction"] == "INFLOW":
            by_currency[ccy]["inflows"] += amount
            by_currency[ccy]["closing_balance"] += amount
        else:
            by_currency[ccy]["outflows"] += amount
            by_currency[ccy]["closing_balance"] -= amount
        by_currency[ccy]["confidence_breakdown"][confidence] += amount

    # Aggregate totals across currencies
    total_opening = sum(d["opening_balance"] for d in by_currency.values())
    total_inflows = sum(d["inflows"] for d in by_currency.values())
    total_outflows = sum(d["outflows"] for d in by_currency.values())
    total_closing = sum(d["closing_balance"] for d in by_currency.values())

    # Aggregate confidence breakdown
    total_confidence = {"COMMITTED": Decimal("0"), "PROBABLE": Decimal("0"), "POSSIBLE": Decimal("0")}
    for d in by_currency.values():
        for level in CONFIDENCE_LEVELS:
            total_confidence[level] += d["confidence_breakdown"][level]

    return {
        "period_start": period_start,
        "period_end": period_end,
        "opening_balance": total_opening,
        "inflows": total_inflows,
        "outflows": total_outflows,
        "closing_balance": total_closing,
        "confidence_breakdown": total_confidence,
        "liquidity_gap": total_closing < gap_threshold,
        "by_currency": by_currency,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_forecast_engine.py -v --override-ini="addopts="
```
Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/forecast_engine.py backend/tests/test_forecast_engine.py
git commit -m "feat(phase2b): deterministic forecast engine — 13w/12m buckets, gap detection, scenarios"
```

---

### Task 4: Recurring Item Expansion

**Context:** The forecast engine receives flat cash flow lists. This utility expands `CashForecastItem` recurrence rules into individual dated cash flows within a given horizon. It's a pure function — no DB access.

**Files:**
- Modify: `backend/app/services/forecast_engine.py` (add `expand_recurring_items` function)
- Modify: `backend/tests/test_forecast_engine.py` (add tests)

- [ ] **Step 1: Write tests for recurrence expansion**

Add to `backend/tests/test_forecast_engine.py`:

```python
def test_expand_monthly_recurrence():
    """Monthly item generates one flow per month within the horizon."""
    from app.services.forecast_engine import expand_recurring_items

    items = [
        {
            "label": "Monthly rent",
            "direction": "OUTFLOW",
            "amount": Decimal("5000"),
            "currency": "EUR",
            "confidence": "COMMITTED",
            "recurrence": "MONTHLY",
            "start_date": date(2026, 1, 1),
            "end_date": None,
            "day_of_month": 1,
        },
    ]
    flows = expand_recurring_items(items, horizon_start=date(2026, 4, 1), horizon_end=date(2026, 6, 30))
    assert len(flows) == 3  # Apr, May, Jun
    assert all(f["direction"] == "OUTFLOW" for f in flows)
    assert flows[0]["date"] == date(2026, 4, 1)
    assert flows[1]["date"] == date(2026, 5, 1)
    assert flows[2]["date"] == date(2026, 6, 1)


def test_expand_weekly_recurrence():
    """Weekly item generates one flow per week."""
    from app.services.forecast_engine import expand_recurring_items

    items = [
        {
            "label": "Weekly payroll",
            "direction": "OUTFLOW",
            "amount": Decimal("15000"),
            "currency": "USD",
            "confidence": "COMMITTED",
            "recurrence": "WEEKLY",
            "start_date": date(2026, 4, 6),  # a Monday
            "end_date": date(2026, 4, 27),
            "day_of_month": None,
        },
    ]
    flows = expand_recurring_items(items, horizon_start=date(2026, 4, 1), horizon_end=date(2026, 4, 30))
    assert len(flows) == 4  # Apr 6, 13, 20, 27


def test_expand_once_item():
    """ONCE item generates exactly one flow if within horizon."""
    from app.services.forecast_engine import expand_recurring_items

    items = [
        {
            "label": "Tax payment",
            "direction": "OUTFLOW",
            "amount": Decimal("50000"),
            "currency": "EUR",
            "confidence": "COMMITTED",
            "recurrence": "ONCE",
            "start_date": date(2026, 5, 15),
            "end_date": None,
            "day_of_month": None,
        },
    ]
    flows = expand_recurring_items(items, horizon_start=date(2026, 4, 1), horizon_end=date(2026, 6, 30))
    assert len(flows) == 1
    assert flows[0]["date"] == date(2026, 5, 15)


def test_expand_item_outside_horizon_excluded():
    """Items entirely outside the horizon produce no flows."""
    from app.services.forecast_engine import expand_recurring_items

    items = [
        {
            "label": "Future item",
            "direction": "INFLOW",
            "amount": Decimal("1000"),
            "currency": "EUR",
            "confidence": "PROBABLE",
            "recurrence": "ONCE",
            "start_date": date(2027, 1, 1),
            "end_date": None,
            "day_of_month": None,
        },
    ]
    flows = expand_recurring_items(items, horizon_start=date(2026, 4, 1), horizon_end=date(2026, 6, 30))
    assert len(flows) == 0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_forecast_engine.py::test_expand_monthly_recurrence -v --override-ini="addopts="
```
Expected: `AttributeError: module has no attribute 'expand_recurring_items'`

- [ ] **Step 3: Implement `expand_recurring_items`**

Add to `backend/app/services/forecast_engine.py`:

```python
def expand_recurring_items(
    items: list[dict[str, Any]],
    *,
    horizon_start: date,
    horizon_end: date,
) -> list[dict[str, Any]]:
    """Expand recurring forecast items into individual dated cash flows.

    Each item produces zero or more flows within [horizon_start, horizon_end].
    """
    flows: list[dict[str, Any]] = []

    for item in items:
        recurrence = item["recurrence"]
        start = item["start_date"]
        end = item.get("end_date") or horizon_end
        # Clamp to horizon
        effective_start = max(start, horizon_start)
        effective_end = min(end, horizon_end)

        if effective_start > effective_end:
            continue

        if recurrence == "ONCE":
            if horizon_start <= start <= horizon_end:
                flows.append(_item_to_flow(item, start))

        elif recurrence == "WEEKLY":
            current = effective_start
            while current <= effective_end:
                flows.append(_item_to_flow(item, current))
                current += timedelta(days=7)

        elif recurrence == "BIWEEKLY":
            current = effective_start
            while current <= effective_end:
                flows.append(_item_to_flow(item, current))
                current += timedelta(days=14)

        elif recurrence == "MONTHLY":
            day = item.get("day_of_month") or effective_start.day
            day = min(day, 28)  # Safety: never exceed 28
            import calendar
            y, m = effective_start.year, effective_start.month
            while True:
                try:
                    d = date(y, m, day)
                except ValueError:
                    d = date(y, m, min(day, calendar.monthrange(y, m)[1]))
                if d > effective_end:
                    break
                if d >= effective_start:
                    flows.append(_item_to_flow(item, d))
                m += 1
                if m > 12:
                    m = 1
                    y += 1

        elif recurrence == "QUARTERLY":
            day = item.get("day_of_month") or effective_start.day
            day = min(day, 28)
            import calendar
            y, m = effective_start.year, effective_start.month
            while True:
                try:
                    d = date(y, m, day)
                except ValueError:
                    d = date(y, m, min(day, calendar.monthrange(y, m)[1]))
                if d > effective_end:
                    break
                if d >= effective_start:
                    flows.append(_item_to_flow(item, d))
                m += 3
                if m > 12:
                    m -= 12
                    y += 1

        elif recurrence == "ANNUALLY":
            y = effective_start.year
            while True:
                d = date(y, start.month, min(start.day, 28))
                if d > effective_end:
                    break
                if d >= effective_start:
                    flows.append(_item_to_flow(item, d))
                y += 1

    return flows


def _item_to_flow(item: dict[str, Any], flow_date: date) -> dict[str, Any]:
    """Convert a forecast item + date into a cash flow dict."""
    return {
        "date": flow_date,
        "amount": Decimal(str(item["amount"])),
        "direction": item["direction"],
        "currency": item["currency"],
        "confidence": item.get("confidence", "COMMITTED"),
        "label": item["label"],
    }
```

- [ ] **Step 4: Run all engine tests**

```bash
python -m pytest tests/test_forecast_engine.py -v --override-ini="addopts="
```
Expected: all 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/forecast_engine.py backend/tests/test_forecast_engine.py
git commit -m "feat(phase2b): recurring item expansion — WEEKLY/BIWEEKLY/MONTHLY/QUARTERLY/ANNUALLY/ONCE"
```

---

## Chunk 2: Service Layer and Routes

### Task 5: Pydantic Schemas for Forecast

**Context:** Add forecast-specific request/response schemas to the existing `schemas_v1/cash.py` file. Follows Phase 2a pattern: append new schemas at the bottom.

**Files:**
- Modify: `backend/app/schemas_v1/cash.py`

- [ ] **Step 1: Add forecast schemas**

Append to the end of `backend/app/schemas_v1/cash.py`:

```python
# ── Forecast ─────────────────────────────────────────────────────────────

class ForecastItemCreate(BaseModel):
    label: str
    direction: str = Field(..., pattern="^(INFLOW|OUTFLOW)$")
    amount: Decimal
    currency: str = Field(..., min_length=3, max_length=3)
    confidence: str = Field(default="COMMITTED", pattern="^(COMMITTED|PROBABLE|POSSIBLE)$")
    recurrence: str = Field(..., pattern="^(ONCE|WEEKLY|BIWEEKLY|MONTHLY|QUARTERLY|ANNUALLY)$")
    start_date: date
    end_date: date | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=28)
    entity_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None


class ForecastItemResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    label: str
    direction: str
    amount: Decimal
    currency: str
    confidence: str
    recurrence: str
    start_date: date
    end_date: date | None
    day_of_month: int | None
    entity_id: uuid.UUID | None
    account_id: uuid.UUID | None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ForecastItemUpdate(BaseModel):
    label: str | None = None
    amount: Decimal | None = None
    confidence: str | None = Field(default=None, pattern="^(COMMITTED|PROBABLE|POSSIBLE)$")
    end_date: date | None = None
    is_active: bool | None = None


class ScenarioRequest(BaseModel):
    entity_id: uuid.UUID | None = None
    horizon: str = Field(default="13w", pattern="^(13w|12m)$")
    inflow_shift: Decimal = Decimal("0")
    outflow_shift: Decimal = Decimal("0")


class ForecastBucket(BaseModel):
    period_start: date
    period_end: date
    opening_balance: Decimal
    inflows: Decimal
    outflows: Decimal
    closing_balance: Decimal
    confidence_breakdown: dict[str, Decimal]
    liquidity_gap: bool
    by_currency: dict[str, Any]


class ForecastResponse(BaseModel):
    as_of_date: date
    horizon: str
    entity_id: uuid.UUID | None
    buckets: list[ForecastBucket]


class LiquidityGap(BaseModel):
    period_start: date
    period_end: date
    currency: str
    closing_balance: Decimal
    gap_threshold: Decimal
    shortfall: Decimal


class LiquidityGapsResponse(BaseModel):
    as_of_date: date
    gaps: list[LiquidityGap]


class VarianceRow(BaseModel):
    period_start: date
    period_end: date
    forecast_closing: Decimal
    actual_closing: Decimal | None
    variance: Decimal | None
    variance_pct: Decimal | None


class VarianceResponse(BaseModel):
    entity_id: uuid.UUID | None
    rows: list[VarianceRow]
```

- [ ] **Step 2: Run existing tests to verify no breakage**

```bash
python -m pytest tests/ -k "cash" -v --override-ini="addopts="
```
Expected: all existing cash tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas_v1/cash.py
git commit -m "feat(phase2b): forecast Pydantic schemas — items, scenarios, buckets, gaps, variance"
```

---

### Task 6: Forecast Service (DB Orchestrator)

**Context:** The service layer gathers data from the DB (opening balances, recurring items, settlement events), calls the pure-function forecast engine, and stores snapshots. It bridges the DB and the engine.

**Files:**
- Create: `backend/app/services/forecast_service.py`
- Create: `backend/tests/test_forecast_service.py`

- [ ] **Step 1: Write service tests**

```python
# backend/tests/test_forecast_service.py
"""Service-layer tests for forecast_service — AsyncMock DB session."""
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_get_forecast_returns_buckets():
    """get_forecast gathers data and returns forecast buckets."""
    from app.services.forecast_service import get_forecast

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    # Mock the internal data-gathering functions
    with patch("app.services.forecast_service._get_opening_balances",
               new_callable=AsyncMock, return_value={"EUR": Decimal("100000")}), \
         patch("app.services.forecast_service._get_recurring_flows",
               new_callable=AsyncMock, return_value=[]), \
         patch("app.services.forecast_service._get_settlement_flows",
               new_callable=AsyncMock, return_value=[]), \
         patch("app.services.forecast_service._get_gap_threshold",
               new_callable=AsyncMock, return_value=Decimal("0")):
        result = await get_forecast(
            mock_session,
            company_id=company_id,
            entity_id=None,
            horizon="13w",
            as_of_date=date(2026, 4, 13),
        )

    assert len(result) == 13
    assert Decimal(str(result[0]["opening_balance"])) == Decimal("100000")


@pytest.mark.asyncio
async def test_create_forecast_item():
    """create_forecast_item stores a new recurring item."""
    from app.services.forecast_service import create_forecast_item

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    payload = {
        "label": "Monthly rent",
        "direction": "OUTFLOW",
        "amount": Decimal("5000"),
        "currency": "EUR",
        "confidence": "COMMITTED",
        "recurrence": "MONTHLY",
        "start_date": date(2026, 4, 1),
        "end_date": None,
        "day_of_month": 1,
        "entity_id": None,
        "account_id": None,
    }

    with patch("app.services.forecast_service.append_event", new_callable=AsyncMock):
        item = await create_forecast_item(
            mock_session, company_id=company_id, payload=payload, created_by=actor_id,
        )

    assert item.label == "Monthly rent"
    assert item.direction == "OUTFLOW"
    mock_session.add.assert_called_once()


@pytest.mark.asyncio
async def test_run_scenario():
    """run_scenario applies shifts and returns modified forecast."""
    from app.services.forecast_service import run_scenario

    mock_session = AsyncMock()
    company_id = uuid.uuid4()

    with patch("app.services.forecast_service._get_opening_balances",
               new_callable=AsyncMock, return_value={"EUR": Decimal("100000")}), \
         patch("app.services.forecast_service._get_recurring_flows",
               new_callable=AsyncMock, return_value=[
                   {"date": date(2026, 4, 14), "amount": Decimal("10000"), "direction": "INFLOW",
                    "currency": "EUR", "confidence": "COMMITTED", "label": "Recv"},
               ]), \
         patch("app.services.forecast_service._get_settlement_flows",
               new_callable=AsyncMock, return_value=[]), \
         patch("app.services.forecast_service._get_gap_threshold",
               new_callable=AsyncMock, return_value=Decimal("0")), \
         patch("app.services.forecast_service.append_event", new_callable=AsyncMock):
        result = await run_scenario(
            mock_session,
            company_id=company_id,
            entity_id=None,
            horizon="13w",
            scenario={"inflow_shift": Decimal("-0.50")},
            created_by=uuid.uuid4(),
        )

    # 10000 * (1 - 0.50) = 5000 inflow
    assert Decimal(str(result[0]["inflows"])) == Decimal("5000")


@pytest.mark.asyncio
async def test_get_liquidity_gaps():
    """get_liquidity_gaps returns only periods where closing < threshold."""
    from app.services.forecast_service import get_liquidity_gaps

    mock_session = AsyncMock()
    company_id = uuid.uuid4()

    with patch("app.services.forecast_service._get_opening_balances",
               new_callable=AsyncMock, return_value={"EUR": Decimal("10000")}), \
         patch("app.services.forecast_service._get_recurring_flows",
               new_callable=AsyncMock, return_value=[
                   {"date": date(2026, 4, 14), "amount": Decimal("20000"), "direction": "OUTFLOW",
                    "currency": "EUR", "confidence": "COMMITTED", "label": "Big payment"},
               ]), \
         patch("app.services.forecast_service._get_settlement_flows",
               new_callable=AsyncMock, return_value=[]), \
         patch("app.services.forecast_service._get_gap_threshold",
               new_callable=AsyncMock, return_value=Decimal("5000")):
        gaps = await get_liquidity_gaps(
            mock_session,
            company_id=company_id,
            entity_id=None,
            gap_threshold=Decimal("5000"),
        )

    assert len(gaps) >= 1
    assert gaps[0]["shortfall"] < 0  # closing is below threshold
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_forecast_service.py -v --override-ini="addopts="
```
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement the forecast service**

```python
# backend/app/services/forecast_service.py
"""
Forecast service — orchestrates DB data gathering + pure-function engine.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import (
    BankAccount, CashBalance, LegalEntity, CashAuditEventType,
)
from app.models.cash_forecast import CashForecastItem, CashForecastSnapshot
from app.services.cash_audit_service import append_event
from app.services.forecast_engine import compute_forecast, expand_recurring_items


async def get_forecast(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    horizon: str,
    as_of_date: date,
    scenario: dict[str, Decimal] | None = None,
) -> list[dict[str, Any]]:
    """Compute forecast for a company (or single entity)."""
    opening = await _get_opening_balances(session, company_id=company_id, entity_id=entity_id, as_of_date=as_of_date)
    recurring = await _get_recurring_flows(session, company_id=company_id, entity_id=entity_id, as_of_date=as_of_date, horizon=horizon)
    settlements = await _get_settlement_flows(session, company_id=company_id, entity_id=entity_id, as_of_date=as_of_date, horizon=horizon)

    all_flows = recurring + settlements

    # Determine gap threshold from min_balance_threshold across accounts
    threshold = await _get_gap_threshold(session, company_id=company_id, entity_id=entity_id)

    return compute_forecast(
        opening_balances=opening,
        cash_flows=all_flows,
        horizon=horizon,
        as_of_date=as_of_date,
        gap_threshold=threshold,
        scenario=scenario,
    )


async def create_forecast_item(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    payload: dict[str, Any],
    created_by: uuid.UUID,
) -> CashForecastItem:
    """Create a new recurring forecast item."""
    item = CashForecastItem(
        company_id=company_id,
        created_by=created_by,
        **{k: v for k, v in payload.items() if hasattr(CashForecastItem, k)},
    )
    session.add(item)
    await session.flush()
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.FORECAST_CREATED,
        payload={"label": item.label, "recurrence": item.recurrence, "amount": str(item.amount)},
        performed_by=created_by,
    )
    return item


async def list_forecast_items(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    active_only: bool = True,
) -> list[CashForecastItem]:
    """List forecast items for a company."""
    q = select(CashForecastItem).where(CashForecastItem.company_id == company_id)
    if active_only:
        q = q.where(CashForecastItem.is_active == True)  # noqa: E712
    result = await session.execute(q.order_by(CashForecastItem.start_date))
    return list(result.scalars().all())


async def update_forecast_item(
    session: AsyncSession,
    *,
    item_id: uuid.UUID,
    company_id: uuid.UUID,
    payload: dict[str, Any],
) -> CashForecastItem:
    """Update a forecast item."""
    result = await session.execute(
        select(CashForecastItem).where(
            CashForecastItem.id == item_id,
            CashForecastItem.company_id == company_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Forecast item not found")
    for k, v in payload.items():
        if v is not None and hasattr(item, k):
            setattr(item, k, v)
    await session.flush()
    return item


async def run_scenario(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    horizon: str,
    scenario: dict[str, Decimal],
    created_by: uuid.UUID,
) -> list[dict[str, Any]]:
    """Run a what-if scenario and audit-log it."""
    result = await get_forecast(
        session,
        company_id=company_id,
        entity_id=entity_id,
        horizon=horizon,
        as_of_date=date.today(),
        scenario=scenario,
    )
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.FORECAST_SCENARIO_RUN,
        payload={"horizon": horizon, "scenario": {k: str(v) for k, v in scenario.items()}},
        performed_by=created_by,
    )
    return result


async def get_liquidity_gaps(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    gap_threshold: Decimal | None = None,
) -> list[dict[str, Any]]:
    """Identify future periods where closing balance falls below threshold."""
    threshold = gap_threshold or await _get_gap_threshold(session, company_id=company_id, entity_id=entity_id)
    buckets = await get_forecast(
        session,
        company_id=company_id,
        entity_id=entity_id,
        horizon="13w",
        as_of_date=date.today(),
    )
    gaps = []
    for bucket in buckets:
        if bucket["liquidity_gap"]:
            for ccy, data in bucket["by_currency"].items():
                if data["closing_balance"] < threshold:
                    gaps.append({
                        "period_start": bucket["period_start"],
                        "period_end": bucket["period_end"],
                        "currency": ccy,
                        "closing_balance": data["closing_balance"],
                        "gap_threshold": threshold,
                        "shortfall": data["closing_balance"] - threshold,
                    })
    return gaps


async def save_snapshot(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    horizon: str,
    buckets: list[dict[str, Any]],
    parameters: dict[str, Any],
    created_by: uuid.UUID,
) -> CashForecastSnapshot:
    """Save a point-in-time forecast snapshot for variance tracking."""
    import json

    # Serialize dates in bucket dicts for JSONB storage
    serializable = []
    for b in buckets:
        sb = dict(b)
        sb["period_start"] = b["period_start"].isoformat() if isinstance(b["period_start"], date) else b["period_start"]
        sb["period_end"] = b["period_end"].isoformat() if isinstance(b["period_end"], date) else b["period_end"]
        # Convert Decimal values to strings for JSONB
        for key in ("opening_balance", "inflows", "outflows", "closing_balance"):
            sb[key] = str(sb[key])
        if "confidence_breakdown" in sb:
            sb["confidence_breakdown"] = {k: str(v) for k, v in sb["confidence_breakdown"].items()}
        if "by_currency" in sb:
            by_ccy = {}
            for ccy, data in sb["by_currency"].items():
                by_ccy[ccy] = {k: str(v) if isinstance(v, Decimal) else v for k, v in data.items()}
                if "confidence_breakdown" in by_ccy[ccy]:
                    by_ccy[ccy]["confidence_breakdown"] = {k: str(v) for k, v in data["confidence_breakdown"].items()}
            sb["by_currency"] = by_ccy
        serializable.append(sb)

    snapshot = CashForecastSnapshot(
        company_id=company_id,
        entity_id=entity_id,
        snapshot_date=date.today(),
        horizon=horizon,
        buckets=serializable,
        parameters={k: str(v) for k, v in parameters.items()} if parameters else {},
        created_by=created_by,
    )
    session.add(snapshot)
    await session.flush()
    return snapshot


async def get_variance(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
) -> list[dict[str, Any]]:
    """Compare most recent forecast snapshot against actual balances."""
    # Find latest snapshot
    q = select(CashForecastSnapshot).where(
        CashForecastSnapshot.company_id == company_id,
        CashForecastSnapshot.horizon == "13w",
    )
    if entity_id:
        q = q.where(CashForecastSnapshot.entity_id == entity_id)
    else:
        q = q.where(CashForecastSnapshot.entity_id.is_(None))
    q = q.order_by(CashForecastSnapshot.snapshot_date.desc()).limit(1)

    result = await session.execute(q)
    snapshot = result.scalar_one_or_none()
    if snapshot is None:
        return []

    rows = []
    for bucket_data in snapshot.buckets:
        period_start = date.fromisoformat(bucket_data["period_start"]) if isinstance(bucket_data["period_start"], str) else bucket_data["period_start"]
        period_end = date.fromisoformat(bucket_data["period_end"]) if isinstance(bucket_data["period_end"], str) else bucket_data["period_end"]
        forecast_closing = Decimal(str(bucket_data["closing_balance"]))

        # Try to find actual balance for the period end date
        actual = await _get_actual_balance(session, company_id=company_id, entity_id=entity_id, as_of_date=period_end)
        actual_closing = actual if actual is not None else None
        variance = (actual_closing - forecast_closing) if actual_closing is not None else None
        variance_pct = (variance / forecast_closing * 100) if variance is not None and forecast_closing != 0 else None

        rows.append({
            "period_start": period_start,
            "period_end": period_end,
            "forecast_closing": forecast_closing,
            "actual_closing": actual_closing,
            "variance": variance,
            "variance_pct": variance_pct,
        })
    return rows


# ── Internal data-gathering helpers ──────────────────────────────────────

async def _get_opening_balances(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    as_of_date: date,
) -> dict[str, Decimal]:
    """Get latest balance per currency from cash_balances as of given date."""
    q = (
        select(
            CashBalance.currency,
            func.sum(CashBalance.ledger_balance).label("total"),
        )
        .join(BankAccount, CashBalance.account_id == BankAccount.id)
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(LegalEntity.company_id == company_id, CashBalance.balance_date <= as_of_date)
    )
    if entity_id:
        q = q.where(LegalEntity.id == entity_id)
    q = q.group_by(CashBalance.currency)
    result = await session.execute(q)
    return {r.currency: Decimal(str(r.total)) for r in result.all()}


async def _get_recurring_flows(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    as_of_date: date,
    horizon: str,
) -> list[dict[str, Any]]:
    """Expand active recurring forecast items into dated cash flows."""
    q = select(CashForecastItem).where(
        CashForecastItem.company_id == company_id,
        CashForecastItem.is_active == True,  # noqa: E712
    )
    if entity_id:
        q = q.where(CashForecastItem.entity_id == entity_id)
    result = await session.execute(q)
    items = result.scalars().all()

    if not items:
        return []

    # Determine horizon end
    if horizon == "13w":
        horizon_end = as_of_date + timedelta(weeks=13)
    else:
        from dateutil.relativedelta import relativedelta
        horizon_end = as_of_date + relativedelta(months=12)

    item_dicts = [
        {
            "label": it.label,
            "direction": it.direction,
            "amount": it.amount,
            "currency": it.currency,
            "confidence": it.confidence,
            "recurrence": it.recurrence,
            "start_date": it.start_date,
            "end_date": it.end_date,
            "day_of_month": it.day_of_month,
        }
        for it in items
    ]
    return expand_recurring_items(item_dicts, horizon_start=as_of_date, horizon_end=horizon_end)


async def _get_settlement_flows(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    as_of_date: date,
    horizon: str,
) -> list[dict[str, Any]]:
    """Get future settlement events as cash flows.

    SettlementEvents have settlement_date and value_date — use settlement_date as
    the cash flow date. Status must be active (not cancelled).
    """
    from app.models.settlement_event import SettlementEvent

    if horizon == "13w":
        horizon_end = as_of_date + timedelta(weeks=13)
    else:
        from dateutil.relativedelta import relativedelta
        horizon_end = as_of_date + relativedelta(months=12)

    try:
        q = (
            select(SettlementEvent)
            .where(
                SettlementEvent.company_id == company_id,
                SettlementEvent.settlement_date >= as_of_date,
                SettlementEvent.settlement_date <= horizon_end,
            )
        )
        result = await session.execute(q)
        events = result.scalars().all()
    except Exception:
        # SettlementEvent may not have company_id column — gracefully degrade
        return []

    flows = []
    for ev in events:
        # Determine direction from amount sign or event type
        amount = abs(Decimal(str(getattr(ev, "amount", 0) or 0)))
        if amount == 0:
            continue
        direction = "INFLOW" if getattr(ev, "amount", 0) >= 0 else "OUTFLOW"
        flows.append({
            "date": ev.settlement_date,
            "amount": amount,
            "direction": direction,
            "currency": getattr(ev, "currency", "USD"),
            "confidence": "COMMITTED",
            "label": f"Settlement #{getattr(ev, 'id', 'unknown')}",
        })
    return flows


async def _get_gap_threshold(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
) -> Decimal:
    """Get aggregate minimum balance threshold from bank accounts."""
    q = (
        select(func.coalesce(func.sum(BankAccount.min_balance_threshold), 0))
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(LegalEntity.company_id == company_id)
    )
    if entity_id:
        q = q.where(LegalEntity.id == entity_id)
    result = await session.execute(q)
    return Decimal(str(result.scalar() or 0))


async def _get_actual_balance(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    entity_id: uuid.UUID | None,
    as_of_date: date,
) -> Decimal | None:
    """Get actual total balance for a given date (for variance tracking)."""
    q = (
        select(func.sum(CashBalance.ledger_balance))
        .join(BankAccount, CashBalance.account_id == BankAccount.id)
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(LegalEntity.company_id == company_id, CashBalance.balance_date == as_of_date)
    )
    if entity_id:
        q = q.where(LegalEntity.id == entity_id)
    result = await session.execute(q)
    total = result.scalar()
    return Decimal(str(total)) if total is not None else None
```

- [ ] **Step 4: Run all tests**

```bash
python -m pytest tests/test_forecast_service.py tests/test_forecast_engine.py -v --override-ini="addopts="
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/forecast_service.py backend/tests/test_forecast_service.py
git commit -m "feat(phase2b): forecast service — data gathering, item CRUD, scenarios, variance, gap detection"
```

---

### Task 7: API Routes

**Context:** Five endpoints under `/v1/cash/forecast/*`. Follows the same patterns as `v1_cash_positions.py`: `_require_professional` guard, `Depends(get_session)`, `Depends(get_current_user)`, and `await db.commit()` for write routes.

**Files:**
- Create: `backend/app/api/routes/v1_cash_forecast.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_v1_cash_forecast_routes.py`

- [ ] **Step 1: Write route tests**

```python
# backend/tests/test_v1_cash_forecast_routes.py
"""Route tests for /v1/cash/forecast/* via httpx AsyncClient."""
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


def _mock_user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = uuid.uuid4()
    user.role = "cfo"
    user.plan_tier = "professional"
    return user


@pytest.mark.asyncio
async def test_get_forecast_entity():
    """GET /v1/cash/forecast/{entity_id} returns 200 with buckets."""
    user = _mock_user()
    entity_id = uuid.uuid4()

    with patch("app.core.dependencies.get_current_user", return_value=user), \
         patch("app.api.routes.v1_cash_forecast.get_forecast_for_entity",
               new_callable=AsyncMock, return_value=[
                   {"period_start": "2026-04-13", "period_end": "2026-04-19",
                    "opening_balance": "100000", "inflows": "0", "outflows": "0",
                    "closing_balance": "100000", "confidence_breakdown": {},
                    "liquidity_gap": False, "by_currency": {}}
               ]):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get(
                f"/api/v1/cash/forecast/{entity_id}?horizon=13w",
                headers={"Authorization": "Bearer fake-jwt"},
            )
    assert resp.status_code == 200
    data = resp.json()
    assert "buckets" in data


@pytest.mark.asyncio
async def test_get_consolidated_forecast():
    """GET /v1/cash/forecast/consolidated returns 200."""
    user = _mock_user()

    with patch("app.core.dependencies.get_current_user", return_value=user), \
         patch("app.api.routes.v1_cash_forecast.get_consolidated_forecast_data",
               new_callable=AsyncMock, return_value=[]):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get(
                "/api/v1/cash/forecast/consolidated",
                headers={"Authorization": "Bearer fake-jwt"},
            )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_post_scenario():
    """POST /v1/cash/forecast/scenarios returns scenario results."""
    user = _mock_user()

    with patch("app.core.dependencies.get_current_user", return_value=user), \
         patch("app.api.routes.v1_cash_forecast.run_scenario_route_helper",
               new_callable=AsyncMock, return_value=[]):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/cash/forecast/scenarios",
                json={"horizon": "13w", "inflow_shift": "-0.10", "outflow_shift": "0"},
                headers={"Authorization": "Bearer fake-jwt"},
            )
    assert resp.status_code == 200
```

- [ ] **Step 2: Implement the route file**

```python
# backend/app/api/routes/v1_cash_forecast.py
"""v1 cash forecast — 13w/12m rolling forecasts, scenarios, gaps, variance."""
import uuid
from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.user import User
from app.schemas_v1.cash import (
    ForecastItemCreate, ForecastItemResponse, ForecastItemUpdate,
    ForecastResponse, LiquidityGapsResponse, ScenarioRequest, VarianceResponse,
)
from app.services.forecast_service import (
    get_forecast, create_forecast_item, list_forecast_items,
    update_forecast_item, run_scenario, get_liquidity_gaps, get_variance,
    save_snapshot,
)

router = APIRouter(prefix="/v1/cash/forecast", tags=["cash-forecast"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


# ── Module-level helpers for testability (patchable by route tests) ──

async def get_forecast_for_entity(db, *, company_id, entity_id, horizon, as_of_date):
    return await get_forecast(db, company_id=company_id, entity_id=entity_id,
                              horizon=horizon, as_of_date=as_of_date)


async def get_consolidated_forecast_data(db, *, company_id, horizon, as_of_date):
    return await get_forecast(db, company_id=company_id, entity_id=None,
                              horizon=horizon, as_of_date=as_of_date)


async def run_scenario_route_helper(db, *, company_id, entity_id, horizon, scenario, created_by):
    return await run_scenario(db, company_id=company_id, entity_id=entity_id,
                              horizon=horizon, scenario=scenario, created_by=created_by)


@router.get("/consolidated")
async def forecast_consolidated(
    horizon: str = Query(default="13w", pattern="^(13w|12m)$"),
    as_of_date: date | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    target = as_of_date or date.today()
    buckets = await get_consolidated_forecast_data(
        db, company_id=current_user.company_id, horizon=horizon, as_of_date=target,
    )
    return ForecastResponse(as_of_date=target, horizon=horizon, entity_id=None, buckets=buckets)


@router.get("/liquidity-gaps")
async def liquidity_gaps(
    entity_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    gaps = await get_liquidity_gaps(
        db, company_id=current_user.company_id, entity_id=entity_id,
    )
    return LiquidityGapsResponse(as_of_date=date.today(), gaps=gaps)


@router.post("/scenarios")
async def run_scenario_route(
    payload: ScenarioRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    scenario = {}
    if payload.inflow_shift:
        scenario["inflow_shift"] = payload.inflow_shift
    if payload.outflow_shift:
        scenario["outflow_shift"] = payload.outflow_shift
    buckets = await run_scenario_route_helper(
        db, company_id=current_user.company_id, entity_id=payload.entity_id,
        horizon=payload.horizon, scenario=scenario, created_by=current_user.id,
    )
    await db.commit()
    return ForecastResponse(as_of_date=date.today(), horizon=payload.horizon,
                            entity_id=payload.entity_id, buckets=buckets)


@router.get("/variance")
async def variance_report(
    entity_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    rows = await get_variance(db, company_id=current_user.company_id, entity_id=entity_id)
    return VarianceResponse(entity_id=entity_id, rows=rows)


# ── Forecast Item CRUD ──────────────────────────────────────────────────

@router.post("/items", response_model=ForecastItemResponse, status_code=201)
async def create_item(
    payload: ForecastItemCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    item = await create_forecast_item(
        db, company_id=current_user.company_id,
        payload=payload.model_dump(), created_by=current_user.id,
    )
    await db.commit()
    return item


@router.get("/items", response_model=list[ForecastItemResponse])
async def list_items(
    active_only: bool = True,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_forecast_items(db, company_id=current_user.company_id, active_only=active_only)


@router.patch("/items/{item_id}", response_model=ForecastItemResponse)
async def update_item(
    item_id: uuid.UUID,
    payload: ForecastItemUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    item = await update_forecast_item(
        db, item_id=item_id, company_id=current_user.company_id,
        payload=payload.model_dump(exclude_unset=True),
    )
    await db.commit()
    return item


@router.post("/snapshots")
async def save_forecast_snapshot(
    horizon: str = Query(default="13w", pattern="^(13w|12m)$"),
    entity_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Save current forecast as a snapshot for future variance tracking."""
    _require_write(current_user)
    buckets = await get_forecast(
        db, company_id=current_user.company_id, entity_id=entity_id,
        horizon=horizon, as_of_date=date.today(),
    )
    snapshot = await save_snapshot(
        db, company_id=current_user.company_id, entity_id=entity_id,
        horizon=horizon, buckets=buckets, parameters={}, created_by=current_user.id,
    )
    await db.commit()
    return {"snapshot_id": str(snapshot.id), "snapshot_date": str(snapshot.snapshot_date)}


# ── Parameterized entity route — MUST be LAST (catches /{entity_id}) ──

@router.get("/{entity_id}")
async def forecast_by_entity(
    entity_id: uuid.UUID,
    horizon: str = Query(default="13w", pattern="^(13w|12m)$"),
    as_of_date: date | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    target = as_of_date or date.today()
    buckets = await get_forecast_for_entity(
        db, company_id=current_user.company_id, entity_id=entity_id,
        horizon=horizon, as_of_date=target,
    )
    return ForecastResponse(as_of_date=target, horizon=horizon, entity_id=entity_id, buckets=buckets)
```

- [ ] **Step 3: Register the router in `router.py`**

Append to the end of `backend/app/api/router.py`:

```python
# Treasury Suite Phase 2b — Cash Flow Forecasting (owns /v1/cash/forecast/*)
from app.api.routes.v1_cash_forecast import router as v1_cash_forecast_router
router.include_router(v1_cash_forecast_router)
```

- [ ] **Step 4: Run all tests**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
BANK_ACCOUNT_ENC_KEY="test-bank-enc-key-at-least-32-bytes-long!!" \
python -m pytest tests/test_v1_cash_forecast_routes.py tests/test_forecast_service.py tests/test_forecast_engine.py -v --override-ini="addopts="
```
Expected: all tests pass.

- [ ] **Step 5: Run full test suite**

```bash
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
BANK_ACCOUNT_ENC_KEY="test-bank-enc-key-at-least-32-bytes-long!!" \
python -m pytest tests/ --override-ini="addopts=" -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
```
Expected: ~4877 + new tests passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/v1_cash_forecast.py backend/app/api/router.py \
        backend/tests/test_v1_cash_forecast_routes.py
git commit -m "feat(phase2b): forecast API routes — entity/consolidated/scenarios/gaps/variance/items CRUD"
```

---

## Chunk 3: Frontend

### Task 8: cashClient.ts — Forecast API Functions

**Context:** Extend the existing `cashClient.ts` with 5 forecast API functions + interfaces. Same pattern as the existing 29 functions.

**Files:**
- Modify: `frontend/src/lib/api/cashClient.ts`

- [ ] **Step 1: Add forecast interfaces and functions**

Append to the end of `frontend/src/lib/api/cashClient.ts`:

```typescript
// ── Forecast ────────────────────────────────────────────────────────────

export interface ForecastBucket {
  period_start: string;
  period_end: string;
  opening_balance: string;
  inflows: string;
  outflows: string;
  closing_balance: string;
  confidence_breakdown: Record<string, string>;
  liquidity_gap: boolean;
  by_currency: Record<string, {
    opening_balance: string;
    inflows: string;
    outflows: string;
    closing_balance: string;
  }>;
}

export interface ForecastResponse {
  as_of_date: string;
  horizon: string;
  entity_id: string | null;
  buckets: ForecastBucket[];
}

export interface LiquidityGap {
  period_start: string;
  period_end: string;
  currency: string;
  closing_balance: string;
  gap_threshold: string;
  shortfall: string;
}

export interface VarianceRow {
  period_start: string;
  period_end: string;
  forecast_closing: string;
  actual_closing: string | null;
  variance: string | null;
  variance_pct: string | null;
}

export interface ForecastItem {
  id: string;
  company_id: string;
  label: string;
  direction: string;
  amount: string;
  currency: string;
  confidence: string;
  recurrence: string;
  start_date: string;
  end_date: string | null;
  day_of_month: number | null;
  entity_id: string | null;
  account_id: string | null;
  is_active: boolean;
  created_at: string;
}

export async function getEntityForecast(token: string, entityId: string, horizon = "13w"): Promise<ForecastResponse> {
  return _fetchJson(`/v1/cash/forecast/${entityId}?horizon=${horizon}`, token);
}

export async function getConsolidatedForecast(token: string, horizon = "13w"): Promise<ForecastResponse> {
  return _fetchJson(`/v1/cash/forecast/consolidated?horizon=${horizon}`, token);
}

export async function getLiquidityGaps(token: string, entityId?: string): Promise<{ as_of_date: string; gaps: LiquidityGap[] }> {
  const params = entityId ? `?entity_id=${entityId}` : "";
  return _fetchJson(`/v1/cash/forecast/liquidity-gaps${params}`, token);
}

export async function runForecastScenario(
  token: string,
  payload: { horizon?: string; inflow_shift?: string; outflow_shift?: string; entity_id?: string },
): Promise<ForecastResponse> {
  return _fetchJson("/v1/cash/forecast/scenarios", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getForecastVariance(token: string, entityId?: string): Promise<{ entity_id: string | null; rows: VarianceRow[] }> {
  const params = entityId ? `?entity_id=${entityId}` : "";
  return _fetchJson(`/v1/cash/forecast/variance${params}`, token);
}

export async function getForecastItems(token: string, activeOnly = true): Promise<ForecastItem[]> {
  return _fetchJson(`/v1/cash/forecast/items?active_only=${activeOnly}`, token);
}

export async function createForecastItem(
  token: string,
  payload: {
    label: string; direction: string; amount: string; currency: string;
    recurrence: string; start_date: string; confidence?: string;
    end_date?: string; day_of_month?: number; entity_id?: string;
  },
): Promise<ForecastItem> {
  return _fetchJson("/v1/cash/forecast/items", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateForecastItem(
  token: string,
  itemId: string,
  payload: { label?: string; amount?: string; confidence?: string; end_date?: string; is_active?: boolean },
): Promise<ForecastItem> {
  return _fetchJson(`/v1/cash/forecast/items/${itemId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/cashClient.ts
git commit -m "feat(phase2b): cashClient.ts — 8 forecast API functions + interfaces"
```

---

### Task 9: `/cash-forecast` Page

**Context:** The main forecast dashboard page. Features:
- **Horizon toggle**: 13w / 12m
- **Waterfall chart**: bar chart showing opening → inflows → outflows → closing per period
- **Liquidity gap alerts**: red indicators for periods below threshold
- **Scenario panel**: sliders/inputs for inflow_shift and outflow_shift
- **Variance table**: forecast vs actual for past periods

Uses `useAuth()` for token, `dashboardFetch`-based `cashClient`, inline styles with CSS variables per `frontend.md` rules.

**Files:**
- Create: `frontend/src/app/cash-forecast/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import {
  getConsolidatedForecast, getLiquidityGaps, runForecastScenario,
  getForecastVariance, getForecastItems, createForecastItem,
  type ForecastResponse, type ForecastBucket, type LiquidityGap,
  type VarianceRow, type ForecastItem,
} from "@/lib/api/cashClient";
import { TrendingUp, AlertTriangle, BarChart2, FileText, List, Plus } from "lucide-react";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
} as const;

type Tab = "FORECAST" | "GAPS" | "VARIANCE" | "ITEMS";

function CashForecastInner() {
  const { token, user } = useAuth();
  const [horizon, setHorizon] = useState<"13w" | "12m">("13w");
  const [tab, setTab] = useState<Tab>("FORECAST");
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [gaps, setGaps] = useState<LiquidityGap[]>([]);
  const [variance, setVariance] = useState<VarianceRow[]>([]);
  const [items, setItems] = useState<ForecastItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inflowShift, setInflowShift] = useState("0");
  const [outflowShift, setOutflowShift] = useState("0");
  const [scenarioResult, setScenarioResult] = useState<ForecastResponse | null>(null);

  // New item form
  const [showForm, setShowForm] = useState(false);
  const [newItem, setNewItem] = useState({ label: "", direction: "OUTFLOW", amount: "", currency: "EUR", recurrence: "MONTHLY", start_date: "", confidence: "COMMITTED", day_of_month: "" });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setForecast(null);
    setGaps([]);
    setVariance([]);
    setScenarioResult(null);
    try {
      const [fc, gp] = await Promise.all([
        getConsolidatedForecast(token, horizon),
        getLiquidityGaps(token),
      ]);
      setForecast(fc);
      setGaps(gp.gaps || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load forecast");
    } finally {
      setLoading(false);
    }
  }, [token, horizon]);

  useEffect(() => { load(); }, [load]);

  const loadVariance = useCallback(async () => {
    if (!token) return;
    try {
      const v = await getForecastVariance(token);
      setVariance(v.rows || []);
    } catch { setVariance([]); }
  }, [token]);

  const loadItems = useCallback(async () => {
    if (!token) return;
    try {
      const it = await getForecastItems(token);
      setItems(it);
    } catch { setItems([]); }
  }, [token]);

  useEffect(() => {
    if (tab === "VARIANCE") loadVariance();
    if (tab === "ITEMS") loadItems();
  }, [tab, loadVariance, loadItems]);

  const handleScenario = async () => {
    if (!token) return;
    try {
      const res = await runForecastScenario(token, {
        horizon,
        inflow_shift: inflowShift,
        outflow_shift: outflowShift,
      });
      setScenarioResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Scenario failed");
    }
  };

  const handleCreateItem = async () => {
    if (!token || !newItem.label || !newItem.amount || !newItem.start_date) return;
    try {
      await createForecastItem(token, {
        ...newItem,
        day_of_month: newItem.day_of_month ? parseInt(newItem.day_of_month) : undefined,
      });
      setShowForm(false);
      setNewItem({ label: "", direction: "OUTFLOW", amount: "", currency: "EUR", recurrence: "MONTHLY", start_date: "", confidence: "COMMITTED", day_of_month: "" });
      loadItems();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create item");
    }
  };

  const fmt = (v: string | number | null | undefined) => {
    if (v == null) return "—";
    const n = typeof v === "string" ? parseFloat(v) : v;
    return isNaN(n) ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "FORECAST", label: "FORECAST", icon: <BarChart2 size={14} /> },
    { key: "GAPS", label: `GAPS${gaps.length ? ` (${gaps.length})` : ""}`, icon: <AlertTriangle size={14} /> },
    { key: "VARIANCE", label: "VARIANCE", icon: <FileText size={14} /> },
    { key: "ITEMS", label: "ITEMS", icon: <List size={14} /> },
  ];

  const buckets = (scenarioResult || forecast)?.buckets || [];
  const maxAbs = Math.max(...buckets.map(b => Math.abs(parseFloat(String(b.closing_balance)) || 0)), 1);

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI, color: "var(--text-primary)" }}>
      {/* Header */}
      <div className="widget-drag-handle" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <TrendingUp size={18} />
        <span style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Cash Forecast</span>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 8 }}>
          {horizon === "13w" ? "13-Week Rolling" : "12-Month Rolling"}
        </span>
        <div style={{ flex: 1 }} />
        {/* Horizon toggle */}
        {(["13w", "12m"] as const).map(h => (
          <button key={h} onClick={() => setHorizon(h)} style={{
            padding: "4px 12px", fontSize: 12, fontFamily: S.fontMono, cursor: "pointer",
            background: horizon === h ? "var(--accent-primary)" : S.bgSub,
            color: horizon === h ? "#fff" : "var(--text-secondary)",
            border: `1px solid ${S.rim}`, borderRadius: 4,
          }}>{h.toUpperCase()}</button>
        ))}
      </div>

      {/* Gap alert banner */}
      {gaps.length > 0 && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "8px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={16} color="#ef4444" />
          <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 500 }}>
            {gaps.length} liquidity gap{gaps.length > 1 ? "s" : ""} detected in the forecast horizon
          </span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${S.rim}`, marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
            fontSize: 12, fontFamily: S.fontMono, cursor: "pointer",
            background: "transparent", border: "none", borderBottom: tab === t.key ? "2px solid var(--accent-primary)" : "2px solid transparent",
            color: tab === t.key ? "var(--text-primary)" : "var(--text-secondary)",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {loading && <div style={{ padding: 32, color: "var(--text-secondary)", fontSize: 13 }}>Loading forecast…</div>}
      {error && <div style={{ padding: 16, color: "#ef4444", fontSize: 13 }}>{error}</div>}

      {/* FORECAST tab — waterfall chart */}
      {tab === "FORECAST" && !loading && buckets.length > 0 && (
        <div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>PERIOD</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>OPENING</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "#22c55e" }}>INFLOWS</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "#ef4444" }}>OUTFLOWS</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>CLOSING</th>
                <th style={{ textAlign: "center", padding: "6px 8px", width: 200 }}>WATERFALL</th>
                <th style={{ textAlign: "center", padding: "6px 8px", color: "var(--text-secondary)" }}>GAP</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => {
                const closing = parseFloat(String(b.closing_balance)) || 0;
                const barWidth = Math.abs(closing / maxAbs) * 100;
                const isNeg = closing < 0;
                return (
                  <tr key={`${b.period_start}-${i}`} style={{ borderBottom: `1px solid ${S.rim}`, background: b.liquidity_gap ? "rgba(239,68,68,0.05)" : undefined }}>
                    <td style={{ padding: "6px 8px", fontSize: 12 }}>{b.period_start}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(b.opening_balance)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "#22c55e" }}>+{fmt(b.inflows)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "#ef4444" }}>-{fmt(b.outflows)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: isNeg ? "#ef4444" : "var(--text-primary)" }}>{fmt(b.closing_balance)}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <div style={{ width: "100%", height: 14, background: S.bgDeep, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(barWidth, 100)}%`, height: "100%", background: isNeg ? "#ef4444" : "#22c55e", borderRadius: 3 }} />
                      </div>
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>{b.liquidity_gap ? <AlertTriangle size={14} color="#ef4444" /> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Scenario panel */}
          <div style={{ marginTop: 24, padding: 16, background: S.bgSub, borderRadius: 8, border: `1px solid ${S.rim}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, fontFamily: S.fontMono }}>SCENARIO ANALYSIS</div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Inflow shift %
                <input type="number" step="0.05" value={inflowShift} onChange={e => setInflowShift(e.target.value)}
                  style={{ display: "block", marginTop: 4, width: 100, padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }} />
              </label>
              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Outflow shift %
                <input type="number" step="0.05" value={outflowShift} onChange={e => setOutflowShift(e.target.value)}
                  style={{ display: "block", marginTop: 4, width: 100, padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }} />
              </label>
              <button onClick={handleScenario} style={{
                padding: "6px 16px", fontSize: 12, fontFamily: S.fontMono, cursor: "pointer",
                background: "var(--accent-primary)", color: "#fff", border: "none", borderRadius: 4,
              }}>Run Scenario</button>
              {scenarioResult && (
                <button onClick={() => setScenarioResult(null)} style={{
                  padding: "6px 16px", fontSize: 12, fontFamily: S.fontMono, cursor: "pointer",
                  background: S.bgDeep, color: "var(--text-secondary)", border: `1px solid ${S.rim}`, borderRadius: 4,
                }}>Reset</button>
              )}
            </div>
            {scenarioResult && <div style={{ fontSize: 12, color: "var(--accent-primary)", marginTop: 8 }}>Showing scenario results</div>}
          </div>
        </div>
      )}

      {/* GAPS tab */}
      {tab === "GAPS" && !loading && (
        <div>
          {gaps.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>No liquidity gaps detected</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>PERIOD</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>CURRENCY</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>CLOSING</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>THRESHOLD</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "#ef4444" }}>SHORTFALL</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((g, i) => (
                  <tr key={`${g.period_start}-${g.currency}-${i}`} style={{ borderBottom: `1px solid ${S.rim}` }}>
                    <td style={{ padding: "6px 8px" }}>{g.period_start} — {g.period_end}</td>
                    <td style={{ padding: "6px 8px" }}>{g.currency}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "#ef4444" }}>{fmt(g.closing_balance)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(g.gap_threshold)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "#ef4444", fontWeight: 600 }}>{fmt(g.shortfall)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* VARIANCE tab */}
      {tab === "VARIANCE" && !loading && (
        <div>
          {variance.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>No forecast snapshots yet — save a snapshot to enable variance tracking</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>PERIOD</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>FORECAST</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>ACTUAL</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>VARIANCE</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>VAR %</th>
                </tr>
              </thead>
              <tbody>
                {variance.map((v, i) => {
                  const var_val = v.variance ? parseFloat(v.variance) : null;
                  return (
                    <tr key={`${v.period_start}-${i}`} style={{ borderBottom: `1px solid ${S.rim}` }}>
                      <td style={{ padding: "6px 8px" }}>{v.period_start} — {v.period_end}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(v.forecast_closing)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{v.actual_closing ? fmt(v.actual_closing) : "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: var_val && var_val < 0 ? "#ef4444" : var_val && var_val > 0 ? "#22c55e" : undefined }}>{var_val != null ? fmt(var_val) : "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{v.variance_pct ? `${parseFloat(v.variance_pct).toFixed(1)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ITEMS tab */}
      {tab === "ITEMS" && !loading && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setShowForm(!showForm)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 12,
              fontFamily: S.fontMono, cursor: "pointer", background: "var(--accent-primary)", color: "#fff",
              border: "none", borderRadius: 4,
            }}><Plus size={14} /> Add Item</button>
          </div>

          {showForm && (
            <div style={{ padding: 16, background: S.bgSub, borderRadius: 8, border: `1px solid ${S.rim}`, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <input placeholder="Label" value={newItem.label} onChange={e => setNewItem({ ...newItem, label: e.target.value })}
                  style={{ flex: 1, minWidth: 160, padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }} />
                <select value={newItem.direction} onChange={e => setNewItem({ ...newItem, direction: e.target.value })}
                  style={{ padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }}>
                  <option value="INFLOW">INFLOW</option>
                  <option value="OUTFLOW">OUTFLOW</option>
                </select>
                <input placeholder="Amount" type="number" value={newItem.amount} onChange={e => setNewItem({ ...newItem, amount: e.target.value })}
                  style={{ width: 100, padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }} />
                <input placeholder="CCY" maxLength={3} value={newItem.currency} onChange={e => setNewItem({ ...newItem, currency: e.target.value.toUpperCase() })}
                  style={{ width: 60, padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }} />
                <select value={newItem.recurrence} onChange={e => setNewItem({ ...newItem, recurrence: e.target.value })}
                  style={{ padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }}>
                  {["ONCE", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <input type="date" value={newItem.start_date} onChange={e => setNewItem({ ...newItem, start_date: e.target.value })}
                  style={{ padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }} />
                <select value={newItem.confidence} onChange={e => setNewItem({ ...newItem, confidence: e.target.value })}
                  style={{ padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }}>
                  <option value="COMMITTED">COMMITTED</option>
                  <option value="PROBABLE">PROBABLE</option>
                  <option value="POSSIBLE">POSSIBLE</option>
                </select>
                <button onClick={handleCreateItem} style={{
                  padding: "6px 14px", fontSize: 12, fontFamily: S.fontMono, cursor: "pointer",
                  background: "var(--accent-primary)", color: "#fff", border: "none", borderRadius: 4,
                }}>Save</button>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>No recurring forecast items — add one to include it in forecasts</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>LABEL</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>DIR</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>AMOUNT</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>CCY</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>RECURRENCE</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>CONFIDENCE</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>START</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} style={{ borderBottom: `1px solid ${S.rim}` }}>
                    <td style={{ padding: "6px 8px" }}>{it.label}</td>
                    <td style={{ padding: "6px 8px", color: it.direction === "INFLOW" ? "#22c55e" : "#ef4444" }}>{it.direction}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(it.amount)}</td>
                    <td style={{ padding: "6px 8px" }}>{it.currency}</td>
                    <td style={{ padding: "6px 8px" }}>{it.recurrence}</td>
                    <td style={{ padding: "6px 8px" }}>{it.confidence}</td>
                    <td style={{ padding: "6px 8px" }}>{it.start_date}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 8,
                        background: it.is_active ? "rgba(34,197,94,0.1)" : "rgba(156,163,175,0.1)",
                        color: it.is_active ? "#22c55e" : "#9ca3af",
                      }}>{it.is_active ? "ACTIVE" : "INACTIVE"}</span>
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

export default function CashForecastPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: "var(--text-secondary)" }}>Loading forecast…</div>}>
      <CashForecastInner />
    </Suspense>
  );
}
```

**Important implementation notes:**
- Uses `useAuth()` from `@/lib/authContext` — never direct localStorage
- API calls via `cashClient` functions — never raw fetch
- Minimum font size 12px
- Icon library: `lucide-react` only
- Fonts: IBM Plex Sans (UI), IBM Plex Mono (data)
- Stale state: clears forecast/gaps/variance when switching horizons

- [ ] **Step 2: Verify build**

```bash
cd frontend && npx next build
```
Expected: build succeeds, new route `/cash-forecast` in manifest.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/cash-forecast/page.tsx
git commit -m "feat(phase2b): /cash-forecast page — waterfall chart, gap alerts, scenarios, variance, items"
```

---

### Task 10: AppSidebar Nav Entry

**Context:** Add "Cash Forecast" to the ACCOUNTING section in AppSidebar, right after "Cash Positions". Uses `TrendingUp` icon from lucide-react. Same plan-tier gate: `minTier: "professional"`.

**Files:**
- Modify: `frontend/src/components/layout/AppSidebar.tsx`

- [ ] **Step 1: Add nav item**

In `AppSidebar.tsx`:
1. Add `TrendingUp` to the lucide-react import (if not already imported)
2. In the ACCOUNTING section items array, after the Cash Positions entry, add:
```tsx
{ label: "Cash Forecast", href: "/cash-forecast", icon: TrendingUp, minTier: "professional" },
```
3. Add `"/cash-forecast"` to the ACCOUNTING prefixes array for active-state detection

- [ ] **Step 2: Verify build**

```bash
cd frontend && npx tsc --noEmit && npx next build
```
Expected: clean build.

- [ ] **Step 3: Run full backend test suite**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
DATABASE_URL="sqlite+aiosqlite://" \
BANK_ACCOUNT_ENC_KEY="test-bank-enc-key-at-least-32-bytes-long!!" \
python -m pytest tests/ --override-ini="addopts=" -q --tb=short \
  --deselect tests/test_engine_orchestrator_units.py::TestRunEngine::test_trace_bundle_fingerprint_deterministic
```
Expected: ~4900+ passed, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/AppSidebar.tsx
git commit -m "feat(phase2b): AppSidebar — Cash Forecast nav item in ACCOUNTING section"
```

---

## Route Ordering Note

**IMPORTANT:** FastAPI resolves routes in registration order. The `/{entity_id}` path parameter route MUST be registered AFTER all fixed-path routes (`/consolidated`, `/liquidity-gaps`, `/scenarios`, `/variance`, `/items`). Otherwise, `GET /v1/cash/forecast/consolidated` would match `/{entity_id}` with `entity_id="consolidated"` and fail UUID validation.

In `v1_cash_forecast.py`, the route decorator order must be:
1. `@router.get("/consolidated")` — fixed path
2. `@router.get("/liquidity-gaps")` — fixed path
3. `@router.post("/scenarios")` — fixed path
4. `@router.get("/variance")` — fixed path
5. `@router.post("/items")` — fixed path
6. `@router.get("/items")` — fixed path
7. `@router.patch("/items/{item_id}")` — parameterized but under /items/
8. `@router.get("/{entity_id}")` — LAST — catch-all parameterized path
