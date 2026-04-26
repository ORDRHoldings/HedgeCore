"""
app.connectors — ERP / Accounting live integrations.

Provider-agnostic adapter layer: every connector implements ConnectorProtocol.
Core treasury services (gl_posting_service, erp_connector_service) stay
provider-ignorant and call through registry.get_connector(provider_id).

Architecture:
    base.py         — ConnectorProtocol, types, normalized payloads
    errors.py       — ConnectorError hierarchy
    oauth_state.py  — CSRF-safe OAuth state store (Redis + signed-JWT fallback)
    token_vault.py  — Fernet-encrypted token storage (company.settings JSONB)
    rate_limiter.py — Per-tenant+provider TokenBucket
    retry.py        — Exponential backoff + circuit breaker
    registry.py     — provider_id → connector class dispatch

Providers (one package each):
    quickbooks/, xero/, netsuite/, sage_intacct/, dynamics365/
"""

from app.connectors.base import (
    COAAccount,
    ConnectorHealth,
    ConnectorProtocol,
    ConnectorStatus,
    JournalLine,
    JournalPayload,
    PostJournalResult,
    TokenBundle,
    TrialBalanceEntry,
)
from app.connectors.errors import (
    ConnectorAuthError,
    ConnectorCircuitOpenError,
    ConnectorError,
    ConnectorNotConfiguredError,
    ConnectorRateLimitError,
    ConnectorServerError,
    ConnectorValidationError,
)
from app.connectors.registry import get_connector, list_providers, provider_ids

__all__ = [
    "ConnectorProtocol",
    "ConnectorHealth",
    "ConnectorStatus",
    "JournalPayload",
    "JournalLine",
    "COAAccount",
    "TrialBalanceEntry",
    "PostJournalResult",
    "TokenBundle",
    "ConnectorError",
    "ConnectorAuthError",
    "ConnectorRateLimitError",
    "ConnectorNotConfiguredError",
    "ConnectorServerError",
    "ConnectorValidationError",
    "ConnectorCircuitOpenError",
    "get_connector",
    "list_providers",
    "provider_ids",
]
