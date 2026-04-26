"""Pydantic schemas for ERP connector endpoints."""
from __future__ import annotations

from pydantic import BaseModel


class ERPPullRequest(BaseModel):
    # connector_id is a logical string key (e.g. "xero_prod") in company.settings["erp_credentials"]
    # NOT a UUID FK — no Connector entity exists in Phase 1 (Phase 2 deliverable)
    connector_id: str


class ERPPullResult(BaseModel):
    source_system: str
    invoices_fetched: int
    positions_created: int
    duplicates_skipped: int
