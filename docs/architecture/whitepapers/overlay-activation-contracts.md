# Overlay Activation Contracts

## Purpose
This document specifies the activation contract for each policy overlay layer.
All overlays follow the same principle: **disabled by default → v1 parity guaranteed**.

## Volatility Overlay (Layer 2)

### Activation
Set `volatility_regime_enabled: true` in ExtendedPolicyConfig.

### Sub-features
| Feature | Config Field | Default | Effect |
|---------|-------------|---------|--------|
| Band widening | `volatility_band_widening_enabled` | `false` | Widens hedge ratio bands in elevated/crisis vol |
| Ratio adjustment | `volatility_ratio_adjustment_enabled` | `false` | Scales hedge ratio by vol/baseline ratio |

### Inputs Required
- `VolatilitySnapshot` for the currency pair (from `/v1/volatility-snapshots`)
- Fields: `ewma_vol_annualized` or `realized_vol_annualized`, `vol_regime`

### Fallback Behavior
When no live vol data:
- G10 currencies: 8% annualized (BIS Triennial 2022)
- EM LATAM: 14%
- EM Asia: 10%
- EM CEEMEA: 16%
- Adjustment labeled `fallback_vol_substitution` in trace

### Parity Proof
When `volatility_regime_enabled = false`:
- `band_multiplier = 1.0`
- `ratio_multiplier = 1.0`
- `adjustments = []`
- All output identical to v1

### Grading
All volatility adjustments labeled `grading: 'HEURISTIC'`.

---

## Geopolitical Overlay (Layer 3)

### Activation
Set `geopolitical_overlay_enabled: true` in ExtendedPolicyConfig.

### Mechanism
Linear ratio haircut when corridor risk score exceeds escalation threshold.
- Threshold default: 0.7
- Max haircut default: 10% (0.10)
- Formula: `haircut = (score - threshold) / (1.0 - threshold) * max_haircut`

### Inputs Required
- `GeopoliticalRiskSnapshot` corridors (from `/v1/geo-snapshots`)
- Source: Polisophic normalized scores [0.0, 1.0]

### Corridor Mapping
Currency pairs → geopolitical corridors (deterministic, 26 pairs mapped).
Unknown pairs → no corridor data → no impact.

### Parity Proof
When `geopolitical_overlay_enabled = false`:
- `haircut = 0.0`
- `score = 0.0`
- `regime = 'STABLE'`
- All output identical to v1

### Grading
All geopolitical adjustments labeled `grading: 'HEURISTIC'`.

---

## Netting Overlay (Layer 6)

### Activation
Set `netting_enabled: true` in ExtendedPolicyConfig.

### Mechanism
Preprocessing layer that nets offsetting exposures before kernel execution.
- Same-pair, same-flow-type netting (conservative)
- Cross-flow netting when `netting_net_confirmed_forecast: true` (aggressive)
- Settlement cycle: `netting_settlement_cycle_days` (default: 2)

### Savings Model
- Gross → net notional reduction
- ~3% margin savings on netted notional (Almgren-Chriss estimate)
- Legs eliminated tracked for audit

### Parity Proof
When `netting_enabled = false`:
- Exposures pass through unchanged
- No netting calculations performed
- `net_exposures = original_exposures`

### Grading
All netting adjustments labeled `grading: 'HEURISTIC'`.

---

## Forward Curve Data Sourcing

### Current State
Forward points are synthetic (carry-differential estimates embedded in MarketSnapshot).

### Ingestion Path
`POST /v1/forward-curves` → `ForwardCurveSnapshot` table
- Sources: CME, BLOOMBERG, REFINITIV, SYNTHETIC, INDICATIVE, MANUAL
- Data classes: LIVE, DELAYED, INDICATIVE, SYNTHETIC

### Staleness Governance
- Threshold: 24 hours (V-023)
- `is_stale` flag auto-computed at ingestion
- Staleness minutes tracked

### Fallback Governance
- V-022: WARNING when `data_class = 'INDICATIVE_FALLBACK'`
- V-024: HARD REJECT when indicative AND `allow_indicative_proxy = false`
- Provenance metadata tracks source + data_class for audit

### API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/forward-curves` | Ingest snapshot |
| GET | `/v1/forward-curves/{id}` | Load by UUID |
| GET | `/v1/forward-curves/latest/{pair}` | Latest for pair |
| GET | `/v1/forward-curves/pair/{pair}` | History for pair |

---

## Backtesting Engine

### Purpose
Historical validation of hedge policy recommendations against market data snapshots.

### Methods
- **Single-period evaluation**: Deterministic PnL calculation per policy + period
- **Multi-period backtest**: Aggregate metrics across historical window
- **Policy comparison**: Side-by-side evaluation of two policies

### Outputs
- Hedged vs unhedged PnL
- Hedge effectiveness per period
- Max drawdown
- Average cost (bps)
- Report hash (SHA-256, deterministic)

### Grading
All backtesting results labeled `grading: 'HEURISTIC'`.
No ML, no auto-learning, no optimization.
