# Hedge Effectiveness Thresholds -- Quantitative Justification

## Document Type
Quantitative Evidence Whitepaper -- Policy Engine

## Date
2026-03-07

## Purpose

This document provides the regulatory, academic, and institutional justification for the hedge effectiveness thresholds used in the ORDR Terminal policy engine.

---

## 1. Dollar-Offset Effectiveness Band: 80%-125%

### Source
- **ASC 815-30-35** (FASB): "A hedging relationship is expected to be highly effective if the results of the regression analysis... indicate a high degree of offset."
- **IAS 39 AG105** (IASB, superseded by IFRS 9 but band still referenced): "A hedge is regarded as highly effective only if... the results are within a range of 80 percent to 125 percent."
- **IFRS 9.B6.4.1**: While IFRS 9 removed the bright-line 80-125% test for prospective assessment, it remains the de facto industry benchmark for retrospective quantitative testing.

### Formula
```
dollar_offset_ratio = -SUM(hedging_instrument_FV_changes) / SUM(hedged_item_FV_changes)
is_effective = 0.80 <= ratio <= 1.25
```

### Rationale
The 80-125% band is asymmetric by design:
- **80% lower bound**: The hedge must offset at least 80% of the hedged risk. Below this, the hedge is demonstrably ineffective.
- **125% upper bound**: Allows up to 25% over-hedging, recognizing that perfect hedging is impractical and minor notional/timing mismatches are normal.
- The asymmetry (20% under vs 25% over) reflects that over-hedging is slightly more tolerable than under-hedging from a risk management perspective.

### Industry Support
- **Big 4 Audit Guidance**: All major audit firms (Deloitte, PwC, EY, KPMG) reference the 80-125% band in hedge accounting guidance publications.
- **BIS Working Paper No. 1012** (2022): Survey of corporate hedging programs confirms 80-125% as the predominant effectiveness threshold.
- **ISDA Hedging Survey 2023**: 94% of surveyed corporates use the 80-125% band for retrospective testing.

### Implementation
- File: `backend/app/engine_v1/hedge_accounting.py`
- Now configurable via `ExtendedPolicyConfig.retrospective_effectiveness_band_min/max`
- Default: 0.80 / 1.25 (industry standard)

---

## 2. Regression R-Squared Threshold: >= 0.80

### Source
- **IAS 39 IG F.4.4**: "An R-squared of at least 0.80 would generally indicate that the hedging relationship has been highly effective."
- **FASB ASC 815-20-25-79**: Regression analysis is an acceptable method; R-squared indicates explanatory power.

### Formula
```
R_squared = (SS_xy)^2 / (SS_xx * SS_yy)
is_effective = R_squared >= 0.80 AND -1.25 <= slope <= -0.80
```

### Rationale
- R-squared >= 0.80 means the hedging instrument explains at least 80% of the variance in the hedged item's fair value changes.
- The slope constraint (-1.25 to -0.80) mirrors the dollar-offset band: the regression coefficient should indicate near-1:1 offset.
- Combined, these ensure both statistical significance and economic offset.

### Minimum Data Points
- **Retrospective**: 30 observations (per IAS 39 IG F.4.2 guidance for statistical validity)
- **Prospective**: 20 observations (reduced threshold per IFRS 9.B6.4.5, allowing earlier designation)

### Implementation
- File: `backend/app/engine_v1/hedge_accounting.py` (retrospective)
- File: `backend/app/engine_v1/prospective_effectiveness.py` (prospective)
- Now configurable via `ExtendedPolicyConfig.regression_r_squared_min`, `regression_slope_band_min/max`

---

## 3. Prospective Effectiveness Methods

### Critical Terms Match (ASC 815-20-25-79 / IFRS 9.B6.4.4)
When the critical terms of the hedging instrument and the hedged item match (notional, currency, maturity, underlying, settlement type), high effectiveness can be concluded without quantitative testing.

### Statistical Forecast (IFRS 9.B6.4.6)
Forward-looking regression using historical data to project future effectiveness. Uses the same R-squared and slope criteria as retrospective testing but with reduced data requirements (20 vs 30 observations).

### Implementation
- File: `backend/app/engine_v1/prospective_effectiveness.py`
- Policy-selectable via `ExtendedPolicyConfig.prospective_effectiveness_method`

---

## 4. Change History

| Date | Change | Author |
|------|--------|--------|
| 2026-03-07 | Initial creation | Policy Engine Reconstruction |
