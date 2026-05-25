"""DB-POLICY-1: Replace expression/text-cast index with typed-sentinel or NULLS NOT DISTINCT

Revision ID: f1a2b3c4d5e6
Revises: c9f3a2b1d4e5
Create Date: 2026-02-28

Problem with c9f3a2b1d4e5:
  The original index used COALESCE(branch_id::text, '') — a text cast on a UUID column.
  This is problematic:
    1. ::text cast makes the index expression-based; the planner cannot use it for
       simple equality predicates on the uuid column without the cast.
    2. An expression index with a type coercion is not a standard column index — it
       cannot participate in certain planning optimisations (index-only scans, etc.).

Fix (version-aware):
  PG >= 15: UNIQUE NULLS NOT DISTINCT ON (company_id, branch_id) WHERE is_active=TRUE
    - Native behaviour: two NULL branch_id values are treated as equal (not distinct).
    - Plain two-column index — optimal planner coverage, zero overhead.

  PG < 15:  COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
    - Typed UUID sentinel (no ::text cast).
    - COALESCE of two uuid inputs → result type uuid → planner sees typed expression.
    - The sentinel '00000000-0000-0000-0000-000000000000' cannot be a real branch_id
      (it is the nil UUID; branches use uuid4 which cannot produce it).

Planner compatibility proof:
  PG15+ path: plain (company_id, branch_id) index — planner uses it for any equality
    predicate on those columns, including IS NULL on branch_id.
  PG<15 path: COALESCE returns uuid (same type as branch_id) — no implicit coercion
    needed for equality predicates; planner can use the expression index when it
    evaluates COALESCE(branch_id, nil_uuid) = $1 on the candidate rows.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision: str = "f1a2b3c4d5e6"
down_revision: str = "c9f3a2b1d4e5"
branch_labels = None
depends_on = None

# Typed UUID sentinel for branch_id=NULL normalisation (PG < 15 path).
# The nil UUID is safe: no real branch will ever have this id (uuid4 cannot produce it).
_NIL_UUID = "00000000-0000-0000-0000-000000000000"


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _pg_version_num() -> int:
    """Return server_version_num as int (e.g. 150004 for PG 15.4)."""
    result = op.get_bind().execute(
        sa.text("SELECT current_setting('server_version_num')::integer")
    )
    return result.scalar_one()


def upgrade() -> None:
    if not _is_postgres():
        return  # non-Postgres: service-layer enforcement only

    # `policy_instances` is ORM-only (created by `_ensure_tables`, not by any
    # migration in this chain). Skip the entire revision if it doesn't exist
    # yet; `_ensure_tables` will provide the up-to-date schema and a future
    # alembic stamp can record this revision as applied. See RISK-CI-PG-02.
    table_exists = op.get_bind().execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'policy_instances')")
    ).scalar_one()
    if not table_exists:
        return

    pg_ver = _pg_version_num()

    # Step 1: Drop the old expression/text-cast index from migration c9f3a2b1d4e5
    op.execute("DROP INDEX IF EXISTS uix_policy_instances_one_active_per_scope")

    # Step 2: Pre-cleanup — deactivate stale duplicate active instances.
    # Uses typed UUID sentinel (no ::text cast) for the DISTINCT ON expression.
    op.execute(f"""
        UPDATE policy_instances
        SET is_active = FALSE
        WHERE id NOT IN (
            SELECT DISTINCT ON (
                company_id,
                COALESCE(branch_id, '{_NIL_UUID}'::uuid)
            )
                id
            FROM policy_instances
            WHERE is_active = TRUE
            ORDER BY
                company_id,
                COALESCE(branch_id, '{_NIL_UUID}'::uuid),
                activated_at DESC
        )
        AND is_active = TRUE
    """)

    # Step 3: Create the institutional index (version-appropriate)
    if pg_ver >= 150000:
        # PG 15+: NULLS NOT DISTINCT — plain two-column index, no expression.
        # Two rows with (company_id=X, branch_id=NULL) are treated as duplicates.
        op.execute("""
            CREATE UNIQUE INDEX uix_policy_instances_one_active_per_scope
                ON policy_instances (company_id, branch_id)
                NULLS NOT DISTINCT
                WHERE is_active = TRUE
        """)
    else:
        # PG < 15: typed UUID sentinel — COALESCE returns uuid (same type as branch_id).
        # No text cast → planner treats it as a typed, indexable expression.
        op.execute(f"""
            CREATE UNIQUE INDEX uix_policy_instances_one_active_per_scope
                ON policy_instances (company_id, COALESCE(branch_id, '{_NIL_UUID}'::uuid))
                WHERE is_active = TRUE
        """)


def downgrade() -> None:
    if not _is_postgres():
        return

    # Drop the institutional index and restore the prior text-cast version
    # so the migration chain is fully reversible back to c9f3a2b1d4e5.
    op.execute("DROP INDEX IF EXISTS uix_policy_instances_one_active_per_scope")

    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uix_policy_instances_one_active_per_scope
            ON policy_instances (company_id, COALESCE(branch_id::text, ''))
            WHERE is_active = TRUE
    """)
