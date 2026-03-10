# Institutional Market Data Platform — Design Document

> **Date**: 2026-03-10
> **Status**: Approved
> **Authors**: User + Claude

## Goal

Replace yfinance with production-grade dual-provider market data platform (TwelveData + IBKR) feeding spot rates, forward curves, vol surfaces, equity/index data, and options chains into the existing WORM snapshot infrastructure. Enable the upcoming Market Intelligence Hub.

## Architecture

**Dual-Provider Model**: TwelveData (REST, runs on Render) as primary for spot/historical/equity/indicators. IBKR (ib_insync + IB Gateway) as institutional supplement for forward curves, options chains, and real-time tick data.

**No frozen files touched.** Kernel continues to receive `MarketSnapshot` — the ingestion layer populates it with real provider data instead of yfinance/indicative fallbacks.

## Provider Responsibilities

| Data Type | TwelveData | IBKR | Fallback |
|-----------|-----------|------|----------|
| FX spot rates | Primary (batch 17 pairs) | Backup (real-time tick) | yfinance → hardcoded |
| Historical OHLC | Primary (vol calc input) | Backup | — |
| Forward points/swaps | — | Primary | Synthetic (interest diff) |
| Implied vol / options | — | Primary | Fallback vols by region |
| Equity/index quotes | Primary (SPY, QQQ, etc.) | Backup | yfinance |
| Technical indicators | Primary (100+ built-in) | — | — |
| Interest rate curves | — | Primary | — |

## Data Flow

```
TwelveData REST API ──┐
                      ├──► Provider Abstraction Layer
IBKR IB Gateway ──────┘         │
                                ▼
                    Ingestion Orchestrator
                    (normalize + classify)
                                │
              ┌─────────┬───────┼────────┬────────────┐
              ▼         ▼       ▼        ▼            ▼
        MarketSnap  FwdCurve  VolSnap  EquitySnap  OptionsSnap
         (WORM)     (WORM)   (WORM)    (WORM)      (WORM)
              │         │       │        │            │
              ▼         ▼       ▼        ▼            ▼
           Kernel    Kernel  Overlays  Intel Hub   Vol Extract
         (spot+fwd)  (fwd)  (vol/geo)  (frontend)  (overlay)
```

## IBKR Connectivity

IBKR requires IB Gateway running locally (or on a VPS). Two operating modes:

1. **Local mode**: IBKR connector runs as a background service on the same machine as IB Gateway. Fetches data and POSTs to backend API via authenticated REST calls.

2. **Embedded mode**: If backend runs on same machine as IB Gateway (dev), the provider connects directly via ib_insync socket.

Both modes write through the same WORM services — no special paths.

## New Backend Files

```
backend/app/services/market_data/
├── __init__.py
├── provider_base.py          # Abstract provider interface
├── twelvedata_provider.py    # TwelveData REST client
├── ibkr_provider.py          # ib_insync client
├── ingestion_service.py      # Orchestrator: normalize + route to WORM services
├── scheduler.py              # APScheduler: timed fetches
└── staleness_monitor.py      # Health checks + provider status

backend/app/models/
├── equity_snapshot.py         # New: EquitySnapshot WORM model
└── options_snapshot.py        # New: OptionsSnapshot WORM model

backend/app/services/
├── equity_snapshot_service.py # New: WORM service (create_or_get pattern)
└── options_snapshot_service.py# New: WORM service

backend/app/api/routes/
├── v1_market_data_admin.py    # New: provider status, manual refresh, config
├── v1_equity_snapshots.py     # New: equity/index CRUD
└── v1_options_snapshots.py    # New: options chain CRUD

backend/scripts/
└── ibkr_connector.py          # Standalone IBKR→API bridge script
```

## New Models

### EquitySnapshot
- symbol, as_of, source, data_class
- open, high, low, close, volume, vwap
- change_pct, market_cap, pe_ratio
- payload (JSONB), snapshot_hash
- company_id (tenant), is_stale, staleness_minutes

### OptionsSnapshot
- underlying, expiry, strike, option_type (CALL/PUT)
- as_of, source, data_class
- bid, ask, last, volume, open_interest
- implied_vol, delta, gamma, theta, vega
- payload (JSONB), snapshot_hash
- company_id (tenant)

## Configuration

New Settings fields:
```python
# TwelveData
TWELVEDATA_API_KEY: str = ""
TWELVEDATA_BASE_URL: str = "https://api.twelvedata.com"
TWELVEDATA_RATE_LIMIT: int = 8        # requests/minute (free tier)
TWELVEDATA_DAILY_LIMIT: int = 800     # requests/day (free tier)

# IBKR
IBKR_HOST: str = "127.0.0.1"
IBKR_PORT: int = 4002                 # IB Gateway paper default
IBKR_CLIENT_ID: int = 1
IBKR_ENABLED: bool = False            # Opt-in (requires local Gateway)

# Ingestion
MARKET_DATA_SPOT_INTERVAL_SEC: int = 300    # 5 min
MARKET_DATA_FORWARD_INTERVAL_SEC: int = 3600 # 1 hour
MARKET_DATA_EQUITY_INTERVAL_SEC: int = 300   # 5 min
MARKET_DATA_VOL_INTERVAL_SEC: int = 3600     # 1 hour
MARKET_DATA_OPTIONS_INTERVAL_SEC: int = 3600 # 1 hour
```

## Permissions (new seeds)

```
market_data.admin      — Access market data admin panel
market_data.refresh    — Trigger manual data refresh
equity.snapshot.create — Persist equity snapshots
equity.snapshot.read   — Read equity snapshots
options.snapshot.create— Persist options snapshots
options.snapshot.read  — Read options snapshots
```

Note: `forward_curve.create/read` and `volatility.snapshot.create/read` already referenced in routes but missing from SEED_PERMISSIONS — will be added.

## Staleness & Failover

| Data Type | Staleness Threshold | Failover Chain |
|-----------|-------------------|----------------|
| FX Spot | 5 min | TwelveData → IBKR → yfinance → hardcoded |
| Forward Curves | 1 hour | IBKR → synthetic (interest diff) |
| Volatility | 1 hour | IBKR (implied) → EWMA from historical |
| Equity/Index | 5 min | TwelveData → IBKR → yfinance |
| Options | 1 hour | IBKR only (no fallback) |

## What This Does NOT Change

- Kernel (frozen) — still receives MarketSnapshot with spot_rate + forward_points_by_month
- WORM semantics — all new snapshots append-only, hash-chained
- Validator gates — V-022/V-023 unchanged, just new provider names recognized
- Overlay architecture — vol/geo overlays consume same snapshot shape
- Auth/RBAC — same pattern, new permission codenames
