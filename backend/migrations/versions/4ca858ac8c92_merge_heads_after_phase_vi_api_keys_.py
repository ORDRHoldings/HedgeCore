"""merge heads after Phase VI api_keys rebuild

Revision ID: 4ca858ac8c92
Revises: e433a0e8edb3, 2fab7a59bced
Create Date: 2025-10-09 19:41:10.014634

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4ca858ac8c92'
down_revision: Union[str, Sequence[str], None] = ('e433a0e8edb3', '2fab7a59bced')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
