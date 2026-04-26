"""v1 cash pools — treasury entities, pool CRUD, balance, sweeps."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.user import User
from app.schemas_v1.cash import (
    CashPoolCreate,
    CashPoolMemberCreate,
    CashPoolMemberResponse,
    CashPoolResponse,
    PoolBalanceResponse,
    SweepResponse,
    TreasuryEntityCreate,
    TreasuryEntityResponse,
)
from app.services.cash_pool_service import (
    add_member,
    calculate_sweeps,
    create_pool,
    create_treasury_entity,
    execute_sweeps,
    get_pool_balance,
    get_pool_detail,
    list_pools,
    list_sweeps,
    list_treasury_entities,
    remove_member,
)

router = APIRouter(prefix="/v1/cash/pools", tags=["cash-pools"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


# ── Module-level helpers for testability ──

async def create_entity_helper(db, *, company_id, data, created_by):
    return await create_treasury_entity(db, company_id=company_id, data=data, created_by=created_by)


async def list_entities_helper(db, *, company_id):
    return await list_treasury_entities(db, company_id=company_id)


async def create_pool_helper(db, *, company_id, data, created_by):
    return await create_pool(db, company_id=company_id, data=data, created_by=created_by)


async def list_pools_helper(db, *, company_id):
    return await list_pools(db, company_id=company_id)


async def get_pool_detail_helper(db, *, pool_id, company_id):
    return await get_pool_detail(db, pool_id=pool_id, company_id=company_id)


async def add_member_helper(db, *, pool_id, company_id, data):
    return await add_member(db, pool_id=pool_id, company_id=company_id, data=data)


async def remove_member_helper(db, *, pool_id, member_id, company_id):
    return await remove_member(db, pool_id=pool_id, member_id=member_id, company_id=company_id)


async def get_pool_balance_helper(db, *, pool_id, company_id):
    return await get_pool_balance(db, pool_id=pool_id, company_id=company_id)


async def calculate_sweeps_helper(db, *, pool_id, company_id):
    return await calculate_sweeps(db, pool_id=pool_id, company_id=company_id)


async def execute_sweeps_helper(db, *, pool_id, company_id, performed_by):
    return await execute_sweeps(db, pool_id=pool_id, company_id=company_id, performed_by=performed_by)


async def list_sweeps_helper(db, *, pool_id, company_id):
    return await list_sweeps(db, pool_id=pool_id, company_id=company_id)


# ── Routes ──

@router.post("/entities", response_model=TreasuryEntityResponse)
async def create_entity_route(
    body: TreasuryEntityCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    entity = await create_entity_helper(
        db, company_id=current_user.company_id, data=body, created_by=current_user.id,
    )
    await db.commit()
    return entity


@router.get("/entities", response_model=list[TreasuryEntityResponse])
async def list_entities_route(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_entities_helper(db, company_id=current_user.company_id)


@router.post("/", response_model=CashPoolResponse)
async def create_pool_route(
    body: CashPoolCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    pool = await create_pool_helper(
        db, company_id=current_user.company_id, data=body, created_by=current_user.id,
    )
    await db.commit()
    return pool


@router.get("/", response_model=list[CashPoolResponse])
async def list_pools_route(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_pools_helper(db, company_id=current_user.company_id)


@router.get("/{pool_id}")
async def get_pool_detail_route(
    pool_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await get_pool_detail_helper(db, pool_id=pool_id, company_id=current_user.company_id)


@router.post("/{pool_id}/members", response_model=CashPoolMemberResponse)
async def add_member_route(
    pool_id: uuid.UUID,
    body: CashPoolMemberCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    member = await add_member_helper(db, pool_id=pool_id, company_id=current_user.company_id, data=body)
    await db.commit()
    return member


@router.delete("/{pool_id}/members/{member_id}")
async def remove_member_route(
    pool_id: uuid.UUID,
    member_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    await remove_member_helper(db, pool_id=pool_id, member_id=member_id, company_id=current_user.company_id)
    await db.commit()
    return {"status": "removed"}


@router.get("/{pool_id}/balance", response_model=PoolBalanceResponse)
async def get_pool_balance_route(
    pool_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await get_pool_balance_helper(db, pool_id=pool_id, company_id=current_user.company_id)


@router.post("/{pool_id}/sweeps/calculate")
async def calculate_sweeps_route(
    pool_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    return await calculate_sweeps_helper(db, pool_id=pool_id, company_id=current_user.company_id)


@router.post("/{pool_id}/sweeps/execute")
async def execute_sweeps_route(
    pool_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    result = await execute_sweeps_helper(
        db, pool_id=pool_id, company_id=current_user.company_id,
        performed_by=current_user.id,
    )
    await db.commit()
    return result


@router.get("/{pool_id}/sweeps", response_model=list[SweepResponse])
async def list_sweeps_route(
    pool_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_sweeps_helper(db, pool_id=pool_id, company_id=current_user.company_id)
