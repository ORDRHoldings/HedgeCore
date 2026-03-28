"""Tests for billing_service.py"""
import logging
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.billing_service import (
    apply_subscription_active,
    apply_subscription_cancelled,
    apply_payment_failed,
    STRIPE_PLAN_MAP,
)


class TestStripePlanMap:
    def test_plan_map_has_all_tiers(self):
        assert "starter" in STRIPE_PLAN_MAP
        assert "professional" in STRIPE_PLAN_MAP
        assert "enterprise" in STRIPE_PLAN_MAP


class TestApplySubscriptionActive:
    @pytest.mark.asyncio
    async def test_sets_plan_tier_and_subscription_id(self):
        company = MagicMock()
        company.id = "c1"
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=company)))
        await apply_subscription_active(db, "cus_123", "sub_456", "professional")
        assert company.plan_tier == "professional"
        assert company.stripe_subscription_id == "sub_456"
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_no_company_logs_warning(self, caplog):
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
        with caplog.at_level(logging.WARNING):
            await apply_subscription_active(db, "cus_notfound", "sub_x", "starter")
        assert "no company" in caplog.text


class TestApplySubscriptionCancelled:
    @pytest.mark.asyncio
    async def test_downgrades_to_starter(self):
        company = MagicMock()
        company.id = "c2"
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=company)))
        await apply_subscription_cancelled(db, "cus_123")
        assert company.plan_tier == "starter"
        assert company.stripe_subscription_id is None
        db.commit.assert_awaited_once()


class TestApplyPaymentFailed:
    @pytest.mark.asyncio
    async def test_logs_warning_no_downgrade(self, caplog):
        company = MagicMock()
        company.id = "c3"
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=company)))
        with caplog.at_level(logging.WARNING):
            await apply_payment_failed(db, "cus_123")
        # plan_tier must NOT be changed — commit must NOT be called
        db.commit.assert_not_awaited()
