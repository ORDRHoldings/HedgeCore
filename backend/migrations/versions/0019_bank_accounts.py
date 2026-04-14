# backend/migrations/versions/0019_bank_accounts.py
"""Add bank_accounts table

Revision ID: 0019_bank_accounts
Revises: 0018_bank_connections
Create Date: 2026-04-14
"""
from alembic import op

revision = "0019_bank_accounts"
down_revision = "0018_bank_connections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE bank_accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            entity_id UUID NOT NULL REFERENCES legal_entities(id),
            bank_name VARCHAR(255) NOT NULL,
            bank_lei VARCHAR(20),
            bank_bic VARCHAR(11),
            account_number_enc TEXT,
            iban_enc TEXT,
            account_type VARCHAR(32) NOT NULL DEFAULT 'OPERATING',
            currency CHAR(3) NOT NULL,
            nickname VARCHAR(100) NOT NULL,
            purpose TEXT,
            overdraft_limit NUMERIC(20,6) NOT NULL DEFAULT 0,
            min_balance_threshold NUMERIC(20,6),
            gl_debit_code VARCHAR(50),
            gl_credit_code VARCHAR(50),
            api_connection_id UUID REFERENCES bank_connections(id),
            api_account_id VARCHAR(255),
            status VARCHAR(32) NOT NULL DEFAULT 'PENDING_VERIFICATION',
            verified_by UUID,
            verified_at TIMESTAMPTZ,
            approved_by UUID,
            approved_at TIMESTAMPTZ,
            created_by UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            closed_at TIMESTAMPTZ,
            version INTEGER NOT NULL DEFAULT 1
        );
    """)
    op.execute("CREATE INDEX ix_ba_entity_id ON bank_accounts(entity_id);")
    op.execute("CREATE INDEX ix_ba_status ON bank_accounts(status);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS bank_accounts;")
