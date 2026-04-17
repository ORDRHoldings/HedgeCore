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

# Voice Agent — Claude-based text chat (legacy, kept as fallback)
from app.api.routes.voice_agent import router as voice_agent_router

router.include_router(voice_agent_router)

# Voice Token — OpenAI Realtime ephemeral token endpoint (owns /v1/voice/token)
from app.api.routes.v1_voice_token import router as v1_voice_token_router

router.include_router(v1_voice_token_router)

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

# Chart data — OHLCV bars for charting platform (owns /v1/chart-data)
from app.api.routes.v1_chart_data import router as v1_chart_data_router
router.include_router(v1_chart_data_router)

# Public chart data — unauthenticated, rate-limited (owns /v1/public/chart-data)
from app.api.routes.v1_public_chart_data import router as v1_public_chart_data_router
router.include_router(v1_public_chart_data_router)

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

# Market data admin (owns /v1/market-data)
from app.api.routes.v1_market_data_admin import router as v1_market_data_admin_router
router.include_router(v1_market_data_admin_router)

# Equity snapshots (owns /v1/equity-snapshots)
from app.api.routes.v1_equity_snapshots import router as v1_equity_snapshots_router
router.include_router(v1_equity_snapshots_router)

# IBKR Gateway integration (owns /v1/ibkr)
from app.api.routes.v1_ibkr import router as v1_ibkr_router
router.include_router(v1_ibkr_router)

# Live market data from IBKR (owns /v1/market-data/live)
from app.api.routes.v1_market_data_live import router as v1_market_data_live_router
router.include_router(v1_market_data_live_router)

# WebSocket: real-time market streaming for ORDR Market charting app (owns /ws/market)
from app.api.routes.v1_ws_market import router as v1_ws_market_router
router.include_router(v1_ws_market_router)

# Regulatory LEI & framework settings (owns /v1/settings/regulatory)
from app.api.routes.v1_regulatory_settings import router as v1_regulatory_settings_router
router.include_router(v1_regulatory_settings_router)

# User watchlists — backend-persisted symbol lists (owns /v1/watchlists)
from app.api.routes.v1_watchlists import router as v1_watchlists_router
router.include_router(v1_watchlists_router)

# HedgeWiki integration proxy (owns /v1/hedgewiki)
from app.api.routes.v1_hedgewiki import router as v1_hedgewiki_router
router.include_router(v1_hedgewiki_router)

# Stripe billing webhook (owns /v1/billing) — public, no JWT required
from app.api.routes.v1_billing import router as v1_billing_router
router.include_router(v1_billing_router)

# Self-service signup (owns /v1/signup) — public, no JWT required
from app.api.routes.v1_signup import router as v1_signup_router
router.include_router(v1_signup_router)

# GDPR data rights — right of access + right to erasure (owns /v1/user)
from app.api.routes.v1_user_gdpr import router as gdpr_router
router.include_router(gdpr_router)

# Webhooks — per-tenant outbound event delivery (owns /v1/webhooks)
from app.api.routes.v1_webhooks import router as v1_webhooks_router
router.include_router(v1_webhooks_router)

# GL Journal Entry workflow (owns /v1/gl)
from app.api.routes.v1_gl import router as v1_gl_router
router.include_router(v1_gl_router)

# ERP live pull (owns /v1/erp)
from app.api.routes.v1_erp import router as v1_erp_router
router.include_router(v1_erp_router)

# Settlement tracking (owns /v1/settlement)
from app.api.routes.v1_settlement import router as v1_settlement_router
router.include_router(v1_settlement_router)

# Treasury Suite Phase 2a — Cash & Banking (owns /v1/cash/*)
from app.api.routes.v1_legal_entities import router as v1_legal_entities_router
from app.api.routes.v1_bank_accounts import router as v1_bank_accounts_router
from app.api.routes.v1_cash_positions import router as v1_cash_positions_router
from app.api.routes.v1_bank_connections import router as v1_bank_connections_router
from app.api.routes.v1_cash_audit import router as v1_cash_audit_router

router.include_router(v1_legal_entities_router)
router.include_router(v1_bank_accounts_router)
router.include_router(v1_cash_positions_router)
router.include_router(v1_bank_connections_router)
router.include_router(v1_cash_audit_router)

# Treasury Suite Phase 2b — Cash Flow Forecasting (owns /v1/cash/forecast/*)
from app.api.routes.v1_cash_forecast import router as v1_cash_forecast_router
router.include_router(v1_cash_forecast_router)

# Treasury Suite Phase 2c — Intercompany Netting (owns /v1/cash/netting/*)
from app.api.routes.v1_cash_netting import router as v1_cash_netting_router
router.include_router(v1_cash_netting_router)

# Treasury Suite Phase 2d — Bank Statement Import (owns /v1/cash/statements/*)
from app.api.routes.v1_cash_statements import router as v1_cash_statements_router
router.include_router(v1_cash_statements_router)

# Treasury Suite Phase 2e — Auto-Reconciliation (owns /v1/cash/reconciliation/*)
from app.api.routes.v1_cash_reconciliation import router as v1_cash_reconciliation_router
router.include_router(v1_cash_reconciliation_router)

# Treasury Suite Phase 2f — Cash Pool & Multi-Entity (owns /v1/cash/pools/*)
from app.api.routes.v1_cash_pools import router as v1_cash_pools_router
router.include_router(v1_cash_pools_router)

# Treasury Suite Phase 2g — Payment Initiation (owns /v1/payments/*)
from app.api.routes.v1_payments import router as v1_payments_router
router.include_router(v1_payments_router)

# Treasury Suite Phase 3 — Intelligence Tier (owns /v1/intelligence/*)
from app.api.routes.v1_intelligence import router as v1_intelligence_router
router.include_router(v1_intelligence_router)

# Phase 4 — Debt Management + IR Risk
from app.api.routes.v1_debt import router as v1_debt_router
router.include_router(v1_debt_router)

from app.api.routes.v1_ir_risk import router as v1_ir_risk_router
router.include_router(v1_ir_risk_router)
