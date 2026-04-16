# backend/migrations/versions/p1a2b3c4d5e6_payment_initiation.py
"""payment_initiation

Revision ID: p1a2b3c4d5e6
Revises: k1a2b3c4d5e6
Create Date: 2026-04-15
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "p1a2b3c4d5e6"
down_revision = "k1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # payment_beneficiaries first (referenced by FK in payment_instructions)
    op.create_table(
        "payment_beneficiaries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("bank_name", sa.String(255), nullable=False),
        sa.Column("bank_code", sa.String(34), nullable=False),
        sa.Column("account_number", sa.String(34), nullable=False),
        sa.Column("country_code", sa.String(2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("payment_types", JSONB, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_by", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("company_id", "bank_code", "account_number", name="uq_beneficiary_account"),
    )
    op.create_index("ix_payment_beneficiaries_company_id", "payment_beneficiaries", ["company_id"])
    op.create_index("ix_payment_beneficiaries_company_active", "payment_beneficiaries", ["company_id", "is_active"])

    op.create_table(
        "payment_instructions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), nullable=False),
        sa.Column("beneficiary_id", UUID(as_uuid=True), nullable=False),
        sa.Column("payment_type", sa.String(10), nullable=False),
        sa.Column("amount", sa.Numeric(20, 4), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("execution_date", sa.Date, nullable=False),
        sa.Column("reference", sa.String(140), nullable=False),
        sa.Column("memo", sa.String, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING_APPROVAL"),
        sa.Column("created_by", UUID(as_uuid=True), nullable=False),
        sa.Column("approved_by", UUID(as_uuid=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_by", UUID(as_uuid=True), nullable=True),
        sa.Column("rejection_reason", sa.String, nullable=True),
        sa.Column("transmission_mode", sa.String(10), nullable=False, server_default="paper"),
        sa.Column("transmitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("instruction_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["beneficiary_id"], ["payment_beneficiaries.id"], name="fk_payment_beneficiary"),
        sa.CheckConstraint("amount > 0", name="ck_payment_amount_positive"),
    )
    op.create_index("ix_payment_instructions_company_id", "payment_instructions", ["company_id"])
    op.create_index("ix_payment_instructions_company_status", "payment_instructions", ["company_id", "status"])
    op.create_index("ix_payment_instructions_company_created", "payment_instructions", ["company_id", "created_at"])


def downgrade() -> None:
    op.drop_table("payment_instructions")
    op.drop_table("payment_beneficiaries")
