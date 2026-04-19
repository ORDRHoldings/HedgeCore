"""regulatory.read + regulatory.submit + regulatory.acknowledge RBAC permissions

Revision ID: 0032_regulatory_permissions
Revises: 0031_regulatory_submissions
Create Date: 2026-04-18
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "0032_regulatory_permissions"
down_revision = "0031_regulatory_submissions"
branch_labels = None
depends_on = None


PERMS = [
    ("regulatory.read", "Read regulatory submissions and TR acknowledgments"),
    ("regulatory.submit", "Create and submit regulatory reports to trade repositories"),
    ("regulatory.acknowledge", "Record TR acknowledgments, rejections, and failures"),
]


def upgrade() -> None:
    now = datetime.now(UTC)
    for name, desc in PERMS:
        op.execute(sa.text(
            "INSERT INTO permissions (id, name, description, created_at) "
            "VALUES (:id, :name, :desc, :now) ON CONFLICT (name) DO NOTHING"
        ).bindparams(id=uuid.uuid4(), name=name, desc=desc, now=now))

    # admin + compliance officer + treasurer get full access
    # risk_analyst + trader + viewer get read-only
    role_grants = [
        ("admin", ["regulatory.read", "regulatory.submit", "regulatory.acknowledge"]),
        ("treasurer", ["regulatory.read", "regulatory.submit", "regulatory.acknowledge"]),
        ("compliance_officer", ["regulatory.read", "regulatory.submit", "regulatory.acknowledge"]),
        ("risk_analyst", ["regulatory.read"]),
        ("trader", ["regulatory.read"]),
        ("viewer", ["regulatory.read"]),
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
    names = [p[0] for p in PERMS]
    op.execute(sa.text(
        "DELETE FROM role_permissions WHERE permission_id IN "
        "(SELECT id FROM permissions WHERE name = ANY(:names))"
    ).bindparams(names=names))
    op.execute(sa.text(
        "DELETE FROM permissions WHERE name = ANY(:names)"
    ).bindparams(names=names))
