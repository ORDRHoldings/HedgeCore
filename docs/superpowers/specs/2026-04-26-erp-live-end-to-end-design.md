# Sub-project A: Live ERP End-to-End

**Date**: 2026-04-26  
**Status**: Approved  
**Scope**: QuickBooks Online (sandbox) + Xero — OAuth2 token wire-up, GL posting activation, post-result UI, test-post validation

---

## Context

The ERP connector infrastructure (OAuth2 flows, token vault, posting adapters, circuit breaker, rate limiter) is fully built. The OAuth flow correctly stores encrypted tokens in `company.settings.connector_tokens.{provider}` via `token_vault.store_tokens()`.

**Bug 1 — `erp_system` never written after OAuth.**  
`v1_gl.py:post_journal_entry` already reads `company.settings.get("erp_system", "CSV")` (line 233). The bug is that `exchange_code()` in each connector never writes this key after a successful OAuth. So `erp_system` always defaults to `"CSV"` and all journal entries fall through to CSV export regardless of connection state.

**Bug 2 — GL posting uses legacy credential path.**  
Even if `erp_system` were set, the route calls `_post_je(..., connector_settings=connector_settings.get("erp_credentials", {}))` (line 239). `erp_credentials` is also never written by the OAuth flow. The connector protocol has a `post_journal(tenant_id, payload)` method that handles token loading and refresh internally — the route bypasses it entirely.

**Bug 3 — OAuth callback redirects to a non-existent route.**  
Both the success and error paths in `oauth_callback` redirect to `/settings/connectors` which does not exist in the frontend.

---

## Architecture

### Data Flow (post-fix)

```
Admin: OAuth popup → POST /v1/connectors/{provider}/authorize
  → QBO/Xero → GET /v1/connectors/oauth/callback
  → connector.exchange_code()
    → token_vault.store_tokens()                              (existing)
    → token_vault.update_state()                              (existing)
    → company.settings["erp_system"] = provider_id           ← NEW (same session)
  → redirect to /accounting-connection?provider=...&status=connected  ← FIXED

Treasurer: GL Postings page → "Post to QuickBooks" button
  → POST /v1/gl/journal-entries/{entry_id}/post
  → read erp_system from company.settings ("quickbooks" or "xero")  (already exists)
  → connector = registry.get_connector(provider)              ← NEW
  → build JournalPayload from JournalEntry fields             ← NEW
  → connector.post_journal(tenant_id, payload)               ← NEW
      └── _ensure_valid_token() refreshes if ≤60s from expiry (built into connector)
      └── hits QBO/Xero API
  → je.status = POSTED, je.posted_ref = result.external_ref  ← NEW
  → UI: green badge "Posted — QB-1234" (link for QBO)        ← NEW

Admin: "Test Connection" button (accounting-connection page)
  → POST /v1/connectors/{provider}/test-post
  → synthetic JournalPayload (100 USD balanced, test account codes)
  → connector.post_journal(tenant_id, payload, dry_run=False)
  → toast: "✓ Test entry posted — ref QB-9001"               ← NEW
```

---

## Components

### Backend changes

#### 1. `backend/app/connectors/quickbooks/connector.py` — `exchange_code()`

Inside the existing `async with async_session_maker() as session:` block (lines 122–133), after `store_tokens()` and `update_state()` and **before** `session.commit()`, add:

```python
# Set active ERP system so GL posting route can auto-detect provider
company_settings = await _load_company_settings(session, tenant_id)
company_settings["erp_system"] = PROVIDER_ID  # "quickbooks"
await _save_company_settings(session, tenant_id, company_settings)
```

`_load_company_settings` and `_save_company_settings` are module-private helpers in `app.connectors.token_vault` (underscore-prefixed but importable). Must happen in the **same session** as `store_tokens()` to avoid a read-modify-write race on the `company.settings` JSONB column. This results in a second SELECT on `company.settings` within the same session (the first was inside `store_tokens()`); this is acceptable — the session cache means it is a no-op round-trip at the DB level, and the flush from `store_tokens()` makes the prior write visible.

#### 2. `backend/app/connectors/xero/connector.py` — `exchange_code()`

Same change. `PROVIDER_ID = "xero"`.

#### 3. `backend/app/api/routes/v1_gl.py` — `post_journal_entry()`

Replace lines 231–242 (the legacy `erp_credentials` credential path) with:

```python
company = current_user.company
erp_system = (company.settings or {}).get("erp_system", "CSV")

if erp_system.lower() in ("quickbooks", "xero"):
    from app.connectors import registry                     # deferred import
    from app.connectors.base import JournalLine, JournalPayload
    from app.connectors.errors import ConnectorError, ConnectorNotConfiguredError

    provider = erp_system.lower()
    connector = registry.get_connector(provider)
    payload = JournalPayload(
        journal_entry_id=je.id,                            # required field
        reference=f"ORDR-{str(je.id)[:21]}",              # QBO max 21 chars
        memo=f"ORDR {je.entry_type} {je.id}",
        posting_date=datetime.combine(je.period_date, datetime.min.time(), tzinfo=UTC),  # date → datetime
        lines=(
            JournalLine(
                account_external_id=je.debit_account,
                debit=je.amount,
                credit=Decimal("0"),
                description=je.description or "",
                currency=je.currency,                      # required field
            ),
            JournalLine(
                account_external_id=je.credit_account,
                debit=Decimal("0"),
                credit=je.amount,
                description=je.description or "",
                currency=je.currency,                      # required field
            ),
        ),
    )
    try:
        result = await connector.post_journal(
            tenant_id=current_user.company.id, payload=payload
        )
    except ConnectorNotConfiguredError as exc:
        raise HTTPException(
            status_code=409,
            detail="No ERP connected — complete OAuth setup in Accounting Settings.",
        ) from exc
    except ConnectorError as exc:
        raise HTTPException(status_code=502, detail=f"ERP posting failed: {exc.message}") from exc

    from datetime import UTC, datetime
    je.status = JournalEntryStatus.POSTED.value
    je.posted_to = provider[:4].upper()   # "QUIC" or "XERO"
    je.posted_ref = result.external_ref or ""
    je.posted_at = datetime.now(UTC)
    posting_result = PostingResult(success=True, erp_ref=result.external_ref)
else:
    # Fallback: CSV export via existing gl_posting_service path
    try:
        posting_result = await _post_je(
            session, je, current_user, erp_system="CSV", connector_settings={}
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not posting_result.success:
        raise HTTPException(status_code=502, detail="Export failed")
```

Add `from decimal import Decimal` to the import block at the top of `v1_gl.py`.

#### 4. `backend/app/api/routes/v1_connectors.py` — new test-post endpoint

```python
@router.post("/{provider}/test-post")
async def test_post_connector(
    provider: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Post a synthetic balanced entry to verify end-to-end connector health."""
    await _check_permission(session, current_user, "trades.create")
    tenant = _tenant_id(current_user)

    from app.connectors.base import JournalLine, JournalPayload
    from app.connectors.errors import ConnectorError

    # Use first two GL mappings as account codes, fall back to "9999"
    from sqlalchemy import select as sa_select
    from app.models.journal_entry import GLAccountMapping
    mappings_result = await session.execute(
        sa_select(GLAccountMapping)
        .where(GLAccountMapping.company_id == current_user.company.id)
        .limit(2)
    )
    mappings = mappings_result.scalars().all()
    dr_code = mappings[0].debit_account if len(mappings) >= 1 else "9999"
    cr_code = mappings[0].credit_account if len(mappings) >= 1 else "9999"

    import uuid as _uuid
    payload = JournalPayload(
        journal_entry_id=_uuid.uuid4(),                    # synthetic; not a real JournalEntry row
        reference="ORDR-TEST",
        memo="ORDR connectivity test — safe to delete",
        posting_date=datetime.now(UTC),
        lines=(
            JournalLine(account_external_id=dr_code, debit=Decimal("100"), credit=Decimal("0"), description="Test debit", currency="USD"),
            JournalLine(account_external_id=cr_code, debit=Decimal("0"), credit=Decimal("100"), description="Test credit", currency="USD"),
        ),
    )
    try:
        connector = registry.get_connector(provider)
        result = await connector.post_journal(tenant_id=tenant, payload=payload)
    except ConnectorError as exc:
        return {"success": False, "provider": provider, "error": exc.message, "erp_ref": None}

    return {
        "success": True,
        "provider": provider,
        "erp_ref": result.external_ref,
        "sandbox": getattr(settings, "QBO_ENVIRONMENT", "sandbox") == "sandbox",
        "error": None,
    }
```

#### 5. `backend/app/api/routes/v1_connectors.py` — OAuth callback redirect fix

Change both redirect URLs in `oauth_callback()`:

```python
# success (line ~454)
return RedirectResponse(
    url=f"/accounting-connection?provider={provider}&status=connected",
    status_code=302,
)

# error (line ~445)
return RedirectResponse(
    url=f"/accounting-connection?provider={provider}&status=error&detail={exc.message[:120]}",
    status_code=302,
)
```

### Frontend changes

#### 6. `frontend/src/app/accounting-connection/page.tsx`

On mount, read `?status` and `?provider` query params (via `useSearchParams`). If `status=connected`, show a green success toast and display a "Test Connection" button in the connected card. If `status=error`, show a red error toast.

"Test Connection" button calls `POST /api/v1/connectors/{provider}/test-post`. Shows spinner while pending → success toast "✓ Test entry posted to {provider} — ref {erp_ref}" or error toast "✗ {error}".

#### 7. `frontend/src/app/gl-postings/page.tsx`

On page load, call `GET /api/v1/connectors/quickbooks/status` and `GET /api/v1/connectors/xero/status` in parallel. Determine active provider from whichever returns `connected: true`.

- "Post" button label: "Post to QuickBooks" / "Post to Xero" / "Export CSV" based on active provider.
- After posting:
  - **Success**: Update row in-place; show green badge with `posted_ref`. For QuickBooks: make it a link to `https://qbo.intuit.com/app/journal?txnId={posted_ref}` (sandbox: `https://sandbox.qbo.intuit.com/app/journal?txnId={posted_ref}`). For Xero: show `posted_ref` as plain text (org shortcode not available for deep-link).
  - **Failure** (502): Show red "Post failed" badge + "Retry" button that re-calls the same endpoint.

---

## Error Handling

| Scenario | Backend response | Frontend |
|----------|-----------------|----------|
| No ERP connected (`erp_system` = "CSV") | falls through to CSV export | "Export CSV" is the action |
| Token decryption fails (key rotated) | `ConnectorAuthError` → 502 | "Reconnect required" toast + link to /accounting-connection |
| QBO/Xero API non-2xx | `ConnectorServerError` → 502 | "Post failed" badge + Retry |
| Token expired, refresh fails | `ConnectorAuthError` → 502 | "Session expired — reconnect" toast |
| Test post: no GL mappings | Uses fallback `"9999"` account codes | Result includes note about test accounts |
| Provider not recognized | `ConnectorNotConfiguredError` → 409 | "No ERP connected" inline message |

---

## Testing

**`backend/tests/test_gl_post_wire.py`** (new, ~8 tests)  
- Mock `registry.get_connector()` + `connector.post_journal()`. Assert `connector.post_journal` is called (not `_post_je`) when `erp_system` is "quickbooks" or "xero".  
- Assert `je.status == "POSTED"` and `je.posted_ref` is set on success.  
- Assert 409 raised when `ConnectorNotConfiguredError` is thrown.  
- Assert 502 raised when `ConnectorError` is thrown.  
- Assert CSV fallback is used when `erp_system == "CSV"`.

**`backend/tests/test_connector_test_post.py`** (new, ~5 tests)  
- Mock connector; assert `JournalPayload` is balanced (debit == credit).  
- Assert no `JournalEntry` row is created in DB.  
- Assert `trades.create` permission is checked (403 without it).  
- Assert fallback account codes `"9999"` are used when no GL mappings exist.

**`backend/tests/test_oauth_redirect.py`** (new, ~3 tests)  
- Assert success redirect goes to `/accounting-connection?provider=...&status=connected`.  
- Assert error redirect goes to `/accounting-connection?provider=...&status=error`.

**Manual smoke test** (sandbox):
1. Set `CONNECTOR_ENCRYPTION_KEY`, `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI=.../oauth/callback`, `QBO_ENVIRONMENT=sandbox` on Render.
2. Navigate to `/accounting-connection` → connect QuickBooks → verify redirect back lands with "connected" badge.
3. Click "Test Connection" → verify ref appears + entry visible in QBO sandbox.
4. Create hedge run → generate journal entry → approve → click "Post to QuickBooks" → verify `posted_ref` shown in GL Postings UI.

---

## Environment Variables Required on Render

| Var | Value |
|-----|-------|
| `CONNECTOR_ENCRYPTION_KEY` | `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'` |
| `QBO_CLIENT_ID` | From Intuit developer portal |
| `QBO_CLIENT_SECRET` | From Intuit developer portal |
| `QBO_REDIRECT_URI` | `https://hedgecore.onrender.com/api/v1/connectors/oauth/callback` |
| `QBO_ENVIRONMENT` | `sandbox` |

---

## Out of Scope (v1 Freeze)

- NetSuite / Dynamics365 activation
- Webhook-triggered sync
- Xero deep-link (org shortcode not stored)
- Xero multi-tenant org picker
- Invoice pull (`v1_erp.py`)
- Dual posting (ERP + CSV fallback simultaneously)
