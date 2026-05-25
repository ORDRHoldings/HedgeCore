"""company: add sso_provider, sso_domain, stripe fields, plan_tier

Revision ID: h1a2b3c4d5e6
Revises: g1a2b3c4d5e6
Create Date: 2026-03-28
"""

from alembic import op
import sqlalchemy as sa

revision = "h1a2b3c4d5e6"
down_revision = "gg1a2b3c4d5e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("sso_provider", sa.String(64), nullable=True))
    op.add_column("companies", sa.Column("sso_domain", sa.String(255), nullable=True))
    op.add_column("companies", sa.Column("stripe_customer_id", sa.String(128), nullable=True))
    op.add_column("companies", sa.Column("stripe_subscription_id", sa.String(128), nullable=True))
    op.add_column(
        "companies",
        sa.Column("plan_tier", sa.String(32), nullable=False, server_default="starter"),
    )
    op.create_unique_constraint("uq_companies_stripe_customer_id", "companies", ["stripe_customer_id"])
    op.create_unique_constraint("uq_companies_stripe_subscription_id", "companies", ["stripe_subscription_id"])
    op.create_index("ix_companies_sso_domain", "companies", ["sso_domain"])
    op.create_index("ix_companies_plan_tier", "companies", ["plan_tier"])


def downgrade() -> None:
    op.drop_index("ix_companies_plan_tier", table_name="companies")
    op.drop_index("ix_companies_sso_domain", table_name="companies")
    op.drop_constraint("uq_companies_stripe_subscription_id", "companies", type_="unique")
    op.drop_constraint("uq_companies_stripe_customer_id", "companies", type_="unique")
    op.drop_column("companies", "plan_tier")
    op.drop_column("companies", "stripe_subscription_id")
    op.drop_column("companies", "stripe_customer_id")
    op.drop_column("companies", "sso_domain")
    op.drop_column("companies", "sso_provider")
