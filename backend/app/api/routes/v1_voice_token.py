"""
POST /v1/voice/token — Mint ephemeral OpenAI Realtime session token.

Browser calls this once, receives a short-lived client_secret,
then connects directly to wss://api.openai.com/v1/realtime.

Auth: JWT (get_current_user)
Env:  OPENAI_API_KEY_V (server-side only)
"""

import hashlib
import json
import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

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

Mutating tools (pin_pair, unpin_pair) modify the user's saved data. The \
terminal will show a confirm/deny card before any mutation runs — explain to \
the user that they need to click Confirm. Never assume confirmation; never \
retry on denial.

Keep responses concise — 2-4 sentences unless detail is requested.\
"""

# ── i18n ─────────────────────────────────────────────────────────────────────
# Allowlisted languages for institutional FX desks. Anything else falls back to
# English. The model's audio output is generally locale-aware, but the prompt
# directive removes the ambiguity for code-switched or accented inputs.
# Keys are BCP-47 short codes (lowercased, primary subtag only).
_LANGUAGE_DIRECTIVES: dict[str, str] = {
    "en": "Respond in English.",
    "es": "Responde en español. Mantén la terminología técnica de FX en inglés cuando sea idiomática (e.g. 'spot', 'forward', 'NDF').",
    "fr": "Réponds en français. Conserve la terminologie technique FX en anglais quand elle est idiomatique (e.g. 'spot', 'forward', 'NDF').",
    "de": "Antworte auf Deutsch. Behalte FX-Fachterminologie auf Englisch bei, wenn sie idiomatisch ist (z. B. 'spot', 'forward', 'NDF').",
    "ja": "日本語で応答してください。FXの専門用語（spot, forward, NDFなど）は英語のままで構いません。",
    "zh": "请用中文回答。FX专业术语（如 spot、forward、NDF）保留英文即可。",
}
SUPPORTED_LANGUAGES = frozenset(_LANGUAGE_DIRECTIVES.keys())


def _normalize_language(raw: str | None) -> str:
    """Reduce a BCP-47 tag (e.g. 'en-US', 'ZH-Hant') to an allowlisted short code, defaulting to 'en'."""
    if not raw:
        return "en"
    primary = raw.strip().lower().split("-", 1)[0]
    return primary if primary in SUPPORTED_LANGUAGES else "en"


def _instructions_for(language: str) -> str:
    directive = _LANGUAGE_DIRECTIVES.get(language, _LANGUAGE_DIRECTIVES["en"])
    return f"{ORDR_INSTRUCTIONS}\n\nLanguage: {directive}"

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
    {
        "type": "function",
        "name": "unpin_pair",
        "description": (
            "Remove a currency pair from the user's primary watchlist. "
            "MUTATING — the terminal will show a confirm/deny card to the user "
            "before this executes. Tell the user you've requested the unpin "
            "and they must click Confirm in the panel."
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
    {
        "type": "function",
        "name": "get_recent_runs",
        "description": (
            "List the most recent hedge calculation runs for the user's company. "
            "Returns run IDs, trade/hedge counts, and timestamps. Useful for "
            "audit trail review and recall of recent decisions."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 20,
                    "description": "How many recent runs to return (default 5, max 20).",
                },
            },
        },
    },
    {
        "type": "function",
        "name": "recall_recent_sessions",
        "description": (
            "Recall the user's recent voice sessions to provide continuity across "
            "conversations. Returns a compact summary per session (last user turn, "
            "last assistant turn, tool/turn counts, timestamps). Use when the user "
            "references a prior conversation ('what did we discuss yesterday?', "
            "'continue from where we left off') or before suggesting a topic so you "
            "don't repeat what was just covered. Tenant-scoped — only the caller's "
            "own sessions are returned."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 5,
                    "description": "How many recent sessions to return (default 3, max 5).",
                },
            },
        },
    },
]

# ── Provenance manifest (computed at boot — proves what code was running) ────

def _sha256_short(payload: str) -> str:
    """16-hex-char prefix of SHA-256 — collision-resistant for audit purposes."""
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


INSTRUCTIONS_SHA256 = _sha256_short(ORDR_INSTRUCTIONS)
TOOLS_SHA256 = _sha256_short(json.dumps(REALTIME_TOOLS, sort_keys=True))

# ── Request / Response schemas ───────────────────────────────────────────────

class VoiceTokenRequest(BaseModel):
    # BCP-47 tag like "en", "en-US", "es-MX". Empty / unknown → English.
    language: str | None = Field(default=None, max_length=16)


class VoiceTokenResponse(BaseModel):
    token: str
    expires_at: str
    instructions: str
    tools: list[dict]
    # Provenance manifest — frontend echoes these into the audit chain so
    # auditors can replay the exact model + prompt + tools active for the session.
    model_id: str
    instructions_sha256: str
    tools_sha256: str
    language: str

# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/token", response_model=VoiceTokenResponse, summary="Mint ephemeral OpenAI Realtime token")
async def create_voice_token(
    body: VoiceTokenRequest | None = None,
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
    language = _normalize_language(body.language if body else None)
    instructions = _instructions_for(language)
    instructions_hash = _sha256_short(instructions)

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

        logger.info(
            "Voice token minted for user=%s model=%s lang=%s instr=%s tools=%s",
            current_user.id, model, language, instructions_hash, TOOLS_SHA256,
        )
        return VoiceTokenResponse(
            token=token_value,
            expires_at=str(expires_at),
            instructions=instructions,
            tools=REALTIME_TOOLS,
            model_id=model,
            instructions_sha256=instructions_hash,
            tools_sha256=TOOLS_SHA256,
            language=language,
        )

    except httpx.HTTPError as exc:
        logger.exception("OpenAI session request failed: %s", exc)
        raise HTTPException(status_code=502, detail="Voice service connection failed") from exc
