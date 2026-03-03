"""
seed_smb.py -- Create SMB company for Mexican Trade Client (Pollo Import Co)
Single branch, single dept, solo governance, plan_tier=smb, USD/MXN only.

Usage:
    DATABASE_URL="postgresql+asyncpg://..." python seed_smb.py
"""

import asyncio
import os
import importlib
import uuid
from pathlib import Path

# Import all ORM models
for _f in Path("app/models").glob("*.py"):
    if _f.name not in {"__init__.py"}:
        importlib.import_module(f"app.models.{_f.stem}")

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select
from app.core.db import Base
from app.models.user import User
from app.models.rbac import Role, UserRole
from app.models.organization import Company, Branch, Department
from app.models.permission import Permission, RolePermission, SEED_PERMISSIONS
from app.core.security import hash_password

# ── Database URL ──
DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://hedgecalc:hedgecalc_pw@127.0.0.1:5432/hedgecalc",
)
if DB_URL.startswith("postgres://"):
    DB_URL = DB_URL.replace("postgres://", "postgresql+asyncpg://", 1)
if DB_URL.startswith("postgresql://"):
    DB_URL = DB_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# ── Fixed UUIDs for SMB company ──
SMB_COMPANY_ID = uuid.UUID("44444444-4444-4444-4444-444444444444")
SMB_BRANCH_ID  = uuid.UUID("55555555-5555-5555-5555-555555555501")
SMB_DEPT_ID    = uuid.UUID("66666666-6666-6666-6666-666666666601")

# ── Permissions for senior_analyst (the SMB user role) ──
SMB_PERMISSIONS = [
    "trades.view", "trades.create", "trades.edit", "trades.delete", "trades.import_csv",
    "hedges.view", "hedges.create", "hedges.edit",
    "calculate.run_sandbox", "calculate.run_production",
    "pipeline.create_proposal", "pipeline.submit_staging",
    "pipeline.approve", "pipeline.reject",
    "policy.view", "policy.edit", "policy.activate", "policy.create_preset",
    "market.view", "market.autofill",
    "reports.view_own_branch", "reports.export_pdf",
    "audit.view_own", "audit.view_branch",
]


async def seed_smb():
    print(f"\n{'='*60}")
    print(f"  ORDR TERMINAL -- SMB Company Seed")
    print(f"  Company: Pollo Import Co (Mexican Trade)")
    print(f"{'='*60}")
    print(f"  DB: {DB_URL[:55]}...")

    connect_args = {}
    if "render.com" in DB_URL:
        import ssl
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
        connect_args["ssl"] = ssl_ctx
    engine = create_async_engine(DB_URL, echo=False, connect_args=connect_args)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        print("\n  [1/5] Ensuring tables exist...")
        await conn.run_sync(Base.metadata.create_all)

    async with Session() as session:

        # ── 2. Create Company ──
        print("  [2/5] Creating SMB company...")
        result = await session.execute(select(Company).where(Company.id == SMB_COMPANY_ID))
        company = result.scalars().first()
        if not company:
            company = Company(
                id=SMB_COMPANY_ID,
                name="Pollo Import Co",
                slug="pollo-import",
                domain="polloimport.mx",
                settings={
                    "plan_tier": "smb",
                    "governance_mode": "solo",
                    "default_currency": "MXN",
                    "default_currency_pair": "USD/MXN",
                    "fiscal_year_start": "January",
                },
            )
            session.add(company)
            await session.flush()
            print(f"         + Pollo Import Co (plan_tier=smb, solo mode)")
        else:
            company.settings = {
                **(company.settings or {}),
                "plan_tier": "smb",
                "governance_mode": "solo",
                "default_currency_pair": "USD/MXN",
            }
            print(f"         ~ Pollo Import Co (updated)")

        # ── 3. Create Branch & Department ──
        print("  [3/5] Creating branch & department...")
        result = await session.execute(select(Branch).where(Branch.id == SMB_BRANCH_ID))
        if not result.scalars().first():
            session.add(Branch(
                id=SMB_BRANCH_ID,
                company_id=SMB_COMPANY_ID,
                name="Mexico City HQ",
                code="MXC",
                region="LATAM",
                timezone="America/Mexico_City",
            ))
            print(f"         + Branch: Mexico City HQ")

        result = await session.execute(select(Department).where(Department.id == SMB_DEPT_ID))
        if not result.scalars().first():
            session.add(Department(
                id=SMB_DEPT_ID,
                branch_id=SMB_BRANCH_ID,
                name="Treasury",
                code="TRE",
            ))
            print(f"         + Dept: Treasury")
        await session.flush()

        # ── 4. Ensure roles & permissions exist ──
        print("  [4/5] Checking roles...")
        result = await session.execute(select(Role).where(Role.name == "senior_analyst"))
        role = result.scalars().first()
        if not role:
            print("         ERROR: 'senior_analyst' role not found. Run seed_company.py first.")
            await engine.dispose()
            return
        print(f"         Using role: senior_analyst (id={role.id})")

        # ── 5. Create User ──
        print("  [5/5] Creating user account...")
        result = await session.execute(select(User).where(User.email == "MXN001"))
        user = result.scalars().first()
        if not user:
            user = User(
                email="MXN001",
                hashed_password=hash_password("2026@USD#Pollo"),
                full_name="Pollo Import Admin",
                job_title="Treasury Manager",
                is_active=True,
                is_superuser=False,
                company_id=SMB_COMPANY_ID,
                branch_id=SMB_BRANCH_ID,
                department_id=SMB_DEPT_ID,
            )
            session.add(user)
            await session.flush()
            print(f"         + MXN001 (Pollo Import Admin)")
        else:
            user.hashed_password = hash_password("2026@USD#Pollo")
            user.full_name = "Pollo Import Admin"
            user.company_id = SMB_COMPANY_ID
            user.branch_id = SMB_BRANCH_ID
            user.department_id = SMB_DEPT_ID
            await session.flush()
            print(f"         ~ MXN001 (updated)")

        # Assign role
        existing_ur = await session.execute(
            select(UserRole).where(
                UserRole.user_id == user.id,
                UserRole.role_id == role.id,
            )
        )
        if not existing_ur.scalars().first():
            session.add(UserRole(user_id=user.id, role_id=role.id))
            print(f"         + Assigned senior_analyst role")

        # Commit
        await session.commit()

    await engine.dispose()

    print(f"\n{'='*60}")
    print(f"  SMB SEED COMPLETE")
    print(f"{'='*60}")
    print()
    print(f"  Company:  Pollo Import Co")
    print(f"  Plan:     SMB (lite dashboard, trimmed nav)")
    print(f"  Mode:     Solo (no 4-eyes approval)")
    print(f"  Currency: USD/MXN")
    print()
    print(f"  Login Credentials:")
    print(f"  {'─'*40}")
    print(f"  Username:  MXN001")
    print(f"  Password:  2026@USD#Pollo")
    print(f"  Role:      senior_analyst")
    print(f"  Branch:    Mexico City HQ")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    asyncio.run(seed_smb())
