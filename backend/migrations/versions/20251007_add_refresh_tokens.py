"""
20251007_add_refresh_tokens
Alembic migration: create refresh_tokens table for DB-backed JTI rotation/revocation.

- Stores only JTI (no raw token)
- Revocation flag + expiry timestamp
- Audit metadata: created_at (UTC), created_ip, created_user_agent
- Indexes: unique jti, (user_id, revoked)

Run:
  alembic upgrade head
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# Revision identifiers, used by Alembic.
revision = "20251007_add_refresh_tokens"
down_revision = "3e9f47487b7f"  # previous head: add_token_version_to_users
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("created_ip", sa.String(length=64), nullable=True),
        sa.Column("created_user_agent", sa.String(length=256), nullable=True),
    )

    # Unique index on JTI for quick lookup and to prevent duplicates
    op.create_index("ux_refresh_tokens_jti", "refresh_tokens", ["jti"], unique=True)

    # Composite index to query active tokens for a user efficiently
    op.create_index("ix_refresh_tokens_user_revoked", "refresh_tokens", ["user_id", "revoked"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_user_revoked", table_name="refresh_tokens")
    op.drop_index("ux_refresh_tokens_jti", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
