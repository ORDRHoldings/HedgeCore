"""
Tests: require_plan_tier dependency enforces plan tiers correctly.
Uses AsyncMock — no DB needed.
"""
import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException

from app.core.plan_enforcement import require_plan_tier, PLAN_HIERARCHY


def make_user(plan_tier: str):
    user = MagicMock()
    company = MagicMock()
    company.plan_tier = plan_tier
    user.company = company
    return user


def test_plan_hierarchy_order():
    assert PLAN_HIERARCHY["starter"] < PLAN_HIERARCHY["professional"]
    assert PLAN_HIERARCHY["professional"] < PLAN_HIERARCHY["enterprise"]


@pytest.mark.asyncio
async def test_starter_user_allowed_on_starter_route():
    dep = require_plan_tier("starter")
    user = make_user("starter")
    result = await dep(current_user=user)
    assert result == user


@pytest.mark.asyncio
async def test_starter_user_blocked_on_professional_route():
    dep = require_plan_tier("professional")
    user = make_user("starter")
    with pytest.raises(HTTPException) as exc_info:
        await dep(current_user=user)
    assert exc_info.value.status_code == 402


@pytest.mark.asyncio
async def test_professional_user_allowed_on_starter_route():
    dep = require_plan_tier("starter")
    user = make_user("professional")
    result = await dep(current_user=user)
    assert result == user


@pytest.mark.asyncio
async def test_professional_user_allowed_on_professional_route():
    dep = require_plan_tier("professional")
    user = make_user("professional")
    result = await dep(current_user=user)
    assert result == user


@pytest.mark.asyncio
async def test_professional_user_blocked_on_enterprise_route():
    dep = require_plan_tier("enterprise")
    user = make_user("professional")
    with pytest.raises(HTTPException) as exc_info:
        await dep(current_user=user)
    assert exc_info.value.status_code == 402


@pytest.mark.asyncio
async def test_enterprise_user_allowed_on_all_routes():
    for tier in ("starter", "professional", "enterprise"):
        dep = require_plan_tier(tier)
        user = make_user("enterprise")
        result = await dep(current_user=user)
        assert result == user


@pytest.mark.asyncio
async def test_user_without_company_raises_402():
    dep = require_plan_tier("starter")
    user = MagicMock()
    user.company = None
    with pytest.raises(HTTPException) as exc_info:
        await dep(current_user=user)
    assert exc_info.value.status_code == 402


@pytest.mark.asyncio
async def test_402_response_body_has_required_tier():
    dep = require_plan_tier("enterprise")
    user = make_user("starter")
    with pytest.raises(HTTPException) as exc_info:
        await dep(current_user=user)
    assert "enterprise" in exc_info.value.detail.lower()


def test_invalid_tier_raises_value_error():
    with pytest.raises(ValueError):
        require_plan_tier("gold")
