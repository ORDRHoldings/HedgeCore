"""
Tests: Sentry PII scrubbing in before_send hook.

Spec 2.4: "PII scrubbing: strip email/name from Sentry payloads"
"""
from __future__ import annotations


def _get_scrubber():
    """Import the scrubber function from main without triggering full app init."""
    from app.core.sentry_config import scrub_pii_before_send
    return scrub_pii_before_send


def test_scrub_removes_email_from_user_context():
    scrub = _get_scrubber()
    event = {
        "user": {
            "id": "usr_123",
            "email": "cfo@megacorp.com",
            "username": "cfo@megacorp.com",
            "name": "John Smith",
        },
        "extra": {"tenant_id": "tenant_abc"},
    }
    result = scrub(event, {})
    user = result["user"]
    assert "email" not in user, f"email must be stripped, got: {user}"
    assert "name" not in user, f"name must be stripped, got: {user}"
    assert user["id"] == "usr_123", "id must be preserved"
    # tenant_id must survive in extra
    assert result["extra"]["tenant_id"] == "tenant_abc"


def test_scrub_removes_email_from_request_data():
    scrub = _get_scrubber()
    event = {
        "request": {
            "url": "https://hedgecore.onrender.com/v1/auth/login",
            "data": {"email": "user@bank.com", "password": "secret123"},
        }
    }
    result = scrub(event, {})
    data = result["request"]["data"]
    assert "email" not in data, f"email must be stripped from request data, got: {data}"
    assert "password" not in data, f"password must be stripped from request data, got: {data}"


def test_scrub_removes_pii_from_extra():
    scrub = _get_scrubber()
    event = {
        "extra": {
            "user_email": "analyst@fund.com",
            "user_name": "Jane Doe",
            "tenant_id": "t_001",
            "calculation_id": "calc_999",
        }
    }
    result = scrub(event, {})
    extra = result["extra"]
    assert "user_email" not in extra
    assert "user_name" not in extra
    assert extra["tenant_id"] == "t_001"
    assert extra["calculation_id"] == "calc_999"


def test_scrub_is_noop_on_clean_event():
    scrub = _get_scrubber()
    event = {
        "extra": {"tenant_id": "t_002", "run_id": "run_abc"},
        "tags": {"env": "production"},
    }
    result = scrub(event, {})
    assert result["extra"]["tenant_id"] == "t_002"
    assert result["tags"]["env"] == "production"
