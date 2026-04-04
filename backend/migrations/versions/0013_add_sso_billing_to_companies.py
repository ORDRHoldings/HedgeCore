"""add SSO and billing columns to companies

Revision ID: 0013_add_sso_billing_to_companies
Revises: 0012_add_ui_preferences_to_users
Create Date: 2026-04-03

Purpose:
    The Company ORM model (app/models/organization.py) declares SSO and
    billing columns that were absent from the production companies table.

    When /auth/me calls selectinload(User.company), SQLAlchemy emits:
        SELECT companies.* FROM companies WHERE id IN (...)
    which fails with UndefinedColumnError: column companies.sso_provider
    does not exist.

    This caused /auth/me to return 500 (previously swallowed as 401),
    making the dashboard show a black screen for all users.

    Missing columns:
        sso_provider         VARCHAR(64)  — WorkOS provider type
        sso_domain           VARCHAR(255) — email domain for SSO routing
        stripe_customer_id   VARCHAR(128) UNIQUE — Stripe cus_...
        stripe_subscription_id VARCHAR(128) UNIQUE — Stripe sub_...
        plan_tier            VARCHAR(32) NOT NULL DEFAULT 'starter'
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_add_sso_billing_to_companies"
down_revision = "0012_add_ui_preferences_to_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("sso_provider", sa.String(64), nullable=True))
    op.add_column("companies", sa.Column("sso_domain", sa.String(255), nullable=True))
    op.add_column("companies", sa.Column(
        "stripe_customer_id", sa.String(128), nullable=True, unique=True
    ))
    op.add_column("companies", sa.Column(
        "stripe_subscription_id", sa.String(128), nullable=True, unique=True
    ))
    op.add_column("companies", sa.Column(
        "plan_tier", sa.String(32), nullable=False, server_default="starter"
    ))


def downgrade() -> None:
    op.drop_column("companies", "plan_tier")
    op.drop_column("companies", "stripe_subscription_id")
    op.drop_column("companies", "stripe_customer_id")
    op.drop_column("companies", "sso_domain")
    op.drop_column("companies", "sso_provider")
