# backend/app/services/legal_entity_service.py
"""
app/services/legal_entity_service.py

CRUD + hierarchy queries for LegalEntity.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import CashAuditEventType, LegalEntity, LegalEntityStatus
from app.services.cash_audit_service import append_event


class EntityNotFoundError(Exception):
    pass


async def create_entity(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    payload: dict[str, Any],
    created_by: uuid.UUID,
) -> LegalEntity:
    entity = LegalEntity(
        company_id=company_id,
        created_by=created_by,
        status=LegalEntityStatus.ACTIVE.value,
        **{k: v for k, v in payload.items() if hasattr(LegalEntity, k)},
    )
    session.add(entity)
    await session.flush()  # get entity.id
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.ENTITY_CREATED,
        payload={"legal_name": entity.legal_name, "country": entity.country},
        performed_by=created_by,
        entity_id=entity.id,
    )
    return entity


async def update_entity(
    session: AsyncSession,
    *,
    entity_id: uuid.UUID,
    company_id: uuid.UUID,
    payload: dict[str, Any],
    actor_id: uuid.UUID,
) -> LegalEntity:
    result = await session.execute(
        select(LegalEntity).where(
            LegalEntity.id == entity_id,
            LegalEntity.company_id == company_id,
        )
    )
    entity = result.scalar_one_or_none()
    if entity is None:
        raise EntityNotFoundError(f"LegalEntity {entity_id} not found")
    for k, v in payload.items():
        if hasattr(entity, k) and k not in ("id", "company_id", "created_by", "created_at", "version"):
            setattr(entity, k, v)
    entity.updated_at = datetime.now(UTC)
    entity.version += 1
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.ENTITY_UPDATED,
        payload=payload,
        performed_by=actor_id,
        entity_id=entity_id,
    )
    return entity


async def close_entity(
    session: AsyncSession,
    *,
    entity_id: uuid.UUID,
    company_id: uuid.UUID,
    status: str,
    actor_id: uuid.UUID,
) -> LegalEntity:
    result = await session.execute(
        select(LegalEntity).where(
            LegalEntity.id == entity_id,
            LegalEntity.company_id == company_id,
        )
    )
    entity = result.scalar_one_or_none()
    if entity is None:
        raise EntityNotFoundError(f"LegalEntity {entity_id} not found")
    entity.status = status
    entity.updated_at = datetime.now(UTC)
    entity.version += 1
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.ENTITY_CLOSED,
        payload={"status": status},
        performed_by=actor_id,
        entity_id=entity_id,
    )
    return entity


async def list_entities(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    status: str | None = None,
) -> list[LegalEntity]:
    q = select(LegalEntity).where(LegalEntity.company_id == company_id)
    if status:
        q = q.where(LegalEntity.status == status)
    result = await session.execute(q.order_by(LegalEntity.legal_name))
    return list(result.scalars().all())


async def get_entity(
    session: AsyncSession,
    *,
    entity_id: uuid.UUID,
    company_id: uuid.UUID,
) -> LegalEntity:
    result = await session.execute(
        select(LegalEntity).where(
            LegalEntity.id == entity_id,
            LegalEntity.company_id == company_id,
        )
    )
    entity = result.scalar_one_or_none()
    if entity is None:
        raise EntityNotFoundError(f"LegalEntity {entity_id} not found")
    return entity


async def get_entity_tree(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
) -> list[LegalEntity]:
    """Return all LegalEntity rows for this company (flat list; callers build tree from parent_entity_id).

    Uses a simple SELECT rather than recursive CTE — the recursive hierarchy traversal
    is done client-side from this flat list. Recursive CTE is a PostgreSQL-only optimisation
    that would require the `requires_postgres` marker; the flat list is SQLite-compatible
    and sufficient for all current use cases.
    """
    result = await session.execute(
        select(LegalEntity)
        .where(LegalEntity.company_id == company_id)
        .order_by(LegalEntity.legal_name)
    )
    return list(result.scalars().all())
