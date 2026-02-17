"""rbac: roles and user_roles

Revision ID: da9523383f47
Revises: rbac_roles_user_roles
Create Date: 2025-10-08 04:40:59.088402

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'da9523383f47'
down_revision: Union[str, Sequence[str], None] = 'rbac_roles_user_roles'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
