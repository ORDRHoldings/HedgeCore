"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, RefreshCw } from "lucide-react";
import TradingViewWidget from "../TradingViewWidget";
import { S } from "../../types";
import { useMarketTicker } from "@/lib/hooks/useMarketTicker";
import { dashboardFetch } from "@/lib/api/dashboardClient";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
  created_at: string;
  updated_at: string;
}

const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "JPM", "GS", "V", "XOM", "UNH"];
const LS_KEY = (userId?: string) => `ordr_watchlist_${userId ?? "anon"}`;

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtPrice(n: number | undefined): string {
  if (n == null) return "—";
  return n >= 100 ? n.toFixed(2) : n.toFixed(4);
}

function SyncBadge({ synced }: { synced: boolean | null }) {
  if (synced === null) return null;
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
      letterSpacing: "0.08em", padding: "2px 6px",
      borderRadius: 3, marginLeft: 8,
      background: synced ? "rgba(5,150,105,0.10)" : "rgba(217,119,6,0.10)",
      color: synced ? "var(--accent-green)" : "var(--accent-amber)",
      border: `1px solid ${synced ? "rgba(5,150,105,0.25)" : "rgba(217,119,6,0.25)"}`,
    }}>
      {synced ? "SYNCED" : "LOCAL"}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function WatchlistsTab({ userId, token }: { userId?: string; token?: string }) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [watchlistId, setWatchlistId] = useState<string | null>(null);
  const [synced, setSynced] = useState<boolean | null>(null);
  const [newSymbol, setNewSymbol] = useState("");
  const [loadingBackend, setLoadingBackend] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live ticks for all watchlist symbols (FX pairs normalized: no slash)
  const fxSymbols = symbols.map(s => s.replace("/", ""));
  const ticks = useMarketTicker(fxSymbols);

  // ── Load: backend first, localStorage fallback ─────────────────────────────
  const loadFromBackend = useCallback(async () => {
    if (!token) return false;
    setLoadingBackend(true);
    try {
      const res = await dashboardFetch("/v1/watchlists", token);
      if (!res.ok) return false;
      const lists: Watchlist[] = await res.json();
      if (lists.length > 0) {
        const primary = lists[0];
        setSymbols(primary.symbols);
        setWatchlistId(primary.id);
        setSynced(true);
        // Mirror to localStorage
        localStorage.setItem(LS_KEY(userId), JSON.stringify(primary.symbols));
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setLoadingBackend(false);
    }
  }, [token, userId]);

  const createOnBackend = useCallback(async (syms: string[]) => {
    if (!token) return;
    try {
      const res = await dashboardFetch("/v1/watchlists", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Watchlist", symbols: syms }),
      });
      if (res.ok) {
        const created: Watchlist = await res.json();
        setWatchlistId(created.id);
        setSynced(true);
      }
    } catch { /* keep local */ }
  }, [token]);

  useEffect(() => {
    const init = async () => {
      // Try backend first
      const loaded = await loadFromBackend();
      if (loaded) return;

      // Fallback: localStorage → then create on backend
      const stored = localStorage.getItem(LS_KEY(userId));
      let syms: string[] = DEFAULT_SYMBOLS;
      if (stored) {
        try { syms = JSON.parse(stored); } catch { /* use default */ }
      }
      setSymbols(syms);
      setSynced(false);

      // Attempt to create on backend in background
      if (token) createOnBackend(syms);
    };
    init();
  }, [userId, token, loadFromBackend, createOnBackend]);

  // ── Debounced backend save ─────────────────────────────────────────────────
  const saveToBackend = useCallback((syms: string[], wid: string | null) => {
    if (!token || !wid) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await dashboardFetch(`/v1/watchlists/${wid}`, token, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols: syms }),
        });
        if (res.ok) setSynced(true);
      } catch { /* keep local */ }
    }, 800);
  }, [token]);

  const persist = useCallback((syms: string[]) => {
    localStorage.setItem(LS_KEY(userId), JSON.stringify(syms));
    setSynced(false);
    saveToBackend(syms, watchlistId);
  }, [userId, watchlistId, saveToBackend]);

  const addSymbol = () => {
    const sym = newSymbol.trim().toUpperCase().replace("/", "");
    if (sym && !symbols.includes(sym)) {
      const next = [...symbols, sym];
      setSymbols(next);
      persist(next);
      setNewSymbol("");
    }
  };

  const removeSymbol = (sym: string) => {
    const next = symbols.filter((s) => s !== sym);
    setSymbols(next);
    persist(next);
  };

  const handleRefresh = async () => {
    const ok = await loadFromBackend();
    if (!ok) setSynced(false);
  };

  return (
    <div style={{ padding: "12px 24px 24px" }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center",
        gap: 8, marginBottom: 16, flexWrap: "wrap",
      }}>
        <span style={{
          fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
          color: S.tertiary, letterSpacing: "0.06em",
          textTransform: "uppercase", marginRight: 4,
        }}>
          WATCHLIST ({symbols.length})
        </span>

        <SyncBadge synced={synced} />

        {/* Symbol pills */}
        {symbols.map((sym) => {
          const tick = ticks[sym];
          return (
            <div key={sym} style={{
              display: "flex", alignItems: "center", gap: 4,
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
              color: S.primary, background: S.bgPanel,
              border: `1px solid ${S.rim}`, borderRadius: 4,
              padding: "3px 8px",
            }}>
              {sym}
              {tick && (
                <span style={{
                  fontSize: 10, color: "var(--accent-green)",
                  fontWeight: 400, marginLeft: 2,
                }}>
                  {fmtPrice(tick.mid)}
                </span>
              )}
              <button
                onClick={() => removeSymbol(sym)}
                style={{
                  background: "transparent", border: "none",
                  cursor: "pointer", color: S.tertiary,
                  display: "flex", alignItems: "center", padding: 0,
                }}
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

        {/* Add input */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          border: `1px solid ${S.rim}`, borderRadius: 4,
          padding: "3px 8px", background: S.bgPanel,
        }}>
          <input
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSymbol()}
            placeholder="Add symbol"
            style={{
              background: "transparent", border: "none", outline: "none",
              fontFamily: S.fontMono, fontSize: 12, color: S.primary, width: 80,
            }}
          />
          <button
            onClick={addSymbol}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: S.cyan, display: "flex", alignItems: "center", padding: 0,
            }}
          >
            <Plus size={12} />
          </button>
        </div>

        {/* Refresh from backend */}
        <button
          onClick={handleRefresh}
          disabled={loadingBackend || !token}
          title="Sync from backend"
          style={{
            background: "transparent", border: `1px solid ${S.rim}`,
            borderRadius: 4, padding: "3px 7px", cursor: "pointer",
            color: S.tertiary, display: "flex", alignItems: "center",
            opacity: loadingBackend || !token ? 0.4 : 1,
          }}
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {/* ── Live price strip ────────────────────────────────────────────── */}
      {Object.keys(ticks).length > 0 && (
        <div style={{
          display: "flex", gap: 8, flexWrap: "wrap",
          marginBottom: 16,
          padding: "10px 14px",
          background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 4,
        }}>
          {symbols.map((sym) => {
            const tick = ticks[sym];
            if (!tick) return null;
            return (
              <div key={sym} style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                minWidth: 80, padding: "4px 10px",
                borderRight: `1px solid ${S.rim}`,
              }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.06em" }}>
                  {sym}
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, color: S.primary }}>
                  {fmtPrice(tick.mid)}
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                  B {fmtPrice(tick.bid)} / A {fmtPrice(tick.ask)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Screener widget ──────────────────────────────────────────────── */}
      <div style={{
        border: `1px solid ${S.rim}`, borderRadius: 6,
        overflow: "hidden", marginBottom: 24,
      }}>
        <TradingViewWidget
          scriptSrc="embed-widget-screener.js"
          config={{
            width: "100%", height: "100%",
            defaultColumn: "overview",
            defaultScreen: "most_capitalized",
            market: "us", showToolbar: true, locale: "en",
          }}
          height="calc(100vh - 340px)"
        />
      </div>

      {/* ── Mini charts for top items ────────────────────────────────────── */}
      {symbols.length > 0 && (
        <>
          <div style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
            color: S.tertiary, letterSpacing: "0.06em",
            textTransform: "uppercase", padding: "8px 0",
            borderBottom: `1px solid ${S.rim}`, marginBottom: 12,
          }}>
            QUICK VIEW
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 12,
          }}>
            {symbols.slice(0, 6).map((sym) => (
              <div key={sym} style={{
                border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden",
              }}>
                <TradingViewWidget
                  scriptSrc="embed-widget-mini-symbol-overview.js"
                  config={{
                    symbol: sym, width: "100%", height: "100%",
                    locale: "en", dateRange: "1M",
                    largeChartUrl: "",
                    trendLineColor: "rgba(28,98,242,1)",
                    underLineColor: "rgba(28,98,242,0.3)",
                    underLineBottomColor: "rgba(28,98,242,0)",
                    noTimeScale: true,
                  }}
                  height={160}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
