"""
Tests for the 3 security fixes in v1_admin_reset.py:
  C1 — seed_companies requires superuser auth + blocks production
  C2 — WORM tables excluded from DELETE and TRUNCATE lists
  C3 — cleartext credentials removed from seed response
Also: reset_demo_data uses require_superuser (no manual is_superuser check)
"""
import os
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.routes.v1_admin_reset import (
    _DELETE_STEPS,
    _TRUNCATE_TABLES,
    seed_companies,
    reset_demo_data,
)


# ── WORM tables that must never appear in delete/truncate lists ───────────

WORM_TABLES = {"audit_events", "calculation_runs", "policy_revisions"}


class TestC2WormExclusion:
    """C2: WORM tables must not appear in _DELETE_STEPS or _TRUNCATE_TABLES."""

    def test_delete_steps_exclude_worm_tables(self):
        labels = {label for label, _ in _DELETE_STEPS}
        for worm in WORM_TABLES:
            assert worm not in labels, (
                f"WORM table '{worm}' found in _DELETE_STEPS — violates architecture freeze"
            )

    def test_delete_steps_sql_exclude_worm_tables(self):
        for label, sql in _DELETE_STEPS:
            sql_lower = sql.lower()
            for worm in WORM_TABLES:
                assert worm not in sql_lower, (
                    f"WORM table '{worm}' referenced in SQL for step '{label}'"
                )

    def test_truncate_tables_exclude_worm_tables(self):
        for worm in WORM_TABLES:
            assert worm not in _TRUNCATE_TABLES, (
                f"WORM table '{worm}' found in _TRUNCATE_TABLES — violates architecture freeze"
            )


# ── C1: seed_companies auth and production guard ──────────────────────────

class TestC1SeedCompaniesAuth:
    """C1: seed_companies must require superuser and block production."""

    def test_seed_companies_has_require_superuser_dependency(self):
        """The endpoint function should declare require_superuser in its deps."""
        import inspect

        sig = inspect.signature(seed_companies)
        params = sig.parameters

        # Must have a current_user parameter
        assert "current_user" in params, (
            "seed_companies is missing 'current_user' parameter"
        )

        # The default must reference require_superuser
        default = params["current_user"].default
        # FastAPI Depends wraps the callable — check the dependency attribute
        assert hasattr(default, "dependency"), (
            "current_user default is not a Depends() instance"
        )
        from app.core.dependencies import require_superuser as rs_dep
        assert default.dependency is rs_dep, (
            "seed_companies current_user dependency is not require_superuser"
        )

    @pytest.mark.asyncio
    async def test_seed_companies_blocks_production(self):
        """When ENV=production, seed_companies must raise 403."""
        mock_request = MagicMock()
        mock_db = AsyncMock()
        mock_user = MagicMock()
        mock_user.is_superuser = True

        with patch.dict(os.environ, {"ENV": "production"}):
            with pytest.raises(HTTPException) as exc_info:
                await seed_companies(
                    request=mock_request,
                    db=mock_db,
                    current_user=mock_user,
                )
            assert exc_info.value.status_code == 403
            assert "production" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_seed_companies_blocks_production_uppercase(self):
        """ENV=Production (mixed case) should also be blocked."""
        mock_request = MagicMock()
        mock_db = AsyncMock()
        mock_user = MagicMock()

        with patch.dict(os.environ, {"ENV": "Production"}):
            with pytest.raises(HTTPException) as exc_info:
                await seed_companies(
                    request=mock_request,
                    db=mock_db,
                    current_user=mock_user,
                )
            assert exc_info.value.status_code == 403


# ── C3: no cleartext credentials in response ─────────────────────────────

class TestC3NoCleartextCredentials:
    """C3: seed response must not contain plaintext passwords."""

    def test_response_login_field_has_no_slash(self):
        """If the login field format were 'user/pass', a '/' would be present.
        After the fix, login should only be the email (no slash)."""
        # We can't easily run the full endpoint, so test the source code.
        import ast
        import textwrap

        src_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "app",
            "api",
            "routes",
            "v1_admin_reset.py",
        )
        with open(src_path) as f:
            source = f.read()

        # The old pattern was: f"{cfg['user_email']}/{cfg['user_pass']}"
        assert "user_pass" not in source.split("seeded.append")[1].split(")")[0], (
            "Response still references user_pass — cleartext credential leak"
        )


# ── reset_demo_data uses require_superuser ────────────────────────────────

class TestResetDemoDataAuth:
    """reset_demo_data should use require_superuser, not manual is_superuser check."""

    def test_reset_demo_data_has_require_superuser_dependency(self):
        import inspect

        sig = inspect.signature(reset_demo_data)
        params = sig.parameters

        assert "current_user" in params
        default = params["current_user"].default
        assert hasattr(default, "dependency")

        from app.core.dependencies import require_superuser as rs_dep
        assert default.dependency is rs_dep

    def test_no_manual_superuser_check_in_source(self):
        """The old manual 'if not current_user.is_superuser' should be gone."""
        src_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "app",
            "api",
            "routes",
            "v1_admin_reset.py",
        )
        with open(src_path) as f:
            source = f.read()

        # Find the reset_demo_data function body (between def and the next def or EOF)
        func_start = source.index("async def reset_demo_data")
        # Find next top-level definition or end
        next_section = source.find("\n# ---", func_start + 1)
        if next_section == -1:
            func_body = source[func_start:]
        else:
            func_body = source[func_start:next_section]

        assert "current_user.is_superuser" not in func_body, (
            "reset_demo_data still has manual is_superuser check — "
            "should use require_superuser dependency instead"
        )


# ── Import correctness ───────────────────────────────────────────────────

class TestImportCorrectness:
    """The module should import from dependencies, not security for auth."""

    def test_no_get_current_user_import(self):
        src_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "app",
            "api",
            "routes",
            "v1_admin_reset.py",
        )
        with open(src_path) as f:
            source = f.read()

        # Should not import get_current_user at all
        assert "get_current_user" not in source, (
            "v1_admin_reset.py still imports get_current_user — "
            "should use require_superuser from app.core.dependencies"
        )

    def test_imports_require_superuser_from_dependencies(self):
        src_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "app",
            "api",
            "routes",
            "v1_admin_reset.py",
        )
        with open(src_path) as f:
            source = f.read()

        assert "from app.core.dependencies import require_superuser" in source
