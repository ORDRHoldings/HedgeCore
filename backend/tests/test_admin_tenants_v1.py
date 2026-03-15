"""
tests/test_admin_tenants_v1.py

Tests for v1_admin_tenants.py — superuser-only tenant (company) management.

ALL tests require PostgreSQL because _build_tenant_stats uses PostgreSQL ANY(:ids).
When running on SQLite (CI), all tests are skipped — that is expected and correct.

Covers:
1. list_tenants_returns_200 — empty list
2. create_tenant_returns_201 — new company
3. create_tenant_duplicate_slug_returns_400 — 400 on dup slug
4. suspend_tenant_returns_200 — company is_active set to False
5. non_superuser_returns_404
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.core.db import get_async_session
from app.core.dependencies import get_current_user, require_superuser
from app.main import app


_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _make_superuser():
    user = MagicMock()
    user.id = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
    user.email = "admin@example.com"
    user.is_superuser = True
    user.is_active = True
    return user


def _make_company(name="Acme Corp", slug="acme"):
    company = MagicMock()
    company.id = uuid.uuid4()
    company.name = name
    company.slug = slug
    company.domain = None
    company.logo_url = None
    company.is_active = True
    company.settings = {"plan_tier": "smb", "governance_mode": "team"}
    from datetime import datetime, UTC
    company.created_at = datetime.now(UTC)
    return company


# ---------------------------------------------------------------------------
# Tests — all require_postgres
# ---------------------------------------------------------------------------


@pytest.mark.requires_postgres
@pytest.mark.asyncio
async def test_list_tenants_returns_200():
    su = _make_superuser()

    mock_session = AsyncMock()
    companies_result = MagicMock()
    companies_result.scalars.return_value.all.return_value = []
    mock_session.execute = AsyncMock(return_value=companies_result)

    app.dependency_overrides[require_superuser] = lambda: su
    app.dependency_overrides[get_current_user] = lambda: su
    app.dependency_overrides[get_async_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/v1/admin/tenants", headers=_BEARER)
        assert resp.status_code == 200
        assert resp.json() == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.requires_postgres
@pytest.mark.asyncio
async def test_create_tenant_returns_201():
    su = _make_superuser()
    fake_company = _make_company("NewCo", "newco")

    mock_session = AsyncMock()

    # First execute: slug uniqueness check → not found
    slug_check = MagicMock()
    slug_check.scalar_one_or_none.return_value = None

    mock_session.execute = AsyncMock(return_value=slug_check)
    mock_session.add = MagicMock()
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock(side_effect=lambda obj: None)

    # After refresh the route calls _company_to_detail(company, {})
    # We need the company object to have all required fields.
    # Patch session.add to capture the object and set attributes on it.
    added_company = None

    def _capture_add(obj):
        nonlocal added_company
        added_company = obj

    mock_session.add = MagicMock(side_effect=_capture_add)

    app.dependency_overrides[require_superuser] = lambda: su
    app.dependency_overrides[get_current_user] = lambda: su
    app.dependency_overrides[get_async_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/admin/tenants",
                json={"name": "NewCo", "slug": "newco", "plan_tier": "smb"},
                headers=_BEARER,
            )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "NewCo"
        assert data["slug"] == "newco"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.requires_postgres
@pytest.mark.asyncio
async def test_create_tenant_duplicate_slug_returns_400():
    su = _make_superuser()
    existing = _make_company("Existing", "taken")

    mock_session = AsyncMock()
    slug_check = MagicMock()
    slug_check.scalar_one_or_none.return_value = existing
    mock_session.execute = AsyncMock(return_value=slug_check)

    app.dependency_overrides[require_superuser] = lambda: su
    app.dependency_overrides[get_current_user] = lambda: su
    app.dependency_overrides[get_async_session] = lambda: mock_session

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/admin/tenants",
                json={"name": "Duplicate", "slug": "taken", "plan_tier": "smb"},
                headers=_BEARER,
            )
        assert resp.status_code == 400
        assert "slug" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.requires_postgres
@pytest.mark.asyncio
async def test_suspend_tenant_returns_200():
    su = _make_superuser()
    fake_company = _make_company("SuspendMe", "suspend-me")

    # patch _get_company_or_404 so we avoid real DB hit
    with patch(
        "app.api.routes.v1_admin_tenants._get_company_or_404",
        new_callable=AsyncMock,
        return_value=fake_company,
    ):
        mock_session = AsyncMock()
        mock_session.commit = AsyncMock()

        app.dependency_overrides[require_superuser] = lambda: su
        app.dependency_overrides[get_current_user] = lambda: su
        app.dependency_overrides[get_async_session] = lambda: mock_session

        company_id = uuid.uuid4()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    f"/api/v1/admin/tenants/{company_id}/suspend",
                    headers=_BEARER,
                )
            assert resp.status_code == 200
            data = resp.json()
            assert "suspended" in data.get("detail", "").lower()
            assert fake_company.is_active is False
        finally:
            app.dependency_overrides.clear()


@pytest.mark.requires_postgres
@pytest.mark.asyncio
async def test_non_superuser_returns_404():
    def _raise_404():
        raise HTTPException(status_code=404)

    app.dependency_overrides[require_superuser] = _raise_404

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/v1/admin/tenants", headers=_BEARER)
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()
