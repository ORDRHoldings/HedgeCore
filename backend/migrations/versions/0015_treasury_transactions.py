# backend/migrations/versions/0015_treasury_transactions.py
"""Add treasury_transactions WORM spine

Revision ID: 0015_treasury_transactions
Revises: 0014_journal_entries_gl
Create Date: 2026-04-13
"""
from alembic import op

revision = "0015_treasury_transactions"
down_revision = "0014_journal_entries_gl"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE treasury_transactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            entity_id UUID,
            tx_type VARCHAR(32) NOT NULL,
            amount NUMERIC(20,6) NOT NULL,
            currency VARCHAR(3) NOT NULL,
            base_amount NUMERIC(20,6) NOT NULL,
            base_currency VARCHAR(3) NOT NULL,
            fx_rate NUMERIC(20,8) NOT NULL,
            value_date DATE NOT NULL,
            source_module VARCHAR(32) NOT NULL,
            source_ref_id UUID NOT NULL,
            source_ref_type VARCHAR(64) NOT NULL,
            tx_hash VARCHAR(128) NOT NULL,
            prev_tx_hash VARCHAR(128) NOT NULL,
            chain_seq BIGINT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX ix_tt_company_id ON treasury_transactions(company_id);")
    op.execute("CREATE UNIQUE INDEX ix_tt_chain_seq ON treasury_transactions(company_id, chain_seq);")

    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_tt_delete()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'treasury_transactions is WORM — deletes forbidden (id=%)', OLD.id;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_no_delete_tt
        BEFORE DELETE ON treasury_transactions
        FOR EACH ROW EXECUTE FUNCTION fn_block_tt_delete();
    """)

    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_tt_update()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'treasury_transactions is WORM — updates forbidden (id=%)', OLD.id;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_no_update_tt
        BEFORE UPDATE ON treasury_transactions
        FOR EACH ROW EXECUTE FUNCTION fn_block_tt_update();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS tg_no_update_tt ON treasury_transactions;")
    op.execute("DROP TRIGGER IF EXISTS tg_no_delete_tt ON treasury_transactions;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_tt_update;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_tt_delete;")
    op.execute("DROP TABLE IF EXISTS treasury_transactions;")
