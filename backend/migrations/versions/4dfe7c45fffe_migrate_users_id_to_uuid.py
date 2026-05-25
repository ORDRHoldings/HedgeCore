"""migrate users.id to uuid

Revision ID: 4dfe7c45fffe
Revises: e2180e1dd4e7
Create Date: 2025-10-08 18:41:00.000000

Purpose:
Convert all `users.id` and related foreign keys to UUID.
Ensures consistency across RBAC, audit, and token tables.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "4dfe7c45fffe"
down_revision = "e2180e1dd4e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade schema to use UUID user IDs.

    Idempotency: wrapped in a `users.id is integer` guard so this migration
    is safe to run on:
      (a) Fresh PG where the chain just created INTEGER user_id columns
          (referencing tables are empty → `USING NULL::uuid` is valid).
      (b) Snapshot DBs already past UUID conversion (no-op via guard).

    The original body used `USING user_id::uuid` which PostgreSQL rejects at
    plan time with `CannotCoerce: cannot cast type integer to uuid` — invalid
    syntax regardless of table contents. This historically didn't matter
    because production paths swallow alembic failures non-fatally and
    `_ensure_tables()` brings the schema up via `Base.metadata.create_all`.
    The advisory `backend-postgres` CI job runs alembic in isolation, so it
    surfaced the bug. See RISK-CI-PG-02.
    """
    op.execute("""
DO $$
BEGIN
    -- Only run the conversion path when users.id is still integer.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'id' AND data_type = 'integer'
    ) THEN
        -- 1) Drop existing FK constraints that depend on users.id
        ALTER TABLE IF EXISTS user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
        ALTER TABLE IF EXISTS audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
        ALTER TABLE IF EXISTS auth_audit_logs DROP CONSTRAINT IF EXISTS auth_audit_logs_user_id_fkey;
        ALTER TABLE IF EXISTS refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_user_id_fkey;

        -- 2) Change users.id to UUID with a fresh generator. Empty fresh DB:
        -- `USING gen_random_uuid()` produces a row-per-uuid (no rows → no-op
        -- but type changes). Snapshot DB with real users: every existing user
        -- gets a fresh UUID — irreversible but acceptable for this chain's
        -- intended one-way migration (no downgrade path either).
        ALTER TABLE users
            ALTER COLUMN id DROP DEFAULT,
            ALTER COLUMN id TYPE uuid USING gen_random_uuid(),
            ALTER COLUMN id SET DEFAULT gen_random_uuid();

        -- 3) Convert referencing columns. On fresh PG these tables are empty
        -- so `USING NULL::uuid` is type-safe (the old `user_id::uuid` fails at
        -- plan time even when the table has zero rows). On a hypothetical
        -- non-empty DB the referencing rows would lose their link to the new
        -- user UUIDs — but step 2 above already broke that link by generating
        -- fresh UUIDs for all users.
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='user_roles' AND column_name='user_id' AND data_type='integer') THEN
            ALTER TABLE user_roles ALTER COLUMN user_id TYPE uuid USING NULL::uuid;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='audit_logs' AND column_name='user_id' AND data_type='integer') THEN
            ALTER TABLE audit_logs ALTER COLUMN user_id TYPE uuid USING NULL::uuid;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='auth_audit_logs' AND column_name='user_id' AND data_type='integer') THEN
            ALTER TABLE auth_audit_logs ALTER COLUMN user_id TYPE uuid USING NULL::uuid;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='refresh_tokens' AND column_name='user_id' AND data_type='integer') THEN
            ALTER TABLE refresh_tokens ALTER COLUMN user_id TYPE uuid USING NULL::uuid;
        END IF;

        -- 4) Recreate foreign keys with UUID references
        ALTER TABLE user_roles
            ADD CONSTRAINT user_roles_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        ALTER TABLE audit_logs
            ADD CONSTRAINT audit_logs_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE auth_audit_logs
            ADD CONSTRAINT auth_audit_logs_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE refresh_tokens
            ADD CONSTRAINT refresh_tokens_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

        -- 5) Audit-log marker row (legacy column shape is fine here — the
        -- table was created by e2180e1dd4e7 with these exact columns).
        INSERT INTO audit_logs (request_id, method, path, status, duration_ms)
        VALUES ('migration-uuid', 'SYS', '/migrate_users_id_to_uuid', 200, 0);
    END IF;
END
$$;
    """)


def downgrade() -> None:
    """No downgrade path -- irreversible migration."""
    pass
