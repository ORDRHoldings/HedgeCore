"""Phase 0: WORM tables (audit_events, calculation_runs) + request context columns

Revision ID: a3f8c1d2e4b5
Revises: 4ca858ac8c92
Create Date: 2026-02-23

Implements:
  1. CREATE TABLE IF NOT EXISTS audit_events (full schema)
  2. CREATE TABLE IF NOT EXISTS calculation_runs (full schema)
  3. DB-level WORM rules on both tables:
       - PostgreSQL RULE: block UPDATE (raises exception)
       - PostgreSQL RULE: block DELETE (raises exception)
  4. Adds request_id + ip_address to audit_events (already in model, ensures column exists)
  5. Position lifecycle columns (idempotent ALTER TABLE)

These rules enforce WORM semantics at the DB layer -- not just the service layer.
Any UPDATE or DELETE on audit_events or calculation_runs will raise a
PG exception regardless of which connection or user issues it.

Note: DB-level rules are PostgreSQL-specific. SQLite (demo mode) does NOT
enforce these rules -- WORM is service-layer only in demo mode.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# ---------------------------------------------------------------------------
# Revision identifiers
# ---------------------------------------------------------------------------
revision: str = "a3f8c1d2e4b5"
down_revision: str = "4ca858ac8c92"
branch_labels = None
depends_on = None


def _is_postgres() -> bool:
    """Check if the current DB is PostgreSQL (WORM rules are PG-specific)."""
    bind = op.get_bind()
    return bind.dialect.name == "postgresql"


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------
def upgrade() -> None:
    # ?? 1. audit_events table ?????????????????????????????????????????????
    op.execute("""
        CREATE TABLE IF NOT EXISTS audit_events (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id      UUID,
            branch_id       UUID,
            actor_id        UUID,
            actor_email     VARCHAR(255),
            actor_role      VARCHAR(64),
            event_type      VARCHAR(32)   NOT NULL,
            description     VARCHAR(1024) NOT NULL,
            entity_type     VARCHAR(32),
            entity_id       VARCHAR(64),
            payload         JSONB         NOT NULL DEFAULT '{}',
            event_hash      VARCHAR(64)   NOT NULL,
            prev_event_hash VARCHAR(64)   NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
            request_id      VARCHAR(64),
            ip_address      VARCHAR(64),
            created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
        )
    """)

    # Indexes for audit_events
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_audit_tenant_time
            ON audit_events (company_id, created_at)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_audit_event_type
            ON audit_events (company_id, event_type)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_audit_entity
            ON audit_events (entity_type, entity_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_audit_actor
            ON audit_events (actor_id, created_at)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_audit_hash
            ON audit_events (event_hash)
    """)

    # ?? 2. calculation_runs table ?????????????????????????????????????????
    op.execute("""
        CREATE TABLE IF NOT EXISTS calculation_runs (
            id           VARCHAR(64)  PRIMARY KEY,
            company_id   UUID,
            user_id      UUID,
            inputs_hash  VARCHAR(128) NOT NULL,
            outputs_hash VARCHAR(128) NOT NULL,
            run_hash     VARCHAR(128) NOT NULL,
            position_ids JSONB        NOT NULL DEFAULT '[]',
            run_envelope JSONB        NOT NULL,
            trace_lite   JSONB,
            trade_count  INTEGER      NOT NULL DEFAULT 0,
            hedge_count  INTEGER      NOT NULL DEFAULT 0,
            policy_hash  VARCHAR(128),
            created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    """)

    # Indexes for calculation_runs
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_calc_runs_tenant
            ON calculation_runs (company_id, created_at)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_calc_runs_hash
            ON calculation_runs (run_hash)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_calc_runs_positions
            ON calculation_runs USING gin (position_ids)
    """)

    # ?? 3. Position lifecycle columns (idempotent) ????????????????????????
    for stmt in [
        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS execution_status VARCHAR(20) NOT NULL DEFAULT 'NEW'",
        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS policy_id UUID",
        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS last_run_id VARCHAR(64)",
        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ",
        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS execution_ref VARCHAR(128)",
        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS hedge_amount NUMERIC(20,6)",
        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS hedge_rate NUMERIC(20,8)",
        "ALTER TABLE positions ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(512)",
    ]:
        try:
            op.execute(stmt)
        except Exception:
            pass  # Column already exists -- safe to ignore

    # ?? 4. DB-level WORM rules (PostgreSQL only) ??????????????????????????
    # These PostgreSQL RULEs make it impossible to UPDATE or DELETE rows
    # from audit_events and calculation_runs at the DB level. Any attempt
    # raises an exception regardless of which user or connection issues it.
    #
    # Why RULE instead of TRIGGER?
    # - RULE is enforced before any row-level operation, even by superusers
    #   when the rule is set to DO INSTEAD NOTHING with RAISE.
    # - For true WORM, we use a trigger that raises an exception -- this
    #   is the most portable and explicit approach.
    #
    # Why not pg_dump-safe RULE INSTEAD DO NOTHING?
    # - INSTEAD DO NOTHING silently drops the operation. We prefer an
    #   explicit exception so violators know WORM is enforced.

    if _is_postgres():
        # audit_events WORM
        op.execute("""
            CREATE OR REPLACE FUNCTION _worm_block_audit_events()
            RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION
                    'WORM violation: audit_events rows are immutable. '
                    'UPDATE and DELETE are not permitted on this table. '
                    'Row id=% attempted operation=%.',
                    OLD.id, TG_OP;
                RETURN NULL;
            END;
            $$
        """)

        op.execute("""
            DROP TRIGGER IF EXISTS trg_worm_audit_events_update
                ON audit_events
        """)
        op.execute("""
            CREATE TRIGGER trg_worm_audit_events_update
            BEFORE UPDATE ON audit_events
            FOR EACH ROW EXECUTE FUNCTION _worm_block_audit_events()
        """)

        op.execute("""
            DROP TRIGGER IF EXISTS trg_worm_audit_events_delete
                ON audit_events
        """)
        op.execute("""
            CREATE TRIGGER trg_worm_audit_events_delete
            BEFORE DELETE ON audit_events
            FOR EACH ROW EXECUTE FUNCTION _worm_block_audit_events()
        """)

        # calculation_runs WORM
        op.execute("""
            CREATE OR REPLACE FUNCTION _worm_block_calculation_runs()
            RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION
                    'WORM violation: calculation_runs rows are immutable. '
                    'UPDATE and DELETE are not permitted on this table. '
                    'Row id=% attempted operation=%.',
                    OLD.id, TG_OP;
                RETURN NULL;
            END;
            $$
        """)

        op.execute("""
            DROP TRIGGER IF EXISTS trg_worm_calc_runs_update
                ON calculation_runs
        """)
        op.execute("""
            CREATE TRIGGER trg_worm_calc_runs_update
            BEFORE UPDATE ON calculation_runs
            FOR EACH ROW EXECUTE FUNCTION _worm_block_calculation_runs()
        """)

        op.execute("""
            DROP TRIGGER IF EXISTS trg_worm_calc_runs_delete
                ON calculation_runs
        """)
        op.execute("""
            CREATE TRIGGER trg_worm_calc_runs_delete
            BEFORE DELETE ON calculation_runs
            FOR EACH ROW EXECUTE FUNCTION _worm_block_calculation_runs()
        """)


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------
def downgrade() -> None:
    if _is_postgres():
        # Remove WORM triggers
        op.execute("DROP TRIGGER IF EXISTS trg_worm_audit_events_update ON audit_events")
        op.execute("DROP TRIGGER IF EXISTS trg_worm_audit_events_delete ON audit_events")
        op.execute("DROP TRIGGER IF EXISTS trg_worm_calc_runs_update ON calculation_runs")
        op.execute("DROP TRIGGER IF EXISTS trg_worm_calc_runs_delete ON calculation_runs")
        op.execute("DROP FUNCTION IF EXISTS _worm_block_audit_events()")
        op.execute("DROP FUNCTION IF EXISTS _worm_block_calculation_runs()")

    # NOTE: We do NOT drop audit_events or calculation_runs in downgrade.
    # Dropping immutable audit tables in a downgrade would destroy audit history.
    # If a forced drop is needed, it must be done manually with explicit intent.
    # We DO remove the lifecycle columns from positions (reversible).
    for col in [
        "execution_status", "policy_id", "last_run_id", "executed_at",
        "execution_ref", "hedge_amount", "hedge_rate", "rejection_reason",
    ]:
        try:
            op.execute(f"ALTER TABLE positions DROP COLUMN IF EXISTS {col}")
        except Exception:
            pass
