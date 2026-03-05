# Hedge calculation flow

## Actors
- UI client or integration partner
- HedgeCalc API
- Hedge engine

## Steps
1. Client submits policy, position, and market data to `/v1/calculate*`.
2. API validates schemas and builds a run envelope.
3. Engine computes strategy, sizing, and risk classification.
4. API returns results and audit bundle.

## Key endpoints
- `/v1/calculate`
- `/v1/calculate/multi`
- `/hedge/*`

## Outputs
- Decision bundle
- Risk taxonomy classifications
- Cost and scenario summaries
