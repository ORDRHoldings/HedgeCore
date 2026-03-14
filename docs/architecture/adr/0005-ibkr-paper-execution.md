# ADR-0005: IBKR Paper Trading Execution via IB Gateway

## Status
ACCEPTED

## Date
2026-03-14

## Context

The ORDR Terminal v1 architecture freeze explicitly forbids live broker execution within the deterministic engine (`engine_v1/`). However, institutional users require the ability to validate order routing and fill mechanics in a controlled paper-trading environment before any future production execution capability is considered.

The existing `IBKRProvider` in `backend/app/services/market_data/ibkr_provider.py` already establishes a pattern for connecting to IB Gateway via `ib_insync` for market data. Order execution is a separate concern that must be cleanly isolated from both the frozen engine and the market data provider.

Key constraints:
1. The deterministic engine (`engine_v1/`) must not be modified.
2. Execution logic must be fully decoupled from hedge calculation.
3. Paper trading only for v1 -- no live execution.
4. Must not interfere with the existing market data connection.

## Decision

Introduce a new **IBKRExecutor** service at `backend/app/services/ibkr_executor.py` that:

1. **Connects independently** to IB Gateway using a dedicated `clientId` (base + 10 offset) to avoid socket conflicts with the market data provider.
2. **Places FX orders** (market and limit) on IDEALPRO via `ib_insync`.
3. **Tracks fills** with configurable timeouts (30s market, 60s limit) and returns structured execution results including fill price, quantity, time, execution ID, and commission.
4. **Supports batch execution** for multi-leg hedges.
5. **Caches qualified contracts** to minimize redundant gateway lookups.
6. **Fails gracefully** when IB Gateway is not running (clear error messages, no crashes).

### Architecture Boundaries

- The executor is a **standalone service** -- it does not import from or modify `engine_v1/`.
- Hedge calculations remain deterministic and broker-agnostic.
- The executor receives pre-computed order parameters (pair, action, quantity) from upstream orchestration.
- No frozen files are modified.
- WORM table semantics are unaffected.

### Connection Isolation

| Component | clientId | Purpose |
|-----------|----------|---------|
| IBKRProvider (market data) | `settings.IBKR_CLIENT_ID` (default: 1) | Spot, forward, equity, options data |
| IBKRExecutor (orders) | `settings.IBKR_CLIENT_ID + 10` (default: 11) | FX order placement and fill tracking |

## Consequences

- Paper trading execution is available for demo and testing environments.
- The frozen engine is untouched -- execution is a post-calculation concern.
- IB Gateway must be running locally for execution to work (optional dependency).
- `ib_insync` remains a lazy import -- deployments without it (e.g. Render) are unaffected.
- Future ADR required before any live (non-paper) execution is permitted.
- Audit trail for executions should be added in a follow-up (WORM execution_events table).

## References

- ADR-0002: Deterministic Engine (ACCEPTED)
- ADR-0004: Policy Engine v1 Extensions (ACCEPTED)
- Architecture Freeze: `docs/architecture/architecture-freeze.md`
- IBKR Provider: `backend/app/services/market_data/ibkr_provider.py`
- System Boundaries: `docs/architecture/SYSTEM_BOUNDARIES.md`
