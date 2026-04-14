# backend/migrations/versions/0016_settlement_events.py
"""Add settlement_events table

Revision ID: 0016_settlement_events
Revises: 0015_treasury_transactions
Create Date: 2026-04-13
"""
from alembic import op

revision = "0016_settlement_events"
down_revision = "0015_treasury_transactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE settlement_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ledger_entry_id UUID NOT NULL UNIQUE,
            company_id UUID NOT NULL,
            hedge_rate NUMERIC(20,8) NOT NULL,
            actual_rate NUMERIC(20,8) NOT NULL,
            hedge_amount NUMERIC(20,6) NOT NULL,
            settlement_amount NUMERIC(20,6) NOT NULL,
            rate_variance NUMERIC(20,8) NOT NULL,
            pnl_impact NUMERIC(20,6) NOT NULL,
            settlement_date DATE NOT NULL,
            value_date DATE,
            settlement_ref VARCHAR(128) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
            reconciled_at TIMESTAMPTZ,
            reconciled_by UUID,
            notes TEXT NOT NULL DEFAULT '',
            event_hash VARCHAR(128) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX ix_se_company_id ON settlement_events(company_id);")
    op.execute("CREATE INDEX ix_se_ledger_entry_id ON settlement_events(ledger_entry_id);")

    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_se_delete()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'settlement_events is WORM — deletes forbidden (id=%)', OLD.id;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_no_delete_se
        BEFORE DELETE ON settlement_events
        FOR EACH ROW EXECUTE FUNCTION fn_block_se_delete();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS tg_no_delete_se ON settlement_events;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_se_delete;")
    op.execute("DROP TABLE IF EXISTS settlement_events;")
