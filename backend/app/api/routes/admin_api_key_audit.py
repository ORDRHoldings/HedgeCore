"""
app/api/routes/admin_api_key_audit.py

HedgeCalc - Phase XII
Admin-only, read-only API for API Key Audit Logs.

Design principles:
- Read-only (WORM intent)
- Admin JWT protected
- Paginated & filterable
- No deletes, no updates
- Deterministic ordering
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.deps.jwt_auth import get_current_admin_user
from app.models.api_key_audit import ApiKeyAuditLog
from app.schemas.api_key_audit import (
    ApiKeyAuditLogListResponse,
    ApiKeyAuditLogPublic,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/admin/api-key-audit",
    tags=["Admin: API Key Audit"],
    responses={
        401: {"description": "Unauthorized"},
        403: {"description": "Forbidden"},
    },
)

MAX_LIMIT = 100
DEFAULT_LIMIT = 50
# -------------------------------------------------------------------------
# ? List API Key Audit Logs (Admin, Read-Only)
# -------------------------------------------------------------------------
@router.get(
    "",
    response_model=ApiKeyAuditLogListResponse,
    summary="List API key audit logs (admin only, read-only)",
)
async def list_api_key_audit_logs(
    session: AsyncSession = Depends(get_async_session),
    admin_user=Depends(get_current_admin_user),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    api_key_id: str | None = None,
    user_id: str | None = None,
    path: str | None = None,
    status_code: int | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
):
    """
    Return API key audit logs with pagination and filters.

    This endpoint is:
    - Admin-only
    - Read-only
    - Append-only backing store (WORM intent)
    """

    conditions = []

    if api_key_id:
        conditions.append(ApiKeyAuditLog.api_key_id == api_key_id)

    if user_id:
        conditions.append(ApiKeyAuditLog.user_id == user_id)

    if path:
        conditions.append(ApiKeyAuditLog.path.ilike(f"%{path}%"))

    if status_code:
        conditions.append(ApiKeyAuditLog.status_code == status_code)

    if created_from:
        conditions.append(ApiKeyAuditLog.created_at >= created_from)

    if created_to:
        conditions.append(ApiKeyAuditLog.created_at <= created_to)

    base_query = select(ApiKeyAuditLog)

    if conditions:
        base_query = base_query.where(and_(*conditions))

    # Total count (before pagination)
    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await session.execute(count_query)).scalar_one()

    # Page query
    result = await session.execute(
        base_query
        .order_by(ApiKeyAuditLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    rows = result.scalars().all()

    items = [
        ApiKeyAuditLogPublic.model_validate(row)
        for row in rows
    ]

    return ApiKeyAuditLogListResponse(
        total=total,
        items=items,
    )
