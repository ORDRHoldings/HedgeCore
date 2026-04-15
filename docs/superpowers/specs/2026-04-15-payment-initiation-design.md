# Treasury Suite Phase 2 §4.4 — Payment Initiation (Paper Mode)

**Date:** 2026-04-15  
**Status:** APPROVED  
**Author:** ORDR Edge  
**Related:** Treasury Suite §4.4, Phase 2a (BankAccount/BankConnection), existing SoD framework

---

## 1. Summary

Paper-mode payment lifecycle with 4-eyes approval (Separation of Duties), beneficiary whitelist, and stub transmit endpoint. Two new tables (`PaymentInstruction`, `PaymentBeneficiary`), one migration, one service, one route file, Pydantic schemas, one frontend page (`/payments`), and sidebar nav entry. No cut-off time enforcement (deferred to live mode in Phase 3). Follows Phase 2a–2f patterns: AsyncMock unit tests, tenant-scoped queries, WORM audit trail via `cash_audit_events`, `dashboardFetch`-based frontend.

---

## 2. Data Model

### 2.1 `PaymentBeneficiary`

Whitelist of approved payment destinations. Tenant-scoped.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `default=uuid4` |
| `company_id` | UUID FK | `companies.id`, NOT NULL, indexed |
| `name` | VARCHAR(255) | Beneficiary display name |
| `bank_name` | VARCHAR(255) | Receiving bank name |
| `bank_code` | VARCHAR(34) | SWIFT/BIC, sort code, or routing number |
| `account_number` | VARCHAR(34) | IBAN or local account number |
| `country_code` | VARCHAR(2) | ISO 3166-1 alpha-2 |
| `currency` | VARCHAR(3) | ISO 4217 |
| `payment_types` | JSONB | Array of supported types, e.g. `["SEPA","SWIFT"]` |
| `is_active` | BOOLEAN | Default `true` |
| `created_by` | UUID FK | `users.id` |
| `created_at` | TIMESTAMP | `default=utcnow` |

**Constraints:**
- Unique: `(company_id, bank_code, account_number)`
- Index: `(company_id, is_active)`

### 2.2 `PaymentInstruction`

The payment record. Immutable once past DRAFT (per-record hash for integrity).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `default=uuid4` |
| `company_id` | UUID FK | `companies.id`, NOT NULL, indexed |
| `beneficiary_id` | UUID FK | `payment_beneficiaries.id`, NOT NULL |
| `payment_type` | VARCHAR(10) | Enum: SEPA, SWIFT, ACH, CHAPS, FPS |
| `amount` | NUMERIC(20,4) | Payment amount, positive |
| `currency` | VARCHAR(3) | ISO 4217 |
| `execution_date` | DATE | Intended execution date |
| `reference` | VARCHAR(140) | External reference (visible to beneficiary) |
| `memo` | TEXT | Internal memo (nullable) |
| `status` | VARCHAR(20) | State machine (see §3) |
| `created_by` | UUID FK | `users.id` — the maker |
| `approved_by` | UUID FK | `users.id` — the checker (nullable) |
| `approved_at` | TIMESTAMP | Nullable |
| `rejected_by` | UUID FK | `users.id` — nullable |
| `rejection_reason` | TEXT | Required when rejected |
| `transmission_mode` | VARCHAR(10) | Always `"paper"` for now |
| `transmitted_at` | TIMESTAMP | Nullable |
| `instruction_hash` | VARCHAR(64) | SHA-256 per-record integrity hash |
| `created_at` | TIMESTAMP | `default=utcnow` |
| `updated_at` | TIMESTAMP | `onupdate=utcnow` |

**Constraints:**
- Index: `(company_id, status)`
- Index: `(company_id, created_at DESC)`
- Check: `amount > 0`

**Hash computation:** `SHA-256(company_id | beneficiary_id | payment_type | amount | currency | execution_date | reference | created_by | created_at)` — computed once at creation, immutable.

---

## 3. State Machine

```
DRAFT ──→ PENDING_APPROVAL ──→ APPROVED ──→ TRANSMITTED
                             ──→ REJECTED
DRAFT ──→ CANCELLED
```

| Transition | Trigger | Guard |
|------------|---------|-------|
| DRAFT → PENDING_APPROVAL | `initiate` | Auto-promoted on creation (no separate step) |
| PENDING_APPROVAL → APPROVED | `approve` | `approved_by != created_by` (SoD) |
| PENDING_APPROVAL → REJECTED | `reject` | `rejected_by != created_by` (SoD), `rejection_reason` required |
| APPROVED → TRANSMITTED | `transmit` | Stub: sets `transmission_mode="paper"`, `transmitted_at=utcnow` |
| DRAFT → CANCELLED | `cancel` | Only creator can cancel their own draft |

Invalid transitions return HTTP 409 Conflict.

---

## 4. API Endpoints

All under `/v1/payments`. Auth: `get_current_user`. Tenant-scoped via `current_user.company_id`.

### 4.1 Beneficiaries

```
GET    /v1/payments/beneficiaries           → list (active_only query param, default true)
POST   /v1/payments/beneficiaries           → create (validates unique bank_code+account_number)
PATCH  /v1/payments/beneficiaries/{id}      → update (name, bank_name, is_active, payment_types)
DELETE /v1/payments/beneficiaries/{id}       → soft-delete (sets is_active=false)
```

### 4.2 Payments

```
POST   /v1/payments/initiate               → create payment instruction
  Body: { beneficiary_id, payment_type, amount, currency, execution_date, reference, memo? }
  Validates: beneficiary exists, is_active, payment_type in beneficiary.payment_types
  Creates with status=PENDING_APPROVAL, computes instruction_hash
  Returns: PaymentInstructionResponse

GET    /v1/payments/                        → list with filters
  Query: status?, payment_type?, date_from?, date_to?, limit=50, offset=0
  Returns: { items: PaymentInstructionResponse[], total: int }

GET    /v1/payments/{id}                    → detail
  Returns: PaymentInstructionResponse (includes beneficiary name)

POST   /v1/payments/{id}/approve            → promote to APPROVED
  Guard: current_user.id != instruction.created_by (SoD)
  Sets: approved_by, approved_at
  Audit: PAYMENT_APPROVED

POST   /v1/payments/{id}/reject             → promote to REJECTED
  Body: { reason: string }
  Guard: current_user.id != instruction.created_by (SoD)
  Sets: rejected_by, rejection_reason
  Audit: PAYMENT_REJECTED

POST   /v1/payments/{id}/transmit           → stub transmit
  Guard: status == APPROVED
  Sets: transmission_mode="paper", transmitted_at=utcnow
  Returns: { id, status: "TRANSMITTED", transmission_mode: "paper" }
  Audit: PAYMENT_TRANSMITTED

POST   /v1/payments/{id}/cancel             → cancel draft
  Guard: status == DRAFT, current_user.id == instruction.created_by
  Audit: PAYMENT_CANCELLED
```

---

## 5. Pydantic Schemas

```python
# Request schemas
class BeneficiaryCreate(BaseModel):
    name: str
    bank_name: str
    bank_code: str
    account_number: str
    country_code: str  # 2-char
    currency: str      # 3-char
    payment_types: list[str]  # subset of SEPA,SWIFT,ACH,CHAPS,FPS

class BeneficiaryUpdate(BaseModel):
    name: str | None = None
    bank_name: str | None = None
    is_active: bool | None = None
    payment_types: list[str] | None = None

class PaymentInitiate(BaseModel):
    beneficiary_id: str  # UUID
    payment_type: str    # SEPA|SWIFT|ACH|CHAPS|FPS
    amount: Decimal      # > 0
    currency: str        # 3-char
    execution_date: date
    reference: str       # max 140 chars
    memo: str | None = None

class PaymentReject(BaseModel):
    reason: str

# Response schemas
class BeneficiaryResponse(BaseModel):
    id: str; company_id: str; name: str; bank_name: str
    bank_code: str; account_number: str; country_code: str
    currency: str; payment_types: list[str]
    is_active: bool; created_at: str

class PaymentInstructionResponse(BaseModel):
    id: str; company_id: str; beneficiary_id: str
    beneficiary_name: str  # joined from beneficiary
    payment_type: str; amount: str; currency: str
    execution_date: str; reference: str; memo: str | None
    status: str; created_by: str
    approved_by: str | None; approved_at: str | None
    rejected_by: str | None; rejection_reason: str | None
    transmission_mode: str; transmitted_at: str | None
    instruction_hash: str; created_at: str
```

---

## 6. Audit Trail

New enum values added to `CashAuditEventType`:
- `PAYMENT_INITIATED`
- `PAYMENT_APPROVED`
- `PAYMENT_REJECTED`
- `PAYMENT_TRANSMITTED`
- `PAYMENT_CANCELLED`
- `BENEFICIARY_CREATED`

Logged via existing `cash_audit_events` table. `entity_id` = payment/beneficiary UUID, `entity_type` = "payment_instruction" or "payment_beneficiary".

---

## 7. Frontend — `/payments`

Three-tab layout following the Bloomberg-grade pattern from `/cash-management` and `/bank-statements`.

### Tab: INITIATE

Payment creation form with fields:
- Payment type select (SEPA/SWIFT/ACH/CHAPS/FPS)
- Beneficiary select (filtered by active, further filtered by selected payment_type)
- Amount + Currency inputs
- Execution date picker
- Reference (text, max 140)
- Memo (textarea, optional)
- Submit button → `POST /v1/payments/initiate`

### Tab: PAYMENTS

Filterable payment list:
- Filters: status dropdown, payment type dropdown, date range
- Columns: date, beneficiary name, type badge, amount (right-aligned mono), currency, status badge, created by
- Status badges: PENDING_APPROVAL (amber), APPROVED (green), TRANSMITTED (blue), REJECTED (red), CANCELLED (gray)
- Click row → expand detail panel with:
  - Full payment details
  - Instruction hash
  - Action buttons based on status + SoD:
    - PENDING_APPROVAL: Approve (if user != creator), Reject (if user != creator)
    - APPROVED: Transmit (paper)
    - DRAFT: Cancel
  - Rejection reason display (if rejected)

### Tab: BENEFICIARIES

CRUD table:
- Columns: name, bank name, bank code, account number, country, currency, payment types (badge list), status
- Create form inline (same pattern as entity/pool creation)
- Deactivate button (soft-delete)

---

## 8. Sidebar Navigation

| Label | Icon | Route | minTier |
|-------|------|-------|---------|
| Payments | CreditCard | /payments | enterprise |

Added to ACCOUNTING group in `AppSidebar.tsx`, after Bank Statements entry.

---

## 9. Migration

One new migration adding both tables. `payment_beneficiaries` first (referenced by FK), then `payment_instructions`.

---

## 10. Testing

- **Service tests** (AsyncMock): beneficiary CRUD, payment initiation with whitelist validation, approve/reject with SoD enforcement, transmit stub, cancel guard, invalid transitions return 409
- **Route tests** (httpx AsyncClient): all 11 endpoints
- **Engine/pure-function**: hash computation determinism

---

## 11. File Manifest

| Action | Path |
|--------|------|
| Create | `backend/app/models/payment.py` |
| Create | `backend/alembic/versions/0026_payment_initiation.py` |
| Create | `backend/app/services/payment_service.py` |
| Create | `backend/app/api/routes/v1_payments.py` |
| Create | `backend/tests/test_payment_service.py` |
| Create | `backend/tests/test_v1_payment_routes.py` |
| Create | `frontend/src/app/payments/page.tsx` |
| Modify | `backend/app/models/cash.py` — add 6 audit enum values |
| Modify | `backend/app/schemas_v1/cash.py` — add payment schemas |
| Modify | `backend/app/api/router.py` — register v1_payments router |
| Modify | `frontend/src/lib/api/cashClient.ts` — add payment API functions |
| Modify | `frontend/src/components/layout/AppSidebar.tsx` — add Payments nav entry |
