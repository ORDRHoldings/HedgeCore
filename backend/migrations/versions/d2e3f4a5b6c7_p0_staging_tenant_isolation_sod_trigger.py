"""P0: staging tenant isolation (company_id) + DB-level SoD trigger

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-03-02 00:00:00.000000+00:00

Changes:
  - staging_artifacts: add company_id UUID (nullable) with index -- tenant isolation
  - approvals: add DB-level trigger prevent_self_approval() -- SoD enforcement
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d2e3f4a5b6c7"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # P0-1: Tenant isolation column
    op.add_column(
        "staging_artifacts",
        sa.Column("company_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_staging_artifacts_company", "staging_artifacts", ["company_id"])

    # P0-2: DB-level SoD trigger
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_self_approval()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.approver_id = (
                SELECT submitted_by FROM staging_artifacts WHERE id = NEW.staging_artifact_id
            ) THEN
                RAISE EXCEPTION 'SELF_APPROVAL_BLOCKED: approver_id must differ from submitted_by';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_approvals_no_self_approval
        BEFORE INSERT ON approvals
        FOR EACH ROW EXECUTE FUNCTION prevent_self_approval();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_approvals_no_self_approval ON approvals;")
    op.execute("DROP FUNCTION IF EXISTS prevent_self_approval();")
    op.drop_index("ix_staging_artifacts_company", table_name="staging_artifacts")
    op.drop_column("staging_artifacts", "company_id")
