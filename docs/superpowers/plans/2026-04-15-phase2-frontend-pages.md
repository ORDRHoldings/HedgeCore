# Phase 2 Frontend Pages Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two new frontend pages (`/cash-management` and `/bank-statements`) to surface the Phase 2d/2e/2f backend APIs.

**Architecture:** Extend the existing `cashClient.ts` with typed functions for reconciliation (Phase 2e) and cash pools (Phase 2f). Create two new Next.js page files following the exact tabbed-page pattern used by `/cash-positions` and `/intercompany-netting`. Add sidebar nav entries.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5.9, lucide-react icons, inline CSS with design tokens.

---

## Task 1: Extend cashClient with Reconciliation + Pool API functions

**Files:**
- Modify: `frontend/src/lib/api/cashClient.ts` (append after line 531)

- [ ] **Step 1: Add reconciliation types and functions**

Append to `frontend/src/lib/api/cashClient.ts` after the existing `uploadStatement` function:

```typescript
// ── Reconciliation (Phase 2e) ─────────────────────────────────────

export interface ReconciliationRunResponse {
  matched: number;
  unmatched: number;
  exceptions: number;
}

export interface ReconciliationSummary {
  account_id: string;
  total_transactions: number;
  matched: number;
  unmatched: number;
  exceptions: number;
  match_rate: number;
}

export interface ManualMatchPayload {
  transaction_id: string;
  settlement_id?: string;
  journal_id?: string;
}

export async function runReconciliation(token: string, accountId: string): Promise<ReconciliationRunResponse> {
  return _fetchJson("/v1/cash/reconciliation/run", token, {
    method: "POST",
    body: JSON.stringify({ account_id: accountId }),
  });
}

export async function getReconciliationSummary(token: string, accountId: string): Promise<ReconciliationSummary> {
  return _fetchJson(`/v1/cash/reconciliation/summary?account_id=${accountId}`, token);
}

export async function manualMatch(token: string, payload: ManualMatchPayload): Promise<void> {
  return _fetchJson("/v1/cash/reconciliation/match", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function markException(token: string, txId: string): Promise<void> {
  return _fetchJson(`/v1/cash/reconciliation/exception/${txId}`, token, { method: "POST" });
}

export async function unmatchTransaction(token: string, txId: string): Promise<void> {
  return _fetchJson(`/v1/cash/reconciliation/unmatch/${txId}`, token, { method: "POST" });
}
```

- [ ] **Step 2: Add cash pool types and functions**

Continue appending to `cashClient.ts`:

```typescript
// ── Cash Pools (Phase 2f) ─────────────────────────────────────────

export interface TreasuryPoolEntity {
  id: string;
  company_id: string;
  name: string;
  entity_type: "SUBSIDIARY" | "BRANCH" | "FUND" | "HOLDING" | "SPV";
  base_currency: string;
  country_code: string;
  erp_ref: string | null;
  parent_entity_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CashPool {
  id: string;
  company_id: string;
  name: string;
  pool_type: "NOTIONAL" | "PHYSICAL" | "ZBA";
  header_account_id: string;
  currency: string;
  base_currency: string;
  is_active: boolean;
  member_count: number;
  created_by: string;
  created_at: string;
}

export interface PoolMemberBalance {
  account_id: string;
  entity_id: string;
  ledger_balance: string;
  target_balance: string | null;
  excess: string | null;
  is_exception: boolean;
}

export interface PoolBalance {
  pool_id: string;
  pool_type: string;
  consolidated_balance: string;
  header_balance: string | null;
  currency: string;
  member_balances: PoolMemberBalance[];
}

export interface SweepPreview {
  source_account_id: string;
  destination_account_id: string;
  amount: string;
  currency: string;
  direction: "CONCENTRATION" | "DISTRIBUTION";
}

export interface SweepRecord {
  id: string;
  pool_id: string;
  source_account_id: string;
  destination_account_id: string;
  amount: string;
  currency: string;
  direction: "CONCENTRATION" | "DISTRIBUTION";
  status: "PENDING" | "EXECUTED" | "FAILED" | "CANCELLED";
  triggered_by: string;
  created_at: string;
}

export async function listTreasuryPoolEntities(token: string): Promise<TreasuryPoolEntity[]> {
  return _fetchJson("/v1/cash/pools/entities", token);
}

export async function createTreasuryPoolEntity(
  token: string,
  payload: { name: string; entity_type?: string; base_currency: string; country_code: string; erp_ref?: string; parent_entity_id?: string },
): Promise<TreasuryPoolEntity> {
  return _fetchJson("/v1/cash/pools/entities", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listCashPools(token: string): Promise<CashPool[]> {
  return _fetchJson("/v1/cash/pools/", token);
}

export async function createCashPool(
  token: string,
  payload: { name: string; pool_type: string; header_account_id: string; currency: string; base_currency: string },
): Promise<CashPool> {
  return _fetchJson("/v1/cash/pools/", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPoolDetail(token: string, poolId: string): Promise<CashPool & { members: Array<{ id: string; pool_id: string; account_id: string; entity_id: string; participation_type: string; target_balance: string | null; created_at: string }> }> {
  return _fetchJson(`/v1/cash/pools/${poolId}`, token);
}

export async function addPoolMember(
  token: string,
  poolId: string,
  payload: { account_id: string; entity_id: string; participation_type?: string; target_balance?: string },
): Promise<unknown> {
  return _fetchJson(`/v1/cash/pools/${poolId}/members`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPoolBalance(token: string, poolId: string): Promise<PoolBalance> {
  return _fetchJson(`/v1/cash/pools/${poolId}/balance`, token);
}

export async function calculateSweeps(token: string, poolId: string): Promise<SweepPreview[]> {
  return _fetchJson(`/v1/cash/pools/${poolId}/sweeps/calculate`, token, { method: "POST" });
}

export async function executeSweeps(token: string, poolId: string): Promise<{ sweep_count: number }> {
  return _fetchJson(`/v1/cash/pools/${poolId}/sweeps/execute`, token, { method: "POST" });
}

export async function listSweeps(token: string, poolId: string): Promise<SweepRecord[]> {
  return _fetchJson(`/v1/cash/pools/${poolId}/sweeps`, token);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to cashClient.ts

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api/cashClient.ts
git commit -m "feat: extend cashClient with reconciliation + cash pool API functions"
```

---

## Task 2: Create `/cash-management` page

**Files:**
- Create: `frontend/src/app/cash-management/page.tsx`

- [ ] **Step 1: Create the cash management page**

Create `frontend/src/app/cash-management/page.tsx`:

```tsx
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
                                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{mb.target_balance ? fmtAmount(mb.target_balance) : "—"}</td>
                                    <td style={{ padding: "6px 10px", textAlign: "right" }}>{mb.excess ? fmtAmount(mb.excess) : "—"}</td>
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
                      {e.parent_entity_id ? entities.find(p => p.id === e.parent_entity_id)?.name || e.parent_entity_id.slice(0, 8) : "—"}
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
                    {["DATE", "SOURCE → DEST", "AMOUNT", "CCY", "DIRECTION", "STATUS"].map(h => (
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/cash-management/page.tsx
git commit -m "feat: add /cash-management page — pools, entities, sweeps"
```

---

## Task 3: Create `/bank-statements` page

**Files:**
- Create: `frontend/src/app/bank-statements/page.tsx`

- [ ] **Step 1: Create the bank statements page**

Create `frontend/src/app/bank-statements/page.tsx`:

```tsx
"use client";
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import {
  listStatements, listBankTransactions, uploadStatement, listAccounts,
  runReconciliation, getReconciliationSummary, manualMatch, markException, unmatchTransaction,
  type BankStatementRecord, type BankTransactionRecord, type BankAccount,
  type ReconciliationSummary, type ReconciliationRunResponse,
} from "@/lib/api/cashClient";
import { FileSpreadsheet, Upload, RefreshCw, Check, X, Play, Search } from "lucide-react";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
} as const;

type Tab = "STATEMENTS" | "TRANSACTIONS" | "RECONCILIATION";

const reconStatusColor: Record<string, string> = {
  UNMATCHED: "#f59e0b",
  MATCHED: "#10b981",
  EXCEPTION: "#ef4444",
};

const dirColor: Record<string, string> = {
  DEBIT: "#ef4444",
  CREDIT: "#10b981",
};

const formatColor: Record<string, string> = {
  MT940: "#8b5cf6",
  CAMT053: "#3b82f6",
  BAI2: "#f59e0b",
};

const fmtAmount = (v: string | number) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function BankStatementsInner() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>("STATEMENTS");
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Statements tab
  const [statements, setStatements] = useState<BankStatementRecord[]>([]);
  const [stmtAccountFilter, setStmtAccountFilter] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadAccountId, setUploadAccountId] = useState("");
  const [uploadFormat, setUploadFormat] = useState("MT940");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Transactions tab
  const [transactions, setTransactions] = useState<BankTransactionRecord[]>([]);
  const [txAccountFilter, setTxAccountFilter] = useState("");
  const [txStatusFilter, setTxStatusFilter] = useState("");
  const [txDateFrom, setTxDateFrom] = useState("");
  const [txDateTo, setTxDateTo] = useState("");

  // Reconciliation tab
  const [reconAccountId, setReconAccountId] = useState("");
  const [reconSummary, setReconSummary] = useState<ReconciliationSummary | null>(null);
  const [reconResult, setReconResult] = useState<ReconciliationRunResponse | null>(null);
  const [matchTxId, setMatchTxId] = useState("");
  const [matchSettlementId, setMatchSettlementId] = useState("");
  const [matchJournalId, setMatchJournalId] = useState("");

  const loadAccounts = useCallback(async () => {
    if (!token) return;
    try { setAccounts(await listAccounts(token)); } catch { /* noop */ }
  }, [token]);

  const loadStatements = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try { setStatements(await listStatements(token, stmtAccountFilter || undefined)); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  }, [token, stmtAccountFilter]);

  const loadTransactions = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    const params: Record<string, string> = {};
    if (txAccountFilter) params.account_id = txAccountFilter;
    if (txStatusFilter) params.status = txStatusFilter;
    if (txDateFrom) params.date_from = txDateFrom;
    if (txDateTo) params.date_to = txDateTo;
    try { setTransactions(await listBankTransactions(token, Object.keys(params).length > 0 ? params : undefined)); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); }
  }, [token, txAccountFilter, txStatusFilter, txDateFrom, txDateTo]);

  const loadReconSummary = useCallback(async () => {
    if (!token || !reconAccountId) { setReconSummary(null); return; }
    try { setReconSummary(await getReconciliationSummary(token, reconAccountId)); } catch { setReconSummary(null); }
  }, [token, reconAccountId]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { if (tab === "STATEMENTS") loadStatements(); }, [tab, loadStatements]);
  useEffect(() => { if (tab === "TRANSACTIONS") loadTransactions(); }, [tab, loadTransactions]);
  useEffect(() => { if (tab === "RECONCILIATION") loadReconSummary(); }, [tab, loadReconSummary]);

  const handleUpload = async () => {
    if (!token || !uploadFile || !uploadAccountId) return;
    setUploading(true); setError(null);
    try {
      await uploadStatement(token, uploadFile, uploadAccountId, uploadFormat);
      setShowUpload(false); setUploadFile(null); setUploadAccountId("");
      loadStatements();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Upload failed"); } finally { setUploading(false); }
  };

  const handleRunRecon = async () => {
    if (!token || !reconAccountId) return;
    setError(null);
    try {
      const result = await runReconciliation(token, reconAccountId);
      setReconResult(result);
      loadReconSummary();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Reconciliation failed"); }
  };

  const handleManualMatch = async () => {
    if (!token || !matchTxId || (!matchSettlementId && !matchJournalId)) return;
    try {
      await manualMatch(token, {
        transaction_id: matchTxId,
        settlement_id: matchSettlementId || undefined,
        journal_id: matchJournalId || undefined,
      });
      setMatchTxId(""); setMatchSettlementId(""); setMatchJournalId("");
      loadReconSummary();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Match failed"); }
  };

  const handleMarkException = async (txId: string) => {
    if (!token) return;
    try { await markException(token, txId); loadTransactions(); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
  };

  const handleUnmatch = async (txId: string) => {
    if (!token) return;
    try { await unmatchTransaction(token, txId); loadTransactions(); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
  };

  const accountName = (id: string) => accounts.find(a => a.id === id)?.nickname || id.slice(0, 8);

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "STATEMENTS", label: "STATEMENTS", icon: FileSpreadsheet },
    { key: "TRANSACTIONS", label: "TRANSACTIONS", icon: Search },
    { key: "RECONCILIATION", label: "RECONCILIATION", icon: Check },
  ];

  return (
    <div style={{ fontFamily: S.fontUI, padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FileSpreadsheet size={22} color="var(--accent-primary)" />
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Bank Statements</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Hedge Desk → Statements & Reconciliation</div>
          </div>
        </div>
        <button onClick={() => { if (tab === "STATEMENTS") loadStatements(); else if (tab === "TRANSACTIONS") loadTransactions(); else loadReconSummary(); }}
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

      {/* ── STATEMENTS TAB ── */}
      {tab === "STATEMENTS" && !loading && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
            <select value={stmtAccountFilter} onChange={e => setStmtAccountFilter(e.target.value)}
              style={{ padding: 8, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, fontFamily: S.fontMono }}>
              <option value="">All Accounts</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname} ({a.currency})</option>)}
            </select>
            <button onClick={() => setShowUpload(!showUpload)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>
              <Upload size={14} />UPLOAD STATEMENT
            </button>
          </div>

          {showUpload && (
            <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>ACCOUNT
                  <select value={uploadAccountId} onChange={e => setUploadAccountId(e.target.value)}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                    <option value="">Select...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname} ({a.currency})</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>FORMAT
                  <select value={uploadFormat} onChange={e => setUploadFormat(e.target.value)}
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                    <option value="MT940">MT940</option><option value="CAMT053">CAMT053</option><option value="BAI2">BAI2</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, fontFamily: S.fontMono }}>FILE
                  <input type="file" accept=".txt,.xml,.bai" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    style={{ width: "100%", padding: 6, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12 }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadAccountId}
                  style={{ padding: "8px 16px", background: uploading ? "#6b7280" : "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: uploading ? "wait" : "pointer" }}>
                  {uploading ? "UPLOADING..." : "UPLOAD"}
                </button>
                <button onClick={() => setShowUpload(false)} style={{ padding: "8px 16px", background: "transparent", color: "#9ca3af", border: `1px solid ${S.rim}`, borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>CANCEL</button>
              </div>
            </div>
          )}

          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["ACCOUNT", "DATE", "OPENING", "CLOSING", "CCY", "FORMAT", "TXs", "FILE"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statements.length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No statements imported</td></tr>}
                {statements.map(s => (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${S.rim}22` }}>
                    <td style={{ padding: "10px 12px" }}>{accountName(s.account_id)}</td>
                    <td style={{ padding: "10px 12px" }}>{s.statement_date}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtAmount(s.opening_balance)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtAmount(s.closing_balance)}</td>
                    <td style={{ padding: "10px 12px" }}>{s.currency}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${formatColor[s.format] || "#6b7280"}22`, color: formatColor[s.format] || "#6b7280" }}>{s.format}</span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>{s.transaction_count}</td>
                    <td style={{ padding: "10px 12px", color: "#9ca3af", fontSize: 11 }}>{s.filename || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TRANSACTIONS TAB ── */}
      {tab === "TRANSACTIONS" && !loading && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af" }}>ACCOUNT
              <select value={txAccountFilter} onChange={e => setTxAccountFilter(e.target.value)}
                style={{ display: "block", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                <option value="">All</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af" }}>STATUS
              <select value={txStatusFilter} onChange={e => setTxStatusFilter(e.target.value)}
                style={{ display: "block", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }}>
                <option value="">All</option>
                <option value="UNMATCHED">UNMATCHED</option>
                <option value="MATCHED">MATCHED</option>
                <option value="EXCEPTION">EXCEPTION</option>
              </select>
            </label>
            <label style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af" }}>FROM
              <input type="date" value={txDateFrom} onChange={e => setTxDateFrom(e.target.value)}
                style={{ display: "block", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }} />
            </label>
            <label style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af" }}>TO
              <input type="date" value={txDateTo} onChange={e => setTxDateTo(e.target.value)}
                style={{ display: "block", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13 }} />
            </label>
          </div>

          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: S.fontMono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["DATE", "AMOUNT", "CCY", "DIR", "DESCRIPTION", "COUNTERPARTY", "REF", "STATUS", "ACTIONS"].map(h => (
                    <th key={h} style={{ padding: "10px 10px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "#9ca3af", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>No transactions found</td></tr>}
                {transactions.map(tx => (
                  <tr key={tx.id} style={{ borderBottom: `1px solid ${S.rim}22` }}>
                    <td style={{ padding: "8px 10px" }}>{tx.tx_date}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>{fmtAmount(tx.amount)}</td>
                    <td style={{ padding: "8px 10px" }}>{tx.currency}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: `${dirColor[tx.direction]}22`, color: dirColor[tx.direction] }}>{tx.direction}</span>
                    </td>
                    <td style={{ padding: "8px 10px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.description || "—"}</td>
                    <td style={{ padding: "8px 10px", color: "#9ca3af" }}>{tx.counterparty || "—"}</td>
                    <td style={{ padding: "8px 10px", color: "#9ca3af" }}>{tx.reference || "—"}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${reconStatusColor[tx.reconciliation_status]}22`, color: reconStatusColor[tx.reconciliation_status] }}>{tx.reconciliation_status}</span>
                    </td>
                    <td style={{ padding: "8px 10px", display: "flex", gap: 4 }}>
                      {tx.reconciliation_status === "UNMATCHED" && (
                        <button onClick={() => handleMarkException(tx.id)} title="Mark Exception" style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 2 }}><X size={13} /></button>
                      )}
                      {tx.reconciliation_status === "MATCHED" && (
                        <button onClick={() => handleUnmatch(tx.id)} title="Unmatch" style={{ background: "none", border: "none", color: "#f59e0b", cursor: "pointer", padding: 2 }}><X size={13} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── RECONCILIATION TAB ── */}
      {tab === "RECONCILIATION" && !loading && (
        <div>
          <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "flex-end" }}>
            <label style={{ fontSize: 11, fontFamily: S.fontMono, color: "#9ca3af" }}>ACCOUNT
              <select value={reconAccountId} onChange={e => setReconAccountId(e.target.value)}
                style={{ display: "block", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 13, minWidth: 200 }}>
                <option value="">Select account...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname} ({a.currency})</option>)}
              </select>
            </label>
            <button onClick={handleRunRecon} disabled={!reconAccountId}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: reconAccountId ? "#2563eb" : "#6b7280", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: reconAccountId ? "pointer" : "not-allowed" }}>
              <Play size={14} />RUN AUTO-RECONCILIATION
            </button>
          </div>

          {/* KPI Strip */}
          {reconSummary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: "TOTAL", value: reconSummary.total_transactions, color: "#fff" },
                { label: "MATCHED", value: reconSummary.matched, color: "#10b981" },
                { label: "UNMATCHED", value: reconSummary.unmatched, color: "#f59e0b" },
                { label: "MATCH RATE", value: `${reconSummary.match_rate.toFixed(1)}%`, color: reconSummary.match_rate >= 80 ? "#10b981" : "#f59e0b" },
              ].map(kpi => (
                <div key={kpi.label} style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontFamily: S.fontMono, color: "#9ca3af", fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>{kpi.label}</div>
                  <div style={{ fontSize: 24, fontFamily: S.fontMono, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Last run result */}
          {reconResult && (
            <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 6, padding: "10px 14px", marginBottom: 16, fontSize: 12, fontFamily: S.fontMono }}>
              Auto-reconciliation complete: {reconResult.matched} matched, {reconResult.unmatched} unmatched, {reconResult.exceptions} exceptions
            </div>
          )}

          {/* Manual Match */}
          {reconAccountId && (
            <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontFamily: S.fontMono, fontWeight: 600, marginBottom: 12, color: "#9ca3af" }}>MANUAL MATCH</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 11, fontFamily: S.fontMono }}>TRANSACTION ID
                  <input value={matchTxId} onChange={e => setMatchTxId(e.target.value)} placeholder="UUID"
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12, fontFamily: S.fontMono, boxSizing: "border-box" }} />
                </label>
                <label style={{ fontSize: 11, fontFamily: S.fontMono }}>SETTLEMENT ID (optional)
                  <input value={matchSettlementId} onChange={e => setMatchSettlementId(e.target.value)} placeholder="UUID"
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12, fontFamily: S.fontMono, boxSizing: "border-box" }} />
                </label>
                <label style={{ fontSize: 11, fontFamily: S.fontMono }}>JOURNAL ID (optional)
                  <input value={matchJournalId} onChange={e => setMatchJournalId(e.target.value)} placeholder="UUID"
                    style={{ width: "100%", padding: 8, marginTop: 4, background: S.bgDeep, color: "#fff", border: `1px solid ${S.rim}`, borderRadius: 4, fontSize: 12, fontFamily: S.fontMono, boxSizing: "border-box" }} />
                </label>
              </div>
              <button onClick={handleManualMatch} disabled={!matchTxId || (!matchSettlementId && !matchJournalId)}
                style={{ marginTop: 12, padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontFamily: S.fontMono, cursor: "pointer" }}>
                MATCH
              </button>
            </div>
          )}

          {!reconAccountId && <div style={{ color: "#6b7280", textAlign: "center", padding: 40, fontSize: 13 }}>Select an account to view reconciliation status</div>}
        </div>
      )}
    </div>
  );
}

export default function BankStatementsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#6b7280" }}>Loading...</div>}>
      <BankStatementsInner />
    </Suspense>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/bank-statements/page.tsx
git commit -m "feat: add /bank-statements page — import, transactions, reconciliation"
```

---

## Task 4: Add sidebar navigation entries

**Files:**
- Modify: `frontend/src/components/layout/AppSidebar.tsx:22-29` (icon imports)
- Modify: `frontend/src/components/layout/AppSidebar.tsx:112` (nav items, after IC Netting)

- [ ] **Step 1: Add icon imports**

In `frontend/src/components/layout/AppSidebar.tsx`, add `Layers` and `FileSpreadsheet` to the lucide-react import on line 28:

Change line 28 from:
```typescript
  DollarSign, RefreshCw, BarChart2, Building2, CreditCard, Link2, TrendingUp, GitMerge,
```
to:
```typescript
  DollarSign, RefreshCw, BarChart2, Building2, CreditCard, Link2, TrendingUp, GitMerge, Layers, FileSpreadsheet,
```

- [ ] **Step 2: Add nav entries**

After the IC Netting entry on line 112:
```typescript
      { label: "IC Netting", desc: "Intercompany netting & settlement optimization",  href: "/intercompany-netting", icon: GitMerge, group: "ACCOUNTING", minTier: "professional" as PlanTier },
```

Add these two lines:
```typescript
      { label: "Cash Pools", desc: "Multi-entity cash pooling & sweep management",  href: "/cash-management", icon: Layers, group: "ACCOUNTING", minTier: "professional" as PlanTier },
      { label: "Bank Statements", desc: "Statement import & auto-reconciliation",  href: "/bank-statements", icon: FileSpreadsheet, group: "ACCOUNTING", minTier: "professional" as PlanTier },
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Verify build succeeds**

Run: `cd frontend && npx next build 2>&1 | tail -20`
Expected: Build completes without errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AppSidebar.tsx
git commit -m "feat: add Cash Pools + Bank Statements to sidebar navigation"
```
