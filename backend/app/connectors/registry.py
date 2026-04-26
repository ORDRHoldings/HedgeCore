"""
Connector registry — provider_id → connector class dispatch.

Single source of truth. Routes and scheduler consume `get_connector(provider_id)`
and never import provider modules directly. Swapping a QBO adapter for a mock
in tests is a single entry change here.

Lazy import: provider modules are imported only on first access, so unit tests
for the base contract do not require every provider's SDK to be installed.
"""
from __future__ import annotations

from collections.abc import Iterable
from importlib import import_module

from app.connectors.base import ConnectorProtocol
from app.connectors.errors import ConnectorNotConfiguredError

# ═════════════════════════════════════════════════════════════════════════════
# Provider catalogue
# ═════════════════════════════════════════════════════════════════════════════


# provider_id → (module path, class name, display name, auth style)
_PROVIDERS: dict[str, dict[str, str]] = {
    "quickbooks": {
        "module": "app.connectors.quickbooks.connector",
        "class": "QuickBooksConnector",
        "display_name": "QuickBooks Online",
        "auth_style": "oauth2",
    },
    "xero": {
        "module": "app.connectors.xero.connector",
        "class": "XeroConnector",
        "display_name": "Xero",
        "auth_style": "oauth2_pkce",
    },
    "netsuite": {
        "module": "app.connectors.netsuite.connector",
        "class": "NetSuiteConnector",
        "display_name": "Oracle NetSuite",
        "auth_style": "tba_oauth1",  # Token-Based Auth
    },
    "sage_intacct": {
        "module": "app.connectors.sage_intacct.connector",
        "class": "SageIntacctConnector",
        "display_name": "Sage Intacct",
        "auth_style": "session_xml",
    },
    "dynamics365": {
        "module": "app.connectors.dynamics365.connector",
        "class": "Dynamics365Connector",
        "display_name": "Microsoft Dynamics 365 Finance",
        "auth_style": "oauth2",
    },
}


_instance_cache: dict[str, ConnectorProtocol] = {}


# ═════════════════════════════════════════════════════════════════════════════
# Public API
# ═════════════════════════════════════════════════════════════════════════════


def list_providers() -> list[dict[str, str]]:
    """Return metadata for all registered providers (used by GET /v1/connectors)."""
    return [
        {"provider_id": pid, **{k: v for k, v in meta.items() if k not in {"module", "class"}}}
        for pid, meta in _PROVIDERS.items()
    ]


def provider_ids() -> Iterable[str]:
    return _PROVIDERS.keys()


def get_connector(provider_id: str) -> ConnectorProtocol:
    """Return a connector instance for the provider. Cached per process.

    Raises ConnectorNotConfiguredError for unknown provider_id.
    """
    if provider_id in _instance_cache:
        return _instance_cache[provider_id]

    meta = _PROVIDERS.get(provider_id)
    if meta is None:
        raise ConnectorNotConfiguredError(
            f"Unknown provider {provider_id!r}. Registered: {list(_PROVIDERS)}",
            provider=provider_id,
        )

    module = import_module(meta["module"])
    connector_cls = getattr(module, meta["class"])
    instance = connector_cls()
    _instance_cache[provider_id] = instance
    return instance


def reset_cache() -> None:
    """Test hook — clears the instance cache so providers re-import fresh."""
    _instance_cache.clear()
