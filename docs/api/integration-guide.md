# Integration Guide

**Audience:** Customer's IT / engineering / integration team building automation against ORDR TreasuryFX
**Companion:** OpenAPI spec at `https://api.ordrtreasuryfx.com/api/openapi.json` (live, auto-generated)
**Authentication:** API keys (`HK_live_*` prefix); JWT for interactive sessions; never raw passwords
**Last reviewed:** 2026-04-25

This guide covers the integration patterns that account for ~95% of customer use. Endpoints, request shapes, and response shapes in this document are verified against the live v1 surface as of the date above. For exotic flows, contact **hello@ordrtreasuryfx.com**.

---

## API at a glance

| Item | Value |
|---|---|
| Base URL (production) | `https://api.ordrtreasuryfx.com/api/v1/` |
| Base URL (preview)    | `https://preview-api.ordrtreasuryfx.com/api/v1/` |
| Sandbox               | Same hostname; sandbox is a tenant-mode flag, not a separate subdomain. Ask your account contact to provision a sandbox tenant. |
| Auth                  | `Authorization: Bearer HK_live_...` (API key) or `Authorization: Bearer eyJ...` (JWT) |
| Content type          | `application/json` (UTF-8) |
| Rate limit            | 60 req/min per user/IP, token-bucket |
| Versioning            | URL path (`v1`); we will not break v1 without a 12-month deprecation notice |
| Pagination            | `?limit=&offset=` on list endpoints that paginate. Cursor pagination is on the v1.5 roadmap. |
| Idempotency           | `Idempotency-Key` middleware is on the roadmap. Until shipped, see **Idempotency** below for client-side guidance. |
| Errors                | RFC 7807 `application/problem+json`: `{ type, title, status, detail, instance, error }`. Validation errors include an `errors[]` array with `field`, `code`, `message`, `value`. |

---

## Authentication

### Issuing a key

A key is created **only by the customer** through the platform UI:

1. Sign in with an Admin account
2. Settings → API Keys → Create new key
3. Choose: name, permission scope, expiry (default 90 days, max 1 year)
4. The plaintext value is shown **once** — copy it immediately

Keys are bcrypt-hashed at rest. ORDR ops cannot recover the plaintext value. Lost keys must be re-issued.

### Using a key

```http
GET /api/v1/positions HTTP/1.1
Host: api.ordrtreasuryfx.com
Authorization: Bearer HK_live_a7c3...
Accept: application/json
```

### Rotating

Best practice:
1. Issue a new key
2. Deploy your integration with the new key
3. Confirm the new key works
4. Revoke the old key from the same UI page

We recommend automating this on a 90-day cadence.

### Revoking

Settings → API Keys → Revoke. Revocation is immediate; new requests with the revoked key return 401.

---

## Common integration patterns

### Pattern 1: Push exposure data from your ERP

This is the most common integration: your ERP system sends a daily / hourly batch of FX positions to ORDR, and ORDR maintains the source-of-truth view. Use the JSON batch endpoint — no CSV upload required.

```http
POST /api/v1/positions/import/batch-json HTTP/1.1
Authorization: Bearer HK_live_...
Content-Type: application/json

{
  "dry_run": false,
  "positions": [
    {
      "record_id": "PO-12345",
      "entity": "MeridianGmbH-DE-04",
      "flow_type": "AR",
      "currency": "EUR",
      "amount": 12500000.00,
      "value_date": "2026-08-14",
      "status": "CONFIRMED",
      "description": "PO-12345 — quarterly invoice"
    }
  ]
}
```

Response:

```json
{
  "id": "f74e1f5b-9f2c-4ad8-9c2c-5b9d8a3f4e1c",
  "filename": "json_api",
  "file_hash": "sha256:...",
  "file_size_bytes": 312,
  "row_count": 1,
  "valid_count": 1,
  "error_count": 0,
  "duplicate_count": 0,
  "created_count": 1,
  "status": "COMMITTED",
  "validation_errors": null,
  "created_position_ids": ["a3c2..."]
}
```

Field notes:
- `record_id` — your stable identifier; ORDR reconciles on this if you re-send the same row
- `flow_type` — `AR` (receivable) or `AP` (payable)
- `currency` — ISO 4217 alpha-3 (e.g., `EUR`, `USD`); 3 characters
- `value_date` — `YYYY-MM-DD`
- `status` — `CONFIRMED` (default) or `FORECAST`
- Max batch size: **5000 positions per request**
- Set `dry_run: true` to validate without committing — the batch is persisted as `VALIDATED` with error details, but no positions are created
- Required permission on the API key: `trades.create`

### Pattern 2: Pull pending hedge proposals for review

Once your treasurer creates a proposal, your downstream system (e.g., a treasury workstation or a trading floor app) might want to read it before approving the actual trade.

```http
GET /api/v1/proposals/pending HTTP/1.1
Authorization: Bearer HK_live_...
```

Response (truncated to the meaningful fields):

```json
[
  {
    "id": "5b7c2e94-...",
    "position_id": "a3c2...",
    "status": "PROPOSED",
    "proposed_by": "treasurer-eu@meridian.example",
    "proposed_at": "2026-04-25T09:32:14Z",
    "envelope_hash": "a7c3...",
    "proposal_payload": {
      "hedge_amount": 12500000.00,
      "hedge_ratio": 1.0000,
      "instrument": "forward",
      "tenor_days": 181,
      "all_in_rate": 1.0866
    }
  }
]
```

Notes:
- Returns a **list**, not a `{ data, pagination }` envelope. The endpoint is scoped to the caller's company/branch.
- Required permission: `trades.execute`
- For pagination over the broader proposal history, use `GET /api/v1/proposals?limit=&offset=`.

### Pattern 3: Approve a proposal programmatically (use sparingly)

Programmatic approvals are supported but **discouraged**. The maker/checker control loses meaning if both halves are automated. We provide it for narrow integration use cases (e.g., a downstream system mirroring an approval that already happened in another system of record).

```http
PATCH /api/v1/proposals/5b7c2e94-.../approve HTTP/1.1
Authorization: Bearer HK_live_...
Content-Type: application/json

{
  "approval_notes": "Approved per Treasury Committee delegation #2026-Q1-12"
}
```

Notes:
- This is a `PATCH`, not a `POST`.
- The API key must hold `trades.execute` AND must be associated with a user **other than** the proposal's creator (Separation of Duties enforced server-side; violations return 409).
- The execution-IP allowlist applies — see the security section in your tenant settings.
- For two-stage approval (`team` governance mode with second-approve enabled), see `PATCH /api/v1/proposals/{proposal_id}/second-approve`.

### Pattern 4: Pull the auditor evidence pack for a calculation run

The audit-pack is currently surfaced as a per-run ZIP export, generated from the Audit Lab. End-to-end flow:

1. **Discover the run you want** — the Audit Lab list endpoint:
   ```http
   GET /api/v1/audit-lab/runs?limit=50 HTTP/1.1
   Authorization: Bearer HK_live_...
   ```
2. **Download the pack** — single request, returns `application/zip`:
   ```http
   GET /api/v1/export/zip/{run_id} HTTP/1.1
   Authorization: Bearer HK_live_...
   Accept: application/zip
   ```

Pack contents include the policy revision, calculation run record, positions, run envelope hash, and supporting evidence in a structure designed for external auditor handoff. See [auditor evidence walkthrough](../internal/sales/auditor-evidence-walkthrough.md) for the full inventory.

A period-aggregated audit-pack endpoint (e.g., `POST /api/v1/audit-packs` accepting a date range and emitting a single multi-run archive) is planned for v1.5. Track via the changelog.

### Pattern 5: Webhook subscriptions

ORDR can post events to a customer-configured webhook URL. Useful for downstream systems that want to react to ORDR events in real time.

Register endpoints via the Webhooks API (mirrors what the platform UI exposes under Settings → Webhooks):

```http
POST /api/v1/webhooks HTTP/1.1
Authorization: Bearer HK_live_...
Content-Type: application/json

{
  "url": "https://erp.meridian.example/ordr-webhook",
  "event_types": ["hedge.proposed", "hedge.approved"],
  "description": "ERP system of record sync"
}
```

List registered webhooks: `GET /api/v1/webhooks`. Delete one: `DELETE /api/v1/webhooks/{webhook_id}`.

**Currently emitted events** (verified):
- `hedge.proposed`
- `hedge.approved`
- `hedge.committed_to_ledger`

**Planned events** (subscribe today, will fire when emission ships):
- `hedge.de_designated`
- `policy.revised`
- `audit_pack.generated`
- `chain.integrity_check_failed` *(critical)*
- `user.access_changed`

Each delivery is signed with HMAC-SHA256 using the per-endpoint secret returned at registration time. Verification:

```python
import hmac, hashlib

def verify(body: bytes, signature_header: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

Retries: deliveries are retried with exponential backoff up to 24 hours. Persistent failure → endpoint disabled and operator notified.

---

## Idempotency

**Current state:** server-side `Idempotency-Key` enforcement is not yet shipped. Sending the header today is a no-op. The middleware is on the v1.5 roadmap and will store responses keyed by `(api_key_id, idempotency_key)` for 24 hours.

**Until shipped — client-side guidance:**
- For batch uploads: use `record_id` as the dedupe key. ORDR reconciles on this; re-sending the same `record_id` in `positions/import/batch-json` will not double-count.
- For approvals: idempotent by domain — once a proposal is `APPROVED`, a second `PATCH /approve` returns `409 Conflict`. Treat 409 on retry as success.
- For ad-hoc mutations: design retries to inspect server state first (e.g., `GET` the resource before re-`POST`ing).
- Defer non-idempotent calls (e.g., `POST /api/v1/proposals`) until a definitive response is received; do not blind-retry on timeout.

When the middleware ships, we will accept the header on every mutation; existing integrations that already send it will start receiving idempotent guarantees automatically.

---

## Pagination

List endpoints that paginate accept:

```http
GET /api/v1/positions?limit=100&offset=0 HTTP/1.1
GET /api/v1/positions?limit=100&offset=100 HTTP/1.1
```

Defaults vary by endpoint (typical `limit=50`, max `1000`). Check the OpenAPI spec for the parameters declared on a given operation.

A small number of high-traffic endpoints return an unpaginated list — see the per-pattern notes above (e.g., `GET /v1/proposals/pending`). These are bounded by company/branch scope and are never expected to exceed a few hundred items.

Cursor-based pagination is on the v1.5 roadmap. Migration will be additive — existing `limit/offset` clients will continue to work.

---

## Error responses

All errors are RFC 7807 `application/problem+json`:

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json

{
  "type": "https://docs.ordrtreasuryfx.com/errors/validation-error",
  "title": "Validation failed",
  "status": 422,
  "detail": "string should have at most 3 characters",
  "instance": "/api/v1/positions/import/batch-json",
  "error": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "body.positions.3.currency",
      "code": "string_too_long",
      "message": "String should have at most 3 characters",
      "value": "EURO"
    }
  ]
}
```

```http
HTTP/1.1 404 Not Found
Content-Type: application/problem+json

{
  "type": "https://docs.ordrtreasuryfx.com/errors/http-error",
  "title": "Not Found",
  "status": 404,
  "detail": "Proposal not found",
  "instance": "/api/v1/proposals/abc-123",
  "error": "HTTP_ERROR"
}
```

| `error` code      | Emitted by                                        |
|-------------------|---------------------------------------------------|
| `HTTP_ERROR`      | Any explicit `HTTPException` (404, 409, 403, ...) |
| `VALIDATION_ERROR`| Pydantic body / query / path validation failures  |
| `INTERNAL_ERROR`  | Unhandled server exceptions (500)                 |

Notes:
- `detail` is **usually a string**, but a small number of routes raise structured detail objects (e.g., the policy-activation conflict at 409 returns `detail: { "code": "DB_ACTIVE_SCOPE_CONFLICT", "scope": {...} }`). Treat `detail` defensively: if it is a string, display it; if it is an object, look for a stable `code` field.
- The `error` extension field is the stable code your client should branch on. The `type` URI is informational.
- Validation errors surface field-level diagnostics in `errors[]`; each entry has `field` (dot-path), `code` (Pydantic error code), `message`, and `value`.

| Status | Meaning | Retry? |
|---|---|---|
| 200 / 201 | Success | n/a |
| 204 | Success, no body (deletes) | n/a |
| 400 | Bad request (malformed JSON, etc.) | No |
| 401 | Unauthenticated (key invalid/expired/revoked) | No |
| 403 | Authenticated but not authorized (RBAC) | No |
| 404 | Not found | No |
| 409 | Conflict (e.g., SoD violation, state transition forbidden, duplicate approval) | No |
| 422 | Validation failed | No, fix and re-send |
| 429 | Rate limited | Yes, with Retry-After |
| 500 | Server error | Yes, with backoff |
| 502 / 503 / 504 | Upstream unavailable | Yes, with backoff |

---

## Rate limiting

60 requests per minute per user/IP. Token-bucket implementation: small bursts are allowed before throttling.

When throttled:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 12
Content-Type: application/problem+json

{
  "type": "https://docs.ordrtreasuryfx.com/errors/http-error",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "rate limit exceeded",
  "instance": "/api/v1/positions",
  "error": "HTTP_ERROR"
}
```

Recommended client behavior: respect `Retry-After`. Clients that ignore it may be throttled more aggressively.

For high-volume integrations, request a higher rate-limit tier from your account contact. Limits up to 600 req/min are available for documented use cases.

---

## Sandbox

A sandbox tenant mirrors production exactly except:

- Market data is delayed 15 minutes (not real-time)
- Generated bank messages (MT103, pain.001) are clearly stamped as sandbox
- Sandbox tenants can be reset to a known state on demand
- No real customer data; populated with synthetic data on tenant creation

**How to access:** sandbox is provisioned on the same hostname as production (`api.ordrtreasuryfx.com`) — your sandbox API key is scoped to a sandbox tenant. Ask your account contact to provision one. There is no separate `*-sandbox.ordrtreasuryfx.com` subdomain.

Use sandbox to develop and test integrations. Same API surface, same auth, same response shapes.

---

## Security expectations

- **Never** embed an API key in client-side code (browser apps, mobile apps)
- **Never** commit an API key to source control
- **Always** use a secrets manager (Vault, 1Password, AWS Secrets Manager, etc.) on your side
- **Rotate** keys quarterly minimum
- **Scope** keys narrowly — read-only is preferable to read-write where it works
- **Monitor** for unexpected usage patterns; we'll alert on suspicious bursts but you should too
- **Revoke** immediately if a key is suspected to have leaked

---

## Versioning and deprecation

- All current endpoints are `v1`
- We commit to **no breaking changes** to `v1` without 12 months' notice
- Additive changes (new fields, new endpoints, new optional parameters) are non-breaking and may ship at any time
- Deprecation announcements: email + status page + this guide updated
- We will publish migration guides for any future major version

What counts as a breaking change:
- Removing a field from a response
- Adding a required field to a request
- Changing the type of an existing field
- Changing the URL of an existing endpoint
- Changing the authentication mechanism
- Tightening validation in a way that rejects previously-accepted requests

---

## Reference clients

### Python

```python
import os
import requests

BASE = "https://api.ordrtreasuryfx.com/api/v1"
KEY = os.environ["ORDR_API_KEY"]

session = requests.Session()
session.headers.update({
    "Authorization": f"Bearer {KEY}",
    "Accept": "application/json",
})

resp = session.get(f"{BASE}/proposals/pending")
resp.raise_for_status()
for proposal in resp.json():
    payload = proposal["proposal_payload"]
    print(proposal["id"], payload.get("instrument"), payload.get("all_in_rate"))
```

### TypeScript / Node

```typescript
const BASE = "https://api.ordrtreasuryfx.com/api/v1";
const KEY = process.env.ORDR_API_KEY!;

async function listPending() {
  const r = await fetch(`${BASE}/proposals/pending`, {
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<Array<{
    id: string;
    position_id: string;
    status: string;
    proposal_payload: Record<string, unknown>;
  }>>;
}
```

### curl

```bash
curl -sS \
  -H "Authorization: Bearer $ORDR_API_KEY" \
  -H "Accept: application/json" \
  "https://api.ordrtreasuryfx.com/api/v1/proposals/pending" \
  | jq .
```

---

## Support

- **OpenAPI spec**: `https://api.ordrtreasuryfx.com/api/openapi.json`
- **Status page**: `https://status.ordrtreasuryfx.com`
- **Integration questions**: `hello@ordrtreasuryfx.com`
- **Security questions / disclosure**: `security@ordrtreasuryfx.com`

For an active integration project, we recommend a Slack Connect channel between your engineering team and ours; ask your account contact to set this up.
