"""
Plan-tier gating dependency for FastAPI routes.

Usage:
    @router.get("/enterprise-only", dependencies=[require_plan("professional", "enterprise")])
    async def my_route(...): ...
"""

from fastapi import Depends, HTTPException, status

from app.core.dependencies import get_current_user
from app.models.user import User


def require_plan(*allowed_tiers: str):
    """Return a FastAPI Depends that 403s if the user's company plan_tier is not in *allowed_tiers*."""

    async def _check(current_user: User = Depends(get_current_user)) -> User:
        company = getattr(current_user, "company", None)
        if not company:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No company associated with this user",
            )
        tier = (company.settings or {}).get("plan_tier", "enterprise")
        if tier not in allowed_tiers:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This feature is not available on the {tier} plan",
            )
        return current_user

    return Depends(_check)
