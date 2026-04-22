"""
app/services/webhook_service.py

Webhook delivery service for ORDR Terminal.

Responsibilities:
  - HMAC-SHA256 signing of webhook payloads
  - HTTP delivery with configurable timeout
  - Retry loop (up to MAX_ATTEMPTS attempts per endpoint)
  - WebhookDeliveryLog insertion after each attempt
  - WORM audit event emission on successful delivery
  - Delivery log pruning to DELIVERY_LOG_WINDOW entries per endpoint
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import secrets
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

_log = logging.getLogger("hedgecalc.services.webhook_service")

# HTTP timeout for outbound webhook calls (seconds)
_DELIVERY_TIMEOUT = 10.0


# ---------------------------------------------------------------------------
# Pure helpers (no I/O)
# ---------------------------------------------------------------------------

def generate_webhook_secret() -> str:
    """Return a 64-character hex string (32 random bytes)."""
    return secrets.token_hex(32)


def compute_signature(secret: str, payload_json: str) -> str:
    """
    Compute HMAC-SHA256 signature for the given payload.
    Returns: 'sha256=<64-char hex>'
    """
    mac = hmac.HMAC(secret.encode(), payload_json.encode(), hashlib.sha256)
    return f"sha256={mac.hexdigest()}"


def build_event_payload(
    event_type: str,
    tenant_id: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    """
    Build the outbound webhook event envelope.

    Returns a dict with:
      event, timestamp (ISO-8601 UTC), tenant_id, delivery_id (uuid4), data
    """
    return {
        "event": event_type,
        "timestamp": datetime.now(UTC).isoformat(),
        "tenant_id": tenant_id,
        "delivery_id": str(uuid.uuid4()),
        "data": data,
    }


# ---------------------------------------------------------------------------
# HTTP delivery (no DB)
# ---------------------------------------------------------------------------

async def deliver_webhook_attempt(
    url: str,
    secret: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """
    POST the payload to url with HMAC signature header.

    Never raises — all errors are caught and returned as status='failed'.

    Returns:
        {
            status: 'delivered' | 'failed',
            response_status: int | None,
            response_body: str | None,
            error_message: str | None,
        }
    """
    payload_json = json.dumps(payload, default=str)
    signature = compute_signature(secret, payload_json)

    headers = {
        "Content-Type": "application/json",
        "X-ORDR-Signature": signature,
        "User-Agent": "ORDR-Terminal-Webhook/1.0",
    }

    try:
        async with httpx.AsyncClient(timeout=_DELIVERY_TIMEOUT) as client:
            response = await client.post(url, content=payload_json, headers=headers)

        status = "delivered" if 200 <= response.status_code < 300 else "failed"
        return {
            "status": status,
            "response_status": response.status_code,
            "response_body": response.text[:2048] if response.text else None,
            "error_message": None,
        }

    except httpx.TimeoutException as exc:
        return {
            "status": "failed",
            "response_status": None,
            "response_body": None,
            "error_message": f"timeout: {exc}",
        }
    except httpx.ConnectError as exc:
        return {
            "status": "failed",
            "response_status": None,
            "response_body": None,
            "error_message": f"connect_error: {exc}",
        }
    except Exception as exc:  # noqa: BLE001
        _log.warning("webhook delivery unexpected error url=%s err=%s", url, exc)
        return {
            "status": "failed",
            "response_status": None,
            "response_body": None,
            "error_message": str(exc),
        }


# ---------------------------------------------------------------------------
# Full dispatch pipeline (with DB)
# ---------------------------------------------------------------------------

async def dispatch_webhook_event(
    db: AsyncSession,
    endpoint: Any,  # WebhookEndpoint ORM instance
    event_type: str,
    data: dict[str, Any],
) -> None:
    """
    Attempt delivery of a webhook event to a single endpoint.

    Retries up to MAX_ATTEMPTS times using RETRY_DELAYS_MINUTES schedule.
    Inserts a WebhookDeliveryLog row after each attempt.
    On first successful delivery, emits a WORM audit event and prunes the log.
    """
    from app.models.webhook import MAX_ATTEMPTS, DELIVERY_LOG_WINDOW, RETRY_DELAYS_MINUTES, WebhookDeliveryLog

    tenant_id = str(endpoint.company_id) if endpoint.company_id else "unknown"
    payload = build_event_payload(event_type, tenant_id, data)

    for attempt_num in range(1, MAX_ATTEMPTS + 1):
        result = await deliver_webhook_attempt(
            url=endpoint.url,
            secret=endpoint.secret,
            payload=payload,
        )

        log_row = WebhookDeliveryLog(
            endpoint_id=endpoint.id,
            event_type=event_type,
            payload_json=payload,
            attempt=attempt_num,
            status=result["status"],
            response_status=result["response_status"],
            response_body=result["response_body"],
            error_message=result["error_message"],
            delivered_at=datetime.now(UTC) if result["status"] == "delivered" else None,
        )
        db.add(log_row)
        await db.flush()

        if result["status"] == "delivered":
            await _emit_webhook_delivered_audit(db, endpoint, event_type, payload)
            await _prune_delivery_log(db, endpoint.id, DELIVERY_LOG_WINDOW)
            await db.commit()
            _log.info(
                "webhook delivered endpoint_id=%s event=%s attempt=%d",
                endpoint.id,
                event_type,
                attempt_num,
            )
            return

        if attempt_num < MAX_ATTEMPTS:
            delay_minutes = RETRY_DELAYS_MINUTES[attempt_num - 1]
            _log.warning(
                "Webhook delivery attempt %d/%d failed for endpoint %s — retrying in %d min",
                attempt_num, MAX_ATTEMPTS, endpoint.id, delay_minutes,
            )
            await asyncio.sleep(delay_minutes * 60)
        else:
            _log.warning(
                "webhook attempt %d/%d failed endpoint_id=%s event=%s err=%s",
                attempt_num,
                MAX_ATTEMPTS,
                endpoint.id,
                event_type,
                result["error_message"],
            )

    # All attempts exhausted — commit failure logs
    await db.commit()
    _log.error(
        "webhook exhausted all %d attempts endpoint_id=%s event=%s",
        MAX_ATTEMPTS,
        endpoint.id,
        event_type,
    )


# ---------------------------------------------------------------------------
# WORM audit emit
# ---------------------------------------------------------------------------

async def _emit_webhook_delivered_audit(
    db: AsyncSession,
    endpoint: Any,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    """Write an immutable audit_events row for a successful webhook delivery."""
    from sqlalchemy import select as _sel
    from app.models.audit_event import AuditEvent, build_audit_event, GENESIS_HASH

    # Fetch the latest event hash for this tenant's chain
    latest = await db.execute(
        _sel(AuditEvent.event_hash)
        .where(AuditEvent.company_id == endpoint.company_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(1)
    )
    row = latest.scalar_one_or_none()
    prev_hash = row if row else GENESIS_HASH

    event = build_audit_event(
        event_type="SYSTEM",
        description=f"Webhook delivered: {event_type} -> {endpoint.url}",
        payload={
            "webhook_event_type": event_type,
            "endpoint_id": str(endpoint.id),
            "url": endpoint.url,
            "delivery_id": payload.get("delivery_id"),
        },
        prev_event_hash=prev_hash,
        company_id=endpoint.company_id,
        entity_type="webhook_endpoint",
        entity_id=str(endpoint.id),
    )
    db.add(event)
    await db.flush()


# ---------------------------------------------------------------------------
# Log pruning
# ---------------------------------------------------------------------------

async def _prune_delivery_log(
    db: AsyncSession,
    endpoint_id: Any,
    keep: int = 100,
) -> None:
    """
    Delete WebhookDeliveryLog rows for endpoint_id older than the last `keep` entries.
    Safe to call on every delivery — no-ops if row count <= keep.
    """
    from sqlalchemy import select, delete
    from app.models.webhook import WebhookDeliveryLog

    # Find the created_at cutoff: the (keep+1)-th newest row
    subq = (
        select(WebhookDeliveryLog.created_at)
        .where(WebhookDeliveryLog.endpoint_id == endpoint_id)
        .order_by(WebhookDeliveryLog.created_at.desc())
        .offset(keep)
        .limit(1)
        .scalar_subquery()
    )

    await db.execute(
        delete(WebhookDeliveryLog).where(
            WebhookDeliveryLog.endpoint_id == endpoint_id,
            WebhookDeliveryLog.created_at <= subq,
        )
    )
