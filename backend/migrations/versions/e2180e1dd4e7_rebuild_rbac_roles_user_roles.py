"""rebuild_rbac_roles_user_roles

Revision ID: e2180e1dd4e7
Revises: da9523383f47
Create Date: 2025-10-08 18:28:30.029459
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Revision identifiers
revision: str = "e2180e1dd4e7"
down_revision: Union[str, Sequence[str], None] = "da9523383f47"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to rebuild RBAC and audit structures with UUID integrity."""

    # The earlier chain (cde23b63d039 + 3450c02f9c01 + an inferred earlier
    # refresh_tokens revision) created these three tables already. This
    # migration originally also called op.create_table for them — a
    # DuplicateTable on fresh PG. Drop the legacy versions first; IF EXISTS
    # keeps the path idempotent for snapshots that never landed them.
    # CASCADE removes the legacy FKs cleanly. The rebuild keeps user_id as
    # INTEGER (matching users.id at this point); 4dfe7c45fffe converts the
    # whole graph to UUID in lock-step in the next revision.
    op.execute("DROP TABLE IF EXISTS audit_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS auth_audit_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS refresh_tokens CASCADE")

    # --- AUDIT LOGS ---
    # user_id is INTEGER here to match users.id at this point in the chain.
    # The next migration (4dfe7c45fffe) converts users.id and all referencing
    # user_id columns (here, auth_audit_logs, refresh_tokens, user_roles) to
    # UUID in lock-step. Creating UUID columns now would break the FK because
    # users.id is still INTEGER until that later migration runs.
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "ts",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("request_id", sa.String(length=64), nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=256), nullable=True),
        sa.Column("method", sa.String(length=8), nullable=False),
        sa.Column("path", sa.String(length=512), nullable=False),
        sa.Column("status", sa.SmallInteger(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_path", "audit_logs", ["path"], unique=False)
    op.create_index("ix_audit_logs_request_id", "audit_logs", ["request_id"], unique=False)
    op.create_index("ix_audit_logs_ts", "audit_logs", ["ts"], unique=False)
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"], unique=False)
    op.create_index("ix_audit_logs_user_ts", "audit_logs", ["user_id", "ts"], unique=False)

    # --- AUTH AUDIT LOGS ---
    # See audit_logs comment: user_id is INTEGER here; 4dfe7c45fffe converts.
    op.create_table(
        "auth_audit_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "event_type",
            sa.Enum(
                "LOGIN_SUCCESS",
                "LOGIN_FAIL",
                "REGISTER_SUCCESS",
                "REGISTER_FAIL",
                "REFRESH_SUCCESS",
                "REFRESH_FAIL",
                "LOGOUT",
                name="auth_event_type",
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("SUCCESS", "FAIL", name="auth_event_status"),
            nullable=False,
        ),
        sa.Column(
            "reason_code",
            sa.Enum(
                "OK",
                "EMAIL_ALREADY_EXISTS",
                "EMAIL_NOT_FOUND",
                "INVALID_PASSWORD",
                "ACCOUNT_DISABLED",
                "TOKEN_EXPIRED",
                "TOKEN_REVOKED",
                "TOKEN_INVALID",
                "ROTATION_REVOKED_PREVIOUS",
                "SERVER_ERROR",
                name="auth_reason_code",
            ),
            nullable=True,
        ),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("route", sa.String(length=255), nullable=True),
        sa.Column("method", sa.String(length=16), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_audit_logs_created_at", "auth_audit_logs", ["created_at"], unique=False)
    op.create_index("ix_auth_audit_logs_event_created_at", "auth_audit_logs", ["event_type", "created_at"], unique=False)
    op.create_index("ix_auth_audit_logs_event_type", "auth_audit_logs", ["event_type"], unique=False)
    op.create_index("ix_auth_audit_logs_request_id", "auth_audit_logs", ["request_id"], unique=False)
    op.create_index("ix_auth_audit_logs_user_id", "auth_audit_logs", ["user_id"], unique=False)
    op.create_index("ix_auth_audit_logs_user_created_at", "auth_audit_logs", ["user_id", "created_at"], unique=False)

    # --- REFRESH TOKENS ---
    # See audit_logs comment: user_id is INTEGER here; 4dfe7c45fffe converts.
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False),
        sa.Column("replaced_by_jti", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_ip", sa.String(length=64), nullable=True),
        sa.Column("created_user_agent", sa.String(length=256), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_refresh_tokens_id", "refresh_tokens", ["id"], unique=False)
    op.create_index("ix_refresh_tokens_jti", "refresh_tokens", ["jti"], unique=True)
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)
    op.create_index("ix_refresh_tokens_user_revoked", "refresh_tokens", ["user_id", "revoked"], unique=False)
    op.create_index("ix_refresh_tokens_replaced_by_jti", "refresh_tokens", ["replaced_by_jti"], unique=False)

    # --- USER EXTENSIONS ---
    # is_superuser is already created by a1ed712e8018 (init users) and
    # token_version by 3e9f47487b7f, so use ADD COLUMN IF NOT EXISTS for
    # idempotency on fresh DBs. On a snapshot DB that pre-dates those columns
    # (legacy prod), this still adds them.
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN "
        "NOT NULL DEFAULT false"
    )
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER "
        "NOT NULL DEFAULT 1"
    )
    # Remove deprecated columns safely if they exist.
    # batch_alter_table defers DDL until the `with` block exits, so a
    # try/except around batch_op.drop_column never catches a missing column —
    # the exception fires when the batch flushes. Use raw DROP COLUMN IF
    # EXISTS instead so it's truly idempotent on fresh PG.
    for col in ("mfa_secret", "role", "created_at", "mfa_enabled"):
        op.execute(f"ALTER TABLE users DROP COLUMN IF EXISTS {col}")
    # ### END COMMANDS ###


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("refresh_tokens")
    op.drop_table("auth_audit_logs")
    op.drop_table("audit_logs")
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("is_superuser")
        batch_op.drop_column("token_version")
