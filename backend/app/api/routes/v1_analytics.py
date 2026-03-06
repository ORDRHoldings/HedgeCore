"""
app/api/routes/v1_analytics.py  # v2

Portfolio risk analytics — derived from live positions/exposure data.

GET /v1/analytics/portfolio   — currency exposure, coverage, risk heatmap
GET /v1/analytics/scenarios   — VaR scenarios using historical shocks
"""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(prefix="/v1/analytics", tags=["v1-analytics"])

_FX_SHOCKS: dict[str, dict] = {
    "MXN": {"shock_1w_99": 0.068, "vol_ann": 0.142, "carry": -0.032, "liquidity": "HIGH"},
    "EUR": {"shock_1w_99": 0.032, "vol_ann": 0.078, "carry": 0.012, "liquidity": "VERY_HIGH"},
    "GBP": {"shock_1w_99": 0.041, "vol_ann": 0.095, "carry": 0.008, "liquidity": "VERY_HIGH"},
    "JPY": {"shock_1w_99": 0.028, "vol_ann": 0.071, "carry": -0.055, "liquidity": "VERY_HIGH"},
    "BRL": {"shock_1w_99": 0.092, "vol_ann": 0.198, "carry": -0.082, "liquidity": "MEDIUM"},
    "CNY": {"shock_1w_99": 0.018, "vol_ann": 0.038, "carry": -0.015, "liquidity": "HIGH"},
    "INR": {"shock_1w_99": 0.031, "vol_ann": 0.065, "carry": -0.042, "liquidity": "HIGH"},
    "ZAR": {"shock_1w_99": 0.089, "vol_ann": 0.189, "carry": -0.071, "liquidity": "MEDIUM"},
    "CAD": {"shock_1w_99": 0.029, "vol_ann": 0.068, "carry": 0.005, "liquidity": "VERY_HIGH"},
    "AUD": {"shock_1w_99": 0.038, "vol_ann": 0.088, "carry": 0.003, "liquidity": "VERY_HIGH"},
    "CHF": {"shock_1w_99": 0.024, "vol_ann": 0.062, "carry": 0.022, "liquidity": "VERY_HIGH"},
    "TRY": {"shock_1w_99": 0.148, "vol_ann": 0.312, "carry": -0.145, "liquidity": "MEDIUM"},
}

_SCENARIO_SHOCKS = [
    {"name": "2020 COVID Flash Crash", "date": "Mar 2020", "em_shock": -0.182, "dm_shock": -0.087, "color": "#DC2626"},
    {"name": "2022 USD Surge", "date": "Sep 2022", "em_shock": -0.134, "dm_shock": -0.071, "color": "#D97706"},
    {"name": "2015 EM Selloff", "date": "Aug 2015", "em_shock": -0.121, "dm_shock": -0.052, "color": "#F59E0B"},
    {"name": "2018 EM Crisis", "date": "Aug 2018", "em_shock": -0.098, "dm_shock": -0.038, "color": "#6366F1"},
    {"name": "2016 GBP Brexit", "date": "Jun 2016", "em_shock": -0.065, "dm_shock": -0.112, "color": "#8B5CF6"},
    {"name": "Base Case (+1sigma)", "date": "1M horizon", "em_shock": -0.042, "dm_shock": -0.028, "color": "#059669"},
]

_EM_CURRENCIES = {"MXN", "BRL", "INR", "ZAR", "TRY", "CNY", "COP", "PHP", "THB", "IDR"}


@router.get("/portfolio")
async def get_portfolio_analytics(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Portfolio risk analytics derived from live positions."""
    exposure_rows = await session.execute(text("""
        SELECT currency,
               COALESCE(SUM(notional_usd) FILTER (WHERE status NOT IN ('REJECTED','CANCELLED')), 0) AS gross_usd,
               COALESCE(SUM(notional_usd) FILTER (WHERE status IN ('HEDGED')), 0) AS hedged_usd,
               COUNT(*) FILTER (WHERE status NOT IN ('REJECTED','CANCELLED')) AS cnt
        FROM positions
        WHERE company_id = :cid
        GROUP BY currency
        ORDER BY gross_usd DESC
    """), {"cid": str(current_user.company_id)})
    rows = exposure_rows.fetchall()

    total_gross = sum(float(r[1]) for r in rows)
    total_hedged = sum(float(r[2]) for r in rows)

    currencies = []
    for r in rows:
        ccy = r[0]
        gross = float(r[1])
        hedged = float(r[2])
        count = int(r[3])
        shock = _FX_SHOCKS.get(ccy, {"shock_1w_99": 0.05, "vol_ann": 0.12, "carry": 0.0, "liquidity": "MEDIUM"})
        unhedged = gross - hedged
        currencies.append({
            "currency": ccy,
            "gross_exposure_usd": round(gross, 2),
            "hedged_usd": round(hedged, 2),
            "unhedged_usd": round(unhedged, 2),
            "hedge_ratio": round(hedged / gross, 4) if gross > 0 else 0.0,
            "weight_pct": round(gross / total_gross * 100, 2) if total_gross > 0 else 0.0,
            "var_99_1w": round(gross * shock["shock_1w_99"], 2),
            "unhedged_var_99": round(unhedged * shock["shock_1w_99"], 2),
            "vol_ann": shock["vol_ann"],
            "carry": shock["carry"],
            "liquidity": shock["liquidity"],
            "position_count": count,
            "is_em": ccy in _EM_CURRENCIES,
        })

    portfolio_var = sum(c["unhedged_var_99"] for c in currencies)

    heatmap = []
    for c in currencies[:10]:
        ccy = c["currency"]
        shock = _FX_SHOCKS.get(ccy, {"shock_1w_99": 0.05, "vol_ann": 0.12, "carry": 0.0, "liquidity": "MEDIUM"})
        heatmap.append({
            "currency": ccy,
            "directional": round(min(c["unhedged_usd"] / max(total_gross, 1), 1.0), 4),
            "volatility": round(min(shock["vol_ann"] / 0.35, 1.0), 4),
            "liquidity": {"VERY_HIGH": 0.1, "HIGH": 0.25, "MEDIUM": 0.6, "LOW": 0.9}.get(shock["liquidity"], 0.5),
            "carry": round(min(abs(shock["carry"]) / 0.20, 1.0), 4),
            "tenor": 0.4,
        })

    run_rows = await session.execute(text("""
        SELECT DATE_TRUNC('day', created_at)::date AS day, COUNT(*) AS runs
        FROM calculation_runs
        WHERE company_id = :cid AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY day ORDER BY day
    """), {"cid": str(current_user.company_id)})
    run_history = [{"date": str(r[0]), "runs": int(r[1])} for r in run_rows.fetchall()]

    return {
        "as_of": datetime.now(UTC).isoformat(),
        "summary": {
            "total_exposure_usd": round(total_gross, 2),
            "total_hedged_usd": round(total_hedged, 2),
            "total_unhedged_usd": round(total_gross - total_hedged, 2),
            "portfolio_hedge_ratio": round(total_hedged / total_gross, 4) if total_gross > 0 else 0.0,
            "currency_count": len(currencies),
            "var_99_1w_undiversified": round(portfolio_var, 2),
            "var_99_1w_diversified": round(portfolio_var * 0.72, 2),
        },
        "currencies": currencies,
        "heatmap": heatmap,
        "run_history": run_history,
    }


@router.get("/scenarios")
async def get_scenario_analysis(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Historical stress scenario P&L impact on unhedged exposure."""
    exposure_rows = await session.execute(text("""
        SELECT currency,
               COALESCE(SUM(notional_usd) FILTER (WHERE status NOT IN ('REJECTED','CANCELLED','HEDGED')), 0) AS unhedged_usd
        FROM positions
        WHERE company_id = :cid
        GROUP BY currency
    """), {"cid": str(current_user.company_id)})
    rows = exposure_rows.fetchall()

    total_em = sum(float(r[1]) for r in rows if r[0] in _EM_CURRENCIES)
    total_dm = sum(float(r[1]) for r in rows if r[0] not in _EM_CURRENCIES)

    scenarios = []
    for sc in _SCENARIO_SHOCKS:
        em_pnl = total_em * sc["em_shock"]
        dm_pnl = total_dm * sc["dm_shock"]
        total_pnl = em_pnl + dm_pnl
        hedged_pnl = total_pnl * 0.43  # assuming ~57% hedge ratio
        scenarios.append({
            "name": sc["name"],
            "date": sc["date"],
            "color": sc["color"],
            "unhedged_pnl": round(total_pnl, 2),
            "hedged_pnl": round(hedged_pnl, 2),
            "hedge_benefit": round(total_pnl - hedged_pnl, 2),
            "em_pnl": round(em_pnl, 2),
            "dm_pnl": round(dm_pnl, 2),
            "em_shock_pct": round(sc["em_shock"] * 100, 2),
            "dm_shock_pct": round(sc["dm_shock"] * 100, 2),
        })

    currency_impacts = []
    for r in rows:
        ccy = r[0]
        unhedged = float(r[1])
        shock = _FX_SHOCKS.get(ccy, {"shock_1w_99": 0.05})
        is_em = ccy in _EM_CURRENCIES
        worst = _SCENARIO_SHOCKS[0]["em_shock"] if is_em else _SCENARIO_SHOCKS[0]["dm_shock"]
        currency_impacts.append({
            "currency": ccy,
            "unhedged_usd": round(unhedged, 2),
            "worst_case_pnl": round(unhedged * worst, 2),
            "var_99_1w": round(unhedged * shock["shock_1w_99"], 2),
            "is_em": is_em,
        })

    return {
        "as_of": datetime.now(UTC).isoformat(),
        "scenarios": scenarios,
        "currency_impacts": sorted(currency_impacts, key=lambda x: x["worst_case_pnl"]),
        "total_em_unhedged": round(total_em, 2),
        "total_dm_unhedged": round(total_dm, 2),
    }
