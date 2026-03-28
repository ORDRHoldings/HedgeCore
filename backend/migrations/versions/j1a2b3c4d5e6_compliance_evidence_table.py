"""compliance_evidence WORM table

Revision ID: j1a2b3c4d5e6
Revises: h1a2b3c4d5e6
Create Date: 2026-03-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "j1a2b3c4d5e6"
down_revision = "h1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "compliance_evidence",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("evidence_date", sa.Date(), nullable=False),
        sa.Column("evidence_type", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("latest_audit_event_hash", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index(
        "ix_compliance_evidence_date", "compliance_evidence", ["evidence_date"]
    )
    op.create_index(
        "ix_compliance_evidence_tenant_date",
        "compliance_evidence",
        ["company_id", "evidence_date"],
    )
    op.create_index(
        "ix_compliance_evidence_type", "compliance_evidence", ["evidence_type"]
    )

    # WORM enforcement
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_compliance_evidence_mutation()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'compliance_evidence is append-only (WORM): % on row % is forbidden',
                TG_OP, OLD.id;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_compliance_evidence_no_update
        BEFORE UPDATE ON compliance_evidence
        FOR EACH ROW EXECUTE FUNCTION prevent_compliance_evidence_mutation();
    """)
    op.execute("""
        CREATE TRIGGER trg_compliance_evidence_no_delete
        BEFORE DELETE ON compliance_evidence
        FOR EACH ROW EXECUTE FUNCTION prevent_compliance_evidence_mutation();
    """)


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS trg_compliance_evidence_no_delete ON compliance_evidence;"
    )
    op.execute(
        "DROP TRIGGER IF EXISTS trg_compliance_evidence_no_update ON compliance_evidence;"
    )
    op.execute("DROP FUNCTION IF EXISTS prevent_compliance_evidence_mutation();")
    op.drop_index("ix_compliance_evidence_type", table_name="compliance_evidence")
    op.drop_index(
        "ix_compliance_evidence_tenant_date", table_name="compliance_evidence"
    )
    op.drop_index("ix_compliance_evidence_date", table_name="compliance_evidence")
    op.drop_table("compliance_evidence")
