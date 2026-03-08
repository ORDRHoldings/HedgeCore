# Scenario Analysis & Stress Testing Methodology

## Document Type
Quantitative Methodology Whitepaper -- Policy Engine

## Date
2026-03-07

---

## 1. Default Shock Levels: +/-5% and +/-10%

### Calibration Basis
- **BIS Triennial Central Bank Survey (2022)**: Median annualized FX volatility by region:
  - G10 pairs: 7-9%
  - EM LATAM (MXN, BRL, CLP, COP): 12-16%
  - EM Asia (CNH, KRW, INR, IDR): 8-12%
  - EM CEEMEA (TRY, ZAR, PLN, HUF): 14-20%
- **Monthly sigma derivation**: For a 15% annualized EM pair: monthly sigma = 15% / sqrt(12) ~ 4.3%
- **Shock mapping**:
  - +/-5% ~ 1.2 sigma monthly (covers ~77% of monthly moves)
  - +/-10% ~ 2.3 sigma monthly (covers ~99% of monthly moves)
  - These are conservative institutional levels aligned with BCBS market risk stress guidance.

### Regulatory Alignment
- **EBA 2023 Stress Test Methodology**: Adverse scenario includes FX shocks of 5-15% for major pairs.
- **BCBS Fundamental Review of the Trading Book (FRTB)**: Stressed VaR uses 250-day lookback with 97.5th percentile, translating to approximately +/-8-12% for EM pairs.

### Named Shock Packs
| Pack | Shocks | Use Case |
|------|--------|----------|
| standard | +/-5%, +/-10% | Default institutional |
| conservative | +/-5%, +/-10%, +/-15% | Risk-averse treasuries |
| aggressive | +/-10%, +/-20% | High-vol EM exposure |
| tail_risk | +/-5%, +/-10%, +/-15%, +/-25% | Extreme event preparation |
| mild | +/-2%, +/-5% | G10 low-vol pairs |
| em_stress | -20%, -15%, -10%, -5%, +5%, +10% | Asymmetric EM depreciation |
| g10_stress | +/-3%, +/-5%, +/-10% | G10 moderate stress |

### Volatility-Scaled Shocks
When live volatility data is available, shocks are scaled by the ratio of current vol to baseline vol (15% for EM):
```
multiplier = clamp(current_vol / baseline_vol, 0.5, 3.0)
scaled_shock = base_shock * multiplier
```
This ensures stress tests remain relevant in both low-vol and high-vol environments.

---

## 2. Historical VaR and Expected Shortfall

### Method
Non-parametric (historical simulation):
```
VaR(alpha) = empirical quantile at (1 - alpha) of return series
ES(alpha) = mean of returns below VaR(alpha)
```

### Design Choices
- **No distributional assumption**: Avoids Normal/Student-t bias
- **Deterministic**: Same returns produce same VaR/ES (no Monte Carlo sampling)
- **Minimum observations**: 20 (per regulatory practice for short-horizon VaR)
- **Architecture-compliant**: Pure function, no I/O, no randomness

### Limitations
- Requires historical return data (not available until live market feeds connect)
- Currently returns zeros when insufficient data
- Does not account for fat tails beyond what historical data shows

---

## 3. Fallback Volatility Assumptions

### Source: BIS Triennial Survey 2022 + DCC-GARCH Cross-Section (BIS WP No. 1012)

| Region | Annualized Vol | Basis |
|--------|---------------|-------|
| G10 | 8% | Median realized vol EURUSD/USDJPY/GBPUSD 2019-2024 |
| EM LATAM | 14% | Median realized vol USDMXN/USDBRL 2019-2024 |
| EM Asia | 10% | Median realized vol USDCNH/USDKRW/USDINR 2019-2024 |
| EM CEEMEA | 16% | Median realized vol USDTRY/USDZAR 2019-2024 |

### Correlation Structure
| Type | Value | Basis |
|------|-------|-------|
| Intra-region | 0.60 | DCC-GARCH average within-region correlation |
| Cross-region | 0.30 | DCC-GARCH average cross-region correlation |

These are now policy-configurable via `ExtendedPolicyConfig.fallback_volatilities` and `fallback_correlations`.

---

## 4. Liquidity Regime Thresholds

| Threshold | Value | Basis |
|-----------|-------|-------|
| STRESSED | 40.0 | Composite score at which execution costs approximately double (BIS FX turnover analysis) |
| CRISIS | 70.0 | Composite score at which market-making withdrawal observed (GFC/COVID empirical evidence) |

### Component Weights
| Component | Weight | Rationale |
|-----------|--------|-----------|
| ADV | 0.25 | Volume reduction is early indicator |
| Spread | 0.25 | Spread widening directly impacts cost |
| Volatility | 0.30 | Highest weight -- vol is strongest regime predictor |
| Margin | 0.20 | Margin increases lag but confirm stress |

All thresholds and weights are now policy-configurable via `ExtendedPolicyConfig.liquidity_regime_*` fields.

---

## 5. Decision Gate Default Thresholds

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| max_total_cost_bps | 75.0 | GFMA best practice: EM FX hedging cost typically 30-100bps; 75bps allows most EM pairs while flagging expensive hedges |
| max_total_cost_usd | 25,000 | Fallback for unknown notional; covers typical SME hedge ticket |
| min_worst_case_pnl_usd | -50,000 | SME-to-midcap tolerance; larger corporates should configure higher |
| min_effectiveness | 0.25 | Conservative floor -- below 25% effectiveness, hedge adds more cost than benefit |
| max_rejected_legs | 0 | Strict mode: any instrument rejection triggers review |
| material_risk_threshold | 0.50 | Mid-point: risks scoring above 50% on R1-R8 taxonomy are material |

All defaults are now policy-configurable via `DecisionGatePolicy` in `PolicyBundle`.

---

## 6. Almgren-Chriss Market Impact

### Default Impact Factor: 0.1
```
slippage_bps = 0.1 * sqrt(participation_rate) * 10000
```

### Calibration Basis
- **Almgren & Chriss (2001)**: "Optimal Execution of Portfolio Transactions" -- square-root impact model
- **Factor 0.1**: Conservative institutional estimate calibrated to:
  - BIS 2022 FX turnover data ($7.5T/day)
  - Typical institutional order: $10M-$100M
  - Participation rate: 0.01%-0.1% of daily volume
  - At 0.05% participation: slippage = 0.1 * sqrt(0.0005) * 10000 ~ 2.2 bps
  - Consistent with observed FX execution costs (LMAX, Currenex TCA reports)

### Implementation
- File: `backend/app/engine_v1/liquidity_model.py`
- Impact factor is a module constant (not policy-configurable in v1)
- Future: May be pair-specific or regime-dependent

---

## 7. Change History

| Date | Change | Author |
|------|--------|--------|
| 2026-03-07 | Initial creation | Policy Engine Reconstruction |
