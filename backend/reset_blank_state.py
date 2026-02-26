"""
reset_blank_state.py -- Reset the database to a clean blank state.

Creates:
  - 1 company: DemoCompany
  - 1 branch: Headquarters
  - 1 department: General
  - 37 permissions (full SEED_PERMISSIONS)
  - 9 system roles with permission assignments
  - 1 user: demo/demo (admin, is_superuser=True)

Usage:
    DATABASE_URL="postgresql+asyncpg://..." python reset_blank_state.py
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

# ── Database URL resolution ──────────────────────────────────────────────────
DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://hedgecalc:***REDACTED_DB_PASSWORD***@127.0.0.1:5432/hedgecalc",
)
if DB_URL.startswith("postgres://"):
    DB_URL = DB_URL.replace("postgres://", "postgresql+asyncpg://", 1)
if DB_URL.startswith("postgresql://"):
    DB_URL = DB_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# ── Fixed UUIDs ──────────────────────────────────────────────────────────────
COMPANY_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
BRANCH_HQ_ID = uuid.UUID("22222222-2222-2222-2222-222222222201")
DEPT_GEN_ID = uuid.UUID("33333333-3333-3333-3333-333333333301")

# ── Role definitions (same as seed_company.py) ───────────────────────────────
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

# ── Admin gets ALL permissions ───────────────────────────────────────────────
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
        "trades.view",
        "hedges.view",
        "calculate.run_sandbox",
        "policy.view",
        "market.view",
        "reports.view_own_branch",
        "audit.view_own",
    ],

    "auditor": [
        "trades.view",
        "hedges.view",
        "policy.view",
        "market.view",
        "reports.view_own_branch", "reports.view_all_branches",
        "reports.export_pdf", "reports.export_excel",
        "audit.view_own", "audit.view_branch", "audit.view_all",
    ],
}

# ── Tables to truncate (FK-safe order: children first, parents last) ─────────
TRUNCATE_TABLES = [
    # Audit / logging (no children)
    "audit_events",
    "audit_logs",
    "auth_audit_log",
    "auth_audit_logs",
    "api_key_audit",
    # Tokens & keys
    "refresh_tokens",
    "api_keys",
    # Pipeline artifacts
    "ledger_entries",
    "ledger",
    "anchor_hashes",
    "execution_proposals",
    "approvals",
    "staging_artifacts",
    "staging",
    "proposals",
    # Calculation
    "calculation_runs",
    # Positions & policies
    "positions",
    "user_policy_favorites",
    "policy_revisions",
    "policy_instances",
    "policy_templates",
    # Connectors
    "connector_run_errors",
    "connector_runs",
    # RBAC (must come before roles/users)
    "role_permissions",
    "user_roles",
    # Core entities
    "users",
    "permissions",
    "roles",
    "departments",
    "branches",
    "companies",
]


async def reset():
    print(f"\n{'='*70}")
    print(f"  HEDGECALC BLANK STATE RESET")
    print(f"{'='*70}")
    print(f"  DB: {DB_URL[:60]}...")
    print(f"  Target: DemoCompany + demo/demo admin only")
    print()

    engine = create_async_engine(DB_URL, echo=False)

    # ── Step 1: TRUNCATE all tables ──────────────────────────────────────
    print("  [1/6] Truncating ALL data...")
    async with engine.begin() as conn:
        # Use TRUNCATE CASCADE to handle any FK constraints we might miss
        for table in TRUNCATE_TABLES:
            try:
                await conn.execute(text(f'TRUNCATE TABLE "{table}" CASCADE'))
                print(f"         TRUNCATED  {table}")
            except Exception as e:
                print(f"         SKIP       {table} ({e})")
    print("         All tables cleared.")

    # ── Step 2-6: Seed minimal data ──────────────────────────────────────
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:
        # ── Step 2: Create DemoCompany ───────────────────────────────────
        print("\n  [2/6] Creating DemoCompany...")
        company = Company(
            id=COMPANY_ID,
            name="DemoCompany",
            slug="demo-company",
            domain="democompany.com",
            settings={
                "default_currency": "USD",
                "fiscal_year_start": "January",
                "risk_framework": "Basel III Enhanced",
            },
        )
        session.add(company)
        await session.flush()
        print(f"         Company: DemoCompany (demo-company)")

        # ── Branch: Headquarters ─────────────────────────────────────────
        branch = Branch(
            id=BRANCH_HQ_ID,
            company_id=COMPANY_ID,
            name="Headquarters",
            code="HQ",
            region="Global",
            timezone="UTC",
        )
        session.add(branch)
        await session.flush()
        print(f"         Branch:  Headquarters [HQ]")

        # ── Department: General ──────────────────────────────────────────
        dept = Department(
            id=DEPT_GEN_ID,
            branch_id=BRANCH_HQ_ID,
            name="General",
            code="GEN",
        )
        session.add(dept)
        await session.flush()
        print(f"         Dept:    General [GEN]")

        # ── Step 3: Seed all permissions ─────────────────────────────────
        print("\n  [3/6] Seeding permissions...")
        for codename, module, action, description in SEED_PERMISSIONS:
            session.add(Permission(
                codename=codename, module=module,
                action=action, description=description,
            ))
        await session.flush()
        print(f"         {len(SEED_PERMISSIONS)} permissions seeded")

        # ── Step 4: Seed all roles ───────────────────────────────────────
        print("\n  [4/6] Seeding roles...")
        role_map = {}
        for name, description, level, is_sys in ROLES:
            role = Role(
                name=name, description=description,
                hierarchy_level=level, is_system=is_sys,
                company_id=COMPANY_ID if not is_sys else None,
            )
            session.add(role)
            await session.flush()
            role_map[name] = role
            print(f"         + {name:20s}  level={level:2d}  {'[system]' if is_sys else ''}")

        # ── Assign permissions to roles ──────────────────────────────────
        print("\n  [5/6] Assigning permissions to roles...")
        for role_name, perm_codenames in ROLE_PERMISSIONS.items():
            role = role_map.get(role_name)
            if not role:
                continue
            for codename in perm_codenames:
                perm_result = await session.execute(
                    select(Permission).where(Permission.codename == codename)
                )
                perm = perm_result.scalars().first()
                if perm:
                    session.add(RolePermission(role_id=role.id, permission_id=perm.id))
            print(f"         {role_name:20s} -> {len(perm_codenames)} permissions")
        await session.flush()

        # ── Step 6: Create demo/demo admin user ──────────────────────────
        print("\n  [6/6] Creating demo admin user...")
        demo_user = User(
            email="demo",
            hashed_password=hash_password("demo"),
            full_name="Demo Admin",
            job_title="Platform Administrator",
            is_active=True,
            is_superuser=True,
            company_id=COMPANY_ID,
            branch_id=BRANCH_HQ_ID,
            department_id=DEPT_GEN_ID,
        )
        session.add(demo_user)
        await session.flush()
        print(f"         User:    Demo Admin (demo/demo)")
        print(f"         Role:    admin (is_superuser=True)")

        # Assign admin role
        admin_role = role_map["admin"]
        session.add(UserRole(user_id=demo_user.id, role_id=admin_role.id))
        await session.flush()

        # ── Commit ───────────────────────────────────────────────────────
        await session.commit()

    await engine.dispose()

    # ── Summary ──────────────────────────────────────────────────────────
    print(f"\n{'='*70}")
    print(f"  BLANK STATE RESET COMPLETE")
    print(f"{'='*70}")
    print()
    print(f"  Company:     DemoCompany")
    print(f"  Branch:      Headquarters [HQ]")
    print(f"  Department:  General [GEN]")
    print()
    print(f"  Login:       demo / demo")
    print(f"  Role:        admin (full system access)")
    print(f"  Superuser:   Yes")
    print()
    print(f"  Permissions: {len(SEED_PERMISSIONS)} seeded")
    print(f"  Roles:       {len(ROLES)} seeded (all permission mappings intact)")
    print(f"  Data:        ZERO (no positions, policies, proposals, etc.)")
    print(f"\n{'='*70}\n")


if __name__ == "__main__":
    asyncio.run(reset())
