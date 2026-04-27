# Sub-project A: Live ERP End-to-End

**Date**: 2026-04-26  
**Status**: Approved  
**Scope**: QuickBooks Online (sandbox) + Xero — OAuth2 token wire-up, GL posting activation, post-result UI, test-post validation

---

## Context

The ERP connector infrastructure (OAuth2 flows, token vault, posting adapters, circuit breaker, rate limiter) is fully built. The OAuth flow correctly stores encrypted tokens in `company.settings.connector_tokens.{provider}`. However the GL posting route reads credentials from `company.settings.erp_credentials` — a key that is never written. This disconnect means all posting silently falls through to paper mode regardless of connection state. Additionally the OAuth callback redirects to `/settings/connectors` which does not exist, and the GL Postings UI gives no feedback on posting results.

---

## Architecture

### Data Flow (post-fix)

```
Admin: OAuth popup → POST /v1/connectors/{provider}/authorize
  → QBO/Xero → GET /v1/connectors/oauth/callback
  → connector.exchange_code() → token_vault.store_tokens()
  → company.settings.connector_tokens.{provider} = { ciphertext, realm_id, expires_at }
  → company.settings.erp_system = "{provider}"          ← NEW
  → redirect to /accounting-connection?provider=...&status=connected  ← FIXED

Treasurer: GL Postings page → "Post to QuickBooks" button
  → POST /v1/gl/journal-entries/{entry_id}/post
  → detect erp_system from company.settings                ← FIXED
  → token_vault.load_tokens(provider)                      ← FIXED
  → connector.refresh() if token expires within 60s        ← NEW
  → QuickBooksPoster(access_token=live_token, realm_id=...) → QBO API
  → je.status = POSTED, je.posted_ref = "QB-1234"
  → UI: green badge "Posted — QB-1234" (clickable link)    ← NEW

Admin: "Test Connection" button (accounting-connection page)
  → POST /v1/connectors/{provider}/test-post
  → synthetic balanced JournalPayload (100 USD, test accounts)
  → adapter.post() with live token
  → toast: "✓ Test entry posted — ref QB-9001"             ← NEW
```

---

## Components

### Backend changes

**`backend/app/connectors/quickbooks/connector.py`**  
In `exchange_code()`: after `store_tokens()` and `update_state()`, also write `company.settings.erp_system = "quickbooks"` via a `_save_company_settings()` call on the same session.

**`backend/app/connectors/xero/connector.py`**  
Same: write `erp_system = "xero"` after `store_tokens()`.

**`backend/app/api/routes/v1_gl.py` — `post_journal_entry`**  
Replace the legacy `erp_credentials` lookup with:
1. Read `erp_system` from `company.settings` (set by connector after OAuth).
2. If `erp_system` is `"quickbooks"` or `"xero"`: call `token_vault.load_tokens(session, tenant_id, provider)`.
3. If token `expires_at` is within 60 seconds: call `connector.refresh(tenant_id)` to get a fresh bundle.
4. Build `connector_settings = { "access_token": bundle.access_token, "realm_id": bundle.realm_id, "sandbox": QBO_ENVIRONMENT == "sandbox" }` (QB) or `{ "access_token": ..., "tenant_id": bundle.realm_id }` (Xero).
5. Pass to `post_journal_entry()` as before.
6. On `ConnectorNotConfiguredError`: return 409 "No ERP connected — complete OAuth setup in Accounting Settings."

**`backend/app/api/routes/v1_connectors.py` — new endpoint**  
`POST /v1/connectors/{provider}/test-post`  
- Requires auth (any connected user); no plan tier gate.
- Builds synthetic `JournalPayload`: two balanced lines (debit 100 USD / credit 100 USD). Account codes: first two `GLAccountMapping` entries for the tenant, falling back to `"9999"` if none configured.
- Calls the posting adapter directly (bypasses `JournalEntry` table — no WORM record).
- Returns `TestPostResult { success: bool, erp_ref: str | None, provider: str, sandbox: bool, error: str | None }`.

**OAuth callback redirect fix**  
`backend/app/api/routes/v1_connectors.py` — `oauth_callback`:  
Change success redirect from `/settings/connectors?provider={p}&status=connected` to `/accounting-connection?provider={p}&status=connected`.  
Change error redirect to `/accounting-connection?provider={p}&status=error&detail={...}`.

### Frontend changes

**`frontend/src/app/accounting-oauth-callback/page.tsx`**  
Already correctly handles the popup close + localStorage flag. No changes needed here — the issue was the backend redirect URL (now fixed above).

**`frontend/src/app/accounting-connection/page.tsx`**  
- Read `?status` and `?provider` query params on mount; show success/error toast when redirected back from OAuth.
- Connected state card: add "Test Connection" button that calls `POST /v1/connectors/{provider}/test-post`. Show loading spinner → success toast with `erp_ref` or error toast with message.

**`frontend/src/app/gl-postings/page.tsx`**  
- After POST to `/v1/gl/journal-entries/{id}/post`:
  - Success: update row in-place; show green `posted_ref` badge. If `posted_to === "QB"`, make it a link to `https://app.qbo.intuit.com/app/journal?txnId={posted_ref}` (sandbox: `https://sandbox.qbo.intuit.com/...`). Xero: `https://go.xero.com/Journals/Show?id={posted_ref}`.
  - Failure (502): show red "Post failed" badge + "Retry" button (re-calls same endpoint).
- "Post" button label: if connector status shows quickbooks connected → "Post to QuickBooks"; xero connected → "Post to Xero"; else "Export CSV". Fetched once on page load via `GET /v1/connectors/quickbooks/status` and `GET /v1/connectors/xero/status`.

---

## Error Handling

| Scenario | Backend response | Frontend |
|----------|-----------------|----------|
| No ERP connected | 409 "No ERP connected" | "Connect an ERP first" inline message |
| Token decryption fails | 500 (ConnectorAuthError caught) | "Reconnect required" toast + link to accounting-connection |
| QBO/Xero API returns non-2xx | 502 from posting adapter | "Post failed" badge + Retry |
| Token expired, refresh fails | 502 | "Session expired — reconnect" toast |
| Test post: no GL mappings | Use fallback account codes `"9999"` | Mention in result "used test account codes" |

---

## Testing

- **Unit**: `test_gl_posting_wire.py` — mock token vault + posting adapter, assert live token is extracted and passed; assert paper mode is NOT used when vault has a token.
- **Unit**: `test_connector_test_post.py` — mock adapter, assert balanced payload, assert no JournalEntry row created.
- **Unit**: `test_oauth_callback_redirect.py` — assert success/error redirects point to `/accounting-connection`.
- **Manual smoke** (sandbox): complete QBO OAuth on `/accounting-connection` → click Test Connection → verify entry appears in QBO sandbox → generate hedge run → approve journal entry → post → verify `posted_ref` appears in UI.

---

## Environment Variables Required on Render

| Var | Notes |
|-----|-------|
| `CONNECTOR_ENCRYPTION_KEY` | Generate: `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'` |
| `QBO_CLIENT_ID` | From Intuit developer portal |
| `QBO_CLIENT_SECRET` | From Intuit developer portal |
| `QBO_REDIRECT_URI` | `https://hedgecore.onrender.com/api/v1/connectors/oauth/callback` |
| `QBO_ENVIRONMENT` | `sandbox` for test account |
| `XERO_CLIENT_ID` | From Xero developer portal (if activating Xero) |
| `XERO_CLIENT_SECRET` | From Xero developer portal |
| `XERO_REDIRECT_URI` | `https://hedgecore.onrender.com/api/v1/connectors/oauth/callback` |

---

## Out of Scope (v1 Freeze)

- NetSuite / Dynamics365 activation (adapters stubbed, not activated)
- Webhook-triggered sync (router exists, processing deferred)
- Multi-tenant Xero organization picker (takes first tenant)
- Dual posting (ERP + CSV fallback simultaneously)
- Invoice pull (`v1_erp.py`) — remains paper mode
