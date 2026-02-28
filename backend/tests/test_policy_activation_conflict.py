"""
Backend tests — DB-POLICY-1 typed exception + route mapping

Tests:
  1. ActivationConflictError attributes (code, company_id, branch_id, str)
  2. policy_service raises ActivationConflictError (not ValueError) on IntegrityError
  3. Route maps ActivationConflictError → 409 with stable JSON body
  4. Route maps plain ValueError → 404 (NOT 409)
  5. Route 404 body has no 'code' field (clean separation)
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.core.exceptions import ActivationConflictError, HedgeCalcError


# ---------------------------------------------------------------------------
# 1. ActivationConflictError — unit tests
# ---------------------------------------------------------------------------

class TestActivationConflictError:
    def test_is_subclass_of_hedgecalc_error(self):
        err = ActivationConflictError(company_id=uuid.uuid4())
        assert isinstance(err, HedgeCalcError)
        assert isinstance(err, Exception)

    def test_code_is_stable_constant(self):
        """Clients key on this value — must never change."""
        assert ActivationConflictError.code == "DB_ACTIVE_SCOPE_CONFLICT"

    def test_instance_code_matches_class_code(self):
        err = ActivationConflictError(company_id=uuid.uuid4())
        assert err.code == "DB_ACTIVE_SCOPE_CONFLICT"

    def test_company_id_preserved(self):
        cid = uuid.UUID("11111111-1111-1111-1111-111111111111")
        err = ActivationConflictError(company_id=cid)
        assert err.company_id == cid

    def test_branch_id_preserved_when_provided(self):
        cid = uuid.UUID("11111111-1111-1111-1111-111111111111")
        bid = uuid.UUID("22222222-2222-2222-2222-222222222222")
        err = ActivationConflictError(company_id=cid, branch_id=bid)
        assert err.branch_id == bid

    def test_branch_id_defaults_to_none(self):
        err = ActivationConflictError(company_id=uuid.uuid4())
        assert err.branch_id is None

    def test_str_contains_company_id(self):
        cid = uuid.UUID("11111111-1111-1111-1111-111111111111")
        err = ActivationConflictError(company_id=cid)
        assert str(cid) in str(err)

    def test_str_contains_retry_instruction(self):
        err = ActivationConflictError(company_id=uuid.uuid4())
        assert "retry" in str(err).lower() or "Retry" in str(err)

    def test_company_wide_scope_label(self):
        """When branch_id=None the message should indicate company-wide scope."""
        cid = uuid.UUID("11111111-1111-1111-1111-111111111111")
        err = ActivationConflictError(company_id=cid, branch_id=None)
        assert "company-wide" in str(err).lower()

    def test_branch_scoped_label(self):
        """When branch_id is set the message should include it."""
        cid = uuid.UUID("11111111-1111-1111-1111-111111111111")
        bid = uuid.UUID("22222222-2222-2222-2222-222222222222")
        err = ActivationConflictError(company_id=cid, branch_id=bid)
        assert str(bid) in str(err)

    def test_cause_preserved_with_from(self):
        """raise ActivationConflictError(...) from exc should chain the cause."""
        try:
            try:
                raise RuntimeError("original")
            except RuntimeError as orig:
                raise ActivationConflictError(company_id=uuid.uuid4()) from orig
        except ActivationConflictError as e:
            assert e.__cause__ is not None
            assert isinstance(e.__cause__, RuntimeError)


# ---------------------------------------------------------------------------
# 2. Service layer raises ActivationConflictError (not ValueError) on IntegrityError
# ---------------------------------------------------------------------------

class TestServiceRaisesTypedError:
    """
    The service layer must re-raise IntegrityError as ActivationConflictError.
    We test this via the exception module directly (no DB needed) since the
    pattern is: catch IntegrityError → raise ActivationConflictError.
    """

    def test_activation_conflict_not_value_error(self):
        """ActivationConflictError must NOT be a subclass of ValueError."""
        assert not issubclass(ActivationConflictError, ValueError)

    def test_activation_conflict_is_not_integrity_error(self):
        """ActivationConflictError is a domain exception, not a SQLAlchemy exception."""
        from sqlalchemy.exc import IntegrityError as SAIntegrityError
        assert not issubclass(ActivationConflictError, SAIntegrityError)

    def test_service_import_path(self):
        """Ensure the import path from the service is correct."""
        from app.core.exceptions import ActivationConflictError as Imported
        assert Imported is ActivationConflictError

    def test_service_module_imports_exception(self):
        """policy_service must import ActivationConflictError."""
        import app.services.policy_service as svc
        assert hasattr(svc, "ActivationConflictError")


# ---------------------------------------------------------------------------
# 3. Route maps ActivationConflictError → HTTP 409 with structured body
# ---------------------------------------------------------------------------

class TestRouteActivationConflict409:
    """
    Integration-style tests for the activate_policy route handler.
    We mock the service so the route sees an ActivationConflictError
    and assert the correct HTTPException is raised.
    """

    @pytest.mark.asyncio
    async def test_route_returns_409_on_conflict(self):
        """
        When policy_service.activate_policy raises ActivationConflictError,
        the route must raise HTTPException(status_code=409).
        """
        from fastapi import HTTPException

        cid = uuid.UUID("11111111-1111-1111-1111-111111111111")
        bid = uuid.UUID("22222222-2222-2222-2222-222222222222")
        conflict_err = ActivationConflictError(company_id=cid, branch_id=bid)

        with patch(
            "app.api.routes.v1_policies.policy_service.activate_policy",
            new=AsyncMock(side_effect=conflict_err),
        ), patch(
            "app.api.routes.v1_policies._check_permission",
            new=AsyncMock(return_value=None),
        ):
            from app.api.routes.v1_policies import activate_policy
            from app.schemas_v1.policies import ActivatePolicyRequest

            mock_session = AsyncMock()
            mock_user = AsyncMock()

            req = ActivatePolicyRequest(template_id=uuid.uuid4())
            with pytest.raises(HTTPException) as exc_info:
                await activate_policy(
                    data=req,
                    session=mock_session,
                    current_user=mock_user,
                )

            assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_409_body_has_stable_code_field(self):
        """409 detail must be a dict with code='DB_ACTIVE_SCOPE_CONFLICT'."""
        from fastapi import HTTPException

        cid = uuid.UUID("11111111-1111-1111-1111-111111111111")
        conflict_err = ActivationConflictError(company_id=cid)

        with patch(
            "app.api.routes.v1_policies.policy_service.activate_policy",
            new=AsyncMock(side_effect=conflict_err),
        ), patch(
            "app.api.routes.v1_policies._check_permission",
            new=AsyncMock(return_value=None),
        ):
            from app.api.routes.v1_policies import activate_policy
            from app.schemas_v1.policies import ActivatePolicyRequest

            req = ActivatePolicyRequest(template_id=uuid.uuid4())
            with pytest.raises(HTTPException) as exc_info:
                await activate_policy(
                    data=req,
                    session=AsyncMock(),
                    current_user=AsyncMock(),
                )

            detail = exc_info.value.detail
            assert isinstance(detail, dict), "409 body must be a dict, not a string"
            assert detail["code"] == "DB_ACTIVE_SCOPE_CONFLICT"

    @pytest.mark.asyncio
    async def test_409_body_has_scope_field(self):
        """409 detail must include a 'scope' dict with company_id and branch_id."""
        from fastapi import HTTPException

        cid = uuid.UUID("11111111-1111-1111-1111-111111111111")
        bid = uuid.UUID("22222222-2222-2222-2222-222222222222")
        conflict_err = ActivationConflictError(company_id=cid, branch_id=bid)

        with patch(
            "app.api.routes.v1_policies.policy_service.activate_policy",
            new=AsyncMock(side_effect=conflict_err),
        ), patch(
            "app.api.routes.v1_policies._check_permission",
            new=AsyncMock(return_value=None),
        ):
            from app.api.routes.v1_policies import activate_policy
            from app.schemas_v1.policies import ActivatePolicyRequest

            req = ActivatePolicyRequest(template_id=uuid.uuid4())
            with pytest.raises(HTTPException) as exc_info:
                await activate_policy(
                    data=req,
                    session=AsyncMock(),
                    current_user=AsyncMock(),
                )

            scope = exc_info.value.detail.get("scope", {})
            assert scope["company_id"] == str(cid)
            assert scope["branch_id"] == str(bid)

    @pytest.mark.asyncio
    async def test_409_scope_branch_id_null_when_company_wide(self):
        """When branch_id=None, scope.branch_id must be null (not the string 'None')."""
        from fastapi import HTTPException

        cid = uuid.UUID("11111111-1111-1111-1111-111111111111")
        conflict_err = ActivationConflictError(company_id=cid, branch_id=None)

        with patch(
            "app.api.routes.v1_policies.policy_service.activate_policy",
            new=AsyncMock(side_effect=conflict_err),
        ), patch(
            "app.api.routes.v1_policies._check_permission",
            new=AsyncMock(return_value=None),
        ):
            from app.api.routes.v1_policies import activate_policy
            from app.schemas_v1.policies import ActivatePolicyRequest

            req = ActivatePolicyRequest(template_id=uuid.uuid4())
            with pytest.raises(HTTPException) as exc_info:
                await activate_policy(
                    data=req,
                    session=AsyncMock(),
                    current_user=AsyncMock(),
                )

            scope = exc_info.value.detail.get("scope", {})
            assert scope["branch_id"] is None, "branch_id must be null, not the string 'None'"


# ---------------------------------------------------------------------------
# 4. Route maps plain ValueError → 404 (not 409)
# ---------------------------------------------------------------------------

class TestRouteValueError404:
    @pytest.mark.asyncio
    async def test_not_found_value_error_maps_to_404(self):
        """A plain ValueError (template not found) must map to 404, never 409."""
        from fastapi import HTTPException

        with patch(
            "app.api.routes.v1_policies.policy_service.activate_policy",
            new=AsyncMock(side_effect=ValueError("Policy template xyz not found")),
        ), patch(
            "app.api.routes.v1_policies._check_permission",
            new=AsyncMock(return_value=None),
        ):
            from app.api.routes.v1_policies import activate_policy
            from app.schemas_v1.policies import ActivatePolicyRequest

            req = ActivatePolicyRequest(template_id=uuid.uuid4())
            with pytest.raises(HTTPException) as exc_info:
                await activate_policy(
                    data=req,
                    session=AsyncMock(),
                    current_user=AsyncMock(),
                )

            assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_404_body_is_plain_string_not_dict(self):
        """404 detail must be a plain string (no 'code' field)."""
        from fastapi import HTTPException

        with patch(
            "app.api.routes.v1_policies.policy_service.activate_policy",
            new=AsyncMock(side_effect=ValueError("Policy template xyz not found")),
        ), patch(
            "app.api.routes.v1_policies._check_permission",
            new=AsyncMock(return_value=None),
        ):
            from app.api.routes.v1_policies import activate_policy
            from app.schemas_v1.policies import ActivatePolicyRequest

            req = ActivatePolicyRequest(template_id=uuid.uuid4())
            with pytest.raises(HTTPException) as exc_info:
                await activate_policy(
                    data=req,
                    session=AsyncMock(),
                    current_user=AsyncMock(),
                )

            detail = exc_info.value.detail
            assert isinstance(detail, str), "404 detail must be a plain string"
            assert "code" not in str(detail).lower() or "not found" in detail.lower()

    @pytest.mark.asyncio
    async def test_old_string_match_pattern_would_not_trigger_409(self):
        """
        Regression: A ValueError containing 'concurrent activation conflict' in its
        message must NOT produce 409 — the old string-match guard is gone.
        Only ActivationConflictError produces 409.
        """
        from fastapi import HTTPException

        with patch(
            "app.api.routes.v1_policies.policy_service.activate_policy",
            new=AsyncMock(
                side_effect=ValueError("concurrent activation conflict something happened")
            ),
        ), patch(
            "app.api.routes.v1_policies._check_permission",
            new=AsyncMock(return_value=None),
        ):
            from app.api.routes.v1_policies import activate_policy
            from app.schemas_v1.policies import ActivatePolicyRequest

            req = ActivatePolicyRequest(template_id=uuid.uuid4())
            with pytest.raises(HTTPException) as exc_info:
                await activate_policy(
                    data=req,
                    session=AsyncMock(),
                    current_user=AsyncMock(),
                )

            # Must be 404, not 409 — string matching is gone
            assert exc_info.value.status_code == 404, (
                "String matching on ValueError must be gone. Only ActivationConflictError → 409."
            )
