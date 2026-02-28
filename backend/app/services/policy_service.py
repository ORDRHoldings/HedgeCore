"""

Policy service -- template listing and branch policy activation.



Invariant: at most one is_active=True PolicyInstance per (company_id, branch_id).

Activation deactivates the previous instance before creating a new one.



Sprint 1.0 -- Policy Version Pinning:

  Every activation now creates a PolicyRevision row (WORM snapshot of the

  canonical config). The revision is returned alongside the PolicyInstance

  so callers can pin it to Position rows at assign-policy time.

"""

from __future__ import annotations



import hashlib
import json
import logging

import uuid as _uuid

from datetime import datetime, timezone
from typing import Optional



from sqlalchemy import and_, desc, select

from sqlalchemy.exc import IntegrityError

from sqlalchemy.ext.asyncio import AsyncSession



from app.core.exceptions import ActivationConflictError
from app.models.policy import PolicyInstance, PolicyTemplate

from app.models.user import User

from app.models.audit_event import AuditEvent, build_audit_event, GENESIS_HASH

from app.services import policy_revision_service as pr_service



logger = logging.getLogger(__name__)


async def _get_prev_hash(session: AsyncSession, company_id) -> str:
    """Get the most recent audit event hash for the tenant's hash chain."""
    q = (
        select(AuditEvent.event_hash)
        .where(AuditEvent.company_id == company_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(1)
    )
    result = await session.execute(q)
    row = result.scalars().first()
    return row if row else GENESIS_HASH


async def list_templates(

    session: AsyncSession,

    user: User,

) -> list[PolicyTemplate]:

    """

    Return system templates (company_id IS NULL) plus company-specific templates

    for the user's company. Ordered: system templates first, then custom.

    """

    q = select(PolicyTemplate).where(

        (PolicyTemplate.company_id == None) |        # system templates

        (PolicyTemplate.company_id == user.company_id)  # company templates

    ).order_by(

        PolicyTemplate.is_system.desc(),  # system first

        PolicyTemplate.name,

    )

    result = await session.execute(q)

    return list(result.scalars().all())


async def get_template(

    session: AsyncSession,

    template_id: _uuid.UUID,

    user: User,

) -> Optional[PolicyTemplate]:

    """Fetch a template accessible to this user (system or company-specific)."""

    tmpl = await session.get(PolicyTemplate, template_id)

    if not tmpl:

        return None

    if tmpl.company_id is not None and tmpl.company_id != user.company_id:

        return None  # not accessible

    return tmpl


async def create_template(

    session: AsyncSession,

    user: User,

    name: str,

    short_name: str,

    description: Optional[str],

    risk_posture: str,

    category: str,

    config: dict,

    status: Optional[str] = None,  # SEC-POLICY-1: explicit status; defaults to model default

) -> PolicyTemplate:

    """Create a company-specific policy template."""

    kwargs: dict = dict(

        company_id=user.company_id,

        name=name,

        short_name=short_name,

        description=description,

        risk_posture=risk_posture,

        category=category,

        config=config,

        version=1,

        is_system=False,

        created_by=user.id,

    )

    if status is not None:

        kwargs["status"] = status

    tmpl = PolicyTemplate(**kwargs)

    session.add(tmpl)

    await session.commit()

    await session.refresh(tmpl)

    # Emit audit event
    try:
        prev_hash = await _get_prev_hash(session, user.company_id)
        event = build_audit_event(
            event_type="POLICY",
            description=f"Policy template created: {tmpl.name} ({tmpl.short_name})",
            payload={"action": "create", "template_id": str(tmpl.id),
                     "name": tmpl.name, "short_name": tmpl.short_name,
                     "risk_posture": tmpl.risk_posture, "category": tmpl.category,
                     "version": tmpl.version},
            prev_event_hash=prev_hash,
            company_id=user.company_id,
            branch_id=user.branch_id,
            actor_id=user.id,
            actor_email=user.email,
            entity_type="policy_template",
            entity_id=str(tmpl.id),
        )
        session.add(event)
        await session.commit()
    except Exception:
        logger.warning("Failed to emit audit event for policy template create", exc_info=True)

    return tmpl


async def get_active_instance(

    session: AsyncSession,

    user: User,

) -> Optional[PolicyInstance]:

    """Return the currently active PolicyInstance for this company+branch, or None."""

    q = select(PolicyInstance).where(

        PolicyInstance.company_id == user.company_id,

        PolicyInstance.branch_id == user.branch_id,

        PolicyInstance.is_active == True,

    ).order_by(PolicyInstance.activated_at.desc()).limit(1)

    result = await session.execute(q)

    return result.scalars().first()


async def activate_policy(

    session: AsyncSession,

    user: User,

    template_id: _uuid.UUID,

    change_reason: Optional[str] = None,

) -> PolicyInstance:

    """

    Activate a template for this user's company+branch.

    Deactivates any existing active instance first (preserves audit history).

    Raises ValueError if the template is inaccessible.



    Sprint 1.0: Also creates a PolicyRevision WORM snapshot of the canonical

    config at activation time. The revision is pinned on the returned instance

    as instance._latest_revision_id (non-persisted attribute, for callers to pin

    to Position rows at assign-policy time).

    """

    # Verify template is accessible

    tmpl = await get_template(session, template_id, user)

    if not tmpl:

        raise ValueError(f"Policy template {template_id} not found")



    # Deactivate current active instance (if any)

    current = await get_active_instance(session, user)

    if current:

        current.is_active = False

        await session.flush()



    # Create new active instance

    instance = PolicyInstance(

        company_id=user.company_id,

        branch_id=user.branch_id,

        template_id=template_id,

        activated_by=user.id,

        is_active=True,

    )

    session.add(instance)

    await session.flush()  # get instance.id before creating revision

    await session.refresh(instance)



    # Sprint 1.0: Create immutable PolicyRevision snapshot of the canonical config.

    # The canonical policy is the template config at activation time.

    canonical = dict(tmpl.config) if tmpl.config else {}

    try:

        revision = await pr_service.create_revision(

            session,

            policy_instance_id = instance.id,

            template_id        = template_id,

            company_id         = user.company_id,

            branch_id          = user.branch_id,

            canonical_policy   = canonical,

            created_by         = user.id,

            created_by_email   = user.email,

            change_reason      = change_reason,

        )

        # Attach to instance as a transient attribute so callers can read the

        # revision_id without a second DB query. This is NOT persisted on the

        # PolicyInstance row -- it's a Python-level convenience reference.

        instance.__dict__["_latest_revision"] = revision

    except Exception:

        logger.warning(

            "Failed to create policy revision snapshot for instance %s. "

            "Activation proceeds but version pinning may be incomplete.",

            instance.id, exc_info=True,

        )

    # Emit audit event for activation (same session, committed together)
    try:
        _revision = instance.__dict__.get("_latest_revision")
        _revision_id = str(_revision.id) if _revision and hasattr(_revision, "id") else None
        prev_hash = await _get_prev_hash(session, user.company_id)
        audit_event = build_audit_event(
            event_type="POLICY",
            description=f"Policy activated: {tmpl.name} ({tmpl.short_name})",
            payload={"action": "activate", "instance_id": str(instance.id),
                     "template_id": str(template_id), "template_name": tmpl.name,
                     "short_name": tmpl.short_name, "revision_id": _revision_id},
            prev_event_hash=prev_hash,
            company_id=user.company_id,
            branch_id=user.branch_id,
            actor_id=user.id,
            actor_email=user.email,
            entity_type="policy_instance",
            entity_id=str(instance.id),
        )
        session.add(audit_event)
    except Exception:
        logger.warning("Failed to build audit event for policy activation", exc_info=True)

    try:

        await session.commit()

    except IntegrityError as exc:

        # DB-POLICY-1: Unique partial index violation — a concurrent activate_policy()
        # call won the race. Roll back and surface as a typed, retryable conflict error.

        await session.rollback()

        raise ActivationConflictError(

            company_id=user.company_id,

            branch_id=user.branch_id,

        ) from exc

    await session.refresh(instance)

    return instance


async def update_template(
    session: AsyncSession,
    user: User,
    template_id: _uuid.UUID,
    updates: dict,
) -> PolicyTemplate:
    """
    Update a company-specific template (not system templates).
    Raises ValueError if template not found, not accessible, or is a system template.
    Increments version on every update.
    """
    tmpl = await get_template(session, template_id, user)
    if not tmpl:
        raise ValueError(f"Policy template {template_id} not found or not accessible")
    if tmpl.is_system:
        raise ValueError("System templates cannot be modified")
    if tmpl.company_id != user.company_id:
        raise ValueError("Cannot modify another company's template")

    for field, value in updates.items():
        if value is not None and hasattr(tmpl, field):
            setattr(tmpl, field, value)
    tmpl.version = (tmpl.version or 1) + 1
    tmpl.updated_by = user.id
    tmpl.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(tmpl)

    # Emit audit event
    try:
        prev_hash = await _get_prev_hash(session, user.company_id)
        event = build_audit_event(
            event_type="POLICY",
            description=f"Policy template updated: {tmpl.name} v{tmpl.version}",
            payload={"action": "update", "template_id": str(tmpl.id),
                     "fields_changed": list(updates.keys()), "new_version": tmpl.version},
            prev_event_hash=prev_hash,
            company_id=user.company_id,
            branch_id=user.branch_id,
            actor_id=user.id,
            actor_email=user.email,
            entity_type="policy_template",
            entity_id=str(tmpl.id),
        )
        session.add(event)
        await session.commit()
    except Exception:
        logger.warning("Failed to emit audit event for policy template update", exc_info=True)

    return tmpl


async def delete_template(
    session: AsyncSession,
    user: User,
    template_id: _uuid.UUID,
) -> None:
    """
    Delete a company-specific template (not system templates).
    Raises ValueError if template not found, is a system template, or is currently active.
    """
    tmpl = await get_template(session, template_id, user)
    if not tmpl:
        raise ValueError(f"Policy template {template_id} not found or not accessible")
    if tmpl.is_system:
        raise ValueError("System templates cannot be deleted")
    if tmpl.company_id != user.company_id:
        raise ValueError("Cannot delete another company's template")

    # Check not currently active
    active = await get_active_instance(session, user)
    if active and active.template_id == template_id:
        raise ValueError("Cannot delete an active policy template. Deactivate it first.")

    # Emit audit event before deletion
    try:
        prev_hash = await _get_prev_hash(session, user.company_id)
        event = build_audit_event(
            event_type="POLICY",
            description=f"Policy template deleted: {tmpl.name} ({tmpl.short_name})",
            payload={"action": "delete", "template_id": str(tmpl.id),
                     "name": tmpl.name, "short_name": tmpl.short_name},
            prev_event_hash=prev_hash,
            company_id=user.company_id,
            branch_id=user.branch_id,
            actor_id=user.id,
            actor_email=user.email,
            entity_type="policy_template",
            entity_id=str(tmpl.id),
        )
        session.add(event)
        await session.flush()
    except Exception:
        logger.warning("Failed to emit audit event for policy template delete", exc_info=True)

    await session.delete(tmpl)
    await session.commit()


async def deactivate_policy(
    session: AsyncSession,
    user: User,
) -> None:
    """
    Deactivate the current active policy for this user's company+branch.
    No-op if no policy is currently active.
    """
    current = await get_active_instance(session, user)
    if current:
        current.is_active = False

        # Emit audit event
        try:
            prev_hash = await _get_prev_hash(session, user.company_id)
            event = build_audit_event(
                event_type="POLICY",
                description=f"Policy deactivated for company {user.company_id} / branch {user.branch_id}",
                payload={"action": "deactivate", "instance_id": str(current.id),
                         "template_id": str(current.template_id)},
                prev_event_hash=prev_hash,
                company_id=user.company_id,
                branch_id=user.branch_id,
                actor_id=user.id,
                actor_email=user.email,
                entity_type="policy_instance",
                entity_id=str(current.id),
            )
            session.add(event)
        except Exception:
            logger.warning("Failed to emit audit event for policy deactivation", exc_info=True)

        await session.commit()
