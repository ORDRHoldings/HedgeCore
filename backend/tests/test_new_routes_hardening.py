"""
Backend tests — New routes hardening (v1_risk_check, v1_mfa, v1_company_settings).

Tests:
  v1_risk_check:
    1.  Module imports correctly (no import errors)
    2.  POST /v1/risk-check uses mandatory get_current_user
    3.  risk_check has RBAC check for calculate.recommend
    4.  RiskCheckRequest has required fields (position_ids, market_snapshot)
    5.  RiskCheckResponse has required verdict field
    6.  _emit_risk_check_audit helper exists and is callable
    7.  decision_gate is imported and used
    8.  Non-superuser RBAC gate is present in source

  v1_company_settings:
    9.  Module imports correctly
    10. GET /settings uses mandatory get_current_user
    11. PATCH /settings uses mandatory get_current_user
    12. PATCH /settings checks company.edit_settings permission
    13. CompanySettingsResponse has governance_mode field
    14. UpdateCompanySettingsRequest validates solo|team pattern
    15. governance_mode defaults to "team" (safe default)

  v1_mfa:
    16. Module imports correctly (pyotp available)
    17. GET /status uses mandatory get_current_user
    18. POST /setup uses mandatory get_current_user
    19. POST /activate uses mandatory get_current_user
    20. POST /verify uses mandatory get_current_user
    21. DELETE /disable uses mandatory get_current_user
    22. MFASetupResponse has provisioning_uri, secret, backup_codes
    23. MFAVerifyResponse has access_token and mfa_verified fields
    24. MFAStatusResponse has is_enabled field
    25. TOTP secret generation uses pyotp
    26. Router prefix is /v1/mfa
"""

from __future__ import annotations

import inspect
import pytest


# ===========================================================================
# v1_risk_check
# ===========================================================================

class TestRiskCheckHardening:
    """Structural tests for POST /v1/risk-check."""

    def test_module_imports(self):
        """v1_risk_check imports without errors."""
        import app.api.routes.v1_risk_check  # noqa: F401

    def test_risk_check_uses_mandatory_user(self):
        """POST /v1/risk-check must use get_current_user (mandatory, not optional)."""
        from app.api.routes.v1_risk_check import risk_check
        sig = inspect.signature(risk_check)
        user_param = sig.parameters.get("current_user")
        assert user_param is not None, "risk_check() missing current_user parameter"
        assert "Optional" not in str(user_param.annotation), (
            f"current_user is Optional: {user_param.annotation} — must be mandatory"
        )

    def test_risk_check_has_rbac_guard(self):
        """POST /v1/risk-check must check calculate.recommend permission."""
        from app.api.routes.v1_risk_check import risk_check
        source = inspect.getsource(risk_check)
        assert "calculate.recommend" in source, (
            "risk_check missing RBAC check for calculate.recommend"
        )

    def test_risk_check_has_superuser_bypass(self):
        """POST /v1/risk-check must allow superusers to bypass RBAC."""
        from app.api.routes.v1_risk_check import risk_check
        source = inspect.getsource(risk_check)
        assert "is_superuser" in source, (
            "risk_check missing superuser bypass — superusers should not be blocked"
        )

    def test_request_schema_has_position_ids(self):
        """RiskCheckRequest must have position_ids field."""
        from app.api.routes.v1_risk_check import RiskCheckRequest
        fields = RiskCheckRequest.model_fields
        assert "position_ids" in fields, "RiskCheckRequest missing position_ids"

    def test_request_schema_has_market_snapshot(self):
        """RiskCheckRequest must have market_snapshot field."""
        from app.api.routes.v1_risk_check import RiskCheckRequest
        fields = RiskCheckRequest.model_fields
        assert "market_snapshot" in fields, "RiskCheckRequest missing market_snapshot"

    def test_request_schema_optional_hedge_plan(self):
        """RiskCheckRequest.hedge_plan must be optional."""
        from app.api.routes.v1_risk_check import RiskCheckRequest
        fields = RiskCheckRequest.model_fields
        assert "hedge_plan" in fields, "RiskCheckRequest missing hedge_plan field"
        # Should be optional (has a default)
        assert fields["hedge_plan"].default is None or fields["hedge_plan"].is_required() is False, (
            "hedge_plan should be optional (can call risk-check without a pre-computed plan)"
        )

    def test_response_schema_has_verdict(self):
        """RiskCheckResponse must include verdict field."""
        from app.api.routes.v1_risk_check import RiskCheckResponse
        fields = RiskCheckResponse.model_fields
        assert "verdict" in fields, "RiskCheckResponse missing verdict"

    def test_response_schema_has_decision_hash(self):
        """RiskCheckResponse must include decision_hash for audit trail."""
        from app.api.routes.v1_risk_check import RiskCheckResponse
        fields = RiskCheckResponse.model_fields
        assert "decision_hash" in fields, (
            "RiskCheckResponse missing decision_hash — required for tamper-evident audit"
        )

    def test_response_schema_has_checked_at(self):
        """RiskCheckResponse must include checked_at timestamp."""
        from app.api.routes.v1_risk_check import RiskCheckResponse
        fields = RiskCheckResponse.model_fields
        assert "checked_at" in fields, "RiskCheckResponse missing checked_at timestamp"

    def test_audit_helper_exists(self):
        """Non-fatal audit emission helper must exist."""
        import app.api.routes.v1_risk_check as mod
        assert hasattr(mod, "_emit_risk_check_audit"), (
            "v1_risk_check missing _emit_risk_check_audit helper"
        )
        assert callable(mod._emit_risk_check_audit)

    def test_decision_gate_imported(self):
        """decision_gate must be imported — it is the core risk engine."""
        import app.api.routes.v1_risk_check as mod
        source = inspect.getsource(mod)
        assert "decision_gate" in source, "v1_risk_check does not use decision_gate"

    def test_zero_cost_sentinel_plan(self):
        """When no hedge_plan provided, a zero-cost sentinel is used (engine still runs)."""
        from app.api.routes.v1_risk_check import risk_check
        source = inspect.getsource(risk_check)
        assert "total" in source and "0.0" in source, (
            "risk_check should have a sentinel zero-cost plan for no-plan calls"
        )

    def test_position_ids_field_constraints(self):
        """position_ids must enforce min=1, max=50."""
        from app.api.routes.v1_risk_check import RiskCheckRequest
        import app.api.routes.v1_risk_check as mod
        source = inspect.getsource(mod)
        # The Field() call should define limits
        assert "min_length=1" in source or "min_items=1" in source or "ge=1" in source or "min_length" in source, (
            "position_ids should have a minimum constraint to prevent empty submissions"
        )


# ===========================================================================
# v1_company_settings
# ===========================================================================

class TestCompanySettingsHardening:
    """Structural tests for GET/PATCH /v1/company/settings."""

    def test_module_imports(self):
        """v1_company_settings imports without errors."""
        import app.api.routes.v1_company_settings  # noqa: F401

    def test_get_settings_uses_mandatory_user(self):
        """GET /v1/company/settings must use mandatory get_current_user."""
        from app.api.routes.v1_company_settings import get_company_settings
        sig = inspect.signature(get_company_settings)
        user_param = sig.parameters.get("current_user")
        assert user_param is not None, "get_company_settings() missing current_user"
        assert "Optional" not in str(user_param.annotation), (
            "current_user should be mandatory — settings are tenant-scoped"
        )

    def test_patch_settings_uses_mandatory_user(self):
        """PATCH /v1/company/settings must use mandatory get_current_user."""
        from app.api.routes.v1_company_settings import update_company_settings
        sig = inspect.signature(update_company_settings)
        user_param = sig.parameters.get("current_user")
        assert user_param is not None, "update_company_settings() missing current_user"
        assert "Optional" not in str(user_param.annotation)

    def test_patch_has_permission_check(self):
        """PATCH /settings must check company.edit_settings permission."""
        from app.api.routes.v1_company_settings import update_company_settings
        source = inspect.getsource(update_company_settings)
        assert "company.edit_settings" in source, (
            "update_company_settings missing company.edit_settings permission check"
        )

    def test_patch_has_superuser_bypass(self):
        """PATCH /settings must allow superusers to bypass permission check."""
        from app.api.routes.v1_company_settings import update_company_settings
        source = inspect.getsource(update_company_settings)
        assert "is_superuser" in source, (
            "update_company_settings missing superuser bypass"
        )

    def test_response_schema_has_governance_mode(self):
        """CompanySettingsResponse must include governance_mode."""
        from app.api.routes.v1_company_settings import CompanySettingsResponse
        fields = CompanySettingsResponse.model_fields
        assert "governance_mode" in fields, "CompanySettingsResponse missing governance_mode"

    def test_response_schema_has_name_and_slug(self):
        """CompanySettingsResponse must include name and slug."""
        from app.api.routes.v1_company_settings import CompanySettingsResponse
        fields = CompanySettingsResponse.model_fields
        assert "name" in fields, "CompanySettingsResponse missing name"
        assert "slug" in fields, "CompanySettingsResponse missing slug"

    def test_governance_mode_defaults_to_team(self):
        """governance_mode must default to 'team' — safest default for 4-eyes."""
        from app.api.routes.v1_company_settings import CompanySettingsResponse
        field = CompanySettingsResponse.model_fields.get("governance_mode")
        assert field is not None
        assert field.default == "team", (
            f"governance_mode default is '{field.default}', expected 'team'. "
            "'team' enforces 4-eyes by default, which is the safe institutional posture."
        )

    def test_update_request_validates_solo_team(self):
        """UpdateCompanySettingsRequest.governance_mode must only accept 'solo' or 'team'."""
        import app.api.routes.v1_company_settings as mod
        source = inspect.getsource(mod)
        # The Field pattern should restrict to solo|team
        assert "solo" in source and "team" in source, (
            "governance_mode should validate against solo|team values"
        )
        assert "pattern" in source or "regex" in source or "Literal" in source, (
            "governance_mode should use pattern/regex/Literal validation"
        )

    def test_router_prefix(self):
        """Router must be mounted at /v1/company."""
        import app.api.routes.v1_company_settings as mod
        assert hasattr(mod, "router")
        # Check prefix in source
        source = inspect.getsource(mod)
        assert '"/v1/company"' in source or "prefix=\"/v1/company\"" in source, (
            "Router prefix should be /v1/company"
        )

    def test_get_settings_returns_correct_schema(self):
        """GET /settings response_model must be CompanySettingsResponse."""
        import app.api.routes.v1_company_settings as mod
        source = inspect.getsource(mod)
        assert "CompanySettingsResponse" in source, (
            "GET /settings should use CompanySettingsResponse as response_model"
        )

    def test_settings_stored_in_company_settings_field(self):
        """Settings are read from company.settings JSON field, not a separate table."""
        from app.api.routes.v1_company_settings import get_company_settings
        source = inspect.getsource(get_company_settings)
        assert "company.settings" in source or "settings.get" in source, (
            "get_company_settings should read from company.settings JSON field"
        )


# ===========================================================================
# v1_mfa
# ===========================================================================

class TestMFAHardening:
    """Structural tests for /v1/mfa/* endpoints."""

    def test_module_imports(self):
        """v1_mfa imports without errors (including pyotp)."""
        import app.api.routes.v1_mfa  # noqa: F401

    def test_pyotp_imported(self):
        """pyotp must be imported — it drives TOTP code generation."""
        import app.api.routes.v1_mfa as mod
        source = inspect.getsource(mod)
        assert "import pyotp" in source or "pyotp" in source, (
            "v1_mfa must import pyotp for TOTP code generation"
        )

    def test_router_prefix(self):
        """MFA router must be mounted at /v1/mfa."""
        import app.api.routes.v1_mfa as mod
        source = inspect.getsource(mod)
        assert '"/v1/mfa"' in source or 'prefix="/v1/mfa"' in source, (
            "MFA router prefix should be /v1/mfa"
        )

    def test_get_status_uses_mandatory_user(self):
        """GET /v1/mfa/status must use mandatory get_current_user."""
        from app.api.routes.v1_mfa import mfa_status
        sig = inspect.signature(mfa_status)
        user_param = sig.parameters.get("current_user")
        assert user_param is not None, "mfa_status() missing current_user"
        assert "Optional" not in str(user_param.annotation)

    def test_setup_uses_mandatory_user(self):
        """POST /v1/mfa/setup must use mandatory get_current_user."""
        from app.api.routes.v1_mfa import mfa_setup
        sig = inspect.signature(mfa_setup)
        user_param = sig.parameters.get("current_user")
        assert user_param is not None, "mfa_setup() missing current_user"
        assert "Optional" not in str(user_param.annotation)

    def test_activate_uses_mandatory_user(self):
        """POST /v1/mfa/activate must use mandatory get_current_user."""
        from app.api.routes.v1_mfa import mfa_activate
        sig = inspect.signature(mfa_activate)
        user_param = sig.parameters.get("current_user")
        assert user_param is not None, "mfa_activate() missing current_user"
        assert "Optional" not in str(user_param.annotation)

    def test_verify_uses_mandatory_user(self):
        """POST /v1/mfa/verify must use mandatory get_current_user."""
        from app.api.routes.v1_mfa import mfa_verify
        sig = inspect.signature(mfa_verify)
        user_param = sig.parameters.get("current_user")
        assert user_param is not None, "mfa_verify() missing current_user"
        assert "Optional" not in str(user_param.annotation)

    def test_disable_uses_mandatory_user(self):
        """DELETE /v1/mfa/disable must use mandatory get_current_user."""
        from app.api.routes.v1_mfa import mfa_disable
        sig = inspect.signature(mfa_disable)
        user_param = sig.parameters.get("current_user")
        assert user_param is not None, "mfa_disable() missing current_user"
        assert "Optional" not in str(user_param.annotation)

    def test_setup_response_has_provisioning_uri(self):
        """MFASetupResponse must include provisioning_uri for QR code generation."""
        from app.api.routes.v1_mfa import MFASetupResponse
        fields = MFASetupResponse.model_fields
        assert "provisioning_uri" in fields, (
            "MFASetupResponse missing provisioning_uri — needed for QR code display"
        )

    def test_setup_response_has_backup_codes(self):
        """MFASetupResponse must include backup_codes for account recovery."""
        from app.api.routes.v1_mfa import MFASetupResponse
        fields = MFASetupResponse.model_fields
        assert "backup_codes" in fields, (
            "MFASetupResponse missing backup_codes — required for account recovery"
        )

    def test_setup_response_has_secret(self):
        """MFASetupResponse must include raw secret for manual entry fallback."""
        from app.api.routes.v1_mfa import MFASetupResponse
        fields = MFASetupResponse.model_fields
        assert "secret" in fields, "MFASetupResponse missing secret"

    def test_verify_response_has_access_token(self):
        """MFAVerifyResponse must return a new access_token with mfa_verified=True."""
        from app.api.routes.v1_mfa import MFAVerifyResponse
        fields = MFAVerifyResponse.model_fields
        assert "access_token" in fields, "MFAVerifyResponse missing access_token"
        assert "mfa_verified" in fields, "MFAVerifyResponse missing mfa_verified flag"

    def test_status_response_has_is_enabled(self):
        """MFAStatusResponse must have is_enabled boolean field."""
        from app.api.routes.v1_mfa import MFAStatusResponse
        fields = MFAStatusResponse.model_fields
        assert "is_enabled" in fields, "MFAStatusResponse missing is_enabled"

    def test_totp_code_request_has_length_constraint(self):
        """TOTPCodeRequest.totp_code must enforce 6-8 character constraint."""
        import app.api.routes.v1_mfa as mod
        source = inspect.getsource(mod)
        assert "min_length=6" in source, (
            "TOTP code should enforce min_length=6 to reject short inputs"
        )
        assert "max_length=8" in source, (
            "TOTP code should enforce max_length=8 (6 digit + possible space/dash)"
        )

    def test_user_mfa_model_imported(self):
        """UserMFA model must be imported — it stores TOTP state per user."""
        import app.api.routes.v1_mfa as mod
        source = inspect.getsource(mod)
        assert "UserMFA" in source, (
            "v1_mfa must import/use UserMFA model for persistence"
        )

    def test_setup_uses_pyotp_random_base32(self):
        """TOTP secret generation must use pyotp.random_base32() or similar."""
        import app.api.routes.v1_mfa as mod
        source = inspect.getsource(mod)
        assert "random_base32" in source or "pyotp.TOTP" in source, (
            "setup_mfa should use pyotp.random_base32() to generate TOTP secrets"
        )

    def test_verify_emits_mfa_verified_token(self):
        """verify_mfa must create a new token with mfa_verified=True."""
        from app.api.routes.v1_mfa import mfa_verify
        source = inspect.getsource(mfa_verify)
        assert "mfa_verified" in source, (
            "verify_mfa must embed mfa_verified=True in the returned token"
        )
        assert "create_access_token" in source, (
            "verify_mfa must issue a new access_token after successful TOTP verification"
        )
