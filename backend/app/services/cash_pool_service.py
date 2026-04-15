"""
Cash pool service — CRUD for treasury entities, pools, members.
Pool-type-specific balance aggregation and sweep calculation/execution.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import BankAccount, CashBalance, CashAuditEventType
from app.models.cash_pool import TreasuryEntity, CashPool, CashPoolMember, CashPoolSweep
from app.services.cash_audit_service import append_event


# ── Treasury Entity CRUD ──────────────────────────────────────────

async def create_treasury_entity(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    data: Any,
    created_by: uuid.UUID,
) -> TreasuryEntity:
    """Create a treasury entity. Validates parent belongs to same company."""
    if data.parent_entity_id:
        parent = await session.execute(
            select(TreasuryEntity).where(
                TreasuryEntity.id == data.parent_entity_id,
                TreasuryEntity.company_id == company_id,
            )
        )
        if parent.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Parent entity not found")

    entity = TreasuryEntity(
        company_id=company_id,
        name=data.name,
        entity_type=data.entity_type,
        base_currency=data.base_currency,
        country_code=data.country_code,
        erp_ref=data.erp_ref,
        parent_entity_id=data.parent_entity_id,
    )
    session.add(entity)
    await session.flush()
    return entity


async def list_treasury_entities(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
) -> list[TreasuryEntity]:
    result = await session.execute(
        select(TreasuryEntity).where(TreasuryEntity.company_id == company_id)
    )
    return list(result.scalars().all())


# ── Cash Pool CRUD ────────────────────────────────────────────────

async def create_pool(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    data: Any,
    created_by: uuid.UUID,
) -> CashPool:
    """Create a cash pool. Validates header account exists."""
    acct_result = await session.execute(
        select(BankAccount).where(
            BankAccount.id == data.header_account_id,
        )
    )
    if acct_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Header account not found")

    pool = CashPool(
        company_id=company_id,
        name=data.name,
        pool_type=data.pool_type,
        header_account_id=data.header_account_id,
        currency=data.currency,
        base_currency=data.base_currency,
        created_by=created_by,
    )
    session.add(pool)
    await session.flush()
    return pool


async def list_pools(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
) -> list[dict]:
    result = await session.execute(
        select(CashPool).where(CashPool.company_id == company_id)
    )
    pools = list(result.scalars().all())
    out = []
    for p in pools:
        count_result = await session.execute(
            select(func.count()).select_from(CashPoolMember).where(
                CashPoolMember.pool_id == p.id,
            )
        )
        count = count_result.scalar() or 0
        out.append({**_pool_to_dict(p), "member_count": count})
    return out


async def get_pool_detail(
    session: AsyncSession,
    *,
    pool_id: uuid.UUID,
    company_id: uuid.UUID,
) -> dict:
    pool = await _get_pool(session, pool_id, company_id)
    members_result = await session.execute(
        select(CashPoolMember).where(CashPoolMember.pool_id == pool_id)
    )
    members = list(members_result.scalars().all())
    return {
        **_pool_to_dict(pool),
        "member_count": len(members),
        "members": [_member_to_dict(m) for m in members],
    }


# ── Pool Membership ──────────────────────────────────────────────

async def add_member(
    session: AsyncSession,
    *,
    pool_id: uuid.UUID,
    company_id: uuid.UUID,
    data: Any,
) -> CashPoolMember:
    pool = await _get_pool(session, pool_id, company_id)

    # Validate account exists
    acct_result = await session.execute(
        select(BankAccount).where(BankAccount.id == data.account_id)
    )
    if acct_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Account not found")

    # Force target_balance=0 for ZBA pools
    target = Decimal("0") if pool.pool_type == "ZBA" else data.target_balance

    member = CashPoolMember(
        pool_id=pool_id,
        account_id=data.account_id,
        entity_id=data.entity_id,
        participation_type=data.participation_type,
        target_balance=target,
    )
    session.add(member)
    await session.flush()
    return member


async def remove_member(
    session: AsyncSession,
    *,
    pool_id: uuid.UUID,
    member_id: uuid.UUID,
    company_id: uuid.UUID,
) -> None:
    await _get_pool(session, pool_id, company_id)
    result = await session.execute(
        select(CashPoolMember).where(
            CashPoolMember.id == member_id,
            CashPoolMember.pool_id == pool_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    await session.delete(member)
    await session.flush()


# ── Pool Balance ─────────────────────────────────────────────────

async def get_pool_balance(
    session: AsyncSession,
    *,
    pool_id: uuid.UUID,
    company_id: uuid.UUID,
) -> dict:
    pool = await _get_pool(session, pool_id, company_id)
    members = await _get_members(session, pool_id)

    if pool.pool_type == "NOTIONAL":
        return await _notional_balance(session, pool, members)
    elif pool.pool_type == "PHYSICAL":
        return await _physical_balance(session, pool, members)
    else:  # ZBA
        return await _zba_balance(session, pool, members)


async def _notional_balance(session, pool, members) -> dict:
    """Virtual aggregation: SUM of all member ledger_balances."""
    account_ids = [m.account_id for m in members]
    balances = await _latest_balances(session, account_ids)

    member_balances = []
    total = Decimal("0")
    for m in members:
        bal = balances.get(m.account_id, Decimal("0"))
        total += bal
        member_balances.append({
            "account_id": m.account_id,
            "entity_id": m.entity_id,
            "ledger_balance": bal,
            "target_balance": None,
            "excess": None,
            "is_exception": False,
        })

    return {
        "pool_id": pool.id,
        "pool_type": "NOTIONAL",
        "consolidated_balance": total,
        "header_balance": None,
        "currency": pool.currency,
        "member_balances": member_balances,
    }


async def _physical_balance(session, pool, members) -> dict:
    """Header actual + SUM(member excess over target)."""
    account_ids = [m.account_id for m in members] + [pool.header_account_id]
    balances = await _latest_balances(session, account_ids)

    header_bal = balances.get(pool.header_account_id, Decimal("0"))
    member_balances = []
    total_excess = Decimal("0")
    for m in members:
        bal = balances.get(m.account_id, Decimal("0"))
        target = Decimal(str(m.target_balance)) if m.target_balance is not None else Decimal("0")
        excess = bal - target
        total_excess += excess
        member_balances.append({
            "account_id": m.account_id,
            "entity_id": m.entity_id,
            "ledger_balance": bal,
            "target_balance": target,
            "excess": excess,
            "is_exception": False,
        })

    return {
        "pool_id": pool.id,
        "pool_type": "PHYSICAL",
        "consolidated_balance": header_bal + total_excess,
        "header_balance": header_bal,
        "currency": pool.currency,
        "member_balances": member_balances,
    }


async def _zba_balance(session, pool, members) -> dict:
    """Pool balance = header. Non-zero members are exceptions."""
    account_ids = [m.account_id for m in members] + [pool.header_account_id]
    balances = await _latest_balances(session, account_ids)

    header_bal = balances.get(pool.header_account_id, Decimal("0"))
    member_balances = []
    for m in members:
        bal = balances.get(m.account_id, Decimal("0"))
        member_balances.append({
            "account_id": m.account_id,
            "entity_id": m.entity_id,
            "ledger_balance": bal,
            "target_balance": Decimal("0"),
            "excess": bal,
            "is_exception": bal != Decimal("0"),
        })

    return {
        "pool_id": pool.id,
        "pool_type": "ZBA",
        "consolidated_balance": header_bal,
        "header_balance": header_bal,
        "currency": pool.currency,
        "member_balances": member_balances,
    }


async def _latest_balances(session, account_ids: list[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
    """Get latest ledger_balance per account_id using MAX(balance_date)."""
    if not account_ids:
        return {}

    sub = (
        select(
            CashBalance.account_id,
            func.max(CashBalance.balance_date).label("max_date"),
        )
        .where(CashBalance.account_id.in_(account_ids))
        .group_by(CashBalance.account_id)
        .subquery()
    )

    result = await session.execute(
        select(CashBalance.account_id, CashBalance.ledger_balance)
        .join(sub, (CashBalance.account_id == sub.c.account_id) & (CashBalance.balance_date == sub.c.max_date))
    )
    return {row.account_id: Decimal(str(row.ledger_balance)) for row in result.all()}


# ── Sweep Calculation & Execution ────────────────────────────────

async def calculate_sweeps(
    session: AsyncSession,
    *,
    pool_id: uuid.UUID,
    company_id: uuid.UUID,
) -> list[dict]:
    """Compute required sweeps. Raises 400 for NOTIONAL pools."""
    pool = await _get_pool(session, pool_id, company_id)

    if pool.pool_type == "NOTIONAL":
        raise HTTPException(status_code=400, detail="NOTIONAL pools do not support sweeps")

    members = await _get_members(session, pool_id)
    account_ids = [m.account_id for m in members]
    balances = await _latest_balances(session, account_ids)

    sweeps = []
    for m in members:
        bal = balances.get(m.account_id, Decimal("0"))
        target = Decimal(str(m.target_balance)) if m.target_balance is not None else Decimal("0")
        diff = bal - target

        if diff > 0:
            sweeps.append({
                "source_account_id": m.account_id,
                "destination_account_id": pool.header_account_id,
                "amount": diff,
                "currency": pool.currency,
                "direction": "CONCENTRATION",
            })
        elif diff < 0:
            sweeps.append({
                "source_account_id": pool.header_account_id,
                "destination_account_id": m.account_id,
                "amount": abs(diff),
                "currency": pool.currency,
                "direction": "DISTRIBUTION",
            })

    return sweeps


async def execute_sweeps(
    session: AsyncSession,
    *,
    pool_id: uuid.UUID,
    company_id: uuid.UUID,
    performed_by: uuid.UUID,
) -> dict:
    """Calculate sweeps, persist as PENDING, audit-log."""
    sweep_dicts = await calculate_sweeps(session, pool_id=pool_id, company_id=company_id)

    for s in sweep_dicts:
        sweep = CashPoolSweep(
            pool_id=pool_id,
            source_account_id=s["source_account_id"],
            destination_account_id=s["destination_account_id"],
            amount=s["amount"],
            currency=s["currency"],
            direction=s["direction"],
            triggered_by=performed_by,
        )
        session.add(sweep)

    await session.flush()

    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.CASH_POOL_SWEEP,
        payload={
            "pool_id": str(pool_id),
            "sweep_count": len(sweep_dicts),
        },
        performed_by=performed_by,
    )

    return {"sweep_count": len(sweep_dicts)}


async def list_sweeps(
    session: AsyncSession,
    *,
    pool_id: uuid.UUID,
    company_id: uuid.UUID,
) -> list[CashPoolSweep]:
    await _get_pool(session, pool_id, company_id)
    result = await session.execute(
        select(CashPoolSweep).where(CashPoolSweep.pool_id == pool_id)
        .order_by(CashPoolSweep.created_at.desc())
    )
    return list(result.scalars().all())


# ── Helpers ──────────────────────────────────────────────────────

async def _get_pool(session, pool_id, company_id) -> CashPool:
    result = await session.execute(
        select(CashPool).where(
            CashPool.id == pool_id,
            CashPool.company_id == company_id,
        )
    )
    pool = result.scalar_one_or_none()
    if pool is None:
        raise HTTPException(status_code=404, detail="Pool not found")
    return pool


async def _get_members(session, pool_id) -> list[CashPoolMember]:
    result = await session.execute(
        select(CashPoolMember).where(CashPoolMember.pool_id == pool_id)
    )
    return list(result.scalars().all())


def _pool_to_dict(pool) -> dict:
    return {
        "id": pool.id,
        "company_id": pool.company_id,
        "name": pool.name,
        "pool_type": pool.pool_type,
        "header_account_id": pool.header_account_id,
        "currency": pool.currency,
        "base_currency": pool.base_currency,
        "is_active": pool.is_active,
        "created_by": pool.created_by,
        "created_at": pool.created_at,
    }


def _member_to_dict(m) -> dict:
    return {
        "id": m.id,
        "pool_id": m.pool_id,
        "account_id": m.account_id,
        "entity_id": m.entity_id,
        "participation_type": m.participation_type,
        "target_balance": m.target_balance,
        "created_at": m.created_at,
    }
