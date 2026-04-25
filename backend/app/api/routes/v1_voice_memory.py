"""
GET /v1/voice/memory/recent — recall the caller's recent voice sessions.

Surfaced to the voice agent as the `recall_recent_sessions` tool so the model
can reference prior conversations ("Last time you asked about USDMXN forward
pricing — should we continue?") without dumping the full transcript chain.

Tenant scope: events are filtered by current_user.company_id; cross-tenant
recall is structurally impossible.

Source data: audit_events with event_type LIKE 'VOICE_%'. The endpoint walks
DESC by created_at, groups by entity_id (= session_id), and emits a compact
summary per session.
"""
from __future__ import annotations

from collections import OrderedDict
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.dependencies import get_current_user
from app.models.audit_event import AuditEvent
from app.models.user import User

router = APIRouter(prefix="/v1/voice", tags=["v1-voice"])

_MAX_LIMIT = 5
_DEFAULT_LIMIT = 3
# Bound on rows scanned per request. Each session typically writes ~5-30 events;
# limit*40 is a comfortable upper bound that keeps the query cheap.
_MAX_ROWS_SCANNED = _MAX_LIMIT * 40
# Truncation for the recall summary — enough to disambiguate, short enough
# that the model isn't forced to ingest a wall of text.
_TURN_SUMMARY_LEN = 280


class VoiceSessionMemory(BaseModel):
    session_id: str
    started_at: str | None = None
    ended_at: str | None = None
    last_user_turn: str | None = None
    last_assistant_turn: str | None = None
    tool_calls_count: int = 0
    turn_count: int = 0


class VoiceMemoryResponse(BaseModel):
    count: int
    sessions: list[VoiceSessionMemory]


@router.get(
    "/memory/recent",
    response_model=VoiceMemoryResponse,
    summary="List recent voice sessions for the caller's tenant",
)
async def get_recent_voice_sessions(
    limit: int = Query(_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> VoiceMemoryResponse:
    stmt = (
        select(AuditEvent)
        .where(AuditEvent.company_id == current_user.company_id)
        .where(AuditEvent.event_type.like("VOICE_%"))
        .order_by(desc(AuditEvent.created_at))
        .limit(_MAX_ROWS_SCANNED)
    )
    result = await session.execute(stmt)
    events = result.scalars().all()

    sessions: OrderedDict[str, dict[str, Any]] = OrderedDict()
    for ev in events:
        sid = ev.entity_id
        if not sid:
            continue
        # Once we have `limit` sessions buffered AND we encounter a brand-new
        # session_id, we can stop — DESC order means events for already-buffered
        # sessions arrive contiguously, so no useful data is lost.
        if sid not in sessions and len(sessions) >= limit:
            break
        bucket = sessions.setdefault(
            sid,
            {
                "session_id": sid,
                "started_at": None,
                "ended_at": None,
                "last_user_turn": None,
                "last_assistant_turn": None,
                "tool_calls_count": 0,
                "turn_count": 0,
            },
        )
        et = ev.event_type
        payload = ev.payload or {}
        if et == "VOICE_SESSION_START":
            bucket["started_at"] = payload.get("at")
        elif et == "VOICE_SESSION_END":
            if bucket["ended_at"] is None:
                bucket["ended_at"] = payload.get("at")
        elif et == "VOICE_TURN":
            bucket["turn_count"] += 1
            role = payload.get("role")
            text = (payload.get("text") or "").strip()
            # DESC iteration → first occurrence per role IS the most recent turn.
            if role == "user" and bucket["last_user_turn"] is None:
                bucket["last_user_turn"] = text[:_TURN_SUMMARY_LEN]
            elif role == "assistant" and bucket["last_assistant_turn"] is None:
                bucket["last_assistant_turn"] = text[:_TURN_SUMMARY_LEN]
        elif et == "VOICE_TOOL_CALL":
            bucket["tool_calls_count"] += 1

    out = [VoiceSessionMemory(**v) for v in list(sessions.values())[:limit]]
    return VoiceMemoryResponse(count=len(out), sessions=out)
