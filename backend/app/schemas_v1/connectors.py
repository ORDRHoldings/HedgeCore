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
