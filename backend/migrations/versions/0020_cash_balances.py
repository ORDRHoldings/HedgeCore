# backend/migrations/versions/0020_cash_balances.py
"""Add cash_balances table with partial WORM trigger

Revision ID: 0020_cash_balances
Revises: 0019_bank_accounts
Create Date: 2026-04-14
"""
from alembic import op

revision = "0020_cash_balances"
down_revision = "0019_bank_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE cash_balances (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_id UUID NOT NULL REFERENCES bank_accounts(id),
            balance_date DATE NOT NULL,
            value_date DATE,
            ledger_balance NUMERIC(20,6) NOT NULL,
            available_balance NUMERIC(20,6) NOT NULL,
            value_date_balance NUMERIC(20,6),
            in_transit_debit NUMERIC(20,6) NOT NULL DEFAULT 0,
            in_transit_credit NUMERIC(20,6) NOT NULL DEFAULT 0,
            currency CHAR(3) NOT NULL,
            source VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
            reconciliation_status VARCHAR(32) NOT NULL DEFAULT 'UNRECONCILED',
            reconciled_by UUID,
            reconciled_at TIMESTAMPTZ,
            pulled_at TIMESTAMPTZ,
            note TEXT,
            created_by UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_cash_balance_account_date UNIQUE (account_id, balance_date)
        );
    """)
    op.execute("CREATE INDEX ix_cb_account_id ON cash_balances(account_id);")
    op.execute("CREATE INDEX ix_cb_balance_date ON cash_balances(balance_date);")

    # WORM: block deletes
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_cb_delete()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'cash_balances is WORM — deletes forbidden (id=%)', OLD.id;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_no_delete_cb
        BEFORE DELETE ON cash_balances
        FOR EACH ROW EXECUTE FUNCTION fn_block_cb_delete();
    """)

    # Partial WORM: allow only reconciliation columns to change
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_cb_partial_worm()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            IF (
                NEW.account_id          IS DISTINCT FROM OLD.account_id          OR
                NEW.balance_date        IS DISTINCT FROM OLD.balance_date        OR
                NEW.value_date          IS DISTINCT FROM OLD.value_date          OR
                NEW.ledger_balance      IS DISTINCT FROM OLD.ledger_balance      OR
                NEW.available_balance   IS DISTINCT FROM OLD.available_balance   OR
                NEW.value_date_balance  IS DISTINCT FROM OLD.value_date_balance  OR
                NEW.in_transit_debit    IS DISTINCT FROM OLD.in_transit_debit    OR
                NEW.in_transit_credit   IS DISTINCT FROM OLD.in_transit_credit   OR
                NEW.currency            IS DISTINCT FROM OLD.currency            OR
                NEW.source              IS DISTINCT FROM OLD.source              OR
                NEW.pulled_at           IS DISTINCT FROM OLD.pulled_at           OR
                NEW.note                IS DISTINCT FROM OLD.note                OR
                NEW.created_by          IS DISTINCT FROM OLD.created_by          OR
                NEW.created_at          IS DISTINCT FROM OLD.created_at
            ) THEN
                RAISE EXCEPTION 'cash_balances financial columns are immutable (id=%)', OLD.id;
            END IF;
            RETURN NEW;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_cb_partial_worm
        BEFORE UPDATE ON cash_balances
        FOR EACH ROW EXECUTE FUNCTION fn_cb_partial_worm();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS tg_cb_partial_worm ON cash_balances;")
    op.execute("DROP FUNCTION IF EXISTS fn_cb_partial_worm;")
    op.execute("DROP TRIGGER IF EXISTS tg_no_delete_cb ON cash_balances;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_cb_delete;")
    op.execute("DROP TABLE IF EXISTS cash_balances;")
