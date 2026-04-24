"""
Normalized connector error hierarchy.

Every provider adapter raises these (never provider-native exceptions).
Routes map them to HTTP status in a single switch — consistent API contract
regardless of which ERP is behind the request.
"""
from __future__ import annotations


class ConnectorError(Exception):
    """Base class. Everything connector-related inherits from this."""

    http_status: int = 500

    def __init__(self, message: str, *, provider: str | None = None, detail: object | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.provider = provider
        self.detail = detail

    def to_dict(self) -> dict:
        return {
            "error": self.__class__.__name__,
            "message": self.message,
            "provider": self.provider,
            "detail": self.detail,
        }


class ConnectorNotConfiguredError(ConnectorError):
    """Provider exists but tenant has no credentials stored. Return 409."""

    http_status = 409


class ConnectorAuthError(ConnectorError):
    """OAuth exchange / refresh / revocation failed. Return 401."""

    http_status = 401


class ConnectorValidationError(ConnectorError):
    """Payload rejected by provider (bad account ref, unbalanced journal, etc.). Return 422."""

    http_status = 422


class ConnectorRateLimitError(ConnectorError):
    """Provider returned 429. Caller should back off or queue. Return 429."""

    http_status = 429

    def __init__(self, message: str, *, retry_after_sec: float | None = None, **kwargs) -> None:
        super().__init__(message, **kwargs)
        self.retry_after_sec = retry_after_sec


class ConnectorServerError(ConnectorError):
    """Provider returned 5xx. Circuit breaker will trip after N consecutive. Return 502."""

    http_status = 502


class ConnectorCircuitOpenError(ConnectorError):
    """Circuit breaker is open — reject fast without hitting provider. Return 503."""

    http_status = 503

    def __init__(self, message: str, *, cooldown_remaining_sec: float | None = None, **kwargs) -> None:
        super().__init__(message, **kwargs)
        self.cooldown_remaining_sec = cooldown_remaining_sec


class ConnectorWebhookError(ConnectorError):
    """Webhook signature/skew verification failed. Return 400."""

    http_status = 400
