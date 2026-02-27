# -*- coding: utf-8 -*-
"""
app/api/router.py

HedgeCalc - Phase VI
Central API router registration module.

CANONICAL RULE:
- Feature routers own their own prefixes (e.g., auth.py uses prefix="/auth")
- The aggregator router NEVER adds prefixes for those modules
- This prevents /auth/auth duplication and keeps OpenAPI SDK-safe
"""

from fastapi import APIRouter
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html

# Import feature routers (feature routers OWN their prefixes)
from app.api.routes.auth import router as auth_router
from app.api.routes.admin_api_keys import router as admin_api_keys_router
from app.api.routes.system import router as system_router
from app.api.routes.hedge import router as hedge_router
from app.api.routes.v1_calculate import router as v1_calculate_router
from app.api.routes.v1_upload import router as v1_upload_router
from app.api.routes.v1_export import router as v1_export_router
from app.api.routes.v1_pipeline import router as v1_pipeline_router
from app.api.routes.organization import router as organization_router
from app.api.routes.admin_roles import router as admin_roles_router
from app.api.routes.seed import router as seed_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.v1_positions import router as v1_positions_router
from app.api.routes.v1_policies import router as v1_policies_router
from app.api.routes.v1_connectors import router as v1_connectors_router
from app.api.routes.v1_audit import router as v1_audit_router
# Phase 1 ? Institutional governance
from app.api.routes.v1_execution_proposals import router as v1_proposals_router
from app.api.routes.v1_policy_revisions import router as v1_policy_revisions_router
from app.api.routes.market import router as market_router

router = APIRouter()

# ---------------------------------------------------------------------
# API Documentation (served under /api/*)
# ---------------------------------------------------------------------

@router.get("/docs", include_in_schema=False)
def swagger_docs():
    return get_swagger_ui_html(
        openapi_url="/api/openapi.json",
        title="HedgeCalc API - Swagger UI",
    )

@router.get("/redoc", include_in_schema=False)
def redoc_docs():
    return get_redoc_html(
        openapi_url="/api/openapi.json",
        title="HedgeCalc API - ReDoc",
    )

# ---------------------------------------------------------------------
# Feature Routers
# ---------------------------------------------------------------------

# Authentication (owns /auth)
router.include_router(auth_router)

# Admin API keys (owns /admin/api-keys)
router.include_router(admin_api_keys_router)

# Hedge Engine (owns /hedge)
router.include_router(hedge_router)

# Internal system diagnostics (API-key protected)
router.include_router(system_router)

# V1 FX Platform API (calculate, upload, export)
router.include_router(v1_calculate_router)
router.include_router(v1_upload_router)
router.include_router(v1_export_router)

# V1 Pipeline (Tri-State governance: SANDBOX -> STAGING -> LEDGER)
router.include_router(v1_pipeline_router)

# Organization hierarchy (owns /v1/organization)
router.include_router(organization_router)

# Role & Permission management (owns /v1/admin/roles)
router.include_router(admin_roles_router)

# One-time seed endpoint (owns /v1/seed)
router.include_router(seed_router)

# Dashboard aggregate endpoints (owns /v1/dashboard)
router.include_router(dashboard_router)

# V1 Position Spine (owns /v1/positions)
router.include_router(v1_positions_router)

# V1 Policy DB (owns /v1/policies)
router.include_router(v1_policies_router)

# Market Data (owns /v1/market)
router.include_router(market_router)

# V1 Connector / Ingestion Desk (owns /v1/connectors)
router.include_router(v1_connectors_router)

# V1 Audit event ledger (owns /v1/audit)
router.include_router(v1_audit_router)

# Phase 1 ? 4-Eyes Execution Proposal workflow (owns /v1/proposals)
router.include_router(v1_proposals_router)

# Phase 1 ? Policy Revision lineage & diff (owns /v1/policies/revisions)
router.include_router(v1_policy_revisions_router)

__all__ = ["router"]
