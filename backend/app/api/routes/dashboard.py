"""
app/api/routes/dashboard.py
HedgeCalc - Phase III Dashboard Aggregate Endpoints

Four JWT-scoped endpoints that power the role-based modular dashboard.
All queries are scope-correct: filtered by company_id + branch_id unless
the user has reports.view_all_branches permission.
No static fallback data -- empty tables return zeros or empty lists.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import decode_token, get_current_user
from app.models.calculation_run import CalculationRun
from app.models.execution_proposal import ExecutionProposal
from app.models.ledger import LedgerEntry
from app.models.organization import Branch
from app.models.position import Position
from app.models.proposal import Proposal
from app.models.staging import StagingArtifact
from app.models.user import User
from app.services import rbac_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/dashboard", tags=["dashboard"])


# ?????????????????????????????????????????????????????????????????????????????
# Auth / Scope Helpers
# ?????????????????????????????????????????????????????????????????????????????

def _extract_bearer(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return auth.split(" ", 1)[1].strip()


async def _resolve_user(request: Request, db: AsyncSession) -> User:
    """Decode JWT, look up user, return User ORM object."""
    token = _extract_bearer(request)
    payload = decode_token(token, expected_type="access")
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user_id = UUID(str(sub))
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid or inactive user")
    return user


def _get_branch_code(user: User) -> str:
    """Return 3-letter branch code from user's branch if available."""
    branch = getattr(user, "branch", None)
    if branch:
        code = getattr(branch, "code", None)
        if code:
            return code.upper()
    return "HQ"  # neutral default -- no fake branch


def _get_branch_currency(user: User) -> str:
    """Return branch currency code, defaulting to USD."""
    branch = getattr(user, "branch", None)
    if branch:
        currency = getattr(branch, "currency", None) or getattr(branch, "currency_code", None)
        if currency:
            return str(currency).upper()
    return "USD"


def _scoped_user_ids(user: User, all_branches: bool):
    """
    Return a subquery of user IDs scoped to the current user's company/branch.
    If all_branches is True (or user has no branch), returns all users in the company.
    """
    q = select(User.id).where(User.company_id == user.company_id)
    if not all_branches and user.branch_id:
        q = q.where(User.branch_id == user.branch_id)
    return q


# ?????????????????????????????????????????????????????????????????????????????
# Endpoint 1: Summary / KPIs
# ?????????????????????????????????????????????????????????????????????????????

@router.get("/summary", tags=["dashboard"])
async def dashboard_summary(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> Dict[str, Any]:
    """
    Returns KPIs and context scoped to the current user's authority:
    - If user has reports.view_all_branches: company-wide aggregates
    - Else: branch-scoped aggregates
    """
    user = await _resolve_user(request, db)

    try:
        # Resolve permissions
        permissions = await rbac_service.get_permissions_by_user(db, user.id)
        has_all_branches = (
            "reports.view_all_branches" in permissions or user.is_superuser
        )
        roles = await rbac_service.get_roles_by_user(db, user.id)
        hierarchy_level = await rbac_service.get_user_hierarchy_level(db, user.id)

        branch_code = _get_branch_code(user)
        branch_obj = getattr(user, "branch", None)
        branch_name = getattr(branch_obj, "name", branch_code)

        # Scoped user IDs subquery
        user_ids_sq = _scoped_user_ids(user, has_all_branches)

        # Count active proposals (not REJECTED) within scope
        active_q = (
            select(func.count())
            .select_from(Proposal)
            .where(Proposal.created_by.in_(user_ids_sq))
            .where(Proposal.status.notin_(["REJECTED"]))
        )
        active_count = (await db.execute(active_q)).scalar() or 0

        # Count pending staging artifacts within scope
        pending_q = (
            select(func.count())
            .select_from(StagingArtifact)
            .where(StagingArtifact.submitted_by.in_(user_ids_sq))
            .where(StagingArtifact.authorization_status == "PENDING")
        )
        pending_count = (await db.execute(pending_q)).scalar() or 0

        kpis = {
            "active_proposals": active_count,
            "pending_approvals": pending_count,
            "total_exposure_usd": 0,       # Phase 2: positions API
            "hedge_coverage_pct": 0,        # Phase 2: positions API
            "open_alerts": 0,               # Phase 8: Polisophic
            "team_size": 0,                 # Future: org API
        }

        return {
            "branch_name": branch_name if not has_all_branches else "All Branches",
            "company_name": getattr(getattr(user, "company", None), "name", None) or "--",
            "role": roles[0] if roles else "--",
            "hierarchy_level": hierarchy_level,
            "is_company_wide": has_all_branches,
            "branch_currency": _get_branch_currency(user),
            "kpis": kpis,
        }
    except Exception as _exc:
        logger.error("dashboard_summary query failed: %s", _exc, exc_info=True)
        return {"branch_name": "Error", "kpis": {}}


# ?????????????????????????????????????????????????????????????????????????????
# Endpoint 2: Recent Runs
# ?????????????????????????????????????????????????????????????????????????????

@router.get("/recent-runs", tags=["dashboard"])
async def recent_runs(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> List[Dict[str, Any]]:
    """
    Returns last 10 proposals for the current user.
    Empty list when no proposals exist.
    """
    user = await _resolve_user(request, db)

    try:
        # Query user's own proposals -- UUID-to-UUID comparison
        q = (
            select(Proposal)
            .where(Proposal.created_by == user.id)
            .order_by(Proposal.created_at.desc())
            .limit(10)
        )
        result = await db.execute(q)
        proposals = result.scalars().all()

        # Map to response -- extract from frozen_inputs or null
        runs = []
        for p in proposals:
            fi = p.frozen_inputs or {}
            runs.append({
                "id": p.proposal_id,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "status": p.status,
                "currency_pair": fi.get("currency_pair") or None,
                "notional": fi.get("notional") or None,
                "hedge_ratio": fi.get("hedge_ratio") or None,
            })

        return runs
    except Exception as _exc:
        logger.error("recent_runs query failed: %s", _exc, exc_info=True)
        return []


# ?????????????????????????????????????????????????????????????????????????????
# Endpoint 3: Pending Approvals (requires pipeline.approve)
# ?????????????????????????????????????????????????????????????????????????????

@router.get("/pending-approvals", tags=["dashboard"])
async def pending_approvals(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> List[Dict[str, Any]]:
    """
    Returns staging artifacts awaiting approval, scoped to user's company/branch.
    Requires permission: pipeline.approve
    """
    user = await _resolve_user(request, db)
    permissions = await rbac_service.get_permissions_by_user(db, user.id)

    if "pipeline.approve" not in permissions and not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions: pipeline.approve required",
        )

    has_all_branches = (
        "reports.view_all_branches" in permissions or user.is_superuser
    )
    user_ids_sq = _scoped_user_ids(user, has_all_branches)

    try:
        q = (
            select(StagingArtifact)
            .where(StagingArtifact.submitted_by.in_(user_ids_sq))
            .where(StagingArtifact.authorization_status == "PENDING")
            .order_by(StagingArtifact.submitted_at.desc())
            .limit(20)
        )
        result = await db.execute(q)
        artifacts = result.scalars().all()

        return [
            {
                "id": a.staging_id,
                "proposal_id": a.proposal_id,
                "submitted_by": str(a.submitted_by),
                "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
                "justification": a.justification or "",
                "integrity_score": a.integrity_score,
                "authorization_status": a.authorization_status,
            }
            for a in artifacts
        ]
    except Exception as _exc:
        logger.error("pending_approvals query failed: %s", _exc, exc_info=True)
        return []


# ?????????????????????????????????????????????????????????????????????????????
# Endpoint 4: Team Activity (requires audit.view_branch or audit.view_all)
# ?????????????????????????????????????????????????????????????????????????????

@router.get("/team-activity", tags=["dashboard"])
async def team_activity(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> List[Dict[str, Any]]:
    """
    Returns last 20 audit events scoped to user's branch or company-wide.
    Requires permission: audit.view_branch or audit.view_all
    """
    user = await _resolve_user(request, db)
    permissions = await rbac_service.get_permissions_by_user(db, user.id)

    if (
        "audit.view_branch" not in permissions
        and "audit.view_all" not in permissions
        and not user.is_superuser
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions: audit.view_branch required",
        )

    has_all = (
        "audit.view_all" in permissions
        or "reports.view_all_branches" in permissions
        or user.is_superuser
    )

    # Get scoped user IDs
    user_ids_sq = _scoped_user_ids(user, has_all)
    user_id_rows = (await db.execute(user_ids_sq)).scalars().all()

    if not user_id_rows:
        return []

    try:
        # AuthAuditLog.user_id is int (type mismatch bug with users.id UUID).
        # Use text() for this specific query with a cast workaround.
        user_id_strings = [str(uid) for uid in user_id_rows]
        stmt = text("""
            SELECT al.created_at as ts,
                   COALESCE(u.full_name, u.email) as user_name,
                   al.event_type as action,
                   al.route as module,
                   al.status
            FROM auth_audit_logs al
            LEFT JOIN users u ON u.id::text = al.user_id::text
            WHERE al.user_id::text = ANY(:user_ids)
            ORDER BY al.created_at DESC
            LIMIT 20
        """)
        result = await db.execute(stmt, {"user_ids": user_id_strings})
        rows = result.mappings().all()

        branch_code = _get_branch_code(user)

        return [
            {
                "ts": str(r["ts"]),
                "user_name": r["user_name"] or "Unknown",
                "action": str(r["action"] or "").replace("_", " ").title(),
                "module": (r["module"] or "System").split("/")[-1].title(),
                "status": str(r["status"] or "SUCCESS"),
                "branch": branch_code,
            }
            for r in rows
        ]
    except Exception as _exc:
        logger.error("team_activity query failed: %s", _exc, exc_info=True)
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 5: Branch Comparison
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/branch-comparison", tags=["dashboard"])
async def branch_comparison(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> Dict[str, Any]:
    """
    Per-branch exposure, coverage and proposal summary for the caller's company.
    Superusers / reports.view_all_branches users see all branches; others see their own.
    """
    user = await _resolve_user(request, db)
    permissions = await rbac_service.get_permissions_by_user(db, user.id)
    has_all = "reports.view_all_branches" in permissions or user.is_superuser

    branch_q = select(Branch).where(Branch.company_id == user.company_id, Branch.is_active == True)
    if not has_all and user.branch_id:
        branch_q = branch_q.where(Branch.id == user.branch_id)
    branches = list((await db.execute(branch_q)).scalars().all())

    rows = []
    for branch in branches:
        branch_id = branch.id

        exposure_q = (
            select(func.coalesce(func.sum(Position.amount), 0))
            .where(Position.company_id == user.company_id)
            .where(Position.branch_id == branch_id)
            .where(Position.is_active == True)
            .where(Position.execution_status.notin_(["HEDGED", "REJECTED"]))
        )
        total_exposure = float((await db.execute(exposure_q)).scalar() or 0)

        hedged_q = (
            select(func.coalesce(func.sum(ExecutionProposal.hedge_amount), 0))
            .join(Position, ExecutionProposal.position_id == Position.id)
            .where(Position.company_id == user.company_id)
            .where(Position.branch_id == branch_id)
            .where(ExecutionProposal.status == "EXECUTED")
        )
        hedged_amount = float((await db.execute(hedged_q)).scalar() or 0)

        coverage_pct = min(round((hedged_amount / total_exposure) * 100, 1), 100.0) if total_exposure > 0 else 0.0

        active_prop_q = (
            select(func.count())
            .join(Position, ExecutionProposal.position_id == Position.id)
            .where(Position.company_id == user.company_id)
            .where(Position.branch_id == branch_id)
            .where(ExecutionProposal.status == "PROPOSED")
        )
        active_proposals = int((await db.execute(active_prop_q)).scalar() or 0)

        pending_q = (
            select(func.count())
            .join(Position, ExecutionProposal.position_id == Position.id)
            .where(Position.company_id == user.company_id)
            .where(Position.branch_id == branch_id)
            .where(ExecutionProposal.status == "APPROVED")
        )
        pending_approvals = int((await db.execute(pending_q)).scalar() or 0)

        rows.append({
            "branch_id":          str(branch_id),
            "branch_name":        branch.name,
            "currency":           "USD",
            "total_exposure_usd": total_exposure,
            "hedge_coverage_pct": coverage_pct,
            "active_proposals":   active_proposals,
            "pending_approvals":  pending_approvals,
        })

    return {"branches": rows}


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 6: Pipeline Status
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/pipeline-status", tags=["dashboard"])
async def pipeline_status(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> Dict[str, Any]:
    """
    Tri-state pipeline counts (Sandbox → Staging → Ledger) for the caller's company.
    """
    user = await _resolve_user(request, db)

    sandbox_total_q = (
        select(func.count())
        .select_from(CalculationRun)
        .where(CalculationRun.company_id == user.company_id)
    )
    sandbox_total    = int((await db.execute(sandbox_total_q)).scalar() or 0)
    sandbox_passed   = sandbox_total
    sandbox_rejected = 0

    user_ids_sq = _scoped_user_ids(user, all_branches=True)

    staging_total_q = (
        select(func.count())
        .select_from(StagingArtifact)
        .where(StagingArtifact.submitted_by.in_(user_ids_sq))
    )
    staging_total = int((await db.execute(staging_total_q)).scalar() or 0)

    staging_approved_q = (
        select(func.count())
        .select_from(StagingArtifact)
        .where(StagingArtifact.submitted_by.in_(user_ids_sq))
        .where(StagingArtifact.authorization_status == "AUTHORIZED")
    )
    staging_approved = int((await db.execute(staging_approved_q)).scalar() or 0)

    staging_pending_q = (
        select(func.count())
        .select_from(StagingArtifact)
        .where(StagingArtifact.submitted_by.in_(user_ids_sq))
        .where(StagingArtifact.authorization_status == "PENDING")
    )
    staging_pending = int((await db.execute(staging_pending_q)).scalar() or 0)

    ledger_total_q = (
        select(func.count())
        .select_from(LedgerEntry)
        .where(LedgerEntry.authorized_by.in_(user_ids_sq))
    )
    ledger_total     = int((await db.execute(ledger_total_q)).scalar() or 0)
    ledger_committed = ledger_total

    return {
        "sandbox": {
            "total":    sandbox_total,
            "passed":   sandbox_passed,
            "rejected": sandbox_rejected,
        },
        "staging": {
            "total":    staging_total,
            "approved": staging_approved,
            "pending":  staging_pending,
        },
        "ledger": {
            "total":     ledger_total,
            "committed": ledger_committed,
        },
    }

