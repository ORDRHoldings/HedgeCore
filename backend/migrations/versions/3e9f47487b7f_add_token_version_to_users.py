"""add token_version to users

Revision ID: 3e9f47487b7f
Revises: a1ed712e8018
Create Date: 2025-10-06 17:08:08.998649
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '3e9f47487b7f'
down_revision: Union[str, Sequence[str], None] = 'a1ed712e8018'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add token_version column to users table."""
    op.add_column(
        'users',
        sa.Column('token_version', sa.Integer(), nullable=False, server_default='0')
    )
    # remove server default after column creation
    op.alter_column('users', 'token_version', server_default=None)


def downgrade() -> None:
    """Remove token_version column if downgraded."""
    op.drop_column('users', 'token_version')
