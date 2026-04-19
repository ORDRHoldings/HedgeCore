# Current Sprint

Sprint: P1-B — SWIFT MT103 + ISO 20022 pain.001 Wire Messages
Status: COMPLETE (2026-04-18)
Started: 2026-04-18
Completed: 2026-04-18

## Goal
Close the last competitive-gap item: generate straight-through wire instructions
from approved payment instructions. Two formats: MT103 (SWIFT FIN, legacy banks)
and pain.001.001.09 (ISO 20022 CBPR+, modern rails). No bank connectivity —
paper mode only, as per v1 architecture freeze. Banks receive the message via
the payments page (copy / download).

## Deliverables
| # | Item | Status |
|---|------|--------|
| T1 | `swift_message_service.py` — pure `generate_mt103` + `generate_pain001` + dispatcher | DONE |
| T2 | payment_type → supported-format matrix (`supported_formats_for`) | DONE |
| T3 | `GET /v1/payments/{id}/message?format=mt103\|pain001` endpoint | DONE |
| T4 | Ordering-party derivation from `company.settings.ordering_party` | DONE |
| T5 | `test_swift_message_service.py` — 19 passing unit tests | DONE |
| T6 | `cashClient.getPaymentMessage()` + typed `PaymentMessageResponse` | DONE |
| T7 | `SwiftMessageModal` — format switcher, copy-to-clipboard, download | DONE |
| T8 | Row action buttons: GENERATE WIRE (APPROVED) + VIEW WIRE MESSAGE (TRANSMITTED) | DONE |
| T9 | TypeScript clean + routes registered verification | DONE |
| T10 | Commits + state/memory rollup | DONE |

## Architectural Decisions
- **Pure-function generators** — no DB side effect. Message is reproducible from
  the payment's `instruction_hash` alone. Endpoint is a read-only rendering, not
  a state transition; calling it does NOT advance payment status.
- **Format matrix** baked into the service (not a settings table):
  - SWIFT, CHAPS → both MT103 and pain.001 available
  - SEPA, ACH, FPS → pain.001 only
- **Ordering-party fallback chain**: `company.settings.ordering_party.{name,bic,account_number,address_line1,address_line2,country_code}` → `company.name` → literal defaults. This keeps enterprise onboarding simple while allowing a tenant to fully configure their BIC/IBAN.
- **MT103 amount formatting**: comma decimal, quantized to 2dp (`Decimal("100000.50")` → `100000,50`). Currencies requiring different minor-unit handling (e.g. JPY) will need caller overrides — not wired for v1.
- **XML injection safety**: all beneficiary/company free-text fields run through `html.escape(..., quote=True)` before interpolation into pain.001.
- **Deterministic hash** — `message_hash` = SHA-256 of full message bytes; `message_reference` = first 16 hex chars (used as filename suffix).

## Routes Shipped (1 new)
```
GET /v1/payments/{id}/message?format=mt103|pain001    # enterprise-gated, APPROVED/TRANSMITTED only
```

## Response Shape
```json
{
  "payment_id": "uuid",
  "format": "mt103|pain001",
  "content": "...",
  "message_hash": "<sha256 hex>",
  "message_reference": "<16 hex chars>",
  "payment_type": "SWIFT",
  "supported_formats": ["mt103", "pain001"],
  "instruction_hash": "..."
}
```

## Test Coverage
19 unit tests in `test_swift_message_service.py`:
- MT103: required tags present, comma-decimal amounts, deterministic hash, format-vs-rail rejection, missing-field handling, charges-code override (7)
- pain.001: valid XML structure, amount formatting, XML escaping, unknown-payment-type rejection, deterministic structural markers, ACH path (6)
- Dispatcher + format-support matrix (6)

## Files Changed
**Backend**
- `backend/app/services/swift_message_service.py` (NEW, ~220 LOC)
- `backend/app/api/routes/v1_payments.py` (+~80 LOC, new endpoint)
- `backend/tests/test_swift_message_service.py` (NEW, 19 tests)

**Frontend**
- `frontend/src/lib/api/cashClient.ts` (+~20 LOC, new client function + types)
- `frontend/src/app/payments/page.tsx` (+~210 LOC: modal component, 3 handlers, 2 row-action buttons, state)

## Commits
- `2aa09c9` — feat(payments): P1-B — SWIFT MT103 + ISO 20022 pain.001 wire message generation
- `b938ea8` — feat(payments-ui): P1-B — SWIFT/pain.001 wire message preview modal on /payments

## Roadmap Status
**All P0/P1 items shipped.** Competitive-gap roadmap complete:
- ✅ P0-A Regulatory Submissions (EMIR / MiFID II / Dodd-Frank)
- ✅ P0-B Pre-Trade TCA
- ✅ P0-C Counterparty Scoring Hub
- ✅ P1-A Natural Hedging Optimizer
- ✅ P1-B SWIFT / pain.001 wire messages

## Next
No further P0/P1 sprints queued. Candidates from P2 (competitive parity):
- Mobile-responsive layouts
- Bulk position import API
- Custom report builder (fixed templates → configurable)
- Hedge program templates library
- Embedded real-time FX rates widget
