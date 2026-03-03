"""
v1_admin_reset.py -- POST /v1/admin/reset-demo-data

Superuser-only endpoint that clears all business data for one or more tenant
slugs and (optionally) auto-seeds the MXN001 SMB demo company on first call.

Business data erased (FK-safe order):
  audit_events, anchor_hashes, ledger_entries, execution_proposals,
  approvals, staging_artifacts, proposals, calculation_runs, positions,
  user_policy_favorites, policy_revisions, policy_instances, policy_templates

Users / RBAC / Company rows are NEVER touched.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import get_current_user, hash_password
from app.models.audit_event import AuditEvent, build_audit_event, GENESIS_HASH
from app.models.organization import Branch, Company, Department
from app.models.rbac import Role, UserRole
from app.models.user import User

router = APIRouter(prefix="/v1/admin/reset", tags=["admin-reset"])

# ---------------------------------------------------------------------------
# Fixed UUIDs for MXN001 SMB demo tenant
# ---------------------------------------------------------------------------
MXN001_COMPANY_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")
MXN001_BRANCH_ID  = uuid.UUID("22222222-2222-2222-2222-222222222211")
MXN001_DEPT_ID    = uuid.UUID("22222222-2222-2222-2222-222222222221")

# ---------------------------------------------------------------------------
# Business-data DELETE statements (company_id-scoped, FK-safe)
# Each entry: (label, sql_template, uses_company_id)
# ---------------------------------------------------------------------------
_DELETE_STEPS: list[tuple[str, str]] = [
    (
        "audit_events",
        "DELETE FROM audit_events WHERE company_id = :cid",
    ),
    (
        "anchor_hashes",
        "DELETE FROM anchor_hashes WHERE company_id = :cid",
    ),
    (
        "ledger_entries",
        "DELETE FROM ledger_entries WHERE company_id = :cid",
    ),
    (
        "execution_proposals",
        "DELETE FROM execution_proposals WHERE company_id = :cid",
    ),
    (
        "approvals",
        """DELETE FROM approvals
           WHERE staging_artifact_id IN (
               SELECT id FROM staging_artifacts WHERE company_id = :cid
           )""",
    ),
    (
        "staging_artifacts",
        "DELETE FROM staging_artifacts WHERE company_id = :cid",
    ),
    (
        "proposals",
        "DELETE FROM proposals WHERE company_id = :cid",
    ),
    (
        "calculation_runs",
        "DELETE FROM calculation_runs WHERE company_id = :cid",
    ),
    (
        "positions",
        "DELETE FROM positions WHERE company_id = :cid",
    ),
    (
        "user_policy_favorites",
        """DELETE FROM user_policy_favorites
           WHERE user_id IN (SELECT id FROM users WHERE company_id = :cid)""",
    ),
    (
        "policy_revisions",
        "DELETE FROM policy_revisions WHERE company_id = :cid",
    ),
    (
        "policy_instances",
        "DELETE FROM policy_instances WHERE company_id = :cid",
    ),
    (
        "policy_templates",
        "DELETE FROM policy_templates WHERE company_id = :cid AND is_system = FALSE",
    ),
]


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class ResetTarget(BaseModel):
    tenant_slug: str


class ResetRequest(BaseModel):
    targets: List[ResetTarget]
    confirm: str  # must equal "RESET"


class TableCounts(BaseModel):
    # Dynamic table-name -> rows deleted
    pass


class TenantResetResult(BaseModel):
    tenant_slug: str
    tenant_id: str
    tables_cleared: Dict[str, int]


class ResetResponse(BaseModel):
    reset: bool
    targets: List[TenantResetResult]
    audit_event_ids: List[str]


# ---------------------------------------------------------------------------
# MXN001 SMB auto-seed helper
# ---------------------------------------------------------------------------

async def _seed_mxn001(session: AsyncSession) -> Company:
    """Create MXN001 SMB company + branch + dept + smb_demo admin user."""

    # Company
    company = Company(
        id=MXN001_COMPANY_ID,
        name="SMB Demo MXN",
        slug="mxn001",
        domain="mxn001demo.com",
        settings={
            "default_currency": "MXN",
            "plan_tier": "smb",
            "fiscal_year_start": "January",
        },
        is_active=True,
    )
    session.add(company)
    await session.flush()

    # Branch
    branch = Branch(
        id=MXN001_BRANCH_ID,
        company_id=MXN001_COMPANY_ID,
        name="Mexico City HQ",
        code="MXC",
        region="LATAM",
        timezone="America/Mexico_City",
        is_active=True,
    )
    session.add(branch)
    await session.flush()

    # Department
    dept = Department(
        id=MXN001_DEPT_ID,
        branch_id=MXN001_BRANCH_ID,
        name="FX Desk",
        code="FXD",
    )
    session.add(dept)
    await session.flush()

    # User
    smb_user = User(
        email="smb_demo",
        hashed_password=hash_password("smb_demo"),
        full_name="SMB Demo Admin",
        job_title="Platform Administrator",
        is_active=True,
        is_superuser=True,
        company_id=MXN001_COMPANY_ID,
        branch_id=MXN001_BRANCH_ID,
        department_id=MXN001_DEPT_ID,
    )
    session.add(smb_user)
    await session.flush()

    # Assign admin role
    admin_role_result = await session.execute(
        select(Role).where(Role.name == "admin")
    )
    admin_role = admin_role_result.scalars().first()
    if admin_role:
        session.add(UserRole(user_id=smb_user.id, role_id=admin_role.id))
        await session.flush()

    return company


# ---------------------------------------------------------------------------
# Core reset logic for a single tenant
# ---------------------------------------------------------------------------

async def _reset_tenant(
    session: AsyncSession,
    company: Company,
    current_user: User,
) -> tuple[Dict[str, int], str]:
    """
    Delete all business data for *company* in FK-safe order.
    Returns (counts_dict, audit_event_id).
    """
    company_id_str = str(company.id)
    counts: Dict[str, int] = {}

    async with session.begin_nested():
        for label, sql in _DELETE_STEPS:
            try:
                result = await session.execute(
                    text(sql),
                    {"cid": company.id},
                )
                counts[label] = result.rowcount if result.rowcount >= 0 else 0
            except Exception:
                # Table may not exist or may lack the column — skip gracefully
                counts[label] = 0

    # Emit WORM audit event (AFTER clearing so the audit chain restarts cleanly)
    audit_evt = build_audit_event(
        event_type="SYSTEM",
        description=f"DEMO_DATA_RESET for {company.slug}",
        payload={
            "tenant_slug": company.slug,
            "tenant_id": company_id_str,
            "tables_cleared": counts,
            "triggered_by": current_user.email,
            "triggered_at": datetime.now(timezone.utc).isoformat(),
        },
        prev_event_hash=GENESIS_HASH,
        company_id=company.id,
        actor_id=current_user.id,
        actor_email=current_user.email,
        entity_type="company",
        entity_id=company_id_str,
    )
    session.add(audit_evt)
    await session.flush()

    return counts, str(audit_evt.id)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=ResetResponse,
    summary="Reset demo business data for one or more tenants (superuser only)",
)
async def reset_demo_data(
    body: ResetRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ResetResponse:

    # --- RBAC gate ---
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser access required to reset demo data.",
        )

    # --- Confirm token ---
    if body.confirm != "RESET":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='confirm must equal "RESET".',
        )

    results: list[TenantResetResult] = []
    audit_event_ids: list[str] = []

    for target in body.targets:
        slug = target.tenant_slug.strip().lower()

        # Look up company
        company_result = await db.execute(
            select(Company).where(Company.slug == slug)
        )
        company = company_result.scalars().first()

        if company is None:
            if slug == "mxn001":
                # Auto-create SMB company
                async with db.begin_nested():
                    company = await _seed_mxn001(db)
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Tenant '{slug}' not found.",
                )

        counts, audit_id = await _reset_tenant(db, company, current_user)
        audit_event_ids.append(audit_id)
        results.append(
            TenantResetResult(
                tenant_slug=company.slug,
                tenant_id=str(company.id),
                tables_cleared=counts,
            )
        )

    # Commit all work
    await db.commit()

    return ResetResponse(
        reset=True,
        targets=results,
        audit_event_ids=audit_event_ids,
    )
