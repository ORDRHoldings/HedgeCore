"""
Xero invoice pull adapter.
Fetches GET /Invoices?Status=AUTHORISED and filters by currency.
"""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

from app.services.erp_adapters.base import ERPInvoice, ERPPullAdapter

logger = logging.getLogger(__name__)


class XeroAdapter(ERPPullAdapter):
    system_name = "XERO"

    def __init__(self, *, access_token: str, tenant_id: str):
        self.access_token = access_token
        self.tenant_id = tenant_id

    async def pull_open_invoices(self, *, base_currency: str) -> list[ERPInvoice]:
        if not self.access_token:
            logger.info("Xero adapter in paper mode — returning empty invoice list")
            return []
        try:
            import httpx  # noqa: PLC0415
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://api.xero.com/api.xro/2.0/Invoices",
                    params={"Status": "AUTHORISED", "PageSize": "100"},
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "xero-tenant-id": self.tenant_id,
                        "Accept": "application/json",
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            invoices = []
            for inv in data.get("Invoices", []):
                currency = inv.get("CurrencyCode", "")
                if currency.upper() == base_currency.upper():
                    continue  # Skip base-currency invoices
                try:
                    due_str = inv.get("DueDate", "")
                    # Xero date format: /Date(timestamp)/
                    import re  # noqa: PLC0415
                    ts_match = re.search(r"\d+", due_str)
                    due_date = (
                        date.fromtimestamp(int(ts_match.group()) / 1000)
                        if ts_match else date.today()
                    )
                except Exception:  # noqa: BLE001
                    due_date = date.today()

                invoices.append(ERPInvoice(
                    source_system="XERO",
                    source_ref=inv.get("InvoiceID", ""),
                    amount=Decimal(str(inv.get("AmountDue", 0))),
                    currency=currency,
                    due_date=due_date,
                    counterparty=inv.get("Contact", {}).get("Name", ""),
                    direction="AR" if inv.get("Type") == "ACCREC" else "AP",
                    raw=inv,
                ))
            return invoices

        except Exception as exc:  # noqa: BLE001
            logger.error("Xero invoice pull failed: %s", exc)
            return []
