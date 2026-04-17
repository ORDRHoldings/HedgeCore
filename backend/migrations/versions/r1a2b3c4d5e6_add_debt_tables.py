"""add_debt_tables

Revision ID: r1a2b3c4d5e6
Revises: q1a2b3c4d5e6
Create Date: 2026-04-17
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "r1a2b3c4d5e6"
down_revision = "q1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "debt_facilities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("legal_entity_id", UUID(as_uuid=True), sa.ForeignKey("legal_entities.id"), nullable=True, index=True),
        sa.Column("facility_type", sa.String(32), nullable=False),
        sa.Column("counterparty", sa.String(255), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("committed_amount", sa.Numeric(20, 6), nullable=False),
        sa.Column("drawn_amount", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("margin_bps", sa.Integer, nullable=False, server_default="0"),
        sa.Column("rate_index", sa.String(16), nullable=False),
        sa.Column("maturity_date", sa.Date, nullable=False),
        sa.Column("day_count", sa.String(16), nullable=False, server_default="ACT365"),
        sa.Column("payment_frequency", sa.String(16), nullable=False, server_default="QUARTERLY"),
        sa.Column("repayment_type", sa.String(16), nullable=False, server_default="BULLET"),
        sa.Column("status", sa.String(24), nullable=False, server_default="ACTIVE"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "debt_drawdowns",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("facility_id", UUID(as_uuid=True), sa.ForeignKey("debt_facilities.id"), nullable=False, index=True),
        sa.Column("drawdown_date", sa.Date, nullable=False),
        sa.Column("amount", sa.Numeric(20, 6), nullable=False),
        sa.Column("repayment_date", sa.Date, nullable=True),
        sa.Column("rate_fixed_at", sa.Numeric(10, 6), nullable=True),
        sa.Column("drawdown_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "debt_covenants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("facility_id", UUID(as_uuid=True), sa.ForeignKey("debt_facilities.id"), nullable=False, index=True),
        sa.Column("covenant_type", sa.String(32), nullable=False),
        sa.Column("threshold", sa.Numeric(20, 6), nullable=False),
        sa.Column("current_value", sa.Numeric(20, 6), nullable=True),
        sa.Column("headroom_pct", sa.Numeric(10, 4), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="COMPLIANT"),
        sa.Column("tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # Composite indexes for common query patterns
    op.create_index("ix_debt_facilities_tenant_status", "debt_facilities", ["tenant_id", "status"])
    op.create_index("ix_debt_facilities_tenant_maturity", "debt_facilities", ["tenant_id", "maturity_date"])
    op.create_index("ix_debt_drawdowns_facility", "debt_drawdowns", ["facility_id"])
    op.create_index("ix_debt_covenants_facility", "debt_covenants", ["facility_id"])


def downgrade() -> None:
    op.drop_index("ix_debt_facilities_tenant_status", "debt_facilities")
    op.drop_index("ix_debt_facilities_tenant_maturity", "debt_facilities")
    op.drop_index("ix_debt_drawdowns_facility", "debt_drawdowns")
    op.drop_index("ix_debt_covenants_facility", "debt_covenants")

    op.drop_table("debt_covenants")
    op.drop_table("debt_drawdowns")
    op.drop_table("debt_facilities")
