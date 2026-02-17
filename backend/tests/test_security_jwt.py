"""
tests/test_security_jwt.py
HedgeCalc – JWT Cryptography & Token Validation Tests (Phase VII)

Purpose:
- Validate structure, TTL, and claim integrity of access/refresh tokens.
- Verify UUID safety, expiration math, and secure decode handling.
- Confirm correct handling of expired and tampered tokens under new 401 scheme.
"""

import pytest
import time
import jwt
from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.core.config import settings

pytestmark = pytest.mark.asyncio


# -------------------------------------------------------------------
# ✅ Positive Tests
# -------------------------------------------------------------------
def test_access_token_structure_and_claims():
    """Access token should contain expected claims and valid TTL."""
    sub = str(UUID("00000000-0000-0000-0000-000000000001"))
    email = "access_check@example.com"
    token = create_access_token(sub=sub, email=email)

    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"], audience="users")

    # Structure validation (nbf optional)
    for field in ("sub", "iss", "aud", "iat", "exp", "jti"):
        assert field in payload, f"Missing {field}"

    assert payload["iss"] == "hedgecalc"
    assert payload["aud"] == "users"
    assert payload["sub"] == sub
    assert UUID(payload["sub"])

    ttl = float(payload["exp"]) - float(payload["iat"])
    expected_ttl = settings.ACCESS_EXPIRE_MIN * 60
    assert abs(ttl - expected_ttl) < 5, "TTL deviates more than 5 s tolerance"


def test_refresh_token_structure_and_claims():
    """Refresh token should contain UUID-safe jti and valid TTL."""
    sub = str(UUID("00000000-0000-0000-0000-000000000002"))
    email = "refresh_check@example.com"
    token, jti, exp_at = create_refresh_token(sub=sub, email=email)

    assert isinstance(jti, str) and len(jti) >= 8
    if isinstance(exp_at, datetime):
        assert exp_at > datetime.now(timezone.utc)
    else:
        assert exp_at > time.time()

    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"], audience="users")

    for field in ("sub", "iss", "aud", "iat", "exp", "jti"):
        assert field in payload

    assert payload["sub"] == sub
    assert payload["iss"] == "hedgecalc"
    assert payload["aud"] == "users"
    assert UUID(payload["sub"])  # ensure sub parses to UUID


def test_decode_token_roundtrip_valid():
    """Round-trip encode/decode must preserve payload."""
    sub = str(UUID("00000000-0000-0000-0000-000000000003"))
    access_token = create_access_token(sub=sub)
    decoded = decode_token(access_token, expected_type="access")
    assert decoded["sub"] == sub
    assert decoded["iss"] == "hedgecalc"
    assert decoded["aud"] == "users"


# -------------------------------------------------------------------
# ⚠️ Negative Tests (401 semantics)
# -------------------------------------------------------------------
def test_expired_token_rejected(monkeypatch):
    """Expired tokens must raise HTTP 401 ('Token expired')."""
    sub = str(UUID("00000000-0000-0000-0000-000000000004"))
    token = create_access_token(sub=sub)
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"], audience="users")
    payload["exp"] = time.time() - 10
    expired = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

    with pytest.raises(HTTPException) as excinfo:
        decode_token(expired, expected_type="access")
    assert excinfo.value.status_code == 401
    assert "expired" in excinfo.value.detail.lower()


def test_tampered_token_signature_invalid():
    """Tampered signature should raise HTTP 401 ('Invalid token')."""
    sub = str(UUID("00000000-0000-0000-0000-000000000005"))
    token = create_access_token(sub=sub)
    tampered = token[:-2] + "ab"  # corrupt signature

    with pytest.raises(HTTPException) as excinfo:
        decode_token(tampered, expected_type="access")
    assert excinfo.value.status_code == 401
    assert "invalid" in excinfo.value.detail.lower()


def test_invalid_secret_key():
    """Tokens signed with wrong key must fail standard decode validation."""
    sub = str(UUID("00000000-0000-0000-0000-000000000006"))
    token = create_access_token(sub=sub)
    wrong_secret = "BAD_SECRET_KEY"

    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(token, wrong_secret, algorithms=["HS256"], audience="users")


def test_jwt_claim_mismatch():
    """Token with mismatched aud or iss should raise 401 ('Invalid token')."""
    sub = str(UUID("00000000-0000-0000-0000-000000000007"))
    token = create_access_token(sub=sub)
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"], audience="users")

    payload["aud"] = "invalid_audience"
    bad_token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

    with pytest.raises(HTTPException) as excinfo:
        decode_token(bad_token, expected_type="access")
    assert excinfo.value.status_code == 401
    assert "invalid" in excinfo.value.detail.lower()
