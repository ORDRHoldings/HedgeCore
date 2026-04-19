# Current Sprint

Sprint: P2-A — JSON Batch Position Import API
Status: COMPLETE (2026-04-18)
Started: 2026-04-18
Completed: 2026-04-18

## Goal
First item from the P2 (competitive-parity) backlog: allow programmatic clients
(ETL jobs, ERP bridges, scripted integrations) to push positions directly as
JSON without going through the CSV upload → parse → validate → commit dance.
Reuse the existing validation pipeline so both surfaces stay in lockstep.

## Deliverables
| # | Item | Status |
|---|------|--------|
| T1 | `batch_import_json()` service — identity-mapped reuse of `validate_rows()` | DONE |
| T2 | Atomic commit: all-or-nothing; zero-error + `dry_run=false` → COMMITTED | DONE |
| T3 | ImportBatch persisted for audit on every outcome (UPLOADED → VALIDATED / COMMITTED) | DONE |
| T4 | `POST /v1/positions/import/batch-json` route — 5000-row cap, trades.create gate | DONE |
| T5 | Pydantic schemas `PositionInput` + `BatchJsonRequest` with field validation | DONE |
| T6 | Audit event with `source=json_api` + batch status | DONE |
| T7 | 12-test unit suite covering all I-00X codes + default-status fallback | DONE |
| T8 | Route registration verified (`/api/v1/positions/import/batch-json`) | DONE |
| T9 | Commit + state/changelog rollup | DONE |

## Architectural Decisions
- **Pipeline reuse, not duplication** — the JSON route stringifies values and
  invokes `validate_rows(rows, identity_mapping, existing_ids)`. Same error
  codes (I-001..I-010), same FUTURES_CURRENCIES check, same date parser.
  Drift between CSV and JSON paths is structurally impossible.
- **Identity mapping trick** — `{field: field for field in _COLUMN_ALIASES}`
  tells the generic `_extract_field()` helper that each canonical field is
  its own "column name". No new helper required.
- **Atomic commit** — a single invalid row rejects the entire batch with
  `status=VALIDATED`. Callers integrating with ERP transactions need
  all-or-nothing semantics. Partial success on 4999-of-5000 rows is a trap.
- **Audit trail on failure** — the `ImportBatch` is always persisted, even
  on rejection. Compliance needs the full attempt log, including which rows
  failed validation and why.
- **`dry_run=true`** — validates and persists the batch with status=VALIDATED
  but creates no positions. Lets callers pre-check a payload before commit.

## Route Shipped (1 new)
```
POST /v1/positions/import/batch-json    # trades.create gate; max 5000 rows
```

## Request / Response

**Request:**
```json
{
  "positions": [
    {"record_id": "POS-001", "entity": "Acme Corp", "flow_type": "AR",
     "currency": "EUR", "amount": 500000, "value_date": "2026-06-15",
     "status": "CONFIRMED", "description": "Q2 receivable"}
  ],
  "dry_run": false
}
```

**Response** (same `ImportBatchResponse` shape as CSV routes):
```json
{
  "id": "uuid",
  "filename": "api-batch-json",
  "file_hash": "<sha256 of sorted JSON payload>",
  "row_count": 1,
  "valid_count": 1,
  "error_count": 0,
  "duplicate_count": 0,
  "created_count": 1,
  "status": "COMMITTED",
  "column_mapping": {"record_id": "record_id", ...},
  "validation_errors": [],
  "created_position_ids": ["<new position uuid>"],
  "raw_preview": [...],
  "created_at": "...",
  "validated_at": "...",
  "committed_at": "..."
}
```

## Test Coverage
12 unit tests in `test_position_import_json.py`:
- Happy path single-row (1)
- Float amount survives str() round-trip (1)
- Missing required field I-001 (1)
- Invalid currency I-002 (1)
- Invalid flow type I-003 (1)
- Negative amount I-005 (1)
- Invalid date I-006 (1)
- Duplicate within batch I-007 (1)
- Duplicate in DB I-008 (1)
- Default status CONFIRMED when omitted (1)
- Mixed valid/invalid partitions correctly (1)
- Empty-list guard raises ValueError (1)

All 12 passing on SQLite / Windows.

## Files Changed
**Backend**
- `backend/app/services/position_import_service.py` (+~110 LOC: `batch_import_json`)
- `backend/app/api/routes/v1_position_import.py` (+~70 LOC: schemas + endpoint)
- `backend/tests/test_position_import_json.py` (NEW, 12 tests)

## Commits
- `1e07faa` — feat(positions): P2-A — JSON batch position import API

## Next
P2 backlog remaining:
- Mobile-responsive layouts (all pages desktop-only today)
- Custom report builder (Report Studio templates fixed today)
- Hedge program templates library
- Embedded real-time FX rates widget on dashboard
