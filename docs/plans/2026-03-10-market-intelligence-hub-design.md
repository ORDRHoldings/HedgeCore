# Market Intelligence Hub — Design

## Goal
Unified market decision surface combining treasury-relevant FX data (portfolio pairs, forward curves, carry costs) with broad market monitoring (indices, sector performance, cross-rate heatmap, provider health).

## Architecture
Single page at `/market-intelligence` with 4 stacked sections. Data from existing backend routes (`/v1/market/fx/rates`, `/v1/market/fx/sectors`, `/v1/market-data/status`, `/v1/forward-curves/latest/{pair}`). Tiered polling: portfolio pairs every 60s, broad market every 5min. IBKR primary for FX, TwelveData for equities.

## Components
1. **TickerRibbon** — Scrolling top bar with SPY, QQQ, DIA, DXY-proxy, 10Y yield
2. **FXHeatmapGrid** — Portfolio pairs table: spot, 24h change, 1M/3M/6M/12M forward points, carry rank
3. **VolCarryPanel** — Vol term structure chart (ECharts) + carry scorecard
4. **MarketHealthBar** — Provider badges, staleness indicators, manual refresh

## Data Sources (existing routes)
- `GET /v1/market/fx/rates` → FX spots (TwelveData → yfinance → fallback)
- `GET /v1/market/sectors` → Equity/sector quotes
- `GET /v1/market-data/status` → Provider health
- `GET /v1/forward-curves/latest/{pair}` → Forward curve snapshots
- `GET /v1/market-data/refresh` → Manual refresh trigger

## Sidebar
Expand "Markets" section with "Intelligence Hub" item at top.
