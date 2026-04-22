"use client";
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { useAuth } from "@/lib/authContext";
import {
  getConsolidatedForecast, getLiquidityGaps, runForecastScenario,
  getForecastVariance, getForecastItems, createForecastItem,
  type ForecastResponse, type ForecastBucket, type LiquidityGap,
  type VarianceRow, type ForecastItem,
} from "@/lib/api/cashClient";
import { TrendingUp, AlertTriangle, BarChart2, FileText, List, Plus } from "lucide-react";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
} as const;

type Tab = "FORECAST" | "GAPS" | "VARIANCE" | "ITEMS";

function CashForecastInner() {
  const { token, user } = useAuth();
  const isMobile = useIsMobile();
  const [horizon, setHorizon] = useState<"13w" | "12m">("13w");
  const [tab, setTab] = useState<Tab>("FORECAST");
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [gaps, setGaps] = useState<LiquidityGap[]>([]);
  const [variance, setVariance] = useState<VarianceRow[]>([]);
  const [items, setItems] = useState<ForecastItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inflowShift, setInflowShift] = useState("0");
  const [outflowShift, setOutflowShift] = useState("0");
  const [scenarioResult, setScenarioResult] = useState<ForecastResponse | null>(null);

  // New item form
  const [showForm, setShowForm] = useState(false);
  const [newItem, setNewItem] = useState({ label: "", direction: "OUTFLOW", amount: "", currency: "EUR", recurrence: "MONTHLY", start_date: "", confidence: "COMMITTED", day_of_month: "" });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setForecast(null);
    setGaps([]);
    setVariance([]);
    setScenarioResult(null);
    try {
      const [fc, gp] = await Promise.all([
        getConsolidatedForecast(token, horizon),
        getLiquidityGaps(token),
      ]);
      setForecast(fc);
      setGaps(gp.gaps || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load forecast");
    } finally {
      setLoading(false);
    }
  }, [token, horizon]);

  useEffect(() => { load(); }, [load]);

  const loadVariance = useCallback(async () => {
    if (!token) return;
    try {
      const v = await getForecastVariance(token);
      setVariance(v.rows || []);
    } catch { setVariance([]); }
  }, [token]);

  const loadItems = useCallback(async () => {
    if (!token) return;
    try {
      const it = await getForecastItems(token);
      setItems(it);
    } catch { setItems([]); }
  }, [token]);

  useEffect(() => {
    if (tab === "VARIANCE") loadVariance();
    if (tab === "ITEMS") loadItems();
  }, [tab, loadVariance, loadItems]);

  const handleScenario = async () => {
    if (!token) return;
    try {
      const res = await runForecastScenario(token, {
        horizon,
        inflow_shift: inflowShift,
        outflow_shift: outflowShift,
      });
      setScenarioResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Scenario failed");
    }
  };

  const handleCreateItem = async () => {
    if (!token || !newItem.label || !newItem.amount || !newItem.start_date) return;
    try {
      await createForecastItem(token, {
        ...newItem,
        day_of_month: newItem.day_of_month ? parseInt(newItem.day_of_month) : undefined,
      });
      setShowForm(false);
      setNewItem({ label: "", direction: "OUTFLOW", amount: "", currency: "EUR", recurrence: "MONTHLY", start_date: "", confidence: "COMMITTED", day_of_month: "" });
      loadItems();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create item");
    }
  };

  const fmt = (v: string | number | null | undefined) => {
    if (v == null) return "\u2014";
    const n = typeof v === "string" ? parseFloat(v) : v;
    return isNaN(n) ? "\u2014" : n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "FORECAST", label: "FORECAST", icon: <BarChart2 size={14} /> },
    { key: "GAPS", label: `GAPS${gaps.length ? ` (${gaps.length})` : ""}`, icon: <AlertTriangle size={14} /> },
    { key: "VARIANCE", label: "VARIANCE", icon: <FileText size={14} /> },
    { key: "ITEMS", label: "ITEMS", icon: <List size={14} /> },
  ];

  const buckets = (scenarioResult || forecast)?.buckets || [];
  const maxAbs = Math.max(...buckets.map(b => Math.abs(parseFloat(String(b.closing_balance)) || 0)), 1);

  return (
    <div style={{ padding: isMobile ? 12 : 24, fontFamily: S.fontUI, color: "var(--text-primary)" }}>
      {/* Header */}
      <div className="widget-drag-handle" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <TrendingUp size={18} />
        <span style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Cash Forecast</span>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 8 }}>
          {horizon === "13w" ? "13-Week Rolling" : "12-Month Rolling"}
        </span>
        <div style={{ flex: 1 }} />
        {(["13w", "12m"] as const).map(h => (
          <button key={h} onClick={() => setHorizon(h)} style={{
            padding: "4px 12px", fontSize: 12, fontFamily: S.fontMono, cursor: "pointer",
            background: horizon === h ? "var(--accent-primary)" : S.bgSub,
            color: horizon === h ? "#fff" : "var(--text-secondary)",
            border: `1px solid ${S.rim}`, borderRadius: 4,
          }}>{h.toUpperCase()}</button>
        ))}
      </div>

      {/* Gap alert banner */}
      {gaps.length > 0 && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "8px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={16} color="#ef4444" />
          <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 500 }}>
            {gaps.length} liquidity gap{gaps.length > 1 ? "s" : ""} detected in the forecast horizon
          </span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${S.rim}`, marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
            fontSize: 12, fontFamily: S.fontMono, cursor: "pointer",
            background: "transparent", border: "none", borderBottom: tab === t.key ? "2px solid var(--accent-primary)" : "2px solid transparent",
            color: tab === t.key ? "var(--text-primary)" : "var(--text-secondary)",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {loading && <div style={{ padding: 32, color: "var(--text-secondary)", fontSize: 13 }}>Loading forecast...</div>}
      {error && <div style={{ padding: 16, color: "#ef4444", fontSize: 13 }}>{error}</div>}

      {/* FORECAST tab */}
      {tab === "FORECAST" && !loading && buckets.length > 0 && (
        <div>
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>PERIOD</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>OPENING</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "#22c55e" }}>INFLOWS</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "#ef4444" }}>OUTFLOWS</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>CLOSING</th>
                <th style={{ textAlign: "center", padding: "6px 8px", width: 200 }}>WATERFALL</th>
                <th style={{ textAlign: "center", padding: "6px 8px", color: "var(--text-secondary)" }}>GAP</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => {
                const closing = parseFloat(String(b.closing_balance)) || 0;
                const barWidth = Math.abs(closing / maxAbs) * 100;
                const isNeg = closing < 0;
                return (
                  <tr key={`${b.period_start}-${i}`} style={{ borderBottom: `1px solid ${S.rim}`, background: b.liquidity_gap ? "rgba(239,68,68,0.05)" : undefined }}>
                    <td style={{ padding: "6px 8px", fontSize: 12 }}>{b.period_start}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(b.opening_balance)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "#22c55e" }}>+{fmt(b.inflows)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "#ef4444" }}>-{fmt(b.outflows)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: isNeg ? "#ef4444" : "var(--text-primary)" }}>{fmt(b.closing_balance)}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <div style={{ width: "100%", height: 14, background: S.bgDeep, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(barWidth, 100)}%`, height: "100%", background: isNeg ? "#ef4444" : "#22c55e", borderRadius: 3 }} />
                      </div>
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>{b.liquidity_gap ? <AlertTriangle size={14} color="#ef4444" /> : "\u2014"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          {/* Scenario panel */}
          <div style={{ marginTop: 24, padding: 16, background: S.bgSub, borderRadius: 8, border: `1px solid ${S.rim}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, fontFamily: S.fontMono }}>SCENARIO ANALYSIS</div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Inflow shift %
                <input type="number" step="0.05" value={inflowShift} onChange={e => setInflowShift(e.target.value)}
                  style={{ display: "block", marginTop: 4, width: 100, padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }} />
              </label>
              <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Outflow shift %
                <input type="number" step="0.05" value={outflowShift} onChange={e => setOutflowShift(e.target.value)}
                  style={{ display: "block", marginTop: 4, width: 100, padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }} />
              </label>
              <button onClick={handleScenario} style={{
                padding: "6px 16px", fontSize: 12, fontFamily: S.fontMono, cursor: "pointer",
                background: "var(--accent-primary)", color: "#fff", border: "none", borderRadius: 4,
              }}>Run Scenario</button>
              {scenarioResult && (
                <button onClick={() => setScenarioResult(null)} style={{
                  padding: "6px 16px", fontSize: 12, fontFamily: S.fontMono, cursor: "pointer",
                  background: S.bgDeep, color: "var(--text-secondary)", border: `1px solid ${S.rim}`, borderRadius: 4,
                }}>Reset</button>
              )}
            </div>
            {scenarioResult && <div style={{ fontSize: 12, color: "var(--accent-primary)", marginTop: 8 }}>Showing scenario results</div>}
          </div>
        </div>
      )}

      {/* GAPS tab */}
      {tab === "GAPS" && !loading && (
        <div>
          {gaps.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>No liquidity gaps detected</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>PERIOD</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>CURRENCY</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>CLOSING</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>THRESHOLD</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "#ef4444" }}>SHORTFALL</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((g, i) => (
                  <tr key={`${g.period_start}-${g.currency}-${i}`} style={{ borderBottom: `1px solid ${S.rim}` }}>
                    <td style={{ padding: "6px 8px" }}>{g.period_start} \u2014 {g.period_end}</td>
                    <td style={{ padding: "6px 8px" }}>{g.currency}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "#ef4444" }}>{fmt(g.closing_balance)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(g.gap_threshold)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "#ef4444", fontWeight: 600 }}>{fmt(g.shortfall)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {/* VARIANCE tab */}
      {tab === "VARIANCE" && !loading && (
        <div>
          {variance.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>No forecast snapshots yet \u2014 save a snapshot to enable variance tracking</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>PERIOD</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>FORECAST</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>ACTUAL</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>VARIANCE</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>VAR %</th>
                </tr>
              </thead>
              <tbody>
                {variance.map((v, i) => {
                  const var_val = v.variance ? parseFloat(v.variance) : null;
                  return (
                    <tr key={`${v.period_start}-${i}`} style={{ borderBottom: `1px solid ${S.rim}` }}>
                      <td style={{ padding: "6px 8px" }}>{v.period_start} \u2014 {v.period_end}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(v.forecast_closing)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{v.actual_closing ? fmt(v.actual_closing) : "\u2014"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: var_val && var_val < 0 ? "#ef4444" : var_val && var_val > 0 ? "#22c55e" : undefined }}>{var_val != null ? fmt(var_val) : "\u2014"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{v.variance_pct ? `${parseFloat(v.variance_pct).toFixed(1)}%` : "\u2014"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {/* ITEMS tab */}
      {tab === "ITEMS" && !loading && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setShowForm(!showForm)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 12,
              fontFamily: S.fontMono, cursor: "pointer", background: "var(--accent-primary)", color: "#fff",
              border: "none", borderRadius: 4,
            }}><Plus size={14} /> Add Item</button>
          </div>

          {showForm && (
            <div style={{ padding: 16, background: S.bgSub, borderRadius: 8, border: `1px solid ${S.rim}`, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <input placeholder="Label" value={newItem.label} onChange={e => setNewItem({ ...newItem, label: e.target.value })}
                  style={{ flex: 1, minWidth: 160, padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }} />
                <select value={newItem.direction} onChange={e => setNewItem({ ...newItem, direction: e.target.value })}
                  style={{ padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }}>
                  <option value="INFLOW">INFLOW</option>
                  <option value="OUTFLOW">OUTFLOW</option>
                </select>
                <input placeholder="Amount" type="number" value={newItem.amount} onChange={e => setNewItem({ ...newItem, amount: e.target.value })}
                  style={{ width: 100, padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }} />
                <input placeholder="CCY" maxLength={3} value={newItem.currency} onChange={e => setNewItem({ ...newItem, currency: e.target.value.toUpperCase() })}
                  style={{ width: 60, padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }} />
                <select value={newItem.recurrence} onChange={e => setNewItem({ ...newItem, recurrence: e.target.value })}
                  style={{ padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }}>
                  {["ONCE", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <input type="date" value={newItem.start_date} onChange={e => setNewItem({ ...newItem, start_date: e.target.value })}
                  style={{ padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }} />
                <select value={newItem.confidence} onChange={e => setNewItem({ ...newItem, confidence: e.target.value })}
                  style={{ padding: "4px 8px", fontSize: 12, fontFamily: S.fontMono, background: S.bgDeep, border: `1px solid ${S.rim}`, borderRadius: 4, color: "var(--text-primary)" }}>
                  <option value="COMMITTED">COMMITTED</option>
                  <option value="PROBABLE">PROBABLE</option>
                  <option value="POSSIBLE">POSSIBLE</option>
                </select>
                <button onClick={handleCreateItem} style={{
                  padding: "6px 14px", fontSize: 12, fontFamily: S.fontMono, cursor: "pointer",
                  background: "var(--accent-primary)", color: "#fff", border: "none", borderRadius: 4,
                }}>Save</button>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>No recurring forecast items \u2014 add one to include it in forecasts</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>LABEL</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>DIR</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-secondary)" }}>AMOUNT</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>CCY</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>RECURRENCE</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>CONFIDENCE</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>START</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-secondary)" }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} style={{ borderBottom: `1px solid ${S.rim}` }}>
                    <td style={{ padding: "6px 8px" }}>{it.label}</td>
                    <td style={{ padding: "6px 8px", color: it.direction === "INFLOW" ? "#22c55e" : "#ef4444" }}>{it.direction}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(it.amount)}</td>
                    <td style={{ padding: "6px 8px" }}>{it.currency}</td>
                    <td style={{ padding: "6px 8px" }}>{it.recurrence}</td>
                    <td style={{ padding: "6px 8px" }}>{it.confidence}</td>
                    <td style={{ padding: "6px 8px" }}>{it.start_date}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 8,
                        background: it.is_active ? "rgba(34,197,94,0.1)" : "rgba(156,163,175,0.1)",
                        color: it.is_active ? "#22c55e" : "#9ca3af",
                      }}>{it.is_active ? "ACTIVE" : "INACTIVE"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CashForecastPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: "var(--text-secondary)" }}>Loading forecast...</div>}>
      <CashForecastInner />
    </Suspense>
  );
}
