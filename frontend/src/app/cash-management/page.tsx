"use client";
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import {
  listCashPools, getPoolBalance, calculateSweeps, executeSweeps, listSweeps,
  listTreasuryPoolEntities, createTreasuryPoolEntity, createCashPool, listAccounts,
  type CashPool, type PoolBalance, type SweepPreview, type SweepRecord,
  type TreasuryPoolEntity, type BankAccount,
} from "@/lib/api/cashClient";
import { Layers, Plus, Play, Calculator, Building2, ArrowRightLeft, RefreshCw } from "lucide-react";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
} as const;

type Tab = "POOLS" | "ENTITIES" | "SWEEPS";

const poolTypeColor: Record<string, string> = {
  NOTIONAL: "#8b5cf6",
  PHYSICAL: "#3b82f6",
  ZBA: "#f59e0b",
};

const sweepDirColor: Record<string, string> = {
  CONCENTRATION: "#3b82f6",
  DISTRIBUTION: "#f59e0b",
};

const sweepStatusColor: Record<string, string> = {
  PENDING: "#f59e0b",
  EXECUTED: "#10b981",
  FAILED: "#ef4444",
  CANCELLED: "#6b7280",
};

const entityTypeColor: Record<string, string> = {
  SUBSIDIARY: "#3b82f6",
  BRANCH: "#10b981",
  FUND: "#8b5cf6",
  HOLDING: "#f59e0b",
  SPV: "#ec4899",
};

const fmtAmount = (v: string | number) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function CashManagementInner() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("POOLS");
  const [pools, setPools] = useState<CashPool[]>([]);
  const [entities, setEntities] = useState<TreasuryPoolEntity[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pool detail state
  const [expandedPool, setExpandedPool] = useState<string | null>(null);
  const [poolBalance, setPoolBalance] = useState<PoolBalance | null>(null);
  const [sweepPreview, setSweepPreview] = useState<SweepPreview[] | null>(null);

  // Sweep history state
  const [selectedPoolId, setSelectedPoolId] = useState<string>("");
  const [sweeps, setSweeps] = useState<SweepRecord[]>([]);

  // Create forms
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

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "POOLS", label: "POOLS", icon: Layers },
    { key: "ENTITIES", label: "ENTITIES", icon: Building2 },
    { key: "SWEEPS", label: "SWEEPS", icon: ArrowRightLeft },
  ];

  return (
    <div style={{ fontFamily: S.fontUI, padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Layers size={22} color="var(--accent-primary)" />
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Cash Management</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Hedge Desk → Cash Pools & Multi-Entity</div>
          </div>
        </div>
        <button onClick={() => { if (tab === "POOLS") loadPools(); else if (tab === "ENTITIES") loadEntities(); else loadSweeps(); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: S.fontMono, color: "var(--text-primary)" }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && <div style={{ background: "#7f1d1d", color: "#fca5a5", padding: "8px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{error}<button onClick={() => setError(null)} style={{ float: "right", background: "none", border: "none", color: "#fca5a5", cursor: "pointer" }}>x</button></div>}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase",
              background: tab === t.key ? S.bgPanel : "transparent", color: tab === t.key ? "#fff" : "#9ca3af",
              border: `1px solid ${tab === t.key ? S.rim : "transparent"}`, borderRadius: 6, cursor: "pointer" }}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: "#9ca3af", fontSize: 13, padding: 20 }}>Loading...</div>}

      {/* ── POOLS TAB ── */}
      {tab === "POOLS" && !loading && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setShowPoolForm(!showPoolForm)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>
              <Plus size={14} />CREATE POOL
            </button>
          </div>

          {showPoolForm && (
            <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>NAME
                  <input value={poolForm.name} onChange={e => setPoolForm({ ...poolForm, name: e.target.value })}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, boxSizing: "border-box" }} />
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>POOL TYPE
                  <select value={poolForm.pool_type} onChange={e => setPoolForm({ ...poolForm, pool_type: e.target.value })}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                    <option value="NOTIONAL">NOTIONAL</option><option value="PHYSICAL">PHYSICAL</option><option value="ZBA">ZBA</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>HEADER ACCOUNT
                  <select value={poolForm.header_account_id} onChange={e => setPoolForm({ ...poolForm, header_account_id: e.target.value })}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                    <option value="">Select...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname} ({a.currency})</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>CURRENCY
                  <input value={poolForm.currency} onChange={e => setPoolForm({ ...poolForm, currency: e.target.value.toUpperCase(), base_currency: e.target.value.toUpperCase() })} maxLength={3}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, boxSizing: "border-box" }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={handleCreatePool} style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>CREATE</button>
                <button onClick={() => setShowPoolForm(false)} style={{ padding: "8px 16px", background: "transparent", color: "#9ca3af", border: `1px solid ${S.rim}`, borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>CANCEL</button>
              </div>
            </div>
          )}

          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["NAME", "TYPE", "CURRENCY", "MEMBERS", "STATUS"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pools.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No pools configured</td></tr>}
                {pools.map(p => (
                  <React.Fragment key={p.id}>
                    <tr onClick={() => handleExpandPool(p.id)} style={{ borderBottom: `1px solid ${S.rim}22`, cursor: "pointer" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${poolTypeColor[p.pool_type] || "#6b7280"}22`, color: poolTypeColor[p.pool_type] || "#6b7280" }}>{p.pool_type}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>{p.currency}</td>
                      <td style={{ padding: "10px 12px" }}>{p.member_count}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: p.is_active ? "rgba(16,185,129,0.15)" : "rgba(107,114,128,0.15)", color: p.is_active ? "#10b981" : "#6b7280" }}>{p.is_active ? "ACTIVE" : "INACTIVE"}</span>
                      </td>
                    </tr>
                    {expandedPool === p.id && poolBalance && (
                      <tr><td colSpan={5} style={{ padding: 0 }}>
                        <div style={{ background: S.bgSub, padding: 16, borderBottom: `1px solid ${S.rim}` }}>
                          {/* Consolidated balance */}
                          <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16, flex: 1 }}>
                              <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 4 }}>CONSOLIDATED BALANCE</div>
                              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: S.fontMono }}>{fmtAmount(poolBalance.consolidated_balance)} <span style={{ fontSize: 12, color: "#9ca3af" }}>{poolBalance.currency}</span></div>
                            </div>
                            {poolBalance.header_balance !== null && (
                              <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16, flex: 1 }}>
                                <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 4 }}>HEADER BALANCE</div>
                                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: S.fontMono }}>{fmtAmount(poolBalance.header_balance)}</div>
                              </div>
                            )}
                          </div>

                          {/* Member balances */}
                          {poolBalance.member_balances.length > 0 && (
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono, marginBottom: 12 }}>
                              <thead>
                                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                                  {["ACCOUNT", "ENTITY", "LEDGER", "TARGET", "EXCESS", ""].map(h => (
                                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, color: "#9ca3af" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {poolBalance.member_balances.map((mb, i) => (
                                  <tr key={i} style={{ borderBottom: `1px solid ${S.rim}22` }}>
                                    <td style={{ padding: "6px 10px" }}>{mb.account_id.slice(0, 8)}...</td>
                                    <td style={{ padding: "6px 10px" }}>{mb.entity_id.slice(0, 8)}...</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtAmount(mb.ledger_balance)}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{mb.target_balance ? fmtAmount(mb.target_balance) : "\u2014"}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{mb.excess ? fmtAmount(mb.excess) : "\u2014"}</td>
                                    <td style={{ padding: "6px 10px" }}>
                                      {mb.is_exception && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>EXCEPTION</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}

                          {/* Sweep actions */}
                          {p.pool_type !== "NOTIONAL" && (
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => handleCalculateSweeps(p.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12, fontFamily: S.fontMono, color: "#fff", cursor: "pointer" }}>
                                <Calculator size={12} />Calculate Sweeps
                              </button>
                              {sweepPreview && sweepPreview.length > 0 && (
                                <button onClick={() => handleExecuteSweeps(p.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#2563eb", border: "none", borderRadius: 4, fontSize: 12, fontFamily: S.fontMono, color: "#fff", cursor: "pointer" }}>
                                  <Play size={12} />Execute {sweepPreview.length} Sweep{sweepPreview.length !== 1 ? "s" : ""}
                                </button>
                              )}
                            </div>
                          )}

                          {/* Sweep preview */}
                          {sweepPreview && sweepPreview.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                              <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 6 }}>SWEEP PREVIEW</div>
                              {sweepPreview.map((sw, i) => (
                                <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, padding: "4px 0" }}>
                                  <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: 10, background: `${sweepDirColor[sw.direction]}22`, color: sweepDirColor[sw.direction] }}>{sw.direction}</span>
                                  <span>{fmtAmount(sw.amount)} {sw.currency}</span>
                                  <span style={{ color: "#9ca3af" }}>{sw.source_account_id.slice(0, 8)} → {sw.destination_account_id.slice(0, 8)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {sweepPreview && sweepPreview.length === 0 && (
                            <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>No sweeps needed — all members at target.</div>
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
      )}

      {/* ── ENTITIES TAB ── */}
      {tab === "ENTITIES" && !loading && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setShowEntityForm(!showEntityForm)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>
              <Plus size={14} />CREATE ENTITY
            </button>
          </div>

          {showEntityForm && (
            <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>NAME
                  <input value={entityForm.name} onChange={e => setEntityForm({ ...entityForm, name: e.target.value })}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, boxSizing: "border-box" }} />
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>TYPE
                  <select value={entityForm.entity_type} onChange={e => setEntityForm({ ...entityForm, entity_type: e.target.value })}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                    {["SUBSIDIARY", "BRANCH", "FUND", "HOLDING", "SPV"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>BASE CURRENCY
                  <input value={entityForm.base_currency} onChange={e => setEntityForm({ ...entityForm, base_currency: e.target.value.toUpperCase() })} maxLength={3}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, boxSizing: "border-box" }} />
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>COUNTRY CODE
                  <input value={entityForm.country_code} onChange={e => setEntityForm({ ...entityForm, country_code: e.target.value.toUpperCase() })} maxLength={2} placeholder="GB"
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, boxSizing: "border-box" }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={handleCreateEntity} style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>CREATE</button>
                <button onClick={() => setShowEntityForm(false)} style={{ padding: "8px 16px", background: "transparent", color: "#9ca3af", border: `1px solid ${S.rim}`, borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>CANCEL</button>
              </div>
            </div>
          )}

          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["NAME", "TYPE", "CURRENCY", "COUNTRY", "PARENT", "STATUS"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entities.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No treasury entities</td></tr>}
                {entities.map(e => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${S.rim}22` }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>{e.name}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${entityTypeColor[e.entity_type] || "#6b7280"}22`, color: entityTypeColor[e.entity_type] || "#6b7280" }}>{e.entity_type}</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>{e.base_currency}</td>
                    <td style={{ padding: "10px 12px" }}>{e.country_code}</td>
                    <td style={{ padding: "10px 12px", color: "#9ca3af" }}>
                      {e.parent_entity_id ? entities.find(p => p.id === e.parent_entity_id)?.name || e.parent_entity_id.slice(0, 8) : "\u2014"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: e.is_active ? "rgba(16,185,129,0.15)" : "rgba(107,114,128,0.15)", color: e.is_active ? "#10b981" : "#6b7280" }}>{e.is_active ? "ACTIVE" : "INACTIVE"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SWEEPS TAB ── */}
      {tab === "SWEEPS" && !loading && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontFamily: S.fontMono, color: "#9ca3af" }}>SELECT POOL
              <select value={selectedPoolId} onChange={e => setSelectedPoolId(e.target.value)}
                style={{ marginLeft: 10, padding: 8, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                <option value="">Choose a pool...</option>
                {pools.map(p => <option key={p.id} value={p.id}>{p.name} ({p.pool_type})</option>)}
              </select>
            </label>
          </div>

          {!selectedPoolId && <div style={{ color: "#6b7280", textAlign: "center", padding: 40, fontSize: 13 }}>Select a pool to view sweep history</div>}

          {selectedPoolId && (
            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.fontMono }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                    {["DATE", "SOURCE \u2192 DEST", "AMOUNT", "CCY", "DIRECTION", "STATUS"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sweeps.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No sweeps recorded</td></tr>}
                  {sweeps.map(sw => (
                    <tr key={sw.id} style={{ borderBottom: `1px solid ${S.rim}22` }}>
                      <td style={{ padding: "10px 12px" }}>{new Date(sw.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: "10px 12px" }}>{sw.source_account_id.slice(0, 8)} → {sw.destination_account_id.slice(0, 8)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>{fmtAmount(sw.amount)}</td>
                      <td style={{ padding: "10px 12px" }}>{sw.currency}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${sweepDirColor[sw.direction]}22`, color: sweepDirColor[sw.direction] }}>{sw.direction}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${sweepStatusColor[sw.status]}22`, color: sweepStatusColor[sw.status] }}>{sw.status}</span>
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

export default function CashManagementPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#6b7280" }}>Loading...</div>}>
      <CashManagementInner />
    </Suspense>
  );
}
