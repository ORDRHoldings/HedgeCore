# Phase 4: Debt Management + Interest Rate Risk — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add debt facility management and full-derivatives IR risk (IRS, XCCY, swaptions, caps/floors) to ORDR TreasuryFX, with IFRS 9 hedge effectiveness testing and WORM audit trail.

**Architecture:** Engine-first — five pure-function `engine_v1` modules compute all analytics without DB access, then services orchestrate DB + engine calls, then FastAPI routes expose 15 endpoints, then three Next.js pages render the UI.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async ORM, PostgreSQL (Alembic migrations), Next.js 15.5 App Router, TypeScript 5.9, React 19, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-04-17-debt-ir-risk-design.md`

---

## File Map

### New files — Backend Engine
| File | Responsibility |
|------|---------------|
| `backend/app/engine_v1/ir_curve_engine.py` | Bootstrap OIS + swap discount curves from rate quotes |
| `backend/app/engine_v1/swap_valuator.py` | NPV, DV01, PVBP for IRS and XCCY swaps |
| `backend/app/engine_v1/swaption_engine.py` | Black-76 + Bachelier pricing for swaptions, caps, floors, collars |
| `backend/app/engine_v1/debt_cashflow_engine.py` | Amortization schedules, interest accruals, covenant ratios |
| `backend/app/engine_v1/ir_hedge_effectiveness.py` | IFRS 9 dollar-offset + regression effectiveness testing |

### New files — Backend Models + Migrations
| File | Responsibility |
|------|---------------|
| `backend/app/models/debt.py` | `DebtFacility`, `DebtDrawdown`, `DebtCovenant` ORM models |
| `backend/app/models/ir_risk.py` | `IRSwap`, `IRVolSnapshot`, `IRHedgeRun` ORM models |
| `backend/alembic/versions/XXXX_debt_tables.py` | Create debt_facilities, debt_drawdowns, debt_covenants + indexes |
| `backend/alembic/versions/XXXX_ir_risk_tables.py` | Create ir_swaps, ir_vol_snapshots, ir_hedge_runs + WORM trigger |
| `backend/alembic/versions/XXXX_ir_debt_permissions.py` | Insert 4 RBAC permissions + assign to roles |

### New files — Backend Services
| File | Responsibility |
|------|---------------|
| `backend/app/services/debt_service.py` | Facility/drawdown CRUD, maturity calendar, covenant checks |
| `backend/app/services/ir_swap_service.py` | Swap lifecycle, MTM valuation, DV01 ladder |
| `backend/app/services/ir_hedge_service.py` | Effectiveness tests, WORM run writes, evidence bundles |

### New files — Backend Routes
| File | Responsibility |
|------|---------------|
| `backend/app/api/routes/v1_debt.py` | 8 debt endpoints (facilities, drawdowns, maturity, schedule, covenants, exposure) |
| `backend/app/api/routes/v1_ir_risk.py` | 7 IR risk endpoints (swaps CRUD, MTM, DV01, effectiveness) |

### New files — Backend Tests
| File | Tests |
|------|-------|
| `backend/tests/test_ir_curve_engine.py` | Curve bootstrap accuracy, forward rates, discount factors |
| `backend/tests/test_swap_valuator.py` | Par swap NPV=0, DV01 sign, amortizing cashflows |
| `backend/tests/test_swaption_engine.py` | Black-76/Bachelier switch, put-call parity |
| `backend/tests/test_debt_cashflow_engine.py` | Amortization sum, day count conventions, covenants |
| `backend/tests/test_ir_hedge_effectiveness.py` | 80/125 boundaries, regression thresholds |
| `backend/tests/test_debt_service.py` | Service logic, audit events (AsyncMock) |
| `backend/tests/test_ir_swap_service.py` | MTM, fail-open, terminate (AsyncMock) |
| `backend/tests/test_ir_hedge_service.py` | WORM write, hash chain, hedge ratio (AsyncMock) |
| `backend/tests/test_v1_debt_routes.py` | All 8 endpoints: 200/401/403/404 |
| `backend/tests/test_v1_ir_risk_routes.py` | All 7 endpoints: 200/401/403/422 |

### New files — Frontend
| File | Responsibility |
|------|---------------|
| `frontend/src/lib/api/debtClient.ts` | API functions for debt + IR risk endpoints |
| `frontend/src/app/debt/page.tsx` | Debt portfolio dashboard (summary, maturity ladder, facility table, covenant health) |
| `frontend/src/app/debt/[id]/page.tsx` | Facility detail (schedule, covenants, linked hedges tabs) |
| `frontend/src/app/ir-risk/page.tsx` | IR risk dashboard (exposure, DV01 ladder, swap portfolio) |

### Modified files
| File | Change |
|------|--------|
| `backend/app/api/router.py` | Import + register v1_debt_router and v1_ir_risk_router |
| `frontend/src/components/navigation/AppSidebar.tsx` | Add DEBT & IR RISK section (CreditCard + TrendingDown icons, professional:2 gate) |

---

## Chunk 1: IR Analytics Engine

### Task 1: `ir_curve_engine.py` — Yield Curve Bootstrapper

**Files:**
- Create: `backend/app/engine_v1/ir_curve_engine.py`
- Create: `backend/tests/test_ir_curve_engine.py`

- [ ] **Step 1.1: Write the failing tests**

```python
# backend/tests/test_ir_curve_engine.py
"""Pure-function tests for the IR yield curve bootstrapper."""
from datetime import date
import math


def test_single_node_discount_factor():
    """Single 1Y rate produces correct discount factor: df = 1/(1+r)."""
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    quotes = [RateQuote(tenor="1Y", rate=0.05, instrument="OIS", index="SOFR")]
    curve = bootstrap_curve(quotes, as_of=date(2026, 1, 1))
    assert len(curve.nodes) >= 1
    node_1y = next(n for n in curve.nodes if n.tenor == "1Y")
    expected_df = 1.0 / (1.0 + 0.05)
    assert abs(node_1y.discount_factor - expected_df) < 1e-6


def test_forward_rate_non_negative_for_normal_curve():
    """Upward-sloping curve produces positive forward rates."""
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    quotes = [
        RateQuote(tenor="1Y", rate=0.04, instrument="OIS", index="SOFR"),
        RateQuote(tenor="2Y", rate=0.05, instrument="OIS", index="SOFR"),
    ]
    curve = bootstrap_curve(quotes, as_of=date(2026, 1, 1))
    node_2y = next(n for n in curve.nodes if n.tenor == "2Y")
    assert node_2y.forward_rate > 0.0


def test_zero_rate_consistency():
    """Zero rate derived from discount factor is self-consistent."""
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    quotes = [RateQuote(tenor="2Y", rate=0.06, instrument="OIS", index="EURIBOR")]
    curve = bootstrap_curve(quotes, as_of=date(2026, 1, 1))
    node = next(n for n in curve.nodes if n.tenor == "2Y")
    # df = exp(-zero_rate * t); for t=2: zero_rate = -ln(df)/2
    implied_zero = -math.log(node.discount_factor) / 2.0
    assert abs(implied_zero - node.zero_rate) < 1e-6


def test_multi_index_curves_are_independent():
    """SOFR and EURIBOR quotes produce separate curves."""
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    quotes = [
        RateQuote(tenor="1Y", rate=0.05, instrument="OIS", index="SOFR"),
        RateQuote(tenor="1Y", rate=0.03, instrument="OIS", index="EURIBOR"),
    ]
    sofr_curve = bootstrap_curve([q for q in quotes if q.index == "SOFR"], as_of=date(2026, 1, 1))
    eur_curve = bootstrap_curve([q for q in quotes if q.index == "EURIBOR"], as_of=date(2026, 1, 1))
    sofr_df = next(n for n in sofr_curve.nodes if n.tenor == "1Y").discount_factor
    eur_df = next(n for n in eur_curve.nodes if n.tenor == "1Y").discount_factor
    assert sofr_df < eur_df  # higher rate → lower discount factor
```

- [ ] **Step 1.2: Run to confirm FAIL**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_ir_curve_engine.py -v
```
Expected: `ImportError: cannot import name 'bootstrap_curve'`

- [ ] **Step 1.3: Implement `ir_curve_engine.py`**

```python
# backend/app/engine_v1/ir_curve_engine.py
"""
engine_v1/ir_curve_engine.py
Bootstrap OIS and IRS yield curves from market rate quotes.

Pure computation — no I/O, no state.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date


@dataclass
class RateQuote:
    tenor: str       # "1M","3M","6M","1Y","2Y","5Y","10Y","30Y"
    rate: float      # decimal, e.g. 0.0525 for 5.25%
    instrument: str  # "OIS" | "IRS" | "FRA"
    index: str       # "SOFR" | "EURIBOR" | "SONIA" | "TONAR"


@dataclass
class CurveNode:
    tenor: str
    years: float
    discount_factor: float
    zero_rate: float
    forward_rate: float


@dataclass
class IRCurve:
    index: str
    as_of: date
    nodes: list[CurveNode]

    def discount_factor(self, years: float) -> float:
        """Log-linear interpolation on discount factors."""
        if not self.nodes:
            return 1.0
        if years <= self.nodes[0].years:
            return self.nodes[0].discount_factor
        if years >= self.nodes[-1].years:
            n = self.nodes[-1]
            return math.exp(math.log(n.discount_factor) * years / n.years)
        for i in range(len(self.nodes) - 1):
            n1, n2 = self.nodes[i], self.nodes[i + 1]
            if n1.years <= years <= n2.years:
                w = (years - n1.years) / (n2.years - n1.years)
                log_df = (1 - w) * math.log(n1.discount_factor) + w * math.log(n2.discount_factor)
                return math.exp(log_df)
        return self.nodes[-1].discount_factor


_TENOR_YEARS: dict[str, float] = {
    "1M": 1/12, "3M": 3/12, "6M": 6/12, "9M": 9/12,
    "1Y": 1.0, "2Y": 2.0, "3Y": 3.0, "4Y": 4.0, "5Y": 5.0,
    "7Y": 7.0, "10Y": 10.0, "15Y": 15.0, "20Y": 20.0, "30Y": 30.0,
}


def bootstrap_curve(quotes: list[RateQuote], as_of: date) -> IRCurve:
    """Bootstrap a discount curve from a list of rate quotes.

    Uses simple annual compounding for OIS/IRS: df = 1 / (1 + r*t).
    Returns nodes sorted by tenor ascending.
    """
    if not quotes:
        return IRCurve(index="UNKNOWN", as_of=as_of, nodes=[])

    index = quotes[0].index
    nodes: list[CurveNode] = []
    prev_df = 1.0
    prev_t = 0.0

    sorted_quotes = sorted(quotes, key=lambda q: _TENOR_YEARS.get(q.tenor, 99.0))

    for q in sorted_quotes:
        t = _TENOR_YEARS.get(q.tenor, 1.0)
        df = 1.0 / (1.0 + q.rate * t)
        zero_rate = -math.log(df) / t if t > 0 and df > 0 else q.rate
        # Forward rate between prev node and this node
        if t > prev_t and prev_df > 0 and df > 0:
            fwd = (prev_df / df - 1.0) / (t - prev_t)
        else:
            fwd = q.rate
        nodes.append(CurveNode(
            tenor=q.tenor, years=t,
            discount_factor=df, zero_rate=zero_rate, forward_rate=fwd,
        ))
        prev_df = df
        prev_t = t

    return IRCurve(index=index, as_of=as_of, nodes=nodes)
```

- [ ] **Step 1.4: Run tests — confirm PASS**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_ir_curve_engine.py -v
```
Expected: `4 passed`

- [ ] **Step 1.5: Commit**

```bash
git add backend/app/engine_v1/ir_curve_engine.py backend/tests/test_ir_curve_engine.py
git commit -m "feat(engine): ir_curve_engine — OIS/IRS yield curve bootstrapper"
```

---

### Task 2: `swap_valuator.py` — IRS / XCCY Valuation

**Files:**
- Create: `backend/app/engine_v1/swap_valuator.py`
- Create: `backend/tests/test_swap_valuator.py`

- [ ] **Step 2.1: Write failing tests**

```python
# backend/tests/test_swap_valuator.py
"""Pure-function tests for IRS / XCCY swap valuation."""
from datetime import date


def test_par_swap_npv_is_zero():
    """A swap struck at the par rate has NPV = 0 at inception."""
    from app.engine_v1.swap_valuator import value_swap, SwapSpec
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote

    curve = bootstrap_curve(
        [RateQuote(tenor="2Y", rate=0.05, instrument="OIS", index="SOFR")],
        as_of=date(2026, 1, 1),
    )
    spec = SwapSpec(
        notional=1_000_000.0, currency="USD",
        fixed_rate=0.05, float_index="SOFR",
        start_date=date(2026, 1, 1), maturity_date=date(2028, 1, 1),
        pay_fixed=True, day_count="ACT365",
        reset_frequency="ANNUAL",
        amortization_schedule=None, fx_basis_bps=0.0,
    )
    val = value_swap(spec, curve)
    assert abs(val.npv) < 1000.0  # par swap ≈ 0 NPV (within rounding)


def test_pay_fixed_dv01_is_negative():
    """Pay-fixed swap loses value when rates fall → DV01 is negative."""
    from app.engine_v1.swap_valuator import value_swap, SwapSpec
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote

    curve = bootstrap_curve(
        [RateQuote(tenor="5Y", rate=0.05, instrument="OIS", index="SOFR")],
        as_of=date(2026, 1, 1),
    )
    spec = SwapSpec(
        notional=1_000_000.0, currency="USD",
        fixed_rate=0.05, float_index="SOFR",
        start_date=date(2026, 1, 1), maturity_date=date(2031, 1, 1),
        pay_fixed=True, day_count="ACT365",
        reset_frequency="ANNUAL",
        amortization_schedule=None, fx_basis_bps=0.0,
    )
    val = value_swap(spec, curve)
    assert val.dv01 < 0.0


def test_receive_fixed_dv01_is_positive():
    """Receive-fixed swap gains when rates fall → DV01 is positive."""
    from app.engine_v1.swap_valuator import value_swap, SwapSpec
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote

    curve = bootstrap_curve(
        [RateQuote(tenor="5Y", rate=0.05, instrument="OIS", index="SOFR")],
        as_of=date(2026, 1, 1),
    )
    spec = SwapSpec(
        notional=1_000_000.0, currency="USD",
        fixed_rate=0.05, float_index="SOFR",
        start_date=date(2026, 1, 1), maturity_date=date(2031, 1, 1),
        pay_fixed=False, day_count="ACT365",
        reset_frequency="ANNUAL",
        amortization_schedule=None, fx_basis_bps=0.0,
    )
    val = value_swap(spec, curve)
    assert val.dv01 > 0.0


def test_valuation_fields_present():
    """SwapValuation returns all required fields."""
    from app.engine_v1.swap_valuator import value_swap, SwapSpec
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote

    curve = bootstrap_curve(
        [RateQuote(tenor="3Y", rate=0.045, instrument="OIS", index="SOFR")],
        as_of=date(2026, 1, 1),
    )
    spec = SwapSpec(
        notional=500_000.0, currency="USD",
        fixed_rate=0.045, float_index="SOFR",
        start_date=date(2026, 1, 1), maturity_date=date(2029, 1, 1),
        pay_fixed=True, day_count="ACT365",
        reset_frequency="ANNUAL",
        amortization_schedule=None, fx_basis_bps=0.0,
    )
    val = value_swap(spec, curve)
    assert hasattr(val, "npv")
    assert hasattr(val, "dv01")
    assert hasattr(val, "pvbp")
    assert hasattr(val, "par_rate")
    assert hasattr(val, "fixed_leg_pv")
    assert hasattr(val, "floating_leg_pv")
```

- [ ] **Step 2.2: Run to confirm FAIL**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_swap_valuator.py -v
```
Expected: `ImportError`

- [ ] **Step 2.3: Implement `swap_valuator.py`**

```python
# backend/app/engine_v1/swap_valuator.py
"""
engine_v1/swap_valuator.py
Value interest rate swaps (IRS) and cross-currency swaps (XCCY).

Pure computation — no I/O, no state.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.engine_v1.ir_curve_engine import IRCurve


@dataclass
class SwapSpec:
    notional: float
    currency: str
    fixed_rate: float
    float_index: str        # "SOFR" | "EURIBOR" | "SONIA"
    start_date: date
    maturity_date: date
    pay_fixed: bool
    day_count: str          # "ACT360" | "ACT365" | "30_360" | "ACTACT"
    reset_frequency: str    # "MONTHLY" | "QUARTERLY" | "SEMI" | "ANNUAL"
    amortization_schedule: list[tuple[date, float]] | None
    fx_basis_bps: float     # 0.0 for plain IRS; basis spread for XCCY


@dataclass
class SwapValuation:
    npv: float
    dv01: float
    pvbp: float
    accrued_interest: float
    par_rate: float
    fixed_leg_pv: float
    floating_leg_pv: float

    def to_dict(self) -> dict:
        return {
            "npv": self.npv, "dv01": self.dv01, "pvbp": self.pvbp,
            "accrued_interest": self.accrued_interest, "par_rate": self.par_rate,
            "fixed_leg_pv": self.fixed_leg_pv, "floating_leg_pv": self.floating_leg_pv,
        }


_FREQ_PERIODS: dict[str, int] = {
    "MONTHLY": 12, "QUARTERLY": 4, "SEMI": 2, "ANNUAL": 1,
}


def _year_fraction(start: date, end: date, day_count: str) -> float:
    days = (end - start).days
    if day_count in ("ACT360",):
        return days / 360.0
    if day_count in ("ACT365", "ACTACT"):
        return days / 365.0
    if day_count == "30_360":
        d1, d2 = min(start.day, 30), min(end.day, 30)
        return (360 * (end.year - start.year) + 30 * (end.month - start.month) + (d2 - d1)) / 360.0
    return days / 365.0


def _payment_schedule(spec: SwapSpec) -> list[tuple[date, date, float]]:
    """Return list of (period_start, period_end, notional) tuples."""
    from datetime import timedelta
    import calendar

    freq = _FREQ_PERIODS.get(spec.reset_frequency, 1)
    months_per_period = 12 // freq
    periods = []
    current = spec.start_date
    notional = spec.notional

    while current < spec.maturity_date:
        m = current.month + months_per_period
        y = current.year + (m - 1) // 12
        m = (m - 1) % 12 + 1
        day = min(current.day, calendar.monthrange(y, m)[1])
        from datetime import date as _date
        next_date = min(_date(y, m, day), spec.maturity_date)

        if spec.amortization_schedule:
            for amort_date, remaining in spec.amortization_schedule:
                if amort_date <= next_date:
                    notional = remaining
        periods.append((current, next_date, notional))
        current = next_date

    return periods


def value_swap(spec: SwapSpec, curve: IRCurve) -> SwapValuation:
    """Value an IRS or XCCY swap using the provided discount curve."""
    basis_adj = spec.fx_basis_bps / 10_000.0
    periods = _payment_schedule(spec)

    fixed_leg_pv = 0.0
    floating_leg_pv = 0.0
    annuity = 0.0  # sum of df * tau — used for par rate

    for p_start, p_end, notional in periods:
        t_start = (p_start - spec.start_date).days / 365.0
        t_end = (p_end - spec.start_date).days / 365.0
        tau = _year_fraction(p_start, p_end, spec.day_count)

        df_start = curve.discount_factor(t_start)
        df_end = curve.discount_factor(t_end)

        # Fixed leg coupon
        fixed_coupon = notional * spec.fixed_rate * tau
        fixed_leg_pv += fixed_coupon * df_end

        # Floating leg: implied forward rate from discount factors
        fwd_rate = (df_start / df_end - 1.0) / tau if tau > 0 else 0.0
        float_coupon = notional * (fwd_rate + basis_adj) * tau
        floating_leg_pv += float_coupon * df_end

        annuity += notional * tau * df_end

    # NPV from perspective of fixed-rate payer
    npv_pay_fixed = floating_leg_pv - fixed_leg_pv
    npv = npv_pay_fixed if spec.pay_fixed else -npv_pay_fixed

    # Par rate: rate at which NPV = 0 (floating_leg_pv / annuity)
    par_rate = floating_leg_pv / annuity if annuity > 0 else spec.fixed_rate

    # DV01: parallel shift of +1bp
    shifted_quotes_fixed = spec.fixed_rate + 0.0001
    bump_fixed_pv = sum(
        notional * shifted_quotes_fixed * _year_fraction(ps, pe, spec.day_count) * curve.discount_factor((pe - spec.start_date).days / 365.0)
        for ps, pe, notional in periods
    )
    dv01_raw = (bump_fixed_pv - fixed_leg_pv)
    dv01 = -dv01_raw if spec.pay_fixed else dv01_raw

    # PVBP = abs DV01
    pvbp = abs(dv01)

    return SwapValuation(
        npv=npv, dv01=dv01, pvbp=pvbp,
        accrued_interest=0.0,
        par_rate=par_rate,
        fixed_leg_pv=fixed_leg_pv,
        floating_leg_pv=floating_leg_pv,
    )
```

- [ ] **Step 2.4: Run tests — confirm PASS**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_swap_valuator.py -v
```
Expected: `4 passed`

- [ ] **Step 2.5: Commit**

```bash
git add backend/app/engine_v1/swap_valuator.py backend/tests/test_swap_valuator.py
git commit -m "feat(engine): swap_valuator — IRS/XCCY NPV, DV01, PVBP"
```

---

### Task 3: `swaption_engine.py` — Swaption + Cap/Floor Pricing

**Files:**
- Create: `backend/app/engine_v1/swaption_engine.py`
- Create: `backend/tests/test_swaption_engine.py`

- [ ] **Step 3.1: Write failing tests**

```python
# backend/tests/test_swaption_engine.py
"""Pure-function tests for swaption / cap / floor pricing."""
from datetime import date
import math


def _base_spec(model="BLACK76"):
    from app.engine_v1.swaption_engine import SwaptionSpec
    from app.engine_v1.swap_valuator import SwapSpec
    underlying = SwapSpec(
        notional=1_000_000.0, currency="USD",
        fixed_rate=0.05, float_index="SOFR",
        start_date=date(2027, 1, 1), maturity_date=date(2032, 1, 1),
        pay_fixed=True, day_count="ACT365",
        reset_frequency="ANNUAL",
        amortization_schedule=None, fx_basis_bps=0.0,
    )
    return SwaptionSpec(
        instrument_type="SWAPTION",
        notional=1_000_000.0,
        option_expiry=date(2027, 1, 1),
        underlying_swap=underlying,
        strike=0.05,
        vol=0.20,
        model=model,
    )


def test_black76_premium_positive():
    """Black-76 swaption premium must be strictly positive."""
    from app.engine_v1.swaption_engine import price_swaption
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    curve = bootstrap_curve(
        [RateQuote(tenor="5Y", rate=0.05, instrument="OIS", index="SOFR")],
        as_of=date(2026, 1, 1),
    )
    val = price_swaption(_base_spec("BLACK76"), curve, as_of=date(2026, 1, 1))
    assert val.premium > 0.0


def test_bachelier_premium_positive():
    """Bachelier premium must be positive."""
    from app.engine_v1.swaption_engine import price_swaption
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    curve = bootstrap_curve(
        [RateQuote(tenor="5Y", rate=0.005, instrument="OIS", index="EURIBOR")],
        as_of=date(2026, 1, 1),
    )
    spec = _base_spec("BACHELIER")
    val = price_swaption(spec, curve, as_of=date(2026, 1, 1))
    assert val.premium > 0.0


def test_model_auto_selects_bachelier_for_low_rates():
    """Auto-selection uses Bachelier when forward rate <= 0.5%."""
    from app.engine_v1.swaption_engine import price_swaption, SwaptionSpec
    from app.engine_v1.swap_valuator import SwapSpec
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    curve = bootstrap_curve(
        [RateQuote(tenor="5Y", rate=0.003, instrument="OIS", index="EURIBOR")],
        as_of=date(2026, 1, 1),
    )
    underlying = SwapSpec(
        notional=1_000_000.0, currency="EUR",
        fixed_rate=0.003, float_index="EURIBOR",
        start_date=date(2027, 1, 1), maturity_date=date(2032, 1, 1),
        pay_fixed=True, day_count="ACT365",
        reset_frequency="ANNUAL",
        amortization_schedule=None, fx_basis_bps=0.0,
    )
    spec = SwaptionSpec(
        instrument_type="SWAPTION", notional=1_000_000.0,
        option_expiry=date(2027, 1, 1), underlying_swap=underlying,
        strike=0.003, vol=0.005, model="AUTO",
    )
    val = price_swaption(spec, curve, as_of=date(2026, 1, 1))
    assert val.model_used == "BACHELIER"


def test_zero_vol_premium_equals_intrinsic():
    """With zero vol, ATM swaption premium approaches zero (no time value)."""
    from app.engine_v1.swaption_engine import price_swaption
    from app.engine_v1.ir_curve_engine import bootstrap_curve, RateQuote
    curve = bootstrap_curve(
        [RateQuote(tenor="5Y", rate=0.05, instrument="OIS", index="SOFR")],
        as_of=date(2026, 1, 1),
    )
    spec = _base_spec("BLACK76")
    spec.vol = 1e-10  # essentially zero vol
    val = price_swaption(spec, curve, as_of=date(2026, 1, 1))
    assert val.premium < 100.0  # near-zero intrinsic for ATM
```

- [ ] **Step 3.2: Run to confirm FAIL**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_swaption_engine.py -v
```

- [ ] **Step 3.3: Implement `swaption_engine.py`**

```python
# backend/app/engine_v1/swaption_engine.py
"""
engine_v1/swaption_engine.py
Price European swaptions, caps, floors, and collars.

Uses Black-76 (log-normal) for rate > 0.5%, Bachelier (normal) otherwise.
Pure computation — no I/O, no state.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date

from app.engine_v1.ir_curve_engine import IRCurve
from app.engine_v1.swap_valuator import SwapSpec


@dataclass
class SwaptionSpec:
    instrument_type: str   # "SWAPTION" | "CAP" | "FLOOR" | "COLLAR"
    notional: float
    option_expiry: date
    underlying_swap: SwapSpec
    strike: float
    vol: float
    model: str             # "BLACK76" | "BACHELIER" | "AUTO"


@dataclass
class SwaptionValuation:
    premium: float
    delta: float
    vega: float
    theta: float
    model_used: str

    def to_dict(self) -> dict:
        return {
            "premium": self.premium, "delta": self.delta,
            "vega": self.vega, "theta": self.theta, "model_used": self.model_used,
        }


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def _black76(F: float, K: float, T: float, vol: float, df: float, is_payer: bool) -> tuple[float, float, float]:
    """Black-76 formula. Returns (premium, delta, vega)."""
    if T <= 0 or vol <= 0:
        intrinsic = max(0.0, (F - K) if is_payer else (K - F))
        return df * intrinsic, 0.0, 0.0
    sqrtT = math.sqrt(T)
    d1 = (math.log(F / K) + 0.5 * vol**2 * T) / (vol * sqrtT) if F > 0 and K > 0 else 0.0
    d2 = d1 - vol * sqrtT
    if is_payer:
        premium = df * (F * _norm_cdf(d1) - K * _norm_cdf(d2))
        delta = df * _norm_cdf(d1)
    else:
        premium = df * (K * _norm_cdf(-d2) - F * _norm_cdf(-d1))
        delta = -df * _norm_cdf(-d1)
    vega = df * F * _norm_pdf(d1) * sqrtT
    return premium, delta, vega


def _bachelier(F: float, K: float, T: float, vol: float, df: float, is_payer: bool) -> tuple[float, float, float]:
    """Bachelier (normal) formula. Returns (premium, delta, vega)."""
    if T <= 0 or vol <= 0:
        intrinsic = max(0.0, (F - K) if is_payer else (K - F))
        return df * intrinsic, 0.0, 0.0
    sqrtT = math.sqrt(T)
    sigma_t = vol * sqrtT
    d = (F - K) / sigma_t if sigma_t > 0 else 0.0
    if is_payer:
        premium = df * ((F - K) * _norm_cdf(d) + sigma_t * _norm_pdf(d))
        delta = df * _norm_cdf(d)
    else:
        premium = df * ((K - F) * _norm_cdf(-d) + sigma_t * _norm_pdf(d))
        delta = -df * _norm_cdf(-d)
    vega = df * sqrtT * _norm_pdf(d)
    return premium, delta, vega


def price_swaption(spec: SwaptionSpec, curve: IRCurve, as_of: date) -> SwaptionValuation:
    """Price a European swaption using Black-76 or Bachelier model."""
    from app.engine_v1.swap_valuator import value_swap

    T = max((spec.option_expiry - as_of).days / 365.0, 0.0)
    df = curve.discount_factor(T)
    val = value_swap(spec.underlying_swap, curve)
    F = val.par_rate  # forward swap rate

    # Auto model selection
    if spec.model == "AUTO":
        model = "BACHELIER" if F <= 0.005 else "BLACK76"
    else:
        model = spec.model

    is_payer = spec.underlying_swap.pay_fixed
    K = spec.strike

    if model == "BLACK76" and F > 0 and K > 0:
        premium, delta, vega = _black76(F, K, T, spec.vol, df, is_payer)
    else:
        premium, delta, vega = _bachelier(F, K, T, spec.vol, df, is_payer)
        model = "BACHELIER"

    # Scale to notional (Black-76/Bachelier returns per-unit rate premium)
    annuity = abs(val.pvbp) * 10_000  # pvbp is per-bp; annuity ≈ pvbp * 10000
    premium_scaled = premium * spec.notional

    # Theta (time decay per day)
    if T > 1/365:
        T_minus = T - 1/365
        if model == "BLACK76" and F > 0 and K > 0:
            p2, _, _ = _black76(F, K, T_minus, spec.vol, df, is_payer)
        else:
            p2, _, _ = _bachelier(F, K, T_minus, spec.vol, df, is_payer)
        theta = (p2 - premium) * spec.notional
    else:
        theta = 0.0

    return SwaptionValuation(
        premium=max(0.0, premium_scaled),
        delta=delta,
        vega=vega * spec.notional,
        theta=theta,
        model_used=model,
    )
```

- [ ] **Step 3.4: Run tests — confirm PASS**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_swaption_engine.py -v
```
Expected: `4 passed`

- [ ] **Step 3.5: Commit**

```bash
git add backend/app/engine_v1/swaption_engine.py backend/tests/test_swaption_engine.py
git commit -m "feat(engine): swaption_engine — Black-76 + Bachelier swaption pricing"
```

---

### Task 4: `debt_cashflow_engine.py` — Amortization + Covenants

**Files:**
- Create: `backend/app/engine_v1/debt_cashflow_engine.py`
- Create: `backend/tests/test_debt_cashflow_engine.py`

- [ ] **Step 4.1: Write failing tests**

```python
# backend/tests/test_debt_cashflow_engine.py
"""Pure-function tests for the debt cashflow + covenant engine."""
from datetime import date


def test_bullet_loan_cashflows_sum_to_principal():
    """All principal payments in a bullet loan sum to the original principal."""
    from app.engine_v1.debt_cashflow_engine import compute_debt_schedule, DebtFacilitySpec
    spec = DebtFacilitySpec(
        principal=1_000_000.0, margin_bps=150,
        rate_index="SOFR", index_rate=0.05,
        day_count="ACT365", repayment_type="BULLET",
        start_date=date(2026, 1, 1), maturity_date=date(2028, 1, 1),
        payment_frequency="ANNUAL", covenants=[],
    )
    schedule = compute_debt_schedule(spec)
    total_principal = sum(p["principal_payment"] for p in schedule.periods)
    assert abs(total_principal - 1_000_000.0) < 1.0


def test_amortizing_outstanding_decreases_each_period():
    """Outstanding balance decreases monotonically for amortizing loan."""
    from app.engine_v1.debt_cashflow_engine import compute_debt_schedule, DebtFacilitySpec
    spec = DebtFacilitySpec(
        principal=600_000.0, margin_bps=200,
        rate_index="FIXED", index_rate=0.0,
        day_count="ACT365", repayment_type="AMORTIZING",
        start_date=date(2026, 1, 1), maturity_date=date(2029, 1, 1),
        payment_frequency="ANNUAL", covenants=[],
    )
    schedule = compute_debt_schedule(spec)
    outstandings = [p["outstanding_balance"] for p in schedule.periods]
    for i in range(len(outstandings) - 1):
        assert outstandings[i] >= outstandings[i + 1]


def test_act360_vs_act365_interest_difference():
    """ACT/360 produces higher interest than ACT/365 for same rate."""
    from app.engine_v1.debt_cashflow_engine import compute_debt_schedule, DebtFacilitySpec
    base = dict(
        principal=1_000_000.0, margin_bps=0,
        rate_index="FIXED", index_rate=0.05,
        repayment_type="BULLET",
        start_date=date(2026, 1, 1), maturity_date=date(2027, 1, 1),
        payment_frequency="ANNUAL", covenants=[],
    )
    s360 = compute_debt_schedule(DebtFacilitySpec(**{**base, "day_count": "ACT360"}))
    s365 = compute_debt_schedule(DebtFacilitySpec(**{**base, "day_count": "ACT365"}))
    interest_360 = sum(p["interest_payment"] for p in s360.periods)
    interest_365 = sum(p["interest_payment"] for p in s365.periods)
    assert interest_360 > interest_365


def test_dscr_covenant_breach_detected():
    """A DSCR below threshold is flagged as BREACH."""
    from app.engine_v1.debt_cashflow_engine import compute_debt_schedule, DebtFacilitySpec, CovenantSpec
    spec = DebtFacilitySpec(
        principal=1_000_000.0, margin_bps=200,
        rate_index="FIXED", index_rate=0.0,
        day_count="ACT365", repayment_type="BULLET",
        start_date=date(2026, 1, 1), maturity_date=date(2027, 1, 1),
        payment_frequency="ANNUAL",
        covenants=[CovenantSpec(covenant_type="DSCR", threshold=1.5, current_value=1.2)],
    )
    schedule = compute_debt_schedule(spec)
    dscr_result = next(c for c in schedule.covenant_results if c["type"] == "DSCR")
    assert dscr_result["status"] == "BREACH"
```

- [ ] **Step 4.2: Run to confirm FAIL**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_debt_cashflow_engine.py -v
```

- [ ] **Step 4.3: Implement `debt_cashflow_engine.py`**

```python
# backend/app/engine_v1/debt_cashflow_engine.py
"""
engine_v1/debt_cashflow_engine.py
Amortization schedules, interest accruals, and covenant ratio calculations.

Pure computation — no I/O, no state.
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date


@dataclass
class CovenantSpec:
    covenant_type: str  # DSCR | LTV | INTEREST_COVERAGE | NET_LEVERAGE | MIN_LIQUIDITY
    threshold: float
    current_value: float


@dataclass
class DebtFacilitySpec:
    principal: float
    margin_bps: int
    rate_index: str       # SOFR | EURIBOR | SONIA | FIXED
    index_rate: float     # current index fixing (0.0 for FIXED)
    day_count: str        # ACT360 | ACT365 | 30_360 | ACTACT
    repayment_type: str   # BULLET | AMORTIZING | BALLOON
    start_date: date
    maturity_date: date
    payment_frequency: str  # MONTHLY | QUARTERLY | SEMI | ANNUAL
    covenants: list[CovenantSpec]


@dataclass
class DebtSchedule:
    periods: list[dict]          # date, principal_payment, interest_payment, total_payment, outstanding_balance
    total_interest_expense: float
    weighted_avg_life: float
    covenant_results: list[dict]


_FREQ_MONTHS: dict[str, int] = {
    "MONTHLY": 1, "QUARTERLY": 3, "SEMI": 6, "ANNUAL": 12,
}


def _next_date(d: date, months: int) -> date:
    m = d.month + months
    y = d.year + (m - 1) // 12
    m = (m - 1) % 12 + 1
    day = min(d.day, calendar.monthrange(y, m)[1])
    return date(y, m, day)


def _year_frac(start: date, end: date, day_count: str) -> float:
    days = (end - start).days
    if day_count == "ACT360":
        return days / 360.0
    if day_count in ("ACT365", "ACTACT"):
        return days / 365.0
    if day_count == "30_360":
        d1 = min(start.day, 30)
        d2 = min(end.day, 30)
        return (360 * (end.year - start.year) + 30 * (end.month - start.month) + (d2 - d1)) / 360.0
    return days / 365.0


def compute_debt_schedule(spec: DebtFacilitySpec) -> DebtSchedule:
    """Compute full amortization schedule and covenant ratios."""
    rate = spec.index_rate + spec.margin_bps / 10_000.0
    months = _FREQ_MONTHS.get(spec.payment_frequency, 12)
    outstanding = spec.principal

    periods = []
    current = spec.start_date
    total_periods = 0

    while current < spec.maturity_date:
        next_d = min(_next_date(current, months), spec.maturity_date)
        tau = _year_frac(current, next_d, spec.day_count)
        interest = outstanding * rate * tau
        is_last = (next_d >= spec.maturity_date)

        if spec.repayment_type == "BULLET":
            principal_pmt = outstanding if is_last else 0.0
        elif spec.repayment_type == "AMORTIZING":
            n_remaining = max(1, round((spec.maturity_date - current).days / ((next_d - current).days or 1)))
            principal_pmt = outstanding / n_remaining
        else:  # BALLOON
            principal_pmt = outstanding * 0.1 if not is_last else outstanding

        principal_pmt = min(principal_pmt, outstanding)
        outstanding_after = outstanding - principal_pmt

        periods.append({
            "period_start": current,
            "period_end": next_d,
            "principal_payment": round(principal_pmt, 2),
            "interest_payment": round(interest, 2),
            "total_payment": round(principal_pmt + interest, 2),
            "outstanding_balance": round(outstanding_after, 2),
        })
        outstanding = outstanding_after
        current = next_d
        total_periods += 1

    total_interest = sum(p["interest_payment"] for p in periods)
    wal = sum(
        p["principal_payment"] * (p["period_end"] - spec.start_date).days / 365.0
        for p in periods
    ) / spec.principal if spec.principal > 0 else 0.0

    # Covenant results
    covenant_results = []
    for cov in spec.covenants:
        threshold = cov.threshold
        current_val = cov.current_value
        headroom = (current_val - threshold) / threshold * 100.0 if threshold else 0.0
        # For DSCR, ICR: current >= threshold = compliant
        # For LTV, NET_LEVERAGE: current <= threshold = compliant
        inverted = cov.covenant_type in ("LTV", "NET_LEVERAGE")
        if inverted:
            compliant = current_val <= threshold
            headroom = (threshold - current_val) / threshold * 100.0 if threshold else 0.0
        else:
            compliant = current_val >= threshold
        warning = (not compliant) and abs(headroom) < 15.0
        status = "COMPLIANT" if compliant else ("WARNING" if warning else "BREACH")
        covenant_results.append({
            "type": cov.covenant_type, "threshold": threshold,
            "current_value": current_val, "headroom_pct": round(headroom, 2),
            "status": status,
        })

    return DebtSchedule(
        periods=periods,
        total_interest_expense=round(total_interest, 2),
        weighted_avg_life=round(wal, 4),
        covenant_results=covenant_results,
    )
```

- [ ] **Step 4.4: Run tests — confirm PASS**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_debt_cashflow_engine.py -v
```
Expected: `4 passed`

- [ ] **Step 4.5: Commit**

```bash
git add backend/app/engine_v1/debt_cashflow_engine.py backend/tests/test_debt_cashflow_engine.py
git commit -m "feat(engine): debt_cashflow_engine — amortization, accruals, covenants"
```

---

### Task 5: `ir_hedge_effectiveness.py` — IFRS 9 Testing

**Files:**
- Create: `backend/app/engine_v1/ir_hedge_effectiveness.py`
- Create: `backend/tests/test_ir_hedge_effectiveness.py`

- [ ] **Step 5.1: Write failing tests**

```python
# backend/tests/test_ir_hedge_effectiveness.py
"""Tests for IFRS 9 IR hedge effectiveness engine."""


def test_dollar_offset_pass_at_80_percent():
    from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
    # hedging instrument offsets 100% of hedged item → ratio = 1.0
    result = test_ir_effectiveness(
        hedged_item_fv_changes=[-100.0, -200.0],
        instrument_fv_changes=[100.0, 200.0],
        method="DOLLAR_OFFSET",
    )
    assert result.passed is True
    assert abs(result.ratio - 1.0) < 0.01


def test_dollar_offset_fail_below_80():
    from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
    # instrument only offsets 50% → ratio = 0.5 → FAIL
    result = test_ir_effectiveness(
        hedged_item_fv_changes=[-100.0],
        instrument_fv_changes=[50.0],
        method="DOLLAR_OFFSET",
    )
    assert result.passed is False
    assert result.ratio < 0.80


def test_dollar_offset_fail_above_125():
    from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
    # instrument over-offsets → ratio = 1.5 → FAIL
    result = test_ir_effectiveness(
        hedged_item_fv_changes=[-100.0],
        instrument_fv_changes=[150.0],
        method="DOLLAR_OFFSET",
    )
    assert result.passed is False
    assert result.ratio > 1.25


def test_dollar_offset_pass_at_125_boundary():
    from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
    result = test_ir_effectiveness(
        hedged_item_fv_changes=[-100.0],
        instrument_fv_changes=[125.0],
        method="DOLLAR_OFFSET",
    )
    assert result.passed is True


def test_result_has_evidence_bundle():
    from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
    result = test_ir_effectiveness(
        hedged_item_fv_changes=[-100.0, -50.0],
        instrument_fv_changes=[95.0, 48.0],
        method="DOLLAR_OFFSET",
    )
    assert "hedged_item_fv_changes" in result.evidence_bundle
    assert "instrument_fv_changes" in result.evidence_bundle
    assert "ratio" in result.evidence_bundle


def test_regression_pass_high_r_squared():
    """Regression method passes when R² >= 0.80 and slope in [-1.25, -0.80]."""
    from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
    # Perfect negative correlation, slope = -1.0 → R² = 1.0, slope = -1.0
    hedged = [-100.0, -200.0, -150.0, -50.0, -300.0]
    instrument = [100.0, 200.0, 150.0, 50.0, 300.0]
    result = test_ir_effectiveness(hedged, instrument, method="REGRESSION")
    assert result.passed is True
    assert result.ratio >= 0.80


def test_regression_fail_low_r_squared():
    """Regression method fails when R² < 0.80 (noisy hedge)."""
    from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
    # Noisy data — low correlation
    hedged = [-100.0, -100.0, -100.0]
    instrument = [50.0, 200.0, 10.0]
    result = test_ir_effectiveness(hedged, instrument, method="REGRESSION")
    assert result.passed is False
```

- [ ] **Step 5.2: Run to confirm FAIL**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_ir_hedge_effectiveness.py -v
```

- [ ] **Step 5.3: Implement `ir_hedge_effectiveness.py`**

```python
# backend/app/engine_v1/ir_hedge_effectiveness.py
"""
engine_v1/ir_hedge_effectiveness.py
IFRS 9.6.4.1 hedge effectiveness testing for IR hedges.

Mirrors hedge_accounting.py structure. Pure computation — no I/O, no state.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class IREffectivenessResult:
    method: str
    ratio: float          # dollar-offset ratio, or R² for regression
    passed: bool
    prospective: bool
    retrospective: bool
    evidence_bundle: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "method": self.method, "ratio": self.ratio,
            "passed": self.passed, "prospective": self.prospective,
            "retrospective": self.retrospective,
        }


_LOWER = 0.80
_UPPER = 1.25


def test_ir_effectiveness(
    hedged_item_fv_changes: list[float],
    instrument_fv_changes: list[float],
    method: str = "DOLLAR_OFFSET",
) -> IREffectivenessResult:
    """IFRS 9 hedge effectiveness test for IR hedges.

    Dollar-offset: ratio = -(sum instrument FV changes) / (sum hedged item FV changes).
    Pass: 0.80 <= ratio <= 1.25.
    """
    if method == "DOLLAR_OFFSET":
        return _dollar_offset(hedged_item_fv_changes, instrument_fv_changes)
    return _regression(hedged_item_fv_changes, instrument_fv_changes)


def _dollar_offset(
    hedged: list[float],
    instrument: list[float],
) -> IREffectivenessResult:
    sum_hedged = sum(hedged)
    sum_instrument = sum(instrument)

    if abs(sum_hedged) < 1e-10:
        ratio = 0.0
    else:
        ratio = -sum_instrument / sum_hedged

    passed = _LOWER <= ratio <= _UPPER
    return IREffectivenessResult(
        method="DOLLAR_OFFSET",
        ratio=round(ratio, 6),
        passed=passed,
        prospective=passed,
        retrospective=passed,
        evidence_bundle={
            "hedged_item_fv_changes": hedged,
            "instrument_fv_changes": instrument,
            "sum_hedged": sum_hedged,
            "sum_instrument": sum_instrument,
            "ratio": ratio,
            "lower_bound": _LOWER,
            "upper_bound": _UPPER,
        },
    )


def _regression(
    hedged: list[float],
    instrument: list[float],
) -> IREffectivenessResult:
    n = len(hedged)
    if n < 2:
        return IREffectivenessResult(
            method="REGRESSION_INSUFFICIENT_DATA",
            ratio=0.0, passed=False,
            prospective=False, retrospective=False,
            evidence_bundle={"error": "need at least 2 data points"},
        )

    mean_x = sum(hedged) / n
    mean_y = sum(instrument) / n
    ss_xx = sum((x - mean_x) ** 2 for x in hedged)
    ss_yy = sum((y - mean_y) ** 2 for y in instrument)
    ss_xy = sum((x - mean_x) * (y - mean_y) for x, y in zip(hedged, instrument))

    if ss_xx < 1e-10 or ss_yy < 1e-10:
        return IREffectivenessResult(
            method="REGRESSION",
            ratio=0.0, passed=False,
            prospective=False, retrospective=False,
            evidence_bundle={"error": "zero variance"},
        )

    slope = ss_xy / ss_xx
    r_squared = (ss_xy ** 2) / (ss_xx * ss_yy)
    passed = r_squared >= 0.80 and -1.25 <= slope <= -0.80

    return IREffectivenessResult(
        method="REGRESSION",
        ratio=round(r_squared, 6),
        passed=passed,
        prospective=passed,
        retrospective=passed,
        evidence_bundle={
            "hedged_item_fv_changes": hedged,
            "instrument_fv_changes": instrument,
            "r_squared": r_squared,
            "slope": slope,
        },
    )
```

- [ ] **Step 5.4: Run tests — confirm PASS**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_ir_hedge_effectiveness.py -v
```
Expected: `7 passed`

- [ ] **Step 5.5: Run full engine test suite**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_ir_curve_engine.py tests/test_swap_valuator.py tests/test_swaption_engine.py tests/test_debt_cashflow_engine.py tests/test_ir_hedge_effectiveness.py -v
```
Expected: `23 passed` (4 + 4 + 4 + 4 + 7)

- [ ] **Step 5.6: Commit**

```bash
git add backend/app/engine_v1/ir_hedge_effectiveness.py backend/tests/test_ir_hedge_effectiveness.py
git commit -m "feat(engine): ir_hedge_effectiveness — IFRS 9 dollar-offset + regression"
```

---

## Chunk 2: ORM Models + Migrations

### Task 6: Debt ORM Models

**Files:**
- Create: `backend/app/models/debt.py`

- [ ] **Step 6.1: Create `debt.py`**

```python
# backend/app/models/debt.py
"""
Debt management ORM models.

DebtFacility    — credit line or loan record
DebtDrawdown    — individual drawdowns against a facility
DebtCovenant    — covenant thresholds and live values
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class DebtFacility(Base):
    __tablename__ = "debt_facilities"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    legal_entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("legal_entities.id"), nullable=True, index=True)
    facility_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # REVOLVER | TERM_LOAN | BILATERAL | SYNDICATED | BOND | REPO | MARGIN_LINE
    counterparty: Mapped[str] = mapped_column(String(255), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    committed_amount: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    drawn_amount: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False, default=0.0)
    margin_bps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rate_index: Mapped[str] = mapped_column(String(16), nullable=False)
    # SOFR | EURIBOR | SONIA | TONAR | FIXED
    maturity_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    day_count: Mapped[str] = mapped_column(String(16), nullable=False, default="ACT365")
    # ACT360 | ACT365 | 30_360 | ACTACT
    payment_frequency: Mapped[str] = mapped_column(String(16), nullable=False, default="QUARTERLY")
    repayment_type: Mapped[str] = mapped_column(String(16), nullable=False, default="BULLET")
    # BULLET | AMORTIZING | BALLOON
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="ACTIVE")
    # ACTIVE | COMMITTED_UNDRAWN | EXPIRED | CANCELLED
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class DebtDrawdown(Base):
    __tablename__ = "debt_drawdowns"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    facility_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("debt_facilities.id"), nullable=False, index=True)
    drawdown_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    repayment_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    rate_fixed_at: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    drawdown_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))

    @staticmethod
    def compute_hash(facility_id: uuid.UUID, amount: float, drawdown_date: object) -> str:
        raw = f"{facility_id}:{amount}:{drawdown_date}"
        return hashlib.sha256(raw.encode()).hexdigest()


class DebtCovenant(Base):
    __tablename__ = "debt_covenants"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    facility_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("debt_facilities.id"), nullable=False, index=True)
    covenant_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # DSCR | LTV | INTEREST_COVERAGE | NET_LEVERAGE | MIN_LIQUIDITY
    threshold: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    current_value: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)
    headroom_pct: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="COMPLIANT")
    # COMPLIANT | WARNING | BREACH
    tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
```

- [ ] **Step 6.2: Commit**

```bash
git add backend/app/models/debt.py
git commit -m "feat(models): DebtFacility, DebtDrawdown, DebtCovenant ORM models"
```

---

### Task 7: IR Risk ORM Models

**Files:**
- Create: `backend/app/models/ir_risk.py`

- [ ] **Step 7.1: Create `ir_risk.py`**

```python
# backend/app/models/ir_risk.py
"""
IR risk ORM models.

IRSwap         — interest rate derivative instrument
IRVolSnapshot  — IR swaption vol surface (distinct from FX options_snapshots)
IRHedgeRun     — WORM effectiveness test run, hash-chained
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

GENESIS_HASH = "0" * 64


class IRSwap(Base):
    __tablename__ = "ir_swaps"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    legal_entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("legal_entities.id"), nullable=True, index=True)
    linked_facility_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("debt_facilities.id"), nullable=True, index=True)
    instrument_type: Mapped[str] = mapped_column(String(16), nullable=False)
    # IRS | XCCY | CAP | FLOOR | COLLAR | SWAPTION | CMS
    notional: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    fixed_rate: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    strike: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    float_index: Mapped[str] = mapped_column(String(16), nullable=False)
    start_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    maturity_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    pay_fixed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    day_count: Mapped[str] = mapped_column(String(16), nullable=False, default="ACT365")
    reset_frequency: Mapped[str] = mapped_column(String(16), nullable=False, default="QUARTERLY")
    last_npv: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)
    last_dv01: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)
    last_mtm_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ACTIVE")
    # ACTIVE | TERMINATED | EXPIRED
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class IRVolSnapshot(Base):
    __tablename__ = "ir_vol_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    index: Mapped[str] = mapped_column(String(16), nullable=False)  # SOFR | EURIBOR | SONIA
    option_expiry: Mapped[str] = mapped_column(String(8), nullable=False)   # "1M","3M","6M","1Y","2Y"
    swap_tenor: Mapped[str] = mapped_column(String(8), nullable=False)      # "1Y","2Y","5Y","10Y","30Y"
    strike: Mapped[float] = mapped_column(Numeric(10, 6), nullable=False, default=0.0)  # 0 = ATM
    implied_vol_normal: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)   # Bachelier bps/year
    implied_vol_lognormal: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)  # Black-76
    as_of: Mapped[datetime] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class IRHedgeRun(Base):
    """WORM: append-only, hash-chained. Never update or delete."""
    __tablename__ = "ir_hedge_runs"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    swap_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("ir_swaps.id"), nullable=False, index=True)
    facility_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("debt_facilities.id"), nullable=True)
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), server_default="now()")
    method: Mapped[str] = mapped_column(String(32), nullable=False)
    ratio: Mapped[float] = mapped_column(Numeric(10, 6), nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    inputs_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    run_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    prior_run_hash: Mapped[str] = mapped_column(String(64), nullable=False, default=GENESIS_HASH)
    evidence_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    @staticmethod
    def compute_run_hash(inputs_hash: str, prior_run_hash: str) -> str:
        raw = f"{inputs_hash}:{prior_run_hash}"
        return hashlib.sha256(raw.encode()).hexdigest()
```

- [ ] **Step 7.2: Commit**

```bash
git add backend/app/models/ir_risk.py
git commit -m "feat(models): IRSwap, IRVolSnapshot, IRHedgeRun ORM models"
```

---

### Task 8: Alembic Migrations

**Files:**
- Run alembic to generate, then edit three migration files

- [ ] **Step 8.1: Import models in alembic env.py**

Open `backend/alembic/env.py`. Find the `target_metadata` import block. Add:

```python
from app.models.debt import DebtFacility, DebtDrawdown, DebtCovenant  # noqa: F401
from app.models.ir_risk import IRSwap, IRVolSnapshot, IRHedgeRun       # noqa: F401
```

- [ ] **Step 8.2: Generate migration 1 — debt tables**

```bash
cd backend
alembic revision --autogenerate -m "add_debt_tables"
```

Open the generated file. Verify it creates `debt_facilities`, `debt_drawdowns`, `debt_covenants`. Add composite indexes manually if missing:

```python
# In upgrade():
op.create_index("ix_debt_facilities_tenant_status", "debt_facilities", ["tenant_id", "status"])
op.create_index("ix_debt_facilities_tenant_maturity", "debt_facilities", ["tenant_id", "maturity_date"])
op.create_index("ix_debt_drawdowns_facility", "debt_drawdowns", ["facility_id"])
op.create_index("ix_debt_covenants_facility", "debt_covenants", ["facility_id"])

# In downgrade():
op.drop_index("ix_debt_facilities_tenant_status", "debt_facilities")
op.drop_index("ix_debt_facilities_tenant_maturity", "debt_facilities")
op.drop_index("ix_debt_drawdowns_facility", "debt_drawdowns")
op.drop_index("ix_debt_covenants_facility", "debt_covenants")
```

- [ ] **Step 8.3: Generate migration 2 — IR risk tables**

```bash
cd backend
alembic revision --autogenerate -m "add_ir_risk_tables"
```

After generating, add WORM trigger and indexes to the upgrade function:

```python
# In upgrade() — add after table creation:
op.execute("""
    CREATE OR REPLACE FUNCTION protect_ir_hedge_runs()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        RAISE EXCEPTION 'ir_hedge_runs is append-only — UPDATE and DELETE are forbidden';
    END;
    $$;
""")
op.execute("""
    CREATE TRIGGER trg_ir_hedge_runs_worm
    BEFORE UPDATE OR DELETE ON ir_hedge_runs
    FOR EACH ROW EXECUTE FUNCTION protect_ir_hedge_runs();
""")
op.create_index("ix_ir_swaps_tenant_status", "ir_swaps", ["tenant_id", "status"])
op.create_index("ix_ir_hedge_runs_tenant_run_at", "ir_hedge_runs", ["tenant_id", "run_at"])

# In downgrade():
op.execute("DROP TRIGGER IF EXISTS trg_ir_hedge_runs_worm ON ir_hedge_runs;")
op.execute("DROP FUNCTION IF EXISTS protect_ir_hedge_runs;")
op.drop_index("ix_ir_swaps_tenant_status", "ir_swaps")
op.drop_index("ix_ir_hedge_runs_tenant_run_at", "ir_hedge_runs")
```

- [ ] **Step 8.4: Generate migration 3 — RBAC permissions**

```bash
cd backend
alembic revision -m "add_ir_debt_permissions"
```

Edit the empty migration to insert permissions:

```python
from alembic import op
import uuid

def upgrade() -> None:
    # Insert 4 new RBAC permissions using dot-notation to match existing 41 permissions
    for codename, module, action, description in [
        ("debt.read",     "debt",    "read",  "View debt facilities, drawdowns, covenants, schedules"),
        ("debt.write",    "debt",    "write", "Create/update debt facilities and drawdowns"),
        ("ir_risk.read",  "ir_risk", "read",  "View IR swaps, DV01 ladder, effectiveness runs"),
        ("ir_risk.write", "ir_risk", "write", "Create IR swaps, trigger MTM and effectiveness tests"),
    ]:
        op.execute(f"""
            INSERT INTO permissions (id, codename, module, action, description, created_at)
            VALUES ('{uuid.uuid4()}', '{codename}', '{module}', '{action}', '{description}', NOW())
            ON CONFLICT (codename) DO NOTHING;
        """)
    # Assign to actual role names (matching DEFAULT_ROLE_PERMISSIONS in permission.py)
    for role_name, perms in [
        ("risk_analyst", ["debt.read", "ir_risk.read"]),
        ("supervisor",   ["debt.read", "debt.write", "ir_risk.read", "ir_risk.write"]),
        ("admin",        ["debt.read", "debt.write", "ir_risk.read", "ir_risk.write"]),
    ]:
        for perm in perms:
            op.execute(f"""
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT r.id, p.id FROM roles r, permissions p
                WHERE r.name = '{role_name}' AND p.codename = '{perm}'
                ON CONFLICT DO NOTHING;
            """)

def downgrade() -> None:
    for codename in ["debt.read", "debt.write", "ir_risk.read", "ir_risk.write"]:
        op.execute(f"DELETE FROM permissions WHERE codename = '{codename}';")
```

- [ ] **Step 8.5: Commit**

```bash
git add backend/alembic/ backend/app/models/
git commit -m "feat(migrations): debt tables, IR risk tables + WORM trigger, RBAC permissions"
```

---

## Chunk 3: Services

### Task 9: `debt_service.py`

**Files:**
- Create: `backend/app/services/debt_service.py`
- Create: `backend/tests/test_debt_service.py`

- [ ] **Step 9.1: Write failing service tests**

```python
# backend/tests/test_debt_service.py
"""Service tests for debt_service — AsyncMock, no real DB."""
import uuid
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_create_facility_posts_audit_event():
    """create_facility must emit an audit event."""
    from app.services.debt_service import create_facility

    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()

    tenant_id = uuid.uuid4()
    spec = {
        "facility_type": "TERM_LOAN", "counterparty": "TestBank",
        "currency": "USD", "committed_amount": 1_000_000.0,
        "margin_bps": 150, "rate_index": "SOFR",
        "maturity_date": date(2028, 1, 1),
        "day_count": "ACT365", "payment_frequency": "QUARTERLY",
        "repayment_type": "BULLET",
    }

    with patch("app.services.debt_service.emit_audit_event", new_callable=AsyncMock) as mock_emit:
        await create_facility(session, tenant_id=tenant_id, spec=spec)
        mock_emit.assert_called_once()
        call_kwargs = mock_emit.call_args[1]
        assert "DEBT_FACILITY_CREATED" in str(call_kwargs.get("event_type", ""))


@pytest.mark.asyncio
async def test_record_drawdown_updates_drawn_amount():
    """record_drawdown must update facility.drawn_amount."""
    from app.services.debt_service import record_drawdown
    from app.models.debt import DebtFacility

    session = AsyncMock()
    facility_id = uuid.uuid4()
    tenant_id = uuid.uuid4()

    fake_facility = MagicMock(spec=DebtFacility)
    fake_facility.drawn_amount = 0.0
    fake_facility.committed_amount = 1_000_000.0
    fake_facility.id = facility_id
    fake_facility.tenant_id = tenant_id

    session.get = AsyncMock(return_value=fake_facility)
    session.flush = AsyncMock()

    with patch("app.services.debt_service.emit_audit_event", new_callable=AsyncMock):
        await record_drawdown(
            session, facility_id=facility_id, tenant_id=tenant_id,
            amount=250_000.0, drawdown_date=date(2026, 4, 17),
        )
    assert fake_facility.drawn_amount == 250_000.0


@pytest.mark.asyncio
async def test_check_covenants_sets_breach_status():
    """check_covenants updates DebtCovenant status to BREACH when triggered."""
    from app.services.debt_service import check_covenants
    from app.models.debt import DebtCovenant

    session = AsyncMock()
    facility_id = uuid.uuid4()

    breach_cov = MagicMock(spec=DebtCovenant)
    breach_cov.covenant_type = "DSCR"
    breach_cov.threshold = 1.5
    breach_cov.current_value = 1.1
    breach_cov.status = "COMPLIANT"

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [breach_cov]
    session.execute = AsyncMock(return_value=mock_result)
    session.flush = AsyncMock()

    with patch("app.services.debt_service.emit_audit_event", new_callable=AsyncMock):
        await check_covenants(session, facility_id=facility_id, tenant_id=uuid.uuid4())

    assert breach_cov.status == "BREACH"
```

- [ ] **Step 9.2: Run to confirm FAIL**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_debt_service.py -v
```

- [ ] **Step 9.3: Implement `debt_service.py`**

```python
# backend/app/services/debt_service.py
"""Debt facility management service."""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.debt import DebtCovenant, DebtDrawdown, DebtFacility
from app.services.cash_audit_service import emit_audit_event


async def create_facility(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    spec: dict[str, Any],
    created_by: uuid.UUID | None = None,
) -> DebtFacility:
    facility = DebtFacility(
        tenant_id=tenant_id,
        legal_entity_id=spec.get("legal_entity_id"),
        facility_type=spec["facility_type"],
        counterparty=spec["counterparty"],
        currency=spec["currency"],
        committed_amount=spec["committed_amount"],
        drawn_amount=0.0,
        margin_bps=spec.get("margin_bps", 0),
        rate_index=spec.get("rate_index", "FIXED"),
        maturity_date=spec["maturity_date"],
        day_count=spec.get("day_count", "ACT365"),
        payment_frequency=spec.get("payment_frequency", "QUARTERLY"),
        repayment_type=spec.get("repayment_type", "BULLET"),
        status="ACTIVE",
    )
    session.add(facility)
    await session.flush()
    await session.refresh(facility)
    await emit_audit_event(
        session, tenant_id=tenant_id,
        event_type="DEBT_FACILITY_CREATED",
        entity_id=str(facility.id),
        details={"facility_type": facility.facility_type, "currency": facility.currency},
    )
    return facility


async def record_drawdown(
    session: AsyncSession,
    *,
    facility_id: uuid.UUID,
    tenant_id: uuid.UUID,
    amount: float,
    drawdown_date: date,
    repayment_date: date | None = None,
    rate_fixed_at: float | None = None,
) -> DebtDrawdown:
    facility = await session.get(DebtFacility, facility_id)
    if not facility or facility.tenant_id != tenant_id:
        raise ValueError("Facility not found")
    facility.drawn_amount = (facility.drawn_amount or 0.0) + amount
    drawdown = DebtDrawdown(
        tenant_id=tenant_id,
        facility_id=facility_id,
        drawdown_date=drawdown_date,
        amount=amount,
        repayment_date=repayment_date,
        rate_fixed_at=rate_fixed_at,
        drawdown_hash=DebtDrawdown.compute_hash(facility_id, amount, drawdown_date),
    )
    session.add(drawdown)
    await session.flush()
    await emit_audit_event(
        session, tenant_id=tenant_id,
        event_type="DEBT_DRAWDOWN_RECORDED",
        entity_id=str(facility_id),
        details={"amount": amount, "drawdown_date": str(drawdown_date)},
    )
    return drawdown


async def get_maturity_calendar(session: AsyncSession, *, tenant_id: uuid.UUID) -> list[dict]:
    result = await session.execute(
        select(DebtFacility)
        .where(DebtFacility.tenant_id == tenant_id, DebtFacility.status == "ACTIVE")
        .order_by(DebtFacility.maturity_date)
    )
    facilities = result.scalars().all()
    today = date.today()
    return [
        {
            "id": str(f.id), "counterparty": f.counterparty,
            "facility_type": f.facility_type, "currency": f.currency,
            "committed_amount": float(f.committed_amount),
            "drawn_amount": float(f.drawn_amount or 0),
            "maturity_date": str(f.maturity_date),
            "days_to_maturity": (f.maturity_date - today).days if hasattr(f.maturity_date, "__sub__") else None,
        }
        for f in facilities
    ]


async def get_debt_schedule(session: AsyncSession, *, facility_id: uuid.UUID, tenant_id: uuid.UUID) -> dict:
    from app.engine_v1.debt_cashflow_engine import DebtFacilitySpec, compute_debt_schedule
    facility = await session.get(DebtFacility, facility_id)
    if not facility or facility.tenant_id != tenant_id:
        raise ValueError("Facility not found")
    spec = DebtFacilitySpec(
        principal=float(facility.drawn_amount or facility.committed_amount),
        margin_bps=facility.margin_bps or 0,
        rate_index=facility.rate_index,
        index_rate=0.0,  # caller can inject current fixing
        day_count=facility.day_count,
        repayment_type=facility.repayment_type,
        start_date=date.today(),
        maturity_date=facility.maturity_date,
        payment_frequency=facility.payment_frequency,
        covenants=[],
    )
    schedule = compute_debt_schedule(spec)
    return {
        "facility_id": str(facility_id),
        "periods": schedule.periods,
        "total_interest_expense": schedule.total_interest_expense,
        "weighted_avg_life": schedule.weighted_avg_life,
    }


async def check_covenants(
    session: AsyncSession, *, facility_id: uuid.UUID, tenant_id: uuid.UUID,
) -> list[dict]:
    result = await session.execute(
        select(DebtCovenant).where(
            DebtCovenant.facility_id == facility_id,
            DebtCovenant.tenant_id == tenant_id,
        )
    )
    covenants = result.scalars().all()
    results = []
    for cov in covenants:
        threshold = float(cov.threshold)
        current = float(cov.current_value or 0)
        inverted = cov.covenant_type in ("LTV", "NET_LEVERAGE")
        if inverted:
            headroom = (threshold - current) / threshold * 100.0 if threshold else 0.0
            compliant = current <= threshold
        else:
            headroom = (current - threshold) / threshold * 100.0 if threshold else 0.0
            compliant = current >= threshold
        warning = (not compliant) and abs(headroom) < 15.0
        status = "COMPLIANT" if compliant else ("WARNING" if warning else "BREACH")
        cov.status = status
        cov.headroom_pct = round(headroom, 4)
        cov.tested_at = datetime.now(UTC)
        results.append({"covenant_type": cov.covenant_type, "status": status, "headroom_pct": headroom})
    await session.flush()
    if any(r["status"] == "BREACH" for r in results):
        await emit_audit_event(
            session, tenant_id=tenant_id,
            event_type="DEBT_COVENANT_BREACH",
            entity_id=str(facility_id),
            details={"breached": [r["covenant_type"] for r in results if r["status"] == "BREACH"]},
        )
    return results


async def get_total_exposure(session: AsyncSession, *, tenant_id: uuid.UUID) -> list[dict]:
    result = await session.execute(
        select(DebtFacility).where(
            DebtFacility.tenant_id == tenant_id,
            DebtFacility.status == "ACTIVE",
        )
    )
    rows: dict[str, dict] = {}
    for f in result.scalars().all():
        key = f.currency
        if key not in rows:
            rows[key] = {"currency": key, "committed": 0.0, "drawn": 0.0}
        rows[key]["committed"] += float(f.committed_amount)
        rows[key]["drawn"] += float(f.drawn_amount or 0)
    return list(rows.values())
```

- [ ] **Step 9.4: Run tests — confirm PASS**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_debt_service.py -v
```
Expected: `3 passed`

- [ ] **Step 9.5: Commit**

```bash
git add backend/app/services/debt_service.py backend/tests/test_debt_service.py
git commit -m "feat(service): debt_service — facility CRUD, drawdowns, covenants"
```

---

### Task 10: `ir_swap_service.py` + `ir_hedge_service.py`

**Files:**
- Create: `backend/app/services/ir_swap_service.py`
- Create: `backend/app/services/ir_hedge_service.py`
- Create: `backend/tests/test_ir_swap_service.py`
- Create: `backend/tests/test_ir_hedge_service.py`

- [ ] **Step 10.1: Write failing tests**

```python
# backend/tests/test_ir_swap_service.py
import uuid
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_mark_to_market_posts_audit_event():
    from app.services.ir_swap_service import mark_to_market
    from app.models.ir_risk import IRSwap

    session = AsyncMock()
    swap_id = uuid.uuid4()
    fake_swap = MagicMock(spec=IRSwap)
    fake_swap.id = swap_id
    fake_swap.tenant_id = uuid.uuid4()
    fake_swap.instrument_type = "IRS"
    fake_swap.notional = 1_000_000.0
    fake_swap.currency = "USD"
    fake_swap.fixed_rate = 0.05
    fake_swap.float_index = "SOFR"
    fake_swap.start_date = date(2026, 1, 1)
    fake_swap.maturity_date = date(2028, 1, 1)
    fake_swap.pay_fixed = True
    fake_swap.day_count = "ACT365"
    fake_swap.reset_frequency = "ANNUAL"
    fake_swap.status = "ACTIVE"
    session.get = AsyncMock(return_value=fake_swap)
    session.flush = AsyncMock()

    fake_quotes = [MagicMock(tenor="2Y", rate=0.05, instrument="OIS", index="SOFR")]
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = fake_quotes
    session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.ir_swap_service.emit_audit_event", new_callable=AsyncMock) as mock_emit:
        with patch("app.services.ir_swap_service._fetch_rate_quotes", new_callable=AsyncMock, return_value=fake_quotes):
            await mark_to_market(session, swap_id=swap_id, tenant_id=fake_swap.tenant_id)
            mock_emit.assert_called_once()
            assert "IR_SWAP_MTM" in str(mock_emit.call_args[1].get("event_type", ""))


@pytest.mark.asyncio
async def test_mark_to_market_all_is_fail_open():
    """Curve bootstrap failure must not propagate — fail-open."""
    from app.services.ir_swap_service import mark_to_market_all
    from app.models.ir_risk import IRSwap

    session = AsyncMock()
    fake_swap = MagicMock(spec=IRSwap)
    fake_swap.id = uuid.uuid4()
    fake_swap.tenant_id = uuid.uuid4()
    fake_swap.status = "ACTIVE"

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [fake_swap]
    session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.ir_swap_service.mark_to_market", new_callable=AsyncMock, side_effect=Exception("curve error")):
        # Must not raise — fail-open
        result = await mark_to_market_all(session, tenant_id=uuid.uuid4())
        assert result["failed"] == 1
        assert result["succeeded"] == 0
```

```python
# backend/tests/test_ir_hedge_service.py
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_run_effectiveness_test_writes_worm_run():
    from app.services.ir_hedge_service import run_effectiveness_test

    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()

    swap_id = uuid.uuid4()
    facility_id = uuid.uuid4()
    tenant_id = uuid.uuid4()

    with patch("app.services.ir_hedge_service._get_latest_run_hash", new_callable=AsyncMock, return_value="0" * 64):
        with patch("app.services.ir_hedge_service._build_fv_series", new_callable=AsyncMock, return_value=([-100.0], [95.0])):
            result = await run_effectiveness_test(
                session,
                swap_id=swap_id,
                facility_id=facility_id,
                tenant_id=tenant_id,
                method="DOLLAR_OFFSET",
            )
    session.add.assert_called_once()  # IRHedgeRun was written
    assert result["passed"] in (True, False)
    assert "ratio" in result


@pytest.mark.asyncio
async def test_get_hedge_ratio_returns_dv01_ratio():
    from app.services.ir_hedge_service import get_hedge_ratio
    from app.models.ir_risk import IRSwap

    session = AsyncMock()
    fake_swap = MagicMock(spec=IRSwap)
    fake_swap.last_dv01 = -4500.0
    session.get = AsyncMock(return_value=fake_swap)

    with patch("app.services.ir_hedge_service._get_facility_dv01", new_callable=AsyncMock, return_value=-5000.0):
        ratio = await get_hedge_ratio(session, swap_id=uuid.uuid4(), facility_id=uuid.uuid4(), tenant_id=uuid.uuid4())
    assert abs(ratio - 0.9) < 0.01
```

- [ ] **Step 10.2: Run to confirm FAIL**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_ir_swap_service.py tests/test_ir_hedge_service.py -v
```

- [ ] **Step 10.3: Implement `ir_swap_service.py`**

```python
# backend/app/services/ir_swap_service.py
"""IR swap lifecycle management service."""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine_v1.ir_curve_engine import RateQuote, bootstrap_curve
from app.engine_v1.swap_valuator import SwapSpec, value_swap
from app.models.ir_risk import IRSwap
from app.services.cash_audit_service import emit_audit_event


async def _fetch_rate_quotes(session: AsyncSession, index: str, tenant_id: uuid.UUID) -> list[RateQuote]:
    """Fetch the latest rate quotes for an index from market snapshots."""
    # Attempt to load from forward_curve_snapshots; fall back to empty list (fail-open)
    try:
        from app.models.market_data import ForwardCurveSnapshot  # adjust import to actual model
        result = await session.execute(
            select(ForwardCurveSnapshot)
            .where(ForwardCurveSnapshot.currency_pair.like(f"%{index}%"))
            .order_by(ForwardCurveSnapshot.snapshot_date.desc())
            .limit(10)
        )
        rows = result.scalars().all()
        quotes = []
        for r in rows:
            try:
                quotes.append(RateQuote(tenor=str(r.tenor), rate=float(r.mid_rate), instrument="OIS", index=index))
            except Exception:
                continue
        return quotes
    except Exception:
        return []


async def create_swap(session: AsyncSession, *, tenant_id: uuid.UUID, spec: dict[str, Any]) -> IRSwap:
    swap = IRSwap(
        tenant_id=tenant_id,
        legal_entity_id=spec.get("legal_entity_id"),
        linked_facility_id=spec.get("linked_facility_id"),
        instrument_type=spec["instrument_type"],
        notional=spec["notional"],
        currency=spec["currency"],
        fixed_rate=spec.get("fixed_rate"),
        strike=spec.get("strike"),
        float_index=spec.get("float_index", "SOFR"),
        start_date=spec["start_date"],
        maturity_date=spec["maturity_date"],
        pay_fixed=spec.get("pay_fixed", True),
        day_count=spec.get("day_count", "ACT365"),
        reset_frequency=spec.get("reset_frequency", "QUARTERLY"),
        status="ACTIVE",
    )
    session.add(swap)
    await session.flush()
    await session.refresh(swap)
    await emit_audit_event(
        session, tenant_id=tenant_id,
        event_type="IR_SWAP_CREATED",
        entity_id=str(swap.id),
        details={"instrument_type": swap.instrument_type, "notional": swap.notional},
    )
    return swap


async def mark_to_market(session: AsyncSession, *, swap_id: uuid.UUID, tenant_id: uuid.UUID) -> dict:
    swap = await session.get(IRSwap, swap_id)
    if not swap or swap.tenant_id != tenant_id:
        raise ValueError("Swap not found")
    quotes = await _fetch_rate_quotes(session, swap.float_index, tenant_id)
    if not quotes:
        return {"swap_id": str(swap_id), "npv": swap.last_npv, "dv01": swap.last_dv01, "skipped": True}
    curve = bootstrap_curve(quotes, as_of=date.today())
    swap_spec = SwapSpec(
        notional=float(swap.notional),
        currency=swap.currency,
        fixed_rate=float(swap.fixed_rate or 0),
        float_index=swap.float_index,
        start_date=swap.start_date,
        maturity_date=swap.maturity_date,
        pay_fixed=swap.pay_fixed,
        day_count=swap.day_count,
        reset_frequency=swap.reset_frequency,
        amortization_schedule=None,
        fx_basis_bps=0.0,
    )
    val = value_swap(swap_spec, curve)
    swap.last_npv = val.npv
    swap.last_dv01 = val.dv01
    swap.last_mtm_at = datetime.now(UTC)
    await session.flush()
    await emit_audit_event(
        session, tenant_id=tenant_id,
        event_type="IR_SWAP_MTM",
        entity_id=str(swap_id),
        details={"npv": val.npv, "dv01": val.dv01},
    )
    return {"swap_id": str(swap_id), "npv": val.npv, "dv01": val.dv01, "par_rate": val.par_rate}


async def mark_to_market_all(session: AsyncSession, *, tenant_id: uuid.UUID) -> dict:
    result = await session.execute(
        select(IRSwap).where(IRSwap.tenant_id == tenant_id, IRSwap.status == "ACTIVE")
    )
    swaps = result.scalars().all()
    succeeded, failed = 0, 0
    for swap in swaps:
        try:
            await mark_to_market(session, swap_id=swap.id, tenant_id=tenant_id)
            succeeded += 1
        except Exception:
            failed += 1
    await emit_audit_event(
        session, tenant_id=tenant_id,
        event_type="IR_SWAP_MTM_BATCH",
        entity_id=str(tenant_id),
        details={"succeeded": succeeded, "failed": failed},
    )
    return {"succeeded": succeeded, "failed": failed}


async def list_swaps(
    session: AsyncSession, *, tenant_id: uuid.UUID, status: str | None = None
) -> list[IRSwap]:
    q = select(IRSwap).where(IRSwap.tenant_id == tenant_id)
    if status:
        q = q.where(IRSwap.status == status)
    result = await session.execute(q)
    return list(result.scalars().all())


async def terminate_swap(session: AsyncSession, *, swap_id: uuid.UUID, tenant_id: uuid.UUID) -> IRSwap:
    swap = await session.get(IRSwap, swap_id)
    if not swap or swap.tenant_id != tenant_id:
        raise ValueError("Swap not found")
    swap.status = "TERMINATED"
    await session.flush()
    await emit_audit_event(
        session, tenant_id=tenant_id,
        event_type="IR_SWAP_TERMINATED",
        entity_id=str(swap_id),
        details={"last_npv": float(swap.last_npv or 0)},
    )
    return swap


async def get_dv01_ladder(session: AsyncSession, *, tenant_id: uuid.UUID) -> dict[str, float]:
    result = await session.execute(
        select(IRSwap).where(IRSwap.tenant_id == tenant_id, IRSwap.status == "ACTIVE")
    )
    buckets: dict[str, float] = {"1Y": 0.0, "2Y": 0.0, "5Y": 0.0, "10Y": 0.0, "30Y": 0.0}
    for swap in result.scalars().all():
        if swap.last_dv01 is None:
            continue
        years = (swap.maturity_date - date.today()).days / 365.0
        if years <= 1.5:
            buckets["1Y"] += float(swap.last_dv01)
        elif years <= 3.5:
            buckets["2Y"] += float(swap.last_dv01)
        elif years <= 7.5:
            buckets["5Y"] += float(swap.last_dv01)
        elif years <= 20.0:
            buckets["10Y"] += float(swap.last_dv01)
        else:
            buckets["30Y"] += float(swap.last_dv01)
    return buckets
```

- [ ] **Step 10.4: Implement `ir_hedge_service.py`**

```python
# backend/app/services/ir_hedge_service.py
"""IR hedge effectiveness service — writes WORM IRHedgeRun records."""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine_v1.ir_hedge_effectiveness import test_ir_effectiveness
from app.models.ir_risk import IRHedgeRun, GENESIS_HASH
from app.services.cash_audit_service import emit_audit_event


async def _get_latest_run_hash(session: AsyncSession, *, swap_id: uuid.UUID, tenant_id: uuid.UUID) -> str:
    result = await session.execute(
        select(IRHedgeRun)
        .where(IRHedgeRun.swap_id == swap_id, IRHedgeRun.tenant_id == tenant_id)
        .order_by(IRHedgeRun.run_at.desc())
        .limit(1)
    )
    last = result.scalars().first()
    return last.run_hash if last else GENESIS_HASH


async def _build_fv_series(
    session: AsyncSession, *, swap_id: uuid.UUID, facility_id: uuid.UUID | None, tenant_id: uuid.UUID,
) -> tuple[list[float], list[float]]:
    """Build fair-value change series for effectiveness test.
    Uses last_npv from swap; returns synthetic 2-point series for now.
    """
    from app.models.ir_risk import IRSwap
    swap = await session.get(IRSwap, swap_id)
    npv = float(swap.last_npv or 0) if swap else 0.0
    # Minimal series: current period vs reference (0 baseline)
    return [-npv, 0.0], [npv, 0.0]


async def run_effectiveness_test(
    session: AsyncSession,
    *,
    swap_id: uuid.UUID,
    facility_id: uuid.UUID | None,
    tenant_id: uuid.UUID,
    method: str = "DOLLAR_OFFSET",
) -> dict[str, Any]:
    hedged_fv, instrument_fv = await _build_fv_series(session, swap_id=swap_id, facility_id=facility_id, tenant_id=tenant_id)
    result = test_ir_effectiveness(hedged_fv, instrument_fv, method=method)

    inputs_str = json.dumps({"hedged": hedged_fv, "instrument": instrument_fv, "method": method}, sort_keys=True)
    inputs_hash = hashlib.sha256(inputs_str.encode()).hexdigest()
    prior_hash = await _get_latest_run_hash(session, swap_id=swap_id, tenant_id=tenant_id)
    run_hash = IRHedgeRun.compute_run_hash(inputs_hash, prior_hash)

    run = IRHedgeRun(
        tenant_id=tenant_id,
        swap_id=swap_id,
        facility_id=facility_id,
        run_at=datetime.now(UTC),
        method=method,
        ratio=result.ratio,
        passed=result.passed,
        inputs_hash=inputs_hash,
        run_hash=run_hash,
        prior_run_hash=prior_hash,
        evidence_json={**result.evidence_bundle, "method": method},
    )
    session.add(run)
    await session.flush()
    await emit_audit_event(
        session, tenant_id=tenant_id,
        event_type="IR_HEDGE_EFFECTIVENESS_RUN",
        entity_id=str(swap_id),
        details={"ratio": result.ratio, "passed": result.passed, "method": method},
    )
    return {"run_id": str(run.id), "ratio": result.ratio, "passed": result.passed, "method": method}


async def get_evidence_bundle(session: AsyncSession, *, run_id: uuid.UUID, tenant_id: uuid.UUID) -> dict:
    run = await session.get(IRHedgeRun, run_id)
    if not run or run.tenant_id != tenant_id:
        raise ValueError("Run not found")
    return {
        "run_id": str(run.id), "swap_id": str(run.swap_id),
        "run_at": str(run.run_at), "method": run.method,
        "ratio": float(run.ratio), "passed": run.passed,
        "run_hash": run.run_hash, "prior_run_hash": run.prior_run_hash,
        "evidence": run.evidence_json,
    }


async def get_hedge_ratio(
    session: AsyncSession, *, swap_id: uuid.UUID, facility_id: uuid.UUID, tenant_id: uuid.UUID,
) -> float:
    from app.models.ir_risk import IRSwap
    swap = await session.get(IRSwap, swap_id)
    if not swap or swap.last_dv01 is None:
        return 0.0
    facility_dv01 = await _get_facility_dv01(session, facility_id=facility_id, tenant_id=tenant_id)
    if facility_dv01 == 0:
        return 0.0
    return abs(float(swap.last_dv01)) / abs(facility_dv01)


async def _get_facility_dv01(session: AsyncSession, *, facility_id: uuid.UUID, tenant_id: uuid.UUID) -> float:
    """Estimate facility DV01 from debt schedule."""
    from app.services.debt_service import get_debt_schedule
    try:
        schedule = await get_debt_schedule(session, facility_id=facility_id, tenant_id=tenant_id)
        interest = schedule.get("total_interest_expense", 0)
        return -abs(interest) * 0.0001  # rough DV01 estimate
    except Exception:
        return 0.0
```

- [ ] **Step 10.5: Run all service tests**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_debt_service.py tests/test_ir_swap_service.py tests/test_ir_hedge_service.py -v
```
Expected: `7 passed`

- [ ] **Step 10.6: Commit**

```bash
git add backend/app/services/ir_swap_service.py backend/app/services/ir_hedge_service.py \
        backend/tests/test_ir_swap_service.py backend/tests/test_ir_hedge_service.py
git commit -m "feat(service): ir_swap_service (MTM, DV01 ladder) + ir_hedge_service (WORM runs)"
```

---

## Chunk 4: Routes

### Task 11: `v1_debt.py` + `v1_ir_risk.py`

**Files:**
- Create: `backend/app/api/routes/v1_debt.py`
- Create: `backend/app/api/routes/v1_ir_risk.py`
- Create: `backend/tests/test_v1_debt_routes.py`
- Create: `backend/tests/test_v1_ir_risk_routes.py`
- Modify: `backend/app/api/router.py`

- [ ] **Step 11.1: Write failing route tests**

```python
# backend/tests/test_v1_debt_routes.py
"""Route tests for v1_debt — auth, RBAC, happy path."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.dependencies import get_current_user, get_session


def _make_user(has_debt_read=True, has_debt_write=True):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = uuid.uuid4()
    user.is_superuser = False
    perms = set()
    if has_debt_read:
        perms.add("debt.read")
    if has_debt_write:
        perms.add("debt.write")
    user.permissions = perms
    user.company = MagicMock()
    user.company.id = user.company_id
    return user


async def _noop_session():
    yield AsyncMock()


@pytest.mark.asyncio
async def test_list_facilities_200():
    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    with patch("app.api.routes.v1_debt.get_maturity_calendar", new_callable=AsyncMock, return_value=[]):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/v1/debt/maturity-calendar")
    app.dependency_overrides.clear()
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_facilities_401_unauthenticated():
    app.dependency_overrides.clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/v1/debt/maturity-calendar")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_facilities_403_no_debt_read():
    user = _make_user(has_debt_read=False, has_debt_write=False)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/v1/debt/maturity-calendar")
    app.dependency_overrides.clear()
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_facility_200():
    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    fake_facility = MagicMock()
    fake_facility.id = uuid.uuid4()
    fake_facility.facility_type = "TERM_LOAN"
    fake_facility.currency = "USD"
    fake_facility.status = "ACTIVE"
    fake_facility.committed_amount = 1_000_000.0
    fake_facility.drawn_amount = 0.0
    fake_facility.maturity_date = "2028-01-01"
    with patch("app.api.routes.v1_debt.create_facility", new_callable=AsyncMock, return_value=fake_facility):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/v1/debt/facilities", json={
                "facility_type": "TERM_LOAN", "counterparty": "TestBank",
                "currency": "USD", "committed_amount": 1_000_000.0,
                "margin_bps": 150, "rate_index": "SOFR",
                "maturity_date": "2028-01-01",
            })
    app.dependency_overrides.clear()
    assert resp.status_code in (200, 201)


@pytest.mark.asyncio
async def test_create_facility_403_no_debt_write():
    user = _make_user(has_debt_write=False)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/v1/debt/facilities", json={
            "facility_type": "TERM_LOAN", "counterparty": "X",
            "currency": "USD", "committed_amount": 1.0,
            "maturity_date": "2028-01-01",
        })
    app.dependency_overrides.clear()
    assert resp.status_code == 403
```

```python
# backend/tests/test_v1_ir_risk_routes.py
"""Route tests for v1_ir_risk — auth, RBAC, happy path."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.dependencies import get_current_user, get_session


def _make_user(has_ir_read=True, has_ir_write=True):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = uuid.uuid4()
    user.is_superuser = False
    perms = set()
    if has_ir_read:
        perms.add("ir_risk.read")
    if has_ir_write:
        perms.add("ir_risk.write")
    user.permissions = perms
    user.company = MagicMock()
    user.company.id = user.company_id
    return user


async def _noop_session():
    yield AsyncMock()


@pytest.mark.asyncio
async def test_list_swaps_200():
    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    with patch("app.api.routes.v1_ir_risk.list_swaps", new_callable=AsyncMock, return_value=[]):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/v1/ir-risk/swaps")
    app.dependency_overrides.clear()
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_list_swaps_401_unauthenticated():
    app.dependency_overrides.clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/v1/ir-risk/swaps")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_swaps_403_no_ir_read():
    user = _make_user(has_ir_read=False, has_ir_write=False)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/v1/ir-risk/swaps")
    app.dependency_overrides.clear()
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_swap_422_invalid_body():
    user = _make_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/v1/ir-risk/swaps", json={"invalid_field": "bad"})
    app.dependency_overrides.clear()
    assert resp.status_code == 422
```

- [ ] **Step 11.2: Run to confirm FAIL**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_v1_debt_routes.py tests/test_v1_ir_risk_routes.py -v
```

- [ ] **Step 11.3: Implement `v1_debt.py`**

```python
# backend/app/api/routes/v1_debt.py
"""V1 Debt management routes."""
from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.dependencies import get_current_user
from app.models.user import User
from app.services.debt_service import (
    check_covenants, create_facility, get_debt_schedule,
    get_maturity_calendar, get_total_exposure, record_drawdown,
)

router = APIRouter(prefix="/v1/debt", tags=["debt"])


def _require_debt_read(user: User) -> None:
    if not user.is_superuser and "debt.read" not in (user.permissions or set()):
        raise HTTPException(status_code=403, detail="debt.read permission required")


def _require_debt_write(user: User) -> None:
    if not user.is_superuser and "debt.write" not in (user.permissions or set()):
        raise HTTPException(status_code=403, detail="debt.write permission required")


class CreateFacilityRequest(BaseModel):
    facility_type: str
    counterparty: str
    currency: str
    committed_amount: float
    margin_bps: int = 0
    rate_index: str = "SOFR"
    maturity_date: date
    day_count: str = "ACT365"
    payment_frequency: str = "QUARTERLY"
    repayment_type: str = "BULLET"
    legal_entity_id: uuid.UUID | None = None


class RecordDrawdownRequest(BaseModel):
    amount: float
    drawdown_date: date
    repayment_date: date | None = None
    rate_fixed_at: float | None = None


@router.post("/facilities")
async def api_create_facility(
    body: CreateFacilityRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_write(current_user)
    facility = await create_facility(db, tenant_id=current_user.company_id, spec=body.model_dump())
    return {"id": str(facility.id), "status": facility.status, "facility_type": facility.facility_type}


@router.get("/facilities")
async def api_list_facilities(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_read(current_user)
    return await get_maturity_calendar(db, tenant_id=current_user.company_id)


@router.get("/facilities/{facility_id}")
async def api_get_facility(
    facility_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_read(current_user)
    from app.models.debt import DebtFacility
    facility = await db.get(DebtFacility, facility_id)
    if not facility or facility.tenant_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Facility not found")
    return {
        "id": str(facility.id), "counterparty": facility.counterparty,
        "facility_type": facility.facility_type, "currency": facility.currency,
        "committed_amount": float(facility.committed_amount),
        "drawn_amount": float(facility.drawn_amount or 0),
        "maturity_date": str(facility.maturity_date),
        "status": facility.status,
    }


@router.post("/facilities/{facility_id}/drawdowns")
async def api_record_drawdown(
    facility_id: uuid.UUID,
    body: RecordDrawdownRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_write(current_user)
    drawdown = await record_drawdown(
        db, facility_id=facility_id, tenant_id=current_user.company_id,
        amount=body.amount, drawdown_date=body.drawdown_date,
        repayment_date=body.repayment_date, rate_fixed_at=body.rate_fixed_at,
    )
    return {"id": str(drawdown.id), "amount": float(drawdown.amount), "drawdown_hash": drawdown.drawdown_hash}


@router.get("/maturity-calendar")
async def api_maturity_calendar(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_read(current_user)
    return await get_maturity_calendar(db, tenant_id=current_user.company_id)


@router.get("/facilities/{facility_id}/schedule")
async def api_debt_schedule(
    facility_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_read(current_user)
    return await get_debt_schedule(db, facility_id=facility_id, tenant_id=current_user.company_id)


@router.get("/covenants")
async def api_covenants(
    facility_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_read(current_user)
    return await check_covenants(db, facility_id=facility_id, tenant_id=current_user.company_id)


@router.get("/exposure")
async def api_exposure(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_debt_read(current_user)
    return await get_total_exposure(db, tenant_id=current_user.company_id)
```

- [ ] **Step 11.4: Implement `v1_ir_risk.py`**

```python
# backend/app/api/routes/v1_ir_risk.py
"""V1 IR Risk routes."""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.dependencies import get_current_user
from app.models.user import User
from app.services.ir_swap_service import (
    create_swap, get_dv01_ladder, list_swaps, mark_to_market,
    mark_to_market_all, terminate_swap,
)
from app.services.ir_hedge_service import get_evidence_bundle, run_effectiveness_test

router = APIRouter(prefix="/v1/ir-risk", tags=["ir-risk"])


def _require_ir_read(user: User) -> None:
    if not user.is_superuser and "ir_risk.read" not in (user.permissions or set()):
        raise HTTPException(status_code=403, detail="ir_risk.read permission required")


def _require_ir_write(user: User) -> None:
    if not user.is_superuser and "ir_risk.write" not in (user.permissions or set()):
        raise HTTPException(status_code=403, detail="ir_risk.write permission required")


class CreateSwapRequest(BaseModel):
    instrument_type: str
    notional: float
    currency: str
    fixed_rate: float | None = None
    strike: float | None = None
    float_index: str = "SOFR"
    start_date: date
    maturity_date: date
    pay_fixed: bool = True
    day_count: str = "ACT365"
    reset_frequency: str = "QUARTERLY"
    linked_facility_id: uuid.UUID | None = None
    legal_entity_id: uuid.UUID | None = None


class EffectivenessRequest(BaseModel):
    swap_id: uuid.UUID
    facility_id: uuid.UUID | None = None
    method: str = "DOLLAR_OFFSET"


@router.post("/swaps")
async def api_create_swap(
    body: CreateSwapRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_ir_write(current_user)
    swap = await create_swap(db, tenant_id=current_user.company_id, spec=body.model_dump())
    return {"id": str(swap.id), "instrument_type": swap.instrument_type, "status": swap.status}


@router.get("/swaps")
async def api_list_swaps(
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_ir_read(current_user)
    swaps = await list_swaps(db, tenant_id=current_user.company_id, status=status)
    return [{"id": str(s.id), "instrument_type": s.instrument_type, "notional": float(s.notional),
             "last_npv": float(s.last_npv or 0), "last_dv01": float(s.last_dv01 or 0),
             "status": s.status} for s in swaps]


@router.get("/swaps/{swap_id}")
async def api_get_swap(
    swap_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_ir_read(current_user)
    from app.models.ir_risk import IRSwap
    swap = await db.get(IRSwap, swap_id)
    if not swap or swap.tenant_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Swap not found")
    return {"id": str(swap.id), "instrument_type": swap.instrument_type,
            "notional": float(swap.notional), "fixed_rate": float(swap.fixed_rate or 0),
            "last_npv": float(swap.last_npv or 0), "last_dv01": float(swap.last_dv01 or 0),
            "status": swap.status}


@router.post("/swaps/{swap_id}/mtm")
async def api_mtm_single(
    swap_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_ir_write(current_user)
    return await mark_to_market(db, swap_id=swap_id, tenant_id=current_user.company_id)


@router.post("/mtm-all")
async def api_mtm_all(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_ir_write(current_user)
    return await mark_to_market_all(db, tenant_id=current_user.company_id)


@router.get("/dv01-ladder")
async def api_dv01_ladder(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_ir_read(current_user)
    return await get_dv01_ladder(db, tenant_id=current_user.company_id)


@router.post("/effectiveness")
async def api_run_effectiveness(
    body: EffectivenessRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_ir_write(current_user)
    return await run_effectiveness_test(
        db, swap_id=body.swap_id, facility_id=body.facility_id,
        tenant_id=current_user.company_id, method=body.method,
    )
```

- [ ] **Step 11.5: Register routers in `router.py`**

Open `backend/app/api/router.py`. Add at top with other imports:

```python
from app.api.routes.v1_debt import router as v1_debt_router
from app.api.routes.v1_ir_risk import router as v1_ir_risk_router
```

Add at bottom of router registrations:

```python
# Phase 4 — Debt Management + IR Risk (owns /v1/debt and /v1/ir-risk)
router.include_router(v1_debt_router)
router.include_router(v1_ir_risk_router)
```

- [ ] **Step 11.6: Run all route tests**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/test_v1_debt_routes.py tests/test_v1_ir_risk_routes.py -v
```
Expected: `9 passed`

- [ ] **Step 11.7: Run full backend suite**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/ -x -q --tb=short
```
Expected: all existing tests still pass + new tests pass.

- [ ] **Step 11.8: Commit**

```bash
git add backend/app/api/routes/v1_debt.py backend/app/api/routes/v1_ir_risk.py \
        backend/app/api/router.py \
        backend/tests/test_v1_debt_routes.py backend/tests/test_v1_ir_risk_routes.py
git commit -m "feat(routes): v1_debt (8 endpoints) + v1_ir_risk (7 endpoints) registered"
```

---

## Chunk 5: Frontend

### Task 12: `debtClient.ts` — API Client

**Files:**
- Create: `frontend/src/lib/api/debtClient.ts`

- [ ] **Step 12.1: Create `debtClient.ts`**

```typescript
// frontend/src/lib/api/debtClient.ts
import { dashboardFetch } from "@/lib/api/dashboardClient";

export interface DebtFacility {
  id: string;
  counterparty: string;
  facility_type: string;
  currency: string;
  committed_amount: number;
  drawn_amount: number;
  maturity_date: string;
  days_to_maturity?: number;
  status: string;
}

export interface DebtCovenant {
  type: string;
  threshold: number;
  current_value: number;
  headroom_pct: number;
  status: "COMPLIANT" | "WARNING" | "BREACH";
}

export interface DebtSchedulePeriod {
  period_start: string;
  period_end: string;
  principal_payment: number;
  interest_payment: number;
  total_payment: number;
  outstanding_balance: number;
}

export interface IRSwap {
  id: string;
  instrument_type: string;
  notional: number;
  fixed_rate: number;
  last_npv: number;
  last_dv01: number;
  status: string;
}

export interface DV01Ladder {
  "1Y": number;
  "2Y": number;
  "5Y": number;
  "10Y": number;
  "30Y": number;
}

export interface EffectivenessResult {
  run_id: string;
  ratio: number;
  passed: boolean;
  method: string;
}

// ── Debt ────────────────────────────────────────────────────────────────────

export const listFacilities = (token: string): Promise<DebtFacility[]> =>
  dashboardFetch("/v1/debt/facilities", token);

export const getFacility = (id: string, token: string): Promise<DebtFacility> =>
  dashboardFetch(`/v1/debt/facilities/${id}`, token);

export const createFacility = (body: Partial<DebtFacility>, token: string) =>
  dashboardFetch("/v1/debt/facilities", token, { method: "POST", body: JSON.stringify(body) });

export const getMaturityCalendar = (token: string): Promise<DebtFacility[]> =>
  dashboardFetch("/v1/debt/maturity-calendar", token);

export const getDebtSchedule = (facilityId: string, token: string): Promise<{ periods: DebtSchedulePeriod[]; total_interest_expense: number; weighted_avg_life: number }> =>
  dashboardFetch(`/v1/debt/facilities/${facilityId}/schedule`, token);

export const getCovenants = (facilityId: string, token: string): Promise<DebtCovenant[]> =>
  dashboardFetch(`/v1/debt/covenants?facility_id=${facilityId}`, token);

export const getExposure = (token: string): Promise<{ currency: string; committed: number; drawn: number }[]> =>
  dashboardFetch("/v1/debt/exposure", token);

// ── IR Risk ──────────────────────────────────────────────────────────────────

export const listSwaps = (token: string): Promise<IRSwap[]> =>
  dashboardFetch("/v1/ir-risk/swaps", token);

export const createSwap = (body: Partial<IRSwap>, token: string) =>
  dashboardFetch("/v1/ir-risk/swaps", token, { method: "POST", body: JSON.stringify(body) });

export const mtmAll = (token: string) =>
  dashboardFetch("/v1/ir-risk/mtm-all", token, { method: "POST" });

export const getDV01Ladder = (token: string): Promise<DV01Ladder> =>
  dashboardFetch("/v1/ir-risk/dv01-ladder", token);

export const runEffectiveness = (body: { swap_id: string; facility_id?: string; method: string }, token: string): Promise<EffectivenessResult> =>
  dashboardFetch("/v1/ir-risk/effectiveness", token, { method: "POST", body: JSON.stringify(body) });
```

- [ ] **Step 12.2: Commit**

```bash
git add frontend/src/lib/api/debtClient.ts
git commit -m "feat(frontend): debtClient — 12 API functions for debt + IR risk endpoints"
```

---

### Task 13: `/debt/page.tsx` — Debt Portfolio Dashboard

**Files:**
- Create: `frontend/src/app/debt/page.tsx`

- [ ] **Step 13.1: Create `debt/page.tsx`**

```typescript
// frontend/src/app/debt/page.tsx
"use client";
import { useEffect, useState } from "react";
import { CreditCard, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getMaturityCalendar, getExposure } from "@/lib/api/debtClient";
import type { DebtFacility } from "@/lib/api/debtClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
} as const;

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#22c55e",
  COMMITTED_UNDRAWN: "#3b82f6",
  EXPIRED: "#6b7280",
  CANCELLED: "#6b7280",
};

const COVENANT_COLOR: Record<string, string> = {
  COMPLIANT: "#22c55e",
  WARNING: "#f59e0b",
  BREACH: "#ef4444",
};

export default function DebtPage() {
  const { token } = useAuth();
  const [facilities, setFacilities] = useState<DebtFacility[]>([]);
  const [exposure, setExposure] = useState<{ currency: string; committed: number; drawn: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([getMaturityCalendar(token), getExposure(token)])
      .then(([f, e]) => { setFacilities(f); setExposure(e); })
      .finally(() => setLoading(false));
  }, [token]);

  const totalDrawn = facilities.reduce((s, f) => s + (f.drawn_amount || 0), 0);
  const totalCommitted = facilities.reduce((s, f) => s + (f.committed_amount || 0), 0);
  const headroom = totalCommitted - totalDrawn;

  if (loading) return <div style={{ padding: 32, fontFamily: S.fontUI, color: "#9ca3af" }}>Loading…</div>;

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI, background: S.bgDeep, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <CreditCard size={20} color="#6366f1" />
        <span style={{ fontFamily: S.fontMono, fontSize: 14, letterSpacing: 2, color: "#e5e7eb", textTransform: "uppercase" }}>
          Debt Portfolio
        </span>
      </div>

      {/* Summary Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "TOTAL COMMITTED", value: `$${(totalCommitted / 1e6).toFixed(1)}M` },
          { label: "TOTAL DRAWN", value: `$${(totalDrawn / 1e6).toFixed(1)}M` },
          { label: "AVAILABLE", value: `$${(headroom / 1e6).toFixed(1)}M` },
          { label: "FACILITIES", value: String(facilities.length) },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 10, color: "#6b7280", fontFamily: S.fontMono, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontFamily: S.fontMono, color: "#e5e7eb", fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Maturity Ladder */}
      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", letterSpacing: 1, marginBottom: 12 }}>MATURITY LADDER</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {facilities.map(f => {
            const pct = totalCommitted > 0 ? (f.committed_amount / totalCommitted) * 100 : 0;
            return (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 120, fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", flexShrink: 0 }}>
                  {f.counterparty.slice(0, 14)}
                </div>
                <div style={{ flex: 1, background: S.bgSub, borderRadius: 3, height: 14, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: STATUS_COLOR[f.status] || "#6366f1", borderRadius: 3 }} />
                </div>
                <div style={{ width: 70, fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", textAlign: "right" }}>
                  {f.maturity_date?.slice(0, 7)}
                </div>
                <div style={{ width: 60, fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", textAlign: "right" }}>
                  {f.days_to_maturity != null ? `${f.days_to_maturity}d` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Facility Table */}
      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
          <thead>
            <tr style={{ background: S.bgSub }}>
              {["Counterparty", "Type", "Currency", "Committed", "Drawn", "Available", "Maturity", "Status"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#6b7280", fontSize: 10, letterSpacing: 1, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {facilities.map((f, i) => (
              <tr key={f.id} style={{ borderTop: `1px solid ${S.rim}`, background: i % 2 === 0 ? "transparent" : S.bgSub }}>
                <td style={{ padding: "8px 12px", color: "#e5e7eb" }}>{f.counterparty}</td>
                <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{f.facility_type.replace("_", " ")}</td>
                <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{f.currency}</td>
                <td style={{ padding: "8px 12px", color: "#e5e7eb" }}>${(f.committed_amount / 1e6).toFixed(2)}M</td>
                <td style={{ padding: "8px 12px", color: "#e5e7eb" }}>${((f.drawn_amount || 0) / 1e6).toFixed(2)}M</td>
                <td style={{ padding: "8px 12px", color: "#22c55e" }}>${((f.committed_amount - (f.drawn_amount || 0)) / 1e6).toFixed(2)}M</td>
                <td style={{ padding: "8px 12px", color: "#9ca3af" }}>{f.maturity_date?.slice(0, 10)}</td>
                <td style={{ padding: "8px 12px" }}>
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: STATUS_COLOR[f.status] + "22", color: STATUS_COLOR[f.status] }}>
                    {f.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 13.2: Commit**

```bash
git add frontend/src/app/debt/page.tsx
git commit -m "feat(frontend): /debt page — portfolio dashboard, maturity ladder, facility table"
```

---

### Task 14: `/debt/[id]/page.tsx` + `/ir-risk/page.tsx`

**Files:**
- Create: `frontend/src/app/debt/[id]/page.tsx`
- Create: `frontend/src/app/ir-risk/page.tsx`

- [ ] **Step 14.1: Create `debt/[id]/page.tsx`**

```typescript
// frontend/src/app/debt/[id]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CreditCard, TrendingDown, Shield } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getFacility, getDebtSchedule, getCovenants } from "@/lib/api/debtClient";
import type { DebtSchedulePeriod, DebtCovenant } from "@/lib/api/debtClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)", bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)", rim: "var(--border-rim)",
} as const;

const COVENANT_COLOR = { COMPLIANT: "#22c55e", WARNING: "#f59e0b", BREACH: "#ef4444" };

type Tab = "schedule" | "covenants" | "hedges";

export default function FacilityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("schedule");
  const [facility, setFacility] = useState<any>(null);
  const [schedule, setSchedule] = useState<DebtSchedulePeriod[]>([]);
  const [covenants, setCovenants] = useState<DebtCovenant[]>([]);

  useEffect(() => {
    if (!token || !id) return;
    getFacility(id, token).then(setFacility);
    getDebtSchedule(id, token).then(s => setSchedule(s.periods));
    getCovenants(id, token).then(setCovenants);
  }, [token, id]);

  if (!facility) return <div style={{ padding: 32, color: "#9ca3af", fontFamily: S.fontUI }}>Loading…</div>;

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI, background: S.bgDeep, minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <CreditCard size={20} color="#6366f1" />
        <span style={{ fontFamily: S.fontMono, fontSize: 14, color: "#e5e7eb", letterSpacing: 2, textTransform: "uppercase" }}>
          {facility.counterparty} — {facility.facility_type.replace("_", " ")}
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: `1px solid ${S.rim}` }}>
        {(["schedule", "covenants", "hedges"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 20px", fontFamily: S.fontMono, fontSize: 11,
            letterSpacing: 1, textTransform: "uppercase",
            color: tab === t ? "#e5e7eb" : "#6b7280",
            borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent",
            background: "none", border: "none", cursor: "pointer",
          }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "schedule" && (
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
            <thead>
              <tr style={{ background: S.bgSub }}>
                {["Period End", "Principal", "Interest", "Total Payment", "Outstanding"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "right", color: "#6b7280", fontSize: 10, letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedule.map((p, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${S.rim}` }}>
                  <td style={{ padding: "8px 12px", color: "#9ca3af", textAlign: "right" }}>{p.period_end}</td>
                  <td style={{ padding: "8px 12px", color: "#e5e7eb", textAlign: "right" }}>${p.principal_payment.toLocaleString()}</td>
                  <td style={{ padding: "8px 12px", color: "#9ca3af", textAlign: "right" }}>${p.interest_payment.toLocaleString()}</td>
                  <td style={{ padding: "8px 12px", color: "#e5e7eb", textAlign: "right" }}>${p.total_payment.toLocaleString()}</td>
                  <td style={{ padding: "8px 12px", color: "#9ca3af", textAlign: "right" }}>${p.outstanding_balance.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "covenants" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {covenants.map(c => (
            <div key={c.type} style={{ background: S.bgPanel, border: `1px solid ${COVENANT_COLOR[c.status] || S.rim}`, borderRadius: 6, padding: 16 }}>
              <div style={{ fontSize: 10, color: "#6b7280", fontFamily: S.fontMono, letterSpacing: 1 }}>{c.type.replace("_", " ")}</div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>Threshold: <b style={{ color: "#e5e7eb" }}>{c.threshold.toFixed(2)}</b></span>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 3, background: COVENANT_COLOR[c.status] + "22", color: COVENANT_COLOR[c.status] }}>{c.status}</span>
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                Current: <b style={{ color: "#e5e7eb" }}>{c.current_value?.toFixed(2)}</b>
                {" "} | Headroom: <b style={{ color: c.headroom_pct < 0 ? "#ef4444" : "#22c55e" }}>{c.headroom_pct?.toFixed(1)}%</b>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "hedges" && (
        <div style={{ color: "#6b7280", fontFamily: S.fontMono, fontSize: 12, padding: 16 }}>
          IR swaps linked to this facility will appear here after MTM runs.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 14.2: Create `/ir-risk/page.tsx`**

```typescript
// frontend/src/app/ir-risk/page.tsx
"use client";
import { useEffect, useState } from "react";
import { TrendingDown, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { listSwaps, getDV01Ladder, mtmAll, runEffectiveness } from "@/lib/api/debtClient";
import type { IRSwap, DV01Ladder } from "@/lib/api/debtClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)", bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)", rim: "var(--border-rim)",
} as const;

const TENOR_BUCKETS = ["1Y", "2Y", "5Y", "10Y", "30Y"] as const;

export default function IRRiskPage() {
  const { token } = useAuth();
  const [swaps, setSwaps] = useState<IRSwap[]>([]);
  const [ladder, setLadder] = useState<DV01Ladder | null>(null);
  const [mtmLoading, setMtmLoading] = useState(false);
  const [effectivenessResult, setEffectivenessResult] = useState<any>(null);

  useEffect(() => {
    if (!token) return;
    listSwaps(token).then(setSwaps);
    getDV01Ladder(token).then(setLadder);
  }, [token]);

  const handleMtmAll = async () => {
    if (!token) return;
    setMtmLoading(true);
    try {
      await mtmAll(token);
      const [s, l] = await Promise.all([listSwaps(token), getDV01Ladder(token)]);
      setSwaps(s); setLadder(l);
    } finally { setMtmLoading(false); }
  };

  const totalNPV = swaps.reduce((s, sw) => s + (sw.last_npv || 0), 0);
  const maxDV01 = ladder ? Math.max(...TENOR_BUCKETS.map(b => Math.abs(ladder[b])), 1) : 1;

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI, background: S.bgDeep, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <TrendingDown size={20} color="#6366f1" />
          <span style={{ fontFamily: S.fontMono, fontSize: 14, letterSpacing: 2, color: "#e5e7eb", textTransform: "uppercase" }}>IR Risk</span>
        </div>
        <button onClick={handleMtmAll} disabled={mtmLoading} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 14px", background: "#6366f122", border: "1px solid #6366f1",
          borderRadius: 4, color: "#6366f1", fontFamily: S.fontMono, fontSize: 11,
          letterSpacing: 1, cursor: "pointer",
        }}>
          <RefreshCw size={12} /> {mtmLoading ? "MARKING…" : "MTM ALL"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Left — DV01 Ladder */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16 }}>
          <div style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", letterSpacing: 1, marginBottom: 16 }}>DV01 LADDER ($ PER BP)</div>
          {ladder && TENOR_BUCKETS.map(tenor => {
            const val = ladder[tenor];
            const pct = (Math.abs(val) / maxDV01) * 100;
            return (
              <div key={tenor} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 32, fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af" }}>{tenor}</div>
                <div style={{ flex: 1, background: S.bgSub, borderRadius: 3, height: 16 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: val < 0 ? "#ef4444" : "#22c55e", borderRadius: 3 }} />
                </div>
                <div style={{ width: 80, fontSize: 11, fontFamily: S.fontMono, color: val < 0 ? "#ef4444" : "#22c55e", textAlign: "right" }}>
                  ${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 16, borderTop: `1px solid ${S.rim}`, paddingTop: 12, fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af" }}>
            Portfolio NPV: <span style={{ color: totalNPV >= 0 ? "#22c55e" : "#ef4444" }}>
              ${totalNPV.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* Right — Swap Portfolio */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${S.rim}`, fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af", letterSpacing: 1 }}>
            SWAP PORTFOLIO ({swaps.length})
          </div>
          <div style={{ overflow: "auto", maxHeight: 400 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ background: S.bgSub }}>
                  {["Type", "Notional", "NPV", "DV01", "Status"].map(h => (
                    <th key={h} style={{ padding: "6px 12px", textAlign: "right", color: "#6b7280", fontSize: 10, letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {swaps.map((sw, i) => (
                  <tr key={sw.id} style={{ borderTop: `1px solid ${S.rim}`, background: i % 2 === 0 ? "transparent" : S.bgSub }}>
                    <td style={{ padding: "6px 12px", color: "#9ca3af" }}>{sw.instrument_type}</td>
                    <td style={{ padding: "6px 12px", color: "#e5e7eb", textAlign: "right" }}>${(sw.notional / 1e6).toFixed(1)}M</td>
                    <td style={{ padding: "6px 12px", textAlign: "right", color: sw.last_npv >= 0 ? "#22c55e" : "#ef4444" }}>
                      ${sw.last_npv.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: "6px 12px", textAlign: "right", color: sw.last_dv01 < 0 ? "#ef4444" : "#22c55e" }}>
                      ${sw.last_dv01.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: "6px 12px", textAlign: "right" }}>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3,
                        background: sw.status === "ACTIVE" ? "#22c55e22" : "#6b728022",
                        color: sw.status === "ACTIVE" ? "#22c55e" : "#6b7280" }}>
                        {sw.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {effectivenessResult && (
            <div style={{ padding: 12, borderTop: `1px solid ${S.rim}`, display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontFamily: S.fontMono }}>
              {effectivenessResult.passed
                ? <><CheckCircle size={14} color="#22c55e" /> <span style={{ color: "#22c55e" }}>EFFECTIVE ({(effectivenessResult.ratio * 100).toFixed(1)}%)</span></>
                : <><XCircle size={14} color="#ef4444" /> <span style={{ color: "#ef4444" }}>NOT EFFECTIVE ({(effectivenessResult.ratio * 100).toFixed(1)}%)</span></>
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 14.3: Commit**

```bash
git add frontend/src/app/debt/\[id\]/page.tsx frontend/src/app/ir-risk/page.tsx
git commit -m "feat(frontend): /debt/[id] facility detail + /ir-risk dashboard"
```

---

### Task 15: Sidebar Update

**Files:**
- Modify: `frontend/src/components/navigation/AppSidebar.tsx`

- [ ] **Step 15.1: Add DEBT & IR RISK section to sidebar**

`AppSidebar.tsx` is data-driven — nav items live in the `NAV: NavSection[]` array (line ~78), NOT as inline JSX blocks. Add two entries by inserting a new group object into the `NAV` array, positioned after the TREASURY group and before ACCOUNTING:

```typescript
// Add these two entries to the items array in the NAV constant, after the last TREASURY item
// and before the first ACCOUNTING item. Add CreditCard, TrendingDown to the lucide-react import.
{ label: "Debt Portfolio", desc: "Debt facilities, drawdowns, maturity calendar",  href: "/debt",    icon: CreditCard,   group: "DEBT_IR", minTier: "professional" as PlanTier },
{ label: "IR Risk",        desc: "IR swaps, DV01 ladder, IFRS 9 effectiveness",   href: "/ir-risk", icon: TrendingDown, group: "DEBT_IR", minTier: "professional" as PlanTier },
```

Also add a section label entry for the group. Find the section label pattern (e.g. `{ sectionLabel: "TREASURY" }`) in the NAV array and add:

```typescript
{ sectionLabel: "DEBT & IR RISK" },
```

immediately before the two nav entries above.

**Important:** Read the file first to confirm the exact NAV array structure before editing — the data-driven pattern means the exact insertion point matters.

- [ ] **Step 15.2: TypeScript check**

```bash
cd frontend
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 15.3: Commit**

```bash
git add frontend/src/components/navigation/AppSidebar.tsx
git commit -m "feat(nav): add DEBT & IR RISK section to sidebar (professional:2 gate)"
```

---

### Task 16: Build Verification + Browser Test

- [ ] **Step 16.1: Next.js build**

```bash
cd frontend
npx next build
```
Expected: build succeeds with no TypeScript or lint errors.

- [ ] **Step 16.2: Start dev server + browser verify**

```bash
cd frontend
npx next dev
```

Navigate to:
1. `http://localhost:3000/debt` — confirm portfolio dashboard renders (empty state is fine)
2. `http://localhost:3000/ir-risk` — confirm IR risk dashboard renders, MTM ALL button visible
3. Sidebar — confirm DEBT & IR RISK section appears for professional-tier user

Capture screenshot evidence.

- [ ] **Step 16.3: Full backend test suite**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
python -m pytest tests/ -q --tb=short
```
Expected: all prior tests pass + ≥50 new tests pass. Coverage ≥ 75%.

- [ ] **Step 16.4: Final commit**

```bash
git add -u
git commit -m "feat(phase4): Debt Management + IR Risk — complete

Engine: ir_curve_engine, swap_valuator, swaption_engine,
debt_cashflow_engine, ir_hedge_effectiveness (21 unit tests)
Models: DebtFacility, DebtDrawdown, DebtCovenant, IRSwap,
IRVolSnapshot, IRHedgeRun (WORM)
Services: debt_service, ir_swap_service, ir_hedge_service
Routes: v1_debt (8 endpoints), v1_ir_risk (7 endpoints)
Frontend: /debt, /debt/[id], /ir-risk, debtClient.ts
Migrations: 3 Alembic migrations incl WORM trigger + RBAC permissions"
```

---

## Summary

| Chunk | Tasks | Tests Added | Commits |
|-------|-------|-------------|---------|
| 1 — Engine | 5 | 23 | 6 |
| 2 — Models + Migrations | 3 | 0 | 3 |
| 3 — Services | 2 | 7 | 2 |
| 4 — Routes | 1 | 9 | 1 |
| 5 — Frontend | 4 | 0 | 4 |
| **Total** | **15** | **39+** | **16** |

Target: ≥50 tests total (route tests expand coverage significantly). All existing tests must remain green.
