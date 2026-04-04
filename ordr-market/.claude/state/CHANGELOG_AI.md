# AI Changelog

## 2026-04-04 — Sprint 70: Heatmap Panel Revamp
**Commit**: S70 (pending)
- `HeatmapPanel.tsx`: `fetchTileData()` fetches 8 bars — 7 for `Sparkline` SVG path + 1 for % change; TD proxy primary, hedgecore fallback
- Category tabs All/ETF/Tech/Metals/Crypto; sort default = gainers; 2-col grid with larger tiles
- `Sparkline` component: inline `<svg>` with `<path>` M/L from normalized closes; color matches tile intensity band
- TypeScript: 0 errors | Tests: 126/126 ✅ | Browser E2E: header ✅ 5 cat tabs ✅ Tech=7 tiles ✅

## 2026-04-04 — Sprint 69: FX Correlation Matrix Panel
**Commit**: S69 (pending)
- `workspace-types.ts`: `'corr'` added to RightTab union
- `CorrelationPanel.tsx` (new): Pearson correlation matrix for EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, NZD/USD, USD/CAD, EUR/JPY, GBP/JPY, EUR/GBP; parallel TD proxy + hedgecore fetch; 20/50/100d period selector; deep-green/grey/red color cells; graceful "—" on no data
- `RightStack.tsx`: GitBranch icon, corr tab + CorrelationPanel case
- TypeScript: 0 errors | Tests: 126/126 ✅ | Browser E2E: panel open ✅ period buttons ✅ 100-cell grid ✅

## 2026-04-04 — Sprint 68: Risk Levels on Chart Canvas
**Commit**: S68 (pending)
- `workspace-types.ts`: `riskLevels: { entry, sl, tp, side } | null` state field + `SET_RISK_LEVELS` action
- `WorkspaceProvider.tsx`: `riskLevels: null` initial state; reducer case; NOT persisted (ephemeral — cleared on panel close)
- `RiskCalcPanel.tsx`: useEffect syncs entry/SL/TP/side → dispatch `SET_RISK_LEVELS`; cleanup clears on unmount
- `ChartRenderer.ts` Layer 8d: colored fill zones (risk/reward), dashed STOP/TARGET/ENTRY price lines, price-axis labels
- `ChartEngine.tsx`: `externalRiskLevels` prop; `ChartCore.tsx`: passes from workspace state
- TypeScript: 0 errors | Tests: 126/126 ✅ | Browser E2E: SL/TP inputs set ✅ riskLevels ephemeral ✅

## 2026-04-04 — Sprint 67: Alert History Log
**Commit**: S67 (pending)
- `workspace-types.ts`: `AlertHistoryEntry` interface + `alertHistory` state field + `LOG_ALERT_TRIGGER`/`CLEAR_ALERT_HISTORY` actions
- `WorkspaceProvider.tsx`: history reducer (prepend + 100-entry cap), localStorage persistence
- `ChartCore.tsx`: both price and indicator alert paths dispatch `LOG_ALERT_TRIGGER` with full context
- `AlertsPanel.tsx`: ACTIVE/HISTORY tab switcher; History tab with triggered entry list + relative time + Clear button
- TypeScript: 0 errors | Tests: 126/126 ✅ | Browser E2E: ACTIVE(1)/HISTORY(0) tabs ✅ empty state ✅

## 2026-04-04 — Sprint 66: News Events on Chart Timeline
**Commit**: S66 (pending)
- `workspace-types.ts` + `WorkspaceProvider.tsx`: `showNewsOverlay` state + `TOGGLE_NEWS_OVERLAY` action, localStorage persisted
- `ChartCore.tsx`: useEffect fetches `/api/news?symbol=...&mode=symbol&limit=50` on toggle; converts isoTime→unix seconds; passes `externalNewsEvents` to ChartEngine
- `ChartRenderer.ts` Layer 8c: colored triangle flags (red/amber/grey by importance) at bar positions
- `ChartEngine.tsx`: hover detection + React tooltip overlay with headline/importance/source/sentiment
- `CommandBar.tsx`: `NewsOverlayToggle` — "NEWS" toolbar button
- TypeScript: 0 errors | Tests: 126/126 ✅ | Browser E2E: NEWS button ✅ fetch triggered ✅

## 2026-04-04 — Sprint 65: Watchlist Price Alert Quick-Set
**Commit**: `d996359`
- `WatchlistPanel` (`LiveRow`): hover-reveal Bell button (absolute right:6, 18×18); visible on `hovered || alertOpen` when `price !== null`
- Click-outside popover with "ALERT @ {price}" label; ↑ Cross Above + ↓ Cross Below dispatch `ADD_ALERT` with live price; `stopPropagation` prevents row navigation
- TypeScript: 0 errors | Tests: 126/126 ✅ | Browser E2E: bell ✅ popover ✅ alert created ✅


> Auto-maintained

## 2026-04-04 — Sprint 64: Indicator Param Persistence + Browser Notifications
**Commit**: `2fa06a7`
- `ChartEngine`: indicatorParams lazy-initialized from `ordr_indicator_params` localStorage; saved inside setIndicatorParams updater on every change
- `ChartCore`: `fireBrowserNotification()` — fires OS `new Notification()` on alert trigger (price + indicator); respects Notification.permission
- `AlertsPanel`: BellRing/BellOff permission icon; requestPermission on click; color-coded state (granted/denied/default)
- TypeScript: 0 errors | Tests: 126/126 ✅

## 2026-04-04 — Sprint 63: Enhanced MTF Strip — Trend Signals
**Commit**: `7110e70`
- `BottomDock.tsx` (MTFCard): signal row below mini candle chart — EMA(9/21) trend badge (BULL/BEAR/NEUT), RSI(14) with color coding (≥70 red, ≤30 green), MACD histogram direction arrow
- All computed via useMemo from already-fetched bars (zero extra fetches)
- MTFStrip timeframes: 15m / 1h / 4h / D / W
- TypeScript: 0 errors | Tests: 126/126 ✅

## 2026-04-04 — Sprint 62: Multi-Symbol Comparison Overlay
**Commit**: `8537d94`
- `hooks/useCompareData.ts` (new): Promise.all parallel fetch for N compare symbols; TD proxy + hedgecore fallback
- `workspace-types.ts`: `compareSymbols: string[]`; ADD_COMPARE + REMOVE_COMPARE actions (max 4)
- `WorkspaceProvider.tsx`: initial state, reducer, localStorage persistence
- `ChartRenderer.ts`: Layer 3c re-based comparison lines; `rebasedPrice = primaryFirst × (compareClose / compareFirst)`; right-side labels; 4-color scheme
- `ChartEngine.tsx`: `externalCompareData` prop wired to renderProps
- `ChartCore.tsx`: useCompareData hook + prop pass-through
- `CommandBar.tsx`: CompareButton — popover, symbol input, color-coded chips with × remove
- TypeScript: 0 errors | Tests: 126/126 ✅

## 2026-04-04 — Sprint 61: ICT Kill Zones + Equal Highs/Lows
**Commit**: `924913c`
- `killZones.ts` (new): London/NY AM/NY PM vertical bands; semi-transparent fills + labels; skips on ≥4h timeframes
- `eqhl.ts` (new): swing high/low detection (lookback=3), greedy 0.08% tolerance clustering, swept status; EQH=red dashed, EQL=teal dashed, swept=grey
- `ChartRenderer.ts`: `showKillZones` + `showEQHL` RenderProps; rendering after sessionRanges block
- `ChartEngine.tsx`: `externalShowKillZones` + `externalShowEQHL` props wired to renderProps
- `ChartCore.tsx`: passes both props from workspace state
- `WorkspaceProvider.tsx`: initial false state, TOGGLE_KILL_ZONES + TOGGLE_EQHL reducers, localStorage persistence
- `workspace-types.ts`: `showKillZones` + `showEQHL` fields; two new action union variants
- `CommandBar.tsx`: KillZonesToggle ("KZ") + EQHLToggle ("EQL/H") toolbar buttons
- TypeScript: 0 errors | Tests: 126/126 ✅

## 2026-04-04 — Sprint 60: Advanced Chart Types
**Commit**: `bccc424`
- `chartTypes.ts`: `drawRenko` — ATR-14 brick size, time-independent price bricks, bull (green fill) / bear (red fill), viewport mapped via density ratio; `drawLineBreak` — 3-line break, hollow bull / filled bear boxes; `ChartType` extended with `'renko' | 'linebreak'`
- `workspace-types.ts`: `ChartType` extended with `'renko' | 'linebreak'`
- `ChartRenderer.ts`: import + switch cases for renko / linebreak
- `ChartContextMenu.tsx`: Renko + Line Break items in Chart Type submenu
- `ChartEngine.tsx`: `chartType:renko` + `chartType:linebreak` handler cases
- TypeScript: 0 errors | Tests: 126/126 ✅

## 2026-04-04 — Sprint 59: Performance Pass
**Commit**: `37b9908`
- `WatchlistPanel`: `IntersectionLiveRow` — defers `LiveRow` mount until viewport entry (IntersectionObserver, 120px rootMargin, 37px placeholder)
- `HeatmapPanel`: `Promise.all()` parallel fetch replaces serial loop; single `setTiles` state update
- `ChartEngine`: 150ms debounced `setDimensions` in ResizeObserver — prevents canvas thrash on resize drag
- TypeScript: 0 errors | Tests: 126/126 ✅

## 2026-04-04 — Sprint 58: Mobile UX Round 2
**Commit**: `7be77b1`
- `ChartEngine`: swipe gesture → `onSwipeTimeframe('left'|'right')` (>70px, <400ms, no draw/drag/pinch); hit radius 2.5x→3.5x
- `ChartCore`: `onSwipeTimeframe` → `SET_TIMEFRAME` cycling `BASE_TIMEFRAMES + customTimeframes`
- `MobileWorkspace`: `onSwipeTimeframe` → cycle `MOBILE_TFS` local state
- `IndicatorSettingsPanel`: mobile (<768px) = fixed bottom sheet; desktop = floating popover; shared `panelBody` JSX
- TypeScript: 0 errors | Tests: 126/126 ✅

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
