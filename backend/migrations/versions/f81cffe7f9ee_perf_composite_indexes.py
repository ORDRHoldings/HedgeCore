"""perf_composite_indexes

Revision ID: f81cffe7f9ee
Revises: a9b8c7d6e5f4
Create Date: 2026-03-05 07:20:53.516844

Performance indexes for dashboard aggregate and position queries.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f81cffe7f9ee'
down_revision: Union[str, Sequence[str], None] = 'a9b8c7d6e5f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # positions: dashboard aggregate queries filter by company_id + execution_status
    op.create_index(
        "ix_positions_company_exec_status",
        "positions",
        ["company_id", "execution_status"],
        if_not_exists=True,
    )
    # positions: branch-scoped exposure queries
    op.create_index(
        "ix_positions_company_branch_status",
        "positions",
        ["company_id", "branch_id", "execution_status"],
        if_not_exists=True,
    )
    # execution_proposals: pending approval lookups
    op.create_index(
        "ix_execution_proposals_company_status",
        "execution_proposals",
        ["company_id", "status"],
        if_not_exists=True,
    )
    # calculation_runs: recent-runs queries per user
    op.create_index(
        "ix_calculation_runs_company_user_created",
        "calculation_runs",
        ["company_id", "user_id", "created_at"],
        if_not_exists=True,
    )
    # audit events: team-activity feed ordered by created_at
    op.create_index(
        "ix_audit_events_company_created",
        "audit_events",
        ["company_id", "created_at"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_audit_events_company_created", table_name="audit_events")
    op.drop_index("ix_calculation_runs_company_user_created", table_name="calculation_runs")
    op.drop_index("ix_execution_proposals_company_status", table_name="execution_proposals")
    op.drop_index("ix_positions_company_branch_status", table_name="positions")
    op.drop_index("ix_positions_company_exec_status", table_name="positions")
