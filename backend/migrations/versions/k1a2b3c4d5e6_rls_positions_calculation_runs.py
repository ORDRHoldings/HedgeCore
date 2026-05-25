"""Add PostgreSQL RLS policies on positions and calculation_runs

Revision ID: k1a2b3c4d5e6
Revises: j1a2b3c4d5e6
Create Date: 2026-03-28

RLS policy: tenant_id = current_setting('app.current_tenant_id')::uuid
Defence-in-depth on top of application-level company_id filtering.
"""
from alembic import op

revision = "k1a2b3c4d5e6"
down_revision = "j1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # FORCE ROW LEVEL SECURITY is intentionally NOT applied.
    # The application DB user (table owner) bypasses RLS by default,
    # preserving existing route compatibility.
    # RLS provides defence-in-depth for any future non-owner DB roles.
    # Primary tenant isolation is enforced at the application layer.
    #
    # Idempotency: in a pure-alembic chain (advisory CI), `positions` doesn't
    # exist yet — it's created later by `_ensure_tables()` from the ORM. Guard
    # all positions-touching statements with a pg_class existence check.
    # See RISK-CI-PG-02 for the chain-wide pattern.

    # positions
    op.execute("""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'positions') THEN
        ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
        CREATE POLICY positions_tenant_isolation_select
        ON positions FOR SELECT
        USING (
            company_id::text = COALESCE(
                NULLIF(current_setting('app.current_tenant_id', true), ''),
                '00000000-0000-0000-0000-000000000000'
            )
        );
        CREATE POLICY positions_tenant_isolation_insert
        ON positions FOR INSERT
        WITH CHECK (
            company_id::text = COALESCE(
                NULLIF(current_setting('app.current_tenant_id', true), ''),
                '00000000-0000-0000-0000-000000000000'
            )
        );
        CREATE POLICY positions_tenant_isolation_update
        ON positions FOR UPDATE
        USING (
            company_id::text = COALESCE(
                NULLIF(current_setting('app.current_tenant_id', true), ''),
                '00000000-0000-0000-0000-000000000000'
            )
        );
    END IF;
END
$$;
    """)

    # calculation_runs (created by a3f8c1d2e4b5 — earlier in the chain — so it
    # always exists at this point; no guard needed).
    op.execute("ALTER TABLE calculation_runs ENABLE ROW LEVEL SECURITY;")
    op.execute("""
        CREATE POLICY calc_runs_tenant_isolation_select
        ON calculation_runs FOR SELECT
        USING (
            company_id::text = COALESCE(
                NULLIF(current_setting('app.current_tenant_id', true), ''),
                '00000000-0000-0000-0000-000000000000'
            )
            OR company_id IS NULL
        );
    """)
    op.execute("""
        CREATE POLICY calc_runs_tenant_isolation_insert
        ON calculation_runs FOR INSERT
        WITH CHECK (
            company_id::text = COALESCE(
                NULLIF(current_setting('app.current_tenant_id', true), ''),
                '00000000-0000-0000-0000-000000000000'
            )
            OR company_id IS NULL
        );
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS positions_tenant_isolation_select ON positions;")
    op.execute("DROP POLICY IF EXISTS positions_tenant_isolation_insert ON positions;")
    op.execute("DROP POLICY IF EXISTS positions_tenant_isolation_update ON positions;")
    op.execute("ALTER TABLE positions DISABLE ROW LEVEL SECURITY;")
    op.execute("DROP POLICY IF EXISTS calc_runs_tenant_isolation_select ON calculation_runs;")
    op.execute("DROP POLICY IF EXISTS calc_runs_tenant_isolation_insert ON calculation_runs;")
    op.execute("ALTER TABLE calculation_runs DISABLE ROW LEVEL SECURITY;")
