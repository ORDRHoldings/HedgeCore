# ADR 0002: Deterministic hedge engine

Status: accepted
Date: 2026-03-04

## Context
HedgeCalc decisions must be reproducible for audit and governance.
The architecture freeze prohibits ML or adaptive state that changes
recommendations between runs.

## Decision
Implement deterministic engines under `backend/app/engine` and
`backend/app/engine_v1`, with explicit, versioned logic and no
self-learning or adaptive state.

## Consequences
- Runs are reproducible with identical inputs.
- Audit trails can link inputs, decisions, and outputs.
- ML-based optimization is deferred to a future version.

## References
- `ARCHITECTURE_FREEZE.md`
- `backend/app/engine`
- `backend/app/engine_v1`
