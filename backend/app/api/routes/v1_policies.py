"""
Policy API routes -- /api/v1/policies

Endpoints:
  GET    /v1/policies/templates/seed-status  -> seed status for system templates (any auth)
  GET    /v1/policies/templates              -> list accessible templates (any auth)
  POST   /v1/policies/templates              -> create company template (policy.create_preset)
  POST   /v1/policies/templates/import       -> import template from export blob (policy.create_preset)
  PATCH  /v1/policies/templates/{id}         -> update company template (policy.create_preset)
  DELETE /v1/policies/templates/{id}         -> delete company template (policy.create_preset)
  GET    /v1/policies/templates/{id}/history -> audit history for template (any auth)
  GET    /v1/policies/templates/{id}/export  -> export template as JSON blob (any auth)
  GET    /v1/policies/active                 -> get active instance for caller's branch (any auth)
  POST   /v1/policies/activate               -> activate a template (policy.activate)
  POST   /v1/policies/deactivate             -> deactivate current policy (policy.activate)
  GET    /v1/policies/favorites              -> list user favorites (any auth)
  POST   /v1/policies/favorites/{id}         -> add template to favorites (any auth)
  DELETE /v1/policies/favorites/{id}         -> remove template from favorites (any auth)

All endpoints require JWT.
"""
from __future__ import annotations

import hashlib
import json
import uuid as _uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.dev_fault import raise_if_dev_fault
from app.core.exceptions import ActivationConflictError
from app.core.security import get_current_user
from app.models.audit_event import AuditEvent
from app.models.policy import PolicyTemplate
from app.models.user import User
from app.schemas_v1.policies import (
    ActivatePolicyRequest,
    AddFavoriteRequest,
    CreateTemplateRequest,
    ImportTemplateRequest,
    PolicyAuditEventResponse,
    PolicyFavoriteResponse,
    PolicyInstanceResponse,
    PolicySeedStatusResponse,
    PolicyTemplateResponse,
    UpdateTemplateRequest,
)
from app.services import policy_favorites_service, policy_service, rbac_service

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
# Routes -- STATIC paths FIRST to avoid parameterized-path shadowing
# ---------------------------------------------------------------------------

# 1. GET /templates/seed-status  (must be BEFORE /templates/{template_id})
@router.get("/templates/seed-status", response_model=PolicySeedStatusResponse)
async def get_seed_status(
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Returns seeding status for system policy templates.
    Useful for diagnosing activation issues in new deployments.
    """
    from app.api.routes.seed import _POLICY_PRESETS_SEED

    # Count existing system templates
    result = await session.execute(
        select(func.count()).where(
            PolicyTemplate.is_system == True,
            PolicyTemplate.company_id == None,
        )
    )
    count = result.scalar_one() or 0

    # Find which short_names are missing
    existing_result = await session.execute(
        select(PolicyTemplate.short_name).where(
            PolicyTemplate.is_system == True,
            PolicyTemplate.company_id == None,
        )
    )
    existing_short_names = {row[0] for row in existing_result.all()}
    expected_short_names = {t["short_name"] for t in _POLICY_PRESETS_SEED}
    missing = sorted(expected_short_names - existing_short_names)

    return PolicySeedStatusResponse(
        seeded=len(missing) == 0,
        count=count,
        expected_count=len(_POLICY_PRESETS_SEED),
        missing_short_names=missing,
    )


# 2. GET /templates
@router.get("/templates", response_model=list[PolicyTemplateResponse])
async def list_templates(
    request:      Request,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
    __dev_fault:  int | None   = Query(None, include_in_schema=False),
):
    """
    List all policy templates accessible to the caller:
    - System templates (company_id=NULL, is_system=True) -- visible to everyone
    - Company-specific templates for the caller's company
    Ordered: system templates first, then custom, alphabetically by name.
    """
    raise_if_dev_fault(request, __dev_fault)
    templates = await policy_service.list_templates(session, current_user)
    return templates


# 3. POST /templates
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
    # SEC-POLICY-1: elevating a template to ACTIVE/APPROVED requires the activate permission
    if data.status in ("ACTIVE", "APPROVED"):
        await _check_permission(session, current_user, "policy.activate")
    tmpl = await policy_service.create_template(
        session,
        current_user,
        name=data.name,
        short_name=data.short_name,
        description=data.description,
        risk_posture=data.risk_posture,
        category=data.category,
        config=data.config.model_dump(),
        status=data.status,
    )
    return tmpl


# 4. POST /templates/import  (must be BEFORE PATCH /templates/{template_id})
@router.post("/templates/import", response_model=PolicyTemplateResponse, status_code=201)
async def import_template(
    data:         ImportTemplateRequest,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Import a policy template from an export blob.
    Creates a new company-specific template (not system).
    Requires policy.create_preset permission.
    """
    await _check_permission(session, current_user, "policy.create_preset")

    blob = data.export_blob

    # Validate export version
    if blob.get("export_version") != "1.0":
        raise HTTPException(status_code=422, detail="Unsupported export version. Expected '1.0'.")

    # Validate checksum
    template_dict = blob.get("template")
    if not template_dict:
        raise HTTPException(status_code=422, detail="Missing 'template' in export blob.")

    stored_checksum = blob.get("checksum", "")
    computed_checksum = hashlib.sha256(
        json.dumps(template_dict, sort_keys=True, default=str).encode()
    ).hexdigest()

    if stored_checksum != computed_checksum:
        raise HTTPException(status_code=422, detail="Export checksum mismatch. The file may have been tampered with.")

    # Validate config
    config = template_dict.get("config", {})
    if not config.get("hedge_ratios") or not config.get("cost_assumptions"):
        raise HTTPException(status_code=422, detail="Invalid policy config in export blob.")

    # Create company-specific template from import
    name = data.name_override or template_dict.get("name", "Imported Policy")
    short_name = data.short_name_override or template_dict.get("short_name", "IMPT")

    tmpl = await policy_service.create_template(
        session,
        current_user,
        name=name,
        short_name=short_name[:16],
        description=template_dict.get("description"),
        risk_posture=template_dict.get("risk_posture", "MODERATE"),
        category=template_dict.get("category", "CORPORATE"),
        config=config,
    )
    return tmpl


# 5. PATCH /templates/{template_id}
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


# 6. DELETE /templates/{template_id}
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


# 7. GET /templates/{template_id}/history
@router.get("/templates/{template_id}/history", response_model=list[PolicyAuditEventResponse])
async def get_template_history(
    template_id:  _uuid.UUID,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Return audit history for a policy template.
    Shows all create/update/delete/activate operations.
    """
    result = await session.execute(
        select(AuditEvent)
        .where(
            AuditEvent.entity_type == "policy_template",
            AuditEvent.entity_id == str(template_id),
            AuditEvent.company_id == current_user.company_id,
        )
        .order_by(AuditEvent.created_at.desc())
        .limit(50)
    )
    events = list(result.scalars().all())
    return [
        PolicyAuditEventResponse(
            id=e.id,
            event_type=e.event_type,
            description=e.description,
            payload=e.payload or {},
            actor_email=e.actor_email,
            created_at=e.created_at,
        )
        for e in events
    ]


# 8. GET /templates/{template_id}/export
@router.get("/templates/{template_id}/export")
async def export_template(
    template_id:  _uuid.UUID,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """
    Export a policy template as a JSON blob with checksum for import/sharing.
    """
    tmpl = await policy_service.get_template(session, template_id, current_user)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Policy template not found")

    tmpl_response = PolicyTemplateResponse.model_validate(tmpl)
    template_dict = tmpl_response.model_dump(mode="json")

    # Compute checksum over template dict (sorted keys, deterministic)
    checksum = hashlib.sha256(
        json.dumps(template_dict, sort_keys=True, default=str).encode()
    ).hexdigest()

    export_blob = {
        "export_version": "1.0",
        "exported_at": datetime.now(UTC).isoformat(),
        "checksum": checksum,
        "template": template_dict,
    }

    short_name = tmpl.short_name.upper().replace(" ", "_")
    version = tmpl.version
    filename = f"policy-{short_name}-v{version}.json"

    content = json.dumps(export_blob, indent=2, default=str)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# 9. GET /active
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


# 10. POST /activate
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
    except ActivationConflictError as e:
        # DB-POLICY-1: typed exception â†’ structured 409 with stable code field
        raise HTTPException(
            status_code=409,
            detail={
                "code": e.code,
                "detail": str(e),
                "scope": {
                    "company_id": str(e.company_id),
                    "branch_id": str(e.branch_id) if e.branch_id else None,
                },
            },
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


# 11. POST /deactivate
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


# ---------------------------------------------------------------------------
# Favorites routes
# ---------------------------------------------------------------------------

# 12. GET /favorites
@router.get("/favorites", response_model=list[PolicyFavoriteResponse])
async def list_favorites(
    request:      Request,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
    __dev_fault:  int | None   = Query(None, include_in_schema=False),
):
    """List all policy templates favorited by the current user."""
    raise_if_dev_fault(request, __dev_fault)
    rows = await policy_favorites_service.list_favorites(session, current_user)
    result = []
    for fav, tmpl in rows:
        resp = PolicyFavoriteResponse(
            id=fav.id,
            user_id=fav.user_id,
            template_id=fav.template_id,
            notes=fav.notes,
            created_at=fav.created_at,
            template=PolicyTemplateResponse.model_validate(tmpl) if tmpl else None,
        )
        result.append(resp)
    return result


# 13. POST /favorites/{template_id}
@router.post("/favorites/{template_id}", response_model=PolicyFavoriteResponse, status_code=201)
async def add_favorite(
    template_id:  _uuid.UUID,
    data:         AddFavoriteRequest = AddFavoriteRequest(),
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """Add a policy template to the current user's favorites."""
    try:
        fav = await policy_favorites_service.add_favorite(
            session, current_user, template_id, data.notes
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    # Load template for response
    tmpl = await policy_service.get_template(session, template_id, current_user)
    return PolicyFavoriteResponse(
        id=fav.id,
        user_id=fav.user_id,
        template_id=fav.template_id,
        notes=fav.notes,
        created_at=fav.created_at,
        template=PolicyTemplateResponse.model_validate(tmpl) if tmpl else None,
    )


# 14. DELETE /favorites/{template_id}
@router.delete("/favorites/{template_id}", status_code=204)
async def remove_favorite(
    template_id:  _uuid.UUID,
    session:      AsyncSession = Depends(get_async_session),
    current_user: User         = Depends(get_current_user),
):
    """Remove a policy template from the current user's favorites."""
    await policy_favorites_service.remove_favorite(session, current_user, template_id)
