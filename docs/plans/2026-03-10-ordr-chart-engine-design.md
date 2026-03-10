# ORDR Chart Engine — Design

## Goal
Build a proprietary Canvas 2D charting platform that surpasses TradingView for institutional FX. Hedge-native: forward curves, position overlays, carry bands, 30-level intelligence nodes — all on the chart. Zero external charting dependencies.

## Why Better Than TradingView
- Forward curve overlay on price chart (1M-12M lines)
- Carry visualization (shaded bands between spot and forward)
- Position/hedge markers native on chart
- Policy compliance zones (decision corridors)
- Auto-detected Support/Resistance, FVG, Trendlines (smart money)
- IBKR direct execution (no Broker API license)
- 30-level intelligence graph drill-down from any data point
- $0 license cost, 100% owned

## Architecture

### Data Flow
```
IBKR Gateway (4001) ──→ Backend WebSocket proxy ──→ /ws/market-stream
                                                          ↓
TwelveData REST ──→ /v1/market/fx/rates          useMarketStream() hook
                                                          ↓
IBKR reqHistoricalData ──→ /v1/chart-data         Canvas Chart Engine
```

### Chart Engine Components
1. **ChartCanvas** — Main canvas element, handles render loop (requestAnimationFrame)
2. **CandlestickRenderer** — OHLC candles with wick/body, bullish/bearish colors
3. **TimeAxis** — X-axis with smart label spacing (minutes→hours→days→months)
4. **PriceAxis** — Y-axis with auto-scale, crosshair price label
5. **CrosshairSystem** — Vertical + horizontal lines, snap to candle, OHLCV tooltip
6. **ZoomPanController** — Mouse wheel zoom, click-drag pan, pinch zoom (touch)
7. **VolumePane** — Sub-chart below main chart, volume bars colored by direction
8. **IndicatorEngine** — Computed in Web Worker, results cached
9. **DrawingLayer** — Trendlines, horizontals, fibonacci, rectangles (persistent)
10. **OverlayLayer** — Forward curves, position markers, policy zones

### Indicators (Phase 1)
**Overlays (on price chart):**
- SMA (Simple Moving Average) — configurable period
- EMA (Exponential Moving Average) — configurable period
- Bollinger Bands (20,2) — upper/mid/lower
- Keltner Channel — EMA(20) center + ATR(10) × 1.5 bands
- Forward Curve Lines — 1M/3M/6M/12M from live data

**Auto-Detection (on price chart):**
- Support/Resistance — Pivot high/low clustering, strength by touch count
- Fair Value Gaps (FVG) — 3-candle imbalance zones, highlighted rectangles
- Auto Trendlines — Swing high/low connections, angle + touch validation

**Sub-pane indicators:**
- RSI (14) — with 30/70 levels
- MACD (12,26,9) — signal line + histogram
- Volume — colored by candle direction

### Drawing Tools
- Trendline (click two points)
- Horizontal line (click one price)
- Fibonacci retracement (click two points)
- Rectangle zone (click two corners)
- All drawings persist in localStorage per pair

### Timeframes
1m, 5m, 15m, 1h, 4h, 1D, 1W, 1M

### Backend: Chart Data API
New endpoint: `GET /v1/chart-data/{symbol}?interval=1h&limit=500`
- Returns OHLCV from IBKR `reqHistoricalData` (primary) or TwelveData `/time_series` (fallback)
- Cached in memory for 60s per symbol+interval
- WebSocket: `/ws/market-stream` pushes real-time tick updates

### Frontend Files
- `frontend/src/components/chart/ChartEngine.tsx` — Main chart component
- `frontend/src/components/chart/renderers/candlestick.ts` — Candle rendering
- `frontend/src/components/chart/renderers/volume.ts` — Volume pane
- `frontend/src/components/chart/renderers/indicators.ts` — Overlay indicators
- `frontend/src/components/chart/renderers/drawings.ts` — Drawing tools
- `frontend/src/components/chart/renderers/overlays.ts` — FWD curves, positions
- `frontend/src/components/chart/core/axis.ts` — Time + Price axes
- `frontend/src/components/chart/core/crosshair.ts` — Crosshair system
- `frontend/src/components/chart/core/zoom.ts` — Zoom/pan controller
- `frontend/src/components/chart/core/data.ts` — Data management + caching
- `frontend/src/components/chart/indicators/sma.ts` — SMA computation
- `frontend/src/components/chart/indicators/ema.ts` — EMA computation
- `frontend/src/components/chart/indicators/rsi.ts` — RSI computation
- `frontend/src/components/chart/indicators/macd.ts` — MACD computation
- `frontend/src/components/chart/indicators/bollinger.ts` — Bollinger Bands
- `frontend/src/components/chart/indicators/keltner.ts` — Keltner Channel
- `frontend/src/components/chart/indicators/atr.ts` — ATR (used by Keltner)
- `frontend/src/components/chart/detection/support-resistance.ts` — Auto S/R
- `frontend/src/components/chart/detection/fvg.ts` — Fair Value Gap detection
- `frontend/src/components/chart/detection/trendlines.ts` — Auto trendlines
- `frontend/src/hooks/useChartData.ts` — Data fetch hook
- `frontend/src/hooks/useMarketStream.ts` — WebSocket real-time hook
- `backend/app/api/routes/v1_chart_data.py` — Chart data endpoint
- `backend/app/api/routes/ws_market_stream.py` — WebSocket endpoint

### Performance Targets
- 60fps render with 2000 visible candles
- <16ms per frame (Canvas 2D)
- Indicator computation off main thread (Web Worker)
- Smooth zoom/pan with no jank
