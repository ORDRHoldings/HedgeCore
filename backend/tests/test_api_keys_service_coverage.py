"""
tests/test_api_keys_service_coverage.py

Coverage-targeted unit tests for app/services/api_keys.py.

Uses AsyncMock DB sessions to avoid PostgreSQL dependency so tests run on
every CI run (SQLite / no DB mode).

Functions covered:
  - generate_key_pair               — returns key_id + secret tuple
  - format_api_token                — format string HK_live_
  - _derive_digest                  — HMAC derivation (smoke)
  - compute_secret_hash             — Argon2id hash produced
  - verify_secret_hash              — correct secret returns True, wrong returns False
  - create_api_key                  — creates ApiKey object, commits, returns (key, token)
  - rotate_api_key                  — not found returns None, found revokes old + creates new
  - revoke_api_key                  — not found returns None, found revokes
  - verify_api_key_header           — missing prefix, missing dot, key not found,
                                      key not active, wrong secret, scope fail, success
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_db() -> AsyncMock:
    db = AsyncMock()
    db.add = MagicMock()
    db.add_all = MagicMock()
    result = MagicMock()
    result.scalars.return_value.first.return_value = None
    db.execute.return_value = result
    return db


def _make_api_key(
    key_id="test_key_id",
    secret_hash="$argon2id$v=19$...",
    status="active",
    scopes=None,
    owner_user_id=None,
    expires_at=None,
):
    key = MagicMock()
    key.id = uuid.uuid4()
    key.key_id = key_id
    key.secret_hash = secret_hash
    key.status = status
    key.scopes = scopes or ["read"]
    key.owner_user_id = owner_user_id
    key.expires_at = expires_at
    key.name = "Test Key"
    key.has_scopes = MagicMock(return_value=True)
    return key


# ---------------------------------------------------------------------------
# generate_key_pair
# ---------------------------------------------------------------------------

def test_generate_key_pair_returns_two_strings():
    from app.services.api_keys import generate_key_pair

    key_id, secret = generate_key_pair()
    assert isinstance(key_id, str) and len(key_id) > 0
    assert isinstance(secret, str) and len(secret) > 0


def test_generate_key_pair_returns_unique_values():
    from app.services.api_keys import generate_key_pair

    pair1 = generate_key_pair()
    pair2 = generate_key_pair()
    assert pair1[0] != pair2[0]
    assert pair1[1] != pair2[1]


# ---------------------------------------------------------------------------
# format_api_token
# ---------------------------------------------------------------------------

def test_format_api_token_prefix():
    from app.services.api_keys import format_api_token

    token = format_api_token("myid", "mysecret")
    assert token == "HK_live_myid.mysecret"
    assert token.startswith("HK_live_")


def test_format_api_token_contains_dot():
    from app.services.api_keys import format_api_token

    token = format_api_token("abc", "xyz")
    assert "." in token


# ---------------------------------------------------------------------------
# _derive_digest
# ---------------------------------------------------------------------------

def test_derive_digest_returns_string():
    from app.services.api_keys import _derive_digest

    digest = _derive_digest("my_secret")
    assert isinstance(digest, str)
    assert len(digest) > 0


def test_derive_digest_deterministic():
    from app.services.api_keys import _derive_digest

    d1 = _derive_digest("same_secret")
    d2 = _derive_digest("same_secret")
    assert d1 == d2


def test_derive_digest_different_secrets():
    from app.services.api_keys import _derive_digest

    d1 = _derive_digest("secret_a")
    d2 = _derive_digest("secret_b")
    assert d1 != d2


# ---------------------------------------------------------------------------
# compute_secret_hash / verify_secret_hash
# ---------------------------------------------------------------------------

def test_compute_secret_hash_returns_argon2_string():
    from app.services.api_keys import compute_secret_hash

    h = compute_secret_hash("my_test_secret")
    assert isinstance(h, str)
    assert "$argon2" in h


def test_verify_secret_hash_correct_secret():
    from app.services.api_keys import compute_secret_hash, verify_secret_hash

    secret = "correct_secret_12345"
    stored = compute_secret_hash(secret)
    assert verify_secret_hash(secret, stored) is True


def test_verify_secret_hash_wrong_secret():
    from app.services.api_keys import compute_secret_hash, verify_secret_hash

    stored = compute_secret_hash("original_secret")
    assert verify_secret_hash("wrong_secret", stored) is False


def test_verify_secret_hash_invalid_hash():
    from app.services.api_keys import verify_secret_hash

    # A non-argon2 hash string should return False, not raise
    result = verify_secret_hash("any_secret", "not_a_valid_hash")
    assert result is False


# ---------------------------------------------------------------------------
# create_api_key
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_api_key_returns_key_and_token():
    from app.services.api_keys import create_api_key

    db = _make_db()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    api_key_mock = _make_api_key()

    with patch("app.services.api_keys.ApiKey", return_value=api_key_mock):
        with patch("app.services.api_keys.generate_key_pair", return_value=("kid123", "sec456")):
            with patch("app.services.api_keys.compute_secret_hash", return_value="$argon2id$..."):
                result_key, result_token = await create_api_key(
                    db,
                    name="My Key",
                    scopes=["read", "write"],
                    owner_user_id=uuid.uuid4(),
                    expires_at=None,
                )

    assert result_key is api_key_mock
    assert result_token == "HK_live_kid123.sec456"
    db.add.assert_called_once_with(api_key_mock)
    db.commit.assert_called_once()
    db.refresh.assert_called_once()


@pytest.mark.asyncio
async def test_create_api_key_none_scopes_defaults_to_empty_list():
    """When scopes=None the key is created with scopes=[]."""
    from app.services.api_keys import create_api_key

    db = _make_db()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    captured_kwargs = {}

    class FakeApiKey:
        def __init__(self, **kwargs):
            captured_kwargs.update(kwargs)
            self.key_id = kwargs["key_id"]
            self.scopes = kwargs["scopes"]

    with patch("app.services.api_keys.ApiKey", FakeApiKey):
        with patch("app.services.api_keys.generate_key_pair", return_value=("k1", "s1")):
            with patch("app.services.api_keys.compute_secret_hash", return_value="hash"):
                await create_api_key(
                    db, name=None, scopes=None, owner_user_id=None, expires_at=None
                )

    assert captured_kwargs["scopes"] == []


# ---------------------------------------------------------------------------
# rotate_api_key
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_rotate_api_key_not_found_returns_none():
    from app.services.api_keys import rotate_api_key

    db = _make_db()
    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = None
    db.execute.return_value = res_mock

    result = await rotate_api_key(db, "nonexistent_key_id")
    assert result is None


@pytest.mark.asyncio
async def test_rotate_api_key_revokes_old_and_creates_new():
    from app.services.api_keys import rotate_api_key

    db = _make_db()
    old_key = _make_api_key(key_id="old_key_id", scopes=["read"], status="active")
    old_key.name = "Old Key"
    old_key.owner_user_id = uuid.uuid4()
    old_key.expires_at = None

    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = old_key
    db.execute.return_value = res_mock
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    new_key = _make_api_key(key_id="new_key_id")

    with patch(
        "app.services.api_keys.create_api_key",
        new=AsyncMock(return_value=(new_key, "HK_live_new_key_id.newsecret")),
    ):
        result = await rotate_api_key(db, "old_key_id")

    assert result is not None
    result_key, result_token = result
    assert result_key is new_key
    assert "HK_live_" in result_token
    assert old_key.status == "revoked"
    db.commit.assert_called()


# ---------------------------------------------------------------------------
# revoke_api_key
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_revoke_api_key_not_found_returns_none():
    from app.services.api_keys import revoke_api_key

    db = _make_db()
    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = None
    db.execute.return_value = res_mock

    result = await revoke_api_key(db, "nonexistent")
    assert result is None


@pytest.mark.asyncio
async def test_revoke_api_key_sets_status_revoked():
    from app.services.api_keys import revoke_api_key

    db = _make_db()
    api_key = _make_api_key(key_id="live_key_id", status="active")

    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = api_key
    db.execute.return_value = res_mock
    db.commit = AsyncMock()

    result = await revoke_api_key(db, "live_key_id")

    assert result is api_key
    assert api_key.status == "revoked"
    db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# verify_api_key_header
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_verify_api_key_header_none_returns_none():
    from app.services.api_keys import verify_api_key_header

    db = _make_db()
    result = await verify_api_key_header(db, None)
    assert result is None


@pytest.mark.asyncio
async def test_verify_api_key_header_missing_prefix_returns_none():
    from app.services.api_keys import verify_api_key_header

    db = _make_db()
    result = await verify_api_key_header(db, "Bearer sometoken")
    assert result is None


@pytest.mark.asyncio
async def test_verify_api_key_header_missing_dot_returns_none():
    from app.services.api_keys import verify_api_key_header

    db = _make_db()
    result = await verify_api_key_header(db, "HK_live_nodothere")
    assert result is None


@pytest.mark.asyncio
async def test_verify_api_key_header_key_not_found():
    from app.services.api_keys import verify_api_key_header

    db = _make_db()
    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = None
    db.execute.return_value = res_mock

    result = await verify_api_key_header(db, "HK_live_unknownkey.somesecret")
    assert result is None


@pytest.mark.asyncio
async def test_verify_api_key_header_key_not_active():
    from app.services.api_keys import verify_api_key_header

    db = _make_db()
    api_key = _make_api_key(key_id="rkey", status="revoked")
    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = api_key
    db.execute.return_value = res_mock

    result = await verify_api_key_header(db, "HK_live_rkey.somesecret")
    assert result is None


@pytest.mark.asyncio
async def test_verify_api_key_header_wrong_secret():
    from app.services.api_keys import verify_api_key_header, compute_secret_hash

    db = _make_db()
    correct_secret = "correct_secret_value"
    stored_hash = compute_secret_hash(correct_secret)
    api_key = _make_api_key(key_id="mykey", status="active", secret_hash=stored_hash)

    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = api_key
    db.execute.return_value = res_mock

    result = await verify_api_key_header(db, "HK_live_mykey.wrong_secret")
    assert result is None


@pytest.mark.asyncio
async def test_verify_api_key_header_scope_fail():
    from app.services.api_keys import verify_api_key_header, compute_secret_hash

    secret = "good_secret_for_scope_test"
    stored_hash = compute_secret_hash(secret)

    db = _make_db()
    api_key = _make_api_key(key_id="scopekey", status="active", secret_hash=stored_hash, scopes=["read"])
    api_key.has_scopes = MagicMock(return_value=False)

    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = api_key
    db.execute.return_value = res_mock
    db.commit = AsyncMock()

    result = await verify_api_key_header(db, f"HK_live_scopekey.{secret}", required_scopes=["write"])
    assert result is None


@pytest.mark.asyncio
async def test_verify_api_key_header_success():
    from app.services.api_keys import verify_api_key_header, compute_secret_hash

    secret = "valid_secret_for_success_test"
    stored_hash = compute_secret_hash(secret)

    db = _make_db()
    api_key = _make_api_key(key_id="validkey", status="active", secret_hash=stored_hash, scopes=["read"])
    api_key.has_scopes = MagicMock(return_value=True)

    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = api_key
    db.execute.return_value = res_mock
    db.commit = AsyncMock()

    result = await verify_api_key_header(db, f"HK_live_validkey.{secret}", required_scopes=["read"])
    assert result is api_key
    db.commit.assert_called()


@pytest.mark.asyncio
async def test_verify_api_key_header_success_no_required_scopes():
    from app.services.api_keys import verify_api_key_header, compute_secret_hash

    secret = "no_scope_secret_test"
    stored_hash = compute_secret_hash(secret)

    db = _make_db()
    api_key = _make_api_key(key_id="noscopekey", status="active", secret_hash=stored_hash)

    res_mock = MagicMock()
    res_mock.scalars.return_value.first.return_value = api_key
    db.execute.return_value = res_mock
    db.commit = AsyncMock()

    # No required_scopes passed — should still succeed
    result = await verify_api_key_header(db, f"HK_live_noscopekey.{secret}")
    assert result is api_key
