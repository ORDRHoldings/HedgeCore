"""
Policy API routes — /api/v1/policies

Endpoints:
  GET  /v1/policies/templates     → list accessible templates (any auth)
  POST /v1/policies/templates     → create company template (policy.create_preset)
  GET  /v1/policies/active        → get active instance for caller's branch (any auth)
  POST /v1/policies/activate      → activate a template (policy.activate)

All endpoints require JWT.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.user import User
from app.schemas_v1.policies import (
    ActivatePolicyRequest,
    CreateTemplateRequest,
    PolicyInstanceResponse,
    PolicyTemplateResponse,
)
from app.services import policy_service, rbac_service

router = APIRouter(prefix="/v1/policies", tags=["v1-policies"])


# ---------------------------------------------------------------------------
# Auth/RBAC helpers
# ---------------------------------------------------------------------------

async def _check_permission(
    session: AsyncSession, user: User, codename: str
) -> None:
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if codename not in perms:
        raise HTTPException(
            status_code=403, detail=f"Missing permission: {codename}"
        )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/templates", response_model=list[PolicyTemplateResponse])
async def list_templates(
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    List all policy templates accessible to the caller:
    - System templates (company_id=NULL, is_system=True) — visible to everyone
    - Company-specific templates for the caller's company
    Ordered: system templates first, then custom, alphabetically by name.
    """
    templates = await policy_service.list_templates(session, current_user)
    return templates


@router.post("/templates", response_model=PolicyTemplateResponse, status_code=201)
async def create_template(
    data:         CreateTemplateRequest,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Create a company-specific policy template.
    Requires policy.create_preset permission.
    """
    await _check_permission(session, current_user, "policy.create_preset")
    tmpl = await policy_service.create_template(
        session,
        current_user,
        name=data.name,
        short_name=data.short_name,
        description=data.description,
        risk_posture=data.risk_posture,
        category=data.category,
        config=data.config.model_dump(),
    )
    return tmpl


@router.get("/active", response_model=PolicyInstanceResponse | None)
async def get_active_policy(
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Return the currently active PolicyInstance for the caller's company+branch.
    Returns null (HTTP 200 with null body) when no policy is active.
    Includes the full template object for frontend use.
    """
    instance = await policy_service.get_active_instance(session, current_user)
    if not instance:
        return None

    # Enrich with template data
    tmpl = await policy_service.get_template(
        session, instance.template_id, current_user
    )
    response = PolicyInstanceResponse.model_validate(instance)
    if tmpl:
        response.template = PolicyTemplateResponse.model_validate(tmpl)
    return response


@router.post("/activate", response_model=PolicyInstanceResponse, status_code=201)
async def activate_policy(
    data:         ActivatePolicyRequest,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Activate a policy template for the caller's company+branch.
    Deactivates the current active policy first (if any).
    Requires policy.activate permission.
    """
    await _check_permission(session, current_user, "policy.activate")
    try:
        instance = await policy_service.activate_policy(
            session, current_user, data.template_id
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Enrich response with template
    tmpl = await policy_service.get_template(
        session, instance.template_id, current_user
    )
    response = PolicyInstanceResponse.model_validate(instance)
    if tmpl:
        response.template = PolicyTemplateResponse.model_validate(tmpl)
    return response
