"""
Policy Revision API routes — /api/v1/policies/revisions

Provides version-pinning lineage endpoints for policy audit and replay.

Endpoints:
  GET  /v1/policies/revisions/{revision_id}         → single revision detail
  GET  /v1/policies/revisions/instance/{instance_id}→ full history for a policy instance
  GET  /v1/policies/revisions/{a}/diff/{b}           → structured diff between two revisions

Policy revision rows are WORM (append-only at DB level). These endpoints are
read-only — creation is triggered internally by policy activation.

Permissions:
  All endpoints require: reports.view (auditors, analysts) or trades.view (traders)
"""
from __future__ import annotations

import logging
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.user import User
from app.services import rbac_service
from app.services import policy_revision_service as pr_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/policies/revisions", tags=["v1-policy-revisions"])


# ---------------------------------------------------------------------------
# Pydantic response schemas
# ---------------------------------------------------------------------------

class PolicyRevisionResponse(BaseModel):
    id:                 UUID
    policy_instance_id: UUID
    template_id:        UUID
    company_id:         UUID
    branch_id:          Optional[UUID]   = None
    revision:           int
    policy_hash:        str
    canonical_policy:   dict
    created_by:         UUID
    created_by_email:   Optional[str]    = None
    change_reason:      Optional[str]    = None
    prev_revision_id:   Optional[UUID]   = None
    created_at:         str

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_safe(cls, r) -> "PolicyRevisionResponse":
        return cls(
            id                 = r.id,
            policy_instance_id = r.policy_instance_id,
            template_id        = r.template_id,
            company_id         = r.company_id,
            branch_id          = r.branch_id,
            revision           = r.revision,
            policy_hash        = r.policy_hash,
            canonical_policy   = r.canonical_policy or {},
            created_by         = r.created_by,
            created_by_email   = r.created_by_email,
            change_reason      = r.change_reason,
            prev_revision_id   = r.prev_revision_id,
            created_at         = r.created_at.isoformat() if r.created_at else "",
        )


class DiffResponse(BaseModel):
    is_identical:   bool
    fields_added:   list[dict]
    fields_removed: list[dict]
    fields_changed: list[dict]
    summary:        str
    hash_a:         str
    hash_b:         str
    label_a:        str
    label_b:        str


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

async def _check_permission(session: AsyncSession, user: User, codename: str) -> None:
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if codename not in perms:
        raise HTTPException(status_code=403, detail=f"Missing permission: {codename}")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/instance/{instance_id}", response_model=list[PolicyRevisionResponse])
async def list_revisions_for_instance(
    instance_id:  UUID,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Full revision history for a policy instance (all revisions, newest first).
    Requires: trades.view
    """
    await _check_permission(session, current_user, "trades.view")
    revisions = await pr_service.list_revisions(
        session, instance_id, current_user.company_id
    )
    return [PolicyRevisionResponse.from_orm_safe(r) for r in revisions]


@router.get("/{revision_id}", response_model=PolicyRevisionResponse)
async def get_revision(
    revision_id:  UUID,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Single revision detail — includes full canonical_policy snapshot.
    Requires: trades.view
    """
    await _check_permission(session, current_user, "trades.view")
    rev = await pr_service.get_revision(session, revision_id, current_user.company_id)
    if not rev:
        raise HTTPException(status_code=404, detail="Policy revision not found")
    return PolicyRevisionResponse.from_orm_safe(rev)


@router.get("/{revision_a_id}/diff/{revision_b_id}", response_model=DiffResponse)
async def get_revision_diff(
    revision_a_id: UUID,
    revision_b_id: UUID,
    session:       AsyncSession = Depends(get_async_session),
    current_user:  User         = Depends(get_current_user),
):
    """
    Structured diff between two policy revisions.
    Returns fields_added, fields_removed, fields_changed + summary for committee pack.
    Requires: trades.view
    """
    await _check_permission(session, current_user, "trades.view")
    diff = await pr_service.get_diff(
        session, revision_a_id, revision_b_id, current_user.company_id
    )
    if diff is None:
        raise HTTPException(
            status_code=404,
            detail="One or both policy revisions not found or not accessible",
        )
    return DiffResponse(**diff)
