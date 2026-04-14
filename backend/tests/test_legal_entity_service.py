# backend/tests/test_legal_entity_service.py
"""Unit tests for legal_entity_service."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from app.models.cash import LegalEntityStatus


@pytest.mark.asyncio
async def test_create_entity_emits_audit_event():
    from app.services.legal_entity_service import create_entity

    mock_session = AsyncMock()
    company_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    payload = {
        "legal_name": "Acme Europe SA",
        "short_name": "Acme EU",
        "country": "DE",
        "functional_currency": "EUR",
        "reporting_currency": "USD",
    }

    with patch("app.services.legal_entity_service.append_event", new_callable=AsyncMock) as mock_audit:
        entity = await create_entity(mock_session, company_id=company_id, payload=payload, created_by=actor_id)

    assert entity.company_id == company_id
    assert entity.status == LegalEntityStatus.ACTIVE.value
    mock_audit.assert_called_once()
    mock_session.add.assert_called_once()


@pytest.mark.asyncio
async def test_close_entity_sets_status():
    from app.services.legal_entity_service import close_entity

    mock_session = AsyncMock()
    entity = MagicMock()
    entity.company_id = uuid.uuid4()
    entity.status = LegalEntityStatus.ACTIVE.value

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = entity
    mock_session.execute = AsyncMock(return_value=mock_result)

    actor_id = uuid.uuid4()
    with patch("app.services.legal_entity_service.append_event", new_callable=AsyncMock):
        result = await close_entity(mock_session, entity_id=entity.company_id,
                                    company_id=entity.company_id, status="DORMANT", actor_id=actor_id)

    assert result.status == LegalEntityStatus.DORMANT.value


@pytest.mark.asyncio
async def test_close_entity_raises_if_not_found():
    from app.services.legal_entity_service import close_entity, EntityNotFoundError

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(EntityNotFoundError):
        await close_entity(mock_session, entity_id=uuid.uuid4(),
                           company_id=uuid.uuid4(), status="DORMANT", actor_id=uuid.uuid4())


@pytest.mark.asyncio
async def test_get_entity_tree_returns_list():
    """get_entity_tree returns a flat list of LegalEntity rows for the company."""
    from app.services.legal_entity_service import get_entity_tree

    mock_session = AsyncMock()
    entity = MagicMock()
    entity.id = uuid.uuid4()
    entity.company_id = uuid.uuid4()
    entity.parent_entity_id = None

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [entity]
    mock_session.execute = AsyncMock(return_value=mock_result)

    results = await get_entity_tree(mock_session, company_id=entity.company_id)
    assert len(results) == 1
    assert results[0].id == entity.id
