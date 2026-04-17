# backend/tests/test_ir_swap_service.py
import asyncio
import uuid
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch


def test_mark_to_market_posts_audit_event():
    from app.services.ir_swap_service import mark_to_market
    from app.models.ir_risk import IRSwap

    async def run():
        session = AsyncMock()
        swap_id = uuid.uuid4()
        fake_swap = MagicMock(spec=IRSwap)
        fake_swap.id = swap_id
        fake_swap.tenant_id = uuid.uuid4()
        fake_swap.instrument_type = "IRS"
        fake_swap.notional = 1_000_000.0
        fake_swap.currency = "USD"
        fake_swap.fixed_rate = 0.05
        fake_swap.float_index = "SOFR"
        fake_swap.start_date = date(2026, 1, 1)
        fake_swap.maturity_date = date(2028, 1, 1)
        fake_swap.pay_fixed = True
        fake_swap.day_count = "ACT365"
        fake_swap.reset_frequency = "ANNUAL"
        fake_swap.status = "ACTIVE"
        session.get = AsyncMock(return_value=fake_swap)
        session.flush = AsyncMock()

        fake_quotes = [MagicMock(tenor="2Y", rate=0.05, instrument="OIS", index="SOFR")]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = fake_quotes
        session.execute = AsyncMock(return_value=mock_result)

        with patch("app.services.ir_swap_service.emit_audit_event", new_callable=AsyncMock) as mock_emit:
            with patch("app.services.ir_swap_service._fetch_rate_quotes", new_callable=AsyncMock, return_value=fake_quotes):
                await mark_to_market(session, swap_id=swap_id, tenant_id=fake_swap.tenant_id)
                mock_emit.assert_called_once()
                assert "IR_SWAP_MTM" in str(mock_emit.call_args[1].get("event_type", ""))

    asyncio.run(run())


def test_mark_to_market_all_is_fail_open():
    """Curve bootstrap failure must not propagate — fail-open."""
    from app.services.ir_swap_service import mark_to_market_all
    from app.models.ir_risk import IRSwap

    async def run():
        session = AsyncMock()
        fake_swap = MagicMock(spec=IRSwap)
        fake_swap.id = uuid.uuid4()
        fake_swap.tenant_id = uuid.uuid4()
        fake_swap.status = "ACTIVE"

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [fake_swap]
        session.execute = AsyncMock(return_value=mock_result)

        with patch("app.services.ir_swap_service.mark_to_market", new_callable=AsyncMock, side_effect=Exception("curve error")):
            with patch("app.services.ir_swap_service.emit_audit_event", new_callable=AsyncMock):
                result = await mark_to_market_all(session, tenant_id=uuid.uuid4())
                assert result["failed"] == 1
                assert result["succeeded"] == 0

    asyncio.run(run())
