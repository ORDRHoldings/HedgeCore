"""Phase 1: policy_revisions table, 4-eyes execution_proposals, policy_revision_id pins

Revision ID: b7d2e4f1a9c3
Revises: a3f8c1d2e4b5
Create Date: 2026-02-23

Implements:
  Sprint 1.0 -- Policy Version Pinning:
    1. CREATE TABLE policy_revisions (WORM, append-only)
       - Canonical policy config snapshot per activation
       - SHA-256 policy_hash for determinism verification
       - Revision number + prev_revision_id for diff traversal
    2. ALTER TABLE positions ADD COLUMN policy_revision_id UUID
    3. ALTER TABLE calculation_runs ADD COLUMN policy_revision_id VARCHAR(64)
    4. WORM triggers on policy_revisions (UPDATE/DELETE blocked)

  Sprint 1.1 -- True 4-Eyes Execution Proposals:
    5. CREATE TABLE execution_proposals
       - State machine: PROPOSED -> APPROVED -> EXECUTED | WITHDRAWN | REJECTED
       - DB CHECK constraint: approved_by IS NULL OR approved_by != proposed_by
         (SoD at DB layer -- defense-in-depth beyond service guard)
       - proposal_hash + approval_hash for tamper evidence
    6. Unique partial index: only one active (PROPOSED|APPROVED) proposal per position
    7. WORM trigger: execution_proposals rows cannot be deleted
       (updated_at writes are allowed -- status transitions are updates, not inserts)

Note on execution_proposals WORM:
  Unlike audit_events/calculation_runs which are fully immutable, execution_proposals
  allow UPDATE (status transitions are legitimate). The WORM constraint here is
  DELETE-only -- rows cannot be destroyed. This preserves the full approval history
  even for withdrawn/rejected proposals.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b7d2e4f1a9c3"
down_revision: str = "a3f8c1d2e4b5"
branch_labels = None
depends_on = None


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    # ?? 1. policy_revisions table ??????????????????????????????????????????
    op.execute("""
        CREATE TABLE IF NOT EXISTS policy_revisions (
            id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
            policy_instance_id  UUID          NOT NULL,
            template_id         UUID          NOT NULL,
            company_id          UUID          NOT NULL,
            branch_id           UUID,
            revision            INTEGER       NOT NULL DEFAULT 1,
            canonical_policy    JSONB         NOT NULL,
            policy_hash         VARCHAR(64)   NOT NULL,
            created_by          UUID          NOT NULL,
            created_by_email    VARCHAR(255),
            change_reason       TEXT,
            prev_revision_id    UUID,
            created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_policy_rev_instance_revision
                UNIQUE (policy_instance_id, revision)
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_policy_rev_instance
            ON policy_revisions (policy_instance_id, revision)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_policy_rev_hash
            ON policy_revisions (policy_hash)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_policy_rev_tenant
            ON policy_revisions (company_id, created_at)
    """)

    # ?? 2. Policy version pinning columns ??????????????????????????????????
    # positions: add policy_revision_id
    op.execute("""
        ALTER TABLE positions
        ADD COLUMN IF NOT EXISTS policy_revision_id UUID
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_positions_policy_revision
            ON positions (policy_revision_id)
        WHERE policy_revision_id IS NOT NULL
    """)

    # calculation_runs: add policy_revision_id (replaces the orphan policy_hash column)
    op.execute("""
        ALTER TABLE calculation_runs
        ADD COLUMN IF NOT EXISTS policy_revision_id VARCHAR(64)
    """)
    # policy_hash already exists from previous migration -- ensure it does
    op.execute("""
        ALTER TABLE calculation_runs
        ADD COLUMN IF NOT EXISTS policy_hash VARCHAR(128)
    """)

    # ?? 3. WORM trigger on policy_revisions ????????????????????????????????
    if _is_postgres():
        op.execute("""
            CREATE OR REPLACE FUNCTION _worm_block_policy_revisions()
            RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION
                    'WORM violation: policy_revisions rows are immutable. '
                    'UPDATE and DELETE are not permitted on this table. '
                    'Row id=% attempted operation=%.',
                    OLD.id, TG_OP;
                RETURN NULL;
            END;
            $$
        """)

        op.execute("DROP TRIGGER IF EXISTS trg_worm_policy_revisions_update ON policy_revisions")
        op.execute("""
            CREATE TRIGGER trg_worm_policy_revisions_update
            BEFORE UPDATE ON policy_revisions
            FOR EACH ROW EXECUTE FUNCTION _worm_block_policy_revisions()
        """)
        op.execute("DROP TRIGGER IF EXISTS trg_worm_policy_revisions_delete ON policy_revisions")
        op.execute("""
            CREATE TRIGGER trg_worm_policy_revisions_delete
            BEFORE DELETE ON policy_revisions
            FOR EACH ROW EXECUTE FUNCTION _worm_block_policy_revisions()
        """)

    # ?? 4. execution_proposals table ??????????????????????????????????????
    op.execute("""
        CREATE TABLE IF NOT EXISTS execution_proposals (
            id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
            position_id         UUID          NOT NULL,
            company_id          UUID          NOT NULL,
            branch_id           UUID,
            status              VARCHAR(16)   NOT NULL DEFAULT 'PROPOSED',
            proposed_by         UUID          NOT NULL,
            proposed_by_email   VARCHAR(255),
            proposed_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
            proposal_payload    JSONB         NOT NULL DEFAULT '{}',
            proposal_hash       VARCHAR(64)   NOT NULL,
            approved_by         UUID,
            approved_by_email   VARCHAR(255),
            approved_at         TIMESTAMPTZ,
            approval_notes      TEXT,
            approval_hash       VARCHAR(64),
            execution_ref       VARCHAR(128),
            executed_at         TIMESTAMPTZ,
            rejection_reason    TEXT,
            created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

            -- SoD enforcement at DB layer: approver cannot be same as proposer
            CONSTRAINT ck_execution_proposals_sod
                CHECK (approved_by IS NULL OR approved_by != proposed_by)
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_exec_proposals_position
            ON execution_proposals (position_id, status)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_exec_proposals_company
            ON execution_proposals (company_id, status, proposed_at)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_exec_proposals_proposer
            ON execution_proposals (proposed_by, status)
    """)

    # ?? 5. Unique partial index: one active proposal per position ??????????
    # Prevents race conditions where two makers simultaneously propose
    # execution for the same position.
    if _is_postgres():
        op.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS uix_exec_proposals_active_per_position
                ON execution_proposals (position_id)
                WHERE status IN ('PROPOSED', 'APPROVED')
        """)

    # ?? 6. execution_proposals WORM (DELETE-only -- updates allowed for transitions)
    if _is_postgres():
        op.execute("""
            CREATE OR REPLACE FUNCTION _worm_block_exec_proposals_delete()
            RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION
                    'WORM violation: execution_proposals rows cannot be deleted. '
                    'Proposal history must be preserved for audit trail. '
                    'Row id=% status=%.',
                    OLD.id, OLD.status;
                RETURN NULL;
            END;
            $$
        """)
        op.execute("DROP TRIGGER IF EXISTS trg_worm_exec_proposals_delete ON execution_proposals")
        op.execute("""
            CREATE TRIGGER trg_worm_exec_proposals_delete
            BEFORE DELETE ON execution_proposals
            FOR EACH ROW EXECUTE FUNCTION _worm_block_exec_proposals_delete()
        """)


def downgrade() -> None:
    if _is_postgres():
        op.execute("DROP TRIGGER IF EXISTS trg_worm_policy_revisions_update ON policy_revisions")
        op.execute("DROP TRIGGER IF EXISTS trg_worm_policy_revisions_delete ON policy_revisions")
        op.execute("DROP FUNCTION IF EXISTS _worm_block_policy_revisions()")
        op.execute("DROP TRIGGER IF EXISTS trg_worm_exec_proposals_delete ON execution_proposals")
        op.execute("DROP FUNCTION IF EXISTS _worm_block_exec_proposals_delete()")

    # Remove pinning columns
    for stmt in [
        "ALTER TABLE positions DROP COLUMN IF EXISTS policy_revision_id",
        "ALTER TABLE calculation_runs DROP COLUMN IF EXISTS policy_revision_id",
    ]:
        try:
            op.execute(stmt)
        except Exception:
            pass

    # NOTE: We do NOT drop policy_revisions or execution_proposals in downgrade.
    # Dropping governance tables destroys audit history. Manual intervention required.
