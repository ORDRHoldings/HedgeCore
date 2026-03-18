"""
app/api/routes/v1_admin_users.py

Superuser-only cross-tenant user management.

Endpoints:
  GET   /v1/admin/users                        — list all users (cross-tenant)
  PATCH /v1/admin/users/{user_id}              — update user (role, company, status)
  POST  /v1/admin/users/{user_id}/revoke-sessions — revoke all refresh tokens

All endpoints: superuser only. Non-superusers receive 404.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_async_session
from app.core.dependencies import require_superuser
from app.core.security import hash_password
from app.crud import refresh_token as rt_crud
from app.models.rbac import Role, UserRole
from app.models.user import User
from app.models.user_mfa import UserMFA

router = APIRouter(prefix="/v1/admin/users", tags=["v1-admin-users"])
# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AdminUserItem(BaseModel):
    id: str
    email: str
    full_name: str | None
    job_title: str | None
    is_active: bool
    is_superuser: bool
    plan_tier: str | None
    company_id: str | None
    company_name: str | None
    roles: list[str]
    mfa_enabled: bool
    created_at: str | None
class AdminUserListResponse(BaseModel):
    items: list[AdminUserItem]
    total: int
    page: int
    size: int
    pages: int
class PatchUserRequest(BaseModel):
    is_active: bool | None = None
    is_superuser: bool | None = None
    full_name: str | None = None
    job_title: str | None = None
class CreateUserRequest(BaseModel):
    email: str
    password: str
    full_name: str | None = None
    is_superuser: bool = False
    company_id: str | None = None
# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_roles_for_users(session: AsyncSession, user_ids: list[UUID]) -> dict[UUID, list[str]]:
    if not user_ids:
        return {}
    rows = await session.execute(
        select(UserRole.user_id, Role.name)
        .join(Role, Role.id == UserRole.role_id)
        .where(UserRole.user_id.in_(user_ids))
    )
    result: dict[UUID, list[str]] = {}
    for uid, rname in rows.all():
        result.setdefault(uid, []).append(rname)
    return result
async def _get_mfa_status(session: AsyncSession, user_ids: list[UUID]) -> dict[UUID, bool]:
    if not user_ids:
        return {}
    rows = await session.execute(
        select(UserMFA.user_id, UserMFA.is_enabled).where(UserMFA.user_id.in_(user_ids))
    )
    return {r[0]: r[1] for r in rows.all()}
# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=AdminUserListResponse)
async def list_admin_users(
    page: int = Query(1, ge=1),
    size: int = Query(25, ge=1, le=100),
    company_id: str | None = Query(default=None),
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> AdminUserListResponse:
    """Cross-tenant paginated user list with company, role, and MFA info. Superuser only."""
    q = select(User).options(selectinload(User.company))

    if company_id:
        try:
            cid = UUID(company_id)
            q = q.where(User.company_id == cid)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid company_id UUID")

    total_q = select(func.count()).select_from(q.subquery())
    total = (await session.execute(total_q)).scalar_one()

    offset = (page - 1) * size
    users = (await session.execute(q.order_by(User.created_at.desc()).offset(offset).limit(size))).scalars().all()

    user_ids = [u.id for u in users]
    roles_map = await _get_roles_for_users(session, user_ids)
    mfa_map = await _get_mfa_status(session, user_ids)

    items = []
    for u in users:
        company = getattr(u, "company", None)
        items.append(AdminUserItem(
            id=str(u.id),
            email=u.email,
            full_name=u.full_name,
            job_title=getattr(u, "job_title", None),
            is_active=u.is_active,
            is_superuser=u.is_superuser,
            plan_tier=getattr(u, "plan_tier", None),
            company_id=str(u.company_id) if u.company_id else None,
            company_name=company.name if company else None,
            roles=roles_map.get(u.id, []),
            mfa_enabled=mfa_map.get(u.id, False),
            created_at=u.created_at.isoformat() if u.created_at else None,
        ))

    pages = max(1, (total + size - 1) // size)
    return AdminUserListResponse(items=items, total=total, page=page, size=size, pages=pages)
@router.post("", response_model=AdminUserItem, status_code=201)
async def create_admin_user(
    data: CreateUserRequest,
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> AdminUserItem:
    """Create a new user (admin only). Superuser only."""
    from sqlalchemy import select as sa_select
    existing = (await session.execute(
        sa_select(User).where(User.email == data.email.lower())
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    company_id_val = None
    if data.company_id:
        try:
            company_id_val = UUID(data.company_id)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid company_id UUID")

    new_user = User(
        email=data.email.lower(),
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        is_active=True,
        is_superuser=data.is_superuser,
        company_id=company_id_val,
    )
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)

    return AdminUserItem(
        id=str(new_user.id),
        email=new_user.email,
        full_name=new_user.full_name,
        job_title=None,
        is_active=new_user.is_active,
        is_superuser=new_user.is_superuser,
        plan_tier=None,
        company_id=str(new_user.company_id) if new_user.company_id else None,
        company_name=None,
        roles=[],
        mfa_enabled=False,
        created_at=new_user.created_at.isoformat() if new_user.created_at else None,
    )
@router.patch("/{user_id}", response_model=dict)
async def patch_admin_user(
    user_id: UUID,
    data: PatchUserRequest,
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> dict:
    """Update user profile/status. Superuser only."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.is_active is not None:
        user.is_active = data.is_active
    if data.is_superuser is not None:
        user.is_superuser = data.is_superuser
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.job_title is not None and hasattr(user, "job_title"):
        user.job_title = data.job_title  # type: ignore[assignment]

    await session.commit()
    return {"detail": "User updated", "user_id": str(user_id)}
@router.post("/{user_id}/revoke-sessions", response_model=dict)
async def revoke_user_sessions(
    user_id: UUID,
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> dict:
    """Revoke all active refresh tokens for a user. Superuser only."""
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await rt_crud.revoke_all_for_user(session, user_id=user_id)
    return {"detail": "All sessions revoked", "user_id": str(user_id)}
