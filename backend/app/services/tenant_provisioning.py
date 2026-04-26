"""
backend/app/services/tenant_provisioning.py

Atomic tenant provisioning: Company + admin User + GENESIS audit event.
All three writes happen in a single DB transaction.
"""
from __future__ import annotations

import logging
import re
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.audit_event import GENESIS_HASH, build_audit_event
from app.models.organization import Company
from app.models.user import User

logger = logging.getLogger(__name__)


def _slugify(name: str) -> str:
    """Convert a company name to a URL-safe slug with a short UUID suffix."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower().strip()).strip("-")
    slug = slug[:48] if len(slug) > 48 else slug
    suffix = str(uuid.uuid4())[:8]
    return f"{slug}-{suffix}" if slug else suffix


async def provision_tenant(
    db: AsyncSession,
    *,
    company_name: str,
    admin_email: str,
    admin_password: str,
    plan_tier: str = "starter",
) -> tuple[Company, User]:
    """
    Atomically create:
      1. Company record (plan_tier=plan_tier)
      2. Admin User linked to company
      3. GENESIS audit event (prev_event_hash = 64 zeros)

    Returns (company, user). Caller must commit or the transaction will roll back.
    Raises ValueError if company_name or admin_email is empty.
    """
    if not company_name.strip():
        raise ValueError("company_name must not be empty")
    if not admin_email.strip():
        raise ValueError("admin_email must not be empty")

    company = Company(
        name=company_name.strip(),
        slug=_slugify(company_name),
        plan_tier=plan_tier,
    )
    db.add(company)
    await db.flush()  # get company.id without committing

    hashed = hash_password(admin_password)
    user = User(
        email=admin_email.strip().lower(),
        hashed_password=hashed,
        full_name="",
        company_id=company.id,
        is_active=True,
        is_superuser=True,
    )
    db.add(user)
    await db.flush()  # get user.id

    # GENESIS audit event — prev_event_hash must be 64 zeros per architecture freeze
    genesis_event = build_audit_event(
        event_type="SYSTEM",
        description=f"Tenant provisioned: {company_name.strip()}",
        payload={
            "company_id": str(company.id),
            "company_name": company_name.strip(),
            "plan_tier": plan_tier,
            "admin_email": admin_email.strip().lower(),
        },
        prev_event_hash=GENESIS_HASH,
        company_id=company.id,
        actor_id=user.id,
        actor_email=admin_email.strip().lower(),
        actor_role="superuser",
        entity_type="company",
        entity_id=str(company.id),
    )
    db.add(genesis_event)

    logger.info(
        "Provisioned tenant company_id=%s user_id=%s plan_tier=%s",
        company.id, user.id, plan_tier,
    )
    return company, user
