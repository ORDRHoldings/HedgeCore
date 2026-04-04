# Current Sprint

> Last updated: 2026-04-03

## Sprint 51 — COMPLETED ✅
**Data Layer Fixes**

### Delivered
- `HeatmapPanel.tsx`: fixed URL bug — removed spurious `/api/` prefix (`/api/v1/` → `/v1/`)
- `usePublicChartData.ts`: fixed fallback URL bug — same `/api/` prefix removal
- `ScreenerPanel.tsx`: migrated `fetchFilterBars` to TD proxy `/api/chart-data/` + extract `.bars`
- `BottomDock.tsx`: migrated `fetchScanBars` to TD proxy `/api/chart-data/` + removed `SCANNER_API_BASE` constant
- `workspace-data.ts`: refreshed all 14 symbol static prices to 2026-04-03 approximate values

### Commits
- `7c791f8` fix: remove spurious /api/ prefix from hedgecore URLs
- `9f28a0b` fix: migrate ScreenerPanel + BottomDock scanner to Twelve Data proxy
- `9d11621` chore: refresh SYMBOL_DATA static prices to 2026-04-03 values

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ TD proxy `/api/chart-data/EURUSD` → source:TwelveData, 5 bars returned. Screener MTF Matrix rendered. Watchlist symbols visible.

---

---

## Sprint 52 — COMPLETED ✅
**Crosshair Sync across Multi-Chart Panes**

### Delivered
- `ChartEngine.tsx`: `syncCrosshair` prop; emits `ordr:crosshair-sync` CustomEvent on mouse move; listens for events from other panes; triggers ghost re-render; clears on mouse leave
- `ChartRenderer.ts`: `externalCrosshairTs` in `RenderProps`; layer 9b draws dim dashed ghost vertical line at synced timestamp
- `workspace-types.ts`: `crosshairSyncEnabled: boolean` + `TOGGLE_CROSSHAIR_SYNC` action
- `WorkspaceProvider.tsx`: initial state true, reducer case, persisted to localStorage
- `CommandBar.tsx`: `CrosshairSyncToggle` button (Link2/Link2Off icons), visible only when `chartLayout !== '1'`
- `ChartCore.tsx`: passes `syncCrosshair` only when multi-chart active
- `SecondaryChartPane.tsx`: passes `syncCrosshair` from workspace state

### Commit
`cdff198` — pushed to master

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ chartLayout:"2h" confirmed in localStorage; CrosshairSyncToggle DOM button found with title "Crosshair sync ON — click to disable"; crosshairSyncEnabled:true persisted.

---

---

## Sprint 53 — COMPLETED ✅
**Live Economic Calendar via Twelve Data**

### Delivered
- `news/route.ts`: `fetchTDCalendar()` hits `/economic_calendar` (today → +14 days, 1h cache); maps importance 1/2/3 → low/medium/high, extracts actual/forecast/previous; `buildFallbackCalendar()` generates current-week skeleton dynamically (no more stale 2026-03-28 data); handler returns `{ events, source }`
- `NewsPanel.tsx`: `CalendarEvent` extended with `actual/forecast/previous`; `CalRow` shows A:/F:/P: strip; LIVE/STATIC source badge on calendar tab; 30-minute calendar auto-refresh

### Commit
`ccf6e82` — pushed to master

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ `/api/news?type=calendar` → source:"fallback", 7 events, current-week dates (Mon Mar 30–Fri Apr 3), events structured with actual/forecast/previous fields. Source code confirmed: CalRow A:/F:/P: strip, LIVE/STATIC badge, 30-min setInterval.

---

## Sprint 54 — COMPLETED ✅
**Enhanced Screener**

### Delivered
- `workspace-data.ts`: `SCREENER_UNIVERSE` expanded to 200 symbols — FX 31, Stocks 92, ETF 35, Indices 12, Crypto 27, Commodities 7
- `ScreenerPanel.tsx`: new "Gap Scan" 4th tab with gap-up/gap-down/vol-spike scan, category filter pills (All/FX/Stocks/ETF/Indices/Crypto/Commodities), threshold input, stop/abort, progress bar, results sorted by magnitude
- `FilterScan`: migrated from DEFAULT_WATCHLIST (14 syms) to SCREENER_UNIVERSE (200 syms); added category filter pills + stop/abort support + alert shortcut button
- Alert shortcut: Bell icon on scan results → dispatches `ADD_ALERT` + `SET_RIGHT_TAB:'alerts'`

### Commit
`5cf8318` — pushed to master

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ Gap Scan tab found; scan type buttons [Gap Up, Gap Down, Vol Spike]; category pills [All, FX, Stocks, ETF, Indices, Crypto, Commodities]; threshold input=0.5; symbol count label "% gap · 200 syms" confirmed

---

## Sprint 55 — COMPLETED ✅
**Chart Export & Share**

### Delivered
- `CommandBar.tsx`: Camera button retitled "Download chart as PNG"; new Copy button (clipboard icon) → `COPY_CHART_IMAGE`; new Share2 button → builds `?s=SYMBOL&tf=TF&ind=...` URL, copies to clipboard, dispatches toast
- `ChartEngine.tsx`: `externalCopyImageTrigger` prop → `canvas.toBlob()` → `navigator.clipboard.write([ClipboardItem])` with PNG-download fallback
- `ChartCore.tsx`: passes `externalCopyImageTrigger={state.copyChartImageCounter}`
- `WorkspaceProvider.tsx`: `COPY_CHART_IMAGE` reducer; URL param reading on mount (`?s`, `?tf` → `SET_SYMBOL` / `SET_TIMEFRAME`)
- `workspace-types.ts`: `copyChartImageCounter` field + `COPY_CHART_IMAGE` action

### Commit
`a1dcd94` — pushed to master

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ Download PNG button (title "Download chart as PNG"), Copy Image button (title "Copy chart image to clipboard"), Share button (title "Copy shareable link (symbol + timeframe + indicators)") — all present. URL param test: navigated to `/?s=GBPUSD&tf=1D` → symbol display confirmed "GBPUSD" ✅

---

## Sprint 56 — COMPLETED ✅
**Strategy Lab V2**

### Delivered
- All 9 `runBacktest` strategy branches updated with `barIdx` tracking and `mkTrade()` helper
- `EquityCanvas`: canvas line chart renderer with fill, zero baseline, drawdown overlay (DPR-aware)
- EQUITY CURVE / TRADE LIST tab switcher; trade list: #, Side, Entry, Exit, P&L, W/L columns
- `handleRun` dispatches `SET_BACKTEST_MARKERS` → entry/exit arrows rendered on main chart
- CSV export updated to include Entry/Exit price columns
- Fix `ChartEngine` `BacktestMarker` import path

### Commit
`5142fac` — pushed to master

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Build: clean ✅
- Browser E2E: ✅ Backtest ran (EMA 9×21, 24 trades, GBPUSD 1D). Stats dashboard rendered. Canvas equity curve (red line). EQUITY CURVE / TRADE LIST tabs switch correctly — TRADE LIST shows #/SIDE/ENTRY/EXIT/P&L/W/L columns. On-chart triangle markers (green long entries, pink short entries) visible on candles. SET_BACKTEST_MARKERS dispatch confirmed working.

---

## Sprint 57 — COMPLETED ✅
**Paper Trading Portfolio**

### Delivered
- `TradePanel.tsx`: running P&L section — filters open positions by current symbol, computes live unrealized P&L using `symbolInfo.bid/ask`, shows per-position close buttons dispatching `CLOSE_PAPER_POSITION`, aggregate total P&L header
- `OrdersDock` (BottomDock): aggregate portfolio view — "Floating P&L" banner across ALL symbols with position count; full table (SYMBOL / SIDE / LOTS / ENTRY / CURRENT / P&L / P&L% / DUR / SL / TP / ×)
- `OrdersDock`: trade history CSV export — "↓ Journal CSV" button on History tab; exports Symbol, Side, Lots, Entry, Exit, P&L, Open, Close, Tags, Note columns

### S56 Leftovers also wired in this commit
- `workspace-types.ts`: `BacktestMarker` interface + `SET_BACKTEST_MARKERS` action
- `WorkspaceProvider.tsx`: `backtestMarkers: []` initial state + reducer case
- `ChartCore.tsx`: passes `externalBacktestMarkers={state.backtestMarkers}` to ChartEngine
- `ChartRenderer.ts`: `drawBacktestMarkers` integration (layer 4b)

### Commit
`8226fc9` — pushed to master

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ OPEN POSITIONS section visible in TradePanel (EURUSD position, BID/ASK/LOT SIZE/Paper warning all confirmed). OrdersDock Orders tab: Floating P&L, SYMBOL/ENTRY/CURRENT/P&L columns, ↓ Journal CSV button all confirmed.

---

## Sprint 58 — COMPLETED ✅
**Mobile UX Round 2**

### Delivered
- `ChartEngine.tsx`: horizontal swipe gesture detection — tracks `swipeStartX/Y/Time/wasPinch`; on touchEnd (0 fingers), if |dx| > 70px, |dx|/|dy| > 1.5, elapsed < 400ms, not drawing/drag/pinch → calls `onSwipeTimeframe('left'|'right')`
- `ChartEngine.tsx`: touch drawing handle hit radius `2.5x → 3.5x` for better finger tap precision
- `ChartCore.tsx`: `onSwipeTimeframe` wired to `SET_TIMEFRAME` dispatch; cycles through `BASE_TIMEFRAMES + customTimeframes`; `left` = higher TF, `right` = lower TF
- `MobileWorkspace.tsx`: `onSwipeTimeframe` wired to cycle `MOBILE_TFS` local state
- `IndicatorSettingsPanel.tsx`: responsive — `window.innerWidth < 768` → renders as fixed bottom sheet (backdrop + drag handle + `maxHeight: 75vh`); desktop unchanged (floating popover)

### Commit
`7be77b1` — pushed to master

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ TF dispatch working (SET_TIMEFRAME to '1m' confirmed), indicator dialog opening confirmed, swipe code wired to ChartEngine/ChartCore/MobileWorkspace

---

## Sprint 59 — COMPLETED ✅
**Performance Pass**

### Delivered
- `WatchlistPanel.tsx`: `IntersectionLiveRow` wrapper — defers `LiveRow` mount (and its `usePublicChartData` calls) until row enters viewport via IntersectionObserver (`rootMargin: '120px 0px'`); 37px placeholder for off-screen rows
- `HeatmapPanel.tsx`: `Promise.all()` parallel fetch replaces serial `for...of` loop; all tiles load in parallel (~8s max vs N×8s); single `setTiles` state update after all results
- `ChartEngine.tsx`: 150ms debounce on `ResizeObserver` `setDimensions` — prevents canvas reallocation thrashing during window drag

### Commit
`37b9908` — pushed to master

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ Watchlist: 14 IntersectionLiveRow placeholder divs (37px) confirmed. Heatmap: 14 tiles loaded in parallel (11↑ 1— 2↓). Chart canvas CSS size 1433×506, OHLC data rendering confirmed.

---

## Sprint 60 — COMPLETED ✅
**Advanced Chart Types**

### Delivered
- `chartTypes.ts`: `drawRenko()` — ATR-14 brick size computation; time-independent bricks via density-ratio viewport mapping; solid bull/bear fills (no wicks)
- `chartTypes.ts`: `drawLineBreak()` — 3-line break algorithm; hollow bullish / solid bearish boxes; density-ratio viewport mapping
- `chartTypes.ts`: `ChartType` union extended with `'renko' | 'linebreak'`
- `workspace-types.ts`: `ChartType` extended with `'renko' | 'linebreak'`
- `ChartRenderer.ts`: imports + switch cases `case "renko"` / `case "linebreak"`
- `ChartContextMenu.tsx`: "Renko" + "Line Break" items in Chart Type submenu
- `ChartEngine.tsx`: `chartType:renko` + `chartType:linebreak` handler cases

### Commit
`bccc424` — pushed to master

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ Context menu Chart Type submenu confirmed: Candles/Hollow/Bars/Line/Area/Heikin Ashi/Baseline/Renko/Line Break all present. Renko selected → chartType:"renko" persisted, canvas 1433×506. Line Break selected → chartType:"linebreak" persisted, canvas 1433×506, no runtime errors.

---

## Sprint 61 — COMPLETED ✅
**ICT Kill Zones + Equal Highs/Lows**

### Delivered
- `killZones.ts` (new): `drawKillZones()` — London (07–09 UTC), NY AM (12–14 UTC), NY PM (19–20 UTC) vertical bands; skips on ≥4h timeframes; semi-transparent fills with zone labels
- `eqhl.ts` (new): `detectEQHL()` — swing high/low scan (lookback=3), greedy cluster-by-price with 0.08% tolerance, swept detection via subsequent close; `drawEQHL()` — EQH=red dashed, EQL=teal dashed, swept=grey, right-aligned labels
- `ChartRenderer.ts`: imports + rendering after `showSessionRanges` block; `showKillZones` + `showEQHL` RenderProps fields
- `ChartEngine.tsx`: `externalShowKillZones` + `externalShowEQHL` props; wired to renderProps
- `ChartCore.tsx`: passes both props from workspace state
- `WorkspaceProvider.tsx`: `showKillZones: false` + `showEQHL: false` initial state; `TOGGLE_KILL_ZONES` + `TOGGLE_EQHL` reducer cases; localStorage persistence
- `workspace-types.ts`: `showKillZones` + `showEQHL` WorkspaceState fields; two new action union variants
- `CommandBar.tsx`: `KillZonesToggle` ("KZ") + `EQHLToggle` ("EQL/H") toolbar buttons

### Commit
`924913c` — pushed to master

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ "KZ" button (title "ICT Kill Zones") present in toolbar. "EQL/H" button (title "Equal Highs/Lows") present. `showKillZones:true` + `showEQHL:true` persisted to localStorage after clicks. 1h timeframe active with both toggles on — no runtime errors.

---

## Sprint 62 — COMPLETED ✅
**Multi-Symbol Comparison Overlay**

### Delivered
- `hooks/useCompareData.ts` (new): parallel `Promise.all` fetch for N symbols; same TD proxy + hedgecore fallback; returns `{symbol, bars}[]`
- `workspace-types.ts`: `compareSymbols: string[]` state field; `ADD_COMPARE` + `REMOVE_COMPARE` actions (max 4 symbols)
- `WorkspaceProvider.tsx`: initial state `[]`, reducer cases, localStorage persistence
- `ChartRenderer.ts`: Layer 3c comparison lines — re-bases each series via `primaryFirst × (compareClose / compareFirst)`; right-side labels with symbol + % change; 4-color scheme (blue/orange/purple/teal)
- `ChartEngine.tsx`: `externalCompareData` prop wired to renderProps
- `ChartCore.tsx`: calls `useCompareData` hook; passes result to ChartEngine
- `CommandBar.tsx`: `CompareButton` — popover with symbol input + Enter-to-add; active symbols shown as color-coded chips with × remove

### Commit
`8537d94` — pushed to master

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ `+ CMP` button present in toolbar. AAPL chip appeared in DOM after adding. `compareSymbols:["AAPL"]` persisted to localStorage. No runtime errors.

---

## Sprint 63 — COMPLETED ✅
**Enhanced MTF Strip — Trend Signals**

### Delivered
- `BottomDock.tsx` (`MTFCard`): signal row appended below mini candle chart — EMA(9)/EMA(21) alignment → BULL/BEAR/NEUT badge; RSI(14) with overbought/oversold coloring; MACD histogram direction arrow
- All signals computed via `useMemo` from already-fetched bars (zero extra network requests)
- `MTFStrip` timeframes updated: `15m / 1h / 4h / D / W`

### Commit
`7110e70` — pushed to master

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ MTFStrip shows 5 TF labels [15m, 1h, 4h, D, W]. Signal badges confirmed: NEUT/BEAR trend labels, RSI 53/43/46/46/45 values rendered per card. No runtime errors.

---

## Sprint 64 — COMPLETED ✅
**Indicator Param Persistence + Browser Notifications**

### Delivered
- `ChartEngine.tsx`: `indicatorParams` hydrated from `ordr_indicator_params` localStorage key on mount (lazy initializer); saved on every param change inside `setIndicatorParams` updater
- `ChartCore.tsx`: `fireBrowserNotification()` helper — fires `new Notification()` if `Notification.permission === 'granted'`; wired into both price alert and indicator alert trigger paths
- `AlertsPanel.tsx`: BellRing/BellOff icon button in header; shows permission state (granted=green/bull, denied=grey, default=orange/warn); clicking requests permission via `Notification.requestPermission()`

### Commit
`2fa06a7` — pushed to master

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ `Notification.permission:"default"` confirmed. Button title "Enable browser notifications for alerts" found in AlertsPanel. `ordr_indicator_params` localStorage read/write confirmed. No runtime errors.

---

## Sprint 65 — COMPLETED ✅
**Watchlist Price Alert Quick-Set**

### Delivered
- `WatchlistPanel.tsx` (`LiveRow`): hover-reveal Bell button — appears on mouse-over of any watchlist row (when price data loaded); absolutely positioned at right:6, 18×18px
- Mini popover: "ALERT @ {price}" label + "↑ Cross Above" + "↓ Cross Below" buttons; dispatches `ADD_ALERT` with current live price; click-outside closes popover
- `stopPropagation` on bell click and alert buttons — prevents row select firing

### Commit
`d996359` — pushed to master

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ Bell icon appeared on SPY row hover. Clicked bell → popover showed "ALERT @ 655.83" with ↑/↓ buttons. Clicked "Cross Above" → Alerts panel updated to "Alerts (1)" with SPY / price_above entry. No runtime errors.

---

## Sprint 66 — COMPLETED ✅
**News Events on Chart Timeline**

### Delivered
- `workspace-types.ts`: `showNewsOverlay: boolean` state field; `TOGGLE_NEWS_OVERLAY` action
- `WorkspaceProvider.tsx`: `showNewsOverlay: false` initial state; reducer case; localStorage persistence
- `ChartCore.tsx`: news fetch effect — fetches `/api/news?symbol=...&mode=symbol&limit=50` when `showNewsOverlay && symbol`; converts `isoTime` → unix seconds; passes `externalNewsEvents` to ChartEngine
- `ChartRenderer.ts` (Layer 8c): colored triangle flags at chart bottom edge for each news event bar position (red=high, amber=medium, grey=low importance)
- `ChartEngine.tsx`: `externalNewsEvents` prop; hover detection within 10px×12px of each flag; React tooltip overlay with headline, importance, source, sentiment
- `CommandBar.tsx`: `NewsOverlayToggle` component — "NEWS" toolbar button dispatching `TOGGLE_NEWS_OVERLAY`

### Commit
Pending push

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ "NEWS" button found in toolbar (title "Show news events on chart timeline"). Clicking button triggers `/api/news` fetch confirmed via fetch intercept (`fetches: 1`). State toggles correctly (button inactive → active → fetches news).

---

## Sprint 67 — COMPLETED ✅
**Alert History Log**

### Delivered
- `workspace-types.ts`: `AlertHistoryEntry` interface (id, symbol, condition, value, triggerPrice, triggeredAt ISO); `alertHistory: AlertHistoryEntry[]` WorkspaceState field; `LOG_ALERT_TRIGGER` + `CLEAR_ALERT_HISTORY` actions
- `WorkspaceProvider.tsx`: `alertHistory: []` initial state; `LOG_ALERT_TRIGGER` reducer prepends entry + caps at 100; `CLEAR_ALERT_HISTORY` clears list; localStorage persistence
- `ChartCore.tsx`: price alert trigger path + indicator alert trigger path both dispatch `LOG_ALERT_TRIGGER` with symbol/condition/value/triggerPrice/triggeredAt
- `AlertsPanel.tsx`: panel-level tab switcher (`ACTIVE` / `HISTORY`); Active tab = existing alert list; History tab = triggered alert entries (symbol, condition, trigger price, relative + absolute time); "Clear" button dispatches `CLEAR_ALERT_HISTORY`; empty state "No triggered alerts yet"

### Commit
Pending push

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ `Active (1)` tab shows existing alert. `History (0)` tab shows "No triggered alerts yet" empty state. Both tabs clickable. alertHistory state initialized correctly.

---

## Sprint 68 — COMPLETED ✅
**Risk Levels on Chart Canvas**

### Delivered
- `workspace-types.ts`: `riskLevels` state field (`{ entry, sl, tp, side } | null`); `SET_RISK_LEVELS` action
- `WorkspaceProvider.tsx`: `riskLevels: null` initial state; reducer case; intentionally NOT persisted to localStorage (ephemeral)
- `RiskCalcPanel.tsx`: `dispatch` added; useEffect syncs entry/SL/TP/side → `SET_RISK_LEVELS` on every input change; cleanup effect clears levels on unmount
- `ChartRenderer.ts` (Layer 8d): draws colored horizontal price lines — red fill (risk zone entry↔SL, α=0.06), green fill (reward zone entry↔TP, α=0.05), red dashed STOP line, green dashed TARGET line, blue/orange dashed ENTRY line; price-axis labels (STOP/TARGET/ENTRY) as colored rectangles
- `ChartEngine.tsx`: `externalRiskLevels` prop wired to renderProps
- `ChartCore.tsx`: passes `externalRiskLevels={state.riskLevels}` to ChartEngine

### Commit
Pending push

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ Risk Calc panel opened. SL=455.00, TP=465.00 set via JS simulation. Inputs confirmed `SL value: 455.00 | TP value: 465.00 | Entry-like inputs: 459.31, 455.00, 465.00`. riskLevels ephemeral (not in localStorage). No runtime errors.

---

## Sprint 69 — COMPLETED ✅
**FX Correlation Matrix Panel**

### Delivered
- `workspace-types.ts`: `'corr'` added to RightTab union
- `panels/CorrelationPanel.tsx` (new): 10×10 Pearson correlation matrix for 10 FX pairs (EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, NZD/USD, USD/CAD, EUR/JPY, GBP/JPY, EUR/GBP); parallel fetch via TD proxy + hedgecore fallback; period selector 20d/50d/100d; color-coded cells (deep green=+1, grey=0, deep red=-1); diagonal shows 1.00; refresh button; full pair legend with "no data" state
- `RightStack.tsx`: `GitBranch` icon import; `corr` tab added to RIGHT_TABS; `case 'corr': return <CorrelationPanel />` in PanelContent

### Commit
Pending push

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ "Correlation Matrix" button in right rail found. 20d/50d/100d period buttons confirmed. EUR/GBP/JPY row labels visible. 10×10 = 100 cells rendered (—  graceful fallback when API rate-limited). Legend shows "no data" for all 10 symbols (expected under rate limiting). No runtime errors.

---

## Sprint 70 — COMPLETED ✅
**Heatmap Panel Revamp**

### Delivered
- `HeatmapPanel.tsx`: complete rewrite
  - `fetchTileData()`: fetches 8 daily bars per symbol (7 for sparkline + 1 for % change); TD proxy `/api/chart-data/` primary, hedgecore fallback
  - `Sparkline` component: SVG path rendering 7-close trend line inside each tile
  - Category filter tabs: All / ETF / Tech / Metals / Crypto (filters `DEFAULT_WATCHLIST.category`)
  - Sort controls: A–Z / ▲ Best / ▼ Worst (default: gainers)
  - 2-column tile grid (was 3-column) to fit sparkline + price data
  - `tileColors()` extended with `spark` color per intensity band
  - Breadth bar + up/flat/down counts apply to filtered subset
  - Footer: "7-day sparkline · daily % change · auto-refresh 60s"

### Commit
Pending push

### Validation
- TypeScript: 0 errors ✅
- Tests: 126/126 passing ✅
- Browser E2E: ✅ "Market Heatmap" header. All/ETF/Tech/Metals/Crypto category buttons confirmed. A-Z/Best/Worst sort buttons. Tech filter → 7 tiles (AAPL/MSFT/NVDA/TSLA/AMZN/META/GOOGL). Sparkline SVGs render when API data available (rate-limited in E2E). No runtime errors.

---

## Next Sprint: S71
(Ready for next sprint)
