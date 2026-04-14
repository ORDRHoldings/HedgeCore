"""Xero Manual Journals posting adapter."""
from __future__ import annotations
import logging

from app.services.posting_adapters.base import GLPostingAdapter, PostingResult

logger = logging.getLogger(__name__)


class XeroPoster(GLPostingAdapter):
    system_name = "XERO"

    def __init__(self, *, access_token: str, tenant_id: str, sandbox: bool = True):
        self.access_token = access_token
        self.tenant_id = tenant_id

    async def post(self, journal_entry) -> PostingResult:
        if not self.access_token:
            return PostingResult(
                success=True,
                payload="paper_mode",
                erp_ref=f"XERO-PAPER-{journal_entry.id}",
            )
        try:
            import httpx  # noqa: PLC0415
            from datetime import datetime, timezone  # noqa: PLC0415
            _dt = datetime(
                journal_entry.period_date.year,
                journal_entry.period_date.month,
                journal_entry.period_date.day,
                tzinfo=timezone.utc,
            )
            payload = {
                "Date": f"/Date({int(_dt.timestamp()) * 1000}+0000)/",
                "Narration": f"ORDR {journal_entry.entry_type} {journal_entry.id}",
                "JournalLines": [
                    {
                        "LineAmount": float(journal_entry.amount),
                        "AccountCode": journal_entry.debit_account,
                        "Description": journal_entry.description,
                    },
                    {
                        "LineAmount": -float(journal_entry.amount),
                        "AccountCode": journal_entry.credit_account,
                        "Description": journal_entry.description,
                    },
                ],
            }
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    "https://api.xero.com/api.xro/2.0/ManualJournals",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "xero-tenant-id": self.tenant_id,
                        "Accept": "application/json",
                    },
                )
            resp.raise_for_status()
            data = resp.json()
            journals = data.get("ManualJournals", [])
            erp_ref = journals[0].get("ManualJournalID", "") if journals else ""
            return PostingResult(success=True, payload=resp.text, erp_ref=erp_ref)
        except Exception as exc:
            logger.error("Xero posting failed: %s", exc)
            return PostingResult(success=False, payload="", error=str(exc))
