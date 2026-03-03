"""
seed_two_companies.py -- Seed two companies: South (SMB) + DemoCo (Enterprise)

Creates:
  Company 1 - "South" (SMB):
    - Branch: Headquarters
    - Dept: General
    - User: william/william (admin, is_superuser=True)

  Company 2 - "DemoCo" (Enterprise):
    - Branch: Headquarters
    - Dept: General
    - User: demo/demo (admin, is_superuser=True)

  Shared: 37 permissions, 9 roles per company

Usage:
    DATABASE_URL="postgresql+asyncpg://..." python seed_two_companies.py
"""

import asyncio
import os
import sys
import importlib
import uuid
from pathlib import Path

# Import all ORM models first so Base.metadata knows every table
for _f in Path("app/models").glob("*.py"):
    if _f.name not in {"__init__.py"}:
        importlib.import_module(f"app.models.{_f.stem}")

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select, text
from app.core.db import Base
from app.models.user import User
from app.models.rbac import Role, UserRole
from app.models.organization import Company, Branch, Department
from app.models.permission import Permission, RolePermission, SEED_PERMISSIONS
from app.core.security import hash_password

# ── Database URL ─────────────────────────────────────────────────────────────
DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://hedgecalc:hedgecalc_pw@127.0.0.1:5432/hedgecalc",
)
if DB_URL.startswith("postgres://"):
    DB_URL = DB_URL.replace("postgres://", "postgresql+asyncpg://", 1)
if DB_URL.startswith("postgresql://"):
    DB_URL = DB_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# ── Fixed UUIDs ──────────────────────────────────────────────────────────────
# Company 1: South (SMB)
SOUTH_COMPANY_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
SOUTH_BRANCH_ID  = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbb01")
SOUTH_DEPT_ID    = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-cccccccccc01")

# Company 2: DemoCo (Enterprise)
DEMO_COMPANY_ID  = uuid.UUID("11111111-1111-1111-1111-111111111111")
DEMO_BRANCH_ID   = uuid.UUID("22222222-2222-2222-2222-222222222201")
DEMO_DEPT_ID     = uuid.UUID("33333333-3333-3333-3333-333333333301")

# ── Role definitions ─────────────────────────────────────────────────────────
ROLES = [
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

# ── Role → Permission mapping ────────────────────────────────────────────────
ROLE_PERMISSIONS = {
    "admin": [p[0] for p in SEED_PERMISSIONS],
    "cfo": [
        "trades.view", "hedges.view",
        "calculate.run_sandbox",
        "pipeline.approve", "pipeline.reject", "pipeline.authorize_ledger",
        "policy.view", "policy.edit", "policy.activate",
        "market.view",
        "reports.view_own_branch", "reports.view_all_branches",
        "reports.export_pdf", "reports.export_excel",
        "users.view",
        "company.view_settings", "company.edit_settings",
        "audit.view_own", "audit.view_branch", "audit.view_all",
        "overrides.override_subordinate",
    ],
    "head_of_risk": [
        "trades.view", "trades.create", "trades.edit", "trades.delete", "trades.import_csv",
        "hedges.view", "hedges.create", "hedges.edit", "hedges.delete",
        "calculate.run_sandbox", "calculate.run_production",
        "pipeline.create_proposal", "pipeline.submit_staging",
        "pipeline.approve", "pipeline.reject", "pipeline.authorize_ledger",
        "policy.view", "policy.edit", "policy.activate", "policy.create_preset",
        "market.view", "market.edit", "market.autofill",
        "reports.view_own_branch", "reports.view_all_branches",
        "reports.export_pdf", "reports.export_excel",
        "users.view",
        "audit.view_own", "audit.view_branch", "audit.view_all",
        "overrides.override_subordinate",
    ],
    "branch_manager": [
        "trades.view", "trades.create", "trades.edit", "trades.delete", "trades.import_csv",
        "hedges.view", "hedges.create", "hedges.edit", "hedges.delete",
        "calculate.run_sandbox", "calculate.run_production",
        "pipeline.create_proposal", "pipeline.submit_staging",
        "pipeline.approve", "pipeline.reject",
        "policy.view", "policy.edit", "policy.activate",
        "market.view", "market.edit", "market.autofill",
        "reports.view_own_branch", "reports.export_pdf", "reports.export_excel",
        "users.view",
        "audit.view_own", "audit.view_branch",
        "overrides.override_subordinate",
    ],
    "supervisor": [
        "trades.view", "trades.create", "trades.edit", "trades.delete", "trades.import_csv",
        "hedges.view", "hedges.create", "hedges.edit", "hedges.delete",
        "calculate.run_sandbox", "calculate.run_production",
        "pipeline.create_proposal", "pipeline.submit_staging",
        "pipeline.approve", "pipeline.reject",
        "policy.view", "policy.edit", "policy.activate",
        "market.view", "market.edit", "market.autofill",
        "reports.view_own_branch", "reports.view_all_branches",
        "reports.export_pdf", "reports.export_excel",
        "users.view",
        "audit.view_own", "audit.view_branch",
        "overrides.override_subordinate",
    ],
    "senior_analyst": [
        "trades.view", "trades.create", "trades.edit", "trades.delete", "trades.import_csv",
        "hedges.view", "hedges.create", "hedges.edit",
        "calculate.run_sandbox", "calculate.run_production",
        "pipeline.create_proposal", "pipeline.submit_staging",
        "policy.view", "policy.edit", "policy.activate", "policy.create_preset",
        "market.view", "market.autofill",
        "reports.view_own_branch", "reports.export_pdf",
        "audit.view_own", "audit.view_branch",
    ],
    "risk_analyst": [
        "trades.view", "trades.create", "trades.edit", "trades.delete", "trades.import_csv",
        "hedges.view", "hedges.create", "hedges.edit",
        "calculate.run_sandbox", "calculate.run_production",
        "pipeline.create_proposal", "pipeline.submit_staging",
        "policy.view", "policy.edit", "policy.activate", "policy.create_preset",
        "market.view", "market.autofill",
        "reports.view_own_branch", "reports.export_pdf",
        "audit.view_own", "audit.view_branch",
    ],
    "junior_analyst": [
        "trades.view", "hedges.view",
        "calculate.run_sandbox",
        "policy.view", "market.view",
        "reports.view_own_branch",
        "audit.view_own",
    ],
    "auditor": [
        "trades.view", "hedges.view",
        "policy.view", "market.view",
        "reports.view_own_branch", "reports.view_all_branches",
        "reports.export_pdf", "reports.export_excel",
        "audit.view_own", "audit.view_branch", "audit.view_all",
    ],
}

# ── Tables to truncate (FK-safe order) ───────────────────────────────────────
TRUNCATE_TABLES = [
    "audit_events", "audit_logs", "auth_audit_log", "auth_audit_logs", "api_key_audit",
    "refresh_tokens", "api_keys",
    "ledger_entries", "ledger", "anchor_hashes", "execution_proposals",
    "approvals", "staging_artifacts", "staging", "proposals",
    "calculation_runs",
    "positions",
    "user_policy_favorites", "policy_revisions", "policy_instances", "policy_templates",
    "connector_run_errors", "connector_runs",
    "role_permissions", "user_roles",
    "users", "permissions", "roles",
    "departments", "branches", "companies",
]


async def seed_company(session, company_id, branch_id, dept_id, company_name, slug, domain, plan_tier, role_map_out, system_roles_created):
    """Create one company with branch + dept, return nothing. Mutates role_map_out."""
    company = Company(
        id=company_id, name=company_name, slug=slug, domain=domain,
        settings={
            "default_currency": "USD",
            "fiscal_year_start": "January",
            "risk_framework": "Basel III Enhanced",
            "plan_tier": plan_tier,
        },
    )
    session.add(company)
    await session.flush()

    branch = Branch(id=branch_id, company_id=company_id, name="Headquarters", code="HQ", region="Global", timezone="UTC")
    session.add(branch)
    await session.flush()

    dept = Department(id=dept_id, branch_id=branch_id, name="General", code="GEN")
    session.add(dept)
    await session.flush()

    # Roles for this company
    for name, description, level, is_sys in ROLES:
        if is_sys and name in system_roles_created:
            # System roles are global — reuse from first company
            role_map_out[f"{company_id}:{name}"] = system_roles_created[name]
            continue
        role = Role(
            name=name if is_sys else f"{name}_{slug}",
            description=description,
            hierarchy_level=level, is_system=is_sys,
            company_id=company_id if not is_sys else None,
        )
        session.add(role)
        await session.flush()
        role_map_out[f"{company_id}:{name}"] = role
        if is_sys:
            system_roles_created[name] = role

    print(f"         {company_name} ({plan_tier.upper()}) created")


async def assign_permissions(session, role_map, company_id):
    """Assign permissions to all roles for a given company."""
    for role_name, perm_codenames in ROLE_PERMISSIONS.items():
        role = role_map.get(f"{company_id}:{role_name}")
        if not role:
            continue
        for codename in perm_codenames:
            result = await session.execute(select(Permission).where(Permission.codename == codename))
            perm = result.scalars().first()
            if perm:
                session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    await session.flush()


async def create_user(session, email, password, full_name, job_title, company_id, branch_id, dept_id, role_map, role_name="admin"):
    """Create a user and assign a role."""
    user = User(
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name,
        job_title=job_title,
        is_active=True,
        is_superuser=True,
        company_id=company_id,
        branch_id=branch_id,
        department_id=dept_id,
    )
    session.add(user)
    await session.flush()

    role = role_map[f"{company_id}:{role_name}"]
    session.add(UserRole(user_id=user.id, role_id=role.id))
    await session.flush()
    return user


async def seed():
    print(f"\n{'='*70}")
    print(f"  HEDGECALC DUAL-COMPANY SEED")
    print(f"{'='*70}")
    print(f"  DB: {DB_URL[:60]}...")
    print()

    connect_args = {}
    if "render.com" in DB_URL or "dpg-" in DB_URL:
        import ssl as _ssl
        ctx = _ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = _ssl.CERT_NONE
        connect_args["ssl"] = ctx
    engine = create_async_engine(DB_URL, echo=False, connect_args=connect_args)

    # ── Truncate ──────────────────────────────────────────────────────────
    print("  [1/5] Truncating ALL data...")
    async with engine.begin() as conn:
        for table in TRUNCATE_TABLES:
            try:
                await conn.execute(text(f'TRUNCATE TABLE "{table}" CASCADE'))
            except Exception:
                pass
    print("         Done.")

    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        role_map = {}
        system_roles_created = {}

        # ── Companies ─────────────────────────────────────────────────────
        print("\n  [2/5] Creating companies...")
        await seed_company(session, SOUTH_COMPANY_ID, SOUTH_BRANCH_ID, SOUTH_DEPT_ID,
                           "South", "south", "south.com", "smb", role_map, system_roles_created)
        await seed_company(session, DEMO_COMPANY_ID, DEMO_BRANCH_ID, DEMO_DEPT_ID,
                           "DemoCo", "democo", "democo.com", "enterprise", role_map, system_roles_created)

        # ── Permissions (shared, not company-scoped) ──────────────────────
        print("\n  [3/5] Seeding permissions...")
        for codename, module, action, description in SEED_PERMISSIONS:
            session.add(Permission(codename=codename, module=module, action=action, description=description))
        await session.flush()
        print(f"         {len(SEED_PERMISSIONS)} permissions seeded")

        # ── Assign permissions to roles ───────────────────────────────────
        print("\n  [4/5] Assigning permissions to roles...")
        await assign_permissions(session, role_map, SOUTH_COMPANY_ID)
        await assign_permissions(session, role_map, DEMO_COMPANY_ID)
        print("         Done for both companies.")

        # ── Users ─────────────────────────────────────────────────────────
        print("\n  [5/5] Creating users...")
        await create_user(session, "william", "william", "William", "Platform Administrator",
                          SOUTH_COMPANY_ID, SOUTH_BRANCH_ID, SOUTH_DEPT_ID, role_map)
        print("         william/william -> South (SMB, superuser)")

        await create_user(session, "demo", "demo", "Demo Admin", "Platform Administrator",
                          DEMO_COMPANY_ID, DEMO_BRANCH_ID, DEMO_DEPT_ID, role_map)
        print("         demo/demo -> DemoCo (Enterprise, superuser)")

        await session.commit()

    await engine.dispose()

    print(f"\n{'='*70}")
    print(f"  SEED COMPLETE")
    print(f"{'='*70}")
    print()
    print(f"  Company 1:  South (SMB)")
    print(f"    Login:    william / william")
    print(f"    Role:     admin (superuser)")
    print()
    print(f"  Company 2:  DemoCo (Enterprise)")
    print(f"    Login:    demo / demo")
    print(f"    Role:     admin (superuser)")
    print()
    print(f"  Both have: 37 permissions, 9 roles, full RBAC")
    print(f"  Data:      ZERO (blank slate -- positions, policies, hedges persist)")
    print(f"\n{'='*70}\n")


if __name__ == "__main__":
    asyncio.run(seed())
