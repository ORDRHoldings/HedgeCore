# Treasury Suite Phase 2a — Bank Accounts & Cash Positions

**Date:** 2026-04-14
**Status:** Approved for implementation
**Follows:** Treasury Suite Phase 1 (GL Journals, Settlement, ERP Pull)
**Phase 2 Roadmap:** 2a (this) → 2b (Forecasting) → 2c (Netting) → 2d (Working Capital) → 2e (Bank Statement Import) → 2f (Cash Flow Hedging) → 2g (Stress Testing) → 2h (Concentration) → 2i (Counterparty Credit) → 2j (Reporting Pack)

---

## Goal

Deliver institutional-grade cash position management for corporate treasury teams: multi-entity group structure, multi-bank multi-currency account registry, Fortune 500-quality audit trail, and a live three-tab cash position dashboard sourced from manual entry and/or TrueLayer/Plaid open banking.

---

## Architecture

**Data hierarchy:** `Company → LegalEntity → BankAccount → CashBalance (time-series)`

**Balance sourcing:** Manual entry (always available) + TrueLayer (Europe/UK, PSD2) + Plaid (US/CA) via a provider-agnostic `BankProviderAdapter` ABC. One `BankConnection` (per institution per tenant) covers all accounts at that bank — OAuth tokens stored AES-256-GCM encrypted, never raw.

**Encryption key management:** AES-256-GCM. Root key material: dedicated `BANK_ACCOUNT_ENC_KEY` environment variable (min 32 bytes, distinct from `API_KEY_PEPPER` which is an HMAC pepper for API key digests — not a suitable encryption key). Per-tenant key derived: `PBKDF2-HMAC-SHA256(BANK_ACCOUNT_ENC_KEY, salt=company_id_bytes, iterations=100_000)`. Key never stored; re-derived on each decrypt. **Key rotation:** when `BANK_ACCOUNT_ENC_KEY` is rotated, a background migration task re-encrypts all `account_number_enc`, `iban_enc`, `access_token_enc`, `refresh_token_enc` columns using the new key. Until re-encryption completes, the old key must remain available as `BANK_ACCOUNT_ENC_KEY_PREV`. The `ensure_tables()` startup check warns (does not block) if `BANK_ACCOUNT_ENC_KEY` is unset in non-production; raises `RuntimeError` in production.

**Audit:** SHA-256 hash-chained `cash_audit_events` table (append-only, WORM) — same pattern as Phase 1 `audit_events`/`journal_entries`. Every account lifecycle event and balance entry is tamper-evident. `UNIQUE(company_id, chain_seq)` prevents chain forks under concurrent writes.

**Tech stack:** Python 3.12, FastAPI, SQLAlchemy 2.x async, Alembic (raw SQL migrations), Next.js 15 App Router, TypeScript 5, `lucide-react`, IBM Plex fonts.

---

## Data Model

### `legal_entities` (mutable, soft-deletable)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| company_id | UUID FK → companies | **tenant scope — all queries filter by this** |
| parent_entity_id | UUID FK → legal_entities | nullable — NULL = root entity |
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
| version | INTEGER | optimistic locking — increment on every UPDATE |

---

### `bank_connections` (mutable — tokens rotate, status changes)

One OAuth connection per institution per tenant. Separated from accounts so one token covers all accounts at the same bank.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| company_id | UUID FK → companies | **tenant scope** |
| provider | ENUM | TRUELAYER, PLAID |
| institution_id | VARCHAR(100) | provider's bank identifier |
| institution_name | VARCHAR(255) | |
| access_token_enc | TEXT | AES-256-GCM encrypted (see key management above) |
| refresh_token_enc | TEXT | AES-256-GCM encrypted |
| token_expires_at | TIMESTAMPTZ | |
| scope | VARCHAR(255) | |
| status | ENUM | ACTIVE, EXPIRED, REVOKED, ERROR |
| last_successful_pull_at | TIMESTAMPTZ | |
| last_error_at | TIMESTAMPTZ | |
| last_error_message | TEXT | truncated to 500 chars — never include token fragments |
| consecutive_failure_count | INTEGER | default 0. ≥3 → auto-set status=ERROR |
| created_by | UUID FK → users | maker |
| approved_by | UUID FK → users | **SoD: approved_by ≠ created_by** (live bank API access requires 4-eyes) |
| approved_at | TIMESTAMPTZ | |
| pending_oauth_state | VARCHAR(128) | **CSRF state parameter** — set on `get_auth_url`, cleared on successful callback. Short-lived (5-minute TTL enforced in service layer). Nullable — NULL after OAuth completes. |
| pending_oauth_state_expires_at | TIMESTAMPTZ | Expiry for the pending state — callback rejected if `now() > expires_at` |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**OAuth CSRF protection:** `get_auth_url` generates a cryptographically random 64-byte state value, stores it (plaintext — not sensitive) in `pending_oauth_state` with a 5-minute expiry. The provider redirects to `/v1/cash/connections/callback?code=...&state=...`. The callback handler: (1) looks up the `bank_connections` row by `state`, (2) verifies `pending_oauth_state_expires_at > now()`, (3) exchanges the code for tokens, (4) clears `pending_oauth_state` and `pending_oauth_state_expires_at`. State mismatch or expiry → 400. This approach is stateless (no Redis dependency) and consistent with the platform's JWT-first architecture.

**Circuit-breaker reset:** `consecutive_failure_count` resets to 0 on any successful pull. Status returns to ACTIVE on next successful token refresh after ERROR. Manual re-activation requires treasurer role.

---

### `bank_accounts` (mutable — lifecycle managed, soft-closed)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| entity_id | UUID FK → legal_entities | **load-bearing hierarchy join** |
| bank_name | VARCHAR(255) | |
| bank_lei | VARCHAR(20) | bank's own LEI, nullable |
| bank_bic | VARCHAR(11) | SWIFT/BIC |
| account_number_enc | TEXT | AES-256-GCM encrypted |
| iban_enc | TEXT | AES-256-GCM encrypted, nullable |
| account_type | ENUM | OPERATING, CONCENTRATION, PAYROLL, RESTRICTED, MONEY_MARKET, ESCROW, NOSTRO, VOSTRO |
| currency | CHAR(3) | ISO 4217 — **accounts are single-currency; multi-currency exposure managed via multiple accounts** |
| nickname | VARCHAR(100) | |
| purpose | TEXT | nullable |
| overdraft_limit | NUMERIC(20,6) | default 0 |
| min_balance_threshold | NUMERIC(20,6) | alert threshold, nullable |
| gl_debit_code | VARCHAR(50) | loose string reference to Phase 1 GLAccountMapping.debit_account — no FK (avoids cross-domain coupling) |
| gl_credit_code | VARCHAR(50) | |
| api_connection_id | UUID FK → bank_connections | nullable — manual accounts have no connection |
| api_account_id | VARCHAR(255) | provider's account identifier |
| status | ENUM | PENDING_VERIFICATION, ACTIVE, FROZEN, CLOSED |
| verified_by | UUID FK → users | nullable — set on ACTIVE transition |
| verified_at | TIMESTAMPTZ | |
| approved_by | UUID FK → users | **SoD: approved_by ≠ created_by** |
| approved_at | TIMESTAMPTZ | |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |
| closed_at | TIMESTAMPTZ | nullable |
| version | INTEGER | optimistic locking |

**BankAccount status state machine:**
```
PENDING_VERIFICATION → ACTIVE     (verify endpoint — checker ≠ creator)
ACTIVE              → FROZEN      (freeze endpoint — treasurer+)
ACTIVE              → CLOSED      (close endpoint — treasurer+)
FROZEN              → ACTIVE      (unfreeze endpoint — treasurer+)
FROZEN              → CLOSED      (close endpoint — treasurer+)
CLOSED              → [terminal]  (no transitions out)
```
Only ACTIVE accounts may receive balance entries or API pulls.

---

### `cash_balances` (WORM — no UPDATE, no DELETE)

One record per account per balance_date. Each bank account is single-currency; the currency column here redundantly captures it for query convenience and auditability.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID FK → bank_accounts | |
| balance_date | DATE | book date (the date the balance is as-of) |
| value_date | DATE | value-dated balance date (may differ from balance_date) |
| ledger_balance | NUMERIC(20,6) | confirmed book balance |
| available_balance | NUMERIC(20,6) | cleared funds only |
| value_date_balance | NUMERIC(20,6) | forward-valued balance |
| in_transit_debit | NUMERIC(20,6) | pending outgoing — default 0 |
| in_transit_credit | NUMERIC(20,6) | pending incoming — default 0 |
| currency | CHAR(3) | ISO 4217 — denormalised from account for audit completeness |
| source | ENUM | MANUAL, API_PULL, MT940_IMPORT, RECONCILED |
| reconciliation_status | ENUM | UNRECONCILED, RECONCILED, DISPUTED, PENDING_REVIEW |
| reconciled_by | UUID FK → users | nullable |
| reconciled_at | TIMESTAMPTZ | nullable |
| pulled_at | TIMESTAMPTZ | nullable — when API pull occurred |
| note | TEXT | nullable |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |

**Constraints:**
- `UNIQUE(account_id, balance_date)` — one record per account per day (accounts are single-currency)
- PostgreSQL `BEFORE DELETE` trigger raises exception (WORM — no deletes ever)
- PostgreSQL `BEFORE UPDATE` **partial** WORM trigger: allows updates to `reconciliation_status`, `reconciled_by`, `reconciled_at` only. Raises exception if any other column is being changed. This matches the Phase 1 `journal_entries` pattern where status columns are mutable but financial columns are WORM.

```sql
CREATE OR REPLACE FUNCTION cash_balances_worm() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'cash_balances rows are immutable (WORM)';
  END IF;
  -- Allow only reconciliation columns to change
  IF (NEW.account_id, NEW.balance_date, NEW.ledger_balance, NEW.available_balance,
      NEW.value_date_balance, NEW.currency, NEW.source, NEW.created_by) IS DISTINCT FROM
     (OLD.account_id, OLD.balance_date, OLD.ledger_balance, OLD.available_balance,
      OLD.value_date_balance, OLD.currency, OLD.source, OLD.created_by) THEN
    RAISE EXCEPTION 'cash_balances financial columns are immutable (WORM)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Balance correction mechanism:** Financial columns (ledger_balance, available_balance, value_date_balance, in_transit_*) are immutable. Corrections are posted as a new `cash_balances` record with `source=RECONCILED`. A `BALANCE_CORRECTED` audit event records original vs corrected values in `payload`. The `reconciliation_status` column on the original record is then updated to `RECONCILED` (this is the only permitted in-place mutation).

---

### `cash_audit_events` (WORM — SHA-256 hash-chained, append-only)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| company_id | UUID FK → companies | **chain is per-tenant** |
| entity_id | UUID FK → legal_entities | nullable — populated for entity-level events |
| account_id | UUID FK → bank_accounts | nullable — populated for account/balance events |
| balance_id | UUID FK → cash_balances | nullable — populated for balance events |
| event_type | ENUM | ACCOUNT_CREATED, ACCOUNT_VERIFIED, ACCOUNT_FROZEN, ACCOUNT_UNFROZEN, ACCOUNT_CLOSED, BALANCE_ENTERED, BALANCE_CORRECTED, BALANCE_RECONCILED, BALANCE_DISPUTED, CONNECTION_LINKED, CONNECTION_REVOKED, ENTITY_CREATED, ENTITY_UPDATED, ENTITY_CLOSED |
| payload | JSONB | full event detail including before/after values |
| performed_by | UUID FK → users | |
| event_hash | CHAR(64) | SHA-256 of (prev_event_hash + event_type + payload + performed_by + created_at) |
| prev_event_hash | CHAR(64) | GENESIS = 64 zeros |
| chain_seq | BIGINT | monotonic per company_id |
| created_at | TIMESTAMPTZ | |

**Constraints:**
- `UNIQUE(company_id, chain_seq)` — **prevents chain fork under concurrent writes**
- PostgreSQL `BEFORE DELETE` trigger raises exception (WORM)
- PostgreSQL `BEFORE UPDATE` trigger raises exception (WORM)

**Chain extension:** Matches `gl_service._extend_journal_chain` pattern exactly:
```python
SELECT chain_seq, event_hash
FROM cash_audit_events
WHERE company_id = :company_id
ORDER BY chain_seq DESC
LIMIT 1
FOR UPDATE
```
`SELECT MAX(...) FOR UPDATE` is illegal in PostgreSQL (aggregate + locking). Must use `ORDER BY chain_seq DESC LIMIT 1 FOR UPDATE`. Concurrent callers block on this lock until the current transaction commits, preventing duplicate `chain_seq` values.

---

## Services

### `legal_entity_service.py`
- `create_entity(db, company_id, payload, created_by)` → creates entity, emits ENTITY_CREATED audit event, returns entity with version=1
- `update_entity(db, entity_id, company_id, payload, version)` → optimistic lock check, emits ENTITY_UPDATED
- `close_entity(db, entity_id, company_id, status)` → status=DORMANT or LIQUIDATED, emits ENTITY_CLOSED
- `get_entity_tree(db, company_id)` → recursive CTE: `WITH RECURSIVE entity_tree AS (...)` — returns parent/child hierarchy
- `get_consolidated_position(db, company_id, as_of_date)` → aggregates latest `cash_balances` across all child entities, groups by currency

### `bank_account_service.py`
- `create_account(db, entity_id, company_id, payload, created_by)` → encrypts account_number + IBAN, status=PENDING_VERIFICATION, emits ACCOUNT_CREATED
- `verify_account(db, account_id, company_id, verifier_id)` → **raises 403 if verifier_id == account.created_by**, transitions to ACTIVE, emits ACCOUNT_VERIFIED
- `freeze_account(db, account_id, company_id, actor_id)` → ACTIVE→FROZEN, emits ACCOUNT_FROZEN
- `unfreeze_account(db, account_id, company_id, actor_id)` → FROZEN→ACTIVE, emits ACCOUNT_UNFROZEN
- `close_account(db, account_id, company_id, actor_id)` → ACTIVE/FROZEN→CLOSED, sets closed_at, emits ACCOUNT_CLOSED
- `decrypt_account_details(account, requester)` → role-gated: treasurer+ may see full account number; others see masked (last 4 digits only)
- Invalid transition (e.g., CLOSED→ACTIVE) raises `InvalidStateTransitionError` (422)

### `bank_connection_service.py`
- `get_auth_url(provider, company_id, redirect_uri)` → delegates to `TrueLayerAdapter` or `PlaidAdapter`
- `handle_callback(db, provider, code, company_id, created_by)` → exchanges code for tokens, encrypts both tokens, stores connection, emits CONNECTION_LINKED audit event
- `pull_balances(db, connection_id, company_id)` → fetches all linked accounts via adapter, normalises 3-part balance, calls `cash_balance_service.enter_balance()` per account. On success: reset consecutive_failure_count=0. On failure: increment consecutive_failure_count; if ≥3, set status=ERROR.
- `refresh_token(db, connection_id)` → refreshes with provider, re-encrypts new tokens. Failure handling same as pull.
- `revoke_connection(db, connection_id, company_id, actor_id)` → calls provider revoke API, sets status=REVOKED, emits CONNECTION_REVOKED
- `reactivate_connection(db, connection_id, company_id, actor_id)` → treasurer+ only, resets consecutive_failure_count=0, status=ACTIVE (requires new OAuth flow)
- Abstract `BankProviderAdapter`: `get_auth_url()`, `exchange_code()`, `refresh_token()`, `get_accounts() → list[ProviderAccount]`, `get_balances(account_id) → ProviderBalance`
- `TrueLayerAdapter`, `PlaidAdapter` — concrete implementations

### `cash_balance_service.py`
- `enter_balance(db, account_id, company_id, payload, created_by)` → validates account is ACTIVE, upsert-insert (UNIQUE constraint means duplicate date → 409), emits BALANCE_ENTERED audit event
- `bulk_enter_balances(db, company_id, rows, created_by)` → single transaction, calls `enter_balance` per row, rolls back all on any failure
- `reconcile_balance(db, balance_id, company_id, reconciler_id, new_status, note)` → updates reconciliation_status, emits BALANCE_RECONCILED or BALANCE_DISPUTED
- `get_consolidated_position(db, company_id, as_of_date)` → latest balance per account, GROUP BY currency, SUM ledger/available
- `get_entity_position(db, company_id, as_of_date)` → subtotals per (entity, currency)
- `get_account_history(db, account_id, company_id, from_date, to_date)` → time-series rows ordered by balance_date ASC

### `cash_audit_service.py`
- `append_event(db, company_id, event_type, payload, performed_by, entity_id, account_id, balance_id)` → `SELECT ... FOR UPDATE` on last event, computes SHA-256, inserts with chain_seq+1
- `verify_chain(db, company_id)` → walks full chain from GENESIS, recomputes each hash, returns `ChainVerificationResult(ok, broken_at_seq)`

---

## API Routes

All endpoints: `professional` plan tier minimum. Uses existing seeded roles — no new roles required.

**Write operations** (create, verify, freeze, close, enter balance, pull, connect bank): `cfo` (hierarchy_level=1) or `head_of_risk` (hierarchy_level=2).

**Read operations** (list, get, positions): all authenticated roles including `supervisor`, `senior_analyst`, `risk_analyst`, `junior_analyst`, `auditor`, `branch_manager`.

**Account number decryption** (full unmasked): `cfo` only. All other roles receive last-4-digits masked value (e.g., `****6789`).

### `v1_legal_entities.py`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/cash/entities` | List entities (tenant-scoped, filter: status) |
| POST | `/v1/cash/entities` | Create entity |
| GET | `/v1/cash/entities/{id}` | Detail + child entities + account count |
| PATCH | `/v1/cash/entities/{id}` | Update (optimistic lock via `version` body field) |
| POST | `/v1/cash/entities/{id}/close` | Soft-close → DORMANT or LIQUIDATED |

### `v1_bank_accounts.py`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/cash/accounts` | List (filter: entity_id, currency, status, account_type) |
| POST | `/v1/cash/accounts` | Create → PENDING_VERIFICATION |
| GET | `/v1/cash/accounts/{id}` | Detail (account number masked unless treasurer+) |
| PATCH | `/v1/cash/accounts/{id}` | Update non-sensitive fields (nickname, purpose, thresholds) |
| POST | `/v1/cash/accounts/{id}/verify` | Checker verify → ACTIVE (SoD enforced) |
| POST | `/v1/cash/accounts/{id}/freeze` | → FROZEN |
| POST | `/v1/cash/accounts/{id}/unfreeze` | → ACTIVE |
| POST | `/v1/cash/accounts/{id}/close` | → CLOSED |
| GET | `/v1/cash/accounts/{id}/balances` | Balance history (date_from, date_to, paginated) |
| GET | `/v1/cash/accounts/{id}/audit` | Tamper-evident audit log for account |

### `v1_cash_positions.py`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/cash/positions/consolidated` | Group total per currency (all entities, as_of_date param) |
| GET | `/v1/cash/positions/by-entity` | Subtotals per entity per currency (as_of_date param) |
| GET | `/v1/cash/positions/by-account` | Flat list, all accounts, latest balance |
| POST | `/v1/cash/balances` | Manual balance entry (single account + date) |
| POST | `/v1/cash/balances/bulk` | Bulk entry (JSON array of balance rows) |
| POST | `/v1/cash/balances/{id}/reconcile` | Mark RECONCILED, DISPUTED, or PENDING_REVIEW |
| POST | `/v1/cash/pull/{connection_id}` | Trigger live API pull for all accounts on connection |

### `v1_bank_connections.py`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/cash/connections` | List connections for tenant |
| GET | `/v1/cash/connections/auth-url` | Initiate OAuth (params: provider, redirect_uri) |
| POST | `/v1/cash/connections/callback` | OAuth callback — exchange code, store encrypted tokens |
| POST | `/v1/cash/connections/{id}/refresh` | Manual token refresh |
| POST | `/v1/cash/connections/{id}/reactivate` | Reset circuit-breaker, return to ACTIVE (treasurer+) |
| DELETE | `/v1/cash/connections/{id}` | Revoke connection |

### `v1_cash_audit.py` (read-only, internal surface)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/cash/audit/chain-verify` | Verify full chain integrity for tenant (returns ok/broken_at_seq) |
| GET | `/v1/cash/audit/events` | Paginated audit event log (filter: account_id, event_type, date range) |

---

## Frontend

### Pages

**`/cash-positions`** — main treasury dashboard, 3 tabs:

| Tab | Backend endpoint | Content |
|-----|-----------------|---------|
| CONSOLIDATED | `GET /v1/cash/positions/consolidated` | Currency summary cards: ledger / available / in-transit net / 7-day sparkline. Total equivalent in reporting currency. Threshold breach badges (red when available < min_balance_threshold). "Pull All" button triggers pull for all active connections. |
| BY ENTITY | `GET /v1/cash/positions/by-entity` | Accordion per legal entity. Header: name, LEI badge, functional currency, entity total. Per-account rows: bank, type chip, 3-part balance, last pull timestamp. Expand row → 30-day balance history chart (ECharts line, ledger vs available). |
| BY ACCOUNT | `GET /v1/cash/positions/by-account` | Sortable/filterable table. Columns: Nickname, Entity, Bank, Type, Currency, Ledger, Available, In-Transit Net, Source, Last Updated, Reconciliation Status. Row actions: Enter Balance, Pull Now, View Audit Log. |

**`/settings/legal-entities`** — entity tree. Create/edit drawer: LEI, GIIN, parent selector, functional/reporting currency. Status badge. Close entity action.

**`/settings/bank-accounts`** — account registry with two tabs:
- **ALL ACCOUNTS**: sortable table, status chips, masked account numbers, row actions (verify/freeze/close)
- **PENDING VERIFICATION**: queue for checker — shows creator name, created_at, all account fields for review. "Verify" button (disabled if current user = creator, with tooltip "Cannot verify your own account").

**`/settings/bank-connections`** — connection cards per institution. Status chip (ACTIVE/EXPIRED/ERROR). Last pull timestamp. Consecutive failure count. "Connect Bank" button → provider selection modal → OAuth redirect → callback confirmation page. Revoke and Reactivate buttons.

### API Client: `cashClient.ts`

Follows `glClient.ts` pattern exactly (`dashboardFetch`, typed responses, no raw `fetch`).

Exported functions:
```typescript
// Entities
listEntities(token, params?)
createEntity(token, payload)
getEntity(token, id)
updateEntity(token, id, payload)
closeEntity(token, id, status)

// Accounts
listAccounts(token, params?)
createAccount(token, payload)
getAccount(token, id)
verifyAccount(token, id)
freezeAccount(token, id)
unfreezeAccount(token, id)
closeAccount(token, id)
getAccountBalances(token, id, params?)
getAccountAudit(token, id)

// Positions
getConsolidatedPosition(token, asOfDate?)
getEntityPosition(token, asOfDate?)
getAccountPosition(token)
enterBalance(token, payload)
bulkEnterBalances(token, rows)
reconcileBalance(token, balanceId, payload)
pullBalances(token, connectionId)

// Connections
listConnections(token)
getAuthUrl(token, provider, redirectUri)
handleCallback(token, provider, code)
refreshConnection(token, id)
reactivateConnection(token, id)
revokeConnection(token, id)

// Audit
verifyCashChain(token)
listCashAuditEvents(token, params?)
```

### AppSidebar additions

Under `HEDGE DESK` group, new `CASH` sub-section (professional-tier gated):
```
Cash Positions    /cash-positions
```

Under `SETTINGS`:
```
Legal Entities       /settings/legal-entities
Bank Accounts        /settings/bank-accounts
Bank Connections     /settings/bank-connections
```

---

## Migrations

Dependencies: 0017 → 0018 → 0019 → 0020 → 0021 (each depends on prior)

| # | File | Table created | Notes |
|---|------|---------------|-------|
| 0017 | `0017_legal_entities.py` | `legal_entities` | Self-referential FK for parent_entity_id |
| 0018 | `0018_bank_connections.py` | `bank_connections` | FK → companies |
| 0019 | `0019_bank_accounts.py` | `bank_accounts` | FK → legal_entities + bank_connections |
| 0020 | `0020_cash_balances.py` | `cash_balances` | FK → bank_accounts; UNIQUE(account_id, balance_date); WORM BEFORE DELETE + BEFORE UPDATE triggers |
| 0021 | `0021_cash_audit_events.py` | `cash_audit_events` | FK → companies, legal_entities, bank_accounts, cash_balances (all nullable except company_id); UNIQUE(company_id, chain_seq); WORM triggers |

**GL account code linkage:** `gl_debit_code` / `gl_credit_code` on `bank_accounts` are loose VARCHAR references to `GLAccountMapping` codes — no FK (avoids cross-domain coupling, survives GL mapping changes without cascade). No ALTER TABLE on Phase 1 tables required.

---

## Testing

### Backend
| File | Critical test cases |
|------|---------------------|
| `test_legal_entity_service.py` | CRUD, recursive hierarchy query, consolidated position rollup across child entities |
| `test_bank_account_service.py` | Full status state machine (all valid transitions + all invalid transitions → 422), SoD enforcement (verifier = creator → 403, wrong role → 403), encryption round-trip (encrypt → store → decrypt matches original), masked display for non-treasurer |
| `test_bank_connection_service.py` | OAuth flow (mocked adapters), circuit-breaker: 3 failures → ERROR, 1 success after ERROR → reset, reactivation requires treasurer role, last_error_message never contains token fragments |
| `test_cash_balance_service.py` | Manual entry (happy path), duplicate date → 409, bulk entry (atomic — one failure rolls back all), pull (mocked adapter), correction via new record (original unchanged), reconciliation status transitions |
| `test_cash_audit_service.py` | Chain integrity (GENESIS → head), tamper detection (mutate middle record → verify_chain returns broken_at_seq), concurrent write safety (UNIQUE constraint on chain_seq prevents fork), WORM trigger rejects DELETE and UPDATE |
| `test_v1_cash_routes.py` | All endpoints via httpx AsyncClient + dependency overrides, plan-tier gating (starter → 403), role gating (reads allowed for read_only, writes rejected) |

All tests using PostgreSQL-specific features (triggers, UNIQUE constraints): `@pytest.mark.requires_postgres`

### Frontend
- `tsc --noEmit` clean
- `next build` passes (all 4 new pages in build output)
- Browser verification: all 4 pages render, 3 tabs on /cash-positions load without errors, "Verify" button disabled for account creator

---

## Security Summary

| Concern | Decision |
|---------|----------|
| Account number / IBAN | AES-256-GCM encrypted at application layer. Root key: `BANK_ACCOUNT_ENC_KEY` env var (distinct from `API_KEY_PEPPER`). Per-tenant key via PBKDF2. Never stored raw. Rotation via `BANK_ACCOUNT_ENC_KEY_PREV` fallback + background re-encryption task. |
| OAuth access + refresh tokens | Same AES-256-GCM encryption. Never logged. Never returned in API responses after initial exchange. |
| Decryption access | Full account number: `cfo` role only. All others receive last-4-digits masked value. |
| OAuth CSRF | State parameter stored in `pending_oauth_state` on `bank_connections` row (5-min TTL). Callback validates state + expiry before token exchange. Stateless (no Redis dependency). |
| SoD on account setup | `approved_by ≠ created_by` — 403 if violated |
| SoD on bank connections | `approved_by ≠ created_by` — 403 if violated (live bank API access requires 4-eyes) |
| Circuit-breaker | 3 consecutive failures → connection ERROR status. Prevents token lockout at provider. Manual reactivation by `cfo`/`head_of_risk` only. |
| WORM audit chain | `UNIQUE(company_id, chain_seq)` prevents chain fork. `ORDER BY chain_seq DESC LIMIT 1 FOR UPDATE` (not MAX aggregate — illegal with FOR UPDATE in PostgreSQL). |
| Partial WORM on cash_balances | Financial columns immutable (trigger). `reconciliation_status`, `reconciled_by`, `reconciled_at` mutable (reconciliation workflow). Matches Phase 1 journal_entries pattern. |
| Error messages | `last_error_message` truncated to 500 chars. Provider error responses sanitised — token/credential fragments stripped before storage. |

---

## Out of Scope (Phase 2b+)

- Cash flow forecasting (2b)
- MT940/CAMT.053 bank statement import (2e) — `source=MT940_IMPORT` enum value is forward-compatible
- Intercompany netting (2c)
- Working capital analytics (2d)
- Payment initiation
- Surplus cash investment recommendations (Phase 3)
