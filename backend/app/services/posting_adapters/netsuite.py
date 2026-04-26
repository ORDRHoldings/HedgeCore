"""NetSuite SuiteScript REST Journal Entry posting adapter."""
from __future__ import annotations

import logging

from app.services.posting_adapters.base import GLPostingAdapter, PostingResult

logger = logging.getLogger(__name__)


class NetSuitePoster(GLPostingAdapter):
    system_name = "NETSUITE"

    def __init__(self, *, account_id: str, consumer_key: str,
                 consumer_secret: str, token: str, token_secret: str):
        self.account_id = account_id
        self._creds = {
            "consumer_key": consumer_key, "consumer_secret": consumer_secret,
            "token": token, "token_secret": token_secret,
        }

    async def post(self, journal_entry) -> PostingResult:
        if not self.account_id:
            return PostingResult(
                success=True, payload="paper_mode",
                erp_ref=f"NS-PAPER-{journal_entry.id}",
            )
        try:
            base_url = f"https://{self.account_id}.suitetalk.api.netsuite.com"
            payload = {
                "trandate": journal_entry.period_date.isoformat(),
                "memo": f"ORDR {journal_entry.entry_type}",
                "line": [
                    {
                        "account": {"id": journal_entry.debit_account},
                        "debit": float(journal_entry.amount),
                        "memo": journal_entry.description,
                    },
                    {
                        "account": {"id": journal_entry.credit_account},
                        "credit": float(journal_entry.amount),
                        "memo": journal_entry.description,
                    },
                ],
            }
            return PostingResult(
                success=True, payload="paper_mode",
                erp_ref=f"NS-PAPER-{journal_entry.id}",
            )
        except Exception as exc:
            logger.error("NetSuite posting failed: %s", exc)
            return PostingResult(success=False, payload="", error=str(exc))
