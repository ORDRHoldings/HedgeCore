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
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "g1a2b3c4d5e6"
down_revision = "f81cffe7f9ee"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Item 1: FK constraints ──────────────────────────────────────────────
    op.create_foreign_key(
        "fk_audit_transactions_company",
        "audit_transactions", "companies",
        ["company_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_audit_findings_company",
        "audit_findings", "companies",
        ["company_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_audit_reports_company",
        "audit_reports", "companies",
        ["company_id"], ["id"],
        ondelete="CASCADE",
    )

    # ── Item 1: Composite indexes ───────────────────────────────────────────
    op.create_index(
        "ix_audit_transactions_trade_date",
        "audit_transactions",
        ["dataset_id", "trade_date"],
    )
    op.create_index(
        "ix_audit_transactions_pair",
        "audit_transactions",
        ["dataset_id", "currency_sold", "currency_bought"],
    )
    op.create_index(
        "ix_audit_findings_type",
        "audit_findings",
        ["run_id", "finding_type"],
    )
    op.create_index(
        "ix_audit_findings_severity",
        "audit_findings",
        ["company_id", "severity"],
    )

    # ── Item 9: bid/ask columns on market_snapshots ─────────────────────────
    op.add_column(
        "market_snapshots",
        sa.Column("bid_rate", sa.Float(), nullable=True),
    )
    op.add_column(
        "market_snapshots",
        sa.Column("ask_rate", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    # Remove bid/ask columns
    op.drop_column("market_snapshots", "ask_rate")
    op.drop_column("market_snapshots", "bid_rate")

    # Remove indexes
    op.drop_index("ix_audit_findings_severity", "audit_findings")
    op.drop_index("ix_audit_findings_type", "audit_findings")
    op.drop_index("ix_audit_transactions_pair", "audit_transactions")
    op.drop_index("ix_audit_transactions_trade_date", "audit_transactions")

    # Remove FK constraints
    op.drop_constraint("fk_audit_reports_company", "audit_reports", type_="foreignkey")
    op.drop_constraint("fk_audit_findings_company", "audit_findings", type_="foreignkey")
    op.drop_constraint("fk_audit_transactions_company", "audit_transactions", type_="foreignkey")
