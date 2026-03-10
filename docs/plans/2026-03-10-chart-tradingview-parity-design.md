# ORDR Chart Platform — TradingView 1:1 Parity + Beyond

## Date: 2026-03-10

## Context
Current ORDR chart has basic candlesticks, zoom/pan with momentum, 23 indicators, toolbar with dropdowns, and 4 drawing tools. User demands exact TradingView feature parity, then innovative additions that surpass it.

## Gap Analysis Summary
- Missing 6 chart types (line, area, bars, hollow candles, Heikin Ashi, baseline)
- No current price line or OHLC legend overlay
- No left drawing toolbar (TradingView signature)
- No symbol search modal (just dropdown)
- No right-click context menu
- No keyboard shortcuts
- No axis drag-to-scale
- No indicator search/settings dialog
- No screenshot export, fullscreen, bar countdown, market status
- No undo/redo for drawings
- No crosshair modes or magnet snap
- No price scale options (log, percentage)

## Architecture

### 8 Workstreams

#### W1: Chart Types Engine
**New file**: `renderers/chartTypes.ts`
- `drawLineChart(ctx, bars, layout, viewport, color)` — close-price line
- `drawAreaChart(ctx, bars, layout, viewport, color, fill)` — filled area below line
- `drawBarChart(ctx, bars, layout, viewport)` — OHLC bars (no body fill)
- `drawHollowCandles(ctx, bars, layout, viewport)` — outline-only candles
- `drawHeikinAshi(ctx, bars, layout, viewport)` — computed HA bars
- `drawBaseline(ctx, bars, layout, viewport, baseline)` — above/below reference

**New file**: `core/heikinAshi.ts`
- `computeHeikinAshi(bars: Bar[]): Bar[]` — transform OHLC to HA

**Modify**: `ChartEngine.tsx` — chart type state + render dispatch

#### W2: Current Price Line + OHLC Legend
**Modify**: `renderers/candlestick.ts` or new `renderers/priceLine.ts`
- Dashed horizontal line at last close price
- Animated price label on right axis (pulsing background)
- Extends full width of chart

**Modify**: `core/crosshair.ts` or new section in ChartEngine render
- OHLC legend: top-left overlay showing O/H/L/C/V/Change
- Shows hovered bar data (or last bar if no hover)
- Color-coded (green if close>open, red otherwise)

#### W3: Left Drawing Toolbar
**New file**: `ChartLeftToolbar.tsx`
- Vertical icon strip (40px wide) on left side of chart
- Tools: Cursor, Crosshair, Trendline, Horizontal, Ray, Fibonacci, Rectangle, Text, Measure, Eraser
- Active tool highlighted
- Tooltip on hover
- Collapsible sub-menus for tool variants

**Modify**: `ChartEngine.tsx` — layout adjustment (chart area shifts right by toolbar width)

#### W4: Symbol Search Modal + Right-Click Menu
**New file**: `ChartSymbolSearch.tsx`
- Full-screen modal with search input
- Asset categories: FX, Crypto, Indices, Commodities
- Recent symbols (localStorage)
- Fuzzy match on symbol + display name
- Keyboard navigation (arrow keys + enter)

**New file**: `ChartContextMenu.tsx`
- Right-click context menu (absolute positioned)
- Items: Add Indicator, Drawing Tools submenu, Reset Chart, Auto-fit, Screenshot, Settings, Fullscreen
- Keyboard shortcut hints on right side
- Closes on click outside

#### W5: Keyboard Shortcuts + Axis Drag-to-Scale
**Modify**: `ChartEngine.tsx`
- Keyboard handler: arrows (pan), +/- (zoom), Del (delete drawing), Esc (cancel mode), F11 (fullscreen), Ctrl+Z/Y (undo/redo)

**Modify**: `core/zoom.ts`
- `handlePriceAxisDrag(state, deltaY, chartHeight, priceRange)` — vertical scale
- `handleTimeAxisDrag(state, deltaX, chartWidth, barCount)` — horizontal scale

**Modify**: `ChartEngine.tsx` — mousedown zone detection (chart vs price axis vs time axis)

#### W6: Indicator Search + Settings Dialog
**New file**: `ChartIndicatorDialog.tsx`
- Modal with search bar + category tabs
- Categories: Trend, Oscillators, Volume, Volatility, Smart Money
- Each indicator: name, short description, preview icon
- Click to add; already-active shown with checkmark
- Settings sub-dialog: period, color, line style, line width

#### W7: Screenshot + Fullscreen + Bar Countdown + Market Status
**Modify**: `ChartEngine.tsx`
- Screenshot: `canvas.toBlob()` → download as PNG
- Fullscreen: `document.documentElement.requestFullscreen()`
- Bar countdown: compute time to next bar close, render in header
- Market status: FX markets 24/5, show session (London/NY/Tokyo/Sydney)

#### W8: Advanced Features (Beyond TradingView)
**New file**: `renderers/sessions.ts`
- Session highlighting: color-coded vertical bands for London/NY/Tokyo/Sydney
- Configurable toggle

**New file**: `renderers/patterns.ts`
- Auto-detect: Head & Shoulders, Double Top/Bottom, Triangles, Wedges, Flags
- Render annotations with confidence score

**Modify**: Drawing system
- Undo/redo stack (array of drawing states)
- Delete individual drawing (click to select, Del to remove)
- Crosshair modes: cross, dot, none
- Magnet snap: snap to nearest OHLC value (not just bar index)
- Price scale: linear, log, percentage toggle

## Execution Order
W1 (chart types) + W2 (price line + OHLC) + W3 (left toolbar) — parallel
W4 (search + context menu) + W5 (shortcuts + axis drag) — parallel, after W3
W6 (indicator dialog) + W7 (screenshot + fullscreen + countdown) — parallel
W8 (advanced) — after all above

## File Count
~10 new files, ~8 modified files
