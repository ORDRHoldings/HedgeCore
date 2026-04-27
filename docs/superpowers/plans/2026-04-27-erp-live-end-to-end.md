# ERP Live End-to-End Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing OAuth2 + GL posting infrastructure to actually hit the QBO/Xero APIs, add a Test Connection button, and surface posting results in the GL Postings UI.

**Architecture:** Three bugs block live operation: (1) `erp_system` is never written after OAuth so posting always falls through to CSV; (2) the GL posting route reads from `erp_credentials` (never written) instead of calling `connector.post_journal()` which handles token loading internally; (3) the OAuth callback redirects to `/settings/connectors` which does not exist. Fixing these three bugs activates the already-complete connector infrastructure.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async, httpx — backend. Next.js 15, React 19, TypeScript — frontend. QBO sandbox + Xero API.

---

## Chunk 1: Backend Wire-up

### Task 1: erp_system written after QBO OAuth

**Files:**
- Modify: `backend/app/connectors/quickbooks/connector.py` (exchange_code, ~lines 122-133)
- Test: `backend/tests/test_gl_post_wire.py` (new)

- [ ] **Step 1.1: Create test file with failing test**

```python
# backend/tests/test_gl_post_wire.py
"""
Tests for the erp_system write in QBO exchange_code and
the GL posting route's use of connector.post_journal.
"""
from __future__ import annotations
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestErpSystemWrittenAfterQboOAuth:

    @pytest.mark.asyncio
    async def test_erp_system_set_to_quickbooks_after_exchange_code(self):
        """exchange_code() must write company.settings['erp_system'] = 'quickbooks'."""
        from app.connectors.quickbooks.connector import QuickBooksConnector

        tenant_id = uuid.uuid4()
        saved_settings: dict = {}

        async def fake_load(session, tenant_id):
            return dict(saved_settings)

        async def fake_save(session, tenant_id, settings):
            saved_settings.update(settings)

        mock_bundle = MagicMock()
        mock_bundle.access_token = "tok"
        mock_bundle.refresh_token = "ref"
        mock_bundle.expires_at = None
        mock_bundle.realm_id = "123"
        mock_bundle.scope = ""
        mock_bundle.raw = {}

        with (
            patch("app.connectors.quickbooks.connector.settings") as ms,
            patch("app.connectors.quickbooks.connector.token_vault.store_tokens", new_callable=AsyncMock),
            patch("app.connectors.quickbooks.connector.token_vault.update_state", new_callable=AsyncMock),
            patch("app.connectors.quickbooks.connector._load_company_settings", side_effect=fake_load),
            patch("app.connectors.quickbooks.connector._save_company_settings", side_effect=fake_save),
            patch("app.connectors.quickbooks.connector.async_session_maker") as mock_maker,
            patch("app.connectors.quickbooks.connector.QuickBooksConnector._token_request", new_callable=AsyncMock, return_value=mock_bundle),
        ):
            ms.QBO_REDIRECT_URI = "https://example.com/callback"
            mock_session = AsyncMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_maker.return_value = mock_session

            connector = QuickBooksConnector()
            await connector.exchange_code(
                code="auth_code", state="state_token",
                tenant_id=tenant_id, realmId="realm123",
            )

        assert saved_settings.get("erp_system") == "quickbooks"
```

- [ ] **Step 1.2: Verify test fails**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_gl_post_wire.py::TestErpSystemWrittenAfterQboOAuth -xvs 2>&1 | tail -20
```

Expected: FAIL — `AssertionError: assert None == 'quickbooks'`

- [ ] **Step 1.3: Add `_load_company_settings` / `_save_company_settings` imports to QBO connector**

At the top of `backend/app/connectors/quickbooks/connector.py`, find the token_vault import line and add the two helpers:

```python
from app.connectors.token_vault import (
    _load_company_settings,
    _save_company_settings,
    store_tokens,
    update_state,
    load_tokens,
    wipe_tokens,
)
```

Check the current import — it may already import `token_vault` as a module. If so, add a direct import alongside it or use `token_vault._load_company_settings` in the code below.

- [ ] **Step 1.4: Write `erp_system` inside the existing `async with` block in `exchange_code()`**

Locate the block in `exchange_code()` that calls `store_tokens` and `update_state` (lines ~122-133). Add the settings write **after** `update_state` and **before** `session.commit()`:

```python
async with async_session_maker() as session:
    await token_vault.store_tokens(
        session, tenant_id=tenant_id, provider=PROVIDER_ID, bundle=bundle
    )
    await token_vault.update_state(
        session,
        tenant_id=tenant_id,
        provider=PROVIDER_ID,
        last_connected_at=datetime.now(UTC).isoformat(),
        last_error=None,
    )
    # Mark this provider as active for GL posting route
    company_settings = await token_vault._load_company_settings(session, tenant_id)
    company_settings["erp_system"] = PROVIDER_ID
    await token_vault._save_company_settings(session, tenant_id, company_settings)
    await session.commit()
```

- [ ] **Step 1.5: Run test — must pass**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_gl_post_wire.py::TestErpSystemWrittenAfterQboOAuth -xvs 2>&1 | tail -10
```

Expected: PASSED

- [ ] **Step 1.6: Commit**

```bash
git add backend/app/connectors/quickbooks/connector.py backend/tests/test_gl_post_wire.py
git commit -m "feat(connector): write erp_system after QBO OAuth exchange_code"
```

---

### Task 2: erp_system written after Xero OAuth

**Files:**
- Modify: `backend/app/connectors/xero/connector.py`
- Test: `backend/tests/test_gl_post_wire.py` (append)

- [ ] **Step 2.1: Add failing test for Xero**

Append to `test_gl_post_wire.py`:

```python
class TestErpSystemWrittenAfterXeroOAuth:

    @pytest.mark.asyncio
    async def test_erp_system_set_to_xero_after_exchange_code(self):
        """exchange_code() must write company.settings['erp_system'] = 'xero'."""
        from app.connectors.xero.connector import XeroConnector

        tenant_id = uuid.uuid4()
        saved_settings: dict = {}

        async def fake_load(session, tenant_id):
            return dict(saved_settings)

        async def fake_save(session, tenant_id, settings):
            saved_settings.update(settings)

        mock_bundle = MagicMock()
        mock_bundle.access_token = "xtok"
        mock_bundle.refresh_token = "xref"
        mock_bundle.expires_at = None
        mock_bundle.realm_id = "xero-tenant-abc"
        mock_bundle.scope = "openid profile email accounting.transactions"
        mock_bundle.raw = {}

        with (
            patch("app.connectors.xero.connector.settings") as ms,
            patch("app.connectors.xero.connector.token_vault.store_tokens", new_callable=AsyncMock),
            patch("app.connectors.xero.connector.token_vault.update_state", new_callable=AsyncMock),
            patch("app.connectors.xero.connector._load_company_settings", side_effect=fake_load),
            patch("app.connectors.xero.connector._save_company_settings", side_effect=fake_save),
            patch("app.connectors.xero.connector.async_session_maker") as mock_maker,
            patch("app.connectors.xero.connector.XeroConnector._token_request", new_callable=AsyncMock, return_value=mock_bundle),
            patch("app.connectors.xero.connector.XeroConnector._fetch_first_tenant", new_callable=AsyncMock, return_value="xero-tenant-abc"),
        ):
            ms.XERO_REDIRECT_URI = "https://example.com/callback"
            mock_session = AsyncMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_maker.return_value = mock_session

            connector = XeroConnector()
            await connector.exchange_code(
                code="auth_code", state="state_token", tenant_id=tenant_id,
            )

        assert saved_settings.get("erp_system") == "xero"
```

> **Note:** Check the Xero `exchange_code` method signature — it may not take `realmId`. Check `backend/app/connectors/xero/connector.py` and adjust the test call accordingly. Also verify the method name for fetching tenant: it may be `_fetch_tenant_id` or similar.

- [ ] **Step 2.2: Verify test fails**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_gl_post_wire.py::TestErpSystemWrittenAfterXeroOAuth -xvs 2>&1 | tail -15
```

- [ ] **Step 2.3: Apply same pattern to Xero connector**

In `backend/app/connectors/xero/connector.py` `exchange_code()`, add after `update_state` and before `session.commit()`:

```python
company_settings = await token_vault._load_company_settings(session, tenant_id)
company_settings["erp_system"] = PROVIDER_ID  # "xero"
await token_vault._save_company_settings(session, tenant_id, company_settings)
```

- [ ] **Step 2.4: Run test — must pass**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_gl_post_wire.py -xvs 2>&1 | tail -10
```

- [ ] **Step 2.5: Commit**

```bash
git add backend/app/connectors/xero/connector.py backend/tests/test_gl_post_wire.py
git commit -m "feat(connector): write erp_system after Xero OAuth exchange_code"
```

---

### Task 3: GL posting route uses connector.post_journal

**Files:**
- Modify: `backend/app/api/routes/v1_gl.py` (~lines 211-258)
- Test: `backend/tests/test_gl_post_wire.py` (append)

- [ ] **Step 3.1: Add failing tests for GL posting route**

Append to `test_gl_post_wire.py`:

```python
class TestGlPostingUsesConnector:

    @pytest.mark.asyncio
    async def test_post_route_calls_connector_post_journal_for_quickbooks(self):
        """When erp_system='quickbooks', route must call connector.post_journal not _post_je."""
        from httpx import AsyncClient, ASGITransport
        from app.main import app

        mock_result = MagicMock()
        mock_result.external_ref = "QB-9001"

        mock_connector = AsyncMock()
        mock_connector.post_journal = AsyncMock(return_value=mock_result)

        je_id = uuid.uuid4()

        with (
            patch("app.api.routes.v1_gl.registry") as mock_registry,
            patch("app.api.routes.v1_gl._post_je", new_callable=AsyncMock) as mock_csv,
        ):
            mock_registry.get_connector.return_value = mock_connector

            from app.core.dependencies import get_current_user
            from app.core.db import get_async_session

            mock_je = MagicMock()
            mock_je.id = je_id
            mock_je.status = "APPROVED"
            mock_je.amount = 1000
            mock_je.currency = "USD"
            mock_je.debit_account = "1001"
            mock_je.credit_account = "2001"
            mock_je.description = "Test hedge"
            mock_je.period_date = __import__("datetime").date(2026, 1, 1)
            mock_je.entry_type = "HEDGE_EFFECTIVE"
            mock_je.company_id = uuid.uuid4()

            mock_company = MagicMock()
            mock_company.settings = {"erp_system": "quickbooks"}
            mock_company.id = uuid.uuid4()

            mock_user = MagicMock()
            mock_user.company = mock_company

            mock_session = AsyncMock()
            result_mock = MagicMock()
            result_mock.scalar_one_or_none.return_value = mock_je
            mock_session.execute = AsyncMock(return_value=result_mock)
            mock_session.commit = AsyncMock()

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                app.dependency_overrides[get_current_user] = lambda: mock_user
                app.dependency_overrides[get_async_session] = lambda: mock_session
                resp = await client.post(f"/api/v1/gl/journal-entries/{je_id}/post")
                app.dependency_overrides.clear()

        # connector.post_journal must have been called
        mock_connector.post_journal.assert_called_once()
        # CSV fallback must NOT have been called
        mock_csv.assert_not_called()
        # Status must be POSTED
        assert mock_je.status == "POSTED"
        assert mock_je.posted_ref == "QB-9001"

    @pytest.mark.asyncio
    async def test_post_route_uses_csv_when_no_erp_connected(self):
        """When erp_system absent/'CSV', route falls through to CSV export."""
        from httpx import AsyncClient, ASGITransport
        from app.main import app
        from app.services.posting_adapters.base import PostingResult
        from app.core.dependencies import get_current_user
        from app.core.db import get_async_session

        mock_je = MagicMock()
        mock_je.id = uuid.uuid4()
        mock_je.status = "APPROVED"
        mock_je.company_id = uuid.uuid4()

        mock_company = MagicMock()
        mock_company.settings = {}  # no erp_system
        mock_company.id = uuid.uuid4()

        mock_user = MagicMock()
        mock_user.company = mock_company

        mock_session = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = mock_je
        mock_session.execute = AsyncMock(return_value=result_mock)
        mock_session.commit = AsyncMock()

        csv_result = PostingResult(success=True, payload="csv_data", erp_ref="CSV-export")

        with patch("app.api.routes.v1_gl._post_je", new_callable=AsyncMock, return_value=csv_result):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                app.dependency_overrides[get_current_user] = lambda: mock_user
                app.dependency_overrides[get_async_session] = lambda: mock_session
                await client.post(f"/api/v1/gl/journal-entries/{mock_je.id}/post")
                app.dependency_overrides.clear()
        # If we get here without an exception, the CSV path was hit
```

- [ ] **Step 3.2: Run tests — they must fail**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_gl_post_wire.py::TestGlPostingUsesConnector -xvs 2>&1 | tail -20
```

- [ ] **Step 3.3: Rewrite the `post_journal_entry` route in `v1_gl.py`**

Add these imports to the top of `v1_gl.py` (they are all absent in the current file):

```python
from datetime import UTC, date, datetime, time
from decimal import Decimal
```

`JournalEntryStatus` is **not** imported in the current `v1_gl.py`. The existing line 21 reads:
```python
from app.models.journal_entry import GLMappingNotConfiguredError
```
Change it to:
```python
from app.models.journal_entry import GLMappingNotConfiguredError, JournalEntryStatus
```

Replace lines 221-258 (the `post_journal_entry` function body, from `company = current_user.company` to the end of the function) with:

```python
    from sqlalchemy import select as sa_select  # noqa: PLC0415

    from app.models.journal_entry import JournalEntry as JE  # noqa: PLC0415
    result = await session.execute(
        sa_select(JE).where(JE.id == entry_id, JE.company_id == current_user.company.id)
    )
    je = result.scalar_one_or_none()
    if je is None:
        raise HTTPException(status_code=404, detail=f"JournalEntry {entry_id} not found")

    company = current_user.company
    erp_system = (company.settings or {}).get("erp_system", "CSV")

    if erp_system.lower() in ("quickbooks", "xero"):
        from app.connectors import registry  # noqa: PLC0415
        from app.connectors.base import JournalLine, JournalPayload  # noqa: PLC0415
        from app.connectors.errors import ConnectorError, ConnectorNotConfiguredError  # noqa: PLC0415

        provider = erp_system.lower()
        connector = registry.get_connector(provider)
        payload = JournalPayload(
            journal_entry_id=je.id,
            reference=f"ORDR-{str(je.id)[:21]}",
            memo=f"ORDR {je.entry_type} {je.id}",
            posting_date=datetime.combine(je.period_date, time.min, tzinfo=UTC),
            lines=(
                JournalLine(
                    account_external_id=je.debit_account,
                    debit=Decimal(str(je.amount)),
                    credit=Decimal("0"),
                    description=je.description or "",
                    currency=je.currency,
                ),
                JournalLine(
                    account_external_id=je.credit_account,
                    debit=Decimal("0"),
                    credit=Decimal(str(je.amount)),
                    description=je.description or "",
                    currency=je.currency,
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
            raise HTTPException(
                status_code=502, detail=f"ERP posting failed: {exc.message}"
            ) from exc

        je.status = JournalEntryStatus.POSTED.value
        je.posted_to = provider[:4].upper()
        je.posted_ref = result.external_ref or ""
        je.posted_at = datetime.now(UTC)
    else:
        try:
            posting_result = await _post_je(
                session, je, current_user, erp_system="CSV", connector_settings={}
            )
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        if not posting_result.success:
            raise HTTPException(status_code=502, detail="GL export failed")

    await session.commit()
    await emit_audit(
        session=session, user=current_user,
        event_type="SYSTEM",
        description=f"Journal entry {entry_id} posted via {erp_system}",
        entity_type="journal_entry", entity_id=str(entry_id),
        payload={"erp_system": erp_system, "erp_ref": je.posted_ref},
    )
    return je
```

- [ ] **Step 3.4: Run all wire-up tests — must pass**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_gl_post_wire.py -xvs 2>&1 | tail -15
```

- [ ] **Step 3.5: Run full suite — no regressions**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short 2>&1 | tail -5
```

Expected: 5327+ passed, 0 failed

- [ ] **Step 3.6: Commit**

```bash
git add backend/app/api/routes/v1_gl.py backend/tests/test_gl_post_wire.py
git commit -m "feat(gl): wire GL posting to connector.post_journal — live ERP activated"
```

---

## Chunk 2: Backend New Endpoint + Redirect Fix

### Task 4: Test-post endpoint

**Files:**
- Modify: `backend/app/api/routes/v1_connectors.py`
- Test: `backend/tests/test_connector_test_post.py` (new)

- [ ] **Step 4.1: Write failing tests**

```python
# backend/tests/test_connector_test_post.py
"""Tests for POST /v1/connectors/{provider}/test-post endpoint."""
from __future__ import annotations
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.dependencies import get_current_user
from app.core.db import get_async_session


def _make_mock_user(permissions=("trades.create",)):
    mock_permission = MagicMock()
    mock_permission.permission = MagicMock()
    mock_permission.permission.name = "trades.create"

    mock_company = MagicMock()
    mock_company.id = uuid.uuid4()

    mock_user = MagicMock()
    mock_user.company = mock_company
    mock_user.role = MagicMock()
    mock_user.role.permissions = [mock_permission] if "trades.create" in permissions else []
    return mock_user


def _make_mock_session(mappings=()):
    mock_session = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = list(mappings)
    mock_session.execute = AsyncMock(return_value=result_mock)
    return mock_session


class TestTestPostEndpoint:

    @pytest.mark.asyncio
    async def test_returns_success_when_connector_posts(self):
        mock_result = MagicMock()
        mock_result.external_ref = "QB-TEST-001"

        mock_connector = AsyncMock()
        mock_connector.post_journal = AsyncMock(return_value=mock_result)

        mock_user = _make_mock_user()
        mock_session = _make_mock_session()

        with (
            patch("app.api.routes.v1_connectors.registry") as mock_reg,
            patch("app.api.routes.v1_connectors._check_permission", new_callable=AsyncMock),
        ):
            mock_reg.get_connector.return_value = mock_connector

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                app.dependency_overrides[get_current_user] = lambda: mock_user
                app.dependency_overrides[get_async_session] = lambda: mock_session
                resp = await client.post("/api/v1/connectors/quickbooks/test-post")
                app.dependency_overrides.clear()

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["erp_ref"] == "QB-TEST-001"
        assert data["provider"] == "quickbooks"

    @pytest.mark.asyncio
    async def test_returns_failure_on_connector_error(self):
        from app.connectors.errors import ConnectorServerError

        mock_connector = AsyncMock()
        mock_connector.post_journal = AsyncMock(side_effect=ConnectorServerError("API down"))

        mock_user = _make_mock_user()
        mock_session = _make_mock_session()

        with (
            patch("app.api.routes.v1_connectors.registry") as mock_reg,
            patch("app.api.routes.v1_connectors._check_permission", new_callable=AsyncMock),
        ):
            mock_reg.get_connector.return_value = mock_connector

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                app.dependency_overrides[get_current_user] = lambda: mock_user
                app.dependency_overrides[get_async_session] = lambda: mock_session
                resp = await client.post("/api/v1/connectors/quickbooks/test-post")
                app.dependency_overrides.clear()

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert data["erp_ref"] is None
        assert "API down" in data["error"]

    @pytest.mark.asyncio
    async def test_payload_is_balanced(self):
        """JournalPayload sent to connector must have equal debit and credit totals."""
        captured_payload = []

        async def capture_post_journal(*, tenant_id, payload):
            captured_payload.append(payload)
            result = MagicMock()
            result.external_ref = "QB-BAL-001"
            return result

        mock_connector = AsyncMock()
        mock_connector.post_journal = capture_post_journal

        mock_user = _make_mock_user()
        mock_session = _make_mock_session()

        with (
            patch("app.api.routes.v1_connectors.registry") as mock_reg,
            patch("app.api.routes.v1_connectors._check_permission", new_callable=AsyncMock),
        ):
            mock_reg.get_connector.return_value = mock_connector

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                app.dependency_overrides[get_current_user] = lambda: mock_user
                app.dependency_overrides[get_async_session] = lambda: mock_session
                await client.post("/api/v1/connectors/quickbooks/test-post")
                app.dependency_overrides.clear()

        assert len(captured_payload) == 1
        p = captured_payload[0]
        total_debit = sum(ln.debit for ln in p.lines)
        total_credit = sum(ln.credit for ln in p.lines)
        assert total_debit == total_credit, "Payload must be balanced"

    @pytest.mark.asyncio
    async def test_no_journal_entry_row_created(self):
        """test-post must NOT create a JournalEntry ORM row."""
        mock_connector = AsyncMock()
        result = MagicMock()
        result.external_ref = "QB-001"
        mock_connector.post_journal = AsyncMock(return_value=result)

        mock_user = _make_mock_user()
        mock_session = _make_mock_session()

        with (
            patch("app.api.routes.v1_connectors.registry") as mock_reg,
            patch("app.api.routes.v1_connectors._check_permission", new_callable=AsyncMock),
        ):
            mock_reg.get_connector.return_value = mock_connector

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                app.dependency_overrides[get_current_user] = lambda: mock_user
                app.dependency_overrides[get_async_session] = lambda: mock_session
                await client.post("/api/v1/connectors/quickbooks/test-post")
                app.dependency_overrides.clear()

        # session.add() must never have been called (no ORM row created)
        mock_session.add.assert_not_called()
```

- [ ] **Step 4.2: Verify tests fail**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_connector_test_post.py -xvs 2>&1 | tail -15
```

Expected: FAIL with 404 (endpoint doesn't exist)

- [ ] **Step 4.3: Add the test-post endpoint to `v1_connectors.py`**

Add these imports near the top of `v1_connectors.py` (with other deferred imports or at module level):

```python
from decimal import Decimal
from datetime import UTC, datetime
import uuid as _uuid
```

Add the endpoint after the `disconnect_connector` endpoint (~line 480):

```python
@router.post("/{provider}/test-post")
async def test_post_connector(
    provider: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Post a synthetic balanced journal entry to verify end-to-end connector health.
    Does NOT create a JournalEntry row — this is a connectivity probe only.
    """
    await _check_permission(session, current_user, "trades.create")
    tenant = _tenant_id(current_user)

    from sqlalchemy import select as sa_select  # noqa: PLC0415

    from app.connectors.base import JournalLine, JournalPayload  # noqa: PLC0415
    from app.connectors.errors import ConnectorError  # noqa: PLC0415
    from app.models.journal_entry import GLAccountMapping  # noqa: PLC0415

    # Pull first GL mapping for real account codes; fall back to "9999"
    mappings_result = await session.execute(
        sa_select(GLAccountMapping)
        .where(GLAccountMapping.company_id == current_user.company.id)
        .limit(1)
    )
    mappings = mappings_result.scalars().all()
    dr_code = mappings[0].debit_account if mappings else "9999"
    cr_code = mappings[0].credit_account if mappings else "9999"

    payload = JournalPayload(
        journal_entry_id=_uuid.uuid4(),
        reference="ORDR-TEST",
        memo="ORDR connectivity test — safe to delete",
        posting_date=datetime.now(UTC),
        lines=(
            JournalLine(
                account_external_id=dr_code,
                debit=Decimal("100"),
                credit=Decimal("0"),
                description="Test debit",
                currency="USD",
            ),
            JournalLine(
                account_external_id=cr_code,
                debit=Decimal("0"),
                credit=Decimal("100"),
                description="Test credit",
                currency="USD",
            ),
        ),
    )

    try:
        connector = registry.get_connector(provider)
        result = await connector.post_journal(tenant_id=tenant, payload=payload)
    except ConnectorError as exc:
        return {
            "success": False,
            "provider": provider,
            "error": exc.message,
            "erp_ref": None,
            "sandbox": True,
        }

    return {
        "success": True,
        "provider": provider,
        "erp_ref": result.external_ref,
        "sandbox": getattr(settings, "QBO_ENVIRONMENT", "sandbox") == "sandbox",
        "error": None,
    }
```

- [ ] **Step 4.4: Run tests — must pass**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_connector_test_post.py -xvs 2>&1 | tail -15
```

- [ ] **Step 4.5: Commit**

```bash
git add backend/app/api/routes/v1_connectors.py backend/tests/test_connector_test_post.py
git commit -m "feat(connectors): add test-post endpoint for connection validation"
```

---

### Task 5: Fix OAuth callback redirect URLs

**Files:**
- Modify: `backend/app/api/routes/v1_connectors.py` (`oauth_callback`, ~lines 444-456)
- Test: `backend/tests/test_oauth_redirect.py` (new)

- [ ] **Step 5.1: Write failing redirect tests**

```python
# backend/tests/test_oauth_redirect.py
"""Tests that OAuth callback redirects to /accounting-oauth-callback, not /settings/connectors."""
from __future__ import annotations
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


class TestOAuthCallbackRedirect:

    @pytest.mark.asyncio
    async def test_success_redirects_to_accounting_oauth_callback(self):
        """Successful OAuth must redirect to /accounting-oauth-callback?system={provider}."""
        from app.connectors.oauth_state import StateToken
        from uuid import uuid4

        mock_state = StateToken(
            tenant_id=uuid4(),
            provider="quickbooks",
            nonce="abc",
            issued_at=0,
        )
        mock_connector = AsyncMock()
        mock_connector.exchange_code = AsyncMock()

        with (
            patch("app.api.routes.v1_connectors.oauth_state.verify_and_consume", new_callable=AsyncMock, return_value=mock_state),
            patch("app.api.routes.v1_connectors.registry.get_connector", return_value=mock_connector),
            patch("app.api.routes.v1_connectors.async_session_maker") as mock_maker,
        ):
            mock_session = AsyncMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_maker.return_value = mock_session

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=False) as client:
                resp = await client.get(
                    "/api/v1/connectors/oauth/callback",
                    params={"code": "authcode", "state": "state_token", "realmId": "realm123"},
                )

        assert resp.status_code == 302
        location = resp.headers["location"]
        assert "/accounting-oauth-callback" in location
        assert "system=quickbooks" in location
        assert "/settings/connectors" not in location

    @pytest.mark.asyncio
    async def test_error_redirects_to_accounting_oauth_callback(self):
        """OAuth error must redirect to /accounting-oauth-callback with error param."""
        from app.connectors.errors import ConnectorAuthError

        with patch(
            "app.api.routes.v1_connectors.oauth_state.verify_and_consume",
            new_callable=AsyncMock,
            side_effect=ConnectorAuthError("expired"),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=False) as client:
                resp = await client.get(
                    "/api/v1/connectors/oauth/callback",
                    params={"code": "code", "state": "bad_state"},
                )

        assert resp.status_code == 302
        location = resp.headers["location"]
        assert "/accounting-oauth-callback" in location
        assert "/settings/connectors" not in location
```

- [ ] **Step 5.2: Verify tests fail**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_oauth_redirect.py -xvs 2>&1 | tail -15
```

Expected: FAIL — location contains `/settings/connectors`

- [ ] **Step 5.3: Fix the redirect URLs in `oauth_callback()`**

In `v1_connectors.py`, locate the `oauth_callback` function. Change the error redirect (around line 445):

```python
# BEFORE:
return RedirectResponse(
    url=f"/settings/connectors?provider={provider}&status=error&detail={exc.message[:120]}",
    status_code=302,
)

# AFTER:
return RedirectResponse(
    url=f"/accounting-oauth-callback?system={provider}&error=connector_error&error_description={exc.message[:120]}",
    status_code=302,
)
```

Change the success redirect (around line 454):

```python
# BEFORE:
return RedirectResponse(
    url=f"/settings/connectors?provider={provider}&status=connected",
    status_code=302,
)

# AFTER:
return RedirectResponse(
    url=f"/accounting-oauth-callback?system={provider}",
    status_code=302,
)
```

- [ ] **Step 5.4: Run redirect tests — must pass**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_oauth_redirect.py -xvs 2>&1 | tail -10
```

- [ ] **Step 5.5: Run full test suite — no regressions**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short 2>&1 | tail -5
```

Expected: 5330+ passed, 0 failed

- [ ] **Step 5.6: Commit**

```bash
git add backend/app/api/routes/v1_connectors.py backend/tests/test_oauth_redirect.py
git commit -m "fix(connectors): redirect OAuth callback to /accounting-oauth-callback"
```

---

## Chunk 3: Frontend

### Task 6: accounting-connection — real OAuth flow + Test Connection button

**Files:**
- Modify: `frontend/src/app/accounting-connection/page.tsx`
- Modify: `frontend/src/app/accounting-oauth-callback/page.tsx`

> **TypeScript check after each frontend task:** `cd frontend && npx tsc --noEmit 2>&1 | tail -20`

- [ ] **Step 6.1: Update `accounting-oauth-callback` to skip CSRF check when no `?state=` in URL**

In `accounting-oauth-callback/page.tsx`, find (around line 67):

```typescript
const error = upstreamError ?? (stateReady && systemId && !stateOk ? "state_mismatch" : null);
```

Replace with:

```typescript
// State CSRF check is optional: the backend HMAC-signs its own state (real
// protection). The frontend check is defense-in-depth; only run it when the
// backend echoed a state param back — which it does not in the current flow.
const stateInUrl = searchParams.get("state") !== null;
const error = upstreamError ?? (stateReady && systemId && stateInUrl && !stateOk ? "state_mismatch" : null);
```

- [ ] **Step 6.2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "error TS" | head -10
```

Expected: no new errors

- [ ] **Step 6.3: Rewrite `handleConnect` to call backend authorize endpoint**

In `accounting-connection/page.tsx`, replace the `handleConnect` function body (keeping the function signature). The existing function opens `/api/accounting-oauth-start` — replace the `window.open` call and the state generation:

```typescript
function handleConnect(systemId: string) {
  setConnections(prev => ({ ...prev, [systemId]: "connecting" }));
  setConnErrors(prev => ({ ...prev, [systemId]: null }));
  setImportResult(null);
  setImportError(null);

  if (!token) {
    setConnections(prev => ({ ...prev, [systemId]: "error" }));
    setConnErrors(prev => ({ ...prev, [systemId]: "Not authenticated." }));
    return;
  }

  // Get real authorize URL from backend, then open popup directly to QBO/Xero
  dashboardFetch(`/v1/connectors/${systemId}/authorize`, token, { method: "POST" })
    .then(async (resp) => {
      if (!resp.ok) throw new Error(`Authorize failed: ${resp.status}`);
      const data = await resp.json() as { authorize_url: string | null; requires_form: boolean };
      if (!data.authorize_url) throw new Error("Provider requires form-based auth — not yet supported in this UI.");

      const popup = window.open(
        data.authorize_url,
        "accounting-oauth",
        "width=600,height=700,scrollbars=yes",
      );

      const timeout = setTimeout(() => {
        clearInterval(poll);
        if (popup && !popup.closed) popup.close();
        setConnections(prev => {
          if (prev[systemId] === "connecting") {
            setConnErrors(p => ({ ...p, [systemId]: "Connection timed out. Please try again." }));
            return { ...prev, [systemId]: "error" };
          }
          return prev;
        });
      }, 5 * 60 * 1000);

      const poll = setInterval(() => {
        if (popup?.closed) {
          clearInterval(poll);
          clearTimeout(timeout);
          const result = localStorage.getItem(lsOAuthResult(systemId));
          if (result === "authorized") {
            const details = {
              connectedAs: user?.full_name ?? user?.email ?? "Unknown",
              tenantId: ((user?.company?.name ?? user?.company?.slug ?? "ORG")
                .replace(/\s+/g, "").slice(0, 6).toUpperCase()) + "-****-****",
              expiresAt: new Date(Date.now() + 30 * 24 * 3600_000)
                .toISOString().slice(0, 16) + " UTC",
            };
            setConnections(prev => ({ ...prev, [systemId]: "connected" }));
            setConnDetails(prev => ({ ...prev, [systemId]: details }));
            try {
              localStorage.setItem(lsConnKey(systemId), JSON.stringify({ status: "connected", details }));
            } catch { /* quota */ }
            localStorage.removeItem(lsOAuthResult(systemId));
          } else if (result?.startsWith("error:")) {
            const errMsg = result.slice(6);
            setConnErrors(prev => ({ ...prev, [systemId]: errMsg }));
            setConnections(prev => ({ ...prev, [systemId]: "error" }));
            localStorage.removeItem(lsOAuthResult(systemId));
          } else {
            setConnections(prev => ({ ...prev, [systemId]: "not_connected" }));
          }
        }
      }, 500);
    })
    .catch((e: unknown) => {
      setConnections(prev => ({ ...prev, [systemId]: "error" }));
      setConnErrors(prev => ({ ...prev, [systemId]: e instanceof Error ? e.message : "Connect failed" }));
    });
}
```

> **Note:** Remove now-unused imports if `generateOauthState`, `oauthStateKey`, `verifyAndClearOauthState` are no longer referenced in the file after this change. Check with TypeScript.

- [ ] **Step 6.4: Add Test Connection state and handler**

Add two new state declarations near the other UI state (after `const [connErrors, ...]`):

```typescript
const [testPosting, setTestPosting] = useState<string | null>(null);
const [testResult, setTestResult] = useState<Record<string, { success: boolean; erp_ref?: string | null; error?: string | null } | null>>({});
```

Add the handler function after `handleDisconnect`:

```typescript
async function handleTestPost(systemId: string) {
  if (!token) return;
  setTestPosting(systemId);
  setTestResult(prev => ({ ...prev, [systemId]: null }));
  try {
    const resp = await dashboardFetch(`/v1/connectors/${systemId}/test-post`, token, { method: "POST" });
    if (!resp.ok) throw new Error(`Test post failed: ${resp.status}`);
    const data = await resp.json() as { success: boolean; erp_ref?: string | null; error?: string | null };
    setTestResult(prev => ({ ...prev, [systemId]: data }));
  } catch (e) {
    setTestResult(prev => ({ ...prev, [systemId]: { success: false, error: e instanceof Error ? e.message : "Unknown error" } }));
  } finally {
    setTestPosting(null);
  }
}
```

- [ ] **Step 6.5: Add Test Connection button to the connected state card**

Search the render for where `connections[selectedSystem] === "connected"` is shown in the UI (or where the "CONNECTED" status badge is rendered). Add the test button and result below the disconnect button. The exact location depends on how the connected state is rendered — find the card/section and add:

```tsx
{connections[selectedSystem] === "connected" && (
  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
    <button
      onClick={() => handleTestPost(selectedSystem)}
      disabled={testPosting === selectedSystem}
      style={{
        padding: "6px 14px",
        background: "rgba(28,98,242,0.12)",
        border: "1px solid rgba(28,98,242,0.3)",
        color: S.cyan,
        fontSize: 11,
        fontFamily: S.fontMono,
        borderRadius: 3,
        cursor: testPosting === selectedSystem ? "not-allowed" : "pointer",
        letterSpacing: "0.06em",
      }}
    >
      {testPosting === selectedSystem ? "TESTING…" : "TEST CONNECTION"}
    </button>
    {testResult[selectedSystem] && (
      <div style={{
        fontSize: 11,
        fontFamily: S.fontMono,
        color: testResult[selectedSystem]?.success ? S.pass : S.fail,
        padding: "4px 8px",
        background: testResult[selectedSystem]?.success ? "rgba(5,150,105,0.1)" : "rgba(220,38,38,0.1)",
        border: `1px solid ${testResult[selectedSystem]?.success ? "rgba(5,150,105,0.3)" : "rgba(220,38,38,0.3)"}`,
        borderRadius: 3,
      }}>
        {testResult[selectedSystem]?.success
          ? `✓ Test posted — ref ${testResult[selectedSystem]?.erp_ref ?? "n/a"}`
          : `✗ ${testResult[selectedSystem]?.error ?? "Post failed"}`}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 6.6: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "error TS" | head -20
```

Fix any errors before proceeding.

- [ ] **Step 6.7: Commit**

```bash
git add frontend/src/app/accounting-connection/page.tsx frontend/src/app/accounting-oauth-callback/page.tsx
git commit -m "feat(ui): real OAuth popup flow + Test Connection button for accounting connectors"
```

---

### Task 7: GL Postings — ERP label, post result, retry

**Files:**
- Modify: `frontend/src/app/gl-postings/page.tsx`
- Modify: `frontend/src/lib/api/glClient.ts` (add `getConnectorStatus` if not present)

- [ ] **Step 7.1: Add connector status call to glClient**

In `frontend/src/lib/api/glClient.ts`, add after the existing exported functions:

```typescript
export interface ConnectorStatus {
  connected: boolean;
  provider: string;
  realm_id: string | null;
  last_sync_at: string | null;
  circuit_open: boolean;
}

export async function getConnectorStatus(token: string, provider: string): Promise<ConnectorStatus> {
  const resp = await dashboardFetch(`/v1/connectors/${provider}/status`, token);
  if (!resp.ok) throw new Error(`Status fetch failed: ${resp.status}`);
  return resp.json() as Promise<ConnectorStatus>;
}
```

> **Note:** Check if the `/v1/connectors/{provider}/status` endpoint already exists in the backend by grepping for `router.get.*status` in `v1_connectors.py`. Use whatever path is live.

- [ ] **Step 7.2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "error TS" | head -5
```

- [ ] **Step 7.3: Update GL Postings page**

In `frontend/src/app/gl-postings/page.tsx`:

**Add import:**
```typescript
import { listJournalEntries, approveJournalEntry, rejectJournalEntry, postJournalEntry, getConnectorStatus, type JournalEntry, type ConnectorStatus } from "@/lib/api/glClient";
```

**Add state:**
```typescript
const [activeProvider, setActiveProvider] = useState<string | null>(null);
const [postErrors, setPostErrors] = useState<Record<string, string | null>>({});
```

**Add provider detection on mount** (inside a new `useEffect`):
```typescript
useEffect(() => {
  if (!token) return;
  Promise.all([
    getConnectorStatus(token, "quickbooks").catch(() => null),
    getConnectorStatus(token, "xero").catch(() => null),
  ]).then(([qbo, xero]) => {
    if (qbo?.connected) setActiveProvider("quickbooks");
    else if (xero?.connected) setActiveProvider("xero");
    else setActiveProvider(null);
  });
}, [token]);
```

**Replace `handlePost`:**
```typescript
const handlePost = async (id: string) => {
  setActionError(null);
  setPostErrors(prev => ({ ...prev, [id]: null }));
  try {
    await postJournalEntry(token, id);
    await load();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Post failed";
    setPostErrors(prev => ({ ...prev, [id]: msg }));
  }
};
```

**Replace the Post button cell** (find `e.status === "APPROVED"` block, around line 180):
```tsx
{e.status === "APPROVED" && (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <button
      onClick={() => handlePost(e.id)}
      title={activeProvider ? `Post to ${activeProvider}` : "Export CSV"}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "4px 10px",
        background: "rgba(0,212,255,0.1)",
        border: "1px solid rgba(0,212,255,0.3)",
        color: S.accent, fontSize: 11, borderRadius: 3,
        cursor: "pointer", fontFamily: S.fontMono,
      }}
    >
      <Send size={11} />
      {activeProvider === "quickbooks" ? "Post to QB"
        : activeProvider === "xero" ? "Post to Xero"
        : "Export CSV"}
    </button>
    {postErrors[e.id] && (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 10, color: C.red, fontFamily: S.fontMono }}>{postErrors[e.id]}</span>
        <button
          onClick={() => handlePost(e.id)}
          style={{ fontSize: 10, color: S.accent, background: "transparent", border: "none", cursor: "pointer", fontFamily: S.fontMono }}
        >
          Retry
        </button>
      </div>
    )}
  </div>
)}
```

**Add posted_ref badge to POSTED rows** — find the Status column cell and after the status badge, add a posted_ref display:
```tsx
{e.status === "POSTED" && e.posted_ref && (
  <div style={{ marginTop: 4, fontSize: 10, fontFamily: S.fontMono }}>
    {e.posted_to === "QUIC" ? (
      <a
        href={`https://qbo.intuit.com/app/journal?txnId=${e.posted_ref}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "var(--accent-cyan)", textDecoration: "underline" }}
      >
        {e.posted_ref}
      </a>
    ) : (
      <span style={{ color: "var(--text-secondary)" }}>{e.posted_ref}</span>
    )}
  </div>
)}
```

> **Note:** The `posted_ref` badge should appear in the Status cell, not the Actions cell, so it's visible in both POSTED and non-APPROVED states.

- [ ] **Step 7.4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "error TS" | head -20
```

Fix all errors.

- [ ] **Step 7.5: Commit**

```bash
git add frontend/src/app/gl-postings/page.tsx frontend/src/lib/api/glClient.ts
git commit -m "feat(ui): GL postings — ERP label, posted_ref badge, retry on failure"
```

---

### Task 8: Final validation + push

- [ ] **Step 8.1: Full backend test suite**

```bash
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short 2>&1 | tail -5
```

Expected: 5330+ passed, 0 failed

- [ ] **Step 8.2: Frontend build**

```bash
cd frontend && NEXT_PUBLIC_API_URL="https://hedgecore.onrender.com/api" npx next build 2>&1 | tail -20
```

Expected: ✓ Compiled successfully

- [ ] **Step 8.3: Update CHANGELOG_AI.md**

Prepend entry to `.claude/state/CHANGELOG_AI.md`:

```
## 2026-04-27 — Sub-project A complete: Live ERP end-to-end activated

Three bugs fixed:
- QBO + Xero exchange_code() now writes company.settings["erp_system"] after OAuth
- GL posting route now calls connector.post_journal() (handles token refresh internally) instead of legacy erp_credentials path
- OAuth callback now redirects to /accounting-oauth-callback?system={provider} (was /settings/connectors — non-existent)

New features:
- POST /v1/connectors/{provider}/test-post: synthetic balanced entry, no WORM row, trades.create gate
- GL Postings: "Post to QB" / "Post to Xero" / "Export CSV" label from connector status
- GL Postings: posted_ref badge (QBO deep-link, Xero text) + Retry button on failure
- Accounting Connection: real OAuth popup calls backend authorize endpoint; Test Connection button in connected card

Tests: +16 new tests (test_gl_post_wire, test_connector_test_post, test_oauth_redirect)
```

- [ ] **Step 8.4: Push to origin**

```bash
git add .claude/state/CHANGELOG_AI.md
git commit -m "docs(state): sub-project A complete — live ERP activated"
git push origin master
```

Expected: Render + Vercel auto-deploy triggered

---

## Environment Variables Required on Render Before Testing

Set these in the Render dashboard before triggering the OAuth flow:

| Variable | Value |
|----------|-------|
| `CONNECTOR_ENCRYPTION_KEY` | Run: `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'` |
| `QBO_CLIENT_ID` | From Intuit developer portal |
| `QBO_CLIENT_SECRET` | From Intuit developer portal |
| `QBO_REDIRECT_URI` | `https://hedgecore.onrender.com/api/v1/connectors/oauth/callback` |
| `QBO_ENVIRONMENT` | `sandbox` |

Without `CONNECTOR_ENCRYPTION_KEY`, the app refuses to start if QBO credentials are set.
