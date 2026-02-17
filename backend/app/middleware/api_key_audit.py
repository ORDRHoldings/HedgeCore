"""
app/middleware/api_key_audit.py

HedgeCalc – Phase XI
API Key Audit Middleware (WORM-Grade, Non-Intrusive)

Purpose:
- Records every successful request authenticated via API key
- Never interferes with request/response lifecycle
- Never raises errors outward (audit failures are swallowed & logged)
- Append-only semantics suitable for compliance & forensics
"""

from __future__ import annotations

import time
import logging
from typing import Optional, Tuple

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.db.session import get_session
from app.models.api_key_audit import ApiKeyAuditLog

logger = logging.getLogger("api.audit")


# ----------------------------------------------------------------------
# 🔍 Extraction helper (observer-only, zero auth coupling)
# ----------------------------------------------------------------------
def _extract_api_key_context(request: Request) -> Tuple[Optional[str], Optional[str]]:
    """
    Extract API-key context from request.state if present.

    Contract:
    - require_api_key dependency MUST attach:
        request.state.api_key_id
        request.state.api_key_user_id (optional)

    This middleware does NOT validate anything.
    """
    state = getattr(request, "state", None)
    if not state:
        return None, None

    return (
        getattr(state, "api_key_id", None),
        getattr(state, "api_key_user_id", None),
    )


# ----------------------------------------------------------------------
# 🧾 Middleware
# ----------------------------------------------------------------------
class ApiKeyAuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()

        response = await call_next(request)

        try:
            api_key_id, user_id = _extract_api_key_context(request)

            if not api_key_id:
                return response

            latency_ms = int((time.perf_counter() - start) * 1000)

            async for session in get_session():
                try:
                    session.add(
                        ApiKeyAuditLog(
                            api_key_id=api_key_id,
                            user_id=user_id,
                            method=request.method,
                            path=request.url.path,
                            status_code=response.status_code,
                            client_ip=request.client.host if request.client else "unknown",
                            latency_ms=latency_ms,
                        )
                    )
                    await session.commit()
                except Exception:
                    await session.rollback()
                    raise

            logger.info(
                "api_key=%s user=%s %s %s -> %s (%sms)",
                api_key_id,
                user_id,
                request.method,
                request.url.path,
                response.status_code,
                latency_ms,
            )

        except Exception:
            # 🔒 Audit must NEVER break production traffic
            logger.exception("API key audit logging failed")

        return response
