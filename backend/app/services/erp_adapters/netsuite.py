"""NetSuite REST invoice pull adapter."""
from __future__ import annotations

import logging

from app.services.erp_adapters.base import ERPInvoice, ERPPullAdapter

logger = logging.getLogger(__name__)


class NetSuiteAdapter(ERPPullAdapter):
    system_name = "NETSUITE"

    def __init__(self, *, account_id: str, consumer_key: str = "",
                 consumer_secret: str = "", token: str = "", token_secret: str = ""):
        self.account_id = account_id
        self._creds = {
            "consumer_key": consumer_key, "consumer_secret": consumer_secret,
            "token": token, "token_secret": token_secret,
        }

    async def pull_open_invoices(self, *, base_currency: str) -> list[ERPInvoice]:
        if not self.account_id or not self._creds["consumer_key"]:
            logger.info("NetSuite adapter in paper mode — returning empty list")
            return []
        # Production: GET /record/v1/invoice?status=Open
        # Requires OAuth 1.0a HMAC-SHA256 (requests-oauthlib) — Phase 2
        logger.warning("NetSuite live pull not yet wired — paper mode")
        return []
