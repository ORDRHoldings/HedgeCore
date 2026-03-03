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
    """Upgrade schema to use UUID user IDs."""
    # 1?? Drop existing FK constraints that depend on users.id
    op.execute("ALTER TABLE IF EXISTS user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;")
    op.execute("ALTER TABLE IF EXISTS audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;")
    op.execute("ALTER TABLE IF EXISTS auth_audit_logs DROP CONSTRAINT IF EXISTS auth_audit_logs_user_id_fkey;")
    op.execute("ALTER TABLE IF EXISTS refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_user_id_fkey;")

    # 2?? Change users.id to UUID and set default generator
    op.execute("""
        ALTER TABLE users
        ALTER COLUMN id DROP DEFAULT,
        ALTER COLUMN id TYPE uuid USING gen_random_uuid(),
        ALTER COLUMN id SET DEFAULT gen_random_uuid();
    """)

    # 3?? Convert referencing columns to UUID type
    op.execute("ALTER TABLE user_roles ALTER COLUMN user_id TYPE uuid USING user_id::uuid;")
    op.execute("ALTER TABLE audit_logs ALTER COLUMN user_id TYPE uuid USING user_id::uuid;")
    op.execute("ALTER TABLE auth_audit_logs ALTER COLUMN user_id TYPE uuid USING user_id::uuid;")
    op.execute("ALTER TABLE refresh_tokens ALTER COLUMN user_id TYPE uuid USING user_id::uuid;")

    # 4?? Recreate foreign keys with UUID references
    op.execute("""
        ALTER TABLE user_roles
            ADD CONSTRAINT user_roles_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    """)
    op.execute("""
        ALTER TABLE audit_logs
            ADD CONSTRAINT audit_logs_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    """)
    op.execute("""
        ALTER TABLE auth_audit_logs
            ADD CONSTRAINT auth_audit_logs_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    """)
    op.execute("""
        ALTER TABLE refresh_tokens
            ADD CONSTRAINT refresh_tokens_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    """)

    # 5?? Log confirmation
    op.execute("INSERT INTO audit_logs (request_id, method, path, status, duration_ms) "
               "VALUES ('migration-uuid', 'SYS', '/migrate_users_id_to_uuid', 200, 0);")


def downgrade() -> None:
    """No downgrade path -- irreversible migration."""
    pass
