"""
app/tasks/gdpr_anonymise.py
ORDR Terminal — Nightly GDPR data retention enforcement.

Runs nightly at 01:00 UTC via APScheduler.
Anonymises PII (email, full_name) for users older than GDPR_RETENTION_DAYS.
Hard deletion is NOT performed — WORM tables must stay intact.
"""
from __future__ import annotations

import hashlib
import logging
import os
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

log = logging.getLogger(__name__)

RETENTION_DAYS = int(os.getenv("GDPR_RETENTION_DAYS", "730"))
ANONYMISED_SENTINEL = "GDPR_ANONYMISED"
ANONYMISED_PASSWORD_HASH = "$2b$12$GDPR_ANONYMISED_ACCOUNT_CANNOT_LOGIN_XXXXXXXXXXXXXXXXXXX"


def _hash_pii(value: str) -> str:
    """SHA-256 hash of a PII field. Deterministic, irreversible."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def anonymise_user(session: AsyncSession, user: User) -> None:
    """
    Anonymise a single user's PII fields in-place.
    Row is retained for WORM FK integrity.
    """
    hashed_email = _hash_pii(user.email) + "@anonymised.invalid"
    await session.execute(
        update(User)
        .where(User.id == user.id)
        .values(
            email=hashed_email,
            full_name=ANONYMISED_SENTINEL,
            hashed_password=ANONYMISED_PASSWORD_HASH,
            is_active=False,
        )
    )
    await session.commit()
    log.info("Anonymised user %s (GDPR)", user.id)


async def run_gdpr_anonymise_job() -> None:
    """Entry point called by APScheduler at 01:00 UTC."""
    from app.core.db import async_session_maker

    cutoff = datetime.now(UTC) - timedelta(days=RETENTION_DAYS)
    log.info("GDPR anonymise job starting (cutoff=%s)", cutoff.isoformat())

    async with async_session_maker() as session:
        try:
            result = await session.execute(
                select(User).where(
                    User.created_at < cutoff,
                    User.email.not_like("%@anonymised.invalid"),
                )
            )
            users = result.scalars().all()
            for user in users:
                await anonymise_user(session, user)
            log.info("GDPR anonymise job complete: %d users anonymised", len(users))
        except Exception:
            log.exception("GDPR anonymise job failed — rolling back")
            await session.rollback()
