"""
app/tasks/webhook_cleanup.py
Nightly APScheduler job to prune WebhookDeliveryLog to the last 100 rows per endpoint.
"""
from __future__ import annotations

import logging

_log = logging.getLogger("hedgecalc.tasks.webhook_cleanup")


async def cleanup_webhook_delivery_logs() -> None:
    """Prune webhook_delivery_logs to last 100 rows per endpoint_id."""
    from sqlalchemy import func, select

    from app.core.db import async_session_maker
    from app.models.webhook import DELIVERY_LOG_WINDOW, WebhookDeliveryLog

    async with async_session_maker() as session:
        try:
            result = await session.execute(
                select(WebhookDeliveryLog.endpoint_id)
                .group_by(WebhookDeliveryLog.endpoint_id)
                .having(func.count(WebhookDeliveryLog.id) > DELIVERY_LOG_WINDOW)
            )
            endpoint_ids = [row[0] for row in result.fetchall()]

            pruned_total = 0
            for eid in endpoint_ids:
                from app.services.webhook_service import _prune_delivery_log
                await _prune_delivery_log(session, eid, DELIVERY_LOG_WINDOW)
                pruned_total += 1

            if pruned_total:
                _log.info("webhook_cleanup: pruned logs for %d endpoints", pruned_total)
        except Exception as exc:
            _log.error("webhook_cleanup failed: %s", exc)
