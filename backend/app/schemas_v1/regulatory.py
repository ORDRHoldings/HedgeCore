"""Pydantic schemas for Regulatory Submission lifecycle API."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

SubmissionFramework = Literal[
    "EMIR", "MIFID_II", "DODD_FRANK", "ISDA", "FINRA_17A4", "IFRS9"
]
SubmissionStatus = Literal[
    "PENDING", "SUBMITTED", "ACKNOWLEDGED", "REJECTED", "FAILED"
]


class RegulatorySubmissionCreate(BaseModel):
    framework: SubmissionFramework
    source_run_id: str | None = Field(default=None, max_length=64)
    # Optional override UTI; if omitted, service generates one.
    uti: str | None = Field(default=None, max_length=64)


class RegulatorySubmissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    framework: SubmissionFramework
    uti: str
    source_run_id: str | None
    status: SubmissionStatus
    document_bytes: int
    document_hash: str
    submitted_at: datetime | None
    ack_received_at: datetime | None
    ack_reference: str | None
    rejection_reason: str | None
    retry_count: int
    created_at: datetime
    created_by_user_id: UUID
    updated_at: datetime


class SubmissionMarkSubmitted(BaseModel):
    # Records that the TR received the document (pre-ack).
    submitted_at: datetime | None = None


class AcknowledgmentRequest(BaseModel):
    ack_reference: str = Field(..., min_length=1, max_length=128)
    ack_received_at: datetime | None = None


class RejectionRequest(BaseModel):
    rejection_reason: str = Field(..., min_length=1, max_length=512)


class SubmissionListFilters(BaseModel):
    framework: SubmissionFramework | None = None
    status: SubmissionStatus | None = None
    source_run_id: str | None = Field(default=None, max_length=64)
    limit: int = Field(default=100, ge=1, le=500)


class SubmissionStats(BaseModel):
    total: int
    pending: int
    submitted: int
    acknowledged: int
    rejected: int
    failed: int
    ack_rate_pct: float
