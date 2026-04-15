"""Add reconciliation FK columns to bank_transactions

Revision ID: 0025
Revises: 0024
"""
from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE bank_transactions
        ADD COLUMN IF NOT EXISTS matched_settlement_id UUID,
        ADD COLUMN IF NOT EXISTS matched_journal_id UUID;
    """)
    op.execute("""
    ALTER TABLE bank_transactions
        ADD CONSTRAINT ck_bank_tx_single_match
        CHECK (
            NOT (matched_settlement_id IS NOT NULL AND matched_journal_id IS NOT NULL)
        );
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS ck_bank_tx_single_match;")
    op.execute("ALTER TABLE bank_transactions DROP COLUMN IF EXISTS matched_journal_id;")
    op.execute("ALTER TABLE bank_transactions DROP COLUMN IF EXISTS matched_settlement_id;")
