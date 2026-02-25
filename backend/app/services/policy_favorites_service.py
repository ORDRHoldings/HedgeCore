"""
Policy Favorites Service -- per-user policy template bookmarks.
"""
from __future__ import annotations

import logging
import uuid as _uuid
from typing import Optional

from sqlalchemy import and_, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.policy_favorite import PolicyFavorite
from app.models.policy import PolicyTemplate
from app.models.user import User
from app.services import policy_service

logger = logging.getLogger(__name__)


async def add_favorite(
    session: AsyncSession,
    user: User,
    template_id: _uuid.UUID,
    notes: Optional[str] = None,
) -> PolicyFavorite:
    """
    Add a policy template to the user's favorites.
    Idempotent -- if already favorited, returns the existing record.
    Raises ValueError if template is not accessible to the user.
    """
    # Verify template is accessible to this user
    tmpl = await policy_service.get_template(session, template_id, user)
    if not tmpl:
        raise ValueError(f"Policy template {template_id} not found or not accessible")

    # Check if already favorited
    existing_q = await session.execute(
        select(PolicyFavorite).where(
            PolicyFavorite.user_id == user.id,
            PolicyFavorite.template_id == template_id,
        )
    )
    existing = existing_q.scalars().first()
    if existing:
        return existing

    fav = PolicyFavorite(
        user_id=user.id,
        template_id=template_id,
        notes=notes,
    )
    session.add(fav)
    try:
        await session.commit()
        await session.refresh(fav)
    except IntegrityError:
        await session.rollback()
        # Race condition: another request just inserted -- fetch and return
        result = await session.execute(
            select(PolicyFavorite).where(
                PolicyFavorite.user_id == user.id,
                PolicyFavorite.template_id == template_id,
            )
        )
        return result.scalar_one()
    return fav


async def remove_favorite(
    session: AsyncSession,
    user: User,
    template_id: _uuid.UUID,
) -> None:
    """Remove a policy template from the user's favorites. No-op if not favorited."""
    await session.execute(
        delete(PolicyFavorite).where(
            PolicyFavorite.user_id == user.id,
            PolicyFavorite.template_id == template_id,
        )
    )
    await session.commit()


async def list_favorites(
    session: AsyncSession,
    user: User,
) -> list[tuple[PolicyFavorite, PolicyTemplate]]:
    """
    Return all favorited templates for this user, including full template data.
    Ordered by most recently favorited first.
    """
    q = (
        select(PolicyFavorite, PolicyTemplate)
        .join(PolicyTemplate, PolicyFavorite.template_id == PolicyTemplate.id)
        .where(PolicyFavorite.user_id == user.id)
        .order_by(PolicyFavorite.created_at.desc())
    )
    result = await session.execute(q)
    return list(result.all())


async def is_favorite(
    session: AsyncSession,
    user_id: _uuid.UUID,
    template_id: _uuid.UUID,
) -> bool:
    """Check if a template is favorited by a user."""
    result = await session.execute(
        select(PolicyFavorite.id).where(
            PolicyFavorite.user_id == user_id,
            PolicyFavorite.template_id == template_id,
        )
    )
    return result.scalars().first() is not None
