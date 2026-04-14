"""
QuickBooks Online GL posting adapter.
Calls QBO Journal Entry API. Credentials from connector_settings JSONB.
"""
from __future__ import annotations
import logging

from app.services.posting_adapters.base import GLPostingAdapter, PostingResult

logger = logging.getLogger(__name__)


class QuickBooksPoster(GLPostingAdapter):
    system_name = "QB"

    def __init__(self, *, access_token: str, realm_id: str, sandbox: bool = True):
        self.access_token = access_token
        self.realm_id = realm_id
        self.base_url = (
            "https://sandbox-quickbooks.api.intuit.com"
            if sandbox
            else "https://quickbooks.api.intuit.com"
        )

    async def post(self, journal_entry) -> PostingResult:
        """Post journal entry to QBO.
        In paper mode (no credentials) returns success with mock ref.
        """
        if not self.access_token:
            return PostingResult(
                success=True,
                payload="paper_mode",
                erp_ref=f"QB-PAPER-{journal_entry.id}",
            )
        try:
            import httpx  # noqa: PLC0415
            payload = {
                "Line": [
                    {
                        "Amount": float(journal_entry.amount),
                        "DetailType": "JournalEntryLineDetail",
                        "JournalEntryLineDetail": {
                            "PostingType": "Debit",
                            "AccountRef": {"value": journal_entry.debit_account},
                        },
                    },
                    {
                        "Amount": float(journal_entry.amount),
                        "DetailType": "JournalEntryLineDetail",
                        "JournalEntryLineDetail": {
                            "PostingType": "Credit",
                            "AccountRef": {"value": journal_entry.credit_account},
                        },
                    },
                ],
                "TxnDate": journal_entry.period_date.isoformat(),
                "PrivateNote": f"ORDR {journal_entry.entry_type} {journal_entry.id}",
            }
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self.base_url}/v3/company/{self.realm_id}/journalentry",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "Accept": "application/json",
                    },
                )
            resp.raise_for_status()
            data = resp.json()
            erp_ref = str(data.get("JournalEntry", {}).get("Id", ""))
            return PostingResult(success=True, payload=resp.text, erp_ref=erp_ref)
        except Exception as exc:
            logger.error("QuickBooks posting failed: %s", exc)
            return PostingResult(success=False, payload="", error=str(exc))
