"""
app/crud/refresh_token.py
HedgeCalc - Refresh Token CRUD (Phase VII, Single-Session Policy)

Enhancements:
- Enforces single-session policy (revokes all prior tokens on create)
- Retains full UUID compatibility and structured logging
- Safe transactional handling and rollback on failure
- Deadlock-safe: revoke+insert in one transaction with retry on DeadlockDetectedError
"""

from __future__ import annotations

import asyncio
import logging
import random
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_token import RefreshToken

logger = logging.getLogger(__name__)

_MAX_DEADLOCK_RETRIES = 3


# -------------------------------------------------------------------
# ? Create
# -------------------------------------------------------------------
async def create(
    db: AsyncSession,
    *,
    jti: str,
    user_id: UUID,
    expires_at: datetime,
    ip: str | None,
    user_agent: str | None,
) -> RefreshToken:
    """
    Persist a new refresh token record (UUID-safe) and enforce single-session policy.

    Revoke-all and insert run in a single transaction to avoid partial-commit races.
    Retries on DeadlockDetectedError (PostgreSQL aborts one side cleanly — retry is safe).
    """
    for attempt in range(1, _MAX_DEADLOCK_RETRIES + 1):
        try:
            # Revoke all prior tokens and insert new one in one atomic transaction.
            await db.execute(
                update(RefreshToken)
                .where(RefreshToken.user_id == user_id)
                .values(revoked=True)
                .execution_options(synchronize_session="fetch")
            )
            rt = RefreshToken(
                jti=jti,
                user_id=user_id,
                expires_at=expires_at,
                revoked=False,
                created_ip=ip,
                created_user_agent=user_agent,
            )
            db.add(rt)
            await db.commit()
            await db.refresh(rt)
            logger.info(
                "RefreshToken:create user_id=%s jti=%s exp=%s ip=%s ua=%s",
                str(user_id),
                jti,
                expires_at.isoformat(),
                ip,
                (user_agent or "")[:120],
            )
            return rt
        except Exception as exc:
            await db.rollback()
            exc_name = type(exc).__name__
            if "DeadlockDetected" in exc_name and attempt < _MAX_DEADLOCK_RETRIES:
                delay = 0.05 * attempt + random.uniform(0, 0.05)
                logger.warning(
                    "RefreshToken:create deadlock user_id=%s attempt=%d/%d retry_in=%.3fs",
                    str(user_id), attempt, _MAX_DEADLOCK_RETRIES, delay,
                )
                await asyncio.sleep(delay)
                continue
            logger.exception("RefreshToken:create failed for user_id=%s reason=%s", str(user_id), exc)
            raise


# -------------------------------------------------------------------
# ? Get by JTI
# -------------------------------------------------------------------
async def get_by_jti(db: AsyncSession, *, jti: str) -> RefreshToken | None:
    res = await db.execute(select(RefreshToken).where(RefreshToken.jti == jti))
    token = res.scalars().first()
    logger.debug("RefreshToken:get_by_jti jti=%s found=%s", jti, bool(token))
    return token


# -------------------------------------------------------------------
# ? Revoke by JTI
# -------------------------------------------------------------------
async def revoke_by_jti(db: AsyncSession, *, jti: str) -> int:
    q = (
        update(RefreshToken)
        .where(RefreshToken.jti == jti)
        .values(revoked=True)
        .execution_options(synchronize_session="fetch")
    )
    res = await db.execute(q)
    await db.commit()
    affected = res.rowcount or 0
    if affected:
        logger.info("RefreshToken:revoke_by_jti jti=%s revoked=True", jti)
    else:
        logger.warning("RefreshToken:revoke_by_jti jti=%s not_found", jti)
    return affected


# -------------------------------------------------------------------
# ? Rotate
# -------------------------------------------------------------------
async def rotate(
    db: AsyncSession,
    *,
    user_id: UUID,
    old_token: str,
    new_token: str,
) -> None:
    """
    Optional rotation helper: revoke old token and insert new one.
    """
    try:
        old = await get_by_jti(db, jti=old_token)
        if old:
            old.revoked = True
        await db.commit()
        logger.info("RefreshToken:rotate user=%s old_jti=%s -> rotated", str(user_id), old_token)
    except Exception as exc:
        logger.error("RefreshToken:rotate error user=%s reason=%s", str(user_id), exc)
        await db.rollback()
        raise


# -------------------------------------------------------------------
# ? Validation
# -------------------------------------------------------------------
async def is_valid_for_refresh(db: AsyncSession, *, jti: str) -> bool:
    token = await get_by_jti(db, jti=jti)
    if not token:
        logger.debug("RefreshToken:is_valid jti=%s -> False (missing)", jti)
        return False
    if token.revoked:
        logger.debug("RefreshToken:is_valid jti=%s -> False (revoked)", jti)
        return False
    if token.expires_at <= datetime.now(UTC):
        logger.debug("RefreshToken:is_valid jti=%s -> False (expired)", jti)
        return False
    logger.debug("RefreshToken:is_valid jti=%s -> True", jti)
    return True


# -------------------------------------------------------------------
# ? Revoke all for user
# -------------------------------------------------------------------
async def revoke_all_for_user(db: AsyncSession, *, user_id: UUID, commit: bool = True) -> int:
    """
    Revoke all active refresh tokens for the specified UUID user.

    Pass commit=False when called inside a larger transaction that commits separately.
    """
    q = (
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id)
        .values(revoked=True)
        .execution_options(synchronize_session="fetch")
    )
    res = await db.execute(q)
    if commit:
        await db.commit()
    affected = res.rowcount or 0
    logger.info("RefreshToken:revoke_all_for_user user_id=%s revoked=%s", str(user_id), affected)
    return affected
