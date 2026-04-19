"""custom_report_templates -- user-defined reusable report templates (P2-B)

Revision ID: 0034_custom_report_templates
Revises: 0033_hedge_templates
Create Date: 2026-04-18
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0034_custom_report_templates"
down_revision = "0033_hedge_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "custom_report_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("short_name", sa.String(64), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(48), nullable=False),
        sa.Column("audience", postgresql.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("sections", postgresql.JSONB, nullable=False),
        sa.Column("default_bindings", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("tags", postgresql.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_custom_report_templates_company", "custom_report_templates", ["company_id"]
    )
    op.create_index(
        "ix_custom_report_templates_company_active",
        "custom_report_templates",
        ["company_id", "is_active"],
    )
    op.create_index(
        "ix_custom_report_templates_user", "custom_report_templates", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_custom_report_templates_user", table_name="custom_report_templates")
    op.drop_index(
        "ix_custom_report_templates_company_active", table_name="custom_report_templates"
    )
    op.drop_index("ix_custom_report_templates_company", table_name="custom_report_templates")
    op.drop_table("custom_report_templates")
