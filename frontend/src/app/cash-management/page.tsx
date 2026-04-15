"use client";
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import {
  listCashPools, getPoolBalance, calculateSweeps, executeSweeps, listSweeps,
  listTreasuryPoolEntities, createTreasuryPoolEntity, createCashPool, listAccounts,
  type CashPool, type PoolBalance, type SweepPreview, type SweepRecord,
  type TreasuryPoolEntity, type BankAccount,
} from "@/lib/api/cashClient";
import { Plus, Play, Calculator, RefreshCw } from "lucide-react";

// ── Design tokens ──────────────────────────────────────────────────────────
const S = {
  mono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  ui: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  deep: "var(--bg-deep)",
  panel: "var(--bg-panel)",
  sub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  text1: "var(--text-primary)",
  text2: "var(--text-secondary)",
  text3: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
} as const;

const HEX = {
  cyan: "#1C62F2",
  green: "#059669",
  red: "#DC2626",
  amber: "#D97706",
  purple: "#8b5cf6",
  pink: "#ec4899",
  text1: "#0F172A",
  text2: "#334155",
  text3: "#94A3B8",
  border: "#E2E8F0",
} as const;

type Tab = "POOLS" | "ENTITIES" | "SWEEPS";

const poolTypeColor: Record<string, string> = { NOTIONAL: HEX.purple, PHYSICAL: HEX.cyan, ZBA: HEX.amber };
const sweepDirColor: Record<string, string> = { CONCENTRATION: HEX.cyan, DISTRIBUTION: HEX.amber };
const sweepStatusColor: Record<string, string> = { PENDING: HEX.amber, EXECUTED: HEX.green, FAILED: HEX.red, CANCELLED: HEX.text3 };
const entityTypeColor: Record<string, string> = { SUBSIDIARY: HEX.cyan, BRANCH: HEX.green, FUND: HEX.purple, HOLDING: HEX.amber, SPV: HEX.pink };

const fmtAmount = (v: string | number) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const Badge = ({ label, color }: { label: string; color: string }) => (
  <span style={{
    padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
    background: `${color}18`, color, border: `1px solid ${color}30`,
  }}>{label}</span>
);

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "POOLS", label: "POOLS", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
  { key: "ENTITIES", label: "ENTITIES", icon: "M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" },
  { key: "SWEEPS", label: "SWEEP HISTORY", icon: "M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" },
];

function CashManagementInner() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("POOLS");
  const [pools, setPools] = useState<CashPool[]>([]);
  const [entities, setEntities] = useState<TreasuryPoolEntity[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedPool, setExpandedPool] = useState<string | null>(null);
  const [poolBalance, setPoolBalance] = useState<PoolBalance | null>(null);
  const [sweepPreview, setSweepPreview] = useState<SweepPreview[] | null>(null);

  const [selectedPoolId, setSelectedPoolId] = useState<string>("");
  const [sweeps, setSweeps] = useState<SweepRecord[]>([]);

  const [showPoolForm, setShowPoolForm] = useState(false);
  const [poolForm, setPoolForm] = useState({ name: "", pool_type: "NOTIONAL", header_account_id: "", currency: "EUR", base_currency: "EUR" });
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [entityForm, setEntityForm] = useState({ name: "", entity_type: "SUBSIDIARY", base_currency: "EUR", country_code: "" });

  const loadPools = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try { setPools(await listCashPools(token)); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load pools"); } finally { setLoading(false); }
  }, [token]);

  const loadEntities = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try { setEntities(await listTreasuryPoolEntities(token)); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load entities"); } finally { setLoading(false); }
  }, [token]);

  const loadAccounts = useCallback(async () => {
    if (!token) return;
    try { setAccounts(await listAccounts(token)); } catch { /* noop */ }
  }, [token]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => {
    if (tab === "POOLS") loadPools();
    else if (tab === "ENTITIES") loadEntities();
  }, [tab, loadPools, loadEntities]);

  const handleExpandPool = async (poolId: string) => {
    if (!token) return;
    if (expandedPool === poolId) { setExpandedPool(null); setPoolBalance(null); setSweepPreview(null); return; }
    setExpandedPool(poolId);
    setSweepPreview(null);
    try { setPoolBalance(await getPoolBalance(token, poolId)); } catch { setPoolBalance(null); }
  };

  const handleCalculateSweeps = async (poolId: string) => {
    if (!token) return;
    try { setSweepPreview(await calculateSweeps(token, poolId)); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Sweep calculation failed"); }
  };

  const handleExecuteSweeps = async (poolId: string) => {
    if (!token) return;
    try {
      await executeSweeps(token, poolId);
      setSweepPreview(null);
      if (expandedPool === poolId) setPoolBalance(await getPoolBalance(token, poolId));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Sweep execution failed"); }
  };

  const handleCreatePool = async () => {
    if (!token || !poolForm.name || !poolForm.header_account_id) return;
    try {
      await createCashPool(token, poolForm);
      setShowPoolForm(false);
      setPoolForm({ name: "", pool_type: "NOTIONAL", header_account_id: "", currency: "EUR", base_currency: "EUR" });
      loadPools();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Create pool failed"); }
  };

  const handleCreateEntity = async () => {
    if (!token || !entityForm.name || !entityForm.country_code) return;
    try {
      await createTreasuryPoolEntity(token, entityForm);
      setShowEntityForm(false);
      setEntityForm({ name: "", entity_type: "SUBSIDIARY", base_currency: "EUR", country_code: "" });
      loadEntities();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Create entity failed"); }
  };

  const loadSweeps = useCallback(async () => {
    if (!token || !selectedPoolId) { setSweeps([]); return; }
    try { setSweeps(await listSweeps(token, selectedPoolId)); } catch { setSweeps([]); }
  }, [token, selectedPoolId]);

  useEffect(() => { if (tab === "SWEEPS") loadSweeps(); }, [tab, loadSweeps]);

  const reload = () => { if (tab === "POOLS") loadPools(); else if (tab === "ENTITIES") loadEntities(); else loadSweeps(); };

  // KPI data
  const activePools = pools.filter(p => p.is_active).length;
  const totalMembers = pools.reduce((s, p) => s + p.member_count, 0);
  const activeEntities = entities.filter(e => e.is_active).length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: S.deep }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, background: S.panel, borderBottom: `1px solid ${S.rim}` }}>
        <div style={{ padding: "20px 28px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 6,
              background: "rgba(28,98,242,0.06)", border: "1px solid rgba(28,98,242,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={HEX.cyan} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h1 style={{ fontFamily: S.mono, fontSize: 15, fontWeight: 700, color: S.text1, letterSpacing: "0.08em", margin: 0 }}>
                CASH POOL MANAGEMENT
              </h1>
              <span style={{ fontFamily: S.ui, fontSize: 12, color: S.text3 }}>
                Multi-entity pooling, sweeps & treasury entity administration
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={reload} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
              background: S.sub, border: `1px solid ${S.rim}`, borderRadius: 4,
              cursor: "pointer", fontSize: 11, fontFamily: S.mono, fontWeight: 600,
              color: S.text3, letterSpacing: "0.06em",
            }}>
              <RefreshCw size={12} />REFRESH
            </button>
            <span style={{
              fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
              padding: "4px 12px", borderRadius: 3,
              background: "rgba(28,98,242,0.06)", color: HEX.cyan,
              border: "1px solid rgba(28,98,242,0.12)",
            }}>
              PHASE 2f
            </span>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          margin: "14px 28px 0", borderRadius: 6,
          border: `1px solid ${S.rim}`, overflow: "hidden",
        }}>
          {([
            { label: "ACTIVE POOLS", value: activePools, color: activePools > 0 ? HEX.cyan : undefined },
            { label: "TOTAL MEMBERS", value: totalMembers, color: undefined },
            { label: "ENTITIES", value: activeEntities, color: activeEntities > 0 ? HEX.green : undefined },
            { label: "POOL TYPES", value: [...new Set(pools.map(p => p.pool_type))].join(" / ") || "\u2014", color: undefined },
          ] as { label: string; value: string | number; color?: string }[]).map((kpi, i) => (
            <div key={kpi.label} style={{
              padding: "12px 16px",
              borderRight: i < 3 ? `1px solid ${S.rim}` : "none",
              background: S.panel, position: "relative", overflow: "hidden",
            }}>
              {kpi.color && <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 2, background: kpi.color, opacity: 0.6 }} />}
              <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 4 }}>
                {kpi.label}
              </div>
              <div style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: kpi.color || S.text1 }}>
                {loading ? "\u2014" : kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, padding: "14px 28px 0" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                fontFamily: S.mono, fontSize: 11, fontWeight: tab === t.key ? 700 : 500,
                letterSpacing: "0.1em", color: tab === t.key ? HEX.cyan : S.text3,
                padding: "8px 16px", background: "transparent", border: "none",
                borderBottom: tab === t.key ? `2px solid ${HEX.cyan}` : "2px solid transparent",
                cursor: "pointer", transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 6,
              }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {error && (
          <div style={{
            padding: "10px 16px", marginBottom: 16, borderRadius: 4,
            background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
            fontFamily: S.ui, fontSize: 13, color: HEX.red,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
            {error}
            <div style={{ flex: 1 }} />
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: HEX.red, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>&times;</button>
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 60 }}>
            <div style={{ width: 28, height: 28, border: `2px solid ${S.rim}`, borderTopColor: S.cyan, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.text3, letterSpacing: "0.1em" }}>LOADING</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : tab === "POOLS" ? (
          /* ── POOLS TAB ── */
          <div style={{ maxWidth: 1100 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button onClick={() => setShowPoolForm(!showPoolForm)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
                background: HEX.cyan, color: "#fff", border: "none", borderRadius: 4,
                fontSize: 11, fontFamily: S.mono, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer",
              }}>
                <Plus size={13} />CREATE POOL
              </button>
            </div>

            {showPoolForm && (
              <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 20, marginBottom: 16 }}>
                <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 14 }}>NEW CASH POOL</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {([
                    { label: "NAME", type: "text", value: poolForm.name, onChange: (v: string) => setPoolForm({ ...poolForm, name: v }) },
                  ] as const).map(f => (
                    <label key={f.label} style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 600, color: S.text3, letterSpacing: "0.1em" }}>{f.label}
                      <input value={f.value} onChange={e => f.onChange(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, fontFamily: S.mono, boxSizing: "border-box" }} />
                    </label>
                  ))}
                  <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 600, color: S.text3, letterSpacing: "0.1em" }}>POOL TYPE
                    <select value={poolForm.pool_type} onChange={e => setPoolForm({ ...poolForm, pool_type: e.target.value })}
                      style={{ width: "100%", padding: "8px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, fontFamily: S.mono }}>
                      <option value="NOTIONAL">NOTIONAL</option><option value="PHYSICAL">PHYSICAL</option><option value="ZBA">ZBA</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 600, color: S.text3, letterSpacing: "0.1em" }}>HEADER ACCOUNT
                    <select value={poolForm.header_account_id} onChange={e => setPoolForm({ ...poolForm, header_account_id: e.target.value })}
                      style={{ width: "100%", padding: "8px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, fontFamily: S.mono }}>
                      <option value="">Select...</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname} ({a.currency})</option>)}
                    </select>
                  </label>
                  <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 600, color: S.text3, letterSpacing: "0.1em" }}>CURRENCY
                    <input value={poolForm.currency} onChange={e => setPoolForm({ ...poolForm, currency: e.target.value.toUpperCase(), base_currency: e.target.value.toUpperCase() })} maxLength={3}
                      style={{ width: "100%", padding: "8px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, fontFamily: S.mono, boxSizing: "border-box" }} />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button onClick={handleCreatePool} style={{ padding: "8px 18px", background: HEX.cyan, color: "#fff", border: "none", borderRadius: 4, fontSize: 11, fontFamily: S.mono, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}>CREATE</button>
                  <button onClick={() => setShowPoolForm(false)} style={{ padding: "8px 18px", background: "transparent", color: S.text3, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 11, fontFamily: S.mono, fontWeight: 700, cursor: "pointer" }}>CANCEL</button>
                </div>
              </div>
            )}

            <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.mono }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                    {["NAME", "TYPE", "CURRENCY", "MEMBERS", "STATUS"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pools.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: S.text3, fontSize: 12 }}>No pools configured yet</td></tr>}
                  {pools.map(p => (
                    <React.Fragment key={p.id}>
                      <tr onClick={() => handleExpandPool(p.id)} style={{ borderBottom: `1px solid ${S.rim}`, cursor: "pointer", transition: "background 0.12s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = `rgba(28,98,242,0.04)`)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td style={{ padding: "12px 14px", fontWeight: 600, color: S.text1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill={S.text3} style={{ transform: expandedPool === p.id ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s" }}>
                              <path d="M3 1l4 4-4 4" />
                            </svg>
                            {p.name}
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px" }}><Badge label={p.pool_type} color={poolTypeColor[p.pool_type] || HEX.text3} /></td>
                        <td style={{ padding: "12px 14px", color: S.text2 }}>{p.currency}</td>
                        <td style={{ padding: "12px 14px", color: S.text2 }}>{p.member_count}</td>
                        <td style={{ padding: "12px 14px" }}><Badge label={p.is_active ? "ACTIVE" : "INACTIVE"} color={p.is_active ? HEX.green : HEX.text3} /></td>
                      </tr>
                      {expandedPool === p.id && poolBalance && (
                        <tr><td colSpan={5} style={{ padding: 0 }}>
                          <div style={{ background: S.sub, padding: 20, borderBottom: `1px solid ${S.rim}` }}>
                            {/* Consolidated balance cards */}
                            <div style={{ display: "grid", gridTemplateColumns: poolBalance.header_balance !== null ? "1fr 1fr" : "1fr", gap: 14, marginBottom: 16 }}>
                              <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16, position: "relative", overflow: "hidden" }}>
                                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 2, background: HEX.cyan, opacity: 0.5 }} />
                                <div style={{ fontSize: 10, color: S.text3, fontWeight: 700, fontFamily: S.mono, letterSpacing: "0.14em", marginBottom: 6 }}>CONSOLIDATED BALANCE</div>
                                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: S.mono, color: S.text1, lineHeight: 1 }}>
                                  {fmtAmount(poolBalance.consolidated_balance)} <span style={{ fontSize: 12, color: S.text3 }}>{poolBalance.currency}</span>
                                </div>
                              </div>
                              {poolBalance.header_balance !== null && (
                                <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16, position: "relative", overflow: "hidden" }}>
                                  <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 2, background: HEX.green, opacity: 0.5 }} />
                                  <div style={{ fontSize: 10, color: S.text3, fontWeight: 700, fontFamily: S.mono, letterSpacing: "0.14em", marginBottom: 6 }}>HEADER BALANCE</div>
                                  <div style={{ fontSize: 26, fontWeight: 800, fontFamily: S.mono, color: S.text1, lineHeight: 1 }}>{fmtAmount(poolBalance.header_balance)}</div>
                                </div>
                              )}
                            </div>

                            {/* Member balances table */}
                            {poolBalance.member_balances.length > 0 && (
                              <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.mono }}>
                                  <thead>
                                    <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                                      {["ACCOUNT", "ENTITY", "LEDGER", "TARGET", "EXCESS", ""].map(h => (
                                        <th key={h} style={{ padding: "8px 12px", textAlign: h === "LEDGER" || h === "TARGET" || h === "EXCESS" ? "right" : "left", fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {poolBalance.member_balances.map((mb, i) => (
                                      <tr key={i} style={{ borderBottom: `1px solid ${S.rim}` }}>
                                        <td style={{ padding: "8px 12px", color: S.text2 }}>{mb.account_id.slice(0, 8)}...</td>
                                        <td style={{ padding: "8px 12px", color: S.text2 }}>{mb.entity_id.slice(0, 8)}...</td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: S.text1 }}>{fmtAmount(mb.ledger_balance)}</td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", color: S.text3 }}>{mb.target_balance ? fmtAmount(mb.target_balance) : "\u2014"}</td>
                                        <td style={{ padding: "8px 12px", textAlign: "right", color: S.text3 }}>{mb.excess ? fmtAmount(mb.excess) : "\u2014"}</td>
                                        <td style={{ padding: "8px 12px" }}>
                                          {mb.is_exception && <Badge label="EXCEPTION" color={HEX.red} />}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Sweep actions */}
                            {p.pool_type !== "NOTIONAL" && (
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <button onClick={() => handleCalculateSweeps(p.id)} style={{
                                  display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                                  background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4,
                                  fontSize: 11, fontFamily: S.mono, fontWeight: 700, color: S.text1, cursor: "pointer", letterSpacing: "0.04em",
                                }}>
                                  <Calculator size={12} />CALCULATE SWEEPS
                                </button>
                                {sweepPreview && sweepPreview.length > 0 && (
                                  <button onClick={() => handleExecuteSweeps(p.id)} style={{
                                    display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                                    background: HEX.cyan, border: "none", borderRadius: 4,
                                    fontSize: 11, fontFamily: S.mono, fontWeight: 700, color: "#fff", cursor: "pointer", letterSpacing: "0.04em",
                                  }}>
                                    <Play size={12} />EXECUTE {sweepPreview.length} SWEEP{sweepPreview.length !== 1 ? "S" : ""}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Sweep preview */}
                            {sweepPreview && sweepPreview.length > 0 && (
                              <div style={{ marginTop: 14, background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 14 }}>
                                <div style={{ fontSize: 10, color: S.text3, fontWeight: 700, fontFamily: S.mono, letterSpacing: "0.14em", marginBottom: 8 }}>SWEEP PREVIEW</div>
                                {sweepPreview.map((sw, i) => (
                                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, padding: "5px 0", borderBottom: i < sweepPreview.length - 1 ? `1px solid ${S.rim}` : "none" }}>
                                    <Badge label={sw.direction} color={sweepDirColor[sw.direction]} />
                                    <span style={{ fontWeight: 600, color: S.text1 }}>{fmtAmount(sw.amount)} {sw.currency}</span>
                                    <span style={{ color: S.text3 }}>{sw.source_account_id.slice(0, 8)} → {sw.destination_account_id.slice(0, 8)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {sweepPreview && sweepPreview.length === 0 && (
                              <div style={{ marginTop: 10, fontSize: 12, color: S.text3, fontFamily: S.mono }}>No sweeps needed — all members at target.</div>
                            )}
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : tab === "ENTITIES" ? (
          /* ── ENTITIES TAB ── */
          <div style={{ maxWidth: 1100 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button onClick={() => setShowEntityForm(!showEntityForm)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
                background: HEX.cyan, color: "#fff", border: "none", borderRadius: 4,
                fontSize: 11, fontFamily: S.mono, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer",
              }}>
                <Plus size={13} />CREATE ENTITY
              </button>
            </div>

            {showEntityForm && (
              <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 20, marginBottom: 16 }}>
                <div style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em", marginBottom: 14 }}>NEW TREASURY ENTITY</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 600, color: S.text3, letterSpacing: "0.1em" }}>NAME
                    <input value={entityForm.name} onChange={e => setEntityForm({ ...entityForm, name: e.target.value })}
                      style={{ width: "100%", padding: "8px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, fontFamily: S.mono, boxSizing: "border-box" }} />
                  </label>
                  <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 600, color: S.text3, letterSpacing: "0.1em" }}>TYPE
                    <select value={entityForm.entity_type} onChange={e => setEntityForm({ ...entityForm, entity_type: e.target.value })}
                      style={{ width: "100%", padding: "8px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, fontFamily: S.mono }}>
                      {["SUBSIDIARY", "BRANCH", "FUND", "HOLDING", "SPV"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 600, color: S.text3, letterSpacing: "0.1em" }}>BASE CURRENCY
                    <input value={entityForm.base_currency} onChange={e => setEntityForm({ ...entityForm, base_currency: e.target.value.toUpperCase() })} maxLength={3}
                      style={{ width: "100%", padding: "8px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, fontFamily: S.mono, boxSizing: "border-box" }} />
                  </label>
                  <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 600, color: S.text3, letterSpacing: "0.1em" }}>COUNTRY CODE
                    <input value={entityForm.country_code} onChange={e => setEntityForm({ ...entityForm, country_code: e.target.value.toUpperCase() })} maxLength={2} placeholder="GB"
                      style={{ width: "100%", padding: "8px 10px", marginTop: 4, background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, fontFamily: S.mono, boxSizing: "border-box" }} />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button onClick={handleCreateEntity} style={{ padding: "8px 18px", background: HEX.cyan, color: "#fff", border: "none", borderRadius: 4, fontSize: 11, fontFamily: S.mono, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}>CREATE</button>
                  <button onClick={() => setShowEntityForm(false)} style={{ padding: "8px 18px", background: "transparent", color: S.text3, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 11, fontFamily: S.mono, fontWeight: 700, cursor: "pointer" }}>CANCEL</button>
                </div>
              </div>
            )}

            <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.mono }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                    {["NAME", "TYPE", "CURRENCY", "COUNTRY", "PARENT", "STATUS"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entities.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: S.text3, fontSize: 12 }}>No treasury entities configured</td></tr>}
                  {entities.map(e => (
                    <tr key={e.id} style={{ borderBottom: `1px solid ${S.rim}` }}
                      onMouseEnter={ev => (ev.currentTarget.style.background = "rgba(28,98,242,0.04)")}
                      onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "12px 14px", fontWeight: 600, color: S.text1 }}>{e.name}</td>
                      <td style={{ padding: "12px 14px" }}><Badge label={e.entity_type} color={entityTypeColor[e.entity_type] || HEX.text3} /></td>
                      <td style={{ padding: "12px 14px", color: S.text2 }}>{e.base_currency}</td>
                      <td style={{ padding: "12px 14px", color: S.text2 }}>{e.country_code}</td>
                      <td style={{ padding: "12px 14px", color: S.text3 }}>
                        {e.parent_entity_id ? entities.find(p => p.id === e.parent_entity_id)?.name || e.parent_entity_id.slice(0, 8) : "\u2014"}
                      </td>
                      <td style={{ padding: "12px 14px" }}><Badge label={e.is_active ? "ACTIVE" : "INACTIVE"} color={e.is_active ? HEX.green : HEX.text3} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ── SWEEPS TAB ── */
          <div style={{ maxWidth: 1100 }}>
            <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
              <label style={{ fontSize: 10, fontFamily: S.mono, fontWeight: 700, color: S.text3, letterSpacing: "0.12em" }}>SELECT POOL
                <select value={selectedPoolId} onChange={e => setSelectedPoolId(e.target.value)}
                  style={{ marginLeft: 10, padding: "8px 12px", background: S.deep, color: S.text1, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, fontFamily: S.mono }}>
                  <option value="">Choose a pool...</option>
                  {pools.map(p => <option key={p.id} value={p.id}>{p.name} ({p.pool_type})</option>)}
                </select>
              </label>
            </div>

            {!selectedPoolId && (
              <div style={{ textAlign: "center", padding: 60, color: S.text3, fontSize: 12, fontFamily: S.mono }}>
                Select a pool to view sweep history
              </div>
            )}

            {selectedPoolId && (
              <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.mono }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                      {["DATE", "SOURCE \u2192 DEST", "AMOUNT", "CCY", "DIRECTION", "STATUS"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: h === "AMOUNT" ? "right" : "left", fontSize: 10, fontWeight: 700, color: S.text3, letterSpacing: "0.14em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sweeps.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: S.text3, fontSize: 12 }}>No sweeps recorded</td></tr>}
                    {sweeps.map(sw => (
                      <tr key={sw.id} style={{ borderBottom: `1px solid ${S.rim}` }}>
                        <td style={{ padding: "12px 14px", color: S.text2 }}>{new Date(sw.created_at).toLocaleDateString()}</td>
                        <td style={{ padding: "12px 14px", color: S.text2 }}>{sw.source_account_id.slice(0, 8)} → {sw.destination_account_id.slice(0, 8)}</td>
                        <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 600, color: S.text1 }}>{fmtAmount(sw.amount)}</td>
                        <td style={{ padding: "12px 14px", color: S.text2 }}>{sw.currency}</td>
                        <td style={{ padding: "12px 14px" }}><Badge label={sw.direction} color={sweepDirColor[sw.direction]} /></td>
                        <td style={{ padding: "12px 14px" }}><Badge label={sw.status} color={sweepStatusColor[sw.status]} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CashManagementPage() {
  return (
    <Suspense fallback={
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-deep)" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, border: "2px solid var(--border-rim)", borderTopColor: "var(--accent-cyan)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: 12, color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>LOADING</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    }>
      <CashManagementInner />
    </Suspense>
  );
}
