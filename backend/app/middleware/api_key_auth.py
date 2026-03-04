from __future__ import annotations

import hashlib
import time
from typing import Callable, Dict, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse


def _now_ms() -> int:
    return int(time.time() * 1000)


def _stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class APIKeyRecord:
    __slots__ = ("key_hash", "scopes", "active", "created_at_ms", "last_used_at_ms")

    def __init__(self, *, key_hash: str, scopes: Optional[list[str]] = None) -> None:
        self.key_hash = key_hash
        self.scopes = scopes or ["engine:recommend"]
        self.active = True
        self.created_at_ms = _now_ms()
        self.last_used_at_ms: Optional[int] = None


class APIKeyAuthMiddleware(BaseHTTPMiddleware):
    """
    Production-safe API key middleware

    FIXES:
    - Swagger always accessible
    - OpenAPI JSON always accessible
    - Works with mounted /api router
    - Does not rely on fragile prefix assumptions
    - Bearer-authenticated requests (browser/JWT clients) bypass API key check;
      JWT validity is enforced by get_current_user() in each route handler.
    """

    def __init__(
        self,
        app,
        *,
        header_name: str = "X-API-Key",
        required_scope: str = "engine:recommend",
    ) -> None:
        super().__init__(app)
        self.header_name = header_name
        self.required_scope = required_scope

        # Public endpoints (exact OR prefix)
        self.public_paths = {
            "/",
            "/health",
            "/docs",
            "/redoc",
            "/openapi.json",
            "/api/docs",
            "/api/redoc",
            "/api/openapi.json",
            "/api/health",
            "/api/system/health",
            # Schema-health: public so unauthenticated load-balancers / deployment
            # scripts can poll it without credentials.  Response is REDACTED for
            # unauthenticated callers (booleans only — no object names).
            "/api/system/schema-health",
        }

        # Public prefixes (for swagger assets + oauth redirect + auth)
        self.public_prefixes = (
            "/docs",
            "/redoc",
            "/openapi.json",
            "/api/docs",
            "/api/redoc",
            "/api/openapi.json",
            "/api/docs/",
            "/api/auth/",
            # Voice WebSocket — browser WS API cannot send headers, JWT is in query param.
            # The endpoint itself validates the token; middleware must not block upgrade.
            "/api/v1/voice/",
        )

        self._keys: Dict[str, APIKeyRecord] = {}

        # DEV bootstrap key (works immediately in prod too)
        bootstrap_key = "HC_DEV_KEY_001"
        key_hash = _stable_hash(bootstrap_key)
        self._keys[key_hash] = APIKeyRecord(
            key_hash=key_hash,
            scopes=["engine:recommend"],
        )

    def _is_public(self, path: str) -> bool:
        if path in self.public_paths:
            return True
        return any(path.startswith(p) for p in self.public_prefixes)

    def _extract_key(self, request: Request) -> Optional[str]:
        raw = request.headers.get(self.header_name)
        return raw.strip() if raw else None

    def _authorize(self, raw_key: str) -> Optional[APIKeyRecord]:
        key_hash = _stable_hash(raw_key)
        rec = self._keys.get(key_hash)
        if not rec or not rec.active:
            return None
        if self.required_scope not in rec.scopes:
            return None
        return rec

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path

        # Public routes — pass through unconditionally
        if self._is_public(path):
            return await call_next(request)

        # Bearer-authenticated requests (browser / JWT clients) pass through.
        # JWT validity is enforced by get_current_user() in each route handler.
        if request.headers.get("Authorization", "").startswith("Bearer "):
            return await call_next(request)

        # API key clients (automated systems, CI pipelines, SDK consumers)
        raw_key = self._extract_key(request)

        if not raw_key:
            return JSONResponse(
                status_code=401,
                content={
                    "error": "api_key_missing",
                    "detail": "X-API-Key header required",
                },
            )

        rec = self._authorize(raw_key)

        if not rec:
            return JSONResponse(
                status_code=403,
                content={
                    "error": "api_key_invalid",
                    "detail": "Invalid or unauthorized API key",
                },
            )

        rec.last_used_at_ms = _now_ms()
        request.state.api_key_hash = rec.key_hash
        request.state.api_scopes = list(rec.scopes)

        return await call_next(request)
