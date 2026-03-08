# app/api/routes/organization.py
"""
Organization hierarchy CRUD - Company, Branch, Department.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.authz import require_permission
from app.core.db import get_session
from app.core.security import get_current_user
from app.models.organization import Branch, Company, Department
from app.schemas.organization import (
    BranchCreate,
    BranchOut,
    BranchUpdate,
    BranchWithDepartments,
    CompanyOut,
    CompanyUpdate,
    CompanyWithBranches,
    DepartmentCreate,
    DepartmentOut,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/organization", tags=["organization"])


# -------------------------------------------------------------------
# Company
# -------------------------------------------------------------------
@router.get("/company", response_model=CompanyWithBranches)
async def get_company(
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """Get the current user's company with branches and departments."""
    company_id = getattr(current_user, "company_id", None)
    if not company_id:
        raise HTTPException(status_code=404, detail="No company assigned")

    stmt = (
        select(Company)
        .options(
            selectinload(Company.branches).selectinload(Branch.departments)
        )
        .where(Company.id == company_id)
    )
    result = await db.execute(stmt)
    company = result.scalars().first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.put("/company", response_model=CompanyOut)
@require_permission("company.edit_settings")
async def update_company(
    payload: CompanyUpdate,
    request=None,
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """Update company settings."""
    company_id = getattr(current_user, "company_id", None)
    if not company_id:
        raise HTTPException(status_code=404, detail="No company assigned")

    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(company, field, value)

    await db.commit()
    await db.refresh(company)
    logger.info(f"Company {company.slug} updated by user {current_user.id}")
    return company


# -------------------------------------------------------------------
# Branches
# -------------------------------------------------------------------
@router.get("/branches", response_model=list[BranchWithDepartments])
async def list_branches(
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """List all branches in the user's company."""
    company_id = getattr(current_user, "company_id", None)
    if not company_id:
        raise HTTPException(status_code=404, detail="No company assigned")

    stmt = (
        select(Branch)
        .options(selectinload(Branch.departments))
        .where(Branch.company_id == company_id)
        .order_by(Branch.name)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/branches", response_model=BranchOut, status_code=201)
@require_permission("company.manage_branches")
async def create_branch(
    payload: BranchCreate,
    request=None,
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """Create a new branch."""
    company_id = getattr(current_user, "company_id", None)
    if not company_id:
        raise HTTPException(status_code=404, detail="No company assigned")

    branch = Branch(company_id=company_id, **payload.model_dump())
    db.add(branch)
    try:
        await db.commit()
        await db.refresh(branch)
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail=f"Branch code '{payload.code}' already exists")
    logger.info(f"Branch {branch.code} created by user {current_user.id}")
    return branch


@router.put("/branches/{branch_id}", response_model=BranchOut)
@require_permission("company.manage_branches")
async def update_branch(
    branch_id: UUID,
    payload: BranchUpdate,
    request=None,
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """Update a branch."""
    branch = await db.get(Branch, branch_id)
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(branch, field, value)

    await db.commit()
    await db.refresh(branch)
    return branch


# -------------------------------------------------------------------
# Departments
# -------------------------------------------------------------------
@router.get("/branches/{branch_id}/departments", response_model=list[DepartmentOut])
async def list_departments(
    branch_id: UUID,
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """List departments in a branch."""
    stmt = (
        select(Department)
        .where(Department.branch_id == branch_id)
        .order_by(Department.name)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/branches/{branch_id}/departments", response_model=DepartmentOut, status_code=201)
@require_permission("company.manage_branches")
async def create_department(
    branch_id: UUID,
    payload: DepartmentCreate,
    request=None,
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """Create a department within a branch."""
    branch = await db.get(Branch, branch_id)
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    dept = Department(branch_id=branch_id, **payload.model_dump())
    db.add(dept)
    try:
        await db.commit()
        await db.refresh(dept)
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail=f"Department code '{payload.code}' already exists in branch")
    return dept
