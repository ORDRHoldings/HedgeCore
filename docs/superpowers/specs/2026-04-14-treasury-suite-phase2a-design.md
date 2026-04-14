# Treasury Suite Phase 2a — Bank Accounts & Cash Positions

**Date:** 2026-04-14
**Status:** Approved for implementation
**Follows:** Treasury Suite Phase 1 (GL Journals, Settlement, ERP Pull)
**Phase 2 Roadmap:** 2a (this) → 2b (Forecasting) → 2c (Netting) → 2d (Working Capital) → 2e (Bank Statement Import) → 2f (Cash Flow Hedging) → 2g (Stress Testing) → 2h (Cash Concentration) → 2i (Counterparty Credit) → 2j (Cash Reporting)

---

## Goal

Deliver institutional-grade cash position management for corporate treasury teams: multi-entity group structure, multi-bank multi-currency account registry, Fortune 500-quality audit trail, and a live three-tab cash position dashboard sourced from manual entry and/or TrueLayer/Plaid open banking.

---

## Architecture

**Data hierarchy:** `Company → LegalEntity → BankAccount → CashBalance (time-series)`

**Balance sourcing:** Manual entry (always available) + TrueLayer (Europe/UK, PSD2) + Plaid (US/CA) via a provider-agnostic `BankProviderAdapter` ABC. One `BankConnection` covers all accounts at the same institution — OAuth tokens stored encrypted, never raw.

**Audit:** SHA-256 hash-chained `cash_audit_events` table (append-only, WORM) — same pattern as `audit_events` and Phase 1's `journal_entries`. Every account lifecycle event and balance correction is tamper-evident.

**Tech stack:** Python 3.12, FastAPI, SQLAlchemy 2.x async, Alembic (raw SQL migrations), Next.js 15 App Router, TypeScript 5, `lucide-react`, IBM Plex fonts.

---

## Data Model

### `legal_entities`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| company_id | UUID FK → companies | tenant scope |
| parent_entity_id | UUID FK → legal_entities | nullable — entity hierarchy |
| legal_name | VARCHAR(255) | full registered name |
| short_name | VARCHAR(100) | display name |
| lei | VARCHAR(20) | ISO 17442 Legal Entity Identifier |
| giin | VARCHAR(19) | FATCA identifier, nullable |
| registration_number | VARCHAR(100) | nullable |
| jurisdiction | VARCHAR(100) | |
| country | CHAR(2) | ISO 3166-1 alpha-2 |
| functional_currency | CHAR(3) | ISO 4217 — entity's operating currency |
| reporting_currency | CHAR(3) | ISO 4217 — group consolidation currency |
| status | ENUM | ACTIVE, DORMANT, LIQUIDATED |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| version | INTEGER | optimistic locking |

### `bank_connections`
One OAuth connection per institution per tenant. Separated from accounts so one token covers all accounts at the same bank.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| company_id | UUID FK → companies | |
| provider | ENUM | TRUELAYER, PLAID |
| institution_id | VARCHAR(100) | provider's bank identifier |
| institution_name | VARCHAR(255) | |
| access_token_enc | TEXT | AES-256 encrypted |
| refresh_token_enc | TEXT | AES-256 encrypted |
| token_expires_at | TIMESTAMPTZ | |
| scope | VARCHAR(255) | |
| status | ENUM | ACTIVE, EXPIRED, REVOKED, ERROR |
| last_successful_pull_at | TIMESTAMPTZ | |
| last_error_at | TIMESTAMPTZ | |
| last_error_message | TEXT | |
| consecutive_failure_count | INTEGER | default 0; ≥3 → status=ERROR |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `bank_accounts`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| entity_id | UUID FK → legal_entities | |
| bank_name | VARCHAR(255) | |
| bank_lei | VARCHAR(20) | bank's own LEI, nullable |
| bank_bic | VARCHAR(11) | SWIFT/BIC |
| account_number_enc | TEXT | AES-256 encrypted |
| iban_enc | TEXT | AES-256 encrypted, nullable |
| account_type | ENUM | OPERATING, CONCENTRATION, PAYROLL, RESTRICTED, MONEY_MARKET, ESCROW, NOSTRO, VOSTRO |
| currency | CHAR(3) | ISO 4217 |
| nickname | VARCHAR(100) | |
| purpose | TEXT | nullable |
| overdraft_limit | NUMERIC(20,6) | default 0 |
| min_balance_threshold | NUMERIC(20,6) | alert threshold, nullable |
| gl_debit_code | VARCHAR(50) | links to Phase 1 GLAccountMapping |
| gl_credit_code | VARCHAR(50) | |
| api_connection_id | UUID FK → bank_connections | nullable — manual accounts have no connection |
| api_account_id | VARCHAR(255) | provider's account identifier |
| status | ENUM | PENDING_VERIFICATION, ACTIVE, FROZEN, CLOSED |
| verified_by | UUID FK → users | nullable |
| verified_at | TIMESTAMPTZ | |
| approved_by | UUID FK → users | nullable — 4-eyes: approved_by ≠ created_by |
| approved_at | TIMESTAMPTZ | |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |
| closed_at | TIMESTAMPTZ | nullable |
| version | INTEGER | optimistic locking |

**SoD constraint:** `verified_by ≠ created_by` enforced at service layer (mirrors GL 4-eyes pattern).

### `cash_balances`
WORM — one record per account per balance_date. No UPDATE/DELETE (PostgreSQL trigger).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID FK → bank_accounts | |
| balance_date | DATE | book date |
| value_date | DATE | value-dated balance date |
| ledger_balance | NUMERIC(20,6) | confirmed book balance |
| available_balance | NUMERIC(20,6) | cleared funds only |
| value_date_balance | NUMERIC(20,6) | forward-valued |
| in_transit_debit | NUMERIC(20,6) | pending outgoing |
| in_transit_credit | NUMERIC(20,6) | pending incoming |
| currency | CHAR(3) | ISO 4217 |
| source | ENUM | MANUAL, API_PULL, MT940_IMPORT, RECONCILED |
| reconciliation_status | ENUM | UNRECONCILED, RECONCILED, DISPUTED, PENDING_REVIEW |
| reconciled_by | UUID FK → users | nullable |
| reconciled_at | TIMESTAMPTZ | nullable |
| pulled_at | TIMESTAMPTZ | nullable — when API pull occurred |
| note | TEXT | nullable |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |

**Constraints:** `UNIQUE(account_id, balance_date)`. PostgreSQL `BEFORE DELETE` trigger raises exception (WORM).

### `cash_audit_events`
SHA-256 hash-chained, append-only, per-tenant. Same structure as `audit_events`.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| company_id | UUID FK → companies | chain is per-tenant |
| account_id | UUID FK → bank_accounts | nullable (entity-level events have no account) |
| event_type | ENUM | ACCOUNT_CREATED, ACCOUNT_VERIFIED, ACCOUNT_FROZEN, ACCOUNT_CLOSED, BALANCE_ENTERED, BALANCE_CORRECTED, BALANCE_RECONCILED, BALANCE_DISPUTED, CONNECTION_LINKED, CONNECTION_REVOKED |
| payload | JSONB | full event detail |
| performed_by | UUID FK → users | |
| event_hash | CHAR(64) | SHA-256 |
| prev_event_hash | CHAR(64) | GENESIS = 64 zeros |
| chain_seq | BIGINT | monotonic per company_id |
| created_at | TIMESTAMPTZ | |

**WORM trigger:** `BEFORE DELETE` raises exception. `BEFORE UPDATE` raises exception.

---

## Services

### `legal_entity_service.py`
- `create_entity(db, company_id, payload, created_by)` — creates entity, emits audit event
- `update_entity(db, entity_id, company_id, payload)` — updates with optimistic lock check
- `close_entity(db, entity_id, company_id)` — sets status=DORMANT/LIQUIDATED
- `get_entity_tree(db, company_id)` — recursive CTE query returning parent/child hierarchy
- `get_consolidated_position(db, company_id, as_of_date)` — aggregate balances across all child entities

### `bank_account_service.py`
- `create_account(db, entity_id, payload, created_by)` — encrypts sensitive fields, status=PENDING_VERIFICATION, emits ACCOUNT_CREATED audit event
- `verify_account(db, account_id, company_id, verifier_id)` — SoD check (verifier ≠ creator), status=ACTIVE, emits ACCOUNT_VERIFIED
- `freeze_account / close_account` — state transitions, audit events
- `decrypt_account_details(account, requester_role)` — role-gated decryption (treasurer+ only)

### `bank_connection_service.py`
- `get_auth_url(provider, company_id, redirect_uri)` — delegates to TrueLayer/Plaid adapter
- `handle_callback(db, provider, code, company_id, created_by)` — exchanges code for tokens, encrypts, stores
- `refresh_token(db, connection_id)` — token refresh with circuit-breaker: consecutive_failure_count ≥ 3 → status=ERROR
- `revoke_connection(db, connection_id, company_id)` — revoke tokens at provider, status=REVOKED, emit CONNECTION_REVOKED
- Abstract `BankProviderAdapter` ABC: `get_auth_url()`, `exchange_code()`, `refresh_token()`, `get_accounts()`, `get_balances()`
- Concrete: `TrueLayerAdapter`, `PlaidAdapter`

### `cash_balance_service.py`
- `enter_balance(db, account_id, company_id, payload, created_by)` — upsert by (account_id, balance_date), emits BALANCE_ENTERED, chains audit event
- `bulk_enter_balances(db, company_id, rows, created_by)` — transactional bulk entry
- `pull_balances(db, connection_id, company_id, created_by)` — pulls all accounts on connection via adapter, stores results, updates consecutive_failure_count
- `reconcile_balance(db, balance_id, company_id, reconciler_id, status)` — updates reconciliation_status, emits BALANCE_RECONCILED/DISPUTED
- `get_consolidated_position(db, company_id, as_of_date)` — GROUP BY currency across all active accounts
- `get_entity_position(db, company_id, as_of_date)` — subtotals per entity per currency
- `get_account_history(db, account_id, company_id, from_date, to_date)` — time-series for charting

### `cash_audit_service.py`
- `append_event(db, company_id, event_type, payload, performed_by, account_id)` — SHA-256 chain extension, `SELECT ... FOR UPDATE` on last event, GENESIS_HASH = 64 zeros
- `verify_chain(db, company_id)` — full chain verification (audit lab integration)

---

## API Routes

All routes: `professional` plan tier minimum. Auth: `get_current_user`. RBAC: `treasurer` role or above for write operations.

### `v1_legal_entities.py`
```
GET    /v1/cash/entities               list (tenant-scoped, filterable by status)
POST   /v1/cash/entities               create
GET    /v1/cash/entities/{id}          detail + child entities + account count
PATCH  /v1/cash/entities/{id}          update (optimistic lock via version field)
POST   /v1/cash/entities/{id}/close    soft-close → DORMANT/LIQUIDATED
```

### `v1_bank_accounts.py`
```
GET    /v1/cash/accounts               list (filter: entity_id, currency, status, account_type)
POST   /v1/cash/accounts               create → PENDING_VERIFICATION
POST   /v1/cash/accounts/{id}/verify   checker verify → ACTIVE (SoD enforced)
POST   /v1/cash/accounts/{id}/freeze   → FROZEN
POST   /v1/cash/accounts/{id}/close    → CLOSED
GET    /v1/cash/accounts/{id}/balances balance history (paginated, date range)
GET    /v1/cash/accounts/{id}/audit    tamper-evident audit log
```

### `v1_cash_positions.py`
```
GET    /v1/cash/positions/consolidated  group total per currency
GET    /v1/cash/positions/by-entity     subtotals per entity per currency
GET    /v1/cash/positions/by-account    flat list, all accounts, latest balance
POST   /v1/cash/balances                manual balance entry (single)
POST   /v1/cash/balances/bulk           bulk entry (array)
POST   /v1/cash/balances/{id}/reconcile mark reconciled/disputed
POST   /v1/cash/pull/{connection_id}    trigger API pull for all accounts on connection
```

### `v1_bank_connections.py`
```
GET    /v1/cash/connections             list connections for tenant
GET    /v1/cash/connections/auth-url    initiate OAuth (provider + redirect_uri params)
POST   /v1/cash/connections/callback    OAuth callback — exchange code, store encrypted tokens
POST   /v1/cash/connections/{id}/refresh manual token refresh
DELETE /v1/cash/connections/{id}        revoke connection
```

---

## Frontend

### Pages

**`/cash-positions`** — main treasury dashboard, 3 tabs:

- **CONSOLIDATED:** Currency summary cards (ledger / available / in-transit net / 7-day sparkline). Total equivalent in reporting currency. Threshold breach badges (red when available < min_balance_threshold).
- **BY ENTITY:** Accordion per legal entity. Header: name, LEI badge, functional currency. Per-account rows: bank, type chip, 3-part balance, last pull time. Expand → 30-day balance history chart (ECharts).
- **BY ACCOUNT:** Sortable/filterable table. Columns: Nickname, Entity, Bank, Type, Currency, Ledger, Available, In-Transit Net, Source, Last Updated, Reconciliation Status. Row actions: Enter Balance, Pull Now, View Audit Log.

**`/settings/legal-entities`** — entity tree view. Create/edit entity. Parent selector. LEI + GIIN fields. Status badge.

**`/settings/bank-accounts`** — account registry. Verification queue tab (PENDING_VERIFICATION). Account detail drawer: all fields, GL linkage, connection status.

**`/settings/bank-connections`** — connection cards per institution. Status chip (ACTIVE/EXPIRED/ERROR). Last pull timestamp. "Connect Bank" flow: provider selection → OAuth redirect → callback confirmation. Revoke button.

### API Client

`frontend/src/lib/api/cashClient.ts` — follows `glClient.ts` pattern exactly. `dashboardFetch`-based, fully typed against backend schemas. Exports: `listEntities`, `createEntity`, `listAccounts`, `createAccount`, `verifyAccount`, `getConsolidatedPosition`, `getEntityPosition`, `getAccountPosition`, `enterBalance`, `bulkEnterBalances`, `pullBalances`, `listConnections`, `getAuthUrl`, `handleCallback`, `revokeConnection`.

### AppSidebar

New items under `HEDGE DESK` group (professional-tier):
```
CASH sub-section:
  Cash Positions    /cash-positions
```

New items under `SETTINGS`:
```
Legal Entities       /settings/legal-entities
Bank Accounts        /settings/bank-accounts
Bank Connections     /settings/bank-connections
```

---

## Testing

### Backend
- `test_legal_entity_service.py` — CRUD, hierarchy queries, consolidated position rollup
- `test_bank_account_service.py` — lifecycle state machine, SoD enforcement (verifier = creator → 403), encryption/decryption
- `test_bank_connection_service.py` — OAuth flow (mocked adapters), circuit-breaker (3 failures → ERROR status), token refresh
- `test_cash_balance_service.py` — manual entry, bulk entry, API pull (mocked), reconciliation, consolidated/entity/account queries
- `test_cash_audit_service.py` — chain integrity, GENESIS hash, tamper detection
- `test_v1_cash_routes.py` — all endpoints via httpx AsyncClient + dependency overrides
- `@pytest.mark.requires_postgres` on migration and WORM trigger tests

### Frontend
- `tsc --noEmit` clean
- `next build` passes
- Browser verification: all 4 pages render, 3 tabs load, OAuth flow initiates

---

## Migrations

| # | File | Contents |
|---|------|----------|
| 0017 | `0017_legal_entities.py` | `legal_entities` table |
| 0018 | `0018_bank_connections.py` | `bank_connections` table |
| 0019 | `0019_bank_accounts.py` | `bank_accounts` table + WORM not needed (mutable) |
| 0020 | `0020_cash_balances.py` | `cash_balances` table + WORM trigger + UNIQUE constraint |
| 0021 | `0021_cash_audit_events.py` | `cash_audit_events` table + WORM triggers |

---

## Security Notes

- Account numbers and IBANs: AES-256-GCM encrypted at rest. Key derived from `API_KEY_PEPPER` + tenant salt.
- OAuth tokens: same encryption as above. Never logged, never returned in API responses after initial exchange.
- Decryption of account numbers gated to `treasurer` role and above.
- `cash_audit_events` chain verified by existing Audit Lab integration.
- `bank_connections.consecutive_failure_count ≥ 3` auto-suspends connection (circuit-breaker) to prevent token lockout at provider.

---

## Out of Scope (Phase 2b+)

- Cash flow forecasting (2b)
- MT940/CAMT.053 bank statement import (2e) — `CashBalance.source=MT940_IMPORT` field is forward-compatible
- Intercompany netting (2c)
- Working capital analytics (2d)
- Payment initiation
- Surplus cash investment recommendations (Phase 3)
