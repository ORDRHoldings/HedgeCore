# ORDR Market — Current State

> Last updated: 2026-04-04

## Build Status
- **Branch**: master
- **Last commit**: fa45cde feat(ordr-market): S73 screener CSV export + results count
- **Uncommitted changes**: none (clean)
- **TypeScript**: 0 errors
- **Tests**: 126/126 passing
- **Next.js build**: clean

## Sprints Completed (S1–S73)

| Sprint | Feature |
|--------|---------|
| S1–S50 | See CHANGELOG_AI.md for full history |
| Post-S50 | Twelve Data integration + TradingView-exact canvas visuals |
| S51 | Data Layer Fixes |
| S52 | Crosshair Sync |
| S53 | Live Economic Calendar |
| S54 | Enhanced Screener — 200 symbols, Gap Scan |
| S55 | Chart Export & Share |
| S56 | Strategy Lab V2 |
| S57 | Paper Trading Portfolio |
| S58 | Mobile UX Round 2 |
| S59 | Performance Pass |
| S60 | Advanced Chart Types — Renko + Line Break |
| S61 | ICT Kill Zones + Equal Highs/Lows |
| S62 | Multi-Symbol Comparison Overlay |
| S63 | Enhanced MTF Strip |
| S64 | Indicator param persistence + browser notifications |
| S65 | Watchlist Price Alert Quick-Set |
| S66 | News Events on Chart Timeline |
| S67 | Alert History Log |
| S68 | Risk Levels on Chart Canvas |
| S69 | FX Correlation Matrix Panel |
| S70 | Heatmap Revamp — sparklines, category tabs, 2-col grid |
| S71 | Technical Setup Scanner |
| S72 | Webhook Alerts |
| S73 | Screener CSV Export |

## Data Layer (Live)
- REST primary: usePublicChartData -> /api/chart-data/{symbol} -> Twelve Data proxy
- REST fallback: hedgecore.onrender.com/v1/public/chart-data/{symbol}
- WebSocket: useMarketWebSocket -> Twelve Data WSS (fallback: hedgecore WS)

## Active Risks
None recorded.

## Next Sprint: S74
