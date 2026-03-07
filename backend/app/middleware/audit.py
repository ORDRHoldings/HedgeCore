"""
app/middleware/audit.py
HedgeCalc - Async Audit Middleware (Stable Final)
-------------------------------------------------
Robust asynchronous audit trail middleware with safe teardown handling
for Windows event loops, pytest, and FastAPI lifespan.
"""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Message

from app.core.config import settings

logger = logging.getLogger("hedgecalc.audit")


# ---------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------
def _extract_user_id_from_auth(authorization: str | None) -> int | None:
    """Decode JWT and extract user_id (sub) if valid."""
    if not authorization or " " not in authorization:
        return None
    prefix, token = authorization.split(" ", 1)
    if prefix.lower() != "bearer":
        return None
    try:
        from jose import jwt
        claims = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
        )
        sub = claims.get("sub")
        return int(sub) if str(sub).isdigit() else None
    except Exception:
        return None


# ---------------------------------------------------------------------
# Middleware Core
# ---------------------------------------------------------------------
class AuditMiddleware(BaseHTTPMiddleware):
    """Logs every HTTP request asynchronously with safe teardown protection."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Message]]
    ):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        start_time = time.perf_counter()

        method = request.method
        path = request.url.path
        ip = request.client.host if request.client else None
        ua = request.headers.get("user-agent", "")
        auth = request.headers.get("authorization", "")
        user_id = _extract_user_id_from_auth(auth)

        status_code = 500
        response = None
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = int((time.perf_counter() - start_time) * 1000)

            logger.info(
                f"AUDIT: {method} {path} [{status_code}] ({duration_ms} ms)",
                extra={
                    "rid": request_id,
                    "uid": user_id,
                    "ip": ip,
                    "ua": ua,
                    "method": method,
                    "path": path,
                    "status": status_code,
                    "duration_ms": duration_ms,
                },
            )

            # Always attach request ID to outgoing response
            if response is not None:
                try:
                    response.headers["x-request-id"] = request_id  # type: ignore[attr-defined]
                except Exception:
                    pass
