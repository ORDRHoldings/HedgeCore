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
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html

from app.api.routes.admin_api_keys import router as admin_api_keys_router
from app.api.routes.admin_roles import router as admin_roles_router

# Import feature routers (feature routers OWN their prefixes)
from app.api.routes.auth import router as auth_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.hedge import router as hedge_router
from app.api.routes.market import router as market_router
from app.api.routes.organization import router as organization_router
from app.api.routes.seed import router as seed_router
from app.api.routes.system import router as system_router
from app.api.routes.v1_audit import router as v1_audit_router
from app.api.routes.v1_calculate import router as v1_calculate_router
from app.api.routes.v1_connectors import router as v1_connectors_router

# Phase 1 ? Institutional governance
from app.api.routes.v1_analytics import router as v1_analytics_router
from app.api.routes.v1_execution_proposals import router as v1_proposals_router
from app.api.routes.v1_export import router as v1_export_router
from app.api.routes.v1_pipeline import router as v1_pipeline_router
from app.api.routes.v1_policies import router as v1_policies_router
from app.api.routes.v1_policy_revisions import router as v1_policy_revisions_router
from app.api.routes.v1_positions import router as v1_positions_router
from app.api.routes.v1_upload import router as v1_upload_router

router = APIRouter()

# ---------------------------------------------------------------------
# API Documentation (served under /api/*)
# ---------------------------------------------------------------------

@router.get("/docs", include_in_schema=False)
def swagger_docs():
    return get_swagger_ui_html(
        openapi_url="/api/openapi.json",
        title="ORDR Terminal API - Swagger UI",
    )

@router.get("/redoc", include_in_schema=False)
def redoc_docs():
    return get_redoc_html(
        openapi_url="/api/openapi.json",
        title="ORDR Terminal API - ReDoc",
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

# V1 Analytics (owns /v1/analytics)
router.include_router(v1_analytics_router)

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

# L-11 MFA (owns /v1/mfa)
from app.api.routes.v1_mfa import router as v1_mfa_router

router.include_router(v1_mfa_router)

# Support Ticketing (owns /v1/support)
from app.api.routes.v1_support import router as v1_support_router

router.include_router(v1_support_router)

# Risk Check (owns /v1/risk-check)
from app.api.routes.v1_risk_check import router as v1_risk_check_router

router.include_router(v1_risk_check_router)

# Market Snapshot WORM store (owns /v1/market-snapshots)
from app.api.routes.v1_market_snapshots import router as v1_market_snapshots_router

router.include_router(v1_market_snapshots_router)

# Company governance settings (owns /v1/company)
from app.api.routes.v1_company_settings import router as v1_company_settings_router

router.include_router(v1_company_settings_router)

# RPT-04 + RPT-06: Report persistence & scheduling (owns /v1/reports)
from app.api.routes.v1_reports import router as v1_reports_router

router.include_router(v1_reports_router)

# Multi-currency calculate endpoint (owns /v1/calculate/multi)
from app.api.routes.v1_calculate_multi import router as v1_calculate_multi_router

router.include_router(v1_calculate_multi_router)

# UI endpoints: onboarding summary + user UI preferences (owns /v1/ui)
from app.api.routes.v1_ui import router as v1_ui_router

router.include_router(v1_ui_router)

# Admin demo-data reset + MXN001 SMB auto-seed (owns /v1/admin/reset)
from app.api.routes.v1_admin_reset import router as v1_admin_reset_router

router.include_router(v1_admin_reset_router)

# Voice Agent — OpenAI Realtime bridge (owns /v1/voice)
from app.api.routes.voice_agent import router as voice_agent_router

router.include_router(voice_agent_router)

# Audit Lab — FX transaction audit (owns /v1/audit-lab)
from app.api.routes.v1_audit_lab import router as v1_audit_lab_router

router.include_router(v1_audit_lab_router)

# Decision Desk — hedge action generation (owns /v1/decisions)
from app.api.routes.v1_decision_desk import router as v1_decision_desk_router

router.include_router(v1_decision_desk_router)

# Passwordless auth — email OTP for Free-tier users (owns /auth/passwordless)
from app.api.routes.auth_passwordless import router as auth_passwordless_router

router.include_router(auth_passwordless_router)

# Position Import (institutional CSV pipeline, owns /v1/positions/import)
from app.api.routes.v1_position_import import router as v1_position_import_router
router.include_router(v1_position_import_router)

# Risk Analytics (margin, concentration, hedge effectiveness — owns /v1/risk)
from app.api.routes.v1_risk_analytics import router as v1_risk_analytics_router
router.include_router(v1_risk_analytics_router)

# Hedge Effectiveness — IFRS 9 / ASC 815 testing (owns /v1/hedge-effectiveness)
from app.api.routes.v1_hedge_effectiveness import router as v1_hedge_effectiveness_router
router.include_router(v1_hedge_effectiveness_router)

__all__ = ["router"]

# Superuser admin — tenants (owns /v1/admin/tenants)
from app.api.routes.v1_admin_tenants import router as v1_admin_tenants_router
router.include_router(v1_admin_tenants_router)

# Superuser admin — metrics + activity feed (owns /v1/admin/metrics, /v1/admin/activity)
from app.api.routes.v1_admin_metrics import router as v1_admin_metrics_router
router.include_router(v1_admin_metrics_router)

# Superuser admin — system config (owns /v1/admin/config)
from app.api.routes.v1_admin_config import router as v1_admin_config_router
router.include_router(v1_admin_config_router)

# Superuser admin — cross-tenant user management (owns /v1/admin/users)
from app.api.routes.v1_admin_users import router as v1_admin_users_router
router.include_router(v1_admin_users_router)

# Superuser admin — monitoring dashboard (owns /v1/admin/monitor)
from app.api.routes.v1_admin_monitor import router as v1_admin_monitor_router
router.include_router(v1_admin_monitor_router)

# DevOps dashboard — Claude Code memory.db state (owns /v1/devops)
from app.api.routes.v1_devops import router as v1_devops_router
router.include_router(v1_devops_router)

# Forward curve snapshots (owns /v1/forward-curves)
from app.api.routes.v1_forward_curves import router as v1_forward_curves_router
router.include_router(v1_forward_curves_router)

# Volatility snapshots (owns /v1/volatility-snapshots)
from app.api.routes.v1_volatility_snapshots import router as v1_volatility_snapshots_router
router.include_router(v1_volatility_snapshots_router)

# Geopolitical risk snapshots (owns /v1/geo-snapshots)
from app.api.routes.v1_geo_snapshots import router as v1_geo_snapshots_router
router.include_router(v1_geo_snapshots_router)
