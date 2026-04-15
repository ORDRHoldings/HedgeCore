# Treasury Suite Phase 2f — Cash Pool & Multi-Entity Visibility

## Goal

Model treasury entities, cash pools (NOTIONAL/PHYSICAL/ZBA), pool membership, and sweep transactions. Provide pool-type-specific balance aggregation and manual sweep execution. Backend-only — the consolidated dashboard (Phase 2g) consumes these APIs.

## Architecture

Four new tables (`treasury_entities`, `cash_pools`, `cash_pool_members`, `cash_pool_sweeps`). One service file handles CRUD + pool-type-specific balance aggregation + sweep calculation/execution. One route file exposes 11 endpoints under `/v1/cash/pools`. Follows Phase 2a–2e patterns: AsyncMock unit tests, tenant-scoped queries, flush-not-commit, WORM audit trail via existing `cash_audit_events`. No new frontend page.

## Tech Stack

Python 3.12, FastAPI, SQLAlchemy 2.x async, Alembic raw SQL migration.

---

## 1. Data Model

### 1.1 TreasuryEntity

Separate from `LegalEntity` (Phase 2a). Represents the treasury view of organizational structure with entity classification and ERP linkage.

```
treasury_entities
  id: UUID (PK, default uuid4)
  company_id: UUID (NOT NULL, indexed)
  name: String(256) (NOT NULL)
  entity_type: String(16) (NOT NULL, default "SUBSIDIARY")
    -- Enum: SUBSIDIARY, BRANCH, FUND, HOLDING, SPV
  base_currency: String(3) (NOT NULL)
  country_code: String(2) (NOT NULL)
  erp_ref: String(128) (nullable)
  parent_entity_id: UUID (nullable, self-referential)
  is_active: Boolean (NOT NULL, default true)
  created_at: DateTime(tz) (NOT NULL)
```

### 1.2 CashPool

```
cash_pools
  id: UUID (PK, default uuid4)
  company_id: UUID (NOT NULL, indexed)
  name: String(256) (NOT NULL)
  pool_type: String(16) (NOT NULL)
    -- Enum: NOTIONAL, PHYSICAL, ZBA
  header_account_id: UUID (NOT NULL, FK → bank_accounts)
  currency: String(3) (NOT NULL)
  base_currency: String(3) (NOT NULL)
  is_active: Boolean (NOT NULL, default true)
  created_by: UUID (NOT NULL)
  created_at: DateTime(tz) (NOT NULL)
```

### 1.3 CashPoolMember

```
cash_pool_members
  id: UUID (PK, default uuid4)
  pool_id: UUID (NOT NULL, FK → cash_pools, indexed)
  account_id: UUID (NOT NULL, FK → bank_accounts)
  entity_id: UUID (NOT NULL, FK → treasury_entities)
  participation_type: String(8) (NOT NULL, default "FULL")
    -- Enum: FULL, PARTIAL
  target_balance: Numeric(20,6) (nullable)
    -- For PHYSICAL: sweep threshold; for ZBA: always 0; for NOTIONAL: null
  created_at: DateTime(tz) (NOT NULL)

  UNIQUE(pool_id, account_id)
```

### 1.4 CashPoolSweep

```
cash_pool_sweeps
  id: UUID (PK, default uuid4)
  pool_id: UUID (NOT NULL, FK → cash_pools, indexed)
  source_account_id: UUID (NOT NULL, FK → bank_accounts)
  destination_account_id: UUID (NOT NULL, FK → bank_accounts)
  amount: Numeric(20,6) (NOT NULL)
  currency: String(3) (NOT NULL)
  direction: String(16) (NOT NULL)
    -- Enum: CONCENTRATION, DISTRIBUTION
  status: String(16) (NOT NULL, default "PENDING")
    -- Enum: PENDING, EXECUTED, FAILED, CANCELLED
  triggered_by: UUID (NOT NULL)
  executed_at: DateTime(tz) (nullable)
  created_at: DateTime(tz) (NOT NULL)
```

### 1.5 Audit Event Type

Add to `CashAuditEventType` enum:

```
CASH_POOL_SWEEP = "CASH_POOL_SWEEP"
```

---

## 2. Pool-Type-Specific Behavior

### 2.1 NOTIONAL

Virtual aggregation only. No sweeps permitted.

- **Balance**: SUM of latest `CashBalance.ledger_balance` for all member accounts.
- **Sweeps**: `calculate_sweeps` raises 400 error for NOTIONAL pools.
- **Header account**: Reference only — not included in aggregation (it's the notional "top").

### 2.2 PHYSICAL

Sweeps move funds toward header account when member balances exceed `target_balance`.

- **Balance**: Header account actual balance + SUM of member excess (`balance - target_balance`). Response includes both consolidated total and per-member breakdown.
- **Sweep calculation**: For each member, `sweep_amount = member_balance - target_balance`. Only positive amounts generate CONCENTRATION sweeps. Negative amounts (below target) generate DISTRIBUTION sweeps from header.
- **Header account**: Destination for concentration, source for distribution.

### 2.3 ZBA (Zero Balance Account)

Same as PHYSICAL but `target_balance` is always 0 for all members.

- **Balance**: Header account balance IS the pool balance (all member balances should be zero).
- **Sweep calculation**: Any non-zero member balance generates a sweep to bring it to zero.
- **ZBA exceptions**: Non-zero member balances are flagged in the balance response as exceptions.

---

## 3. Service Layer

File: `backend/app/services/cash_pool_service.py`

### Functions

| Function | Purpose |
|----------|---------|
| `create_treasury_entity(session, company_id, data, created_by)` | Create entity with hierarchy validation (parent must belong to same company) |
| `list_treasury_entities(session, company_id)` | List all entities for tenant |
| `create_pool(session, company_id, data, created_by)` | Create pool, validate header account exists and belongs to company |
| `list_pools(session, company_id)` | List pools with member counts |
| `get_pool_detail(session, pool_id, company_id)` | Pool + members + latest balances |
| `add_member(session, pool_id, company_id, data)` | Add account to pool, enforce UNIQUE(pool_id, account_id), set target_balance (force 0 for ZBA) |
| `remove_member(session, pool_id, member_id, company_id)` | Remove member from pool |
| `get_pool_balance(session, pool_id, company_id)` | Pool-type-specific aggregation — dispatches to `_notional_balance`, `_physical_balance`, or `_zba_balance` |
| `calculate_sweeps(session, pool_id, company_id)` | For PHYSICAL/ZBA: compute required sweep amounts per member. Returns proposed sweeps without persisting. Raises 400 for NOTIONAL. |
| `execute_sweeps(session, pool_id, company_id, performed_by)` | Calls `calculate_sweeps`, persists `CashPoolSweep` records as PENDING, audit-logs via `cash_audit_events`. |
| `list_sweeps(session, pool_id, company_id)` | Sweep history for a pool |

### Balance Aggregation

- **`_notional_balance(session, pool, members)`**: Query latest `CashBalance` per member `account_id`, SUM `ledger_balance`. Return consolidated total + per-member breakdown.
- **`_physical_balance(session, pool, members)`**: Query latest `CashBalance` for header + all members. Consolidated = header balance + SUM(member excess). Per-member shows balance vs target_balance.
- **`_zba_balance(session, pool, members)`**: Query latest `CashBalance` for header + all members. Pool balance = header balance. Flag any non-zero member balance as exception.

### Candidate Loading

Member account balances come from `CashBalance` table (Phase 2a). Query the latest balance per account using `MAX(balance_date)` grouped by `account_id`.

### Flush Pattern

Service calls `session.flush()`, routes call `await db.commit()`.

---

## 4. API Routes

File: `backend/app/api/routes/v1_cash_pools.py`
Prefix: `/v1/cash/pools`

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/entities` | Create treasury entity | write role |
| GET | `/entities` | List treasury entities | professional |
| POST | `/` | Create cash pool | write role |
| GET | `/` | List pools | professional |
| GET | `/{pool_id}` | Pool detail + members + balances | professional |
| POST | `/{pool_id}/members` | Add member to pool | write role |
| DELETE | `/{pool_id}/members/{member_id}` | Remove member | write role |
| GET | `/{pool_id}/balance` | Pool balance (type-specific) | professional |
| POST | `/{pool_id}/sweeps/calculate` | Preview sweep amounts (dry run) | write role |
| POST | `/{pool_id}/sweeps/execute` | Execute sweeps (persist records) | write role |
| GET | `/{pool_id}/sweeps` | Sweep history | professional |

### Pydantic Schemas

Append to `backend/app/schemas_v1/cash.py`:

```python
# ── Treasury Entity ────────────────────────────────────────────────

class TreasuryEntityCreate(BaseModel):
    name: str
    entity_type: str = Field(default="SUBSIDIARY", pattern="^(SUBSIDIARY|BRANCH|FUND|HOLDING|SPV)$")
    base_currency: str = Field(..., min_length=3, max_length=3)
    country_code: str = Field(..., min_length=2, max_length=2)
    erp_ref: str | None = None
    parent_entity_id: uuid.UUID | None = None

class TreasuryEntityResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    entity_type: str
    base_currency: str
    country_code: str
    erp_ref: str | None
    parent_entity_id: uuid.UUID | None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Cash Pool ──────────────────────────────────────────────────────

class CashPoolCreate(BaseModel):
    name: str
    pool_type: str = Field(..., pattern="^(NOTIONAL|PHYSICAL|ZBA)$")
    header_account_id: uuid.UUID
    currency: str = Field(..., min_length=3, max_length=3)
    base_currency: str = Field(..., min_length=3, max_length=3)

class CashPoolResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    name: str
    pool_type: str
    header_account_id: uuid.UUID
    currency: str
    base_currency: str
    is_active: bool
    member_count: int = 0
    created_by: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True

class CashPoolMemberCreate(BaseModel):
    account_id: uuid.UUID
    entity_id: uuid.UUID
    participation_type: str = Field(default="FULL", pattern="^(FULL|PARTIAL)$")
    target_balance: Decimal | None = None

class CashPoolMemberResponse(BaseModel):
    id: uuid.UUID
    pool_id: uuid.UUID
    account_id: uuid.UUID
    entity_id: uuid.UUID
    participation_type: str
    target_balance: Decimal | None
    created_at: datetime

    class Config:
        from_attributes = True

class PoolMemberBalance(BaseModel):
    account_id: uuid.UUID
    entity_id: uuid.UUID
    ledger_balance: Decimal
    target_balance: Decimal | None
    excess: Decimal | None       # balance - target (PHYSICAL/ZBA)
    is_exception: bool = False   # non-zero balance in ZBA

class PoolBalanceResponse(BaseModel):
    pool_id: uuid.UUID
    pool_type: str
    consolidated_balance: Decimal
    header_balance: Decimal | None  # null for NOTIONAL
    currency: str
    member_balances: list[PoolMemberBalance]

class SweepPreview(BaseModel):
    source_account_id: uuid.UUID
    destination_account_id: uuid.UUID
    amount: Decimal
    currency: str
    direction: str  # CONCENTRATION or DISTRIBUTION

class SweepResponse(BaseModel):
    id: uuid.UUID
    pool_id: uuid.UUID
    source_account_id: uuid.UUID
    destination_account_id: uuid.UUID
    amount: Decimal
    currency: str
    direction: str
    status: str
    triggered_by: uuid.UUID
    executed_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True
```

---

## 5. Migration

File: `backend/migrations/versions/0026_cash_pools.py`

- CREATE TABLE treasury_entities (+ company_id index)
- CREATE TABLE cash_pools (+ company_id index)
- CREATE TABLE cash_pool_members (+ pool_id index + UNIQUE(pool_id, account_id))
- CREATE TABLE cash_pool_sweeps (+ pool_id index)

---

## 6. Testing

| File | Tests | Type |
|------|-------|------|
| `test_cash_pool_models.py` | Table names, column presence, defaults, constraints, enum values, UNIQUE on members | ORM introspection (no DB, no async) |
| `test_cash_pool_service.py` | create_pool, add_member, remove_member, get_pool_balance (NOTIONAL), get_pool_balance (PHYSICAL), get_pool_balance (ZBA), calculate_sweeps (PHYSICAL), calculate_sweeps (ZBA target=0), execute_sweeps persists + audit, calculate_sweeps on NOTIONAL raises 400 | AsyncMock |
| `test_v1_cash_pool_routes.py` | POST /entities, GET /entities, POST /, GET /, GET /{id}, POST /{id}/members, GET /{id}/balance, POST /{id}/sweeps/execute | httpx AsyncClient |
