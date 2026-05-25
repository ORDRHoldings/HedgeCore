"""audit_lab_integrity: FK constraints, indexes, bid/ask columns

Revision ID: g1a2b3c4d5e6
Revises: f81cffe7f9ee
Create Date: 2026-03-09

Items 1, 7, 9 from Audit Lab institutional upgrade:
  - FK on audit_transactions.company_id → companies(id)
  - FK on audit_findings.company_id → companies(id)
  - FK on audit_reports.company_id → companies(id)
  - Composite indexes for trade_date, pair, finding_type, severity
  - bid_rate/ask_rate columns on market_snapshots

Guards (RISK-CI-PG-02):
  audit_transactions, audit_findings, audit_reports, and market_snapshots
  are ORM-only tables — created by `_ensure_tables()` (Base.metadata.create_all)
  at app startup, never by any migration in the chain. Production tolerates
  this because `run_alembic_upgrade()` swallows exceptions non-fatally and
  `_ensure_tables()` finalises the schema afterward. The advisory
  backend-postgres CI job runs alembic in isolation and crashes on the first
  ORM-only ALTER unless guarded. Each block is wrapped in a `pg_class`
  existence check so this migration is a no-op on alembic-in-isolation and
  unchanged behavior on production state.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "g1a2b3c4d5e6"
down_revision = "f81cffe7f9ee"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Item 1: FK + indexes for audit_transactions ─────────────────────────
    op.execute("""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_transactions') THEN
        ALTER TABLE audit_transactions
            ADD CONSTRAINT fk_audit_transactions_company
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
        CREATE INDEX ix_audit_transactions_trade_date
            ON audit_transactions (dataset_id, trade_date);
        CREATE INDEX ix_audit_transactions_pair
            ON audit_transactions (dataset_id, currency_sold, currency_bought);
    END IF;
END
$$;
    """)

    # ── Item 1: FK for audit_findings ───────────────────────────────────────
    op.execute("""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_findings') THEN
        ALTER TABLE audit_findings
            ADD CONSTRAINT fk_audit_findings_company
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
        CREATE INDEX ix_audit_findings_type
            ON audit_findings (run_id, finding_type);
        CREATE INDEX ix_audit_findings_severity
            ON audit_findings (company_id, severity);
    END IF;
END
$$;
    """)

    # ── Item 1: FK for audit_reports ────────────────────────────────────────
    op.execute("""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_reports') THEN
        ALTER TABLE audit_reports
            ADD CONSTRAINT fk_audit_reports_company
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
END
$$;
    """)

    # ── Item 9: bid/ask columns on market_snapshots ─────────────────────────
    op.execute("""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'market_snapshots') THEN
        ALTER TABLE market_snapshots ADD COLUMN IF NOT EXISTS bid_rate DOUBLE PRECISION;
        ALTER TABLE market_snapshots ADD COLUMN IF NOT EXISTS ask_rate DOUBLE PRECISION;
    END IF;
END
$$;
    """)


def downgrade() -> None:
    # All downgrades guarded — symmetrical with upgrade.
    op.execute("""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'market_snapshots') THEN
        ALTER TABLE market_snapshots DROP COLUMN IF EXISTS ask_rate;
        ALTER TABLE market_snapshots DROP COLUMN IF EXISTS bid_rate;
    END IF;
END
$$;
    """)

    op.execute("""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_findings') THEN
        DROP INDEX IF EXISTS ix_audit_findings_severity;
        DROP INDEX IF EXISTS ix_audit_findings_type;
        ALTER TABLE audit_findings DROP CONSTRAINT IF EXISTS fk_audit_findings_company;
    END IF;
END
$$;
    """)

    op.execute("""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_transactions') THEN
        DROP INDEX IF EXISTS ix_audit_transactions_pair;
        DROP INDEX IF EXISTS ix_audit_transactions_trade_date;
        ALTER TABLE audit_transactions DROP CONSTRAINT IF EXISTS fk_audit_transactions_company;
    END IF;
END
$$;
    """)

    op.execute("""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_reports') THEN
        ALTER TABLE audit_reports DROP CONSTRAINT IF EXISTS fk_audit_reports_company;
    END IF;
END
$$;
    """)
