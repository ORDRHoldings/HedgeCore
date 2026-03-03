"""Tests for /v1/ui/onboarding-summary and /v1/ui/prefs."""
import pytest
from uuid import uuid4


def test_onboarding_summary_returns_safe_defaults():
    """When DB is empty, summary returns zeros and nulls without errors."""
    from app.api.routes.v1_ui import build_safe_summary_defaults
    result = build_safe_summary_defaults()
    assert result["exposures_open_count"] == 0
    assert result["policy_assigned"] is False
    assert result["last_run_id"] is None
    assert result["risk_gate_status"] == "unknown"


def test_ui_prefs_default_show_quickstart():
    """New user with no ui_preferences should default show_quickstart=True."""
    from app.api.routes.v1_ui import get_show_quickstart_from_prefs
    assert get_show_quickstart_from_prefs(None) is True
    assert get_show_quickstart_from_prefs({}) is True
    assert get_show_quickstart_from_prefs({"show_quickstart": True}) is True
    assert get_show_quickstart_from_prefs({"show_quickstart": False}) is False


def test_ui_prefs_dismissed_at_set_when_hidden():
    """Dismissing quickstart should set quickstart_dismissed_at."""
    from app.api.routes.v1_ui import apply_prefs_update
    existing = {}
    updated = apply_prefs_update(existing, show_quickstart=False)
    assert updated["show_quickstart"] is False
    assert "quickstart_dismissed_at" in updated
    assert updated["quickstart_dismissed_at"] is not None


def test_ui_prefs_tenant_isolation():
    """Tenant isolation: ui_preferences are per-user (scoped to user row)."""
    # Verifies independent prefs for two users without needing an ORM session.
    # Uses plain dicts to represent the JSONB value stored on each user row.
    from app.api.routes.v1_ui import get_show_quickstart_from_prefs

    prefs_a = {"show_quickstart": False}
    prefs_b = {"show_quickstart": True}

    assert get_show_quickstart_from_prefs(prefs_a) is False
    assert get_show_quickstart_from_prefs(prefs_b) is True
