"""
app/middleware/csrf.py
SEC-06: CSRF double-submit cookie middleware.

Strategy: Double-Submit Cookie pattern (stateless, works with JWT auth).
- On any state-mutating request (POST/PUT/PATCH/DELETE), the middleware
  requires that the X-CSRF-Token header matches the csrf_token cookie.
- The CSRF token is a 32-byte hex string, set as a Secure SameSite=Strict
  cookie by the login endpoint.
- Exempt paths: /api/v1/auth/* (login/register), /docs, /openapi.json,
  /health (all unauthenticated or token-issuing endpoints).
- When CSRF_DISABLED env var is set to "1" or "true" (dev/test), all checks
  are skipped silently.

NOTE: SameSite=Strict cookies provide the primary CSRF protection in modern
browsers. This double-submit layer adds defence-in-depth for older clients
and API consumers that have opted into cookie-based sessions.
"""

from __future__ import annotations

import os
import secrets
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# Paths that bypass CSRF validation (unauthenticated or token-issuing)
_CSRF_EXEMPT_PREFIXES = (
    "/api/auth/",       # Auth routes: /api/auth/login, /api/auth/refresh, etc.
    "/api/v1/auth/",    # Alias if auth ever moves under /v1
    "/auth/",           # Bare auth prefix
    "/docs",
    "/openapi.json",
    "/redoc",
    "/health",
    "/metrics",
    "/favicon.ico",
)

_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_CSRF_COOKIE_NAME = "csrf_token"
_CSRF_HEADER_NAME = "X-CSRF-Token"
_TOKEN_BYTES = 32


def _is_disabled() -> bool:
    return os.getenv("CSRF_DISABLED", "").lower() in ("1", "true", "yes")


def generate_csrf_token() -> str:
    """Generate a new CSRF token (32-byte hex). Call at login and store in cookie."""
    return secrets.token_hex(_TOKEN_BYTES)


class CSRFMiddleware(BaseHTTPMiddleware):
    """Double-submit cookie CSRF protection for state-mutating endpoints."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        # Skip non-mutating methods
        if request.method not in _MUTATING_METHODS:
            return await call_next(request)

        # Skip if CSRF protection is disabled (dev/test)
        if _is_disabled():
            return await call_next(request)

        # Skip exempt paths
        path = request.url.path
        if any(path.startswith(prefix) for prefix in _CSRF_EXEMPT_PREFIXES):
            return await call_next(request)

        # Extract cookie token
        cookie_token = request.cookies.get(_CSRF_COOKIE_NAME)
        if not cookie_token:
            return JSONResponse(
                status_code=403,
                content={
                    "error": "csrf_token_missing",
                    "detail": "CSRF cookie not present — call /auth/login first",
                },
            )

        # Extract header token
        header_token = request.headers.get(_CSRF_HEADER_NAME)
        if not header_token:
            return JSONResponse(
                status_code=403,
                content={
                    "error": "csrf_header_missing",
                    "detail": f"{_CSRF_HEADER_NAME} header required for mutating requests",
                },
            )

        # Constant-time comparison (prevent timing oracle)
        if not secrets.compare_digest(cookie_token, header_token):
            return JSONResponse(
                status_code=403,
                content={
                    "error": "csrf_token_mismatch",
                    "detail": "CSRF token mismatch",
                },
            )

        return await call_next(request)
