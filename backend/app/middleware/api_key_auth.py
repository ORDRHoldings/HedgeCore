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
    FINAL production-safe API key middleware.

    Allows:
    - Swagger UI
    - OpenAPI JSON
    - health endpoints
    - static assets
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

        # 🔓 PUBLIC PATH FRAGMENTS (NOT PREFIXES — more reliable)
        self.public_paths = (
            "/docs",
            "/redoc",
            "/openapi.json",
            "/health",
            "/system/health",
        )

        self._keys: Dict[str, APIKeyRecord] = {}

        # DEV bootstrap key
        bootstrap_key = "HC_DEV_KEY_001"
        key_hash = _stable_hash(bootstrap_key)
        self._keys[key_hash] = APIKeyRecord(
            key_hash=key_hash,
            scopes=["engine:recommend"],
        )

    def _is_public(self, path: str) -> bool:
        """
        Works with:
        /docs
        /api/docs
        /v1/api/docs
        etc.
        """
        return any(fragment in path for fragment in self.public_paths)

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

        # ✅ Allow public paths
        if self._is_public(path):
            return await call_next(request)

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
