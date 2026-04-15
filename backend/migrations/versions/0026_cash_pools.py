"""Create cash pool tables

Revision ID: 0026
Revises: 0025
"""
from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS treasury_entities (
        id UUID PRIMARY KEY,
        company_id UUID NOT NULL,
        name VARCHAR(256) NOT NULL,
        entity_type VARCHAR(16) NOT NULL DEFAULT 'SUBSIDIARY',
        base_currency VARCHAR(3) NOT NULL,
        country_code VARCHAR(2) NOT NULL,
        erp_ref VARCHAR(128),
        parent_entity_id UUID,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_treasury_entities_company_id ON treasury_entities(company_id);
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS cash_pools (
        id UUID PRIMARY KEY,
        company_id UUID NOT NULL,
        name VARCHAR(256) NOT NULL,
        pool_type VARCHAR(16) NOT NULL,
        header_account_id UUID NOT NULL,
        currency VARCHAR(3) NOT NULL,
        base_currency VARCHAR(3) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_cash_pools_company_id ON cash_pools(company_id);
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS cash_pool_members (
        id UUID PRIMARY KEY,
        pool_id UUID NOT NULL,
        account_id UUID NOT NULL,
        entity_id UUID NOT NULL,
        participation_type VARCHAR(8) NOT NULL DEFAULT 'FULL',
        target_balance NUMERIC(20,6),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_pool_member_account UNIQUE (pool_id, account_id)
    );
    CREATE INDEX IF NOT EXISTS ix_cash_pool_members_pool_id ON cash_pool_members(pool_id);
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS cash_pool_sweeps (
        id UUID PRIMARY KEY,
        pool_id UUID NOT NULL,
        source_account_id UUID NOT NULL,
        destination_account_id UUID NOT NULL,
        amount NUMERIC(20,6) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        direction VARCHAR(16) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        triggered_by UUID NOT NULL,
        executed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_cash_pool_sweeps_pool_id ON cash_pool_sweeps(pool_id);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS cash_pool_sweeps;")
    op.execute("DROP TABLE IF EXISTS cash_pool_members;")
    op.execute("DROP TABLE IF EXISTS cash_pools;")
    op.execute("DROP TABLE IF EXISTS treasury_entities;")
