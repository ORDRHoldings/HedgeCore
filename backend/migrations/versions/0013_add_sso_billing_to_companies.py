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
    # Idempotent against h1a2b3c4d5e6_company_sso_billing_fields which already
    # adds these same 5 columns earlier in the chain. The duplicate is a
    # historical chain artifact (h1 was added later as a hotfix without
    # noting 0013's existence). On fresh chain replay, h1 runs first and
    # adds the columns; this migration must then no-op rather than crash
    # on "column already exists". Raw SQL `IF NOT EXISTS` is the standard
    # idempotent shape. RISK-CI-PG-02.
    op.execute("""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'companies') THEN
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS sso_provider VARCHAR(64);
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS sso_domain VARCHAR(255);
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(128);
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(128);
        ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan_tier VARCHAR(32) NOT NULL DEFAULT 'starter';
        -- Unique constraints (only add if not present)
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_companies_stripe_customer_id') THEN
            ALTER TABLE companies ADD CONSTRAINT uq_companies_stripe_customer_id UNIQUE (stripe_customer_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_companies_stripe_subscription_id') THEN
            ALTER TABLE companies ADD CONSTRAINT uq_companies_stripe_subscription_id UNIQUE (stripe_subscription_id);
        END IF;
    END IF;
END
$$;
    """)


def downgrade() -> None:
    op.execute("""
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'companies') THEN
        ALTER TABLE companies DROP CONSTRAINT IF EXISTS uq_companies_stripe_subscription_id;
        ALTER TABLE companies DROP CONSTRAINT IF EXISTS uq_companies_stripe_customer_id;
        ALTER TABLE companies DROP COLUMN IF EXISTS plan_tier;
        ALTER TABLE companies DROP COLUMN IF EXISTS stripe_subscription_id;
        ALTER TABLE companies DROP COLUMN IF EXISTS stripe_customer_id;
        ALTER TABLE companies DROP COLUMN IF EXISTS sso_domain;
        ALTER TABLE companies DROP COLUMN IF EXISTS sso_provider;
    END IF;
END
$$;
    """)
