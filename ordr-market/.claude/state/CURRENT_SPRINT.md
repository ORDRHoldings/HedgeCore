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

## Next Sprint: S58 — Mobile UX Round 2
Swipe gesture for timeframe change; bottom sheet panels for indicator settings; improved touch drawing accuracy
