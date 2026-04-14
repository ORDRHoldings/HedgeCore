# backend/app/api/routes/v1_bank_connections.py
"""v1 bank connections — OAuth flow + circuit-breaker management."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.dependencies import get_current_user, get_session
from app.models.cash import BankConnection, BankConnectionStatus
from app.models.user import User
from app.schemas_v1.cash import AuthUrlRequest, AuthUrlResponse, OAuthCallbackRequest, BankConnectionResponse
from app.services.bank_connection_service import get_auth_url, handle_callback, revoke_connection

router = APIRouter(prefix="/v1/cash/connections", tags=["cash-connections"])


def _require_write(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


@router.get("", response_model=list[BankConnectionResponse])
async def list_connections(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    if getattr(current_user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")
    result = await db.execute(
        select(BankConnection).where(BankConnection.company_id == current_user.company_id)
    )
    return result.scalars().all()


@router.get("/auth-url", response_model=AuthUrlResponse)
async def get_auth_url_route(
    provider: str,
    redirect_uri: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    url, connection = await get_auth_url(
        db,
        provider=provider,
        company_id=current_user.company_id,
        redirect_uri=redirect_uri,
        created_by=current_user.id,
    )
    await db.flush()
    return AuthUrlResponse(url=url, connection_id=connection.id)


@router.post("/callback", response_model=BankConnectionResponse)
async def oauth_callback(
    payload: OAuthCallbackRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    try:
        connection = await handle_callback(
            db,
            state=payload.state,
            code=payload.code,
            company_id=current_user.company_id,
            created_by=current_user.id,
        )
        return connection
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{connection_id}", status_code=204)
async def revoke_connection_route(
    connection_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    try:
        await revoke_connection(db, connection_id=connection_id,
                                company_id=current_user.company_id,
                                actor_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{connection_id}/refresh", response_model=BankConnectionResponse)
async def refresh_connection_route(
    connection_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Trigger token refresh for an active connection (stub — live implementation in Phase 2e)."""
    _require_write(current_user)
    result = await db.execute(
        select(BankConnection).where(
            BankConnection.id == connection_id,
            BankConnection.company_id == current_user.company_id,
        )
    )
    connection = result.scalar_one_or_none()
    if connection is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    return connection  # Phase 2e: call adapter.refresh_token() here


@router.post("/{connection_id}/reactivate", response_model=BankConnectionResponse)
async def reactivate_connection_route(
    connection_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Manually reactivate a connection that tripped the circuit-breaker. CFO/head_of_risk only."""
    _require_write(current_user)
    result = await db.execute(
        select(BankConnection).where(
            BankConnection.id == connection_id,
            BankConnection.company_id == current_user.company_id,
        )
    )
    connection = result.scalar_one_or_none()
    if connection is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    if connection.status != BankConnectionStatus.ERROR.value:
        raise HTTPException(status_code=422, detail="Connection is not in ERROR state")
    connection.status = BankConnectionStatus.ACTIVE.value
    connection.consecutive_failure_count = 0
    return connection
