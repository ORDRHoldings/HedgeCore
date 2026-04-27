# Sub-project B: Slack/Teams Notifications

**Date**: 2026-04-27
**Status**: Approved
**Scope**: Extend existing webhook infrastructure with Slack/Teams formatted delivery + 3 new hedge events + notifications settings UI

---

## Context

The outbound webhook system (`webhook_service.py`, `v1_webhooks.py`, `WebhookEndpoint` model) is fully built with HMAC-SHA256 signing (`X-ORDR-Signature` header), retry (up to 5 attempts with `asyncio.sleep` between), and delivery log. `SUPPORTED_EVENTS` is a Python `set[str]` constant (not a DB constraint). `events` on `WebhookEndpoint` is `Column(String(512))` — comma-separated event names; `endpoint.subscribes_to(event_type)` returns `True` if empty (all events) or if the event name is in the split list. `WebhookEventType` enum in `v1_webhooks.py` is dynamically generated from `SUPPORTED_EVENTS` at module load time — expanding the set is sufficient to add new enum values.

**Gap 1 — No channel-aware formatting.** `deliver_webhook_attempt` sends whichever dict it receives. Slack Incoming Webhooks expect a Block Kit JSON body (not an envelope); Teams expects an Adaptive Card body. Sending a generic envelope produces unformatted fallback text.

**Gap 2 — Missing hedge events.** `hedge_run.completed`, `journal_entry.posted`, and `erp_post.failed` are high-signal treasury events with no webhook emission.

**Gap 3 — No dispatch wrapper.** The existing `dispatch_webhook_event(db, endpoint, event_type, data)` delivers to a single `WebhookEndpoint` instance. No function fans out to all matching active endpoints for a company. Every emission point must replicate the query — or a shared wrapper is added.

**Gap 4 — No frontend settings UI.** There is no page for admins to register Slack/Teams channels.

---

## Architecture

### Data Flow

```
Admin saves Slack URL in /settings/notifications
  → POST /v1/webhooks {url, events, channel_type: "slack"}
  → WebhookEndpoint row created (channel_type="slack")

Calculation completes → v1_calculate.py
  → background_tasks.add_task(dispatch_to_company, async_session_maker,
        current_user.company_id, "hedge_run.completed", {...})
    [after response sent, BackgroundTask runs:]
    → dispatch_to_company opens its own session
    → queries all active WebhookEndpoints for company where subscribes_to("hedge_run.completed")
    → for each endpoint:
        if channel_type in ("slack", "teams"):
            payload = format_payload(channel_type, event_type, data)  ← raw Block Kit / Adaptive Card
        else:
            payload = build_event_payload(event_type, tenant_id, data)  ← standard envelope
        deliver_webhook_attempt(url, secret, payload, channel_type)
        [X-ORDR-Signature header omitted for slack/teams; Slack/Teams do not verify HMAC]
        WebhookDeliveryLog row written; retry up to 5× on non-2xx

GL entry posted to ERP → v1_gl.py
  → background_tasks.add_task(dispatch_to_company, ..., "journal_entry.posted", {...})
  [BackgroundTask runs after response]

ERP post fails → v1_gl.py (inside except ConnectorError block, before re-raise)
  → background_tasks.add_task(dispatch_to_company, ..., "erp_post.failed", {...})
  → raise HTTPException(502, ...)
```

---

## Components

### Backend

#### 1. `backend/app/models/webhook.py`

Add 3 new event names to `SUPPORTED_EVENTS` and a `CHANNEL_TYPES` constant:

```python
SUPPORTED_EVENTS: set[str] = {
    "position.created",
    "calculation.completed",
    "proposal.approved",
    "proposal.rejected",
    "hedge_run.completed",       # NEW
    "journal_entry.posted",      # NEW
    "erp_post.failed",           # NEW
}

CHANNEL_TYPES: set[str] = {"generic", "slack", "teams"}
```

Add `channel_type` column to `WebhookEndpoint`:

```python
channel_type = Column(String(16), nullable=False, server_default="generic")
```

#### 2. Alembic migration

Single `ADD COLUMN` — `SUPPORTED_EVENTS` expansion requires no migration (Python constant):

```sql
ALTER TABLE webhook_endpoints
  ADD COLUMN IF NOT EXISTS channel_type VARCHAR(16) NOT NULL DEFAULT 'generic';
```

#### 3. `backend/app/services/notification_formatters.py` *(new)*

Pure-function module. No DB access, no I/O. Formatter errors fall back to raw dict so delivery never blocks.

```python
def format_slack_blocks(event_type: str, data: dict) -> dict:
    """Return Slack Incoming Webhook body (Block Kit JSON).
    Slack expects the body to BE the Block Kit dict — no outer envelope.
    """
    title = event_type.replace(".", " ").title()
    fields = [f"*{k}*: {v}" for k, v in data.items() if k != "tenant_id"]
    return {
        "blocks": [
            {"type": "header", "text": {"type": "plain_text", "text": f"ORDR — {title}"}},
            {"type": "section", "text": {"type": "mrkdwn", "text": "\n".join(fields) or "_no fields_"}},
            {"type": "context", "elements": [{"type": "mrkdwn", "text": f"tenant: {data.get('tenant_id', '')}"}]},
        ]
    }

def format_teams_card(event_type: str, data: dict) -> dict:
    """Return Teams Incoming Webhook body (Adaptive Card via legacy MessageCard)."""
    facts = [{"name": k, "value": str(v)} for k, v in data.items() if k != "tenant_id"]
    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "1C62F2",
        "summary": f"ORDR — {event_type}",
        "sections": [{"activityTitle": f"ORDR — {event_type.replace('.', ' ').title()}", "facts": facts}],
    }

def format_payload(channel_type: str, event_type: str, data: dict) -> dict:
    """Dispatch to channel formatter; fall back to raw data dict on any error."""
    try:
        if channel_type == "slack":
            return format_slack_blocks(event_type, data)
        if channel_type == "teams":
            return format_teams_card(event_type, data)
    except Exception:  # noqa: BLE001
        pass
    return data
```

#### 4. `backend/app/services/webhook_service.py`

**4a. Update `deliver_webhook_attempt`** — add `channel_type` parameter; omit `X-ORDR-Signature` for `slack`/`teams`:

```python
async def deliver_webhook_attempt(
    url: str,
    secret: str,
    payload: dict[str, Any],
    channel_type: str = "generic",
) -> dict[str, Any]:
    payload_json = json.dumps(payload, default=str)
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "ORDR-Terminal-Webhook/1.0",
    }
    if channel_type == "generic":
        headers["X-ORDR-Signature"] = compute_signature(secret, payload_json)
    # ... rest unchanged
```

**4b. Update `dispatch_webhook_event`** — select payload format based on `endpoint.channel_type` before delivery:

```python
# Inside dispatch_webhook_event, replace the build_event_payload call:
from app.services.notification_formatters import format_payload

if endpoint.channel_type in ("slack", "teams"):
    outbound = format_payload(endpoint.channel_type, event_type, data)
else:
    outbound = build_event_payload(event_type, tenant_id, data)

# then: result = await deliver_webhook_attempt(
#     url=endpoint.url, secret=endpoint.secret,
#     payload=outbound, channel_type=endpoint.channel_type,
# )
```

**4c. Add `dispatch_to_company` wrapper** — new public function that fan-outs to all matching endpoints for a company. Uses its own session (safe to call from `BackgroundTasks`):

```python
async def dispatch_to_company(
    session_factory: Any,   # async_session_maker from app.core.db
    company_id: Any,        # uuid.UUID
    event_type: str,
    data: dict[str, Any],
) -> None:
    """Fan out a webhook event to all active endpoints for a company.

    Opens its own DB session — safe to use as a BackgroundTask after
    the request session has been closed. In-process retry (asyncio.sleep)
    means a background task may run for up to 81 minutes on 5 failed
    attempts; this is acceptable for v1 fire-and-forget semantics.
    """
    from sqlalchemy import select
    from app.models.webhook import WebhookEndpoint

    async with session_factory() as db:
        result = await db.execute(
            select(WebhookEndpoint).where(
                WebhookEndpoint.company_id == company_id,
                WebhookEndpoint.is_active.is_(True),
            )
        )
        endpoints = result.scalars().all()
        for ep in endpoints:
            if ep.subscribes_to(event_type):
                await dispatch_webhook_event(db, ep, event_type, data)
```

#### 5. `backend/app/api/routes/v1_webhooks.py`

**5a.** Add `ChannelType` enum and `channel_type` field to `WebhookRegisterRequest`:

```python
class ChannelType(str, Enum):
    generic = "generic"
    slack = "slack"
    teams = "teams"

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

**5b.** Add `channel_type` to `WebhookResponse` and update `_endpoint_to_response` helper:

```python
class WebhookResponse(BaseModel):
    id: str
    url: str
    description: str | None
    events: list[str]
    channel_type: str        # NEW
    is_active: bool
    created_at: str

# In _endpoint_to_response():
    channel_type=ep.channel_type or "generic",   # NEW field
```

**5c.** Add test endpoint — calls `deliver_webhook_attempt` directly (bypasses `dispatch_webhook_event` pipeline; does NOT add `test.ping` to `SUPPORTED_EVENTS`):

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
        raise HTTPException(status_code=404, detail="Webhook endpoint not found.")

    from app.services.webhook_service import deliver_webhook_attempt
    from app.services.notification_formatters import format_payload

    test_data = {"message": "ORDR connectivity test — safe to ignore", "source": "test-ping"}
    if ep.channel_type in ("slack", "teams"):
        payload = format_payload(ep.channel_type, "test.ping", test_data)
    else:
        from app.services.webhook_service import build_event_payload
        payload = build_event_payload("test.ping", str(current_user.company_id), test_data)

    result = await deliver_webhook_attempt(
        url=ep.url, secret=ep.secret, payload=payload, channel_type=ep.channel_type,
    )
    return {
        "success": result["status"] == "delivered",
        "status_code": result["response_status"],
        "error": result["error_message"],
    }
```

#### 6. Event emission

Add `background_tasks: BackgroundTasks` parameter to the relevant route handlers. Import `dispatch_to_company` and `async_session_maker` (from `app.core.db`).

**`v1_calculate.py`** — after the `CalculationRun` row is committed, before returning the response:

```python
from app.services.webhook_service import dispatch_to_company
from app.core.db import async_session_maker

background_tasks.add_task(
    dispatch_to_company,
    async_session_maker,
    current_user.company_id,
    "hedge_run.completed",
    {
        "run_id": str(run.id),
        "trade_count": run.trade_count,
        "hedge_count": run.hedge_count,
        "run_hash": run.run_hash,
    },
)
```

Note: `CalculationRun` has no `total_notional` or `base_currency` column — use `trade_count` and `hedge_count` (real indexed columns). Richer fields (currency, notional) can be extracted from `run.run_envelope` JSONB at implementation time if the field path is confirmed.

**`v1_gl.py`** — add `background_tasks: BackgroundTasks` to `post_journal_entry`. After `je.posted_ref = result.external_ref` (success path, before `await session.commit()`):

```python
background_tasks.add_task(
    dispatch_to_company,
    async_session_maker,
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

In the `except ConnectorError` block, **before** `raise HTTPException(502, ...)`:

```python
except ConnectorError as exc:
    background_tasks.add_task(
        dispatch_to_company,
        async_session_maker,
        current_user.company_id,
        "erp_post.failed",
        {
            "je_id": str(je.id),
            "provider": provider,
            "error_message": str(exc)[:200],
        },
    )
    raise HTTPException(status_code=502, detail=f"ERP posting failed: {exc.message}") from exc
```

### Frontend

#### 7. `frontend/src/app/settings/notifications/page.tsx` *(new)*

Protected page — check `user.company.plan_tier >= "professional"` on mount (redirect to `/upgrade` if not). Uses `useAuth()`, `dashboardFetch`, `lucide-react` (`Bell`, `Trash2`, `Send`) icons, standard `PageShell` layout.

**Add channel form:**
- Channel type toggle: `Slack` / `Teams` / `Generic` (radio group)
- URL input (placeholder: `https://hooks.slack.com/...`)
- Events multiselect: 7 checkboxes (all `SUPPORTED_EVENTS`)
- Save button → `POST /api/v1/webhooks`

**Active channels list:**
- Table columns: Type badge (color-coded), URL (truncated to 40 chars), Events (count or "all"), Actions
- "Send Test" button → `POST /api/v1/webhooks/{id}/test` → success/error toast
- Delete button → `DELETE /api/v1/webhooks/{id}` → removes row

**API client additions** in `frontend/src/lib/api/webhookClient.ts` *(new file)*:
- `listWebhooks(token)` → `GET /api/v1/webhooks`
- `registerWebhook(token, body)` → `POST /api/v1/webhooks`
- `deleteWebhook(token, id)` → `DELETE /api/v1/webhooks/{id}`
- `testWebhook(token, id)` → `POST /api/v1/webhooks/{id}/test`

#### 8. `frontend/src/app/AppSidebar.tsx`

Add Notifications nav item under the SETTINGS group:

```tsx
{ label: "NOTIFICATIONS", href: "/settings/notifications", icon: Bell, group: "SETTINGS", minTier: "professional" }
```

---

## Error Handling

| Scenario | Backend response | Frontend |
|----------|-----------------|----------|
| URL doesn't start with `https://` | 422 field validation | Inline error under URL input |
| `channel_type` not in enum | 422 | Inline error |
| Max 5 endpoints per tenant exceeded | 409 | Toast "Limit reached (5 active channels)" |
| Delivery non-2xx | Retry schedule (1m→5m→15m→60m); log entry | No UI — fire-and-forget |
| Formatter throws on bad payload | Log warning; raw data dict delivered | No UI impact |
| Test ping: endpoint unreachable | `{success: false, error: "..."}` | Error toast with message |
| Caller lacks `api_keys.manage` on test | 403 | Toast "Permission denied" |

---

## Testing

### `backend/tests/test_notification_formatters.py` (new, ~8 tests)

- `test_slack_blocks_has_header_block` — assert `result["blocks"][0]["type"] == "header"`
- `test_slack_blocks_erp_failed_has_error_in_section` — assert `"error_message"` appears in section text
- `test_teams_card_structure` — assert `result["@type"] == "MessageCard"` and `"sections"` key present
- `test_teams_card_journal_posted_facts_include_erp_ref` — assert `"erp_ref"` in fact names
- `test_format_payload_dispatches_slack` — assert result has `"blocks"` key
- `test_format_payload_dispatches_teams` — assert result has `"@type"` key
- `test_format_payload_generic_returns_raw` — assert result is identical to input data dict
- `test_format_payload_formatter_exception_returns_raw` — patch `format_slack_blocks` to raise; assert raw dict returned

### `backend/tests/test_webhook_channel_type.py` (new, ~5 tests)

- `test_register_slack_channel_type_stored` — POST with `channel_type="slack"`, assert DB row `channel_type == "slack"`
- `test_delivery_slack_omits_ordr_signature_header` — mock httpx; assert `"X-ORDR-Signature"` absent in request headers for slack endpoint
- `test_delivery_generic_includes_ordr_signature_header` — assert `"X-ORDR-Signature"` present for generic
- `test_delivery_slack_sends_blocks_not_envelope` — assert POST body has `"blocks"` key (not `"event"` + `"data"` envelope)
- `test_new_events_in_supported_set` — assert `"hedge_run.completed"`, `"journal_entry.posted"`, `"erp_post.failed"` all in `SUPPORTED_EVENTS`

### `backend/tests/test_webhook_event_emission.py` (new, ~3 tests)

- `test_hedge_run_completed_dispatched` — patch `dispatch_to_company`; call calculate route; assert called with `"hedge_run.completed"`
- `test_journal_entry_posted_dispatched` — patch `dispatch_to_company`; call GL post route (ERP path); assert called with `"journal_entry.posted"`
- `test_erp_post_failed_dispatched` — patch `dispatch_to_company` + raise `ConnectorError`; assert called with `"erp_post.failed"` before 502 is returned

---

## Out of Scope (v1 Freeze)

- Slack App OAuth (bot token, slash commands, interactive messages)
- Microsoft Teams App manifest / connector registration
- Delivery log UI (view per-endpoint delivery history in browser)
- Webhook event filtering by sub-fields (e.g., only fire for currency = USD)
- Two-way notifications (approve proposal from Slack)
- Async task queue (Celery/ARQ) for retry — v1 uses in-process `asyncio.sleep` BackgroundTask
