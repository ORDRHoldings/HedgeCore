# backend/app/api/middleware/audit_headers.py
from __future__ import annotations

import hashlib
import json
import time
import uuid
from collections.abc import Callable
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


def _canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def _stable_hash(obj: Any) -> str:
    return hashlib.sha256(_canonical_json(obj).encode("utf-8")).hexdigest()


def _now_ms() -> int:
    return int(time.time() * 1000)


def _get_first_header(request: Request, name: str) -> str | None:
    v = request.headers.get(name)
    if v is None:
        return None
    v = v.strip()
    return v or None


class AuditHeadersMiddleware(BaseHTTPMiddleware):
    """
    Institutional-grade API hardening middleware:

    Adds standardized audit headers to every response:
      - X-Request-Id: request correlation id (propagated if provided)
      - X-Idempotency-Key: propagated if provided (caller-controlled)
      - X-Server-Time-Ms: server time when response is created
      - X-Duration-Ms: request processing duration
      - X-Audit-Fingerprint: stable hash of selected request/response metadata (NOT body)

    Notes:
      - No request/response bodies are read (prevents accidental PII leakage and avoids buffering).
      - Fingerprint is intentionally metadata-only and deterministic for identical metadata.
      - Request id is caller-propagated if present; otherwise generated (uuid4).
      - This middleware is safe for all routes, including /health.

    Recommended integration (in FastAPI app):
      app.add_middleware(AuditHeadersMiddleware)
    """

    def __init__(
        self,
        app,
        *,
        request_id_header: str = "X-Request-Id",
        idempotency_header: str = "X-Idempotency-Key",
        include_fingerprint: bool = True,
        fingerprint_header: str = "X-Audit-Fingerprint",
        duration_header: str = "X-Duration-Ms",
        server_time_header: str = "X-Server-Time-Ms",
    ) -> None:
        super().__init__(app)
        self._request_id_header = request_id_header
        self._idempotency_header = idempotency_header
        self._include_fingerprint = bool(include_fingerprint)
        self._fingerprint_header = fingerprint_header
        self._duration_header = duration_header
        self._server_time_header = server_time_header

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = time.perf_counter()

        # Propagate caller-provided request id if present; otherwise mint one.
        request_id = _get_first_header(request, self._request_id_header)
        if request_id is None:
            request_id = str(uuid.uuid4())

        idempotency_key = _get_first_header(request, self._idempotency_header)

        # Execute downstream
        response: Response = await call_next(request)

        duration_ms = int((time.perf_counter() - start) * 1000)
        server_time_ms = _now_ms()

        # Attach audit headers
        response.headers[self._request_id_header] = request_id
        if idempotency_key is not None:
            response.headers[self._idempotency_header] = idempotency_key

        response.headers[self._duration_header] = str(duration_ms)
        response.headers[self._server_time_header] = str(server_time_ms)

        # Metadata-only fingerprint (no bodies)
        if self._include_fingerprint:
            meta: dict[str, Any] = {
                "v": "1",
                "request_id": request_id,
                "idempotency_key": idempotency_key,
                "method": request.method,
                "path": request.url.path,
                "query": str(request.url.query or ""),
                "status_code": int(getattr(response, "status_code", 0) or 0),
                "duration_ms": duration_ms,
                # Include content-type only (not content)
                "content_type": response.headers.get("content-type", ""),
            }
            response.headers[self._fingerprint_header] = _stable_hash(meta)

        return response


__all__ = ["AuditHeadersMiddleware"]
