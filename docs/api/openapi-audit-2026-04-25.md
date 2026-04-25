# OpenAPI Spec Audit — 2026-04-25

**Inputs:** `backend/app/main.py` (live FastAPI app, generated `docs/api/openapi.json`) vs. `docs/api/integration-guide.md`
**Auditor:** internal (autonomous run)
**Reviewed paths:** 390 · **Operations:** 452 · **Tags:** 81 · **Mutating ops (POST/PUT/PATCH/DELETE):** 222

---

## Executive summary

The integration guide describes an **aspirational** API surface. It does not match the live OpenAPI spec. Every single endpoint promised in the guide's "Common integration patterns" section returns 404 today. Customers building against the guide will fail on the first call.

Two interpretations:

1. **The guide is the contract** — refactor the backend to match the guide. Largest blast radius; touches 222 mutating endpoints.
2. **The live spec is the contract** — rewrite the guide to match what's actually shipped. Fastest path to a usable integration story for current prospects.

**Recommendation:** option 2 for v1, with a small batch of contract-stabilizing fixes (P0-1 through P0-4 below). A v1.5 sprint can revisit endpoint naming for the v2 surface.

---

## P0 — Contract-breaking gaps (block any integration today)

### P0-1. Promised endpoints don't exist

All six endpoints featured in `integration-guide.md` "Common integration patterns" are missing.

| Promised in guide | Actual nearest equivalent | Fix |
|---|---|---|
| `POST /api/v1/exposures/batch` | `POST /api/v1/positions/import/batch-json` | Rewrite guide Pattern 1 to use the actual path; rename request fields to match `PositionImport` schema |
| `GET /api/v1/hedges/proposed?status=pending_approval` | `GET /api/v1/proposals/pending` | Rewrite guide Pattern 2 |
| `POST /api/v1/hedges/{hedge_id}/approve` | `PATCH /api/v1/proposals/{proposal_id}/approve` | Rewrite guide Pattern 3 (note: `PATCH`, not `POST`) |
| `POST /api/v1/audit-packs` | No equivalent. Closest: `GET /api/v1/audit-lab/runs/{run_id}/export` and `GET /api/v1/export/zip/{run_id}` | Either build an audit-pack endpoint OR rewrite guide Pattern 4 around the export endpoints |
| `GET /api/v1/audit-packs/{audit_pack_id}` | Same as above | Same as above |
| `GET /api/v1/audit-packs/{audit_pack_id}/download` | `GET /api/v1/export/zip/{run_id}` | Rewrite guide Pattern 4 download step |

### P0-2. Idempotency-Key header is documented but not implemented

- **Guide promises:** every mutation accepts `Idempotency-Key`; server stores response keyed by `(api_key_id, idempotency_key)` for 24 hours and returns the same response on retry.
- **Reality:** zero operations declare an `Idempotency-Key` parameter. The middleware does not exist.
- **Risk:** a customer following the guide and sending the header expects retry safety. Without server enforcement, a network blip + retry double-creates positions, double-submits proposals, or double-approves hedges. **This is a treasury data-integrity risk, not just a docs bug.**
- **Fix path:**
  1. Build `IdempotencyMiddleware` that intercepts `POST/PUT/PATCH/DELETE`, hashes `(api_key_id, header_value)`, looks up an `idempotency_key_response` table (TTL 24h), returns cached response on hit.
  2. Add OpenAPI `parameters` declaration in a shared dependency so the header surfaces on every mutating route.
  3. Tests: replay a `POST /api/v1/positions` with the same key → assert identical response, no second row.

### P0-3. Path bug: `/api/api/admin/api-keys` (double prefix)

```
POST  /api/api/admin/api-keys
GET   /api/api/admin/api-keys
DELETE /api/api/admin/api-keys/{key_id}
```

This is from a router included with `/api` prefix at the app level **and** an internal `/api/admin/...` prefix on the router itself. Customers writing `https://api.ordrtreasuryfx.com/api/api/admin/api-keys` is confusing and asymmetric with the rest of `v1`.

**Fix:** in the router that produces `admin/api-keys`, change the prefix from `/api/admin/api-keys` to `/v1/admin/api-keys` (or wherever it should live in the v1 namespace). Single-line change in the router file.

Same pattern applies to `/api/api/system/whoami/api-key` and any other `/api/api/...` paths surfaced.

### P0-4. Error response shape is not RFC 7807 problem+json

- **Guide promises:** RFC 7807 (`application/problem+json`) with `type`, `title`, `status`, `detail`, `instance`, plus an `errors[]` array on validation failures.
- **Reality:** the global exception handlers in `backend/app/main.py:2004-2028` return:
  ```json
  { "error": "VALIDATION_ERROR", "detail": [...], "status": 422 }
  ```
  Content-type defaults to `application/json`, not `application/problem+json`. No `type` URL, no `instance` path, no field-level `errors` array.
- **Customer impact:** any integration that parses errors per the guide (looking for `errors[].field`, `errors[].code`) fails on every error response.
- **Fix:** rewrite the three exception handlers to return `application/problem+json` with the documented shape. ~30 lines of code; one migration test pattern.

---

## P1 — Documentation drift

### P1-1. Cursor-based pagination is documented but not implemented

- **Guide promises:** `?cursor=...&limit=100`; response wraps in `{ data: [...], pagination: { next_cursor, has_more } }`.
- **Reality:** `next_cursor` and `has_more` appear **zero times** in the spec. Pagination is `?limit=&offset=` on the routes that paginate at all (25 references to `limit`, 6 to `offset`).
- **Fix path:** option A — build a uniform cursor-pagination dependency and apply to list endpoints (large lift); option B — rewrite the guide to document `limit/offset` as it actually works (small lift). **Recommend B for v1.**

### P1-2. 188 of 452 operations (~42%) have no `description`

Every operation has a `summary` (good), but ~42% have no `description`. For a customer-facing API this is the difference between a usable spec and a guess-and-check spec. The OpenAPI viewer (Swagger UI / ReDoc) shows `description` as the body of each operation card.

**Fix:** add a one-paragraph description to each route handler's docstring; FastAPI lifts it into the OpenAPI spec automatically.

Top tags by missing-description count (from a sample): `cash-pools`, `cash-netting`, `audit-lab`, `connectors`, `hedge-effectiveness`. These are the high-traffic surfaces — prioritize.

### P1-3. Webhook endpoint promises are partially missing

- **Guide promises:** "Settings → Webhooks → New endpoint" + 8 named events (`hedge.proposed`, `hedge.approved`, `hedge.committed_to_ledger`, `hedge.de_designated`, `policy.revised`, `audit_pack.generated`, `chain.integrity_check_failed`, `user.access_changed`).
- **Reality:** `POST/GET/DELETE /api/v1/webhooks` exist. There is no GET-single endpoint. The OpenAPI spec does not enumerate the supported event names anywhere.
- **Fix:** add an `event_types` enum to the `WebhookRegisterRequest` Pydantic schema; emit it in the OpenAPI spec. Add a `GET /api/v1/webhooks/{webhook_id}` for inspect.

### P1-4. Sandbox URL pattern is fictional

- **Guide promises:** `https://[customer]-sandbox.ordrtreasuryfx.com/api/v1/`
- **Reality:** there is no per-customer sandbox subdomain in production. Sandbox is a tenant-mode flag, not a separate hostname.
- **Fix:** rewrite the guide's sandbox section to describe the actual mechanism (sandbox tenant on the same hostname, distinguished by API key scope).

---

## P2 — OpenAPI hygiene

### P2-1. 81 tags is too many

Many tags are near-duplicates (`cash-accounts`, `cash-audit`, `cash-connections`, `cash-entities`, `cash-forecast`, `cash-netting`, `cash-pools`, `cash-positions`, `cash-reconciliation`, `cash-statements`). For customer-facing docs, consolidate under ~15 top-level tags and use sub-namespaces in the operation summary.

Suggested top-level tag taxonomy:
- `auth` · `users` · `roles` · `tenants`
- `positions` · `proposals` · `executions`
- `cash` · `debt` · `counterparties` · `bank-accounts`
- `hedge-effectiveness` · `audit-lab` · `regulatory`
- `connectors` · `webhooks` · `exports`
- `admin` · `system`

### P2-2. No `securitySchemes` declared

Run a grep — `components.securitySchemes` appears to be missing. Customers generating typed clients (openapi-generator, openapi-typescript) need a declared `bearerAuth` scheme so SDKs auto-include the `Authorization: Bearer ...` header.

**Fix:** in `custom_openapi()` (`backend/app/main.py:2169`), add:

```python
schema["components"]["securitySchemes"] = {
    "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT or HK_live_*",
    },
}
schema["security"] = [{"bearerAuth": []}]
```

### P2-3. No `servers` differentiation

Currently `servers = [{"url": "/api"}]`. Customers using a generated client need absolute URLs. Add:

```python
schema["servers"] = [
    {"url": "https://api.ordrtreasuryfx.com/api", "description": "Production"},
    {"url": "https://preview-api.ordrtreasuryfx.com/api", "description": "Preview"},
    {"url": "http://localhost:8000/api", "description": "Local development"},
]
```

### P2-4. `info.contact` and `info.license` not set

Add to the `get_openapi(...)` call so the spec carries:
```python
contact={"name": "ORDR Integrations", "email": "hello@ordrtreasuryfx.com"},
license_info={"name": "Proprietary"},
termsOfService="https://ordrtreasuryfx.com/legal/terms",
```

---

## P3 — Nice to have

- **Per-tag `externalDocs`** linking tag → integration guide section
- **Response examples** on the high-traffic endpoints (`POST /v1/proposals`, `PATCH /v1/proposals/{id}/approve`, `POST /v1/positions`) — generated client SDKs surface these in IntelliSense
- **Deprecation markers** (`deprecated: true`) on `/api/hedge/run` and any other non-`v1` legacy routes

---

## Recommended fix sequence

| Order | Item | Effort | Risk if skipped |
|---|---|---|---|
| 1 | P0-3 fix `/api/api/...` double prefix | 1 line | Customer hits a 404 on the obvious guess `/api/admin/api-keys` |
| 2 | P0-4 RFC 7807 problem+json shape | 30 lines | Every error parser in customer integrations breaks |
| 3 | P0-1 rewrite integration guide endpoints to match reality | 1 doc edit | Pattern 1 of 5 in the guide is unusable; Pattern 2-4 also unusable |
| 4 | P0-2 build IdempotencyMiddleware | ~200 lines + tests | Treasury data corruption on retry |
| 5 | P2-2, P2-3, P2-4 OpenAPI metadata polish | ~30 lines | Generated client SDKs are awkward to use |
| 6 | P1-1 align cursor/offset pagination story (rewrite docs to match reality) | 1 doc edit | Customer pagination loops break |
| 7 | P1-3 enumerate webhook event types in OpenAPI | ~50 lines | Customers don't know which events exist without reading source |
| 8 | P1-2 fill description gaps on top-3 tags | ~3-4 hrs | Spec quality compromised |
| 9 | P2-1 consolidate 81 tags to ~15 | ~2 hrs | Doc UX, not blocking |

**Bundle 1-3 + 6 into one PR (`docs+contract: align integration guide with v1 surface`). Bundle 4 + 5 + 7 into a second PR (`feat(api): idempotency, security schemes, webhook enum`). Bundle 8-9 into a third (`docs(openapi): tag consolidation + descriptions`).**

---

## Evidence files

- Live spec snapshot: [`docs/api/openapi.json`](openapi.json) (generated from `app.main:app.openapi()` at 2026-04-25T19:00 UTC)
- Source: [`backend/app/main.py:1940-2202`](../../backend/app/main.py)
- Promised contract: [`docs/api/integration-guide.md`](integration-guide.md)
- Audit script reproducer: see commit message of this audit's PR
