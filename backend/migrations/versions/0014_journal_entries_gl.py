# backend/migrations/versions/0014_journal_entries_gl.py
"""Add journal_entries and gl_account_mappings tables with WORM triggers

Revision ID: 0014_journal_entries_gl
Revises: 0013_add_sso_billing_to_companies
Create Date: 2026-04-13
"""
from alembic import op

revision = "0014_journal_entries_gl"
down_revision = "0013_add_sso_billing_to_companies"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── journal_entries ──────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE journal_entries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            run_id UUID,
            ledger_entry_id UUID,
            settlement_event_id UUID,
            entry_type VARCHAR(64) NOT NULL,
            standard VARCHAR(16) NOT NULL,
            debit_account VARCHAR(64) NOT NULL,
            credit_account VARCHAR(64) NOT NULL,
            amount NUMERIC(20,6) NOT NULL,
            currency VARCHAR(3) NOT NULL,
            base_amount NUMERIC(20,6) NOT NULL,
            base_currency VARCHAR(3) NOT NULL,
            fx_rate_used NUMERIC(20,8) NOT NULL,
            period_date DATE NOT NULL,
            description VARCHAR(512) NOT NULL DEFAULT '',
            status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
            posted_at TIMESTAMPTZ,
            posted_to VARCHAR(64),
            posted_ref VARCHAR(128),
            entry_hash VARCHAR(128) NOT NULL,
            prev_entry_hash VARCHAR(128) NOT NULL,
            chain_seq BIGINT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_by UUID NOT NULL
        );
    """)
    op.execute("CREATE INDEX ix_je_company_id ON journal_entries(company_id);")
    op.execute("CREATE INDEX ix_je_run_id ON journal_entries(run_id);")
    op.execute("CREATE UNIQUE INDEX ix_je_chain_seq ON journal_entries(company_id, chain_seq);")

    # WORM: block deletes
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_je_delete()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'journal_entries is WORM — deletes forbidden (id=%)', OLD.id;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_no_delete_je
        BEFORE DELETE ON journal_entries
        FOR EACH ROW EXECUTE FUNCTION fn_block_je_delete();
    """)

    # WORM: block updates to non-mutable columns
    op.execute("""
        CREATE OR REPLACE FUNCTION fn_block_je_immutable_update()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            IF (
                NEW.entry_type      IS DISTINCT FROM OLD.entry_type      OR
                NEW.standard        IS DISTINCT FROM OLD.standard        OR
                NEW.debit_account   IS DISTINCT FROM OLD.debit_account   OR
                NEW.credit_account  IS DISTINCT FROM OLD.credit_account  OR
                NEW.amount          IS DISTINCT FROM OLD.amount          OR
                NEW.currency        IS DISTINCT FROM OLD.currency        OR
                NEW.base_amount     IS DISTINCT FROM OLD.base_amount     OR
                NEW.base_currency   IS DISTINCT FROM OLD.base_currency   OR
                NEW.entry_hash      IS DISTINCT FROM OLD.entry_hash      OR
                NEW.prev_entry_hash IS DISTINCT FROM OLD.prev_entry_hash OR
                NEW.chain_seq       IS DISTINCT FROM OLD.chain_seq       OR
                NEW.company_id      IS DISTINCT FROM OLD.company_id      OR
                NEW.created_at      IS DISTINCT FROM OLD.created_at      OR
                NEW.created_by      IS DISTINCT FROM OLD.created_by
            ) THEN
                RAISE EXCEPTION
                    'journal_entries WORM violation — only status/posted_* may be updated (id=%)',
                    OLD.id;
            END IF;
            RETURN NEW;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER tg_worm_je_update
        BEFORE UPDATE ON journal_entries
        FOR EACH ROW EXECUTE FUNCTION fn_block_je_immutable_update();
    """)

    # ── gl_account_mappings (mutable) ────────────────────────────────────
    op.execute("""
        CREATE TABLE gl_account_mappings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL,
            entry_type VARCHAR(64) NOT NULL,
            standard VARCHAR(16) NOT NULL,
            debit_account VARCHAR(64) NOT NULL,
            credit_account VARCHAR(64) NOT NULL,
            account_label VARCHAR(256) NOT NULL DEFAULT '',
            erp_system VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
            created_by UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by UUID NOT NULL,
            CONSTRAINT uq_gl_mapping_company_type_standard UNIQUE (company_id, entry_type, standard)
        );
    """)
    op.execute("CREATE INDEX ix_gl_mapping_company_id ON gl_account_mappings(company_id);")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS tg_worm_je_update ON journal_entries;")
    op.execute("DROP TRIGGER IF EXISTS tg_no_delete_je ON journal_entries;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_je_immutable_update;")
    op.execute("DROP FUNCTION IF EXISTS fn_block_je_delete;")
    op.execute("DROP TABLE IF EXISTS gl_account_mappings;")
    op.execute("DROP TABLE IF EXISTS journal_entries;")
