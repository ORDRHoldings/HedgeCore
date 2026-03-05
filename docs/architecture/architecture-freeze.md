# HedgeCalc Architecture Freeze – v1

## Canonical Stack
- FastAPI (ASGI)
- Deterministic Python engines
- Stateless execution
- No background inference
- No ML in hedge decisions

## Immutable Decisions
- R1–R8 risk taxonomy
- Strategy → Instrument mapping model
- Middleware order (Audit → Rate Limit → Auth)

## Forbidden in v1
- ML models
- Auto-learning
- Broker execution
- Stateful decision logic

## Upgrade Path
- v2 may add optimization layers
- v1 remains intact for audit parity
