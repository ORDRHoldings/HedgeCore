"""
app/api/__init__.py

HedgeCalc – Unified API Router

This module exposes `api_router`, the single router mounted by app.main.
All route modules must be registered here to become reachable.

Design:
- Explicit includes (no magic auto-discovery)
- Deterministic order
- Fail-fast if a critical router import breaks
"""

from __future__ import annotations

import logging
from fastapi import APIRouter

logger = logging.getLogger(__name__)

api_router = APIRouter()


# -----------------------------------------------------------------------------
# Core/System
# -----------------------------------------------------------------------------
from app.api.routes.system import router as system_router  # noqa: E402

api_router.include_router(system_router)


# -----------------------------------------------------------------------------
# Auth & Users
# -----------------------------------------------------------------------------
from app.api.routes.auth import router as auth_router  # noqa: E402
from app.api.routes.users import router as users_router  # noqa: E402

api_router.include_router(auth_router)
api_router.include_router(users_router)


# -----------------------------------------------------------------------------
# Admin (Users)
# -----------------------------------------------------------------------------
from app.api.routes.admin_users import router as admin_users_router  # noqa: E402

api_router.include_router(admin_users_router)


# -----------------------------------------------------------------------------
# Admin (API Keys)
# -----------------------------------------------------------------------------
from app.api.routes.admin_api_keys import router as admin_api_keys_router  # noqa: E402

api_router.include_router(admin_api_keys_router)


# -----------------------------------------------------------------------------
# Admin (API Key Audit)
# -----------------------------------------------------------------------------
# This router is expected to exist after Phase XII file creation.
from app.api.routes.admin_api_key_audit import router as admin_api_key_audit_router  # noqa: E402

api_router.include_router(admin_api_key_audit_router)


__all__ = ["api_router"]
