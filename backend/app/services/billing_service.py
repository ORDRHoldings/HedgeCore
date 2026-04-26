"""
backend/app/services/billing_service.py

Stripe billing integration — test-mode only until STRIPE_LIVE_MODE=true.
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Company

logger = logging.getLogger(__name__)

STRIPE_PLAN_MAP: dict[str, str] = {
    "starter": "starter",
    "professional": "professional",
    "enterprise": "enterprise",
}

async def apply_subscription_active(
    db: AsyncSession,
    stripe_customer_id: str,
    stripe_subscription_id: str,
    plan_tier: str,
) -> None:
    """Mark company subscription active and set plan tier."""
    result = await db.execute(
        select(Company).where(Company.stripe_customer_id == stripe_customer_id)
    )
    company = result.scalar_one_or_none()
    if company is None:
        logger.warning("apply_subscription_active: no company for customer %s", stripe_customer_id)
        return
    company.stripe_subscription_id = stripe_subscription_id
    company.plan_tier = STRIPE_PLAN_MAP.get(plan_tier, "starter")
    await db.commit()
    logger.info("Company %s subscription active, tier=%s", company.id, company.plan_tier)


async def apply_subscription_cancelled(
    db: AsyncSession,
    stripe_customer_id: str,
) -> None:
    """Downgrade company to starter tier on cancellation."""
    result = await db.execute(
        select(Company).where(Company.stripe_customer_id == stripe_customer_id)
    )
    company = result.scalar_one_or_none()
    if company is None:
        logger.warning("apply_subscription_cancelled: no company for customer %s", stripe_customer_id)
        return
    company.plan_tier = "starter"
    company.stripe_subscription_id = None
    await db.commit()
    logger.info("Company %s subscription cancelled, downgraded to starter", company.id)


async def apply_payment_failed(
    db: AsyncSession,
    stripe_customer_id: str,
) -> None:
    """Log payment failure — do NOT immediately downgrade tier. Grace period is Stripe's responsibility."""
    result = await db.execute(
        select(Company).where(Company.stripe_customer_id == stripe_customer_id)
    )
    company = result.scalar_one_or_none()
    if company is None:
        logger.warning("apply_payment_failed: no company for customer %s", stripe_customer_id)
        return
    logger.warning("Payment failed for company %s (customer %s)", company.id, stripe_customer_id)
    # Downgrade will happen when subscription.deleted fires if payment never recovers
