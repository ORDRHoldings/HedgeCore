"""add ui_preferences column to users

Revision ID: 0012_add_ui_preferences_to_users
Revises: 0011_merge_baseline_into_main
Create Date: 2026-04-03

Purpose:
    The User ORM model (app/models/user.py) declares a `ui_preferences`
    JSONB column that was absent from the production database, causing
    SQLAlchemy to emit an UndefinedColumn ProgrammingError on every
    SELECT of the users table.  This manifested as all /auth/me calls
    returning 401 "Invalid or malformed token", making the dashboard
    render a black screen.

    Also covered by _ensure_tables() ALTER TABLE fallback so that
    services without the Alembic CLI wired in (Render uvicorn-only start)
    pick up the column on the next restart.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0012_add_ui_preferences_to_users"
down_revision = "0011_merge_baseline_into_main"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ui_preferences", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("users", "ui_preferences")
