# backend/tests/test_ir_hedge_service.py
import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch


def test_run_effectiveness_test_writes_worm_run():
    from app.services.ir_hedge_service import run_effectiveness_test

    async def run():
        session = AsyncMock()
        session.add = MagicMock()
        session.flush = AsyncMock()

        swap_id = uuid.uuid4()
        facility_id = uuid.uuid4()
        tenant_id = uuid.uuid4()

        with patch("app.services.ir_hedge_service._get_latest_run_hash", new_callable=AsyncMock, return_value="0" * 64):
            with patch("app.services.ir_hedge_service._build_fv_series", new_callable=AsyncMock, return_value=([-100.0], [95.0])):
                with patch("app.services.ir_hedge_service.emit_audit_event", new_callable=AsyncMock):
                    result = await run_effectiveness_test(
                        session,
                        swap_id=swap_id,
                        facility_id=facility_id,
                        tenant_id=tenant_id,
                        method="DOLLAR_OFFSET",
                    )
        session.add.assert_called_once()  # IRHedgeRun was written
        assert result["passed"] in (True, False)
        assert "ratio" in result

    asyncio.run(run())


def test_get_hedge_ratio_returns_dv01_ratio():
    from app.services.ir_hedge_service import get_hedge_ratio
    from app.models.ir_risk import IRSwap

    async def run():
        session = AsyncMock()
        fake_swap = MagicMock(spec=IRSwap)
        fake_swap.last_dv01 = -4500.0
        session.get = AsyncMock(return_value=fake_swap)

        with patch("app.services.ir_hedge_service._get_facility_dv01", new_callable=AsyncMock, return_value=-5000.0):
            ratio = await get_hedge_ratio(session, swap_id=uuid.uuid4(), facility_id=uuid.uuid4(), tenant_id=uuid.uuid4())
        assert abs(ratio - 0.9) < 0.01

    asyncio.run(run())
