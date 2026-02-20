# app/api/routes/seed.py
"""
One-time seed endpoint to populate the demo company with full hierarchy,
roles, and sample employees. Protected by API key.

POST /api/v1/seed/company
"""

from __future__ import annotations

import logging
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User
from app.models.rbac import Role, UserRole
from app.models.organization import Company, Branch, Department
from app.models.permission import Permission, RolePermission, SEED_PERMISSIONS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/seed", tags=["seed"])

# ── Fixed UUIDs ──────────────────────────────────────────────────────────────
COMPANY_ID   = uuid.UUID("11111111-1111-1111-1111-111111111111")
BRANCH_HQ_ID = uuid.UUID("22222222-2222-2222-2222-222222222201")
BRANCH_MX_ID = uuid.UUID("22222222-2222-2222-2222-222222222202")
BRANCH_LN_ID = uuid.UUID("22222222-2222-2222-2222-222222222203")
DEPT_FX_HQ   = uuid.UUID("33333333-3333-3333-3333-333333333301")
DEPT_TR_HQ   = uuid.UUID("33333333-3333-3333-3333-333333333302")
DEPT_FX_MX   = uuid.UUID("33333333-3333-3333-3333-333333333303")
DEPT_FX_LN   = uuid.UUID("33333333-3333-3333-3333-333333333304")

ROLES = [
    ("admin",          "Full system access",                             0,  True),
    ("cfo",            "Chief Financial Officer — company-wide oversight", 1,  False),
    ("head_of_risk",   "Head of Risk — cross-branch risk governance",    2,  False),
    ("branch_manager", "Branch Manager — branch operations oversight",    3,  False),
    ("supervisor",     "Supervisor — approve/reject staged artifacts",    5,  True),
    ("senior_analyst", "Senior FX Analyst — production calculations",     7,  False),
    ("risk_analyst",   "Risk Analyst — sandbox analysis & proposals",    10,  True),
    ("junior_analyst", "Junior Analyst — view-only with limited actions",15,  False),
    ("auditor",        "Compliance Auditor — read-only audit access",    12,  False),
]

ROLE_PERMS = {
    "admin": [p[0] for p in SEED_PERMISSIONS],
    "cfo": [
        "trades.view", "hedges.view", "calculate.run_sandbox",
        "pipeline.approve", "pipeline.reject", "pipeline.authorize_ledger",
        "policy.view", "policy.edit", "market.view",
        "reports.view_own_branch", "reports.view_all_branches",
        "reports.export_pdf", "reports.export_excel",
        "users.view", "company.view_settings", "company.edit_settings",
        "audit.view_own", "audit.view_branch", "audit.view_all",
        "overrides.override_subordinate",
    ],
    "head_of_risk": [
        "trades.view", "trades.create", "trades.edit", "trades.delete", "trades.import_csv",
        "hedges.view", "hedges.create", "hedges.edit", "hedges.delete",
        "calculate.run_sandbox", "calculate.run_production",
        "pipeline.create_proposal", "pipeline.submit_staging",
        "pipeline.approve", "pipeline.reject", "pipeline.authorize_ledger",
        "policy.view", "policy.edit", "policy.create_preset",
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
        "policy.view", "policy.edit",
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
        "policy.view", "policy.edit",
        "market.view", "market.edit", "market.autofill",
        "reports.view_own_branch", "reports.view_all_branches",
        "reports.export_pdf", "reports.export_excel",
        "users.view",
        "audit.view_own", "audit.view_branch",
        "overrides.override_subordinate",
    ],
    "senior_analyst": [
        "trades.view", "trades.create", "trades.edit", "trades.import_csv",
        "hedges.view", "hedges.create", "hedges.edit",
        "calculate.run_sandbox", "calculate.run_production",
        "pipeline.create_proposal", "pipeline.submit_staging",
        "policy.view",
        "market.view", "market.autofill",
        "reports.view_own_branch", "reports.export_pdf",
        "audit.view_own",
    ],
    "risk_analyst": [
        "trades.view", "trades.create", "trades.edit", "trades.import_csv",
        "hedges.view", "hedges.create", "hedges.edit",
        "calculate.run_sandbox",
        "pipeline.create_proposal",
        "policy.view",
        "market.view", "market.autofill",
        "reports.view_own_branch", "reports.export_pdf",
        "audit.view_own",
    ],
    "junior_analyst": [
        "trades.view", "hedges.view", "calculate.run_sandbox",
        "policy.view", "market.view",
        "reports.view_own_branch", "audit.view_own",
    ],
    "auditor": [
        "trades.view", "hedges.view", "policy.view", "market.view",
        "reports.view_own_branch", "reports.view_all_branches",
        "reports.export_pdf", "reports.export_excel",
        "audit.view_own", "audit.view_branch", "audit.view_all",
    ],
}

EMPLOYEES = [
    ("admin@synexcapital.com",       "Admin@2026!",     "System Administrator",   "Platform Admin",              "admin",          BRANCH_HQ_ID, DEPT_TR_HQ),
    ("r.chen@synexcapital.com",      "RChen@2026!",     "Richard Chen",           "Chief Financial Officer",     "cfo",            BRANCH_HQ_ID, DEPT_TR_HQ),
    ("s.williams@synexcapital.com",  "SWill@2026!",     "Sarah Williams",         "Head of FX Risk",            "head_of_risk",   BRANCH_HQ_ID, DEPT_FX_HQ),
    ("m.johnson@synexcapital.com",   "MJohn@2026!",     "Marcus Johnson",         "Senior FX Strategist",       "senior_analyst", BRANCH_HQ_ID, DEPT_FX_HQ),
    ("e.nakamura@synexcapital.com",  "ENaka@2026!",     "Emily Nakamura",         "FX Risk Analyst",            "risk_analyst",   BRANCH_HQ_ID, DEPT_FX_HQ),
    ("d.park@synexcapital.com",      "DPark@2026!",     "David Park",             "Compliance Auditor",         "auditor",        BRANCH_HQ_ID, DEPT_TR_HQ),
    ("j.ramirez@synexcapital.com",   "JRami@2026!",     "Javier Ramirez",         "Branch Manager — LATAM",     "branch_manager", BRANCH_MX_ID, DEPT_FX_MX),
    ("c.ortega@synexcapital.com",    "COrtg@2026!",     "Camila Ortega",          "FX Desk Supervisor",         "supervisor",     BRANCH_MX_ID, DEPT_FX_MX),
    ("a.santos@synexcapital.com",    "ASant@2026!",     "Andres Santos",          "Senior LATAM Analyst",       "senior_analyst", BRANCH_MX_ID, DEPT_FX_MX),
    ("l.garcia@synexcapital.com",    "LGarc@2026!",     "Lucia Garcia",           "FX Risk Analyst",            "risk_analyst",   BRANCH_MX_ID, DEPT_FX_MX),
    ("p.hernandez@synexcapital.com", "PHern@2026!",     "Pablo Hernandez",        "Junior Analyst",             "junior_analyst", BRANCH_MX_ID, DEPT_FX_MX),
    ("n.baker@synexcapital.com",     "NBake@2026!",     "Natasha Baker",          "Branch Manager — EMEA",      "branch_manager", BRANCH_LN_ID, DEPT_FX_LN),
    ("t.okonkwo@synexcapital.com",   "TOkon@2026!",     "Tunde Okonkwo",          "FX Desk Supervisor",         "supervisor",     BRANCH_LN_ID, DEPT_FX_LN),
    ("k.mueller@synexcapital.com",   "KMuel@2026!",     "Katrin Mueller",         "Senior EMEA Analyst",        "senior_analyst", BRANCH_LN_ID, DEPT_FX_LN),
    ("j.patel@synexcapital.com",     "JPate@2026!",     "Jai Patel",              "FX Risk Analyst",            "risk_analyst",   BRANCH_LN_ID, DEPT_FX_LN),
]


@router.post("/company")
async def seed_company(
    db: AsyncSession = Depends(get_session),
    x_api_key: str = Header(..., alias="X-API-Key"),
):
    """One-time seed: create company, branches, departments, roles, users."""
    # Verify API key
    expected_keys = [
        getattr(settings, "HC_MASTER_KEY", None),
        "HC_DEV_KEY_001",
    ]
    if x_api_key not in [k for k in expected_keys if k]:
        raise HTTPException(status_code=403, detail="Invalid API key")

    results = {"permissions": 0, "roles": 0, "branches": 0, "departments": 0, "users": 0}

    try:
        # ── Migrate: create new tables + add missing columns to existing ──
        from app.core.db import async_engine, Base
        import importlib
        from pathlib import Path
        models_dir = Path(__file__).resolve().parent.parent.parent / "models"
        for f in models_dir.glob("*.py"):
            if f.name != "__init__.py":
                importlib.import_module(f"app.models.{f.stem}")

        # Create brand new tables (companies, branches, departments, permissions, role_permissions)
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        # Add missing columns to existing tables via ALTER TABLE (safe — IF NOT EXISTS)
        alter_statements = [
            # Users table — new org columns
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(128)",
            # Roles table — new hierarchy columns
            "ALTER TABLE roles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE",
            "ALTER TABLE roles ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER DEFAULT 10 NOT NULL",
            "ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE NOT NULL",
        ]
        async with async_engine.begin() as conn:
            for stmt in alter_statements:
                try:
                    await conn.execute(text(stmt))
                except Exception as e:
                    logger.warning(f"ALTER skipped: {e}")
        logger.info("Schema migration complete")

        # ── Permissions ──
        for codename, module, action, desc in SEED_PERMISSIONS:
            r = await db.execute(select(Permission).where(Permission.codename == codename))
            if not r.scalar_one_or_none():
                db.add(Permission(codename=codename, module=module, action=action, description=desc))
                results["permissions"] += 1
        await db.flush()

        # ── Roles ──
        role_map = {}
        for name, desc, level, is_sys in ROLES:
            r = await db.execute(select(Role).where(Role.name == name))
            role = r.scalar_one_or_none()
            if not role:
                role = Role(name=name, description=desc, hierarchy_level=level,
                            is_system=is_sys, company_id=COMPANY_ID if not is_sys else None)
                db.add(role)
                await db.flush()
                results["roles"] += 1
            else:
                role.hierarchy_level = level
                role.description = desc
            role_map[name] = role
        await db.flush()

        # ── Role permissions ──
        for role_name, codenames in ROLE_PERMS.items():
            role = role_map.get(role_name)
            if not role:
                continue
            for codename in codenames:
                pr = await db.execute(select(Permission).where(Permission.codename == codename))
                perm = pr.scalar_one_or_none()
                if not perm:
                    continue
                er = await db.execute(
                    select(RolePermission).where(
                        RolePermission.role_id == role.id,
                        RolePermission.permission_id == perm.id,
                    )
                )
                if not er.scalar_one_or_none():
                    db.add(RolePermission(role_id=role.id, permission_id=perm.id))
        await db.flush()

        # ── Company ──
        r = await db.execute(select(Company).where(Company.id == COMPANY_ID))
        if not r.scalar_one_or_none():
            db.add(Company(
                id=COMPANY_ID, name="Synex Capital Partners",
                slug="synex-capital", domain="synexcapital.com",
                settings={"default_currency": "USD", "risk_framework": "Basel III Enhanced"},
            ))

        # ── Branches ──
        for bid, bname, bcode, bregion, btz in [
            (BRANCH_HQ_ID, "Headquarters — New York", "NYC", "North America", "America/New_York"),
            (BRANCH_MX_ID, "Mexico City Office",      "MXC", "LATAM",         "America/Mexico_City"),
            (BRANCH_LN_ID, "London Office",            "LDN", "EMEA",          "Europe/London"),
        ]:
            r = await db.execute(select(Branch).where(Branch.id == bid))
            if not r.scalar_one_or_none():
                db.add(Branch(id=bid, company_id=COMPANY_ID, name=bname, code=bcode, region=bregion, timezone=btz))
                results["branches"] += 1
        await db.flush()

        # ── Departments ──
        for did, bid, dname, dcode in [
            (DEPT_FX_HQ, BRANCH_HQ_ID, "FX Risk Desk",        "FXD"),
            (DEPT_TR_HQ, BRANCH_HQ_ID, "Treasury Operations",  "TRE"),
            (DEPT_FX_MX, BRANCH_MX_ID, "FX Desk — LATAM",      "FXL"),
            (DEPT_FX_LN, BRANCH_LN_ID, "FX Desk — EMEA",       "FXE"),
        ]:
            r = await db.execute(select(Department).where(Department.id == did))
            if not r.scalar_one_or_none():
                db.add(Department(id=did, branch_id=bid, name=dname, code=dcode))
                results["departments"] += 1
        await db.flush()

        # ── Users ──
        for email, pw, full_name, job_title, role_name, branch_id, dept_id in EMPLOYEES:
            r = await db.execute(select(User).where(User.email == email))
            user = r.scalar_one_or_none()
            if not user:
                user = User(
                    email=email, hashed_password=hash_password(pw),
                    full_name=full_name, job_title=job_title,
                    is_active=True, is_superuser=(role_name == "admin"),
                    company_id=COMPANY_ID, branch_id=branch_id, department_id=dept_id,
                )
                db.add(user)
                await db.flush()
                results["users"] += 1
            else:
                user.full_name = full_name
                user.job_title = job_title
                user.company_id = COMPANY_ID
                user.branch_id = branch_id
                user.department_id = dept_id
                await db.flush()

            role = role_map.get(role_name)
            if role:
                er = await db.execute(
                    select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)
                )
                if not er.scalar_one_or_none():
                    db.add(UserRole(user_id=user.id, role_id=role.id))

        await db.commit()

        logger.info(f"Company seed complete: {results}")
        return {
            "status": "success",
            "company": "Synex Capital Partners",
            "created": results,
            "total_employees": len(EMPLOYEES),
            "total_roles": len(ROLES),
            "total_permissions": len(SEED_PERMISSIONS),
        }

    except Exception as e:
        await db.rollback()
        logger.exception(f"Seed failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
