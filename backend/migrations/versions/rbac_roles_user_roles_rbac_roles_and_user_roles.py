"""rbac: roles and user_roles

Revision ID: rbac_roles_user_roles
Revises: cde23b63d039
Create Date: 2025-10-08 04:39:04.125267
"""

from datetime import datetime, timezone
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# ---------------------------------------------------------------------
# Revision identifiers
# ---------------------------------------------------------------------
revision: str = "rbac_roles_user_roles"
down_revision: Union[str, Sequence[str], None] = "cde23b63d039"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------
def upgrade() -> None:
    """Create roles and user_roles tables, and seed initial roles safely."""
    conn = op.get_bind()

    # ---- Create roles table ----
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=64), nullable=False, unique=True, index=True),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index("ix_roles_name_unique", "roles", ["name"], unique=True)

    # ---- Create user_roles table ----
    op.create_table(
        "user_roles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "role_id",
            sa.Integer(),
            sa.ForeignKey("roles.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
    )

    op.create_index(
        "ix_user_roles_user_id_role_id", "user_roles", ["user_id", "role_id"]
    )

    # ---- Safe seed of base roles ----
    roles_to_seed = [
        {"name": "admin", "description": "System administrator"},
        {"name": "manager", "description": "Manager-level access"},
        {"name": "user", "description": "Standard user"},
    ]

    for role in roles_to_seed:
        try:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO roles (name, description, created_at, updated_at)
                    SELECT :name, :description, :created_at, :updated_at
                    WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = :name)
                    """
                ),
                {
                    "name": role["name"],
                    "description": role["description"],
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                },
            )
        except Exception as e:
            print(f"[WARN] Could not seed role '{role['name']}': {e}")


# ---------------------------------------------------------------------
# Downgrade
# ---------------------------------------------------------------------
def downgrade() -> None:
    """Drop RBAC tables cleanly (reverse dependency order)."""
    op.drop_index("ix_user_roles_user_id_role_id", table_name="user_roles")
    op.drop_table("user_roles")

    op.drop_index("ix_roles_name_unique", table_name="roles")
    op.drop_table("roles")
