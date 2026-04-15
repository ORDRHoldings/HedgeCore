# Phase 2 Frontend Pages — Cash Management & Bank Statements

**Date:** 2026-04-15  
**Status:** APPROVED  
**Author:** ORDR Edge  
**Related:** Treasury Suite §4.5, Phase 2d/2e/2f backend

---

## 1. Summary

Two new frontend pages to surface the Phase 2d (bank statements), 2e (auto-reconciliation), and 2f (cash pools/sweeps) backend work. All existing pages (`/cash-positions`, `/cash-forecast`, `/intercompany-netting`) remain unchanged.

---

## 2. New Pages

### 2.1 `/cash-management` — Cash Pool & Multi-Entity Dashboard

Three-tab layout following the existing tabbed page pattern (`/cash-positions`, `/intercompany-netting`).

**Tab: POOLS**
- Table listing all cash pools (name, type badge, currency, member count, active status)
- Click pool row → expand inline detail panel showing:
  - Pool metadata (type, header account, currency)
  - Member balances table (account, entity, ledger balance, target, excess)
  - Consolidated balance (pool-type-specific: NOTIONAL=SUM, PHYSICAL=header+excess, ZBA=header)
  - Action buttons: "Calculate Sweeps" → preview, "Execute Sweeps" → persist
- "Create Pool" button → inline form (name, type select, header account, currency)

**Tab: ENTITIES**
- Table listing treasury entities (name, type badge, base currency, country, parent, active status)
- Hierarchy indicator: indented or parent name column
- "Create Entity" button → inline form (name, type select, base currency, country code)

**Tab: SWEEPS**
- Pool selector dropdown at top
- Sweep history table (date, source→destination, amount, currency, direction badge, status badge)
- Direction badges: CONCENTRATION (blue), DISTRIBUTION (amber)
- Status badges: PENDING (amber), EXECUTED (green), FAILED (red), CANCELLED (gray)

### 2.2 `/bank-statements` — Statement Import & Reconciliation

Three-tab layout.

**Tab: STATEMENTS**
- Table listing imported statements (account nickname, date, opening/closing balance, currency, format badge, tx count, filename)
- Account filter dropdown at top
- "Upload Statement" button → file picker + account selector + format selector → POST multipart
- Click statement row → navigate to TRANSACTIONS tab filtered by statement

**Tab: TRANSACTIONS**
- Filterable transaction list with controls: account dropdown, date range, reconciliation status dropdown
- Table columns: date, value date, amount, currency, direction badge (DEBIT red / CREDIT green), description, counterparty, reference, reconciliation status badge
- Status badges: UNMATCHED (amber), MATCHED (green), EXCEPTION (red)

**Tab: RECONCILIATION**
- KPI strip at top: matched count, unmatched count, exception count, match rate %
- "Run Auto-Reconciliation" button → POST /run → refresh summary
- Account filter dropdown
- Summary card showing last run results
- Manual match form: select unmatched transaction → enter settlement_id or journal_id → POST /match
- Exception list with "Mark Exception" and "Unmatch" action buttons

---

## 3. API Client Extensions

Add to `frontend/src/lib/api/cashClient.ts`:

### 3.1 Reconciliation Types & Functions

```typescript
interface ReconciliationSummary {
  account_id: string;
  total_transactions: number;
  matched: number;
  unmatched: number;
  exceptions: number;
  match_rate: number;
}

interface ReconciliationRunResponse {
  matched: number;
  unmatched: number;
  exceptions: number;
}

runReconciliation(token, accountId)        → POST /v1/cash/reconciliation/run
getReconciliationSummary(token, accountId) → GET  /v1/cash/reconciliation/summary
manualMatch(token, payload)                → POST /v1/cash/reconciliation/match
markException(token, txId)                 → POST /v1/cash/reconciliation/exception/{id}
unmatchTransaction(token, txId)            → POST /v1/cash/reconciliation/unmatch/{id}
```

### 3.2 Cash Pool Types & Functions

```typescript
interface TreasuryEntity {
  id: string; company_id: string; name: string;
  entity_type: "SUBSIDIARY"|"BRANCH"|"FUND"|"HOLDING"|"SPV";
  base_currency: string; country_code: string;
  erp_ref: string|null; parent_entity_id: string|null;
  is_active: boolean; created_at: string;
}

interface CashPool {
  id: string; company_id: string; name: string;
  pool_type: "NOTIONAL"|"PHYSICAL"|"ZBA";
  header_account_id: string; currency: string;
  base_currency: string; is_active: boolean;
  member_count: number; created_by: string; created_at: string;
}

interface PoolMemberBalance {
  account_id: string; entity_id: string;
  ledger_balance: string; target_balance: string|null;
  excess: string|null; is_exception: boolean;
}

interface PoolBalance {
  pool_id: string; pool_type: string;
  consolidated_balance: string; header_balance: string|null;
  currency: string; member_balances: PoolMemberBalance[];
}

interface SweepRecord {
  id: string; pool_id: string;
  source_account_id: string; destination_account_id: string;
  amount: string; currency: string;
  direction: "CONCENTRATION"|"DISTRIBUTION";
  status: "PENDING"|"EXECUTED"|"FAILED"|"CANCELLED";
  triggered_by: string; created_at: string;
}

listTreasuryEntities(token)                → GET  /v1/cash/pools/entities
createTreasuryEntity(token, payload)       → POST /v1/cash/pools/entities
listCashPools(token)                       → GET  /v1/cash/pools/
createCashPool(token, payload)             → POST /v1/cash/pools/
getPoolDetail(token, poolId)               → GET  /v1/cash/pools/{id}
addPoolMember(token, poolId, payload)      → POST /v1/cash/pools/{id}/members
getPoolBalance(token, poolId)              → GET  /v1/cash/pools/{id}/balance
calculateSweeps(token, poolId)             → POST /v1/cash/pools/{id}/sweeps/calculate
executeSweeps(token, poolId)               → POST /v1/cash/pools/{id}/sweeps/execute
listSweeps(token, poolId)                  → GET  /v1/cash/pools/{id}/sweeps
```

---

## 4. Sidebar Navigation

Two new entries in the ACCOUNTING group of `AppSidebar.tsx`, after "IC Netting":

| Label | Icon | Route | minTier |
|-------|------|-------|---------|
| Cash Pools | Layers | /cash-management | professional |
| Bank Statements | FileSpreadsheet | /bank-statements | professional |

---

## 5. Conventions

All pages follow existing patterns:
- Inline style object `S` with CSS variable tokens
- `useAuth()` hook for token + user
- `useCallback` + `useEffect` data loading pattern
- `cashClient` typed functions via `_fetchJson<T>()`
- Error/loading/empty state handling
- Monospace font for numeric data
- Status badges with conditional color
- Suspense wrapper for pages using `useSearchParams`
- No PageShell nesting (pages render inside existing layout)

---

## 6. File Manifest

| Action | Path |
|--------|------|
| Create | `frontend/src/app/cash-management/page.tsx` |
| Create | `frontend/src/app/bank-statements/page.tsx` |
| Modify | `frontend/src/lib/api/cashClient.ts` |
| Modify | `frontend/src/components/layout/AppSidebar.tsx` |
