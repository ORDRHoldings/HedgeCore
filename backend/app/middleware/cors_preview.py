"""
CORS middleware wrapper that supports Vercel preview domains.

FastAPI's built-in CORSMiddleware does not support wildcard origins
when allow_credentials=True (browser restriction). This wrapper adds
dynamic origin validation for *.vercel.app preview deployments.
"""
from __future__ import annotations

from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class VercelPreviewCORSMiddleware(BaseHTTPMiddleware):
    """
    Injects the request origin into response CORS headers when the origin
    matches a configured preview domain pattern.

    Must be installed *inside* (after) the standard CORSMiddleware so that
    this middleware can override the Access-Control-Allow-Origin header
    for preview domains that the static CORSMiddleware list does not include.
    """

    def __init__(
        self,
        app,
        *,
        allow_vercel_previews: bool = False,
        vercel_suffixes: tuple[str, ...] = (".vercel.app",),
    ) -> None:
        super().__init__(app)
        self.allow_vercel_previews = allow_vercel_previews
        self.vercel_suffixes = vercel_suffixes

    def _is_preview_origin(self, origin: str | None) -> bool:
        if not origin or not self.allow_vercel_previews:
            return False
        return any(origin.endswith(suffix) for suffix in self.vercel_suffixes)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        origin = request.headers.get("origin")
        if self._is_preview_origin(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        return response
