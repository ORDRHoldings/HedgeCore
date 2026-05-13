"""Merge report-template and IR/debt migration heads.

Revision ID: 0035_merge_reporting_and_ir_debt_heads
Revises: 0034_custom_report_templates, t1a2b3c4d5e6
Create Date: 2026-05-12

This no-op merge restores a single Alembic head after the reporting-template
chain and the IR/debt permissions chain diverged.
"""

revision = "0035_merge_reporting_and_ir_debt_heads"
down_revision = ("0034_custom_report_templates", "t1a2b3c4d5e6")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
