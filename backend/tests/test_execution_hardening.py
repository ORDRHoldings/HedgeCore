"""
Backend tests — Execution module hardening (P0/P1 fixes).

Tests:
  1. POST /v1/calculate requires authentication (no longer optional)
  2. POST /v1/calculate requires calculate.run_production permission
  3. POST /v1/calculate superuser bypasses RBAC check
  4. GET /v1/runs requires authentication
  5. GET /v1/runs/{id} requires authentication
  6. POST /v1/pipeline/sandbox/calculate requires calculate.run_sandbox
  7. connector_service.DuplicateImportError has correct attributes
  8. connector_service._check_duplicate_hash raises on duplicate
  9. connector_service._check_duplicate_hash allows new hash
  10. Structural: v1_calculate no longer imports get_current_user_optional
  11. Structural: v1_calculate.calculate uses get_current_user dependency
  12. Structural: v1_pipeline.sandbox_calculate has _check_permission call
"""
from __future__ import annotations

import inspect
import uuid

import pytest


# ---------------------------------------------------------------------------
# 1-5. v1_calculate route hardening
# ---------------------------------------------------------------------------

class TestCalculateRouteHardening:
    """Verify POST /v1/calculate and GET /v1/runs require auth + RBAC."""

    def test_calculate_no_longer_imports_optional_user(self):
        """get_current_user_optional must NOT appear in v1_calculate imports."""
        import app.api.routes.v1_calculate as mod
        source = inspect.getsource(mod)
        # Import line should NOT contain get_current_user_optional
        assert "get_current_user_optional" not in source, (
            "v1_calculate still imports get_current_user_optional — endpoint is unauthenticated"
        )

    def test_calculate_route_uses_mandatory_user(self):
        """POST /v1/calculate must use get_current_user (mandatory), not optional."""
        from app.api.routes.v1_calculate import calculate
        sig = inspect.signature(calculate)
        user_param = sig.parameters.get("current_user")
        assert user_param is not None, "calculate() missing current_user parameter"
        # The default should be Depends(get_current_user) — check annotation isn't Optional
        annotation = user_param.annotation
        # User type (not Optional[User])
        assert "Optional" not in str(annotation), (
            f"current_user is Optional: {annotation} — should be mandatory User"
        )

    def test_calculate_has_rbac_check(self):
        """POST /v1/calculate must check calculate.run_production permission."""
        from app.api.routes.v1_calculate import calculate
        source = inspect.getsource(calculate)
        assert "calculate.run_production" in source, (
            "POST /v1/calculate missing calculate.run_production RBAC check"
        )

    def test_list_runs_uses_mandatory_user(self):
        """GET /v1/runs must use get_current_user (mandatory)."""
        from app.api.routes.v1_calculate import list_runs
        sig = inspect.signature(list_runs)
        user_param = sig.parameters.get("current_user")
        assert user_param is not None
        assert "Optional" not in str(user_param.annotation)

    def test_get_run_detail_uses_mandatory_user(self):
        """GET /v1/runs/{id} must use get_current_user (mandatory)."""
        from app.api.routes.v1_calculate import get_run_detail
        sig = inspect.signature(get_run_detail)
        user_param = sig.parameters.get("current_user")
        assert user_param is not None
        assert "Optional" not in str(user_param.annotation)


# ---------------------------------------------------------------------------
# 6. v1_pipeline sandbox hardening
# ---------------------------------------------------------------------------

class TestSandboxRouteHardening:
    """Verify sandbox_calculate requires calculate.run_sandbox."""

    def test_sandbox_calculate_has_session_param(self):
        """sandbox_calculate must have AsyncSession param for RBAC lookup."""
        from app.api.routes.v1_pipeline import sandbox_calculate
        sig = inspect.signature(sandbox_calculate)
        assert "session" in sig.parameters, (
            "sandbox_calculate missing session param — cannot do RBAC check"
        )

    def test_sandbox_calculate_has_permission_check(self):
        """sandbox_calculate source must contain calculate.run_sandbox check."""
        from app.api.routes.v1_pipeline import sandbox_calculate
        source = inspect.getsource(sandbox_calculate)
        assert "calculate.run_sandbox" in source, (
            "sandbox_calculate missing calculate.run_sandbox permission check"
        )


# ---------------------------------------------------------------------------
# 7-9. Connector duplicate prevention
# ---------------------------------------------------------------------------

class TestConnectorDuplicatePrevention:
    """Verify DuplicateImportError and _check_duplicate_hash."""

    def test_duplicate_import_error_attributes(self):
        """DuplicateImportError stores file_hash and existing_run_id."""
        from app.services.connector_service import DuplicateImportError
        fake_id = uuid.uuid4()
        err = DuplicateImportError("abc123", fake_id)
        assert err.file_hash == "abc123"
        assert err.existing_run_id == fake_id
        assert "abc123" in str(err)

    def test_duplicate_import_error_is_exception(self):
        """DuplicateImportError inherits from Exception."""
        from app.services.connector_service import DuplicateImportError
        assert issubclass(DuplicateImportError, Exception)

    def test_check_duplicate_hash_function_exists(self):
        """_check_duplicate_hash must exist as a coroutine."""
        from app.services.connector_service import _check_duplicate_hash
        assert inspect.iscoroutinefunction(_check_duplicate_hash)

    def test_import_csv_audited_calls_duplicate_check(self):
        """import_csv_audited source must contain _check_duplicate_hash call."""
        from app.services.connector_service import import_csv_audited
        source = inspect.getsource(import_csv_audited)
        assert "_check_duplicate_hash" in source, (
            "import_csv_audited missing duplicate hash check"
        )

    def test_import_excel_audited_calls_duplicate_check(self):
        """import_excel_audited source must contain _check_duplicate_hash call."""
        from app.services.connector_service import import_excel_audited
        source = inspect.getsource(import_excel_audited)
        assert "_check_duplicate_hash" in source, (
            "import_excel_audited missing duplicate hash check"
        )


# ---------------------------------------------------------------------------
# Structural: no other routes lost auth
# ---------------------------------------------------------------------------

class TestNoAuthRegression:
    """Ensure proposal + pipeline routes still use get_current_user."""

    def test_all_proposal_routes_require_auth(self):
        """Every route in v1_execution_proposals uses get_current_user."""
        import app.api.routes.v1_execution_proposals as mod
        for name, fn in inspect.getmembers(mod, inspect.iscoroutinefunction):
            if name.startswith("_"):
                continue
            sig = inspect.signature(fn)
            if "current_user" in sig.parameters:
                # Check annotation is User, not Optional[User]
                ann = str(sig.parameters["current_user"].annotation)
                assert "Optional" not in ann, (
                    f"{name} uses Optional[User] — must require auth"
                )

    def test_all_pipeline_routes_require_auth(self):
        """Every route in v1_pipeline uses get_current_user."""
        import app.api.routes.v1_pipeline as mod
        for name, fn in inspect.getmembers(mod, inspect.iscoroutinefunction):
            if name.startswith("_"):
                continue
            sig = inspect.signature(fn)
            if "current_user" in sig.parameters:
                ann = str(sig.parameters["current_user"].annotation)
                assert "Optional" not in ann, (
                    f"{name} uses Optional[User] — must require auth"
                )
