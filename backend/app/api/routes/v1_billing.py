"""
backend/app/api/routes/v1_billing.py

Stripe webhook endpoint. Signature verified before any DB writes.
"""
from __future__ import annotations

import logging
import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.config import get_settings
from app.services.billing_service import (
    apply_subscription_active,
    apply_subscription_cancelled,
    apply_payment_failed,
    STRIPE_PLAN_MAP,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/billing", tags=["billing"])


class WebhookAck(BaseModel):
    received: bool = True


@router.post("/webhook", status_code=200, response_model=WebhookAck)
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature"),
    db: AsyncSession = Depends(get_session),
):
    """
    Stripe webhook handler. Verifies signature, then dispatches to billing_service.

    Events handled:
    - invoice.paid -> apply_subscription_active
    - invoice.payment_failed -> apply_payment_failed
    - customer.subscription.deleted -> apply_subscription_cancelled
    """
    settings = get_settings()
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Stripe webhook not configured")

    payload = await request.body()

    try:
        stripe.api_key = settings.stripe_secret_key
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.SignatureVerificationError:
        logger.warning("Stripe webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception as exc:
        logger.error("Stripe webhook parse error: %s", exc)
        raise HTTPException(status_code=400, detail="Webhook parse error")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "invoice.paid":
        customer_id = data.get("customer")
        subscription_id = data.get("subscription")
        # plan_tier is in subscription_details.metadata for real Stripe invoice.paid events;
        # top-level metadata does not exist on invoice objects in the Stripe API.
        # We check subscription_details.metadata first, then fall back to top-level metadata
        # (present in some test webhook shapes), then default to "starter".
        sub_details = data.get("subscription_details") or {}
        plan_tier = (
            sub_details.get("metadata", {}).get("plan_tier")
            or data.get("metadata", {}).get("plan_tier")
            or "starter"
        )
        if customer_id:
            await apply_subscription_active(db, customer_id, subscription_id or "", plan_tier)

    elif event_type == "invoice.payment_failed":
        customer_id = data.get("customer")
        if customer_id:
            await apply_payment_failed(db, customer_id)

    elif event_type == "customer.subscription.deleted":
        customer_id = data.get("customer")
        if customer_id:
            await apply_subscription_cancelled(db, customer_id)

    else:
        logger.debug("Unhandled Stripe event type: %s", event_type)

    return WebhookAck()
