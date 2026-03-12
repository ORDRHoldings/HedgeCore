# ORDR Market

Professional charting, backtesting & algorithmic trading platform.

## Features

- **77 Technical Indicators** — MA variants, Bollinger Bands, RSI, MACD, Ichimoku, Fibonacci, Gann, Elliott Wave, and more
- **55 Drawing Tools** — Trendlines, channels, pitchforks, harmonic patterns, Fibonacci tools, shapes, annotations
- **TradingView-Parity Chart Engine** — Custom Canvas 2D, 60fps, magnetic snap, shift-constrain, breakout detection
- **Multi-Asset** — FX Majors/Crosses/EM, Crypto, Indices, US Equities, Commodities
- **10 Timeframes** — 1m through Monthly

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment:
   ```bash
   cp .env.example .env.local
   # Edit .env.local and set NEXT_PUBLIC_API_URL
   ```

3. Run development server:
   ```bash
   npm run dev
   ```

4. Open http://localhost:3000

## Build

```bash
npm run build
npm start
```

## Data Source

Chart data is served from the HedgeCore backend API via the public endpoint:
`GET /v1/public/chart-data/{symbol}?interval={interval}&limit={limit}`

Set `NEXT_PUBLIC_API_URL` to point to your HedgeCore backend deployment.

## Architecture

- **Framework**: Next.js 15.5, React 19, TypeScript 5.9
- **Chart Engine**: Custom Canvas 2D (zero external charting dependencies)
- **Indicators**: All calculations in `src/components/chart/indicators/`
- **Renderers**: Canvas drawing functions in `src/components/chart/renderers/`
- **Drawing Tools**: Full suite in `src/components/chart/renderers/drawings.ts` and `drawingTools.ts`
