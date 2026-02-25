"""
app/services/user_service.py
HedgeCalc - User database service layer.

Provides:
  - create_user - register new user (bcrypt-hashed password)
  - authenticate - verify credentials
  - bump_token_version - rotate refresh tokens
"""

from __future__ import annotations
import logging
from typing import Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.core.security import hash_password, verify_password

logger = logging.getLogger(__name__)


class UserService:
    """Encapsulates all user-related DB operations."""

    @staticmethod
    async def get_by_email(db: AsyncSession, email: str) -> Optional[User]:
        stmt = select(User).where(User.email == email)
        result = await db.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def create_user(db: AsyncSession, email: str, password: str) -> User:
        existing = await UserService.get_by_email(db, email)
        if existing:
            logger.warning("Registration attempt with existing email: %s", email)
            raise ValueError("Email already registered")

        user = User(email=email, hashed_password=hash_password(password))
        db.add(user)
        await db.commit()
        await db.refresh(user)
        logger.info("User created: id=%s email=%s", user.id, user.email)
        return user

    @staticmethod
    async def authenticate(db: AsyncSession, email: str, password: str) -> Optional[User]:
        user = await UserService.get_by_email(db, email)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        if not user.is_active:
            return None
        return user

    @staticmethod
    async def bump_token_version(db: AsyncSession, user_id: int) -> int:
        stmt = (
            update(User)
            .where(User.id == user_id)
            .values(token_version=User.token_version + 1)
            .returning(User.token_version)
        )
        result = await db.execute(stmt)
        await db.commit()
        new_version = result.scalar_one()
        logger.info("token_version bumped for user_id=%s -> %s", user_id, new_version)
        return new_version
