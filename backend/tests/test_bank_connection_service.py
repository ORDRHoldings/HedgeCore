# backend/tests/test_bank_connection_service.py
"""Unit tests for bank_connection_service — OAuth flow and circuit-breaker."""
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.models.cash import BankConnectionStatus


@pytest.mark.asyncio
async def test_circuit_breaker_trips_after_3_failures(monkeypatch):
    """After 3 consecutive failures, connection status becomes ERROR."""
    monkeypatch.setenv("BANK_ACCOUNT_ENC_KEY", "test-bank-enc-key-at-least-32-bytes-long!!")
    from app.services.bank_connection_service import _handle_pull_failure

    connection = MagicMock()
    connection.consecutive_failure_count = 2  # about to hit 3
    connection.status = BankConnectionStatus.ACTIVE.value

    _handle_pull_failure(connection, "Timeout error")

    assert connection.consecutive_failure_count == 3
    assert connection.status == BankConnectionStatus.ERROR.value
    assert connection.last_error_message == "Timeout error"


@pytest.mark.asyncio
async def test_circuit_breaker_resets_on_success():
    """Successful pull resets consecutive_failure_count to 0."""
    from app.services.bank_connection_service import _handle_pull_success

    connection = MagicMock()
    connection.consecutive_failure_count = 2
    connection.status = BankConnectionStatus.ACTIVE.value

    _handle_pull_success(connection)

    assert connection.consecutive_failure_count == 0
    assert connection.status == BankConnectionStatus.ACTIVE.value


@pytest.mark.asyncio
async def test_get_auth_url_generates_state_with_expiry(monkeypatch):
    """get_auth_url stores pending_oauth_state with 5-minute expiry."""
    monkeypatch.setenv("BANK_ACCOUNT_ENC_KEY", "test-bank-enc-key-at-least-32-bytes-long!!")
    from app.services.bank_connection_service import get_auth_url

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    mock_adapter = MagicMock()
    mock_adapter.get_auth_url.return_value = "https://auth.truelayer.com/?response_type=code&state=xyz"

    with patch("app.services.bank_connection_service._get_adapter", return_value=mock_adapter):
        url, connection = await get_auth_url(
            mock_session,
            provider="TRUELAYER",
            company_id=company_id,
            redirect_uri="https://example.com/callback",
            created_by=actor_id,
        )

    assert connection.pending_oauth_state is not None
    assert len(connection.pending_oauth_state) > 16
    assert connection.pending_oauth_state_expires_at > datetime.now(UTC)
    mock_session.add.assert_called_once()


@pytest.mark.asyncio
async def test_error_message_is_truncated_to_500_chars():
    """Error messages never exceed 500 chars (prevents token fragment leakage)."""
    from app.services.bank_connection_service import _handle_pull_failure

    connection = MagicMock()
    connection.consecutive_failure_count = 0
    connection.status = BankConnectionStatus.ACTIVE.value

    long_error = "x" * 1000
    _handle_pull_failure(connection, long_error)

    assert len(connection.last_error_message) <= 500


@pytest.mark.asyncio
async def test_handle_callback_enforces_sod():
    """handle_callback raises ValueError when approver is the same user who initiated the OAuth flow."""
    from app.services.bank_connection_service import handle_callback

    creator_id = uuid.uuid4()
    mock_session = AsyncMock()
    connection = MagicMock()
    connection.pending_oauth_state = "valid_state"
    connection.pending_oauth_state_expires_at = datetime.now(UTC) + timedelta(minutes=5)
    connection.created_by = creator_id  # same user trying to approve → SoD violation

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = connection
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(ValueError, match="SoD"):
        await handle_callback(
            mock_session,
            state="valid_state",
            code="auth_code",
            company_id=uuid.uuid4(),
            created_by=creator_id,  # same as connection.created_by
        )
