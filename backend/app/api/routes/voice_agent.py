"""
/v1/voice/realtime — WebSocket text chat powered by OpenAI Chat Completions.

OpenAI Realtime API requires a separate Realtime-tier subscription.
This implementation uses Chat Completions (gpt-4o-mini) which works with
any OpenAI API key and supports tool calling for HedgeCore functions.

Auth:
  WebSocket query param: ?token=<JWT>  (browser WS API cannot send custom headers)

Message types (browser → backend):
  {"type": "text", "content": "..."}
  {"type": "audio_chunk", ...}         -- accepted but ignored (no Realtime tier)
  {"type": "interrupt"}                -- accepted but ignored
  {"type": "end_session"}

Message types (backend → browser):
  {"type": "transcript", "role": "user"|"assistant", "text": "..."}
  {"type": "function_call", "name": "...", "status": "calling"|"done"}
  {"type": "session_ready"}
  {"type": "error", "message": "..."}
  {"type": "debug", "event_type": "..."}
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx
import jwt as pyjwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam

from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/voice", tags=["v1-voice"])

# Internal base URL for calling HedgeCore from within the same process.
# Uses PORT env var (Render sets this; default 8000 for local dev).
_PORT = os.environ.get("PORT", "8000")
_INTERNAL_BASE = f"http://127.0.0.1:{_PORT}/api"

# ── System prompt ─────────────────────────────────────────────────────────────
_SYSTEM_PROMPT = """\
You are ORDR — the ORDR Terminal AI assistant for institutional FX treasury management.

Personality: Calm, precise, authoritative. Like a senior FX trader at a top-tier bank.
Be direct with numbers. Never hedge your language.

When a user asks about FX rates, positions, hedges, or portfolio data:
1. Call the appropriate HedgeCore function to get live data.
2. Present the result clearly and concisely.
3. Always quote exact numbers from the API — never estimate.

When asked to hedge an exposure:
1. Confirm: currency pair, amount, direction (payable/receivable), value date.
2. Call calculate_hedge with the parameters.
3. Report: contracts, cost, coverage %, margin required, run ID.
4. Ask if they want to create a governance proposal.

Keep responses concise — maximum 3-4 sentences unless the user asks for detail.
Always cite the source (API call) when quoting numbers.
"""

# ── Chat Completions tool definitions ─────────────────────────────────────────
_CHAT_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
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
    },
    {
        "type": "function",
        "function": {
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
    },
    {
        "type": "function",
        "function": {
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
    },
    {
        "type": "function",
        "function": {
            "name": "get_portfolio_summary",
            "description": "Get portfolio KPIs: total exposure, coverage ratio, pending proposals, open alerts.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_policies",
            "description": "List available hedge policy templates.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_pending_approvals",
            "description": "List execution proposals awaiting 4-eyes checker approval.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


# ── Token validation ──────────────────────────────────────────────────────────

def _validate_token(token: str) -> dict | None:
    try:
        return pyjwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.TOKEN_AUDIENCE,
            issuer=settings.TOKEN_ISSUER,
            options={"verify_exp": True},
        )
    except pyjwt.PyJWTError as exc:
        logger.warning("Voice WS: JWT validation failed: %s", exc)
        return None


# ── HedgeCore function executor ───────────────────────────────────────────────

async def _call_hedgecore(name: str, args: dict, token: str) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    timeout = httpx.Timeout(15.0)

    async with httpx.AsyncClient(
        base_url=_INTERNAL_BASE, headers=headers, timeout=timeout
    ) as client:

        if name == "calculate_hedge":
            pair = args.get("pair", "USDMXN")
            amount = float(args.get("exposure_amount", 0))
            flow_type = args.get("flow_type", "AP")
            value_date = args.get("value_date", "2026-12-31")
            # Derive foreign currency from pair (e.g. USDMXN → MXN, EURUSD → EUR)
            currency = pair[:3] if pair.endswith("USD") else pair[3:]
            payload = {
                "trades": [{
                    "record_id": "VOICE-001",
                    "entity": "Voice Request",
                    "flow_type": flow_type,
                    "currency": currency,
                    "amount": amount,
                    "value_date": value_date,
                    "status": "CONFIRMED",
                }],
                "market": {"USDMXN": 17.24},
                "policy_instance_id": None,
            }
            try:
                resp = await client.post("/v1/calculate", json=payload)
                return resp.json() if resp.status_code == 200 else {
                    "error": f"HTTP {resp.status_code}", "detail": resp.text[:200]
                }
            except Exception as exc:
                return {"error": str(exc)}

        elif name == "get_spot_rate":
            pair = args.get("pair", "USDMXN")
            try:
                resp = await client.get("/v1/market/fx/rates")
                if resp.status_code == 200:
                    rates = resp.json().get("rates", [])
                    match = next((r for r in rates if r.get("symbol") == pair), None)
                    if match:
                        return {"pair": pair, "mid": match["mid"], "bid": match["bid"], "ask": match["ask"]}
                    return {"error": f"Pair {pair} not found"}
                return {"error": f"HTTP {resp.status_code}"}
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
                                "status": p.get("execution_status", "—"),
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
                return resp.json() if resp.status_code == 200 else {"error": f"HTTP {resp.status_code}"}
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
                            {"id": t.get("id", "")[:8], "name": t.get("name", "—"),
                             "short_name": t.get("short_name", "—")}
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
                            {"id": p.get("id", "")[:8],
                             "ref": p.get("execution_ref", "—"),
                             "status": p.get("status", "—")}
                            for p in proposals[:10]
                        ],
                    }
                return {"error": f"HTTP {resp.status_code}"}
            except Exception as exc:
                return {"error": str(exc)}

    return {"error": f"Unknown function: {name}"}


# ── Chat with tool-call loop ──────────────────────────────────────────────────

async def _chat_with_tools(
    client: AsyncOpenAI,
    messages: list[ChatCompletionMessageParam],
    token: str,
    ws: WebSocket,
) -> str:
    """
    Call OpenAI Chat Completions, handle tool calls, return final text reply.
    Sends function_call status events to the browser WebSocket as it works.
    """
    for _round in range(6):  # max 5 tool-call rounds + 1 final
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=_CHAT_TOOLS,
            tool_choice="auto",
            temperature=0.3,
            max_tokens=512,
        )
        choice = response.choices[0]

        if choice.finish_reason == "tool_calls" and choice.message.tool_calls:
            # Append assistant's tool-call request to history
            messages.append(choice.message)  # type: ignore[arg-type]

            for tc in choice.message.tool_calls:
                fn_name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}

                # Notify browser
                await ws.send_json({"type": "function_call", "name": fn_name, "status": "calling"})

                result = await _call_hedgecore(fn_name, args, token)

                await ws.send_json({"type": "function_call", "name": fn_name, "status": "done"})

                # Append tool result to history
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result),
                })
            # Loop again to get the follow-up response

        else:
            # Final text response
            return (choice.message.content or "").strip() or "Ready to help with FX hedging."

    return "I encountered an issue processing your request. Please try again."


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/realtime")
async def voice_realtime(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
):
    """
    WebSocket chat endpoint powered by OpenAI Chat Completions + tool calling.
    Connect: ws[s]://<host>/api/v1/voice/realtime?token=<JWT>
    """
    await websocket.accept()

    # ── Validate JWT ──────────────────────────────────────────────────────────
    payload = _validate_token(token)
    if not payload:
        await websocket.send_json({"type": "error", "message": "Unauthorized — invalid token"})
        await websocket.close(code=1000)
        return

    if not getattr(settings, "OPENAI_API_KEY", ""):
        await websocket.send_json({
            "type": "error",
            "message": "Voice assistant unavailable — OPENAI_API_KEY not configured",
        })
        await websocket.close(code=1000)
        return

    oai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    messages: list[ChatCompletionMessageParam] = [
        {"role": "system", "content": _SYSTEM_PROMPT}
    ]

    logger.info("Voice session started for sub=%s", payload.get("sub", "?"))
    await websocket.send_json({"type": "session_ready"})

    try:
        while True:
            try:
                msg = await websocket.receive_json()
            except WebSocketDisconnect:
                break

            msg_type = msg.get("type", "")

            if msg_type == "end_session":
                break

            if msg_type == "interrupt":
                continue  # nothing in-flight to cancel with Chat Completions

            if msg_type == "audio_chunk":
                continue  # Realtime audio not supported on this tier

            if msg_type != "text":
                continue

            user_text = (msg.get("content") or "").strip()
            if not user_text:
                continue

            # Echo user message back for the transcript
            await websocket.send_json({
                "type": "transcript",
                "role": "user",
                "text": user_text,
            })

            messages.append({"role": "user", "content": user_text})

            try:
                reply = await _chat_with_tools(oai, messages, token, websocket)
            except Exception as exc:
                logger.exception("Chat Completions error: %s", exc)
                await websocket.send_json({
                    "type": "error",
                    "message": f"AI error: {exc}",
                })
                continue

            messages.append({"role": "assistant", "content": reply})

            await websocket.send_json({
                "type": "transcript",
                "role": "assistant",
                "text": reply,
            })

    except Exception as exc:
        logger.exception("Voice session error: %s", exc)
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
        logger.info("Voice session closed for sub=%s", payload.get("sub", "?"))
