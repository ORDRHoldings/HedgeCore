# backend/migrations/versions/0022_cash_forecast.py
"""cash_forecast_items and cash_forecast_snapshots tables

Revision ID: 0022
Revises: 0021
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS cash_forecast_items (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id      UUID NOT NULL,
        entity_id       UUID,
        account_id      UUID,
        label           VARCHAR(255) NOT NULL,
        direction       VARCHAR(7) NOT NULL CHECK (direction IN ('INFLOW', 'OUTFLOW')),
        amount          NUMERIC(20,6) NOT NULL,
        currency        VARCHAR(3) NOT NULL,
        confidence      VARCHAR(16) NOT NULL DEFAULT 'COMMITTED'
                        CHECK (confidence IN ('COMMITTED', 'PROBABLE', 'POSSIBLE')),
        recurrence      VARCHAR(16) NOT NULL
                        CHECK (recurrence IN ('ONCE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY')),
        start_date      DATE NOT NULL,
        end_date        DATE,
        day_of_month    INTEGER CHECK (day_of_month BETWEEN 1 AND 28),
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_by      UUID NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ix_forecast_items_company ON cash_forecast_items(company_id);
    CREATE INDEX IF NOT EXISTS ix_forecast_items_entity ON cash_forecast_items(entity_id);
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS cash_forecast_snapshots (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id      UUID NOT NULL,
        entity_id       UUID,
        snapshot_date   DATE NOT NULL,
        horizon         VARCHAR(4) NOT NULL CHECK (horizon IN ('13w', '12m')),
        buckets         JSONB NOT NULL,
        parameters      JSONB NOT NULL DEFAULT '{}',
        created_by      UUID NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_forecast_snapshot UNIQUE (company_id, entity_id, snapshot_date, horizon)
    );
    CREATE INDEX IF NOT EXISTS ix_forecast_snapshots_company ON cash_forecast_snapshots(company_id);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS cash_forecast_snapshots;")
    op.execute("DROP TABLE IF EXISTS cash_forecast_items;")
