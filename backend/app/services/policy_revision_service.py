"""
app/services/policy_revision_service.py
Policy Revision Service -- version pinning, diff, and lineage

INSTITUTIONAL CONTRACT:
  Every time a policy is activated (or re-activated after a config change),
  this service creates a PolicyRevision row capturing the exact canonical
  config that is now in force.

  The revision is then:
    - Pinned to the Position row at assign-policy time (position.policy_revision_id)
    - Pinned to the CalculationRun row at calculate time (run.policy_revision_id)

  This satisfies the audit question:
    "What exact policy config governed THIS calculation?"
  without relying on a mutable policy_instances.config field.

DIFF CONTRACT:
  get_diff(session, revision_a_id, revision_b_id) returns a structured diff:
    - fields_added   : keys present in B but not A
    - fields_removed : keys present in A but not B
    - fields_changed : keys in both with different values (showing old + new)
    - is_identical   : bool shortcut
    - summary        : human-readable one-liner for committee pack
"""
from __future__ import annotations

import uuid as _uuid
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.policy_revision import (
    PolicyRevision,
    build_policy_revision,
    compute_policy_hash,
)
from app.models.user import User


# ---------------------------------------------------------------------------
# Create revision
# ---------------------------------------------------------------------------

async def create_revision(
    session: AsyncSession,
    *,
    policy_instance_id: _uuid.UUID,
    template_id: _uuid.UUID,
    company_id: _uuid.UUID,
    branch_id: Optional[_uuid.UUID],
    canonical_policy: dict,
    created_by: _uuid.UUID,
    created_by_email: Optional[str],
    change_reason: Optional[str],
) -> PolicyRevision:
    """
    Create a new PolicyRevision for a policy instance activation.
    Automatically determines the next revision number and prev_revision_id.
    """
    # Find the latest revision for this policy instance
    q = (
        select(PolicyRevision)
        .where(PolicyRevision.policy_instance_id == policy_instance_id)
        .order_by(PolicyRevision.revision.desc())
        .limit(1)
    )
    result = await session.execute(q)
    prev = result.scalars().first()

    next_revision = (prev.revision + 1) if prev else 1
    prev_id = prev.id if prev else None

    rev = build_policy_revision(
        policy_instance_id = policy_instance_id,
        template_id        = template_id,
        company_id         = company_id,
        branch_id          = branch_id,
        canonical_policy   = canonical_policy,
        created_by         = created_by,
        created_by_email   = created_by_email,
        change_reason      = change_reason,
        prev_revision_id   = prev_id,
        revision           = next_revision,
    )
    session.add(rev)
    await session.commit()
    await session.refresh(rev)
    return rev


# ---------------------------------------------------------------------------
# Get revision
# ---------------------------------------------------------------------------

async def get_revision(
    session: AsyncSession,
    revision_id: _uuid.UUID,
    company_id: _uuid.UUID,
) -> Optional[PolicyRevision]:
    """Fetch a revision, scoped to the caller's company."""
    rev = await session.get(PolicyRevision, revision_id)
    if not rev or rev.company_id != company_id:
        return None
    return rev


async def get_latest_revision(
    session: AsyncSession,
    policy_instance_id: _uuid.UUID,
) -> Optional[PolicyRevision]:
    """Return the most recent revision for a policy instance."""
    q = (
        select(PolicyRevision)
        .where(PolicyRevision.policy_instance_id == policy_instance_id)
        .order_by(PolicyRevision.revision.desc())
        .limit(1)
    )
    result = await session.execute(q)
    return result.scalars().first()


async def list_revisions(
    session: AsyncSession,
    policy_instance_id: _uuid.UUID,
    company_id: _uuid.UUID,
) -> list[PolicyRevision]:
    """List all revisions for a policy instance, newest first."""
    q = (
        select(PolicyRevision)
        .where(
            PolicyRevision.policy_instance_id == policy_instance_id,
            PolicyRevision.company_id == company_id,
        )
        .order_by(PolicyRevision.revision.desc())
    )
    result = await session.execute(q)
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Diff engine
# ---------------------------------------------------------------------------

def _flatten(obj: dict, prefix: str = "") -> dict[str, object]:
    """
    Recursively flatten a nested dict to dot-notation keys.
    e.g. {"hedge_ratios": {"3M": 0.8}} -> {"hedge_ratios.3M": 0.8}
    """
    out: dict[str, object] = {}
    for k, v in obj.items():
        full_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(_flatten(v, full_key))
        else:
            out[full_key] = v
    return out


def compute_diff(
    policy_a: dict,
    policy_b: dict,
    label_a: str = "revision_a",
    label_b: str = "revision_b",
) -> dict:
    """
    Return a structured diff between two canonical policy configs.

    Returns:
      {
        "is_identical": bool,
        "fields_added":   [{"field": str, "value": any}],
        "fields_removed": [{"field": str, "value": any}],
        "fields_changed": [{"field": str, "old": any, "new": any}],
        "summary": str,   # one-liner for committee pack
        "hash_a": str,
        "hash_b": str,
      }
    """
    flat_a = _flatten(policy_a)
    flat_b = _flatten(policy_b)

    keys_a = set(flat_a.keys())
    keys_b = set(flat_b.keys())

    added   = [{"field": k, "value": flat_b[k]} for k in sorted(keys_b - keys_a)]
    removed = [{"field": k, "value": flat_a[k]} for k in sorted(keys_a - keys_b)]
    changed = [
        {"field": k, "old": flat_a[k], "new": flat_b[k]}
        for k in sorted(keys_a & keys_b)
        if flat_a[k] != flat_b[k]
    ]

    is_identical = not added and not removed and not changed

    if is_identical:
        summary = "No changes between revisions (identical config)."
    else:
        parts = []
        if changed:
            parts.append(f"{len(changed)} field(s) changed")
        if added:
            parts.append(f"{len(added)} field(s) added")
        if removed:
            parts.append(f"{len(removed)} field(s) removed")
        summary = f"Policy config diff: {', '.join(parts)}."

    return {
        "is_identical":   is_identical,
        "fields_added":   added,
        "fields_removed": removed,
        "fields_changed": changed,
        "summary":        summary,
        "hash_a":         compute_policy_hash(policy_a),
        "hash_b":         compute_policy_hash(policy_b),
        "label_a":        label_a,
        "label_b":        label_b,
    }


async def get_diff(
    session: AsyncSession,
    revision_a_id: _uuid.UUID,
    revision_b_id: _uuid.UUID,
    company_id: _uuid.UUID,
) -> Optional[dict]:
    """
    Compute and return a structured diff between two revision IDs.
    Returns None if either revision is not found or not accessible.
    """
    rev_a = await get_revision(session, revision_a_id, company_id)
    rev_b = await get_revision(session, revision_b_id, company_id)
    if not rev_a or not rev_b:
        return None

    return compute_diff(
        rev_a.canonical_policy,
        rev_b.canonical_policy,
        label_a=f"r{rev_a.revision} ({str(rev_a.id)[:8]})",
        label_b=f"r{rev_b.revision} ({str(rev_b.id)[:8]})",
    )
