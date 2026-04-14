"""Unit tests for bank_account_service — state machine, SoD, encryption."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.models.cash import BankAccountStatus


@pytest.mark.asyncio
async def test_verify_account_raises_sod_if_same_user():
    """Verifier cannot be the same user as the creator."""
    from app.services.bank_account_service import verify_account, SoDViolationError

    mock_session = AsyncMock()
    actor_id = uuid.uuid4()
    account = MagicMock()
    account.status = BankAccountStatus.PENDING_VERIFICATION.value
    account.created_by = actor_id  # same user!
    account.company_id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = account
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(SoDViolationError):
        await verify_account(mock_session, account_id=uuid.uuid4(),
                             company_id=account.company_id, verifier_id=actor_id)


@pytest.mark.asyncio
async def test_verify_account_transitions_to_active():
    """verify_account sets status=ACTIVE when SoD passes."""
    from app.services.bank_account_service import verify_account

    mock_session = AsyncMock()
    creator_id = uuid.uuid4()
    verifier_id = uuid.uuid4()  # different user
    account = MagicMock()
    account.status = BankAccountStatus.PENDING_VERIFICATION.value
    account.created_by = creator_id
    account.company_id = uuid.uuid4()
    account.id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = account
    mock_session.execute = AsyncMock(return_value=mock_result)

    with patch("app.services.bank_account_service.append_event", new_callable=AsyncMock):
        result = await verify_account(mock_session, account_id=account.id,
                                      company_id=account.company_id, verifier_id=verifier_id)

    assert result.status == BankAccountStatus.ACTIVE.value


@pytest.mark.asyncio
async def test_invalid_state_transition_raises():
    """CLOSED -> FROZEN transition raises InvalidStateTransitionError."""
    from app.services.bank_account_service import freeze_account, InvalidStateTransitionError

    mock_session = AsyncMock()
    account = MagicMock()
    account.status = BankAccountStatus.CLOSED.value  # terminal state
    account.company_id = uuid.uuid4()
    account.id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = account
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(InvalidStateTransitionError):
        await freeze_account(mock_session, account_id=account.id,
                             company_id=account.company_id, actor_id=uuid.uuid4())


@pytest.mark.asyncio
async def test_create_account_encrypts_sensitive_fields(monkeypatch):
    """create_account encrypts account_number and iban before storing."""
    monkeypatch.setenv("BANK_ACCOUNT_ENC_KEY", "test-bank-enc-key-at-least-32-bytes-long!!")
    from app.services.bank_account_service import create_account

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    entity_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    # Mock entity lookup
    mock_entity = MagicMock()
    mock_entity.company_id = company_id
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_entity
    mock_session.execute = AsyncMock(return_value=mock_result)

    payload = {
        "entity_id": str(entity_id),
        "bank_name": "Deutsche Bank",
        "account_number": "DE89370400440532013000",
        "iban": "DE89370400440532013000",
        "currency": "EUR",
        "nickname": "Main EUR Account",
        "account_type": "OPERATING",
    }

    with patch("app.services.bank_account_service.append_event", new_callable=AsyncMock):
        account = await create_account(mock_session, entity_id=entity_id,
                                        company_id=company_id, payload=payload,
                                        created_by=actor_id)

    # Stored value must be encrypted (not plaintext)
    assert account.account_number_enc != "DE89370400440532013000"
    assert account.account_number_enc is not None
