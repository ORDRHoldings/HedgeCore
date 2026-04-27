"""
app/models/webhook.py

Webhook models for ORDR Terminal.

WebhookEndpoint: registered client endpoint (per-tenant, max 5 active).
WebhookDeliveryLog: rolling delivery log (last 100 entries per endpoint, NOT WORM).

Constants:
  MAX_WEBHOOKS_PER_TENANT = 5
  SUPPORTED_EVENTS = {position.created, calculation.completed, proposal.approved, proposal.rejected}
  RETRY_DELAYS_MINUTES = [1, 5, 15, 60]  # delays between attempts 1-2, 2-3, 3-4, 4-5
  MAX_ATTEMPTS = 5
  DELIVERY_LOG_WINDOW = 100
"""
from __future__ import annotations

import uuid as _uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.core.db import Base

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_WEBHOOKS_PER_TENANT: int = 5
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

RETRY_DELAYS_MINUTES: list[int] = [1, 5, 15, 60]  # gaps between attempts 1->2, 2->3, 3->4, 4->5
MAX_ATTEMPTS: int = 5
DELIVERY_LOG_WINDOW: int = 100


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class WebhookEndpoint(Base):
    __tablename__ = "webhook_endpoints"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    company_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    url = Column(String(2048), nullable=False)
    secret = Column(String(128), nullable=False)
    description = Column(String(255), nullable=True)
    # Comma-separated event names. Empty string = subscribe to all.
    events = Column(String(512), nullable=False, default="")
    is_active = Column(Boolean, nullable=False, default=True)
    channel_type = Column(String(16), nullable=False, server_default="generic")
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    def __init__(self, **kwargs):
        if "is_active" not in kwargs:
            kwargs["is_active"] = True
        if "events" not in kwargs:
            kwargs["events"] = ""
        super().__init__(**kwargs)

    def subscribes_to(self, event_type: str) -> bool:
        """Return True if this endpoint is subscribed to the given event."""
        if not self.events:
            return True  # empty = all events
        return event_type in self.get_events()

    def get_events(self) -> list[str]:
        """Return sorted list of subscribed event names."""
        if not self.events:
            return sorted(SUPPORTED_EVENTS)
        return sorted(e.strip() for e in self.events.split(",") if e.strip())


class WebhookDeliveryLog(Base):
    __tablename__ = "webhook_delivery_logs"

    id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    endpoint_id = Column(
        PGUUID(as_uuid=True),
        ForeignKey("webhook_endpoints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type = Column(String(64), nullable=False)
    # Store payload as JSONB on PG
    payload_json = Column(JSONB, nullable=True)
    attempt = Column(Integer, nullable=False, default=1)
    status = Column(String(20), nullable=False)  # delivered | failed
    response_status = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
