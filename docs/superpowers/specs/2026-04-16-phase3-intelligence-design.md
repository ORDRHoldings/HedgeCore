# Treasury Suite Phase 3 — Intelligence Tier (AI Add-On)

**Date:** 2026-04-16
**Status:** APPROVED
**Author:** ORDR Edge
**Related:** Treasury Suite §5, Phase 2 (complete), ADR-0014

---

## 1. Summary

Advisory-only AI tier gated behind a new `intelligence` plan tier. Two capabilities delivered on the current stack (Render + Vercel) using the Anthropic API directly, designed for drop-in Bedrock compatibility when AWS migration occurs. No ML model training in this sprint — deferred to Phase 3b.

**Capabilities:**
- **B — Natural Language Treasury Query**: CMD+K floating overlay on all pages. Tenant-scoped context injection. Prompt-hash-only log.
- **C — AI Report Commentary Draft**: Button on hedge-effectiveness and committee-pack export pages. Editable draft, human-review stamp on export.

**Core contract (ADR-0014):** All AI outputs are ADVISORY. No AI writes to WORM tables. No AI approves, executes, or modifies records. Human action required on 100% of AI suggestions.

---

## 2. Plan Tier Extension

New tier `"intelligence"` added as level 3 (superset of `"enterprise"` level 2).

### 2.1 Backend — `plan_enforcement.py`

```python
PLAN_HIERARCHY: dict[str, int] = {
    "starter": 0,
    "professional": 1,
    "enterprise": 2,
    "intelligence": 3,   # ← add this line
}
```

### 2.2 Backend gate pattern

Use the existing `require_plan_tier` dependency factory (raises HTTP 402, consistent with all other plan gates). The `intelligence_enabled` opt-in check is a second dependency:

```python
# In v1_intelligence.py module-level helpers:

def _require_intelligence_tier(
    current_user: User = Depends(require_plan_tier("intelligence")),
) -> User:
    """Raises HTTP 402 if intelligence tier not met."""
    return current_user

def _require_intelligence_enabled(
    current_user: User = Depends(_require_intelligence_tier),
) -> User:
    """Raises HTTP 402 if tenant has not opted in to intelligence."""
    if not getattr(current_user.company, "intelligence_enabled", False):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Intelligence is not enabled for your company. Enable it at /intelligence.",
        )
    return current_user
```

All intelligence endpoints use `Depends(_require_intelligence_enabled)`.

### 2.3 Company table addition

New column: `companies.intelligence_enabled BOOLEAN DEFAULT FALSE` — opt-in per tenant.

Added in two places:
1. `ALTER TABLE companies ADD COLUMN IF NOT EXISTS intelligence_enabled BOOLEAN DEFAULT FALSE` in `_ensure_tables()` in `app/core/db.py`.
2. `intelligence_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)` added to `Company` model in `backend/app/models/organization.py`.

### 2.4 Frontend

Add `"intelligence"` to the existing `PlanTier` union in `frontend/src/lib/authContext.tsx`:

```typescript
// Before (existing):
export type PlanTier = "lite" | "smb" | "professional" | "enterprise";
// After:
export type PlanTier = "lite" | "smb" | "professional" | "enterprise" | "intelligence";
```

Note: the frontend `"lite"` / `"smb"` vs. backend `"starter"` naming mismatch is pre-existing and out of scope for this sprint. Only the addition of `"intelligence"` (which maps to `PLAN_HIERARCHY["intelligence"] = 3`) is in scope here.

---

## 3. Data Model

### 3.1 `IntelligenceQueryLog`

Non-WORM, append-only by convention. **Never stores raw prompts** (financial data in prompts is an audit/compliance risk). Stores only a SHA-256 hash of the assembled prompt for duplicate detection. `id` is reused as `query_id` and `commentary_id` in API responses.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `default=uuid4` — returned as `query_id` / `commentary_id` |
| `company_id` | UUID | NOT NULL, indexed |
| `user_id` | UUID | NOT NULL |
| `capability` | VARCHAR(20) | `NL_QUERY` or `REPORT_COMMENTARY` |
| `prompt_hash` | VARCHAR(64) | SHA-256 of assembled prompt — not the prompt itself |
| `tokens_in` | INT | Anthropic input token count |
| `tokens_out` | INT | Anthropic output token count |
| `latency_ms` | INT | end-to-end response time |
| `created_at` | TIMESTAMP | `default=utcnow` |

**Indexes:** `(company_id)`, `(company_id, capability)`

---

## 4. Configuration

```python
# backend/app/core/config.py additions
ANTHROPIC_API_KEY: str = ""
ANTHROPIC_MODEL: str = "claude-sonnet-4-6"
```

**Client initialisation** (in `intelligence_service.py`, module level):

```python
import anthropic

def _get_client() -> anthropic.AsyncAnthropic:
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Intelligence service not configured (ANTHROPIC_API_KEY missing).",
        )
    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
```

Called at the top of each service function — not a module-level singleton — so misconfiguration returns a clean 503 rather than crashing at import time.

**Bedrock compatibility:** Swapping to Bedrock requires only replacing `_get_client()` with a `boto3` Bedrock client. All service and route code is unchanged.

---

## 5. Audit Enum

New value added to `CashAuditEventType` in `backend/app/models/cash.py`:
- `INTELLIGENCE_QUERY = "INTELLIGENCE_QUERY"`

Total enum count: 29.

---

## 6. API Endpoints

All under `/v1/intelligence`. Auth: `get_current_user`. Guard: `Depends(_require_intelligence_enabled)` (raises 402).

### 6.1 Natural Language Query

```
POST /v1/intelligence/query
  Body:  { "q": string (max 500 chars) }
  Guard: _require_intelligence_enabled

  Context injected (tenant-scoped, read-only aggregates, no PII):
    • Cash balances by currency + entity (last 30 days)
    • Open FX positions summary (count + notional by currency)
    • Pending payments count + total by currency
    • Most recent forecast liquidity gaps

  Response 200:
    {
      "query_id": "uuid",          ← intelligence_query_log.id
      "answer": "string",
      "data_refs": ["cash_balance:uuid", "payment:uuid", ...],
      "tokens_used": int,
      "latency_ms": int
    }

  Error responses:
    402  — tier gate / intelligence not enabled
    422  — q exceeds 500 chars or missing
    503  — ANTHROPIC_API_KEY not configured
    502  — Anthropic API error (rate limit, overload, auth failure)
```

### 6.2 Report Commentary Draft

```
POST /v1/intelligence/commentary
  Body:  { "report_type": "hedge_effectiveness" | "committee_pack",
           "report_id": "uuid" }
  Guard: _require_intelligence_enabled

  Context: fetches pre-computed report data (no re-calculation)
  Output:  2–3 paragraph draft with IFRS 9 / ASC 815 citations where relevant

  Response 200:
    {
      "commentary_id": "uuid",     ← intelligence_query_log.id for this row
      "draft": "string",
      "report_type": "string",
      "tokens_used": int
    }

  Error responses:
    402  — tier gate / intelligence not enabled
    404  — report_id not found or not owned by company
    503  — ANTHROPIC_API_KEY not configured
    502  — Anthropic API error
```

### 6.3 Intelligence Settings

```
GET  /v1/intelligence/settings
  Guard: _require_intelligence_tier (tier check only, not enabled check)
  Response: { "enabled": bool, "queries_this_month": int, "tokens_this_month": int,
              "model": str }

PATCH /v1/intelligence/settings
  Guard: _require_intelligence_tier + superuser or company admin role
  Body:  { "enabled": bool }
  Response: { "enabled": bool }
  Side effect: sets companies.intelligence_enabled
  Error: HTTP 403 Forbidden if user has intelligence tier but is not superuser/admin
         (tier check → 402; role check → 403 — these are distinct failure modes)
```

---

## 7. Service Layer — `intelligence_service.py`

```python
import anthropic
import hashlib
import time
from fastapi import HTTPException

def _get_client() -> anthropic.AsyncAnthropic:
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(503, "Intelligence service not configured (ANTHROPIC_API_KEY missing).")
    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

async def build_treasury_context(session, company_id: uuid.UUID) -> str:
    # Fetches: cash balances (last 30d), FX positions, pending payments, forecast gaps
    # Returns structured plain-text context — financial aggregates only, no PII
    # All queries are tenant-scoped via company_id WHERE clause

async def query_intelligence(session, company_id, user_id, q: str) -> QueryResponse:
    client = _get_client()
    context = await build_treasury_context(session, company_id)
    prompt = f"Treasury context:\n{context}\n\nQuestion: {q}"
    prompt_hash = hashlib.sha256(prompt.encode()).hexdigest()   # hash BEFORE calling API
    t0 = time.monotonic()
    try:
        response = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
    except anthropic.APIError as exc:
        raise HTTPException(502, f"Anthropic API error: {exc.status_code}") from exc
    latency_ms = int((time.monotonic() - t0) * 1000)
    log_row = await _log_query(
        session, company_id, user_id, "NL_QUERY",
        prompt_hash,                                  # hash stored, not raw prompt
        response.usage.input_tokens, response.usage.output_tokens, latency_ms,
    )
    return QueryResponse(
        query_id=str(log_row.id),
        answer=response.content[0].text,
        data_refs=[],   # populated by build_treasury_context context references
        tokens_used=response.usage.input_tokens + response.usage.output_tokens,
        latency_ms=latency_ms,
    )

async def draft_commentary(session, company_id, user_id,
                           report_type: str, report_id: str) -> CommentaryResponse:
    client = _get_client()
    # Fetch report data (raises 404 if not found / not owned)
    # Build structured commentary prompt with IFRS 9 / ASC 815 citations
    # Same error-handling pattern as query_intelligence (anthropic.APIError → 502)
    # prompt_hash computed before API call; stored in intelligence_query_log
    # Returns CommentaryResponse with commentary_id = log_row.id
```

---

## 8. Pydantic Schemas

```python
from typing import Literal
from pydantic import BaseModel, Field

class IntelligenceQuery(BaseModel):
    q: str = Field(..., max_length=500)

class QueryResponse(BaseModel):
    query_id: str
    answer: str
    data_refs: list[str]
    tokens_used: int
    latency_ms: int

class CommentaryRequest(BaseModel):
    report_type: Literal["hedge_effectiveness", "committee_pack"]
    report_id: str

class CommentaryResponse(BaseModel):
    commentary_id: str
    draft: str
    report_type: str
    tokens_used: int

class IntelligenceSettings(BaseModel):
    enabled: bool

class IntelligenceSettingsResponse(BaseModel):
    enabled: bool
    queries_this_month: int
    tokens_this_month: int
    model: str
```

---

## 9. Frontend

### 9.1 CMD+K Overlay (`CmdKOverlay.tsx`)

Global component mounted in the root layout. Visible on all pages when `user.plan_tier === "intelligence"`.

```
  Cmd+K / Ctrl+K  → opens overlay
  Esc             → closes overlay
  Enter           → submits query

  ┌──────────────────────────────────────────────┐
  │  ⌘K  Ask your treasury data...              │
  │  ┌────────────────────────────────────────┐ │
  │  │  What is our EUR net exposure today?   │ │
  │  └────────────────────────────────────────┘ │
  │                                              │
  │  EUR net short $2.4M across 3 entities.     │
  │  Largest: DE subsidiary ($1.1M).            │
  │  [View cash positions →]  [View FX →]       │
  │                                              │
  │  ── ADVISORY — AI output, not financial     │
  │     advice. Verify before acting. ──        │
  └──────────────────────────────────────────────┘
```

Advisory disclaimer always visible in overlay. API calls go to `POST /v1/intelligence/query` via `intelligenceClient.ts`.

### 9.2 Report Commentary Button

Added to `hedge-effectiveness/page.tsx` export section. Button only renders when `user.plan_tier === "intelligence"`.

```
  [Export PDF]  [Export XML]  [Draft AI Commentary ✦]
                               ↓ (intelligence tier only)
  ┌──────────────────────────────────────────────┐
  │  AI COMMENTARY DRAFT                         │
  │  ─────────────────────────────────────────── │
  │  [editable textarea — 2-3 paragraphs]        │
  │                                              │
  │  ✦ AI-assisted · human review required      │
  │  [Include in export]  [Discard]              │
  └──────────────────────────────────────────────┘
```

Export stamps commentary: `"AI-assisted, human-reviewed: [date] [user.email]"`

### 9.3 Intelligence Settings Page (`/intelligence`)

Reads from `GET /v1/intelligence/settings`. Superuser / company admin sees toggle for `intelligence_enabled` (calls `PATCH /v1/intelligence/settings`). All users see usage stats (queries this month, tokens used) and current model name.

---

## 10. Sidebar Navigation

| Label | Icon | Route | minTier |
|-------|------|-------|---------|
| Intelligence | Brain | /intelligence | intelligence |

Added to a new `INTELLIGENCE` group in `AppSidebar.tsx`.

---

## 11. ADR-0014

`docs/architecture/adr/0014-ai-advisory-only-contract.md`

**Decision:** All AI outputs in ORDR Terminal are advisory. The intelligence service may never write to WORM tables, may never approve/reject/execute records, and may never trigger state machine transitions. Every AI-generated output requires explicit human confirmation before any record is modified. This contract is enforced at the service layer: `intelligence_service.py` performs only SELECT queries on business data (via `build_treasury_context`). The only INSERT it performs is into `intelligence_query_log` (non-WORM). Session commit for `intelligence_query_log` is done inside the service (not delegated to the caller).

---

## 12. Testing

- **Service tests** (AsyncMock): `build_treasury_context` returns structured string; `query_intelligence` hashes prompt before logging (verify `_log_query` receives a 64-char hex string, not raw text); `query_intelligence` calls Anthropic client with correct model + message shape; `anthropic.APIError` raises 502; empty `ANTHROPIC_API_KEY` raises 503; `draft_commentary` raises 404 when report_id not found; tier guard raises 402 (not 403).
- **Route tests** (httpx AsyncClient): POST /query 200; POST /query 402 wrong tier; POST /query 503 missing API key; POST /query 502 Anthropic error (mock `anthropic.APIError`); POST /commentary 200; POST /commentary 404 unknown report_id; GET /settings 200; PATCH /settings 200 (superuser); PATCH /settings 403 non-admin.
- **Pure function**: prompt hash determinism (same input → same 64-char hex).

---

## 13. File Manifest

| Action | Path |
|--------|------|
| Create | `backend/app/models/intelligence.py` |
| Create | `backend/migrations/versions/<hash>_intelligence.py` |
| Create | `backend/app/services/intelligence_service.py` |
| Create | `backend/app/api/routes/v1_intelligence.py` |
| Create | `backend/tests/test_intelligence_service.py` |
| Create | `backend/tests/test_v1_intelligence_routes.py` |
| Create | `frontend/src/app/intelligence/page.tsx` |
| Create | `frontend/src/components/intelligence/CmdKOverlay.tsx` |
| Create | `frontend/src/lib/api/intelligenceClient.ts` |
| Create | `docs/architecture/adr/0014-ai-advisory-only-contract.md` |
| Modify | `backend/app/core/config.py` — ANTHROPIC_API_KEY + ANTHROPIC_MODEL |
| Modify | `backend/app/core/plan_enforcement.py` — add `"intelligence": 3` to PLAN_HIERARCHY |
| Modify | `backend/app/models/cash.py` — INTELLIGENCE_QUERY enum value |
| Modify | `backend/app/models/organization.py` — add `intelligence_enabled` Mapped column |
| Modify | `backend/app/core/db.py` — ALTER TABLE companies ADD COLUMN intelligence_enabled |
| Modify | `backend/app/api/router.py` — register v1_intelligence |
| Modify | `frontend/src/lib/authContext.tsx` — add "intelligence" to PlanTier |
| Modify | `frontend/src/components/layout/AppSidebar.tsx` — Intelligence nav entry |
| Modify | `frontend/src/app/hedge-effectiveness/page.tsx` — commentary button |
