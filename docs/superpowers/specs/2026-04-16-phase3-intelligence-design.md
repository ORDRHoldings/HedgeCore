# Treasury Suite Phase 3 — Intelligence Tier (AI Add-On)

**Date:** 2026-04-16
**Status:** APPROVED
**Author:** ORDR Edge
**Related:** Treasury Suite §5, Phase 2 (complete), ADR-0012

---

## 1. Summary

Advisory-only AI tier gated behind a new `intelligence` plan tier. Two capabilities delivered on the current stack (Render + Vercel) using the Anthropic API directly, designed for drop-in Bedrock compatibility when AWS migration occurs. No ML model training in this sprint — deferred to Phase 3b.

**Capabilities:**
- **B — Natural Language Treasury Query**: CMD+K floating overlay on all pages. Tenant-scoped context injection. Non-storing prompt log.
- **C — AI Report Commentary Draft**: Button on hedge-effectiveness and committee-pack export pages. Editable draft, human-review stamp on export.

**Core contract (ADR-0012):** All AI outputs are ADVISORY. No AI writes to WORM tables. No AI approves, executes, or modifies records. Human action required on 100% of AI suggestions.

---

## 2. Plan Tier Extension

New tier added to the hierarchy: `"intelligence"` (superset of `"enterprise"`).

### 2.1 Frontend

```typescript
// frontend/src/lib/authContext.tsx
export type PlanTier = "lite" | "smb" | "professional" | "enterprise" | "intelligence";
```

### 2.2 Backend gate pattern

```python
def _require_intelligence(user):
    if user.company.plan_tier != "intelligence":
        raise HTTPException(403, "Intelligence tier required")
    if not user.company.intelligence_enabled:
        raise HTTPException(403, "Intelligence not enabled for this company")
```

### 2.3 Company table addition

New column: `companies.intelligence_enabled BOOLEAN DEFAULT FALSE` — opt-in per tenant. Added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `_ensure_tables()`.

---

## 3. Data Model

### 3.1 `IntelligenceQueryLog`

Non-WORM, append-only by convention. Never stores raw prompts (financial data in prompts is an audit risk). Stores only a SHA-256 hash of the prompt for duplicate detection.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `default=uuid4` |
| `company_id` | UUID | indexed |
| `user_id` | UUID | who issued the query |
| `capability` | VARCHAR(20) | `NL_QUERY` or `REPORT_COMMENTARY` |
| `prompt_hash` | VARCHAR(64) | SHA-256 of prompt — not the prompt itself |
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

Bedrock-compatible: swapping to Bedrock requires only changing the client initialisation in `intelligence_service.py` — all service and route code is unchanged.

---

## 5. Audit Enum

New value added to `CashAuditEventType`:
- `INTELLIGENCE_QUERY = "INTELLIGENCE_QUERY"`

Total enum count: 29.

---

## 6. API Endpoints

All under `/v1/intelligence`. Auth: `get_current_user`. Guard: `intelligence` tier + `intelligence_enabled`.

### 6.1 Natural Language Query

```
POST /v1/intelligence/query
  Body:  { "q": string }
  Guard: intelligence.read + intelligence_enabled

  Context injected (tenant-scoped only):
    • Cash balances by currency + entity (last 30 days)
    • Open FX positions summary
    • Pending payments count + total by currency
    • Most recent forecast gaps

  Response:
    {
      "query_id": "uuid",
      "answer": "string",
      "data_refs": ["cash_balance:uuid", "payment:uuid", ...],
      "tokens_used": int,
      "latency_ms": int
    }
```

### 6.2 Report Commentary Draft

```
POST /v1/intelligence/commentary
  Body:  { "report_type": "hedge_effectiveness" | "committee_pack",
           "report_id": "uuid" }
  Guard: intelligence.read + intelligence_enabled

  Context: pulls pre-computed report data (no re-calculation)
  Response:
    {
      "commentary_id": "uuid",
      "draft": "string",   ← 2-3 paragraphs
      "report_type": "string",
      "tokens_used": int
    }
```

---

## 7. Service Layer — `intelligence_service.py`

```python
async def build_treasury_context(session, company_id) -> str:
    # Fetches: cash balances, FX positions, pending payments, forecast gaps
    # Returns structured plain-text context for prompt injection
    # Never includes PII — only financial aggregates

async def query_intelligence(session, company_id, user_id, q: str) -> QueryResponse:
    context = await build_treasury_context(session, company_id)
    prompt = f"Treasury context:\n{context}\n\nQuestion: {q}"
    t0 = time.monotonic()
    response = anthropic_client.messages.create(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    latency_ms = int((time.monotonic() - t0) * 1000)
    await _log_query(session, company_id, user_id, "NL_QUERY", prompt,
                     response.usage.input_tokens, response.usage.output_tokens, latency_ms)
    return QueryResponse(answer=response.content[0].text, ...)

async def draft_commentary(session, company_id, user_id,
                           report_type: str, report_id: str) -> CommentaryResponse:
    # Fetches report data, builds structured prompt
    # Returns editable draft with regulatory citations (IFRS 9 / ASC 815)
```

---

## 8. Pydantic Schemas

```python
class IntelligenceQuery(BaseModel):
    q: str  # max 500 chars

class QueryResponse(BaseModel):
    query_id: str
    answer: str
    data_refs: list[str]
    tokens_used: int
    latency_ms: int

class CommentaryRequest(BaseModel):
    report_type: str   # "hedge_effectiveness" | "committee_pack"
    report_id: str

class CommentaryResponse(BaseModel):
    commentary_id: str
    draft: str
    report_type: str
    tokens_used: int
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

Advisory disclaimer always visible in overlay.

### 9.2 Report Commentary Button

Added to `hedge-effectiveness/page.tsx` export section:

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

Export stamps commentary: `"AI-assisted, human-reviewed: 2026-04-16 [user]"`

### 9.3 Intelligence Settings Page (`/intelligence`)

Simple page: enable/disable Intelligence for the company, usage stats (queries this month, tokens used), model info. Sidebar: Intelligence (Brain icon, `intelligence` tier gate).

---

## 10. Sidebar Navigation

| Label | Icon | Route | minTier |
|-------|------|-------|---------|
| Intelligence | Brain | /intelligence | intelligence |

Added to a new `INTELLIGENCE` group in `AppSidebar.tsx`.

---

## 11. ADR-0012

`docs/architecture/adr/0012-ai-advisory-only-contract.md`

**Decision:** All AI outputs in ORDR Terminal are advisory. The intelligence service may never write to WORM tables, may never approve/reject/execute records, and may never trigger state machine transitions. Every AI-generated output requires explicit human confirmation before any record is modified. This contract is enforced at the service layer: `intelligence_service.py` has read-only DB access (no session.add, no session.commit on business objects).

---

## 12. Testing

- **Service tests** (AsyncMock): `build_treasury_context` returns structured string, `query_intelligence` calls Anthropic client with correct prompt shape, logs to `intelligence_query_log`, SoD not applicable (advisory only), tier guard raises 403 when not intelligence.
- **Route tests** (httpx AsyncClient): POST /query (200), POST /commentary (200), 403 on wrong tier.
- **Pure function**: prompt hash determinism.

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
| Create | `docs/architecture/adr/0012-ai-advisory-only-contract.md` |
| Modify | `backend/app/core/config.py` — ANTHROPIC_API_KEY + MODEL |
| Modify | `backend/app/models/cash.py` — INTELLIGENCE_QUERY enum |
| Modify | `backend/app/api/router.py` — register v1_intelligence |
| Modify | `frontend/src/lib/authContext.tsx` — add "intelligence" to PlanTier |
| Modify | `frontend/src/lib/api/cashClient.ts` — query + commentary fns |
| Modify | `frontend/src/components/layout/AppSidebar.tsx` — Intelligence nav |
| Modify | `frontend/src/app/hedge-effectiveness/page.tsx` — commentary button |
