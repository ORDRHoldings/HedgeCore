"""
app/core/plan_enforcement.py

FastAPI dependency factory for plan-tier gating.

Usage:
    from app.core.plan_enforcement import require_plan_tier

    @router.get("/v1/advanced-feature", dependencies=[Depends(require_plan_tier("professional"))])
    async def advanced_feature(current_user: User = Depends(get_current_user)):
        ...

Rules:
- MUST be a Depends() at route level — NEVER added as middleware.
- Raises HTTP 402 Payment Required when company.plan_tier < min_tier.
- Raises HTTP 402 when user has no associated company.
- Returns the current_user so callers may use it with Depends() directly.
"""
from __future__ import annotations

import logging
from typing import Callable

from fastapi import Depends, HTTPException, status

from app.core.dependencies import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)

# Ordered plan hierarchy — higher value = more access
PLAN_HIERARCHY: dict[str, int] = {
    "starter": 0,
    "professional": 1,
    "enterprise": 2,
    "intelligence": 3,
}

_DEFAULT_TIER = "starter"


def require_plan_tier(min_tier: str) -> Callable:
    """
    Return a FastAPI dependency that enforces a minimum plan tier.

    Args:
        min_tier: Minimum required tier ("starter" | "professional" | "enterprise" | "intelligence").

    Returns:
        An async dependency function that returns the current user or raises HTTP 402.
    """
    if min_tier not in PLAN_HIERARCHY:
        raise ValueError(f"Unknown plan tier: {min_tier!r}. Must be one of {list(PLAN_HIERARCHY)}")

    min_level = PLAN_HIERARCHY[min_tier]

    async def _check(current_user: User = Depends(get_current_user)) -> User:
        company = getattr(current_user, "company", None)
        if company is None:
            logger.warning(
                "Plan gate: user %s has no company — blocking at tier %s",
                current_user.id, min_tier,
            )
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"A '{min_tier}' plan or higher is required. No active subscription found.",
            )

        user_tier = getattr(company, "plan_tier", _DEFAULT_TIER) or _DEFAULT_TIER
        user_level = PLAN_HIERARCHY.get(user_tier, 0)

        if user_level < min_level:
            logger.info(
                "Plan gate: user %s tier=%r blocked — required=%r",
                current_user.id, user_tier, min_tier,
            )
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    f"This feature requires the '{min_tier}' plan or higher. "
                    f"Your current plan is '{user_tier}'. "
                    "Please upgrade at /settings/billing."
                ),
            )

        return current_user

    return _check
