# Scenario Matrix Summary

- Generated: 2026-02-17 14:21:28 UTC
- Total scenarios: 16
- Validation PASS: 14
- Validation FAIL: 2

## Top 5 Residual-Risk Scenarios
- `IMP_LOW_HEDGE_RATIO` (Importer low hedge ratios) -> residual_mxn=-22,800,000.00
- `EXP_LOW_LIQUIDITY_MIN_TRADE_HIGH` (Exporter low-liquidity high minimum trade) -> residual_mxn=7,700,000.00
- `STRESS_WIDE_SPREAD_BPS` (Stress with wide dealing spreads) -> residual_mxn=7,500,000.00
- `EXP_BASELINE` (Exporter baseline) -> residual_mxn=5,000,000.00
- `EXP_OVERHEDGED` (Exporter over-hedged inventory) -> residual_mxn=5,000,000.00

## Top 5 Friction-Cost Scenarios
- `IMP_VOLATILE_MARKET` (Importer volatile market) -> friction_usd=5,062.97
- `EXP_VOLATILE_MARKET` (Exporter volatile market) -> friction_usd=4,063.78
- `IMP_HIGH_AP_CONCENTRATED` (Importer AP concentration) -> friction_usd=3,432.43
- `IMP_FULLY_HEDGED` (Importer full coverage) -> friction_usd=3,189.19
- `STRESS_WIDE_SPREAD_BPS` (Stress with wide dealing spreads) -> friction_usd=3,184.08

## Validation Failures
- `IMP_MISSING_FORWARD_BUCKET` (Importer missing forward bucket) -> validation_error:V-014
- `EXP_INVALID_FORWARD_POINTS` (Exporter invalid forward points) -> validation_error:V-021

## Suppressed Actions And Implications
- `EXP_OVERHEDGED` -> suppressed_buckets=1. Actions below minimum executable ticket; monitor residual drift.
- `EXP_LOW_LIQUIDITY_MIN_TRADE_HIGH` -> suppressed_buckets=3. Likely constrained by minimum trade size or low-liquidity ticket thresholds.
- `BALANCED_NETTED_FLOWS` -> suppressed_buckets=1. Actions below minimum executable ticket; monitor residual drift.
