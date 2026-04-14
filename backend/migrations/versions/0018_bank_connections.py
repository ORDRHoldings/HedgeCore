# backend/migrations/versions/0018_bank_connections.py
"""Add bank_connections table

Revision ID: 0018_bank_connections
Revises: 0017_legal_entities
Create Date: 2026-04-14
"""
from alembic import op

revision = "0018_bank_connections"
down_revision = "0017_legal_entities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE bank_connections (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id),
            provider VARCHAR(32) NOT NULL,
            institution_id VARCHAR(100) NOT NULL,
            institution_name VARCHAR(255) NOT NULL,
            access_token_enc TEXT,
            refresh_token_enc TEXT,
            token_expires_at TIMESTAMPTZ,
            scope VARCHAR(255),
            status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
            last_successful_pull_at TIMESTAMPTZ,
            last_error_at TIMESTAMPTZ,
            last_error_message VARCHAR(500),
            consecutive_failure_count INTEGER NOT NULL DEFAULT 0,
            pending_oauth_state VARCHAR(128),
            pending_oauth_state_expires_at TIMESTAMPTZ,
            created_by UUID NOT NULL,
            approved_by UUID,
            approved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX ix_bc_company_id ON bank_connections(company_id);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS bank_connections;")
