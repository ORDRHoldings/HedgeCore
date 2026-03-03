"""
seed_smb_mxn001.py -- Idempotent seed for the MXN001 SMB demo company.

Creates (if not already present):
  - Company:    SMB Demo MXN  (slug: mxn001, id: 22222222-...-222222222222)
  - Branch:     Mexico City HQ [MXC]
  - Department: FX Desk [FXD]
  - User:       smb_demo / smb_demo  (admin, is_superuser=True)
  - UserRole:   admin role assigned

Idempotent: if company already exists, script exits with a success message
and makes no changes.

Usage:
    DATABASE_URL="postgresql+asyncpg://..." python seed_smb_mxn001.py
"""

import asyncio
import importlib
import os
import sys
import uuid
from pathlib import Path

# ── Import all ORM models so Base.metadata is fully populated ────────────────
for _f in Path("app/models").glob("*.py"):
    if _f.name not in {"__init__.py"}:
        importlib.import_module(f"app.models.{_f.stem}")

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.organization import Branch, Company, Department
from app.models.rbac import Role, UserRole
from app.models.user import User
from app.core.security import hash_password

# ── Database URL resolution ──────────────────────────────────────────────────
DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://hedgecalc:hedgecalc_pw@127.0.0.1:5432/hedgecalc",
)
if DB_URL.startswith("postgres://"):
    DB_URL = DB_URL.replace("postgres://", "postgresql+asyncpg://", 1)
if DB_URL.startswith("postgresql://"):
    DB_URL = DB_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# ── Fixed UUIDs (canonical — must match v1_admin_reset.py) ──────────────────
COMPANY_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")
BRANCH_ID  = uuid.UUID("22222222-2222-2222-2222-222222222211")
DEPT_ID    = uuid.UUID("22222222-2222-2222-2222-222222222221")


async def seed():
    print(f"\n{'='*70}")
    print(f"  MXN001 SMB DEMO SEED")
    print(f"{'='*70}")
    print(f"  DB: {DB_URL[:60]}...")
    print()

    engine = create_async_engine(DB_URL, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as session:

        # ── Idempotency check ────────────────────────────────────────────────
        existing = await session.execute(
            select(Company).where(Company.slug == "mxn001")
        )
        company = existing.scalars().first()

        if company is not None:
            print(f"  [SKIP] Company 'mxn001' already exists (id={company.id}).")
            print(f"         No changes made.\n")
            await engine.dispose()
            return

        # ── Create Company ───────────────────────────────────────────────────
        print("  [1/5] Creating company SMB Demo MXN...")
        company = Company(
            id=COMPANY_ID,
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
        print(f"         Company:    SMB Demo MXN  (slug=mxn001, id={COMPANY_ID})")

        # ── Create Branch ────────────────────────────────────────────────────
        print("  [2/5] Creating branch Mexico City HQ...")
        branch = Branch(
            id=BRANCH_ID,
            company_id=COMPANY_ID,
            name="Mexico City HQ",
            code="MXC",
            region="LATAM",
            timezone="America/Mexico_City",
            is_active=True,
        )
        session.add(branch)
        await session.flush()
        print(f"         Branch:     Mexico City HQ [MXC]")

        # ── Create Department ────────────────────────────────────────────────
        print("  [3/5] Creating department FX Desk...")
        dept = Department(
            id=DEPT_ID,
            branch_id=BRANCH_ID,
            name="FX Desk",
            code="FXD",
        )
        session.add(dept)
        await session.flush()
        print(f"         Department: FX Desk [FXD]")

        # ── Create User ──────────────────────────────────────────────────────
        print("  [4/5] Creating smb_demo admin user...")
        smb_user = User(
            email="smb_demo",
            hashed_password=hash_password("smb_demo"),
            full_name="SMB Demo Admin",
            job_title="Platform Administrator",
            is_active=True,
            is_superuser=True,
            company_id=COMPANY_ID,
            branch_id=BRANCH_ID,
            department_id=DEPT_ID,
        )
        session.add(smb_user)
        await session.flush()
        print(f"         User:       smb_demo / smb_demo  (is_superuser=True)")

        # ── Assign admin role ────────────────────────────────────────────────
        print("  [5/5] Assigning admin role...")
        admin_result = await session.execute(
            select(Role).where(Role.name == "admin")
        )
        admin_role = admin_result.scalars().first()

        if admin_role:
            session.add(UserRole(user_id=smb_user.id, role_id=admin_role.id))
            await session.flush()
            print(f"         Role:       admin (id={admin_role.id})")
        else:
            print(f"         [WARN] 'admin' role not found — user created without role assignment.")
            print(f"                Run reset_blank_state.py first to seed roles, then re-run this script.")

        # ── Commit ───────────────────────────────────────────────────────────
        await session.commit()

    await engine.dispose()

    print(f"\n{'='*70}")
    print(f"  MXN001 SMB SEED COMPLETE")
    print(f"{'='*70}")
    print()
    print(f"  Company:     SMB Demo MXN")
    print(f"  Slug:        mxn001")
    print(f"  Branch:      Mexico City HQ [MXC]")
    print(f"  Department:  FX Desk [FXD]")
    print()
    print(f"  Login:       smb_demo / smb_demo")
    print(f"  Superuser:   Yes")
    print(f"  Role:        admin")
    print(f"\n{'='*70}\n")


if __name__ == "__main__":
    asyncio.run(seed())
