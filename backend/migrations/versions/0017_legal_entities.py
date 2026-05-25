# backend/migrations/versions/0017_legal_entities.py
"""Add legal_entities table

Revision ID: 0017_legal_entities
Revises: 0016_settlement_events
Create Date: 2026-04-14
"""
from alembic import op

revision = "0017_legal_entities"
down_revision = "0016_settlement_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent against gg1a2b3c4d5e7_stub which pre-creates this table
    # for alembic-in-isolation (legal_entities is FK-referenced by
    # r1a2b3c4d5e6_add_debt_tables earlier in chain). CREATE/INDEX
    # IF NOT EXISTS make both ops safe on fresh-chain replay.
    op.execute("""
        CREATE TABLE IF NOT EXISTS legal_entities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id),
            parent_entity_id UUID REFERENCES legal_entities(id),
            legal_name VARCHAR(255) NOT NULL,
            short_name VARCHAR(100) NOT NULL,
            lei VARCHAR(20),
            giin VARCHAR(19),
            registration_number VARCHAR(100),
            jurisdiction VARCHAR(100),
            country CHAR(2) NOT NULL,
            functional_currency CHAR(3) NOT NULL,
            reporting_currency CHAR(3) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
            created_by UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            version INTEGER NOT NULL DEFAULT 1
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_le_company_id ON legal_entities(company_id);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS legal_entities;")
