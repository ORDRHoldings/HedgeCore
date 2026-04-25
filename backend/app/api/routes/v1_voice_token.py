"""
POST /v1/voice/token — Mint ephemeral OpenAI Realtime session token.

Browser calls this once, receives a short-lived client_secret,
then connects directly to wss://api.openai.com/v1/realtime.

Auth: JWT (get_current_user)
Env:  OPENAI_API_KEY_V (server-side only)
"""

import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.dependencies import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/voice", tags=["v1-voice"])

# ── System prompt ────────────────────────────────────────────────────────────

ORDR_INSTRUCTIONS = """\
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

Mutating tools (pin_pair) modify the user's saved data. The terminal will \
show a confirm/deny card before any mutation runs — explain to the user that \
they need to click Confirm. Never assume confirmation; never retry on denial.

Keep responses concise — 2-4 sentences unless detail is requested.\
"""

# ── Tool definitions (OpenAI function calling format) ────────────────────────

REALTIME_TOOLS: list[dict] = [
    {
        "type": "function",
        "name": "calculate_hedge",
        "description": (
            "Calculate FX hedge recommendation using the HedgeCore engine. "
            "Returns contracts needed, total cost, coverage %, margin, and run ID."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "pair": {"type": "string", "description": "Currency pair, e.g. USDMXN"},
                "exposure_amount": {"type": "number", "description": "Exposure amount in foreign currency"},
                "flow_type": {
                    "type": "string",
                    "enum": ["AP", "AR"],
                    "description": "AP = payable, AR = receivable",
                },
                "value_date": {"type": "string", "description": "ISO date, e.g. 2026-06-30"},
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
                "pair": {"type": "string", "description": "Currency pair, e.g. USDMXN"},
            },
            "required": ["pair"],
        },
    },
    {
        "type": "function",
        "name": "list_positions",
        "description": "List open FX positions and their hedge status.",
        "parameters": {
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
        "type": "function",
        "name": "get_portfolio_summary",
        "description": "Get portfolio KPIs: total exposure, coverage, pending proposals, alerts.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "type": "function",
        "name": "list_policies",
        "description": "List available hedge policy templates.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "type": "function",
        "name": "get_pending_approvals",
        "description": "List execution proposals awaiting 4-eyes approval.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "type": "function",
        "name": "pin_pair",
        "description": (
            "Add a currency pair (e.g. EURUSD, USDMXN) to the user's primary "
            "watchlist. MUTATING — the terminal will show a confirm/deny card "
            "to the user before this executes. Tell the user you've requested "
            "the pin and they must click Confirm in the panel."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "pair": {
                    "type": "string",
                    "description": "6-letter currency pair, uppercase (e.g. EURUSD, USDMXN).",
                },
            },
            "required": ["pair"],
        },
    },
]

# ── Response schema ──────────────────────────────────────────────────────────

class VoiceTokenResponse(BaseModel):
    token: str
    expires_at: str
    instructions: str
    tools: list[dict]

# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/token", response_model=VoiceTokenResponse, summary="Mint ephemeral OpenAI Realtime token")
async def create_voice_token(
    current_user: User = Depends(get_current_user),
):
    """
    Create a short-lived ephemeral token for OpenAI Realtime API.
    Browser uses this to connect directly to wss://api.openai.com/v1/realtime.
    """
    api_key = os.environ.get("OPENAI_API_KEY_V", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Voice assistant unavailable — OPENAI_API_KEY_V not configured")

    model = os.environ.get("VOICE_OPENAI_MODEL", "gpt-realtime")

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
            resp = await client.post(
                "https://api.openai.com/v1/realtime/client_secrets",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "session": {
                        "type": "realtime",
                        "model": model,
                        "audio": {
                            "output": {"voice": "alloy"},
                        },
                    },
                },
            )

        if resp.status_code != 200:
            logger.error("OpenAI session creation failed: %s %s", resp.status_code, resp.text[:300])
            raise HTTPException(status_code=502, detail="Failed to create voice session")

        data = resp.json()
        # Response shape: { value: "ek_...", expires_at: 1234567890 }
        # or nested: { client_secret: { value: "...", expires_at: ... } }
        token_value = data.get("value", "") or data.get("client_secret", {}).get("value", "")
        expires_at = data.get("expires_at", "") or data.get("client_secret", {}).get("expires_at", "")

        if not token_value:
            logger.error("OpenAI session response missing client_secret.value: %s", data)
            raise HTTPException(status_code=502, detail="Invalid voice session response")

        logger.info("Voice token minted for user=%s model=%s", current_user.id, model)
        return VoiceTokenResponse(
            token=token_value,
            expires_at=str(expires_at),
            instructions=ORDR_INSTRUCTIONS,
            tools=REALTIME_TOOLS,
        )

    except httpx.HTTPError as exc:
        logger.exception("OpenAI session request failed: %s", exc)
        raise HTTPException(status_code=502, detail="Voice service connection failed") from exc
