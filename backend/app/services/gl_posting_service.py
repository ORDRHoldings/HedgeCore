"""
Adapter dispatch layer.
Selects the right GLPostingAdapter based on connector_settings.erp_system.
"""
from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.journal_entry import JournalEntry, JournalEntryStatus
from app.models.user import User
from app.services.posting_adapters.base import PostingResult
from app.services.posting_adapters.csv_exporter import CSVExporter
from app.services.posting_adapters.netsuite import NetSuitePoster
from app.services.posting_adapters.quickbooks import QuickBooksPoster
from app.services.posting_adapters.xero import XeroPoster

logger = logging.getLogger(__name__)

_ADAPTER_MAP = {
    "QB": QuickBooksPoster,
    "XERO": XeroPoster,
    "NETSUITE": NetSuitePoster,
    "CSV": CSVExporter,
    "MANUAL": CSVExporter,
}


async def post_journal_entry(
    session: AsyncSession,
    je: JournalEntry,
    user: User,
    *,
    erp_system: str = "CSV",
    connector_settings: dict | None = None,
) -> PostingResult:
    """
    Dispatch posting to the appropriate adapter.
    On success: updates je.status -> POSTED, sets posted_to + posted_ref.
    On failure: returns PostingResult with success=False (caller must handle).
    """
    if je.status != JournalEntryStatus.APPROVED.value:
        raise ValueError(
            f"Cannot post JournalEntry {je.id} — status is {je.status}, expected APPROVED"
        )

    adapter_class = _ADAPTER_MAP.get(erp_system.upper(), CSVExporter)
    settings = connector_settings or {}

    if erp_system.upper() == "QB":
        adapter = adapter_class(
            access_token=settings.get("access_token", ""),
            realm_id=settings.get("realm_id", ""),
            sandbox=settings.get("sandbox", True),
        )
    elif erp_system.upper() == "XERO":
        adapter = adapter_class(
            access_token=settings.get("access_token", ""),
            tenant_id=settings.get("tenant_id", ""),
        )
    elif erp_system.upper() == "NETSUITE":
        adapter = adapter_class(
            account_id=settings.get("account_id", ""),
            consumer_key=settings.get("consumer_key", ""),
            consumer_secret=settings.get("consumer_secret", ""),
            token=settings.get("token", ""),
            token_secret=settings.get("token_secret", ""),
        )
    else:
        adapter = CSVExporter()

    result = await adapter.post(je)

    if result.success:
        from datetime import UTC, datetime  # noqa: PLC0415
        je.status = JournalEntryStatus.POSTED.value
        je.posted_to = adapter.system_name
        je.posted_ref = result.erp_ref or ""
        je.posted_at = datetime.now(UTC)
        # Caller (route) owns the commit — do not flush here
    else:
        logger.error(
            "GL posting failed for entry %s via %s: %s",
            je.id, erp_system, result.error,
        )

    return result
