"""P1 hardening: staging_artifacts.version column + approvals idempotency constraint

Revision ID: c1d2e3f4a5b6
Revises: b1f2a3c4d5e6
Create Date: 2026-03-02 00:00:00.000000+00:00

Changes:
  - staging_artifacts: add `version INTEGER NOT NULL DEFAULT 0` for optimistic locking
  - approvals: add UNIQUE INDEX (staging_artifact_id, approver_id, action) for idempotency
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "c1d2e3f4a5b6"
down_revision = "b1f2a3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # P1-4: optimistic lock version column
    op.add_column(
        "staging_artifacts",
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
    )

    # P1-3: idempotency unique constraint on approvals
    op.create_index(
        "uq_approval_per_actor_action",
        "approvals",
        ["staging_artifact_id", "approver_id", "action"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_approval_per_actor_action", table_name="approvals")
    op.drop_column("staging_artifacts", "version")
