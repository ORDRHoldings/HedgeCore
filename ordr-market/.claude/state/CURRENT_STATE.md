# ORDR Market — Current State

> Last updated: 2026-04-03

## Build Status
- **Branch**: master
- **Last commit**: `9d11621` chore: refresh SYMBOL_DATA static prices to 2026-04-03 values
- **Uncommitted changes**: none (clean)
- **TypeScript**: 0 errors
- **Tests**: 126/126 passing
- **Next.js build**: ✅ clean (pending re-run after S51)

## Sprints Completed (S1–S51)

| Sprint | Feature |
|--------|---------|
| S1–S50 | See CHANGELOG_AI.md for full history |
| Post-S50 | Twelve Data integration + TradingView-exact canvas visuals |
| **S51** | Data Layer Fixes — URL bugs fixed, TD proxy migration, symbol prices refreshed |

## Data Layer (Live)
- REST primary: `usePublicChartData` → `/api/chart-data/{symbol}` → Twelve Data proxy (Next.js server-side)
- REST fallback: `hedgecore.onrender.com/v1/public/chart-data/{symbol}`
- WebSocket: `useMarketWebSocket` → Twelve Data WSS (fallback: hedgecore WS)
- Scanner/BottomDock/ScreenerPanel: all use `/api/chart-data/` TD proxy
- HeatmapPanel: uses hedgecore fallback directly at correct `/v1/public/chart-data/` path

## Active Risks
None recorded.

## Sprint Roadmap
S52–S60 defined in CLAUDE.md
