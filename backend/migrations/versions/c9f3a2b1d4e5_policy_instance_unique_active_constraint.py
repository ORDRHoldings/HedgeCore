"""DB-POLICY-1: Add unique partial index on policy_instances for one-active-per-scope

Revision ID: c9f3a2b1d4e5
Revises: b7d2e4f1a9c3
Create Date: 2026-02-28

Gap: PolicyInstance enforces at-most-one-active per (company_id, branch_id) only at
     service layer. A race condition (two concurrent activate_policy() calls) can produce
     two active instances for the same scope, breaking the invariant.

Fix: Add a UNIQUE partial index WHERE is_active=TRUE on (company_id, branch_id) so the
     database enforces the constraint as a hard uniqueness violation (IntegrityError).
     The service layer catch-and-409 handler is added separately in policy_service.py.

Note: PostgreSQL supports partial indexes natively. For other dialects, this migration
      skips the partial index and falls back to service-layer enforcement.
"""
from __future__ import annotations

from alembic import op


revision: str = "c9f3a2b1d4e5"
down_revision: str = "b7d2e4f1a9c3"
branch_labels = None
depends_on = None


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    if _is_postgres():
        # Remove existing active instances that would violate the constraint
        # (should never exist in a healthy deployment, but guard against it)
        op.execute("""
            -- Deactivate duplicate active instances, keeping the most recent per scope
            UPDATE policy_instances
            SET is_active = FALSE
            WHERE id NOT IN (
                SELECT DISTINCT ON (company_id, COALESCE(branch_id::text, 'NULL'))
                    id
                FROM policy_instances
                WHERE is_active = TRUE
                ORDER BY company_id, COALESCE(branch_id::text, 'NULL'), activated_at DESC
            )
            AND is_active = TRUE
        """)

        # Create unique partial index: at most one is_active=TRUE per (company_id, branch_id)
        op.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS uix_policy_instances_one_active_per_scope
                ON policy_instances (company_id, COALESCE(branch_id::text, ''))
                WHERE is_active = TRUE
        """)


def downgrade() -> None:
    if _is_postgres():
        op.execute("""
            DROP INDEX IF EXISTS uix_policy_instances_one_active_per_scope
        """)
