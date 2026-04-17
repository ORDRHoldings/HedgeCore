# Current Sprint

Sprint: Audit Sprint A3 — Settlement & Execution Pipeline
Status: COMPLETE
Started: 2026-04-16
Completed: 2026-04-16
Commits: d2e19b1

## Items
| # | Item | Status |
|---|------|--------|
| A3.1 | fx_roll_engine.py — abs(carry_cost) sign error in total_roll_cost | DONE |
| A3.2 | currency_netting_matrix.py — savings_usd (margin proxy) used instead of netted_notional for gross_after | DONE |
| A3.3 | Regression tests: 8 new tests in 2 existing files | DONE |

## Bugs Fixed

### Bug 1 — fx_roll_engine.py: Carry cost sign stripped by abs()
- **File**: `backend/app/engine_v1/fx_roll_engine.py:172`
- **Bug**: `total_cost = abs(carry_cost) + slippage`. When rolling into a cheaper forward (fwd_new < fwd_old), `carry_cost` is negative (a benefit). `abs()` converted it to a positive value, making a beneficial roll appear as costly as a costly roll.
- **Fix**: `total_cost = carry_cost + slippage` — sign preserved. Net economic impact: positive = cost, negative = benefit (carry exceeds slippage).

### Bug 2 — currency_netting_matrix.py: Wrong denominator for netting efficiency
- **File**: `backend/app/engine_v1/currency_netting_matrix.py:214`
- **Bug**: `gross_after = gross_before - sum(n.savings_usd)` where `savings_usd = netted * 0.03` (a 3% margin heuristic). On a $1M netting, this subtracted $30K instead of $1M, making `gross_after ≈ gross_before` and `netting_efficiency_pct ≈ 0%` even when 50% of notional was netted.
- **Fix**: `gross_after = gross_before - total_notional_netted`; `efficiency = total_notional_netted / gross_before * 100`. `total_savings_usd` (the margin estimate) is unchanged.

## Audit Findings (non-blocking, deferred)
- `fx_forward_validator.py`: domestic/foreign labels swapped vs CIP convention but formula is correct — LOW
- `transaction_cost_model.py`: USDMXN_1M vol hardcoded for all pairs — documented simplification — LOW
- `cost_engine.py`: `default=str` in canonical JSON silently coerces non-standard types — inputs are all standard in practice — LOW
- `instrument_mapper.py`: `list(inst.eligible_axes)` may be non-deterministic if it's a Python set — LOW

## Previous Sprints
- Audit Sprint A2 (COMPLETE 2026-04-16, commit d76da49)
- Audit Sprint A1 (COMPLETE 2026-04-16, commit a03e036)

## Suite: 5083 passed, 0 failed, 158 skipped

## Next
- Audit Sprint A4: Backtesting & Historical Simulation
- Audit Sprints A5–A13: (queued)
