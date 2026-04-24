"""
connectors.py -- Pydantic v2 schemas for the connector/import audit framework.
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ConnectorRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:             UUID
    company_id:     UUID
    branch_id:      UUID | None
    triggered_by:   UUID
    connector_type: str
    source_filename: str | None
    source_hash:    str | None
    status:         str
    total_rows:     int
    created_ok:     int
    error_count:    int
    started_at:     datetime
    completed_at:   datetime | None


class ConnectorRunErrorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    row_number:     int | None
    field_name:     str | None
    error_message:  str


class ConnectorRunDetailResponse(ConnectorRunResponse):
    errors: list[ConnectorRunErrorResponse] = []


class ConnectorRunListResponse(BaseModel):
    items: list[ConnectorRunResponse]
    total: int


class AccountingImportRequest(BaseModel):
    system: str
    document_types: list[str] = []
    currencies: list[str] = []
    date_from: str | None = None
    date_to: str | None = None
    foreign_only: bool = True


class ERPSyncRequest(BaseModel):
    system: str
    config: dict | None = None


class PaperModeResponse(BaseModel):
    status: str
    mode: str
    detail: str


# ═════════════════════════════════════════════════════════════════════════════
# Live ERP connector schemas (Track 1 — Launch Readiness)
# ═════════════════════════════════════════════════════════════════════════════


class ProviderMeta(BaseModel):
    provider_id: str
    display_name: str
    auth_style: str


class ProviderListResponse(BaseModel):
    providers: list[ProviderMeta]


class ConnectorAuthorizeRequest(BaseModel):
    """Body for POST /connectors/{provider}/authorize."""

    # Provider-specific extras: account_id (NetSuite), instance_url (D365),
    # company_id/user_id/user_password (Intacct).
    extra: dict[str, str] = {}


class ConnectorAuthorizeResponse(BaseModel):
    authorize_url: str | None = None
    state: str
    requires_form: bool = False
    form_fields: list[str] = []


class ConnectorStatusResponse(BaseModel):
    provider_id: str
    connected: bool
    realm_id: str | None = None
    last_connected_at: str | None = None
    last_sync_at: str | None = None
    last_error: str | None = None
    circuit_open: bool = False
    paper_mode: bool = False


class ConnectorHealthResponse(BaseModel):
    provider_id: str
    healthy: bool
    latency_ms: float
    detail: str


class COAAccountResponse(BaseModel):
    external_id: str
    code: str
    name: str
    type: str
    subtype: str | None = None
    currency: str | None = None
    active: bool
    parent_external_id: str | None = None


class COAResponse(BaseModel):
    provider_id: str
    accounts: list[COAAccountResponse]
    fetched_at: datetime


class JournalLineRequest(BaseModel):
    account_external_id: str
    debit: str = "0"
    credit: str = "0"
    description: str
    currency: str
    memo: str | None = None
    dimensions: dict = {}


class JournalPostRequest(BaseModel):
    reference: str
    memo: str
    posting_date: datetime
    lines: list[JournalLineRequest]
    dry_run: bool = False


class JournalPostResponse(BaseModel):
    provider_id: str
    external_ref: str | None
    posted_at: datetime
    dry_run: bool


class ConnectorConnectFormRequest(BaseModel):
    """Non-OAuth form-based connect (Sage Intacct).

    Required fields vary by provider; keep a flat dict so the schema is reusable.
    """

    state: str
    fields: dict[str, str]
