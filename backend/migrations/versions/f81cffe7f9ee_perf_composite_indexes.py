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
    # `positions` and `execution_proposals` are ORM-only tables — in a pure
    # alembic chain (advisory CI) they don't exist yet, since `positions` is
    # produced by `_ensure_tables` and `execution_proposals` is only created
    # in `b7d2e4f1a9c3` whose ALTERs are now guarded. `calculation_runs` and
    # `audit_events` are created by `a3f8c1d2e4b5` (earlier in the chain).
    # Guard each pair with a pg_class existence check. See RISK-CI-PG-02.
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    if is_postgres:
        op.execute("""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'positions') THEN
        CREATE INDEX IF NOT EXISTS ix_positions_company_exec_status
            ON positions (company_id, execution_status);
        CREATE INDEX IF NOT EXISTS ix_positions_company_branch_status
            ON positions (company_id, branch_id, execution_status);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'execution_proposals') THEN
        CREATE INDEX IF NOT EXISTS ix_execution_proposals_company_status
            ON execution_proposals (company_id, status);
    END IF;
END
$$;
        """)
        # calculation_runs + audit_events created earlier in chain, no guard.
        op.execute("""
            CREATE INDEX IF NOT EXISTS ix_calculation_runs_company_user_created
                ON calculation_runs (company_id, user_id, created_at)
        """)
        op.execute("""
            CREATE INDEX IF NOT EXISTS ix_audit_events_company_created
                ON audit_events (company_id, created_at)
        """)
    else:
        # SQLite: use op.create_index (it'll succeed if tables exist via
        # Base.metadata.create_all, which is the only path SQLite tests use).
        for name, table, cols in [
            ("ix_positions_company_exec_status", "positions",
             ["company_id", "execution_status"]),
            ("ix_positions_company_branch_status", "positions",
             ["company_id", "branch_id", "execution_status"]),
            ("ix_execution_proposals_company_status", "execution_proposals",
             ["company_id", "status"]),
            ("ix_calculation_runs_company_user_created", "calculation_runs",
             ["company_id", "user_id", "created_at"]),
            ("ix_audit_events_company_created", "audit_events",
             ["company_id", "created_at"]),
        ]:
            op.create_index(name, table, cols, if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_audit_events_company_created", table_name="audit_events")
    op.drop_index("ix_calculation_runs_company_user_created", table_name="calculation_runs")
    op.drop_index("ix_execution_proposals_company_status", table_name="execution_proposals")
    op.drop_index("ix_positions_company_branch_status", table_name="positions")
    op.drop_index("ix_positions_company_exec_status", table_name="positions")
