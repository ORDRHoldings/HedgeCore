"""
/v1/voice/realtime — WebSocket bridge: browser PCM16 audio ↔ OpenAI Realtime API.

Protocol:
  Browser → backend WS → OpenAI Realtime WS → HedgeCore API functions → OpenAI → backend → Browser

Auth:
  WebSocket query param: ?token=<JWT>  (Bearer tokens can't be set in browser WS headers)

Message types (browser → backend):
  {"type": "audio_chunk", "data": "<base64 PCM16>"}
  {"type": "text", "content": "..."}            -- text fallback
  {"type": "interrupt"}                          -- cancel current response
  {"type": "end_session"}

Message types (backend → browser):
  {"type": "audio_chunk", "data": "<base64 PCM16>"}
  {"type": "transcript", "role": "user"|"assistant", "text": "..."}
  {"type": "function_call", "name": "...", "status": "calling"|"done"}
  {"type": "error", "message": "..."}
  {"type": "session_ready"}
  {"type": "input_audio_committed"}
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from typing import Any

import httpx
import jwt as pyjwt
import websockets
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_async_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/voice", tags=["v1-voice"])

# ── OpenAI Realtime API ───────────────────────────────────────────────────────
_OPENAI_REALTIME_URL = (
    "wss://api.openai.com/v1/realtime"
    "?model=gpt-4o-realtime-preview-2024-12-17"
)

_SYSTEM_PROMPT = """\
You are ORDR — the ORDR Terminal voice assistant. You are an institutional FX \
treasury advisor speaking to corporate treasury managers.

Personality: Calm, precise, and authoritative. Like a senior FX trader at a \
top-tier bank. Never hedge your language — be direct with numbers. Never say \
"um" or filler words.

When a user asks to hedge an exposure:
1. Confirm the details: currency pair, amount, direction (payable/receivable), timeline.
2. Call calculate_hedge with the appropriate parameters.
3. Read back the result clearly: contracts, cost, coverage %, margin required.
4. Ask if they want to create a governance proposal.

When quoting numbers, speak them clearly:
- "$500,000" → "five hundred thousand dollars"
- "17.24" → "seventeen twenty-four"
- "87%" → "eighty-seven percent"

CRITICAL: All calculations use the HedgeCore engine. Never estimate or invent \
numbers. If an API call fails, say so clearly.

Keep responses concise — this is a voice interface. Maximum 3-4 sentences per \
response unless the user asks for detail.
"""

# ── HedgeCore function definitions for OpenAI tool calling ───────────────────
_TOOLS: list[dict] = [
    {
        "type": "function",
        "name": "calculate_hedge",
        "description": (
            "Calculate FX hedge recommendation for a currency exposure using the "
            "HedgeCore engine. Returns contracts needed, total cost, coverage %, "
            "margin required, and a run ID."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "pair": {
                    "type": "string",
                    "description": "Currency pair, e.g. USDMXN, EURUSD, GBPUSD",
                },
                "exposure_amount": {
                    "type": "number",
                    "description": "Exposure amount in the foreign currency",
                },
                "flow_type": {
                    "type": "string",
                    "enum": ["AP", "AR"],
                    "description": "AP = payable (buying foreign currency), AR = receivable",
                },
                "value_date": {
                    "type": "string",
                    "description": "ISO date for the exposure, e.g. 2026-06-30",
                },
            },
            "required": ["pair", "exposure_amount", "flow_type"],
        },
    },
    {
        "type": "function",
        "name": "get_spot_rate",
        "description": "Get the current spot FX rate for a currency pair.",
        "parameters": {
            "type": "object",
            "properties": {
                "pair": {
                    "type": "string",
                    "description": "Currency pair, e.g. USDMXN",
                }
            },
            "required": ["pair"],
        },
    },
    {
        "type": "function",
        "name": "list_positions",
        "description": "List the current open FX positions and their hedge status.",
        "parameters": {
            "type": "object",
            "properties": {
                "status_filter": {
                    "type": "string",
                    "enum": ["ALL", "NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED"],
                    "description": "Filter by execution status",
                }
            },
        },
    },
    {
        "type": "function",
        "name": "get_portfolio_summary",
        "description": "Get portfolio KPIs: total exposure, coverage ratio, pending proposals, open alerts.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "type": "function",
        "name": "list_policies",
        "description": "List available hedge policy templates with their names and parameters.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "type": "function",
        "name": "get_pending_approvals",
        "description": "List execution proposals awaiting 4-eyes checker approval.",
        "parameters": {"type": "object", "properties": {}},
    },
]


# ── Token validation ──────────────────────────────────────────────────────────

def _validate_token(token: str) -> dict | None:
    """Decode and validate a JWT. Returns payload or None."""
    try:
        payload = pyjwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.TOKEN_AUDIENCE,
            issuer=settings.TOKEN_ISSUER,
            options={"verify_exp": True},
        )
        return payload
    except pyjwt.PyJWTError as exc:
        logger.warning("Voice WS: JWT validation failed: %s", exc)
        return None


# ── HedgeCore function executor ───────────────────────────────────────────────

async def _call_hedgecore(
    name: str,
    args: dict,
    token: str,
    base_url: str,
) -> dict:
    """Execute a HedgeCore function call and return the result dict."""
    headers = {"Authorization": f"Bearer {token}"}
    timeout = httpx.Timeout(15.0)

    async with httpx.AsyncClient(base_url=base_url, headers=headers, timeout=timeout) as client:

        if name == "calculate_hedge":
            # Build a minimal position + market snapshot for the engine
            pair = args.get("pair", "USDMXN")
            amount = float(args.get("exposure_amount", 0))
            flow_type = args.get("flow_type", "AP")
            value_date = args.get("value_date", "2026-12-31")

            payload = {
                "trades": [
                    {
                        "record_id": "VOICE-001",
                        "entity": "Voice Request",
                        "flow_type": flow_type,
                        "currency": pair.replace("USD", "").replace("USD", ""),
                        "amount": amount,
                        "value_date": value_date,
                        "status": "CONFIRMED",
                    }
                ],
                "market": {"USDMXN": 17.24},
                "policy_instance_id": None,
            }
            try:
                resp = await client.post("/v1/calculate", json=payload)
                if resp.status_code == 200:
                    return resp.json()
                return {"error": f"Calculate failed: HTTP {resp.status_code}", "detail": resp.text[:200]}
            except Exception as exc:
                return {"error": str(exc)}

        elif name == "get_spot_rate":
            pair = args.get("pair", "USDMXN")
            try:
                resp = await client.get("/api/market/fx/rates")
                if resp.status_code == 200:
                    data = resp.json()
                    rates = data.get("rates", [])
                    match = next((r for r in rates if r.get("symbol") == pair), None)
                    if match:
                        return {"pair": pair, "mid": match["mid"], "bid": match["bid"], "ask": match["ask"]}
                    return {"error": f"Pair {pair} not found in market data"}
                return {"error": f"Market data unavailable: HTTP {resp.status_code}"}
            except Exception as exc:
                return {"error": str(exc)}

        elif name == "list_positions":
            status_filter = args.get("status_filter", "ALL")
            try:
                params = {} if status_filter == "ALL" else {"execution_status": status_filter}
                resp = await client.get("/v1/positions", params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    positions = data if isinstance(data, list) else data.get("positions", [])
                    return {
                        "count": len(positions),
                        "positions": [
                            {
                                "id": p.get("id", "")[:8],
                                "entity": p.get("entity", "—"),
                                "currency": p.get("currency", "—"),
                                "amount": p.get("amount", 0),
                                "execution_status": p.get("execution_status", "—"),
                                "value_date": p.get("value_date", "—"),
                            }
                            for p in positions[:10]
                        ],
                    }
                return {"error": f"HTTP {resp.status_code}"}
            except Exception as exc:
                return {"error": str(exc)}

        elif name == "get_portfolio_summary":
            try:
                resp = await client.get("/v1/dashboard/summary")
                if resp.status_code == 200:
                    return resp.json()
                return {"error": f"HTTP {resp.status_code}"}
            except Exception as exc:
                return {"error": str(exc)}

        elif name == "list_policies":
            try:
                resp = await client.get("/v1/policies")
                if resp.status_code == 200:
                    data = resp.json()
                    templates = data if isinstance(data, list) else data.get("templates", [])
                    return {
                        "count": len(templates),
                        "policies": [
                            {
                                "id": t.get("id", "")[:8],
                                "name": t.get("name", "—"),
                                "short_name": t.get("short_name", "—"),
                                "description": t.get("description", "—"),
                            }
                            for t in templates[:10]
                        ],
                    }
                return {"error": f"HTTP {resp.status_code}"}
            except Exception as exc:
                return {"error": str(exc)}

        elif name == "get_pending_approvals":
            try:
                resp = await client.get("/v1/proposals?status=PROPOSED&limit=10")
                if resp.status_code == 200:
                    data = resp.json()
                    proposals = data if isinstance(data, list) else data.get("proposals", [])
                    return {
                        "count": len(proposals),
                        "proposals": [
                            {
                                "id": p.get("id", "")[:8],
                                "execution_ref": p.get("execution_ref", "—"),
                                "proposed_by_email": p.get("proposed_by_email", "—"),
                                "status": p.get("status", "—"),
                            }
                            for p in proposals[:10]
                        ],
                    }
                return {"error": f"HTTP {resp.status_code}"}
            except Exception as exc:
                return {"error": str(exc)}

    return {"error": f"Unknown function: {name}"}


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/realtime")
async def voice_realtime(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
):
    """
    WebSocket bridge: browser PCM16 ↔ OpenAI Realtime API.

    Connect: ws[s]://<host>/api/v1/voice/realtime?token=<JWT>
    """
    await websocket.accept()

    # ── Validate JWT ──────────────────────────────────────────────────────────
    payload = _validate_token(token)
    if not payload:
        await websocket.send_json({"type": "error", "message": "Unauthorized — invalid token"})
        await websocket.close(code=1008)
        return

    if not getattr(settings, "OPENAI_API_KEY", ""):
        await websocket.send_json({
            "type": "error",
            "message": "Voice assistant unavailable — OPENAI_API_KEY not configured",
        })
        await websocket.close(code=1011)
        return

    # ── Derive internal API base URL ──────────────────────────────────────────
    # Calls localhost so we don't go over the network for function calls
    internal_base = "http://127.0.0.1:8000/api"

    logger.info("Voice session started for sub=%s", payload.get("sub", "?"))

    try:
        async with websockets.connect(
            _OPENAI_REALTIME_URL,
            additional_headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "OpenAI-Beta": "realtime=v1",
            },
            ping_interval=20,
            ping_timeout=10,
        ) as openai_ws:

            # ── Configure OpenAI session ──────────────────────────────────────
            await openai_ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "modalities": ["text", "audio"],
                    "instructions": _SYSTEM_PROMPT,
                    "voice": "ash",
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm16",
                    "input_audio_transcription": {"model": "whisper-1"},
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 700,
                    },
                    "tools": _TOOLS,
                    "tool_choice": "auto",
                    "temperature": 0.7,
                },
            }))

            await websocket.send_json({"type": "session_ready"})

            # Accumulate function call arguments (streamed in fragments)
            _fn_calls: dict[str, dict] = {}

            async def browser_to_openai() -> None:
                """Forward browser messages → OpenAI."""
                while True:
                    try:
                        msg = await websocket.receive_json()
                    except WebSocketDisconnect:
                        return

                    msg_type = msg.get("type", "")

                    if msg_type == "audio_chunk":
                        # PCM16 audio chunk from browser mic
                        await openai_ws.send(json.dumps({
                            "type": "input_audio_buffer.append",
                            "audio": msg["data"],
                        }))

                    elif msg_type == "text":
                        # Text fallback (keyboard input)
                        await openai_ws.send(json.dumps({
                            "type": "conversation.item.create",
                            "item": {
                                "type": "message",
                                "role": "user",
                                "content": [{"type": "input_text", "text": msg["content"]}],
                            },
                        }))
                        await openai_ws.send(json.dumps({"type": "response.create"}))

                    elif msg_type == "interrupt":
                        await openai_ws.send(json.dumps({"type": "response.cancel"}))

                    elif msg_type == "end_session":
                        return

            async def openai_to_browser() -> None:
                """Forward OpenAI events → browser, handle function calls."""
                async for raw in openai_ws:
                    try:
                        evt = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    evt_type = evt.get("type", "")

                    # ── Audio delta → stream to browser ───────────────────────
                    if evt_type == "response.audio.delta":
                        await websocket.send_json({
                            "type": "audio_chunk",
                            "data": evt.get("delta", ""),
                        })

                    # ── Transcript events ─────────────────────────────────────
                    elif evt_type == "conversation.item.input_audio_transcription.completed":
                        await websocket.send_json({
                            "type": "transcript",
                            "role": "user",
                            "text": evt.get("transcript", ""),
                        })

                    elif evt_type == "response.audio_transcript.done":
                        await websocket.send_json({
                            "type": "transcript",
                            "role": "assistant",
                            "text": evt.get("transcript", ""),
                        })

                    # ── Input audio committed (VAD detected silence) ───────────
                    elif evt_type == "input_audio_buffer.committed":
                        await websocket.send_json({"type": "input_audio_committed"})

                    # ── Function call fragments ───────────────────────────────
                    elif evt_type == "response.function_call_arguments.delta":
                        call_id = evt.get("call_id", "")
                        if call_id not in _fn_calls:
                            _fn_calls[call_id] = {
                                "name": evt.get("name", ""),
                                "args_raw": "",
                            }
                        _fn_calls[call_id]["args_raw"] += evt.get("delta", "")

                    elif evt_type == "response.function_call_arguments.done":
                        call_id = evt.get("call_id", "")
                        fn_name = evt.get("name", "") or _fn_calls.get(call_id, {}).get("name", "")
                        args_raw = evt.get("arguments", "") or _fn_calls.get(call_id, {}).get("args_raw", "{}")

                        await websocket.send_json({
                            "type": "function_call",
                            "name": fn_name,
                            "status": "calling",
                        })

                        try:
                            args = json.loads(args_raw) if args_raw.strip() else {}
                        except json.JSONDecodeError:
                            args = {}

                        # Execute function against HedgeCore
                        result = await _call_hedgecore(fn_name, args, token, internal_base)

                        # Return result to OpenAI
                        await openai_ws.send(json.dumps({
                            "type": "conversation.item.create",
                            "item": {
                                "type": "function_call_output",
                                "call_id": call_id,
                                "output": json.dumps(result),
                            },
                        }))
                        await openai_ws.send(json.dumps({"type": "response.create"}))

                        await websocket.send_json({
                            "type": "function_call",
                            "name": fn_name,
                            "status": "done",
                        })

                        # Cleanup
                        _fn_calls.pop(call_id, None)

                    # ── Error forwarding ──────────────────────────────────────
                    elif evt_type == "error":
                        error_detail = evt.get("error", {})
                        logger.error("OpenAI Realtime error: %s", error_detail)
                        await websocket.send_json({
                            "type": "error",
                            "message": error_detail.get("message", "OpenAI error"),
                        })

            try:
                await asyncio.gather(browser_to_openai(), openai_to_browser())
            except WebSocketDisconnect:
                pass
            except Exception as exc:
                logger.exception("Voice session error: %s", exc)
                try:
                    await websocket.send_json({"type": "error", "message": str(exc)})
                except Exception:
                    pass

    except Exception as exc:
        logger.exception("Failed to connect to OpenAI Realtime: %s", exc)
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Voice service unavailable: {exc}",
            })
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
        logger.info("Voice session closed for sub=%s", payload.get("sub", "?"))
