"""bank_statements and bank_transactions tables

Revision ID: 0024
Revises: 0023
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS bank_statements (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id          UUID NOT NULL,
        account_id          UUID NOT NULL,
        statement_date      DATE NOT NULL,
        opening_balance     NUMERIC(20,6) NOT NULL,
        closing_balance     NUMERIC(20,6) NOT NULL,
        currency            VARCHAR(3) NOT NULL,
        format              VARCHAR(16) NOT NULL
                            CHECK (format IN ('MT940', 'CAMT053', 'BAI2')),
        source_hash         VARCHAR(128) NOT NULL UNIQUE,
        transaction_count   INTEGER NOT NULL,
        filename            VARCHAR(255),
        created_by          UUID NOT NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_bank_statements_company ON bank_statements(company_id);
    CREATE INDEX IF NOT EXISTS ix_bank_statements_account ON bank_statements(account_id);
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS bank_transactions (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        statement_id            UUID NOT NULL REFERENCES bank_statements(id),
        account_id              UUID NOT NULL,
        company_id              UUID NOT NULL,
        tx_date                 DATE NOT NULL,
        value_date              DATE,
        amount                  NUMERIC(20,6) NOT NULL,
        currency                VARCHAR(3) NOT NULL,
        direction               VARCHAR(6) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
        description             VARCHAR(512),
        reference               VARCHAR(128),
        counterparty            VARCHAR(256),
        tx_code                 VARCHAR(16),
        reconciliation_status   VARCHAR(16) NOT NULL DEFAULT 'UNMATCHED'
                                CHECK (reconciliation_status IN ('UNMATCHED', 'MATCHED', 'EXCEPTION')),
        created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_bank_transactions_statement ON bank_transactions(statement_id);
    CREATE INDEX IF NOT EXISTS ix_bank_transactions_account ON bank_transactions(account_id);
    CREATE INDEX IF NOT EXISTS ix_bank_transactions_company ON bank_transactions(company_id);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS bank_transactions;")
    op.execute("DROP TABLE IF EXISTS bank_statements;")
