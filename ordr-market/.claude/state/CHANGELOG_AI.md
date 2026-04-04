# AI Changelog

> Auto-maintained

## 2026-04-04 — Sprint 57: Paper Trading Portfolio
**Commit**: `8226fc9`
- `TradePanel`: running P&L section — live unrealized P&L per open position for current symbol, `CLOSE_PAPER_POSITION` dispatch, aggregate total
- `OrdersDock`: aggregate portfolio already present (Floating P&L + full table across all symbols); CSV journal export already present
- S56 leftovers wired: `BacktestMarker` type + `SET_BACKTEST_MARKERS` reducer + `ChartCore` prop + `ChartRenderer` layer 4b
- TypeScript: 0 errors | Tests: 126/126 ✅ | Browser E2E: OPEN POSITIONS ✅ Floating P&L ✅ Journal CSV ✅

## 2026-04-04 — Sprint 56: Strategy Lab V2
**Commit**: `5142fac`
- `BottomDock`: All 9 `runBacktest` strategy branches updated to track `barIdx` and use `mkTrade()` helper
- `BottomDock`: Canvas equity curve renderer (`EquityCanvas`) replaces div bar chart — line + fill + drawdown overlay (DPR-aware)
- `BottomDock`: EQUITY CURVE / TRADE LIST tab switcher; trade list table: #, Side, Entry, Exit, P&L, W/L
- `BottomDock`: CSV export updated with Entry/Exit price columns
- `StrategyDock.handleRun`: dispatches `SET_BACKTEST_MARKERS` after each backtest → entry/exit arrows on chart
- `ChartEngine`: fixed `BacktestMarker` import path (`../../` → `../`)
- TypeScript: 0 errors | Tests: 126/126 ✅ | Build: clean ✅

## 2026-04-03 — Sprint 55: Chart Export & Share
**Commit**: `a1dcd94`
- `CommandBar`: Copy Image button (clipboard) + Share URL button (Share2) added next to Camera
- `ChartEngine`: `externalCopyImageTrigger` prop → `canvas.toBlob()` → `clipboard.write()` with download fallback
- `WorkspaceProvider`: `COPY_CHART_IMAGE` action + URL share param reading on mount (`?s`, `?tf`)
- Share URL format: `?s=SYMBOL&tf=TF&ind=comma,separated,indicator,ids`

## 2026-04-03 — Sprint 54: Enhanced Screener
**Commit**: `5cf8318`
- `workspace-data.ts`: SCREENER_UNIVERSE expanded to 200 symbols (was 14) — FX/Stocks/ETF/Indices/Crypto/Commodities
- `ScreenerPanel.tsx`: new GapScan tab (gap-up, gap-down, vol-spike) with category filter, threshold input, stop/abort, progress bar, sorted results
- FilterScan upgraded to 200-symbol universe + category filter + stop support
- Alert shortcut on all scan results: Bell icon → ADD_ALERT + SET_RIGHT_TAB:'alerts'

## 2026-04-03 — Sprint 53: Live Economic Calendar
**Commit**: `ccf6e82`
- `news/route.ts`: live `/economic_calendar` from Twelve Data (today+14d, 1h cache, actual/forecast/previous); dynamic fallback replaces stale 2026-03-28 hardcoded data
- `NewsPanel.tsx`: CalendarEvent extended; A:/F:/P: value strip in CalRow; LIVE/STATIC badge; 30-min calendar refresh

## 2026-04-03 — Sprint 52: Crosshair Sync
**Commit**: `cdff198`
- `ChartEngine.tsx`: `syncCrosshair` prop + `ordr:crosshair-sync` CustomEvent bus (emit on move, clear on leave, listen from other panes)
- `ChartRenderer.ts`: ghost dashed vertical line at synced timestamp (layer 9b, 35% opacity, only when local crosshair hidden)
- `WorkspaceProvider`: `crosshairSyncEnabled` boolean (default true, persisted), `TOGGLE_CROSSHAIR_SYNC` action
- `CommandBar`: `CrosshairSyncToggle` button (Link2/Link2Off) visible only in multi-chart mode
- `ChartCore` + `SecondaryChartPane`: wire `syncCrosshair` prop from workspace state

## 2026-04-03 — Sprint 51: Data Layer Fixes
**Commits**: `7c791f8`, `9f28a0b`, `9d11621`
- `HeatmapPanel.tsx`: removed spurious `/api/` prefix in hedgecore URL (was 404ing)
- `usePublicChartData.ts`: same fix for fallback URL
- `ScreenerPanel.tsx`: migrated `fetchFilterBars` to Twelve Data proxy (`/api/chart-data/`); extracts `.bars` from response envelope
- `BottomDock.tsx`: migrated `fetchScanBars` to TD proxy; removed `SCANNER_API_BASE` constant
- `workspace-data.ts`: refreshed all 14 symbol static prices (XAUUSD 2318→3116, BTCUSD 67842→82450, NVDA 875→107 post-split, etc.)

## 2026-03-27 — Sprint 10: Workspace State Sync
**Commit**: `28963f7`
- Added `INDICATOR_TO_CHART_KEY` map in WorkspaceProvider for indicator toggle → ChartEngine sync
- Two-way binding: ChartEngine context-menu actions now propagate back to workspace state via callbacks
- Fixed ESC/cancel hierarchy in ChartEngine (drawing-in-progress → multi-select → single-select)
- MTF strip panels in BottomDock are now clickable (dispatch SET_TIMEFRAME)
- Fixed DrawingPropertiesPanel showPips toggle bug (default-true negation logic)

## 2026-03-25 — Sprint 9: Divergence Engine
**Commit**: `fe0b95e`
- Regular + hidden divergence detection for RSI and MACD

## 2026-03-xx — Sprints 1–8
- See git log for full history
