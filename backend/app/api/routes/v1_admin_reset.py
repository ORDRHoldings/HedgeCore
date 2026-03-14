"""
v1_admin_reset.py -- POST /v1/admin/reset-demo-data

Superuser-only endpoint that clears all business data for one or more tenant
slugs and (optionally) auto-seeds the MXN001 SMB demo company on first call.

Business data erased (FK-safe order):
  anchor_hashes, ledger_entries, execution_proposals,
  approvals, staging_artifacts, proposals, positions,
  user_policy_favorites, policy_instances, policy_templates

WORM tables (audit_events, calculation_runs, policy_revisions) excluded --
append-only per architecture freeze.

Users / RBAC / Company rows are NEVER touched.
"""
import os
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.dependencies import require_superuser
from app.core.security import hash_password
from app.models.audit_event import GENESIS_HASH, build_audit_event
from app.models.organization import Branch, Company, Department
from app.models.permission import SEED_PERMISSIONS, Permission, RolePermission
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
# Fixed UUIDs for dual-company seed
# ---------------------------------------------------------------------------
SOUTH_COMPANY_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
SOUTH_BRANCH_ID  = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbb01")
SOUTH_DEPT_ID    = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-cccccccccc01")

DEMOCO_COMPANY_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
DEMOCO_BRANCH_ID  = uuid.UUID("22222222-2222-2222-2222-222222222201")
DEMOCO_DEPT_ID    = uuid.UUID("33333333-3333-3333-3333-333333333301")

# ---------------------------------------------------------------------------
# Business-data DELETE statements (company_id-scoped, FK-safe)
# Each entry: (label, sql_template, uses_company_id)
# ---------------------------------------------------------------------------
# WORM tables (audit_events, calculation_runs, policy_revisions) excluded — append-only per architecture freeze
_DELETE_STEPS: list[tuple[str, str]] = [
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
        "positions",
        "DELETE FROM positions WHERE company_id = :cid",
    ),
    (
        "user_policy_favorites",
        """DELETE FROM user_policy_favorites
           WHERE user_id IN (SELECT id FROM users WHERE company_id = :cid)""",
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
    targets: list[ResetTarget]
    confirm: str  # must equal "RESET"
class TableCounts(BaseModel):
    # Dynamic table-name -> rows deleted
    pass
class TenantResetResult(BaseModel):
    tenant_slug: str
    tenant_id: str
    tables_cleared: dict[str, int]
class ResetResponse(BaseModel):
    reset: bool
    targets: list[TenantResetResult]
    audit_event_ids: list[str]
# ---------------------------------------------------------------------------
# MXN001 SMB auto-seed helper
# ---------------------------------------------------------------------------

async def _seed_mxn001(session: AsyncSession) -> Company:
    """Create MXN001 SMB company (Pollo Import Co) + branch + dept + MXN001 user.

    Matches the ORDR-Lite-Tutorial.md specification:
      - Company:  Pollo Import Co  (plan_tier=smb, default_currency=MXN)
      - User:     MXN001 / MXN001  (senior_analyst, is_superuser=False)
    """

    # Company
    company = Company(
        id=MXN001_COMPANY_ID,
        name="Pollo Import Co",
        slug="mxn001",
        domain="polloimport.com",
        settings={
            "default_currency": "MXN",
            "plan_tier": "smb",
            "fiscal_year_start": "January",
            "currency_pair": "USD/MXN",
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

    # User — Terminal ID: MXN001, role: senior_analyst (matches tutorial)
    smb_user = User(
        email="MXN001",
        hashed_password=hash_password("MXN001"),
        full_name="Demo User — Pollo Import",
        job_title="FX Risk Analyst",
        is_active=True,
        is_superuser=False,
        company_id=MXN001_COMPANY_ID,
        branch_id=MXN001_BRANCH_ID,
        department_id=MXN001_DEPT_ID,
    )
    session.add(smb_user)
    await session.flush()

    # Assign senior_analyst role (SMB appropriate; falls back to admin if not seeded)
    role_result = await session.execute(
        select(Role).where(Role.name == "senior_analyst")
    )
    smb_role = role_result.scalars().first()
    if not smb_role:
        role_result = await session.execute(select(Role).where(Role.name == "admin"))
        smb_role = role_result.scalars().first()
    if smb_role:
        session.add(UserRole(user_id=smb_user.id, role_id=smb_role.id))
        await session.flush()

    return company
# ---------------------------------------------------------------------------
# Core reset logic for a single tenant
# ---------------------------------------------------------------------------

async def _reset_tenant(
    session: AsyncSession,
    company: Company,
    current_user: User,
) -> tuple[dict[str, int], str]:
    """
    Delete all business data for *company* in FK-safe order.
    Returns (counts_dict, audit_event_id).
    """
    company_id_str = str(company.id)
    counts: dict[str, int] = {}

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
            "triggered_at": datetime.now(UTC).isoformat(),
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
    current_user: User = Depends(require_superuser),
) -> ResetResponse:

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
# ---------------------------------------------------------------------------
# Role definitions for full seed
# ---------------------------------------------------------------------------
_SEED_ROLES = [
    ("admin",          "Full system access -- platform administration",      0,  True),
    ("cfo",            "Chief Financial Officer -- company-wide oversight",   1,  False),
    ("head_of_risk",   "Head of Risk -- cross-branch risk governance",       2,  False),
    ("branch_manager", "Branch Manager -- branch operations oversight",      3,  False),
    ("supervisor",     "Supervisor -- approve/reject staged artifacts",      5,  True),
    ("senior_analyst", "Senior FX Analyst -- production calculations",       7,  False),
    ("risk_analyst",   "Risk Analyst -- sandbox analysis & proposals",      10,  True),
    ("junior_analyst", "Junior Analyst -- view-only with limited actions",  15,  False),
    ("auditor",        "Compliance Auditor -- read-only audit access",      12,  False),
]

_ROLE_PERMS = {
    "admin": [p[0] for p in SEED_PERMISSIONS],
    "cfo": [
        "trades.view","hedges.view","calculate.run_sandbox",
        "pipeline.approve","pipeline.reject","pipeline.authorize_ledger",
        "policy.view","policy.edit","policy.activate","market.view",
        "reports.view_own_branch","reports.view_all_branches",
        "reports.export_pdf","reports.export_excel","users.view",
        "company.view_settings","company.edit_settings",
        "audit.view_own","audit.view_branch","audit.view_all",
        "overrides.override_subordinate",
    ],
    "head_of_risk": [
        "trades.view","trades.create","trades.edit","trades.delete","trades.import_csv",
        "hedges.view","hedges.create","hedges.edit","hedges.delete",
        "calculate.run_sandbox","calculate.run_production",
        "pipeline.create_proposal","pipeline.submit_staging",
        "pipeline.approve","pipeline.reject","pipeline.authorize_ledger",
        "policy.view","policy.edit","policy.activate","policy.create_preset",
        "market.view","market.edit","market.autofill",
        "reports.view_own_branch","reports.view_all_branches",
        "reports.export_pdf","reports.export_excel","users.view",
        "audit.view_own","audit.view_branch","audit.view_all",
        "overrides.override_subordinate",
    ],
    "branch_manager": [
        "trades.view","trades.create","trades.edit","trades.delete","trades.import_csv",
        "hedges.view","hedges.create","hedges.edit","hedges.delete",
        "calculate.run_sandbox","calculate.run_production",
        "pipeline.create_proposal","pipeline.submit_staging",
        "pipeline.approve","pipeline.reject",
        "policy.view","policy.edit","policy.activate",
        "market.view","market.edit","market.autofill",
        "reports.view_own_branch","reports.export_pdf","reports.export_excel",
        "users.view","audit.view_own","audit.view_branch",
        "overrides.override_subordinate",
    ],
    "supervisor": [
        "trades.view","trades.create","trades.edit","trades.delete","trades.import_csv",
        "hedges.view","hedges.create","hedges.edit","hedges.delete",
        "calculate.run_sandbox","calculate.run_production",
        "pipeline.create_proposal","pipeline.submit_staging",
        "pipeline.approve","pipeline.reject",
        "policy.view","policy.edit","policy.activate",
        "market.view","market.edit","market.autofill",
        "reports.view_own_branch","reports.view_all_branches",
        "reports.export_pdf","reports.export_excel","users.view",
        "audit.view_own","audit.view_branch",
        "overrides.override_subordinate",
    ],
    "senior_analyst": [
        "trades.view","trades.create","trades.edit","trades.delete","trades.import_csv",
        "hedges.view","hedges.create","hedges.edit",
        "calculate.run_sandbox","calculate.run_production",
        "pipeline.create_proposal","pipeline.submit_staging",
        "policy.view","policy.edit","policy.activate","policy.create_preset",
        "market.view","market.autofill",
        "reports.view_own_branch","reports.export_pdf",
        "audit.view_own","audit.view_branch",
    ],
    "risk_analyst": [
        "trades.view","trades.create","trades.edit","trades.delete","trades.import_csv",
        "hedges.view","hedges.create","hedges.edit",
        "calculate.run_sandbox","calculate.run_production",
        "pipeline.create_proposal","pipeline.submit_staging",
        "policy.view","policy.edit","policy.activate","policy.create_preset",
        "market.view","market.autofill",
        "reports.view_own_branch","reports.export_pdf",
        "audit.view_own","audit.view_branch",
    ],
    "junior_analyst": [
        "trades.view","hedges.view","calculate.run_sandbox",
        "policy.view","market.view","reports.view_own_branch","audit.view_own",
    ],
    "auditor": [
        "trades.view","hedges.view","policy.view","market.view",
        "reports.view_own_branch","reports.view_all_branches",
        "reports.export_pdf","reports.export_excel",
        "audit.view_own","audit.view_branch","audit.view_all",
    ],
}

# Tables to TRUNCATE (FK-safe order, children first)
# WORM tables (audit_events, calculation_runs, policy_revisions) excluded — append-only per architecture freeze
_TRUNCATE_TABLES = [
    "audit_logs","auth_audit_log","auth_audit_logs","api_key_audit",
    "refresh_tokens","api_keys",
    "ledger_entries","ledger","anchor_hashes","execution_proposals",
    "approvals","staging_artifacts","staging","proposals",
    "positions",
    "user_policy_favorites","policy_instances","policy_templates",
    "connector_run_errors","connector_runs",
    "role_permissions","user_roles",
    "users","permissions","roles",
    "departments","branches","companies",
]
# Pre-built SQL statements — static, no dynamic construction at runtime.
_TRUNCATE_SQL = {t: 'TRUNCATE TABLE "%s" CASCADE' % t for t in _TRUNCATE_TABLES}
_TRUNCATE_STMTS = {t: text(sql) for t, sql in _TRUNCATE_SQL.items()}
# ---------------------------------------------------------------------------
# POST /v1/admin/reset/seed-companies
# Full database reset + seed two companies (superuser only, disabled in production)
# ---------------------------------------------------------------------------

class SeedResponse(BaseModel):
    ok: bool
    companies: list[dict[str, Any]]
@router.post(
    "/seed-companies",
    response_model=SeedResponse,
    summary="Full DB reset + seed South (SMB) and DemoCo (Enterprise)",
)
async def seed_companies(
    request: Request,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_superuser),
) -> SeedResponse:
    """Wipe everything and create two companies with admin users.

    Requires superuser auth. Disabled in production environments.
    """
    if os.environ.get("ENV", "").lower() == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Disabled in production",
        )
    # ── 1. TRUNCATE all tables ────────────────────────────────────────────
    # Table names from hardcoded _TRUNCATE_TABLES (no user input).
    for table in _TRUNCATE_TABLES:
        try:
            await db.execute(_TRUNCATE_STMTS[table])
        except Exception:
            pass

    # ── 2. Seed permissions ───────────────────────────────────────────────
    for codename, module, action, description in SEED_PERMISSIONS:
        db.add(Permission(
            codename=codename, module=module,
            action=action, description=description,
        ))
    await db.flush()

    # ── 3. Create both companies ──────────────────────────────────────────
    companies_cfg = [
        {
            "id": SOUTH_COMPANY_ID, "name": "South", "slug": "south",
            "domain": "south.com", "plan_tier": "smb",
            "branch_id": SOUTH_BRANCH_ID, "dept_id": SOUTH_DEPT_ID,
            "user_email": "william", "user_pass": "william",
            "user_name": "William", "job": "Platform Administrator",
        },
        {
            "id": DEMOCO_COMPANY_ID, "name": "DemoCo", "slug": "democo",
            "domain": "democo.com", "plan_tier": "enterprise",
            "branch_id": DEMOCO_BRANCH_ID, "dept_id": DEMOCO_DEPT_ID,
            "user_email": "demo", "user_pass": "demo",
            "user_name": "Demo Admin", "job": "Platform Administrator",
        },
    ]

    seeded = []

    for cfg in companies_cfg:
        # Company
        company = Company(
            id=cfg["id"], name=cfg["name"], slug=cfg["slug"],
            domain=cfg["domain"],
            settings={
                "default_currency": "USD",
                "fiscal_year_start": "January",
                "risk_framework": "Basel III Enhanced",
                "plan_tier": cfg["plan_tier"],
            },
        )
        db.add(company)
        await db.flush()

        # Branch
        branch = Branch(
            id=cfg["branch_id"], company_id=cfg["id"],
            name="Headquarters", code="HQ", region="Global", timezone="UTC",
        )
        db.add(branch)
        await db.flush()

        # Department
        dept = Department(
            id=cfg["dept_id"], branch_id=cfg["branch_id"],
            name="General", code="GEN",
        )
        db.add(dept)
        await db.flush()

        # Roles for this company
        role_map: dict[str, Role] = {}
        for name, description, level, is_sys in _SEED_ROLES:
            role = Role(
                name=name, description=description,
                hierarchy_level=level, is_system=is_sys,
                company_id=cfg["id"] if not is_sys else None,
            )
            db.add(role)
            await db.flush()
            role_map[name] = role

        # Assign permissions to roles
        for role_name, perm_codes in _ROLE_PERMS.items():
            role = role_map.get(role_name)
            if not role:
                continue
            for codename in perm_codes:
                result = await db.execute(
                    select(Permission).where(Permission.codename == codename)
                )
                perm = result.scalars().first()
                if perm:
                    db.add(RolePermission(role_id=role.id, permission_id=perm.id))
        await db.flush()

        # User
        user = User(
            email=cfg["user_email"],
            hashed_password=hash_password(cfg["user_pass"]),
            full_name=cfg["user_name"],
            job_title=cfg["job"],
            is_active=True,
            is_superuser=True,
            company_id=cfg["id"],
            branch_id=cfg["branch_id"],
            department_id=cfg["dept_id"],
        )
        db.add(user)
        await db.flush()

        # Assign admin role
        db.add(UserRole(user_id=user.id, role_id=role_map["admin"].id))
        await db.flush()

        seeded.append({
            "company": cfg["name"],
            "plan_tier": cfg["plan_tier"],
            "login": cfg["user_email"],
            "superuser": True,
        })

    await db.commit()

    return SeedResponse(ok=True, companies=seeded)
