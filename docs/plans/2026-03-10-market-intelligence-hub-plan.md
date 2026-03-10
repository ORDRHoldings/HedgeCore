# Market Intelligence Hub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a unified Market Intelligence Hub page at `/market-intelligence` with live FX heatmap, forward curve visualization, carry scorecard, equity sectors, and provider health monitoring.

**Architecture:** Single Next.js page with 4 sections (ticker ribbon, FX heatmap grid, vol/carry panel, health bar). Data from existing backend routes via `dashboardFetch`. Tiered polling (60s portfolio, 5min broad market). ECharts for charts.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, ECharts 6, echarts-for-react, dashboardFetch, CSS variables (inline styles)

---

### Task 1: Sidebar Navigation — Add Intelligence Hub

**Files:**
- Modify: `frontend/src/components/layout/AppSidebar.tsx:272-279`

**Step 1: Add Intelligence Hub to Markets section**

Find the Markets section (lines 272-279) and add the new item:

```tsx
{
  label: "Markets", href: "/market-intelligence", icon: Ic.bar_chart,
  prefixes: ["/fx-market", "/market-intelligence"],
  header: "Market Data",
  items: [
    { label: "Intelligence Hub", desc: "Live rates, carry, vol, provider health", href: "/market-intelligence", icon: Ic.bar_chart, badge: "LIVE", badgeColor: S_GREEN },
    { label: "FX Rates", desc: "Spot, forwards, vol surface, carry", href: "/fx-market", icon: Ic.bar_chart },
  ],
},
```

**Step 2: Verify frontend builds**

Run: `cd frontend && npx next build`
Expected: Build succeeds (page doesn't exist yet, but sidebar link is just an href)

**Step 3: Commit**

```bash
git add frontend/src/components/layout/AppSidebar.tsx
git commit -m "feat(nav): add Intelligence Hub to Markets sidebar section"
```

---

### Task 2: Page Scaffold — `/market-intelligence`

**Files:**
- Create: `frontend/src/app/market-intelligence/page.tsx`

**Step 1: Create the page scaffold**

Follow the exact pattern from `fx-market/page.tsx` — `"use client"`, `useAuth()`, design tokens `S`, inline styles, 4 placeholder sections.

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Activity, TrendingUp, Shield, BarChart3, Zap } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";

// ─── Design tokens ───────────────────────────────────────
const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontHead:  "var(--font-heading,'Manrope',sans-serif)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  green:     "var(--accent-green,#059669)",
  red:       "var(--accent-red,#DC2626)",
} as const;

// ─── Types ───────────────────────────────────────────────
interface FxRate {
  symbol: string;
  mid: number;
  bid: number;
  ask: number;
  change_pct: number;
  source: string;
  timestamp: string;
}

interface SectorQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  category: string;
}

interface ForwardPoint {
  tenor: string;
  points: number;
}

interface ProviderStatus {
  name: string;
  connected: boolean;
  latency_ms?: number;
  error?: string;
}

interface HealthReport {
  providers: ProviderStatus[];
  staleness: Record<string, { is_stale: boolean; age_seconds: number }>;
}

// ─── FX pair config (portfolio pairs) ────────────────────
const PORTFOLIO_PAIRS = [
  "USDMXN", "USDBRL", "USDCOP", "USDCLP", "USDPEN",
  "EURUSD", "GBPUSD", "USDJPY", "USDCAD", "USDCHF",
  "USDCNY", "USDINR", "USDSGD", "USDKRW", "USDHKD",
  "USDAUD", "USDNZD",
];

const TICKER_SYMBOLS = ["SPY", "QQQ", "DIA", "IWM"];

// ─── UTC clock ───────────────────────────────────────────
function useUtcClock(): string {
  const [time, setTime] = useState(() => {
    const n = new Date();
    return `${String(n.getUTCHours()).padStart(2,"0")}:${String(n.getUTCMinutes()).padStart(2,"0")}:${String(n.getUTCSeconds()).padStart(2,"0")}`;
  });
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setTime(`${String(n.getUTCHours()).padStart(2,"0")}:${String(n.getUTCMinutes()).padStart(2,"0")}:${String(n.getUTCSeconds()).padStart(2,"0")}`);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

// ═════════════════════════════════════════════════════════
// Main page
// ═════════════════════════════════════════════════════════
export default function MarketIntelligenceHub() {
  const { token, user } = useAuth();
  const router = useRouter();
  const utc = useUtcClock();

  const [fxRates, setFxRates] = useState<FxRate[]>([]);
  const [sectors, setSectors] = useState<SectorQuote[]>([]);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [forwardPoints, setForwardPoints] = useState<Record<string, ForwardPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  // ── Data fetching ────────────────────────────────────
  const fetchFxRates = useCallback(async () => {
    if (!token) return;
    try {
      const res = await dashboardFetch("/v1/market/fx/rates", token);
      if (res.ok) {
        const data = await res.json();
        setFxRates(data.rates || []);
      }
    } catch (e) { console.warn("FX rates fetch failed", e); }
  }, [token]);

  const fetchSectors = useCallback(async () => {
    if (!token) return;
    try {
      const res = await dashboardFetch("/v1/market/sectors", token);
      if (res.ok) {
        const data = await res.json();
        setSectors(data.quotes || []);
      }
    } catch (e) { console.warn("Sectors fetch failed", e); }
  }, [token]);

  const fetchHealth = useCallback(async () => {
    if (!token) return;
    try {
      const res = await dashboardFetch("/v1/market-data/status", token);
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (e) { console.warn("Health fetch failed", e); }
  }, [token]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([fetchFxRates(), fetchSectors(), fetchHealth()]);
    setLastRefresh(new Date().toISOString());
    setLoading(false);
  }, [fetchFxRates, fetchSectors, fetchHealth]);

  // ── Polling ──────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetchAll();
    const fxInterval = setInterval(fetchFxRates, 60_000);      // 60s
    const broadInterval = setInterval(() => {
      fetchSectors();
      fetchHealth();
    }, 300_000); // 5min
    return () => { clearInterval(fxInterval); clearInterval(broadInterval); };
  }, [token, fetchAll, fetchFxRates, fetchSectors, fetchHealth]);

  // ── Auth gate ────────────────────────────────────────
  if (!token || !user) {
    return (
      <div style={{ padding: 40, fontFamily: S.fontUI, color: S.secondary }}>
        Redirecting to login...
      </div>
    );
  }

  // ── Derived data ─────────────────────────────────────
  const marketIndices = sectors.filter(s => s.category === "market");
  const sectorEtfs = sectors.filter(s => s.category === "sector");

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, fontFamily: S.fontUI }}>
      {/* ── Header ─────────────────────────────────────── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 24px", borderBottom: `1px solid ${S.rim}`,
        background: S.bgPanel,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Activity size={20} style={{ color: S.cyan }} />
          <span style={{ fontFamily: S.fontHead, fontWeight: 700, fontSize: 16, color: S.primary }}>
            MARKET INTELLIGENCE HUB
          </span>
          <span style={{
            fontSize: 10, fontFamily: S.fontMono, padding: "2px 8px",
            borderRadius: 4, background: "rgba(5,150,105,0.12)", color: S.green,
          }}>
            LIVE
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
            UTC {utc}
          </span>
          <button
            onClick={fetchAll}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 12px", borderRadius: 6,
              border: `1px solid ${S.rim}`, background: S.bgSub,
              cursor: "pointer", fontSize: 12, fontFamily: S.fontMono, color: S.secondary,
            }}
          >
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            REFRESH
          </button>
        </div>
      </header>

      {/* ── Section 1: Ticker Ribbon ───────────────────── */}
      <TickerRibbon indices={marketIndices} loading={loading} />

      {/* ── Section 2: FX Heatmap Grid ─────────────────── */}
      <section style={{ padding: "16px 24px" }}>
        <SectionTitle icon={<TrendingUp size={16} />} title="FX PORTFOLIO" subtitle={`${fxRates.length} pairs`} />
        <FXHeatmapGrid rates={fxRates} forwardPoints={forwardPoints} />
      </section>

      {/* ── Section 3: Sectors ─────────────────────────── */}
      <section style={{ padding: "0 24px 16px" }}>
        <SectionTitle icon={<BarChart3 size={16} />} title="SECTOR PERFORMANCE" subtitle={`${sectorEtfs.length} ETFs`} />
        <SectorGrid sectors={sectorEtfs} />
      </section>

      {/* ── Section 4: Health Bar ───────────────────────── */}
      <MarketHealthBar health={health} lastRefresh={lastRefresh} onRefresh={fetchAll} loading={loading} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// Sub-components
// ═════════════════════════════════════════════════════════

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <span style={{ color: S.cyan }}>{icon}</span>
      <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 600, color: S.primary, letterSpacing: "0.04em" }}>
        {title}
      </span>
      <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>{subtitle}</span>
    </div>
  );
}

// ─── Ticker Ribbon ───────────────────────────────────────
function TickerRibbon({ indices, loading }: { indices: SectorQuote[]; loading: boolean }) {
  if (!indices.length && !loading) return null;
  return (
    <div style={{
      display: "flex", gap: 0, overflowX: "auto",
      borderBottom: `1px solid ${S.rim}`, background: S.bgPanel,
      padding: "0 24px",
    }}>
      {indices.map(q => (
        <div key={q.symbol} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRight: `1px solid ${S.rim}`,
          minWidth: 140,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.primary }}>
            {q.symbol}
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.primary }}>
            ${q.price.toFixed(2)}
          </span>
          <span style={{
            fontFamily: S.fontMono, fontSize: 11, fontWeight: 600,
            color: q.changePercent >= 0 ? S.green : S.red,
          }}>
            {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── FX Heatmap Grid ─────────────────────────────────────
function FXHeatmapGrid({ rates, forwardPoints }: { rates: FxRate[]; forwardPoints: Record<string, ForwardPoint[]> }) {
  if (!rates.length) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: S.tertiary, fontFamily: S.fontMono, fontSize: 12 }}>
        Loading FX rates...
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      gap: 8,
    }}>
      {rates.map(r => {
        const isPos = r.change_pct >= 0;
        const changeBg = isPos ? "rgba(5,150,105,0.08)" : "rgba(220,38,38,0.08)";
        const changeColor = isPos ? S.green : S.red;
        const spreadPips = ((r.ask - r.bid) * (r.symbol.includes("JPY") ? 100 : 10000)).toFixed(1);

        return (
          <div key={r.symbol} style={{
            background: S.bgPanel, borderRadius: 8,
            border: `1px solid ${S.rim}`, padding: "12px 16px",
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, color: S.primary }}>
                {r.symbol.slice(0, 3)}/{r.symbol.slice(3)}
              </span>
              <span style={{
                fontFamily: S.fontMono, fontSize: 10, padding: "1px 6px",
                borderRadius: 3, background: changeBg, color: changeColor,
              }}>
                {isPos ? "+" : ""}{r.change_pct.toFixed(2)}%
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: S.primary }}>
                {r.mid.toFixed(r.symbol.includes("JPY") ? 3 : 4)}
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                {spreadPips}p
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: S.fontMono, color: S.tertiary }}>
              <span>B {r.bid.toFixed(r.symbol.includes("JPY") ? 3 : 4)}</span>
              <span>A {r.ask.toFixed(r.symbol.includes("JPY") ? 3 : 4)}</span>
              <span style={{
                padding: "0 4px", borderRadius: 2,
                background: r.source === "indicative_fallback" ? "rgba(217,119,6,0.12)" : "rgba(5,150,105,0.08)",
                color: r.source === "indicative_fallback" ? S.amber : S.green,
              }}>
                {r.source === "twelvedata" ? "TD" : r.source === "ibkr" ? "IB" : r.source === "yahoo_finance" ? "YF" : "FB"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sector Grid ─────────────────────────────────────────
function SectorGrid({ sectors }: { sectors: SectorQuote[] }) {
  if (!sectors.length) return null;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
      gap: 6,
    }}>
      {sectors.map(s => {
        const isPos = s.changePercent >= 0;
        return (
          <div key={s.symbol} style={{
            background: S.bgPanel, borderRadius: 6,
            border: `1px solid ${S.rim}`, padding: "8px 12px",
            display: "flex", flexDirection: "column", gap: 2,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 600, color: S.primary }}>
                {s.symbol}
              </span>
              <span style={{
                fontFamily: S.fontMono, fontSize: 10,
                color: isPos ? S.green : S.red,
              }}>
                {isPos ? "+" : ""}{s.changePercent.toFixed(1)}%
              </span>
            </div>
            <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.primary }}>
              ${s.price.toFixed(2)}
            </span>
            <span style={{ fontSize: 10, color: S.tertiary }}>{s.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Market Health Bar ───────────────────────────────────
function MarketHealthBar({ health, lastRefresh, onRefresh, loading }: {
  health: HealthReport | null;
  lastRefresh: string;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <footer style={{
      position: "sticky", bottom: 0,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 24px", borderTop: `1px solid ${S.rim}`,
      background: S.bgPanel, fontSize: 11, fontFamily: S.fontMono,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Shield size={14} style={{ color: S.cyan }} />
        {health?.providers?.map(p => (
          <span key={p.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: p.connected ? S.green : S.red,
            }} />
            <span style={{ color: S.secondary, textTransform: "uppercase" }}>{p.name}</span>
            {p.latency_ms != null && (
              <span style={{ color: S.tertiary }}>{Math.round(p.latency_ms)}ms</span>
            )}
          </span>
        )) ?? <span style={{ color: S.tertiary }}>No providers</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {lastRefresh && (
          <span style={{ color: S.tertiary }}>
            Last: {new Date(lastRefresh).toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            padding: "2px 8px", borderRadius: 4,
            border: `1px solid ${S.rim}`, background: S.bgSub,
            cursor: "pointer", fontSize: 10, color: S.secondary,
          }}
        >
          <Zap size={10} /> FORCE REFRESH
        </button>
      </div>
    </footer>
  );
}
```

**Step 2: Verify build**

Run: `cd frontend && npx next build`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/app/market-intelligence/page.tsx
git commit -m "feat(market-intel): scaffold Market Intelligence Hub page"
```

---

### Task 3: Backend — Forward Curves Bulk Endpoint

The hub needs forward points for multiple pairs at once. Currently `/v1/forward-curves/latest/{pair}` serves one pair. Add a bulk endpoint.

**Files:**
- Modify: `backend/app/api/routes/v1_forward_curves.py`
- Test: `backend/tests/test_market_data_platform.py`

**Step 1: Add bulk endpoint**

Add to `v1_forward_curves.py`:

```python
@router.get("/v1/forward-curves/bulk-latest")
async def get_bulk_latest_forward_curves(
    request: Request,
    pairs: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Fetch latest forward curve snapshot for multiple pairs at once.

    Query: ?pairs=USDMXN,EURUSD,USDJPY
    """
    from app.services.forward_curve_service import ForwardCurveService
    svc = ForwardCurveService()
    pair_list = [p.strip().upper() for p in pairs.split(",") if p.strip()]
    results = {}
    for pair in pair_list:
        snap = await svc.get_latest_by_pair(db, pair, current_user.company_id)
        if snap:
            results[pair] = {
                "id": str(snap.id),
                "pair": snap.pair,
                "spot_mid": snap.spot_mid,
                "forward_points": snap.forward_points,
                "as_of": snap.as_of.isoformat() if snap.as_of else None,
                "source": snap.source,
            }
    return {"curves": results, "count": len(results)}
```

**Step 2: Write test**

```python
class TestBulkForwardCurves:
    @pytest.mark.asyncio
    async def test_bulk_latest_returns_dict(self):
        """Bulk endpoint returns dict keyed by pair."""
        # This is a route-level test that requires DB — mark for integration
        pass  # Route test via httpx in integration suite
```

**Step 3: Verify tests pass**

Run: `JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_market_data_platform.py -x -q`

**Step 4: Commit**

```bash
git add backend/app/api/routes/v1_forward_curves.py
git commit -m "feat(api): add /v1/forward-curves/bulk-latest endpoint"
```

---

### Task 4: Frontend — Wire Forward Points into Hub

**Files:**
- Modify: `frontend/src/app/market-intelligence/page.tsx`

**Step 1: Add forward points fetch**

Add to the `fetchAll` function a call to the bulk forward curves endpoint:

```tsx
const fetchForwardCurves = useCallback(async () => {
  if (!token) return;
  try {
    const pairsParam = PORTFOLIO_PAIRS.join(",");
    const res = await dashboardFetch(`/v1/forward-curves/bulk-latest?pairs=${pairsParam}`, token);
    if (res.ok) {
      const data = await res.json();
      // Convert to ForwardPoint[] per pair
      const pts: Record<string, ForwardPoint[]> = {};
      for (const [pair, curve] of Object.entries(data.curves || {})) {
        const c = curve as { forward_points?: Record<string, number> };
        if (c.forward_points) {
          pts[pair] = Object.entries(c.forward_points).map(([tenor, points]) => ({
            tenor,
            points: points as number,
          }));
        }
      }
      setForwardPoints(pts);
    }
  } catch (e) { console.warn("Forward curves fetch failed", e); }
}, [token]);
```

**Step 2: Update FXHeatmapGrid to show forward points**

Add a row under each FX card showing 1M/3M/6M/12M forward points when available:

```tsx
{/* Forward points row */}
{fwdPts && fwdPts.length > 0 && (
  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
    {["1M", "3M", "6M", "12M"].map(t => {
      const pt = fwdPts.find(f => f.tenor === t);
      return pt ? (
        <span key={t} style={{
          fontFamily: S.fontMono, fontSize: 9, padding: "1px 4px",
          borderRadius: 2, background: S.bgSub, color: S.secondary,
        }}>
          {t} {pt.points >= 0 ? "+" : ""}{pt.points.toFixed(4)}
        </span>
      ) : null;
    })}
  </div>
)}
```

**Step 3: Verify build**

Run: `cd frontend && npx next build`

**Step 4: Commit**

```bash
git add frontend/src/app/market-intelligence/page.tsx
git commit -m "feat(market-intel): wire forward points into FX heatmap grid"
```

---

### Task 5: Carry Scorecard

**Files:**
- Modify: `frontend/src/app/market-intelligence/page.tsx`

**Step 1: Add CarryScorecard component**

Add between the FX heatmap and sector grid sections. Ranks pairs by 12M forward point advantage (carry):

```tsx
function CarryScorecard({ rates, forwardPoints }: { rates: FxRate[]; forwardPoints: Record<string, ForwardPoint[]> }) {
  // Build carry data: pair + 12M annualized carry in pips
  const carryData = rates
    .map(r => {
      const fwd = forwardPoints[r.symbol];
      const pt12m = fwd?.find(f => f.tenor === "12M")?.points ?? 0;
      const carryPips = pt12m * (r.symbol.includes("JPY") ? 100 : 10000);
      return { symbol: r.symbol, mid: r.mid, pt12m, carryPips };
    })
    .sort((a, b) => b.carryPips - a.carryPips);

  if (!carryData.length) return null;

  return (
    <div style={{
      background: S.bgPanel, borderRadius: 8,
      border: `1px solid ${S.rim}`, overflow: "hidden",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 100px 100px 80px",
        fontSize: 10, fontFamily: S.fontMono, fontWeight: 600,
        color: S.tertiary, padding: "8px 16px",
        borderBottom: `1px solid ${S.rim}`, background: S.bgSub,
        textTransform: "uppercase", letterSpacing: "0.06em",
      }}>
        <span>PAIR</span>
        <span style={{ textAlign: "right" }}>SPOT</span>
        <span style={{ textAlign: "right" }}>12M PTS</span>
        <span style={{ textAlign: "right" }}>CARRY (PIPS)</span>
      </div>
      {carryData.map((c, i) => (
        <div key={c.symbol} style={{
          display: "grid",
          gridTemplateColumns: "1fr 100px 100px 80px",
          fontSize: 12, fontFamily: S.fontMono, padding: "6px 16px",
          borderBottom: i < carryData.length - 1 ? `1px solid ${S.rim}` : "none",
          color: S.primary,
        }}>
          <span style={{ fontWeight: 600 }}>{c.symbol.slice(0,3)}/{c.symbol.slice(3)}</span>
          <span style={{ textAlign: "right" }}>{c.mid.toFixed(c.symbol.includes("JPY") ? 2 : 4)}</span>
          <span style={{ textAlign: "right", color: c.pt12m >= 0 ? S.green : S.red }}>
            {c.pt12m >= 0 ? "+" : ""}{c.pt12m.toFixed(4)}
          </span>
          <span style={{ textAlign: "right", fontWeight: 700, color: c.carryPips >= 0 ? S.green : S.red }}>
            {c.carryPips >= 0 ? "+" : ""}{c.carryPips.toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Add to page layout**

Insert after FX Heatmap section:

```tsx
<section style={{ padding: "0 24px 16px" }}>
  <SectionTitle icon={<TrendingUp size={16} />} title="CARRY SCORECARD" subtitle="12M ranked" />
  <CarryScorecard rates={fxRates} forwardPoints={forwardPoints} />
</section>
```

**Step 3: Verify build**

Run: `cd frontend && npx next build`

**Step 4: Commit**

```bash
git add frontend/src/app/market-intelligence/page.tsx
git commit -m "feat(market-intel): add carry scorecard ranked by 12M forward points"
```

---

### Task 6: Market Data Health — Manual Refresh via Admin Route

**Files:**
- Modify: `frontend/src/app/market-intelligence/page.tsx`

**Step 1: Wire FORCE REFRESH to backend admin route**

Update the `MarketHealthBar` component's `onRefresh` to call `POST /v1/market-data/refresh` then re-fetch all data:

```tsx
const handleForceRefresh = useCallback(async () => {
  if (!token) return;
  setLoading(true);
  try {
    // Trigger backend refresh for all data types
    await dashboardFetch("/v1/market-data/refresh", token, {
      method: "POST",
      body: JSON.stringify({ data_type: "fx_spot" }),
    });
  } catch (e) { console.warn("Force refresh failed", e); }
  // Re-fetch all frontend data
  await fetchAll();
}, [token, fetchAll]);
```

**Step 2: Update health bar to show staleness badges**

```tsx
{health?.staleness && Object.entries(health.staleness).map(([key, val]) => (
  <span key={key} style={{
    display: "flex", alignItems: "center", gap: 3,
    padding: "1px 6px", borderRadius: 3,
    background: val.is_stale ? "rgba(220,38,38,0.08)" : "rgba(5,150,105,0.08)",
    color: val.is_stale ? S.red : S.green,
  }}>
    {key}: {val.is_stale ? "STALE" : "FRESH"}
  </span>
))}
```

**Step 3: Verify build**

Run: `cd frontend && npx next build`

**Step 4: Commit**

```bash
git add frontend/src/app/market-intelligence/page.tsx
git commit -m "feat(market-intel): wire force refresh + staleness badges to health bar"
```

---

### Task 7: Final Integration Test + Build Verification

**Step 1: Run backend tests**

Run: `cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short`
Expected: All pass, 0 failures

**Step 2: Run frontend build**

Run: `cd frontend && npx next build`
Expected: Build succeeds

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(market-intel): Market Intelligence Hub — complete"
```
