"""Merge baseline stamp head into main migration chain

Revision ID: 0011_merge_baseline_into_main
Revises: 0010_add_webhooks, 2026_03_24_baseline
Create Date: 2026-04-03

Purpose:
    Resolves the split Alembic head introduced when the baseline stamp
    (2026_03_24_baseline) was created from g1a2b3c4d5e6 while the main
    chain continued independently through k1a2b3c4d5e6 -> 0010_add_webhooks.

    This is a no-op merge revision (no DDL). It rejoins the two branches
    so that `alembic upgrade head` has a single target on all environments.

    On existing production:
        The DB is stamped at 0010_add_webhooks (all webhook tables present).
        Run: alembic stamp 0011_merge_baseline_into_main
        Or:  alembic upgrade head  (if current stamp is already at one head)
"""
from alembic import op

revision = "0011_merge_baseline_into_main"
down_revision = ("0010_add_webhooks", "2026_03_24_baseline")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
