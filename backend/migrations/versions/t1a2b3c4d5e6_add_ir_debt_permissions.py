"""add_ir_debt_permissions

Revision ID: t1a2b3c4d5e6
Revises: s1a2b3c4d5e6
Create Date: 2026-04-17
"""
from __future__ import annotations

from alembic import op

revision = "t1a2b3c4d5e6"
down_revision = "s1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # `permissions.id` is SERIAL INTEGER (per app/models/permission.py and
    # `_ensure_tables()` in app/main.py). Earlier draft of this migration
    # inserted a uuid4() into the id column — works in production where
    # `run_alembic_upgrade()` swallows the resulting InvalidTextRepresentation,
    # crashes hard under alembic-in-isolation (CI advisory). Letting SERIAL
    # auto-assign is the structurally clean fix. RISK-CI-PG-02.
    for codename, module, action, description in [
        ("debt.read",     "debt",    "read",  "View debt facilities, drawdowns, covenants, schedules"),
        ("debt.write",    "debt",    "write", "Create/update debt facilities and drawdowns"),
        ("ir_risk.read",  "ir_risk", "read",  "View IR swaps, DV01 ladder, effectiveness runs"),
        ("ir_risk.write", "ir_risk", "write", "Create IR swaps, trigger MTM and effectiveness tests"),
    ]:
        op.execute(f"""
            INSERT INTO permissions (codename, module, action, description, created_at)
            VALUES ('{codename}', '{module}', '{action}', '{description}', NOW())
            ON CONFLICT (codename) DO NOTHING;
        """)
    for role_name, perms in [
        ("risk_analyst", ["debt.read", "ir_risk.read"]),
        ("supervisor",   ["debt.read", "debt.write", "ir_risk.read", "ir_risk.write"]),
        ("admin",        ["debt.read", "debt.write", "ir_risk.read", "ir_risk.write"]),
    ]:
        for perm in perms:
            op.execute(f"""
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT r.id, p.id FROM roles r, permissions p
                WHERE r.name = '{role_name}' AND p.codename = '{perm}'
                ON CONFLICT DO NOTHING;
            """)


def downgrade() -> None:
    for codename in ["debt.read", "debt.write", "ir_risk.read", "ir_risk.write"]:
        op.execute(f"DELETE FROM permissions WHERE codename = '{codename}';")
