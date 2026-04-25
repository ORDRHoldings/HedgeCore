"""
POST /v1/voice/transcript -- WORM-log voice-session events.

MiFID II Article 16(7) and Fed SR 11-7 require durable records of all
client-facing AI communications. This endpoint accepts client-side
transcript batches from the OpenAI Realtime flow (where audio+text
bypass our backend entirely) and appends them to the per-tenant
audit hash chain.

Event types written to audit_events:
  VOICE_SESSION_START  -- session opened (client-side start)
  VOICE_TURN           -- single user or assistant turn
  VOICE_TOOL_CALL      -- AI invoked a HedgeCore function
  VOICE_SESSION_END    -- session closed

Auth: JWT (get_current_user) -- ties events to actor + tenant.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.dependencies import get_current_user
from app.models.user import User
from app.services.audit_emit import emit_audit

router = APIRouter(prefix="/v1/voice", tags=["v1-voice"])

# ── Limits (prevent oversized payloads becoming chain bloat) ────────────────

_MAX_TURNS_PER_BATCH = 200
_MAX_TOOL_CALLS_PER_BATCH = 50
_MAX_TEXT_LEN = 8192
_MAX_TOOL_ARG_BYTES = 2048
_MAX_TOOL_RESULT_BYTES = 2048

# ── Schemas ─────────────────────────────────────────────────────────────────


class VoiceTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(..., max_length=_MAX_TEXT_LEN)
    at: datetime


class VoiceToolCall(BaseModel):
    name: str = Field(..., max_length=128)
    arguments: dict = Field(default_factory=dict)
    result_summary: str = Field("", max_length=_MAX_TOOL_RESULT_BYTES)
    status: Literal["ok", "error", "confirmation_required"] = "ok"
    at: datetime


class VoiceTranscriptBatch(BaseModel):
    session_id: str = Field(..., min_length=8, max_length=64)
    transport: Literal["openai-realtime", "claude-websocket"]
    model: str = Field(..., max_length=64)
    session_start: datetime | None = None
    session_end: datetime | None = None
    turns: list[VoiceTurn] = Field(default_factory=list)
    tool_calls: list[VoiceToolCall] = Field(default_factory=list)
    # EU AI Act Art. 52 transparency: client signals one-time AI disclosure
    # acknowledgement so the WORM chain has a tamper-evident record of consent.
    disclosure_ack: bool = False
    disclosure_text: str | None = Field(default=None, max_length=2048)
    # Provenance manifest — model + prompt + tools hashes from /voice/token.
    # When present, written into the VOICE_SESSION_START payload so auditors
    # can prove what code was running for any given session.
    model_id: str | None = Field(default=None, max_length=64)
    instructions_sha256: str | None = Field(default=None, max_length=64)
    tools_sha256: str | None = Field(default=None, max_length=64)


class VoiceTranscriptAck(BaseModel):
    session_id: str
    events_logged: int


# ── Endpoint ────────────────────────────────────────────────────────────────


@router.post(
    "/transcript",
    response_model=VoiceTranscriptAck,
    summary="Append voice-session transcript to tenant audit chain",
)
async def log_voice_transcript(
    batch: VoiceTranscriptBatch,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> VoiceTranscriptAck:
    if len(batch.turns) > _MAX_TURNS_PER_BATCH:
        raise HTTPException(status_code=413, detail="too many turns in batch")
    if len(batch.tool_calls) > _MAX_TOOL_CALLS_PER_BATCH:
        raise HTTPException(status_code=413, detail="too many tool calls in batch")

    session_scope = {
        "session_id": batch.session_id,
        "transport": batch.transport,
        "model": batch.model,
    }

    events_logged = 0

    if batch.session_start is not None:
        manifest: dict[str, str] = {}
        if batch.model_id:
            manifest["model_id"] = batch.model_id
        if batch.instructions_sha256:
            manifest["instructions_sha256"] = batch.instructions_sha256
        if batch.tools_sha256:
            manifest["tools_sha256"] = batch.tools_sha256

        await emit_audit(
            session=session,
            user=current_user,
            event_type="VOICE_SESSION_START",
            description=f"Voice session started ({batch.transport}, {batch.model})",
            entity_type="voice_session",
            entity_id=batch.session_id,
            payload={
                **session_scope,
                "at": batch.session_start.isoformat(),
                **({"manifest": manifest} if manifest else {}),
            },
        )
        events_logged += 1

    if batch.disclosure_ack:
        await emit_audit(
            session=session,
            user=current_user,
            event_type="VOICE_AI_DISCLOSURE_ACK",
            description="User acknowledged AI disclosure (EU AI Act Art. 52)",
            entity_type="voice_session",
            entity_id=batch.session_id,
            payload={
                **session_scope,
                "disclosure_text": batch.disclosure_text,
            },
        )
        events_logged += 1

    for turn in batch.turns:
        await emit_audit(
            session=session,
            user=current_user,
            event_type="VOICE_TURN",
            description=f"Voice turn ({turn.role}, {len(turn.text)} chars)",
            entity_type="voice_session",
            entity_id=batch.session_id,
            payload={
                **session_scope,
                "role": turn.role,
                "text": turn.text,
                "at": turn.at.isoformat(),
            },
        )
        events_logged += 1

    for call in batch.tool_calls:
        arguments_truncated = _truncate_json(call.arguments, _MAX_TOOL_ARG_BYTES)
        await emit_audit(
            session=session,
            user=current_user,
            event_type="VOICE_TOOL_CALL",
            description=f"Voice tool call: {call.name} ({call.status})",
            entity_type="voice_session",
            entity_id=batch.session_id,
            payload={
                **session_scope,
                "tool": call.name,
                "arguments": arguments_truncated,
                "result_summary": call.result_summary,
                "status": call.status,
                "at": call.at.isoformat(),
            },
        )
        events_logged += 1

    if batch.session_end is not None:
        await emit_audit(
            session=session,
            user=current_user,
            event_type="VOICE_SESSION_END",
            description=f"Voice session ended ({events_logged} events in batch)",
            entity_type="voice_session",
            entity_id=batch.session_id,
            payload={**session_scope, "at": batch.session_end.isoformat()},
        )
        events_logged += 1

    return VoiceTranscriptAck(session_id=batch.session_id, events_logged=events_logged)


def _truncate_json(obj: dict, max_bytes: int) -> dict:
    import json

    encoded = json.dumps(obj, default=str)
    if len(encoded) <= max_bytes:
        return obj
    return {"_truncated": True, "_size": len(encoded), "_head": encoded[:max_bytes]}
