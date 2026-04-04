# ORDR Market — Current State

> Last updated: 2026-04-04

## Build Status
- **Branch**: master
- **Last commit**: S70 feat: heatmap revamp — sparklines, category tabs, TD proxy, 2-col grid
- **Uncommitted changes**: none (clean)
- **TypeScript**: 0 errors
- **Tests**: 126/126 passing
- **Next.js build**: ✅ clean

## Sprints Completed (S1–S59)

| Sprint | Feature |
|--------|---------|
| S1–S50 | See CHANGELOG_AI.md for full history |
| Post-S50 | Twelve Data integration + TradingView-exact canvas visuals |
| **S51** | Data Layer Fixes — URL bugs fixed, TD proxy migration, symbol prices refreshed |
| **S52** | Crosshair Sync across multi-chart panes |
| **S53** | Live Economic Calendar via Twelve Data |
| **S54** | Enhanced Screener — 200 symbols, Gap Scan, alert shortcuts |
| **S55** | Chart Export & Share — PNG download, clipboard copy, shareable URL |
| **S56** | Strategy Lab V2 — equity curve canvas, trade list, on-chart markers |
| **S57** | Paper Trading Portfolio — running P&L, aggregate view, CSV export |
| **S58** | Mobile UX Round 2 — swipe TF change, bottom sheet panels, touch accuracy |
| **S59** | Performance Pass — watchlist virtualization, heatmap parallel fetch, resize debounce |
| **S60** | Advanced Chart Types — Renko + Line Break renderers, context menu switcher |
| **S61** | ICT Kill Zones + Equal Highs/Lows — intraday time bands, EQH/EQL cluster detection |
| **S62** | Multi-Symbol Comparison Overlay — re-based price lines, color-coded chips, CompareButton |
| **S63** | Enhanced MTF Strip — EMA trend badge, RSI value, MACD direction per timeframe card |
| **S64** | Indicator param persistence (localStorage) + browser notifications for alerts |
| **S65** | Watchlist Price Alert Quick-Set — hover bell + one-tap Cross Above/Below popover |
| **S66** | News Events on Chart Timeline — NEWS toolbar toggle, triangle flags at bar positions, hover tooltip |
| **S67** | Alert History Log — triggered alert log, ACTIVE/HISTORY tabs in AlertsPanel, LOG_ALERT_TRIGGER action |
| **S68** | Risk Levels on Chart Canvas — ENTRY/STOP/TARGET overlay from RiskCalcPanel, SET_RISK_LEVELS action, Layer 8d renderer |
| **S69** | FX Correlation Matrix Panel — new `corr` right tab, Pearson correlation 10×10 grid, 20/50/100 bar periods |
| **S70** | Heatmap Revamp — SVG sparklines, category filter tabs (All/ETF/Tech/Metals/Crypto), TD proxy migration, 2-col grid |

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
