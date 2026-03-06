"""
tests/test_analytics_api.py

Tests for GET /v1/analytics/portfolio and GET /v1/analytics/scenarios.
Validates response schema, data consistency, and VaR calculations.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_portfolio_analytics_requires_auth(client: AsyncClient):
    """Unauthenticated request must be rejected."""
    r = await client.get("/api/v1/analytics/portfolio")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_portfolio_analytics_returns_schema(
    client: AsyncClient, auth_headers: dict
):
    """Portfolio analytics returns required top-level keys."""
    r = await client.get("/api/v1/analytics/portfolio", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "as_of" in data
    assert "summary" in data
    assert "currencies" in data
    assert "heatmap" in data
    assert "run_history" in data


@pytest.mark.asyncio
async def test_portfolio_summary_fields(
    client: AsyncClient, auth_headers: dict
):
    """Summary block contains all expected numeric fields."""
    r = await client.get("/api/v1/analytics/portfolio", headers=auth_headers)
    assert r.status_code == 200
    summary = r.json()["summary"]
    required = [
        "total_exposure_usd",
        "total_hedged_usd",
        "total_unhedged_usd",
        "portfolio_hedge_ratio",
        "currency_count",
        "var_99_1w_undiversified",
        "var_99_1w_diversified",
    ]
    for key in required:
        assert key in summary, f"Missing key: {key}"
    # Hedge ratio must be in [0, 1]
    assert 0.0 <= summary["portfolio_hedge_ratio"] <= 1.0
    # Diversified VaR <= undiversified (portfolio benefit)
    assert summary["var_99_1w_diversified"] <= summary["var_99_1w_undiversified"]
    # Basic accounting: hedged + unhedged = gross
    assert abs(
        summary["total_hedged_usd"] + summary["total_unhedged_usd"]
        - summary["total_exposure_usd"]
    ) < 1.0  # rounding tolerance


@pytest.mark.asyncio
async def test_portfolio_currency_breakdown(
    client: AsyncClient, auth_headers: dict
):
    """Currency entries contain required fields."""
    r = await client.get("/api/v1/analytics/portfolio", headers=auth_headers)
    assert r.status_code == 200
    currencies = r.json()["currencies"]
    assert isinstance(currencies, list)
    if currencies:
        c = currencies[0]
        for key in [
            "currency", "gross_exposure_usd", "hedged_usd", "unhedged_usd",
            "hedge_ratio", "weight_pct", "var_99_1w", "unhedged_var_99",
            "vol_ann", "liquidity", "position_count", "is_em",
        ]:
            assert key in c, f"Missing currency key: {key}"
        # Hedge ratio per-currency
        assert 0.0 <= c["hedge_ratio"] <= 1.0
        # VaR is always non-negative
        assert c["var_99_1w"] >= 0
        assert c["unhedged_var_99"] >= 0


@pytest.mark.asyncio
async def test_portfolio_heatmap_scores(
    client: AsyncClient, auth_headers: dict
):
    """Heatmap scores are in [0, 1]."""
    r = await client.get("/api/v1/analytics/portfolio", headers=auth_headers)
    assert r.status_code == 200
    heatmap = r.json()["heatmap"]
    assert isinstance(heatmap, list)
    for h in heatmap:
        assert "currency" in h
        for dim in ["directional", "volatility", "liquidity", "carry", "tenor"]:
            assert dim in h, f"Missing heatmap dim: {dim}"
            assert 0.0 <= h[dim] <= 1.0, f"{dim}={h[dim]} out of range"


@pytest.mark.asyncio
async def test_scenarios_requires_auth(client: AsyncClient):
    """Unauthenticated request rejected."""
    r = await client.get("/api/v1/analytics/scenarios")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_scenarios_schema(
    client: AsyncClient, auth_headers: dict
):
    """Scenario endpoint returns required keys."""
    r = await client.get("/api/v1/analytics/scenarios", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "as_of" in data
    assert "scenarios" in data
    assert "currency_impacts" in data
    assert "total_em_unhedged" in data
    assert "total_dm_unhedged" in data


@pytest.mark.asyncio
async def test_scenarios_content(
    client: AsyncClient, auth_headers: dict
):
    """Each scenario has required P&L fields and hedge benefit makes sense."""
    r = await client.get("/api/v1/analytics/scenarios", headers=auth_headers)
    assert r.status_code == 200
    scenarios = r.json()["scenarios"]
    assert isinstance(scenarios, list)
    assert len(scenarios) >= 1

    for sc in scenarios:
        for key in [
            "name", "date", "color", "unhedged_pnl", "hedged_pnl",
            "hedge_benefit", "em_shock_pct", "dm_shock_pct",
        ]:
            assert key in sc, f"Missing scenario key: {key}"

        # Hedge benefit = unhedged_pnl - hedged_pnl (loss reduction is positive)
        assert abs(sc["hedge_benefit"] - (sc["unhedged_pnl"] - sc["hedged_pnl"])) < 1.0
        # Stress scenarios: unhedged_pnl should be negative or zero
        # (positive shocks are also valid in some scenarios)


@pytest.mark.asyncio
async def test_scenarios_currency_impacts(
    client: AsyncClient, auth_headers: dict
):
    """Currency impacts have required fields and valid values."""
    r = await client.get("/api/v1/analytics/scenarios", headers=auth_headers)
    assert r.status_code == 200
    impacts = r.json()["currency_impacts"]
    assert isinstance(impacts, list)
    for ci in impacts:
        for key in ["currency", "unhedged_usd", "worst_case_pnl", "var_99_1w", "is_em"]:
            assert key in ci, f"Missing impact key: {key}"
        assert ci["unhedged_usd"] >= 0
        # VaR is always non-negative
        assert ci["var_99_1w"] >= 0
