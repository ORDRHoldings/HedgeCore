# backend/migrations/versions/0021_cash_audit_events.py
"""Add cash_audit_events table — SHA-256 hash chain, full WORM

Revision ID: 0021_cash_audit_events
Revises: 0020_cash_balances
Create Date: 2026-04-14
"""
from alembic import op

revision = "0021_cash_audit_events"
down_revision = "0020_cash_balances"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE cash_audit_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            entity_id UUID,
            account_id UUID,
            balance_id UUID,
            event_type VARCHAR(64) NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}',
            performed_by UUID NOT NULL,
            event_hash CHAR(64) NOT NULL,
            prev_event_hash CHAR(64) NOT NULL,
            chain_seq BIGINT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_cash_audit_chain UNIQUE (company_id, chain_seq)
        );
    """)
    op.execute("CREATE INDEX ix_cae_company_id ON cash_audit_events(company_id);")
    op.execute("CREATE INDEX ix_cae_account_id ON cash_audit_events(account_id);")

    # Full WORM: block deletes and ALL updates
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_cae_delete()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'cash_audit_events is WORM — deletes forbidden (id=%)', OLD.id;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_no_delete_cae
        BEFORE DELETE ON cash_audit_events
        FOR EACH ROW EXECUTE FUNCTION fn_block_cae_delete();
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_cae_update()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'cash_audit_events is WORM — updates forbidden (id=%)', OLD.id;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_no_update_cae
        BEFORE UPDATE ON cash_audit_events
        FOR EACH ROW EXECUTE FUNCTION fn_block_cae_update();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS tg_no_update_cae ON cash_audit_events;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_cae_update;")
    op.execute("DROP TRIGGER IF EXISTS tg_no_delete_cae ON cash_audit_events;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_cae_delete;")
    op.execute("DROP TABLE IF EXISTS cash_audit_events;")
