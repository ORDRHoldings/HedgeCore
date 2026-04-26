"""
OAuth state store — CSRF protection for the authorize → callback dance.

Primary path: Redis with 10-minute TTL.
Fallback: signed JWT (HS256 with app secret) when Redis is unavailable.

The state token encodes {tenant_id, provider, nonce, issued_at} and is
verified on callback to prevent cross-tenant injection attacks.
"""
from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import jwt

from app.connectors.errors import ConnectorAuthError
from app.core.config import settings

_STATE_TTL_SEC = 600  # 10 minutes
_REDIS_PREFIX = "connector:oauth_state:"


@dataclass(frozen=True)
class StateToken:
    tenant_id: UUID
    provider: str
    nonce: str
    issued_at: int


# ═════════════════════════════════════════════════════════════════════════════
# Redis client (optional)
# ═════════════════════════════════════════════════════════════════════════════


async def _redis():
    """Return async Redis client or None. Cached at module scope via lazy import."""
    if not settings.REDIS_URL:
        return None
    try:
        import redis.asyncio as aioredis  # type: ignore[import]
    except ImportError:
        return None
    try:
        return aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception:
        return None


# ═════════════════════════════════════════════════════════════════════════════
# Public API
# ═════════════════════════════════════════════════════════════════════════════


async def issue(tenant_id: UUID, provider: str) -> str:
    """Create a state token and persist it. Returns the token string to include in authorize URL."""
    nonce = secrets.token_urlsafe(32)
    issued_at = int(time.time())

    payload = {
        "tenant_id": str(tenant_id),
        "provider": provider,
        "nonce": nonce,
        "iat": issued_at,
        "exp": issued_at + _STATE_TTL_SEC,
    }

    # JWT token works offline; Redis is just an extra guard against replay.
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

    r = await _redis()
    if r is not None:
        try:
            await r.setex(_REDIS_PREFIX + nonce, _STATE_TTL_SEC, "1")
        except Exception:
            # Fail-open to JWT-only when Redis is down (security is preserved by JWT signature).
            pass

    return token


async def verify_and_consume(state_token: str) -> StateToken:
    """Verify signature + expiry + (if available) replay guard. Consume on success."""
    try:
        payload: dict[str, Any] = jwt.decode(state_token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise ConnectorAuthError("OAuth state token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise ConnectorAuthError("OAuth state token invalid") from exc

    tenant_id_raw = payload.get("tenant_id")
    provider = payload.get("provider")
    nonce = payload.get("nonce")
    issued_at = payload.get("iat")

    if not (tenant_id_raw and provider and nonce and issued_at):
        raise ConnectorAuthError("OAuth state payload malformed")

    tenant_id = UUID(tenant_id_raw)

    # Replay guard
    r = await _redis()
    if r is not None:
        try:
            key = _REDIS_PREFIX + nonce
            deleted = await r.delete(key)
            # If key did not exist, the token was already consumed → replay attempt.
            if deleted == 0:
                raise ConnectorAuthError("OAuth state already consumed (replay attempt)")
        except ConnectorAuthError:
            raise
        except Exception:
            # Redis outage — fall back to JWT-only (nonce expiry enforced by JWT exp)
            pass

    return StateToken(
        tenant_id=tenant_id,
        provider=provider,
        nonce=nonce,
        issued_at=int(issued_at),
    )
