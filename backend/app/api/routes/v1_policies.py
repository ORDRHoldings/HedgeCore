"""
Policy API routes -- /api/v1/policies

Endpoints:
  GET    /v1/policies/templates          -> list accessible templates (any auth)
  POST   /v1/policies/templates          -> create company template (policy.create_preset)
  PATCH  /v1/policies/templates/{id}     -> update company template (policy.create_preset)
  DELETE /v1/policies/templates/{id}     -> delete company template (policy.create_preset)
  GET    /v1/policies/active             -> get active instance for caller's branch (any auth)
  POST   /v1/policies/activate           -> activate a template (policy.activate)
  POST   /v1/policies/deactivate         -> deactivate current policy (policy.activate)

All endpoints require JWT.
"""
from __future__ import annotations

import uuid as _uuid

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
    UpdateTemplateRequest,
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
    - System templates (company_id=NULL, is_system=True) -- visible to everyone
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


@router.patch("/templates/{template_id}", response_model=PolicyTemplateResponse)
async def update_template(
    template_id:  _uuid.UUID,
    data:         UpdateTemplateRequest,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Update a company-specific policy template.
    System templates (is_system=True) cannot be modified.
    Requires policy.create_preset permission.
    Increments template version on every update.
    """
    await _check_permission(session, current_user, "policy.create_preset")
    updates = data.model_dump(exclude_none=True)
    if "config" in updates:
        updates["config"] = data.config.model_dump()
    try:
        tmpl = await policy_service.update_template(
            session, current_user, template_id, updates
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return tmpl


@router.delete("/templates/{template_id}", status_code=204)
async def delete_template(
    template_id:  _uuid.UUID,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Delete a company-specific policy template.
    System templates cannot be deleted.
    Requires policy.create_preset permission.
    Returns 404 if not found or not accessible.
    Returns 422 if template is currently active.
    """
    await _check_permission(session, current_user, "policy.create_preset")
    try:
        await policy_service.delete_template(session, current_user, template_id)
    except ValueError as e:
        detail = str(e)
        status = 422 if "active" in detail.lower() else 404
        raise HTTPException(status_code=status, detail=detail)


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


@router.post("/deactivate", status_code=204)
async def deactivate_policy(
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Deactivate the current active policy for the caller's company+branch.
    No-op (204) if no policy is active.
    Requires policy.activate permission.
    """
    await _check_permission(session, current_user, "policy.activate")
    await policy_service.deactivate_policy(session, current_user)
