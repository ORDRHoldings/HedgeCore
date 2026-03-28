"""
backend/app/api/routes/v1_signup.py

Self-service tenant signup. No authentication required.
Creates Company + admin User + GENESIS audit event atomically.
"""
from __future__ import annotations

from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.db import get_session
from app.services.tenant_provisioning import provision_tenant

router = APIRouter(prefix="/v1/signup", tags=["signup"])


class SignupRequest(BaseModel):
    company_name: str
    admin_email: EmailStr
    admin_password: str


class SignupResponse(BaseModel):
    company_id: str
    user_id: str
    message: str


@router.post("", status_code=201, response_model=SignupResponse)
async def signup(
    payload: SignupRequest,
    db: AsyncSession = Depends(get_session),
):
    """
    Create a new tenant workspace.
    - Creates Company, admin User, and GENESIS audit event atomically.
    - Returns company_id and user_id.
    - Email verification is deferred to a future sprint.
    """
    if len(payload.admin_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    try:
        company, user = await provision_tenant(
            db,
            company_name=payload.company_name,
            admin_email=payload.admin_email,
            admin_password=payload.admin_password,
        )
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")

    return SignupResponse(
        company_id=str(company.id),
        user_id=str(user.id),
        message="Tenant provisioned. You may now log in.",
    )
