"""hedge_templates -- reusable hedge strategy blueprints (P2-C)

Revision ID: 0033_hedge_templates
Revises: 0032_regulatory_permissions
Create Date: 2026-04-18
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0033_hedge_templates"
down_revision = "0032_regulatory_permissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hedge_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("short_name", sa.String(32), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("instrument_mix", postgresql.JSONB, nullable=False),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_hedge_templates_company_id", "hedge_templates", ["company_id"]
    )
    op.create_index(
        "ix_hedge_templates_category", "hedge_templates", ["category"]
    )
    op.create_index(
        "ix_hedge_templates_company_active",
        "hedge_templates",
        ["company_id", "is_active"],
    )


def downgrade() -> None:
    op.drop_index("ix_hedge_templates_company_active", table_name="hedge_templates")
    op.drop_index("ix_hedge_templates_category", table_name="hedge_templates")
    op.drop_index("ix_hedge_templates_company_id", table_name="hedge_templates")
    op.drop_table("hedge_templates")
