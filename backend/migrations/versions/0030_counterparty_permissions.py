"""counterparty.read + counterparty.write RBAC permissions

Revision ID: 0030_counterparty_permissions
Revises: 0029_counterparty_tables
Create Date: 2026-04-18
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "0030_counterparty_permissions"
down_revision = "0029_counterparty_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    now = datetime.now(UTC)
    perms = [
        (uuid.uuid4(), "counterparty.read", "Read counterparty scorecards and exposure"),
        (uuid.uuid4(), "counterparty.write", "Create/update counterparties and credit limits"),
    ]
    for pid, name, desc in perms:
        op.execute(sa.text(
            "INSERT INTO permissions (id, name, description, created_at) "
            "VALUES (:id, :name, :desc, :now) ON CONFLICT (name) DO NOTHING"
        ).bindparams(id=pid, name=name, desc=desc, now=now))

    role_grants = [
        ("admin", ["counterparty.read", "counterparty.write"]),
        ("treasurer", ["counterparty.read", "counterparty.write"]),
        ("risk_analyst", ["counterparty.read", "counterparty.write"]),
        ("trader", ["counterparty.read"]),
        ("viewer", ["counterparty.read"]),
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
        "(SELECT id FROM permissions WHERE name IN ('counterparty.read','counterparty.write'))"
    ))
    op.execute(sa.text(
        "DELETE FROM permissions WHERE name IN ('counterparty.read','counterparty.write')"
    ))
