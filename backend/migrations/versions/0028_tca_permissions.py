"""tca.read + tca.estimate RBAC permissions

Revision ID: 0028_tca_permissions
Revises: 0027_transaction_cost_estimates
Create Date: 2026-04-18
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "0028_tca_permissions"
down_revision = "0027_transaction_cost_estimates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # permissions.id is SERIAL INTEGER; codename (not name) is the canonical
    # unique key. Let SERIAL auto-assign id, and conflict-target codename.
    now = datetime.now(UTC)
    perms = [
        ("tca.read", "tca", "read", "Read TCA estimates and accuracy reports"),
        ("tca.estimate", "tca", "estimate", "Create pre-trade estimates and reconcile"),
    ]
    for codename, module, action, desc in perms:
        op.execute(sa.text(
            "INSERT INTO permissions (codename, module, action, description, created_at) "
            "VALUES (:codename, :module, :action, :desc, :now) "
            "ON CONFLICT (codename) DO NOTHING"
        ).bindparams(codename=codename, module=module, action=action, desc=desc, now=now))

    # Grant to existing roles (roles.name + permissions.codename are canonical)
    role_grants = [
        ("admin", ["tca.read", "tca.estimate"]),
        ("treasurer", ["tca.read", "tca.estimate"]),
        ("risk_analyst", ["tca.read", "tca.estimate"]),
        ("trader", ["tca.read", "tca.estimate"]),
        ("viewer", ["tca.read"]),
    ]
    for role_name, perm_codenames in role_grants:
        for pc in perm_codenames:
            op.execute(sa.text("""
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT r.id, p.id
                FROM roles r, permissions p
                WHERE r.name = :role AND p.codename = :perm
                ON CONFLICT DO NOTHING
            """).bindparams(role=role_name, perm=pc))


def downgrade() -> None:
    op.execute(sa.text(
        "DELETE FROM role_permissions WHERE permission_id IN "
        "(SELECT id FROM permissions WHERE codename IN ('tca.read','tca.estimate'))"
    ))
    op.execute(sa.text(
        "DELETE FROM permissions WHERE codename IN ('tca.read','tca.estimate')"
    ))
