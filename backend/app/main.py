from __future__ import annotations

"""
app/main.py
HedgeCalc API – Phase VI
CANONICAL, INSTITUTIONAL, NGINX-SAFE
"""

import logging
import traceback
from typing import Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.openapi.utils import get_openapi
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html

from starlette.middleware.gzip import GZipMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import settings
from app.core.logging_config import configure_logging
from app.core.db import init_engine, shutdown_engine, async_session_maker
from app.core.schema_loader import rebuild_all_schemas

from app.middleware.audit_headers import AuditHeadersMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.api_key_auth import APIKeyAuthMiddleware

from app.tasks.audit_cleanup import cleanup_audit_tables


# -------------------------------------------------------------------
# Logging
# -------------------------------------------------------------------
configure_logging()
logger = logging.getLogger(__name__)
logger.info("✅ HedgeCalc API booting")


# -------------------------------------------------------------------
# Lifespan (ALL MUTATION GOES HERE)
# -------------------------------------------------------------------
async def _seed_roles():
    """Seed default roles if they don't exist."""
    from sqlalchemy import select
    from app.models.rbac import Role

    default_roles = [
        ("admin", "Full system access"),
        ("supervisor", "Approve/reject staged artifacts"),
        ("risk_analyst", "Create proposals and run sandbox calculations"),
    ]

    async with async_session_maker() as session:
        for name, description in default_roles:
            result = await session.execute(select(Role).where(Role.name == name))
            if not result.scalar_one_or_none():
                session.add(Role(name=name, description=description))
        await session.commit()

    logger.info("✅ Default roles seeded")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_engine()
    rebuild_all_schemas()

    try:
        await _seed_roles()
    except Exception as e:
        logger.warning(f"⚠️ _seed_roles skipped (DB may be uninitialised): {e}")

    try:
        yield
    finally:
        await shutdown_engine()


# -------------------------------------------------------------------
# FastAPI App (ROOTLESS — NGINX OWNS /api)
# -------------------------------------------------------------------
app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url="/api/openapi.json",
)


# -------------------------------------------------------------------
# Root Redirect (PRODUCTION SAFE)
# -------------------------------------------------------------------
@app.get("/", include_in_schema=False)
def root_redirect():
    return HTMLResponse(
        """
        <html>
            <head>
                <meta http-equiv="refresh" content="0; url=/api/docs" />
            </head>
            <body>
                Redirecting to API docs...
            </body>
        </html>
        """
    )


# -------------------------------------------------------------------
# Global Exception Guard
# -------------------------------------------------------------------
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("🔥 Unhandled exception %s %s", request.method, request.url.path)
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


# -------------------------------------------------------------------
# Middleware (CANONICAL ORDER)
# -------------------------------------------------------------------
app.add_middleware(GZipMiddleware, minimum_size=512)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOW_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)

app.add_middleware(AuditHeadersMiddleware)
app.add_middleware(RateLimitMiddleware, requests_per_minute=60)

# API key auth last in stack
app.add_middleware(APIKeyAuthMiddleware)


# -------------------------------------------------------------------
# Security Headers
# -------------------------------------------------------------------
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response


# -------------------------------------------------------------------
# Routers (SINGLE MOUNT)
# -------------------------------------------------------------------
from app.api.router import router as api_router
from app.routes.engine import router as engine_router

app.include_router(api_router, prefix="/api")
app.include_router(engine_router, prefix="/api")

logger.info("✅ Routers mounted under /api")


# -------------------------------------------------------------------
# OpenAPI (CANONICAL)
# -------------------------------------------------------------------
def custom_openapi() -> dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=settings.APP_NAME,
        version="1.0.0",
        description="SynexFund HedgeCalc API",
        routes=app.routes,
    )

    schema["servers"] = [{"url": "/api"}]
    app.openapi_schema = schema
    return schema


app.openapi = custom_openapi


# -------------------------------------------------------------------
# Public System Endpoint
# -------------------------------------------------------------------
@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok", "service": settings.APP_NAME}


# -------------------------------------------------------------------
# Docs
# -------------------------------------------------------------------
@app.get("/api/docs", include_in_schema=False)
def swagger_docs():
    return get_swagger_ui_html(
        openapi_url="/api/openapi.json",
        title=f"{settings.APP_NAME} – Swagger",
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",
    )


@app.get("/api/redoc", include_in_schema=False)
def redoc_docs():
    return get_redoc_html(
        openapi_url="/api/openapi.json",
        title=f"{settings.APP_NAME} – ReDoc",
    )


# -------------------------------------------------------------------
# Scheduler
# -------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        cleanup_audit_tables,
        CronTrigger(hour=3, minute=30),
        id="audit_cleanup",
        replace_existing=True,
    )
    scheduler.start()
    app.state.scheduler = scheduler


@app.on_event("shutdown")
async def on_shutdown():
    scheduler = getattr(app.state, "scheduler", None)
    if scheduler:
        scheduler.shutdown(wait=False)
