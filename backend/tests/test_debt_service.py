# backend/tests/test_debt_service.py
"""Service tests for debt_service — AsyncMock, no real DB."""
import asyncio
import uuid
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch


def test_create_facility_posts_audit_event():
    """create_facility must emit an audit event."""
    from app.services.debt_service import create_facility

    async def run():
        session = AsyncMock()
        session.add = MagicMock()
        session.flush = AsyncMock()
        session.refresh = AsyncMock()

        tenant_id = uuid.uuid4()
        spec = {
            "facility_type": "TERM_LOAN", "counterparty": "TestBank",
            "currency": "USD", "committed_amount": 1_000_000.0,
            "margin_bps": 150, "rate_index": "SOFR",
            "maturity_date": date(2028, 1, 1),
            "day_count": "ACT365", "payment_frequency": "QUARTERLY",
            "repayment_type": "BULLET",
        }

        with patch("app.services.debt_service.emit_audit_event", new_callable=AsyncMock) as mock_emit:
            await create_facility(session, tenant_id=tenant_id, spec=spec)
            mock_emit.assert_called_once()
            call_kwargs = mock_emit.call_args[1]
            assert "DEBT_FACILITY_CREATED" in str(call_kwargs.get("event_type", ""))

    asyncio.run(run())


def test_record_drawdown_updates_drawn_amount():
    """record_drawdown must update facility.drawn_amount."""
    from app.services.debt_service import record_drawdown
    from app.models.debt import DebtFacility

    async def run():
        session = AsyncMock()
        session.add = MagicMock()
        facility_id = uuid.uuid4()
        tenant_id = uuid.uuid4()

        fake_facility = MagicMock(spec=DebtFacility)
        fake_facility.drawn_amount = 0.0
        fake_facility.committed_amount = 1_000_000.0
        fake_facility.id = facility_id
        fake_facility.tenant_id = tenant_id

        session.get = AsyncMock(return_value=fake_facility)
        session.flush = AsyncMock()

        with patch("app.services.debt_service.emit_audit_event", new_callable=AsyncMock):
            await record_drawdown(
                session, facility_id=facility_id, tenant_id=tenant_id,
                amount=250_000.0, drawdown_date=date(2026, 4, 17),
            )
        assert fake_facility.drawn_amount == 250_000.0

    asyncio.run(run())


def test_check_covenants_sets_breach_status():
    """check_covenants updates DebtCovenant status to BREACH when triggered."""
    from app.services.debt_service import check_covenants
    from app.models.debt import DebtCovenant

    async def run():
        session = AsyncMock()
        session.add = MagicMock()
        facility_id = uuid.uuid4()

        breach_cov = MagicMock(spec=DebtCovenant)
        breach_cov.covenant_type = "DSCR"
        breach_cov.threshold = 1.5
        breach_cov.current_value = 1.1
        breach_cov.status = "COMPLIANT"

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [breach_cov]
        session.execute = AsyncMock(return_value=mock_result)
        session.flush = AsyncMock()

        with patch("app.services.debt_service.emit_audit_event", new_callable=AsyncMock):
            await check_covenants(session, facility_id=facility_id, tenant_id=uuid.uuid4())

        assert breach_cov.status == "BREACH"

    asyncio.run(run())
