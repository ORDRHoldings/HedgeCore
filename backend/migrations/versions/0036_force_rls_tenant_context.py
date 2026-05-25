"""Force tenant RLS on positions and calculation_runs.

Revision ID: 0036_force_rls_tenant_context
Revises: 0035_merge_reporting_and_ir_debt_heads
Create Date: 2026-05-12

The application now injects app.current_tenant_id and app.bypass_tenant_rls
into PostgreSQL transactions before SQL execution. With that session contract
in place, table owners no longer bypass tenant policies for regulated data.
"""

from alembic import op

revision = "0036_force_rls_tenant_context"
down_revision = "0035_merge_reporting_and_ir_debt_heads"
branch_labels = None
depends_on = None

_NO_TENANT = "00000000-0000-0000-0000-000000000000"


def _tenant_match(column: str) -> str:
    return f"""
        (
            current_setting('app.bypass_tenant_rls', true) = 'true'
            OR {column}::text = COALESCE(
                NULLIF(current_setting('app.current_tenant_id', true), ''),
                '{_NO_TENANT}'
            )
        )
    """


def _legacy_tenant_match(column: str) -> str:
    return f"""
        (
            {column}::text = COALESCE(
                NULLIF(current_setting('app.current_tenant_id', true), ''),
                '{_NO_TENANT}'
            )
        )
    """


def upgrade() -> None:
    positions_clause = _tenant_match("company_id")
    calc_runs_clause = f"({_tenant_match('company_id')} OR company_id IS NULL)"

    # Positions block — in a pure-alembic chain (advisory CI), `positions` and
    # its policies don't exist yet because they come from `_ensure_tables` and
    # `k1a2b3c4d5e6` respectively, neither of which is guaranteed to have
    # produced concrete state in pure alembic-mode. Guard with a pg_class
    # existence check. See RISK-CI-PG-02.
    op.execute(f"""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'positions') THEN
        ALTER POLICY positions_tenant_isolation_select
        ON positions
        USING {positions_clause};
        ALTER POLICY positions_tenant_isolation_insert
        ON positions
        WITH CHECK {positions_clause};
        ALTER POLICY positions_tenant_isolation_update
        ON positions
        USING {positions_clause};
        DROP POLICY IF EXISTS positions_tenant_isolation_delete ON positions;
        CREATE POLICY positions_tenant_isolation_delete
        ON positions FOR DELETE
        USING {positions_clause};
        ALTER TABLE positions FORCE ROW LEVEL SECURITY;
    END IF;
END
$$;
    """)

    # calculation_runs is created by a3f8c1d2e4b5 — earlier in chain — so
    # exists by definition. No guard needed.
    op.execute(f"""
        ALTER POLICY calc_runs_tenant_isolation_select
        ON calculation_runs
        USING {calc_runs_clause}
    """)
    op.execute(f"""
        ALTER POLICY calc_runs_tenant_isolation_insert
        ON calculation_runs
        WITH CHECK {calc_runs_clause}
    """)

    op.execute("ALTER TABLE calculation_runs FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    positions_clause = _legacy_tenant_match("company_id")
    calc_runs_clause = f"({_legacy_tenant_match('company_id')} OR company_id IS NULL)"

    op.execute("ALTER TABLE calculation_runs NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE positions NO FORCE ROW LEVEL SECURITY")

    op.execute(f"""
        ALTER POLICY positions_tenant_isolation_select
        ON positions
        USING {positions_clause}
    """)
    op.execute(f"""
        ALTER POLICY positions_tenant_isolation_insert
        ON positions
        WITH CHECK {positions_clause}
    """)
    op.execute(f"""
        ALTER POLICY positions_tenant_isolation_update
        ON positions
        USING {positions_clause}
    """)
    op.execute("DROP POLICY IF EXISTS positions_tenant_isolation_delete ON positions")
    op.execute(f"""
        ALTER POLICY calc_runs_tenant_isolation_select
        ON calculation_runs
        USING {calc_runs_clause}
    """)
    op.execute(f"""
        ALTER POLICY calc_runs_tenant_isolation_insert
        ON calculation_runs
        WITH CHECK {calc_runs_clause}
    """)
