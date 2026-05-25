"""
tests/test_policy_service_fix.py

Regression tests for critical policy service bugs:
  - policy_service.list_templates used Python `is None` instead of SQLAlchemy `.is_(None)`
    causing GET /v1/policies/templates to return 500 Internal Server Error.
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.policy import PolicyTemplate
from app.models.user import User
from app.services import policy_service

pytestmark = pytest.mark.requires_postgres


@pytest_asyncio.fixture
async def demo_user(db_session: AsyncSession) -> User:
    """Resolve the session-bootstrapped synthetic test user.

    conftest._pg_seed_session_bootstrap UPSERTs this user with the fixed
    id 11111111-2222-3333-4444-555555555555 and binds it to the synthetic
    test company. policy_service.list_templates only needs user.company_id,
    so a SELECT is sufficient -- no need to re-seed here.
    """
    from uuid import UUID
    res = await db_session.execute(
        select(User).where(User.id == UUID("11111111-2222-3333-4444-555555555555"))
    )
    user = res.scalars().first()
    assert user is not None, "demo_user not seeded by conftest"
    return user


@pytest.mark.asyncio
async def test_list_templates_endpoint_returns_200(
    client: AsyncClient, auth_headers: dict
):
    """
    GET /v1/policies/templates must return 200, not 500.
    Regression: was failing due to `company_id is None` Python identity check
    instead of SQLAlchemy `.is_(None)` for SQL IS NULL.
    """
    r = await client.get("/api/v1/policies/templates", headers=auth_headers)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"


@pytest.mark.asyncio
async def test_list_templates_returns_list(
    client: AsyncClient, auth_headers: dict
):
    """Response is a list (possibly empty if templates not seeded)."""
    r = await client.get("/api/v1/policies/templates", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list), f"Expected list, got {type(data)}: {data}"


@pytest.mark.asyncio
async def test_seed_status_endpoint(
    client: AsyncClient, auth_headers: dict
):
    """GET /v1/policies/templates/seed-status returns seeded/count/expected_count."""
    r = await client.get("/api/v1/policies/templates/seed-status", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "seeded" in data
    assert "count" in data
    assert "expected_count" in data
    assert data["expected_count"] == 60, f"Expected 60 templates, got {data['expected_count']}"


@pytest.mark.asyncio
async def test_active_policy_endpoint(
    client: AsyncClient, auth_headers: dict
):
    """GET /v1/policies/active returns 200 (null or active policy object)."""
    r = await client.get("/api/v1/policies/active", headers=auth_headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_policy_service_query_uses_sql_null(
    db_session: AsyncSession, demo_user
):
    """
    Unit test: policy_service.list_templates executes without error.
    Validates the .is_(None) SQLAlchemy fix vs Python `is None`.
    """
    # Should not raise any exception
    templates = await policy_service.list_templates(db_session, demo_user)
    assert isinstance(templates, list)


@pytest.mark.asyncio
async def test_templates_include_system_templates_if_seeded(
    client: AsyncClient, auth_headers: dict
):
    """If templates are seeded, all returned templates have required fields."""
    r = await client.get("/api/v1/policies/templates", headers=auth_headers)
    assert r.status_code == 200
    templates = r.json()
    for tpl in templates:
        assert "id" in tpl
        assert "name" in tpl
        assert "short_name" in tpl
        assert "risk_posture" in tpl
        assert "is_system" in tpl
        assert "config" in tpl
        # Config should have hedge_ratios
        if tpl["config"]:
            assert "hedge_ratios" in tpl["config"]


@pytest.mark.asyncio
async def test_policy_favorites_endpoint(
    client: AsyncClient, auth_headers: dict
):
    """GET /v1/policies/favorites returns 200."""
    r = await client.get("/api/v1/policies/favorites", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
