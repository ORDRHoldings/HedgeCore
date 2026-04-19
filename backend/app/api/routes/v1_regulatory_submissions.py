"""Regulatory Submissions API routes (/v1/regulatory-submissions/*)."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.plan_enforcement import require_plan_tier
from app.models.user import User
from app.schemas_v1.regulatory import (
    AcknowledgmentRequest,
    RegulatorySubmissionCreate,
    RegulatorySubmissionResponse,
    RejectionRequest,
    SubmissionListFilters,
    SubmissionMarkSubmitted,
    SubmissionStats,
)
from app.services import regulatory_submission_service as svc
from app.services.regulatory_submission_service import (
    InvalidTransitionError,
    RegulatorySubmissionError,
)

router = APIRouter(prefix="/v1/regulatory-submissions", tags=["regulatory"])


def _require_perm(user: User, permission: str) -> None:
    if user.is_superuser:
        return
    user_perms = getattr(user, "permissions", None) or set()
    if permission not in user_perms:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{permission} permission required",
        )


def _map_error(e: RegulatorySubmissionError) -> HTTPException:
    if isinstance(e, InvalidTransitionError):
        return HTTPException(status.HTTP_409_CONFLICT, detail=e.message)
    if e.code in {"not_found", "run_not_found"}:
        return HTTPException(status.HTTP_404_NOT_FOUND, detail=e.message)
    if e.code in {"invalid_framework", "unsupported_framework", "invalid_status"}:
        return HTTPException(status.HTTP_400_BAD_REQUEST, detail=e.message)
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=e.message)


@router.post("", response_model=RegulatorySubmissionResponse, status_code=201)
async def create_submission(
    body: RegulatorySubmissionCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
) -> RegulatorySubmissionResponse:
    _require_perm(current_user, "regulatory.submit")
    try:
        submission = await svc.create_submission(
            db=db,
            tenant_id=current_user.company_id,
            user_id=current_user.id,
            framework=body.framework,
            source_run_id=body.source_run_id,
            uti=body.uti,
        )
    except RegulatorySubmissionError as e:
        raise _map_error(e)
    return RegulatorySubmissionResponse.model_validate(submission)


@router.get("", response_model=list[RegulatorySubmissionResponse])
async def list_submissions(
    framework: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    source_run_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
) -> list[RegulatorySubmissionResponse]:
    _require_perm(current_user, "regulatory.read")
    filters = SubmissionListFilters(
        framework=framework,  # type: ignore[arg-type]
        status=status_filter,  # type: ignore[arg-type]
        source_run_id=source_run_id,
        limit=limit,
    )
    rows = await svc.list_submissions(db, current_user.company_id, filters)
    return [RegulatorySubmissionResponse.model_validate(r) for r in rows]


@router.get("/stats", response_model=SubmissionStats)
async def get_stats(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
) -> SubmissionStats:
    _require_perm(current_user, "regulatory.read")
    payload = await svc.get_stats(db, current_user.company_id)
    return SubmissionStats(**payload)


@router.get("/{submission_id}", response_model=RegulatorySubmissionResponse)
async def get_submission(
    submission_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
) -> RegulatorySubmissionResponse:
    _require_perm(current_user, "regulatory.read")
    try:
        row = await svc.get_submission(db, submission_id, current_user.company_id)
    except RegulatorySubmissionError as e:
        raise _map_error(e)
    return RegulatorySubmissionResponse.model_validate(row)


@router.post("/{submission_id}/submit", response_model=RegulatorySubmissionResponse)
async def mark_submitted(
    submission_id: UUID,
    body: SubmissionMarkSubmitted | None = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
) -> RegulatorySubmissionResponse:
    _require_perm(current_user, "regulatory.submit")
    try:
        row = await svc.mark_submitted(
            db, submission_id, current_user.company_id, current_user.id,
            submitted_at=body.submitted_at if body else None,
        )
    except RegulatorySubmissionError as e:
        raise _map_error(e)
    return RegulatorySubmissionResponse.model_validate(row)


@router.post("/{submission_id}/acknowledge", response_model=RegulatorySubmissionResponse)
async def acknowledge(
    submission_id: UUID,
    body: AcknowledgmentRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
) -> RegulatorySubmissionResponse:
    _require_perm(current_user, "regulatory.acknowledge")
    try:
        row = await svc.acknowledge(
            db, submission_id, current_user.company_id, current_user.id,
            ack_reference=body.ack_reference,
            ack_received_at=body.ack_received_at,
        )
    except RegulatorySubmissionError as e:
        raise _map_error(e)
    return RegulatorySubmissionResponse.model_validate(row)


@router.post("/{submission_id}/reject", response_model=RegulatorySubmissionResponse)
async def reject(
    submission_id: UUID,
    body: RejectionRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
) -> RegulatorySubmissionResponse:
    _require_perm(current_user, "regulatory.acknowledge")
    try:
        row = await svc.reject(
            db, submission_id, current_user.company_id, current_user.id,
            rejection_reason=body.rejection_reason,
        )
    except RegulatorySubmissionError as e:
        raise _map_error(e)
    return RegulatorySubmissionResponse.model_validate(row)


@router.post("/{submission_id}/mark-failed", response_model=RegulatorySubmissionResponse)
async def mark_failed(
    submission_id: UUID,
    body: RejectionRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_plan_tier("professional")),
) -> RegulatorySubmissionResponse:
    _require_perm(current_user, "regulatory.acknowledge")
    try:
        row = await svc.mark_failed(
            db, submission_id, current_user.company_id, current_user.id,
            reason=body.rejection_reason,
        )
    except RegulatorySubmissionError as e:
        raise _map_error(e)
    return RegulatorySubmissionResponse.model_validate(row)
