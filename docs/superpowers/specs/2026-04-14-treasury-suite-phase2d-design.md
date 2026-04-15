# Treasury Suite Phase 2d — Bank Statement Import

## Goal

Import bank statement files (MT940, CAMT.053, BAI2), parse them into a common structure, deduplicate by content hash, and persist as BankStatement + BankTransaction records for downstream reconciliation and cash position enrichment.

## Architecture

Three pure-function parsers (MT940, CAMT.053, BAI2) that each produce a common `ParsedStatement` dataclass. One import service that takes a `ParsedStatement`, deduplicates by source hash, and persists `BankStatement` + `BankTransaction` records. One route file for upload + query. Two new DB models. One migration. Follows Phase 2a/2b/2c patterns: AsyncMock unit tests, tenant-scoped JOINs through `LegalEntity`, `dashboardFetch`-based frontend, WORM audit trail via existing `cash_audit_events`.

## Tech Stack

Python 3.12, FastAPI, SQLAlchemy 2.x async, Alembic raw SQL migration, Next.js 15 App Router, TypeScript 5, lucide-react, IBM Plex fonts.

---

## 1. Data Model

### 1.1 BankStatement (new table: `bank_statements`)

One row per imported statement file.

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | UUID PK | DEFAULT gen_random_uuid() | |
| company_id | UUID NOT NULL | INDEX | Tenant scope |
| account_id | UUID NOT NULL | FK→bank_accounts | Which account this statement is for |
| statement_date | DATE NOT NULL | | Statement closing date |
| opening_balance | NUMERIC(20,6) NOT NULL | | Opening balance from statement |
| closing_balance | NUMERIC(20,6) NOT NULL | | Closing balance from statement |
| currency | VARCHAR(3) NOT NULL | | ISO 4217 |
| format | VARCHAR(16) NOT NULL | CHECK IN ('MT940','CAMT053','BAI2') | Source format |
| source_hash | VARCHAR(128) NOT NULL | UNIQUE | SHA-256 of raw file content — dedup key |
| transaction_count | INTEGER NOT NULL | | Count of parsed transactions |
| filename | VARCHAR(255) | | Original upload filename |
| created_by | UUID NOT NULL | | |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() | |

### 1.2 BankTransaction (new table: `bank_transactions`)

One row per transaction line in the statement.

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | UUID PK | DEFAULT gen_random_uuid() | |
| statement_id | UUID NOT NULL | FK→bank_statements, INDEX | Parent statement |
| account_id | UUID NOT NULL | INDEX | FK→bank_accounts (denormalized for query perf) |
| company_id | UUID NOT NULL | INDEX | Tenant scope |
| tx_date | DATE NOT NULL | | Transaction date |
| value_date | DATE | | Value/settlement date |
| amount | NUMERIC(20,6) NOT NULL | | Absolute amount |
| currency | VARCHAR(3) NOT NULL | | ISO 4217 |
| direction | VARCHAR(6) NOT NULL | CHECK IN ('DEBIT','CREDIT') | |
| description | VARCHAR(512) | | Transaction narrative |
| reference | VARCHAR(128) | | Bank reference |
| counterparty | VARCHAR(256) | | Counterparty name |
| tx_code | VARCHAR(16) | | SWIFT/BAI2 transaction type code |
| reconciliation_status | VARCHAR(16) NOT NULL | DEFAULT 'UNMATCHED', CHECK IN ('UNMATCHED','MATCHED','EXCEPTION') | For future reconciliation engine |
| created_at | TIMESTAMPTZ NOT NULL | DEFAULT now() | |

### 1.3 Audit Event Types

Add to `CashAuditEventType` enum:

```
STATEMENT_IMPORTED
```

---

## 2. Parser Common Interface

File: `backend/app/services/parsers/statement_types.py`

```python
@dataclass
class ParsedTransaction:
    tx_date: date
    value_date: date | None
    amount: Decimal
    direction: str  # "DEBIT" or "CREDIT"
    description: str
    reference: str
    counterparty: str
    tx_code: str

@dataclass
class ParsedStatement:
    account_identifier: str  # IBAN or account number
    statement_date: date
    opening_balance: Decimal
    closing_balance: Decimal
    currency: str
    transactions: list[ParsedTransaction]
```

---

## 3. Parsers (Pure Functions)

Same isolation pattern as `forecast_engine.py` — zero DB access, zero side effects, fully deterministic.

### 3.1 MT940 Parser

File: `backend/app/services/parsers/mt940_parser.py`

Function: `parse_mt940(content: str) -> list[ParsedStatement]`

SWIFT MT940 is a line-based format with tag markers:
- `:20:` — Transaction reference
- `:25:` — Account identification (IBAN or account number)
- `:28C:` — Statement number/sequence
- `:60F:` or `:60M:` — Opening balance (F=first, M=intermediate)
- `:61:` — Transaction line (date, amount, direction, reference)
- `:86:` — Transaction description (follows :61:)
- `:62F:` or `:62M:` — Closing balance

Direction: `C` = CREDIT, `D` = DEBIT, `RC` = reversal credit (treat as DEBIT), `RD` = reversal debit (treat as CREDIT).

Multiple statements in one file are separated by `-` on a line.

### 3.2 CAMT.053 Parser

File: `backend/app/services/parsers/camt053_parser.py`

Function: `parse_camt053(content: str) -> list[ParsedStatement]`

ISO 20022 XML format. Path structure:
- `Document/BkToCstmrStmt/Stmt` — one per statement
- `Stmt/Acct/Id/IBAN` or `Stmt/Acct/Id/Othr/Id` — account identifier
- `Stmt/Bal` — balances (OPBD=opening, CLBD=closing)
- `Stmt/Ntry` — entries (transactions)
- `Ntry/Amt` with `@Ccy` — amount and currency
- `Ntry/CdtDbtInd` — CRDT or DBIT
- `Ntry/BookgDt/Dt` — booking date
- `Ntry/ValDt/Dt` — value date
- `Ntry/NtryDtls/TxDtls/RmtInf/Ustrd` — description
- `Ntry/NtryDtls/TxDtls/Refs/EndToEndId` — reference

Parse with `xml.etree.ElementTree` (stdlib). Namespace: `urn:iso:std:iso:20022:tech:xsd:camt.053.001.02` (or later versions — strip namespace prefix for compatibility).

### 3.3 BAI2 Parser

File: `backend/app/services/parsers/bai2_parser.py`

Function: `parse_bai2(content: str) -> list[ParsedStatement]`

US banking format. Record types:
- `01` — File header
- `02` — Group header
- `03` — Account header (account number, currency, summary balances)
- `16` — Transaction detail (type code, amount, reference, description)
- `49` — Account trailer
- `88` — Continuation record (appends to previous 03/16/88)
- `98` — Group trailer
- `99` — File trailer

BAI2 type codes: `010`/`015` = opening available/ledger balance, `040`/`045` = closing available/ledger balance. Transaction codes 100-399 = credits, 400-699 = debits.

Continuation records (`88`) must be concatenated to the previous record before parsing.

---

## 4. Import Service

File: `backend/app/services/statement_service.py`

### Functions

| Function | Purpose |
|----------|---------|
| `detect_format(content: str) -> str` | Auto-detect MT940/CAMT053/BAI2 from content |
| `import_statement(session, company_id, account_id, content, filename, created_by)` | Full pipeline: detect → parse → dedup → persist → audit |
| `list_statements(session, company_id, account_id?)` | List imported statements |
| `get_statement(session, statement_id, company_id)` | Get single statement with transaction count |
| `list_transactions(session, company_id, account_id?, date_from?, date_to?, status?)` | Query transactions with filters |

### Format Detection

```
if content.strip().startswith("<?xml") or content.strip().startswith("<Document"):
    return "CAMT053"
elif content.strip().startswith("01,"):
    return "BAI2"
else:
    return "MT940"  # default — MT940 starts with tag blocks
```

### Deduplication

`source_hash = SHA-256(raw file content)`. If a BankStatement with matching `source_hash` already exists for the same `company_id`, reject with 409 Conflict.

### Account Matching

The parser produces an `account_identifier` (IBAN or account number). The service must match this against `BankAccount` records. For v1, the account_id is provided explicitly in the upload request (the user selects which account the file belongs to). Future: auto-match by IBAN.

---

## 5. API Routes

File: `backend/app/api/routes/v1_cash_statements.py`
Prefix: `/v1/cash/statements`

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/upload` | Upload statement file (multipart form) | write role |
| GET | `/` | List imported statements | professional |
| GET | `/{statement_id}` | Get statement detail | professional |
| GET | `/{statement_id}/transactions` | List transactions for a statement | professional |
| GET | `/transactions` | List all transactions (filterable) | professional |

### Upload Endpoint

Accepts `multipart/form-data` with:
- `file`: The statement file (required)
- `account_id`: UUID of the target bank account (required)
- `format`: Optional format override (auto-detected if omitted)

Returns: `BankStatementResponse` with `201 Created` or `409 Conflict` on duplicate.

---

## 6. Pydantic Schemas

Append to `backend/app/schemas_v1/cash.py`:

- `BankStatementResponse` — id, account_id, statement_date, opening_balance, closing_balance, currency, format, transaction_count, filename, created_at
- `BankTransactionResponse` — id, statement_id, account_id, tx_date, value_date, amount, currency, direction, description, reference, counterparty, tx_code, reconciliation_status, created_at
- `StatementUploadResponse` — statement summary + transaction_count + duplicate flag

---

## 7. Frontend

Add a "Statement Import" section to the existing `/cash-positions` page or as a dedicated tab. Minimal UI:
- File upload dropzone with account selector
- Recent imports table (statement date, format, tx count, status)
- Expandable transaction list per statement

For v1, this can be a simple upload form — the primary value is the backend pipeline.

---

## 8. Migration

File: `backend/migrations/versions/0024_bank_statements.py`

- CREATE TABLE bank_statements (with UNIQUE constraint on source_hash, indexes)
- CREATE TABLE bank_transactions (with indexes on statement_id, account_id, company_id)

---

## 9. Testing

| File | Tests | Type |
|------|-------|------|
| `test_mt940_parser.py` | Parse valid MT940, multi-statement, reversal entries, malformed input | Pure function |
| `test_camt053_parser.py` | Parse valid CAMT.053 XML, multiple entries, namespace handling | Pure function |
| `test_bai2_parser.py` | Parse valid BAI2, continuation records, edge cases | Pure function |
| `test_statement_service.py` | Import pipeline, dedup rejection, format detection | AsyncMock |
| `test_v1_statements_routes.py` | Upload (201), duplicate (409), list, get detail | httpx AsyncClient |
