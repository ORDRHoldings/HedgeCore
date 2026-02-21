"""
connectors.py — Pydantic v2 schemas for the connector/import audit framework.
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime


class ConnectorRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:             UUID
    company_id:     UUID
    branch_id:      Optional[UUID]
    triggered_by:   UUID
    connector_type: str
    source_filename: Optional[str]
    source_hash:    Optional[str]
    status:         str
    total_rows:     int
    created_ok:     int
    error_count:    int
    started_at:     datetime
    completed_at:   Optional[datetime]


class ConnectorRunErrorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    row_number:     Optional[int]
    field_name:     Optional[str]
    error_message:  str


class ConnectorRunDetailResponse(ConnectorRunResponse):
    errors: list[ConnectorRunErrorResponse] = []


class ConnectorRunListResponse(BaseModel):
    items: list[ConnectorRunResponse]
    total: int
