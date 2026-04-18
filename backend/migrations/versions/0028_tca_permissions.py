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
    now = datetime.now(UTC)
    perms = [
        (uuid.uuid4(), "tca.read", "Read TCA estimates and accuracy reports"),
        (uuid.uuid4(), "tca.estimate", "Create pre-trade estimates and reconcile"),
    ]
    for pid, name, desc in perms:
        op.execute(sa.text(
            "INSERT INTO permissions (id, name, description, created_at) "
            "VALUES (:id, :name, :desc, :now) ON CONFLICT (name) DO NOTHING"
        ).bindparams(id=pid, name=name, desc=desc, now=now))

    # Grant to existing roles
    role_grants = [
        ("admin", ["tca.read", "tca.estimate"]),
        ("treasurer", ["tca.read", "tca.estimate"]),
        ("risk_analyst", ["tca.read", "tca.estimate"]),
        ("trader", ["tca.read", "tca.estimate"]),
        ("viewer", ["tca.read"]),
    ]
    for role_name, perm_names in role_grants:
        for pn in perm_names:
            op.execute(sa.text("""
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT r.id, p.id
                FROM roles r, permissions p
                WHERE r.name = :role AND p.name = :perm
                ON CONFLICT DO NOTHING
            """).bindparams(role=role_name, perm=pn))


def downgrade() -> None:
    op.execute(sa.text(
        "DELETE FROM role_permissions WHERE permission_id IN "
        "(SELECT id FROM permissions WHERE name IN ('tca.read','tca.estimate'))"
    ))
    op.execute(sa.text(
        "DELETE FROM permissions WHERE name IN ('tca.read','tca.estimate')"
    ))
