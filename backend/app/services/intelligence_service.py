# backend/app/services/intelligence_service.py
"""
Intelligence Service — Phase 3 AI Add-On Tier

Advisory-only: never writes to WORM tables, never approves/executes records.
Only DB write: INSERT into intelligence_query_log (non-WORM).

Bedrock-compatible: swap _get_client() to use boto3 Bedrock client when
AWS migration occurs — all service/route code above it is unchanged.
"""
from __future__ import annotations

import hashlib
import time
import uuid
from datetime import UTC, datetime

import anthropic
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.intelligence import IntelligenceQueryLog


# ── Internal helpers ───────────────────────────────────────────────────────


def _hash_prompt(prompt: str) -> str:
    """Return SHA-256 hex digest of prompt. Never store raw prompt."""
    return hashlib.sha256(prompt.encode()).hexdigest()


def _get_client() -> anthropic.AsyncAnthropic:
    """Return Anthropic async client. Raises 503 if key not configured."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Intelligence service not configured (ANTHROPIC_API_KEY missing).",
        )
    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


async def _log_query(
    session: AsyncSession,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    capability: str,
    prompt_hash: str,
    tokens_in: int,
    tokens_out: int,
    latency_ms: int,
) -> IntelligenceQueryLog:
    """Insert a row into intelligence_query_log and commit."""
    row = IntelligenceQueryLog(
        company_id=company_id,
        user_id=user_id,
        capability=capability,
        prompt_hash=prompt_hash,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        latency_ms=latency_ms,
    )
    session.add(row)
    await session.flush()
    await session.commit()
    return row


# ── Context builder ────────────────────────────────────────────────────────


async def build_treasury_context(session: AsyncSession, company_id: uuid.UUID) -> str:
    """
    Build a plain-text treasury context string for prompt injection.
    Contains financial aggregates only — no PII, no raw transactions.
    All queries are tenant-scoped via company_id.
    """
    lines: list[str] = [f"Treasury context for company {company_id}:"]

    # Cash balances summary (latest per account)
    try:
        from app.models.cash import CashBalance, BankAccount
        result = await session.execute(
            select(
                BankAccount.currency,
                func.sum(CashBalance.closing_balance).label("total"),
            )
            .join(CashBalance, CashBalance.bank_account_id == BankAccount.id)
            .where(BankAccount.company_id == company_id)
            .group_by(BankAccount.currency)
        )
        rows = result.fetchall()
        if rows:
            lines.append("\nCash balances by currency:")
            for row in rows:
                lines.append(f"  {row.currency}: {row.total:,.2f}")
        else:
            lines.append("\nCash balances: no data available.")
    except Exception:
        lines.append("\nCash balances: unavailable.")

    # Pending payments summary
    try:
        from app.models.payment import PaymentInstruction
        result = await session.execute(
            select(
                PaymentInstruction.currency,
                func.count().label("count"),
                func.sum(PaymentInstruction.amount).label("total"),
            )
            .where(
                PaymentInstruction.company_id == company_id,
                PaymentInstruction.status == "PENDING_APPROVAL",
            )
            .group_by(PaymentInstruction.currency)
        )
        rows = result.fetchall()
        if rows:
            lines.append("\nPending payments (PENDING_APPROVAL):")
            for row in rows:
                lines.append(f"  {row.currency}: {row.count} payments totalling {row.total:,.2f}")
        else:
            lines.append("\nPending payments: none.")
    except Exception:
        lines.append("\nPending payments: unavailable.")

    return "\n".join(lines)


# ── NL Query ───────────────────────────────────────────────────────────────


class QueryResponse:
    def __init__(self, query_id: str, answer: str, data_refs: list[str],
                 tokens_used: int, latency_ms: int):
        self.query_id = query_id
        self.answer = answer
        self.data_refs = data_refs
        self.tokens_used = tokens_used
        self.latency_ms = latency_ms


async def query_intelligence(
    session: AsyncSession,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    q: str,
) -> QueryResponse:
    """
    Ask a natural-language question about tenant's treasury data.
    Returns advisory answer — never modifies any record.
    """
    client = _get_client()
    context = await build_treasury_context(session, company_id)
    prompt = (
        "You are a treasury data assistant. Answer questions about the treasury data "
        "provided below. Be concise and factual. Always state this is advisory only.\n\n"
        f"{context}\n\nQuestion: {q}"
    )
    prompt_hash = _hash_prompt(prompt)  # hash BEFORE calling API

    t0 = time.monotonic()
    try:
        response = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIError as exc:
        raise HTTPException(status_code=502, detail=f"Anthropic API error: {exc}") from exc
    latency_ms = int((time.monotonic() - t0) * 1000)

    log_row = await _log_query(
        session, company_id, user_id, "NL_QUERY",
        prompt_hash,
        response.usage.input_tokens,
        response.usage.output_tokens,
        latency_ms,
    )
    return QueryResponse(
        query_id=str(log_row.id),
        answer=response.content[0].text,
        data_refs=[],
        tokens_used=response.usage.input_tokens + response.usage.output_tokens,
        latency_ms=latency_ms,
    )


# ── Report Commentary ──────────────────────────────────────────────────────


class CommentaryResponse:
    def __init__(self, commentary_id: str, draft: str, report_type: str, tokens_used: int):
        self.commentary_id = commentary_id
        self.draft = draft
        self.report_type = report_type
        self.tokens_used = tokens_used


async def draft_commentary(
    session: AsyncSession,
    company_id: uuid.UUID,
    user_id: uuid.UUID,
    report_type: str,
    report_id: str,
) -> CommentaryResponse:
    """
    Draft a 2-3 paragraph AI commentary for a report.
    Returns advisory draft — never writes to report records.
    Raises 404 if report_id not found / not owned by company.
    """
    client = _get_client()

    # Fetch report data (tenant-scoped)
    report_context = ""
    if report_type == "hedge_effectiveness":
        from app.models.calculation_run import CalculationRun
        result = await session.execute(
            select(CalculationRun)
            .where(
                CalculationRun.id == uuid.UUID(report_id),
                CalculationRun.company_id == company_id,
            )
        )
        run = result.scalar_one_or_none()
        if run is None:
            raise HTTPException(status_code=404, detail="Report not found.")
        report_context = (
            f"Hedge effectiveness report (run {report_id}):\n"
            f"  Status: {getattr(run, 'status', 'unknown')}\n"
            f"  Positions: {getattr(run, 'position_count', 'N/A')}\n"
        )
    else:
        raise HTTPException(status_code=404, detail="Report not found.")

    prompt = (
        "You are a treasury reporting assistant. Write a 2-3 paragraph professional "
        "commentary for the following report. Include relevant IFRS 9 or ASC 815 "
        "regulatory context where applicable. Note this is an AI-assisted draft "
        "requiring human review.\n\n"
        f"{report_context}"
    )
    prompt_hash = _hash_prompt(prompt)

    t0 = time.monotonic()
    try:
        response = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIError as exc:
        raise HTTPException(status_code=502, detail=f"Anthropic API error: {exc}") from exc
    latency_ms = int((time.monotonic() - t0) * 1000)

    log_row = await _log_query(
        session, company_id, user_id, "REPORT_COMMENTARY",
        prompt_hash,
        response.usage.input_tokens,
        response.usage.output_tokens,
        latency_ms,
    )
    return CommentaryResponse(
        commentary_id=str(log_row.id),
        draft=response.content[0].text,
        report_type=report_type,
        tokens_used=response.usage.input_tokens + response.usage.output_tokens,
    )


# ── Usage stats ────────────────────────────────────────────────────────────


async def get_usage_stats(session: AsyncSession, company_id: uuid.UUID) -> dict:
    """Return query count and token totals for the current calendar month."""
    from sqlalchemy import extract
    now = datetime.now(UTC)
    result = await session.execute(
        select(
            func.count().label("queries"),
            func.coalesce(func.sum(IntelligenceQueryLog.tokens_in + IntelligenceQueryLog.tokens_out), 0).label("tokens"),
        )
        .where(
            IntelligenceQueryLog.company_id == company_id,
            extract("year", IntelligenceQueryLog.created_at) == now.year,
            extract("month", IntelligenceQueryLog.created_at) == now.month,
        )
    )
    row = result.one()
    return {"queries_this_month": row.queries, "tokens_this_month": int(row.tokens)}
