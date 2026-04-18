"""counterparties + credit_limits tables

Revision ID: 0029_counterparty_tables
Revises: 0028_tca_permissions
Create Date: 2026-04-18
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0029_counterparty_tables"
down_revision = "0028_tca_permissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "counterparties",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("internal_code", sa.String(32), nullable=True),
        sa.Column("legal_entity_name", sa.String(240), nullable=True),
        sa.Column("lei", sa.String(20), nullable=True),
        sa.Column("credit_rating", sa.String(8), nullable=True),
        sa.Column("rating_agency", sa.String(32), nullable=True),
        sa.Column("country_iso", sa.String(2), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("last_exposure_usd", sa.Numeric(18, 2), nullable=True),
        sa.Column("last_pfe_usd", sa.Numeric(18, 2), nullable=True),
        sa.Column("risk_level_cached", sa.String(16), nullable=True),
        sa.Column("last_scored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("tenant_id", "name", name="uq_counterparty_tenant_name"),
    )
    op.create_index("ix_counterparties_tenant_id", "counterparties", ["tenant_id"])
    op.create_index("ix_counterparty_tenant_active", "counterparties", ["tenant_id", "active"])

    op.create_table(
        "credit_limits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "counterparty_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("counterparties.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("limit_type", sa.String(32), nullable=False),
        sa.Column("limit_amount_usd", sa.Numeric(18, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("effective_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expiry_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
    )
    op.create_index("ix_credit_limits_counterparty_id", "credit_limits", ["counterparty_id"])
    op.create_index("ix_credit_limits_tenant_id", "credit_limits", ["tenant_id"])
    op.create_index("ix_credit_limit_cp_active", "credit_limits", ["counterparty_id", "active"])
    op.create_index("ix_credit_limit_tenant_type", "credit_limits", ["tenant_id", "limit_type"])


def downgrade() -> None:
    op.drop_index("ix_credit_limit_tenant_type", table_name="credit_limits")
    op.drop_index("ix_credit_limit_cp_active", table_name="credit_limits")
    op.drop_index("ix_credit_limits_tenant_id", table_name="credit_limits")
    op.drop_index("ix_credit_limits_counterparty_id", table_name="credit_limits")
    op.drop_table("credit_limits")

    op.drop_index("ix_counterparty_tenant_active", table_name="counterparties")
    op.drop_index("ix_counterparties_tenant_id", table_name="counterparties")
    op.drop_table("counterparties")
