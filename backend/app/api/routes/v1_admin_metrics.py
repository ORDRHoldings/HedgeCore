"""
app/api/routes/v1_admin_metrics.py

Superuser-only platform metrics and activity feed.

Endpoints:
  GET /v1/admin/metrics          — platform KPIs (signups, DAU, conversions)
  GET /v1/admin/metrics/funnel   — conversion funnel data
  GET /v1/admin/activity         — live activity feed (last N audit events, cross-tenant)

All endpoints: superuser only. Non-superusers get 404.
"""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.dependencies import require_superuser
from app.models.user import User

router = APIRouter(prefix="/v1/admin", tags=["v1-admin-metrics"])
# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/metrics")
async def get_metrics(
    days: int = Query(default=30, ge=1, le=365),
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> dict:
    """Platform-wide KPIs. Superuser only."""
    since = datetime.now(UTC) - timedelta(days=days)

    # Total signups (all time)
    total_users = (await session.execute(text("SELECT COUNT(*) FROM users"))).scalar() or 0

    # Signups in window
    signups_window = (await session.execute(
        text("SELECT COUNT(*) FROM users WHERE created_at >= :since"),
        {"since": since},
    )).scalar() or 0

    # Distinct active users in window (users with audit events or calculation runs)
    dau = (await session.execute(
        text("""
            SELECT COUNT(DISTINCT actor_id) FROM audit_events
            WHERE created_at >= :since AND actor_id IS NOT NULL
        """),
        {"since": since},
    )).scalar() or 0

    # Total companies
    total_companies = (await session.execute(text("SELECT COUNT(*) FROM companies"))).scalar() or 0

    # SMB+ companies
    smb_companies = (await session.execute(
        text("SELECT COUNT(*) FROM companies WHERE (settings->>'plan_tier') IN ('smb', 'professional', 'enterprise')")
    )).scalar() or 0

    # Enterprise companies
    enterprise_companies = (await session.execute(
        text("SELECT COUNT(*) FROM companies WHERE (settings->>'plan_tier') = 'enterprise'")
    )).scalar() or 0

    # Free (lite) users — users with no company OR company with plan_tier=lite
    free_users = (await session.execute(
        text("""
            SELECT COUNT(*) FROM users u
            LEFT JOIN companies c ON c.id = u.company_id
            WHERE u.company_id IS NULL OR (c.settings->>'plan_tier') = 'lite'
        """)
    )).scalar() or 0

    # Calculation runs in window
    calc_runs = (await session.execute(
        text("SELECT COUNT(*) FROM calculation_runs WHERE created_at >= :since"),
        {"since": since},
    )).scalar() or 0

    # Audit lab runs in window (if table exists)
    audit_runs = 0
    try:
        audit_runs = (await session.execute(
            text("SELECT COUNT(*) FROM audit_runs WHERE created_at >= :since"),
            {"since": since},
        )).scalar() or 0
    except Exception:
        pass

    return {
        "period_days": days,
        "total_users": int(total_users),
        "signups_in_period": int(signups_window),
        "active_users_in_period": int(dau),
        "total_companies": int(total_companies),
        "smb_companies": int(smb_companies),
        "enterprise_companies": int(enterprise_companies),
        "free_users": int(free_users),
        "calc_runs_in_period": int(calc_runs),
        "audit_runs_in_period": int(audit_runs),
        # Stub metrics (no billing table yet)
        "mrr_usd": 0,
        "conversions_in_period": 0,
    }
@router.get("/metrics/funnel")
async def get_funnel(
    days: int = Query(default=30, ge=1, le=365),
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> dict:
    """Conversion funnel: signup → upload → audit → SMB → paid. Superuser only."""
    since = datetime.now(UTC) - timedelta(days=days)

    signup_count = (await session.execute(
        text("SELECT COUNT(*) FROM users WHERE created_at >= :since"),
        {"since": since},
    )).scalar() or 0

    upload_count = 0
    audit_complete = 0
    try:
        upload_count = (await session.execute(
            text("SELECT COUNT(DISTINCT uploaded_by) FROM audit_datasets WHERE created_at >= :since"),
            {"since": since},
        )).scalar() or 0

        audit_complete = (await session.execute(
            text("""
                SELECT COUNT(DISTINCT d.uploaded_by) FROM audit_runs r
                JOIN audit_datasets d ON d.id = r.dataset_id
                WHERE r.status = 'completed' AND r.created_at >= :since
            """),
            {"since": since},
        )).scalar() or 0
    except Exception:
        pass

    # SMB+ users created in window (proxy for conversions)
    smb_conversions = (await session.execute(
        text("""
            SELECT COUNT(DISTINCT u.id) FROM users u
            JOIN companies c ON c.id = u.company_id
            WHERE (c.settings->>'plan_tier') IN ('smb', 'professional', 'enterprise')
            AND u.created_at >= :since
        """),
        {"since": since},
    )).scalar() or 0

    return {
        "period_days": days,
        "steps": [
            {"label": "Signup", "count": int(signup_count), "pct": 100},
            {"label": "Upload Data", "count": int(upload_count), "pct": round(int(upload_count) / max(1, int(signup_count)) * 100)},
            {"label": "Audit Complete", "count": int(audit_complete), "pct": round(int(audit_complete) / max(1, int(signup_count)) * 100)},
            {"label": "SMB Conversion", "count": int(smb_conversions), "pct": round(int(smb_conversions) / max(1, int(signup_count)) * 100)},
            {"label": "Paid", "count": 0, "pct": 0},  # no billing table yet
        ],
    }
@router.get("/activity")
async def get_activity(
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> list[dict]:
    """Live cross-tenant activity feed from audit_events. Superuser only."""
    rows = await session.execute(
        text("""
            SELECT
                ae.id,
                ae.event_type,
                ae.description,
                ae.entity_type,
                ae.entity_id,
                ae.actor_id,
                ae.actor_email,
                ae.created_at,
                ae.event_hash,
                c.name AS company_name
            FROM audit_events ae
            LEFT JOIN companies c ON c.id = ae.company_id
            ORDER BY ae.created_at DESC
            LIMIT :lim
        """),
        {"lim": limit},
    )
    result = []
    for r in rows.fetchall():
        result.append({
            "id": str(r.id),
            "event_type": r.event_type,
            "description": r.description,
            "entity_type": r.entity_type,
            "entity_id": str(r.entity_id) if r.entity_id else None,
            "actor_id": str(r.actor_id) if r.actor_id else None,
            "actor_email": r.actor_email,
            "company_name": r.company_name,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "hash": r.event_hash[:12] + "..." if r.event_hash else None,
        })
    return result
