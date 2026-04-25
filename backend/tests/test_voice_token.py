"""
Tests for POST /v1/voice/token — ephemeral OpenAI Realtime token endpoint.
"""

import os
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
from httpx import AsyncClient, ASGITransport

from app.core.dependencies import get_current_user
from app.main import app


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_user():
    user = MagicMock()
    user.id = "aaaaaaaa-0000-0000-0000-000000000001"
    user.email = "test@example.com"
    user.company_id = "cccccccc-0000-0000-0000-000000000001"
    user.is_active = True
    user.is_superuser = False
    return user


# Bearer header bypasses CSRF middleware; dependency override bypasses DB user lookup
_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


@pytest.fixture
def authed_client():
    """Client with get_current_user overridden (bypasses DB) + Bearer header (bypasses CSRF)."""
    app.dependency_overrides[get_current_user] = lambda: _make_user()
    transport = ASGITransport(app=app)

    class _Ctx:
        async def __aenter__(self):
            self._client = AsyncClient(transport=transport, base_url="http://test")
            return await self._client.__aenter__()

        async def __aexit__(self, *args):
            await self._client.__aexit__(*args)
            app.dependency_overrides.clear()

    return _Ctx()


# ── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_voice_token_requires_auth(client: AsyncClient):
    """Unauthenticated requests should be rejected."""
    resp = await client.post("/api/v1/voice/token")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_voice_token_no_api_key(authed_client):
    """When OPENAI_API_KEY_V is not set, return 503."""
    with patch.dict(os.environ, {"OPENAI_API_KEY_V": ""}, clear=False):
        async with authed_client as client:
            resp = await client.post("/api/v1/voice/token", headers=_BEARER)
    assert resp.status_code == 503
    assert "OPENAI_API_KEY_V" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_voice_token_success(authed_client):
    """Successful token minting with mocked OpenAI response."""
    mock_openai_response = MagicMock()
    mock_openai_response.status_code = 200
    mock_openai_response.json.return_value = {
        "id": "sess_test123",
        "client_secret": {
            "value": "ek_test_ephemeral_token_abc123",
            "expires_at": 1735689600,
        },
    }

    with patch.dict(os.environ, {"OPENAI_API_KEY_V": "sk-test-key-for-unit-tests"}, clear=False):
        with patch("app.api.routes.v1_voice_token.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_openai_response)
            mock_client_cls.return_value = mock_client

            async with authed_client as client:
                resp = await client.post("/api/v1/voice/token", headers=_BEARER)

    assert resp.status_code == 200
    data = resp.json()
    assert data["token"] == "ek_test_ephemeral_token_abc123"
    assert data["expires_at"] == "1735689600"
    assert "instructions" in data
    assert "tools" in data


@pytest.mark.asyncio
async def test_voice_token_openai_error(authed_client):
    """When OpenAI returns non-200, return 502."""
    mock_openai_response = MagicMock()
    mock_openai_response.status_code = 500
    mock_openai_response.text = "Internal Server Error"

    with patch.dict(os.environ, {"OPENAI_API_KEY_V": "sk-test-key-for-unit-tests"}, clear=False):
        with patch("app.api.routes.v1_voice_token.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_openai_response)
            mock_client_cls.return_value = mock_client

            async with authed_client as client:
                resp = await client.post("/api/v1/voice/token", headers=_BEARER)

    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_voice_token_response_shape(authed_client):
    """Response must have token and expires_at fields."""
    mock_openai_response = MagicMock()
    mock_openai_response.status_code = 200
    mock_openai_response.json.return_value = {
        "id": "sess_shape_test",
        "client_secret": {
            "value": "ek_test_shape_token",
            "expires_at": 9999999999,
        },
    }

    with patch.dict(os.environ, {"OPENAI_API_KEY_V": "sk-test-key"}, clear=False):
        with patch("app.api.routes.v1_voice_token.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_openai_response)
            mock_client_cls.return_value = mock_client

            async with authed_client as client:
                resp = await client.post("/api/v1/voice/token", headers=_BEARER)

    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert "expires_at" in data
    assert isinstance(data["token"], str)
    assert len(data["token"]) > 0


@pytest.mark.asyncio
async def test_voice_token_language_default_english(authed_client):
    """No language in body → English directive, language='en' in response."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "id": "sess_lang_default",
        "client_secret": {"value": "ek_default", "expires_at": 1},
    }

    with patch.dict(os.environ, {"OPENAI_API_KEY_V": "sk-test"}, clear=False):
        with patch("app.api.routes.v1_voice_token.httpx.AsyncClient") as mc:
            client_mock = AsyncMock()
            client_mock.__aenter__ = AsyncMock(return_value=client_mock)
            client_mock.__aexit__ = AsyncMock(return_value=False)
            client_mock.post = AsyncMock(return_value=mock_resp)
            mc.return_value = client_mock
            async with authed_client as client:
                resp = await client.post("/api/v1/voice/token", headers=_BEARER)

    assert resp.status_code == 200
    data = resp.json()
    assert data["language"] == "en"
    assert "Respond in English." in data["instructions"]


@pytest.mark.asyncio
async def test_voice_token_language_normalizes_bcp47(authed_client):
    """'es-MX' should reduce to 'es' and inject the Spanish directive."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "id": "sess_lang_es",
        "client_secret": {"value": "ek_es", "expires_at": 1},
    }

    with patch.dict(os.environ, {"OPENAI_API_KEY_V": "sk-test"}, clear=False):
        with patch("app.api.routes.v1_voice_token.httpx.AsyncClient") as mc:
            client_mock = AsyncMock()
            client_mock.__aenter__ = AsyncMock(return_value=client_mock)
            client_mock.__aexit__ = AsyncMock(return_value=False)
            client_mock.post = AsyncMock(return_value=mock_resp)
            mc.return_value = client_mock
            async with authed_client as client:
                resp = await client.post(
                    "/api/v1/voice/token",
                    headers=_BEARER,
                    json={"language": "es-MX"},
                )

    assert resp.status_code == 200
    data = resp.json()
    assert data["language"] == "es"
    assert "Responde en español" in data["instructions"]


@pytest.mark.asyncio
async def test_voice_token_unknown_language_falls_back_to_english(authed_client):
    """Unknown language code (e.g. 'xx-YY') should fall back to English."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "id": "sess_lang_xx",
        "client_secret": {"value": "ek_xx", "expires_at": 1},
    }

    with patch.dict(os.environ, {"OPENAI_API_KEY_V": "sk-test"}, clear=False):
        with patch("app.api.routes.v1_voice_token.httpx.AsyncClient") as mc:
            client_mock = AsyncMock()
            client_mock.__aenter__ = AsyncMock(return_value=client_mock)
            client_mock.__aexit__ = AsyncMock(return_value=False)
            client_mock.post = AsyncMock(return_value=mock_resp)
            mc.return_value = client_mock
            async with authed_client as client:
                resp = await client.post(
                    "/api/v1/voice/token",
                    headers=_BEARER,
                    json={"language": "xx-YY"},
                )

    assert resp.status_code == 200
    data = resp.json()
    assert data["language"] == "en"
    assert "Respond in English." in data["instructions"]


@pytest.mark.asyncio
async def test_voice_token_language_changes_provenance_hash(authed_client):
    """Different languages must produce different instructions_sha256 hashes."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "id": "sess_lang_hash",
        "client_secret": {"value": "ek_hash", "expires_at": 1},
    }

    with patch.dict(os.environ, {"OPENAI_API_KEY_V": "sk-test"}, clear=False):
        with patch("app.api.routes.v1_voice_token.httpx.AsyncClient") as mc:
            client_mock = AsyncMock()
            client_mock.__aenter__ = AsyncMock(return_value=client_mock)
            client_mock.__aexit__ = AsyncMock(return_value=False)
            client_mock.post = AsyncMock(return_value=mock_resp)
            mc.return_value = client_mock
            async with authed_client as client:
                en_resp = await client.post(
                    "/api/v1/voice/token", headers=_BEARER, json={"language": "en"}
                )
                ja_resp = await client.post(
                    "/api/v1/voice/token", headers=_BEARER, json={"language": "ja"}
                )

    en = en_resp.json()
    ja = ja_resp.json()
    assert en["language"] == "en"
    assert ja["language"] == "ja"
    # Provenance must differ — auditors need to see which language ran.
    assert en["instructions_sha256"] != ja["instructions_sha256"]


@pytest.mark.asyncio
async def test_voice_token_missing_client_secret(authed_client):
    """When OpenAI response lacks client_secret.value, return 502."""
    mock_openai_response = MagicMock()
    mock_openai_response.status_code = 200
    mock_openai_response.json.return_value = {
        "id": "sess_bad",
        "client_secret": {},
    }

    with patch.dict(os.environ, {"OPENAI_API_KEY_V": "sk-test-key"}, clear=False):
        with patch("app.api.routes.v1_voice_token.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_openai_response)
            mock_client_cls.return_value = mock_client

            async with authed_client as client:
                resp = await client.post("/api/v1/voice/token", headers=_BEARER)

    assert resp.status_code == 502
