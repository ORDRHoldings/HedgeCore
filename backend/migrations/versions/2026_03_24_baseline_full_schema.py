"""baseline: stamp full schema managed by _ensure_tables

Revision ID: 2026_03_24_baseline
Revises: g1a2b3c4d5e6
Create Date: 2026-03-24

Purpose:
    STAMP ONLY -- does NOT execute DDL.
    The full schema was built historically by _ensure_tables() in main.py.
    This revision establishes the Alembic baseline so future schema changes
    can be managed with: alembic revision --autogenerate

    For NEW environments:
        _ensure_tables() runs first (in lifespan), creating all tables.
        Then alembic upgrade head stamps this revision as applied.

    For EXISTING environments (production):
        Run once manually to sync state:
            cd backend && alembic stamp 2026_03_24_baseline
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '2026_03_24_baseline'
down_revision = 'g1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # STAMP ONLY -- schema already exists (built by _ensure_tables).
    # Future schema changes: alembic revision --autogenerate
    pass


def downgrade() -> None:
    # Cannot safely reverse the full historical schema.
    raise NotImplementedError(
        "downgrade from baseline_full_schema is not supported. "
        "Restore from a database backup instead."
    )
