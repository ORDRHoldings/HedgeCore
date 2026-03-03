"""L-11/L-12: add user_mfa table and execution_proposal dual-key/fill/risk columns

Revision ID: a9b8c7d6e5f4
Revises: 4d1b6f64977e, d2e3f4a5b6c7
Create Date: 2026-03-03

Changes:
  1. Create user_mfa table (TOTP secret, backup codes, enrollment timestamps)
  2. Add dual-key approval columns to execution_proposals (L-12)
  3. Add risk gate columns to execution_proposals (risk_decision_hash, risk_verdict)
  4. Add fill execution data columns to execution_proposals (actual_fill_rate, etc.)

Safe to run on existing production DB — all new columns are nullable or have server defaults.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# ---------------------------------------------------------------------------
# Revision identifiers
# ---------------------------------------------------------------------------
revision: str = "a9b8c7d6e5f4"
down_revision: Union[str, Sequence[str], None] = ("4d1b6f64977e", "d2e3f4a5b6c7")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------
def upgrade() -> None:
    # ── 1. user_mfa table ────────────────────────────────────────────────────
    op.create_table(
        "user_mfa",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"),
                  nullable=False, unique=True, index=True),
        sa.Column("totp_secret", sa.String(64), nullable=False),
        sa.Column("is_enabled", sa.Boolean, nullable=False,
                  server_default=sa.text("false")),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("backup_codes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("NOW()")),
    )

    # ── 2. execution_proposals — dual-key approval columns (L-12) ────────────
    # All new columns; all nullable or have server defaults so existing rows
    # are unaffected.
    with op.batch_alter_table("execution_proposals") as batch_op:
        batch_op.add_column(
            sa.Column("second_approver_required", sa.Boolean, nullable=False,
                      server_default=sa.text("false"))
        )
        batch_op.add_column(
            sa.Column("second_approver_id",
                      postgresql.UUID(as_uuid=True), nullable=True)
        )
        batch_op.add_column(
            sa.Column("second_approver_email", sa.String(128), nullable=True)
        )
        batch_op.add_column(
            sa.Column("second_approved_at",
                      sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(
            sa.Column("second_approval_notes", sa.String(1024), nullable=True)
        )
        batch_op.add_column(
            sa.Column("second_approval_hash", sa.String(64), nullable=True)
        )

        # ── 3. Risk gate columns ──────────────────────────────────────────────
        batch_op.add_column(
            sa.Column("risk_decision_hash", sa.String(64), nullable=True)
        )
        batch_op.add_column(
            sa.Column("risk_verdict", sa.String(32), nullable=True)
        )

        # ── 4. Fill execution data ────────────────────────────────────────────
        batch_op.add_column(sa.Column("actual_fill_rate",     sa.Float, nullable=True))
        batch_op.add_column(sa.Column("actual_fill_notional", sa.Float, nullable=True))
        batch_op.add_column(sa.Column("slippage_bps",         sa.Float, nullable=True))
        batch_op.add_column(sa.Column("fill_timestamp",       sa.String(64), nullable=True))
        batch_op.add_column(sa.Column("fill_hash",            sa.String(64), nullable=True))


# ---------------------------------------------------------------------------
# Downgrade
# ---------------------------------------------------------------------------
def downgrade() -> None:
    # Remove fill + risk + dual-key columns from execution_proposals
    with op.batch_alter_table("execution_proposals") as batch_op:
        for col in (
            "fill_hash", "fill_timestamp", "slippage_bps",
            "actual_fill_notional", "actual_fill_rate",
            "risk_verdict", "risk_decision_hash",
            "second_approval_hash", "second_approval_notes",
            "second_approved_at", "second_approver_email",
            "second_approver_id", "second_approver_required",
        ):
            batch_op.drop_column(col)

    # Drop user_mfa table
    op.drop_table("user_mfa")
