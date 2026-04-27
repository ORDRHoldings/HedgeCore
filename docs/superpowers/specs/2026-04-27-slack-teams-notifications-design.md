# Sub-project B: Slack/Teams Notifications

**Date**: 2026-04-27
**Status**: Approved
**Scope**: Extend existing webhook infrastructure with Slack/Teams formatted delivery + 3 new hedge events + notifications settings UI

---

## Context

The outbound webhook system (`webhook_service.py`, `v1_webhooks.py`, `WebhookEndpoint` model) is fully built with HMAC-SHA256 signing, retry (up to 5 attempts), and delivery log. `SUPPORTED_EVENTS` currently covers 4 events: `position.created`, `calculation.completed`, `proposal.approved`, `proposal.rejected`.

**Gap 1 — No channel-aware formatting.** All deliveries POST the raw event dict. Slack Incoming Webhooks require Block Kit JSON; Teams Incoming Webhooks require Adaptive Card JSON. Sending raw dicts produces unformatted fallback text.

**Gap 2 — Missing hedge events.** `hedge_run.completed`, `journal_entry.posted`, and `erp_post.failed` are high-signal treasury events with no webhook emission.

**Gap 3 — No frontend settings UI.** There is no page for admins to register Slack/Teams channels. The raw `POST /v1/webhooks` endpoint exists but is undiscoverable.

---

## Architecture

### Data Flow

```
Admin saves Slack URL in /settings/notifications
  → POST /v1/webhooks {url, events, channel_type: "slack"}
  → WebhookEndpoint row created (channel_type="slack")

Calculation completes → v1_calculate.py
  → webhook_service.dispatch("hedge_run.completed", {run_id, notional, currency, instruments, tenant_id})
    → for each matching active endpoint:
        format_payload("slack", event_type, payload) → Block Kit JSON
        POST to Slack URL (no X-Hub-Signature-256 header)
        WebhookDeliveryLog entry written
        Retry up to 5× on non-2xx (existing retry schedule: 1m, 5m, 15m, 60m)

GL entry posted to ERP → v1_gl.py (success path)
  → webhook_service.dispatch("journal_entry.posted", {je_id, erp_ref, provider, amount, currency, tenant_id})

ERP post fails → v1_gl.py (ConnectorError path)
  → webhook_service.dispatch("erp_post.failed", {je_id, provider, error_message, tenant_id})
```

---

## Components

### Backend

#### 1. `backend/app/models/webhook.py`

Add `channel_type` field and 3 new events:

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

```sql
ALTER TABLE webhook_endpoints
  ADD COLUMN IF NOT EXISTS channel_type VARCHAR(16) NOT NULL DEFAULT 'generic';
```

#### 3. `backend/app/services/notification_formatters.py` *(new)*

Pure-function module. No DB access, no I/O.

```python
def format_slack_blocks(event_type: str, payload: dict) -> dict:
    """Return Slack Incoming Webhook payload (Block Kit)."""
    ...

def format_teams_card(event_type: str, payload: dict) -> dict:
    """Return Teams Incoming Webhook payload (Adaptive Card)."""
    ...

def format_payload(channel_type: str, event_type: str, payload: dict) -> dict:
    """Dispatch to channel-specific formatter; fall back to raw dict on error."""
    if channel_type == "slack":
        return format_slack_blocks(event_type, payload)
    if channel_type == "teams":
        return format_teams_card(event_type, payload)
    return payload  # generic — send raw dict
```

**Slack Block Kit structure** (per event type):
- Header block: event name + ORDR icon emoji
- Section block: key fields as `*bold*: value` markdown
- Context block: tenant + timestamp

**Teams Adaptive Card structure** (per event type):
- `type: "message"`, `attachments[0].contentType: "application/vnd.microsoft.card.adaptive"`
- `body`: TextBlock title + FactSet for key fields

Formatter errors are caught in the dispatcher; raw dict delivered as fallback so delivery never blocks on formatting failures.

#### 4. `backend/app/services/webhook_service.py`

In the delivery function, before POSTing:
1. Load `endpoint.channel_type`
2. Call `format_payload(channel_type, event_type, payload)`
3. POST the formatted body
4. **Skip** `X-Hub-Signature-256` header when `channel_type in ("slack", "teams")` — these services do not verify HMAC

#### 5. `backend/app/api/routes/v1_webhooks.py`

Extend `WebhookRegisterRequest`:

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

Include `channel_type` in `WebhookResponse`.

#### 6. Event emission

**`v1_calculate.py`** — after a successful calculation run is committed:

```python
await webhook_service.dispatch(
    session, current_user.company_id,
    "hedge_run.completed",
    {
        "run_id": str(run.id),
        "notional": str(run.total_notional),
        "currency": run.base_currency,
        "instruments": run.instrument_summary,  # list of instrument types used
    },
)
```

**`v1_gl.py`** — after `je.status = POSTED`:

```python
await webhook_service.dispatch(
    session, current_user.company_id,
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

**`v1_gl.py`** — in the `except ConnectorError` block:

```python
await webhook_service.dispatch(
    session, current_user.company_id,
    "erp_post.failed",
    {
        "je_id": str(je.id),
        "provider": provider,
        "error_message": str(exc.message)[:200],
    },
)
```

### Frontend

#### 7. `frontend/src/app/settings/notifications/page.tsx` *(new)*

Single-page settings surface:

- **Add channel form**: URL input, channel type toggle (Slack / Teams / Generic), event multiselect checkboxes (7 events), Save button
- **Active channels list**: table with columns — Type badge (Slack/Teams/Generic), URL (truncated), Events count, "Send Test" button, Delete button
- **Send Test**: `POST /v1/webhooks/{id}/test` — sends synthetic ping payload; shows success/error toast
- Standard page layout: `PageShell` + `useAuth()` + `dashboardFetch`

**Note**: `POST /v1/webhooks/{id}/test` is a new endpoint (see below).

#### 8. `backend/app/api/routes/v1_webhooks.py` — test endpoint

```python
@router.post("/{webhook_id}/test")
async def test_webhook(
    webhook_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Send a synthetic ping to verify the endpoint is reachable."""
    ...
```

Dispatches a synthetic `{"event": "test.ping", "message": "ORDR connectivity test"}` payload. No WORM audit event emitted. Returns `{success: bool, status_code: int, error: str | None}`.

#### 9. `frontend/src/app/AppSidebar.tsx`

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
| Max 5 webhooks per tenant exceeded | 409 | Toast "Limit reached (5 active channels)" |
| Delivery non-2xx | Retry schedule (existing); log entry | Visible in delivery log (future) |
| Formatter throws on bad payload | Log warning; deliver raw dict | No UI impact |
| Test ping: endpoint unreachable | Return `{success: false, error: ...}` | Error toast with status code |

---

## Testing

### `backend/tests/test_notification_formatters.py` (new, ~8 tests)

- `test_slack_blocks_hedge_run_has_header` — assert `blocks[0].type == "header"`
- `test_slack_blocks_erp_failed_has_error_field` — assert error_message present in section
- `test_teams_card_structure` — assert `type == "message"` and `attachments[0].contentType` correct
- `test_teams_card_journal_posted_factset` — assert amount + erp_ref in FactSet body
- `test_format_payload_dispatches_slack` — assert returns Block Kit dict
- `test_format_payload_dispatches_teams` — assert returns Adaptive Card dict
- `test_format_payload_generic_passthrough` — assert raw dict returned unchanged
- `test_formatter_error_falls_back_to_raw` — patch `format_slack_blocks` to raise; assert raw dict returned

### `backend/tests/test_webhook_channel_type.py` (new, ~5 tests)

- `test_register_slack_channel_type_stored` — POST with `channel_type="slack"`, assert DB row has `channel_type="slack"`
- `test_delivery_slack_omits_hmac_header` — mock httpx; assert `X-Hub-Signature-256` absent for slack endpoint
- `test_delivery_generic_includes_hmac_header` — assert header present for generic endpoint
- `test_delivery_uses_formatted_payload` — assert POST body is Block Kit dict (has `blocks` key) for slack
- `test_new_events_in_supported_set` — assert all 3 new event names in `SUPPORTED_EVENTS`

### `backend/tests/test_webhook_event_emission.py` (new, ~3 tests)

- `test_hedge_run_completed_dispatched` — mock `webhook_service.dispatch`; call calculate route; assert called with `"hedge_run.completed"`
- `test_journal_entry_posted_dispatched` — mock dispatch; call GL post route (ERP path); assert `"journal_entry.posted"`
- `test_erp_post_failed_dispatched` — mock dispatch + raise ConnectorError; assert `"erp_post.failed"`

---

## Out of Scope (v1 Freeze)

- Slack App OAuth (bot token, slash commands, interactive messages)
- Microsoft Teams App manifest / connector registration
- Delivery log UI (view per-endpoint delivery history in browser)
- Webhook event filtering by sub-fields (e.g., only fire for currency = USD)
- Two-way notifications (approve proposal from Slack)
