"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Plus, Trash2, Pause, Play } from "lucide-react";
import TradingViewWidget from "../TradingViewWidget";
import { S } from "../../types";
import { useMarketTicker } from "@/lib/hooks/useMarketTicker";

// ── Types ──────────────────────────────────────────────────────────────────────
type MetricType = "SPOT_RATE" | "VOL_PCT" | "BID_ASK_SPREAD";
type ConditionOp = ">" | "<" | "!=";
type CooldownKey = "15m" | "1h" | "4h" | "24h";

interface AlertRule {
  id:         string;
  name:       string;
  symbol:     string;
  metric:     MetricType;
  op:         ConditionOp;
  threshold:  number;
  cooldown:   CooldownKey;
  active:     boolean;
  created_at: string;
}

interface FiredAlert {
  id:        string;
  rule_id:   string;
  rule_name: string;
  symbol:    string;
  value:     number;
  threshold: number;
  op:        ConditionOp;
  fired_at:  string;
}

const LS_RULES_KEY  = "ordr_alert_rules";
const LS_ALERTS_KEY = "ordr_fired_alerts";
const COOLDOWN_MS: Record<CooldownKey, number> = {
  "15m":  15 * 60 * 1000,
  "1h":   60 * 60 * 1000,
  "4h":   4  * 60 * 60 * 1000,
  "24h":  24 * 60 * 60 * 1000,
};

const METRIC_LABELS: Record<MetricType, string> = {
  SPOT_RATE:      "Spot Rate (Mid)",
  VOL_PCT:        "Vol % (Bid-Ask / Mid × 100)",
  BID_ASK_SPREAD: "Bid-Ask Spread (pips)",
};

const INDICES = [
  { symbol: "FOREXCOM:SPXUSD", label: "S&P 500" },
  { symbol: "FOREXCOM:NSXUSD", label: "Nasdaq 100" },
  { symbol: "TVC:DXY",         label: "Dollar Index" },
];

const PRESET_SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD",
  "USDMXN", "USDBRL", "USDINR", "USDKRW", "USDZAR",
];

const COOLDOWN_LABELS: Record<CooldownKey, string> = {
  "15m": "15 min", "1h": "1 hour", "4h": "4 hours", "24h": "24 hours",
};

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Alert Rules Engine ─────────────────────────────────────────────────────────
function AlertRulesEngine() {
  const [rules, setRules]     = useState<AlertRule[]>([]);
  const [alerts, setAlerts]   = useState<FiredAlert[]>([]);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [fSymbol,    setFSymbol]    = useState("EURUSD");
  const [fMetric,    setFMetric]    = useState<MetricType>("SPOT_RATE");
  const [fOp,        setFOp]        = useState<ConditionOp>(">");
  const [fThreshold, setFThreshold] = useState("");
  const [fCooldown,  setFCooldown]  = useState<CooldownKey>("1h");
  const [fName,      setFName]      = useState("");

  const lastFiredRef = useRef<Record<string, number>>({});

  // Load from localStorage
  useEffect(() => {
    try {
      const r = localStorage.getItem(LS_RULES_KEY);
      if (r) setRules(JSON.parse(r));
      const a = localStorage.getItem(LS_ALERTS_KEY);
      if (a) setAlerts(JSON.parse(a));
    } catch { /* ignore */ }
  }, []);

  // Get all active rule symbols for the ticker
  const tickSymbols = [...new Set(rules.filter(r => r.active).map(r => r.symbol))];
  const ticks = useMarketTicker(tickSymbols);

  // Evaluate rules against live ticks
  useEffect(() => {
    const now = Date.now();
    const newAlerts: FiredAlert[] = [];

    for (const rule of rules) {
      if (!rule.active) continue;
      const tick = ticks[rule.symbol];
      if (!tick) continue;

      // Compute metric value
      let value: number;
      if (rule.metric === "SPOT_RATE") {
        value = tick.mid;
      } else if (rule.metric === "BID_ASK_SPREAD") {
        value = Math.round((tick.ask - tick.bid) * 10000) / 10000; // in pips (4dp)
      } else { // VOL_PCT
        value = tick.mid > 0 ? Math.round(((tick.ask - tick.bid) / tick.mid) * 10000) / 100 : 0;
      }

      // Check condition
      let triggered = false;
      if (rule.op === ">"  && value >  rule.threshold) triggered = true;
      if (rule.op === "<"  && value <  rule.threshold) triggered = true;
      if (rule.op === "!=" && Math.abs(value - rule.threshold) / (rule.threshold || 1) > 0.001) triggered = true;

      if (!triggered) continue;

      // Cooldown check
      const lastFired = lastFiredRef.current[rule.id] ?? 0;
      if (now - lastFired < COOLDOWN_MS[rule.cooldown]) continue;

      lastFiredRef.current[rule.id] = now;
      newAlerts.push({
        id:        uid(),
        rule_id:   rule.id,
        rule_name: rule.name || `${rule.symbol} ${rule.op} ${rule.threshold}`,
        symbol:    rule.symbol,
        value,
        threshold: rule.threshold,
        op:        rule.op,
        fired_at:  new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
      });
    }

    if (newAlerts.length > 0) {
      setAlerts(prev => {
        const next = [...newAlerts, ...prev].slice(0, 50); // keep last 50
        localStorage.setItem(LS_ALERTS_KEY, JSON.stringify(next));
        return next;
      });
    }
  }, [ticks, rules]);

  const saveRules = (next: AlertRule[]) => {
    setRules(next);
    localStorage.setItem(LS_RULES_KEY, JSON.stringify(next));
  };

  const addRule = () => {
    const thresh = parseFloat(fThreshold);
    if (!fSymbol || isNaN(thresh)) return;
    const rule: AlertRule = {
      id:         uid(),
      name:       fName || `${fSymbol} ${fOp} ${thresh}`,
      symbol:     fSymbol.toUpperCase().replace("/", ""),
      metric:     fMetric,
      op:         fOp,
      threshold:  thresh,
      cooldown:   fCooldown,
      active:     true,
      created_at: new Date().toISOString(),
    };
    saveRules([rule, ...rules]);
    setShowForm(false);
    setFName(""); setFThreshold(""); setFSymbol("EURUSD");
  };

  const toggleRule = (id: string) => {
    saveRules(rules.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  const deleteRule = (id: string) => {
    saveRules(rules.filter(r => r.id !== id));
  };

  const clearAlerts = () => {
    setAlerts([]);
    localStorage.removeItem(LS_ALERTS_KEY);
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: 11, color: S.primary,
    background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 2,
    padding: "5px 8px", outline: "none",
  };

  return (
    <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Rule Builder ────────────────────────────────────────────────── */}
      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 4 }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px", borderBottom: showForm ? `1px solid ${S.rim}` : "none",
          background: S.bgSub,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.08em" }}>
            ALERT RULES · {rules.length} DEFINED · {rules.filter(r => r.active).length} ACTIVE
          </span>
          <button onClick={() => setShowForm(!showForm)} style={{
            display: "flex", alignItems: "center", gap: 5,
            fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
            color: showForm ? S.tertiary : S.cyan,
            background: "transparent", border: `1px solid ${showForm ? S.rim : S.cyan}`,
            borderRadius: 2, padding: "4px 10px", cursor: "pointer",
          }}>
            {showForm ? "CANCEL" : <><Plus size={11} /> NEW RULE</>}
          </button>
        </div>

        {showForm && (
          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Name */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, width: 70 }}>NAME</label>
              <input value={fName} onChange={e => setFName(e.target.value)}
                placeholder="e.g. EUR high alert" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
            </div>
            {/* Symbol + Metric */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, width: 70 }}>SYMBOL</label>
              <select value={fSymbol} onChange={e => setFSymbol(e.target.value)} style={{ ...inputStyle }}>
                {PRESET_SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <label style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginLeft: 8 }}>METRIC</label>
              <select value={fMetric} onChange={e => setFMetric(e.target.value as MetricType)} style={{ ...inputStyle, flex: 1 }}>
                {(Object.entries(METRIC_LABELS) as [MetricType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            {/* Condition + Threshold + Cooldown */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, width: 70 }}>TRIGGER</label>
              <select value={fOp} onChange={e => setFOp(e.target.value as ConditionOp)} style={{ ...inputStyle }}>
                <option value=">">{">"} ABOVE</option>
                <option value="<">{"<"} BELOW</option>
                <option value="!=">{"!="} DEVIATES</option>
              </select>
              <input type="number" value={fThreshold} onChange={e => setFThreshold(e.target.value)}
                placeholder="Threshold" style={{ ...inputStyle, width: 110 }} step="0.0001" />
              <label style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginLeft: 8 }}>COOLDOWN</label>
              <select value={fCooldown} onChange={e => setFCooldown(e.target.value as CooldownKey)} style={{ ...inputStyle }}>
                {(Object.entries(COOLDOWN_LABELS) as [CooldownKey, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <button onClick={addRule} style={{
                fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                color: S.black, background: S.cyan, border: "none", borderRadius: 2,
                padding: "5px 14px", cursor: "pointer", marginLeft: "auto",
              }}>
                ADD RULE
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Rules List ──────────────────────────────────────────────────── */}
      {rules.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rules.map(rule => {
            const tick = ticks[rule.symbol];
            const liveValue = tick
              ? rule.metric === "SPOT_RATE" ? tick.mid
              : rule.metric === "BID_ASK_SPREAD" ? Math.round((tick.ask - tick.bid) * 10000) / 10000
              : tick.mid > 0 ? Math.round(((tick.ask - tick.bid) / tick.mid) * 10000) / 100 : 0
              : null;

            return (
              <div key={rule.id} style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                padding: "10px 14px", background: S.bgPanel,
                border: `1px solid ${rule.active ? S.rim : S.soft}`, borderRadius: 3,
                opacity: rule.active ? 1 : 0.55,
              }}>
                {/* Status dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: rule.active ? "var(--accent-green,#22c55e)" : S.tertiary,
                }} />
                {/* Name */}
                <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary, minWidth: 120 }}>
                  {rule.name}
                </span>
                {/* Condition */}
                <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                  {rule.symbol} · {rule.metric === "SPOT_RATE" ? "mid" : rule.metric === "BID_ASK_SPREAD" ? "spread" : "vol%"}{" "}
                  {rule.op} {rule.threshold}
                </span>
                {/* Live value */}
                {liveValue !== null && (
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
                    color: (rule.op === ">" && liveValue > rule.threshold) ||
                           (rule.op === "<" && liveValue < rule.threshold)
                           ? "var(--accent-amber)" : S.tertiary,
                  }}>
                    LIVE: {liveValue.toFixed(4)}
                  </span>
                )}
                {!rule.active && (
                  <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, padding: "1px 5px", border: `1px solid ${S.rim}`, borderRadius: 2 }}>
                    PAUSED
                  </span>
                )}
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                  cooldown {COOLDOWN_LABELS[rule.cooldown]}
                </span>
                <div style={{ flex: 1 }} />
                {/* Controls */}
                <button onClick={() => toggleRule(rule.id)} title={rule.active ? "Pause" : "Resume"} style={{
                  background: "transparent", border: `1px solid ${S.rim}`, borderRadius: 2,
                  padding: "3px 7px", cursor: "pointer", color: S.tertiary,
                  display: "flex", alignItems: "center",
                }}>
                  {rule.active ? <Pause size={11} /> : <Play size={11} />}
                </button>
                <button onClick={() => deleteRule(rule.id)} title="Delete" style={{
                  background: "transparent", border: `1px solid ${S.rim}`, borderRadius: 2,
                  padding: "3px 7px", cursor: "pointer", color: "var(--accent-red,#f87171)",
                  display: "flex", alignItems: "center",
                }}>
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {rules.length === 0 && (
        <div style={{
          padding: "24px", textAlign: "center",
          background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 4,
        }}>
          <Bell size={24} color={S.tertiary} style={{ marginBottom: 8 }} />
          <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary }}>
            No alert rules defined. Create your first rule to monitor FX prices in real-time.
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, marginTop: 6, letterSpacing: "0.06em" }}>
            Rules evaluate against live WebSocket prices — no page refresh needed.
          </div>
        </div>
      )}

      {/* ── Recent Fired Alerts ─────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 8,
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.08em" }}>
              FIRED ALERTS · {alerts.length} RECENT
            </span>
            <button onClick={clearAlerts} style={{
              fontFamily: S.fontMono, fontSize: 10, color: S.tertiary,
              background: "transparent", border: `1px solid ${S.rim}`,
              borderRadius: 2, padding: "2px 8px", cursor: "pointer",
            }}>CLEAR</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {alerts.slice(0, 20).map(alert => (
              <div key={alert.id} style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                padding: "8px 14px",
                background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: 3,
              }}>
                <Bell size={11} color="var(--accent-amber)" />
                <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: "var(--accent-amber)" }}>
                  {alert.rule_name}
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                  {alert.symbol}: {alert.value.toFixed(5)} {alert.op} {alert.threshold}
                </span>
                <div style={{ flex: 1 }} />
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                  {alert.fired_at}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info footer */}
      <div style={{
        padding: "10px 14px", background: S.bgPanel, border: `1px solid ${S.rim}`,
        borderRadius: 3, fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, lineHeight: 1.7,
      }}>
        <strong style={{ color: S.secondary }}>How it works:</strong>{" "}
        Alert rules evaluate continuously against live WebSocket prices from <code style={{ fontFamily: S.fontMono, fontSize: 10 }}>/ws/market</code>.
        Cooldown prevents duplicate alerts. Rules and fired alerts persist to localStorage.
        Production: connect to <code style={{ fontFamily: S.fontMono, fontSize: 10 }}>/v1/signals</code> to sync rules across devices.
      </div>
    </div>
  );
}

// ── Main SignalsTab ────────────────────────────────────────────────────────────
export default function SignalsTab() {
  const [view, setView] = useState<"PASSIVE" | "ALERTS">("PASSIVE");

  return (
    <div>
      {/* View mode tabs */}
      <div style={{
        display: "flex", borderBottom: `1px solid ${S.rim}`,
        background: S.bgPanel, flexShrink: 0,
      }}>
        {([["PASSIVE", "PASSIVE TECHNICALS"], ["ALERTS", "ALERT RULES"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={{
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            padding: "0 18px", height: 38, border: "none",
            borderBottom: view === v ? `2px solid ${S.cyan}` : "2px solid transparent",
            background: "transparent",
            color: view === v ? S.cyan : S.tertiary,
            cursor: "pointer", letterSpacing: "0.04em",
          }}>
            {v === "ALERTS" && <Bell size={12} />}
            {label}
          </button>
        ))}
      </div>

      {view === "PASSIVE" ? (
        <div style={{ padding: "12px 24px 24px" }}>
          {/* Technical Analysis Grid */}
          <div style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
            color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
            padding: "0 0 8px 0", borderBottom: `1px solid ${S.rim}`, marginBottom: 12,
          }}>
            PASSIVE TECHNICALS
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
            {INDICES.map((idx) => (
              <div key={idx.symbol} style={{ border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.primary,
                  padding: "8px 12px", background: S.bgPanel,
                  borderBottom: `1px solid ${S.rim}`, letterSpacing: "0.04em",
                }}>
                  {idx.label}
                </div>
                <TradingViewWidget
                  scriptSrc="embed-widget-technical-analysis.js"
                  config={{ interval: "1D", width: "100%", height: "100%", symbol: idx.symbol, showIntervalTabs: true, locale: "en" }}
                  height={380}
                />
              </div>
            ))}
          </div>

          {/* News & Catalyst Stream */}
          <div style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
            color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
            padding: "0 0 8px 0", borderBottom: `1px solid ${S.rim}`, marginBottom: 12,
          }}>
            NEWS & CATALYST STREAM
          </div>
          <div style={{ border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
            <TradingViewWidget
              scriptSrc="embed-widget-timeline.js"
              config={{ feedMode: "all_symbols", market: "stock", displayMode: "regular", width: "100%", height: "100%", locale: "en" }}
              height={500}
            />
          </div>
        </div>
      ) : (
        <AlertRulesEngine />
      )}
    </div>
  );
}
