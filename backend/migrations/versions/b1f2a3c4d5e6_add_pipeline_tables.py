"""Add pipeline tables: proposals, staging_artifacts, approvals, ledger_entries, anchor_hashes

Revision ID: b1f2a3c4d5e6
Revises: 4ca858ac8c92
Create Date: 2026-02-15 12:00:00.000000+00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "b1f2a3c4d5e6"
down_revision = "4ca858ac8c92"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- proposals ---
    op.create_table(
        "proposals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("proposal_id", sa.String(32), unique=True, nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("engine_version", sa.String(16), nullable=False, server_default="1.0.0"),
        sa.Column("snapshot_hash", sa.String(128), nullable=False),
        sa.Column("policy_hash", sa.String(128), nullable=False),
        sa.Column("exposure_digest", sa.String(128), nullable=False),
        sa.Column("policy_version", sa.String(64), nullable=False, server_default="1.0.0"),
        sa.Column("frozen_inputs", postgresql.JSONB(), nullable=False),
        sa.Column("calculate_response", postgresql.JSONB(), nullable=False),
        sa.Column("waterfall_result", postgresql.JSONB(), nullable=False),
        sa.Column("freeze_artifact", postgresql.JSONB(), nullable=False),
        sa.Column("residual_risk_vector", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("capability_flags", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("justification", sa.Text(), nullable=True),
    )

    # --- staging_artifacts ---
    op.create_table(
        "staging_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("staging_id", sa.String(32), unique=True, nullable=False, index=True),
        sa.Column("proposal_id", sa.String(32), nullable=False, index=True),
        sa.Column("submitted_by", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("justification", sa.Text(), nullable=False, server_default=""),
        sa.Column("integrity_score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("authorization_status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("required_approvals", sa.Integer(), nullable=False, server_default="1"),
    )

    # --- approvals ---
    op.create_table(
        "approvals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "staging_artifact_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("staging_artifacts.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("approver_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("approver_role", sa.String(64), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("signature_hash", sa.String(128), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- ledger_entries ---
    op.create_table(
        "ledger_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ledger_id", sa.String(32), unique=True, nullable=False, index=True),
        sa.Column("order_id", sa.String(32), unique=True, nullable=False, index=True),
        sa.Column("staging_id", sa.String(32), nullable=False, index=True),
        sa.Column("authorized_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("authorized_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("signature_hash", sa.String(128), nullable=False),
        sa.Column("root_hash", sa.String(128), nullable=False, server_default=""),
        sa.Column("provenance_chain", postgresql.JSONB(), nullable=False),
        sa.Column("frozen_artifact", postgresql.JSONB(), nullable=False),
        sa.Column("replay_verified", sa.Boolean(), nullable=False, server_default="false"),
    )

    # --- Immutable ledger trigger: prevent UPDATE/DELETE ---
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'IMMUTABLE_LEDGER: UPDATE and DELETE operations are prohibited on ledger_entries';
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_ledger_immutable
        BEFORE UPDATE OR DELETE ON ledger_entries
        FOR EACH ROW
        EXECUTE FUNCTION prevent_ledger_mutation();
    """)

    # --- anchor_hashes ---
    op.create_table(
        "anchor_hashes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("anchor_date", sa.DateTime(timezone=True), unique=True, nullable=False, index=True),
        sa.Column("merkle_root", sa.String(128), nullable=False),
        sa.Column("entry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_ledger_immutable ON ledger_entries;")
    op.execute("DROP FUNCTION IF EXISTS prevent_ledger_mutation();")
    op.drop_table("anchor_hashes")
    op.drop_table("ledger_entries")
    op.drop_table("approvals")
    op.drop_table("staging_artifacts")
    op.drop_table("proposals")
