"""merge heads: pipeline + policy hardening

Revision ID: 4d1b6f64977e
Revises: b1f2a3c4d5e6, f1a2b3c4d5e6
Create Date: 2026-02-28 16:14:31.537057

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4d1b6f64977e'
down_revision: Union[str, Sequence[str], None] = ('b1f2a3c4d5e6', 'f1a2b3c4d5e6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
