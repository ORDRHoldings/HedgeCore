# Engine Truth Table

## Engine Layers

| Layer | Location | Purpose | Deterministic | DB Access |
|-------|----------|---------|---------------|-----------|
| Orchestrator | `engine/orchestrator.py` | Coordinates engine_v1 modules | Yes | No |
| Risk Classifier | `engine/risk_classifier.py` | R1-R8 classification | Yes | No |
| Strategy Selector | `engine/strategy_selector.py` | Strategy selection | Yes | No |
| Instrument Mapper | `engine/instrument_mapper.py` | Strategy -> instrument | Yes | No |
| Hedge Sizer | `engine/hedge_sizer.py` | Position sizing | Yes | No |
| Cost Engine | `engine/cost_engine.py` | Cost calculation | Yes | No |
| Exposure | `engine/exposure.py` | Exposure aggregation | Yes | No |
| Decision Gate | `engine/decision_gate.py` | Rule-based decisions | Yes | No |
| Scenario Engine | `engine/scenario_engine.py` | Stress testing | Yes | No |
| Audit Bundle | `engine/audit_bundle.py` | Hash chain bundling | Yes | No |
| Recommend | `engine/recommend.py` | Recommendation | Yes | No |
| Audit Engine | `engine/audit_engine.py` | Markup/fee/impact | Yes | No |
| Decision Engine | `engine/decision_engine.py` | HEDGE/STAGED/REDUCE/NO_ACTION | Yes | No |
| Hedge Effectiveness | `engine/hedge_effectiveness_engine.py` | IFRS 9/ASC 815 testing | Yes | No |

## Engine V1 Kernel

| Module | Purpose | Frozen |
|--------|---------|--------|
| `kernel.py` | 13-step per-bucket calculation | YES |
| `validator.py` | Fail-closed input validation (422) | YES |
| `audit.py` | RunEnvelope (8-field hash chain) | YES |
| `scenarios.py` | Scenario analysis | YES |
| `hedge_accounting.py` | Dollar-offset + regression | No |
| `risk_allocator.py` | Risk budget allocation | No |
| `factor_covariance.py` | Factor-based risk decomposition | No |
| `monte_carlo.py` | Monte Carlo simulation | No |

## Immutable Mappings

### R1-R8 Risk Taxonomy
| Code | Risk Type |
|------|-----------|
| R1 | Transaction Risk |
| R2 | Translation Risk |
| R3 | Economic Risk |
| R4 | Contingent Risk |
| R5 | Pre-Transaction Risk |
| R6 | Operating Risk |
| R7 | Tax Risk |
| R8 | Competitive Risk |

### Strategy -> Instrument (frozen)
- Forward: vanilla FX forward
- Option: vanilla FX option
- Collar: zero-cost collar
- Swap: cross-currency swap
- Futures: exchange-traded FX futures
- NDF: non-deliverable forward
- Participating Forward: leveraged forward

## Calculation Contract
- Input: `TradeRow[]` + `PolicyParams` + `MarketSnapshot`
- Output: `CalculationResult` with buckets, KPIs, scenarios, audit hash
- Invariant: same input ALWAYS produces same output (deterministic)
- Hash: SHA-256 of canonical JSON (sorted keys, no whitespace)
