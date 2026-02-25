"""

seed_company.py -- Create a complete company with branches, departments,

roles, and sample employees for HedgeCalc ORDR Terminal.



Usage:

    # Against Render production DB:

    DATABASE_URL="postgresql+asyncpg://..." python seed_company.py



    # Against local DB:

    python seed_company.py

"""



import asyncio

import os

import sys

import importlib

import uuid

from pathlib import Path



# Import all ORM models first

for _f in Path("app/models").glob("*.py"):

    if _f.name not in {"__init__.py"}:

        importlib.import_module(f"app.models.{_f.stem}")



from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from sqlalchemy import select, text

from app.core.db import Base

from app.models.user import User

from app.models.rbac import Role, UserRole

from app.models.organization import Company, Branch, Department

from app.models.permission import Permission, RolePermission, SEED_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS

from app.core.security import hash_password



# ?? Database URL resolution ??????????????????????????????????????????????????

DB_URL = os.getenv(

    "DATABASE_URL",

    "postgresql+asyncpg://hedgecalc:hedgecalc_pw@127.0.0.1:5432/hedgecalc",

)

# Render gives postgres:// -- convert

if DB_URL.startswith("postgres://"):

    DB_URL = DB_URL.replace("postgres://", "postgresql+asyncpg://", 1)

if DB_URL.startswith("postgresql://"):

    DB_URL = DB_URL.replace("postgresql://", "postgresql+asyncpg://", 1)



# ?? Fixed UUIDs for determinism ??????????????????????????????????????????????

COMPANY_ID   = uuid.UUID("11111111-1111-1111-1111-111111111111")

BRANCH_HQ_ID = uuid.UUID("22222222-2222-2222-2222-222222222201")

BRANCH_MX_ID = uuid.UUID("22222222-2222-2222-2222-222222222202")

BRANCH_LN_ID = uuid.UUID("22222222-2222-2222-2222-222222222203")

DEPT_FX_HQ   = uuid.UUID("33333333-3333-3333-3333-333333333301")

DEPT_TR_HQ   = uuid.UUID("33333333-3333-3333-3333-333333333302")

DEPT_FX_MX   = uuid.UUID("33333333-3333-3333-3333-333333333303")

DEPT_FX_LN   = uuid.UUID("33333333-3333-3333-3333-333333333304")



# ?? Role definitions with hierarchy levels ???????????????????????????????????

ROLES = [

    # (name, description, hierarchy_level, is_system)

    ("admin",         "Full system access -- platform administration",      0,  True),

    ("cfo",           "Chief Financial Officer -- company-wide oversight",   1,  False),

    ("head_of_risk",  "Head of Risk -- cross-branch risk governance",       2,  False),

    ("branch_manager","Branch Manager -- branch operations oversight",       3,  False),

    ("supervisor",    "Supervisor -- approve/reject staged artifacts",       5,  True),

    ("senior_analyst","Senior FX Analyst -- production calculations",        7,  False),

    ("risk_analyst",  "Risk Analyst -- sandbox analysis & proposals",       10,  True),

    ("junior_analyst","Junior Analyst -- view-only with limited actions",   15,  False),

    ("auditor",       "Compliance Auditor -- read-only audit access",       12,  False),

]



# ?? Role -> Permissions mapping ???????????????????????????????????????????????

ROLE_PERMISSIONS = {

    "admin": [p[0] for p in SEED_PERMISSIONS],  # ALL



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



# ?? Employee definitions ?????????????????????????????????????????????????????

# (email, password, full_name, job_title, role, branch_id, department_id)

EMPLOYEES = [

    # ?? HQ New York ??

    ("admin@synexcapital.com",       "Admin@2026!",     "System Administrator",   "Platform Admin",              "admin",          BRANCH_HQ_ID, DEPT_TR_HQ),

    ("r.chen@synexcapital.com",      "RChen@2026!",     "Richard Chen",           "Chief Financial Officer",     "cfo",            BRANCH_HQ_ID, DEPT_TR_HQ),

    ("s.williams@synexcapital.com",  "SWill@2026!",     "Sarah Williams",         "Head of FX Risk",            "head_of_risk",   BRANCH_HQ_ID, DEPT_FX_HQ),

    ("m.johnson@synexcapital.com",   "MJohn@2026!",     "Marcus Johnson",         "Senior FX Strategist",       "senior_analyst", BRANCH_HQ_ID, DEPT_FX_HQ),

    ("e.nakamura@synexcapital.com",  "ENaka@2026!",     "Emily Nakamura",         "FX Risk Analyst",            "risk_analyst",   BRANCH_HQ_ID, DEPT_FX_HQ),

    ("d.park@synexcapital.com",      "DPark@2026!",     "David Park",             "Compliance Auditor",         "auditor",        BRANCH_HQ_ID, DEPT_TR_HQ),



    # ?? Mexico City Branch ??

    ("j.ramirez@synexcapital.com",   "JRami@2026!",     "Javier Ramirez",         "Branch Manager -- LATAM",     "branch_manager", BRANCH_MX_ID, DEPT_FX_MX),

    ("c.ortega@synexcapital.com",    "COrtg@2026!",     "Camila Ortega",          "FX Desk Supervisor",         "supervisor",     BRANCH_MX_ID, DEPT_FX_MX),

    ("a.santos@synexcapital.com",    "ASant@2026!",     "Andres Santos",          "Senior LATAM Analyst",       "senior_analyst", BRANCH_MX_ID, DEPT_FX_MX),

    ("l.garcia@synexcapital.com",    "LGarc@2026!",     "Lucia Garcia",           "FX Risk Analyst",            "risk_analyst",   BRANCH_MX_ID, DEPT_FX_MX),

    ("p.hernandez@synexcapital.com", "PHern@2026!",     "Pablo Hernandez",        "Junior Analyst",             "junior_analyst", BRANCH_MX_ID, DEPT_FX_MX),



    # ?? London Branch ??

    ("n.baker@synexcapital.com",     "NBake@2026!",     "Natasha Baker",          "Branch Manager -- EMEA",      "branch_manager", BRANCH_LN_ID, DEPT_FX_LN),

    ("t.okonkwo@synexcapital.com",   "TOkon@2026!",     "Tunde Okonkwo",          "FX Desk Supervisor",         "supervisor",     BRANCH_LN_ID, DEPT_FX_LN),

    ("k.mueller@synexcapital.com",   "KMuel@2026!",     "Katrin Mueller",         "Senior EMEA Analyst",        "senior_analyst", BRANCH_LN_ID, DEPT_FX_LN),

    ("j.patel@synexcapital.com",     "JPate@2026!",     "Jai Patel",              "FX Risk Analyst",            "risk_analyst",   BRANCH_LN_ID, DEPT_FX_LN),



    # Demo account (partner demonstrations) -- real senior_analyst on HQ FX Risk Desk

    # Logs in with demo/demo; all widgets show live DB data from real calculations.

    ("demo",                         "demo",            "Demo User",              "FX Risk Analyst (Demo)",     "senior_analyst", BRANCH_HQ_ID, DEPT_FX_HQ),

]





async def seed():

    print(f"\n{'='*70}")

    print(f"  HEDGECALC COMPANY SEED -- Synex Capital Partners")

    print(f"{'='*70}")

    print(f"  DB: {DB_URL[:60]}...")



    engine = create_async_engine(DB_URL, echo=False)

    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)



    async with engine.begin() as conn:

        print("\n  [1/7] Creating tables if not exist...")

        await conn.run_sync(Base.metadata.create_all)



    async with Session() as session:

        # Ensure Company row exists BEFORE roles (FK: roles.company_id -> companies.id)
        from app.models.organization import Company as _Company
        _co_result = await session.execute(select(_Company).where(_Company.id == COMPANY_ID))
        if not _co_result.scalars().first():
            session.add(_Company(
                id=COMPANY_ID, name="Synex Capital Partners",
                slug="synex-capital", domain="synexcapital.com",
                settings={"default_currency": "USD"},
            ))
            await session.flush()


        # ??? 2. Seed Permissions ??????????????????????????????????????

        print("  [2/7] Seeding permissions...")

        perm_count = 0

        for codename, module, action, description in SEED_PERMISSIONS:

            result = await session.execute(

                select(Permission).where(Permission.codename == codename)

            )

            if not result.scalars().first():

                session.add(Permission(

                    codename=codename, module=module,

                    action=action, description=description,

                ))

                perm_count += 1

        await session.flush()

        print(f"         {perm_count} new permissions added ({len(SEED_PERMISSIONS)} total)")



        # ??? 3. Seed Roles ????????????????????????????????????????????

        print("  [3/7] Seeding roles...")

        role_map = {}

        for name, description, level, is_sys in ROLES:

            result = await session.execute(select(Role).where(Role.name == name))

            role = result.scalars().first()

            if not role:

                role = Role(

                    name=name, description=description,

                    hierarchy_level=level, is_system=is_sys,

                    company_id=COMPANY_ID if not is_sys else None,

                )

                session.add(role)

                await session.flush()

                print(f"         + {name:20s}  level={level:2d}  {'[system]' if is_sys else ''}")

            else:

                # Update hierarchy level and is_system if needed

                role.hierarchy_level = level

                role.description = description

                if not is_sys:

                    role.company_id = COMPANY_ID

            role_map[name] = role

        await session.flush()



        # ??? 4. Assign permissions to roles ???????????????????????????

        print("  [4/7] Assigning permissions to roles...")

        for role_name, perm_codenames in ROLE_PERMISSIONS.items():

            role = role_map.get(role_name)

            if not role:

                continue

            for codename in perm_codenames:

                perm_result = await session.execute(

                    select(Permission).where(Permission.codename == codename)

                )

                perm = perm_result.scalars().first()

                if not perm:

                    continue

                existing = await session.execute(

                    select(RolePermission).where(

                        RolePermission.role_id == role.id,

                        RolePermission.permission_id == perm.id,

                    )

                )

                if not existing.scalars().first():

                    session.add(RolePermission(role_id=role.id, permission_id=perm.id))

            print(f"         {role_name:20s} -> {len(perm_codenames)} permissions")

        await session.flush()



        # ??? 5. Create Company ????????????????????????????????????????

        print("  [5/7] Creating company & branches...")

        result = await session.execute(select(Company).where(Company.id == COMPANY_ID))

        company = result.scalars().first()

        if not company:

            company = Company(

                id=COMPANY_ID,

                name="Synex Capital Partners",

                slug="synex-capital",

                domain="synexcapital.com",

                settings={

                    "default_currency": "USD",

                    "fiscal_year_start": "January",

                    "risk_framework": "Basel III Enhanced",

                },

            )

            session.add(company)

            print(f"         Company: Synex Capital Partners")

        else:

            print(f"         Company already exists, updating...")

            company.name = "Synex Capital Partners"

            company.domain = "synexcapital.com"



        # Branches

        branches_data = [

            (BRANCH_HQ_ID, "Headquarters -- New York", "NYC", "North America", "America/New_York"),

            (BRANCH_MX_ID, "Mexico City Office",      "MXC", "LATAM",         "America/Mexico_City"),

            (BRANCH_LN_ID, "London Office",            "LDN", "EMEA",          "Europe/London"),

        ]

        for bid, bname, bcode, bregion, btz in branches_data:

            result = await session.execute(select(Branch).where(Branch.id == bid))

            branch = result.scalars().first()

            if not branch:

                session.add(Branch(

                    id=bid, company_id=COMPANY_ID,

                    name=bname, code=bcode, region=bregion, timezone=btz,

                ))

                print(f"         Branch: [{bcode}] {bname}")

            else:

                branch.name = bname

                branch.region = bregion



        # Departments

        depts_data = [

            (DEPT_FX_HQ, BRANCH_HQ_ID, "FX Risk Desk",       "FXD"),

            (DEPT_TR_HQ, BRANCH_HQ_ID, "Treasury Operations", "TRE"),

            (DEPT_FX_MX, BRANCH_MX_ID, "FX Desk -- LATAM",     "FXL"),

            (DEPT_FX_LN, BRANCH_LN_ID, "FX Desk -- EMEA",      "FXE"),

        ]

        for did, bid, dname, dcode in depts_data:

            result = await session.execute(select(Department).where(Department.id == did))

            if not result.scalars().first():

                session.add(Department(id=did, branch_id=bid, name=dname, code=dcode))

                print(f"         Dept:   [{dcode}] {dname}")

        await session.flush()



        # ??? 6. Create Users ?????????????????????????????????????????

        print("  [6/7] Creating employee accounts...")

        for email, password, full_name, job_title, role_name, branch_id, dept_id in EMPLOYEES:

            result = await session.execute(select(User).where(User.email == email))

            user = result.scalars().first()

            if not user:

                user = User(

                    email=email,

                    hashed_password=hash_password(password),

                    full_name=full_name,

                    job_title=job_title,

                    is_active=True,

                    is_superuser=(role_name == "admin"),

                    company_id=COMPANY_ID,

                    branch_id=branch_id,

                    department_id=dept_id,

                )

                session.add(user)

                await session.flush()

                print(f"         + {full_name:28s}  {email}")

            else:

                # Update existing user

                user.full_name = full_name

                user.job_title = job_title

                user.company_id = COMPANY_ID

                user.branch_id = branch_id

                user.department_id = dept_id

                await session.flush()

                print(f"         ~ {full_name:28s}  {email} (updated)")



            # Assign role

            role = role_map.get(role_name)

            if role:

                existing_ur = await session.execute(

                    select(UserRole).where(

                        UserRole.user_id == user.id,

                        UserRole.role_id == role.id,

                    )

                )

                if not existing_ur.scalars().first():

                    session.add(UserRole(user_id=user.id, role_id=role.id))



        await session.flush()



        # ??? 7. Commit everything ????????????????????????????????????

        print("  [7/7] Committing...")

        await session.commit()



    await engine.dispose()



    # ??? Print credentials table ??????????????????????????????????????

    print(f"\n{'='*70}")

    print(f"  SEED COMPLETE -- Login Credentials")

    print(f"{'='*70}")

    print()

    print(f"  Company: Synex Capital Partners (synex-capital)")

    print(f"  Domain:  synexcapital.com")

    print()



    # Group by branch

    branches = {

        BRANCH_HQ_ID: ("NYC", "Headquarters -- New York"),

        BRANCH_MX_ID: ("MXC", "Mexico City Office"),

        BRANCH_LN_ID: ("LDN", "London Office"),

    }



    for branch_id, (code, bname) in branches.items():

        branch_emps = [e for e in EMPLOYEES if e[5] == branch_id]

        print(f"  ?? {code} | {bname} {'?'*(48-len(bname))}")

        print(f"  {'Email':40s} {'Password':14s} {'Role':18s} {'Title'}")

        print(f"  {'?'*40} {'?'*14} {'?'*18} {'?'*30}")

        for email, pw, name, title, role, _, _ in branch_emps:

            print(f"  {email:40s} {pw:14s} {role:18s} {title}")

        print()



    # Permission summary

    print(f"\n{'='*70}")

    print(f"  ROLE -> PERMISSION MATRIX")

    print(f"{'='*70}\n")



    modules = ["trades", "hedges", "calculate", "pipeline", "policy",

               "market", "reports", "users", "company", "audit", "overrides"]



    header = f"  {'Role':18s}"

    for m in modules:

        header += f" {m[:6]:>6s}"

    print(header)

    print(f"  {'?'*18} " + " ".join(["?"*6]*len(modules)))



    for role_name in ["admin", "cfo", "head_of_risk", "branch_manager",

                      "supervisor", "senior_analyst", "risk_analyst",

                      "junior_analyst", "auditor"]:

        perms = set(ROLE_PERMISSIONS.get(role_name, []))

        row = f"  {role_name:18s}"

        for m in modules:

            module_perms = [p[0] for p in SEED_PERMISSIONS if p[1] == m]

            count = sum(1 for p in module_perms if p in perms)

            total = len(module_perms)

            if count == total:

                row += f"  {'ALL':>4s} "

            elif count == 0:

                row += f"  {'--':>4s} "

            else:

                row += f" {count:>2d}/{total:<2d} "

        print(row)



    print(f"\n{'='*70}")

    print(f"  Total: {len(EMPLOYEES)} users across {len(branches)} branches")

    print(f"  {len(ROLES)} roles with {len(SEED_PERMISSIONS)} granular permissions")

    print(f"{'='*70}\n")





if __name__ == "__main__":

    asyncio.run(seed())

