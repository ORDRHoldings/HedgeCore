# backend/tests/test_forecast_service.py
"""Service-layer tests for forecast_service — AsyncMock DB session."""
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_get_forecast_returns_buckets():
    """get_forecast gathers data and returns forecast buckets."""
    from app.services.forecast_service import get_forecast

    mock_session = AsyncMock()
    company_id = uuid.uuid4()

    with patch("app.services.forecast_service._get_opening_balances",
               new_callable=AsyncMock, return_value={"EUR": Decimal("100000")}), \
         patch("app.services.forecast_service._get_recurring_flows",
               new_callable=AsyncMock, return_value=[]), \
         patch("app.services.forecast_service._get_settlement_flows",
               new_callable=AsyncMock, return_value=[]), \
         patch("app.services.forecast_service._get_gap_threshold",
               new_callable=AsyncMock, return_value=Decimal("0")):
        result = await get_forecast(
            mock_session,
            company_id=company_id,
            entity_id=None,
            horizon="13w",
            as_of_date=date(2026, 4, 13),
        )

    assert len(result) == 13
    assert Decimal(str(result[0]["opening_balance"])) == Decimal("100000")


@pytest.mark.asyncio
async def test_create_forecast_item():
    """create_forecast_item stores a new recurring item."""
    from app.services.forecast_service import create_forecast_item

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    payload = {
        "label": "Monthly rent",
        "direction": "OUTFLOW",
        "amount": Decimal("5000"),
        "currency": "EUR",
        "confidence": "COMMITTED",
        "recurrence": "MONTHLY",
        "start_date": date(2026, 4, 1),
        "end_date": None,
        "day_of_month": 1,
        "entity_id": None,
        "account_id": None,
    }

    with patch("app.services.forecast_service.append_event", new_callable=AsyncMock):
        item = await create_forecast_item(
            mock_session, company_id=company_id, payload=payload, created_by=actor_id,
        )

    assert item.label == "Monthly rent"
    assert item.direction == "OUTFLOW"
    mock_session.add.assert_called_once()


@pytest.mark.asyncio
async def test_run_scenario():
    """run_scenario applies shifts and returns modified forecast."""
    from app.services.forecast_service import run_scenario

    mock_session = AsyncMock()
    company_id = uuid.uuid4()

    with patch("app.services.forecast_service._get_opening_balances",
               new_callable=AsyncMock, return_value={"EUR": Decimal("100000")}), \
         patch("app.services.forecast_service._get_recurring_flows",
               new_callable=AsyncMock, return_value=[
                   {"date": date(2026, 4, 14), "amount": Decimal("10000"), "direction": "INFLOW",
                    "currency": "EUR", "confidence": "COMMITTED", "label": "Recv"},
               ]), \
         patch("app.services.forecast_service._get_settlement_flows",
               new_callable=AsyncMock, return_value=[]), \
         patch("app.services.forecast_service._get_gap_threshold",
               new_callable=AsyncMock, return_value=Decimal("0")), \
         patch("app.services.forecast_service.append_event", new_callable=AsyncMock):
        result = await run_scenario(
            mock_session,
            company_id=company_id,
            entity_id=None,
            horizon="13w",
            scenario={"inflow_shift": Decimal("-0.50")},
            created_by=uuid.uuid4(),
        )

    assert Decimal(str(result[0]["inflows"])) == Decimal("5000")


@pytest.mark.asyncio
async def test_get_liquidity_gaps():
    """get_liquidity_gaps returns only periods where closing < threshold."""
    from app.services.forecast_service import get_liquidity_gaps

    mock_session = AsyncMock()
    company_id = uuid.uuid4()

    with patch("app.services.forecast_service._get_opening_balances",
               new_callable=AsyncMock, return_value={"EUR": Decimal("10000")}), \
         patch("app.services.forecast_service._get_recurring_flows",
               new_callable=AsyncMock, return_value=[
                   {"date": date(2026, 4, 14), "amount": Decimal("20000"), "direction": "OUTFLOW",
                    "currency": "EUR", "confidence": "COMMITTED", "label": "Big payment"},
               ]), \
         patch("app.services.forecast_service._get_settlement_flows",
               new_callable=AsyncMock, return_value=[]), \
         patch("app.services.forecast_service._get_gap_threshold",
               new_callable=AsyncMock, return_value=Decimal("5000")):
        gaps = await get_liquidity_gaps(
            mock_session,
            company_id=company_id,
            entity_id=None,
            gap_threshold=Decimal("5000"),
        )

    assert len(gaps) >= 1
    assert gaps[0]["shortfall"] < 0
