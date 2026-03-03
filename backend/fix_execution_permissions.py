"""
fix_execution_permissions.py
─────────────────────────────────────────────────────────────────────────────
One-off repair script — run on Render as a one-off job:

  DATABASE_URL="postgresql+asyncpg://..." python fix_execution_permissions.py

What it does:
  1. Ensures the `trades.execute` permission row exists in the permissions table.
  2. Grants `trades.execute` to every role that should have it
     (supervisor, branch_manager, head_of_risk, senior_analyst, risk_analyst).
  3. Sets `governance_mode = "solo"` on every company whose settings JSON
     does not already include a governance_mode key.

Safe to run multiple times (all operations are idempotent).
"""
import asyncio
import json
import os
import sys
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# ── DB URL ─────────────────────────────────────────────────────────────────
RAW_URL = os.environ.get("DATABASE_URL") or os.environ.get("ASYNC_DATABASE_URL") or ""
if not RAW_URL:
    sys.exit("ERROR: set DATABASE_URL environment variable before running this script.")

# Ensure asyncpg driver
if RAW_URL.startswith("postgresql://"):
    ASYNC_URL = RAW_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif RAW_URL.startswith("postgres://"):
    ASYNC_URL = RAW_URL.replace("postgres://", "postgresql+asyncpg://", 1)
else:
    ASYNC_URL = RAW_URL

# ── Roles that should receive trades.execute ────────────────────────────────
TARGET_ROLES = {
    "supervisor",
    "branch_manager",
    "head_of_risk",
    "senior_analyst",
    "risk_analyst",
}


async def main() -> None:
    engine = create_async_engine(ASYNC_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        async with session.begin():

            # ── 1. Ensure permission row exists ─────────────────────────────
            row = (await session.execute(
                text("SELECT id FROM permissions WHERE codename = 'trades.execute' LIMIT 1")
            )).fetchone()

            if row:
                perm_id = row[0]
                print(f"[1] trades.execute permission exists  (id={perm_id})")
            else:
                perm_id = uuid.uuid4()
                await session.execute(text(
                    "INSERT INTO permissions (id, codename, module, action, description, is_active) "
                    "VALUES (:id, 'trades.execute', 'trades', 'execute', "
                    "'Execute (confirm) hedged trades -- READY_TO_EXECUTE -> HEDGED', true)"
                ), {"id": perm_id})
                print(f"[1] Created trades.execute permission  (id={perm_id})")

            # ── 2. Grant permission to target roles ──────────────────────────
            for role_name in TARGET_ROLES:
                role_row = (await session.execute(
                    text("SELECT id FROM roles WHERE name = :name LIMIT 1"),
                    {"name": role_name},
                )).fetchone()

                if not role_row:
                    print(f"[2] Role '{role_name}' not found — skipping")
                    continue

                role_id = role_row[0]

                exists = (await session.execute(
                    text("SELECT 1 FROM role_permissions WHERE role_id=:r AND permission_id=:p LIMIT 1"),
                    {"r": role_id, "p": perm_id},
                )).fetchone()

                if exists:
                    print(f"[2] {role_name:20s} already has trades.execute — skipped")
                else:
                    await session.execute(text(
                        "INSERT INTO role_permissions (role_id, permission_id) VALUES (:r, :p)"
                    ), {"r": role_id, "p": perm_id})
                    print(f"[2] {role_name:20s} → trades.execute GRANTED ✓")

            # ── 3. Set governance_mode = "solo" where missing ─────────────────
            companies = (await session.execute(
                text("SELECT id, name, settings FROM companies")
            )).fetchall()

            updated = 0
            for (comp_id, comp_name, settings_raw) in companies:
                settings = settings_raw if isinstance(settings_raw, dict) else \
                           (json.loads(settings_raw) if settings_raw else {})

                if "governance_mode" not in settings:
                    settings["governance_mode"] = "solo"
                    await session.execute(
                        text("UPDATE companies SET settings = :s WHERE id = :id"),
                        {"s": json.dumps(settings), "id": comp_id},
                    )
                    print(f"[3] Company '{comp_name}' → governance_mode=solo ✓")
                    updated += 1
                else:
                    print(f"[3] Company '{comp_name}' already has governance_mode='{settings['governance_mode']}' — skipped")

            if updated == 0:
                print("[3] All companies already have governance_mode set")

    await engine.dispose()
    print("\n✓ Done — permissions and governance_mode updated successfully.")


if __name__ == "__main__":
    asyncio.run(main())
