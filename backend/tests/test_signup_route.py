"""Tests for v1_signup.py"""
import os
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.db import get_session


def _mock_db():
    """Return an AsyncMock session with commit/rollback stubs."""
    db = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    return db


async def _override_get_session(mock_db):
    """Dependency override factory that yields mock_db."""
    async def _gen():
        yield mock_db
    return _gen


@pytest.mark.asyncio
async def test_signup_returns_201_on_success():
    mock_company = MagicMock()
    mock_company.id = "c1"
    mock_user = MagicMock()
    mock_user.id = "u1"
    mock_db = _mock_db()

    async def _override():
        yield mock_db

    with patch("app.api.routes.v1_signup.provision_tenant") as mock_provision:
        async def _provision(*a, **kw):
            return mock_company, mock_user
        mock_provision.side_effect = _provision

        app.dependency_overrides[get_session] = _override
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://test",
            ) as client:
                resp = await client.post("/api/v1/signup", json={
                    "company_name": "Acme",
                    "admin_email": "admin@acme.com",
                    "admin_password": "SecretPass1234!",
                })
        finally:
            app.dependency_overrides.pop(get_session, None)

    assert resp.status_code == 201
    data = resp.json()
    assert data["company_id"] == "c1"
    assert data["user_id"] == "u1"
    assert "provisioned" in data["message"].lower()


@pytest.mark.asyncio
async def test_signup_short_password_returns_422():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        resp = await client.post("/api/v1/signup", json={
            "company_name": "Acme",
            "admin_email": "admin@acme.com",
            "admin_password": "short1234",  # 9 chars — below 12-char minimum
        })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_signup_duplicate_email_returns_409():
    from sqlalchemy.exc import IntegrityError

    mock_db = _mock_db()

    async def _override():
        yield mock_db

    with patch("app.api.routes.v1_signup.provision_tenant") as mock_provision:
        async def _raise(*a, **kw):
            raise IntegrityError("", {}, Exception())
        mock_provision.side_effect = _raise

        app.dependency_overrides[get_session] = _override
        try:
            async with AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://test",
            ) as client:
                resp = await client.post("/api/v1/signup", json={
                    "company_name": "Acme",
                    "admin_email": "admin@acme.com",
                    "admin_password": "SecretPass1234!",
                })
        finally:
            app.dependency_overrides.pop(get_session, None)

    assert resp.status_code == 409
