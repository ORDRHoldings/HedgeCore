"""Recreate api_keys table for Phase VI (Service API Keys)."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# ----------------------------------------------------------------------
# Revision identifiers
# ----------------------------------------------------------------------
revision = "e433a0e8edb3"
down_revision = "17d871214f0b"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()

    # ✅ Create ENUM type only if not already present
    bind.exec_driver_sql(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_type WHERE typname = 'api_key_status'
            ) THEN
                CREATE TYPE api_key_status AS ENUM ('active', 'revoked', 'expired');
            END IF;
        END$$;
        """
    )

    # ✅ Only create table if it doesn't already exist
    bind.exec_driver_sql(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys'
            ) THEN
                CREATE TABLE api_keys (
                    id UUID PRIMARY KEY NOT NULL,
                    key_id VARCHAR(64) UNIQUE NOT NULL,
                    name VARCHAR(255),
                    secret_hash TEXT NOT NULL,
                    scopes TEXT[],
                    status VARCHAR(20) DEFAULT 'active' NOT NULL
                        CONSTRAINT ck_api_keys_status_valid
                        CHECK (status IN ('active', 'revoked', 'expired')),
                    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
                    last_used_at TIMESTAMPTZ,
                    expires_at TIMESTAMPTZ
                );
            END IF;
        END$$;
        """
    )

    # ✅ Create indexes safely
    bind.exec_driver_sql(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes WHERE indexname = 'ix_api_keys_status'
            ) THEN
                CREATE INDEX ix_api_keys_status ON api_keys (status);
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes WHERE indexname = 'ix_api_keys_owner'
            ) THEN
                CREATE INDEX ix_api_keys_owner ON api_keys (owner_user_id);
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes WHERE indexname = 'ix_api_keys_expires_at'
            ) THEN
                CREATE INDEX ix_api_keys_expires_at ON api_keys (expires_at);
            END IF;
        END$$;
        """
    )


def downgrade():
    bind = op.get_bind()

    bind.exec_driver_sql("DROP INDEX IF EXISTS ix_api_keys_expires_at;")
    bind.exec_driver_sql("DROP INDEX IF EXISTS ix_api_keys_owner;")
    bind.exec_driver_sql("DROP INDEX IF EXISTS ix_api_keys_status;")
    bind.exec_driver_sql("DROP TABLE IF EXISTS api_keys CASCADE;")
    bind.exec_driver_sql("DROP TYPE IF EXISTS api_key_status CASCADE;")
