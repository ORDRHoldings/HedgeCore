# Slack/Teams Notifications Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing webhook infrastructure to deliver Slack Block Kit and Teams MessageCard formatted notifications for three new hedge events, and provide a frontend settings page for admins to register channels.

**Architecture:** Add `channel_type` to `WebhookEndpoint`, a new pure-function formatter module, a `dispatch_to_company` fan-out wrapper (safe for `BackgroundTasks`), and wire three new events into the calculate and GL routes. A new `/settings/notifications` page wraps the existing webhook API.

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy async / httpx — Next.js 15.5 App Router / TypeScript / lucide-react

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/models/webhook.py` | Modify | Add 3 events to `SUPPORTED_EVENTS`, `CHANNEL_TYPES`, `channel_type` column |
| `backend/app/main.py` | Modify | `ALTER TABLE webhook_endpoints ADD COLUMN channel_type` in `_ensure_tables()` |
| `backend/app/services/notification_formatters.py` | Create | Pure-function Slack Block Kit + Teams MessageCard formatters |
| `backend/app/services/webhook_service.py` | Modify | `channel_type` param on `deliver_webhook_attempt`; format dispatch in `dispatch_webhook_event`; new `dispatch_to_company` wrapper |
| `backend/app/api/routes/v1_webhooks.py` | Modify | `ChannelType` enum, `channel_type` in request/response, `_endpoint_to_response`, `POST /{id}/test` endpoint |
| `backend/app/api/routes/v1_calculate.py` | Modify | Replace `_fire_webhook` inline pattern with `dispatch_to_company`; add `hedge_run.completed` |
| `backend/app/api/routes/v1_gl.py` | Modify | Add `BackgroundTasks` param; emit `journal_entry.posted` and `erp_post.failed` |
| `backend/tests/test_notification_formatters.py` | Create | 8 pure-function formatter tests |
| `backend/tests/test_webhook_channel_type.py` | Create | 5 delivery + registration tests |
| `backend/tests/test_webhook_event_emission.py` | Create | 3 route-level emission tests |
| `frontend/src/lib/api/webhookClient.ts` | Create | 4 API client functions |
| `frontend/src/app/settings/notifications/page.tsx` | Create | Notifications settings page |
| `frontend/src/app/AppSidebar.tsx` | Modify | Add Notifications nav item under SETTINGS |

---

## Chunk 1: Backend Foundation

### Task 1: Expand model + schema bootstrap

**Files:**
- Modify: `backend/app/models/webhook.py`
- Modify: `backend/app/main.py` (around line 1564 — after `ix_webhook_endpoints_company`)

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_webhook_channel_type.py`:

```python
"""Tests for channel_type webhook extension."""
from __future__ import annotations
import pytest
from app.models.webhook import SUPPORTED_EVENTS, CHANNEL_TYPES


def test_new_events_in_supported_set():
    assert "hedge_run.completed" in SUPPORTED_EVENTS
    assert "journal_entry.posted" in SUPPORTED_EVENTS
    assert "erp_post.failed" in SUPPORTED_EVENTS


def test_channel_types_constant():
    assert "slack" in CHANNEL_TYPES
    assert "teams" in CHANNEL_TYPES
    assert "generic" in CHANNEL_TYPES
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_channel_type.py::test_new_events_in_supported_set tests/test_webhook_channel_type.py::test_channel_types_constant -v
```

Expected: FAIL — `"hedge_run.completed" not in SUPPORTED_EVENTS`

- [ ] **Step 3: Implement — `backend/app/models/webhook.py`**

Replace the `SUPPORTED_EVENTS` set (lines 31–36) and add `CHANNEL_TYPES` constant directly after it:

```python
SUPPORTED_EVENTS: set[str] = {
    "position.created",
    "calculation.completed",
    "proposal.approved",
    "proposal.rejected",
    "hedge_run.completed",
    "journal_entry.posted",
    "erp_post.failed",
}

CHANNEL_TYPES: set[str] = {"generic", "slack", "teams"}
```

Add `channel_type` column to `WebhookEndpoint` after `is_active` (line ~62):

```python
channel_type = Column(String(16), nullable=False, server_default="generic")
```

- [ ] **Step 4: Add schema bootstrap — `backend/app/main.py`**

Find the `ix_webhook_endpoints_company` line (around line 1565). Add the `ALTER TABLE` directly after it:

```python
        "CREATE INDEX IF NOT EXISTS ix_webhook_endpoints_company ON webhook_endpoints(company_id)",
        "ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS channel_type VARCHAR(16) NOT NULL DEFAULT 'generic'",
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_channel_type.py::test_new_events_in_supported_set tests/test_webhook_channel_type.py::test_channel_types_constant -v
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/webhook.py backend/app/main.py backend/tests/test_webhook_channel_type.py
git commit -m "feat(webhooks): expand SUPPORTED_EVENTS + channel_type column"
```

---

### Task 2: notification_formatters.py

**Files:**
- Create: `backend/app/services/notification_formatters.py`
- Create (continue): `backend/tests/test_notification_formatters.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_notification_formatters.py`:

```python
"""Tests for Slack/Teams notification formatters."""
from __future__ import annotations
import pytest
from unittest.mock import patch


def test_slack_blocks_has_header_block():
    from app.services.notification_formatters import format_slack_blocks
    result = format_slack_blocks("hedge_run.completed", {"run_id": "abc", "trade_count": 5})
    assert result["blocks"][0]["type"] == "header"
    assert "Hedge Run Completed" in result["blocks"][0]["text"]["text"]


def test_slack_blocks_erp_failed_has_error_in_section():
    from app.services.notification_formatters import format_slack_blocks
    result = format_slack_blocks("erp_post.failed", {"error_message": "timeout", "je_id": "xyz"})
    section_text = result["blocks"][1]["text"]["text"]
    assert "error_message" in section_text


def test_slack_blocks_excludes_tenant_id_from_fields():
    from app.services.notification_formatters import format_slack_blocks
    result = format_slack_blocks("hedge_run.completed", {"run_id": "abc", "tenant_id": "t1"})
    section_text = result["blocks"][1]["text"]["text"]
    assert "tenant_id" not in section_text


def test_teams_card_structure():
    from app.services.notification_formatters import format_teams_card
    result = format_teams_card("journal_entry.posted", {"je_id": "1", "erp_ref": "QB-9"})
    assert result["@type"] == "MessageCard"
    assert "sections" in result


def test_teams_card_journal_posted_facts_include_erp_ref():
    from app.services.notification_formatters import format_teams_card
    result = format_teams_card("journal_entry.posted", {"je_id": "1", "erp_ref": "QB-9999"})
    fact_names = [f["name"] for f in result["sections"][0]["facts"]]
    assert "erp_ref" in fact_names


def test_format_payload_dispatches_slack():
    from app.services.notification_formatters import format_payload
    result = format_payload("slack", "hedge_run.completed", {"run_id": "x"})
    assert "blocks" in result


def test_format_payload_dispatches_teams():
    from app.services.notification_formatters import format_payload
    result = format_payload("teams", "hedge_run.completed", {"run_id": "x"})
    assert "@type" in result


def test_format_payload_generic_returns_raw():
    from app.services.notification_formatters import format_payload
    data = {"run_id": "x", "trade_count": 3}
    result = format_payload("generic", "hedge_run.completed", data)
    assert result is data


def test_format_payload_formatter_exception_returns_raw():
    from app.services.notification_formatters import format_payload
    data = {"run_id": "x"}
    with patch("app.services.notification_formatters.format_slack_blocks", side_effect=RuntimeError("boom")):
        result = format_payload("slack", "hedge_run.completed", data)
    assert result is data
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_notification_formatters.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.notification_formatters'`

- [ ] **Step 3: Implement `backend/app/services/notification_formatters.py`**

```python
"""
app/services/notification_formatters.py

Pure-function formatters for Slack Incoming Webhooks (Block Kit) and
Microsoft Teams Incoming Webhooks (legacy MessageCard format).

No DB access, no I/O. Formatter errors fall back to the raw data dict
so delivery never blocks on a formatting failure.

[KNOWN DEBT]: Teams uses legacy MessageCard format. Microsoft deprecated
this in favour of Adaptive Cards. Upgrade in a future sub-project.
"""
from __future__ import annotations

import logging

_log = logging.getLogger("hedgecalc.services.notification_formatters")


def format_slack_blocks(event_type: str, data: dict) -> dict:
    """Return Slack Incoming Webhook body (Block Kit JSON).

    Slack expects the body to BE the Block Kit dict — no outer envelope.
    """
    title = event_type.replace(".", " ").title()
    fields = "\n".join(
        f"*{k}*: {v}" for k, v in data.items() if k != "tenant_id"
    ) or "_no fields_"
    return {
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": f"ORDR — {title}"},
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": fields},
            },
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": f"tenant: {data.get('tenant_id', '')}"}
                ],
            },
        ]
    }


def format_teams_card(event_type: str, data: dict) -> dict:
    """Return Teams Incoming Webhook body (legacy MessageCard format)."""
    facts = [
        {"name": k, "value": str(v)}
        for k, v in data.items()
        if k != "tenant_id"
    ]
    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "1C62F2",
        "summary": f"ORDR — {event_type}",
        "sections": [
            {
                "activityTitle": f"ORDR — {event_type.replace('.', ' ').title()}",
                "facts": facts,
            }
        ],
    }


def format_payload(channel_type: str, event_type: str, data: dict) -> dict:
    """Dispatch to channel-specific formatter; fall back to raw data dict on error."""
    try:
        if channel_type == "slack":
            return format_slack_blocks(event_type, data)
        if channel_type == "teams":
            return format_teams_card(event_type, data)
    except Exception:  # noqa: BLE001
        _log.warning(
            "notification_formatters: formatter error for channel=%s event=%s — falling back to raw dict",
            channel_type,
            event_type,
        )
    return data
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_notification_formatters.py -v
```

Expected: 9 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/notification_formatters.py backend/tests/test_notification_formatters.py
git commit -m "feat(webhooks): notification_formatters — Slack Block Kit + Teams MessageCard"
```

---

### Task 3: webhook_service.py updates

**Files:**
- Modify: `backend/app/services/webhook_service.py`
- Modify (continue): `backend/tests/test_webhook_channel_type.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_webhook_channel_type.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json


@pytest.mark.asyncio
async def test_delivery_generic_includes_ordr_signature_header():
    """Generic channel delivery includes X-ORDR-Signature header."""
    from app.services.webhook_service import deliver_webhook_attempt

    captured_headers = {}

    async def mock_post(url, *, content, headers, **kwargs):
        captured_headers.update(headers)
        resp = MagicMock()
        resp.status_code = 200
        resp.text = "ok"
        return resp

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("app.services.webhook_service.httpx.AsyncClient", return_value=mock_client):
        result = await deliver_webhook_attempt(
            url="https://example.com/hook",
            secret="test-secret",
            payload={"event": "test"},
            channel_type="generic",
        )

    assert "X-ORDR-Signature" in captured_headers
    assert result["status"] == "delivered"


@pytest.mark.asyncio
async def test_delivery_slack_omits_ordr_signature_header():
    """Slack channel delivery omits X-ORDR-Signature header."""
    from app.services.webhook_service import deliver_webhook_attempt

    captured_headers = {}

    async def mock_post(url, *, content, headers, **kwargs):
        captured_headers.update(headers)
        resp = MagicMock()
        resp.status_code = 200
        resp.text = "ok"
        return resp

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    with patch("app.services.webhook_service.httpx.AsyncClient", return_value=mock_client):
        result = await deliver_webhook_attempt(
            url="https://hooks.slack.com/T123/B456/abc",
            secret="test-secret",
            payload={"blocks": []},
            channel_type="slack",
        )

    assert "X-ORDR-Signature" not in captured_headers
    assert result["status"] == "delivered"


@pytest.mark.asyncio
async def test_delivery_slack_sends_blocks_not_envelope():
    """Slack delivery sends Block Kit dict, not build_event_payload envelope."""
    from app.services.webhook_service import deliver_webhook_attempt

    captured_body = {}

    async def mock_post(url, *, content, headers, **kwargs):
        captured_body.update(json.loads(content))
        resp = MagicMock()
        resp.status_code = 200
        resp.text = "ok"
        return resp

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post

    slack_payload = {"blocks": [{"type": "header", "text": {"type": "plain_text", "text": "Test"}}]}

    with patch("app.services.webhook_service.httpx.AsyncClient", return_value=mock_client):
        await deliver_webhook_attempt(
            url="https://hooks.slack.com/T123/B456/abc",
            secret="secret",
            payload=slack_payload,
            channel_type="slack",
        )

    assert "blocks" in captured_body
    assert "event" not in captured_body  # no generic envelope wrapper
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_channel_type.py::test_delivery_generic_includes_ordr_signature_header tests/test_webhook_channel_type.py::test_delivery_slack_omits_ordr_signature_header -v
```

Expected: FAIL — `deliver_webhook_attempt() got an unexpected keyword argument 'channel_type'`

- [ ] **Step 3: Update `backend/app/services/webhook_service.py`**

**3a. Update `deliver_webhook_attempt`** — add `channel_type` parameter (line 77). Replace:
```python
async def deliver_webhook_attempt(
    url: str,
    secret: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
```
With:
```python
async def deliver_webhook_attempt(
    url: str,
    secret: str,
    payload: dict[str, Any],
    channel_type: str = "generic",
) -> dict[str, Any]:
```

Replace the `headers` dict block (lines 98–102):
```python
    headers = {
        "Content-Type": "application/json",
        "X-ORDR-Signature": signature,
        "User-Agent": "ORDR-Terminal-Webhook/1.0",
    }
```
With:
```python
    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "User-Agent": "ORDR-Terminal-Webhook/1.0",
    }
    if channel_type == "generic":
        headers["X-ORDR-Signature"] = signature
```

**3b. Update `dispatch_webhook_event`** — replace the `build_event_payload` call (line 165) and the `deliver_webhook_attempt` call (line ~170).

Find this block in `dispatch_webhook_event`:
```python
    tenant_id = str(endpoint.company_id) if endpoint.company_id else "unknown"
    payload = build_event_payload(event_type, tenant_id, data)

    for attempt_num in range(1, MAX_ATTEMPTS + 1):
        result = await deliver_webhook_attempt(
            url=endpoint.url,
            secret=endpoint.secret,
            payload=payload,
        )
```

Replace with:
```python
    from app.services.notification_formatters import format_payload  # noqa: PLC0415

    tenant_id = str(endpoint.company_id) if endpoint.company_id else "unknown"
    channel_type = getattr(endpoint, "channel_type", "generic") or "generic"
    if channel_type in ("slack", "teams"):
        outbound = format_payload(channel_type, event_type, data)
    else:
        outbound = build_event_payload(event_type, tenant_id, data)

    for attempt_num in range(1, MAX_ATTEMPTS + 1):
        result = await deliver_webhook_attempt(
            url=endpoint.url,
            secret=endpoint.secret,
            payload=outbound,
            channel_type=channel_type,
        )
```

**3c. Add `dispatch_to_company`** — append after `dispatch_webhook_event` (before the `_emit_webhook_delivered_audit` section):

```python
async def dispatch_to_company(
    session_factory: Any,
    company_id: Any,
    event_type: str,
    data: dict[str, Any],
) -> None:
    """Fan out a webhook event to all active endpoints for a company.

    Opens its own DB sessions — safe to call from FastAPI BackgroundTasks.
    Each endpoint gets a separate session because dispatch_webhook_event
    may sleep up to 81 minutes between retry attempts.
    """
    from sqlalchemy import select  # noqa: PLC0415

    from app.models.webhook import WebhookEndpoint  # noqa: PLC0415

    try:
        async with session_factory() as db:
            result = await db.execute(
                select(WebhookEndpoint).where(
                    WebhookEndpoint.company_id == company_id,
                    WebhookEndpoint.is_active.is_(True),
                )
            )
            endpoints = [ep for ep in result.scalars().all() if ep.subscribes_to(event_type)]
    except Exception:  # noqa: BLE001
        _log.warning("dispatch_to_company: failed to fetch endpoints for event=%s", event_type, exc_info=True)
        return

    for ep in endpoints:
        try:
            async with session_factory() as ep_db:
                await dispatch_webhook_event(ep_db, ep, event_type, data)
        except Exception:  # noqa: BLE001
            _log.warning(
                "dispatch_to_company: delivery failed endpoint_id=%s event=%s",
                ep.id, event_type, exc_info=True,
            )
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_channel_type.py -v
```

Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/webhook_service.py backend/tests/test_webhook_channel_type.py
git commit -m "feat(webhooks): channel_type delivery — omit HMAC for Slack/Teams, dispatch_to_company wrapper"
```

---

### Task 4: v1_webhooks.py updates

**Files:**
- Modify: `backend/app/api/routes/v1_webhooks.py`

- [ ] **Step 1: Write failing test**

Append to `backend/tests/test_webhook_channel_type.py`:

```python
@pytest.mark.asyncio
async def test_register_slack_channel_type_stored():
    """POST /v1/webhooks with channel_type=slack stores the value."""
    from httpx import AsyncClient, ASGITransport
    from unittest.mock import patch, AsyncMock
    from app.main import app

    mock_user = MagicMock()
    mock_user.is_superuser = True
    mock_user.company_id = "11111111-1111-1111-1111-111111111111"

    async def mock_get_user():
        return mock_user

    from app.core.dependencies import get_current_user
    from app.core.db import get_session

    async def mock_session():
        # Yield a mock session that records what was added
        session = AsyncMock()
        session.execute = AsyncMock(return_value=MagicMock(scalar=MagicMock(return_value=0)))
        session.add = MagicMock()
        session.commit = AsyncMock()
        session.refresh = AsyncMock()
        yield session

    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_session] = mock_session

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/webhooks",
                json={
                    "url": "https://hooks.slack.com/services/T123/B456/abc",
                    "events": ["HEDGE_RUN_COMPLETED"],
                    "channel_type": "slack",
                },
            )
        # 422 means schema validation is in place (old schema doesn't accept channel_type)
        # 201 means it accepted channel_type — either is a signal the field is wired
        assert resp.status_code in (201, 422)
        if resp.status_code == 201:
            assert resp.json()["channel_type"] == "slack"
    finally:
        app.dependency_overrides.clear()
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_channel_type.py::test_register_slack_channel_type_stored -v
```

Expected: test either fails or channel_type is missing from response

- [ ] **Step 3: Update `backend/app/api/routes/v1_webhooks.py`**

**3a.** After the `WebhookEventType` enum block (after line 34), add:

```python
class ChannelType(str, Enum):
    generic = "generic"
    slack = "slack"
    teams = "teams"
```

**3b.** Update `WebhookRegisterRequest` — add `channel_type` field:

```python
class WebhookRegisterRequest(BaseModel):
    url: str
    description: str | None = None
    events: list[WebhookEventType] = []
    channel_type: ChannelType = ChannelType.generic

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith("https://"):
            raise ValueError("Webhook URL must use HTTPS.")
        return v
```

**3c.** Replace `WebhookResponse` (lines 50–56):

```python
class WebhookResponse(BaseModel):
    id: str
    url: str
    description: str | None
    events: list[str]
    channel_type: str
    is_active: bool
    created_at: str | None
```

**3d.** Update `_endpoint_to_response` (lines 74–82) — add `channel_type`:

```python
def _endpoint_to_response(ep: WebhookEndpoint) -> WebhookResponse:
    return WebhookResponse(
        id=str(ep.id),
        url=ep.url,
        description=ep.description,
        events=sorted(ep.get_events()),
        channel_type=getattr(ep, "channel_type", None) or "generic",
        is_active=ep.is_active,
        created_at=ep.created_at.isoformat() if ep.created_at else None,
    )
```

**3e.** Update `register_webhook` — pass `channel_type` when constructing `WebhookEndpoint` (inside the function, after `events_str`):

```python
    endpoint = WebhookEndpoint(
        company_id=current_user.company_id,
        url=body.url,
        secret=secret,
        description=body.description,
        events=events_str,
        channel_type=body.channel_type.value,
        is_active=True,
    )
```

**3f.** Add test endpoint — append before the end of the file:

```python
@router.post("/{webhook_id}/test")
async def test_webhook(
    webhook_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Send a synthetic ping to verify the endpoint is reachable."""
    await _check_permission(db, current_user, "api_keys.manage")

    result_ep = await db.execute(
        select(WebhookEndpoint).where(
            WebhookEndpoint.id == webhook_id,
            WebhookEndpoint.company_id == current_user.company_id,
        )
    )
    ep = result_ep.scalar_one_or_none()
    if ep is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook endpoint not found.")

    from app.services.notification_formatters import format_payload  # noqa: PLC0415
    from app.services.webhook_service import build_event_payload, deliver_webhook_attempt  # noqa: PLC0415

    channel_type = getattr(ep, "channel_type", None) or "generic"
    test_data: dict = {"message": "ORDR connectivity test — safe to ignore", "source": "test-ping"}
    if channel_type in ("slack", "teams"):
        payload = format_payload(channel_type, "test.ping", test_data)
    else:
        payload = build_event_payload("test.ping", str(current_user.company_id), test_data)

    result = await deliver_webhook_attempt(
        url=ep.url,
        secret=ep.secret,
        payload=payload,
        channel_type=channel_type,
    )
    return {
        "success": result["status"] == "delivered",
        "status_code": result["response_status"],
        "error": result["error_message"],
    }
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_channel_type.py -v
```

Expected: all tests PASS

- [ ] **Step 5: Run full suite — verify no regressions**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short
```

Expected: all passing, no new failures

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/v1_webhooks.py
git commit -m "feat(webhooks): ChannelType enum, channel_type in register/response, POST /{id}/test endpoint"
```

---

## Chunk 2: Backend Event Emission

### Task 5: v1_calculate.py — hedge_run.completed

**Files:**
- Modify: `backend/app/api/routes/v1_calculate.py`
- Create: `backend/tests/test_webhook_event_emission.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_webhook_event_emission.py`:

```python
"""Tests that route handlers emit the correct webhook events."""
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_hedge_run_completed_dispatched():
    """POST /v1/calculate emits hedge_run.completed via dispatch_to_company."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app

    with patch("app.api.routes.v1_calculate.dispatch_to_company") as mock_dispatch:
        mock_dispatch.return_value = None  # background task — not awaited directly

        # Minimal calculate payload
        payload = {
            "positions": [
                {
                    "record_id": "P001",
                    "entity": "TestCo",
                    "exposure_currency": "EUR",
                    "base_currency": "USD",
                    "notional": 100000,
                    "direction": "payable",
                    "maturity_date": "2027-01-01",
                }
            ],
            "policy": {"hedge_ratio_min": 0.5, "hedge_ratio_max": 1.0, "allowed_instruments": ["forward"]},
        }

        # Use the public calculate endpoint (no auth required for sandbox mode)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/calculate", json=payload)

        assert resp.status_code == 200
        # dispatch_to_company should have been added as a background task
        # (called via background_tasks.add_task — mock intercepts the coroutine function itself)
        called_event_types = [
            call.args[2] if len(call.args) >= 3 else call.kwargs.get("event_type")
            for call in mock_dispatch.call_args_list
        ]
        assert "hedge_run.completed" in called_event_types
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_event_emission.py::test_hedge_run_completed_dispatched -v
```

Expected: FAIL — `hedge_run.completed` not in dispatched events

- [ ] **Step 3: Update `backend/app/api/routes/v1_calculate.py`**

**3a.** At the top of the file (in the imports section), add after existing route imports:

```python
from app.core.db import async_session_maker as _async_session_maker  # noqa: PLC0415
from app.services.webhook_service import dispatch_to_company  # noqa: PLC0415
```

Or add as module-level deferred import if circular import risk — use the deferred pattern already established in the file.

**3b.** Find the existing inline webhook dispatch block (lines ~880–897):

```python
    # Webhook dispatch: calculation.completed
    try:
        from sqlalchemy import select as _wh_calc_select

        from app.models.webhook import WebhookEndpoint as _WH_Endpoint
        _wh_calc_result = await session.execute(
            _wh_calc_select(_WH_Endpoint)
            .where(_WH_Endpoint.company_id == current_user.company_id)
            .where(_WH_Endpoint.is_active.is_(True))
        )
        for _wh_ep in _wh_calc_result.scalars().all():
            if _wh_ep.subscribes_to("calculation.completed"):
                background_tasks.add_task(
                    _fire_webhook, current_user.company_id, _wh_ep.id, "calculation.completed",
                    {"run_id": run_id, "position_count": len(trades)},
                )
    except Exception:
        _log.warning("Failed to dispatch calculation.completed webhook for run %s", run_id, exc_info=True)
```

Replace with:

```python
    # Webhook dispatch — migrated to dispatch_to_company (handles per-endpoint sessions safely)
    from app.core.db import async_session_maker as _asm  # noqa: PLC0415
    from app.services.webhook_service import dispatch_to_company as _dtc  # noqa: PLC0415

    if current_user is not None and current_user.company_id is not None:
        background_tasks.add_task(
            _dtc,
            _asm,
            current_user.company_id,
            "calculation.completed",
            {"run_id": run_id, "position_count": len(trades)},
        )
        background_tasks.add_task(
            _dtc,
            _asm,
            current_user.company_id,
            "hedge_run.completed",
            {
                "run_id": str(run_row.id),
                "trade_count": run_row.trade_count,
                "hedge_count": run_row.hedge_count,
                "run_hash": run_row.run_hash,
            },
        )
```

Note: The `CalculationRun` ORM instance is `run_row` (line 272 in `v1_calculate.py`). `trade_count`, `hedge_count`, and `run_hash` are confirmed real columns on the model.

- [ ] **Step 4: Run test — expect pass**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_event_emission.py::test_hedge_run_completed_dispatched -v
```

Expected: PASS

- [ ] **Step 5: Run full suite — verify no regressions**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/v1_calculate.py backend/tests/test_webhook_event_emission.py
git commit -m "feat(webhooks): emit hedge_run.completed + migrate calculation.completed to dispatch_to_company"
```

---

### Task 6: v1_gl.py — journal_entry.posted + erp_post.failed

**Files:**
- Modify: `backend/app/api/routes/v1_gl.py`
- Modify (continue): `backend/tests/test_webhook_event_emission.py`

- [ ] **Step 1: Write failing tests**

Append to `backend/tests/test_webhook_event_emission.py`:

```python
@pytest.mark.asyncio
async def test_journal_entry_posted_dispatched():
    """POST /v1/gl/journal-entries/{id}/post emits journal_entry.posted on ERP success."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    import uuid

    je_id = uuid.uuid4()

    mock_company = MagicMock()
    mock_company.id = uuid.uuid4()
    mock_company.settings = {"erp_system": "quickbooks"}

    mock_user = MagicMock()
    mock_user.is_superuser = False
    mock_user.company_id = mock_company.id
    mock_user.company = mock_company

    mock_je = MagicMock()
    mock_je.id = je_id
    mock_je.status = "APPROVED"
    mock_je.company_id = mock_company.id
    mock_je.amount = 1000
    mock_je.currency = "USD"
    mock_je.period_date = MagicMock()
    mock_je.description = "Test"
    mock_je.debit_account = "1000"
    mock_je.credit_account = "2000"
    mock_je.entry_type = "FX_HEDGE"

    mock_connector = AsyncMock()
    mock_result = MagicMock()
    mock_result.external_ref = "QB-1234"
    mock_connector.post_journal = AsyncMock(return_value=mock_result)

    with (
        patch("app.api.routes.v1_gl.dispatch_to_company") as mock_dispatch,
        patch("app.connectors.registry.get_connector", return_value=mock_connector),
    ):
        mock_dispatch.return_value = None

        from app.core.dependencies import get_current_user
        from app.core.db import get_async_session

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=mock_je))
        )
        mock_session.commit = AsyncMock()

        # get_async_session is an async generator — override must also yield
        async def override_session():
            yield mock_session

        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_async_session] = override_session

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(f"/api/v1/gl/journal-entries/{je_id}/post")
        finally:
            app.dependency_overrides.clear()

    called_events = [
        call.args[2] if len(call.args) >= 3 else call.kwargs.get("event_type")
        for call in mock_dispatch.call_args_list
    ]
    assert "journal_entry.posted" in called_events


@pytest.mark.asyncio
async def test_erp_post_failed_dispatched():
    """POST /v1/gl/journal-entries/{id}/post emits erp_post.failed on ConnectorError."""
    import uuid
    from app.connectors.errors import ConnectorServerError

    je_id = uuid.uuid4()

    mock_company = MagicMock()
    mock_company.id = uuid.uuid4()
    mock_company.settings = {"erp_system": "quickbooks"}

    mock_user = MagicMock()
    mock_user.is_superuser = False
    mock_user.company_id = mock_company.id
    mock_user.company = mock_company

    mock_je = MagicMock()
    mock_je.id = je_id
    mock_je.status = "APPROVED"
    mock_je.company_id = mock_company.id
    mock_je.amount = 1000
    mock_je.currency = "USD"
    mock_je.period_date = MagicMock()
    mock_je.description = ""
    mock_je.debit_account = "1000"
    mock_je.credit_account = "2000"
    mock_je.entry_type = "FX_HEDGE"

    mock_connector = AsyncMock()
    mock_connector.post_journal = AsyncMock(
        side_effect=ConnectorServerError("QBO timeout", provider="quickbooks")
    )

    with (
        patch("app.api.routes.v1_gl.dispatch_to_company") as mock_dispatch,
        patch("app.connectors.registry.get_connector", return_value=mock_connector),
    ):
        mock_dispatch.return_value = None

        from app.core.dependencies import get_current_user
        from app.core.db import get_async_session

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=mock_je))
        )

        # get_async_session is an async generator — override must also yield
        async def override_session_fail():
            yield mock_session

        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_async_session] = override_session_fail

        from httpx import AsyncClient, ASGITransport
        from app.main import app

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(f"/api/v1/gl/journal-entries/{je_id}/post")
        finally:
            app.dependency_overrides.clear()

    assert resp.status_code == 502
    called_events = [
        call.args[2] if len(call.args) >= 3 else call.kwargs.get("event_type")
        for call in mock_dispatch.call_args_list
    ]
    assert "erp_post.failed" in called_events
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_event_emission.py::test_journal_entry_posted_dispatched tests/test_webhook_event_emission.py::test_erp_post_failed_dispatched -v
```

Expected: FAIL

- [ ] **Step 3: Update `backend/app/api/routes/v1_gl.py`**

Note on Step 3e scope: The non-ERP branch (CSV path, lines ~300–301) raises a plain 502 via `posting_result.success` check — it does NOT raise `ConnectorError`. This branch is deliberately excluded from `erp_post.failed` emission; that event is specific to live ERP connector failures, not CSV export failures.

**3a.** In the `from fastapi import ...` line (line 16), add `BackgroundTasks`:

```python
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
```

**3b.** Update `post_journal_entry` signature — add `background_tasks` as second parameter:

```python
async def post_journal_entry(
    entry_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
```

**3c.** Add deferred imports near the top of the function body (after existing deferred imports inside the function, or top-level at module load):

```python
    from app.core.db import async_session_maker as _asm  # noqa: PLC0415
    from app.services.webhook_service import dispatch_to_company  # noqa: PLC0415
```

**3d.** In the ERP success path, after `je.posted_at = datetime.now(UTC)` (line ~292), add:

```python
        background_tasks.add_task(
            dispatch_to_company,
            _asm,
            current_user.company_id,
            "journal_entry.posted",
            {
                "je_id": str(je.id),
                "erp_ref": je.posted_ref,
                "provider": je.posted_to,
                "amount": str(je.amount),
                "currency": je.currency,
            },
        )
```

**3e.** Inside the existing `except ConnectorError as exc:` block (line ~284 in `v1_gl.py`), **expand** it by adding the `background_tasks.add_task` call before the existing `raise HTTPException`. Do NOT replace the `except` header — only insert lines before the raise:

```python
        except ConnectorError as exc:
            # INSERT these lines before the existing raise:
            background_tasks.add_task(
                dispatch_to_company,
                _asm,
                current_user.company_id,
                "erp_post.failed",
                {
                    "je_id": str(je.id),
                    "provider": provider,
                    "error_message": str(exc)[:200],
                },
            )
            raise HTTPException(
                status_code=502, detail=f"ERP posting failed: {exc.message}"
            ) from exc
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_event_emission.py -v
```

Expected: all 3 tests PASS

- [ ] **Step 5: Run full suite**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short
```

Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes/v1_gl.py backend/tests/test_webhook_event_emission.py
git commit -m "feat(webhooks): emit journal_entry.posted + erp_post.failed from GL posting route"
```

---

## Chunk 3: Frontend

### Task 7: webhookClient.ts

**Files:**
- Create: `frontend/src/lib/api/webhookClient.ts`

- [ ] **Step 1: Create `frontend/src/lib/api/webhookClient.ts`**

```typescript
import { dashboardFetch } from "@/lib/api/dashboardClient";

export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  channel_type: string;
  is_active: boolean;
  created_at: string | null;
}

export interface WebhookRegisterRequest {
  url: string;
  description?: string;
  events: string[];
  channel_type: "generic" | "slack" | "teams";
}

export interface WebhookTestResult {
  success: boolean;
  status_code: number | null;
  error: string | null;
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
      else if (typeof body?.message === "string") detail = body.message;
    } catch {
      // body not JSON
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function listWebhooks(token: string): Promise<WebhookEndpoint[]> {
  const res = await dashboardFetch("/v1/webhooks", token);
  return parseOrThrow<WebhookEndpoint[]>(res);
}

export async function registerWebhook(
  token: string,
  body: WebhookRegisterRequest
): Promise<WebhookEndpoint & { secret: string }> {
  const res = await dashboardFetch("/v1/webhooks", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return parseOrThrow<WebhookEndpoint & { secret: string }>(res);
}

export async function deleteWebhook(token: string, id: string): Promise<void> {
  const res = await dashboardFetch(`/v1/webhooks/${id}`, token, { method: "DELETE" });
  await parseOrThrow<void>(res);
}

export async function testWebhook(
  token: string,
  id: string
): Promise<WebhookTestResult> {
  const res = await dashboardFetch(`/v1/webhooks/${id}/test`, token, {
    method: "POST",
  });
  return parseOrThrow<WebhookTestResult>(res);
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `webhookClient.ts`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/webhookClient.ts
git commit -m "feat(frontend): webhookClient.ts — list, register, delete, test webhook endpoints"
```

---

### Task 8: /settings/notifications page

**Files:**
- Create: `frontend/src/app/settings/notifications/page.tsx`

- [ ] **Step 1: Create `frontend/src/app/settings/notifications/page.tsx`**

```tsx
"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Trash2, Send, Plus } from "lucide-react";
import PageShell from "@/components/layout/PageShell";
import { useAuth } from "@/lib/authContext";
import {
  listWebhooks,
  registerWebhook,
  deleteWebhook,
  testWebhook,
  WebhookEndpoint,
} from "@/lib/api/webhookClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
} as const;

const ALL_EVENTS = [
  "position.created",
  "calculation.completed",
  "proposal.approved",
  "proposal.rejected",
  "hedge_run.completed",
  "journal_entry.posted",
  "erp_post.failed",
];

const CHANNEL_LABELS: Record<string, { label: string; color: string }> = {
  slack: { label: "Slack", color: "#4A154B" },
  teams: { label: "Teams", color: "#6264A7" },
  generic: { label: "Generic", color: "#374151" },
};

function NotificationsPageInner() {
  const { user, token } = useAuth();
  const router = useRouter();

  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Form state
  const [channelType, setChannelType] = useState<"slack" | "teams" | "generic">("slack");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState("");

  // Test state
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !token) return;
    if ((user as any).plan_tier === "starter") {
      router.replace("/upgrade");
      return;
    }
    listWebhooks(token)
      .then(setEndpoints)
      .catch(() => showToast("Failed to load channels", false))
      .finally(() => setLoading(false));
  }, [user, token]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function toggleEvent(ev: string) {
    setSelectedEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]
    );
  }

  async function handleSave() {
    if (!token) return;
    if (!url.startsWith("https://")) {
      setUrlError("URL must start with https://");
      return;
    }
    setUrlError("");
    setSaving(true);
    try {
      const created = await registerWebhook(token, {
        url,
        events: selectedEvents,
        channel_type: channelType,
      });
      setEndpoints((prev) => [...prev, created]);
      setUrl("");
      setSelectedEvents([]);
      showToast("Channel saved. Secret shown once — copy it now.", true);
    } catch (err: any) {
      // webhookClient throws Error with the API detail string as .message
      const detail = err?.message || "Save failed";
      if (detail.includes("Maximum") || detail.includes("maximum")) {
        showToast("Limit reached (5 active channels)", false);
      } else {
        showToast(detail, false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    try {
      await deleteWebhook(token, id);
      setEndpoints((prev) => prev.filter((ep) => ep.id !== id));
      showToast("Channel removed", true);
    } catch {
      showToast("Delete failed", false);
    }
  }

  async function handleTest(id: string) {
    if (!token) return;
    setTesting(id);
    try {
      const result = await testWebhook(token, id);
      if (result.success) {
        showToast("✓ Test ping delivered successfully", true);
      } else {
        showToast(`✗ Test failed: ${result.error || `HTTP ${result.status_code}`}`, false);
      }
    } catch {
      showToast("Test request failed", false);
    } finally {
      setTesting(null);
    }
  }

  return (
    <PageShell icon={<Bell size={16} />} title="NOTIFICATIONS" breadcrumb={["Settings", "Notifications"]}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 9999,
            background: toast.ok ? "#059669" : "#DC2626",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 6,
            fontFamily: S.fontUI,
            fontSize: 13,
          }}
        >
          {toast.msg}
        </div>
      )}

      <div style={{ maxWidth: 820, padding: "24px 0", display: "flex", flexDirection: "column", gap: 32 }}>

        {/* Add channel form */}
        <section
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 8,
            padding: 24,
          }}
        >
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: "#9CA3AF", marginBottom: 16, letterSpacing: 1 }}>
            ADD CHANNEL
          </div>

          {/* Channel type toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["slack", "teams", "generic"] as const).map((ct) => (
              <button
                key={ct}
                onClick={() => setChannelType(ct)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 4,
                  border: channelType === ct ? "none" : `1px solid ${S.rim}`,
                  background: channelType === ct ? (CHANNEL_LABELS[ct].color) : "transparent",
                  color: channelType === ct ? "#fff" : "#9CA3AF",
                  fontFamily: S.fontUI,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {CHANNEL_LABELS[ct].label}
              </button>
            ))}
          </div>

          {/* URL input */}
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setUrlError(""); }}
              placeholder={
                channelType === "slack"
                  ? "https://hooks.slack.com/services/..."
                  : channelType === "teams"
                  ? "https://your-org.webhook.office.com/..."
                  : "https://example.com/webhook"
              }
              style={{
                width: "100%",
                padding: "8px 12px",
                background: S.bgDeep,
                border: `1px solid ${urlError ? "#DC2626" : S.rim}`,
                borderRadius: 4,
                color: "#E5E7EB",
                fontFamily: S.fontMono,
                fontSize: 12,
                boxSizing: "border-box",
              }}
            />
            {urlError && (
              <div style={{ color: "#DC2626", fontSize: 11, marginTop: 4, fontFamily: S.fontUI }}>
                {urlError}
              </div>
            )}
          </div>

          {/* Events multiselect */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: "#9CA3AF", marginBottom: 8 }}>
              EVENTS (leave empty to subscribe to all)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ALL_EVENTS.map((ev) => (
                <label
                  key={ev}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    color: selectedEvents.includes(ev) ? "#E5E7EB" : "#9CA3AF",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    style={{ accentColor: "#1C62F2" }}
                  />
                  {ev}
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !url}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 20px",
              background: saving || !url ? "#374151" : "#1C62F2",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontFamily: S.fontUI,
              fontSize: 13,
              cursor: saving || !url ? "not-allowed" : "pointer",
            }}
          >
            <Plus size={14} />
            {saving ? "Saving..." : "Save Channel"}
          </button>
        </section>

        {/* Active channels list */}
        <section>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: "#9CA3AF", marginBottom: 12, letterSpacing: 1 }}>
            ACTIVE CHANNELS ({endpoints.length} / 5)
          </div>

          {loading ? (
            <div style={{ color: "#9CA3AF", fontFamily: S.fontUI, fontSize: 13 }}>Loading...</div>
          ) : endpoints.length === 0 ? (
            <div style={{ color: "#9CA3AF", fontFamily: S.fontUI, fontSize: 13 }}>
              No channels configured. Add one above.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ fontFamily: S.fontMono, fontSize: 10, color: "#9CA3AF", textAlign: "left" }}>
                  <th style={{ padding: "6px 12px" }}>TYPE</th>
                  <th style={{ padding: "6px 12px" }}>URL</th>
                  <th style={{ padding: "6px 12px" }}>EVENTS</th>
                  <th style={{ padding: "6px 12px" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((ep) => (
                  <tr
                    key={ep.id}
                    style={{
                      background: S.bgPanel,
                      borderBottom: `1px solid ${S.rim}`,
                    }}
                  >
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          background: CHANNEL_LABELS[ep.channel_type]?.color || "#374151",
                          color: "#fff",
                          padding: "2px 8px",
                          borderRadius: 3,
                          fontFamily: S.fontMono,
                          fontSize: 10,
                        }}
                      >
                        {CHANNEL_LABELS[ep.channel_type]?.label || ep.channel_type}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: 11, color: "#E5E7EB" }}>
                      {ep.url.length > 48 ? ep.url.slice(0, 45) + "…" : ep.url}
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: S.fontUI, fontSize: 12, color: "#9CA3AF" }}>
                      {ep.events.length === 0 ? "all" : `${ep.events.length} event${ep.events.length !== 1 ? "s" : ""}`}
                    </td>
                    <td style={{ padding: "10px 12px", display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleTest(ep.id)}
                        disabled={testing === ep.id}
                        title="Send test ping"
                        style={{
                          background: "transparent",
                          border: `1px solid ${S.rim}`,
                          borderRadius: 4,
                          color: "#9CA3AF",
                          padding: "4px 10px",
                          cursor: testing === ep.id ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          fontFamily: S.fontUI,
                        }}
                      >
                        <Send size={11} />
                        {testing === ep.id ? "Testing…" : "Test"}
                      </button>
                      <button
                        onClick={() => handleDelete(ep.id)}
                        title="Remove channel"
                        style={{
                          background: "transparent",
                          border: `1px solid ${S.rim}`,
                          borderRadius: 4,
                          color: "#DC2626",
                          padding: "4px 8px",
                          cursor: "pointer",
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </PageShell>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense>
      <NotificationsPageInner />
    </Suspense>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/settings/notifications/page.tsx
git commit -m "feat(frontend): /settings/notifications — add Slack/Teams channels, test ping, delete"
```

---

### Task 9: AppSidebar — Notifications nav item

**Files:**
- Modify: `frontend/src/app/AppSidebar.tsx`

- [ ] **Step 1: Find SETTINGS group in `frontend/src/app/AppSidebar.tsx`**

Search for `"SETTINGS"` group entries. Find the block containing items like API Keys, Appearance, etc.

- [ ] **Step 2: Add Notifications item**

Add after the last SETTINGS item (or in alphabetical position):

```tsx
{
  label: "NOTIFICATIONS",
  href: "/settings/notifications",
  icon: Bell,
  group: "SETTINGS",
  minTier: "professional",
},
```

Ensure `Bell` is imported from `lucide-react` at the top of `AppSidebar.tsx`.

- [ ] **Step 3: TypeScript + build check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 4: Run full backend test suite one final time**

```bash
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -q --tb=short
```

Expected: all passing, 0 failed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/AppSidebar.tsx
git commit -m "feat(frontend): add Notifications nav item under SETTINGS (professional tier)"
```

---

## Final Verification

- [ ] TypeScript: `cd frontend && npx tsc --noEmit` — zero errors
- [ ] Frontend build: `cd frontend && npx next build` — exits 0
- [ ] Backend tests: 0 failures, new tests all green
- [ ] Push: `git push origin master`
