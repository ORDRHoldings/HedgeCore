# backend/migrations/versions/0023_intercompany_netting.py
"""intercompany_obligations and netting_proposals tables, counterparty_entity_id column

Revision ID: 0023
Revises: 0022
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS intercompany_obligations (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id          UUID NOT NULL,
        debtor_entity_id    UUID NOT NULL,
        creditor_entity_id  UUID NOT NULL,
        amount              NUMERIC(20,6) NOT NULL CHECK (amount > 0),
        currency            VARCHAR(3) NOT NULL,
        due_date            DATE NOT NULL,
        reference           VARCHAR(255),
        status              VARCHAR(16) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING', 'NETTED', 'SETTLED', 'CANCELLED')),
        created_by          UUID NOT NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_no_self_obligation CHECK (debtor_entity_id != creditor_entity_id)
    );
    CREATE INDEX IF NOT EXISTS ix_ic_obligations_company ON intercompany_obligations(company_id);
    CREATE INDEX IF NOT EXISTS ix_ic_obligations_debtor ON intercompany_obligations(debtor_entity_id);
    CREATE INDEX IF NOT EXISTS ix_ic_obligations_creditor ON intercompany_obligations(creditor_entity_id);
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS netting_proposals (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id          UUID NOT NULL,
        status              VARCHAR(16) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTED', 'REJECTED')),
        entity_a_id         UUID NOT NULL,
        entity_b_id         UUID NOT NULL,
        currency            VARCHAR(3) NOT NULL,
        gross_payable       NUMERIC(20,6) NOT NULL,
        gross_receivable    NUMERIC(20,6) NOT NULL,
        net_amount          NUMERIC(20,6) NOT NULL,
        net_direction       VARCHAR(4) NOT NULL CHECK (net_direction IN ('A2B', 'B2A')),
        savings             NUMERIC(20,6) NOT NULL,
        obligation_ids      JSONB NOT NULL,
        proposed_by         UUID NOT NULL,
        approved_by         UUID,
        proposed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        approved_at         TIMESTAMPTZ,
        executed_at         TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS ix_netting_proposals_company ON netting_proposals(company_id);
    """)

    op.execute("""
    ALTER TABLE cash_forecast_items
        ADD COLUMN IF NOT EXISTS counterparty_entity_id UUID;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE cash_forecast_items DROP COLUMN IF EXISTS counterparty_entity_id;")
    op.execute("DROP TABLE IF EXISTS netting_proposals;")
    op.execute("DROP TABLE IF EXISTS intercompany_obligations;")
