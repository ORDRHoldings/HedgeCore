"""Migrate users.id and refresh_tokens.user_id to UUID

Revision ID: 17d871214f0b
Revises: 4dfe7c45fffe
Create Date: 2025-10-09 16:18:00.650250
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision: str = "17d871214f0b"
down_revision: Union[str, Sequence[str], None] = "4dfe7c45fffe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to UUID-safe primary/foreign key structure."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # --- USERS.ID MIGRATION ---
    cols = [c["name"] for c in inspector.get_columns("users")]
    if "id" in cols:
        col = next((c for c in inspector.get_columns("users") if c["name"] == "id"), None)
        if col and not isinstance(col["type"], postgresql.UUID):
            # Use pgcrypto’s gen_random_uuid() instead of uuid_generate_v4()
            op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
            op.execute("ALTER TABLE users ALTER COLUMN id DROP DEFAULT;")
            op.execute("ALTER TABLE users ALTER COLUMN id SET DATA TYPE uuid USING gen_random_uuid();")
            op.execute("ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();")
            op.execute("ALTER TABLE users ALTER COLUMN id SET NOT NULL;")
            op.execute("ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);")

    # --- REFRESH_TOKENS.USER_ID MIGRATION ---
    fk_name = None
    for fk in inspector.get_foreign_keys("refresh_tokens"):
        if fk["referred_table"] == "users":
            fk_name = fk["name"]
            break
    if fk_name:
        op.drop_constraint(fk_name, "refresh_tokens", type_="foreignkey")

    op.execute(
        "ALTER TABLE refresh_tokens ALTER COLUMN user_id SET DATA TYPE uuid USING user_id::text::uuid;"
    )
    op.create_foreign_key(
        "fk_refresh_tokens_user_id_users",
        "refresh_tokens",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # --- UNIQUE INDEX ---
    op.create_index("ix_users_email_unique", "users", ["email"], unique=True)

    print("✅ UUID migration complete using pgcrypto.gen_random_uuid().")


def downgrade() -> None:
    """Downgrade schema back to integer-based IDs (for legacy rollback)."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # Drop new FK
    fk_name = None
    for fk in inspector.get_foreign_keys("refresh_tokens"):
        if fk["referred_table"] == "users":
            fk_name = fk["name"]
            break
    if fk_name:
        op.drop_constraint(fk_name, "refresh_tokens", type_="foreignkey")

    # Convert back to integer (legacy mode)
    op.execute(
        "ALTER TABLE refresh_tokens ALTER COLUMN user_id SET DATA TYPE integer USING (user_id::text::integer);"
    )
    op.execute("ALTER TABLE users ALTER COLUMN id SET DATA TYPE integer USING (id::text::integer);")
    op.execute("ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq');")

    # Recreate old foreign key
    op.create_foreign_key(
        "fk_refresh_tokens_user_id_users",
        "refresh_tokens",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_index("ix_users_email_unique", table_name="users")

    print("⏪ Rolled back UUID migration (users.id & refresh_tokens.user_id).")
