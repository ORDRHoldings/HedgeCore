# ORDR Market — Constitution

## Execution Mode

**AUTONOMOUS EXECUTION**: Once the user approves a plan or gives a task instruction, execute ALL steps without pausing for confirmation. Do NOT ask "Should I proceed?", "Can I continue?", or any mid-task confirmations. Work silently until complete, then report what was accomplished. The only exception is destructive operations on production data.

**NO VERBOSE OUTPUT**: Skip explanatory commentary during execution. No "Let me now...", "Next I'll...". Just do the work. Output only the final summary.

**PARALLEL EXECUTION**: Always launch independent tasks in parallel using the Agent tool. Never serialize work that can be parallelized.

## Project Identity

- **Product**: ORDR Market — Professional charting, backtesting & algorithmic trading platform
- **Stack**: Next.js 15.5 (App Router), React 19, TypeScript 5.9 — frontend-only
- **Deploy**: Vercel (auto-deploy on master push)
- **Data**: Twelve Data REST/WebSocket via Next.js API proxy (`/api/chart-data/[symbol]`)
- **Fallback**: hedgecore.onrender.com (`/v1/public/chart-data/{symbol}`)
- **Stage**: Active development — Sprint-based delivery

## Architecture

```
src/
├── app/                        # Next.js App Router pages + API routes
│   └── api/
│       ├── chart-data/[symbol] # Twelve Data REST proxy (server-side key)
│       ├── ai-analysis/        # AI indicator analysis
│       └── news/               # Alpha Vantage news + mock fallback
├── components/
│   ├── chart/
│   │   ├── core/               # axis, crosshair, interactions, zoom, undo/redo
│   │   ├── detection/          # FVG, OB, market-structure, divergence, patterns
│   │   ├── indicators/         # ~90 indicator modules
│   │   └── renderers/          # canvas rendering (candles, overlays, drawings)
│   └── workspace/
│       ├── panels/             # 15 side panels
│       └── WorkspaceProvider   # central state (useReducer + Context)
├── hooks/
│   ├── usePublicChartData.ts   # primary: /api/chart-data, fallback: hedgecore
│   └── useMarketWebSocket.ts   # Twelve Data WebSocket
└── lib/
    ├── strategy/               # backtest engine, sandbox, transpiler, worker
    └── theme/                  # presets, CSS variable sync
```

## Immutable Rules

1. **Data URLs**: Always use `/api/chart-data/[symbol]` (TD proxy) as primary. Hedgecore fallback path is `/v1/public/chart-data/` — NEVER `/api/v1/public/chart-data/`.
2. **State management**: All workspace state through `WorkspaceProvider` / `useWorkspace()`. Never raw localStorage outside of the provider.
3. **Styling**: Inline styles with CSS variables from `globals.css`. Design tokens from `src/components/workspace/tokens.ts` (`T.*`). No className-heavy Tailwind.
4. **API calls**: Always through `dashboardFetch` or the established fetch patterns. Never raw `fetch` with hardcoded URLs.
5. **Canvas**: All chart rendering in `src/components/chart/renderers/`. No canvas drawing logic in React components.
6. **No ML / broker execution**: Platform is a charting + backtesting tool only.

## Build & Commands

```bash
# Dev server
npm run dev

# Type check
npm run type-check

# Build
npm run build

# Tests (unit)
npm test

# E2E — run browser tests after each sprint (see Sprint Validation below)
npx playwright test
```

## Sprint Validation Contract (MANDATORY)

**Every sprint MUST be validated before it is marked complete:**

1. `npm run build` — clean build, zero TypeScript errors
2. `npm test` — all unit tests pass
3. **Browser E2E** — Claude autonomously performs browser verification using Chrome browser automation tools (`mcp__claude-in-chrome__*`). Claude does NOT ask the user to confirm or wait for user input. Claude opens `http://localhost:3000`, tests every deliverable from the sprint's "Delivered" list, records evidence (screenshots or console/network observations), and marks the sprint complete. The user only intervenes if something is broken.
4. State files updated: `CURRENT_STATE.md`, `CURRENT_SPRINT.md`, `CHANGELOG_AI.md`
5. Commit pushed to master

**No sprint is complete without autonomous browser E2E verification. "It compiles" is not done. Claude must verify in the browser, not the user.**

---

## Sprint Roadmap (S51 – S60)

> Current sprint: see `.claude/state/CURRENT_SPRINT.md`

| Sprint | Name | Type | Key Deliverables |
|--------|------|------|-----------------|
| **S51** | Data Layer Fixes | Bug + Polish | Fix HeatmapPanel URL bug (`/api/v1/` → `/v1/`); fix `usePublicChartData` fallback URL; migrate ScreenerPanel + BottomDock to TD proxy `/api/chart-data/`; refresh SYMBOL_DATA static prices |
| **S52** | Multi-Chart Layout | Feature | Split 2-up / 2×2 chart grid; per-pane independent symbol + timeframe; crosshair sync toggle across panes |
| **S53** | Live Economic Calendar | Feature | Replace hardcoded static calendar in `NewsPanel`; live data via Twelve Data economic events or equivalent; auto-refresh |
| **S54** | Enhanced Screener | Feature | Expand symbol universe to 200+ symbols; add gap-up/gap-down + volume-spike scan conditions; alert-from-scan-result shortcut |
| **S55** | Chart Export & Share | Feature | Export chart canvas as PNG; copy to clipboard; shareable URL encoding symbol + TF + active indicators as query params |
| **S56** | Strategy Lab V2 | Feature | Equity curve canvas renderer in backtest results; trade list with on-chart entry/exit markers; metrics dashboard (Sharpe, max DD, win rate, profit factor) |
| **S57** | Paper Trading Portfolio | Feature | Running P&L display in TradingPanel; aggregate portfolio view (all open positions); trade history export to CSV |
| **S58** | Mobile UX Round 2 | Polish | Swipe gesture for timeframe change; bottom sheet panels for indicator settings; improved touch drawing accuracy |
| **S59** | Performance Pass | Optimization | Virtualize watchlist rows (only render visible); batch-fetch heatmap (single multi-symbol request); canvas render debounce on resize |
| **S60** | Advanced Chart Types | Feature | Renko + Line Break chart renderers; extend chart type switcher in toolbar |

### Sprint Definition of Done

Each sprint is **DONE** when:
- [ ] All deliverables implemented
- [ ] `npm run build` clean
- [ ] `npm test` passing
- [ ] **Browser E2E test**: every deliverable manually verified working in Chrome — documented in sprint state
- [ ] `CURRENT_STATE.md` updated
- [ ] `CURRENT_SPRINT.md` set to next sprint
- [ ] `CHANGELOG_AI.md` entry added
- [ ] Committed and pushed to master

---

## State Files

| File | Purpose |
|------|---------|
| `.claude/state/CURRENT_STATE.md` | Build status, completed sprints, active risks |
| `.claude/state/CURRENT_SPRINT.md` | Active sprint deliverables + commit |
| `.claude/state/CHANGELOG_AI.md` | Per-sprint change log |
| `.claude/state/OPEN_RISKS.md` | Known risks and blockers |

## Quick Reference

| What | Where |
|------|-------|
| Workspace state shape | `src/components/workspace/workspace-types.ts` |
| Design tokens | `src/components/workspace/tokens.ts` |
| Symbol / watchlist data | `src/components/workspace/workspace-data.ts` |
| Indicator → chart key map | `WorkspaceProvider.tsx` (`INDICATOR_TO_CHART_KEY`) |
| Panel components | `src/components/workspace/panels/` |
| Chart renderers | `src/components/chart/renderers/` |
| Detection engines | `src/components/chart/detection/` |
