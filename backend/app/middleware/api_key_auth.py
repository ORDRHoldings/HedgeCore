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
    HedgeCalc Canonical API-Key Middleware (Production-Safe)

    Guarantees:
    - Swagger works in ALL environments
    - Root routes and /api routes both supported
    - Health endpoints always public
    - Bootstrap key available for initial setup
    - Works with Render / local / reverse proxies
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

        # ------------------------------------------------------------------
        # PUBLIC PATH RULES (PREFIX + SUFFIX BASED)
        # Handles:
        # - /docs
        # - /api/docs
        # - /health
        # - /api/health
        # - reverse proxy mounted paths
        # ------------------------------------------------------------------
        self.public_prefixes = (
            # Root-level Swagger
            "/docs",
            "/redoc",
            "/openapi.json",
            "/docs/oauth2-redirect",

            # Root health routes
            "/health",
            "/system/health",

            # API-prefixed Swagger
            "/api/docs",
            "/api/redoc",
            "/api/openapi.json",
            "/api/docs/oauth2-redirect",

            # API health routes
            "/api/health",
            "/api/system/health",

            # Admin bootstrap routes (allow initial key creation)
            "/api/admin/api-keys",
            "/api/admin/api-key-audit",
            "/api/api/admin/api-keys",
            "/api/api/admin/api-key-audit",
        )

        # ------------------------------------------------------------------
        # IN-MEMORY KEY STORE (bootstrap only)
        # Replace with DB-backed store later
        # ------------------------------------------------------------------
        self._keys: Dict[str, APIKeyRecord] = {}

        # Dev bootstrap key
        bootstrap_key = "HC_DEV_KEY_001"
        key_hash = _stable_hash(bootstrap_key)
        self._keys[key_hash] = APIKeyRecord(
            key_hash=key_hash,
            scopes=["engine:recommend"],
        )

    # ------------------------------------------------------------------
    # PUBLIC PATH CHECK
    # ------------------------------------------------------------------
    def _is_public(self, path: str) -> bool:
        # direct prefix match
        if any(path.startswith(p) for p in self.public_prefixes):
            return True

        # fallback rules (bulletproof for proxies / rewrites)
        if path.endswith("/health"):
            return True
        if path.startswith("/docs") or path.startswith("/redoc"):
            return True
        if "openapi" in path:
            return True

        return False

    # ------------------------------------------------------------------
    # KEY EXTRACTION
    # ------------------------------------------------------------------
    def _extract_key(self, request: Request) -> Optional[str]:
        raw = request.headers.get(self.header_name)
        return raw.strip() if raw else None

    # ------------------------------------------------------------------
    # AUTHORIZATION
    # ------------------------------------------------------------------
    def _authorize(self, raw_key: str) -> Optional[APIKeyRecord]:
        key_hash = _stable_hash(raw_key)
        rec = self._keys.get(key_hash)

        if not rec:
            return None
        if not rec.active:
            return None
        if self.required_scope not in rec.scopes:
            return None

        return rec

    # ------------------------------------------------------------------
    # MAIN DISPATCH
    # ------------------------------------------------------------------
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path

        # ✅ Allow public routes immediately
        if self._is_public(path):
            return await call_next(request)

        # 🔐 Extract key
        raw_key = self._extract_key(request)
        if not raw_key:
            return JSONResponse(
                status_code=401,
                content={
                    "error": "api_key_missing",
                    "detail": f"{self.header_name} header required",
                },
            )

        # 🔐 Validate key
        rec = self._authorize(raw_key)
        if not rec:
            return JSONResponse(
                status_code=403,
                content={
                    "error": "api_key_invalid",
                    "detail": "Invalid or unauthorized API key",
                },
            )

        # ✅ Attach metadata to request context
        rec.last_used_at_ms = _now_ms()
        request.state.api_key_hash = rec.key_hash
        request.state.api_scopes = list(rec.scopes)

        return await call_next(request)
