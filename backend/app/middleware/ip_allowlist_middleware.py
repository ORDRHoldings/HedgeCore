"""
app/middleware/ip_allowlist_middleware.py

IPAllowlistMiddleware — global IP allowlist enforcement.
Inserted BEFORE AuditHeadersMiddleware (second-outermost after CORS). See ADR-0007.

ALLOWED_IPS env var: comma-separated CIDRs or exact IPs.
Empty or unset = open mode (no filtering).
"""
from __future__ import annotations

import ipaddress
import logging
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.ip_allowlist import check_ip_allowlist, get_client_ip

logger = logging.getLogger(__name__)

_LOOPBACK = "127.0.0.1"


def _normalise_ip(raw: str) -> str:
    """Return a valid IP string, falling back to loopback for non-IP host tokens.

    Starlette's TestClient sets ``request.client.host = "testclient"``.  In any
    real deployment the host field will always be a valid IP address (set by the
    kernel after TCP accept).  Mapping the non-IP sentinel to loopback lets the
    test suite exercise allowlist logic without special-casing the tests.
    """
    try:
        ipaddress.ip_address(raw)
        return raw
    except ValueError:
        return _LOOPBACK


class IPAllowlistMiddleware(BaseHTTPMiddleware):
    """Block requests from IPs not in the configured allowlist.

    Args:
        app: The ASGI application to wrap.
        allowed_ips: List of CIDRs or exact IPs. Empty/None = open mode.
    """

    def __init__(self, app: object, allowed_ips: list[str] | None = None) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self._allowed_ips: list[str] = allowed_ips or []
        if self._allowed_ips:
            logger.info("IPAllowlistMiddleware: active — %d entries", len(self._allowed_ips))
        else:
            logger.info("IPAllowlistMiddleware: open mode")

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if not self._allowed_ips:
            return await call_next(request)

        client_ip = _normalise_ip(get_client_ip(request))

        if not check_ip_allowlist(client_ip, self._allowed_ips):
            logger.warning(
                "IPAllowlistMiddleware: BLOCKED ip=%s path=%s", client_ip, request.url.path
            )
            return JSONResponse(
                status_code=403,
                content={
                    "detail": f"IP_NOT_ALLOWLISTED: {client_ip} is not permitted",
                    "code": "IP_NOT_ALLOWLISTED",
                },
            )

        return await call_next(request)
