"""
Policy service — template listing and branch policy activation.

Invariant: at most one is_active=True PolicyInstance per (company_id, branch_id).
Activation deactivates the previous instance before creating a new one.

Sprint 1.0 — Policy Version Pinning:
  Every activation now creates a PolicyRevision row (WORM snapshot of the
  canonical config). The revision is returned alongside the PolicyInstance
  so callers can pin it to Position rows at assign-policy time.
"""
from __future__ import annotations

import logging
import uuid as _uuid
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.policy import PolicyInstance, PolicyTemplate
from app.models.user import User
from app.services import policy_revision_service as pr_service

logger = logging.getLogger(__name__)


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
) -> PolicyTemplate:
    """Create a company-specific policy template."""
    tmpl = PolicyTemplate(
        company_id=user.company_id,
        name=name,
        short_name=short_name,
        description=description,
        risk_posture=risk_posture,
        category=category,
        config=config,
        version=1,
        is_system=False,
    )
    session.add(tmpl)
    await session.commit()
    await session.refresh(tmpl)
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
    return result.scalar_one_or_none()


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
        # PolicyInstance row — it's a Python-level convenience reference.
        instance.__dict__["_latest_revision"] = revision
    except Exception:
        logger.warning(
            "Failed to create policy revision snapshot for instance %s. "
            "Activation proceeds but version pinning may be incomplete.",
            instance.id, exc_info=True,
        )

    await session.commit()
    await session.refresh(instance)
    return instance
