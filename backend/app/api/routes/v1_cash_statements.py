"""v1 bank statement import — upload, list, transactions."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_session
from app.models.user import User
from app.schemas_v1.cash import (
    BankStatementResponse,
    BankTransactionResponse,
    StatementUploadResponse,
)
from app.services.statement_service import (
    get_statement,
    import_statement,
    list_statements,
    list_transactions,
)

router = APIRouter(prefix="/v1/cash/statements", tags=["cash-statements"])


def _require_professional(user: User) -> None:
    if getattr(user, "plan_tier", "starter") not in ("professional", "enterprise"):
        raise HTTPException(status_code=403, detail="Professional plan required")


def _require_write(user: User) -> None:
    _require_professional(user)
    if getattr(user, "role", "") not in ("cfo", "head_of_risk", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient role")


# ── Module-level helpers for testability ──

async def list_statements_helper(db, *, company_id, account_id):
    return await list_statements(db, company_id=company_id, account_id=account_id)


async def list_transactions_helper(db, *, company_id, account_id, date_from, date_to, status):
    return await list_transactions(db, company_id=company_id, account_id=account_id,
                                   date_from=date_from, date_to=date_to, status=status)


async def import_statement_helper(db, *, company_id, account_id, content, filename, created_by, format_override):
    return await import_statement(db, company_id=company_id, account_id=account_id,
                                  content=content, filename=filename, created_by=created_by,
                                  format_override=format_override)


# ── Routes ──

@router.post("/upload", response_model=StatementUploadResponse, status_code=201)
async def upload_statement(
    file: UploadFile = File(...),
    account_id: uuid.UUID = Form(...),
    format: str | None = Form(default=None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_write(current_user)
    content = (await file.read()).decode("utf-8", errors="replace")
    result = await import_statement_helper(
        db, company_id=current_user.company_id, account_id=account_id,
        content=content, filename=file.filename, created_by=current_user.id,
        format_override=format,
    )
    await db.commit()
    return result


@router.get("/", response_model=list[BankStatementResponse])
async def get_statements(
    account_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_statements_helper(db, company_id=current_user.company_id, account_id=account_id)


@router.get("/transactions", response_model=list[BankTransactionResponse])
async def get_transactions(
    account_id: uuid.UUID | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_transactions_helper(
        db, company_id=current_user.company_id, account_id=account_id,
        date_from=date_from, date_to=date_to, status=status,
    )


@router.get("/{statement_id}", response_model=BankStatementResponse)
async def get_statement_detail(
    statement_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    stmt = await get_statement(db, statement_id=statement_id, company_id=current_user.company_id)
    if stmt is None:
        raise HTTPException(status_code=404, detail="Statement not found")
    return stmt


@router.get("/{statement_id}/transactions", response_model=list[BankTransactionResponse])
async def get_statement_transactions(
    statement_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_professional(current_user)
    return await list_transactions(db, company_id=current_user.company_id, statement_id=statement_id)
