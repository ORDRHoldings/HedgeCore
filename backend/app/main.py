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
    """Seed default roles with hierarchy levels if they don't exist."""
    from sqlalchemy import select
    from app.models.rbac import Role

    default_roles = [
        # (name, description, hierarchy_level)
        ("admin", "Full system access", 0),
        ("supervisor", "Approve/reject staged artifacts", 5),
        ("risk_analyst", "Create proposals and run sandbox calculations", 10),
    ]

    async with async_session_maker() as session:
        for name, description, level in default_roles:
            result = await session.execute(select(Role).where(Role.name == name))
            existing = result.scalar_one_or_none()
            if not existing:
                session.add(Role(
                    name=name,
                    description=description,
                    hierarchy_level=level,
                    is_system=True,
                ))
            else:
                # Update existing roles with new fields if missing
                if existing.hierarchy_level != level:
                    existing.hierarchy_level = level
                if not existing.is_system:
                    existing.is_system = True
        await session.commit()

    logger.info("✅ Default roles seeded")


async def _seed_permissions():
    """Seed all permission codenames and default role→permission mappings."""
    from sqlalchemy import select
    from app.models.rbac import Role
    from app.models.permission import (
        Permission, RolePermission,
        SEED_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS,
    )

    async with async_session_maker() as session:
        # 1. Seed permissions
        for codename, module, action, description in SEED_PERMISSIONS:
            result = await session.execute(
                select(Permission).where(Permission.codename == codename)
            )
            if not result.scalar_one_or_none():
                session.add(Permission(
                    codename=codename,
                    module=module,
                    action=action,
                    description=description,
                ))
        await session.flush()

        # 2. Seed role → permission mappings
        for role_name, perm_codenames in DEFAULT_ROLE_PERMISSIONS.items():
            role_result = await session.execute(
                select(Role).where(Role.name == role_name)
            )
            role = role_result.scalar_one_or_none()
            if not role:
                continue

            for codename in perm_codenames:
                perm_result = await session.execute(
                    select(Permission).where(Permission.codename == codename)
                )
                perm = perm_result.scalar_one_or_none()
                if not perm:
                    continue

                existing = await session.execute(
                    select(RolePermission).where(
                        RolePermission.role_id == role.id,
                        RolePermission.permission_id == perm.id,
                    )
                )
                if not existing.scalar_one_or_none():
                    session.add(RolePermission(
                        role_id=role.id,
                        permission_id=perm.id,
                    ))

        await session.commit()

    logger.info("✅ Permissions and role-permission mappings seeded")


async def _ensure_tables():
    """Create any missing tables (non-destructive — skips existing)."""
    from sqlalchemy import text
    from app.core.db import async_engine, Base
    # Import all model modules to register with Base.metadata
    import importlib
    from pathlib import Path
    models_dir = Path(__file__).parent / "models"
    for f in models_dir.glob("*.py"):
        if f.name != "__init__.py":
            importlib.import_module(f"app.models.{f.stem}")

    # Use raw SQL for migration — each statement in its own transaction
    raw_ddl = [
        "DROP INDEX IF EXISTS ix_permissions_module",
        """CREATE TABLE IF NOT EXISTS companies (
            id UUID PRIMARY KEY, name VARCHAR(255) NOT NULL,
            slug VARCHAR(64) UNIQUE NOT NULL, domain VARCHAR(255),
            logo_url VARCHAR(512), settings JSONB,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",
        """CREATE TABLE IF NOT EXISTS branches (
            id UUID PRIMARY KEY,
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL, code VARCHAR(32) NOT NULL,
            region VARCHAR(128), timezone VARCHAR(64) DEFAULT 'UTC',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(company_id, code))""",
        """CREATE TABLE IF NOT EXISTS departments (
            id UUID PRIMARY KEY,
            branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL, code VARCHAR(32) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(branch_id, code))""",
        """CREATE TABLE IF NOT EXISTS permissions (
            id SERIAL PRIMARY KEY,
            codename VARCHAR(128) UNIQUE NOT NULL,
            module VARCHAR(64) NOT NULL, action VARCHAR(64) NOT NULL,
            description VARCHAR(255) NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""",
        """CREATE TABLE IF NOT EXISTS role_permissions (
            id SERIAL PRIMARY KEY,
            role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(role_id, permission_id))""",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(128)",
        "ALTER TABLE roles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE",
        "ALTER TABLE roles ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER NOT NULL DEFAULT 10",
        "ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE",
    ]
    for stmt in raw_ddl:
        try:
            async with async_engine.begin() as conn:
                await conn.execute(text(stmt))
        except Exception as e:
            logger.debug(f"DDL skipped: {e}")

    alter_stmts: list = []  # kept for compatibility
    async with async_engine.begin() as conn:
        for stmt in alter_stmts:
            try:
                await conn.execute(text(stmt))
            except Exception as e:
                logger.debug(f"ALTER skipped: {e}")

    logger.info("✅ Database tables ensured (create_all + ALTER)")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_engine()
    rebuild_all_schemas()

    try:
        await _ensure_tables()
    except Exception as e:
        logger.warning(f"⚠️ _ensure_tables skipped: {e}")

    try:
        await _seed_roles()
    except Exception as e:
        logger.warning(f"⚠️ _seed_roles skipped (DB may be uninitialised): {e}")

    try:
        await _seed_permissions()
    except Exception as e:
        logger.warning(f"⚠️ _seed_permissions skipped (DB may be uninitialised): {e}")

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
# Middleware (CANONICAL ORDER — Starlette LIFO: last added = outermost)
# Inner → Outer: GZip → AuditHeaders → RateLimit → APIKeyAuth → CORS
# CORS must be outermost to handle OPTIONS preflight before auth blocks it.
# -------------------------------------------------------------------
app.add_middleware(GZipMiddleware, minimum_size=512)
app.add_middleware(AuditHeadersMiddleware)
app.add_middleware(RateLimitMiddleware, requests_per_minute=60)
app.add_middleware(APIKeyAuthMiddleware)

# CORS outermost — added last so it runs first (intercepts OPTIONS preflight)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(o).rstrip("/") for o in settings.CORS_ALLOW_ORIGINS],
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)


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
