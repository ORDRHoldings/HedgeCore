"""Tests for v1_billing.py webhook endpoint"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.config import Settings


def _make_settings(**kwargs):
    base = dict(
        JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long",
        DATABASE_URL="sqlite+aiosqlite://",
        STRIPE_WEBHOOK_SECRET="whsec_test",
        STRIPE_SECRET_KEY_TEST="sk_test_xxx",
        STRIPE_SECRET_KEY_LIVE="",
        STRIPE_LIVE_MODE=False,
    )
    base.update(kwargs)
    return Settings(**base)


@pytest.mark.asyncio
async def test_webhook_invoice_paid_returns_200():
    event = {
        "type": "invoice.paid",
        "data": {"object": {"customer": "cus_123", "subscription": "sub_456", "metadata": {"plan_tier": "professional"}}},
    }

    async def _noop(*a, **kw):
        return None

    with patch("app.api.routes.v1_billing.get_settings", return_value=_make_settings()), \
         patch("stripe.Webhook.construct_event", return_value=event), \
         patch("app.api.routes.v1_billing.apply_subscription_active", side_effect=_noop):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/billing/webhook",
                content=b'{}',
                headers={"Stripe-Signature": "t=1,v1=abc"},
            )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_webhook_bad_signature_returns_400():
    import stripe
    with patch("app.api.routes.v1_billing.get_settings", return_value=_make_settings()), \
         patch("stripe.Webhook.construct_event", side_effect=stripe.SignatureVerificationError("bad", "sig")):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/billing/webhook",
                content=b'{}',
                headers={"Stripe-Signature": "t=1,v1=bad"},
            )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_webhook_no_secret_returns_503():
    with patch("app.api.routes.v1_billing.get_settings", return_value=_make_settings(STRIPE_WEBHOOK_SECRET="")):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/billing/webhook",
                content=b'{}',
                headers={"Stripe-Signature": "t=1,v1=abc"},
            )
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_webhook_unhandled_event_returns_200():
    event = {
        "type": "customer.created",
        "data": {"object": {"customer": "cus_999"}},
    }
    with patch("app.api.routes.v1_billing.get_settings", return_value=_make_settings()), \
         patch("stripe.Webhook.construct_event", return_value=event):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/billing/webhook",
                content=b'{}',
                headers={"Stripe-Signature": "t=1,v1=abc"},
            )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_webhook_payment_failed_calls_apply():
    event = {
        "type": "invoice.payment_failed",
        "data": {"object": {"customer": "cus_789"}},
    }
    with patch("app.api.routes.v1_billing.get_settings", return_value=_make_settings()), \
         patch("stripe.Webhook.construct_event", return_value=event), \
         patch("app.api.routes.v1_billing.apply_payment_failed") as mock_failed:
        async def _noop(*a, **kw): return None
        mock_failed.side_effect = _noop
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/billing/webhook",
                content=b'{}',
                headers={"Stripe-Signature": "t=1,v1=abc"},
            )
    assert resp.status_code == 200
    mock_failed.assert_called_once()


@pytest.mark.asyncio
async def test_webhook_subscription_deleted_calls_apply():
    event = {
        "type": "customer.subscription.deleted",
        "data": {"object": {"customer": "cus_789"}},
    }
    with patch("app.api.routes.v1_billing.get_settings", return_value=_make_settings()), \
         patch("stripe.Webhook.construct_event", return_value=event), \
         patch("app.api.routes.v1_billing.apply_subscription_cancelled") as mock_cancel:
        async def _noop(*a, **kw): return None
        mock_cancel.side_effect = _noop
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/billing/webhook",
                content=b'{}',
                headers={"Stripe-Signature": "t=1,v1=abc"},
            )
    assert resp.status_code == 200
    mock_cancel.assert_called_once()
