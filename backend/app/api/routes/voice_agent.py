"""
/v1/voice/realtime — WebSocket chat powered by Anthropic Claude + tool calling.

Uses the Anthropic Messages API (claude-sonnet-4-6) via httpx.
ANTHROPIC_API_KEY must be set in the environment.

Auth:
  WebSocket query param: ?token=<JWT>  (browser WS cannot send custom headers)

Message types (browser → backend):
  {"type": "text", "content": "..."}
  {"type": "end_session"}
  {"type": "audio_chunk", ...}   -- accepted, ignored (no Realtime tier)
  {"type": "interrupt"}          -- accepted, ignored

Message types (backend → browser):
  {"type": "transcript",    "role": "user"|"assistant", "text": "..."}
  {"type": "function_call", "name": "...", "status": "calling"|"done"}
  {"type": "session_ready"}
  {"type": "error",         "message": "..."}
"""

import json
import logging
import os

import httpx
import jwt as pyjwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/voice", tags=["v1-voice"])

# ── Config ────────────────────────────────────────────────────────────────────

_ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
_ANTHROPIC_VERSION = "2023-06-01"
# Use VOICE_CLAUDE_MODEL env var to override (e.g. claude-sonnet-4-6 when on a newer tier)
_MODEL = os.environ.get("VOICE_CLAUDE_MODEL", "claude-3-5-sonnet-20241022")

# Internal HedgeCore base — uses PORT env var (Render sets this; default 8000 locally)
_PORT = os.environ.get("PORT", "8000")
_INTERNAL_BASE = f"http://127.0.0.1:{_PORT}/api"

# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are ORDR — the AI assistant embedded in ORDR Terminal, an institutional FX \
treasury management platform.

Personality: Calm, precise, authoritative. Like a senior FX trader. Be direct \
with numbers. Never guess — call the HedgeCore API for all data.

When asked about FX rates, positions, hedges, or portfolio data:
1. Call the appropriate tool to get live data.
2. Present the result clearly with exact numbers from the API.

When asked to calculate a hedge:
1. Confirm: currency pair, amount, direction (payable AP / receivable AR), value date.
2. Call calculate_hedge with those parameters.
3. Report: contracts, cost, coverage %, margin, run ID.

Keep responses concise — 2-4 sentences unless detail is requested.
"""

# ── Anthropic tool definitions ────────────────────────────────────────────────

_TOOLS: list[dict] = [
    {
        "name": "calculate_hedge",
        "description": (
            "Calculate FX hedge recommendation using the HedgeCore engine. "
            "Returns contracts needed, total cost, coverage %, margin, and run ID."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "pair":            {"type": "string",  "description": "Currency pair, e.g. USDMXN"},
                "exposure_amount": {"type": "number",  "description": "Exposure amount in foreign currency"},
                "flow_type":       {"type": "string",  "enum": ["AP", "AR"],
                                    "description": "AP = payable, AR = receivable"},
                "value_date":      {"type": "string",  "description": "ISO date, e.g. 2026-06-30"},
            },
            "required": ["pair", "exposure_amount", "flow_type"],
        },
    },
    {
        "name": "get_spot_rate",
        "description": "Get the current spot FX rate for a currency pair.",
        "input_schema": {
            "type": "object",
            "properties": {
                "pair": {"type": "string", "description": "Currency pair, e.g. USDMXN"},
            },
            "required": ["pair"],
        },
    },
    {
        "name": "list_positions",
        "description": "List open FX positions and their hedge status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status_filter": {
                    "type": "string",
                    "enum": ["ALL", "NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED"],
                },
            },
        },
    },
    {
        "name": "get_portfolio_summary",
        "description": "Get portfolio KPIs: total exposure, coverage, pending proposals, alerts.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "list_policies",
        "description": "List available hedge policy templates.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_pending_approvals",
        "description": "List execution proposals awaiting 4-eyes approval.",
        "input_schema": {"type": "object", "properties": {}},
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

    async with httpx.AsyncClient(base_url=_INTERNAL_BASE, headers=headers, timeout=timeout) as c:

        if name == "calculate_hedge":
            pair = args.get("pair", "USDMXN")
            amount = float(args.get("exposure_amount", 0))
            flow_type = args.get("flow_type", "AP")
            value_date = args.get("value_date", "2026-12-31")
            # Foreign currency is the non-USD leg of the pair
            if pair.endswith("USD"):
                currency = pair[:3]
            elif pair.startswith("USD"):
                currency = pair[3:]
            else:
                currency = pair[:3]  # e.g. EURMXN → EUR

            # Fetch live spot rates instead of using a hardcoded fallback
            market: dict = {}
            try:
                rates_r = await c.get("/v1/market/fx/rates")
                if rates_r.status_code == 200:
                    rates_data = rates_r.json().get("rates", [])
                    market = {
                        r["symbol"]: r["mid"]
                        for r in rates_data
                        if "symbol" in r and "mid" in r
                    }
            except Exception:
                pass
            # Ensure the requested pair is present. Do not calculate with a
            # guessed/stale rate; voice output can be actioned by users.
            if pair not in market:
                logger.warning("Voice calculate_hedge: live rate for %s unavailable; failing closed", pair)
                return {
                    "error": "market_rate_unavailable",
                    "detail": f"Live market rate for {pair} is unavailable. Hedge calculation was not run.",
                }

            payload = {
                "trades": [{
                    "record_id": "VOICE-001", "entity": "Voice Request",
                    "flow_type": flow_type, "currency": currency,
                    "amount": amount, "value_date": value_date, "status": "CONFIRMED",
                }],
                "market": market,
                "policy_instance_id": None,
            }
            try:
                r = await c.post("/v1/calculate", json=payload)
                return r.json() if r.status_code == 200 else {"error": f"HTTP {r.status_code}", "detail": r.text[:200]}
            except Exception as exc:
                return {"error": str(exc)}

        elif name == "get_spot_rate":
            pair = args.get("pair", "USDMXN")
            try:
                r = await c.get("/v1/market/fx/rates")
                if r.status_code == 200:
                    rates = r.json().get("rates", [])
                    m = next((x for x in rates if x.get("symbol") == pair), None)
                    return {"pair": pair, "mid": m["mid"], "bid": m["bid"], "ask": m["ask"]} if m else {"error": f"{pair} not found"}
                return {"error": f"HTTP {r.status_code}"}
            except Exception as exc:
                return {"error": str(exc)}

        elif name == "list_positions":
            sf = args.get("status_filter", "ALL")
            try:
                params = {} if sf == "ALL" else {"execution_status": sf}
                r = await c.get("/v1/positions", params=params)
                if r.status_code == 200:
                    data = r.json()
                    # GET /v1/positions returns {"items": [...], "total": N}
                    positions = data if isinstance(data, list) else data.get("items", data.get("positions", []))
                    return {"count": len(positions), "positions": [
                        {"id": p.get("id", "")[:8], "entity": p.get("entity", "—"),
                         "currency": p.get("currency", "—"), "amount": p.get("amount", 0),
                         "status": p.get("execution_status", "—")}
                        for p in positions[:10]
                    ]}
                return {"error": f"HTTP {r.status_code}"}
            except Exception as exc:
                return {"error": str(exc)}

        elif name == "get_portfolio_summary":
            try:
                r = await c.get("/v1/dashboard/summary")
                return r.json() if r.status_code == 200 else {"error": f"HTTP {r.status_code}"}
            except Exception as exc:
                return {"error": str(exc)}

        elif name == "list_policies":
            try:
                r = await c.get("/v1/policies/templates")
                if r.status_code == 200:
                    data = r.json()
                    templates = data if isinstance(data, list) else data.get("templates", [])
                    return {"count": len(templates), "policies": [
                        {"id": t.get("id", "")[:8], "name": t.get("name", "—"),
                         "short_name": t.get("short_name", "—")}
                        for t in templates[:10]
                    ]}
                return {"error": f"HTTP {r.status_code}"}
            except Exception as exc:
                return {"error": str(exc)}

        elif name == "get_pending_approvals":
            try:
                r = await c.get("/v1/proposals?status=PROPOSED&limit=10")
                if r.status_code == 200:
                    data = r.json()
                    proposals = data if isinstance(data, list) else data.get("proposals", [])
                    return {"count": len(proposals), "proposals": [
                        {"id": p.get("id", "")[:8], "ref": p.get("execution_ref", "—"),
                         "status": p.get("status", "—")}
                        for p in proposals[:10]
                    ]}
                return {"error": f"HTTP {r.status_code}"}
            except Exception as exc:
                return {"error": str(exc)}

    return {"error": f"Unknown function: {name}"}
# ── Anthropic Messages API call with tool loop ────────────────────────────────

async def _chat_with_tools(
    anthropic_key: str,
    messages: list[dict],
    token: str,
    ws: WebSocket,
) -> str:
    """
    Call Claude via Anthropic Messages API, handle tool use, return final reply.
    """
    headers = {
        "x-api-key": anthropic_key,
        "anthropic-version": _ANTHROPIC_VERSION,
        "content-type": "application/json",
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
        for _round in range(6):
            body = {
                "model": _MODEL,
                "max_tokens": 1024,
                "system": _SYSTEM_PROMPT,
                "tools": _TOOLS,
                "messages": messages,
            }

            resp = await client.post(_ANTHROPIC_API_URL, headers=headers, json=body)

            if resp.status_code != 200:
                error_text = resp.text[:400]
                logger.error("Anthropic API error %s: %s", resp.status_code, error_text)
                # Extract human-readable message from Anthropic error JSON
                try:
                    err_json = resp.json()
                    detail = err_json.get("error", {}).get("message", error_text)
                except Exception:
                    detail = error_text
                return f"API error {resp.status_code}: {detail[:200]}"

            data = resp.json()
            stop_reason = data.get("stop_reason", "")
            content_blocks = data.get("content", [])

            if stop_reason == "tool_use":
                # Append assistant's tool-use message
                messages.append({"role": "assistant", "content": content_blocks})

                # Execute all tool calls, collect results
                tool_results = []
                for block in content_blocks:
                    if block.get("type") != "tool_use":
                        continue
                    fn_name = block["name"]
                    fn_args = block.get("input", {})
                    tool_id = block["id"]

                    await ws.send_json({"type": "function_call", "name": fn_name, "status": "calling"})
                    result = await _call_hedgecore(fn_name, fn_args, token)
                    await ws.send_json({"type": "function_call", "name": fn_name, "status": "done"})

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": json.dumps(result),
                    })

                # Append tool results as a user message (Anthropic format)
                messages.append({"role": "user", "content": tool_results})
                # Loop for follow-up response

            else:
                # end_turn or max_tokens — extract text
                text_parts = [
                    b.get("text", "")
                    for b in content_blocks
                    if b.get("type") == "text"
                ]
                return " ".join(text_parts).strip() or "Ready to assist with FX hedging."

    return "I couldn't complete that request. Please try again."
# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/realtime")
async def voice_realtime(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
):
    """
    WebSocket chat: browser ↔ Claude (Anthropic Messages API) + HedgeCore tools.
    Connect: ws[s]://<host>/api/v1/voice/realtime?token=<JWT>
    """
    await websocket.accept()

    payload = _validate_token(token)
    if not payload:
        await websocket.send_json({"type": "error", "message": "Unauthorized — invalid token"})
        await websocket.close(code=1000)
        return

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not anthropic_key:
        await websocket.send_json({
            "type": "error",
            "message": "Voice assistant unavailable — ANTHROPIC_API_KEY not configured",
        })
        await websocket.close(code=1000)
        return

    messages: list[dict] = []
    logger.info("Voice session started for sub=%s model=%s", payload.get("sub", "?"), _MODEL)
    await websocket.send_json({"type": "session_ready"})

    try:
        while True:
            try:
                msg = await websocket.receive_json()
            except WebSocketDisconnect:
                break

            msg_type = msg.get("type", "")

            if msg_type in ("end_session", "interrupt", "audio_chunk"):
                if msg_type == "end_session":
                    break
                continue

            if msg_type != "text":
                continue

            user_text = (msg.get("content") or "").strip()
            if not user_text:
                continue

            # Echo user message to transcript
            await websocket.send_json({"type": "transcript", "role": "user", "text": user_text})

            messages.append({"role": "user", "content": user_text})

            try:
                reply = await _chat_with_tools(anthropic_key, messages, token, websocket)
            except Exception as exc:
                logger.exception("Chat error: %s", exc)
                await websocket.send_json({"type": "error", "message": f"AI error: {exc}"})
                continue

            # If _chat_with_tools returned an error string, surface it as error type
            if reply.startswith("API error") or reply.startswith("I couldn't"):
                await websocket.send_json({"type": "error", "message": reply})
                continue

            messages.append({"role": "assistant", "content": reply})

            await websocket.send_json({"type": "transcript", "role": "assistant", "text": reply})

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
