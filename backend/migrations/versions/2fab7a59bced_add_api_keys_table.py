"""Add api_keys table (Phase VI)
Revision ID: 2fab7a59bced
Revises: 17d871214f0b
Create Date: 2025-10-09 19:18:35.628209
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# ----------------------------------------------------------------------
# Revision identifiers
# ----------------------------------------------------------------------
revision = "2fab7a59bced"
down_revision = "17d871214f0b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # ✅ Create enum type manually if not exists
    bind.exec_driver_sql(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_type WHERE typname = 'api_key_status'
            ) THEN
                CREATE TYPE api_key_status AS ENUM ('active', 'revoked');
            END IF;
        END$$;
        """
    )

    # ✅ Create api_keys table (use VARCHAR + CHECK constraint)
    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("key_id", sa.String(length=64), unique=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("secret_hash", sa.Text, nullable=False),
        sa.Column("scopes", postgresql.ARRAY(sa.Text), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            sa.CheckConstraint(
                "status IN ('active', 'revoked')",
                name="ck_api_keys_status_valid",
            ),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "owner_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index("ix_api_keys_status", "api_keys", ["status"])
    op.create_index("ix_api_keys_owner", "api_keys", ["owner_user_id"])
    op.create_index("ix_api_keys_expires_at", "api_keys", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_api_keys_expires_at", table_name="api_keys")
    op.drop_index("ix_api_keys_owner", table_name="api_keys")
    op.drop_index("ix_api_keys_status", table_name="api_keys")
    op.drop_table("api_keys")
    op.execute("DROP TYPE IF EXISTS api_key_status CASCADE;")
