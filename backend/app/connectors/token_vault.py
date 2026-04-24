"""
Fernet-encrypted token vault.

Tokens (OAuth access + refresh, session IDs, realm refs) are stored encrypted
inside company.settings JSONB under key `connector_tokens.<provider_id>`.

Design:
- Fernet (AES-128-CBC + HMAC-SHA256, symmetric) via `cryptography` library.
- MultiFernet used so keys can be rotated without downtime: the leftmost key
  is always used for encryption; all keys are tried in order for decryption.
  Rotate by: 1) prepend new key, 2) re-encrypt all rows, 3) remove old key.
- Key(s) supplied via CONNECTOR_ENCRYPTION_KEY env. Multiple keys comma-separated.
- Storage shape:
    company.settings = {
        ...,
        "connector_tokens": {
            "quickbooks": {
                "ciphertext": "<base64-urlsafe fernet token>",
                "realm_id": "9341452...",            # not encrypted, needed for routing
                "expires_at": "2026-04-23T12:00:00Z", # not encrypted, cheap scheduler check
                "updated_at": "2026-04-22T08:00:00Z",
            },
            "xero": { ... },
        },
        "connector_state": {
            "quickbooks": {
                "paper_mode": false,
                "last_sync_at": "2026-04-22T12:00:00Z",
                "last_error": null,
                "circuit_open_until": null,
            }
        }
    }

Plaintext is a JSON blob: { "access_token", "refresh_token", "scope", "raw" }.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.connectors.base import TokenBundle
from app.connectors.errors import ConnectorAuthError, ConnectorNotConfiguredError
from app.core.config import settings
from app.models.organization import Company


# ═════════════════════════════════════════════════════════════════════════════
# Key resolution + Fernet factory
# ═════════════════════════════════════════════════════════════════════════════

_fernet_cache: MultiFernet | None = None


def _get_fernet() -> MultiFernet:
    """Lazy-build MultiFernet from CONNECTOR_ENCRYPTION_KEY (comma-separated for rotation)."""
    global _fernet_cache
    if _fernet_cache is not None:
        return _fernet_cache

    raw = settings.CONNECTOR_ENCRYPTION_KEY.strip()
    if not raw:
        raise ConnectorAuthError(
            "CONNECTOR_ENCRYPTION_KEY not configured. Generate with: "
            "python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
        )

    keys = [k.strip() for k in raw.split(",") if k.strip()]
    try:
        fernets = [Fernet(k.encode()) for k in keys]
    except Exception as exc:
        raise ConnectorAuthError(f"Invalid CONNECTOR_ENCRYPTION_KEY format: {exc}") from exc

    _fernet_cache = MultiFernet(fernets)
    return _fernet_cache


def reset_fernet_cache() -> None:
    """Test hook — forces rebuild on next call."""
    global _fernet_cache
    _fernet_cache = None


# ═════════════════════════════════════════════════════════════════════════════
# Encryption helpers
# ═════════════════════════════════════════════════════════════════════════════


def encrypt(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(ciphertext: str) -> str:
    try:
        return _get_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ConnectorAuthError("Token decryption failed (key rotated or corrupted)") from exc


# ═════════════════════════════════════════════════════════════════════════════
# Company settings helpers (SQLAlchemy)
# ═════════════════════════════════════════════════════════════════════════════


async def _load_company_settings(session: AsyncSession, tenant_id: UUID) -> dict[str, Any]:
    stmt = select(Company.settings).where(Company.id == tenant_id)
    row = (await session.execute(stmt)).scalar_one_or_none()
    return dict(row) if row else {}


async def _save_company_settings(session: AsyncSession, tenant_id: UUID, new_settings: dict[str, Any]) -> None:
    stmt = update(Company).where(Company.id == tenant_id).values(settings=new_settings)
    await session.execute(stmt)
    await session.flush()


# ═════════════════════════════════════════════════════════════════════════════
# Public API
# ═════════════════════════════════════════════════════════════════════════════


async def store_tokens(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    provider: str,
    bundle: TokenBundle,
) -> None:
    """Encrypt and persist token bundle for a tenant+provider."""
    plaintext = json.dumps(
        {
            "access_token": bundle.access_token,
            "refresh_token": bundle.refresh_token,
            "scope": bundle.scope,
            "raw": bundle.raw,
        }
    )
    ciphertext = encrypt(plaintext)

    company_settings = await _load_company_settings(session, tenant_id)
    tokens = company_settings.setdefault("connector_tokens", {})
    tokens[provider] = {
        "ciphertext": ciphertext,
        "realm_id": bundle.realm_id,
        "expires_at": bundle.expires_at.isoformat() if bundle.expires_at else None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await _save_company_settings(session, tenant_id, company_settings)


async def load_tokens(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    provider: str,
) -> TokenBundle:
    """Decrypt and return token bundle. Raises ConnectorNotConfiguredError if absent."""
    company_settings = await _load_company_settings(session, tenant_id)
    entry = (company_settings.get("connector_tokens") or {}).get(provider)
    if not entry:
        raise ConnectorNotConfiguredError(
            f"No credentials stored for provider {provider!r}", provider=provider
        )

    plaintext = decrypt(entry["ciphertext"])
    payload = json.loads(plaintext)

    expires_raw = entry.get("expires_at")
    expires_at = datetime.fromisoformat(expires_raw) if expires_raw else None

    return TokenBundle(
        access_token=payload["access_token"],
        refresh_token=payload.get("refresh_token"),
        expires_at=expires_at,
        realm_id=entry.get("realm_id"),
        scope=payload.get("scope"),
        raw=payload.get("raw") or {},
    )


async def wipe_tokens(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    provider: str,
) -> None:
    """Remove stored tokens + state for a provider. Used on revoke/disconnect."""
    company_settings = await _load_company_settings(session, tenant_id)
    tokens = company_settings.get("connector_tokens") or {}
    state = company_settings.get("connector_state") or {}
    tokens.pop(provider, None)
    state.pop(provider, None)
    company_settings["connector_tokens"] = tokens
    company_settings["connector_state"] = state
    await _save_company_settings(session, tenant_id, company_settings)


async def get_state(
    session: AsyncSession, *, tenant_id: UUID, provider: str
) -> dict[str, Any]:
    company_settings = await _load_company_settings(session, tenant_id)
    return (company_settings.get("connector_state") or {}).get(provider) or {}


async def update_state(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    provider: str,
    **patch: Any,
) -> None:
    company_settings = await _load_company_settings(session, tenant_id)
    state = company_settings.setdefault("connector_state", {})
    provider_state = state.setdefault(provider, {})
    provider_state.update(patch)
    provider_state["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _save_company_settings(session, tenant_id, company_settings)
