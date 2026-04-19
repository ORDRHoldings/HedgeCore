"""regulatory_submissions table — TR submission lifecycle tracking

Revision ID: 0031_regulatory_submissions
Revises: 0030_counterparty_permissions
Create Date: 2026-04-18
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0031_regulatory_submissions"
down_revision = "0030_counterparty_permissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "regulatory_submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("companies.id"),
            nullable=False,
        ),
        sa.Column("framework", sa.String(16), nullable=False),
        sa.Column("uti", sa.String(64), nullable=False),
        sa.Column("source_run_id", sa.String(64), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
        sa.Column("document_bytes", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("document_hash", sa.String(64), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ack_received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ack_reference", sa.String(128), nullable=True),
        sa.Column("rejection_reason", sa.String(512), nullable=True),
        sa.Column("retry_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_regulatory_submissions_tenant_id", "regulatory_submissions", ["tenant_id"]
    )
    op.create_index(
        "ix_regulatory_submissions_uti", "regulatory_submissions", ["uti"]
    )
    op.create_index(
        "ix_regulatory_submissions_source_run_id",
        "regulatory_submissions",
        ["source_run_id"],
    )
    op.create_index(
        "ix_regsub_tenant_status", "regulatory_submissions", ["tenant_id", "status"]
    )
    op.create_index(
        "ix_regsub_tenant_framework",
        "regulatory_submissions",
        ["tenant_id", "framework"],
    )
    op.create_index(
        "ix_regsub_tenant_created",
        "regulatory_submissions",
        ["tenant_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_regsub_tenant_created", table_name="regulatory_submissions")
    op.drop_index("ix_regsub_tenant_framework", table_name="regulatory_submissions")
    op.drop_index("ix_regsub_tenant_status", table_name="regulatory_submissions")
    op.drop_index(
        "ix_regulatory_submissions_source_run_id", table_name="regulatory_submissions"
    )
    op.drop_index("ix_regulatory_submissions_uti", table_name="regulatory_submissions")
    op.drop_index(
        "ix_regulatory_submissions_tenant_id", table_name="regulatory_submissions"
    )
    op.drop_table("regulatory_submissions")
