"""transaction_cost_estimates table

Revision ID: 0027_transaction_cost_estimates
Revises: 0026
Create Date: 2026-04-18
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0027_transaction_cost_estimates"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transaction_cost_estimates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("estimate_type", sa.String(16), nullable=False),
        sa.Column("calculation_run_id", sa.String(64), nullable=True),
        sa.Column("market_snapshot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("inputs", postgresql.JSONB, nullable=False),
        sa.Column("outputs", postgresql.JSONB, nullable=False),
        sa.Column("total_cost_usd", sa.Numeric(18, 2), nullable=False),
        sa.Column("total_cost_bps", sa.Numeric(10, 4), nullable=False),
        sa.Column("settlement_event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actual_cost_usd", sa.Numeric(18, 2), nullable=True),
        sa.Column("variance_bps", sa.Numeric(10, 4), nullable=True),
        sa.Column("reconciled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_tca_tenant_created", "transaction_cost_estimates", ["tenant_id", "created_at"])
    op.create_index("ix_tca_tenant_type_reconciled", "transaction_cost_estimates", ["tenant_id", "estimate_type", "reconciled_at"])
    op.create_index("ix_tca_calc_run_id", "transaction_cost_estimates", ["calculation_run_id"])


def downgrade() -> None:
    op.drop_index("ix_tca_calc_run_id", table_name="transaction_cost_estimates")
    op.drop_index("ix_tca_tenant_type_reconciled", table_name="transaction_cost_estimates")
    op.drop_index("ix_tca_tenant_created", table_name="transaction_cost_estimates")
    op.drop_table("transaction_cost_estimates")
